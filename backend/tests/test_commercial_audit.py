"""Phase C commercial audit: reads existing ledgers without modifying operations."""
from datetime import datetime, timedelta
import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.db.session import Base, get_db
from app.main import app
from app.core.deps import get_current_user
from app.models.models import (
    User, UserRole, StockMovement, StockMovementType, ShipmentEvent,
    PostSaleEvent, CommercialDocumentEvent, ProductQualityReviewEvent,
)
from app.api.v1.endpoints.commercial_audit import commercial_history, export_commercial_history


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine


def _read(db, actor, **kwargs):
    defaults = {
        "source": None, "actor_id": None, "resource": None, "action": None,
        "from_date": None, "to_date": None, "page": 1, "per_page": 30,
        "db": db, "_": actor,
    }
    defaults.update(kwargs)
    return commercial_history(**defaults)


def test_federated_history_filters_and_no_mutations():
    engine = _db()
    now = datetime.utcnow().replace(microsecond=0)
    with Session(engine) as db:
        actor = User(email="test@example.test", full_name="Audit",
                     hashed_password="test-only", role=UserRole.SUPER_ADMIN, active=True)
        db.add(actor)
        db.flush()
        db.add_all([
            StockMovement(product_id=101, location_id=55,
                          movement_type=StockMovementType.ADJUSTMENT,
                          qty=3, qty_before=1, qty_after=4, notes="sensitive-notes",
                          created_by=actor.id, created_at=now),
            ShipmentEvent(shipment_id=9, status="delivered", note="private-note",
                          created_by_id=actor.id, created_at=now + timedelta(seconds=1)),
            PostSaleEvent(case_id=14, action="refund", note="internal-note",
                          actor_id=actor.id, created_at=now + timedelta(seconds=2)),
            CommercialDocumentEvent(document_id=20, action="created",
                                    note="document-private", actor_id=actor.id,
                                    created_at=now + timedelta(seconds=3)),
            ProductQualityReviewEvent(product_id=101, status="approved", note="internal note",
                                      snapshot_hash="a" * 64, reviewed_by=actor.id,
                                      reviewed_at=now + timedelta(seconds=4)),
        ])
        db.commit()
        result = _read(db, actor)
        assert result["total"] == 5
        assert len(result["items"]) == 5
        assert set(x["source"] for x in result["items"]) == {
            "stock_movements", "shipment_events", "post_sale_events",
            "commercial_document_events", "product_quality_review_events",
        }
        assert all(x["integrity"] == "source_history_unverified" for x in result["items"])
        assert "private-note" not in str(result)
        assert "sensitive-notes" not in str(result)
        assert _read(db, actor, resource="inventory")["total"] == 1
        assert _read(db, actor, actor_id=actor.id)["total"] == 5
        assert _read(db, actor, source="not_existing")["total"] == 0
        assert _read(db, actor, page=2, per_page=2)["total"] == 5
        assert len(_read(db, actor, page=2, per_page=2)["items"]) == 2
        assert db.query(StockMovement).count() == 1  # Ningún movimiento extra
    engine.dispose()


def test_commercial_export_is_sanitized_and_bounded():
    engine = _db()
    with Session(engine) as db:
        actor = User(email="admin@example.test", full_name="Audit",
                     hashed_password="test-only", role=UserRole.SUPER_ADMIN, active=True)
        db.add(actor)
        db.flush()
        db.add(PostSaleEvent(case_id=2, action="=COMMAND", note="secret",
                             actor_id=actor.id, created_at=datetime.utcnow()))
        db.commit()
        response = export_commercial_history(
            source=None, actor_id=None, resource=None, action=None,
            from_date=None, to_date=None, db=db, _=actor,
        )
        async def collect():
            parts = []
            async for part in response.body_iterator:
                parts.append(part.decode() if isinstance(part, bytes) else part)
            return "".join(parts)
        body = asyncio.run(collect())
        assert "'=COMMAND" in body
        assert "secret" not in body
        assert "source_id" in body
    engine.dispose()


def test_commercial_audit_denies_non_superadmins():
    engine = _db()
    with Session(engine) as db:
        actor = User(email="admin@example.test", full_name="Audit",
                     hashed_password="test-only", role=UserRole.ADMIN, active=True)
        db.add(actor)
        db.commit()
        def db_override():
            yield db
        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: actor
        try:
            client = TestClient(app)
            assert client.get("/api/v1/commercial-audit", headers={"Authorization": "Bearer dummy"}).status_code == 403
            assert client.get("/api/v1/commercial-audit/export", headers={"Authorization": "Bearer dummy"}).status_code == 403
            actor.role = UserRole.SELLER
            assert client.get("/api/v1/commercial-audit", headers={"Authorization": "Bearer dummy"}).status_code == 403
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)
    engine.dispose()
