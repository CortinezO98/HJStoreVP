"""Regresión C-01: los pagos ficticios requieren autorización explícita."""
import pytest
from pydantic import ValidationError
from app.core.config import Settings, settings
from app.main import app
from tests.test_main import client, setup_db, auth_headers, TestWebOrderStockReservations as StockFixture

@pytest.mark.parametrize("environment", ["staging", "production", "development", "test"])
def test_demo_deshabilitado(client, monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "ALLOW_DEMO_PAYMENTS", False)
    assert client.post("/api/v1/payments/confirm-demo", json={"order_number": "NO-EXISTE"}).status_code == 404

@pytest.mark.parametrize("environment", ["staging", "production"])
def test_demo_no_admite_flag_fuera_de_desarrollo(client, monkeypatch, environment):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "ALLOW_DEMO_PAYMENTS", True)
    assert client.post("/api/v1/payments/confirm-demo", json={"order_number": "NO-EXISTE"}).status_code == 404
    with pytest.raises(ValidationError, match="ALLOW_DEMO_PAYMENTS"):
        Settings(ENVIRONMENT=environment, ALLOW_DEMO_PAYMENTS=True)

def test_entorno_invalido_rechazado():
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="prod")

def test_demo_explicito_en_desarrollo(client, monkeypatch, auth_headers):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEMO_PAYMENTS", True)
    product_id, _ = StockFixture.create_stock(qty=5)
    response = client.post("/api/v1/orders/web", json=StockFixture.payload(product_id, qty=1), headers=auth_headers)
    assert response.status_code == 201, response.text
    paid = client.post("/api/v1/payments/confirm-demo", json={"order_number": response.json()["order_number"]}, headers=auth_headers)
    assert paid.status_code == 200, paid.text

def test_demo_ausente_en_openapi():
    assert "/api/v1/payments/confirm-demo" not in app.openapi()["paths"]
