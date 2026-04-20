"""
seed.py — Datos iniciales para HJStoreVP
Ejecutar desde el contenedor: python seed.py
"""
import sys
import os

sys.path.insert(0, '/app')

from slugify import slugify
from app.db.session import SessionLocal, engine, Base
from app.models.models import (
    User, UserRole, Location, LocationType,
    Category, Product, Inventory
)
from app.core.security import hash_password
from app.core.config import settings
from decimal import Decimal


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print("🌱 Iniciando seed de datos...")

        # ── 1. UBICACIONES ───────────────────────────────────────────
        if not db.query(Location).first():
            locations = [
                Location(name="Tienda Web", type=LocationType.WEB, active=True),
                Location(name="Punto Fisico 1 Centro",    type=LocationType.PHYSICAL, address="Calle 10 #5-23, Barranquilla", active=True),
                Location(name="Punto Fisico 2 Norte",     type=LocationType.PHYSICAL, address="Cra 53 #82-15, Barranquilla", active=True),
                Location(name="Punto Fisico 3 Sur",       type=LocationType.PHYSICAL, address="Calle 30 #14-20, Barranquilla", active=True),
                Location(name="Punto Fisico 4 Occidente", type=LocationType.PHYSICAL, address="Cra 38 #45-10, Barranquilla", active=True),
            ]
            db.add_all(locations)
            db.flush()
            print(f"  OK {len(locations)} ubicaciones creadas")
        else:
            print("  -- Ubicaciones ya existen")

        # ── 2. USUARIOS ──────────────────────────────────────────────
        if not db.query(User).filter(User.email == settings.FIRST_ADMIN_EMAIL).first():
            admin = User(
                email=settings.FIRST_ADMIN_EMAIL,
                full_name="Administrador HJStoreVP",
                hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
                role=UserRole.SUPER_ADMIN,
                active=True,
            )
            db.add(admin)

            physical_locs = db.query(Location).filter(
                Location.type == LocationType.PHYSICAL
            ).all()

            sellers = []
            for i, loc in enumerate(physical_locs, 1):
                seller = User(
                    email=f"vendedor{i}@hjstorevp.com",
                    full_name=f"Vendedor Punto {i}",
                    hashed_password=hash_password("Vendedor123!"),
                    role=UserRole.SELLER,
                    location_id=loc.id,
                    active=True,
                )
                sellers.append(seller)
            db.add_all(sellers)
            db.flush()
            print(f"  OK Admin y {len(sellers)} vendedores creados")
        else:
            print("  -- Usuarios ya existen")

        # ── 3. CATEGORIAS ────────────────────────────────────────────
        if not db.query(Category).first():
            cats_data = [
                ("Gorras",   "Gorras y sombreros de todo tipo"),
                ("Perfumes", "Fragancias para dama y caballero"),
                ("Relojes",  "Relojes casuales y de vestir"),
                ("Bolsos",   "Bolsos, carteras y maletines"),
                ("Canguros", "Canguros y rinioneras"),
            ]
            categories = []
            for idx, (name, desc) in enumerate(cats_data):
                cat = Category(
                    name=name,
                    slug=slugify(name),
                    description=desc,
                    active=True,
                    sort_order=idx,
                )
                categories.append(cat)
            db.add_all(categories)
            db.flush()
            print(f"  OK {len(categories)} categorias creadas")
        else:
            print("  -- Categorias ya existen")

        # ── 4. PRODUCTOS ─────────────────────────────────────────────
        if not db.query(Product).first():
            cat_gorras   = db.query(Category).filter(Category.slug == "gorras").first()
            cat_perfumes = db.query(Category).filter(Category.slug == "perfumes").first()
            cat_relojes  = db.query(Category).filter(Category.slug == "relojes").first()
            cat_bolsos   = db.query(Category).filter(Category.slug == "bolsos").first()
            cat_canguros = db.query(Category).filter(Category.slug == "canguros").first()

            web_loc   = db.query(Location).filter(Location.type == LocationType.WEB).first()
            phys_locs = db.query(Location).filter(Location.type == LocationType.PHYSICAL).all()

            products_data = [
                ("Gorra HJ Classic Negra",  "GOR-001", Decimal("25000"),  Decimal("60"), cat_gorras,   True),
                ("Gorra HJ Classic Blanca", "GOR-002", Decimal("25000"),  Decimal("60"), cat_gorras,   False),
                ("Gorra HJ Snapback Azul",  "GOR-003", Decimal("30000"),  Decimal("55"), cat_gorras,   False),
                ("Perfume HJ Gold 100ml",   "PER-001", Decimal("80000"),  Decimal("70"), cat_perfumes, True),
                ("Perfume HJ Silver 50ml",  "PER-002", Decimal("50000"),  Decimal("65"), cat_perfumes, False),
                ("Reloj HJ Sport Negro",    "REL-001", Decimal("120000"), Decimal("50"), cat_relojes,  True),
                ("Reloj HJ Clasico Dorado", "REL-002", Decimal("150000"), Decimal("50"), cat_relojes,  False),
                ("Bolso HJ Dama Camel",     "BOL-001", Decimal("90000"),  Decimal("55"), cat_bolsos,   True),
                ("Bolso HJ Dama Negro",     "BOL-002", Decimal("90000"),  Decimal("55"), cat_bolsos,   False),
                ("Canguro HJ Urban Negro",  "CAN-001", Decimal("35000"),  Decimal("60"), cat_canguros, False),
                ("Canguro HJ Urban Gris",   "CAN-002", Decimal("35000"),  Decimal("60"), cat_canguros, False),
            ]

            products = []
            for name, sku, cost, margin, cat, featured in products_data:
                sale_price = round(cost * (1 + margin / 100), 2)
                prod = Product(
                    name=name,
                    slug=slugify(name),
                    sku=sku,
                    cost_price=cost,
                    margin_pct=margin,
                    sale_price=sale_price,
                    category_id=cat.id if cat else None,
                    featured=featured,
                    active=True,
                    stock_min_alert=5,
                )
                products.append(prod)
            db.add_all(products)
            db.flush()

            all_locs = ([web_loc] if web_loc else []) + phys_locs
            for prod in products:
                for loc in all_locs:
                    db.add(Inventory(
                        product_id=prod.id,
                        location_id=loc.id,
                        qty_available=20,
                        qty_reserved=0,
                    ))

            print(f"  OK {len(products)} productos creados con stock inicial")
        else:
            print("  -- Productos ya existen")

        db.commit()
        print("\n SEED COMPLETADO!")
        print(f"  Admin    -> {settings.FIRST_ADMIN_EMAIL} / {settings.FIRST_ADMIN_PASSWORD}")
        print(f"  Vendedor -> vendedor1@hjstorevp.com / Vendedor123!")
        print(f"  API Docs -> http://localhost:8000/docs")

    except Exception as e:
        db.rollback()
        print(f"\n ERROR en seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()