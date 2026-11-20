"""Read-only evidence snapshot for independent, protected archival.

Usage (inside backend container, with a mounted private output directory):
    python scripts/export_audit_snapshot.py /secure-exports

Never exports SECRET_KEY, auth tokens or raw requests. Does NOT delete anything.
Refuses to overwrite existing snapshots and refuses incomplete large exports.
"""
import hashlib
import hmac
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import SecurityAuditEvent
from app.services.security_audit import is_signature_valid

MAX_EVENTS = 50_000


def _dump(value) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def export_snapshot(directory: Path) -> dict:
    # Caller is responsible for mounting this path on external protected storage.
    if not directory.is_dir():
        raise ValueError("El directorio de destino debe existir y estar protegido")
    with SessionLocal() as db:
        total = db.query(SecurityAuditEvent.id).count()
        if total > MAX_EVENTS:
            raise ValueError("Excede el límite de 50000 eventos. No exportar un historial incompleto.")
        rows = db.query(SecurityAuditEvent).order_by(SecurityAuditEvent.id.asc()).all()
        records = []
        invalid = 0
        for row in rows:
            valid = is_signature_valid(row)
            invalid += int(not valid)
            records.append({
                "id": row.id, "created_at_utc": row.created_at.isoformat(),
                "actor_id": row.actor_id, "action": row.action, "resource": row.resource,
                "target_id": row.target_id, "outcome": row.outcome,
                "details": row.details, "signature": row.signature,
                "signature_valid": valid,
            })
        if invalid:
            raise RuntimeError(f"Hay {invalid} firmas inválidas; no se genera archivo certificado")
        payload = b"".join(_dump(row) for row in records)
        digest = hashlib.sha256(payload).hexdigest()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        name = f"hjstore-audit-{stamp}"
        manifest = {
            "format": "hjstore-audit-v1",
            "exported_at_utc": datetime.now(timezone.utc).isoformat(),
            "count": len(records), "first_id": records[0]["id"] if records else None,
            "last_id": records[-1]["id"] if records else None,
            "sha256": digest, "snapshot_file": name + ".jsonl",
            "warning": "La verificación de filas existentes no prueba ausencia de eliminaciones previas.",
        }
        # Signar el manifiesto, NO exportar la clave; permitir verificación posterior controlada.
        manifest["hmac_sha256"] = hmac.new(
            settings.SECRET_KEY.encode(),
            _dump(manifest), hashlib.sha256
        ).hexdigest()
    # Crear archivos privados sin sobrescribir; ante error, nunca eliminar historial SQL.
    for suffix, data in ((".jsonl", payload), (".manifest.json", _dump(manifest))):
        target = directory / (name + suffix)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        except BaseException:
            target.unlink(missing_ok=True)
            raise
    return {"snapshot": name, "count": manifest["count"], "sha256": digest}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python scripts/export_audit_snapshot.py /directorio/privado")
    print(json.dumps(export_snapshot(Path(sys.argv[1]))))
