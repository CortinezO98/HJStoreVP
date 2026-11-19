"""Operación de pagos, reservas, pedidos y avisos: supervisión solo lectura.

Los reportes NO confirman pagos ni reintentan cobros. Nunca liberan reservas
automáticamente ante falta de respuesta de una pasarela.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
import httpx
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import (
    Order, OrderChannel, OrderStatus, OrderStockReservation, Shipment,
    CustomerNotification,
)
from app.services.wompi import get_transaction as get_wompi_transaction, wompi_enabled

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
        and_(Order.payment_method == "addi", Order.payment_ref.like("INITIATING-%")),
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
        if order.payment_method == "addi" and (order.payment_ref or "").startswith("INITIATING-"):
            reasons.append(
                "Intento Addi reservado sin referencia definitiva: conciliar "
                "con el proveedor antes de iniciar otra solicitud"
            )
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


@router.get("/wompi-verify/{order_id}")
async def verify_wompi_order_read_only(
    order_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Consulta Wompi sin cambiar el estado ni la reserva del pedido.

    Solo aplica si la referencia de transacción ya es conocida. No se
    confía en parámetros del navegador para determinar una transacción.
    """
    order = db.query(Order).filter(
        Order.id == order_id, Order.channel == OrderChannel.WEB,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido web no encontrado")
    if order.payment_method != "wompi" or not order.payment_ref:
        raise HTTPException(
            status_code=409,
            detail="Este pedido no tiene una transacción Wompi vinculada para verificar",
        )
    if not wompi_enabled():
        raise HTTPException(status_code=503, detail="Wompi no está configurado")

    try:
        tx = await get_wompi_transaction(str(order.payment_ref))
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(status_code=503, detail="No fue posible consultar el proveedor")
    if not isinstance(tx, dict):
        raise HTTPException(status_code=502, detail="Respuesta del proveedor no válida")

    reference_matches = str(tx.get("reference") or "") == order.order_number
    amount = tx.get("amount_in_cents")
    amount_matches = type(amount) is int and amount == int(order.total_amount * 100)
    currency_matches = tx.get("currency") == "COP"
    transaction_matches = str(tx.get("id") or "") == str(order.payment_ref)
    checks = {
        "reference_matches": reference_matches,
        "amount_matches": amount_matches,
        "currency_matches": currency_matches,
        "transaction_matches": transaction_matches,
    }
    provider_status = str(tx.get("status") or "").upper()
    locally_paid = order.status in (
        OrderStatus.PAID, OrderStatus.PREPARING,
        OrderStatus.SHIPPED, OrderStatus.DELIVERED,
    )
    status_conflict = (
        (provider_status == "APPROVED" and not locally_paid) or
        (provider_status in ("DECLINED", "ERROR", "VOIDED") and
         order.status != OrderStatus.CANCELLED)
    )
    if not all(checks.values()):
        finding = "identity_mismatch"
    elif status_conflict:
        finding = "status_conflict"
    elif provider_status in ("APPROVED", "DECLINED", "ERROR", "VOIDED"):
        finding = "consistent"
    else:
        finding = "non_final_or_unknown"

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "local_status": order.status.value,
        "provider": "wompi",
        "provider_status": provider_status or "UNKNOWN",
        "identity_checks": checks,
        "finding": finding,
        "verified_at_utc": datetime.utcnow().isoformat(),
        "read_only": True,
        "note": (
            "Consulta informativa del proveedor. No confirma ni revierte pagos "
            "automáticamente, no crea cobros y no modifica inventario. "
            "Ante discrepancias, investigar con soporte de la pasarela."
        ),
    }


@router.get("/payment-recovery-queue")
def payment_recovery_queue(
    pending_minutes: int = Query(30, ge=5, le=10080),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    provider: str | None = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Cola diagnóstica: nunca confirma, revierte ni reintenta transacciones.

    Solo pedidos WEB cuyo proveedor fue iniciado; los pendientes con referencia
    desconocida requieren inspección manual antes de tomar decisiones.
    """
    supported = ("wompi", "addi", "sistecreditos")
    if provider not in (None, *supported):
        raise HTTPException(status_code=422, detail="Proveedor no válido")
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=pending_minutes)
    pending = Order.status == OrderStatus.PENDING
    marker = and_(
        Order.payment_method == "addi",
        Order.payment_ref.like("INITIATING-%"),
    )
    stale_pending = and_(
        pending,
        Order.payment_method.in_(supported),
        Order.updated_at <= cutoff,
    )
    cancelled_paid = and_(
        Order.status == OrderStatus.CANCELLED,
        Order.paid_at.is_not(None),
    )
    query = db.query(Order).filter(
        Order.channel == OrderChannel.WEB,
        or_(marker, stale_pending, cancelled_paid),
    )
    if provider:
        query = query.filter(Order.payment_method == provider)

    total = query.order_by(None).count()
    rows = (
        query.order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    items = []
    for order in rows:
        is_marker = (
            order.payment_method == "addi"
            and (order.payment_ref or "").startswith("INITIATING-")
        )
        is_late = order.status == OrderStatus.CANCELLED and order.paid_at is not None
        age_minutes = max(0, int((now - (order.updated_at or order.created_at)).total_seconds() / 60))
        if is_late:
            kind = "cancelled_with_payment"
            priority = "critical"
            next_action = (
                "Revisar comprobante y liquidación con el proveedor; escalar a "
                "posventa si corresponde. No rehabilitar inventario automáticamente."
            )
        elif is_marker:
            kind = "unresolved_addi_initiation"
            priority = "high"
            next_action = (
                "Buscar la solicitud original por número de pedido en el portal Addi. "
                "El marcador no es el ID de una aplicación; no crear una segunda."
            )
        else:
            kind = "stale_pending"
            priority = "medium"
            next_action = (
                "Consultar la transacción por número de pedido y evidencia en "
                "el portal del proveedor. No asumir que el pago fue rechazado."
            )
        items.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "provider": order.payment_method,
            "order_status": order.status.value,
            "kind": kind,
            "priority": priority,
            "age_minutes_since_update": age_minutes,
            "external_reference_available": bool(order.payment_ref) and not is_marker,
            "amount": float(order.total_amount),
            "created_at_utc": order.created_at.isoformat() if order.created_at else None,
            "next_action": next_action,
        })
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pending_minutes": pending_minutes,
        "items": items,
        "read_only": True,
        "note": (
            "El tiempo de espera es orientativo y no un plazo de expiración. "
            "La ausencia de webhook no demuestra un cobro fallido. Esta cola "
            "no hace solicitudes de pago, cambios de estado ni liberación de reservas."
        ),
    }
