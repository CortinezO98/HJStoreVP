"""Turnos y movimientos de caja. Revision ID 20261109_10, revises 20261109_09."""
from alembic import op
import sqlalchemy as sa

revision = "20261109_10"
down_revision = "20261109_09"
branch_labels = None
depends_on = None


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "cash_sessions" not in existing:
        op.create_table(
            "cash_sessions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("location_id", sa.Integer(), sa.ForeignKey("locations.id"), nullable=False),
            sa.Column("opened_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("closed_by", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("status", sa.String(12), nullable=False),
            sa.Column("opening_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("closing_counted", sa.Numeric(14, 2)),
            sa.Column("expected_amount", sa.Numeric(14, 2)),
            sa.Column("difference", sa.Numeric(14, 2)),
            sa.Column("opening_note", sa.String(500)),
            sa.Column("closing_note", sa.String(500)),
            sa.Column("opened_at", sa.DateTime(), nullable=False),
            sa.Column("closed_at", sa.DateTime()),
        )
        op.create_index("ix_cash_sessions_location_status", "cash_sessions", ["location_id", "status"])
    if "cash_movements" not in existing:
        op.create_table(
            "cash_movements",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("cash_sessions.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id")),
            sa.Column("movement_type", sa.String(16), nullable=False),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("note", sa.String(500), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("order_id", name="uq_cash_movement_order"),
        )
        op.create_index("ix_cash_movements_session_id", "cash_movements", ["session_id"])


def downgrade():
    raise RuntimeError("Conservar el historial de caja; no eliminarlo sin respaldo y conciliación.")
