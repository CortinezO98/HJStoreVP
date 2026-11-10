"""Track stock reservation location and lifecycle for new web orders.

Revision ID: 20261109_01
Revises:
Create Date: 2026-11-09

Adds one table, does not modify existing rows. Existing pending orders
remain legacy and should be reconciled manually before cancellation.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "order_stock_reservations" in inspector.get_table_names():
        return
    op.create_table(
        "order_stock_reservations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_item_id", sa.Integer(), sa.ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("locations.id"), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="held"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("order_item_id", name="uq_order_stock_reservation_item"),
    )
    op.create_index("ix_order_stock_reservations_order_id", "order_stock_reservations", ["order_id"])
    op.create_index(
        "ix_order_stock_reservations_expiration",
        "order_stock_reservations", ["status", "expires_at"]
    )


def downgrade():
    raise RuntimeError(
        "Rollback destructivo bloqueado: respaldar y reconciliar las reservas "
        "antes de retirar la tabla manualmente."
    )
