"""Auditoría de reservas web vencidas, sin escrituras por defecto.

Uso desde backend/:
    python scripts/audit_expired_reservations.py

Por defecto NO modifica datos. Con --apply cancela únicamente pedidos
pendientes vencidos que nunca iniciaron un método de pago. Los pagos iniciados
deben conciliarse con el proveedor antes de liberar inventario.
"""
import sys
import argparse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.models import Order, OrderStatus, OrderChannel, OrderStockReservation
from app.services.stock_reservations import cancel_web_order, lock_web_order


def main():
    parser = argparse.ArgumentParser(description="Auditar reservas vencidas")
    parser.add_argument(
        "--apply", action="store_true",
        help="Cancelar SOLO pedidos sin pago iniciado y ya vencidos; dry-run por defecto",
    )
    args = parser.parse_args()
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
        if not args.apply:
            print("MODO SOLO LECTURA: no se ha modificado ningún dato.")
            print("Con --apply se liberan únicamente pedidos SIN pago iniciado.")
            return 0

        cancelled, skipped = 0, 0
        for row in rows:
            # Revalidar con bloqueo; puede haberse iniciado un pago desde la lista.
            order = lock_web_order(db, row.id)
            if order.status != OrderStatus.PENDING or order.payment_method:
                db.rollback()
                skipped += 1
                continue
            current = (
                db.query(OrderStockReservation)
                .filter(
                    OrderStockReservation.order_id == row.id,
                    OrderStockReservation.status == "held",
                ).all()
            )
            if not current or any(r.expires_at > datetime.utcnow() for r in current):
                db.rollback()
                skipped += 1
                continue
            try:
                if cancel_web_order(db, order, "Reserva vencida sin pago iniciado"):
                    db.commit()
                    cancelled += 1
                else:
                    db.rollback()
                    skipped += 1
            except Exception:
                db.rollback()
                skipped += 1
                print(f"REVISIÓN MANUAL: order_id={row.id}")
        print(f"Cancelados y liberados: {cancelled}; omitidos: {skipped}")
        return 0
    except Exception as exc:
        print(f"No se pudo consultar las reservas: {type(exc).__name__}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
