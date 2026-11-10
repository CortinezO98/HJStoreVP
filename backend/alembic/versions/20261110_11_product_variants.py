"""Variants as sellable product rows; existing inventory/order IDs remain valid.

Revision ID: 20261110_11
Revises: 20261109_10
"""
from alembic import op
import sqlalchemy as sa

revision = "20261110_11"
down_revision = "20261109_10"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("products")}
    if "parent_product_id" not in columns:
        op.add_column("products", sa.Column("parent_product_id", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_products_variant_parent", "products", "products", ["parent_product_id"], ["id"], ondelete="RESTRICT")
        op.create_index("ix_products_parent_product_id", "products", ["parent_product_id"])
    if "variant_options" not in columns:
        op.add_column("products", sa.Column("variant_options", sa.JSON(), nullable=True))


def downgrade():
    raise RuntimeError("No eliminar referencias de variantes vinculadas a pedidos e inventario.")
