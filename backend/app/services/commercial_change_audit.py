"""Transactional auditing for changes to product prices and order status.

A Session.before_flush listener captures ORM changes from all application flows,
including payment-provider webhooks and shipping services. It never changes
business fields, stocks, payment references, or order status.
"""
from decimal import Decimal

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.models.models import Order, Product
from app.services.security_audit import append_audit


def _value(v):
    if v is None:
        return "null"
    if hasattr(v, "value"):
        return str(v.value)
    return str(v)


def _old_new(attribute):
    history = attribute.history
    if not history.has_changes():
        return None
    if not history.deleted or not history.added:
        # Refuse to claim a before/after value without a loaded old value.
        return None
    old, new = history.deleted[0], history.added[0]
    if old == new:
        return None
    return old, new


@event.listens_for(Session, "before_flush")
def append_commercial_audit(session, flush_context, instances):
    actor_id = session.info.get("audit_actor_id")
    origin = "authenticated" if actor_id is not None else "system"
    for obj in list(session.dirty):
        if isinstance(obj, Product):
            state = inspect(obj)
            changes = {}
            for field in ("sale_price", "cost_price", "margin_pct"):
                values = _old_new(state.attrs[field])
                if values:
                    before, after = values
                    changes[field] = {"before": _value(before), "after": _value(after)}
            if changes:
                append_audit(
                    session, action="catalog.prices.changed", actor_id=actor_id,
                    resource="catalog", target_id=obj.id,
                    details={"price_changes": changes, "origin": origin},
                )
        elif isinstance(obj, Order):
            values = _old_new(inspect(obj).attrs.status)
            if values:
                before, after = values
                append_audit(
                    session, action="orders.status.changed", actor_id=actor_id,
                    resource="orders", target_id=obj.id,
                    details={"old_status": _value(before), "new_status": _value(after),
                             "origin": origin},
                )
