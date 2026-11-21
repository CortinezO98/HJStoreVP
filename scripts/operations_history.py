#!/usr/bin/env python3
"""E.5.5: historial de snapshots locales, alertas persistentes y resumen seguro.

Sólo usa los controles pasivos de operations_monitor.py y escribe archivos
sanitizados en backend/monitoring (ignorado por Git). No usa servicios externos.
Ejecución programada NO se instala automáticamente.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from operations_monitor import collect

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "backend" / "monitoring"
EVENTS = FOLDER / "snapshots.jsonl"
SUMMARY = FOLDER / "summary.json"
VALID_STATES = frozenset({"ok", "warning", "critical"})
MAX_ROWS = 720
MAX_AGE_SECONDS = 30 * 86400
MAX_HISTORY_BYTES = 2 * 1024 * 1024
KNOWN_CHECKS = frozenset({
    *(f"container:{name}" for name in ("db", "redis", "backend", "store", "admin")),
    *(f"http:{name}" for name in ("api", "store", "admin")),
    "disk:workspace", "backup:db", "backup:uploads",
})
ALLOWED_METRICS = frozenset({"latency_ms", "http_status", "free_percent", "age_hours"})


def clean_snapshot(raw: dict) -> dict:
    """Lista blanca para evitar guardar contraseñas, rutas y payloads."""
    if raw.get("environment") != "local-development-only":
        raise ValueError("Origen de monitor no admitido")
    timestamp = raw.get("checked_at_utc")
    if not isinstance(timestamp, str) or len(timestamp) > 40:
        raise ValueError("Fecha inválida")
    moment = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        raise ValueError("Fecha sin zona")
    checks = {}
    for key, value in raw.get("checks", {}).items():
        if key not in KNOWN_CHECKS:
            continue
        if not isinstance(value, dict) or value.get("status") not in VALID_STATES:
            raise ValueError("Estado inválido")
        status = value["status"]
        metrics = {}
        for name, reading in (value.get("metrics") or {}).items():
            if name in ALLOWED_METRICS and type(reading) in (int, float) and 0 <= reading <= 10000000:
                metrics[name] = round(float(reading), 2)
        checks[key] = {"status": status, "metrics": metrics}
    if set(checks) != KNOWN_CHECKS:
        raise ValueError("Snapshot incompleto")
    overall = "critical" if any(x["status"] == "critical" for x in checks.values()) else (
        "warning" if any(x["status"] == "warning" for x in checks.values()) else "ok"
    )
    return {"at": moment.astimezone(timezone.utc).isoformat(),
            "overall": overall, "checks": checks}


def read_rows(path: Path, now: datetime) -> list[dict]:
    if not path.is_file():
        return []
    if path.stat().st_size > MAX_HISTORY_BYTES:
        raise ValueError("Historial excede tamaño autorizado")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        entry = json.loads(line)
        if not isinstance(entry, dict) or set(entry) != {"at", "overall", "checks"}:
            raise ValueError("Formato de historial inválido")
        # Sanitizar histórico también: un archivo local no se considera fuente confiable.
        normalized = clean_snapshot({
            "environment": "local-development-only",
            "checked_at_utc": entry["at"],
            "checks": {k: {"status": v["status"], "metrics": v.get("metrics", {})}
                       for k, v in entry["checks"].items()},
        })
        at = datetime.fromisoformat(normalized["at"])
        if 0 <= (now - at).total_seconds() <= MAX_AGE_SECONDS:
            rows.append(normalized)
    rows.sort(key=lambda x: x["at"])
    return rows[-MAX_ROWS:]


def build_summary(rows: list[dict], consecutive: int = 3) -> dict:
    if not 2 <= consecutive <= 20:
        raise ValueError("Persistencia fuera de rango")
    latest = rows[-1] if rows else None
    alerts = []
    if latest:
        for key, value in latest["checks"].items():
            if value["status"] == "ok":
                continue
            streak = 0
            for sample in reversed(rows):
                state = sample["checks"][key]["status"]
                if state == "ok":
                    break
                streak += 1
            if streak >= consecutive:
                alerts.append({"check": key, "severity": value["status"], "samples": streak})
    latency = {}
    for key in ("http:api", "http:store", "http:admin"):
        samples = [x["checks"][key]["metrics"].get("latency_ms") for x in rows
                   if x["checks"][key]["status"] != "critical"]
        samples = sorted(x for x in samples if x is not None)
        if samples:
            latency[key] = {
                "p50_ms": samples[(len(samples) - 1) // 2],
                "p95_ms": samples[min(len(samples) - 1, max(0, (95 * len(samples) + 99) // 100 - 1))],
                "samples": len(samples),
            }
    totals = Counter(row["overall"] for row in rows)
    return {
        "schema_version": 1,
        "environment": "local-development-only",
        "latest_at_utc": latest["at"] if latest else None,
        "latest_status": latest["overall"] if latest else "no_data",
        "sample_count": len(rows),
        "observed_ok_percent": round(100 * totals["ok"] / len(rows), 1) if rows else None,
        "availability_note": "Porcentaje de muestras OK; no es disponibilidad temporal ni SLA",
        "latest_checks": latest["checks"] if latest else {},
        "persistent_alerts": alerts,
        "latency": latency,
        "trend": [{"at": x["at"], "status": x["overall"]} for x in rows[-60:]],
        "alert_note": "Alertas locales visibles en panel; sin notificaciones externas",
    }


def atomic_write(path: Path, text: str):
    temporary = path.with_suffix(path.suffix + ".partial")
    with temporary.open("x", encoding="utf-8") as output:
        output.write(text)
    os.replace(temporary, path)


def record_once(folder: Path = FOLDER, consecutive: int = 3, snapshot: dict | None = None) -> dict:
    """Un solo recolector. Se rechaza concurrencia; no borra datos previos."""
    folder.mkdir(parents=True, exist_ok=True)
    lock = folder / ".collector.lock"
    try:
        with lock.open("x", encoding="utf-8") as handle:
            handle.write("E55-EXCLUSIVE")
    except FileExistsError:
        raise RuntimeError("Hay otro recolector activo o bloqueo pendiente")
    try:
        now = datetime.now(timezone.utc)
        sample = clean_snapshot(collect() if snapshot is None else snapshot)
        rows = read_rows(folder / EVENTS.name, now)
        if rows and sample["at"] <= rows[-1]["at"]:
            raise ValueError("Muestras fuera de orden o duplicadas")
        rows.append(sample)
        rows = rows[-MAX_ROWS:]
        summary = build_summary(rows, consecutive)
        # Nunca escribir contenido de terceros; sólo lista blanca.
        history = "\n".join(json.dumps(item, separators=(",", ":")) for item in rows) + "\n"
        temp = folder / (EVENTS.name + ".partial")
        with temp.open("x", encoding="utf-8") as output:
            output.write(history)
        os.replace(temp, folder / EVENTS.name)
        # Publicar resumen sólo después de persistir el historial, para
        # evitar mostrar una muestra cuyo histórico todavía no se escribió.
        atomic_write(folder / SUMMARY.name, json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
        return summary
    finally:
        lock.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--consecutive", type=int, default=3)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = record_once(consecutive=args.consecutive)
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError):
        print("E.5.5 BLOQUEADO: el recolector no pudo guardar un snapshot válido", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("Muestras:", result["sample_count"], "| Estado:", result["latest_status"],
              "| Alertas persistentes:", len(result["persistent_alerts"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
