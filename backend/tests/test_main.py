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
from app.models.models import User, UserRole, Location, LocationType
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
