"""Gestión de caja por punto físico: apertura, movimientos, arqueo y cierre."""
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_seller
from app.db.session import get_db
from app.models.models import CashMovement, CashSession, Location, LocationType, User, UserRole

router = APIRouter(prefix="/cash", tags=["Caja de punto físico"])


class OpenCashRequest(BaseModel):
    location_id: int = Field(gt=0)
    opening_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


class MovementRequest(BaseModel):
    movement_type: Literal["income", "expense", "withdrawal"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    note: str = Field(min_length=3, max_length=500)


class CloseCashRequest(BaseModel):
    counted_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


def _location(db: Session, user: User, location_id: int, *, lock: bool = False) -> Location:
    if user.role == UserRole.SELLER and user.location_id != location_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sede")
    query = db.query(Location).filter(
        Location.id == location_id,
        Location.type == LocationType.PHYSICAL,
        Location.active.is_(True),
    )
    location = query.with_for_update().first() if lock else query.first()
    if not location:
        raise HTTPException(status_code=404, detail="Punto físico no encontrado o inactivo")
    return location


def _session(db: Session, user: User, session_id: int, *, lock: bool = False) -> CashSession:
    query = db.query(CashSession).filter(CashSession.id == session_id)
    session = query.with_for_update().first() if lock else query.first()
    if not session:
        raise HTTPException(status_code=404, detail="Turno de caja no encontrado")
    _location(db, user, session.location_id)
    return session


def _totals(db: Session, session: CashSession) -> dict:
    rows = db.query(CashMovement.movement_type, func.coalesce(func.sum(CashMovement.amount), 0)).filter(
        CashMovement.session_id == session.id
    ).group_by(CashMovement.movement_type).all()
    amounts = {kind: Decimal(total) for kind, total in rows}
    expected = (
        session.opening_amount + amounts.get("income", Decimal(0))
        + amounts.get("sale", Decimal(0))
        - amounts.get("expense", Decimal(0))
        - amounts.get("withdrawal", Decimal(0))
    )
    return {
        "opening_amount": str(session.opening_amount),
        "income": str(amounts.get("income", Decimal(0))),
        "sales_cash": str(amounts.get("sale", Decimal(0))),
        "expenses": str(amounts.get("expense", Decimal(0))),
        "withdrawals": str(amounts.get("withdrawal", Decimal(0))),
        "expected_amount": str(expected),
    }


def _serialize(db: Session, session: CashSession) -> dict:
    return {
        "id": session.id, "location_id": session.location_id,
        "opened_by": session.opened_by, "closed_by": session.closed_by,
        "status": session.status, "opened_at": session.opened_at,
        "closed_at": session.closed_at, "closing_counted": session.closing_counted,
        "difference": session.difference, "opening_note": session.opening_note,
        "closing_note": session.closing_note, **_totals(db, session),
    }


@router.get("/sessions")
def list_sessions(
    location_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    if location_id is not None:
        _location(db, user, location_id)
    query = db.query(CashSession)
    if user.role == UserRole.SELLER:
        if not user.location_id:
            raise HTTPException(status_code=403, detail="Vendedor sin sede asignada")
        query = query.filter(CashSession.location_id == user.location_id)
    elif location_id is not None:
        query = query.filter(CashSession.location_id == location_id)
    return [_serialize(db, item) for item in query.order_by(CashSession.id.desc()).limit(100).all()]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def open_session(
    data: OpenCashRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    # Serializar apertura por sede, evitando dos cajas abiertas simultáneamente.
    _location(db, user, data.location_id, lock=True)
    active = db.query(CashSession.id).filter(
        CashSession.location_id == data.location_id, CashSession.status == "open"
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="Ya existe un turno de caja abierto para esta sede")
    session = CashSession(
        location_id=data.location_id, opened_by=user.id, status="open",
        opening_amount=data.opening_amount, opening_note=data.note,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _serialize(db, session)


@router.get("/sessions/{session_id}")
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    return _serialize(db, _session(db, user, session_id))


@router.get("/sessions/{session_id}/movements")
def list_movements(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    _session(db, user, session_id)
    movements = db.query(CashMovement).filter(
        CashMovement.session_id == session_id
    ).order_by(CashMovement.id.desc()).limit(500).all()
    return [
        {"id": item.id, "movement_type": item.movement_type, "amount": str(item.amount),
         "note": item.note, "order_id": item.order_id,
         "created_by": item.created_by, "created_at": item.created_at}
        for item in movements
    ]


@router.post("/sessions/{session_id}/movements", status_code=status.HTTP_201_CREATED)
def add_movement(
    session_id: int,
    data: MovementRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    session = _session(db, user, session_id, lock=True)
    if session.status != "open":
        raise HTTPException(status_code=409, detail="Este turno está cerrado")
    if data.movement_type in ("expense", "withdrawal") and user.role == UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Solo administración puede autorizar egresos y retiros")
    amount_available = Decimal(_totals(db, session)["expected_amount"])
    if data.movement_type in ("expense", "withdrawal") and data.amount > amount_available:
        raise HTTPException(status_code=409, detail="Saldo insuficiente en caja")
    movement = CashMovement(
        session_id=session.id, movement_type=data.movement_type,
        amount=data.amount, note=data.note.strip(), created_by=user.id,
    )
    db.add(movement)
    db.commit()
    return {"id": movement.id, "message": "Movimiento registrado"}


@router.post("/sessions/{session_id}/close")
def close_session(
    session_id: int,
    data: CloseCashRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_seller),
):
    session = _session(db, user, session_id, lock=True)
    if session.status != "open":
        raise HTTPException(status_code=409, detail="Turno cerrado previamente")
    expected = Decimal(_totals(db, session)["expected_amount"])
    session.expected_amount = expected
    session.closing_counted = data.counted_amount
    session.difference = data.counted_amount - expected
    session.closed_by = user.id
    session.closing_note = data.note
    session.closed_at = datetime.utcnow()
    session.status = "closed"
    db.commit()
    db.refresh(session)
    return _serialize(db, session)
