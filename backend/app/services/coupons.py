"""Coupon pricing: one coupon per web order, never trust browser amounts."""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import re
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.models import (
    PromotionCoupon, CouponRedemption, Order, OrderStatus
)

CENTS = Decimal("0.01")
VALID_CODE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")


def normalize_code(value: str) -> str:
    code = value.strip().upper()
    if not VALID_CODE.fullmatch(code):
        raise HTTPException(status_code=422, detail="Código promocional inválido")
    return code


def evaluate_coupon(db: Session, code: str, subtotal: Decimal, customer_id: int, *, lock: bool = False):
    normalized = normalize_code(code)
    q = db.query(PromotionCoupon).filter(PromotionCoupon.code == normalized)
    if lock:
        # InnoDB: serializa la asignación de cupos, incluido el último.
        q = q.with_for_update()
    coupon = q.first()
    now = datetime.utcnow()
    if not coupon or not coupon.active or (
        coupon.starts_at and coupon.starts_at > now
    ) or (coupon.expires_at and coupon.expires_at <= now):
        raise HTTPException(status_code=409, detail="Cupón no disponible o vencido")
    if subtotal < coupon.minimum_subtotal:
        raise HTTPException(status_code=409, detail="La compra no alcanza el mínimo del cupón")

    redemptions = db.query(CouponRedemption).join(Order, Order.id == CouponRedemption.order_id).filter(
        CouponRedemption.coupon_id == coupon.id,
        Order.status != OrderStatus.CANCELLED,
    )
    if coupon.max_uses is not None and redemptions.count() >= coupon.max_uses:
        raise HTTPException(status_code=409, detail="Este cupón alcanzó su límite de usos")
    if redemptions.filter(CouponRedemption.customer_id == customer_id).count() >= coupon.max_uses_per_customer:
        raise HTTPException(status_code=409, detail="Ya alcanzaste el máximo de usos de este cupón")

    if coupon.discount_type == "percentage":
        discount = subtotal * coupon.discount_value / Decimal("100")
        if coupon.maximum_discount is not None:
            discount = min(discount, coupon.maximum_discount)
    elif coupon.discount_type == "fixed":
        discount = coupon.discount_value
    else:
        raise HTTPException(status_code=409, detail="Configuración de cupón inválida")
    discount = min(subtotal, discount.quantize(CENTS, rounding=ROUND_HALF_UP))
    if discount <= 0:
        raise HTTPException(status_code=409, detail="Este cupón no aplica descuento")
    return coupon, discount
