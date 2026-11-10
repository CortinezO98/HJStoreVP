"""
Endpoint de órdenes web (checkout de la tienda pública).
Crea la orden, reserva el stock y espera confirmación de pago.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field, model_validator
from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
import random, string

from app.db.session import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import (
    User, UserRole, Order, OrderItem, OrderStatus, OrderChannel,
    Product, Inventory, Location, LocationType, OrderStockReservation
)
from pydantic import BaseModel
from app.services.stock_reservations import cancel_web_order, lock_web_order
from app.core.config import settings
from app.services.shipping import get_selected_rate, shipping_snapshot

router = APIRouter(prefix="/orders", tags=["Órdenes Web"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class OrderItemIn(BaseModel):
    product_id: int = Field(gt=0)
    qty: int = Field(gt=0)


class ShippingAddress(BaseModel):
    full_name: str
    phone: str
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    department: str
    postal_code: Optional[str] = None


class WebOrderCreate(BaseModel):
    items: List[OrderItemIn] = Field(min_length=1)
    shipping_address: ShippingAddress
    shipping_rate_id: int = Field(gt=0)
    shipping_price_confirmed: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def unique_products(self):
        product_ids = [item.product_id for item in self.items]
        if len(set(product_ids)) != len(product_ids):
            raise ValueError("Un producto no puede aparecer dos veces en el mismo pedido")
        return self


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
    shipping_amount: float
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

    # Descuento condicional y atómico: dos compradores simultáneos no pueden
    # descontar el mismo stock hasta producir cantidades negativas.
    updated = db.execute(
        update(Inventory)
        .where(
            Inventory.id == inv.id,
            Inventory.qty_available >= qty,
            Inventory.qty_available >= 0,
        )
        .values(qty_available=Inventory.qty_available - qty)
    )
    if updated.rowcount != 1:
        raise HTTPException(status_code=400, detail="Stock insuficiente; actualiza tu carrito")
    return inv.location_id


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

    if any(p.sale_price is None or p.sale_price < 0 or p.cost_price is None or p.cost_price < 0 for p in products.values()):
        raise HTTPException(status_code=400, detail="Hay productos con precios inválidos")

    # El cliente solo envía el ID de la tarifa elegida, NUNCA un importe.
    # Si la tarifa cambió, fue desactivada o no cubre su ciudad, se rechaza.
    shipping_rate = get_selected_rate(
        db, data.shipping_rate_id,
        data.shipping_address.department, data.shipping_address.city,
    )
    shipping_amount = shipping_rate.price
    if shipping_amount != data.shipping_price_confirmed:
        raise HTTPException(
            status_code=409,
            detail="La tarifa de envío cambió. Actualiza la cotización y confirma el nuevo precio.",
        )
    total_amount = subtotal + shipping_amount

    # Crear orden
    order = Order(
        order_number=generate_order_number(),
        customer_id=current_user.id,
        channel=OrderChannel.WEB,
        status=OrderStatus.PENDING,
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        shipping_amount=shipping_amount,
        total_amount=total_amount,
        total_cost=total_cost,
        shipping_address={
            **data.shipping_address.model_dump(),
            **shipping_snapshot(shipping_rate),
        },
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
        db.flush()
        order_items.append(oi)
        location_id = reserve_stock(db, p.id, item.qty)
        db.add(OrderStockReservation(
            order_id=order.id,
            order_item_id=oi.id,
            product_id=p.id,
            location_id=location_id,
            qty=item.qty,
            status="held",
            expires_at=datetime.utcnow() + timedelta(minutes=settings.ORDER_RESERVATION_MINUTES),
        ))

    db.commit()
    db.refresh(order)

    return WebOrderOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        subtotal=float(subtotal),
        shipping_amount=float(shipping_amount),
        total_amount=float(total_amount),
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
            shipping_amount=float(order.shipping_amount or 0),
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
            shipping_amount=float(order.shipping_amount or 0),
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
    order = lock_web_order(db, order_id)
    try:
        next_status = OrderStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {status}")

    if next_status == OrderStatus.PAID:
        raise HTTPException(status_code=403, detail="Los pagos deben confirmarse mediante el proveedor de pagos")
    if next_status in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
        raise HTTPException(
            status_code=409,
            detail="El despacho y entrega se registran desde el módulo de seguimiento",
        )
    if order.status in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
        raise HTTPException(
            status_code=409,
            detail="El estado de un pedido despachado se gestiona desde seguimiento",
        )
    if order.status == next_status:
        return {"message": "Sin cambios", "status": order.status.value}
    if next_status == OrderStatus.CANCELLED:
        cancel_web_order(db, order, "Cancelación por administrador")
    elif order.status == OrderStatus.PENDING:
        raise HTTPException(status_code=409, detail="Confirma el pago antes de preparar o despachar")
    elif order.status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="No es posible cambiar un pedido cancelado")
    else:
        order.status = next_status
    db.commit()
    return {"message": f"Estado actualizado a {status}"}


@router.post("/{order_id}/cancel")
def cancel_my_web_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cliente cancela únicamente su pedido web pendiente."""
    order = lock_web_order(db, order_id)
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    changed = cancel_web_order(db, order, "Cancelación solicitada por cliente")
    if changed:
        db.commit()
    return {"status": "cancelled", "changed": changed}
