"""Baja lógica de usuarios: preservar pedidos, inventario, caja y auditoría.

Revision ID: 20261118_13
Revises: 20261110_12
"""
from alembic import op
import sqlalchemy as sa

revision = "20261118_13"
down_revision = "20261110_12"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "deleted_at" not in columns:
        op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))


def downgrade():
    raise RuntimeError("La baja lógica de usuarios contiene historial de auditoría; no eliminar sin respaldo.")
