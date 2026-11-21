"""Datos sintéticos solo para la base temporal de docker-compose.e2e.yml.

Invocación: docker compose -f docker-compose.e2e.yml exec -T backend-e2e python e2e_seed.py
Nunca usar en un backend distinto al contenedor backend-e2e.
"""
import json
import os
from decimal import Decimal
from urllib.parse import urlsplit

from app.db.session import Base, SessionLocal, engine
from app.models.models import Inventory, Location, LocationType, Order, Product, ShippingRate, User, UserRole
from app.core.security import hash_password


def assert_isolated_environment():
    url = urlsplit(os.environ.get("DATABASE_URL", ""))
    assert url.hostname == "db-e2e", "Bloqueado: host no es db-e2e"
    assert url.path == "/hjstore_e2e", "Bloqueado: nombre de BD no aislado"
    assert os.environ.get("ENVIRONMENT") == "development"
    for name in ("EMAIL_LIVE_DELIVERY_ALLOWED", "WOMPI_ALLOW_LIVE_PAYMENTS", "CART_RECOVERY_LIVE_ALLOWED"):
        assert os.environ.get(name, "false").lower() == "false", f"Bloqueado: {name}"


def main():
    assert_isolated_environment()
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.query(Order).count():
            raise RuntimeError("Base E2E ya contiene pedidos; reiniciar con down antes de repetir")
        location = db.query(Location).filter_by(name="E2E Web Test").first()
        if location is None:
            location = Location(name="E2E Web Test", type=LocationType.WEB, active=True)
            db.add(location)
            db.flush()
        test_items = [
            ("E2E-BROWSER-001", "Producto sintético E2E navegador", "e2e-browser-item", 6),
            ("E2E-RACE-001", "Producto sintético E2E concurrencia", "e2e-race-item", 1),
        ]
        rows = []
        for sku, name, slug, qty in test_items:
            product = db.query(Product).filter_by(sku=sku).first()
            if product is None:
                product = Product(
                    name=name, slug=slug, sku=sku,
                    cost_price=Decimal("10000.00"),
                    margin_pct=Decimal("50.00"),
                    sale_price=Decimal("15000.00"),
                    active=True, featured=False,
                )
                db.add(product)
                db.flush()
            stock = db.query(Inventory).filter_by(product_id=product.id, location_id=location.id).first()
            if stock is None:
                stock = Inventory(product_id=product.id, location_id=location.id,
                                  qty_available=qty, qty_reserved=0)
                db.add(stock)
            else:
                stock.qty_available = qty
                stock.qty_reserved = 0
            rows.append({"sku": sku, "id": product.id, "qty": qty})
        rate = db.query(ShippingRate).filter_by(
            department_key="cundinamarca", city_key="bogota", carrier="E2E Test Carrier",
        ).first()
        if rate is None:
            rate = ShippingRate(
                department="Cundinamarca", department_key="cundinamarca",
                city="Bogotá", city_key="bogota", carrier="E2E Test Carrier",
                service="Prueba local", price=Decimal("12000.00"),
                days_min=2, days_max=4, active=True,
            )
            db.add(rate)
        # Cuentas sintéticas únicamente en la base db-e2e; nunca reutilizar
        # claves en producción. No se emiten tokens ni credenciales en logs.
        synthetic_users = [
            ("e2e-superadmin@example.com", UserRole.SUPER_ADMIN),
            ("e2e-seller@example.com", UserRole.SELLER),
        ]
        for email, role in synthetic_users:
            user = db.query(User).filter_by(email=email).first()
            if user is None:
                db.add(User(
                    email=email, full_name=f"Cuenta E2E {role.value}",
                    hashed_password=hash_password("E2E-Admin-Only-123!"),
                    role=role, active=True, deleted=False,
                ))
            elif user.role != role:
                raise RuntimeError("Rol sintético incompatible; reiniciar contenedor E2E")
        db.commit()
        print(json.dumps({"seed": "isolated", "products": rows, "shipping_rate_id": rate.id,
                          "synthetic_users": [email for email, _ in synthetic_users]}))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
