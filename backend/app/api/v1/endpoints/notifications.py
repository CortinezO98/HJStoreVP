"""Auditoría y reintentos de notificaciones transaccionales (solo admin)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import CustomerNotification, User

router = APIRouter(prefix="/notifications", tags=["Notificaciones"])


class NotificationOut(BaseModel):
    id: int
    order_id: int
    event_key: str
    kind: str
    recipient: str
    subject: str
    status: str
    attempts: int
    next_attempt_at: datetime
    sent_at: datetime | None
    created_at: datetime
    last_error: str | None
    model_config = {"from_attributes": True}


@router.get("/admin/stats")
def admin_notification_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = db.query(
        CustomerNotification.status, func.count(CustomerNotification.id)
    ).group_by(CustomerNotification.status).all()
    result = {"pending": 0, "sending": 0, "sent": 0, "failed": 0}
    for status, count in rows:
        if status in result:
            result[status] = count
    return result


@router.get("/admin", response_model=list[NotificationOut])
def admin_notifications(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    allowed = ("pending", "sending", "sent", "failed")
    if status_filter and status_filter not in allowed:
        raise HTTPException(status_code=400, detail="Estado de notificación inválido")
    q = db.query(CustomerNotification)
    if status_filter:
        q = q.filter(CustomerNotification.status == status_filter)
    return q.order_by(CustomerNotification.id.desc()).limit(limit).all()


@router.post("/admin/{notification_id}/retry", response_model=NotificationOut)
def retry_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    record = db.query(CustomerNotification).filter(
        CustomerNotification.id == notification_id
    ).with_for_update().first()
    if not record:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    if record.status != "failed":
        raise HTTPException(
            status_code=409, detail="Solo se pueden reintentar notificaciones fallidas",
        )
    record.status = "pending"
    record.attempts = 0
    record.next_attempt_at = datetime.utcnow()
    record.lease_until = None
    record.last_error = None
    db.commit()
    db.refresh(record)
    return record
