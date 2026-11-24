"""Revocación individual con Redis simulado y SQLite aislada."""
import pytest
from redis.exceptions import RedisError
from app.services import auth_protection as protection
from app.core.security import decode_token
from tests.test_main import client, setup_db


@pytest.fixture
def redis_sessions(monkeypatch):
    class Fake:
        def __init__(self):
            self.data = {}
            self.ttls = {}
        def get(self, key):
            return self.data.get(key)
        def set(self, key, value, ex=None, nx=False):
            if nx and key in self.data:
                return False
            self.data[key] = value
            self.ttls[key] = ex
            return True
    fake = Fake()
    monkeypatch.setattr(protection, "_client", lambda: fake)
    monkeypatch.setattr(protection.settings, "AUTH_REFRESH_REPLAY_PROTECTION_ENABLED", True)
    return fake


def login(client):
    response = client.post("/api/v1/auth/login", json={"email":"test@hjstorevp.com","password":"Test1234!"})
    assert response.status_code == 200
    return response.json()


def me(client, token):
    return client.get("/api/v1/auth/me", headers={"Authorization":"Bearer "+token})


def test_independent_sessions_and_rotation(client, redis_sessions):
    a, b = login(client), login(client)
    p = decode_token(a["access_token"])
    assert p["sid"] == decode_token(a["refresh_token"])["sid"]
    assert p["sid"] != decode_token(b["access_token"])["sid"]
    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token":a["refresh_token"]})
    assert rotated.status_code == 200
    new = rotated.json()
    assert decode_token(new["access_token"])["sid"] == p["sid"]
    assert decode_token(new["refresh_token"])["session_exp"] == p["session_exp"]
    assert client.post("/api/v1/auth/logout", json={"token":a["refresh_token"]}).status_code == 204
    assert client.post("/api/v1/auth/logout", json={"token":a["refresh_token"]}).status_code == 204
    assert me(client, a["access_token"]).status_code == 401
    assert me(client, new["access_token"]).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token":new["refresh_token"]}).status_code == 401
    assert me(client, b["access_token"]).status_code == 200
    assert all(p["sid"] not in k for k in redis_sessions.data)
    assert all(v > 0 for v in redis_sessions.ttls.values())


def test_logout_using_access(client, redis_sessions):
    a = login(client)
    assert client.post("/api/v1/auth/logout", json={"token":a["access_token"]}).status_code == 204
    assert client.post("/api/v1/auth/refresh", json={"refresh_token":a["refresh_token"]}).status_code == 401


def test_invalid_logout(client, redis_sessions):
    assert client.post("/api/v1/auth/logout", json={"token":"invalid"}).status_code == 401
    assert not redis_sessions.data


def test_redis_failure_blocks_access(client, redis_sessions, monkeypatch):
    a = login(client)
    def broken(*args, **kwargs):
        raise RedisError("offline")
    monkeypatch.setattr(redis_sessions, "get", broken)
    assert me(client, a["access_token"]).status_code == 503
    assert client.post("/api/v1/auth/refresh", json={"refresh_token":a["refresh_token"]}).status_code == 503
    monkeypatch.setattr(redis_sessions, "set", broken)
    assert client.post("/api/v1/auth/logout", json={"token":a["refresh_token"]}).status_code == 503


def test_legacy_token_rejected(client, redis_sessions):
    from app.core.security import create_access_token
    a = login(client)
    p = decode_token(a["access_token"])
    legacy = create_access_token(p["sub"], extra={"ver":p["ver"],"role":p["role"]})
    assert me(client, legacy).status_code == 401
