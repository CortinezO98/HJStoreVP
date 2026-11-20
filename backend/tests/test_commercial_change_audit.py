"""Phase C regression tests: price and order state audit is transactional."""
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.models import Order, OrderStatus, OrderChannel, Product, SecurityAuditEvent
from app.services import commercial_change_audit  # noqa: F401
from app.services.security_audit import is_signature_valid


def _engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine


def _seed(db):
    product = Product(name="Producto", slug="precio-test", sku="PRICE-TEST",
                      cost_price=Decimal("25.00"), margin_pct=Decimal("20.00"),
                      sale_price=Decimal("30.00"))
    order = Order(order_number="WEB-AUDIT-1", channel=OrderChannel.WEB,
                  status=OrderStatus.PENDING, subtotal=Decimal("30.00"),
                  total_amount=Decimal("30.00"))
    db.add_all([product, order])
    db.commit()
    db.refresh(product)
    db.refresh(order)
    return product, order


def test_price_changes_log_old_new_and_ignore_noop():
    engine = _engine()
    with Session(engine) as db:
        product, _ = _seed(db)
        db.info["audit_actor_id"] = 23
        product.sale_price = Decimal("39.50")
        product.cost_price = Decimal("27.00")
        db.commit()
        rows = db.query(SecurityAuditEvent).filter_by(action="catalog.prices.changed").all()
        assert len(rows) == 1
        row = rows[0]
        assert row.actor_id == 23
        assert row.target_id == str(product.id)
        assert row.details["price_changes"]["sale_price"] == {"before": "30.00", "after": "39.50"}
        assert row.details["price_changes"]["cost_price"] == {"before": "25.00", "after": "27.00"}
        assert is_signature_valid(row)
        product.sale_price = Decimal("39.50")
        db.commit()
        assert db.query(SecurityAuditEvent).filter_by(action="catalog.prices.changed").count() == 1
    engine.dispose()


def test_order_transitions_audited_once_per_real_change():
    engine = _engine()
    with Session(engine) as db:
        _, order = _seed(db)
        order.status = OrderStatus.PAID
        db.commit()
        events = db.query(SecurityAuditEvent).filter_by(action="orders.status.changed").all()
        assert len(events) == 1
        assert events[0].actor_id is None  # provider/system-originated change
        assert events[0].details == {
            "old_status": "pending", "new_status": "paid", "origin": "system"
        }
        assert is_signature_valid(events[0])
        order.status = OrderStatus.PAID
        db.commit()
        assert db.query(SecurityAuditEvent).filter_by(action="orders.status.changed").count() == 1
        db.info["audit_actor_id"] = 9
        order.status = OrderStatus.PREPARING
        db.commit()
        events = db.query(SecurityAuditEvent).filter_by(action="orders.status.changed").order_by(SecurityAuditEvent.id).all()
        assert len(events) == 2
        assert events[1].details["old_status"] == "paid"
        assert events[1].details["new_status"] == "preparing"
        assert events[1].actor_id == 9
    engine.dispose()


def test_price_and_order_rollback_discards_audit():
    engine = _engine()
    with Session(engine) as db:
        product, order = _seed(db)
        product.sale_price = Decimal("50.00")
        order.status = OrderStatus.CANCELLED
        db.flush()
        assert db.query(SecurityAuditEvent).count() == 2
        db.rollback()
        assert db.query(SecurityAuditEvent).count() == 0
        assert db.get(Product, product.id).sale_price == Decimal("30.00")
        assert db.get(Order, order.id).status == OrderStatus.PENDING
    engine.dispose()


def test_new_order_and_product_are_not_false_transitions():
    engine = _engine()
    with Session(engine) as db:
        _seed(db)
        assert db.query(SecurityAuditEvent).count() == 0
    engine.dispose()
