from sqlalchemy.orm import Session
from app.models.product import Product


def create_product(db: Session, data: dict):
    product = Product(**data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def get_products(db: Session):
    return db.query(Product).all()