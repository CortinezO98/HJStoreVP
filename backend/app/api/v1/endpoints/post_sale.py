"""Posventa: solicitudes de devolución, incidencias y reembolsos externos.

No ejecuta pagos ni invoca APIs de reembolso. Una confirmación manual solo
registra la evidencia indicada por el administrador; NO certifica que el
proveedor haya enviado dinero. Inventario solo se reintegra tras recepción
física y con trazabilidad a la ubicación original.
"""
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import (
    Inventory, Location, Order, OrderChannel, OrderItem, OrderStatus,
    OrderStockReservation, PostSaleCase, PostSaleEvent, StockMovement,
    StockMovementType, User, UserRole,
)
from app.services.stock_reservations import lock_web_order
from app.services.notifications import enqueue_order_notification
from app.services.engagement import reverse_refunded_items

router = APIRouter(prefix="/post-sale", tags=["Posventa"])

ELIGIBLE_STATUSES = {
    OrderStatus.PAID, OrderStatus.PREPARING,
    OrderStatus.SHIPPED, OrderStatus.DELIVERED,
}
REVIEW_TRANSITIONS = {
    "submitted": {"under_review", "approved", "rejected"},
    "under_review": {"approved", "rejected"},
    "approved": {"closed"},
    "received": {"closed"},
    "rejected": set(),
    "closed": set(),
}


class CaseCreate(BaseModel):
    order_id: int = Field(gt=0)
    kind: Literal["return", "incident"]
    order_item_id: int | None = Field(default=None, gt=0)
    qty: int = Field(default=0, ge=0)
    reason: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10, max_length=2000)

    @field_validator("reason", "description")
    @classmethod
    def clean(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("El texto no puede estar vacío")
        return value


class NonEmptyNote(BaseModel):
    note: str = Field(min_length=5, max_length=500)

    @field_validator("note")
    @classmethod
    def validate_note(cls, value):
        value = value.strip()
        if len(value) < 5:
            raise ValueError("El motivo requiere al menos cinco caracteres")
        return value


class ReviewIn(NonEmptyNote):
    status: Literal["under_review", "approved", "rejected", "closed"]


class ReceiveIn(NonEmptyNote):
    condition: Literal["resellable", "damaged"]


class RefundRequestIn(NonEmptyNote):
    pass


class RecordRefundIn(BaseModel):
    external_reference: str = Field(min_length=5, max_length=180)
    confirmation_note: str = Field(min_length=10, max_length=500)
    explicitly_verified_externally: bool

    @field_validator("external_reference", "confirmation_note")
    @classmethod
    def trim(cls, value):
        value = value.strip()
        if len(value) < 5:
            raise ValueError("Se requiere una referencia o explicación válida")
        return value


class CaseEventOut(BaseModel):
    id: int
    action: str
    note: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class CaseOut(BaseModel):
    id: int
    order_id: int
    order_number: str
    kind: str
    order_item_id: int | None
    product_name: str | None
    qty: int
    reason: str
    description: str
    status: str
    refund_amount: Decimal | None
    refund_status: str
    refund_reference: str | None
    restocked_qty: int
    created_at: datetime
    resolved_at: datetime | None
    events: list[CaseEventOut]


def _serialize(db: Session, case: PostSaleCase) -> CaseOut:
    order = db.get(Order, case.order_id)
    item = db.get(OrderItem, case.order_item_id) if case.order_item_id else None
    return CaseOut(
        id=case.id, order_id=case.order_id,
        order_number=order.order_number if order else "",
        kind=case.kind, order_item_id=case.order_item_id,
        product_name=item.product_name if item else None,
        qty=case.qty, reason=case.reason, description=case.description,
        status=case.status, refund_amount=case.refund_amount,
        refund_status=case.refund_status,
        refund_reference=case.refund_reference,
        restocked_qty=case.restocked_qty,
        created_at=case.created_at,
        resolved_at=case.resolved_at,
        events=list(case.events),
    )


def _log(db: Session, case: PostSaleCase, actor: User, action: str, note: str | None) -> None:
    db.add(PostSaleEvent(
        case_id=case.id, actor_id=actor.id, action=action, note=note,
    ))
    kind = {
        "submitted": "post_sale_submitted",
        "under_review": "post_sale_under_review",
        "approved": "post_sale_approved",
        "rejected": "post_sale_rejected",
        "received": "post_sale_received",
        "closed": "post_sale_closed",
        "refund_requested": "post_sale_refund_requested",
        "refund_externally_recorded": "post_sale_refund_recorded",
    }.get(action)
    if kind:
        order = db.get(Order, case.order_id)
        enqueue_order_notification(
            db, order, kind, f"post-sale:{case.id}:{action}",
        )


def _get_case(db: Session, case_id: int, user: User) -> PostSaleCase:
    case = db.query(PostSaleCase).filter(PostSaleCase.id == case_id).first()
    if not case or (
        user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN)
        and case.customer_id != user.id
    ):
        raise HTTPException(status_code=404, detail="Solicitud posventa no encontrada")
    return case


def _lock_case_and_order(db: Session, case_id: int) -> tuple[PostSaleCase, Order]:
    # Siempre bloquear primero pedido y luego caso, igual que otras operaciones.
    # Buscar solo ID del pedido inicialmente, sin poner bloqueos en orden inverso.
    pair = db.query(PostSaleCase.order_id).filter(PostSaleCase.id == case_id).first()
    if not pair:
        raise HTTPException(status_code=404, detail="Solicitud posventa no encontrada")
    order = lock_web_order(db, pair.order_id)
    case = db.query(PostSaleCase).filter(
        PostSaleCase.id == case_id
    ).with_for_update().first()
    if not case or case.order_id != order.id:
        raise HTTPException(status_code=404, detail="Solicitud posventa no encontrada")
    return case, order


@router.post("", response_model=CaseOut, status_code=201)
def create_case(
    data: CaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = lock_web_order(db, data.order_id)
    if order.customer_id != user.id:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.channel != OrderChannel.WEB or order.status not in ELIGIBLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="La solicitud requiere un pedido web con pago confirmado",
        )
    if data.kind == "return":
        if data.order_item_id is None or data.qty <= 0:
            raise HTTPException(status_code=422, detail="Indica producto y cantidad a devolver")
        item = db.query(OrderItem).filter(
            OrderItem.id == data.order_item_id,
            OrderItem.order_id == order.id,
        ).first()
        if not item:
            raise HTTPException(status_code=404, detail="Producto no pertenece al pedido")
        # Todas las solicitudes no rechazadas consumen cupo de devolución.
        existing = db.query(func.coalesce(func.sum(PostSaleCase.qty), 0)).filter(
            PostSaleCase.order_item_id == item.id,
            PostSaleCase.kind == "return",
            PostSaleCase.status != "rejected",
        ).scalar() or 0
        if int(existing) + data.qty > item.qty:
            raise HTTPException(
                status_code=409,
                detail="La cantidad solicitada supera las unidades disponibles para devolución",
            )
        amount = Decimal(item.unit_price) * Decimal(data.qty)
    else:
        if data.qty != 0 or data.order_item_id is not None:
            raise HTTPException(
                status_code=422,
                detail="Las incidencias generales no deben reservar productos ni cantidades",
            )
        amount = None
    case = PostSaleCase(
        order_id=order.id, order_item_id=data.order_item_id,
        customer_id=user.id, kind=data.kind, reason=data.reason,
        description=data.description, qty=data.qty,
        status="submitted", refund_status="not_requested",
        refund_amount=amount,
    )
    db.add(case)
    db.flush()
    _log(db, case, user, "submitted", "Solicitud registrada por el cliente")
    db.commit()
    db.refresh(case)
    return _serialize(db, case)


@router.get("/mine", response_model=list[CaseOut])
def my_cases(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cases = db.query(PostSaleCase).filter(
        PostSaleCase.customer_id == user.id
    ).order_by(PostSaleCase.id.desc()).limit(100).all()
    return [_serialize(db, case) for case in cases]


@router.get("/admin", response_model=list[CaseOut])
def admin_cases(
    status_filter: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(PostSaleCase)
    if status_filter:
        if status_filter not in {"submitted", "under_review", "approved", "rejected", "received", "closed"}:
            raise HTTPException(status_code=400, detail="Estado desconocido")
        query = query.filter(PostSaleCase.status == status_filter)
    cases = query.order_by(PostSaleCase.id.desc()).limit(limit).all()
    return [_serialize(db, case) for case in cases]


@router.get("/{case_id}", response_model=CaseOut)
def case_detail(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _serialize(db, _get_case(db, case_id, user))


@router.post("/{case_id}/review", response_model=CaseOut)
def review_case(
    case_id: int,
    data: ReviewIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    case, _ = _lock_case_and_order(db, case_id)
    if data.status not in REVIEW_TRANSITIONS.get(case.status, set()):
        raise HTTPException(status_code=409, detail="Transición posventa no permitida")
    if data.status == "closed" and case.refund_status == "pending_external":
        raise HTTPException(
            status_code=409,
            detail="No cierres el caso mientras un reembolso externo está pendiente",
        )
    if data.status == "closed" and case.kind == "return" and case.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Registra primero la recepción física de la mercancía",
        )
    case.status = data.status
    if data.status in ("closed", "rejected"):
        case.resolved_at = datetime.utcnow()
    _log(db, case, admin, data.status, data.note.strip())
    db.commit()
    db.refresh(case)
    return _serialize(db, case)


@router.post("/{case_id}/receive", response_model=CaseOut)
def receive_return(
    case_id: int,
    data: ReceiveIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    case, order = _lock_case_and_order(db, case_id)
    if case.kind != "return" or case.status != "approved":
        raise HTTPException(
            status_code=409,
            detail="Solo se recibe mercancía de una devolución aprobada",
        )
    if case.restocked_qty:
        raise HTTPException(status_code=409, detail="Unidades previamente reintegradas")
    if data.condition == "resellable":
        reservation = db.query(OrderStockReservation).filter(
            OrderStockReservation.order_item_id == case.order_item_id,
            OrderStockReservation.order_id == order.id,
            OrderStockReservation.status == "committed",
        ).first()
        if not reservation:
            raise HTTPException(
                status_code=409,
                detail="Sin ubicación de origen verificable; conciliación manual de inventario",
            )
        result = db.execute(
            update(Inventory)
            .where(
                Inventory.product_id == reservation.product_id,
                Inventory.location_id == reservation.location_id,
            )
            .values(qty_available=Inventory.qty_available + case.qty)
        )
        if result.rowcount != 1:
            raise HTTPException(
                status_code=409, detail="No existe inventario en la ubicación original",
            )
        inventory = db.query(Inventory).filter(
            Inventory.product_id == reservation.product_id,
            Inventory.location_id == reservation.location_id,
        ).first()
        db.refresh(inventory)
        db.add(StockMovement(
            product_id=reservation.product_id, location_id=reservation.location_id,
            movement_type=StockMovementType.ADJUSTMENT,
            qty=case.qty,
            qty_before=inventory.qty_available - case.qty,
            qty_after=inventory.qty_available,
            reference_id=order.id,
            notes=f"Devolución posventa #{case.id}, mercancía recibida y revendible",
        ))
        case.restocked_qty = case.qty
        case.restock_location_id = reservation.location_id
    case.status = "received"
    _log(db, case, admin, "received", (
        f"Mercancía recibida ({data.condition}). {data.note.strip()}"
    ))
    db.commit()
    db.refresh(case)
    return _serialize(db, case)


@router.post("/{case_id}/request-refund", response_model=CaseOut)
def request_external_refund(
    case_id: int,
    data: RefundRequestIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    case, order = _lock_case_and_order(db, case_id)
    if case.kind != "return" or case.status != "received":
        raise HTTPException(status_code=409, detail="Debe recibirse la devolución aprobada")
    if case.refund_status != "not_requested" or not case.refund_amount:
        raise HTTPException(status_code=409, detail="La solicitud ya tiene un reembolso asociado")
    if order.payment_method is None or order.paid_at is None:
        raise HTTPException(status_code=409, detail="Pago del pedido no verificable")
    # No se reembolsa más del valor abonado ni del importe original del artículo.
    other = db.query(func.coalesce(func.sum(PostSaleCase.refund_amount), 0)).filter(
        PostSaleCase.order_id == order.id,
        PostSaleCase.id != case.id,
        PostSaleCase.refund_status.in_(["pending_external", "externally_recorded"]),
    ).scalar() or Decimal("0")
    if Decimal(other) + case.refund_amount > order.total_amount:
        raise HTTPException(status_code=409, detail="Excede el importe pagado del pedido")
    case.refund_status = "pending_external"
    _log(db, case, admin, "refund_requested", data.note.strip())
    db.commit()
    db.refresh(case)
    return _serialize(db, case)


@router.post("/{case_id}/record-refund", response_model=CaseOut)
def record_external_refund(
    case_id: int,
    data: RecordRefundIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    case, _ = _lock_case_and_order(db, case_id)
    if case.refund_status != "pending_external":
        raise HTTPException(
            status_code=409, detail="No existe un reembolso externo pendiente",
        )
    if not data.explicitly_verified_externally:
        raise HTTPException(
            status_code=422,
            detail="Se requiere verificar fuera del sistema el movimiento real",
        )
    used = db.query(PostSaleCase.id).filter(
        PostSaleCase.refund_reference == data.external_reference,
    ).first()
    if used:
        raise HTTPException(status_code=409, detail="Referencia de reembolso ya registrada")
    case.refund_status = "externally_recorded"
    case.refund_reference = data.external_reference
    case.refund_recorded_at = datetime.utcnow()
    reverse_refunded_items(db, case)
    _log(db, case, admin, "refund_externally_recorded", (
        f"Referencia externa: {data.external_reference}. {data.confirmation_note}"
    ))
    db.commit()
    db.refresh(case)
    return _serialize(db, case)
