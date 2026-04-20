from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.schemas.product import ProductCreate, ProductResponse
from app.services.product_service import calculate_price
from app.repositories.product_repository import create_product, get_products

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/", response_model=ProductResponse)
def create(data: ProductCreate, db: Session = Depends(get_db)):
    price = calculate_price(data.cost, data.margin)

    product_data = data.dict()
    product_data["price"] = price

    return create_product(db, product_data)


@router.get("/", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    return get_products(db)