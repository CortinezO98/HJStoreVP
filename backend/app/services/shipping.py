"""Tarifario local de envíos: cotizaciones determinísticas, sin inventar precios.

La ciudad se normaliza para comparar; una tarifa regional de ciudad vacía
sirve como respaldo. Tarifas específicas de misma transportadora/servicio
reemplazan la regional. No integra APIs de transportadoras.
"""
from decimal import Decimal
import unicodedata

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import ShippingRate


def location_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", " ".join(value.split()).casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def quote_rates(db: Session, department: str, city: str) -> list[ShippingRate]:
    dep = location_key(department or "")
    town = location_key(city or "")
    if not dep or not town:
        return []
    available = db.query(ShippingRate).filter(
        ShippingRate.active.is_(True),
        ShippingRate.department_key == dep,
    ).order_by(ShippingRate.price.asc(), ShippingRate.id.asc()).all()
    candidates = [r for r in available if r.city_key is None or r.city_key == town]
    specific_pairs = {
        (r.carrier.casefold(), r.service.casefold())
        for r in candidates if r.city_key == town
    }
    return [
        r for r in candidates
        if r.city_key == town or (r.carrier.casefold(), r.service.casefold()) not in specific_pairs
    ]


def get_selected_rate(db: Session, rate_id: int, department: str, city: str) -> ShippingRate:
    rate = db.get(ShippingRate, rate_id)
    if not rate or not rate.active or rate.price < Decimal("0"):
        raise HTTPException(status_code=409, detail="La tarifa de envío no está disponible")
    rates = quote_rates(db, department, city)
    if not any(item.id == rate.id for item in rates):
        raise HTTPException(
            status_code=409,
            detail="La tarifa seleccionada no está disponible para esta dirección",
        )
    return rate


def shipping_snapshot(rate: ShippingRate) -> dict:
    return {
        "shipping_rate_id": rate.id,
        "carrier": rate.carrier,
        "shipping_service": rate.service,
        "shipping_days_min": rate.days_min,
        "shipping_days_max": rate.days_max,
    }
