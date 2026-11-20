"""Add optional administrator MFA without altering existing user rows.

Revision ID: 20261120_17
Revises: 20261120_16
"""
from alembic import op
import sqlalchemy as sa

revision = "20261120_17"
down_revision = "20261120_16"
branch_labels = None
depends_on = None

def upgrade():
    if sa.inspect(op.get_bind()).has_table("user_mfa_settings"):
        return
    op.create_table(
        "user_mfa_settings",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("secret_ciphertext", sa.Text(), nullable=True),
        sa.Column("pending_secret_ciphertext", sa.Text(), nullable=True),
        sa.Column("recovery_hashes", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_totp_step", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

def downgrade():
    raise RuntimeError("No eliminar factores de autenticación sin recuperación controlada y respaldo.")
