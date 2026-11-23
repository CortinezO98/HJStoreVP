"""A-01: conciliación independiente y conservación de reservas, sin red."""
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
import httpx
from app.api.v1.endpoints import payments
from app.core.config import settings
from app.services import credito
from app.models.models import Order, OrderStatus, OrderStockReservation
from tests.test_main import client, setup_db, auth_headers, TestingSession, TestWebOrderStockReservations as StockFixture

@pytest.mark.parametrize("provider,id_field,amount_field,final", [
    ("addi", "applicationId", "totalAmount", "PAID"),
    ("sistecreditos", "transactionId", "amount", "DISBURSED"),
])
@pytest.mark.parametrize("scenario", ["valid", "amount", "currency", "reference", "id", "status", "unavailable", "active", "failed", "signature"])
def test_credit_webhook(client, auth_headers, monkeypatch, provider, id_field, amount_field, final, scenario):
    product_id, _ = StockFixture.create_stock(qty=5)
    created = client.post("/api/v1/orders/web", json=StockFixture.payload(product_id, qty=1),
                          headers={**auth_headers, "Idempotency-Key": uuid4().hex})
    assert created.status_code == 201, created.text
    order = created.json()
    with TestingSession() as db:
        row = db.get(Order, order["id"])
        row.payment_method = provider
        db.commit()
    event = {"orderId": order["order_number"], id_field: "TX-123", "status": final}
    tx = {**event, amount_field: str(order["total_amount"]), "currency": "COP"}
    expected = 200
    if scenario == "amount":
        tx[amount_field] = "0.01"
    elif scenario == "currency":
        tx["currency"] = "USD"
    elif scenario == "reference":
        tx["orderId"] = "OTRO"
    elif scenario == "id":
        tx[id_field] = "OTRO"
    elif scenario == "status":
        tx["status"] = "PENDING"
    elif scenario == "active":
        tx["status"] = event["status"] = "ACTIVE"
    elif scenario == "failed":
        tx["status"] = event["status"] = "REJECTED"
    if scenario in ("amount", "currency", "reference", "id", "status"):
        expected = 409
    if scenario == "unavailable":
        expected = 503
    if scenario == "signature":
        expected = 401
    fetch = AsyncMock(return_value=tx)
    if scenario == "unavailable":
        fetch.side_effect = httpx.ConnectError("simulado")
    monkeypatch.setattr(payments, "verify_addi_webhook" if provider == "addi" else "verify_sistecreditos_webhook",
                        lambda *_: scenario != "signature")
    monkeypatch.setattr(payments, "get_addi_application" if provider == "addi" else "get_sistecreditos_transaction", fetch)
    response = client.post(f"/api/v1/payments/webhook/{provider}", json=event)
    assert response.status_code == expected, response.text
    if scenario == "signature":
        fetch.assert_not_awaited()
    if scenario in ("valid", "failed"):
        replay = client.post(f"/api/v1/payments/webhook/{provider}", json=event)
        assert replay.status_code == 200, replay.text
    with TestingSession() as db:
        row = db.get(Order, order["id"])
        assert row.status == (OrderStatus.PAID if scenario == "valid" else OrderStatus.CANCELLED if scenario == "failed" else OrderStatus.PENDING)
        reservations = db.query(OrderStockReservation).filter_by(order_id=row.id).all()
        assert reservations
        assert all(r.status == ("committed" if scenario == "valid" else "released" if scenario == "failed" else "held") for r in reservations)

def test_addi_secreto_independiente(monkeypatch):
    import hashlib
    import hmac
    values = {"ENVIRONMENT": "test", "ADDI_INTEGRATION_VERIFIED": True, "ADDI_ENV": "sandbox",
              "ADDI_BASE_URL": "https://provider.example", "ADDI_CLIENT_ID": "cliente",
              "ADDI_CLIENT_SECRET": "oauth-ficticio", "ADDI_WEBHOOK_SECRET": "webhook-ficticio",
              "ADDI_REDIRECT_URL": "https://store.example/confirmado"}
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)
    payload = "{}"
    def sign(secret):
        return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    assert credito.verify_addi_webhook(payload, sign("webhook-ficticio"))
    assert not credito.verify_addi_webhook(payload, sign("oauth-ficticio"))
    monkeypatch.setattr(settings, "ADDI_WEBHOOK_SECRET", "oauth-ficticio")
    assert not credito.addi_enabled()
