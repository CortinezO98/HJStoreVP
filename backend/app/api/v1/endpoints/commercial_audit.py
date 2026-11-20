"""Read-only consolidation of existing commercial event ledgers.

This endpoint never copies or mutates business history. It intentionally excludes
free-text notes, contact details, payments credentials and customer payloads.
"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import String, cast, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.core.deps import require_super_admin
from app.db.session import get_db
from app.models.models import (
    User, StockMovement, ShipmentEvent, PostSaleEvent,
    CommercialDocumentEvent, ProductQualityReviewEvent,
)

router = APIRouter(prefix="/commercial-audit", tags=["Auditoría comercial"])


def _combined():
    # Identificadores, actor, fecha y acción; nunca notas/correos/teléfonos.
    # CAST explícito: tipos consistentes en MariaDB y SQLite.
    parts = [
        select(
            literal("stock_movements").label("source"), StockMovement.id.label("source_id"),
            StockMovement.created_at.label("created_at"),
            StockMovement.created_by.label("actor_id"),
            cast(StockMovement.movement_type, String(64)).label("action"),
            literal("inventory").label("resource"),
            cast(StockMovement.product_id, String(70)).label("target_id"),
        ),
        select(
            literal("shipment_events"), ShipmentEvent.id, ShipmentEvent.created_at,
            ShipmentEvent.created_by_id, cast(ShipmentEvent.status, String(64)),
            literal("shipments"), cast(ShipmentEvent.shipment_id, String(70)),
        ),
        select(
            literal("post_sale_events"), PostSaleEvent.id, PostSaleEvent.created_at,
            PostSaleEvent.actor_id, cast(PostSaleEvent.action, String(64)),
            literal("post_sale"), cast(PostSaleEvent.case_id, String(70)),
        ),
        select(
            literal("commercial_document_events"), CommercialDocumentEvent.id,
            CommercialDocumentEvent.created_at, CommercialDocumentEvent.actor_id,
            cast(CommercialDocumentEvent.action, String(64)),
            literal("documents"), cast(CommercialDocumentEvent.document_id, String(70)),
        ),
        select(
            literal("product_quality_review_events"), ProductQualityReviewEvent.id,
            ProductQualityReviewEvent.reviewed_at, ProductQualityReviewEvent.reviewed_by,
            cast(ProductQualityReviewEvent.status, String(64)),
            literal("catalog"), cast(ProductQualityReviewEvent.product_id, String(70)),
        ),
    ]
    return union_all(*parts).subquery("commercial_events")


def _filtered(db: Session, *, source: str | None, actor_id: int | None,
              resource: str | None, action: str | None,
              from_date: datetime | None, to_date: datetime | None):
    events = _combined()
    q = select(events)
    if source:
        q = q.where(events.c.source == source)
    if actor_id is not None:
        q = q.where(events.c.actor_id == actor_id)
    if resource:
        q = q.where(events.c.resource == resource)
    if action:
        q = q.where(events.c.action == action)
    if from_date:
        q = q.where(events.c.created_at >= from_date)
    if to_date:
        q = q.where(events.c.created_at <= to_date)
    return events, q


def _row_data(row):
    return {
        "source": row.source,
        "source_id": row.source_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "actor_id": row.actor_id,
        "action": row.action,
        "resource": row.resource,
        "target_id": row.target_id,
        # Historial transaccional de origen, no sujeto a HMAC central retroactivo.
        "integrity": "source_history_unverified",
    }


@router.get("")
def commercial_history(
    source: str | None = Query(None, max_length=64),
    actor_id: int | None = Query(None, ge=1),
    resource: str | None = Query(None, max_length=40),
    action: str | None = Query(None, max_length=64),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    events, q = _filtered(db, source=source, actor_id=actor_id, resource=resource,
                          action=action, from_date=from_date, to_date=to_date)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(events.c.created_at.desc(), events.c.source, events.c.source_id.desc())
        .offset((page - 1) * per_page).limit(per_page)
    ).all()
    return {"total": total, "page": page, "per_page": per_page,
            "sources": [
                "stock_movements", "shipment_events", "post_sale_events",
                "commercial_document_events", "product_quality_review_events",
            ], "items": [_row_data(row) for row in rows]}


@router.get("/export")
def export_commercial_history(
    source: str | None = Query(None, max_length=64),
    actor_id: int | None = Query(None, ge=1),
    resource: str | None = Query(None, max_length=40),
    action: str | None = Query(None, max_length=64),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    events, q = _filtered(db, source=source, actor_id=actor_id, resource=resource,
                          action=action, from_date=from_date, to_date=to_date)
    rows = db.execute(
        q.order_by(events.c.created_at.desc(), events.c.source, events.c.source_id.desc()).limit(500)
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(("source", "source_id", "created_at_utc", "actor_id",
                     "action", "resource", "target_id", "integrity"))
    for row in rows:
        values = _row_data(row)
        # Defensive CSV formula-injection handling.
        writer.writerow([
            ("'" + str(values[field]) if str(values[field]).lstrip().startswith(("=", "+", "-", "@"))
             else values[field]) for field in (
                "source", "source_id", "created_at", "actor_id",
                "action", "resource", "target_id", "integrity",
            )
        ])
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=hjstore-commercial-audit.csv",
                 "Cache-Control": "no-store"},
    )
