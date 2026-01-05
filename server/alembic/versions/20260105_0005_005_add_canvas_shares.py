"""Add canvas_shares table for public share links.

Revision ID: 005
Revises: 004
Create Date: 2026-01-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "canvas_shares",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("piece_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_canvas_shares_token", "canvas_shares", ["token"], unique=True)
    op.create_index(
        "ix_canvas_shares_user_piece",
        "canvas_shares",
        ["user_id", "piece_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_canvas_shares_user_piece", table_name="canvas_shares")
    op.drop_index("ix_canvas_shares_token", table_name="canvas_shares")
    op.drop_table("canvas_shares")
