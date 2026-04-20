from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import Optional, List
from app.db.session import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import Product, ProductImage, Category, User
from app.schemas.schemas import ProductCreate, ProductUpdate, ProductOut, ProductListOut
from python_slugify import slugify

router = APIRouter(prefix="/products", tags=["Productos"])


def generate_unique_slug(db: Session, name: str, exclude_id: int = None) -> str:
    base_slug = slugify(name)
    slug = base_slug
    counter = 1
    while True:
        q = db.query(Product).filter(Product.slug == slug)
        if exclude_id:
            q = q.filter(Product.id != exclude_id)
        if not q.first():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


# ─── PÚBLICO ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ProductListOut])
def list_products(
    db: Session = Depends(get_db),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    featured: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
):
    """Listado público del catálogo."""
    q = db.query(Product).filter(Product.active == True)

    if category_id:
        q = q.filter(Product.category_id == category_id)
    if search:
        q = q.filter(or_(
            Product.name.ilike(f"%{search}%"),
            Product.sku.ilike(f"%{search}%"),
            Product.description.ilike(f"%{search}%"),
        ))
    if featured is not None:
        q = q.filter(Product.featured == featured)

    products = q.options(
        joinedload(Product.images),
        joinedload(Product.category),
    ).offset((page - 1) * per_page).limit(per_page).all()

    result = []
    for p in products:
        primary = next((img.url for img in p.images if img.is_primary), None)
        if not primary and p.images:
            primary = p.images[0].url
        result.append(ProductListOut(
            id=p.id, name=p.name, slug=p.slug, sku=p.sku,
            sale_price=p.sale_price, active=p.active, featured=p.featured,
            category_id=p.category_id, primary_image=primary,
        ))
    return result


@router.get("/{slug_or_id}", response_model=ProductOut)
def get_product(slug_or_id: str, db: Session = Depends(get_db)):
    """Detalle de producto (por slug para tienda o por ID para admin)."""
    q = db.query(Product).options(
        joinedload(Product.images),
        joinedload(Product.category),
    )
    if slug_or_id.isdigit():
        product = q.filter(Product.id == int(slug_or_id)).first()
    else:
        product = q.filter(Product.slug == slug_or_id, Product.active == True).first()

    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


# ─── ADMIN ───────────────────────────────────────────────────────────────────

@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Verificar SKU único
    if db.query(Product).filter(Product.sku == data.sku).first():
        raise HTTPException(status_code=400, detail=f"El SKU '{data.sku}' ya existe")

    slug = generate_unique_slug(db, data.name)
    sale_price = round(data.cost_price * (1 + data.margin_pct / 100), 2)

    product = Product(
        name=data.name,
        slug=slug,
        sku=data.sku,
        description=data.description,
        category_id=data.category_id,
        cost_price=data.cost_price,
        margin_pct=data.margin_pct,
        sale_price=sale_price,
        stock_min_alert=data.stock_min_alert,
        featured=data.featured,
        attributes=data.attributes,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(product, field, value)

    # Recalcular precio de venta si cambiaron costo o margen
    if data.cost_price is not None or data.margin_pct is not None:
        product.sale_price = round(product.cost_price * (1 + product.margin_pct / 100), 2)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Soft delete — desactiva el producto en lugar de eliminarlo."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.active = False
    db.commit()
