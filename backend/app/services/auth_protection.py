"""Controles de autenticación respaldados por Redis.

No registra correos, IPs ni tokens en claves visibles: HMAC irreversibles.
Solo acepta X-Forwarded-For de un proxy explícitamente autorizado,
con un único valor normalizado por el proxy.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from ipaddress import ip_address, ip_network

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)
_redis_client: Redis | None = None

# Atomicidad: la ventana solo se inicia en el primer fallo, no es deslizante.
_INCR_WITH_TTL = """
for _, key in ipairs(KEYS) do
    local current = redis.call('INCR', key)
    if current == 1 then
        redis.call('EXPIRE', key, ARGV[1])
    end
end
return 1
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


def _pair_key(email: str, ip: str) -> str:
    return _key("fail-pair", email.strip().casefold() + "\\0" + ip)


def _normalized_ip(value):
    addr = ip_address(value)
    return getattr(addr, "ipv4_mapped", None) or addr


def _client_ip(request) -> str:
    # Uvicorn no debe reescribir request.client antes de esta comprobación.
    try:
        peer = _normalized_ip(request.client.host)
    except (ValueError, AttributeError, TypeError):
        return "unknown"
    if any(peer in ip_network(cidr) for cidr in settings.TRUSTED_PROXY_CIDRS):
        headers = getattr(request, "headers", None)
        if headers is None:
            return str(peer)
        values = headers.getlist("x-forwarded-for")
        if len(values) == 1 and "," not in values[0] and "%" not in values[0]:
            try:
                return str(_normalized_ip(values[0].strip()))
            except ValueError:
                pass
    return str(peer)


def _login_keys(request, email):
    ip = _client_ip(request)
    return [_pair_key(email, ip), _account_key(email), _ip_key(ip)]


def _redis_failure(operation: str, exc: RedisError) -> None:
    logger.warning("Redis no disponible para protección de autenticación: %s", operation)
    if settings.ENVIRONMENT in ("production", "staging"):
        raise HTTPException(
            status_code=503,
            detail="Servicio de autenticación temporalmente no disponible",
        ) from exc


def check_login_limit(request, email: str) -> None:
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    client = _client()
    try:
        keys = _login_keys(request, email)
        limits = (settings.AUTH_LOGIN_PAIR_MAX_FAILURES, settings.AUTH_LOGIN_ACCOUNT_MAX_FAILURES,
                  settings.AUTH_LOGIN_IP_MAX_FAILURES)
        if any(int(value or 0) >= limit for value, limit in zip(client.mget(keys), limits)):
            logger.warning("Límite de autenticación alcanzado")
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
        keys = _login_keys(request, email)
        client.eval(_INCR_WITH_TTL, len(keys), *keys, settings.AUTH_LOGIN_WINDOW_SECONDS)
    except RedisError as exc:
        _redis_failure("registrar intento fallido", exc)


def clear_login_failures(email: str, request=None) -> None:
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    try:
        # No borrar los contadores globales: un login válido no debe
        # reiniciar los límites de intentos distribuidos ni de la IP.
        if request is not None:
            _client().delete(_pair_key(email, _client_ip(request)))
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


def consume_mfa_challenge(token: str, expires_at: int) -> None:
    """Evitar el reuso de un desafío válido, incluso con otro código correcto."""
    seconds_left = max(1, int(expires_at - time.time()))
    try:
        claimed = _client().set(_key("used-mfa-challenge", token), "1", ex=seconds_left, nx=True)
    except RedisError as exc:
        _redis_failure("consumir desafío MFA", exc)
        return
    if not claimed:
        raise HTTPException(status_code=401, detail="Desafío ya utilizado; inicia sesión nuevamente")


# Ventana fija y comprobación/incremento en una única operación Redis.
_RATE_LIMIT = """
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then return 0 end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return 1
"""


def hit_rate_limit(request, bucket, limit, window, identity=None):
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return
    key = _key("rate-" + bucket, str(identity) if identity is not None else _client_ip(request))
    try:
        allowed = _client().eval(_RATE_LIMIT, 1, key, limit, window)
    except RedisError as exc:
        _redis_failure("límite de solicitudes", exc)
        return
    if not allowed:
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes; intenta más tarde",
                            headers={"Retry-After": str(window)})


def consent_ip_hash(request):
    return _key("consent-ip", _client_ip(request)).rsplit(":", 1)[-1]


def session_key(payload):
    sid, deadline = payload.get("sid"), payload.get("session_exp")
    if (not isinstance(sid, str) or len(sid) != 32 or
            any(c not in "0123456789abcdef" for c in sid) or
            type(deadline) is not int or deadline <= time.time() or
            payload["exp"] > deadline):
        raise HTTPException(status_code=401, detail="Sesión anterior o vencida; inicia sesión nuevamente")
    return _key("revoked-session", payload["sub"] + ":" + sid)


def _session_unavailable(exc):
    raise HTTPException(status_code=503, detail="No se puede comprobar la seguridad de la sesión") from exc


def check_session(payload):
    # La misma política obligatoria de protección de refresh en staging/producción.
    if not settings.AUTH_REFRESH_REPLAY_PROTECTION_ENABLED:
        return
    key = session_key(payload)
    try:
        revoked = _client().get(key)
    except RedisError as exc:
        _session_unavailable(exc)
    if revoked:
        raise HTTPException(status_code=401, detail="Sesión cerrada; inicia sesión nuevamente")


def revoke_session(payload):
    key = session_key(payload)
    seconds = max(1, int(payload["session_exp"] - time.time()) + 1)
    try:
        return bool(_client().set(key, "1", ex=seconds, nx=True))
    except RedisError as exc:
        _session_unavailable(exc)
