"""Recovery email worker. Never starts automatically; requires explicit consent
and SMTP flags. No external SMTP request from FastAPI's cart endpoint.
"""
from datetime import datetime, timedelta
from email.message import EmailMessage
import argparse
import logging
import smtplib
import ssl
import time

from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import (
    CartRecoveryNotice, CustomerEngagementPreference,
    SavedCustomerCart, User, UserRole,
)
from app.services.notification_worker import smtp_is_ready
from app.services.notifications import _order_link

log = logging.getLogger("hjstore.recovery")


def enabled() -> bool:
    return (
        settings.CART_RECOVERY_DELIVERY_ENABLED
        and smtp_is_ready()
        and (settings.ENVIRONMENT != "production" or settings.CART_RECOVERY_LIVE_ALLOWED)
    )


def send_reminder(email: str) -> None:
    """Sin detalle de compras, direcciones ni enlaces con token en el correo."""
    url = _order_link(settings.STORE_PUBLIC_URL).replace("/mi-cuenta", "/carrito")
    msg = EmailMessage()
    msg["Subject"] = "¿Quieres retomar tu carrito? · HJStoreVP"
    msg["To"] = email
    msg["From"] = settings.EMAILS_FROM
    msg.set_content(
        "Hola,\n\nTienes productos guardados en tu carrito de HJStoreVP. "
        "Si deseas continuar, abre tu carrito después de iniciar sesión:\n"
        f"{url}\n\nLa disponibilidad y los precios se verifican nuevamente "
        "antes de comprar. Puedes desactivar estos recordatorios en Mi cuenta.\n"
        "HJStoreVP"
    )
    msg.add_alternative(
        '<html lang="es"><body style="font:16px Arial,sans-serif;color:#222">'
        '<h1>HJSTOREVP</h1><p>¿Quieres retomar tu carrito?</p>'
        '<p>Tienes productos guardados. Los precios y existencias se verifican al comprar.</p>'
        f'<p><a href="{url}">Volver al carrito</a></p>'
        '<p>Desactiva estos recordatorios en Mi cuenta.</p></body></html>',
        subtype="html",
    )
    tls = ssl.create_default_context()
    if settings.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, timeout=12, context=tls) as smtp:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, 587, timeout=12) as smtp:
            smtp.ehlo()
            smtp.starttls(context=tls)
            smtp.ehlo()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)


def process_one() -> bool:
    if not enabled():
        return False
    db: Session = SessionLocal()
    try:
        # Mantener bloqueo InnoDB durante la comprobación y la entrega SMTP;
        # dos workers no deben enviar la misma revisión al mismo tiempo.
        notice = db.query(CartRecoveryNotice).filter(
            CartRecoveryNotice.status == "scheduled",
            CartRecoveryNotice.due_at <= datetime.utcnow(),
            CartRecoveryNotice.attempts < 3,
        ).order_by(CartRecoveryNotice.id).with_for_update(skip_locked=True).first()
        if not notice:
            return False
        user = db.get(User, notice.user_id)
        preference = db.get(CustomerEngagementPreference, notice.user_id)
        cart = db.get(SavedCustomerCart, notice.user_id)
        now = datetime.utcnow()
        valid = (
            user is not None and user.active and user.role == UserRole.CUSTOMER
            and preference is not None and preference.recovery_email_opt_in
            and cart is not None and bool(cart.items)
            and cart.revision == notice.cart_revision
            and cart.updated_at <= now - timedelta(hours=24)
            and cart.recovered_at is None
        )
        if not valid:
            notice.status = "cancelled"
            db.commit()
            return True

        # Un recordatorio como máximo cada siete días por cliente.
        recent = db.query(CartRecoveryNotice.id).filter(
            CartRecoveryNotice.user_id == notice.user_id,
            CartRecoveryNotice.status == "sent",
            CartRecoveryNotice.sent_at >= now - timedelta(days=7),
        ).first()
        if recent:
            notice.status = "cancelled"
            db.commit()
            return True

        try:
            send_reminder(user.email)
        except Exception:
            notice.attempts += 1
            if notice.attempts >= 3:
                notice.status = "failed"
            else:
                notice.due_at = now + timedelta(hours=2 ** notice.attempts)
            db.commit()
            log.warning("Cart recovery delivery failed: notice_id=%s", notice.id)
        else:
            notice.status = "sent"
            notice.sent_at = now
            notice.attempts += 1
            db.commit()
            log.info("Cart recovery accepted by SMTP: notice_id=%s", notice.id)
        return True
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--loop", action="store_true")
    args = parser.parse_args()
    if not (args.once or args.loop):
        parser.error("Usa --once o --loop")
    logging.basicConfig(level=logging.INFO)
    if not enabled():
        log.warning("Recordatorios de carritos DESHABILITADOS")
        return
    if args.once:
        process_one()
    else:
        while True:
            if not process_one():
                time.sleep(30)


if __name__ == "__main__":
    main()
