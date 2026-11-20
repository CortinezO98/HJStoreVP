"""Verify an externally archived HJStore audit snapshot and signed manifest.

Requires the same SECRET_KEY that signed the original export. Read-only.
Usage: python scripts/verify_audit_snapshot.py /secure-exports/hjstore-audit-....manifest.json
"""
import hashlib
import hmac
import json
import sys
from pathlib import Path

from app.core.config import settings
from app.services.security_audit import _serialized


def canonical(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def verify(manifest_path: Path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format") != "hjstore-audit-v1":
        raise ValueError("Formato de evidencia no soportado")
    signed = dict(manifest)
    expected = signed.pop("hmac_sha256", None)
    actual = hmac.new(settings.SECRET_KEY.encode(), canonical(signed), hashlib.sha256).hexdigest()
    if not expected or not hmac.compare_digest(expected, actual):
        raise ValueError("El manifiesto no tiene una firma válida")
    filename = manifest["snapshot_file"]
    if Path(filename).name != filename or not filename.endswith(".jsonl"):
        raise ValueError("Nombre de evidencia inválido")
    payload = (manifest_path.parent / filename).read_bytes()
    if hashlib.sha256(payload).hexdigest() != manifest["sha256"]:
        raise ValueError("El archivo exportado no coincide con el SHA256 del manifiesto")
    rows = [json.loads(line) for line in payload.splitlines()]
    if len(rows) != manifest["count"]:
        raise ValueError("Conteo de eventos incompatible")
    if (rows[0]["id"] if rows else None) != manifest["first_id"]:
        raise ValueError("ID inicial incompatible")
    if (rows[-1]["id"] if rows else None) != manifest["last_id"]:
        raise ValueError("ID final incompatible")
    for record in rows:
        # Verifica cada fila firmada con el formato exacto del ledger.
        from types import SimpleNamespace
        from datetime import datetime
        event = SimpleNamespace(
            created_at=datetime.fromisoformat(record["created_at_utc"]),
            actor_id=record["actor_id"], action=record["action"],
            resource=record["resource"], target_id=record["target_id"],
            outcome=record["outcome"], details=record["details"],
        )
        digest = hmac.new(settings.SECRET_KEY.encode(),
                          b"hjstore-audit-v1:" + _serialized(event), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(digest, record["signature"]):
            raise ValueError("Firma inválida del evento " + str(record["id"]))
    return {"verified": True, "events": len(rows), "sha256": manifest["sha256"]}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python scripts/verify_audit_snapshot.py archivo.manifest.json")
    print(json.dumps(verify(Path(sys.argv[1]))))
