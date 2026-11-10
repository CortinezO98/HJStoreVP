"""Regresiones básicas de reportes operativos, sin pruebas integrales.

Los reportes contables originales y sus cálculos no se modifican.
"""
from datetime import date, timedelta
from app.models.models import Order, PostSaleCase
from tests.test_main import (
    TestingSession, TestWebOrderStockReservations, setup_db, client, auth_headers,
)


URL = "/api/v1/operational-analytics/overview"


def create_order(client, auth_headers):
    product_id, inv_id = TestWebOrderStockReservations.create_stock()
    result = client.post(
        "/api/v1/orders/web",
        json=TestWebOrderStockReservations.payload(product_id),
        headers=auth_headers,
    )
    assert result.status_code == 201, result.text
    return result.json()


def test_pending_order_is_not_counted_as_revenue(client, auth_headers):
    created = create_order(client, auth_headers)
    response = client.get(URL, headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["sales"]["orders_paid"] == 0
    assert data["sales"]["gross_cop"] == 0
    assert data["operations"]["pending_web_orders"] == 1
    assert data["sales"]["recorded_external_refunds_cop"] == 0
    assert data["period"]["sales_date_basis"] == "paid_at"


def test_paid_order_and_cost_are_aggregated_without_duplication(client, auth_headers):
    created = create_order(client, auth_headers)
    paid = client.post(
        "/api/v1/payments/confirm-demo",
        json={"order_number": created["order_number"], "method": "wompi"},
        headers=auth_headers,
    )
    assert paid.status_code == 200, paid.text
    result = client.get(URL, headers=auth_headers)
    assert result.status_code == 200, result.text
    sale = result.json()["sales"]
    assert sale["orders_paid"] == 1
    assert sale["gross_cop"] == 42000
    assert sale["shipping_charged_cop"] == 12000
    assert sale["cost_cop"] == 20000
    assert sale["gross_margin_before_fees_cop"] == 22000
    assert sale["by_channel"]["web"]["orders"] == 1
    assert result.json()["top_products"][0]["units"] == 2
    assert result.json()["operations"]["pending_web_orders"] == 0


def test_date_filter_excludes_old_payments_and_checks_range(client, auth_headers):
    create_order(client, auth_headers)
    invalid = client.get(URL, params={
        "date_from": "2026-11-15", "date_to": "2026-11-09",
    }, headers=auth_headers)
    assert invalid.status_code == 422
    future = date.today() + timedelta(days=10)
    response = client.get(URL, params={
        "date_from": future.isoformat(), "date_to": future.isoformat(),
    }, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["operations"]["pending_web_orders"] == 0
    assert response.json()["sales"]["gross_cop"] == 0


def test_operational_report_requires_admin(client):
    response = client.get(URL)
    assert response.status_code in (401, 403)
