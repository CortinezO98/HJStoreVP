"""Idempotent loyalty accrual and cart recovery preparation.

No customer messages are sent by this module. Commercial communication
requires express opt-in and a separate disabled-by-default worker.
"""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_FLOOR
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.models import (
    CustomerEngagementPreference, SavedCustomerCart, CartRecoveryNotice,
    LoyaltyLedger, Order, User, UserRole,
)


def loyalty_balance(db: Session, user_id: int) -> int:
    return int(db.query(func.coalesce(func.sum(LoyaltyLedger.points_delta), 0)).filter(
        LoyaltyLedger.user_id == user_id
    ).scalar() or 0)


def award_paid_order(db: Session, order: Order) -> bool:
    """1 punto por $1.000 COP de productos pagados, no envío."""
    if not order.customer_id or not order.paid_at:
        return False
    customer = db.get(User, order.customer_id)
    if not customer or customer.role != UserRole.CUSTOMER:
        return False
    key = f"loyalty:order:{order.id}:paid"
    if db.query(LoyaltyLedger.id).filter_by(event_key=key).first():
        return False
    qualifying = max(Decimal("0"), Decimal(order.subtotal or 0) - Decimal(order.discount_amount or 0))
    points = int((qualifying / Decimal("1000")).to_integral_value(rounding=ROUND_FLOOR))
    if points:
        db.add(LoyaltyLedger(
            user_id=order.customer_id, order_id=order.id,
            event_key=key, event_type="earned", points_delta=points,
        ))
    return bool(points)


def reverse_refunded_items(db: Session, case) -> bool:
    """Revertir puntos correspondientes al reembolso externo documentado.

    El costo de envío no gana ni pierde puntos. Limita el ajuste a lo
    realmente ganado en la orden para no crear saldo negativo.
    """
    if case.refund_status != "externally_recorded" or not case.refund_amount:
        return False
    key = f"loyalty:case:{case.id}:refund"
    if db.query(LoyaltyLedger.id).filter_by(event_key=key).first():
        return False
    earned = db.query(func.coalesce(func.sum(LoyaltyLedger.points_delta), 0)).filter(
        LoyaltyLedger.order_id == case.order_id,
        LoyaltyLedger.event_type == "earned",
    ).scalar() or 0
    reversed_points = db.query(func.coalesce(func.sum(LoyaltyLedger.points_delta), 0)).filter(
        LoyaltyLedger.order_id == case.order_id,
        LoyaltyLedger.event_type == "refund_adjustment",
    ).scalar() or 0
    available = max(0, int(earned) + int(reversed_points))
    if available == 0:
        return False
    refund_points = int((Decimal(case.refund_amount) / Decimal("1000")).to_integral_value(rounding=ROUND_FLOOR))
    delta = -min(available, refund_points)
    if delta:
        db.add(LoyaltyLedger(
            user_id=case.customer_id, order_id=case.order_id,
            event_key=key, event_type="refund_adjustment", points_delta=delta,
        ))
    return bool(delta)


def queue_cart_reminder(db: Session, cart: SavedCustomerCart, user: User) -> bool:
    preference = db.get(CustomerEngagementPreference, user.id)
    if not (user.active and preference and preference.recovery_email_opt_in and cart.items):
        return False
    exists = db.query(CartRecoveryNotice.id).filter_by(
        user_id=user.id, cart_revision=cart.revision
    ).first()
    if exists:
        return False
    recent = db.query(CartRecoveryNotice.id).filter(
        CartRecoveryNotice.user_id == user.id,
        CartRecoveryNotice.sent_at >= datetime.utcnow() - timedelta(days=7),
    ).first()
    if recent:
        return False
    db.add(CartRecoveryNotice(
        user_id=user.id, cart_revision=cart.revision,
        status="scheduled", due_at=datetime.utcnow() + timedelta(hours=24),
    ))
    return True


def clear_saved_cart_after_purchase(db: Session, order: Order) -> None:
    """Evita recordatorios sobre productos ya comprados.

    Solo limpia la lista guardada si su contenido coincide exactamente con
    las líneas de la compra; no borra un carrito nuevo del cliente.
    """
    if not order.customer_id:
        return
    cart = db.query(SavedCustomerCart).filter(
        SavedCustomerCart.user_id == order.customer_id
    ).with_for_update().first()
    if not cart or not cart.items:
        return
    actual = sorted((int(x["product_id"]), int(x["qty"])) for x in cart.items)
    purchased = sorted((i.product_id, i.qty) for i in order.items)
    if actual != purchased:
        return
    cart.items = []
    cart.revision += 1
    cart.updated_at = datetime.utcnow()
    cart.recovered_at = datetime.utcnow()
    db.query(CartRecoveryNotice).filter(
        CartRecoveryNotice.user_id == order.customer_id,
        CartRecoveryNotice.status == "scheduled",
    ).update({"status": "cancelled"}, synchronize_session=False)
