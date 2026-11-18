from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, date, timedelta
from typing import Optional
from app.db.session import get_db
from app.core.deps import require_admin

router = APIRouter(prefix="/analytics", tags=["Analytics & BI"])


@router.get("/sales-by-month")
def sales_by_month(
    year: int = Query(default=datetime.utcnow().year, ge=2000, le=2100),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Ventas totales agrupadas por mes para el año indicado."""
    results = db.execute(text("""
        SELECT
            MONTH(paid_at)   AS month,
            COUNT(*)            AS orders_count,
            SUM(total_amount)   AS total_sales,
            SUM(total_cost)     AS total_cost,
            SUM(total_amount - COALESCE(total_cost, 0)) AS gross_profit
        FROM orders
        WHERE paid_at IS NOT NULL AND LOWER(status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')
          AND YEAR(paid_at) = :year
        GROUP BY MONTH(paid_at)
        ORDER BY month
    """), {"year": year}).fetchall()

    months_data = {r[0]: r for r in results}
    return [
        {
            "month": m,
            "month_name": ["Ene","Feb","Mar","Abr","May","Jun",
                           "Jul","Ago","Sep","Oct","Nov","Dic"][m - 1],
            "orders_count": months_data[m][1] if m in months_data else 0,
            "total_sales": float(months_data[m][2]) if m in months_data else 0,
            "total_cost": float(months_data[m][3]) if m in months_data else 0,
            "gross_profit": float(months_data[m][4]) if m in months_data else 0,
        }
        for m in range(1, 13)
    ]


@router.get("/top-products")
def top_products(
    limit: int = Query(10, ge=1, le=50),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Productos más vendidos por ingresos y unidades."""
    where_clauses = ["o.paid_at IS NOT NULL AND LOWER(o.status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')"]
    params = {"limit": limit}

    if date_from:
        where_clauses.append("o.paid_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_clauses.append("o.paid_at < :date_to_exclusive")
        params["date_to_exclusive"] = date_to + timedelta(days=1)

    where = " AND ".join(where_clauses)

    results = db.execute(text(f"""
        SELECT
            oi.product_id,
            oi.product_name,
            oi.product_sku,
            SUM(oi.qty)                             AS units_sold,
            SUM(oi.qty * oi.unit_price)             AS total_revenue,
            SUM(oi.qty * (oi.unit_price - oi.cost_price)) AS gross_profit,
            AVG(oi.margin_pct)                      AS avg_margin
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE {where}
        GROUP BY oi.product_id, oi.product_name, oi.product_sku
        ORDER BY total_revenue DESC
        LIMIT :limit
    """), params).fetchall()

    return [
        {
            "product_id": r[0],
            "product_name": r[1],
            "sku": r[2],
            "units_sold": r[3],
            "total_revenue": float(r[4]),
            "gross_profit": float(r[5]),
            "avg_margin": float(r[6]),
        }
        for r in results
    ]


@router.get("/low-rotation-products")
def low_rotation_products(
    days_without_sales: int = Query(30, ge=1, le=3650),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Productos sin ventas en los últimos N días — candidatos a promoción."""
    results = db.execute(text("""
        SELECT
            p.id, p.name, p.sku, p.sale_price,
            MAX(o.paid_at) AS last_sale_date,
            COALESCE(stock.current_stock, 0) AS current_stock
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON o.id = oi.order_id AND o.paid_at IS NOT NULL AND LOWER(o.status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')
        LEFT JOIN (
            SELECT product_id, SUM(qty_available) AS current_stock
            FROM inventory GROUP BY product_id
        ) stock ON stock.product_id = p.id
        WHERE p.active = 1
        GROUP BY p.id, p.name, p.sku, p.sale_price, stock.current_stock
        HAVING last_sale_date IS NULL
           OR last_sale_date < DATE_SUB(NOW(), INTERVAL :days DAY)
        ORDER BY last_sale_date ASC
    """), {"days": days_without_sales}).fetchall()

    return [
        {
            "product_id": r[0],
            "product_name": r[1],
            "sku": r[2],
            "sale_price": float(r[3]),
            "last_sale_date": r[4].isoformat() if r[4] else None,
            "current_stock": r[5],
        }
        for r in results
    ]


@router.get("/sales-by-location")
def sales_by_location(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Ventas por punto físico y canal web."""
    where_clauses = ["o.paid_at IS NOT NULL AND LOWER(o.status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')"]
    params = {}

    if date_from:
        where_clauses.append("o.paid_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_clauses.append("o.paid_at < :date_to_exclusive")
        params["date_to_exclusive"] = date_to + timedelta(days=1)

    where = " AND ".join(where_clauses)

    results = db.execute(text(f"""
        SELECT
            COALESCE(l.name, 'Tienda Web') AS location_name,
            o.channel,
            COUNT(o.id)              AS orders_count,
            SUM(o.total_amount)      AS total_sales,
            SUM(o.total_cost)        AS total_cost,
            SUM(o.total_amount - COALESCE(o.total_cost, 0)) AS gross_profit
        FROM orders o
        LEFT JOIN locations l ON l.id = o.location_id
        WHERE {where}
        GROUP BY o.location_id, l.name, o.channel
        ORDER BY total_sales DESC
    """), params).fetchall()

    return [
        {
            "location_name": r[0],
            "channel": r[1],
            "orders_count": r[2],
            "total_sales": float(r[3]),
            "total_cost": float(r[4]),
            "gross_profit": float(r[5]),
        }
        for r in results
    ]


@router.get("/dashboard-summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """KPIs principales para el dashboard — mes actual."""
    result = db.execute(text("""
        SELECT
            COUNT(*)                        AS orders_this_month,
            COALESCE(SUM(total_amount), 0)  AS revenue_this_month,
            COALESCE(AVG(total_amount), 0)  AS avg_ticket,
            COALESCE(SUM(total_amount - COALESCE(total_cost, 0)), 0) AS profit_this_month
        FROM orders
        WHERE paid_at IS NOT NULL AND LOWER(status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')
          AND YEAR(paid_at) = YEAR(UTC_TIMESTAMP())
          AND MONTH(paid_at) = MONTH(NOW())
    """)).fetchone()

    low_stock = db.execute(text("""
        SELECT COUNT(*) FROM (
            SELECT p.id
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id
            WHERE p.active = 1
            GROUP BY p.id, p.stock_min_alert
            HAVING COALESCE(SUM(i.qty_available), 0) <= p.stock_min_alert
        ) t
    """)).scalar()

    pending_orders = db.execute(text(
        "SELECT COUNT(*) FROM orders WHERE status = 'pending'"
    )).scalar()

    return {
        "orders_this_month": result[0],
        "revenue_this_month": float(result[1]),
        "avg_ticket": float(result[2]),
        "profit_this_month": float(result[3]),
        "low_stock_alerts": low_stock,
        "pending_orders": pending_orders,
    }


@router.get("/accounting-summary")
def accounting_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    location_id: Optional[int] = Query(None, ge=1),
    category_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Aggregated paid sales, without pagination limits from order listing APIs.

    Values are operational gross figures, not tax/accounting certification.
    Category grouping follows the product's CURRENT category; historic changes
    of category are not reconstructed. Shipping is excluded from category cuts.
    """
    from fastapi import HTTPException

    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="La fecha final es anterior a la inicial")
    if date_from and date_to and (date_to - date_from).days > 730:
        raise HTTPException(status_code=422, detail="El rango máximo es de 730 días")

    conditions = [
        "o.paid_at IS NOT NULL",
        "LOWER(o.status) IN ('paid', 'preparing', 'shipped', 'delivered', 'refunded')",
    ]
    params = {}
    if date_from:
        conditions.append("o.paid_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        conditions.append("o.paid_at < :date_to_exclusive")
        params["date_to_exclusive"] = date_to + timedelta(days=1)
    if location_id:
        conditions.append("o.location_id = :location_id")
        params["location_id"] = location_id

    joins = ""
    if category_id:
        joins = (" JOIN order_items oi ON oi.order_id = o.id"
                 " JOIN products p ON p.id = oi.product_id")
        conditions.append("p.category_id = :category_id")
        params["category_id"] = category_id
        revenue = "SUM(oi.qty * oi.unit_price)"
        cost = "SUM(oi.qty * oi.cost_price)"
    else:
        revenue = "SUM(o.total_amount)"
        cost = "SUM(COALESCE(o.total_cost, 0))"

    query = text(f"""
        SELECT o.channel, COALESCE({revenue}, 0) AS revenue,
               COALESCE({cost}, 0) AS cost,
               COUNT(DISTINCT o.id) AS orders_count
        FROM orders o {joins}
        WHERE {" AND ".join(conditions)}
        GROUP BY o.channel
    """)
    data = {
        "webRevenue": 0.0, "physicalRevenue": 0.0,
        "webCost": 0.0, "physicalCost": 0.0,
        "webOrders": 0, "physicalOrders": 0,
    }
    for channel, revenue_value, cost_value, count in db.execute(query, params):
        if str(channel).lower() == "web":
            prefix = "web"
        elif str(channel).lower() == "physical":
            prefix = "physical"
        else:
            continue
        data[f"{prefix}Revenue"] = float(revenue_value or 0)
        data[f"{prefix}Cost"] = float(cost_value or 0)
        data[f"{prefix}Orders"] = int(count or 0)

    data["totalRevenue"] = data["webRevenue"] + data["physicalRevenue"]
    data["totalCost"] = data["webCost"] + data["physicalCost"]
    data["grossProfit"] = data["totalRevenue"] - data["totalCost"]
    data["basis"] = "paid_at"
    data["category_basis"] = "current_product_category" if category_id else None
    data["note"] = (
        "Margen bruto indicativo; no descuenta impuestos, comisiones ni reembolsos. "
        "Al filtrar categoría se usan importes de líneas sin envío ni descuentos "
        "globales de pedido; no equivale a ingresos contables conciliados."
    )
    return data
