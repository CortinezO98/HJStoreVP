from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import update, or_, func
from typing import List
from fastapi import Query
from app.db.session import get_db
from app.core.deps import require_admin, require_seller
from app.models.models import (
    Inventory, Product, Location, StockMovement,
    StockMovementType, User, UserRole
)
from app.schemas.schemas import InventoryOut, StockAdjust, StockTransfer
from app.core.deps import get_current_user

router = APIRouter(prefix="/inventory", tags=["Inventario"])


def _get_or_create_inventory(db: Session, product_id: int, location_id: int) -> Inventory:
    inv = db.query(Inventory).filter(
        Inventory.product_id == product_id,
        Inventory.location_id == location_id,
    ).first()
    if not inv:
        inv = Inventory(product_id=product_id, location_id=location_id, qty_available=0, qty_reserved=0)
        db.add(inv)
        db.flush()
    return inv


def _record_movement(
    db: Session,
    product_id: int,
    location_id: int,
    movement_type: StockMovementType,
    qty: int,
    qty_before: int,
    qty_after: int,
    reference_id: int = None,
    notes: str = None,
    created_by: int = None,
):
    movement = StockMovement(
        product_id=product_id,
        location_id=location_id,
        movement_type=movement_type,
        qty=qty,
        qty_before=qty_before,
        qty_after=qty_after,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by,
    )
    db.add(movement)


@router.get("/overview")
def omnichannel_overview(
    search: str = Query("", max_length=120),
    page: int = Query(1, ge=1),
    per_page: int = Query(40, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Matriz de existencias por SKU y ubicación, sin alterar stock.

    Global: suma por ubicación (incluye inactivas, identificadas en el
    desglose). Web: máximo disponible en UNA ubicación activa, acorde con
    las reservas reales del checkout. Filas de variantes mantienen SKU propio.
    """
    query = db.query(Product)
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(Product.name.ilike(pattern), Product.sku.ilike(pattern))
        )
    count = query.count()
    items = query.order_by(Product.name, Product.id).offset(
        (page - 1) * per_page
    ).limit(per_page).all()
    ids = [item.id for item in items]
    locations = db.query(Location).order_by(Location.name, Location.id).all()
    location_map = {location.id: location for location in locations}
    rows = db.query(Inventory).filter(
        Inventory.product_id.in_(ids)
    ).all() if ids else []
    by_product = {}
    for inv in rows:
        by_product.setdefault(inv.product_id, []).append(inv)
    records = []
    for product in items:
        invs = by_product.get(product.id, [])
        global_qty = sum(int(i.qty_available) for i in invs)
        held_qty = sum(int(i.qty_reserved or 0) for i in invs)
        web_qty = max(
            (int(i.qty_available) for i in invs
             if i.location_id in location_map
             and location_map[i.location_id].active),
            default=0,
        )
        records.append({
            "product_id": product.id,
            "parent_product_id": product.parent_product_id,
            "name": product.name,
            "sku": product.sku,
            "active": product.active,
            "stock_min_alert": int(product.stock_min_alert or 0),
            "global_available": global_qty,
            "web_fulfillable": web_qty if product.active else 0,
            "reserved_counter": held_qty,
            "locations": [{
                "location_id": inv.location_id,
                "location_name": location_map[inv.location_id].name
                    if inv.location_id in location_map else "Ubicación eliminada",
                "location_type": location_map[inv.location_id].type.value
                    if inv.location_id in location_map else None,
                "active": bool(location_map[inv.location_id].active)
                    if inv.location_id in location_map else False,
                "qty_available": int(inv.qty_available),
                "qty_reserved": int(inv.qty_reserved or 0),
            } for inv in sorted(invs, key=lambda i: i.location_id)],
        })
    return {
        "page": page,
        "per_page": per_page,
        "total_products": count,
        "locations": [{
            "id": loc.id, "name": loc.name, "type": loc.type.value,
            "active": loc.active,
        } for loc in locations],
        "items": records,
        "availability_rule": (
            "Web: máximo por una sola ubicación activa, con preferencia "
            "por almacén web al reservar. El stock global es informativo "
            "y puede incluir ubicaciones inactivas."
        ),
    }


@router.get("/product/{product_id}", response_model=List[InventoryOut])
def get_product_inventory(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    """Stock del producto en todos los puntos (admin) o solo el propio (vendedor)."""
    q = db.query(Inventory).options(joinedload(Inventory.location)).filter(
        Inventory.product_id == product_id
    )
    # Vendedor solo ve su punto
    if current_user.role == UserRole.SELLER:
        if not current_user.location_id:
            raise HTTPException(status_code=403, detail="No tienes punto físico asignado")
        q = q.filter(Inventory.location_id == current_user.location_id)

    return q.all()


@router.get("/location/{location_id}", response_model=List[InventoryOut])
def get_location_inventory(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_seller),
):
    """Todo el stock de un punto físico."""
    if current_user.role == UserRole.SELLER and current_user.location_id != location_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este punto")

    return db.query(Inventory).options(
        joinedload(Inventory.location)
    ).filter(Inventory.location_id == location_id).all()


@router.post("/replenish", status_code=status.HTTP_200_OK)
def replenish_stock(
    data: StockAdjust,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Ingreso de mercancía a una ubicación activa, auditable y serializado."""
    # Todas las operaciones administrativas del mismo producto bloquean primero
    # products.id para serializar la creación de una fila inventory inexistente.
    product = db.query(Product).filter(
        Product.id == data.product_id, Product.active.is_(True)
    ).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto activo no encontrado")
    location = db.query(Location).filter(
        Location.id == data.location_id, Location.active.is_(True)
    ).first()
    if not location:
        raise HTTPException(status_code=404, detail="Ubicación activa no encontrada")

    inv = _get_or_create_inventory(db, data.product_id, data.location_id)
    # Bloqueo explícito de la fila para evitar perder incrementos concurrentes.
    inv = db.query(Inventory).filter(Inventory.id == inv.id).with_for_update().one()
    before = inv.qty_available
    inv.qty_available = before + data.qty
    _record_movement(
        db, data.product_id, data.location_id,
        StockMovementType.IN, data.qty, before, inv.qty_available,
        notes=data.notes, created_by=current_user.id,
    )
    db.commit()
    return {"message": f"Stock actualizado. Nuevo total: {inv.qty_available} unidades"}


@router.post("/transfer", status_code=status.HTTP_200_OK)
def transfer_stock(
    data: StockTransfer,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Transferir stock de forma atómica, con bloqueos en orden estable."""
    if data.from_location_id == data.to_location_id:
        raise HTTPException(status_code=422, detail="Origen y destino deben ser diferentes")

    product = db.query(Product).filter(
        Product.id == data.product_id, Product.active.is_(True)
    ).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto activo no encontrado")

    locations = db.query(Location).filter(
        Location.id.in_([data.from_location_id, data.to_location_id]),
        Location.active.is_(True),
    ).all()
    if len(locations) != 2:
        raise HTTPException(status_code=404, detail="Ambas ubicaciones deben estar activas")

    # La fila del producto está bloqueada para impedir creaciones administrativas
    # simultáneas del mismo inventario. Bloquear inventarios en orden determinista
    # reduce interbloqueos con otras transferencias.
    rows = {}
    for location_id in sorted([data.from_location_id, data.to_location_id]):
        inv = _get_or_create_inventory(db, data.product_id, location_id)
        rows[location_id] = db.query(Inventory).filter(
            Inventory.id == inv.id
        ).with_for_update().one()

    origin = rows[data.from_location_id]
    destination = rows[data.to_location_id]
    if origin.qty_available < data.qty:
        raise HTTPException(status_code=409, detail="Stock insuficiente en la ubicación origen")

    before_origin = origin.qty_available
    before_destination = destination.qty_available
    # Actualización condicional: segura frente a ventas físicas/web concurrentes
    # que no adquieren el bloqueo del producto pero sí modifican inventario.
    applied = db.execute(
        update(Inventory).where(
            Inventory.id == origin.id,
            Inventory.qty_available >= data.qty,
        ).values(qty_available=Inventory.qty_available - data.qty)
    )
    if applied.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Stock modificado durante la transferencia")

    db.refresh(origin)
    destination.qty_available = before_destination + data.qty
    _record_movement(
        db, data.product_id, data.from_location_id,
        StockMovementType.TRANSFER, -data.qty, before_origin, origin.qty_available,
        notes=f"Transferencia a loc {data.to_location_id}. {data.notes or ''}",
        created_by=current_user.id,
    )
    _record_movement(
        db, data.product_id, data.to_location_id,
        StockMovementType.TRANSFER, data.qty, before_destination, destination.qty_available,
        notes=f"Transferencia desde loc {data.from_location_id}. {data.notes or ''}",
        created_by=current_user.id,
    )
    db.commit()
    return {"message": "Transferencia realizada correctamente"}

@router.get("/alerts/low-stock")
def low_stock_alerts(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Productos con stock por debajo del mínimo configurado."""
    from sqlalchemy import func, text

    results = db.execute(text("""
        SELECT
            p.id, p.name, p.sku, p.stock_min_alert,
            COALESCE(SUM(i.qty_available), 0) as total_stock
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.active = 1
        GROUP BY p.id, p.name, p.sku, p.stock_min_alert
        HAVING total_stock <= p.stock_min_alert
        ORDER BY total_stock ASC
    """)).fetchall()

    return [
        {
            "product_id": r[0],
            "product_name": r[1],
            "sku": r[2],
            "stock_min_alert": r[3],
            "total_stock": r[4],
        }
        for r in results
    ]
