from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from slugify import slugify

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import Category, Inventory, Product, ProductImage, User
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


def serialize_product_list_row(row) -> dict:
    return {
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
        "cost_price": float(row.cost_price or 0),
        "margin_pct": float(row.margin_pct or 0),
        "stock_min_alert": row.stock_min_alert,
    }


@router.get("/")
def list_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    featured: Optional[bool] = Query(None),
    min_price: Optional[Decimal] = Query(None),
    max_price: Optional[Decimal] = Query(None),
    in_stock: Optional[bool] = Query(None),
    sort: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
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

    q = (
        db.query(
            Product.id,
            Product.name,
            Product.slug,
            Product.sku,
            Product.sale_price,
            Product.cost_price,
            Product.margin_pct,
            Product.stock_min_alert,
            Product.active,
            Product.featured,
            Product.category_id,
            Category.name.label("category_name"),
            Category.slug.label("category_slug"),
            primary_image_subq.c.primary_image,
            func.coalesce(total_stock_subq.c.total_stock, 0).label("total_stock"),
        )
        .outerjoin(Category, Category.id == Product.category_id)
        .outerjoin(primary_image_subq, primary_image_subq.c.product_id == Product.id)
        .outerjoin(total_stock_subq, total_stock_subq.c.product_id == Product.id)
    )

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
        q = q.filter(Product.sale_price >= min_price)

    if max_price is not None:
        q = q.filter(Product.sale_price <= max_price)

    if in_stock:
        q = q.filter(func.coalesce(total_stock_subq.c.total_stock, 0) > 0)

    if sort == "price_asc":
        q = q.order_by(Product.sale_price.asc(), Product.name.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.sale_price.desc(), Product.name.asc())
    elif sort == "newest":
        q = q.order_by(Product.created_at.desc())
    elif sort == "featured":
        q = q.order_by(Product.featured.desc(), Product.created_at.desc())
    else:
        q = q.order_by(Product.featured.desc(), Product.created_at.desc())

    offset = (page - 1) * per_page
    rows = q.offset(offset).limit(per_page).all()

    return [serialize_product_list_row(row) for row in rows]


@router.get("/{slug_or_id}")
def get_product(slug_or_id: str, db: Session = Depends(get_db)):
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

    total_stock = sum((inv.qty_available or 0) for inv in product.inventory)
    primary_image = None

    sorted_images = sorted(
        product.images,
        key=lambda x: (0 if x.is_primary else 1, x.sort_order, x.id),
    )

    if sorted_images:
        primary_image = sorted_images[0].url

    return {
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
        "cost_price": float(product.cost_price or 0),
        "margin_pct": float(product.margin_pct or 0),
        "sale_price": float(product.sale_price or 0),
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