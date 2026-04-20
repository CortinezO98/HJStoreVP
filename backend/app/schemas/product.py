from pydantic import BaseModel


class ProductBase(BaseModel):
    name: str
    description: str | None = None
    cost: float
    margin: float


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    price: float
    is_active: bool

    class Config:
        from_attributes = True