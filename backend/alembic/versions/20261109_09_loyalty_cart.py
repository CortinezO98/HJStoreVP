"""Customer saved carts, marketing consent, recovery notices and loyalty ledger.

Revision ID: 20261109_09
Revises: 20261109_08
"""
from alembic import op
import sqlalchemy as sa
revision = "20261109_09"
down_revision = "20261109_08"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "customer_engagement_preferences" not in tables:
        op.create_table(
            "customer_engagement_preferences",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("recovery_email_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("marketing_email_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "saved_customer_carts" not in tables:
        op.create_table(
            "saved_customer_carts",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("items", sa.JSON(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("recovered_at", sa.DateTime(), nullable=True),
        )
    if "cart_recovery_notices" not in tables:
        op.create_table(
            "cart_recovery_notices",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("cart_revision", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(22), nullable=False, server_default="scheduled"),
            sa.Column("due_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("lease_until", sa.DateTime()),
            sa.Column("sent_at", sa.DateTime()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("user_id", "cart_revision", name="uq_recovery_revision"),
        )
        op.create_index("ix_cart_recovery_due", "cart_recovery_notices", ["status", "due_at"])
        op.create_index("ix_cart_recovery_notices_user_id", "cart_recovery_notices", ["user_id"])
    if "loyalty_ledger" not in tables:
        op.create_table(
            "loyalty_ledger",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_key", sa.String(140), nullable=False),
            sa.Column("points_delta", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(24), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("event_key", name="uq_loyalty_ledger_event"),
        )
        op.create_index("ix_loyalty_ledger_user_id", "loyalty_ledger", ["user_id"])


def downgrade():
    raise RuntimeError("No borrar registros de consentimiento y puntos sin respaldo y autorización")
