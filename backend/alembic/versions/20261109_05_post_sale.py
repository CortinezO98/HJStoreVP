"""Add audited post-sale returns, incidents and externally recorded refunds.

Revision ID: 20261109_05
Revises: 20261109_04
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_05"
down_revision = "20261109_04"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "post_sale_cases" not in tables:
        op.create_table(
            "post_sale_cases",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("order_item_id", sa.Integer(), sa.ForeignKey("order_items.id"), nullable=True),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("kind", sa.String(24), nullable=False),
            sa.Column("reason", sa.String(80), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("qty", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(28), nullable=False, server_default="submitted"),
            sa.Column("refund_amount", sa.Numeric(14, 2), nullable=True),
            sa.Column("refund_status", sa.String(28), nullable=False, server_default="not_requested"),
            sa.Column("refund_reference", sa.String(180), nullable=True),
            sa.Column("refund_recorded_at", sa.DateTime(), nullable=True),
            sa.Column("restocked_qty", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("restock_location_id", sa.Integer(), sa.ForeignKey("locations.id"), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("refund_reference", name="uq_post_sale_refund_reference"),
        )
        op.create_index("ix_post_sale_cases_order_status", "post_sale_cases", ["order_id", "status"])
        op.create_index("ix_post_sale_cases_order_id", "post_sale_cases", ["order_id"])
    if "post_sale_events" not in tables:
        op.create_table(
            "post_sale_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("case_id", sa.Integer(), sa.ForeignKey("post_sale_cases.id", ondelete="CASCADE"), nullable=False),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action", sa.String(48), nullable=False),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_post_sale_events_case_date", "post_sale_events", ["case_id", "created_at"])


def downgrade():
    raise RuntimeError("No eliminar historial posventa sin respaldo, conciliación y autorización")
