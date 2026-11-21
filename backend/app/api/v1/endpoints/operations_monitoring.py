"""E.5.5: resumen local de monitoreo, solo superadministrador.

Sin IO comercial. No consulta Docker ni acepta rutas del cliente.
En production no sirve archivos del host (503, fail-closed).
"""
from datetime import datetime, timezone
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.deps import require_super_admin
from app.models.models import User

router = APIRouter(prefix="/operations-monitoring", tags=["Monitoreo técnico"])
_REPORT = Path(__file__).resolve().parents[4] / "monitoring" / "summary.json"
_ALLOWED_CHECKS = {
    *(f"container:{name}" for name in ("db", "redis", "backend", "store", "admin")),
    *(f"http:{name}" for name in ("api", "store", "admin")),
    "disk:workspace", "backup:db", "backup:uploads",
}
_ALLOWED_METRICS = {"latency_ms", "http_status", "free_percent", "age_hours"}


def sanitize_report(data: dict) -> dict:
    """No confiar en un JSON del disco; sólo datos operativos conocidos."""
    if (data.get("schema_version") != 1
            or data.get("environment") != "local-development-only"):
        raise ValueError("Reporte no admitido")
    at = data.get("latest_at_utc")
    moment = datetime.fromisoformat(at)
    if moment.tzinfo is None:
        raise ValueError("Reporte sin zona horaria")
    latest_checks = data.get("latest_checks")
    if not isinstance(latest_checks, dict) or set(latest_checks) != _ALLOWED_CHECKS:
        raise ValueError("Controles incompletos")
    statuses = {"ok", "warning", "critical"}
    checks = {}
    for key, item in latest_checks.items():
        if not isinstance(item, dict) or item.get("status") not in statuses:
            raise ValueError("Estado no admitido")
        metrics = {}
        for name, value in (item.get("metrics") or {}).items():
            if name in _ALLOWED_METRICS and type(value) in (int, float) and 0 <= value <= 10000000:
                metrics[name] = float(value)
        checks[key] = {"status": item["status"], "metrics": metrics}
    alerts = []
    for alert in data.get("persistent_alerts", [])[:11]:
        if (isinstance(alert, dict) and alert.get("check") in _ALLOWED_CHECKS
                and alert.get("severity") in ("warning", "critical")
                and type(alert.get("samples")) is int and 1 <= alert["samples"] <= 720):
            alerts.append({"check": alert["check"], "severity": alert["severity"],
                           "samples": alert["samples"]})
    trend = []
    for item in data.get("trend", [])[-60:]:
        if not isinstance(item, dict) or item.get("status") not in statuses:
            continue
        try:
            when = datetime.fromisoformat(item["at"])
            if when.tzinfo is None:
                continue
            trend.append({"at": when.isoformat(), "status": item["status"]})
        except (TypeError, ValueError, KeyError):
            continue
    latency = {}
    for key, item in (data.get("latency") or {}).items():
        if key not in {"http:api", "http:store", "http:admin"} or not isinstance(item, dict):
            continue
        values = {}
        for field in ("p50_ms", "p95_ms", "samples"):
            value = item.get(field)
            if type(value) in (int, float) and 0 <= value <= 10000000:
                values[field] = value
        latency[key] = values
    count = data.get("sample_count")
    percent = data.get("observed_ok_percent")
    return {
        "schema_version": 1, "latest_at_utc": moment.isoformat(),
        "latest_status": data.get("latest_status") if data.get("latest_status") in statuses else "warning",
        "sample_count": count if type(count) is int and 0 <= count <= 720 else 0,
        "observed_ok_percent": percent if type(percent) in (float, int) and 0 <= percent <= 100 else None,
        "latest_checks": checks, "persistent_alerts": alerts, "latency": latency,
        "trend": trend, "historical_note": "Porcentaje de muestras OK, no SLA ni disponibilidad temporal",
    }


@router.get("")
def read_operations_report(_: User = Depends(require_super_admin)):
    if settings.ENVIRONMENT.lower() != "development":
        raise HTTPException(status_code=503, detail="Monitoreo local deshabilitado en este entorno")
    try:
        if _REPORT.is_symlink() or not _REPORT.is_file() or _REPORT.stat().st_size > 128 * 1024:
            raise ValueError("Reporte ausente o inválido")
        data = sanitize_report(json.loads(_REPORT.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        raise HTTPException(status_code=503, detail="Monitor local sin informe válido") from None
    try:
        age_seconds = (datetime.now(timezone.utc) -
                       datetime.fromisoformat(data["latest_at_utc"])).total_seconds()
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail="Monitor local sin informe válido") from None
    if age_seconds < -120 or age_seconds > 900:
        data["stale"] = True
        data["latest_status"] = "warning"
    else:
        data["stale"] = False
    return JSONResponse(data, headers={"Cache-Control": "no-store"})
