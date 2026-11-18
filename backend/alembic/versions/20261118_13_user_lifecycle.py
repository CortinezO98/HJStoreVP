"""Separar suspensión y baja lógica de usuarios sin perder referencias históricas.

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
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "deleted" not in columns:
        op.add_column(
            "users",
            sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade():
    raise RuntimeError(
        "Baja lógica contiene información de ciclo de vida; realizar respaldo y revisión antes de revertir."
    )
