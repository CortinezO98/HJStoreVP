"""Comprobaciones básicas de regresión para gestión interna de despachos.

No consulta API externas ni representa pruebas integrales de transportadora.
Usa la DB SQLite temporal y fixtures existentes de HJStoreVP.
"""
from app.models.models import (
    Order, OrderStatus, Shipment, ShipmentEvent, User, UserRole,
)
from app.core.security import hash_password
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations,
    setup_db, client, auth_headers,  # Reusar fixtures existentes
)


def paid_web_order(client, auth_headers):
    product_id, _ = TestWebOrderStockReservations.create_stock()
    payload = TestWebOrderStockReservations.payload(product_id)
    response = client.post("/api/v1/orders/web", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    order_id = response.json()["id"]
    db = TestingSession()
    order = db.get(Order, order_id)
    order.status = OrderStatus.PAID
    db.commit()
    db.close()
    return order_id


def test_dispatch_and_event_history(client, auth_headers):
    oid = paid_web_order(client, auth_headers)
    body = {
        "carrier": "Transportadora de Prueba", "service": "Estándar",
        "tracking_number": "HJ-123456", "note": "Paquete entregado a logística",
    }
    dispatched = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch",
        json=body, headers=auth_headers,
    )
    assert dispatched.status_code == 201, dispatched.text
    assert dispatched.json()["status"] == "dispatched"
    assert dispatched.json()["order_status"] == "shipped"
    assert len(dispatched.json()["events"]) == 1

    repeated = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch",
        json=body, headers=auth_headers,
    )
    assert repeated.status_code == 409

    for state in ("in_transit", "out_for_delivery", "delivered"):
        event = client.post(
            f"/api/v1/shipments/orders/{oid}/events",
            json={"status": state, "note": "Novedad registrada"},
            headers=auth_headers,
        )
        assert event.status_code == 200, event.text
    assert event.json()["order_status"] == "delivered"
    assert len(event.json()["events"]) == 4

    forbidden = client.post(
        f"/api/v1/shipments/orders/{oid}/events",
        json={"status": "in_transit"}, headers=auth_headers,
    )
    assert forbidden.status_code == 409
    db = TestingSession()
    assert db.query(Shipment).filter_by(order_id=oid).count() == 1
    assert db.query(ShipmentEvent).count() == 4
    db.close()


def test_cannot_ship_unpaid_or_forge_order_status(client, auth_headers):
    product_id, _ = TestWebOrderStockReservations.create_stock()
    response = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(product_id),
        headers=auth_headers,
    )
    assert response.status_code == 201
    oid = response.json()["id"]
    body = {
        "carrier": "Transportadora de Prueba",
        "service": "Estándar", "tracking_number": "HJ-9999",
    }
    dispatched = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch", json=body,
        headers=auth_headers,
    )
    assert dispatched.status_code == 409
    patch = client.patch(
        f"/api/v1/orders/{oid}/status",
        params={"status": "shipped"}, headers=auth_headers,
    )
    assert patch.status_code == 409


def test_tracking_is_private_to_customer_or_admin(client, auth_headers):
    oid = paid_web_order(client, auth_headers)
    result = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch",
        json={"carrier": "Transportadora de Prueba", "service": "Estándar",
              "tracking_number": "HJ-78900"},
        headers=auth_headers,
    )
    assert result.status_code == 201, result.text

    db = TestingSession()
    other = User(
        email="other@example.com", full_name="Otro cliente",
        hashed_password=hash_password("Example123!"),
        role=UserRole.CUSTOMER, active=True,
    )
    db.add(other)
    db.commit()
    db.close()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "other@example.com", "password": "Example123!"},
    )
    assert login.status_code == 200
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    blocked = client.get(f"/api/v1/shipments/orders/{oid}", headers=other_headers)
    assert blocked.status_code == 404

    denied_dispatch = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch",
        json={"carrier": "Otro", "service": "Normal", "tracking_number": "HJ-9999"},
        headers=other_headers,
    )
    assert denied_dispatch.status_code == 403


def test_guide_correction_audited_and_delivery_immutable(client, auth_headers):
    oid = paid_web_order(client, auth_headers)
    dispatched = client.post(
        f"/api/v1/shipments/orders/{oid}/dispatch",
        json={"carrier": "Transportadora de Prueba", "service": "Estándar",
              "tracking_number": "HJ-44444"},
        headers=auth_headers,
    )
    assert dispatched.status_code == 201
    corrected = client.patch(
        f"/api/v1/shipments/orders/{oid}/guide",
        json={"tracking_number": "HJ-55555", "reason": "Error de digitación"},
        headers=auth_headers,
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["tracking_number"] == "HJ-55555"
    assert len(corrected.json()["events"]) == 2
    assert "HJ-44444" in corrected.json()["events"][-1]["note"]

    delivered = client.post(
        f"/api/v1/shipments/orders/{oid}/events",
        json={"status": "delivered"}, headers=auth_headers,
    )
    assert delivered.status_code == 200
    blocked = client.patch(
        f"/api/v1/shipments/orders/{oid}/guide",
        json={"tracking_number": "HJ-66666", "reason": "Cambio posterior"},
        headers=auth_headers,
    )
    assert blocked.status_code == 409
