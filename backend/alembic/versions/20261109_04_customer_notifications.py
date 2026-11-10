"""Transactional email notification outbox, additive.

Revision ID: 20261109_04
Revises: 20261109_03
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_04"
down_revision = "20261109_03"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "customer_notifications" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "customer_notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_key", sa.String(180), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("recipient", sa.String(254), nullable=False),
        sa.Column("subject", sa.String(220), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
        sa.Column("lease_until", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("event_key", name="uq_customer_notification_event"),
    )
    op.create_index("ix_customer_notifications_order_id", "customer_notifications", ["order_id"])
    op.create_index(
        "ix_customer_notification_queue", "customer_notifications", ["status", "next_attempt_at"]
    )


def downgrade():
    raise RuntimeError("No eliminar registros de avisos sin respaldo y conciliación manual")
