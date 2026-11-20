"""Add central security/admin audit ledger (append-only application writes).

Revision ID: 20261120_18
Revises: 20261120_17
"""
from alembic import op
import sqlalchemy as sa

revision = "20261120_18"
down_revision = "20261120_17"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("security_audit_events"):
        return
    op.create_table(
        "security_audit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(70), nullable=True),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("signature", sa.String(64), nullable=False),
    )
    op.create_index("ix_security_audit_time", "security_audit_events", ["created_at", "id"])
    op.create_index("ix_security_audit_actor_time", "security_audit_events", ["actor_id", "created_at"])
    op.create_index("ix_security_audit_action_time", "security_audit_events", ["action", "created_at"])


def downgrade():
    raise RuntimeError("Una bitácora de seguridad no puede eliminarse automáticamente")
