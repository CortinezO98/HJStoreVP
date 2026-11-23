"""A-04: regresión de encabezados HTTP del backend."""
import pytest
from tests.test_main import client, setup_db
from app.core.config import settings

@pytest.mark.parametrize("path,status", [("/health", 200), ("/ruta-inexistente-a04", 404)])
def test_encabezados_http(client, path, status):
    response = client.get(path)
    assert response.status_code == status
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["permissions-policy"]

@pytest.mark.parametrize("environment", ["staging", "production"])
def test_hsts_backend(client, monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    response = client.get("/health")
    assert response.status_code == 200
    assert "max-age=" in response.headers["strict-transport-security"]
