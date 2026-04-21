"""
Endpoints de categorías con CRUD completo.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.core.deps import require_admin, get_current_user
from app.models.models import Category, Product, User
from pydantic import BaseModel
from slugify import slugify

router = APIRouter(prefix="/categories", tags=["Categorías"])


class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    parent_id: Optional[int]
    active: bool
    sort_order: int
    product_count: int = 0

    model_config = {"from_attributes": True}


def unique_slug(db: Session, name: str, exclude_id: int = None) -> str:
    base = slugify(name)
    slug = base
    counter = 1
    while True:
        q = db.query(Category).filter(Category.slug == slug)
        if exclude_id:
            q = q.filter(Category.id != exclude_id)
        if not q.first():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


@router.get("", response_model=List[CategoryOut])
def list_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Category)
    if not include_inactive:
        q = q.filter(Category.active == True)
    cats = q.order_by(Category.sort_order, Category.name).all()

    result = []
    for cat in cats:
        count = db.query(Product).filter(
            Product.category_id == cat.id,
            Product.active == True,
        ).count()
        result.append(CategoryOut(
            id=cat.id, name=cat.name, slug=cat.slug,
            description=cat.description, parent_id=cat.parent_id,
            active=cat.active, sort_order=cat.sort_order,
            product_count=count,
        ))
    return result


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    data: CategoryIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    slug = unique_slug(db, data.name)
    cat = Category(
        name=data.name,
        slug=slug,
        description=data.description,
        parent_id=data.parent_id,
        sort_order=data.sort_order,
        active=True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut(
        id=cat.id, name=cat.name, slug=cat.slug,
        description=cat.description, parent_id=cat.parent_id,
        active=cat.active, sort_order=cat.sort_order,
        product_count=0,
    )


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    data: CategoryIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    cat.name = data.name
    cat.slug = unique_slug(db, data.name, exclude_id=category_id)
    cat.description = data.description
    cat.parent_id = data.parent_id
    cat.sort_order = data.sort_order
    db.commit()
    db.refresh(cat)

    count = db.query(Product).filter(
        Product.category_id == cat.id, Product.active == True
    ).count()
    return CategoryOut(
        id=cat.id, name=cat.name, slug=cat.slug,
        description=cat.description, parent_id=cat.parent_id,
        active=cat.active, sort_order=cat.sort_order,
        product_count=count,
    )


@router.patch("/{category_id}/toggle", response_model=CategoryOut)
def toggle_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    cat.active = not cat.active
    db.commit()
    db.refresh(cat)
    count = db.query(Product).filter(
        Product.category_id == cat.id, Product.active == True
    ).count()
    return CategoryOut(
        id=cat.id, name=cat.name, slug=cat.slug,
        description=cat.description, parent_id=cat.parent_id,
        active=cat.active, sort_order=cat.sort_order,
        product_count=count,
    )
