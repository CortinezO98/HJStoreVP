"""
Endpoint de ventas físicas.
Los vendedores de cada punto físico registran ventas aquí.
El stock se descuenta automáticamente del punto y del global.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import random, string

from app.db.session import get_db
from app.core.deps import get_current_user, require_seller
from app.models.models import (
    User, UserRole, Order, OrderItem, OrderStatus, OrderChannel,
    Product, Inventory, Location, StockMovement, StockMovementType
)
from app.schemas.schemas import OrderOut
from pydantic import BaseModel

router = APIRouter(prefix="/physical-sales", tags=["Ventas Físicas"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SaleItemIn(BaseModel):
    product_id: int
    qty: int


class PhysicalSaleIn(BaseModel):
    items: List[SaleItemIn]
    location_id: Optional[int] = None   # Admin puede especificar; vendedor usa el suyo
    notes: Optional[str] = None
    customer_name: Optional[str] = None  # Nombre del cliente (opcional)


class SaleItemOut(BaseModel):
    product_id: int
    product_name: str
    product_sku: str
    qty: int
    unit_price: float
    cost_price: float
    line_total: float
    gross_profit: float

    model_config = {"from_attributes": True}


class PhysicalSaleOut(BaseModel):
    id: int
    order_number: str
    location_id: int
    location_name: str
    status: str
    subtotal: float
    total_amount: float
    gross_profit: float
    notes: Optional[str]
    items: List[SaleItemOut]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def generate_order_number() -> str:
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"FIS-{datetime.now().strftime('%Y%m%d')}-{suffix}"


def discount_stock(
    db: Session,
    product_id: int,
    location_id: int,
    qty: int,
    order_id: int,
    user_id: int,
):
    """Descuenta stock del punto físico. Registra movimiento de auditoría."""
    inv = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.location_id == location_id,
    ).first()

    if not inv:
        raise HTTPException(
            status_code=400,
            detail=f"No hay registro de inventario para el producto {product_id} en este punto"
        )

    if inv.qty_available < qty:
        product = db.query(Product).filter(Product.id == product_id).first()
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente para '{product.name if product else product_id}'. "
                   f"Disponible: {inv.qty_available}, solicitado: {qty}"
        )

    qty_before = inv.qty_available
    inv.qty_available -= qty

    db.add(StockMovement(
        product_id=product_id,
        location_id=location_id,
        movement_type=StockMovementType.OUT_SALE,
        qty=-qty,
        qty_before=qty_before,
        qty_after=inv.qty_available,
        reference_id=order_id,
        notes=f"Venta física orden #{order_id}",
        created_by=user_id,
        created_at=datetime.utcnow(),
    ))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=PhysicalSaleOut, status_code=status.HTTP_201_CREATED)
def create_physical_sale(
    data: PhysicalSaleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    """
    Registra una venta en un punto físico.
    - Vendedor: usa su location_id asignado automáticamente.
    - Admin: puede especificar cualquier location_id.
    """
    # Determinar ubicación
    if current_user.role == UserRole.SELLER:
        if not current_user.location_id:
            raise HTTPException(
                status_code=400,
                detail="No tienes un punto físico asignado. Contacta al administrador."
            )
        location_id = current_user.location_id
    else:
        # Admin o Super Admin
        if not data.location_id:
            raise HTTPException(
                status_code=400,
                detail="Debes especificar el location_id para la venta"
            )
        location_id = data.location_id

    # Validar ubicación
    location = db.query(Location).filter(
        Location.id == location_id,
        Location.active == True,
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="Punto físico no encontrado o inactivo")

    if not data.items:
        raise HTTPException(status_code=400, detail="La venta debe tener al menos un producto")

    # Cargar productos
    product_ids = [item.product_id for item in data.items]
    products = {
        p.id: p for p in db.query(Product).filter(
            Product.id.in_(product_ids),
            Product.active == True,
        ).all()
    }

    # Validar que todos los productos existen
    for item in data.items:
        if item.product_id not in products:
            raise HTTPException(
                status_code=404,
                detail=f"Producto ID {item.product_id} no encontrado o inactivo"
            )
        if item.qty <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"La cantidad debe ser mayor a 0"
            )

    # Calcular totales
    subtotal = Decimal("0")
    total_cost = Decimal("0")

    for item in data.items:
        p = products[item.product_id]
        subtotal += p.sale_price * item.qty
        total_cost += p.cost_price * item.qty

    # Crear la orden
    order = Order(
        order_number=generate_order_number(),
        channel=OrderChannel.PHYSICAL,
        location_id=location_id,
        status=OrderStatus.PAID,          # Las ventas físicas son pagadas al instante
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        shipping_amount=Decimal("0"),
        total_amount=subtotal,
        total_cost=total_cost,
        payment_method="efectivo",
        paid_at=datetime.utcnow(),
        notes=data.notes,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()  # Para obtener order.id

    # Crear items y descontar stock
    order_items = []
    for item in data.items:
        p = products[item.product_id]
        oi = OrderItem(
            order_id=order.id,
            product_id=p.id,
            product_name=p.name,
            product_sku=p.sku,
            qty=item.qty,
            unit_price=p.sale_price,
            cost_price=p.cost_price,
            margin_pct=p.margin_pct,
        )
        db.add(oi)
        order_items.append(oi)

        # Descontar stock del punto físico
        discount_stock(db, p.id, location_id, item.qty, order.id, current_user.id)

    db.commit()
    db.refresh(order)

    # Construir respuesta
    gross_profit = float(subtotal - total_cost)

    return PhysicalSaleOut(
        id=order.id,
        order_number=order.order_number,
        location_id=location_id,
        location_name=location.name,
        status=order.status.value,
        subtotal=float(subtotal),
        total_amount=float(subtotal),
        gross_profit=gross_profit,
        notes=order.notes,
        items=[
            SaleItemOut(
                product_id=oi.product_id,
                product_name=oi.product_name,
                product_sku=oi.product_sku,
                qty=oi.qty,
                unit_price=float(oi.unit_price),
                cost_price=float(oi.cost_price),
                line_total=float(oi.unit_price * oi.qty),
                gross_profit=float((oi.unit_price - oi.cost_price) * oi.qty),
            )
            for oi in order_items
        ],
        created_at=order.created_at,
    )


@router.get("", response_model=List[PhysicalSaleOut])
def list_physical_sales(
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    """
    Lista ventas físicas.
    - Vendedor: solo ve las de su punto.
    - Admin: puede filtrar por punto o ver todas.
    """
    q = db.query(Order).filter(
        Order.channel == OrderChannel.PHYSICAL
    ).options(joinedload(Order.items))

    if current_user.role == UserRole.SELLER:
        q = q.filter(Order.location_id == current_user.location_id)
    elif location_id:
        q = q.filter(Order.location_id == location_id)

    orders = q.order_by(Order.created_at.desc()).limit(100).all()

    result = []
    for order in orders:
        loc = db.query(Location).filter(Location.id == order.location_id).first()
        profit = float(order.total_amount - order.total_cost)
        result.append(PhysicalSaleOut(
            id=order.id,
            order_number=order.order_number,
            location_id=order.location_id,
            location_name=loc.name if loc else "Desconocido",
            status=order.status.value,
            subtotal=float(order.subtotal),
            total_amount=float(order.total_amount),
            gross_profit=profit,
            notes=order.notes,
            items=[
                SaleItemOut(
                    product_id=oi.product_id,
                    product_name=oi.product_name,
                    product_sku=oi.product_sku,
                    qty=oi.qty,
                    unit_price=float(oi.unit_price),
                    cost_price=float(oi.cost_price),
                    line_total=float(oi.unit_price * oi.qty),
                    gross_profit=float((oi.unit_price - oi.cost_price) * oi.qty),
                )
                for oi in order.items
            ],
            created_at=order.created_at,
        ))
    return result


@router.get("/my-stock")
def my_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    """
    Stock disponible en el punto del vendedor.
    Útil para que el vendedor sepa qué puede vender.
    """
    if current_user.role != UserRole.SELLER:
        raise HTTPException(status_code=403, detail="Solo para vendedores de punto físico")

    if not current_user.location_id:
        raise HTTPException(status_code=400, detail="No tienes punto físico asignado")

    results = db.execute(text("""
        SELECT
            p.id, p.name, p.sku, p.sale_price,
            i.qty_available,
            pi.url as primary_image
        FROM products p
        JOIN inventory i ON i.product_id = p.id AND i.location_id = :loc_id
        LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
        WHERE p.active = 1
        ORDER BY p.name
    """), {"loc_id": current_user.location_id}).fetchall()

    return [
        {
            "product_id": r[0],
            "name": r[1],
            "sku": r[2],
            "sale_price": float(r[3]),
            "qty_available": r[4],
            "primary_image": r[5],
        }
        for r in results
    ]
