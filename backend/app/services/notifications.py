"""Outbox transaccional para notificaciones de pedidos web HJStoreVP.

Se llama ANTES de db.commit() en la misma transacción de la operación,
sin comunicación de red. El worker independiente envía después del commit.
No incluye mensajes comerciales ni datos personales de dirección.
"""
from __future__ import annotations

from datetime import datetime
from html import escape
from urllib.parse import quote, urlsplit

from sqlalchemy.orm import Session

from app.models.models import (
    CustomerNotification, Order, OrderChannel, User,
)

SUBJECTS = {
    "order_created": "Recibimos tu pedido",
    "payment_confirmed": "¡Tu pago fue confirmado!",
    "order_cancelled": "Actualización de tu pedido cancelado",
    "order_preparing": "Estamos preparando tu pedido",
    "shipment_dispatched": "Tu pedido fue despachado",
    "shipment_in_transit": "Tu pedido está en tránsito",
    "shipment_out_for_delivery": "Tu pedido está en reparto",
    "shipment_delivered": "Tu pedido fue entregado",
    "shipment_exception": "Hay una novedad con tu envío",
    "shipment_guide_updated": "Actualizamos el número de guía",
    "post_sale_submitted": "Recibimos tu solicitud posventa",
    "post_sale_under_review": "Estamos revisando tu solicitud",
    "post_sale_approved": "Tu solicitud fue aprobada para continuar el trámite",
    "post_sale_rejected": "Actualizamos la decisión sobre tu solicitud",
    "post_sale_received": "Registramos la recepción de tu devolución",
    "post_sale_closed": "Tu caso posventa fue cerrado",
    "post_sale_refund_requested": "Registramos tu reembolso para gestión externa",
    "post_sale_refund_recorded": "Registramos una operación de reembolso externa",
}
DESCRIPTIONS = {
    "order_created": "Registramos tu pedido. El pago todavía está pendiente de confirmación.",
    "payment_confirmed": "Confirmamos tu pago y comenzaremos a preparar tu pedido.",
    "order_cancelled": "El pedido figura como cancelado. Puedes consultar su estado en tu cuenta.",
    "order_preparing": "Estamos preparando tus productos para el despacho.",
    "shipment_dispatched": "Registramos la guía de envío de tu pedido.",
    "shipment_in_transit": "Nuestro equipo registró una actualización: el pedido está en tránsito.",
    "shipment_out_for_delivery": "Nuestro equipo registró que tu pedido está en reparto.",
    "shipment_delivered": "HJStoreVP registró tu pedido como entregado.",
    "shipment_exception": "Registramos una novedad durante el transporte de tu pedido.",
    "shipment_guide_updated": "Actualizamos el número de guía asociado a tu pedido.",
    "post_sale_submitted": "Recibimos tu caso de devolución o incidencia. Nuestro equipo lo revisará.",
    "post_sale_under_review": "Tu caso posventa se encuentra en revisión por nuestro equipo.",
    "post_sale_approved": "Aprobamos continuar el trámite de tu caso. Esto aún no confirma reembolso ni recepción.",
    "post_sale_rejected": "Actualizamos la decisión administrativa de tu solicitud. Consulta el historial para conocer el motivo.",
    "post_sale_received": "Registramos la mercancía devuelta como físicamente recibida y revisada.",
    "post_sale_closed": "El seguimiento administrativo del caso posventa fue cerrado.",
    "post_sale_refund_requested": "El reembolso fue solicitado para gestión fuera de la plataforma. No se ha efectuado todavía.",
    "post_sale_refund_recorded": "Un administrador registró un comprobante externo. HJStoreVP no ejecutó esta transferencia.",

}


def enqueue_order_notification(
    db: Session,
    order: Order,
    kind: str,
    event_key: str,
    *,
    carrier: str | None = None,
    tracking_number: str | None = None,
) -> bool:
    """Inserta aviso sin enviar email. Es idempotente para el mismo evento.

    El event_key se deriva de IDs internos únicos (pedido, guía, evento),
    nunca de textos arbitrarios del usuario.
    """
    if order.channel != OrderChannel.WEB:
        return False
    if kind not in SUBJECTS or len(event_key) > 180:
        raise ValueError("Tipo o clave de notificación inválida")
    customer = db.get(User, order.customer_id) if order.customer_id else None
    if not customer or not customer.email:
        return False
    if db.query(CustomerNotification.id).filter(
        CustomerNotification.event_key == event_key
    ).first():
        return False

    context = {"order_number": order.order_number}
    if carrier:
        context["carrier"] = carrier[:120]
    if tracking_number:
        context["tracking_number"] = tracking_number[:150]
    db.add(CustomerNotification(
        order_id=order.id,
        event_key=event_key,
        kind=kind,
        recipient=customer.email.strip().lower(),
        subject=SUBJECTS[kind] + " · HJStoreVP",
        context=context,
        status="pending",
        next_attempt_at=datetime.utcnow(),
    ))
    return True


def _order_link(base_url: str) -> str:
    parsed = urlsplit(base_url)
    # El enlace solo puede ir al dominio configurado por el operador.
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")
    ):
        raise ValueError("STORE_PUBLIC_URL debe ser HTTPS")
    if not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("STORE_PUBLIC_URL inválida")
    return base_url.rstrip("/") + "/mi-cuenta"


def render_notification(notification: CustomerNotification, base_url: str) -> tuple[str, str]:
    """Devuelve texto plano y HTML escapado; sin contenido HTML de usuarios."""
    context = notification.context or {}
    kind = notification.kind
    if kind not in DESCRIPTIONS:
        raise ValueError("Tipo de notificación desconocido")
    order_number = str(context.get("order_number", ""))[:50]
    if not order_number:
        raise ValueError("Referencia de pedido faltante")
    url = _order_link(base_url)
    info = [
        f"Pedido: {order_number}",
        DESCRIPTIONS[kind],
    ]
    if context.get("carrier"):
        info.append(f"Transportadora: {str(context['carrier'])[:120]}")
    if context.get("tracking_number"):
        info.append(f"Guía: {str(context['tracking_number'])[:150]}")
    info.append("Los estados de transporte son registrados por HJStoreVP y no equivalen a confirmaciones automáticas de la transportadora.")
    info.append(f"Consulta tu pedido: {url}")
    info.append("HJStoreVP · Mensaje transaccional, no respondas a este correo.")
    plain = "\n\n".join(info)
    html_body = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8"></head>'
        '<body style="margin:0;background:#f5f6f7;font:15px Arial,sans-serif;color:#1b1b1b">'
        '<div style="max-width:560px;margin:32px auto;padding:32px;background:white">'
        '<div style="font-weight:900;font-size:22px;letter-spacing:1px">HJSTOREVP</div>'
        f'<h1 style="font-size:26px;margin-top:28px">{escape(notification.subject)}</h1>'
        f'<p style="color:#666">Pedido {escape(order_number)}</p>'
        f'<p style="line-height:1.7">{escape(DESCRIPTIONS[kind])}</p>'
        + (f'<p><b>Transportadora:</b> {escape(str(context["carrier"]))}</p>' if context.get("carrier") else "")
        + (f'<p><b>Guía:</b> {escape(str(context["tracking_number"]))}</p>' if context.get("tracking_number") else "")
        + f'<p><a href="{escape(url, quote=True)}" style="display:inline-block;background:#111;color:#fff;padding:14px 20px;text-decoration:none">VER MI PEDIDO</a></p>'
        '<p style="color:#777;font-size:12px;line-height:1.6">El seguimiento es registrado por HJStoreVP,'
        ' no está sincronizado automáticamente con la transportadora.</p>'
        '</div></body></html>'
    )
    return plain, html_body
