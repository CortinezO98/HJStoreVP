"""E.5.3: pruebas exclusivamente locales, sin Docker, BD ni red."""
from pathlib import Path
import importlib.util
import json
import sys
import tarfile

import pytest

SCRIPT = Path(__file__).with_name("staging_recovery.py")
spec = importlib.util.spec_from_file_location("staging_recovery", SCRIPT)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def _migration(folder, filename, revision, parent):
    (folder / filename).write_text(
        f"revision = {revision!r}\ndown_revision = {parent!r}\n"
        "def upgrade(): pass\n",
        encoding="utf-8",
    )


def test_repository_migration_graph_has_one_head():
    result = module.alembic_graph()
    assert result["chain_integrity"] == "ok"
    assert result["database_version_checked"] is False
    assert result["revisions"] >= 18
    assert result["head"] == "20261120_18"


def test_broken_or_cyclic_migrations_fail_closed(tmp_path):
    _migration(tmp_path, "one.py", "one", "missing")
    with pytest.raises(ValueError, match="Dependencia"):
        module.alembic_graph(tmp_path)
    (tmp_path / "one.py").unlink()
    _migration(tmp_path, "one.py", "one", "two")
    _migration(tmp_path, "two.py", "two", "one")
    with pytest.raises(ValueError, match="Ciclo"):
        module.alembic_graph(tmp_path)


def test_fixture_is_verified_and_never_overwritten(tmp_path):
    path = module.create_fixture(tmp_path)
    info = module.verify_fixture(path)
    assert info["commercial_data"] is False
    assert info["upload_entries"] == 1
    with pytest.raises(FileExistsError):
        module.create_fixture(tmp_path)


def test_modified_sql_or_archive_is_rejected(tmp_path):
    path = module.create_fixture(tmp_path)
    sql = tmp_path / "hjstorevp_e53_synthetic.sql.gz"
    with sql.open("ab") as writer:
        writer.write(b"ALTERED")
    with pytest.raises(ValueError, match="SHA256"):
        module.verify_fixture(path)


def test_manifest_does_not_allow_commercial_backup_or_traversal(tmp_path):
    path = module.create_fixture(tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["real_backup"] = True
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValueError, match="Prohibido"):
        module.verify_fixture(path)
    data["real_backup"] = False
    data["database"]["filename"] = "../../private.sql.gz"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValueError, match="Nombre"):
        module.verify_fixture(path)


def test_rehearsal_refuses_noncanonical_fixture(tmp_path):
    path = module.create_fixture(tmp_path)
    with pytest.raises(ValueError, match="canónico"):
        module.rehearse(path)


def test_compose_dedicated_to_recovery():
    compose = (module.ROOT / "docker-compose.staging-recovery.yml").read_text(encoding="utf-8")
    assert "name: hjstorevp-staging-recovery" in compose
    assert "db-recovery:" in compose
    assert "tmpfs:" in compose
    assert "ports:" not in compose.replace("# No puertos", "")
    assert "hjstore_recovery_fixture" in compose
    assert "volumes:" not in compose


def test_rehearsal_blocks_unhealthy_container(tmp_path, monkeypatch):
    """No se importa SQL si MariaDB todavía inicializa InnoDB."""
    from unittest.mock import Mock

    manifest = module.create_fixture(tmp_path)
    monkeypatch.setattr(module, "FIXTURES", tmp_path)
    monkeypatch.setattr(module, "COMPOSE", module.ROOT / "docker-compose.staging-recovery.yml")
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if "ps" in cmd:
            return Mock(returncode=0, stdout="db-recovery\n")
        if "healthcheck.sh" in cmd:
            return Mock(returncode=1, stdout="")
        raise AssertionError("No se debe enviar SQL si MariaDB no está saludable")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    with pytest.raises(module.RecoveryStageError, match="DB_HEALTHCHECK_FAILED"):
        module.rehearse(manifest)
    assert len(calls) == 2
    assert "healthcheck.sh" in calls[1]


def test_restore_reports_safe_import_failure_stage(tmp_path, monkeypatch):
    """Sólo mostrar código de etapa, no stderr ni contraseña ni SQL."""
    from unittest.mock import Mock

    manifest = module.create_fixture(tmp_path)
    monkeypatch.setattr(module, "FIXTURES", tmp_path)
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if "ps" in cmd:
            return Mock(returncode=0, stdout="db-recovery\n")
        if "healthcheck.sh" in cmd:
            return Mock(returncode=0, stdout="")
        if kwargs.get("input") is not None:
            assert kwargs["input"] == module.SQL
            assert kwargs.get("stdin") is None
            return Mock(returncode=1, stderr=b"SECRET-DO-NOT-PRINT")
        if "SELECT 1" in " ".join(cmd):
            return Mock(returncode=0, stdout=b"1\n")
        raise AssertionError("No deben ejecutarse consultas tras fallo de importación")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    with pytest.raises(module.RecoveryStageError, match="SQL_IMPORT_FAILED_UNCLASSIFIED") as exc:
        module.rehearse(manifest)
    assert "SECRET-DO-NOT-PRINT" not in str(exc.value)
    assert len(calls) == 4


def test_sql_connection_failure_prevents_import(tmp_path, monkeypatch):
    """Rechazar el SQL si el cliente no puede conectar, sin intentar importar."""
    from unittest.mock import Mock

    manifest = module.create_fixture(tmp_path)
    monkeypatch.setattr(module, "FIXTURES", tmp_path)
    commands = []

    def fake_run(cmd, **kwargs):
        commands.append(cmd)
        if "ps" in cmd:
            return Mock(returncode=0, stdout="db-recovery\n")
        if "healthcheck.sh" in cmd:
            return Mock(returncode=0)
        if "SELECT 1" in " ".join(cmd):
            return Mock(returncode=1, stderr=b"ERROR 1045 (28000): Access denied for user")
        raise AssertionError("No importar SQL si el cliente no autentica")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    with pytest.raises(module.RecoveryStageError, match="SQL_CONNECTION_FAILED_AUTHENTICATION"):
        module.rehearse(manifest)
    assert len(commands) == 3


def test_error_classification_is_non_sensitive():
    assert module.classify_mariadb_failure(b"ERROR 1062 Duplicate entry for key") == "DUPLICATE_SYNTHETIC_MARKER"
    assert module.classify_mariadb_failure(b"ERROR 1049 Unknown database") == "DATABASE_MISSING"
    assert module.classify_mariadb_failure(b"random SECRET=123") == "UNCLASSIFIED"


def test_sql_rehearsal_sends_plaintext_bytes_not_gzip_fd(tmp_path, monkeypatch):
    """La entrada que recibe Docker es SQL descomprimido, nunca el archivo .gz."""
    from unittest.mock import Mock

    manifest = module.create_fixture(tmp_path)
    monkeypatch.setattr(module, "FIXTURES", tmp_path)
    inputs = []

    def fake_run(cmd, **kwargs):
        if "ps" in cmd:
            return Mock(returncode=0, stdout="db-recovery\n")
        if "healthcheck.sh" in cmd:
            return Mock(returncode=0)
        if "SELECT 1" in " ".join(cmd):
            return Mock(returncode=0, stdout=b"1\n")
        if kwargs.get("input") is not None:
            inputs.append(kwargs["input"])
            assert kwargs.get("stdin") is None
            return Mock(returncode=0)
        if "SELECT marker" in " ".join(cmd):
            return Mock(returncode=0, stdout=module.MARKER + "\n")
        raise AssertionError("Unexpected subprocess in recovery rehearsal")

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    result = module.rehearse(manifest)
    assert result["restore"] == "verified"
    assert inputs == [module.SQL]
    assert not inputs[0].startswith(b"\x1f\x8b")
