"""Create shipment and shipment-event tables; existing orders untouched.

Revision ID: 20261109_03
Revises: 20261109_02
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_03"
down_revision = "20261109_02"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "shipments" not in tables:
        op.create_table(
            "shipments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("carrier", sa.String(120), nullable=False),
            sa.Column("service", sa.String(120), nullable=False),
            sa.Column("tracking_number", sa.String(150), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, server_default="dispatched"),
            sa.Column("dispatched_at", sa.DateTime(), nullable=False),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_shipments_order_id", "shipments", ["order_id"], unique=True)
    if "shipment_events" not in tables:
        op.create_table(
            "shipment_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_shipment_events_shipment_created", "shipment_events",
            ["shipment_id", "created_at"],
        )


def downgrade():
    raise RuntimeError(
        "Retiro de tablas de trazabilidad bloqueado: requiere respaldo y revisión manual"
    )
