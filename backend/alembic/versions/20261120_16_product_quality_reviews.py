"""Persist human merchandising reviews without changing product sales state.

Revision ID: 20261120_16
Revises: 20261120_15
"""
from alembic import op
import sqlalchemy as sa

revision = "20261120_16"
down_revision = "20261120_15"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("product_quality_reviews"):
        op.create_table(
            "product_quality_reviews",
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"),
                      nullable=False, primary_key=True),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("note", sa.Text(), nullable=False),
            sa.Column("snapshot_hash", sa.String(64), nullable=False),
            sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"),
                      nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=False),
        )
    if not inspector.has_table("product_quality_review_events"):
        op.create_table(
            "product_quality_review_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"),
                      nullable=False),
            sa.Column("status", sa.String(24), nullable=False),
            sa.Column("note", sa.Text(), nullable=False),
            sa.Column("snapshot_hash", sa.String(64), nullable=False),
            sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"),
                      nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_quality_events_product_time", "product_quality_review_events",
                        ["product_id", "reviewed_at"])


def downgrade():
    raise RuntimeError(
        "La tabla contiene decisiones humanas de revisión. "
        "Realiza un respaldo y define una reversión manual controlada."
    )
