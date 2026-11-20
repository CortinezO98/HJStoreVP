"""Comprobación no destructiva de HJStoreVP para Docker Desktop en Windows.

Uso:
    python scripts/healthcheck_local.py
    python scripts/healthcheck_local.py --require-backups --max-age-hours 48
    python scripts/healthcheck_local.py --json

No imprime secretos ni ejecuta operaciones de venta, escrituras SQL o
restauraciones. Útil para el Programador de tareas con un archivo de log.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "backups" / "local"
CONTAINERS = {
    "db": "hjstorevp_db",
    "redis": "hjstorevp_redis",
    "backend": "hjstorevp_backend",
    "frontend": "hjstorevp_frontend",
    "frontend-admin": "hjstorevp_admin",
}
HTTP_TARGETS = {
    "backend": "http://127.0.0.1:8000/health",
    "frontend": "http://127.0.0.1:5173/",
    "frontend-admin": "http://127.0.0.1:5174/",
}


def inspect(name: str) -> dict:
    try:
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{json .State}}", name],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "detail": f"No se pudo consultar Docker: {type(exc).__name__}"}
    if result.returncode != 0:
        return {"ok": False, "detail": "No existe el contenedor o Docker no está disponible"}
    try:
        state = json.loads(result.stdout)
    except ValueError:
        return {"ok": False, "detail": "Respuesta de Docker inválida"}
    running = bool(state.get("Running"))
    health = (state.get("Health") or {}).get("Status")
    ok = running and health not in ("unhealthy", "starting")
    return {"ok": ok, "detail": f"running={running}, health={health or 'no-configurado'}"}


def check_http(url: str) -> dict:
    try:
        with urlopen(url, timeout=4) as response:
            status = response.status
            return {"ok": status == 200, "detail": f"HTTP {status}"}
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return {"ok": False, "detail": f"Sin respuesta HTTP: {type(exc).__name__}"}


def recent_backup(prefix: str, age_hours: int) -> dict:
    files = sorted(BACKUP_DIR.glob(f"hjstorevp_{prefix}_*"), reverse=True)
    files = [p for p in files if p.is_file() and p.name.endswith(
        ".sql.gz" if prefix == "db" else ".tar.gz"
    )]
    if not files:
        return {"ok": False, "detail": "No hay copias en backups/local"}
    path = files[0]
    checksum = Path(str(path) + ".sha256")
    # No releer el fichero completo en cada comprobación; hash/replay se
    # inspeccionan en el proceso de respaldo o auditoría de restauración.
    age = (datetime.now(timezone.utc).timestamp() - path.stat().st_mtime) / 3600
    ok = age <= age_hours and checksum.is_file() and path.stat().st_size > 0
    return {
        "ok": ok,
        "detail": f"{path.name}: {age:.1f} h; manifiesto={'sí' if checksum.is_file() else 'no'}",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-backups", action="store_true")
    parser.add_argument("--max-age-hours", type=int, default=48)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_age_hours <= 720:
        parser.error("--max-age-hours debe estar entre 1 y 720")

    results = {}
    for service, name in CONTAINERS.items():
        results[f"container:{service}"] = inspect(name)
    for service, url in HTTP_TARGETS.items():
        results[f"http:{service}"] = check_http(url)

    free = shutil.disk_usage(ROOT)
    percent_free = (100 * free.free / free.total) if free.total else 0
    results["disk:workspace"] = {
        "ok": percent_free >= 10,
        "detail": f"{percent_free:.1f}% disponible en el volumen que contiene el repositorio",
    }
    for kind in ("db", "uploads"):
        results[f"backup:{kind}"] = recent_backup(kind, args.max_age_hours)

    critical = {
        key for key in results
        if key.startswith(("container:", "http:", "disk:"))
        or (args.require_backups and key.startswith("backup:"))
    }
    failures = [key for key in critical if not results[key]["ok"]]
    if args.json:
        print(json.dumps({
            "checked_at_utc": datetime.now(timezone.utc).isoformat(),
            "ok": not failures,
            "failures": failures,
            "checks": results,
        }, ensure_ascii=False, indent=2))
    else:
        for name, result in results.items():
            state = "OK" if result["ok"] else "ALERTA"
            print(f"[{state}] {name}: {result['detail']}")
        print("Estado general:", "OK" if not failures else "REVISAR")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
