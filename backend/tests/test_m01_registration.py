"""Pruebas de registro y consentimiento en SQLite aislada."""
import pytest
from fastapi import HTTPException, Response
from types import SimpleNamespace
from pydantic import ValidationError
from app.api.v1.endpoints.register import RegisterRequest, register, policy_snapshot
from app.models.models import StorefrontSettings, DataConsent, User
from app.services import auth_protection as protection
from tests.test_profile_mfa import mfa_db
from tests.test_main import client, setup_db


@pytest.fixture
def registration(mfa_db):
    db, user = mfa_db
    db.add(StorefrontSettings(id=1, settings_data={"privacy_policy": "Política ficticia de pruebas"}, updated_by=user.id))
    db.commit()
    _, version = policy_snapshot(db)
    return db, dict(full_name="Cliente Prueba", email="cliente@example.org", password="PasswordSeguro123!",
                    accepts_data_policy=True, data_policy_version=version)


@pytest.mark.parametrize("change", [{"full_name":" "}, {"password":"corta"}, {"password":"ñ"*40},
    {"phone":"abc"}, {"accepts_data_policy":False}, {"accepts_data_policy":"true"}, {"data_policy_version":"vieja"}])
def test_invalid_registration(registration, change):
    _, data = registration
    with pytest.raises(ValidationError):
        RegisterRequest(**{**data, **change})


def test_registration_consent_and_duplicate(registration):
    db, data = registration
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    result = register(RegisterRequest(**data), request, Response(), db)
    assert result["access_token"]
    consent = db.query(DataConsent).one()
    assert consent.user_id == result["user_id"]
    assert consent.policy_version == data["data_policy_version"]
    assert consent.policy_text == "Política ficticia de pruebas"
    assert len(consent.ip_hash) == 64
    duplicate = register(RegisterRequest(**data), request, Response(), db)
    assert duplicate == {"message": result["message"]}
    assert db.query(DataConsent).count() == 1


def test_stale_policy(registration):
    db, data = registration
    row = db.get(StorefrontSettings, 1)
    row.settings_data = {"privacy_policy":"Nueva política"}
    db.commit()
    with pytest.raises(HTTPException) as exc:
        register(RegisterRequest(**data), SimpleNamespace(), Response(), db)
    assert exc.value.status_code == 409
    assert db.query(DataConsent).count() == 0


def test_atomic_limit(monkeypatch):
    class RedisFake:
        count = 0
        def eval(self, script, keys, key, limit, window):
            assert keys == 1 and window == 3600 and limit == 5
            assert "127.0.0.1" not in key
            if self.count >= limit:
                return 0
            self.count += 1
            return 1
    fake = RedisFake()
    monkeypatch.setattr(protection, "_client", lambda: fake)
    monkeypatch.setattr(protection.settings, "AUTH_RATE_LIMIT_ENABLED", True)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    for _ in range(5):
        protection.hit_rate_limit(request, "register", 5, 3600)
    with pytest.raises(HTTPException) as exc:
        protection.hit_rate_limit(request, "register", 5, 3600)
    assert exc.value.status_code == 429


def test_http_rejects_missing_consent(client):
    response = client.post("/api/v1/auth/register", json={
        "full_name": "Cliente Prueba", "email": "sin-consentimiento@example.org",
        "password": "PasswordSeguro123!"})
    assert response.status_code == 422
    assert {"accepts_data_policy", "data_policy_version"} <= {
        item["loc"][-1] for item in response.json()["detail"]}
