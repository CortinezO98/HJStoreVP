"""Add tax readiness configuration; NO fiscal invoice issue.

Revision ID: 20261109_07
Revises: 20261109_06
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_07"
down_revision = "20261109_06"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "tax_issuer_profiles" not in tables:
        op.create_table(
            "tax_issuer_profiles",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("legal_name", sa.String(200), nullable=False),
            sa.Column("tax_id", sa.String(20), nullable=False),
            sa.Column("verification_digit", sa.String(1), nullable=True),
            sa.Column("person_type", sa.String(20), nullable=False),
            sa.Column("tax_regime", sa.String(60), nullable=False),
            sa.Column("fiscal_responsibilities", sa.JSON(), nullable=False),
            sa.Column("economic_activities", sa.JSON(), nullable=False),
            sa.Column("fiscal_address", sa.String(350), nullable=False),
            sa.Column("city", sa.String(100), nullable=False),
            sa.Column("department", sa.String(100), nullable=False),
            sa.Column("contact_email", sa.String(254), nullable=False),
            sa.Column("operation_mode", sa.String(30), nullable=False),
            sa.Column("provider_name", sa.String(120), nullable=True),
            sa.Column("readiness_status", sa.String(30), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "product_tax_profiles" not in tables:
        op.create_table(
            "product_tax_profiles",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tax_treatment", sa.String(25), nullable=False),
            sa.Column("tariff_code", sa.String(40), nullable=True),
            sa.Column("tax_rate", sa.Numeric(7, 4), nullable=True),
            sa.Column("accounting_note", sa.String(500), nullable=True),
            sa.Column("reviewed_by_accountant", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("product_id", name="uq_product_tax_profiles_product"),
        )


def downgrade():
    raise RuntimeError("No eliminar configuración tributaria sin respaldo y revisión")
