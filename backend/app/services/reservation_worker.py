"""Expiración segura de pedidos sin pagos iniciados; lotes de hasta 200."""
import argparse
from datetime import datetime, timezone
import logging
import time

from sqlalchemy import exists, or_
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.models import Order, OrderChannel, OrderStatus, OrderStockReservation
from app.services.stock_reservations import lock_web_order, cancel_web_order

log = logging.getLogger("hjstore.reservations")
BATCH_SIZE = 200


def expire_batch(session_factory=None, *, after_id=0, now=None):
    """Cada pedido tiene su propia transacción; cursor evita bloquear otros lotes."""
    factory = session_factory or SessionLocal
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    with factory() as db:
        ids = [row.id for row in db.query(Order.id).filter(
            Order.id > after_id,
            Order.channel == OrderChannel.WEB,
            Order.status == OrderStatus.PENDING,
            Order.payment_method.is_(None),
            Order.payment_ref.is_(None),
            exists().where(OrderStockReservation.order_id == Order.id,
                           OrderStockReservation.status == "held",
                           OrderStockReservation.expires_at <= now),
            ~exists().where(OrderStockReservation.order_id == Order.id,
                            or_(OrderStockReservation.status != "held",
                                OrderStockReservation.expires_at > now,
                                OrderStockReservation.expires_at.is_(None))),
        ).order_by(Order.id).limit(BATCH_SIZE).all()]
    result = {"examined": len(ids), "cancelled": 0, "skipped": 0, "errors": 0,
              "last_id": ids[-1] if ids else 0}
    for order_id in ids:
        with factory() as db:
            try:
                order = lock_web_order(db, order_id)
                if (order.status != OrderStatus.PENDING or order.payment_method is not None
                        or order.payment_ref is not None):
                    result["skipped"] += 1
                    continue
                records = db.query(OrderStockReservation).filter_by(order_id=order_id).order_by(
                    OrderStockReservation.id).with_for_update().all()
                if not records or any(r.status != "held" or r.expires_at is None or r.expires_at > now for r in records):
                    result["skipped"] += 1
                    continue
                if cancel_web_order(db, order, "Reserva vencida sin pago iniciado"):
                    db.commit()
                    result["cancelled"] += 1
            except Exception:
                db.rollback()
                result["errors"] += 1
                log.warning("No se pudo expirar pedido id=%s; requiere revisión", order_id)
    return result


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--loop", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if not settings.ORDER_EXPIRATION_WORKER_ENABLED:
        log.warning("Worker de reservas deshabilitado")
        return
    cursor = 0
    while True:
        result = expire_batch(after_id=cursor)
        log.info("Resultado expiración: %s", result)
        if args.once:
            return
        cursor = result["last_id"] if result["examined"] == BATCH_SIZE else 0
        time.sleep(1 if cursor else 60)


if __name__ == "__main__":
    main()
