import sys
sys.path.insert(0, '/app')
from slugify import slugify
from app.db.session import SessionLocal, engine, Base
from app.models.models import User, UserRole, Location, LocationType, Category, Product, Inventory
from app.core.security import hash_password
from decimal import Decimal

Base.metadata.create_all(bind=engine)
db = SessionLocal()

try:
    from sqlalchemy import text
    db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    db.execute(text("TRUNCATE TABLE inventory"))
    db.execute(text("TRUNCATE TABLE order_items"))
    db.execute(text("TRUNCATE TABLE orders"))
    db.execute(text("TRUNCATE TABLE stock_movements"))
    db.execute(text("TRUNCATE TABLE product_images"))
    db.execute(text("TRUNCATE TABLE products"))
    db.execute(text("TRUNCATE TABLE categories"))
    db.execute(text("TRUNCATE TABLE addresses"))
    db.execute(text("TRUNCATE TABLE users"))
    db.execute(text("TRUNCATE TABLE locations"))
    db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    db.commit()
    print("BD limpia")

    locs = [
        Location(name="Tienda Web", type=LocationType.WEB, active=True),
        Location(name="Punto 1 Centro", type=LocationType.PHYSICAL, address="Calle 10 #5-23, Barranquilla", active=True),
        Location(name="Punto 2 Norte", type=LocationType.PHYSICAL, address="Cra 53 #82-15, Barranquilla", active=True),
        Location(name="Punto 3 Sur", type=LocationType.PHYSICAL, address="Calle 30 #14-20, Barranquilla", active=True),
        Location(name="Punto 4 Occidente", type=LocationType.PHYSICAL, address="Cra 38 #45-10, Barranquilla", active=True),
    ]
    db.add_all(locs)
    db.commit()
    print("OK 5 ubicaciones")

    admin = User(
        email="admin@hjstorevp.com",
        full_name="Admin HJStoreVP",
        hashed_password=hash_password("Admin123!"),
        role=UserRole.SUPER_ADMIN,
        active=True,
    )
    db.add(admin)
    db.commit()
    print("OK admin id=" + str(admin.id))

    plocs = db.query(Location).filter(Location.type == LocationType.PHYSICAL).all()
    for i, loc in enumerate(plocs, 1):
        db.add(User(
            email="vendedor" + str(i) + "@hjstorevp.com",
            full_name="Vendedor " + str(i),
            hashed_password=hash_password("Vendedor123!"),
            role=UserRole.SELLER,
            location_id=loc.id,
            active=True,
        ))
    db.commit()
    print("OK " + str(len(plocs)) + " vendedores")

    cats = [("Gorras","gorras"),("Perfumes","perfumes"),("Relojes","relojes"),("Bolsos","bolsos"),("Canguros","canguros")]
    for i, (n, s) in enumerate(cats):
        db.add(Category(name=n, slug=s, description=n, active=True, sort_order=i))
    db.commit()
    print("OK 5 categorias")

    cg = db.query(Category).filter_by(slug="gorras").first()
    cp = db.query(Category).filter_by(slug="perfumes").first()
    cr = db.query(Category).filter_by(slug="relojes").first()
    cb = db.query(Category).filter_by(slug="bolsos").first()
    cc = db.query(Category).filter_by(slug="canguros").first()
    wl = db.query(Location).filter_by(type=LocationType.WEB).first()
    pls = db.query(Location).filter_by(type=LocationType.PHYSICAL).all()

    prods = [
        ("Gorra HJ Classic Negra",  "GOR-001", 25000,  60, cg, True),
        ("Gorra HJ Classic Blanca", "GOR-002", 25000,  60, cg, False),
        ("Gorra HJ Snapback Azul",  "GOR-003", 30000,  55, cg, False),
        ("Perfume HJ Gold 100ml",   "PER-001", 80000,  70, cp, True),
        ("Perfume HJ Silver 50ml",  "PER-002", 50000,  65, cp, False),
        ("Reloj HJ Sport Negro",    "REL-001", 120000, 50, cr, True),
        ("Reloj HJ Clasico Dorado", "REL-002", 150000, 50, cr, False),
        ("Bolso HJ Dama Camel",     "BOL-001", 90000,  55, cb, True),
        ("Bolso HJ Dama Negro",     "BOL-002", 90000,  55, cb, False),
        ("Canguro HJ Urban Negro",  "CAN-001", 35000,  60, cc, False),
        ("Canguro HJ Urban Gris",   "CAN-002", 35000,  60, cc, False),
    ]

    saved = []
    for n, sku, cost, margin, cat, feat in prods:
        c = Decimal(str(cost))
        m = Decimal(str(margin))
        p = Product(
            name=n, slug=slugify(n), sku=sku,
            cost_price=c, margin_pct=m,
            sale_price=round(c * (1 + m / 100), 2),
            category_id=cat.id if cat else None,
            featured=feat, active=True, stock_min_alert=5,
        )
        db.add(p)
        saved.append(p)
    db.commit()

    all_locs = ([wl] if wl else []) + pls
    for p in saved:
        for loc in all_locs:
            db.add(Inventory(product_id=p.id, location_id=loc.id, qty_available=20, qty_reserved=0))
    db.commit()
    print("OK " + str(len(saved)) + " productos con stock")

    print("")
    print("=== SEED COMPLETADO ===")
    print("Admin:    admin@hjstorevp.com / Admin123!")
    print("Vendedor: vendedor1@hjstorevp.com / Vendedor123!")
    print("API Docs: http://localhost:8000/docs")
    print("Tienda:   http://localhost:5173")
    print("Admin UI: http://localhost:5174")

except Exception as e:
    db.rollback()
    import traceback
    traceback.print_exc()
    print("ERROR: " + str(e))
finally:
    db.close()