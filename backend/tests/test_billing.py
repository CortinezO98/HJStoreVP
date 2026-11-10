"""Verificaciones básicas de comprobantes y borradores comerciales internos.

No se generan ni transmiten facturas electrónicas DIAN.
Pruebas integrales de emisión fiscal se realizarán al finalizar el proyecto.
"""
from app.core.security import hash_password
from app.models.models import (
    CommercialDocument, CommercialDocumentEvent, User, UserRole,
)
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations, setup_db, client, auth_headers,
)


def paid_order(client, headers):
    pid, _ = TestWebOrderStockReservations.create_stock()
    response = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(pid),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    order = response.json()
    payment = client.post(
        "/api/v1/payments/confirm-demo",
        json={"order_number": order["order_number"], "method": "wompi"},
        headers=headers,
    )
    assert payment.status_code == 200, payment.text
    return order


def test_internal_receipt_is_idempotent_and_printable(client, auth_headers):
    order = paid_order(client, auth_headers)
    path = f"/api/v1/billing/receipt/{order['id']}"
    first = client.post(path, headers=auth_headers)
    assert first.status_code == 200, first.text
    second = client.post(path, headers=auth_headers)
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["document_type"] == "purchase_receipt"
    assert first.json()["status"] == "internal"
    assert first.json()["amount"] == "42000.00"

    doc_id = first.json()["id"]
    printout = client.get(f"/api/v1/billing/{doc_id}/print", headers=auth_headers)
    assert printout.status_code == 200
    assert "NO ES FACTURA ELECTRÓNICA" in printout.text
    assert "HJ-COMP-" in printout.text
    assert "Gorra de Reserva" in printout.text
    assert "42000.00 COP" in printout.text
    assert 'attachment;' in printout.headers["content-disposition"]

    db = TestingSession()
    assert db.query(CommercialDocument).filter_by(order_id=order["id"]).count() == 1
    assert db.query(CommercialDocumentEvent).filter_by(document_id=doc_id).count() == 1
    db.close()


def test_unpaid_order_does_not_have_receipt(client, auth_headers):
    pid, _ = TestWebOrderStockReservations.create_stock()
    response = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(pid),
        headers=auth_headers,
    )
    assert response.status_code == 201
    result = client.post(
        f"/api/v1/billing/receipt/{response.json()['id']}", headers=auth_headers,
    )
    assert result.status_code == 409


def test_credit_draft_requires_completed_external_refund(client, auth_headers):
    order = paid_order(client, auth_headers)
    original = client.post(
        f"/api/v1/billing/receipt/{order['id']}", headers=auth_headers
    )
    assert original.status_code == 200

    claim = client.post(
        "/api/v1/post-sale",
        json={
            "order_id": order["id"], "kind": "return",
            "order_item_id": order["items"][0]["id"],
            "qty": 1, "reason": "Defecto",
            "description": "El producto llegó en mal estado.",
        }, headers=auth_headers,
    )
    assert claim.status_code == 201, claim.text
    case_id = claim.json()["id"]
    path = f"/api/v1/billing/credit-note-draft/{case_id}"
    assert client.post(path, headers=auth_headers).status_code == 409
    assert client.post(
        f"/api/v1/post-sale/{case_id}/review",
        json={"status": "approved", "note": "Revisión de devolución"},
        headers=auth_headers,
    ).status_code == 200
    assert client.post(
        f"/api/v1/post-sale/{case_id}/receive",
        json={"condition": "damaged", "note": "Recepción de unidad dañada"},
        headers=auth_headers,
    ).status_code == 200
    assert client.post(
        f"/api/v1/post-sale/{case_id}/request-refund",
        json={"note": "Orden de reembolso externo"},
        headers=auth_headers,
    ).status_code == 200
    assert client.post(
        f"/api/v1/post-sale/{case_id}/record-refund",
        json={
            "external_reference": "EXT-COMP123",
            "confirmation_note": "Movimiento cotejado externamente con comprobante",
            "explicitly_verified_externally": True,
        }, headers=auth_headers,
    ).status_code == 200

    doc = client.post(path, headers=auth_headers)
    assert doc.status_code == 200, doc.text
    assert doc.json()["document_type"] == "credit_note_draft"
    assert doc.json()["status"] == "draft"
    assert doc.json()["amount"] == "15000.00"
    assert client.post(path, headers=auth_headers).json()["id"] == doc.json()["id"]
    html = client.get(
        f"/api/v1/billing/{doc.json()['id']}/print", headers=auth_headers
    )
    assert html.status_code == 200
    assert "Borrador interno" in html.text
    assert "NO ES FACTURA ELECTRÓNICA" in html.text


def test_documents_private_to_the_owner(client, auth_headers):
    order = paid_order(client, auth_headers)
    receipt = client.post(
        f"/api/v1/billing/receipt/{order['id']}", headers=auth_headers
    )
    assert receipt.status_code == 200
    db = TestingSession()
    db.add(User(
        email="separate@example.com", full_name="Otro comprador",
        hashed_password=hash_password("Example123!"),
        role=UserRole.CUSTOMER, active=True,
    ))
    db.commit()
    db.close()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "separate@example.com", "password": "Example123!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert client.get(
        f"/api/v1/billing/{receipt.json()['id']}/print", headers=headers,
    ).status_code == 404
    assert client.post(
        f"/api/v1/billing/receipt/{order['id']}", headers=headers,
    ).status_code == 404
    assert client.get("/api/v1/billing/mine", headers=headers).json() == []
