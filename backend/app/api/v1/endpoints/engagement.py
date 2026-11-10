"""Opt-in, saved cart and loyalty balance with customer ownership controls."""
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import (
    CustomerEngagementPreference, SavedCustomerCart, CartRecoveryNotice,
    LoyaltyLedger, Order, OrderChannel, OrderStatus, Product, User, UserRole,
)
from app.services.engagement import loyalty_balance, queue_cart_reminder

router = APIRouter(prefix="/engagement", tags=["Fidelización y carritos"])


class PreferencesIn(BaseModel):
    recovery_email_opt_in: bool
    marketing_email_opt_in: bool


class CartItemIn(BaseModel):
    product_id: int = Field(gt=0)
    qty: int = Field(ge=1, le=99)


class CartIn(BaseModel):
    items: list[CartItemIn] = Field(max_length=50)

    @model_validator(mode="after")
    def no_duplicate_products(self):
        if len({p.product_id for p in self.items}) != len(self.items):
            raise ValueError("No repitas productos del carrito")
        return self


def _customer(user):
    if user.role != UserRole.CUSTOMER:
        raise HTTPException(status_code=403, detail="Solo clientes de la tienda")


@router.get("/preferences")
def preferences(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _customer(user)
    value = db.get(CustomerEngagementPreference, user.id)
    return {
        "recovery_email_opt_in": bool(value and value.recovery_email_opt_in),
        "marketing_email_opt_in": bool(value and value.marketing_email_opt_in),
    }


@router.put("/preferences")
def save_preferences(data: PreferencesIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    _customer(user)
    record = db.query(CustomerEngagementPreference).filter_by(
        user_id=user.id
    ).with_for_update().first()
    if not record:
        record = CustomerEngagementPreference(user_id=user.id)
        db.add(record)
    record.recovery_email_opt_in = data.recovery_email_opt_in
    record.marketing_email_opt_in = data.marketing_email_opt_in
    if not data.recovery_email_opt_in:
        db.query(CartRecoveryNotice).filter(
            CartRecoveryNotice.user_id == user.id,
            CartRecoveryNotice.status == "scheduled",
        ).update({"status": "cancelled"}, synchronize_session=False)
    db.commit()
    return data.model_dump()


@router.get("/cart")
def saved_cart(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _customer(user)
    cart = db.get(SavedCustomerCart, user.id)
    if not cart:
        return {"items": [], "updated_at": None}
    products = {
        p.id: p for p in db.query(Product).filter(
            Product.id.in_([item["product_id"] for item in (cart.items or [])]),
            Product.active.is_(True),
        ).all()
    }
    items = [
        {"product_id": item["product_id"], "qty": item["qty"],
         "name": products[item["product_id"]].name,
         "sale_price": float(products[item["product_id"]].sale_price)}
        for item in (cart.items or []) if item["product_id"] in products
    ]
    return {"items": items, "updated_at": cart.updated_at}


@router.put("/cart")
def save_cart(data: CartIn, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    _customer(user)
    payload = [item.model_dump() for item in data.items]
    if payload:
        products = db.query(Product.id).filter(
            Product.id.in_([i["product_id"] for i in payload]),
            Product.active.is_(True),
        ).all()
        if len(products) != len(payload):
            raise HTTPException(status_code=409, detail="El carrito contiene productos no disponibles")
    cart = db.query(SavedCustomerCart).filter_by(user_id=user.id).with_for_update().first()
    if cart is None:
        cart = SavedCustomerCart(user_id=user.id, items=[], revision=0)
        db.add(cart)
    if cart.items == payload:
        return {"saved": True, "revision": cart.revision, "unchanged": True}
    cart.items = payload
    cart.revision += 1
    cart.updated_at = datetime.utcnow()
    # Toda edición, incluso vaciar, invalida recordatorios anteriores.
    db.query(CartRecoveryNotice).filter(
        CartRecoveryNotice.user_id == user.id,
        CartRecoveryNotice.status == "scheduled",
    ).update({"status": "cancelled"}, synchronize_session=False)
    if not payload:
        cart.recovered_at = datetime.utcnow()
    else:
        cart.recovered_at = None
        queue_cart_reminder(db, cart, user)
    db.commit()
    return {"saved": True, "revision": cart.revision, "unchanged": False}


@router.get("/loyalty")
def loyalty(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _customer(user)
    balance = max(0, loyalty_balance(db, user.id))
    entries = db.query(LoyaltyLedger).filter(
        LoyaltyLedger.user_id == user.id
    ).order_by(LoyaltyLedger.id.desc()).limit(30).all()
    return {
        "points": balance,
        "tier": "oro" if balance >= 500 else "plata" if balance >= 150 else "bronce",
        "history": [{
            "id": entry.id, "points_delta": entry.points_delta,
            "event_type": entry.event_type,
            "order_id": entry.order_id,
            "created_at": entry.created_at,
        } for entry in entries],
        "redeem_enabled": False,
        "explanation": "1 punto por cada $1.000 COP de productos pagados, después del cupón. Los puntos aún no se pueden canjear.",
    }


@router.get("/admin/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    now = datetime.utcnow()
    return {
        "saved_carts_with_items": sum(
            1 for (items,) in db.query(SavedCustomerCart.items).all() if items
        ),
        "customers_with_recovery_consent": db.query(func.count(CustomerEngagementPreference.user_id)).filter(
            CustomerEngagementPreference.recovery_email_opt_in.is_(True)
        ).scalar() or 0,
        "recovery_scheduled": db.query(func.count(CartRecoveryNotice.id)).filter(
            CartRecoveryNotice.status == "scheduled"
        ).scalar() or 0,
        "recovery_sent": db.query(func.count(CartRecoveryNotice.id)).filter(
            CartRecoveryNotice.status == "sent"
        ).scalar() or 0,
        "loyalty_members": db.query(func.count(func.distinct(LoyaltyLedger.user_id))).scalar() or 0,
        "loyalty_points_issued_net": int(db.query(func.coalesce(func.sum(LoyaltyLedger.points_delta), 0)).scalar() or 0),
        "email_delivery_enabled": False,
        "disclaimer": "Envíos de recuperación deshabilitados por defecto; no son conversiones verificadas ni ventas recuperadas.",
    }
