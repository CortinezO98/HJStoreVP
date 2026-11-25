"""M-05: validación de entradas sin llamadas a proveedores."""
import re
import pytest
from pydantic import ValidationError
from app.api.v1.endpoints.orders import ShippingAddress, WebOrderCreate, generate_order_number
from app.api.v1.endpoints.payments import InitiatePaymentRequest
from app.models.models import Order
from tests.test_main import client, setup_db, auth_headers, TestingSession, TestWebOrderStockReservations as StockFixture

ADDRESS = dict(full_name="Cliente Prueba", phone="+573001234567", address_line1="Calle 10 # 20-30",
               city="Bogotá", department="Cundinamarca")


@pytest.mark.parametrize("field,value", [
    ("full_name", "a"*121), ("address_line1", "a"*201), ("address_line2", "a"*201),
    ("city", "a"*81), ("department", "a"*81), ("phone", "abc123"),
    ("phone", "1"*21), ("postal_code", "1"*21),
])
def test_invalid_address(field, value):
    with pytest.raises(ValidationError):
        ShippingAddress(**{**ADDRESS, field: value})


@pytest.mark.parametrize("changes", [
    {"method":"unknown"}, {"customer_id":"1234"}, {"customer_id":"1"*16},
    {"customer_id":"１２３４５"}, {"customer_phone":"abc"}, {"order_number":"X"*51},
])
def test_invalid_payment(changes):
    with pytest.raises(ValidationError):
        InitiatePaymentRequest(**{"order_number":"WEB-LEGACY-001", **changes})


def test_legacy_and_optional_payment():
    data = InitiatePaymentRequest(order_number="WEB-LEGACY-001", customer_id="", customer_phone="")
    assert data.method == "wompi" and data.customer_id is None and data.customer_phone is None
    assert InitiatePaymentRequest(order_number="WEB-LEGACY-001", method="addi", customer_id="123456").customer_id == "123456"


def test_order_number_format_and_column():
    values = {generate_order_number() for _ in range(1000)}
    assert len(values) == 1000
    assert all(re.fullmatch(r"WEB-[0-9]{8}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}", v) for v in values)
    assert max(map(len, values)) <= Order.__table__.c.order_number.type.length


def test_oversize_notes_and_address_no_order(client, auth_headers):
    pid, _ = StockFixture.create_stock()
    payload = StockFixture.payload(pid)
    for change in ({"notes":"x"*501}, {"shipping_address":{**ADDRESS,"city":"x"*81}}):
        response = client.post("/api/v1/orders/web", json={**payload, **change}, headers=auth_headers)
        assert response.status_code == 422
    with TestingSession() as db:
        assert db.query(Order).count() == 0


def test_payment_invalid_method_http(client, auth_headers):
    response = client.post("/api/v1/payments/initiate", json={"order_number":"NO-EXISTE","method":"unknown"}, headers=auth_headers)
    assert response.status_code == 422
