"""Fase E.2 — regresiones de compra y sesión aisladas de toda BD comercial.

Las fixtures heredadas instalan un SQLite temporal; nunca se usa Wompi real.
"""
from uuid import uuid4

import pytest

from app.models.models import Inventory, Order, OrderStockReservation, User, UserRole
from app.core.security import verify_password
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations,
    setup_db, client, auth_headers,
)


def _stock(qty=5):
    return TestWebOrderStockReservations.create_stock(qty)


def _payload(product_id, qty=2):
    return TestWebOrderStockReservations.payload(product_id, qty)


def _key():
    return uuid4().hex


def _post_order(client, payload, headers, key=None):
    return client.post(
        "/api/v1/orders/web", json=payload,
        headers={**headers, "Idempotency-Key": key or _key()},
    )


def _counts(inventory_id):
    db = TestingSession()
    try:
        available = db.get(Inventory, inventory_id).qty_available
        orders = db.query(Order).count()
        reservations = db.query(OrderStockReservation).count()
        return available, orders, reservations
    finally:
        db.close()


def test_customer_register_creates_customer_and_usable_session(client):
    email = "phase-e2-" + uuid4().hex[:12] + "@example.test"
    payload = {
        "full_name": "Cliente E2", "email": email,
        "password": "Safe-Pass-12345", "phone": "3000000000",
    }
    registered = client.post("/api/v1/auth/register", json=payload)
    assert registered.status_code == 201, registered.text
    data = registered.json()
    assert data["user_role"] == "customer"
    assert data["access_token"] and data["refresh_token"]
    headers = {"Authorization": "Bearer " + data["access_token"]}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == email
    db = TestingSession()
    try:
        user = db.query(User).filter_by(email=email).one()
        assert user.role == UserRole.CUSTOMER
        assert user.hashed_password != payload["password"]
        assert verify_password(payload["password"], user.hashed_password)
    finally:
        db.close()
    assert client.get("/api/v1/users", headers=headers).status_code == 403
    login = client.post("/api/v1/auth/login", json={
        "email": email, "password": payload["password"],
    })
    assert login.status_code == 200
    assert login.json()["user_role"] == "customer"


def test_register_rejects_weak_password_and_duplicate_email(client):
    email = "phase-e2-dup-" + uuid4().hex[:10] + "@example.test"
    request = {"full_name": "Cliente Registro", "email": email, "password": "bad"}
    assert client.post("/api/v1/auth/register", json=request).status_code == 400
    request["password"] = "Safe-Pass-12345"
    assert client.post("/api/v1/auth/register", json=request).status_code == 201
    assert client.post("/api/v1/auth/register", json=request).status_code == 400
    db = TestingSession()
    try:
        assert db.query(User).filter_by(email=email).count() == 1
    finally:
        db.close()


def test_checkout_requires_auth_and_does_not_reserve_stock(client):
    product_id, inv_id = _stock()
    before = _counts(inv_id)
    result = _post_order(client, _payload(product_id), {})
    assert result.status_code == 401
    assert _counts(inv_id) == before


def test_checkout_uses_server_prices_and_reserves_exactly_once(client, auth_headers):
    product_id, inv_id = _stock()
    payload = _payload(product_id)
    payload["subtotal"] = 1
    payload["total_amount"] = 1
    payload["shipping_amount"] = -500000
    original = _counts(inv_id)
    key = _key()
    first = _post_order(client, payload, auth_headers, key)
    assert first.status_code == 201, first.text
    data = first.json()
    assert data["subtotal"] == 30000
    assert data["shipping_amount"] == 12000
    assert data["total_amount"] == 42000
    assert len(data["items"]) == 1
    assert data["items"][0]["qty"] == 2
    after_first = _counts(inv_id)
    assert after_first == (original[0] - 2, original[1] + 1, original[2] + 1)

    again = _post_order(client, payload, auth_headers, key)
    assert again.status_code == 201, again.text
    assert again.json()["id"] == data["id"]
    assert again.json()["order_number"] == data["order_number"]
    assert _counts(inv_id) == after_first


def test_idempotency_rejects_changed_cart_without_second_reservation(client, auth_headers):
    product_id, inv_id = _stock()
    key = _key()
    first = _post_order(client, _payload(product_id, qty=1), auth_headers, key)
    assert first.status_code == 201, first.text
    after = _counts(inv_id)
    changed = _post_order(client, _payload(product_id, qty=2), auth_headers, key)
    assert changed.status_code == 409, changed.text
    assert _counts(inv_id) == after


@pytest.mark.parametrize("qty", [0, -1, 1.5, 99])
def test_invalid_or_excess_quantity_never_creates_order(client, auth_headers, qty):
    product_id, inv_id = _stock(qty=5)
    before = _counts(inv_id)
    result = _post_order(client, _payload(product_id, qty), auth_headers)
    assert result.status_code in (409, 422), result.text
    assert _counts(inv_id) == before


def test_shipping_confirmation_mismatch_keeps_inventory(client, auth_headers):
    product_id, inv_id = _stock()
    payload = _payload(product_id)
    payload["shipping_price_confirmed"] = 1
    before = _counts(inv_id)
    response = _post_order(client, payload, auth_headers)
    assert response.status_code == 409, response.text
    assert _counts(inv_id) == before
