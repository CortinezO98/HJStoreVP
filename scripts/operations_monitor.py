#!/usr/bin/env python3
"""E.5.4 Observabilidad local y pasiva, sin configurar ni enviar alertas.

Inspecciona sólo contenedores con nombres fijos, URLs loopback fijas,
espacio en disco y antigüedad de respaldos. No accede a .env, BD,
credenciales, tokens, logs internos ni endpoints de negocio.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / "backups" / "local"
CONTAINERS = {
    "db": "hjstorevp_db",
    "redis": "hjstorevp_redis",
    "backend": "hjstorevp_backend",
    "store": "hjstorevp_frontend",
    "admin": "hjstorevp_admin",
}
TARGETS = {
    "api": "http://127.0.0.1:8000/health",
    "store": "http://127.0.0.1:5173/",
    "admin": "http://127.0.0.1:5174/",
}
STATUS = ("ok", "warning", "critical")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def result(status: str, code: str, **metrics):
    assert status in STATUS
    return {"status": status, "code": code, "metrics": metrics}


def container_state(name: str):
    try:
        proc = subprocess.run(
            ["docker", "inspect", "--format", "{{json .State}}", name],
            capture_output=True, text=True, timeout=8, check=False,
            encoding="utf-8", errors="replace",
        )
        if proc.returncode:
            return result("critical", "CONTAINER_UNAVAILABLE")
        state = json.loads(proc.stdout)
        if not isinstance(state, dict):
            return result("critical", "CONTAINER_STATE_INVALID")
        running = state.get("Running") is True
        health = (state.get("Health") or {}).get("Status")
        if not running:
            return result("critical", "CONTAINER_STOPPED")
        if health in ("unhealthy", "starting"):
            return result("critical" if health == "unhealthy" else "warning",
                          "CONTAINER_" + health.upper())
        return result("ok", "CONTAINER_RUNNING", healthcheck=health or "not_configured")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return result("critical", "CONTAINER_INSPECT_FAILED")


def http_health(url: str, warn_ms: int, timeout: float):
    # El usuario no puede inyectar destinos: TARGETS son constantes loopback.
    request = Request(url, method="GET", headers={"Accept": "application/json, text/html"})
    before = monotonic()
    try:
        with build_opener(NoRedirect).open(request, timeout=timeout) as response:
            code = response.status
            content_type = response.headers.get("Content-Type", "").lower()
            body = response.read(4096)
        duration_ms = round((monotonic() - before) * 1000, 1)
        if code != 200:
            return result("critical", "HTTP_UNEXPECTED_STATUS", http_status=code, latency_ms=duration_ms)
        if url.endswith("/health"):
            # Debe distinguir API real de una SPA que devuelva HTML 200.
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeDecodeError):
                return result("critical", "API_HEALTH_BODY_INVALID", latency_ms=duration_ms)
            if "application/json" not in content_type or payload != {"status": "ok"}:
                return result("critical", "API_HEALTH_BODY_INVALID", latency_ms=duration_ms)
        elif "text/html" not in content_type:
            return result("critical", "SPA_CONTENT_TYPE_INVALID", latency_ms=duration_ms)
        if duration_ms >= warn_ms:
            return result("warning", "HTTP_SLOW", http_status=code, latency_ms=duration_ms)
        return result("ok", "HTTP_RESPONSIVE", http_status=code, latency_ms=duration_ms)
    except HTTPError as exc:
        return result("critical", "HTTP_ERROR_STATUS", http_status=exc.code)
    except (URLError, OSError, TimeoutError, ValueError):
        return result("critical", "HTTP_REQUEST_FAILED")


def disk_state(root: Path, warning_free_percent: int, critical_free_percent: int):
    try:
        volume = shutil.disk_usage(root)
        if volume.total <= 0:
            return result("critical", "DISK_UNAVAILABLE")
        free_percent = round(volume.free / volume.total * 100, 1)
        if free_percent < critical_free_percent:
            level = "critical"
        elif free_percent < warning_free_percent:
            level = "warning"
        else:
            level = "ok"
        return result(level, "DISK_FREE", free_percent=free_percent)
    except OSError:
        return result("critical", "DISK_UNAVAILABLE")


def backup_state(folder: Path, prefix: str, max_age_hours: int, now: float):
    suffix = ".sql.gz" if prefix == "db" else ".tar.gz"
    files = [p for p in folder.glob(f"hjstorevp_{prefix}_*")
             if p.is_file() and p.name.endswith(suffix)]
    if not files:
        return result("warning", "BACKUP_NOT_FOUND")
    latest = max(files, key=lambda p: p.stat().st_mtime)
    try:
        age = max(0.0, (now - latest.stat().st_mtime) / 3600)
        sha = Path(str(latest) + ".sha256")
        if not sha.is_file() or latest.stat().st_size == 0:
            return result("warning", "BACKUP_INCOMPLETE", age_hours=round(age, 1))
        if age > max_age_hours:
            return result("warning", "BACKUP_STALE", age_hours=round(age, 1))
        return result("ok", "BACKUP_PRESENT", age_hours=round(age, 1))
    except OSError:
        return result("warning", "BACKUP_METADATA_UNAVAILABLE")


def collect(warn_ms=1500, timeout=4.0, warning_free=20,
            critical_free=10, max_age_hours=48, root=ROOT, backups=BACKUPS,
            now=None):
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    checks = {}
    for key, container in CONTAINERS.items():
        checks["container:" + key] = container_state(container)
    for key, url in TARGETS.items():
        checks["http:" + key] = http_health(url, warn_ms, timeout)
    checks["disk:workspace"] = disk_state(root, warning_free, critical_free)
    for kind in ("db", "uploads"):
        checks["backup:" + kind] = backup_state(backups, kind, max_age_hours, now)
    critical = sorted(k for k, v in checks.items() if v["status"] == "critical")
    warnings = sorted(k for k, v in checks.items() if v["status"] == "warning")
    return {
        "schema_version": 1,
        "checked_at_utc": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "environment": "local-development-only",
        "overall": "critical" if critical else ("warning" if warnings else "ok"),
        "critical_checks": critical,
        "warning_checks": warnings,
        "checks": checks,
        "notice": "Snapshot puntual: no mide disponibilidad histórica, no envía alertas externas",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--warn-latency-ms", type=int, default=1500)
    parser.add_argument("--timeout-seconds", type=float, default=4)
    parser.add_argument("--warning-free-percent", type=int, default=20)
    parser.add_argument("--critical-free-percent", type=int, default=10)
    parser.add_argument("--max-backup-age-hours", type=int, default=48)
    args = parser.parse_args(argv)
    if not (100 <= args.warn_latency_ms <= 30000
            and 0.5 <= args.timeout_seconds <= 30
            and 1 <= args.critical_free_percent < args.warning_free_percent <= 90
            and 1 <= args.max_backup_age_hours <= 720):
        parser.error("Umbrales inválidos")
    snapshot = collect(args.warn_latency_ms, args.timeout_seconds,
                       args.warning_free_percent, args.critical_free_percent,
                       args.max_backup_age_hours)
    if args.json:
        print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    else:
        for name, item in snapshot["checks"].items():
            metrics = " ".join(f"{key}={value}" for key, value in item["metrics"].items())
            print(f"[{item['status'].upper()}] {name}: {item['code']} {metrics}".rstrip())
        print("ESTADO GENERAL:", snapshot["overall"].upper())
    return {"ok": 0, "warning": 1, "critical": 2}[snapshot["overall"]]


if __name__ == "__main__":
    sys.exit(main())
