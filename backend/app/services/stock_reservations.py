"""Conserva stock y estados de pedidos web de manera transaccional.

Una reserva HELD descuenta qty_available en la ubicación exacta.
La venta PAID marca COMMITTED (sin otro descuento).
La cancelación marca RELEASED y devuelve las unidades una única vez.

NO ejecutar expiración automática sin conciliación con la pasarela:
puede llegar una confirmación de pago tardía.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.models import (
    Inventory, Order, OrderChannel, OrderStatus, OrderStockReservation,
    StockMovement, StockMovementType,
)


def lock_web_order(db: Session, order_id: int) -> Order:
    """Bloquea una orden; serializa cambios de estado en MariaDB/InnoDB."""
    order = db.query(Order).filter(
        Order.id == order_id, Order.channel == OrderChannel.WEB
    ).with_for_update().first()
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido web no encontrado")
    return order


def _reservations(db: Session, order: Order) -> list[OrderStockReservation]:
    return (db.query(OrderStockReservation)
            .filter(OrderStockReservation.order_id == order.id)
            .order_by(OrderStockReservation.id)
            .with_for_update().all())


def commit_reservations(db: Session, order: Order) -> bool:
    """Un pago confirmado convierte HELD a COMMITTED sin tocar existencias."""
    records = _reservations(db, order)
    if not records:
        # No prometer integridad automática para pedidos anteriores al cambio.
        return False
    if any(r.status != "held" for r in records):
        return all(r.status == "committed" for r in records)
    for r in records:
        r.status = "committed"
        r.resolved_at = datetime.utcnow()
    return True


def cancel_web_order(
    db: Session, order: Order, reason: str, *, provider_confirmed_failure: bool = False
) -> bool:
    """Devuelve stock exactamente una vez y cancela una orden PENDING.

    Rechaza pedidos heredados sin rastro de la ubicación reservada:
    inferir la ubicación podría aumentar el stock del punto equivocado.
    El llamador es responsable de db.commit().
    """
    if order.status == OrderStatus.CANCELLED:
        return False
    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=409, detail="Solo se pueden cancelar pedidos pendientes"
        )
    if order.payment_method and not provider_confirmed_failure:
        raise HTTPException(
            status_code=409,
            detail="Existe un pago iniciado; confirmar primero el estado en la pasarela",
        )

    records = _reservations(db, order)
    if not records:
        raise HTTPException(
            status_code=409,
            detail="Pedido heredado sin trazabilidad de reserva; requiere conciliación manual",
        )
    if any(r.status != "held" for r in records):
        raise HTTPException(
            status_code=409, detail="La reserva ya fue resuelta; requiere revisión"
        )

    for r in records:
        if r.qty <= 0:
            raise HTTPException(status_code=409, detail="Cantidad reservada inválida")

        updated = db.execute(
            update(Inventory)
            .where(
                Inventory.product_id == r.product_id,
                Inventory.location_id == r.location_id,
            )
            .values(qty_available=Inventory.qty_available + r.qty)
        )
        if updated.rowcount != 1:
            raise HTTPException(
                status_code=409, detail="Inventario original no disponible; revisión manual"
            )
        inv = db.query(Inventory).filter(
            Inventory.product_id == r.product_id,
            Inventory.location_id == r.location_id,
        ).first()
        db.refresh(inv)
        db.add(StockMovement(
            product_id=r.product_id,
            location_id=r.location_id,
            movement_type=StockMovementType.ADJUSTMENT,
            qty=r.qty,
            qty_before=inv.qty_available - r.qty,
            qty_after=inv.qty_available,
            reference_id=order.id,
            notes=f"Liberación reserva web #{order.order_number}: {reason}",
        ))
        r.status = "released"
        r.resolved_at = datetime.utcnow()

    order.status = OrderStatus.CANCELLED
    return True


def mark_paid(db: Session, order: Order, method: str, reference: str | None) -> bool:
    """Transición PENDING->PAID. Rechaza pagos tardíos en pedidos cancelados."""
    if order.status == OrderStatus.PAID:
        return False
    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail="Estado incompatible con el pago; requiere conciliación manual",
        )
    # Pedidos anteriores a la tabla de reservas pueden pagarse: ya habían
    # descontado qty_available. No modificar inventario ni bloquear ventas
    # históricas por falta de trazabilidad antigua.
    records = _reservations(db, order)
    if records and not commit_reservations(db, order):
        raise HTTPException(
            status_code=409,
            detail="Las reservas no están disponibles; requiere conciliación manual",
        )
    order.status = OrderStatus.PAID
    order.payment_method = method
    order.payment_ref = reference
    order.paid_at = datetime.utcnow()
    return True
