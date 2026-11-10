"""Tabla de configuración comercial editable desde Superadmin.

Revision ID: 20261110_12
Revises: 20261110_11
"""
from alembic import op
import sqlalchemy as sa

revision = "20261110_12"
down_revision = "20261110_11"
branch_labels = None
depends_on = None


def upgrade():
    if "storefront_settings" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "storefront_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("settings_data", sa.JSON(), nullable=False),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade():
    raise RuntimeError("La configuración comercial es información administrada; respaldar antes de eliminar.")
