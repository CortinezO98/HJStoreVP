"""Checks básicos del outbox; SIN entrega SMTP real.

La batería integral y pruebas con proveedores queda al final del proyecto.
"""
from types import SimpleNamespace

from app.core.config import settings
from app.models.models import (
    CustomerNotification, Order, OrderStatus, Product, Shipment,
)
from app.services.notification_worker import smtp_is_ready
from app.services.notifications import (
    enqueue_order_notification, render_notification,
)
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations,
    setup_db, client, auth_headers,
)


def new_order(client, auth_headers):
    product_id, _ = TestWebOrderStockReservations.create_stock()
    response = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(product_id),
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_order_confirmation_enqueued_once(client, auth_headers):
    order = new_order(client, auth_headers)
    db = TestingSession()
    records = db.query(CustomerNotification).filter_by(order_id=order["id"]).all()
    assert len(records) == 1
    assert records[0].kind == "order_created"
    assert records[0].status == "pending"
    assert records[0].attempts == 0

    # Repetir la misma señal en la sesión no duplica el aviso.
    item = db.get(Order, order["id"])
    assert enqueue_order_notification(
        db, item, "order_created", f"order:{item.id}:created"
    ) is False
    db.commit()
    assert db.query(CustomerNotification).filter_by(order_id=order["id"]).count() == 1
    db.close()


def test_payment_and_dispatch_messages_are_in_queue(client, auth_headers):
    order = new_order(client, auth_headers)
    payment = client.post(
        "/api/v1/payments/confirm-demo",
        json={"order_number": order["order_number"], "method": "wompi"},
        headers=auth_headers,
    )
    assert payment.status_code == 200, payment.text
    dispatch = client.post(
        f"/api/v1/shipments/orders/{order['id']}/dispatch",
        json={
            "carrier": "Transportadora de Prueba", "service": "Estándar",
            "tracking_number": "HJ-FAKE0001",
        },
        headers=auth_headers,
    )
    assert dispatch.status_code == 201, dispatch.text
    event = client.post(
        f"/api/v1/shipments/orders/{order['id']}/events",
        json={"status": "delivered"}, headers=auth_headers,
    )
    assert event.status_code == 200, event.text
    db = TestingSession()
    rows = db.query(CustomerNotification).filter_by(order_id=order["id"]).all()
    assert {n.kind for n in rows} == {
        "order_created", "payment_confirmed",
        "shipment_dispatched", "shipment_delivered",
    }
    assert len({n.event_key for n in rows}) == len(rows)
    assert all(n.status == "pending" for n in rows)
    db.close()


def test_admin_notification_history_and_retry_permissions(client, auth_headers):
    order = new_order(client, auth_headers)
    response = client.get("/api/v1/notifications/admin", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert any(row["order_id"] == order["id"] for row in response.json())

    db = TestingSession()
    record = db.query(CustomerNotification).filter_by(order_id=order["id"]).one()
    record.status = "failed"
    record.attempts = 5
    db.commit()
    record_id = record.id
    db.close()

    again = client.post(
        f"/api/v1/notifications/admin/{record_id}/retry",
        headers=auth_headers,
    )
    assert again.status_code == 200
    assert again.json()["status"] == "pending"
    assert again.json()["attempts"] == 0
    duplicate = client.post(
        f"/api/v1/notifications/admin/{record_id}/retry",
        headers=auth_headers,
    )
    assert duplicate.status_code == 409


def test_html_is_escaped_and_sender_disabled_by_default(monkeypatch):
    sample = SimpleNamespace(
        kind="shipment_dispatched",
        subject="Hola <script>alert(1)</script>",
        context={
            "order_number": "WEB-009",
            "carrier": "<b>Operador</b>",
            "tracking_number": '123\" onmouseover="alert(1)',
        },
    )
    text, html = render_notification(sample, "https://tienda.example.com")
    assert "&lt;script&gt;" in html
    assert "<script>" not in html
    assert "<b>Operador</b>" not in html
    assert "&lt;b&gt;Operador&lt;/b&gt;" in html
    assert "https://tienda.example.com/mi-cuenta" in text
    monkeypatch.setattr(settings, "EMAIL_NOTIFICATIONS_ENABLED", False)
    assert smtp_is_ready() is False
