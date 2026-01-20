"""Add magic_link_tokens table for passwordless authentication.

Revision ID: 003
Revises: 002
Create Date: 2026-01-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "magic_link_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_magic_link_tokens_token", "magic_link_tokens", ["token"], unique=True)
    op.create_index("ix_magic_link_tokens_email", "magic_link_tokens", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_magic_link_tokens_email", table_name="magic_link_tokens")
    op.drop_index("ix_magic_link_tokens_token", table_name="magic_link_tokens")
    op.drop_table("magic_link_tokens")
