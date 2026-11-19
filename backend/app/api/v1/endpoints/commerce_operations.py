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


@router.get("/payment-integrity")
def payment_integrity(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Hallazgos no destructivos de pagos WEB y referencias duplicadas.

    No consulta ni confirma transacciones externas: comparar con el proveedor
    antes de cualquier cancelación, devolución o modificación de inventario.
    """
    paid_statuses = (
        OrderStatus.PAID, OrderStatus.PREPARING,
        OrderStatus.SHIPPED, OrderStatus.DELIVERED,
    )
    duplicate_refs = (
        db.query(
            Order.payment_method.label("method"),
            Order.payment_ref.label("reference"),
        )
        .filter(
            Order.channel == OrderChannel.WEB,
            Order.payment_method.is_not(None),
            Order.payment_ref.is_not(None),
            Order.payment_ref != "",
        )
        .group_by(Order.payment_method, Order.payment_ref)
        .having(func.count(Order.id) > 1)
        .subquery()
    )
    conditions = or_(
        and_(Order.status.in_(paid_statuses), Order.paid_at.is_(None)),
        and_(Order.status.in_(paid_statuses), Order.payment_method.is_(None)),
        and_(Order.status.in_(paid_statuses), Order.payment_ref.is_(None)),
        and_(Order.status == OrderStatus.PENDING, Order.paid_at.is_not(None)),
        and_(Order.status == OrderStatus.CANCELLED, Order.paid_at.is_not(None)),
        and_(Order.status == OrderStatus.PENDING, Order.payment_ref.is_not(None),
             Order.payment_method.is_(None)),
        and_(Order.payment_method.is_not(None), Order.payment_ref.is_not(None),
             Order.payment_ref != "", duplicate_refs.c.reference.is_not(None)),
    )
    query = (
        db.query(Order, duplicate_refs.c.reference.label("duplicated_reference"))
        .outerjoin(
            duplicate_refs,
            and_(
                Order.payment_method == duplicate_refs.c.method,
                Order.payment_ref == duplicate_refs.c.reference,
            ),
        )
        .filter(Order.channel == OrderChannel.WEB, conditions)
    )
    count = query.order_by(None).count()
    rows = (
        query.order_by(Order.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    findings = []
    for order, duplicated_reference in rows:
        reasons = []
        if order.status in paid_statuses:
            if order.paid_at is None:
                reasons.append("Pedido pagado sin fecha de confirmación")
            if not order.payment_method:
                reasons.append("Pedido pagado sin proveedor registrado")
            if not order.payment_ref:
                reasons.append("Pedido pagado sin referencia externa")
        if order.status == OrderStatus.PENDING and order.paid_at:
            reasons.append("Pedido pendiente con fecha de pago registrada")
        if order.status == OrderStatus.CANCELLED and order.paid_at:
            reasons.append("Pedido cancelado con fecha de pago; revisar posible pago tardío")
        if order.status == OrderStatus.PENDING and order.payment_ref and not order.payment_method:
            reasons.append("Referencia externa sin proveedor asociado")
        if duplicated_reference is not None:
            reasons.append("Referencia externa repetida en pedidos del mismo proveedor")
        findings.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "status": order.status.value,
            "payment_method": order.payment_method,
            "payment_ref": order.payment_ref,
            "amount": float(order.total_amount),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "paid_at": order.paid_at.isoformat() if order.paid_at else None,
            "issues": reasons,
        })
    return {
        "total": count,
        "page": page,
        "per_page": per_page,
        "items": findings,
        "note": (
            "Auditoría interna de solo lectura, no confirmación del proveedor. "
            "Pedidos antiguos o integraciones históricas pueden carecer de referencia. "
            "Nunca liberar stock ni cambiar un pago con base únicamente en estos hallazgos."
        ),
    }
