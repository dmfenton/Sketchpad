"""Add platform column to magic_link_tokens for routing.

Revision ID: 006
Revises: 005
Create Date: 2026-01-15

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add platform column - default to "app" for backwards compatibility
    # Note: SQLite doesn't support ALTER COLUMN, so we use batch mode
    with op.batch_alter_table("magic_link_tokens") as batch_op:
        batch_op.add_column(
            sa.Column("platform", sa.String(length=10), nullable=False, server_default="app")
        )


def downgrade() -> None:
    with op.batch_alter_table("magic_link_tokens") as batch_op:
        batch_op.drop_column("platform")
