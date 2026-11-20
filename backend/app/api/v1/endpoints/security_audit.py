"""Lectura de bitácora central. Nunca admite inserción/edición/borrado desde HTTP."""
from datetime import datetime
import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_super_admin
from app.db.session import get_db
from app.models.models import SecurityAuditEvent, User
from app.services.security_audit import is_signature_valid

router = APIRouter(prefix="/security-audit", tags=["Auditoría de seguridad"])


@router.get("")
def list_security_events(
    actor_id: int | None = Query(None, ge=1),
    action: str | None = Query(None, max_length=64),
    resource: str | None = Query(None, max_length=40),
    outcome: str | None = Query(None, pattern="^(success|failure)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    q = db.query(SecurityAuditEvent)
    if actor_id is not None:
        q = q.filter(SecurityAuditEvent.actor_id == actor_id)
    if action:
        q = q.filter(SecurityAuditEvent.action == action)
    if resource:
        q = q.filter(SecurityAuditEvent.resource == resource)
    if outcome:
        q = q.filter(SecurityAuditEvent.outcome == outcome)
    if from_date:
        q = q.filter(SecurityAuditEvent.created_at >= from_date)
    if to_date:
        q = q.filter(SecurityAuditEvent.created_at <= to_date)
    total = q.order_by(None).count()
    rows = q.order_by(SecurityAuditEvent.created_at.desc(), SecurityAuditEvent.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": event.id, "created_at": event.created_at.isoformat(),
            "actor_id": event.actor_id, "action": event.action, "resource": event.resource,
            "target_id": event.target_id, "outcome": event.outcome,
            "details": event.details, "integrity_ok": is_signature_valid(event),
        } for event in rows],
    }


@router.get("/summary")
def security_summary(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    results = db.query(
        SecurityAuditEvent.action, func.count(SecurityAuditEvent.id)
    ).group_by(SecurityAuditEvent.action).all()
    return {"by_action": [{"action": action, "count": count} for action, count in results]}


@router.get("/export")
def export_security_events(
    actor_id: int | None = Query(None, ge=1),
    action: str | None = Query(None, max_length=64),
    resource: str | None = Query(None, max_length=40),
    outcome: str | None = Query(None, pattern="^(success|failure)$"),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Exportación restringida, máxima 500 entradas. Sin firmas ni secretos."""
    q = db.query(SecurityAuditEvent)
    if actor_id is not None:
        q = q.filter(SecurityAuditEvent.actor_id == actor_id)
    if action:
        q = q.filter(SecurityAuditEvent.action == action)
    if resource:
        q = q.filter(SecurityAuditEvent.resource == resource)
    if outcome:
        q = q.filter(SecurityAuditEvent.outcome == outcome)
    if from_date:
        q = q.filter(SecurityAuditEvent.created_at >= from_date)
    if to_date:
        q = q.filter(SecurityAuditEvent.created_at <= to_date)
    rows = q.order_by(SecurityAuditEvent.created_at.desc(), SecurityAuditEvent.id.desc()).limit(500).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(("id", "created_at_utc", "actor_id", "action", "resource", "target_id", "outcome", "details", "integrity_ok"))
    for event in rows:
        def safe(value):
            # Evita inyección de fórmulas al abrir en Excel.
            raw = str(value if value is not None else "")
            return "'" + raw if raw.lstrip().startswith(("=", "+", "-", "@")) else raw
        import json
        writer.writerow([
            event.id, event.created_at.isoformat(), event.actor_id,
            safe(event.action), safe(event.resource), safe(event.target_id),
            safe(event.outcome), safe(json.dumps(event.details, ensure_ascii=False)),
            is_signature_valid(event),
        ])
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=hjstore-security-audit.csv",
                 "Cache-Control": "no-store"},
    )
