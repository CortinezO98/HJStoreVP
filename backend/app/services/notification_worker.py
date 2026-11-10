"""Worker SMTP opt-in con reserva transaccional, reintentos y registro auditado.

Ejecución manual: python -m app.services.notification_worker --once
Proceso periódico: python -m app.services.notification_worker --loop

No es un proceso de FastAPI: enviar correo nunca bloquea el webhook.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from email.message import EmailMessage
import logging
import smtplib
import ssl
import time

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import CustomerNotification
from app.services.notifications import render_notification

log = logging.getLogger("hjstore.notifications")
MAX_ATTEMPTS = 5


def smtp_is_ready() -> bool:
    """Fail-closed: no se despacha sin activación + configuración completa."""
    return (
        settings.EMAIL_NOTIFICATIONS_ENABLED
        and bool(settings.SMTP_HOST)
        and bool(settings.SMTP_USER)
        and bool(settings.SMTP_PASSWORD)
        and bool(settings.EMAILS_FROM)
        and bool(settings.STORE_PUBLIC_URL)
        and settings.SMTP_PORT in (465, 587)
        and (settings.ENVIRONMENT != "production" or settings.EMAIL_LIVE_DELIVERY_ALLOWED)
    )


def send_email(record: CustomerNotification) -> None:
    if not smtp_is_ready():
        raise RuntimeError("SMTP no habilitado o incompleto")
    plain, html = render_notification(record, settings.STORE_PUBLIC_URL)
    msg = EmailMessage()
    msg["Subject"] = record.subject
    msg["From"] = settings.EMAILS_FROM
    msg["To"] = record.recipient
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    if settings.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=12, context=context,
        ) as client:
            client.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            client.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as client:
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
            client.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            client.send_message(msg)


def claim_next(db: Session) -> CustomerNotification | None:
    """Claim condicional: evita que dos workers envíen simultáneamente.

    Un proceso caído puede dejar una fila 'sending'; se recupera después del
    lease. El correo es al menos una vez: caída SMTP-confirmado/DB-pendiente
    puede provocar duplicado (no prometer exactamente una entrega).
    """
    now = datetime.utcnow()
    candidate = db.query(CustomerNotification.id).filter(
        CustomerNotification.attempts < MAX_ATTEMPTS,
        or_(
            (CustomerNotification.status == "pending") &
            (CustomerNotification.next_attempt_at <= now),
            (CustomerNotification.status == "sending") &
            (CustomerNotification.lease_until < now),
        ),
    ).order_by(
        CustomerNotification.next_attempt_at, CustomerNotification.id
    ).first()
    if not candidate:
        return None
    claimed = db.execute(
        update(CustomerNotification)
        .where(
            CustomerNotification.id == candidate.id,
            CustomerNotification.attempts < MAX_ATTEMPTS,
            or_(
                (CustomerNotification.status == "pending") &
                (CustomerNotification.next_attempt_at <= now),
                (CustomerNotification.status == "sending") &
                (CustomerNotification.lease_until < now),
            ),
        )
        .values(
            status="sending",
            attempts=CustomerNotification.attempts + 1,
            lease_until=now + timedelta(minutes=3),
        )
    )
    if claimed.rowcount != 1:
        db.rollback()
        return None
    db.commit()
    return db.get(CustomerNotification, candidate.id)


def process_one() -> bool:
    if not smtp_is_ready():
        return False
    db = SessionLocal()
    try:
        notification = claim_next(db)
        if not notification:
            return False
        try:
            send_email(notification)
        except (smtplib.SMTPException, OSError, TimeoutError, ValueError, RuntimeError):
            # No guardar mensajes de error del proveedor: podrían contener
            # dirección, credenciales o datos SMTP.
            error_label = "smtp_delivery_failed"
            next_attempt = datetime.utcnow() + timedelta(
                minutes=min(60, 2 ** notification.attempts)
            )
            notification.status = (
                "failed" if notification.attempts >= MAX_ATTEMPTS else "pending"
            )
            notification.last_error = error_label
            notification.next_attempt_at = next_attempt
            notification.lease_until = None
            db.commit()
            log.warning("Notification id=%s delivery failed", notification.id)
        else:
            notification.status = "sent"
            notification.sent_at = datetime.utcnow()
            notification.lease_until = None
            notification.last_error = None
            db.commit()
            log.info("Notification id=%s sent", notification.id)
        return True
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--loop", action="store_true")
    args = parser.parse_args()
    if not args.once and not args.loop:
        parser.error("Indica --once o --loop")
    logging.basicConfig(level=logging.INFO)
    if not smtp_is_ready():
        log.warning("Notificaciones deshabilitadas; no se enviará ningún correo")
        return
    if args.once:
        process_one()
    else:
        while True:
            if not process_one():
                time.sleep(15)


if __name__ == "__main__":
    main()
