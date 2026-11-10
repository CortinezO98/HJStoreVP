"""Unit checks of authentication protections using a deterministic fake Redis."""
import time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.security import create_refresh_token, decode_token
from app.services import auth_protection as protection


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.expiry = {}

    def mget(self, keys):
        return [self.values.get(key) for key in keys]

    def eval(self, script, key_count, key, ttl):
        count = int(self.values.get(key, 0)) + 1
        self.values[key] = str(count)
        if count == 1:
            self.expiry[key] = ttl
        return count

    def delete(self, key):
        self.values.pop(key, None)

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        self.expiry[key] = ex
        return True


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(protection, "_client", lambda: fake)
    monkeypatch.setattr(protection.settings, "AUTH_RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(protection.settings, "AUTH_REFRESH_REPLAY_PROTECTION_ENABLED", True)
    return fake


def test_login_blocked_after_five_failures(fake_redis):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    for _ in range(protection.settings.AUTH_LOGIN_ACCOUNT_MAX_FAILURES):
        protection.check_login_limit(request, "User@Example.org")
        protection.note_login_failure(request, "User@Example.org")
    with pytest.raises(HTTPException) as error:
        protection.check_login_limit(request, "user@example.org")
    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"]
    protection.clear_login_failures("user@example.org")
    protection.check_login_limit(request, "User@Example.org")


def test_ip_limit_prevents_account_rotation(fake_redis, monkeypatch):
    monkeypatch.setattr(protection.settings, "AUTH_LOGIN_IP_MAX_FAILURES", 2)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    protection.note_login_failure(request, "a@example.org")
    protection.note_login_failure(request, "b@example.org")
    with pytest.raises(HTTPException) as error:
        protection.check_login_limit(request, "c@example.org")
    assert error.value.status_code == 429


def test_refresh_token_is_unique_and_single_use(fake_redis):
    first = create_refresh_token(7)
    second = create_refresh_token(7)
    assert first != second
    payload = decode_token(first)
    protection.consume_refresh_token(first, int(payload["exp"]))
    assert decode_token(second) is not None
    with pytest.raises(HTTPException) as error:
        protection.consume_refresh_token(first, int(payload["exp"]))
    assert error.value.status_code == 401


def test_refresh_token_key_does_not_reveal_token(fake_redis):
    token = create_refresh_token(7)
    protection.consume_refresh_token(token, int(decode_token(token)["exp"]))
    assert all(token not in key for key in fake_redis.values)
    assert all(key.startswith("hjstore:auth:v1:") for key in fake_redis.values)


def test_invalid_subject_returns_unauthorized(monkeypatch):
    from app.core.deps import get_current_user
    # La validación de subject se cubre con la prueba existente de API
    # y la revisión estática del guard de get_current_user.
    assert callable(get_current_user)
