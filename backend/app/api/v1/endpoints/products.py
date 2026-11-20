from decimal import Decimal
from datetime import datetime
import hashlib
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload, aliased
from slugify import slugify

from app.core.deps import require_admin, require_super_admin, get_optional_user, is_catalog_admin
from app.db.session import get_db
from app.models.models import Category, Inventory, Location, Product, ProductImage, ProductQualityReview, User
from app.schemas.schemas import ProductCreate, ProductUpdate

router = APIRouter(prefix="/products", tags=["Productos"])


def unique_slug(db: Session, name: str, exclude_id: int | None = None) -> str:
    base = slugify(name)
    slug = base
    counter = 1

    while True:
        q = db.query(Product).filter(Product.slug == slug)
        if exclude_id:
            q = q.filter(Product.id != exclude_id)

        if not q.first():
            return slug

        slug = f"{base}-{counter}"
        counter += 1


def serialize_product_list_row(row, admin: bool = False) -> dict:
    payload = {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "sku": row.sku,
        "sale_price": float(row.sale_price or 0),
        "active": row.active,
        "featured": row.featured,
        "category_id": row.category_id,
        "category_name": row.category_name,
        "category_slug": row.category_slug,
        "primary_image": row.primary_image,
        "total_stock": int(row.total_stock or 0),
        "has_variants": bool(row.variant_count),
        "stock_min_alert": row.stock_min_alert,
    }
    if admin:
        payload["cost_price"] = float(row.cost_price or 0)
        payload["margin_pct"] = float(row.margin_pct or 0)
    return payload


@router.get("/filters")
def catalog_variant_filters(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=150),
    db: Session = Depends(get_db),
):
    """Facetas públicas calculadas a partir de variantes y padres activos."""
    parent = aliased(Product)
    q = (
        db.query(Product.variant_options)
        .join(parent, parent.id == Product.parent_product_id)
        .outerjoin(Category, Category.id == parent.category_id)
        .filter(Product.active.is_(True), parent.active.is_(True))
    )
    if category:
        q = q.filter(Category.slug == category)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            parent.name.ilike(like) | parent.sku.ilike(like)
            | parent.description.ilike(like)
        )
    values = {"color": set(), "talla": set(), "presentacion": set()}
    for (options,) in q.all():
        if not isinstance(options, dict):
            continue
        for key in values:
            value = options.get(key)
            if isinstance(value, str) and value.strip():
                values[key].add(value.strip())
    return {key: sorted(items, key=str.casefold) for key, items in values.items()}


@router.get("/")
def list_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    featured: Optional[bool] = Query(None),
    min_price: Optional[Decimal] = Query(None),
    max_price: Optional[Decimal] = Query(None),
    in_stock: Optional[bool] = Query(None),
    color: Optional[str] = Query(None, max_length=80),
    talla: Optional[str] = Query(None, max_length=80),
    presentacion: Optional[str] = Query(None, max_length=80),
    sort: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    admin = is_catalog_admin(current_user)
    if include_inactive and not admin:
        raise HTTPException(status_code=403, detail="Consultar productos inactivos requiere permisos de administración")
    primary_image_subq = (
        db.query(
            ProductImage.product_id.label("product_id"),
            func.max(ProductImage.url).label("primary_image"),
        )
        .filter(ProductImage.is_primary == True)
        .group_by(ProductImage.product_id)
        .subquery()
    )

    total_stock_subq = (
        db.query(
            Inventory.product_id.label("product_id"),
            func.coalesce(func.sum(Inventory.qty_available), 0).label("total_stock"),
        )
        .group_by(Inventory.product_id)
        .subquery()
    )

    # Catálogo público: una línea se asigna a UNA ubicación activa.
    # Mostrar la suma de sedes permitiría añadir cantidades que checkout
    # no puede reservar (ej. 3 + 3 no significa 6 en una sede).
    online_stock_subq = (
        db.query(
            Inventory.product_id.label("product_id"),
            func.coalesce(func.max(Inventory.qty_available), 0).label("online_stock"),
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(Location.active.is_(True))
        .group_by(Inventory.product_id)
        .subquery()
    )

    child = aliased(Product)
    variant_prices = (
        db.query(
            child.parent_product_id.label("parent_id"),
            func.count(child.id).label("variant_count"),
            func.min(case((child.active.is_(True), child.sale_price), else_=None)).label("min_price"),
        )
        .filter(child.parent_product_id.isnot(None))
        .group_by(child.parent_product_id)
        .subquery()
    )
    variant_stock = (
        db.query(
            child.parent_product_id.label("parent_id"),
            func.coalesce(func.sum(case((child.active.is_(True), Inventory.qty_available), else_=0)), 0).label("stock"),
        )
        .join(Inventory, Inventory.product_id == child.id, isouter=True)
        .filter(child.parent_product_id.isnot(None))
        .group_by(child.parent_product_id)
        .subquery()
    )
    # Cada variante es una referencia vendible independiente. Se suma el
    # máximo abastecible de cada variante, NO el stock global por sedes.
    variant_online_stock = (
        db.query(
            child.parent_product_id.label("parent_id"),
            func.coalesce(func.sum(
                case((child.active.is_(True), online_stock_subq.c.online_stock), else_=0)
            ), 0).label("stock"),
        )
        .outerjoin(online_stock_subq, online_stock_subq.c.product_id == child.id)
        .filter(child.parent_product_id.isnot(None))
        .group_by(child.parent_product_id)
        .subquery()
    )
    active_filters = {
        key: value.strip()
        for key, value in (
            ("color", color), ("talla", talla), ("presentacion", presentacion)
        )
        if value and value.strip()
    }
    matched_variant = None
    matching_variant_image = None
    if active_filters:
        # El filtro tiene semántica AND sobre la MISMA variante activa.
        variant = aliased(Product)
        if admin:
            matched = (
                db.query(
                    variant.parent_product_id.label("parent_id"),
                    func.min(variant.sale_price).label("min_price"),
                    func.coalesce(func.sum(Inventory.qty_available), 0).label("stock"),
                )
                .outerjoin(Inventory, Inventory.product_id == variant.id)
            )
        else:
            matched = (
                db.query(
                    variant.parent_product_id.label("parent_id"),
                    func.min(variant.sale_price).label("min_price"),
                    func.coalesce(func.sum(online_stock_subq.c.online_stock), 0).label("stock"),
                )
                .outerjoin(online_stock_subq, online_stock_subq.c.product_id == variant.id)
            )
        matched = matched.filter(variant.active.is_(True), variant.parent_product_id.isnot(None))
        for key, value in active_filters.items():
            matched = matched.filter(variant.variant_options[key].as_string() == value)
        matched_variant = matched.group_by(variant.parent_product_id).subquery()

        photo_variant = aliased(Product)
        photo = aliased(ProductImage)
        photo_q = db.query(photo.url).join(
            photo_variant, photo_variant.id == photo.product_id
        ).filter(
            photo_variant.parent_product_id == Product.id,
            photo_variant.active.is_(True),
            photo.is_primary.is_(True),
        )
        for key, value in active_filters.items():
            photo_q = photo_q.filter(photo_variant.variant_options[key].as_string() == value)
        matching_variant_image = photo_q.order_by(photo_variant.id).limit(1).correlate(Product).scalar_subquery()

    effective_price = (
        matched_variant.c.min_price if matched_variant is not None
        else case(
            (variant_prices.c.variant_count > 0, func.coalesce(variant_prices.c.min_price, Product.sale_price)),
            else_=Product.sale_price,
        )
    )
    effective_stock = (
        matched_variant.c.stock if matched_variant is not None and admin
        else matched_variant.c.stock if matched_variant is not None
        else case(
            (variant_prices.c.variant_count > 0,
             func.coalesce(variant_stock.c.stock if admin else variant_online_stock.c.stock, 0)),
            else_=func.coalesce(total_stock_subq.c.total_stock if admin else online_stock_subq.c.online_stock, 0),
        )
    )
    effective_image = (
        func.coalesce(matching_variant_image, primary_image_subq.c.primary_image)
        if matching_variant_image is not None else primary_image_subq.c.primary_image
    )

    q = (
        db.query(
            Product.id,
            Product.name,
            Product.slug,
            Product.sku,
            effective_price.label("sale_price"),
            Product.cost_price,
            Product.margin_pct,
            Product.stock_min_alert,
            Product.active,
            Product.featured,
            Product.category_id,
            Category.name.label("category_name"),
            Category.slug.label("category_slug"),
            effective_image.label("primary_image"),
            effective_stock.label("total_stock"),
            func.coalesce(variant_prices.c.variant_count, 0).label("variant_count"),
        )
        .outerjoin(Category, Category.id == Product.category_id)
        .outerjoin(primary_image_subq, primary_image_subq.c.product_id == Product.id)
        .outerjoin(total_stock_subq, total_stock_subq.c.product_id == Product.id)
        .outerjoin(online_stock_subq, online_stock_subq.c.product_id == Product.id)
        .outerjoin(variant_online_stock, variant_online_stock.c.parent_id == Product.id)
        .outerjoin(variant_prices, variant_prices.c.parent_id == Product.id)
        .outerjoin(variant_stock, variant_stock.c.parent_id == Product.id)
        .filter(Product.parent_product_id.is_(None))
    )
    if matched_variant is not None:
        q = q.join(matched_variant, matched_variant.c.parent_id == Product.id)

    if not include_inactive:
        q = q.filter(Product.active == True)

    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            Product.name.ilike(like)
            | Product.sku.ilike(like)
            | Product.description.ilike(like)
        )

    if category:
        q = q.filter(Category.slug == category)

    if featured is True:
        q = q.filter(Product.featured == True)

    if min_price is not None:
        q = q.filter(effective_price >= min_price)

    if max_price is not None:
        q = q.filter(effective_price <= max_price)

    if in_stock:
        q = q.filter(effective_stock > 0)

    if sort == "price_asc":
        q = q.order_by(effective_price.asc(), Product.name.asc())
    elif sort == "price_desc":
        q = q.order_by(effective_price.desc(), Product.name.asc())
    elif sort == "newest":
        q = q.order_by(Product.created_at.desc())
    elif sort == "featured":
        q = q.order_by(Product.featured.desc(), Product.created_at.desc())
    else:
        q = q.order_by(Product.featured.desc(), Product.created_at.desc())

    offset = (page - 1) * per_page
    rows = q.offset(offset).limit(per_page).all()

    return [serialize_product_list_row(row, admin=admin) for row in rows]


class CatalogQualityDecision(BaseModel):
    decision: str = Field(pattern=r"^(approved|needs_changes|pending)$")
    note: str = Field(default="", max_length=2000)
    confirmed_photos: bool = False


def quality_snapshot(product: Product, images: list[ProductImage]) -> str:
    """Content-based snapshot; old approvals expire after edits to merchandise."""
    serial = {
        "name": product.name, "description": product.description or "",
        "category_id": product.category_id,
        "photos": [
            [image.id, image.url, image.alt_text, image.is_primary, image.sort_order]
            for image in sorted(images, key=lambda item: (item.sort_order, item.id))
        ],
    }
    return hashlib.sha256(json.dumps(serial, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def quality_flags(product: Product, images: list[ProductImage], used_urls: dict) -> list[str]:
    issues = []
    primary = [image for image in images if image.is_primary]
    if not images:
        issues.append("no_images")
    elif len(primary) != 1:
        issues.append("invalid_primary")
    if len((product.description or "").strip()) < 60:
        issues.append("short_description")
    if product.category_id is None:
        issues.append("missing_category")
    if any(len((image.alt_text or "").strip()) < 12 for image in images):
        issues.append("missing_image_alt")
    if any(len(used_urls[image.url]) > 1 for image in images if image.url):
        issues.append("shared_image_url")
    if len(images) == 1:
        issues.append("single_photo")
    return issues


@router.put("/admin/catalog-quality/{product_id}/review")
def review_catalog_product(
    product_id: int,
    payload: CatalogQualityDecision,
    db: Session = Depends(get_db),
    reviewer: User = Depends(require_super_admin),
):
    """Superadmin editorial approval. Not a product activation endpoint."""
    from collections import defaultdict
    product = db.query(Product).filter(
        Product.id == product_id, Product.parent_product_id.is_(None)
    ).with_for_update().first()
    if product is None:
        raise HTTPException(status_code=404, detail="Producto principal no encontrado")
    photos = db.query(ProductImage).filter(
        ProductImage.product_id == product.id
    ).order_by(ProductImage.sort_order, ProductImage.id).all()
    used = defaultdict(set)
    for row in db.query(ProductImage.product_id, ProductImage.url).join(
        Product, Product.id == ProductImage.product_id
    ).filter(Product.parent_product_id.is_(None)).all():
        if row.url:
            used[row.url].add(row.product_id)
    flags = quality_flags(product, photos, used)
    if payload.decision == "approved":
        critical = {"no_images", "invalid_primary", "missing_category"}
        if critical.intersection(flags):
            raise HTTPException(status_code=422,
                                detail="Corrige las fotografías principales y la categoría antes de aprobar")
        if not payload.confirmed_photos:
            raise HTTPException(status_code=422,
                                detail="Confirma manualmente que las fotografías corresponden al producto")
    note = payload.note.strip()
    if payload.decision == "needs_changes" and len(note) < 5:
        raise HTTPException(status_code=422, detail="Indica qué debe corregirse (mínimo 5 caracteres)")
    previous = db.get(ProductQualityReview, product_id)
    if previous is None:
        previous = ProductQualityReview(product_id=product_id, status=payload.decision,
                                        note=note, snapshot_hash=quality_snapshot(product, photos),
                                        reviewed_by=reviewer.id, reviewed_at=datetime.utcnow())
        db.add(previous)
    else:
        previous.status = payload.decision
        previous.note = note
        previous.snapshot_hash = quality_snapshot(product, photos)
        previous.reviewed_by = reviewer.id
        previous.reviewed_at = datetime.utcnow()
    db.commit()
    return {"product_id": product_id, "status": previous.status, "issues": flags,
            "reviewed_at": previous.reviewed_at}


@router.get("/admin/catalog-quality")
def catalog_quality_report(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Read-only merchandising audit. Does not edit catalog or inspect image semantics.

    Same URL across distinct parent products is a *possible* duplicate;
    intentional shared photographs are permitted and need human review.
    """
    from collections import defaultdict

    parents = db.query(Product).filter(Product.parent_product_id.is_(None))
    if not include_inactive:
        parents = parents.filter(Product.active.is_(True))
    products = parents.order_by(Product.id).all()
    if not products:
        return {"total": 0, "issues": [], "summary": {},
                "checked": {"active_only": not include_inactive,
                            "duplicate_method": "identical_image_url"}}

    ids = [product.id for product in products]
    photos = db.query(ProductImage).filter(
        ProductImage.product_id.in_(ids)
    ).order_by(ProductImage.product_id, ProductImage.sort_order, ProductImage.id).all()
    grouped = defaultdict(list)
    used_urls = defaultdict(set)
    for photo in photos:
        grouped[photo.product_id].append(photo)
        if photo.url:
            used_urls[photo.url].add(photo.product_id)

    reviews = {
        row.product_id: row for row in db.query(ProductQualityReview).filter(
            ProductQualityReview.product_id.in_(ids)
        ).all()
    }
    issues = []
    totals = defaultdict(int)
    score_total = 0
    approved = 0
    awaiting_review = 0
    stale = 0
    for product in products:
        current = grouped[product.id]
        issues_for_product = quality_flags(product, current, used_urls)
        for issue in issues_for_product:
            totals[issue] += 1
        weights = {
            "no_images": 35, "invalid_primary": 30, "missing_category": 15,
            "short_description": 10, "missing_image_alt": 5,
            "shared_image_url": 5, "single_photo": 5,
        }
        score = max(0, 100 - sum(weights.get(flag, 0) for flag in issues_for_product))
        score_total += score
        record = reviews.get(product.id)
        changed = bool(record and record.snapshot_hash != quality_snapshot(product, current))
        review_status = "stale" if changed else record.status if record else "pending"
        if review_status == "approved":
            approved += 1
        if review_status == "pending":
            awaiting_review += 1
        if review_status == "stale":
            stale += 1
        issues.append({
            "id": product.id, "name": product.name, "sku": product.sku,
            "slug": product.slug, "active": product.active,
            "image_count": len(current), "issues": issues_for_product,
            "score": score,
            "review_status": review_status,
            "review_note": record.note if record else "",
            "reviewed_at": record.reviewed_at.isoformat() if record else None,
            "reviewed_by": record.reviewed_by if record else None,
        })

    return {
        "total": len(products),
        "affected": sum(bool(item["issues"]) for item in issues),
        "average_score": round(score_total / len(products), 1),
        "approved": approved,
        "awaiting_review": awaiting_review,
        "stale": stale,
        "summary": dict(totals),
        "issues": issues,
        "checked": {"active_only": not include_inactive,
                    "duplicate_method": "identical_image_url",
                    "score_is_advisory": True},
    }


@router.get("/{slug_or_id}")
def get_product(
    slug_or_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    q = (
        db.query(Product)
        .options(
            joinedload(Product.category),
            joinedload(Product.images),
            joinedload(Product.inventory),
        )
        .filter(Product.active == True)
    )

    product = None

    if slug_or_id.isdigit():
        product = q.filter(Product.id == int(slug_or_id)).first()

    if not product:
        product = q.filter(Product.slug == slug_or_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    from app.api.v1.endpoints.variants import variant_snapshot
    variant_count = db.query(func.count(Product.id)).filter(
        Product.parent_product_id == product.id
    ).scalar() if product.parent_product_id is None else 0
    variants = variant_snapshot(db, product.id, admin=is_catalog_admin(current_user)) if variant_count else []
    if variant_count:
        total_stock = sum(int(entry["total_stock"]) for entry in variants)
    elif is_catalog_admin(current_user):
        total_stock = sum(int(inv.qty_available or 0) for inv in product.inventory)
    else:
        active_location_ids = {
            location_id for (location_id,) in db.query(Location.id).filter(
                Location.active.is_(True)
            ).all()
        }
        total_stock = max(
            (int(inv.qty_available or 0) for inv in product.inventory
             if inv.location_id in active_location_ids),
            default=0,
        )
    sale_price = min((Decimal(str(entry["sale_price"])) for entry in variants), default=product.sale_price) if variant_count else product.sale_price
    primary_image = None

    sorted_images = sorted(
        product.images,
        key=lambda x: (0 if x.is_primary else 1, x.sort_order, x.id),
    )

    if sorted_images:
        primary_image = sorted_images[0].url

    payload = {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "sku": product.sku,
        "description": product.description,
        "category_id": product.category_id,
        "category": {
            "id": product.category.id,
            "name": product.category.name,
            "slug": product.category.slug,
            "description": product.category.description,
            "image_url": product.category.image_url,
            "parent_id": product.category.parent_id,
            "active": product.category.active,
            "sort_order": product.category.sort_order,
        }
        if product.category
        else None,
        "sale_price": float(sale_price or 0),
        "has_variants": bool(variant_count),
        "variants": variants,
        "stock_min_alert": product.stock_min_alert,
        "active": product.active,
        "featured": product.featured,
        "attributes": product.attributes or {},
        "primary_image": primary_image,
        "total_stock": int(total_stock or 0),
        "images": [
            {
                "id": img.id,
                "url": img.url,
                "alt_text": img.alt_text,
                "is_primary": img.is_primary,
                "sort_order": img.sort_order,
            }
            for img in sorted_images
        ],
        "created_at": product.created_at,
    }
    if is_catalog_admin(current_user):
        payload["cost_price"] = float(product.cost_price or 0)
        payload["margin_pct"] = float(product.margin_pct or 0)
    return payload


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if db.query(Product).filter(Product.sku == data.sku).first():
        raise HTTPException(status_code=400, detail="Ya existe un producto con ese SKU")

    if data.category_id:
        category = db.query(Category).filter(Category.id == data.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

    sale_price = (
        data.sale_price
        if data.sale_price is not None
        else round(data.cost_price * (1 + data.margin_pct / 100), 2)
    )

    product = Product(
        name=data.name,
        slug=unique_slug(db, data.name),
        sku=data.sku,
        description=data.description,
        category_id=data.category_id,
        cost_price=data.cost_price,
        margin_pct=data.margin_pct,
        sale_price=sale_price,
        stock_min_alert=data.stock_min_alert,
        featured=data.featured,
        active=True,
        attributes=data.attributes,
    )

    db.add(product)
    db.commit()
    db.refresh(product)

    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "sku": product.sku,
        "sale_price": float(product.sale_price or 0),
        "cost_price": float(product.cost_price or 0),
        "margin_pct": float(product.margin_pct or 0),
        "stock_min_alert": product.stock_min_alert,
        "active": product.active,
        "featured": product.featured,
    }


@router.put("/{product_id}")
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if data.name is not None:
        product.name = data.name
        product.slug = unique_slug(db, data.name, exclude_id=product_id)

    if data.sku is not None:
        existing_sku = (
            db.query(Product)
            .filter(Product.sku == data.sku, Product.id != product_id)
            .first()
        )
        if existing_sku:
            raise HTTPException(status_code=400, detail="Ya existe un producto con ese SKU")
        product.sku = data.sku

    if data.description is not None:
        product.description = data.description

    if data.category_id is not None:
        if data.category_id:
            category = db.query(Category).filter(Category.id == data.category_id).first()
            if not category:
                raise HTTPException(status_code=404, detail="Categoría no encontrada")
        product.category_id = data.category_id

    if data.cost_price is not None:
        product.cost_price = data.cost_price

    if data.margin_pct is not None:
        product.margin_pct = data.margin_pct

    if data.cost_price is not None or data.margin_pct is not None:
        product.sale_price = round(product.cost_price * (1 + product.margin_pct / 100), 2)

    if data.sale_price is not None:
        product.sale_price = data.sale_price

    if data.stock_min_alert is not None:
        product.stock_min_alert = data.stock_min_alert

    if data.active is not None:
        product.active = data.active

    if data.featured is not None:
        product.featured = data.featured

    if data.attributes is not None:
        product.attributes = data.attributes

    db.commit()
    db.refresh(product)

    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "sku": product.sku,
        "sale_price": float(product.sale_price or 0),
        "cost_price": float(product.cost_price or 0),
        "margin_pct": float(product.margin_pct or 0),
        "stock_min_alert": product.stock_min_alert,
        "active": product.active,
        "featured": product.featured,
    }


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    product.active = False
    db.commit()