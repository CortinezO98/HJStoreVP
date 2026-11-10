"""Regresiones básicas de consentimiento, carrito guardado y puntos.

No se envía SMTP real. Las pruebas integrales son la última etapa.
"""
from app.core.config import settings
from app.models.models import (
    CartRecoveryNotice, LoyaltyLedger, SavedCustomerCart,
    CustomerEngagementPreference,
)
from app.services.cart_recovery_worker import enabled
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations, client, auth_headers, setup_db,
)


def create_customer(client, email="cliente.engagement@example.com"):
    r = client.post("/api/v1/auth/register", json={
        "full_name": "Cliente Ejemplo",
        "email": email, "password": "SecureTest123!",
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_preferences_are_opt_in_and_recovery_is_cancelled_when_revoked(client):
    customer = create_customer(client)
    pid, _ = TestWebOrderStockReservations.create_stock()
    default = client.get("/api/v1/engagement/preferences", headers=customer)
    assert default.status_code == 200
    assert default.json() == {
        "recovery_email_opt_in": False, "marketing_email_opt_in": False,
    }
    cart = client.put("/api/v1/engagement/cart", json={
        "items": [{"product_id": pid, "qty": 1}]
    }, headers=customer)
    assert cart.status_code == 200, cart.text
    db = TestingSession()
    assert db.query(CartRecoveryNotice).count() == 0
    db.close()

    grant = client.put("/api/v1/engagement/preferences", json={
        "recovery_email_opt_in": True, "marketing_email_opt_in": False,
    }, headers=customer)
    assert grant.status_code == 200, grant.text
    db = TestingSession()
    assert db.query(CartRecoveryNotice).filter_by(status="scheduled").count() == 1
    db.close()

    revoke = client.put("/api/v1/engagement/preferences", json={
        "recovery_email_opt_in": False, "marketing_email_opt_in": False,
    }, headers=customer)
    assert revoke.status_code == 200
    db = TestingSession()
    assert db.query(CartRecoveryNotice).filter_by(status="scheduled").count() == 0
    assert db.query(CartRecoveryNotice).filter_by(status="cancelled").count() == 1
    db.close()


def test_cart_revisions_cancel_old_reminders_and_no_prices_stored(client):
    customer = create_customer(client)
    pid, _ = TestWebOrderStockReservations.create_stock()
    assert client.put("/api/v1/engagement/preferences", json={
        "recovery_email_opt_in": True, "marketing_email_opt_in": False,
    }, headers=customer).status_code == 200
    for qty in (1, 2):
        r = client.put("/api/v1/engagement/cart", json={
            "items": [{"product_id": pid, "qty": qty}]
        }, headers=customer)
        assert r.status_code == 200, r.text
    db = TestingSession()
    cart = db.query(SavedCustomerCart).one()
    assert cart.items == [{"product_id": pid, "qty": 2}]
    assert "sale_price" not in str(cart.items)
    assert db.query(CartRecoveryNotice).filter_by(status="scheduled").count() == 1
    assert db.query(CartRecoveryNotice).filter_by(status="cancelled").count() == 1
    db.close()
    assert client.put("/api/v1/engagement/cart", json={
        "items": []
    }, headers=customer).status_code == 200
    db = TestingSession()
    assert db.query(CartRecoveryNotice).filter_by(status="scheduled").count() == 0
    db.close()


def test_paid_order_awards_points_once_and_clears_matching_cart(client):
    customer = create_customer(client)
    pid, _ = TestWebOrderStockReservations.create_stock()
    assert client.put("/api/v1/engagement/preferences", json={
        "recovery_email_opt_in": True, "marketing_email_opt_in": False,
    }, headers=customer).status_code == 200
    cart = client.put("/api/v1/engagement/cart", json={
        "items": [{"product_id": pid, "qty": 2}]
    }, headers=customer)
    assert cart.status_code == 200, cart.text
    order = client.post("/api/v1/orders/web", json=
        TestWebOrderStockReservations.payload(pid), headers=customer,
    )
    assert order.status_code == 201, order.text
    paid = client.post("/api/v1/payments/confirm-demo", json={
        "order_number": order.json()["order_number"], "method": "wompi",
    }, headers=customer)
    assert paid.status_code == 200, paid.text
    loyalty = client.get("/api/v1/engagement/loyalty", headers=customer)
    assert loyalty.status_code == 200
    assert loyalty.json()["points"] == 30
    assert loyalty.json()["redeem_enabled"] is False
    db = TestingSession()
    assert db.query(LoyaltyLedger).count() == 1
    assert db.query(SavedCustomerCart).one().items == []
    assert db.query(CartRecoveryNotice).filter_by(status="scheduled").count() == 0
    db.close()
    second = client.post("/api/v1/payments/confirm-demo", json={
        "order_number": order.json()["order_number"], "method": "wompi",
    }, headers=customer)
    assert second.status_code in (200, 409)
    db = TestingSession()
    assert db.query(LoyaltyLedger).count() == 1
    db.close()


def test_admin_cannot_access_customer_cart_and_mailer_disabled(client, auth_headers):
    response = client.get("/api/v1/engagement/cart", headers=auth_headers)
    assert response.status_code == 403
    assert enabled() is False
    overview = client.get("/api/v1/engagement/admin/overview", headers=auth_headers)
    assert overview.status_code == 200
    assert overview.json()["recovery_sent"] == 0
