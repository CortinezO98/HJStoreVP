"""A-03: límites independientes e IP confiable, sin Redis real."""
from types import SimpleNamespace
import pytest
from starlette.datastructures import Headers
from fastapi import HTTPException
from redis.exceptions import ConnectionError
from app.services import auth_protection as p
from tests.test_auth_protection import fake_redis


def req(ip, *forwarded):
    return SimpleNamespace(client=SimpleNamespace(host=ip),
                           headers=Headers(raw=[(b"x-forwarded-for", v.encode()) for v in forwarded]))


@pytest.mark.parametrize("peer,forwarded,expected", [
    ("203.0.113.1", ["198.51.100.2"], "203.0.113.1"),
    ("172.30.83.10", ["198.51.100.2"], "198.51.100.2"),
    ("172.30.83.10", ["198.51.100.2, 203.0.113.1"], "172.30.83.10"),
    ("172.30.83.10", ["198.51.100.2", "203.0.113.1"], "172.30.83.10"),
    ("172.30.83.10", ["invalid"], "172.30.83.10"),
    ("::ffff:198.51.100.2", [], "198.51.100.2"),
])
def test_ip(peer, forwarded, expected, monkeypatch):
    monkeypatch.setattr(p.settings, "TRUSTED_PROXY_CIDRS", ["172.30.83.10/32"])
    assert p._client_ip(req(peer, *forwarded)) == expected


def test_limite_global_cuenta(fake_redis, monkeypatch):
    monkeypatch.setattr(p.settings, "AUTH_LOGIN_ACCOUNT_MAX_FAILURES", 50)
    for i in range(50):
        request = req(f"198.51.100.{i+1}")
        p.check_login_limit(request, "user@example.org")
        p.note_login_failure(request, "user@example.org")
    with pytest.raises(HTTPException) as exc:
        p.check_login_limit(req("203.0.113.1"), "USER@example.org")
    assert exc.value.status_code == 429


def test_limite_par_y_limpieza(fake_redis):
    request = req("198.51.100.2")
    for _ in range(5):
        p.note_login_failure(request, "a@example.org")
    with pytest.raises(HTTPException) as exc:
        p.check_login_limit(request, "a@example.org")
    assert exc.value.status_code == 429
    p.check_login_limit(req("198.51.100.3"), "a@example.org")
    p.clear_login_failures("a@example.org", request)
    p.check_login_limit(request, "a@example.org")
    assert int(fake_redis.values[p._account_key("a@example.org")]) == 5
    assert int(fake_redis.values[p._ip_key("198.51.100.2")]) == 5


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_redis_fail_closed(fake_redis, monkeypatch, environment):
    monkeypatch.setattr(p.settings, "ENVIRONMENT", environment)
    def unavailable(*args):
        raise ConnectionError("simulado")
    monkeypatch.setattr(fake_redis, "mget", unavailable)
    with pytest.raises(HTTPException) as exc:
        p.check_login_limit(req("198.51.100.1"), "a@example.org")
    assert exc.value.status_code == 503


def test_configuracion_proxy_vacia():
    from app.core.config import Settings
    assert Settings(ENVIRONMENT="test", TRUSTED_PROXY_CIDRS=[]).TRUSTED_PROXY_CIDRS == []


def test_configuracion_proxy_individual():
    from app.core.config import Settings
    config = Settings(ENVIRONMENT="test", TRUSTED_PROXY_CIDRS=["172.30.83.10/32", "2001:db8::1/128"])
    assert config.TRUSTED_PROXY_CIDRS == ["172.30.83.10/32", "2001:db8::1/128"]


@pytest.mark.parametrize("cidr", ["0.0.0.0/0", "::/0", "172.30.83.0/24", "invalido"])
def test_configuracion_rechaza_proxy_amplio_o_invalido(cidr):
    from app.core.config import Settings
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="test", TRUSTED_PROXY_CIDRS=[cidr])


@pytest.mark.parametrize("field", ["AUTH_LOGIN_PAIR_MAX_FAILURES", "AUTH_LOGIN_ACCOUNT_MAX_FAILURES",
                                    "AUTH_LOGIN_IP_MAX_FAILURES", "AUTH_LOGIN_WINDOW_SECONDS"])
def test_configuracion_rechaza_limites_no_positivos(field):
    from app.core.config import Settings
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="test", **{field: 0})
