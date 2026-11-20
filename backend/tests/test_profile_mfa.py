"""Pruebas aisladas de perfil y MFA; SQLite efímero, sin tocar MariaDB."""
from datetime import datetime, timedelta
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from jose import jwt

from app.core.config import settings
from app.db.session import Base
from app.core.security import hash_password, credential_version, decode_token
from app.models.models import User, UserRole, UserMFASettings
from app.api.v1.endpoints.auth import (
    MFAStart, MFACode, MFAChallenge, ProfilePasswordChange,
    change_my_password, setup_mfa, confirm_mfa, verify_mfa_challenge,
    login, _verify_mfa_code,
)
from app.schemas.schemas import LoginRequest
from app.services.mfa import match_totp_step, totp_code, new_secret, generate_recovery_codes, recovery_hash


@pytest.fixture
def mfa_db(monkeypatch):
    # Prueba las rutas sin dependencias Redis externas.
    import app.api.v1.endpoints.auth as auth
    monkeypatch.setattr(auth, "check_login_limit", lambda *args: None)
    monkeypatch.setattr(auth, "note_login_failure", lambda *args: None)
    monkeypatch.setattr(auth, "clear_login_failures", lambda *args: None)
    monkeypatch.setattr(auth, "consume_mfa_challenge", lambda *args: None)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="root@example.org", full_name="Root",
                    role=UserRole.SUPER_ADMIN, active=True,
                    hashed_password=hash_password("RootSecurePassword123!"))
        db.add(user)
        db.commit()
        db.refresh(user)
        yield db, user
    engine.dispose()


def test_totp_rejects_invalid_inputs_and_accepts_current_step():
    secret = new_secret()
    now = 1800000000
    code = totp_code(secret, now // 30)
    assert match_totp_step(secret, code, now) == now // 30
    assert match_totp_step(secret, "nototp", now) is None
    assert match_totp_step(secret, "１２３４５６", now) is None


def test_recovery_code_is_one_time():
    codes, hashes = generate_recovery_codes()
    row = UserMFASettings(enabled=True, recovery_hashes=hashes, secret_ciphertext=None)
    assert _verify_mfa_code(row, codes[0]) is True
    assert len(row.recovery_hashes) == 9
    assert _verify_mfa_code(row, codes[0]) is False
    assert recovery_hash(codes[0]) not in row.recovery_hashes


def test_mfa_enrollment_creates_challenge_and_invalidates_legacy_tokens(mfa_db, monkeypatch):
    import app.api.v1.endpoints.auth as auth
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    old_token = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    assert old_token.access_token
    prepared = setup_mfa(MFAStart(current_password="RootSecurePassword123!"), request, db, user)
    monkeypatch.setattr(auth, "match_totp_step", lambda secret, code: 100 if code == "123456" else None)
    activated = confirm_mfa(MFACode(code="123456"), request, db, user)
    assert len(activated["recovery_codes"]) == 10
    mfa = db.query(UserMFASettings).filter_by(user_id=user.id).one()
    assert mfa.enabled and mfa.version == 1
    assert decode_token(old_token.access_token).get("mfa_v") is None
    pending = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    assert pending["mfa_required"] is True
    assert decode_token(pending["challenge_token"])["type"] == "mfa_pending"
    assert "access_token" not in pending
    # Verificación de un código de recuperación emite tokens con la versión MFA.
    tokens = verify_mfa_challenge(MFAChallenge(challenge_token=pending["challenge_token"],
                                  code=activated["recovery_codes"][0]), request, db)
    assert decode_token(tokens.access_token)["mfa_v"] == 1
    assert decode_token(tokens.access_token)["sec_v"] == 1
    with pytest.raises(HTTPException) as exc:
        verify_mfa_challenge(MFAChallenge(challenge_token=pending["challenge_token"],
                             code=activated["recovery_codes"][0]), request, db)
    assert exc.value.status_code == 401


def test_password_change_revokes_previous_version(mfa_db):
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    original = credential_version(user.hashed_password)
    change_my_password(ProfilePasswordChange(current_password="RootSecurePassword123!",
                      new_password="AnotherSecurePassword123!"), request, db, user)
    assert credential_version(user.hashed_password) != original
    with pytest.raises(HTTPException) as exc:
        change_my_password(ProfilePasswordChange(current_password="RootSecurePassword123!",
                          new_password="YetAnotherPassword123!"), request, db, user)
    assert exc.value.status_code == 403


def test_pending_challenge_is_not_access_token():
    payload = {"sub": "1", "type": "mfa_pending", "exp": datetime.utcnow() + timedelta(minutes=5)}
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert decode_token(token)["type"] != "access"


def test_sessions_revoked_by_version_without_disabling_account(mfa_db):
    import app.api.v1.endpoints.auth as auth
    from app.core.deps import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    original = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    assert get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=original.access_token), db).id == user.id
    auth.revoke_my_sessions(auth.MFASensitiveAction(current_password="RootSecurePassword123!"), request, db, user)
    with pytest.raises(HTTPException) as exc:
        get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=original.access_token), db)
    assert exc.value.status_code == 401
    renewed = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    assert decode_token(renewed.access_token)["sec_v"] == 1


def test_challenge_token_cannot_be_used_as_access_token(mfa_db, monkeypatch):
    from app.core.deps import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    setup_mfa(MFAStart(current_password="RootSecurePassword123!"), request, db, user)
    import app.api.v1.endpoints.auth as auth
    monkeypatch.setattr(auth, "match_totp_step", lambda secret, code: 100 if code == "123456" else None)
    confirm_mfa(MFACode(code="123456"), request, db, user)
    challenge = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)["challenge_token"]
    with pytest.raises(HTTPException) as exc:
        get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=challenge), db)
    assert exc.value.status_code == 401


def test_refresh_from_before_mfa_activation_is_rejected(mfa_db, monkeypatch):
    import app.api.v1.endpoints.auth as auth
    from app.schemas.schemas import RefreshRequest
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    original = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    setup_mfa(MFAStart(current_password="RootSecurePassword123!"), request, db, user)
    monkeypatch.setattr(auth, "match_totp_step", lambda secret, code: 100 if code == "123456" else None)
    confirm_mfa(MFACode(code="123456"), request, db, user)
    with pytest.raises(HTTPException) as exc:
        auth.refresh_token(RefreshRequest(refresh_token=original.refresh_token), db)
    assert exc.value.status_code == 401


def test_changing_email_revokes_existing_sessions(mfa_db):
    import app.api.v1.endpoints.auth as auth
    from app.core.deps import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    original = login(LoginRequest(email=user.email, password="RootSecurePassword123!"), request, db)
    updated = auth.change_my_email(auth.ProfileEmailChange(
        email="other@example.org", current_password="RootSecurePassword123!"), request, db, user)
    assert updated.email == "other@example.org"
    with pytest.raises(HTTPException) as exc:
        get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=original.access_token), db)
    assert exc.value.status_code == 401


def test_disabled_mfa_requires_reauthentication_and_revokes_tokens(mfa_db, monkeypatch):
    import app.api.v1.endpoints.auth as auth
    db, user = mfa_db
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    setup_mfa(MFAStart(current_password="RootSecurePassword123!"), request, db, user)
    monkeypatch.setattr(auth, "match_totp_step", lambda secret, code: 100 if code == "123456" else None)
    activated = confirm_mfa(MFACode(code="123456"), request, db, user)
    recovery_code = activated["recovery_codes"][0]
    record = db.query(UserMFASettings).filter_by(user_id=user.id).one()
    original_version = record.version
    with pytest.raises(HTTPException) as exc:
        auth.disable_mfa(auth.MFASensitiveAction(current_password="wrong", code=recovery_code), request, db, user)
    assert exc.value.status_code == 403
    auth.disable_mfa(auth.MFASensitiveAction(current_password="RootSecurePassword123!",
                                            code=recovery_code), request, db, user)
    assert record.enabled is False
    assert record.secret_ciphertext is None
    assert record.recovery_hashes == []
    assert record.version == original_version + 1
