"""Respaldo verificable de uploads_data de HJStoreVP sin tocar el volumen.

Uso (Windows CMD, desde la raíz del repositorio):
    python scripts/backup_uploads.py

El respaldo no incluye MariaDB. Para un punto consistente entre BD e
imágenes, suspender escrituras mientras se crean AMBAS copias.
"""
from __future__ import annotations

import gzip
import hashlib
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "backups" / "local"

# Ejecutar tarfile en un contenedor efímero que monta el volumen existente.
# No usar docker cp ni docker run -v con un volumen inventado: Compose resuelve
# el nombre real del proyecto y nunca crea un volumen alternativo por error.
ARCHIVE_SCRIPT = """
import pathlib, sys, tarfile
root = pathlib.Path('/app/uploads')
if not root.is_dir():
    sys.stderr.write('El volumen /app/uploads no está montado\\n')
    sys.exit(3)
def restrict(info):
    if info.issym() or info.islnk() or not (info.isfile() or info.isdir()):
        raise ValueError('Tipo de archivo no permitido en copia: ' + info.name)
    return info
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as archive:
    archive.add(str(root), arcname='uploads', recursive=True, filter=restrict)
"""


def verify_archive(path: Path) -> tuple[int, int]:
    total = 0
    entries = 0
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if (not name.parts or name.parts[0] != "uploads"
                    or ".." in name.parts or name.is_absolute()
                    or not (member.isfile() or member.isdir())):
                raise ValueError("Entrada insegura detectada en el archivo")
            if member.isfile():
                stream = archive.extractfile(member)
                if stream is None:
                    raise ValueError("Archivo no legible en respaldo")
                for chunk in iter(lambda: stream.read(256 * 1024), b""):
                    total += len(chunk)
            entries += 1
    if entries == 0:
        raise ValueError("El archivo no contiene entradas")
    return entries, total


def main() -> int:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    final = DESTINATION / f"hjstorevp_uploads_{timestamp}.tar.gz"
    temporary = DESTINATION / (final.name + ".partial")
    checksum = DESTINATION / (final.name + ".sha256")
    if any(p.exists() for p in (final, temporary, checksum)):
        print("Ya existe un respaldo para ese instante; no se sobrescribirá.", file=sys.stderr)
        return 2

    command = [
        "docker", "compose", "run", "--rm", "--no-deps", "-T", "backend",
        "python", "-c", ARCHIVE_SCRIPT,
    ]
    process = None
    try:
        print("Copiando uploads_data en modo lectura (sin modificar el volumen)...")
        process = subprocess.Popen(
            command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        with temporary.open("xb") as output:
            with gzip.GzipFile(fileobj=output, mode="wb", compresslevel=6) as compressed:
                for chunk in iter(lambda: process.stdout.read(256 * 1024), b""):
                    compressed.write(chunk)
        errors = process.stderr.read(4096).decode("utf-8", "replace")
        exit_code = process.wait()
        if exit_code != 0:
            raise RuntimeError(
                f"Docker devolvió código {exit_code}; revisa el montaje y el espacio en disco. "
                + errors[:600]
            )
        entries, bytes_checked = verify_archive(temporary)
        digest = hashlib.sha256()
        with temporary.open("rb") as archive:
            for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                digest.update(chunk)
        os.replace(temporary, final)
        with checksum.open("x", encoding="utf-8") as record:
            record.write(f"{digest.hexdigest()}  {final.name}\n")
        print(f"Respaldo: {final}")
        print(f"Entradas verificadas: {entries} | Bytes extraídos virtualmente: {bytes_checked}")
        print(f"SHA-256: {digest.hexdigest()}")
        print("Guardar copia cifrada externa. No se ha ejecutado ninguna restauración.")
        return 0
    except (OSError, ValueError, RuntimeError, tarfile.TarError) as exc:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        temporary.unlink(missing_ok=True)
        print(f"Respaldo de uploads fallido: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
