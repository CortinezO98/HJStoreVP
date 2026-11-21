"""Fase E.3.2 — contratos HTTP con proveedor Wompi enteramente simulado.

NO abre conexiones a la pasarela. Usa la SQLite efímera impuesta por conftest.
"""
from uuid import uuid4

import httpx
import pytest

import app.api.v1.endpoints.payments as payments
from app.models.models import (
    Inventory, Order, OrderStatus, OrderStockReservation, PostSaleCase,
    PostSaleEvent, Shipment, ShipmentEvent, StockMovement,
)
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations as StockFixture,
    setup_db, client, auth_headers,
)


def _purchase(client, auth_headers):
    product_id, inv_id = StockFixture.create_stock(qty=5)
    created = client.post(
        "/api/v1/orders/web",
        headers={**auth_headers, "Idempotency-Key": uuid4().hex},
        json=StockFixture.payload(product_id, qty=2),
    )
    assert created.status_code == 201, created.text
    return created.json(), inv_id


def _transaction(order, status="APPROVED"):
    return {
        "id": "E32-" + str(order["id"]),
        "reference": order["order_number"],
        "amount_in_cents": int(round(order["total_amount"] * 100)),
        "currency": "COP",
        "status": status,
    }


def _event(tx):
    return {
        "event": "transaction.updated",
        "environment": "test",
        "data": {"transaction": {"id": tx["id"], "reference": tx["reference"]}},
    }


def _mock_gateway(monkeypatch, tx, *, fail=False):
    monkeypatch.setattr(payments, "wompi_enabled", lambda: True)
    monkeypatch.setattr(
        payments, "verify_wompi_sig",
        lambda event, signature: signature == "e32-valid-test-only",
    )

    async def fake_provider(transaction_id):
        if fail:
            raise httpx.ConnectError("Conexión simulada caída")
        assert transaction_id == tx["id"]
        return dict(tx)

    monkeypatch.setattr(payments, "get_wompi_transaction", fake_provider)


def _snapshot(oid, iid):
    db = TestingSession()
    try:
        order = db.get(Order, oid)
        return (
            order.status.value,
            db.get(Inventory, iid).qty_available,
            tuple(item.status for item in db.query(OrderStockReservation)
                  .filter_by(order_id=oid).all()),
            db.query(StockMovement).count(),
        )
    finally:
        db.close()


def _webhook(client, tx, signature="e32-valid-test-only"):
    return client.post(
        "/api/v1/payments/webhook/wompi", json=_event(tx),
        headers={"x-event-checksum": signature},
    )


def test_webhook_invalid_signature_never_contacts_provider_or_changes_order(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    _mock_gateway(monkeypatch, tx)
    before = _snapshot(order["id"], iid)
    res = _webhook(client, tx, signature="incorrect")
    assert res.status_code == 401, res.text
    assert _snapshot(order["id"], iid) == before


def test_webhook_provider_outage_returns_503_and_preserves_reservation(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    _mock_gateway(monkeypatch, tx, fail=True)
    before = _snapshot(order["id"], iid)
    res = _webhook(client, tx)
    assert res.status_code == 503, res.text
    assert _snapshot(order["id"], iid) == before


def test_webhook_approval_and_duplicate_do_not_double_debit_stock(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    _mock_gateway(monkeypatch, tx)
    first = _webhook(client, tx)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "paid"
    settled = _snapshot(order["id"], iid)
    assert settled[:3] == ("paid", 3, ("committed",))
    again = _webhook(client, tx)
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "paid"
    assert _snapshot(order["id"], iid) == settled


def test_webhook_rejects_wrong_provider_amount_without_mutation(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    tx["amount_in_cents"] = 1
    _mock_gateway(monkeypatch, tx)
    before = _snapshot(order["id"], iid)
    res = _webhook(client, tx)
    assert res.status_code == 409, res.text
    assert _snapshot(order["id"], iid) == before


def test_reconciliation_requires_owner_and_idempotently_confirms_payment(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    _mock_gateway(monkeypatch, tx)
    payload = {"order_number": order["order_number"], "transaction_id": tx["id"]}
    endpoint = "/api/v1/payments/wompi/reconcile"
    assert client.post(endpoint, json=payload).status_code == 401
    first = client.post(endpoint, json=payload, headers=auth_headers)
    assert first.status_code == 200, first.text
    assert first.json() == {"status": "paid", "changed": True}
    settled = _snapshot(order["id"], iid)
    repeat = client.post(endpoint, json=payload, headers=auth_headers)
    assert repeat.status_code == 200, repeat.text
    assert repeat.json() == {"status": "paid", "changed": False}
    assert _snapshot(order["id"], iid) == settled


def test_paid_dispatch_return_and_external_refund_tracking(
    client, auth_headers, monkeypatch,
):
    order, iid = _purchase(client, auth_headers)
    tx = _transaction(order)
    _mock_gateway(monkeypatch, tx)
    assert _webhook(client, tx).status_code == 200

    # El checkout guarda la transportadora y servicio contratados.
    # El despacho no debe poder sustituirlos por valores inventados.
    db = TestingSession()
    try:
        shipping = dict(db.get(Order, order["id"]).shipping_address or {})
    finally:
        db.close()
    assert shipping.get("carrier") and shipping.get("shipping_service")
    tracking = "E32-TRACK-" + str(order["id"])
    wrong_carrier = client.post(
        f"/api/v1/shipments/orders/{order['id']}/dispatch",
        json={"carrier": "Otra transportadora", "service": shipping["shipping_service"],
              "tracking_number": tracking},
        headers=auth_headers,
    )
    assert wrong_carrier.status_code == 409, wrong_carrier.text
    wrong_service = client.post(
        f"/api/v1/shipments/orders/{order['id']}/dispatch",
        json={"carrier": shipping["carrier"], "service": "Servicio no contratado",
              "tracking_number": tracking},
        headers=auth_headers,
    )
    assert wrong_service.status_code == 409, wrong_service.text
    dispatched = client.post(
        f"/api/v1/shipments/orders/{order['id']}/dispatch",
        json={"carrier": shipping["carrier"], "service": shipping["shipping_service"],
              "tracking_number": tracking},
        headers=auth_headers,
    )
    assert dispatched.status_code == 201, dispatched.text
    for state in ("in_transit", "out_for_delivery", "delivered"):
        advanced = client.post(
            f"/api/v1/shipments/orders/{order['id']}/events",
            json={"status": state, "note": "Simulación controlada"},
            headers=auth_headers,
        )
        assert advanced.status_code == 200, advanced.text
    claim = client.post(
        "/api/v1/post-sale",
        json={
            "order_id": order["id"], "kind": "return",
            "order_item_id": order["items"][0]["id"], "qty": 1,
            "reason": "Revisión sintética",
            "description": "Devolución de una unidad en prueba aislada",
        },
        headers=auth_headers,
    )
    assert claim.status_code == 201, claim.text
    case_id = claim.json()["id"]
    approved = client.post(
        f"/api/v1/post-sale/{case_id}/review",
        json={"status": "approved", "note": "Aprobación para prueba aislada"},
        headers=auth_headers,
    )
    assert approved.status_code == 200, approved.text
    received = client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "resellable", "note": "Unidad revisada y revendible"},
        headers=auth_headers,
    )
    assert received.status_code == 200, received.text
    assert received.json()["restocked_qty"] == 1
    duplicate = client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "resellable", "note": "Intento de doble recepción"},
        headers=auth_headers,
    )
    assert duplicate.status_code == 409
    requested = client.post(
        f"/api/v1/post-sale/{case_id}/request-refund",
        json={"note": "Gestión externa en el proveedor de prueba"},
        headers=auth_headers,
    )
    assert requested.status_code == 200, requested.text
    assert requested.json()["refund_status"] == "pending_external"
    not_verified = client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "E32-EXTERNAL-REF",
              "confirmation_note": "No se consultó proveedor externo",
              "explicitly_verified_externally": False},
        headers=auth_headers,
    )
    assert not_verified.status_code == 422
    recorded = client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "E32-EXTERNAL-REF",
              "confirmation_note": "Confirmación externa simulada SOLO en test",
              "explicitly_verified_externally": True},
        headers=auth_headers,
    )
    assert recorded.status_code == 200, recorded.text
    assert recorded.json()["refund_status"] == "externally_recorded"
    assert client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "E32-EXTERNAL-REF",
              "confirmation_note": "Segundo registro prohibido",
              "explicitly_verified_externally": True},
        headers=auth_headers,
    ).status_code == 409

    db = TestingSession()
    try:
        assert db.get(Order, order["id"]).status == OrderStatus.DELIVERED
        assert db.get(Inventory, iid).qty_available == 4
        assert db.query(Shipment).filter_by(order_id=order["id"]).count() == 1
        assert db.query(ShipmentEvent).count() == 4
        assert db.query(PostSaleCase).count() == 1
        assert db.query(PostSaleEvent).filter_by(case_id=case_id).count() >= 4
        assert db.query(StockMovement).count() == 1
    finally:
        db.close()
