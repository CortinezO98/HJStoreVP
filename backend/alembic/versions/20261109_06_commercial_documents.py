"""Internal commercial documents and drafts (not DIAN e-invoices).

Revision ID: 20261109_06
Revises: 20261109_05
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_06"
down_revision = "20261109_05"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "commercial_documents" not in tables:
        op.create_table(
            "commercial_documents",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("document_type", sa.String(30), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("post_sale_case_id", sa.Integer(), sa.ForeignKey("post_sale_cases.id"), nullable=True),
            sa.Column("internal_reference", sa.String(50), nullable=False, unique=True),
            sa.Column("status", sa.String(25), nullable=False, server_default="internal"),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("document_type", "order_id", "post_sale_case_id",
                                name="uq_commercial_document_source"),
        )
        op.create_index("ix_commercial_documents_order", "commercial_documents", ["order_id", "document_type"])
        op.create_index("ix_commercial_documents_order_id", "commercial_documents", ["order_id"])
        op.create_index("ix_commercial_documents_post_sale_case_id", "commercial_documents", ["post_sale_case_id"], unique=True)
    if "commercial_document_events" not in tables:
        op.create_table(
            "commercial_document_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("commercial_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action", sa.String(60), nullable=False),
            sa.Column("note", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_document_events_document", "commercial_document_events", ["document_id", "id"])


def downgrade():
    raise RuntimeError("No eliminar registros documentales ni sus bitácoras sin respaldo")
