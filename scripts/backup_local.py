"""Copia de seguridad local MariaDB para HJStoreVP (Docker Compose).

Ejecutar desde la raíz: python scripts/backup_local.py
Crea un SQL comprimido + SHA256. No ejecuta restauraciones, ni purgas.
La copia de un motor transaccional usa --single-transaction; los archivos
de imagen (volumen uploads_data) deben respaldarse por separado.
"""
from __future__ import annotations

import gzip
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT / "backups" / "local"
# Las credenciales se leen DENTRO del contenedor, nunca se imprimen en consola.
DUMP_CMD = [
    "docker", "compose", "exec", "-T", "db", "sh", "-c",
    'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; '
    'exec mariadb-dump --single-transaction --quick --routines --events '
    '--triggers --default-character-set=utf8mb4 '
    '--user=root --databases "$MYSQL_DATABASE"',
]


def main() -> int:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    file_path = TARGET_DIR / f"hjstorevp_db_{timestamp}.sql.gz"
    temp_path = TARGET_DIR / (file_path.name + ".partial")
    checksum_path = TARGET_DIR / (file_path.name + ".sha256")
    if file_path.exists() or temp_path.exists() or checksum_path.exists():
        print("Ya existe un respaldo con este instante; no se sobrescribirá.", file=sys.stderr)
        return 2

    print("Iniciando respaldo consistente de MariaDB; no se imprimirán credenciales.")
    process = None
    try:
        process = subprocess.Popen(
            DUMP_CMD, cwd=ROOT,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
        )
        digest = hashlib.sha256()
        total = 0
        with open(temp_path, "xb") as raw_output:
            with gzip.GzipFile(fileobj=raw_output, mode="wb", compresslevel=6) as compressor:
                while True:
                    chunk = process.stdout.read(256 * 1024)
                    if not chunk:
                        break
                    compressor.write(chunk)
                    total += len(chunk)
        stderr = process.stderr.read(8192).decode("utf-8", errors="replace")
        status = process.wait()
        if status != 0 or total == 0:
            raise RuntimeError(
                f"El volcado terminó con código {status} y {total} bytes. "
                f"Revisa que Docker y la BD estén activos. {stderr[:600]}"
            )
        with gzip.open(temp_path, "rb") as zipped:
            prefix = zipped.read(8192)
            if not prefix or b"CREATE" not in prefix and b"MariaDB" not in prefix and b"mariadb" not in prefix:
                raise RuntimeError("La cabecera SQL no parece un volcado MariaDB válido.")
        with open(temp_path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        os.replace(temp_path, file_path)
        with open(checksum_path, "x", encoding="utf-8") as file:
            file.write(f"{digest.hexdigest()}  {file_path.name}\n")
        print("Respaldo creado:", file_path)
        print("SHA-256:", digest.hexdigest())
        print("IMPORTANTE: conservar una copia cifrada fuera del equipo y respaldar uploads_data.")
        return 0
    except (OSError, RuntimeError) as exc:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        temp_path.unlink(missing_ok=True)
        print("No se pudo completar el respaldo:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
