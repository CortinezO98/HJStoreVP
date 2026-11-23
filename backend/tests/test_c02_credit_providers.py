"""C-02: pruebas sin conexiones ni credenciales reales."""
import pytest
import httpx
from unittest.mock import AsyncMock, patch
from pydantic import ValidationError
from app.core.config import Settings, settings
from app.services import credito
from tests.test_main import client, setup_db, auth_headers, TestWebOrderStockReservations as StockFixture

@pytest.mark.parametrize("url", ["http://example.com", "https://sistecréditos.example", "https://user:pass@example.com", "https://example.com?key=abc", "https://example.com/#fragment"])
@pytest.mark.parametrize("field", ["SISTECREDITO_BASE_URL", "ADDI_BASE_URL"])
def test_url_insegura(url, field):
    with pytest.raises(ValidationError):
        Settings(**{field: url})

@pytest.mark.parametrize("method,flag", [("addi", "ADDI_INTEGRATION_VERIFIED"), ("sistecreditos", "SISTECREDITO_INTEGRATION_VERIFIED")])
def test_integracion_no_verificada(client, auth_headers, monkeypatch, method, flag):
    monkeypatch.setattr(settings, flag, False)
    methods = client.get("/api/v1/payments/methods").json()
    assert next(m for m in methods if m["id"] == method)["enabled"] is False
    product_id, _ = StockFixture.create_stock(qty=5)
    order = client.post("/api/v1/orders/web", json=StockFixture.payload(product_id, qty=1), headers=auth_headers)
    assert order.status_code == 201, order.text
    response = client.post("/api/v1/payments/initiate", json={"order_number": order.json()["order_number"], "method": method}, headers=auth_headers)
    assert response.status_code == 503, response.text

@pytest.mark.asyncio
async def test_sistecredito_llave_solo_en_encabezado(monkeypatch):
    values = {"ENVIRONMENT": "test", "SISTECREDITO_INTEGRATION_VERIFIED": True,
              "SISTECREDITO_BASE_URL": "https://provider.example/v1", "SISTECREDITOS_ENV": "sandbox",
              "SISTECREDITOS_API_KEY": "clave-ficticia", "SISTECREDITOS_STORE_ID": "tienda",
              "SISTECREDITOS_SECRET": "secreto-ficticio", "SISTECREDITOS_REDIRECT_URL": "https://store.example/confirmado"}
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)
    response = httpx.Response(200, json={"url": "https://provider.example/session/123"}, request=httpx.Request("POST", "https://provider.example/v1/checkout"))
    with patch("app.services.credito.httpx.AsyncClient") as factory:
        post = AsyncMock(return_value=response)
        factory.return_value.__aenter__.return_value.post = post
        url = await credito.build_sistecreditos_url("TEST", 1000, "test@example.com", "Cliente", "", "")
        assert "clave-ficticia" not in url
        assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer clave-ficticia"
        assert "clave-ficticia" not in str(post.call_args.kwargs["json"])
        response = httpx.Response(200, json={"url": "https://provider.example/session?key=clave-ficticia"}, request=httpx.Request("POST", "https://provider.example/v1/checkout"))
        post.return_value = response
        with pytest.raises(ValueError):
            await credito.build_sistecreditos_url("TEST", 1000, "test@example.com", "Cliente", "", "")
