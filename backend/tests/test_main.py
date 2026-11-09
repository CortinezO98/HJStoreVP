"""
Tests básicos — HJStoreVP
Ejecutar: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import Base, get_db
from app.models.models import (
    User, UserRole, Location, LocationType, Product, Inventory,
    Order, OrderItem, OrderChannel, OrderStatus, OrderStockReservation,
)
from app.core.security import hash_password

# ── Setup BD de prueba en memoria ─────────────────────────────────────────────
SQLALCHEMY_TEST_URL = "sqlite:///./test.db"

engine_test = create_engine(
    SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False}
)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine_test)
    db = TestingSession()

    # Crear ubicación web
    loc = Location(name="Web", type=LocationType.WEB, active=True)
    db.add(loc)
    db.flush()

    # Crear admin de prueba
    admin = User(
        email="test@hjstorevp.com",
        full_name="Test Admin",
        hashed_password=hash_password("Test1234!"),
        role=UserRole.SUPER_ADMIN,
        active=True,
    )
    db.add(admin)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    resp = client.post("/api/v1/auth/login", json={
        "email": "test@hjstorevp.com",
        "password": "Test1234!"
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── TESTS AUTH ────────────────────────────────────────────────────────────────

class TestAuth:
    def test_login_success(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "email": "test@hjstorevp.com",
            "password": "Test1234!"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user_role"] == "super_admin"

    def test_login_wrong_password(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "email": "test@hjstorevp.com",
            "password": "wrong"
        })
        assert resp.status_code == 401

    def test_login_wrong_email(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "email": "noexiste@test.com",
            "password": "Test1234!"
        })
        assert resp.status_code == 401

    def test_me_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@hjstorevp.com"

    def test_password_change_revokes_old_tokens(self, client):
        login = client.post("/api/v1/auth/login", json={
            "email": "test@hjstorevp.com", "password": "Test1234!"
        })
        assert login.status_code == 200
        old_access = login.json()["access_token"]
        old_refresh = login.json()["refresh_token"]

        db = TestingSession()
        try:
            user = db.query(User).filter(User.email == "test@hjstorevp.com").first()
            user.hashed_password = hash_password("NewStrongPass123!")
            db.commit()
        finally:
            db.close()

        me = client.get("/api/v1/auth/me", headers={
            "Authorization": f"Bearer {old_access}"
        })
        assert me.status_code == 401

        refreshed = client.post("/api/v1/auth/refresh", json={
            "refresh_token": old_refresh
        })
        assert refreshed.status_code == 401

        relogin = client.post("/api/v1/auth/login", json={
            "email": "test@hjstorevp.com", "password": "NewStrongPass123!"
        })
        assert relogin.status_code == 200

    def test_me_unauthenticated(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 403


# ── TESTS PRODUCTOS ───────────────────────────────────────────────────────────

class TestProducts:
    def test_list_products_public(self, client):
        resp = client.get("/api/v1/products")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_product_as_admin(self, client, auth_headers):
        resp = client.post("/api/v1/products", json={
            "name": "Gorra Test",
            "sku": "TEST-001",
            "cost_price": 25000,
            "margin_pct": 60,
        }, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["sku"] == "TEST-001"
        assert float(data["sale_price"]) == 40000.0   # 25000 * 1.6

    def test_create_product_duplicate_sku(self, client, auth_headers):
        payload = {"name": "Producto A", "sku": "DUP-001", "cost_price": 10000, "margin_pct": 50}
        client.post("/api/v1/products", json=payload, headers=auth_headers)
        resp = client.post("/api/v1/products", json=payload, headers=auth_headers)
        assert resp.status_code == 400

    def test_create_product_unauthorized(self, client):
        resp = client.post("/api/v1/products", json={
            "name": "Sin auth", "sku": "NO-AUTH", "cost_price": 1000, "margin_pct": 10
        })
        assert resp.status_code == 403

    def test_get_product_by_slug(self, client, auth_headers):
        client.post("/api/v1/products", json={
            "name": "Perfume Azul", "sku": "PER-AZL", "cost_price": 80000, "margin_pct": 70
        }, headers=auth_headers)
        resp = client.get("/api/v1/products/perfume-azul")
        assert resp.status_code == 200
        assert resp.json()["sku"] == "PER-AZL"

    def test_update_product_name_and_sku(self, client, auth_headers):
        created = client.post("/api/v1/products", json={
            "name": "Gorra Negra", "sku": "GOR-001",
            "cost_price": 25000, "margin_pct": 60,
        }, headers=auth_headers)
        assert created.status_code == 201
        pid = created.json()["id"]

        updated = client.put(f"/api/v1/products/{pid}", json={
            "name": "Gorra Azul", "sku": "GOR-002",
            "cost_price": 30000, "margin_pct": 50,
        }, headers=auth_headers)
        assert updated.status_code == 200
        assert updated.json()["sku"] == "GOR-002"
        assert updated.json()["sale_price"] == 45000.0

    def test_update_product_rejects_negative_sale_price(self, client, auth_headers):
        created = client.post("/api/v1/products", json={
            "name": "Reloj", "sku": "REL-001",
            "cost_price": 100000, "margin_pct": 20,
        }, headers=auth_headers)
        assert created.status_code == 201
        pid = created.json()["id"]
        updated = client.put(f"/api/v1/products/{pid}", json={
            "sale_price": -1,
        }, headers=auth_headers)
        assert updated.status_code == 422

    def test_web_order_rejects_invalid_item_quantities(self, client, auth_headers):
        address = {
            "full_name": "Cliente Prueba", "phone": "3000000000",
            "address_line1": "Calle 1", "city": "Bogotá", "department": "Cundinamarca",
        }
        for qty in (-1, 0, 1.5):
            response = client.post("/api/v1/orders/web", json={
                "items": [{"product_id": 1, "qty": qty}],
                "shipping_address": address,
            }, headers=auth_headers)
            assert response.status_code == 422

    def test_web_order_rejects_duplicate_items(self, client, auth_headers):
        response = client.post("/api/v1/orders/web", json={
            "items": [{"product_id": 1, "qty": 1}, {"product_id": 1, "qty": 1}],
            "shipping_address": {
                "full_name": "Cliente Prueba", "phone": "3000000000",
                "address_line1": "Calle 1", "city": "Bogotá",
                "department": "Cundinamarca",
            },
        }, headers=auth_headers)
        assert response.status_code == 422

    def test_physical_sale_rejects_invalid_items(self, client, auth_headers):
        for items in (
            [{"product_id": 1, "qty": -1}],
            [{"product_id": 1, "qty": 0}],
            [{"product_id": 1, "qty": 1}, {"product_id": 1, "qty": 2}],
        ):
            response = client.post("/api/v1/physical-sales", json={
                "items": items,
            }, headers=auth_headers)
            assert response.status_code == 422

    def test_deactivate_product(self, client, auth_headers):
        create = client.post("/api/v1/products", json={
            "name": "A borrar", "sku": "DEL-001", "cost_price": 5000, "margin_pct": 20
        }, headers=auth_headers)
        pid = create.json()["id"]
        resp = client.delete(f"/api/v1/products/{pid}", headers=auth_headers)
        assert resp.status_code == 204


# ── TESTS HEALTH ──────────────────────────────────────────────────────────────

class TestHealth:
    def test_root(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"

    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── REGRESIONES: RESERVAS DE COMPRA WEB ────────────────────────────────────

class TestWebOrderStockReservations:
    @staticmethod
    def create_stock(qty=5):
        db = TestingSession()
        product = Product(
            name="Gorra de Reserva", slug="gorra-de-reserva", sku="RES-001",
            cost_price=10000, margin_pct=50, sale_price=15000, active=True,
        )
        db.add(product)
        db.flush()
        location = db.query(Location).filter(Location.type == LocationType.WEB).first()
        inv = Inventory(
            product_id=product.id, location_id=location.id,
            qty_available=qty, qty_reserved=0,
        )
        db.add(inv)
        db.commit()
        ids = (product.id, inv.id)
        db.close()
        return ids

    @staticmethod
    def payload(product_id, qty=2):
        return {
            "items": [{"product_id": product_id, "qty": qty}],
            "shipping_address": {
                "full_name": "Cliente Reserva", "phone": "3000000000",
                "address_line1": "Calle 1", "city": "Bogotá",
                "department": "Cundinamarca",
            },
        }

    def test_pending_order_tracks_location_and_cancel_restores_only_once(
        self, client, auth_headers
    ):
        product_id, inv_id = self.create_stock()
        created = client.post(
            "/api/v1/orders/web", json=self.payload(product_id),
            headers=auth_headers,
        )
        assert created.status_code == 201, created.text
        order_id = created.json()["id"]

        db = TestingSession()
        inv = db.get(Inventory, inv_id)
        reservation = db.query(OrderStockReservation).filter_by(order_id=order_id).one()
        assert inv.qty_available == 3
        assert reservation.qty == 2
        assert reservation.location_id == inv.location_id
        assert reservation.status == "held"
        db.close()

        cancelled = client.post(
            f"/api/v1/orders/{order_id}/cancel", headers=auth_headers,
        )
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["changed"] is True
        repeated = client.post(
            f"/api/v1/orders/{order_id}/cancel", headers=auth_headers,
        )
        assert repeated.status_code == 200
        assert repeated.json()["changed"] is False

        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 5
        assert db.query(OrderStockReservation).filter_by(
            order_id=order_id
        ).one().status == "released"
        db.close()

        late_demo = client.post(
            "/api/v1/payments/confirm-demo",
            json={"order_number": created.json()["order_number"], "method": "wompi"},
            headers=auth_headers,
        )
        assert late_demo.status_code == 409

    def test_paid_order_commits_without_double_subtract(
        self, client, auth_headers
    ):
        product_id, inv_id = self.create_stock()
        created = client.post(
            "/api/v1/orders/web", json=self.payload(product_id),
            headers=auth_headers,
        )
        assert created.status_code == 201, created.text
        order_number = created.json()["order_number"]
        payment = client.post(
            "/api/v1/payments/confirm-demo",
            json={"order_number": order_number, "method": "wompi"},
            headers=auth_headers,
        )
        assert payment.status_code == 200, payment.text

        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 3
        assert db.query(OrderStockReservation).filter_by(
            order_id=created.json()["id"]
        ).one().status == "committed"
        db.close()

        cancel = client.post(
            f"/api/v1/orders/{created.json()['id']}/cancel",
            headers=auth_headers,
        )
        assert cancel.status_code == 409
        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 3
        db.close()

    def test_legacy_pending_order_cannot_restock_without_location(
        self, client, auth_headers
    ):
        product_id, inv_id = self.create_stock()
        db = TestingSession()
        user = db.query(User).filter_by(email="test@hjstorevp.com").one()
        order = Order(
            order_number="WEB-LEGACY-001", customer_id=user.id,
            channel=OrderChannel.WEB, status=OrderStatus.PENDING,
            subtotal=15000, total_amount=15000, total_cost=10000,
            shipping_address={"city": "Bogotá"},
        )
        db.add(order)
        db.commit()
        order_id = order.id
        db.close()

        result = client.post(
            f"/api/v1/orders/{order_id}/cancel", headers=auth_headers,
        )
        assert result.status_code == 409
        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 5
        assert db.get(Order, order_id).status == OrderStatus.PENDING
        db.close()

    def test_order_cannot_be_paid_by_admin_status_patch(
        self, client, auth_headers
    ):
        product_id, _ = self.create_stock()
        created = client.post(
            "/api/v1/orders/web", json=self.payload(product_id),
            headers=auth_headers,
        )
        assert created.status_code == 201
        result = client.patch(
            f"/api/v1/orders/{created.json()['id']}/status",
            params={"status": "paid"},
            headers=auth_headers,
        )
        assert result.status_code == 403

