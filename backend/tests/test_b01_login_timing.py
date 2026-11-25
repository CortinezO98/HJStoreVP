"""B-01: verificar trabajo criptográfico y rechazo uniforme, sin umbrales de tiempo frágiles."""
import pytest
from app.api.v1.endpoints import auth
from app.core import security
from app.models.models import User
from tests.test_main import client, setup_db, TestingSession


def test_dummy_hash_is_argon2_and_reused(monkeypatch):
    seen = []
    original = security.verify_password
    def spy(password, hashed):
        seen.append(hashed)
        return original(password, hashed)
    monkeypatch.setattr(security, "verify_password", spy)
    assert security.verify_dummy_password("incorrecta") is None
    assert security.verify_dummy_password("otra") is None
    assert len(seen) == 2 and seen[0] == seen[1]
    assert seen[0].startswith("$argon2id$v=19$m=65536,t=3,p=4$")


@pytest.mark.parametrize("state", ["missing", "inactive", "deleted"])
def test_unavailable_account_uses_dummy_and_never_authenticates(client, monkeypatch, state):
    email = "missing@example.org"
    if state != "missing":
        email = "test@hjstorevp.com"
        with TestingSession() as db:
            user = db.query(User).filter_by(email=email).one()
            if state == "inactive":
                user.active = False
            else:
                user.deleted = True
            db.commit()
    calls = []
    def dummy(password):
        calls.append(password)
        return True  # Incluso un resultado positivo simulado debe ignorarse.
    monkeypatch.setattr(auth, "verify_dummy_password", dummy)
    result = client.post("/api/v1/auth/login", json={"email": email, "password": "Test1234!"})
    assert result.status_code == 401
    assert result.json() == {"detail": "Correo o contraseña incorrectos"}
    assert calls == ["Test1234!"]


def test_existing_wrong_password_uses_real_verification(client, monkeypatch):
    calls = []
    original = auth.verify_and_update_password
    def spy(password, hashed):
        calls.append(hashed)
        return original(password, hashed)
    monkeypatch.setattr(auth, "verify_and_update_password", spy)
    result = client.post("/api/v1/auth/login", json={"email":"test@hjstorevp.com","password":"incorrecta"})
    assert result.status_code == 401
    assert result.json() == {"detail": "Correo o contraseña incorrectos"}
    assert len(calls) == 1 and calls[0].startswith("$argon2id$")


def test_rate_limit_precedes_dummy_work(client, monkeypatch):
    from fastapi import HTTPException
    def blocked(*args):
        raise HTTPException(status_code=429, detail="Límite")
    def unexpected(*args):
        pytest.fail("No debe ejecutar hashing después del bloqueo")
    monkeypatch.setattr(auth, "check_login_limit", blocked)
    monkeypatch.setattr(auth, "verify_dummy_password", unexpected)
    assert client.post("/api/v1/auth/login", json={"email":"missing@example.org","password":"incorrecta"}).status_code == 429
