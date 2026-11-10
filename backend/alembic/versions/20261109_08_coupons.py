"""Coupons and order application. Revision ID 20261109_08, revises 20261109_07."""
from alembic import op
import sqlalchemy as sa

revision = "20261109_08"
down_revision = "20261109_07"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "promotion_coupons" not in tables:
        op.create_table(
            "promotion_coupons",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(32), nullable=False),
            sa.Column("description", sa.String(240)),
            sa.Column("discount_type", sa.String(16), nullable=False),
            sa.Column("discount_value", sa.Numeric(14, 2), nullable=False),
            sa.Column("maximum_discount", sa.Numeric(14, 2)),
            sa.Column("minimum_subtotal", sa.Numeric(14, 2), nullable=False),
            sa.Column("max_uses", sa.Integer()),
            sa.Column("max_uses_per_customer", sa.Integer(), nullable=False),
            sa.Column("starts_at", sa.DateTime()),
            sa.Column("expires_at", sa.DateTime()),
            sa.Column("active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("code", name="uq_promotion_coupon_code"),
        )
    if "coupon_redemptions" not in tables:
        op.create_table(
            "coupon_redemptions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("coupon_id", sa.Integer(), sa.ForeignKey("promotion_coupons.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("code_snapshot", sa.String(32), nullable=False),
            sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("order_id", name="uq_coupon_redemption_order"),
        )
        op.create_index("ix_coupon_redemptions_coupon_customer", "coupon_redemptions", ["coupon_id", "customer_id"])


def downgrade():
    raise RuntimeError("No retirar historial de cupones sin respaldo y conciliación")
