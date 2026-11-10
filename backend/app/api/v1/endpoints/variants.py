"""Variantes vendibles: heredan catálogo del padre pero mantienen SKU, precio e inventario propios."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_admin, get_optional_user, is_catalog_admin
from app.db.session import get_db
from app.models.models import Inventory, Product, ProductImage, User

router = APIRouter(prefix="/products", tags=["Variantes"])


class VariantCreate(BaseModel):
    sku: str = Field(min_length=2, max_length=100)
    label: str = Field(min_length=1, max_length=120)
    options: dict[str, str] = Field(default_factory=dict)
    cost_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    sale_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class VariantUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    options: dict[str, str] | None = None
    cost_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    sale_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    active: bool | None = None


def _options(values: dict[str, str]) -> dict[str, str]:
    if len(values) > 6 or any(
        not isinstance(k, str) or not isinstance(v, str)
        or not k.strip() or not v.strip() or len(k) > 40 or len(v) > 80
        for k, v in values.items()
    ):
        raise HTTPException(status_code=422, detail="Máximo seis opciones, con claves y valores cortos")
    return {k.strip(): v.strip() for k, v in values.items()}


def _parent(db: Session, product_id: int) -> Product:
    item = db.query(Product).filter(
        Product.id == product_id, Product.parent_product_id.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Producto principal no encontrado")
    return item


def variant_snapshot(db: Session, parent_id: int, admin: bool = False) -> list[dict]:
    children = db.query(Product).filter(
        Product.parent_product_id == parent_id
    ).order_by(Product.id).all()
    images = db.query(ProductImage).filter(
        ProductImage.product_id.in_([child.id for child in children])
    ).order_by(ProductImage.product_id, ProductImage.is_primary.desc(),
               ProductImage.sort_order, ProductImage.id).all() if children else []
    images_by_variant: dict[int, list[dict]] = {}
    for image in images:
        images_by_variant.setdefault(image.product_id, []).append({
            "id": image.id, "url": image.url, "alt_text": image.alt_text,
            "is_primary": image.is_primary, "sort_order": image.sort_order,
        })
    result = []
    for item in children:
        if not admin and not item.active:
            continue
        stock = db.query(func.coalesce(func.sum(Inventory.qty_available), 0)).filter(
            Inventory.product_id == item.id
        ).scalar()
        entry = {
            "id": item.id, "sku": item.sku, "label": item.name,
            "options": item.variant_options or {},
            "sale_price": float(item.sale_price),
            "total_stock": int(stock or 0), "active": item.active,
            "primary_image": images_by_variant.get(item.id, [{}])[0].get("url"),
            "images": images_by_variant.get(item.id, []),
        }
        if admin:
            entry["cost_price"] = float(item.cost_price)
        result.append(entry)
    return result


@router.get("/{product_id}/variants")
def list_variants(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    parent = _parent(db, product_id)
    admin = is_catalog_admin(current_user)
    if not parent.active and not admin:
        raise HTTPException(status_code=404, detail="Producto no disponible")
    return variant_snapshot(db, product_id, admin=admin)


@router.post("/{product_id}/variants", status_code=201)
def create_variant(
    product_id: int,
    data: VariantCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    parent = _parent(db, product_id)
    if db.query(Product.id).filter(Product.sku == data.sku.strip()).first():
        raise HTTPException(status_code=409, detail="El SKU ya existe")
    # Si el padre ya posee stock, requiere transferencia operativa antes de
    # activar variantes: no se convierte silenciosamente inventario existente.
    existing = db.query(func.coalesce(func.sum(Inventory.qty_available), 0)).filter(
        Inventory.product_id == parent.id
    ).scalar()
    if existing:
        raise HTTPException(status_code=409, detail="El producto base aún tiene inventario. Agota o ajusta su stock antes de crear variantes.")
    from app.api.v1.endpoints.products import unique_slug
    variant = Product(
        name=data.label.strip(), sku=data.sku.strip(),
        slug=unique_slug(db, f"{parent.slug}-{data.sku}"),
        parent_product_id=parent.id, variant_options=_options(data.options),
        category_id=parent.category_id, description=parent.description,
        cost_price=data.cost_price,
        sale_price=data.sale_price,
        margin_pct=Decimal("0"), active=True, featured=False,
        stock_min_alert=parent.stock_min_alert,
    )
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return {"id": variant.id, "sku": variant.sku, "label": variant.name, "sale_price": float(variant.sale_price)}


@router.patch("/{product_id}/variants/{variant_id}")
def update_variant(
    product_id: int,
    variant_id: int,
    data: VariantUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _parent(db, product_id)
    variant = db.query(Product).filter(
        Product.id == variant_id, Product.parent_product_id == product_id
    ).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variante no encontrada")
    if data.label is not None:
        variant.name = data.label.strip()
    if data.options is not None:
        variant.variant_options = _options(data.options)
    if data.cost_price is not None:
        variant.cost_price = data.cost_price
    if data.sale_price is not None:
        variant.sale_price = data.sale_price
    if data.active is not None:
        variant.active = data.active
    db.commit()
    return {"id": variant.id, "active": variant.active, "sale_price": float(variant.sale_price)}
