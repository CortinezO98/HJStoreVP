"""Administración de despachos y consulta autenticada de seguimiento.

Los eventos son registros manuales de HJStoreVP, NO rastreo confirmado por
transportadora. Nunca se cambia el estado de pago desde estas rutas.
"""
from datetime import datetime
from typing import Literal, Optional
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import (
    Order, OrderStatus, Shipment, ShipmentEvent, User, UserRole,
)
from app.services.stock_reservations import lock_web_order

router = APIRouter(prefix="/shipments", tags=["Despachos y seguimiento"])

ShipmentState = Literal[
    "dispatched", "in_transit", "out_for_delivery", "delivered", "exception"
]
TRANSITIONS = {
    "dispatched": {"in_transit", "out_for_delivery", "delivered", "exception"},
    "in_transit": {"out_for_delivery", "delivered", "exception"},
    "out_for_delivery": {"delivered", "exception"},
    "exception": {"in_transit", "out_for_delivery", "delivered"},
    "delivered": set(),
}
GUIDE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_/-]{3,119}$")


class DispatchIn(BaseModel):
    tracking_number: str = Field(min_length=4, max_length=120)
    carrier: str = Field(min_length=2, max_length=120)
    service: str = Field(min_length=2, max_length=120)
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("tracking_number")
    @classmethod
    def valid_guide(cls, value: str) -> str:
        value = value.strip()
        if not GUIDE_PATTERN.fullmatch(value):
            raise ValueError("Número de guía inválido")
        return value

    @field_validator("carrier", "service")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("El dato debe tener mínimo dos caracteres")
        return value


class ShipmentEventIn(BaseModel):
    status: ShipmentState
    note: Optional[str] = Field(default=None, max_length=500)


class ShipmentEventOut(BaseModel):
    id: int
    status: str
    note: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class ShipmentOut(BaseModel):
    id: int
    order_id: int
    order_number: str
    order_status: str
    carrier: str
    service: str
    tracking_number: str
    status: str
    dispatched_at: datetime
    delivered_at: Optional[datetime]
    events: list[ShipmentEventOut]


def _serialize(shipment: Shipment, order: Order) -> ShipmentOut:
    return ShipmentOut(
        id=shipment.id,
        order_id=order.id,
        order_number=order.order_number,
        order_status=order.status.value,
        carrier=shipment.carrier,
        service=shipment.service,
        tracking_number=shipment.tracking_number,
        status=shipment.status,
        dispatched_at=shipment.dispatched_at,
        delivered_at=shipment.delivered_at,
        events=sorted(shipment.events, key=lambda x: (x.created_at, x.id)),
    )


def _get_shipment(db: Session, order: Order) -> Shipment:
    shipment = db.query(Shipment).filter(Shipment.order_id == order.id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Este pedido aún no tiene una guía registrada")
    return shipment


@router.get("/orders/{order_id}", response_model=ShipmentOut)
def tracking_for_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # No revelar la existencia de guías de otros clientes.
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or (
        user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN)
        and order.customer_id != user.id
    ):
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return _serialize(_get_shipment(db, order), order)


@router.post("/orders/{order_id}/dispatch", response_model=ShipmentOut, status_code=201)
def dispatch_order(
    order_id: int,
    data: DispatchIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = lock_web_order(db, order_id)
    if order.status not in (OrderStatus.PAID, OrderStatus.PREPARING):
        raise HTTPException(
            status_code=409, detail="El pedido requiere pago confirmado antes de despacharse"
        )
    # Una guía por pedido, incluso ante peticiones concurrentes.
    if db.query(Shipment.id).filter(Shipment.order_id == order.id).first():
        raise HTTPException(status_code=409, detail="El pedido ya tiene una guía registrada")

    address = order.shipping_address or {}
    if address.get("carrier") and address["carrier"].strip().casefold() != data.carrier.casefold():
        raise HTTPException(
            status_code=409, detail="La transportadora no coincide con la elegida por el cliente"
        )
    if address.get("shipping_service") and address["shipping_service"].strip().casefold() != data.service.casefold():
        raise HTTPException(
            status_code=409, detail="El servicio no coincide con el contratado"
        )

    now = datetime.utcnow()
    shipment = Shipment(
        order_id=order.id,
        carrier=data.carrier,
        service=data.service,
        tracking_number=data.tracking_number,
        status="dispatched",
        dispatched_at=now,
    )
    db.add(shipment)
    db.flush()
    db.add(ShipmentEvent(
        shipment_id=shipment.id, status="dispatched",
        note=data.note.strip() if data.note else "Guía registrada y despacho gestionado por HJStoreVP",
        created_by_id=admin.id,
    ))
    order.status = OrderStatus.SHIPPED
    db.commit()
    db.refresh(shipment)
    return _serialize(shipment, order)


@router.post("/orders/{order_id}/events", response_model=ShipmentOut)
def add_shipment_event(
    order_id: int,
    data: ShipmentEventIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = lock_web_order(db, order_id)
    shipment = _get_shipment(db, order)
    if order.status not in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
        raise HTTPException(status_code=409, detail="Pedido no despachado o en estado incompatible")
    if data.status not in TRANSITIONS.get(shipment.status, set()):
        raise HTTPException(status_code=409, detail="Transición de seguimiento no permitida")
    shipment.status = data.status
    if data.status == "delivered":
        shipment.delivered_at = datetime.utcnow()
        order.status = OrderStatus.DELIVERED
    db.add(ShipmentEvent(
        shipment_id=shipment.id,
        status=data.status,
        note=data.note.strip() if data.note else None,
        created_by_id=admin.id,
    ))
    db.commit()
    db.refresh(shipment)
    return _serialize(shipment, order)
