"""Operación de pagos, reservas, pedidos y avisos: supervisión solo lectura.

Los reportes NO confirman pagos ni reintentan cobros. Nunca liberan reservas
automáticamente ante falta de respuesta de una pasarela.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import (
    Order, OrderChannel, OrderStatus, OrderStockReservation, Shipment,
    CustomerNotification,
)

router = APIRouter(prefix="/commerce-operations", tags=["Operación comercial"])


def _represent(order):
    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status.value,
        "payment_method": order.payment_method,
        "total_amount": float(order.total_amount),
        "created_at": order.created_at.isoformat(),
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
    }


@router.get("/overview")
def commerce_overview(
    pending_hours: int = Query(2, ge=1, le=168),
    shipment_hours: int = Query(24, ge=1, le=720),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    now = datetime.utcnow()
    web = db.query(Order).filter(Order.channel == OrderChannel.WEB)
    statuses = dict(
        db.query(Order.status, func.count(Order.id))
        .filter(Order.channel == OrderChannel.WEB)
        .group_by(Order.status).all()
    )
    by_status = {key.value: int(statuses.get(key, 0)) for key in OrderStatus}
    delayed_pending = web.filter(
        Order.status == OrderStatus.PENDING,
        Order.created_at < now - timedelta(hours=pending_hours),
    )
    without_shipment = (
        web.outerjoin(Shipment, Shipment.order_id == Order.id)
        .filter(
            Order.status.in_((OrderStatus.PAID, OrderStatus.PREPARING)),
            Order.paid_at.is_not(None),
            Order.paid_at < now - timedelta(hours=shipment_hours),
            Shipment.id.is_(None),
        )
    )

    # Una reserva HELD ya descontó qty_available. La antigüedad es un
    # indicador de conciliación pendiente, no autorización para liberarla.
    expired_held = db.query(OrderStockReservation).join(
        Order, Order.id == OrderStockReservation.order_id
    ).filter(
        OrderStockReservation.status == "held",
        OrderStockReservation.expires_at < now,
        Order.status == OrderStatus.PENDING,
    )
    reservation_rows = (
        expired_held.order_by(OrderStockReservation.expires_at, OrderStockReservation.id)
        .limit(limit).all()
    )
    held_order_ids = {record.order_id for record in reservation_rows}
    held_orders = {
        order.id: order for order in db.query(Order).filter(
            Order.id.in_(held_order_ids)
        ).all()
    } if held_order_ids else {}
    notices = dict(db.query(
        CustomerNotification.status, func.count(CustomerNotification.id)
    ).group_by(CustomerNotification.status).all())

    return {
        "as_of_utc": now.isoformat(),
        "thresholds": {"pending_hours": pending_hours, "shipment_hours": shipment_hours},
        "web_orders_by_status": by_status,
        "alerts": {
            "pending_payment": {
                "total": delayed_pending.count(),
                "orders": [_represent(order) for order in delayed_pending.order_by(
                    Order.created_at, Order.id
                ).limit(limit).all()],
            },
            "without_shipment": {
                "total": without_shipment.count(),
                "orders": [_represent(order) for order in without_shipment.order_by(
                    Order.paid_at, Order.id
                ).limit(limit).all()],
            },
            "expired_held_reservations": {
                "total": expired_held.count(),
                "reservations": [{
                    "id": row.id, "order_id": row.order_id,
                    "order_number": held_orders[row.order_id].order_number
                        if row.order_id in held_orders else None,
                    "product_id": row.product_id,
                    "location_id": row.location_id,
                    "qty": row.qty,
                    "expires_at": row.expires_at.isoformat(),
                } for row in reservation_rows],
            },
        },
        "notifications": {
            "pending": int(notices.get("pending", 0)),
            "sending": int(notices.get("sending", 0)),
            "sent": int(notices.get("sent", 0)),
            "failed": int(notices.get("failed", 0)),
        },
        "notes": [
            "Las alertas son diagnósticas, no confirmaciones de fallo ni fraude.",
            "Un pedido pendiente puede tener una transacción activa; consultar el proveedor antes de cancelar.",
            "Nunca liberar reservas vencidas automáticamente: el pago puede llegar tarde.",
            "Los estados de despacho se registran internamente, no se sincronizan automáticamente con transportadoras.",
        ],
    }
