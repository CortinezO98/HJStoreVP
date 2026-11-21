"""E.5.2 static contract: no Compose start, no secrets, no network."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = (ROOT / "docker-compose.production.yml").read_text(encoding="utf-8")
BACKEND = (ROOT / "backend/Dockerfile.production").read_text(encoding="utf-8")
FRONT = (ROOT / "frontend/Dockerfile.production").read_text(encoding="utf-8")
ADMIN = (ROOT / "frontend-admin/Dockerfile.production").read_text(encoding="utf-8")


def test_compose_is_separate_and_fails_without_required_values():
    assert "name: hjstorevp-prod-candidate" in COMPOSE
    for name in (
        "PROD_DB_PASSWORD", "PROD_DB_ROOT_PASSWORD",
        "PROD_SECRET_KEY", "PROD_FIRST_ADMIN_PASSWORD",
        "PROD_FIRST_ADMIN_EMAIL", "PROD_API_URL", "PROD_STORE_URL",
        "PROD_ADMIN_URL",
    ):
        assert "${" + name + ":?" in COMPOSE
    assert "hjstorevp_db" not in COMPOSE
    assert "hjstorevp_backend" not in COMPOSE


def test_candidate_rejects_development_behavior_and_live_providers():
    assert "ENVIRONMENT: production" in COMPOSE
    assert 'DEBUG: "false"' in COMPOSE
    assert 'WOMPI_ALLOW_LIVE_PAYMENTS: "false"' in COMPOSE
    assert 'EMAIL_LIVE_DELIVERY_ALLOWED: "false"' in COMPOSE
    assert 'CART_RECOVERY_LIVE_ALLOWED: "false"' in COMPOSE
    assert "--reload" not in COMPOSE
    assert "./backend:/app" not in COMPOSE
    assert "alembic upgrade" not in COMPOSE
    assert "create_all(" not in COMPOSE


def test_database_and_redis_are_not_exposed():
    for service in ("db", "redis"):
        # Servicio YAML bajo services: usa indentación exacta de 2 espacios.
        # El bloque termina ante el SIGUIENTE servicio (2 espacios),
        # no ante su primera línea; evitar falsos negativos.
        match = re.search(
            rf"(?ms)^  {service}:\n(.*?)(?=^  [a-z][a-z0-9-]*:|^networks:|^volumes:|\Z)",
            COMPOSE,
        )
        assert match is not None, f"No se encontró servicio {service}"
        section = match.group(1)
        assert not re.search(r"(?m)^    ports:", section), f"{service} publica puertos"
        assert re.search(r"(?m)^    networks: \[internal\]$", section), (
            f"{service} no está limitado a red interna"
        )
    assert "internal: true" in COMPOSE
    assert "127.0.0.1:28000:8000" in COMPOSE
    assert "127.0.0.1:28080:8080" in COMPOSE
    assert "127.0.0.1:28081:8080" in COMPOSE
    assert "3306:3306" not in COMPOSE
    assert "6379:6379" not in COMPOSE


def test_backend_image_has_no_reload_and_runs_as_nonroot():
    assert "--reload" not in BACKEND
    assert re.search(r"^USER appuser$", BACKEND, re.M)
    assert "Dockerfile.production" in COMPOSE
    assert "COPY --chown=appuser:appgroup" in BACKEND
    assert "/app/uploads" in BACKEND


def test_frontends_build_static_assets_and_serve_via_nginx():
    for df, folder in ((FRONT, "frontend"), (ADMIN, "frontend-admin")):
        assert "npm run build" in df
        assert "COPY --from=builder /app/dist" in df
        assert "nginx-unprivileged" in df
        assert 'npm", "run", "dev' not in df
        conf = (ROOT / folder / "nginx.production.conf").read_text(encoding="utf-8")
        assert "try_files $uri $uri/ /index.html;" in conf
        assert "listen 8080;" in conf
