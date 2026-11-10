"""Regresiones básicas de la fase posventa; no realiza reembolsos reales.

Las pruebas integrales de proveedor, inventario MariaDB y entregas reales
se ejecutarán al final del proyecto.
"""
from app.core.security import hash_password
from app.models.models import (
    Inventory, Order, OrderStatus, PostSaleCase, PostSaleEvent, StockMovement,
    User, UserRole,
)
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations, setup_db, client, auth_headers,
)


def create_paid_order(client, auth_headers):
    product_id, inv_id = TestWebOrderStockReservations.create_stock()
    created = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(product_id),
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    paid = client.post(
        "/api/v1/payments/confirm-demo",
        json={"order_number": created.json()["order_number"], "method": "wompi"},
        headers=auth_headers,
    )
    assert paid.status_code == 200, paid.text
    return created.json(), inv_id


def case_payload(order):
    return {
        "order_id": order["id"],
        "kind": "return", "order_item_id": order["items"][0]["id"],
        "qty": 1, "reason": "Producto defectuoso",
        "description": "El producto llegó con fallas evidentes.",
    }


def test_return_received_once_and_external_refund_recorded(client, auth_headers):
    order, inv_id = create_paid_order(client, auth_headers)
    result = client.post("/api/v1/post-sale", json=case_payload(order), headers=auth_headers)
    assert result.status_code == 201, result.text
    case_id = result.json()["id"]
    assert result.json()["refund_amount"] == "15000.00"

    overbook = case_payload(order)
    overbook["qty"] = 2
    blocked = client.post("/api/v1/post-sale", json=overbook, headers=auth_headers)
    assert blocked.status_code == 409

    approval = client.post(
        f"/api/v1/post-sale/{case_id}/review",
        json={"status": "approved", "note": "Aceptamos revisión física"},
        headers=auth_headers,
    )
    assert approval.status_code == 200, approval.text
    before = TestingSession()
    assert before.get(Inventory, inv_id).qty_available == 3
    before.close()

    receipt = client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "resellable", "note": "Unidad físicamente recibida y revisada"},
        headers=auth_headers,
    )
    assert receipt.status_code == 200, receipt.text
    assert receipt.json()["restocked_qty"] == 1
    duplicate = client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "resellable", "note": "Duplicación no permitida"},
        headers=auth_headers,
    )
    assert duplicate.status_code == 409
    db = TestingSession()
    assert db.get(Inventory, inv_id).qty_available == 4
    db.close()

    request = client.post(
        f"/api/v1/post-sale/{case_id}/request-refund",
        json={"note": "Solicitado al proveedor de pagos"},
        headers=auth_headers,
    )
    assert request.status_code == 200, request.text
    assert request.json()["refund_status"] == "pending_external"
    denied = client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "REF-ABC123", "confirmation_note": "No verificado aún",
              "explicitly_verified_externally": False},
        headers=auth_headers,
    )
    assert denied.status_code == 422
    recorded = client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "REF-ABC123",
              "confirmation_note": "Comprobante externo contrastado con proveedor",
              "explicitly_verified_externally": True},
        headers=auth_headers,
    )
    assert recorded.status_code == 200, recorded.text
    assert recorded.json()["refund_status"] == "externally_recorded"
    assert client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={"external_reference": "REF-ABC123",
              "confirmation_note": "Intento duplicado de reembolso",
              "explicitly_verified_externally": True},
        headers=auth_headers,
    ).status_code == 409
    db = TestingSession()
    assert db.get(Order, order["id"]).status == OrderStatus.PAID
    assert db.query(PostSaleEvent).filter_by(case_id=case_id).count() >= 4
    db.close()


def test_damaged_return_does_not_restock_and_incident_no_refund(client, auth_headers):
    order, inventory_id = create_paid_order(client, auth_headers)
    incident = client.post("/api/v1/post-sale", json={
        "order_id": order["id"], "kind": "incident",
        "reason": "Problema en la entrega",
        "description": "La entrega llegó fuera del horario previsto.",
    }, headers=auth_headers)
    assert incident.status_code == 201, incident.text
    assert incident.json()["refund_amount"] is None
    assert client.post(
        f"/api/v1/post-sale/{incident.json()['id']}/request-refund",
        json={"note": "Solicitar indebidamente un reembolso"},
        headers=auth_headers,
    ).status_code == 409

    return_case = client.post(
        "/api/v1/post-sale", json=case_payload(order), headers=auth_headers
    )
    assert return_case.status_code == 201
    case_id = return_case.json()["id"]
    assert client.post(
        f"/api/v1/post-sale/{case_id}/review",
        json={"status": "approved", "note": "Devolución aceptada para inspección"},
        headers=auth_headers,
    ).status_code == 200
    receipt = client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "damaged", "note": "Producto deteriorado sin opción de reventa"},
        headers=auth_headers,
    )
    assert receipt.status_code == 200
    assert receipt.json()["restocked_qty"] == 0
    db = TestingSession()
    assert db.get(Inventory, inventory_id).qty_available == 3
    db.close()


def test_customer_cannot_view_or_change_another_persons_case(client, auth_headers):
    order, _ = create_paid_order(client, auth_headers)
    case = client.post("/api/v1/post-sale", json=case_payload(order), headers=auth_headers)
    assert case.status_code == 201
    db = TestingSession()
    db.add(User(
        email="unrelated@example.com", full_name="Cliente externo",
        hashed_password=hash_password("Example123!"),
        role=UserRole.CUSTOMER, active=True,
    ))
    db.commit()
    db.close()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "unrelated@example.com", "password": "Example123!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert client.get(f"/api/v1/post-sale/{case.json()['id']}", headers=headers).status_code == 404
    assert client.post(
        "/api/v1/post-sale", json=case_payload(order), headers=headers,
    ).status_code == 404
    assert client.post(
        f"/api/v1/post-sale/{case.json()['id']}/review",
        json={"status": "approved", "note": "Intento no autorizado"},
        headers=headers,
    ).status_code == 403
