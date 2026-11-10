"""Indicadores operativos del comercio (consulta de solo lectura).

No sustituye los cálculos de /analytics ni Reportes contables existentes.
Las métricas financieras son orientativas, NO estados financieros
ni información fiscal. Filtra por paid_at para ventas cobradas y evita
contabilizar pedidos PENDING/CANCELLED como ingresos.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.models import (
    CustomerNotification, Inventory, Order, OrderChannel, OrderItem,
    OrderStatus, PostSaleCase, Product, Shipment,
)

router = APIRouter(prefix="/operational-analytics", tags=["Analítica operativa"])

PAID_STATES = (
    OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED,
    OrderStatus.DELIVERED, OrderStatus.REFUNDED,
)
ZERO = Decimal("0")


def _bounds(start: date | None, end: date | None):
    if start and end and end < start:
        raise HTTPException(status_code=422, detail="La fecha final es anterior a la inicial")
    if start and end and (end - start).days > 730:
        raise HTTPException(status_code=422, detail="El rango máximo es de 730 días")
    start_at = datetime.combine(start, time.min) if start else None
    end_at = datetime.combine(end + timedelta(days=1), time.min) if end else None
    return start_at, end_at


def _time_filter(query, column, start, end):
    if start is not None:
        query = query.filter(column >= start)
    if end is not None:
        query = query.filter(column < end)
    return query


def _money(value):
    return float(value or ZERO)


@router.get("/overview")
def operational_overview(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """KPIs consistentes por período, canal y operación.

    Fecha de venta = paid_at y fecha de gestión = created_at (cada bloque
    identifica su criterio). Solo reembolsos EXTERNAMENTE REGISTRADOS
    se muestran como ajuste informativo, sin afirmar desembolso verificado.
    """
    start, end = _bounds(date_from, date_to)
    paid = db.query(Order).filter(
        Order.status.in_(PAID_STATES),
        Order.paid_at.isnot(None),
    )
    paid = _time_filter(paid, Order.paid_at, start, end)
    paid_rows = paid.with_entities(
        Order.id, Order.channel, Order.total_amount,
        Order.total_cost, Order.shipping_amount,
    ).all()

    by_channel = {
        "web": {"orders": 0, "gross_cop": ZERO},
        "physical": {"orders": 0, "gross_cop": ZERO},
    }
    total_gross = ZERO
    total_cost = ZERO
    total_shipping = ZERO
    order_ids = []
    for record in paid_rows:
        channel = record.channel.value
        if channel not in by_channel:
            continue
        amount = Decimal(record.total_amount or 0)
        by_channel[channel]["orders"] += 1
        by_channel[channel]["gross_cop"] += amount
        total_gross += amount
        total_cost += Decimal(record.total_cost or 0)
        total_shipping += Decimal(record.shipping_amount or 0)
        order_ids.append(record.id)

    # Separar fecha de devolución de fecha de pago, evitando mezclar cohortes.
    refund_query = db.query(
        func.count(PostSaleCase.id),
        func.coalesce(func.sum(PostSaleCase.refund_amount), 0),
    ).filter(PostSaleCase.refund_status == "externally_recorded")
    refund_query = _time_filter(
        refund_query, PostSaleCase.refund_recorded_at, start, end
    )
    refund_count, refund_total = refund_query.one()
    recorded_refund_amount = Decimal(refund_total or 0)

    pending_web_q = db.query(func.count(Order.id)).filter(
        Order.channel == OrderChannel.WEB, Order.status == OrderStatus.PENDING
    )
    pending_web_q = _time_filter(pending_web_q, Order.created_at, start, end)
    pending_web = pending_web_q.scalar() or 0

    cases_q = db.query(PostSaleCase.status, func.count(PostSaleCase.id))
    cases_q = _time_filter(cases_q, PostSaleCase.created_at, start, end)
    cases_rows = cases_q.group_by(PostSaleCase.status).all()
    cases_counts = {status: count for status, count in cases_rows}

    shipment_q = db.query(Shipment.status, func.count(Shipment.id))
    shipment_q = _time_filter(shipment_q, Shipment.dispatched_at, start, end)
    shipment_rows = shipment_q.group_by(Shipment.status).all()
    shipping_counts = {status: count for status, count in shipment_rows}

    # Snapshot actual, no aplicar filtro histórico a las existencias.
    stock_q = (
        db.query(Product.id, Product.name, Product.sku, Product.stock_min_alert,
                 func.coalesce(func.sum(Inventory.qty_available), 0).label("available"))
        .outerjoin(Inventory, Inventory.product_id == Product.id)
        .filter(Product.active.is_(True))
        .group_by(Product.id, Product.name, Product.sku, Product.stock_min_alert)
    )
    low_stock = [
        {
            "product_id": pid,
            "name": name,
            "sku": sku,
            "available": int(available),
            "minimum": int(minimum or 0),
        }
        for pid, name, sku, minimum, available in stock_q.all()
        if int(available) <= int(minimum or 0)
    ]
    low_stock.sort(key=lambda x: (x["available"] - x["minimum"], x["name"]))

    # Top de unidades por órdenes pagadas del período; no depende de
    # cambios de costo/precio del catálogo ni de pedidos rechazados.
    top_rows = []
    if order_ids:
        sales_q = (
            db.query(
                OrderItem.product_id, OrderItem.product_name, OrderItem.product_sku,
                func.sum(OrderItem.qty), func.sum(OrderItem.qty * OrderItem.unit_price),
            ).join(Order, Order.id == OrderItem.order_id)
            .filter(Order.status.in_(PAID_STATES), Order.paid_at.isnot(None))
        )
        sales_q = _time_filter(sales_q, Order.paid_at, start, end)
        top_rows = sales_q.group_by(
            OrderItem.product_id, OrderItem.product_name, OrderItem.product_sku
        ).order_by(func.sum(OrderItem.qty).desc()).limit(10).all()

    return {
        "period": {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "sales_date_basis": "paid_at",
            "operations_date_basis": "created_at_or_dispatched_at",
        },
        "sales": {
            "orders_paid": sum(x["orders"] for x in by_channel.values()),
            "gross_cop": _money(total_gross),
            "cost_cop": _money(total_cost),
            "gross_margin_before_fees_cop": _money(total_gross - total_cost),
            "shipping_charged_cop": _money(total_shipping),
            "recorded_external_refunds_cop": _money(recorded_refund_amount),
            "recorded_external_refunds_count": int(refund_count or 0),
            "indicative_net_after_recorded_refunds_cop": _money(total_gross - recorded_refund_amount),
            "by_channel": {
                channel: {"orders": values["orders"], "gross_cop": _money(values["gross_cop"])}
                for channel, values in by_channel.items()
            },
        },
        "operations": {
            "pending_web_orders": int(pending_web),
            "post_sale_opened": sum(cases_counts.values()),
            "post_sale_by_status": cases_counts,
            "shipments_registered": sum(shipping_counts.values()),
            "shipments_by_current_status": shipping_counts,
            "low_stock_products": len(low_stock),
        },
        "top_products": [
            {
                "product_id": pid, "name": name, "sku": sku,
                "units": int(units or 0), "sales_cop": _money(sales),
            }
            for pid, name, sku, units, sales in top_rows
        ],
        "low_stock": low_stock[:30],
        "disclaimer": (
            "Indicadores operativos, no estado financiero ni reporte tributario. "
            "Los reembolsos solo reflejan comprobantes externos registrados manualmente; "
            "no se concilian contra la pasarela. La resta de reembolsos es "
            "orientativa: las cohortes por paid_at y refund_recorded_at pueden diferir. "
            "Las existencias representan el inventario actual."
        ),
    }
