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
    Order, OrderItem, OrderChannel, OrderStatus, OrderStockReservation, ShippingRate,
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
    # Tarifa configurable de prueba; sin costos inventados en producción.
    db.add(ShippingRate(
        department="Cundinamarca", department_key="cundinamarca",
        city="Bogotá", city_key="bogota",
        carrier="Transportadora de Prueba", service="Estándar",
        price=12000, days_min=2, days_max=5, active=True,
    ))
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
        db = TestingSession()
        rate_id = db.query(ShippingRate).filter_by(active=True).first().id
        db.close()
        return {
            "items": [{"product_id": product_id, "qty": qty}],
            "shipping_rate_id": rate_id,
            "shipping_price_confirmed": 12000,
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

    def test_shipping_price_is_server_authoritative(self, client, auth_headers):
        product_id, inv_id = self.create_stock()
        data = self.payload(product_id)
        data["shipping_amount"] = -1000000  # Manipulación del navegador, ignorada.
        result = client.post("/api/v1/orders/web", json=data, headers=auth_headers)
        assert result.status_code == 201, result.text
        assert result.json()["subtotal"] == 30000
        assert result.json()["shipping_amount"] == 12000
        assert result.json()["total_amount"] == 42000
        assert result.json()["shipping_address"]["carrier"] == "Transportadora de Prueba"

    def test_shipping_price_change_requires_new_confirmation(self, client, auth_headers):
        product_id, inventory_id = self.create_stock()
        data = self.payload(product_id)
        data["shipping_price_confirmed"] = 5000
        result = client.post("/api/v1/orders/web", json=data, headers=auth_headers)
        assert result.status_code == 409
        db = TestingSession()
        assert db.get(Inventory, inventory_id).qty_available == 5
        db.close()

    def test_shipping_rate_cannot_apply_to_another_city(self, client, auth_headers):
        product_id, inv_id = self.create_stock()
        data = self.payload(product_id)
        data["shipping_address"]["city"] = "Medellín"
        result = client.post("/api/v1/orders/web", json=data, headers=auth_headers)
        assert result.status_code == 409
        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 5
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


    def test_initiated_payment_prevents_unsafe_cancellation(
        self, client, auth_headers
    ):
        product_id, inv_id = self.create_stock()
        created = client.post(
            "/api/v1/orders/web", json=self.payload(product_id),
            headers=auth_headers,
        )
        assert created.status_code == 201
        db = TestingSession()
        order = db.get(Order, created.json()["id"])
        order.payment_method = "wompi"  # Simula inicio de proceso en la pasarela.
        db.commit()
        db.close()

        cancel = client.post(
            f"/api/v1/orders/{created.json()['id']}/cancel",
            headers=auth_headers,
        )
        assert cancel.status_code == 409
        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 3
        assert db.query(OrderStockReservation).filter_by(
            order_id=created.json()["id"]
        ).one().status == "held"
        db.close()

    def test_webhook_failure_restores_after_initiated_payment(
        self, client, auth_headers
    ):
        from app.services.stock_reservations import cancel_web_order, lock_web_order
        product_id, inv_id = self.create_stock()
        created = client.post(
            "/api/v1/orders/web", json=self.payload(product_id),
            headers=auth_headers,
        )
        assert created.status_code == 201
        db = TestingSession()
        order = lock_web_order(db, created.json()["id"])
        order.payment_method = "wompi"
        db.commit()
        db.close()

        db = TestingSession()
        order = lock_web_order(db, created.json()["id"])
        assert cancel_web_order(
            db, order, "Proveedor rechazó el cobro",
            provider_confirmed_failure=True,
        ) is True
        db.commit()
        db.close()
        db = TestingSession()
        assert db.get(Inventory, inv_id).qty_available == 5
        assert db.query(OrderStockReservation).filter_by(
            order_id=created.json()["id"]
        ).one().status == "released"
        db.close()


# ── PUBLIC CATALOG PRIVACY / AUTHORIZATION ──────────────────────────────────

def test_public_catalog_does_not_expose_commercial_costs(client, auth_headers):
    created = client.post("/api/v1/products/", json={
        "name": "Gorra privada", "sku": "PRIV-COST-001",
        "cost_price": 20000, "margin_pct": 45,
    }, headers=auth_headers)
    assert created.status_code == 201
    item_id = created.json()["id"]

    public_list = client.get("/api/v1/products/").json()
    record = next(item for item in public_list if item["id"] == item_id)
    assert "cost_price" not in record
    assert "margin_pct" not in record

    public_detail = client.get(f"/api/v1/products/{item_id}").json()
    assert "cost_price" not in public_detail
    assert "margin_pct" not in public_detail

    admin_list = client.get("/api/v1/products/", headers=auth_headers).json()
    admin_record = next(item for item in admin_list if item["id"] == item_id)
    assert "cost_price" in admin_record
    assert "margin_pct" in admin_record


def test_public_cannot_request_inactive_catalog(client, auth_headers):
    for path in ("/api/v1/products/?include_inactive=true",
                 "/api/v1/categories?include_inactive=true"):
        assert client.get(path).status_code == 403
        assert client.get(path, headers=auth_headers).status_code == 200


def test_http_security_headers(client):
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"]


# ─── UNITARIOS DE FASE 4: PRODUCTOS CON VARIANTES ────────────────────────────

def test_variant_has_own_sku_price_and_inventory(client, auth_headers):
    created = client.post("/api/v1/products/", headers=auth_headers, json={
        "name": "Perfume presentación", "sku": "PER-BASE-V4",
        "cost_price": 40000, "margin_pct": 30,
    })
    assert created.status_code == 201, created.text
    parent_id = created.json()["id"]

    child = client.post(f"/api/v1/products/{parent_id}/variants", headers=auth_headers, json={
        "sku": "PER-50ML-V4", "label": "50 ml",
        "options": {"presentacion": "50 ml"}, "cost_price": 24000,
        "sale_price": 43000,
    })
    assert child.status_code == 201, child.text
    variant_id = child.json()["id"]
    assert variant_id != parent_id

    public_detail = client.get(f"/api/v1/products/{parent_id}")
    assert public_detail.status_code == 200, public_detail.text
    detail = public_detail.json()
    assert detail["has_variants"] is True
    assert detail["variants"][0]["id"] == variant_id
    assert detail["variants"][0]["sale_price"] == 43000
    assert "cost_price" not in detail["variants"][0]
    assert "cost_price" not in detail

    catalog = client.get("/api/v1/products/").json()
    assert any(item["id"] == parent_id and item["has_variants"] for item in catalog)
    assert all(item["id"] != variant_id for item in catalog)

    # Productos principales con variantes no pueden venderse directamente:
    # se exige seleccionar la referencia vendible antes de calcular envío.
    order = client.post("/api/v1/orders/web", headers=auth_headers, json={
        "items": [{"product_id": parent_id, "qty": 1}],
        "shipping_address": {
            "full_name": "Test", "phone": "3000000000",
            "address_line1": "Calle de pruebas", "city": "Bogotá",
            "department": "Cundinamarca",
        },
        "shipping_rate_id": 1, "shipping_price_confirmed": 12000,
    })
    assert order.status_code == 409, order.text


def test_variant_admin_access_and_deactivation(client, auth_headers):
    created = client.post("/api/v1/products/", headers=auth_headers, json={
        "name": "Gorra colores", "sku": "GOR-BASE-V4",
        "cost_price": 20000, "margin_pct": 50,
    })
    assert created.status_code == 201, created.text
    parent_id = created.json()["id"]
    payload = {
        "sku": "GOR-RED-V4", "label": "Roja", "options": {"color": "Rojo"},
        "cost_price": 20000, "sale_price": 39000,
    }
    assert client.post(f"/api/v1/products/{parent_id}/variants", json=payload).status_code in (401, 403)
    created_variant = client.post(
        f"/api/v1/products/{parent_id}/variants", headers=auth_headers, json=payload
    )
    assert created_variant.status_code == 201
    variant_id = created_variant.json()["id"]
    disabled = client.patch(
        f"/api/v1/products/{parent_id}/variants/{variant_id}",
        headers=auth_headers, json={"active": False},
    )
    assert disabled.status_code == 200
    public = client.get(f"/api/v1/products/{parent_id}").json()
    assert public["has_variants"] is True
    assert public["variants"] == []
    admin = client.get(f"/api/v1/products/{parent_id}/variants", headers=auth_headers).json()
    assert admin[0]["active"] is False


# ─── FASE 4: FILTROS DE ATRIBUTOS E IMÁGENES POR VARIANTE ───────────────────

def test_catalog_variant_facets_match_the_same_active_sku(client, auth_headers):
    parent = client.post("/api/v1/products/", headers=auth_headers, json={
        "name": "Gorra atributos", "sku": "CAP-FACET-BASE",
        "cost_price": 12000, "margin_pct": 80,
    })
    assert parent.status_code == 201
    pid = parent.json()["id"]
    variants = []
    for sku, label, options, price in [
        ("CAP-BL-M", "Azul M", {"color": "Azul", "talla": "M"}, 50000),
        ("CAP-NE-L", "Negra L", {"color": "Negro", "talla": "L"}, 60000),
    ]:
        result = client.post(f"/api/v1/products/{pid}/variants", headers=auth_headers, json={
            "sku": sku, "label": label, "options": options,
            "cost_price": 12000, "sale_price": price,
        })
        assert result.status_code == 201, result.text
        variants.append(result.json()["id"])

    db = TestingSession()
    web = db.query(Location).filter(Location.type == LocationType.WEB).first()
    db.add(Inventory(product_id=variants[0], location_id=web.id, qty_available=5, qty_reserved=0))
    db.add(Inventory(product_id=variants[1], location_id=web.id, qty_available=2, qty_reserved=0))
    db.commit()
    db.close()

    available = client.get("/api/v1/products/filters").json()
    assert "Azul" in available["color"] and "Negro" in available["color"]
    assert available["talla"] == ["L", "M"]

    blue_m = client.get("/api/v1/products/", params={"color": "Azul", "talla": "M"})
    assert blue_m.status_code == 200
    row = next(item for item in blue_m.json() if item["id"] == pid)
    assert row["sale_price"] == 50000
    assert row["total_stock"] == 5
    assert row["has_variants"] is True

    # No debe combinar el color de una variante con la talla de otra.
    assert not any(item["id"] == pid for item in client.get(
        "/api/v1/products/", params={"color": "Azul", "talla": "L"}
    ).json())
    assert not any(item["id"] == pid for item in client.get(
        "/api/v1/products/", params={"color": "Azul", "min_price": 55000}
    ).json())

    disabled = client.patch(
        f"/api/v1/products/{pid}/variants/{variants[0]}",
        headers=auth_headers, json={"active": False},
    )
    assert disabled.status_code == 200
    assert not any(item["id"] == pid for item in client.get(
        "/api/v1/products/", params={"color": "Azul"}
    ).json())


def test_variant_image_is_visible_on_variant_and_filtered_catalog(client, auth_headers, tmp_path, monkeypatch):
    from io import BytesIO
    from PIL import Image
    from app.api.v1.endpoints import images as image_routes

    parent = client.post("/api/v1/products/", headers=auth_headers, json={
        "name": "Gorra fotografías", "sku": "CAP-PHOTO-BASE",
        "cost_price": 12000, "margin_pct": 80,
    })
    assert parent.status_code == 201
    pid = parent.json()["id"]
    child = client.post(f"/api/v1/products/{pid}/variants", headers=auth_headers, json={
        "sku": "CAP-PHOTO-RED", "label": "Rojo", "options": {"color": "Rojo"},
        "cost_price": 12000, "sale_price": 40000,
    })
    assert child.status_code == 201
    vid = child.json()["id"]

    def local_save(content, extension):
        target = tmp_path / f"variant-photo.{extension}"
        target.write_bytes(content)
        return f"/uploads/products/{target.name}", target

    monkeypatch.setattr(image_routes, "save_file_local", local_save)
    output = BytesIO()
    Image.new("RGB", (16, 16), (200, 0, 0)).save(output, format="PNG")

    uploaded = client.post(
        f"/api/v1/products/{vid}/images",
        files=[("files", ("photo.png", output.getvalue(), "image/png"))],
        headers=auth_headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    photo = uploaded.json()[0]
    assert photo["is_primary"] is True

    public = client.get(f"/api/v1/products/{pid}").json()
    assert public["variants"][0]["primary_image"] == photo["url"]
    assert public["variants"][0]["images"][0]["url"] == photo["url"]
    assert "cost_price" not in public["variants"][0]

    catalog = client.get("/api/v1/products/", params={"color": "Rojo"})
    assert catalog.status_code == 200, catalog.text
    selected = next(item for item in catalog.json() if item["id"] == pid)
    assert selected["primary_image"] == photo["url"]
