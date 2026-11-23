"""Evidencia de consentimiento; sin inventar registros históricos."""
from alembic import op
import sqlalchemy as sa

revision = "20261123_19"
down_revision = "20261120_18"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("data_consents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("policy_version", sa.String(64), nullable=False),
        sa.Column("policy_text", sa.Text(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=False),
        sa.Column("ip_hash", sa.String(64), nullable=False))
    op.create_index("ix_data_consents_user_id", "data_consents", ["user_id"])


def downgrade():
    raise RuntimeError("No eliminar automáticamente evidencia de consentimiento")
