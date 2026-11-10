"""Controles de autenticación respaldados por Redis.

No registra correos, IPs ni tokens en claves visibles: HMAC irreversibles.
No confía en X-Forwarded-For: el proxy deberá normalizar la IP del cliente
solo tras configurar explícitamente sus redes de confianza.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)
_redis_client: Redis | None = None

# Atomicidad: la ventana solo se inicia en el primer fallo, no es deslizante.
_INCR_WITH_TTL = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


def _client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
            retry_on_timeout=False,
            decode_responses=True,
        )
    return _redis_client


def _key(purpose: str, value: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"hjstore:auth:v1:{purpose}:{digest}"


def _ip_key(ip: str) -> str:
    return _key("fail-ip", ip)


def _account_key(email: str) -> str:
    return _key("fail-account", email.strip().casefold())


def _client_ip(request) -> str:
    # No aceptar X-Forwarded-For sin una lista de proxies de confianza.
    return request.client.host if request.client else "unknown"


def _redis_failure(operation: str, exc: RedisError) -> None:
    logger.warning("Redis no disponible para protección de autenticación: %s", operation)
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(
            status_code=503,
            detail="Servicio de autenticación temporalmente no disponible",
        ) from exc


def check_login_limit(request, email: str) -> None:
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    client = _client()
    try:
        keys = [_account_key(email), _ip_key(_client_ip(request))]
        account_attempts, ip_attempts = client.mget(keys)
        if ((int(account_attempts or 0) >= settings.AUTH_LOGIN_ACCOUNT_MAX_FAILURES)
                or (int(ip_attempts or 0) >= settings.AUTH_LOGIN_IP_MAX_FAILURES)):
            raise HTTPException(
                status_code=429,
                detail="Demasiados intentos; intenta nuevamente más tarde",
                headers={"Retry-After": str(settings.AUTH_LOGIN_WINDOW_SECONDS)},
            )
    except RedisError as exc:
        _redis_failure("verificar límite de login", exc)


def note_login_failure(request, email: str) -> None:
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    client = _client()
    try:
        client.eval(
            _INCR_WITH_TTL, 1, _account_key(email),
            settings.AUTH_LOGIN_WINDOW_SECONDS,
        )
        client.eval(
            _INCR_WITH_TTL, 1, _ip_key(_client_ip(request)),
            settings.AUTH_LOGIN_WINDOW_SECONDS,
        )
    except RedisError as exc:
        _redis_failure("registrar intento fallido", exc)


def clear_login_failures(email: str) -> None:
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    try:
        _client().delete(_account_key(email))
    except RedisError as exc:
        _redis_failure("limpiar intentos tras login", exc)


def consume_refresh_token(token: str, expires_at: int) -> None:
    """Un refresh token válido se canjea una sola vez, de forma atómica.

    Tokens emitidos antes de esta versión siguen siendo compatibles.
    El tiempo de retención no puede superar el vencimiento del JWT.
    """
    if not settings.AUTH_REFRESH_REPLAY_PROTECTION_ENABLED:
        return
    seconds_left = max(1, int(expires_at - time.time()))
    try:
        claimed = _client().set(
            _key("used-refresh", token),
            "1", ex=seconds_left, nx=True,
        )
    except RedisError as exc:
        _redis_failure("consumir refresh token", exc)
        return
    if not claimed:
        raise HTTPException(
            status_code=401,
            detail="Refresh token ya utilizado; inicia sesión nuevamente",
        )
