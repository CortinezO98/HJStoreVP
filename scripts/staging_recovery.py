#!/usr/bin/env python3
"""E.5.3: auditoría Alembic + respaldo sintético y ensayo en MariaDB aislada.

No lee .env ni respaldos comerciales. Nunca ejecuta migraciones. Para
ensayar restauración requiere --rehearse y contenedor db-recovery ya healthy.
"""
from __future__ import annotations

import argparse
import ast
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "backend" / "alembic" / "versions"
FIXTURES = ROOT / "backups" / "staging-fixtures"
COMPOSE = ROOT / "docker-compose.staging-recovery.yml"
PROJECT = "hjstorevp-staging-recovery"
DB = "hjstore_recovery_fixture"


class RecoveryStageError(RuntimeError):
    """Identificador de etapa seguro: nunca incluye stderr ni secretos."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


SQL = b"""-- SYNTHETIC ONLY: E.5.3 recovery probe
CREATE TABLE IF NOT EXISTS recovery_probe (id INT PRIMARY KEY, marker VARCHAR(80) NOT NULL);
INSERT INTO recovery_probe (id, marker) VALUES (1, 'E53-RESTORE-VERIFIED');
"""
MARKER = "E53-RESTORE-VERIFIED"


def alembic_graph(folder: Path = VERSIONS) -> dict:
    """Parse static revision metadata with ast.literal_eval; never import migrations."""
    parents = {}
    for p in sorted(folder.glob("*.py")):
        tree = ast.parse(p.read_text(encoding="utf-8"), filename=p.name)
        values = {}
        for statement in tree.body:
            if isinstance(statement, ast.Assign):
                for target in statement.targets:
                    if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                        values[target.id] = ast.literal_eval(statement.value)
        revision = values.get("revision")
        if not isinstance(revision, str) or not revision or revision in parents:
            raise ValueError("Revisión Alembic ausente, inválida o duplicada")
        parent = values.get("down_revision")
        if parent is None:
            links = []
        elif isinstance(parent, str):
            links = [parent]
        elif isinstance(parent, tuple) and all(isinstance(x, str) for x in parent):
            links = list(parent)
        else:
            raise ValueError("Dependencia Alembic no soportada")
        parents[revision] = links
    if not parents:
        raise ValueError("No existen migraciones Alembic")
    if any(p not in parents for group in parents.values() for p in group):
        raise ValueError("Dependencia Alembic sin revisión")
    color = {}
    def visit(revision):
        if color.get(revision) == 1:
            raise ValueError("Ciclo entre migraciones")
        if color.get(revision) == 2:
            return
        color[revision] = 1
        for dep in parents[revision]:
            visit(dep)
        color[revision] = 2
    for r in parents:
        visit(r)
    referenced = {p for group in parents.values() for p in group}
    heads = sorted(set(parents) - referenced)
    roots = sorted(r for r, group in parents.items() if not group)
    if len(heads) != 1 or len(roots) != 1:
        raise ValueError("Se esperaba una cadena Alembic de una raíz y una cabeza")
    return {"revisions": len(parents), "root": roots[0], "head": heads[0],
            "chain_integrity": "ok", "database_version_checked": False}


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def create_fixture(folder: Path = FIXTURES) -> Path:
    """Genera SOLAMENTE datos sintéticos. No abre Docker ni toca una BD."""
    folder.mkdir(parents=True, exist_ok=True)
    sql = folder / "hjstorevp_e53_synthetic.sql.gz"
    uploads = folder / "hjstorevp_e53_uploads.tar.gz"
    manifest = folder / "hjstorevp_e53_pair.json"
    # No sobrescribir respaldos o fixtures previos.
    if any(p.exists() for p in (sql, uploads, manifest)):
        raise FileExistsError("Fixture E.5.3 ya existe; no se sobrescribe")
    with sql.open("xb") as output:
        with gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as compressed:
            compressed.write(SQL)
    with tarfile.open(uploads, "x:gz") as tar:
        payload = b"E53-UPLOAD-VERIFIED\n"
        info = tarfile.TarInfo("uploads/branding/e53_synthetic.txt")
        info.size = len(payload)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(payload))
    data = {
        "type": "hjstorevp-e53-synthetic-only",
        "db_name": DB,
        "database": {"filename": sql.name, "sha256": digest(sql)},
        "uploads": {"filename": uploads.name, "sha256": digest(uploads)},
        "real_backup": False, "live_data": False,
    }
    with manifest.open("x", encoding="utf-8") as output:
        json.dump(data, output, indent=2)
    return manifest


def verify_fixture(path: Path) -> dict:
    """Integridad y seguridad de archivos, sin extraer rutas del TAR."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("type") != "hjstorevp-e53-synthetic-only" or data.get("db_name") != DB:
        raise ValueError("Sólo se admiten fixtures E.5.3 sintéticos")
    if data.get("real_backup") is not False or data.get("live_data") is not False:
        raise ValueError("Prohibido cargar respaldos comerciales")
    expected = {"database": "hjstorevp_e53_synthetic.sql.gz",
                "uploads": "hjstorevp_e53_uploads.tar.gz"}
    paths = {}
    for key, filename in expected.items():
        entry = data[key]
        if entry["filename"] != filename:
            raise ValueError("Nombre de fixture no admitido")
        candidate = path.parent / filename
        if not candidate.is_file() or digest(candidate) != entry["sha256"]:
            raise ValueError("SHA256 no coincide: " + key)
        paths[key] = candidate
    with gzip.open(paths["database"], "rb") as compressed:
        if compressed.read(len(SQL) + 1) != SQL:
            raise ValueError("SQL sintético alterado")
    with tarfile.open(paths["uploads"], "r:gz") as tar:
        members = tar.getmembers()
        if len(members) != 1 or members[0].name != "uploads/branding/e53_synthetic.txt" or not members[0].isfile():
            raise ValueError("Contenido TAR inesperado")
        if tar.extractfile(members[0]).read() != b"E53-UPLOAD-VERIFIED\n":
            raise ValueError("Imagen/archivo sintético alterado")
    return {"fixture": "verified", "sha256": "ok", "sql_bytes": len(SQL),
            "upload_entries": 1, "commercial_data": False}


def rehearse(path: Path) -> dict:
    """Ejecuta SQL fijo sintético SOLO en el servicio db-recovery del proyecto fijo."""
    verify_fixture(path)
    if path.resolve() != (FIXTURES / "hjstorevp_e53_pair.json").resolve():
        raise ValueError("Sólo fixture canónico bajo backups/staging-fixtures")
    if not COMPOSE.is_file() or "name: hjstorevp-staging-recovery" not in COMPOSE.read_text(encoding="utf-8"):
        raise RuntimeError("Compose de recuperación no verificado")
    base = ["docker", "compose", "-f", str(COMPOSE), "-p", PROJECT]
    # Si db-recovery no está levantada, no se inicia automáticamente.
    status = subprocess.run(base + ["ps", "--status", "running", "--services"],
                            cwd=ROOT, capture_output=True, text=True, check=False)
    if status.returncode or status.stdout.strip().splitlines() != ["db-recovery"]:
        raise RecoveryStageError("CONTAINER_NOT_RUNNING_OR_NOT_UNIQUE")
    # Un contenedor RUNNING no significa que MariaDB haya terminado
    # su inicialización. Fail-closed: no enviar SQL hasta que el
    # healthcheck oficial confirme conexión e InnoDB disponibles.
    ready = subprocess.run(
        base + ["exec", "-T", "db-recovery", "healthcheck.sh", "--connect", "--innodb_initialized"],
        cwd=ROOT, capture_output=True, check=False,
    )
    if ready.returncode:
        raise RecoveryStageError("DB_HEALTHCHECK_FAILED")
    # La contraseña se expande DENTRO del contenedor; no se imprime ni se pasa a argv del host.
    exec_cmd = base + ["exec", "-T", "db-recovery", "sh", "-c",
                       'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mariadb -u root hjstore_recovery_fixture']
    with gzip.open(path.parent / "hjstorevp_e53_synthetic.sql.gz", "rb") as input_sql:
        restored = subprocess.run(exec_cmd, cwd=ROOT, stdin=input_sql, capture_output=True, check=False)
    if restored.returncode:
        raise RecoveryStageError("SQL_IMPORT_FAILED")
    query = base + ["exec", "-T", "db-recovery", "sh", "-c",
                    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mariadb -N -u root hjstore_recovery_fixture -e "SELECT marker FROM recovery_probe WHERE id=1"']
    result = subprocess.run(query, cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RecoveryStageError("SQL_READBACK_FAILED")
    if result.stdout.strip() != MARKER:
        raise RecoveryStageError("SQL_MARKER_MISMATCH")
    return {"restore": "verified", "database": DB, "marker": MARKER,
            "uploads": "archive-verified-not-restored", "real_data": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("audit", "create-fixture", "verify", "rehearse"))
    args = parser.parse_args(argv)
    try:
        if args.action == "audit":
            report = {"alembic": alembic_graph(), "db_restoration_tested": False}
        elif args.action == "create-fixture":
            path = create_fixture()
            report = {"created": str(path.relative_to(ROOT))}
        elif args.action == "verify":
            report = verify_fixture(FIXTURES / "hjstorevp_e53_pair.json")
        else:
            report = rehearse(FIXTURES / "hjstorevp_e53_pair.json")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.SubprocessError,
            tarfile.TarError, EOFError) as exc:
        if isinstance(exc, RecoveryStageError):
            print("E.5.3 BLOQUEADO:", exc.code, file=sys.stderr)
        else:
            print("E.5.3 BLOQUEADO:", type(exc).__name__, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
