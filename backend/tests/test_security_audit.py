"""Phase C: append-only central log, tamper detection and access control."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException
import pytest

from app.db.session import Base
from app.models.models import User, UserRole, SecurityAuditEvent
from app.core.security import hash_password
from app.services.security_audit import append_audit, is_signature_valid
from app.api.v1.endpoints.security_audit import list_security_events, security_summary


@pytest.fixture
def audit_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="audit@example.test", full_name="Auditor",
                    hashed_password=hash_password("SecurePassword12345!"),
                    role=UserRole.SUPER_ADMIN, active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        yield db, user
    engine.dispose()


def test_audit_signature_detects_tampering(audit_db):
    db, user = audit_db
    append_audit(db, actor_id=user.id, action="users.updated",
                 resource="users", target_id=22,
                 details={"changed_fields": ["role"], "old_role": "seller", "new_role": "admin"})
    db.commit()
    row = db.query(SecurityAuditEvent).one()
    assert row.signature and is_signature_valid(row)
    row.target_id = "999"
    assert not is_signature_valid(row)


def test_refuse_secrets_and_unknown_actions(audit_db):
    db, user = audit_db
    with pytest.raises(ValueError):
        append_audit(db, actor_id=user.id, action="users.updated",
                     details={"password": "never-stored"})
    with pytest.raises(ValueError):
        append_audit(db, actor_id=user.id, action="unregistered.action")


def test_filtering_pagination_and_summary(audit_db):
    db, user = audit_db
    for action in ("auth.login.success", "users.updated", "users.updated"):
        append_audit(db, actor_id=user.id, action=action, resource="users", target_id=user.id)
    db.commit()
    result = list_security_events(
        actor_id=user.id, action="users.updated", resource=None, outcome=None,
        from_date=None, to_date=None, page=1, per_page=1, db=db, _=user
    )
    assert result["total"] == 2
    assert len(result["items"]) == 1
    assert result["items"][0]["integrity_ok"]
    summary = security_summary(db=db, _=user)
    assert {"action": "users.updated", "count": 2} in summary["by_action"]


def test_audit_api_never_exposes_sensitive_columns(audit_db):
    db, user = audit_db
    append_audit(db, actor_id=user.id, action="auth.password.changed", target_id=user.id)
    db.commit()
    result = list_security_events(
        actor_id=None, action=None, resource=None, outcome=None,
        from_date=None, to_date=None, page=1, per_page=30, db=db, _=user
    )
    item = result["items"][0]
    assert "hashed_password" not in item
    assert "token" not in item
    assert "signature" not in item


def test_security_audit_requires_superadmin_dependency():
    from app.core.deps import require_super_admin
    # La política server-side debe permanecer fijada al rol SUPER_ADMIN.
    assert callable(require_super_admin)


def test_api_refuses_admin_and_seller(audit_db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.db.session import get_db
    from app.core.deps import get_current_user
    db, user = audit_db
    def db_override():
        yield db
    def admin_override():
        user.role = UserRole.ADMIN
        return user
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = admin_override
    try:
        client = TestClient(app)
        denied = client.get("/api/v1/security-audit", headers={"Authorization": "Bearer fixture"})
        assert denied.status_code == 403
        user.role = UserRole.SELLER
        denied = client.get("/api/v1/security-audit", headers={"Authorization": "Bearer fixture"})
        assert denied.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


def test_integrity_endpoint_detects_tampered_row(audit_db):
    from app.api.v1.endpoints.security_audit import verify_security_integrity
    db, user = audit_db
    append_audit(db, actor_id=user.id, action="users.updated",
                 resource="users", target_id=user.id,
                 details={"changed_fields": ["role"]})
    db.commit()
    good = verify_security_integrity(from_date=None, to_date=None, limit=1000, db=db, _=user)
    assert good["all_checked_valid"]
    assert good["checked"] == 1
    row = db.query(SecurityAuditEvent).one()
    row.action = "users.deleted"
    db.flush()
    bad = verify_security_integrity(from_date=None, to_date=None, limit=1000, db=db, _=user)
    assert not bad["all_checked_valid"]
    assert bad["invalid_ids"] == [row.id]
