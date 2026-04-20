"""
Schemas Pydantic v2 — HJStoreVP
Validación de entrada/salida para todos los endpoints.
"""
from pydantic import BaseModel, EmailStr, field_validator, computed_field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.models import UserRole, LocationType, OrderStatus, OrderChannel


# ─── AUTH ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_role: UserRole
    user_id: int
    full_name: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── USERS ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.CUSTOMER
    phone: Optional[str] = None
    location_id: Optional[int] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None
    location_id: Optional[int] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str]
    active: bool
    location_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── LOCATIONS ───────────────────────────────────────────────────────────────

class LocationCreate(BaseModel):
    name: str
    type: LocationType = LocationType.PHYSICAL
    address: Optional[str] = None
    phone: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None


class LocationOut(BaseModel):
    id: int
    name: str
    type: LocationType
    address: Optional[str]
    phone: Optional[str]
    active: bool

    model_config = {"from_attributes": True}


# ─── CATEGORIES ──────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    image_url: Optional[str]
    parent_id: Optional[int]
    active: bool
    sort_order: int

    model_config = {"from_attributes": True}


# ─── PRODUCTS ────────────────────────────────────────────────────────────────

class ProductImageOut(BaseModel):
    id: int
    url: str
    alt_text: Optional[str]
    is_primary: bool
    sort_order: int

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    sku: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    cost_price: Decimal
    margin_pct: Decimal
    stock_min_alert: int = 5
    featured: bool = False
    attributes: Optional[dict] = None

    @field_validator("cost_price", "margin_pct")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("El valor no puede ser negativo")
        return v

    @computed_field
    @property
    def sale_price(self) -> Decimal:
        return round(self.cost_price * (1 + self.margin_pct / 100), 2)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    cost_price: Optional[Decimal] = None
    margin_pct: Optional[Decimal] = None
    stock_min_alert: Optional[int] = None
    active: Optional[bool] = None
    featured: Optional[bool] = None
    attributes: Optional[dict] = None


class ProductOut(BaseModel):
    id: int
    name: str
    slug: str
    sku: str
    description: Optional[str]
    category_id: Optional[int]
    category: Optional[CategoryOut]
    cost_price: Decimal
    margin_pct: Decimal
    sale_price: Decimal
    stock_min_alert: int
    active: bool
    featured: bool
    images: List[ProductImageOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductListOut(BaseModel):
    """Versión ligera para listas y catálogo."""
    id: int
    name: str
    slug: str
    sku: str
    sale_price: Decimal
    active: bool
    featured: bool
    category_id: Optional[int]
    primary_image: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── INVENTORY ───────────────────────────────────────────────────────────────

class InventoryOut(BaseModel):
    id: int
    product_id: int
    location_id: int
    location: LocationOut
    qty_available: int
    qty_reserved: int
    qty_real: int

    model_config = {"from_attributes": True}


class StockAdjust(BaseModel):
    product_id: int
    location_id: int
    qty: int
    notes: Optional[str] = None


class StockTransfer(BaseModel):
    product_id: int
    from_location_id: int
    to_location_id: int
    qty: int
    notes: Optional[str] = None


# ─── ORDERS ──────────────────────────────────────────────────────────────────

class OrderItemCreate(BaseModel):
    product_id: int
    qty: int


class OrderCreateWeb(BaseModel):
    items: List[OrderItemCreate]
    shipping_address_id: int
    notes: Optional[str] = None


class OrderCreatePhysical(BaseModel):
    items: List[OrderItemCreate]
    location_id: int
    notes: Optional[str] = None


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: str
    qty: int
    unit_price: Decimal
    cost_price: Decimal
    margin_pct: Decimal
    line_total: Decimal
    gross_profit: Decimal

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    order_number: str
    channel: OrderChannel
    status: OrderStatus
    subtotal: Decimal
    discount_amount: Decimal
    shipping_amount: Decimal
    total_amount: Decimal
    total_cost: Decimal
    payment_method: Optional[str]
    payment_ref: Optional[str]
    paid_at: Optional[datetime]
    shipping_address: Optional[dict]
    notes: Optional[str]
    items: List[OrderItemOut] = []
    customer_id: Optional[int]
    location_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── PAGINACIÓN ──────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int
    pages: int
