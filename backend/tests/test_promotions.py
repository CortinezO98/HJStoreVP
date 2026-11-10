"""Regresiones unitarias básicas de campañas (integrales al cierre del proyecto)."""
from app.models.models import (
    Order, OrderStatus, CouponRedemption, PromotionCoupon,
)
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations, setup_db, client, auth_headers,
)


def make_coupon(client, auth_headers, code="TEST10", **changes):
    payload = {
        "code": code, "description": "Campaña de prueba",
        "discount_type": "percentage", "discount_value": 10,
        "minimum_subtotal": 20000, "maximum_discount": 5000,
        "max_uses": 2, "max_uses_per_customer": 1, "active": True,
    }
    payload.update(changes)
    response = client.post("/api/v1/promotions/admin", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_quote_and_checkout_use_server_total_and_no_duplicate_reservation(client, auth_headers):
    make_coupon(client, auth_headers)
    product, _ = TestWebOrderStockReservations.create_stock()
    payload = TestWebOrderStockReservations.payload(product)
    quote = client.post("/api/v1/promotions/quote", json={
        "code": "test10", "items": payload["items"],
    }, headers=auth_headers)
    assert quote.status_code == 200, quote.text
    assert quote.json()["subtotal"] == 30000
    assert quote.json()["discount_amount"] == 3000

    payload.update({
        "coupon_code": "TEST10", "discount_confirmed": 3000,
        "total_amount": 1, "discount_amount": 30000,  # Datos manipulados, ignorados.
    })
    order = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert order.status_code == 201, order.text
    assert order.json()["subtotal"] == 30000
    assert order.json()["discount_amount"] == 3000
    assert order.json()["total_amount"] == 39000
    assert order.json()["coupon_code"] == "TEST10"
    db = TestingSession()
    assert db.query(CouponRedemption).filter_by(order_id=order.json()["id"]).count() == 1
    db.close()

    # La misma persona no puede reservar de nuevo un cupón de uso único.
    again = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert again.status_code == 409


def test_coupon_invalid_or_unconfirmed_discount_cannot_create_order(client, auth_headers):
    make_coupon(client, auth_headers, code="LIMIT5", discount_type="fixed",
                discount_value=5000, maximum_discount=None)
    pid, _ = TestWebOrderStockReservations.create_stock()
    data = TestWebOrderStockReservations.payload(pid)
    data["coupon_code"] = "LIMIT5"
    data["discount_confirmed"] = 0
    result = client.post("/api/v1/orders/web", json=data, headers=auth_headers)
    assert result.status_code == 409
    db = TestingSession()
    assert db.query(CouponRedemption).count() == 0
    assert db.query(Order).count() == 0
    db.close()

    data["discount_confirmed"] = 5000
    created = client.post("/api/v1/orders/web", json=data, headers=auth_headers)
    assert created.status_code == 201, created.text
    assert created.json()["total_amount"] == 37000


def test_expired_coupon_and_inactive_coupon_block_checkout(client, auth_headers):
    make_coupon(client, auth_headers, code="OLD2026",
                starts_at="2020-01-01T00:00:00",
                expires_at="2020-02-01T00:00:00")
    pid, _ = TestWebOrderStockReservations.create_stock()
    data = TestWebOrderStockReservations.payload(pid)
    response = client.post("/api/v1/promotions/quote", json={
        "code": "OLD2026", "items": data["items"],
    }, headers=auth_headers)
    assert response.status_code == 409
    make_coupon(client, auth_headers, code="OFF2026", active=False)
    no = client.post("/api/v1/promotions/quote", json={
        "code": "OFF2026", "items": data["items"],
    }, headers=auth_headers)
    assert no.status_code == 409


def test_cancelled_coupon_order_releases_usage_without_changing_history(client, auth_headers):
    make_coupon(client, auth_headers, code="REUSE5", max_uses=1)
    pid, _ = TestWebOrderStockReservations.create_stock()
    payload = TestWebOrderStockReservations.payload(pid)
    payload["coupon_code"] = "REUSE5"
    payload["discount_confirmed"] = 3000
    first = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert first.status_code == 201, first.text
    blocked = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert blocked.status_code == 409

    cancelled = client.post(
        f"/api/v1/orders/{first.json()['id']}/cancel", headers=auth_headers
    )
    assert cancelled.status_code == 200
    next_order = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert next_order.status_code == 201, next_order.text
    db = TestingSession()
    assert db.query(CouponRedemption).count() == 2
    assert db.get(Order, first.json()["id"]).status == OrderStatus.CANCELLED
    db.close()


def test_admin_coupon_requires_authentication(client):
    assert client.get("/api/v1/promotions/admin").status_code in (401,403)
