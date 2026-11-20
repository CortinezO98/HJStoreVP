"""Orquesta respaldos MariaDB + uploads con manifiesto de pareja.

Uso: python scripts/backup_full_local.py
No detiene servicios ni hace restore. Para una copia puntualmente consistente,
entrar primero en ventana de mantenimiento y detener escrituras comerciales.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
BACKUPS = ROOT / "backups" / "local"


def newest(pattern: str) -> Path | None:
    matches = list(BACKUPS.glob(pattern))
    return max(matches, key=lambda p: p.stat().st_mtime) if matches else None


def verify_manifest(path: Path) -> str:
    manifest = Path(str(path) + ".sha256")
    if not manifest.is_file() or not path.is_file():
        raise RuntimeError(f"Respaldo o SHA256 faltante: {path.name}")
    expected, separator, file_name = manifest.read_text(encoding="utf-8").strip().partition("  ")
    if not separator or file_name != path.name or len(expected) != 64:
        raise RuntimeError(f"Formato de manifiesto inválido: {manifest.name}")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise RuntimeError(f"SHA256 no coincide: {path.name}")
    return expected


def run_script(script: str) -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / script)],
        cwd=ROOT, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"{script} terminó con código {result.returncode}")


def main() -> int:
    BACKUPS.mkdir(parents=True, exist_ok=True)
    before = datetime.now(timezone.utc).timestamp()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest = BACKUPS / f"hjstorevp_pair_{run_id}.json"
    if manifest.exists():
        print("Ya existe un conjunto con este identificador.", file=sys.stderr)
        return 2

    try:
        run_script("backup_local.py")
        db_file = newest("hjstorevp_db_*.sql.gz")
        if not db_file or db_file.stat().st_mtime < before - 2:
            raise RuntimeError("No se encontró un respaldo SQL nuevo")
        db_hash = verify_manifest(db_file)
        run_script("backup_uploads.py")
        uploads_file = newest("hjstorevp_uploads_*.tar.gz")
        if not uploads_file or uploads_file.stat().st_mtime < before - 2:
            raise RuntimeError("No se encontró un respaldo de imágenes nuevo")
        uploads_hash = verify_manifest(uploads_file)
        bundle = {
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "database": {"filename": db_file.name, "sha256": db_hash},
            "uploads": {"filename": uploads_file.name, "sha256": uploads_hash},
            "consistency": (
                "Copia secuencial, no instantánea atómica entre BD y archivos. "
                "Suspender escrituras de productos/pedidos para un corte consistente."
            ),
            "restoration_performed": False,
        }
        with manifest.open("x", encoding="utf-8") as output:
            json.dump(bundle, output, indent=2, ensure_ascii=False)
            output.write("\n")
        print("Pareja de respaldos verificada:", manifest)
        print("Conservar fuera del equipo una copia cifrada de ambos archivos y sus manifiestos.")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print("Respaldo integral INCOMPLETO:", exc, file=sys.stderr)
        print("No se borró ningún archivo parcial válido ni se restauró ningún dato.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
