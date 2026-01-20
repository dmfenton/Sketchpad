"""Add code column to magic_link_tokens for manual code entry.

Revision ID: 004
Revises: 003
Create Date: 2026-01-04

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add code column - default value for any existing rows
    # Note: SQLite doesn't support ALTER COLUMN, so we use batch mode
    with op.batch_alter_table("magic_link_tokens") as batch_op:
        batch_op.add_column(
            sa.Column("code", sa.String(length=6), nullable=False, server_default="000000")
        )
    # Create index
    op.create_index("ix_magic_link_tokens_code", "magic_link_tokens", ["code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_magic_link_tokens_code", table_name="magic_link_tokens")
    op.drop_column("magic_link_tokens", "code")
