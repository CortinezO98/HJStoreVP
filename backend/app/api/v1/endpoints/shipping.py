"""Tarifas de envío HJStoreVP (administración + cotización pública)."""
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import ShippingRate, User
from app.services.shipping import location_key, quote_rates

router = APIRouter(prefix="/shipping", tags=["Envíos"])


class ShippingRateIn(BaseModel):
    department: str = Field(min_length=2, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    carrier: str = Field(min_length=2, max_length=120)
    service: str = Field(min_length=2, max_length=120)
    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    days_min: int = Field(ge=1, le=90)
    days_max: int = Field(ge=1, le=90)
    active: bool = True

    @field_validator("department", "carrier", "service", "city")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def validate_days(self):
        if self.days_max < self.days_min:
            raise ValueError("Los días máximos deben ser iguales o mayores al mínimo")
        if not self.department or not self.carrier or not self.service:
            raise ValueError("Completa departamento, transportadora y servicio")
        return self


class ShippingRateOut(BaseModel):
    id: int
    department: str
    city: Optional[str]
    carrier: str
    service: str
    price: Decimal
    days_min: int
    days_max: int
    active: bool
    model_config = {"from_attributes": True}


class ShippingQuoteOut(BaseModel):
    id: int
    carrier: str
    service: str
    price: Decimal
    days_min: int
    days_max: int
    model_config = {"from_attributes": True}


def _apply(rate: ShippingRate, data: ShippingRateIn):
    values = data.model_dump()
    for key, value in values.items():
        setattr(rate, key, value)
    rate.city = rate.city or None
    rate.department_key = location_key(rate.department)
    rate.city_key = location_key(rate.city) if rate.city else None


@router.get("/quote", response_model=list[ShippingQuoteOut])
def quote_shipping(
    department: str = Query(min_length=2, max_length=100),
    city: str = Query(min_length=2, max_length=100),
    db: Session = Depends(get_db),
):
    """Lista tarifas reales configuradas para una dirección (no modifica pedidos)."""
    return quote_rates(db, department, city)


@router.get("/rates", response_model=list[ShippingRateOut])
def list_shipping_rates(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return db.query(ShippingRate).order_by(ShippingRate.department, ShippingRate.city, ShippingRate.id).all()


@router.post("/rates", response_model=ShippingRateOut, status_code=201)
def create_shipping_rate(
    data: ShippingRateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rate = ShippingRate()
    _apply(rate, data)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.put("/rates/{rate_id}", response_model=ShippingRateOut)
def update_shipping_rate(
    rate_id: int,
    data: ShippingRateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rate = db.get(ShippingRate, rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    _apply(rate, data)
    db.commit()
    db.refresh(rate)
    return rate
