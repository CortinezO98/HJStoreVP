"""
Endpoint de órdenes web (checkout de la tienda pública).
Crea la orden, reserva el stock y espera confirmación de pago.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import random, string

from app.db.session import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import (
    User, UserRole, Order, OrderItem, OrderStatus, OrderChannel,
    Product, Inventory, Location, LocationType
)
from pydantic import BaseModel

router = APIRouter(prefix="/orders", tags=["Órdenes Web"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class OrderItemIn(BaseModel):
    product_id: int
    qty: int


class ShippingAddress(BaseModel):
    full_name: str
    phone: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    department: str
    postal_code: Optional[str] = None


class WebOrderCreate(BaseModel):
    items: List[OrderItemIn]
    shipping_address: ShippingAddress
    notes: Optional[str] = None


class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    product_sku: str
    qty: int
    unit_price: float
    line_total: float

    model_config = {"from_attributes": True}


class WebOrderOut(BaseModel):
    id: int
    order_number: str
    status: str
    subtotal: float
    total_amount: float
    shipping_address: dict
    notes: Optional[str]
    items: List[OrderItemOut]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def generate_order_number() -> str:
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"WEB-{datetime.now().strftime('%Y%m%d')}-{suffix}"


def reserve_stock(db: Session, product_id: int, qty: int):
    """Reserva stock en la ubicación web."""
    web_loc = db.query(Location).filter(
        Location.type == LocationType.WEB, Location.active == True
    ).first()

    if not web_loc:
        # Si no hay ubicación web, buscar cualquier ubicación con stock
        inv = db.query(Inventory).filter(
            Inventory.product_id == product_id,
            Inventory.qty_available >= qty,
        ).first()
    else:
        inv = db.query(Inventory).filter(
            Inventory.product_id == product_id,
            Inventory.location_id == web_loc.id,
        ).first()

    if not inv or inv.qty_available < qty:
        # Buscar en cualquier ubicación
        inv = db.query(Inventory).filter(
            Inventory.product_id == product_id,
        ).order_by(Inventory.qty_available.desc()).first()

        if not inv or inv.qty_available < qty:
            product = db.query(Product).filter(Product.id == product_id).first()
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{product.name if product else product_id}'. "
                        f"Disponible: {inv.qty_available if inv else 0}"
            )

    inv.qty_available -= qty


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/web", response_model=WebOrderOut, status_code=status.HTTP_201_CREATED)
def create_web_order(
    data: WebOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una orden desde la tienda web."""
    if not data.items:
        raise HTTPException(status_code=400, detail="El pedido debe tener al menos un producto")

    # Cargar productos
    product_ids = [i.product_id for i in data.items]
    products = {
        p.id: p for p in db.query(Product).filter(
            Product.id.in_(product_ids),
            Product.active == True,
        ).all()
    }

    for item in data.items:
        if item.product_id not in products:
            raise HTTPException(
                status_code=404,
                detail=f"Producto ID {item.product_id} no encontrado"
            )
        if item.qty <= 0:
            raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    # Calcular totales
    subtotal = Decimal("0")
    total_cost = Decimal("0")
    for item in data.items:
        p = products[item.product_id]
        subtotal += p.sale_price * item.qty
        total_cost += p.cost_price * item.qty

    # Crear orden
    order = Order(
        order_number=generate_order_number(),
        customer_id=current_user.id,
        channel=OrderChannel.WEB,
        status=OrderStatus.PENDING,
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        shipping_amount=Decimal("0"),
        total_amount=subtotal,
        total_cost=total_cost,
        shipping_address=data.shipping_address.model_dump(),
        notes=data.notes,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()

    # Crear items y reservar stock
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
        reserve_stock(db, p.id, item.qty)

    db.commit()
    db.refresh(order)

    return WebOrderOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        subtotal=float(subtotal),
        total_amount=float(subtotal),
        shipping_address=order.shipping_address,
        notes=order.notes,
        items=[
            OrderItemOut(
                product_id=oi.product_id,
                product_name=oi.product_name,
                product_sku=oi.product_sku,
                qty=oi.qty,
                unit_price=float(oi.unit_price),
                line_total=float(oi.unit_price * oi.qty),
            )
            for oi in order_items
        ],
        created_at=order.created_at,
    )


@router.get("/my-orders", response_model=List[WebOrderOut])
def my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historial de pedidos del cliente."""
    orders = db.query(Order).filter(
        Order.customer_id == current_user.id,
        Order.channel == OrderChannel.WEB,
    ).options(joinedload(Order.items)).order_by(Order.created_at.desc()).all()

    result = []
    for order in orders:
        result.append(WebOrderOut(
            id=order.id,
            order_number=order.order_number,
            status=order.status.value,
            subtotal=float(order.subtotal),
            total_amount=float(order.total_amount),
            shipping_address=order.shipping_address or {},
            notes=order.notes,
            items=[
                OrderItemOut(
                    product_id=oi.product_id,
                    product_name=oi.product_name,
                    product_sku=oi.product_sku,
                    qty=oi.qty,
                    unit_price=float(oi.unit_price),
                    line_total=float(oi.unit_price * oi.qty),
                )
                for oi in order.items
            ],
            created_at=order.created_at,
        ))
    return result


@router.get("", response_model=List[WebOrderOut])
def list_orders_admin(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Lista todas las órdenes web (admin)."""
    q = db.query(Order).filter(
        Order.channel == OrderChannel.WEB
    ).options(joinedload(Order.items))

    if status_filter:
        try:
            q = q.filter(Order.status == OrderStatus(status_filter))
        except ValueError:
            pass

    orders = q.order_by(Order.created_at.desc()).limit(200).all()

    result = []
    for order in orders:
        result.append(WebOrderOut(
            id=order.id,
            order_number=order.order_number,
            status=order.status.value,
            subtotal=float(order.subtotal),
            total_amount=float(order.total_amount),
            shipping_address=order.shipping_address or {},
            notes=order.notes,
            items=[
                OrderItemOut(
                    product_id=oi.product_id,
                    product_name=oi.product_name,
                    product_sku=oi.product_sku,
                    qty=oi.qty,
                    unit_price=float(oi.unit_price),
                    line_total=float(oi.unit_price * oi.qty),
                )
                for oi in order.items
            ],
            created_at=order.created_at,
        ))
    return result


@router.patch("/{order_id}/status")
def update_order_status(
    order_id: int,
    status: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Actualiza el estado de una orden (admin)."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    try:
        order.status = OrderStatus(status)
        if status == "paid":
            order.paid_at = datetime.utcnow()
        db.commit()
        return {"message": f"Estado actualizado a {status}"}
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {status}")
