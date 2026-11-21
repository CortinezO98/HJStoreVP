"""Fase E.3: conciliación simulada, invariantes de stock y operaciones.

No llama a Wompi ni a transportadoras; SQLite efímera obligatoria por conftest.
"""
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.payments import apply_wompi_transaction
from app.models.models import (
    Inventory, Order, OrderStatus, OrderStockReservation, PostSaleCase, Shipment,
    StockMovement,
)
from app.services.stock_reservations import lock_web_order
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations as StockFixture,
    setup_db, client, auth_headers,
)


def _order(client, headers):
    product_id, inventory_id = StockFixture.create_stock(qty=5)
    response = client.post(
        "/api/v1/orders/web",
        json=StockFixture.payload(product_id, qty=2),
        headers={**headers, "Idempotency-Key": uuid4().hex},
    )
    assert response.status_code == 201, response.text
    return response.json(), inventory_id


def _tx(order, status="APPROVED", **changes):
    transaction = {
        "id": "E3-TX-" + str(order["id"]),
        "reference": order["order_number"],
        "amount_in_cents": int(round(order["total_amount"] * 100)),
        "currency": "COP",
        "status": status,
    }
    transaction.update(changes)
    return transaction


def _snapshot(order_id, inventory_id):
    db = TestingSession()
    try:
        return (
            db.get(Order, order_id).status,
            db.get(Inventory, inventory_id).qty_available,
            tuple(row.status for row in db.query(OrderStockReservation)
                  .filter_by(order_id=order_id).order_by(OrderStockReservation.id)),
            db.query(StockMovement).count(),
        )
    finally:
        db.close()


def _apply(order_id, transaction):
    db = TestingSession()
    try:
        locked = lock_web_order(db, order_id)
        result = apply_wompi_transaction(db, locked, transaction)
        if result["changed"]:
            db.commit()
        else:
            db.rollback()
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def test_approved_payment_replay_keeps_single_reservation(client, auth_headers):
    order, inv_id = _order(client, auth_headers)
    assert _snapshot(order["id"], inv_id)[:3] == (OrderStatus.PENDING, 3, ("held",))
    transaction = _tx(order)
    first = _apply(order["id"], transaction)
    assert first == {"status": "paid", "changed": True}
    settled = _snapshot(order["id"], inv_id)
    assert settled[:3] == (OrderStatus.PAID, 3, ("committed",))
    duplicate = _apply(order["id"], transaction)
    assert duplicate == {"status": "paid", "changed": False}
    assert _snapshot(order["id"], inv_id) == settled


def test_declined_payment_replay_releases_stock_only_once(client, auth_headers):
    order, inv_id = _order(client, auth_headers)
    transaction = _tx(order, "DECLINED")
    assert _apply(order["id"], transaction) == {"status": "cancelled", "changed": True}
    cancelled = _snapshot(order["id"], inv_id)
    assert cancelled[:3] == (OrderStatus.CANCELLED, 5, ("released",))
    assert _apply(order["id"], transaction) == {"status": "cancelled", "changed": False}
    assert _snapshot(order["id"], inv_id) == cancelled


@pytest.mark.parametrize("change", [
    {"reference": "WEB-FORGED"},
    {"amount_in_cents": 1},
    {"currency": "USD"},
    {"id": ""},
])
def test_mismatched_provider_transaction_cannot_change_order(client, auth_headers, change):
    order, inv_id = _order(client, auth_headers)
    before = _snapshot(order["id"], inv_id)
    with pytest.raises(HTTPException) as error:
        _apply(order["id"], _tx(order, **change))
    assert error.value.status_code == 409
    assert _snapshot(order["id"], inv_id) == before


def test_paid_order_rejects_contradictory_decline(client, auth_headers):
    order, inv_id = _order(client, auth_headers)
    assert _apply(order["id"], _tx(order))["changed"]
    before = _snapshot(order["id"], inv_id)
    with pytest.raises(HTTPException) as error:
        _apply(order["id"], _tx(order, "DECLINED"))
    assert error.value.status_code == 409
    assert _snapshot(order["id"], inv_id) == before


def test_cancelled_order_rejects_late_payment(client, auth_headers):
    order, inv_id = _order(client, auth_headers)
    assert _apply(order["id"], _tx(order, "DECLINED"))["changed"]
    before = _snapshot(order["id"], inv_id)
    with pytest.raises(HTTPException) as error:
        _apply(order["id"], _tx(order, "APPROVED"))
    assert error.value.status_code == 409
    assert _snapshot(order["id"], inv_id) == before


def test_pending_cannot_dispatch_or_open_refund_case(client, auth_headers):
    order, inv_id = _order(client, auth_headers)
    dispatched = client.post(
        f"/api/v1/shipments/orders/{order['id']}/dispatch",
        json={"carrier": "Prueba", "service": "E3", "tracking_number": "E3-PENDING"},
        headers=auth_headers,
    )
    assert dispatched.status_code == 409
    claimed = client.post("/api/v1/post-sale", json={
        "order_id": order["id"],
        "kind": "return", "order_item_id": order["items"][0]["id"],
        "qty": 1, "reason": "Devolución inválida",
        "description": "No se pagó este pedido de prueba",
    }, headers=auth_headers)
    assert claimed.status_code == 409
    db = TestingSession()
    try:
        assert db.query(Shipment).count() == 0
        assert db.query(PostSaleCase).count() == 0
    finally:
        db.close()
    assert _snapshot(order["id"], inv_id)[:3] == (OrderStatus.PENDING, 3, ("held",))
