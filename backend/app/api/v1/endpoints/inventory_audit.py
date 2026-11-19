"""Consultas de observabilidad omnicanal; no modifican existencias ni reservas.

Solo usuarios ADMIN/SUPER_ADMIN. Las alertas se basan en el mínimo actual por
SKU y ubicación activa. Los hallazgos no realizan ajustes automáticos.
"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import (
    Inventory, Location, Order, OrderItem, OrderStatus, OrderStockReservation,
    Product, StockMovement, User,
)

router = APIRouter(prefix="/inventory", tags=["Auditoría de inventario"])


def _pages(query, page, per_page):
    count = query.order_by(None).count()
    return count, query.offset((page - 1) * per_page).limit(per_page).all()


@router.get("/alerts/by-location")
def low_stock_by_location(
    location_id: int | None = Query(None, ge=1),
    search: str = Query("", max_length=120),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Incluye SKU con CERO stock, aunque no exista su fila inventory.

    Excluye productos padre que tienen variantes, cuya existencia no es vendible.
    """
    child = aliased(Product)
    has_children = db.query(child.id).filter(child.parent_product_id == Product.id).exists()
    q = (
        db.query(
            Product.id.label("product_id"), Product.name.label("name"),
            Product.sku.label("sku"), Product.stock_min_alert.label("minimum"),
            Location.id.label("location_id"), Location.name.label("location_name"),
            Inventory.qty_available.label("qty_available"),
        )
        .select_from(Product)
        .join(Location, Location.active.is_(True))
        .outerjoin(
            Inventory,
            and_(Inventory.product_id == Product.id,
                 Inventory.location_id == Location.id),
        )
        .filter(Product.active.is_(True), ~has_children)
        .filter(func.coalesce(Inventory.qty_available, 0) <=
                func.coalesce(Product.stock_min_alert, 0))
    )
    if location_id is not None:
        q = q.filter(Location.id == location_id)
    if search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(or_(Product.name.ilike(pattern), Product.sku.ilike(pattern)))
    count, rows = _pages(
        q.order_by(
            func.coalesce(Inventory.qty_available, 0).asc(),
            Location.id, Product.name, Product.id,
        ), page, per_page
    )
    return {
        "total": count, "page": page, "per_page": per_page,
        "items": [
            {
                "product_id": r.product_id, "product_name": r.name, "sku": r.sku,
                "location_id": r.location_id, "location_name": r.location_name,
                "minimum": int(r.minimum or 0),
                "available": int(r.qty_available or 0),
                "missing_stock_row": r.qty_available is None,
            }
            for r in rows
        ],
        "note": "Mínimo configurado por SKU, aplicado individualmente a cada sede activa.",
    }


@router.get("/audit/movements")
def movement_history(
    location_id: int | None = Query(None, ge=1),
    product_id: int | None = Query(None, ge=1),
    movement_type: str | None = Query(None, max_length=40),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Historial paginado con usuario responsable y referencia operacional."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "La fecha final es anterior a la inicial")
    q = (
        db.query(StockMovement, Product.name, Product.sku, Location.name, User.full_name)
        .join(Product, Product.id == StockMovement.product_id)
        .join(Location, Location.id == StockMovement.location_id)
        .outerjoin(User, User.id == StockMovement.created_by)
    )
    if location_id is not None:
        q = q.filter(StockMovement.location_id == location_id)
    if product_id is not None:
        q = q.filter(StockMovement.product_id == product_id)
    if movement_type:
        from app.models.models import StockMovementType
        try:
            selected = StockMovementType(movement_type.lower())
        except ValueError:
            raise HTTPException(422, "Tipo de movimiento no válido")
        q = q.filter(StockMovement.movement_type == selected)
    if date_from:
        q = q.filter(StockMovement.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        q = q.filter(StockMovement.created_at <
                     datetime.combine(date_to + timedelta(days=1), time.min))
    count, rows = _pages(q.order_by(StockMovement.created_at.desc(),
                                    StockMovement.id.desc()), page, per_page)
    return {
        "total": count, "page": page, "per_page": per_page,
        "items": [{
            "id": movement.id,
            "created_at": movement.created_at.isoformat() if movement.created_at else None,
            "product_id": movement.product_id, "product_name": name, "sku": sku,
            "location_id": movement.location_id, "location_name": location,
            "movement_type": movement.movement_type.value,
            "qty": movement.qty, "qty_before": movement.qty_before,
            "qty_after": movement.qty_after,
            "reference_id": movement.reference_id,
            "notes": movement.notes,
            "created_by": movement.created_by,
            "actor_name": actor or "Sistema / no registrado",
        } for movement, name, sku, location, actor in rows],
    }


@router.get("/audit/anomalies")
def inventory_anomalies(
    location_id: int | None = Query(None, ge=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Identifica saldos negativos y reservas HELD sin inventario asociado.

    No interpreta qty_reserved como reservas web HELD: estas ya se descontaron
    de qty_available. No resta stock dos veces ni modifica datos.
    """
    base = (
        db.query(
            Inventory.product_id, Product.name, Product.sku,
            Inventory.location_id, Location.name.label("location_name"),
            Inventory.qty_available, Inventory.qty_reserved,
        )
        .join(Product, Product.id == Inventory.product_id)
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            or_(Inventory.qty_available < 0, Inventory.qty_reserved < 0)
        )
    )
    held = (
        db.query(
            OrderStockReservation.product_id, Product.name, Product.sku,
            OrderStockReservation.location_id,
            Location.name.label("location_name"),
            func.count(OrderStockReservation.id).label("count"),
        )
        .join(Product, Product.id == OrderStockReservation.product_id)
        .join(Location, Location.id == OrderStockReservation.location_id)
        .outerjoin(Inventory, and_(
            Inventory.product_id == OrderStockReservation.product_id,
            Inventory.location_id == OrderStockReservation.location_id,
        ))
        .filter(
            OrderStockReservation.status == "held",
            Inventory.id.is_(None),
        )
        .group_by(
            OrderStockReservation.product_id, Product.name, Product.sku,
            OrderStockReservation.location_id, Location.name,
        )
    )
    if location_id is not None:
        base = base.filter(Inventory.location_id == location_id)
        held = held.filter(OrderStockReservation.location_id == location_id)
    # El saldo registrado en cada movimiento debe coincidir con antes + cambio.
    # No se compara con el saldo actual, que puede variar por reservas WEB.
    broken = db.query(StockMovement, Product.name, Product.sku, Location.name.label("location_name")).join(
        Product, Product.id == StockMovement.product_id
    ).join(Location, Location.id == StockMovement.location_id).filter(
        StockMovement.qty_after != StockMovement.qty_before + StockMovement.qty
    )
    if location_id is not None:
        broken = broken.filter(StockMovement.location_id == location_id)

    negative_count = base.count()
    missing_count = held.count()
    broken_count = broken.count()
    offset = (page - 1) * per_page
    findings = []

    if offset < negative_count:
        take = min(per_page, negative_count - offset)
        for row in base.order_by(Inventory.location_id, Inventory.product_id).offset(offset).limit(take):
            findings.append({
                "kind": "negative_quantity", "severity": "critical",
                "product_id": row.product_id, "product_name": row.name, "sku": row.sku,
                "location_id": row.location_id, "location_name": row.location_name,
                "detail": f"Disponible: {row.qty_available}; contador reservado: {row.qty_reserved}",
            })
    remaining = per_page - len(findings)
    if remaining:
        held_offset = max(0, offset - negative_count)
        for row in held.order_by(
            OrderStockReservation.location_id, OrderStockReservation.product_id
        ).offset(held_offset).limit(remaining):
            findings.append({
                "kind": "held_without_inventory", "severity": "critical",
                "product_id": row.product_id, "product_name": row.name, "sku": row.sku,
                "location_id": row.location_id, "location_name": row.location_name,
                "detail": f"{row._mapping['count']} reserva(s) HELD sin fila de inventario",
            })
    remaining = per_page - len(findings)
    if remaining:
        movement_offset = max(0, offset - negative_count - missing_count)
        for movement, name, sku, location_name in broken.order_by(
            StockMovement.id.desc()
        ).offset(movement_offset).limit(remaining):
            findings.append({
                "kind": "movement_arithmetic", "severity": "review",
                "product_id": movement.product_id, "product_name": name, "sku": sku,
                "location_id": movement.location_id, "location_name": location_name,
                "detail": (
                    f"Movimiento #{movement.id}: {movement.qty_before} + "
                    f"({movement.qty}) != {movement.qty_after}"
                ),
            })
    return {
        "total": negative_count + missing_count + broken_count,
        "page": page, "per_page": per_page,
        "items": findings,
        "note": (
            "Diagnóstico parcial de integridad, solo lectura. El contador "
            "qty_reserved heredado no equivale a reservas HELD y no debe "
            "compararse directamente con qty_available. Requiere revisión "
            "operativa antes de corregir existencias."
        ),
    }


@router.get("/audit/reservation-integrity")
def reservation_integrity(
    location_id: int | None = Query(None, ge=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Conciliación SOLO LECTURA de reservas web contra pedido, línea y sede.

    No infiere que qty_reserved sea igual al total HELD: las reservas HELD
    ya reducen qty_available. No repara saldos, cancela pedidos ni cobra.
    Las órdenes históricas sin reservas se investigan por separado.
    """
    active_sale_states = (
        OrderStatus.PAID, OrderStatus.PREPARING,
        OrderStatus.SHIPPED, OrderStatus.DELIVERED,
    )
    issues = or_(
        OrderStockReservation.qty <= 0,
        OrderItem.id.is_(None),
        OrderItem.order_id != OrderStockReservation.order_id,
        OrderItem.product_id != OrderStockReservation.product_id,
        OrderItem.qty != OrderStockReservation.qty,
        and_(
            OrderStockReservation.status == "held",
            or_(Order.status != OrderStatus.PENDING, Inventory.id.is_(None)),
        ),
        and_(
            OrderStockReservation.status == "committed",
            ~Order.status.in_(active_sale_states),
        ),
        and_(
            OrderStockReservation.status == "released",
            Order.status != OrderStatus.CANCELLED,
        ),
        ~OrderStockReservation.status.in_(("held", "committed", "released")),
    )
    rows = (
        db.query(
            OrderStockReservation, Order, OrderItem, Inventory, Product, Location,
        )
        .join(Order, Order.id == OrderStockReservation.order_id)
        .outerjoin(OrderItem, OrderItem.id == OrderStockReservation.order_item_id)
        .outerjoin(
            Inventory, and_(
                Inventory.product_id == OrderStockReservation.product_id,
                Inventory.location_id == OrderStockReservation.location_id,
            ),
        )
        .outerjoin(Product, Product.id == OrderStockReservation.product_id)
        .outerjoin(Location, Location.id == OrderStockReservation.location_id)
        .filter(issues)
    )
    if location_id is not None:
        rows = rows.filter(OrderStockReservation.location_id == location_id)

    total = rows.order_by(None).count()
    selected = (
        rows.order_by(OrderStockReservation.id)
        .offset((page - 1) * per_page).limit(per_page).all()
    )
    findings = []
    for reservation, order, item, inventory, product, location in selected:
        reasons = []
        if reservation.qty <= 0:
            reasons.append("Cantidad de reserva inválida")
        if item is None:
            reasons.append("Línea del pedido no encontrada")
        else:
            if item.order_id != reservation.order_id:
                reasons.append("La línea corresponde a otro pedido")
            if item.product_id != reservation.product_id:
                reasons.append("El SKU reservado difiere de la línea")
            if item.qty != reservation.qty:
                reasons.append("La cantidad difiere de la línea del pedido")
        if reservation.status == "held":
            if order.status != OrderStatus.PENDING:
                reasons.append("Reserva HELD con pedido no pendiente")
            if inventory is None:
                reasons.append("Reserva HELD sin inventario de origen")
        elif reservation.status == "committed":
            if order.status not in active_sale_states:
                reasons.append("Reserva COMMITTED con estado de pedido incompatible")
        elif reservation.status == "released":
            if order.status != OrderStatus.CANCELLED:
                reasons.append("Reserva RELEASED sin pedido cancelado")
        else:
            reasons.append("Estado de reserva desconocido")

        findings.append({
            "reservation_id": reservation.id,
            "order_id": order.id,
            "order_number": order.order_number,
            "order_status": order.status.value,
            "reservation_status": reservation.status,
            "product_id": reservation.product_id,
            "product_name": product.name if product else "Producto no disponible",
            "sku": product.sku if product else "—",
            "location_id": reservation.location_id,
            "location_name": location.name if location else "Sede no disponible",
            "reserved_qty": reservation.qty,
            "order_item_qty": item.qty if item is not None else None,
            "issues": reasons,
        })
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": findings,
        "note": (
            "Solo lectura. Una reserva HELD ya se descontó del disponible. "
            "No aumentar existencias ni cancelar pedidos basándose únicamente "
            "en este diagnóstico. Las órdenes heredadas sin reservas requieren "
            "revisión histórica separada."
        ),
    }
