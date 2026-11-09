"""Auditoría SOLO LECTURA de reservas web vencidas.

Uso desde backend/:
    python scripts/audit_expired_reservations.py

No cancela pedidos, no libera stock ni llama a pasarelas. Solo genera una
lista de pedidos por conciliar con el proveedor antes de liberar inventario.
"""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.models import Order, OrderStatus, OrderChannel, OrderStockReservation


def main():
    db = SessionLocal()
    try:
        rows = (
            db.query(
                Order.id,
                Order.order_number,
                Order.status,
                Order.payment_method,
                func.min(OrderStockReservation.expires_at).label("first_expiration"),
                func.count(OrderStockReservation.id).label("reservations"),
            )
            .join(OrderStockReservation, OrderStockReservation.order_id == Order.id)
            .filter(
                Order.channel == OrderChannel.WEB,
                Order.status == OrderStatus.PENDING,
                OrderStockReservation.status == "held",
                OrderStockReservation.expires_at <= datetime.utcnow(),
            )
            .group_by(
                Order.id, Order.order_number, Order.status, Order.payment_method
            )
            .order_by(func.min(OrderStockReservation.expires_at))
            .limit(500)
            .all()
        )
        print("HJSTOREVP | RESERVAS VENCIDAS | SOLO LECTURA")
        print(f"Pedidos candidatos a conciliación: {len(rows)}")
        for row in rows:
            print(
                f"order_id={row.id} order_number={row.order_number} "
                f"payment_method={row.payment_method or 'sin_iniciar'} "
                f"expires_at_utc={row.first_expiration.isoformat()} "
                f"lines={row.reservations}"
            )
        print("No se ha modificado ningún dato.")
        return 0
    except Exception as exc:
        print(f"No se pudo consultar las reservas: {type(exc).__name__}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
