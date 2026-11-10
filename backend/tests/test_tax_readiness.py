"""Regresiones básicas de configuración DIAN. Sin emisión electrónica."""
import pytest
from app.services.dian_adapter import (
    DisabledFiscalAdapter, FiscalIssuanceDisabled, FiscalSubmission, get_fiscal_adapter,
)
from tests.test_main import setup_db, client, auth_headers, TestWebOrderStockReservations


def issuer_payload():
    return {
        "legal_name": "Comercio de Ejemplo S.A.S.",
        "tax_id": "900123456",
        "verification_digit": "7",
        "person_type": "juridica",
        "tax_regime": "Pendiente por verificar RUT",
        "fiscal_responsibilities": ["R-99-PN"],
        "economic_activities": ["4771"],
        "fiscal_address": "Calle 1 numero 2-30",
        "city": "Barranquilla",
        "department": "Atlantico",
        "contact_email": "fiscal@example.com",
        "operation_mode": "pending",
        "provider_name": None,
    }


def test_issuer_profile_does_not_allow_electronic_issuance(client, auth_headers):
    result = client.put(
        "/api/v1/tax-readiness/issuer",
        json=issuer_payload(), headers=auth_headers,
    )
    assert result.status_code == 200, result.text
    assert result.json()["readiness_status"] == "draft"
    again = client.put(
        "/api/v1/tax-readiness/issuer",
        json={**issuer_payload(), "operation_mode": "own_software"},
        headers=auth_headers,
    )
    assert again.status_code == 200, again.text
    assert again.json()["id"] == result.json()["id"] == 1
    readiness = client.get("/api/v1/tax-readiness/readiness", headers=auth_headers)
    assert readiness.status_code == 200
    assert readiness.json()["can_issue_electronic_invoices"] is False
    assert readiness.json()["checks"]["authorized_numbering_verified"] is False


def test_tax_classification_does_not_change_product_price(client, auth_headers):
    pid, _ = TestWebOrderStockReservations.create_stock()
    wrong = client.put(
        f"/api/v1/tax-readiness/products/{pid}",
        json={"tax_treatment": "taxed", "tax_rate": None},
        headers=auth_headers,
    )
    assert wrong.status_code == 422
    saved = client.put(
        f"/api/v1/tax-readiness/products/{pid}",
        json={"tax_treatment": "taxed", "tax_rate": 19,
              "reviewed_by_accountant": True},
        headers=auth_headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["tax_treatment"] == "taxed"
    product = client.get(f"/api/v1/products/{pid}", headers=auth_headers)
    assert product.status_code == 200
    assert float(product.json()["sale_price"]) == 15000.0


def test_fiscal_adapter_is_disabled_even_when_configuration_exists():
    adapter = get_fiscal_adapter()
    assert isinstance(adapter, DisabledFiscalAdapter)
    with pytest.raises(FiscalIssuanceDisabled):
        adapter.submit(FiscalSubmission(
            source_order_id=1, issuer_profile_id=1,
            idempotency_key="order:1:invoice:1",
            document_kind="invoice", payload={},
        ))
    with pytest.raises(FiscalIssuanceDisabled):
        adapter.status("FAKE")
