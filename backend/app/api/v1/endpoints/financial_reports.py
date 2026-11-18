"""Reportes comerciales históricos. Solo administradores; operaciones de lectura.

Los importes son indicadores de venta bruta y costo registrado, no estados
contables ni liquidaciones fiscales. Las categorías son las ACTUALES.
"""
from datetime import date, datetime, time, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db.session import get_db

router = APIRouter(prefix="/financial-reports", tags=["Reportes comerciales"])
PAID = "o.paid_at IS NOT NULL AND LOWER(o.status) IN ('paid','preparing','shipped','delivered','refunded')"
NOTE = (
    "Ingresos cobrados brutos según paid_at. No descuenta reembolsos, impuestos ni "
    "comisiones; por producto/categoría se usan importes de líneas antes de "
    "descuentos globales y flete. La categoría corresponde al catálogo actual."
)


def _filters(date_from, date_to, location_id, category_id):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "La fecha final es anterior a la inicial")
    if date_from and date_to and (date_to - date_from).days > 730:
        raise HTTPException(422, "Rango máximo de 730 días; omite las fechas para el histórico completo")
    conditions = [PAID]
    params = {}
    if date_from:
        conditions.append("o.paid_at >= :start_at")
        params["start_at"] = datetime.combine(date_from, time.min)
    if date_to:
        conditions.append("o.paid_at < :end_at")
        params["end_at"] = datetime.combine(date_to + timedelta(days=1), time.min)
    if location_id is not None:
        conditions.append("o.location_id = :location_id")
        params["location_id"] = location_id
    if category_id is not None:
        conditions.append("p.category_id = :category_id")
        params["category_id"] = category_id
    return conditions, params


def _query(db, sql, params):
    return db.execute(text(sql), params).mappings()


def _aggregate(db, date_from, date_to, location_id, category_id):
    where, params = _filters(date_from, date_to, location_id, category_id)
    line_join = """JOIN order_items oi ON oi.order_id = o.id
                   LEFT JOIN products p ON p.id = oi.product_id"""
    order_where = [c for c in where if "p.category_id" not in c]
    # Al filtrar categoría, las sumas por pedidos se convierten en sumas de
    # líneas para evitar incluir productos de otras categorías.
    if category_id is None:
        raw = _query(db, f"""
            SELECT LOWER(o.channel) channel, COUNT(*) orders_count,
                   COALESCE(SUM(o.total_amount),0) revenue,
                   COALESCE(SUM(o.total_cost),0) cost
            FROM orders o WHERE {' AND '.join(order_where)}
            GROUP BY LOWER(o.channel)
        """, params).all()
    else:
        raw = _query(db, f"""
            SELECT LOWER(o.channel) channel, COUNT(DISTINCT o.id) orders_count,
                   COALESCE(SUM(oi.qty * oi.unit_price),0) revenue,
                   COALESCE(SUM(oi.qty * oi.cost_price),0) cost
            FROM orders o {line_join}
            WHERE {' AND '.join(where)}
            GROUP BY LOWER(o.channel)
        """, params).all()
    channels = [{"channel": r["channel"], "orders": int(r["orders_count"]),
                 "revenue": float(r["revenue"]), "cost": float(r["cost"]),
                 "profit": float(r["revenue"] - r["cost"])} for r in raw]
    details = []
    for kind, group, order in (
        ("categories", "p.category_id, c.name", "revenue DESC"),
        ("products", "oi.product_id, oi.product_name, oi.product_sku", "revenue DESC"),
        ("locations", "o.location_id, l.name, LOWER(o.channel)", "revenue DESC"),
    ):
        if kind == "categories":
            fields = "p.category_id category_id, COALESCE(c.name, 'Sin categoría') category"
            joins = " LEFT JOIN categories c ON c.id = p.category_id"
        elif kind == "products":
            fields = "oi.product_id product_id, oi.product_name product_name, oi.product_sku sku"
            joins = ""
        else:
            fields = "o.location_id location_id, COALESCE(l.name, 'Tienda Web') location_name, LOWER(o.channel) channel"
            joins = " LEFT JOIN locations l ON l.id = o.location_id"
        rows = _query(db, f"""
            SELECT {fields}, COUNT(DISTINCT o.id) orders_count,
                   SUM(oi.qty) units,
                   COALESCE(SUM(oi.qty * oi.unit_price),0) revenue,
                   COALESCE(SUM(oi.qty * oi.cost_price),0) cost,
                   COALESCE(SUM(oi.qty * (oi.unit_price - oi.cost_price)),0) profit
            FROM orders o {line_join} {joins}
            WHERE {' AND '.join(where)}
            GROUP BY {group}
            ORDER BY {order}
        """, params).all()
        details.append((kind, [
            {**dict(r), "orders_count": int(r["orders_count"]),
             "units": int(r["units"] or 0),
             "revenue": float(r["revenue"]), "cost": float(r["cost"]),
             "profit": float(r["profit"])} for r in rows
        ]))
    data = dict(details)
    # Comparación de meses con filtros de sede/categoría idénticos.
    # Las ventanas son meses calendario UTC, usando paid_at.
    today = datetime.utcnow().date()
    this_month = today.replace(day=1)
    last_month = (this_month - timedelta(days=1)).replace(day=1)
    last_year = this_month.replace(year=this_month.year - 1)
    next_last_year = (last_year.replace(day=28) + timedelta(days=4)).replace(day=1)
    comparisons = []
    for name, start, end in (
        ("mes_actual", this_month, (this_month.replace(day=28) + timedelta(days=4)).replace(day=1)),
        ("mes_anterior", last_month, this_month),
        ("mismo_mes_ano_anterior", last_year, next_last_year),
    ):
        comp_conditions, comp_params = _filters(start, end - timedelta(days=1), location_id, category_id)
        query = f"""
            SELECT COALESCE(SUM(oi.qty * oi.unit_price),0) revenue
            FROM orders o {line_join}
            WHERE {' AND '.join(comp_conditions)}
        """ if category_id is not None else f"""
            SELECT COALESCE(SUM(o.total_amount),0) revenue
            FROM orders o WHERE {' AND '.join(c for c in comp_conditions if 'p.category_id' not in c)}
        """
        value = _query(db, query, comp_params).first()["revenue"]
        comparisons.append({"period": name, "revenue": float(value or 0)})
    current, previous, prior_year = [v["revenue"] for v in comparisons]
    def pct(base):
        return round((current - base) * 100 / base, 2) if base else None
    total_revenue = sum(x["revenue"] for x in channels)
    total_cost = sum(x["cost"] for x in channels)
    return {
        "period": {"date_from": str(date_from) if date_from else None,
                   "date_to": str(date_to) if date_to else None,
                   "location_id": location_id, "category_id": category_id},
        "summary": {"revenue": total_revenue, "cost": total_cost,
                    "profit": total_revenue - total_cost,
                    "orders": sum(x["orders"] for x in channels),
                    "channels": channels},
        **data,
        "comparison": {"periods": comparisons, "vs_previous_month_pct": pct(previous),
                       "vs_same_month_previous_year_pct": pct(prior_year)},
        "note": NOTE,
    }


@router.get("/overview")
def overview(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None, ge=1),
    category_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    return _aggregate(db, date_from, date_to, location_id, category_id)


def _safe_excel(value):
    # No interpretar como fórmulas los nombres/SKU ingresados por terceros.
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


def _sheet(wb, name, headings, rows):
    ws = wb.create_sheet(name)
    ws.append(headings)
    for row in rows:
        ws.append([_safe_excel(v) for v in row])
    return ws


@router.get("/excel")
def export_excel(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    location_id: int | None = Query(None, ge=1),
    category_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Archivo XLSX multihoja; el detalle recorre todo el histórico por lotes."""
    from openpyxl import Workbook

    report = _aggregate(db, date_from, date_to, location_id, category_id)
    wb = Workbook(write_only=True)
    s = report["summary"]
    _sheet(wb, "Resumen", ["Concepto", "COP"], [
        ("Ingresos", s["revenue"]), ("Costo", s["cost"]), ("Margen bruto", s["profit"]),
        ("Pedidos", s["orders"]), ("Criterio de fecha", "Pago confirmado (UTC)"),
        ("Nota", NOTE),
    ])
    _sheet(wb, "Canales", ["Canal", "Pedidos", "Ingresos", "Costo", "Margen"], [
        (x["channel"], x["orders"], x["revenue"], x["cost"], x["profit"])
        for x in s["channels"]
    ])
    _sheet(wb, "Categorias", ["ID", "Categoría actual", "Pedidos", "Unidades", "Ingresos líneas", "Costo", "Margen"], [
        (x["category_id"], x["category"], x["orders_count"], x["units"], x["revenue"], x["cost"], x["profit"])
        for x in report["categories"]
    ])
    _sheet(wb, "Productos", ["ID", "Producto", "SKU", "Pedidos", "Unidades", "Ingresos líneas", "Costo", "Margen"], [
        (x["product_id"], x["product_name"], x["sku"], x["orders_count"], x["units"], x["revenue"], x["cost"], x["profit"])
        for x in report["products"]
    ])
    _sheet(wb, "Sedes", ["ID", "Sede", "Canal", "Pedidos", "Unidades", "Ingresos líneas", "Costo", "Margen"], [
        (x["location_id"], x["location_name"], x["channel"], x["orders_count"], x["units"], x["revenue"], x["cost"], x["profit"])
        for x in report["locations"]
    ])
    _sheet(wb, "Comparativos", ["Periodo", "Ingresos COP"], [
        (x["period"], x["revenue"]) for x in report["comparison"]["periods"]
    ])
    where, params = _filters(date_from, date_to, location_id, category_id)
    join = "JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id"
    rows = _query(db, f"""
        SELECT o.order_number, o.paid_at, LOWER(o.channel) channel,
               o.location_id, LOWER(o.status) status,
               oi.product_name, oi.product_sku, oi.qty,
               oi.unit_price, oi.cost_price
        FROM orders o {join}
        WHERE {' AND '.join(where)}
        ORDER BY o.paid_at DESC, o.id DESC, oi.id DESC
    """, params)
    ws = wb.create_sheet("Detalle ventas 1")
    headers = ["Pedido", "Fecha pago UTC", "Canal", "ID sede", "Estado",
               "Producto", "SKU", "Cantidad", "Precio unit.", "Costo unit.", "Ingreso línea", "Costo línea"]
    ws.append(headers)
    count = 0
    for r in rows:
        if count and count % 1048575 == 0:
            ws = wb.create_sheet(f"Detalle ventas {count // 1048575 + 1}")
            ws.append(headers)
        qty = int(r["qty"])
        ws.append([_safe_excel(r["order_number"]), r["paid_at"], r["channel"], r["location_id"],
                   r["status"], _safe_excel(r["product_name"]), _safe_excel(r["product_sku"]),
                   qty, float(r["unit_price"]), float(r["cost_price"]),
                   qty * float(r["unit_price"]), qty * float(r["cost_price"])])
        count += 1
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"hjstorevp_reporte_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )
