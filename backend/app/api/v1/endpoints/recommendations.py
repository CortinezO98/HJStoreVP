"""Recomendaciones comerciales deterministas, públicas, sin datos personales ni descuentos ficticios."""
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, aliased

from app.db.session import get_db
from app.models.models import Inventory, Order, OrderItem, OrderStatus, Product, ProductImage

router = APIRouter(prefix="/recommendations", tags=["Recomendaciones comerciales"])
SUCCESSFUL = (OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED, OrderStatus.DELIVERED)
MAX_CART_REFERENCES = 30


def _parent_id(db: Session, product_id: int) -> int | None:
    item = db.query(Product.id, Product.parent_product_id).filter(
        Product.id == product_id
    ).first()
    return (item.parent_product_id or item.id) if item else None


def _recommend(db: Session, source_ids: list[int], limit: int, mode: str):
    """Rankear padres de catálogo, mostrar solo referencias con stock real."""
    if not source_ids:
        return []
    source_rows = db.query(Product).filter(Product.id.in_(source_ids)).all()
    sources = [p for p in source_rows if p.active and p.parent_product_id is None]
    if not sources:
        return []
    excluded = set(source_ids)

    # Compras en el mismo pedido: solo órdenes pagadas / cumplidas.
    sold = aliased(OrderItem)
    bought = aliased(OrderItem)
    purchased = (
        db.query(bought.product_id, func.count(func.distinct(sold.order_id)).label("orders"))
        .join(sold, sold.order_id == bought.order_id)
        .join(Order, Order.id == sold.order_id)
        .filter(Order.status.in_(SUCCESSFUL), sold.product_id.in_(
            db.query(Product.id).filter(
                (Product.id.in_(source_ids)) | (Product.parent_product_id.in_(source_ids))
            )
        ))
        .filter(bought.product_id != sold.product_id)
        .group_by(bought.product_id)
        .order_by(func.count(func.distinct(sold.order_id)).desc())
        .limit(200)
        .all()
    )
    co_purchases = defaultdict(int)
    for product_id, count in purchased:
        parent_id = _parent_id(db, product_id)
        if parent_id and parent_id not in excluded:
            co_purchases[parent_id] += int(count)

    child = aliased(Product)
    variant_counts = (
        db.query(child.parent_product_id.label("parent_id"),
                 func.count(child.id).label("children"),
                 func.min(child.sale_price).label("min_price"))
        .filter(child.parent_product_id.isnot(None), child.active.is_(True))
        .group_by(child.parent_product_id).subquery()
    )
    raw_variant_counts = (
        db.query(Product.parent_product_id.label("parent_id"), func.count(Product.id).label("children"))
        .filter(Product.parent_product_id.isnot(None))
        .group_by(Product.parent_product_id).subquery()
    )
    variant_stock = (
        db.query(child.parent_product_id.label("parent_id"),
                 func.coalesce(func.sum(Inventory.qty_available), 0).label("qty"))
        .join(Inventory, Inventory.product_id == child.id, isouter=True)
        .filter(child.parent_product_id.isnot(None), child.active.is_(True))
        .group_by(child.parent_product_id).subquery()
    )
    own_stock = (
        db.query(Inventory.product_id.label("product_id"),
                 func.coalesce(func.sum(Inventory.qty_available), 0).label("qty"))
        .group_by(Inventory.product_id).subquery()
    )
    base_photo = (
        db.query(ProductImage.product_id.label("product_id"),
                 func.max(ProductImage.url).label("url"))
        .filter(ProductImage.is_primary.is_(True))
        .group_by(ProductImage.product_id).subquery()
    )
    # Nunca se ofrece el padre como comprable si tiene cualquier variante.
    stock = case(
        (raw_variant_counts.c.children > 0, func.coalesce(variant_stock.c.qty, 0)),
        else_=func.coalesce(own_stock.c.qty, 0),
    )
    candidates = (
        db.query(Product.id, Product.name, Product.slug, Product.sku,
                 Product.category_id, Product.featured, Product.created_at,
                 Product.sale_price, variant_counts.c.min_price,
                 raw_variant_counts.c.children.label("children"),
                 stock.label("qty"), base_photo.c.url.label("photo"))
        .outerjoin(variant_counts, variant_counts.c.parent_id == Product.id)
        .outerjoin(raw_variant_counts, raw_variant_counts.c.parent_id == Product.id)
        .outerjoin(variant_stock, variant_stock.c.parent_id == Product.id)
        .outerjoin(own_stock, own_stock.c.product_id == Product.id)
        .outerjoin(base_photo, base_photo.c.product_id == Product.id)
        .filter(Product.parent_product_id.is_(None), Product.active.is_(True),
                Product.id.notin_(excluded), stock > 0)
        .order_by(Product.featured.desc(), Product.created_at.desc())
        .limit(500).all()
    )
    source_categories = {p.category_id for p in sources if p.category_id}
    ranked = []
    for item in candidates:
        score = co_purchases[item.id] * 100
        if item.category_id in source_categories:
            score += 30 if mode == "related" else 5
        elif mode == "cart":
            score += 15
        if item.featured:
            score += 3
        if mode == "related" and not score:
            continue
        ranked.append((score, item.created_at, item))
    ranked.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return [
        {
            "id": p.id, "name": p.name, "slug": p.slug, "sku": p.sku,
            "sale_price": float(p.min_price if p.children else p.sale_price),
            "primary_image": p.photo, "total_stock": int(p.qty),
            "has_variants": bool(p.children), "featured": bool(p.featured),
            "category_id": p.category_id,
            "recommendation_reason": (
                "Comprados juntos" if co_purchases[p.id] else
                "De la misma categoría" if p.category_id in source_categories else
                "Complementa tu compra"
            ),
        }
        for _, _, p in ranked[:limit]
    ]


@router.get("/products/{product_id}")
def recommend_for_product(
    product_id: int, limit: int = Query(4, ge=1, le=12),
    db: Session = Depends(get_db),
):
    parent_id = _parent_id(db, product_id)
    if parent_id is None:
        return []
    return _recommend(db, [parent_id], limit, "related")


@router.get("/cart")
def recommend_for_cart(
    product_ids: list[int] = Query(default=[]),
    limit: int = Query(4, ge=1, le=12),
    db: Session = Depends(get_db),
):
    if len(product_ids) > MAX_CART_REFERENCES:
        product_ids = product_ids[:MAX_CART_REFERENCES]
    parent_ids = {pid for raw in product_ids if (pid := _parent_id(db, raw)) is not None}
    return _recommend(db, sorted(parent_ids), limit, "cart")
