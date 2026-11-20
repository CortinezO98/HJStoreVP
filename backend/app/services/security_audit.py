"""Auditoría tipada. Nunca se almacenan payloads HTTP, contraseñas, tokens ni códigos.

Las entradas de mutaciones se insertan en la misma transacción de negocio.
La firma HMAC detecta cambios posteriores sin conocer SECRET_KEY. No sustituye
almacenamiento WORM, controles DBA ni exportación a almacenamiento independiente.
"""
from datetime import datetime
import hashlib
import hmac
import json

from app.core.config import settings
from app.models.models import SecurityAuditEvent

# Claves permitidas: NO añadir secretos, PII ni contenido de las solicitudes.
_ALLOWED_DETAIL_KEYS = frozenset({
    "old_role", "new_role", "old_active", "new_active", "changed_fields",
    "mfa_enabled", "account_kind", "reason", "location_id",
    "old_status", "new_status", "price_changes", "origin",
})
_ALLOWED_ACTIONS = frozenset({
    "auth.login.success", "auth.login.failure", "auth.mfa.success",
    "auth.mfa.failure", "auth.password.changed", "auth.email.changed",
    "auth.profile.changed", "auth.mfa.enabled", "auth.mfa.disabled",
    "auth.mfa.recovery_rotated", "auth.sessions.revoked",
    "users.created", "users.updated", "users.status_changed",
    "users.password_reset", "users.deleted",
    "catalog.prices.changed", "orders.status.changed",
})


def identity_fingerprint(email: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), ("audit-id:" + email.strip().casefold()).encode(), hashlib.sha256).hexdigest()[:24]


def _serialized(event) -> bytes:
    record = {
        "created_at": event.created_at.isoformat(timespec="microseconds"),
        "actor_id": event.actor_id, "action": event.action,
        "resource": event.resource, "target_id": event.target_id,
        "outcome": event.outcome, "details": event.details,
    }
    return json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def signature(event) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), b"hjstore-audit-v1:" + _serialized(event), hashlib.sha256).hexdigest()


def is_signature_valid(event) -> bool:
    return hmac.compare_digest(signature(event), event.signature)


def append_audit(db, *, action: str, actor_id: int | None = None,
                 resource: str = "auth", target_id: str | int | None = None,
                 outcome: str = "success", details: dict | None = None):
    if action not in _ALLOWED_ACTIONS:
        raise ValueError("Acción de auditoría no registrada")
    if outcome not in ("success", "failure"):
        raise ValueError("Resultado de auditoría inválido")
    sanitized = {}
    for key, value in (details or {}).items():
        if key not in _ALLOWED_DETAIL_KEYS:
            raise ValueError("Campo de auditoría no permitido")
        if key == "changed_fields":
            if not isinstance(value, list) or len(value) > 20 or any(
                not isinstance(item, str) or item not in
                ("full_name", "phone", "email", "role", "active", "location_id", "password")
                for item in value
            ):
                raise ValueError("Lista de campos inválida")
        elif key == "price_changes":
            if not isinstance(value, dict) or not value or len(value) > 3:
                raise ValueError("Cambios de precio inválidos")
            if any(field not in ("sale_price", "cost_price", "margin_pct")
                   or not isinstance(change, dict)
                   or set(change) != {"before", "after"}
                   or any(not isinstance(amount, str) or len(amount) > 32
                          for amount in change.values())
                   for field, change in value.items()):
                raise ValueError("Cambio monetario no permitido")
        elif key in ("old_status", "new_status"):
            if not isinstance(value, str) or not 1 <= len(value) <= 32:
                raise ValueError("Estado inválido")
        elif key == "origin":
            if value not in ("authenticated", "system"):
                raise ValueError("Origen inválido")
        elif key == "reason":
            if value not in ("invalid_credentials", "invalid_factor"):
                raise ValueError("Motivo no permitido")
        elif not (value is None or isinstance(value, (str, int, bool))):
            raise ValueError("Tipo de metadato no permitido")
        sanitized[key] = value
    row = SecurityAuditEvent(
        # MySQL DATETIME sin fsp descarta microsegundos; firmar exactamente el valor persistido.
        created_at=datetime.utcnow().replace(microsecond=0), actor_id=actor_id,
        action=action, resource=resource, target_id=str(target_id) if target_id is not None else None,
        outcome=outcome, details=sanitized, signature="",
    )
    row.signature = signature(row)
    db.add(row)
    return row
