"""A-05: política obligatoria con sesiones aisladas y MFA simulado."""
from types import SimpleNamespace
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
import pytest
from app.core.config import settings, Settings
from app.core.deps import get_current_user, get_mfa_enrollment_user, get_optional_user
from app.core.security import decode_token
from app.api.v1.endpoints import auth
from app.schemas.schemas import LoginRequest, RefreshRequest
from app.models.models import UserRole
from tests.test_profile_mfa import mfa_db


def creds(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.SUPER_ADMIN])
def test_enrollment_only_then_mfa(mfa_db, monkeypatch, role):
    db, user = mfa_db
    user.role = role
    db.commit()
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    data = LoginRequest(email=user.email, password="RootSecurePassword123!")
    legacy = auth.login(data, request, db)
    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", True)
    restricted = auth.login(data, request, db)
    assert restricted.mfa_setup_required and not restricted.refresh_token
    assert decode_token(restricted.access_token)["type"] == "mfa_enrollment"
    for token in (legacy.access_token, restricted.access_token):
        with pytest.raises(HTTPException) as exc:
            get_current_user(creds(token), db)
        assert exc.value.status_code == 403
        assert exc.value.headers["X-MFA-Setup-Required"] == "true"
        assert get_optional_user(creds(token), db) is None
    with pytest.raises(HTTPException) as exc:
        auth.refresh_token(RefreshRequest(refresh_token=legacy.refresh_token), db)
    assert exc.value.status_code == 403
    enrollment_user = get_mfa_enrollment_user(creds(restricted.access_token), db)
    auth.setup_mfa(auth.MFAStart(current_password=data.password), request, db, enrollment_user)
    monkeypatch.setattr(auth, "match_totp_step", lambda secret, code: 100 if code == "123456" else None)
    activated = auth.confirm_mfa(auth.MFACode(code="123456"), request, db, enrollment_user)
    with pytest.raises(HTTPException):
        get_mfa_enrollment_user(creds(restricted.access_token), db)
    challenge = auth.login(data, request, db)
    assert challenge["mfa_required"]
    verified = auth.verify_mfa_challenge(auth.MFAChallenge(challenge_token=challenge["challenge_token"],
                        code=activated["recovery_codes"][0]), request, db)
    assert get_current_user(creds(verified.access_token), db).id == user.id
    with pytest.raises(HTTPException) as exc:
        auth.disable_mfa(auth.MFASensitiveAction(current_password=data.password,
                         code=activated["recovery_codes"][1]), request, db, user)
    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", [UserRole.CUSTOMER, UserRole.SELLER])
def test_roles_no_administrativos(mfa_db, monkeypatch, role):
    db, user = mfa_db
    user.role = role
    db.commit()
    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", True)
    data = auth.login(LoginRequest(email=user.email, password="RootSecurePassword123!"),
                      SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")), db)
    assert not data.mfa_setup_required
    assert get_current_user(creds(data.access_token), db).id == user.id


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_no_opt_out_produccion(environment):
    from pydantic import ValidationError
    with pytest.raises(ValidationError, match="MFA administrativo obligatorio"):
        Settings(ENVIRONMENT=environment, ADMIN_MFA_REQUIRED=False)
