"""Verifica en modo lectura un conjunto de respaldos, sin Docker ni restauración.

Uso: python scripts/verify_backup_pair.py
     python scripts/verify_backup_pair.py backups/local/hjstorevp_pair_YYYYMMDDTHHMMSSZ.json
"""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FOLDER = ROOT / "backups" / "local"


def digest_file(file_path: Path) -> str:
    sha = hashlib.sha256()
    with file_path.open("rb") as src:
        for block in iter(lambda: src.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def validate_uploads(file_path: Path) -> int:
    count = 0
    with tarfile.open(file_path, "r:gz") as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if not name.parts or name.parts[0] != "uploads" or ".." in name.parts or name.is_absolute():
                raise RuntimeError("Nombre inseguro en archivos")
            if not (member.isfile() or member.isdir()):
                raise RuntimeError("Enlace u otro tipo no admitido en la copia")
            if member.isfile():
                stream = archive.extractfile(member)
                if stream is None:
                    raise RuntimeError("Archivo no legible en copia")
                for _ in iter(lambda: stream.read(256 * 1024), b""):
                    pass
            count += 1
    if not count:
        raise RuntimeError("Copia de imágenes vacía o inválida")
    return count


def validate_sql(file_path: Path) -> int:
    length = 0
    with gzip.open(file_path, "rb") as archive:
        beginning = archive.read(8192)
        if not beginning or (b"CREATE" not in beginning and b"MariaDB" not in beginning
                             and b"mariadb" not in beginning):
            raise RuntimeError("No parece un volcado MariaDB válido")
        length += len(beginning)
        for block in iter(lambda: archive.read(1024 * 1024), b""):
            length += len(block)
    return length


def main() -> int:
    if len(sys.argv) > 2:
        print("Uso: python scripts/verify_backup_pair.py [ruta-manifiesto]", file=sys.stderr)
        return 2
    if len(sys.argv) == 2:
        manifest = Path(sys.argv[1]).resolve()
    else:
        candidates = sorted(DEFAULT_FOLDER.glob("hjstorevp_pair_*.json"))
        if not candidates:
            print("No hay manifiesto de respaldo integral.", file=sys.stderr)
            return 1
        manifest = candidates[-1].resolve()
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for name, expected_suffix in (("database", ".sql.gz"), ("uploads", ".tar.gz")):
            entry = data[name]
            filename = entry["filename"]
            # Evita que un manifiesto manipulado lea archivos fuera de su carpeta.
            if Path(filename).name != filename or not filename.startswith("hjstorevp_") or not filename.endswith(expected_suffix):
                raise RuntimeError(f"Archivo no admitido en manifiesto: {name}")
            path = manifest.parent / filename
            if not path.is_file():
                raise RuntimeError(f"Archivo no encontrado: {filename}")
            calculated = digest_file(path)
            if calculated != entry["sha256"]:
                raise RuntimeError(f"SHA256 no coincide: {filename}")
            if name == "database":
                result = validate_sql(path)
                print(f"SQL íntegro: {filename} ({result} bytes sin comprimir)")
            else:
                result = validate_uploads(path)
                print(f"Archivos íntegros: {filename} ({result} entradas)")
        print("INTEGRIDAD VERIFICADA. Una restauración aislada sigue siendo necesaria.")
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, tarfile.TarError, EOFError) as exc:
        print("VERIFICACIÓN FALLIDA:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
