"""
Modelos de base de datos — HJStoreVP
Todos los modelos en un solo módulo para facilitar las migraciones de Alembic.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    String, Text, Boolean, Integer, Numeric, DateTime,
    ForeignKey, Enum, JSON, Index, UniqueConstraint,
    func, event
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
import enum


# ─── ENUMS ──────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SELLER = "seller"       # Vendedor de punto físico
    CUSTOMER = "customer"   # Cliente de tienda web


class LocationType(str, enum.Enum):
    WEB = "web"
    PHYSICAL = "physical"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"           # Creada, esperando pago
    PAID = "paid"                 # Pago confirmado
    PREPARING = "preparing"       # En preparación
    SHIPPED = "shipped"           # Enviada
    DELIVERED = "delivered"       # Entregada
    CANCELLED = "cancelled"       # Cancelada
    REFUNDED = "refunded"         # Reembolsada


class OrderChannel(str, enum.Enum):
    WEB = "web"
    PHYSICAL = "physical"


class StockMovementType(str, enum.Enum):
    IN = "in"               # Ingreso de mercancía
    OUT_SALE = "out_sale"   # Salida por venta
    TRANSFER = "transfer"   # Transferencia entre puntos
    ADJUSTMENT = "adjustment"  # Ajuste manual


# ─── MODELO BASE ────────────────────────────────────────────────────────────

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


# ─── LOCATIONS (Puntos físicos + tienda web) ────────────────────────────────

class Location(Base, TimestampMixin):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[LocationType] = mapped_column(
        Enum(LocationType), nullable=False, default=LocationType.PHYSICAL
    )
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relaciones
    users: Mapped[list["User"]] = relationship("User", back_populates="location")
    inventory: Mapped[list["Inventory"]] = relationship("Inventory", back_populates="location")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="location")
    stock_movements: Mapped[list["StockMovement"]] = relationship("StockMovement", back_populates="location")

    def __repr__(self):
        return f"<Location {self.name} ({self.type})>"


# ─── USERS ──────────────────────────────────────────────────────────────────

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.CUSTOMER
    )
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Solo para vendedores físicos
    location_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # Relaciones
    location: Mapped[Optional["Location"]] = relationship("Location", back_populates="users")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")
    addresses: Mapped[list["Address"]] = relationship("Address", back_populates="user")

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


class Address(Base, TimestampMixin):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(100), default="Casa")
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    address_line1: Mapped[str] = mapped_column(String(300), nullable=False)
    address_line2: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="addresses")


# ─── CATEGORIES ─────────────────────────────────────────────────────────────

class Category(Base, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Relaciones
    parent: Mapped[Optional["Category"]] = relationship("Category", remote_side="Category.id")
    children: Mapped[list["Category"]] = relationship("Category", back_populates="parent")
    products: Mapped[list["Product"]] = relationship("Product", back_populates="category")

    def __repr__(self):
        return f"<Category {self.name}>"


# ─── PRODUCTS ───────────────────────────────────────────────────────────────

class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    slug: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    category_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Precios
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    margin_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    # Precio de venta = cost_price * (1 + margin_pct / 100) — calculado en la app
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Stock global (suma de todos los puntos)
    stock_min_alert: Mapped[int] = mapped_column(Integer, default=5)

    # Estado
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)

    # Atributos extra (talla, color, etc.)
    attributes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relaciones
    category: Mapped[Optional["Category"]] = relationship("Category", back_populates="products")
    images: Mapped[list["ProductImage"]] = relationship(
        "ProductImage", back_populates="product", cascade="all, delete-orphan"
    )
    inventory: Mapped[list["Inventory"]] = relationship(
        "Inventory", back_populates="product", cascade="all, delete-orphan"
    )
    order_items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="product")
    stock_movements: Mapped[list["StockMovement"]] = relationship("StockMovement", back_populates="product")

    def calculate_sale_price(self) -> Decimal:
        """Calcula el precio de venta según costo + margen."""
        return self.cost_price * (1 + self.margin_pct / 100)

    def __repr__(self):
        return f"<Product {self.sku} — {self.name}>"


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    alt_text: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped["Product"] = relationship("Product", back_populates="images")


# ─── INVENTORY ──────────────────────────────────────────────────────────────

class Inventory(Base, TimestampMixin):
    """Stock por producto por ubicación."""
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("product_id", "location_id", name="uq_product_location"),
        Index("ix_inventory_product", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False
    )
    qty_available: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    qty_reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # En carrito

    @property
    def qty_real(self) -> int:
        return self.qty_available - self.qty_reserved

    # Relaciones
    product: Mapped["Product"] = relationship("Product", back_populates="inventory")
    location: Mapped["Location"] = relationship("Location", back_populates="inventory")


class StockMovement(Base):
    """Auditoría de todos los movimientos de stock."""
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"), nullable=False)
    movement_type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)   # + entrada / - salida
    qty_before: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # order_id si aplica
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    product: Mapped["Product"] = relationship("Product", back_populates="stock_movements")
    location: Mapped["Location"] = relationship("Location", back_populates="stock_movements")


# ─── ORDERS ─────────────────────────────────────────────────────────────────

class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    # Cliente (nullable para ventas físicas anónimas)
    customer_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Canal y punto de venta
    channel: Mapped[OrderChannel] = mapped_column(
        Enum(OrderChannel), nullable=False, default=OrderChannel.WEB
    )
    location_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # Estado
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), nullable=False, default=OrderStatus.PENDING, index=True
    )

    # Montos
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)  # Para calcular ganancia

    # Pago
    payment_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_ref: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Envío (solo web)
    shipping_address: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relaciones
    customer: Mapped[Optional["User"]] = relationship("User", back_populates="orders")
    location: Mapped[Optional["Location"]] = relationship("Location", back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Order #{self.order_number} {self.status}>"


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id"), nullable=False, index=True
    )
    product_name: Mapped[str] = mapped_column(String(300), nullable=False)  # Snapshot
    product_sku: Mapped[str] = mapped_column(String(100), nullable=False)   # Snapshot
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    margin_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.qty

    @property
    def gross_profit(self) -> Decimal:
        return (self.unit_price - self.cost_price) * self.qty

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="order_items")


class OrderStockReservation(Base):
    """Asignación exacta de inventario por línea de pedido web.

    HELD: qty_available ya está descontado; COMMITTED: venta pagada;
    RELEASED: stock devuelto a la ubicación original una sola vez.
    Se gestiona desde app.services.stock_reservations.
    """
    __tablename__ = "order_stock_reservations"
    __table_args__ = (
        UniqueConstraint("order_item_id", name="uq_order_stock_reservation_item"),
        Index("ix_order_stock_reservations_expiration", "status", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id"), nullable=False
    )
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id"), nullable=False
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="held")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ShippingRate(Base, TimestampMixin):
    """Tarifa comercial configurada, no cotización automática de transportadora.

    El costo que se cobra se obtiene SIEMPRE del servidor.
    Una ciudad nula aplica a todo un departamento.
    """
    __tablename__ = "shipping_rates"
    __table_args__ = (
        Index("ix_shipping_rates_region", "department_key", "city_key", "active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    department_key: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    carrier: Mapped[str] = mapped_column(String(120), nullable=False)
    service: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    days_min: Mapped[int] = mapped_column(Integer, nullable=False)
    days_max: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# ─── DESPACHOS Y SEGUIMIENTO WEB ────────────────────────────────────────────
class Shipment(Base, TimestampMixin):
    """Un envío gestionado internamente por pedido web, sin sincronización
    externa de transportadora. Se conserva la trazabilidad de cada transición.
    """
    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    carrier: Mapped[str] = mapped_column(String(120), nullable=False)
    service: Mapped[str] = mapped_column(String(120), nullable=False)
    tracking_number: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="dispatched")
    dispatched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    events: Mapped[list["ShipmentEvent"]] = relationship(
        "ShipmentEvent", back_populates="shipment", cascade="all, delete-orphan",
        order_by="ShipmentEvent.id",
    )


class ShipmentEvent(Base):
    """Historial inmutable de novedades registradas por la administración."""
    __tablename__ = "shipment_events"
    __table_args__ = (Index("ix_shipment_events_shipment_created", "shipment_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shipment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    shipment: Mapped["Shipment"] = relationship("Shipment", back_populates="events")


# ─── NOTIFICACIONES DE CLIENTES ──────────────────────────────────────────────
class CustomerNotification(Base):
    """Bandeja de salida transaccional: se inserta con el cambio de negocio.

    No almacena credenciales SMTP ni contenido HTML sensible. La clave del
    evento es única para no crear avisos duplicados tras webhooks repetidos.
    """
    __tablename__ = "customer_notifications"
    __table_args__ = (
        UniqueConstraint("event_key", name="uq_customer_notification_event"),
        Index("ix_customer_notification_queue", "status", "next_attempt_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    event_key: Mapped[str] = mapped_column(String(180), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    recipient: Mapped[str] = mapped_column(String(254), nullable=False)
    subject: Mapped[str] = mapped_column(String(220), nullable=False)
    context: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    lease_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


# ─── POSVENTA: SOLICITUDES Y MOVIMIENTOS AUDITADOS ──────────────────────────
class PostSaleCase(Base, TimestampMixin):
    """Caso de devolución o incidencia. No realiza reembolsos por sí mismo."""
    __tablename__ = "post_sale_cases"
    __table_args__ = (
        Index("ix_post_sale_cases_order_status", "order_id", "status"),
        UniqueConstraint("refund_reference", name="uq_post_sale_refund_reference"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("order_items.id"), nullable=True
    )
    customer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(28), nullable=False, default="submitted")
    refund_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    refund_status: Mapped[str] = mapped_column(String(28), nullable=False, default="not_requested")
    refund_reference: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    refund_recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    restocked_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    restock_location_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("locations.id"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    events: Mapped[list["PostSaleEvent"]] = relationship(
        "PostSaleEvent", back_populates="case", cascade="all, delete-orphan",
        order_by="PostSaleEvent.id"
    )


class PostSaleEvent(Base):
    """Auditoría append-only de estados, notas y reembolsos externos."""
    __tablename__ = "post_sale_events"
    __table_args__ = (
        Index("ix_post_sale_events_case_date", "case_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("post_sale_cases.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(48), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    case: Mapped["PostSaleCase"] = relationship("PostSaleCase", back_populates="events")
