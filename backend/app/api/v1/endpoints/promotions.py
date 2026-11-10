"""Administración de cupones y cotización no vinculante al checkout."""
from datetime import datetime
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator, field_validator
from sqlalchemy.orm import Session
from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import PromotionCoupon, CouponRedemption, Order, OrderStatus, User
from app.services.coupons import normalize_code, evaluate_coupon

router = APIRouter(prefix="/promotions", tags=["Promociones"])


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=32)
    description: str | None = Field(default=None, max_length=240)
    discount_type: Literal["percentage", "fixed"]
    discount_value: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    maximum_discount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    minimum_subtotal: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    max_uses: int | None = Field(default=None, gt=0)
    max_uses_per_customer: int = Field(default=1, gt=0, le=100)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    active: bool = True

    @field_validator("code")
    @classmethod
    def validate_code(cls, code):
        return normalize_code(code)

    @model_validator(mode="after")
    def validate_limits(self):
        if self.discount_type == "percentage" and self.discount_value > 100:
            raise ValueError("El porcentaje no puede superar 100")
        if self.starts_at and self.expires_at and self.starts_at >= self.expires_at:
            raise ValueError("La fecha inicial debe ser anterior a la final")
        if self.discount_type == "fixed" and self.maximum_discount is not None:
            raise ValueError("El máximo descuento solo aplica a porcentajes")
        return self


class CouponOut(CouponIn):
    id: int
    committed_or_reserved_uses: int = 0
    model_config = {"from_attributes": True}


class CouponQuoteIn(BaseModel):
    code: str
    items: list["QuoteItem"] = Field(min_length=1)


class QuoteItem(BaseModel):
    product_id: int = Field(gt=0)
    qty: int = Field(gt=0, le=1000)


CouponQuoteIn.model_rebuild()


def _uses(db: Session, coupon_id: int) -> int:
    return db.query(CouponRedemption).join(Order).filter(
        CouponRedemption.coupon_id == coupon_id,
        Order.status != OrderStatus.CANCELLED,
    ).count()


def _out(db: Session, coupon: PromotionCoupon) -> dict:
    data = {
        field: getattr(coupon, field)
        for field in CouponIn.model_fields
    }
    return {**data, "id": coupon.id, "committed_or_reserved_uses": _uses(db, coupon.id)}


@router.get("/admin", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [_out(db, c) for c in db.query(PromotionCoupon).order_by(
        PromotionCoupon.id.desc()
    ).limit(200).all()]


@router.post("/admin", response_model=CouponOut, status_code=201)
def create_coupon(data: CouponIn, db: Session = Depends(get_db),
                  _: User = Depends(require_admin)):
    if db.query(PromotionCoupon.id).filter_by(code=data.code).first():
        raise HTTPException(status_code=409, detail="Ya existe un cupón con ese código")
    coupon = PromotionCoupon(**data.model_dump())
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return _out(db, coupon)


@router.put("/admin/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, data: CouponIn,
                  db: Session = Depends(get_db), _: User = Depends(require_admin)):
    coupon = db.query(PromotionCoupon).filter_by(id=coupon_id).with_for_update().first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupón no encontrado")
    if data.code != coupon.code and db.query(PromotionCoupon.id).filter(
        PromotionCoupon.code == data.code
    ).first():
        raise HTTPException(status_code=409, detail="El código pertenece a otra promoción")
    for key, value in data.model_dump().items():
        setattr(coupon, key, value)
    db.commit()
    db.refresh(coupon)
    return _out(db, coupon)


@router.post("/quote")
def quote_coupon(data: CouponQuoteIn, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    from app.models.models import Product
    if len({x.product_id for x in data.items}) != len(data.items):
        raise HTTPException(status_code=422, detail="Productos repetidos")
    products = {
        p.id: p for p in db.query(Product).filter(
            Product.id.in_([x.product_id for x in data.items]), Product.active.is_(True)
        ).all()
    }
    subtotal = Decimal("0")
    for item in data.items:
        p = products.get(item.product_id)
        if not p or p.sale_price is None or p.sale_price < 0:
            raise HTTPException(status_code=409, detail="Carrito desactualizado")
        subtotal += p.sale_price * item.qty
    coupon, discount = evaluate_coupon(db, data.code, subtotal, user.id)
    return {
        "code": coupon.code,
        "subtotal": float(subtotal),
        "discount_amount": float(discount),
        "total_products_after_discount": float(subtotal - discount),
        "message": "Cotización informativa: el cupón se valida nuevamente al crear el pedido",
    }
