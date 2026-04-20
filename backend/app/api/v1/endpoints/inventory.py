from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
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
    """Ingreso de mercancía nueva a un punto."""
    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    location = db.query(Location).filter(Location.id == data.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Ubicación no encontrada")

    inv = _get_or_create_inventory(db, data.product_id, data.location_id)
    qty_before = inv.qty_available
    inv.qty_available += data.qty

    _record_movement(
        db, data.product_id, data.location_id,
        StockMovementType.IN, data.qty, qty_before, inv.qty_available,
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
    """Transferencia de stock entre dos puntos."""
    inv_from = _get_or_create_inventory(db, data.product_id, data.from_location_id)

    if inv_from.qty_available < data.qty:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente en el punto origen. Disponible: {inv_from.qty_available}"
        )

    inv_to = _get_or_create_inventory(db, data.product_id, data.to_location_id)

    from_before = inv_from.qty_available
    to_before = inv_to.qty_available

    inv_from.qty_available -= data.qty
    inv_to.qty_available += data.qty

    _record_movement(
        db, data.product_id, data.from_location_id,
        StockMovementType.TRANSFER, -data.qty, from_before, inv_from.qty_available,
        notes=f"Transferencia a loc {data.to_location_id}. {data.notes or ''}",
        created_by=current_user.id,
    )
    _record_movement(
        db, data.product_id, data.to_location_id,
        StockMovementType.TRANSFER, data.qty, to_before, inv_to.qty_available,
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
