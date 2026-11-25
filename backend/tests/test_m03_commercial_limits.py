"""Cuotas comerciales por ruta, con SQLite y Redis simulado aislados."""
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from uuid import uuid4
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from redis.exceptions import RedisError
from app.services import auth_protection as protection
from app.models.models import Order, Inventory, PostSaleCase
from tests.test_main import (
    client, setup_db, auth_headers, TestingSession,
    TestWebOrderStockReservations as StockFixture,
)


@pytest.fixture
def limiter(monkeypatch):
    class Fake:
        def __init__(self):
            self.counts = {}
            self.windows = {}
            self.lock = Lock()
        def eval(self, script, keys, key, limit, window):
            assert script == protection._RATE_LIMIT and keys == 1
            with self.lock:
                count = self.counts.get(key, 0)
                if count >= limit:
                    return 0
                self.counts[key] = count + 1
                self.windows[key] = window
                return 1
    fake = Fake()
    monkeypatch.setattr(protection, "_client", lambda: fake)
    monkeypatch.setattr(protection.settings, "AUTH_RATE_LIMIT_ENABLED", True)
    return fake


def assert_blocked(response, window):
    assert response.status_code == 429, response.text
    assert response.headers["Retry-After"] == str(window)


def test_shipping_ip_limit(client, limiter):
    url = "/api/v1/shipping/quote?department=Cundinamarca&city=Bogota"
    for _ in range(60):
        assert client.get(url).status_code == 200
    assert_blocked(client.get(url, headers={"X-Forwarded-For": "192.0.2.9"}), 60)
    assert len(limiter.counts) == 1


def test_promotion_limit(client, auth_headers, limiter):
    body = {"code": "NOEXISTE", "items": [{"product_id": 999999, "qty": 1}]}
    for _ in range(20):
        assert client.post("/api/v1/promotions/quote", json=body, headers=auth_headers).status_code == 409
    assert_blocked(client.post("/api/v1/promotions/quote", json=body, headers=auth_headers), 600)


def test_order_limit_preserves_idempotency(client, auth_headers, limiter):
    pid, inv_id = StockFixture.create_stock()
    payload = StockFixture.payload(pid)
    headers = {**auth_headers, "Idempotency-Key": uuid4().hex}
    first = client.post("/api/v1/orders/web", json=payload, headers=headers)
    assert first.status_code == 201, first.text
    for _ in range(9):
        # Intenciones nuevas inválidas consumen cuota sin reservar inventario.
        bad = {**payload, "items": [{"product_id": 999999, "qty": 1}]}
        assert client.post("/api/v1/orders/web", json=bad, headers=auth_headers).status_code == 404
    assert_blocked(client.post("/api/v1/orders/web", json=payload, headers=auth_headers), 3600)
    replay = client.post("/api/v1/orders/web", json=payload, headers=headers)
    assert replay.status_code == 201 and replay.json()["id"] == first.json()["id"]
    with TestingSession() as db:
        assert db.query(Order).count() == 1
        assert db.get(Inventory, inv_id).qty_available == 3


def test_post_sale_limit_before_mutation(client, auth_headers, limiter):
    body = {"order_id": 999999, "kind": "incident", "reason": "Problema de entrega",
            "description": "Descripción suficiente de una incidencia."}
    for _ in range(10):
        assert client.post("/api/v1/post-sale", json=body, headers=auth_headers).status_code == 404
    assert_blocked(client.post("/api/v1/post-sale", json=body, headers=auth_headers), 86400)
    with TestingSession() as db:
        assert db.query(PostSaleCase).count() == 0


def test_buckets_and_identities_are_independent(limiter):
    request = SimpleNamespace(client=SimpleNamespace(host="192.0.2.1"))
    for bucket, identity in [("a", 1), ("a", 2), ("b", 1)]:
        protection.hit_rate_limit(request, bucket, 1, 60, identity=identity)
    with pytest.raises(HTTPException) as exc:
        protection.hit_rate_limit(request, "a", 1, 60, identity=1)
    assert exc.value.status_code == 429
    assert len(limiter.counts) == 3


def test_simulated_concurrency(limiter):
    def attempt(_):
        try:
            protection.hit_rate_limit(None, "parallel", 10, 60, identity=7)
            return True
        except HTTPException as exc:
            assert exc.status_code == 429
            return False
    with ThreadPoolExecutor(max_workers=12) as pool:
        assert sum(pool.map(attempt, range(40))) == 10


def test_production_redis_failure(limiter, monkeypatch):
    monkeypatch.setattr(protection.settings, "ENVIRONMENT", "production")
    def broken(*args):
        raise RedisError("offline")
    monkeypatch.setattr(limiter, "eval", broken)
    with pytest.raises(HTTPException) as exc:
        protection.hit_rate_limit(None, "orders", 10, 3600, identity=1)
    assert exc.value.status_code == 503
