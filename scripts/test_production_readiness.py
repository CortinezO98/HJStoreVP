"""Pruebas E.5.1 para auditoría estática: jamás importar backend ni abrir redes."""
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("production_readiness.py")
spec = importlib.util.spec_from_file_location("production_readiness", SCRIPT)
module = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)


@pytest.fixture
def skeleton(tmp_path):
    for directory in ("backend/app/core", "backend/app", "backend/alembic"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    files = {
        "docker-compose.yml": (
            "services:\n  backend:\n    environment:\n"
            "      - ENVIRONMENT=development\n"
            "      - SECRET_KEY=${SECRET_KEY:-changeme_in_production_use_long_random_string}\n"
            "      - DATABASE_URL=mysql+pymysql://u:${DB_PASSWORD:-hjstore123}@db/d\n"
            "    volumes:\n      - ./backend:/app\n"
            "    ports:\n      - '127.0.0.1:8000:8000'\n"
            "    command: uvicorn app.main:app --reload\n"
        ),
        "backend/Dockerfile": "FROM python:3.12-slim\nCMD [\"uvicorn\", \"app.main:app\", \"--reload\"]\n",
        "backend/app/core/config.py": (
            'if self.DEBUG:\n    raise ValueError("DEBUG debe ser false")\n'
            'raise ValueError("ALLOWED_ORIGINS debe contener https://")\n'
            'raise ValueError("SECRET_KEY insegura")\n'
            'raise ValueError("Protecciones Redis de autenticación obligatorias")\n'
        ),
        "backend/app/main.py": 'docs_url="/docs" if settings.ENVIRONMENT != "production" else None\n',
        "backend/alembic/env.py": "def run_migrations_online(): pass\n",
        ".gitignore": ".env\n*.key\n",
        "docker-compose.e2e.yml": "name: hjstorevp-e2e\ntmpfs:\n",
    }
    for filename, contents in files.items():
        (tmp_path / filename).write_text(contents, encoding="utf-8")
    return tmp_path


def test_development_settings_are_blocking(skeleton):
    checks = module.inspect_repository(skeleton)
    blockers = {x.code for x in checks if x.status == "BLOCKER"}
    assert {"COMPOSE_DEV_ENV", "COMPOSE_RELOAD", "COMPOSE_DB_FALLBACK",
            "COMPOSE_SECRET_FALLBACK", "CODE_BIND_MOUNT", "IMAGE_RELOAD"} <= blockers
    assert module.main(["--repo-root", str(skeleton)]) == 2


def test_missing_files_fail_closed(tmp_path):
    checks = module.inspect_repository(tmp_path)
    codes = {x.code for x in checks if x.status == "BLOCKER"}
    assert {"COMPOSE_MISSING", "DOCKERFILE_MISSING", "SETTINGS_MISSING",
            "MAIN_MISSING", "ALEMBIC_PRESENT"} <= codes


def test_report_has_no_secrets_or_environment_values(skeleton, capsys):
    (skeleton / "docker-compose.yml").write_text(
        'services:\n  backend:\n    environment:\n      - SECRET_KEY=very-private-SENTINEL\n',
        encoding="utf-8",
    )
    assert module.main(["--repo-root", str(skeleton), "--json"]) in (1, 2)
    output = capsys.readouterr().out
    report = json.loads(output)
    assert report["ready_for_production"] is False
    assert "very-private-SENTINEL" not in output
    assert "checks" in report


def test_nonblocking_repository_still_requires_manual_approval(skeleton):
    (skeleton / "docker-compose.yml").write_text(
        "services:\n  backend:\n    ports:\n      - '127.0.0.1:8000:8000'\n",
        encoding="utf-8",
    )
    (skeleton / "backend/Dockerfile").write_text(
        "FROM python:3.12-slim\nUSER 10001\n", encoding="utf-8",
    )
    checks = module.inspect_repository(skeleton)
    assert not any(x.status == "BLOCKER" for x in checks)
    assert module.summarize(checks)["ready_for_production"] is False
    assert module.main(["--repo-root", str(skeleton), "--json"]) == 1


def test_real_repository_is_not_marked_as_production_ready():
    repo = SCRIPT.resolve().parents[1]
    findings = module.inspect_repository(repo)
    assert module.summarize(findings)["ready_for_production"] is False
    assert any(c.status == "BLOCKER" for c in findings)
