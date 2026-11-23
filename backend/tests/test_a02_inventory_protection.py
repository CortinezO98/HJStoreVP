"""A-02: límites de checkout y expiración aislada en SQLite."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from app.models.models import Order, OrderStatus, OrderStockReservation, Inventory
from app.services.reservation_worker import expire_batch
from tests.test_main import client, setup_db, auth_headers, TestingSession, TestWebOrderStockReservations as StockFixture


def create(client, headers, product, key=None, qty=1):
    return client.post("/api/v1/orders/web", json=StockFixture.payload(product, qty),
                       headers={**headers, "Idempotency-Key": key or uuid4().hex})


def test_limite_cantidad(client, auth_headers):
    product, inv = StockFixture.create_stock(qty=100)
    assert create(client, auth_headers, product, qty=21).status_code == 422
    with TestingSession() as db:
        assert db.get(Inventory, inv).qty_available == 100
    assert create(client, auth_headers, product, qty=20).status_code == 201


def test_limite_lineas(client, auth_headers):
    product, _ = StockFixture.create_stock(qty=100)
    data = StockFixture.payload(product)
    data["items"] = [{"product_id": i, "qty": 1} for i in range(1, 52)]
    response = client.post("/api/v1/orders/web", json=data,
                           headers={**auth_headers, "Idempotency-Key": uuid4().hex})
    assert response.status_code == 422


def test_limite_pendientes_respeta_idempotencia(client, auth_headers):
    product, inv = StockFixture.create_stock(qty=10)
    key = uuid4().hex
    first = create(client, auth_headers, product, key)
    assert first.status_code == 201
    assert create(client, auth_headers, product).status_code == 201
    assert create(client, auth_headers, product).status_code == 201
    replay = create(client, auth_headers, product, key)
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert create(client, auth_headers, product).status_code == 429
    with TestingSession() as db:
        assert db.get(Inventory, inv).qty_available == 7
    assert client.post(f"/api/v1/orders/{first.json()['id']}/cancel", headers=auth_headers).status_code == 200
    assert create(client, auth_headers, product).status_code == 201


@pytest.mark.parametrize("method,reference,expired,release", [
    (None, None, True, True),
    (None, None, False, False),
    ("wompi", None, True, False),
    ("addi", "INITIATING-test", True, False),
    ("sistecreditos", "TX-1", True, False),
    (None, "TX-unknown", True, False),
])
def test_expiracion_conservadora(client, auth_headers, method, reference, expired, release):
    product, inv = StockFixture.create_stock(qty=5)
    created = create(client, auth_headers, product)
    assert created.status_code == 201
    oid = created.json()["id"]
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with TestingSession() as db:
        order = db.get(Order, oid)
        order.payment_method = method
        order.payment_ref = reference
        reservation = db.query(OrderStockReservation).filter_by(order_id=oid).one()
        reservation.expires_at = now + timedelta(minutes=-1 if expired else 1)
        db.commit()
    result = expire_batch(TestingSession, now=now)
    assert result["cancelled"] == int(release)
    assert expire_batch(TestingSession, now=now)["cancelled"] == 0
    with TestingSession() as db:
        assert db.get(Order, oid).status == (OrderStatus.CANCELLED if release else OrderStatus.PENDING)
        assert db.get(Inventory, inv).qty_available == (5 if release else 4)
        assert db.query(OrderStockReservation).filter_by(order_id=oid).one().status == ("released" if release else "held")
