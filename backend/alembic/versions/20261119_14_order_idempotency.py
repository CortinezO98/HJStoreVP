"""Idempotencia persistente por cliente para la creación de pedidos web.

Revision ID: 20261119_14
Revises: 20261118_13
"""
from alembic import op
import sqlalchemy as sa

revision = "20261119_14"
down_revision = "20261118_13"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("orders")}
    if "idempotency_key" not in columns:
        op.add_column("orders", sa.Column("idempotency_key", sa.String(80), nullable=True))
    if "idempotency_hash" not in columns:
        op.add_column("orders", sa.Column("idempotency_hash", sa.String(64), nullable=True))

    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("orders")}
    constraints = {
        item["name"] for item in sa.inspect(bind).get_unique_constraints("orders")
    }
    if "uq_orders_customer_idempotency" not in indexes | constraints:
        op.create_unique_constraint(
            "uq_orders_customer_idempotency",
            "orders",
            ["customer_id", "idempotency_key"],
        )


def downgrade():
    raise RuntimeError(
        "No eliminar claves idempotentes con pedidos existentes sin respaldo "
        "y análisis de reintentos."
    )
