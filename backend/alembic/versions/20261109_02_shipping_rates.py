"""Add shipping tariffs without touching existing orders.

Revision ID: 20261109_02
Revises: 20261109_01
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_02"
down_revision = "20261109_01"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "shipping_rates" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "shipping_rates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("department", sa.String(100), nullable=False),
        sa.Column("department_key", sa.String(100), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("city_key", sa.String(100), nullable=True),
        sa.Column("carrier", sa.String(120), nullable=False),
        sa.Column("service", sa.String(120), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("days_min", sa.Integer(), nullable=False),
        sa.Column("days_max", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_shipping_rates_region", "shipping_rates",
        ["department_key", "city_key", "active"],
    )


def downgrade():
    raise RuntimeError("No eliminar tarifas sin respaldar y revisar pedidos asociados")
