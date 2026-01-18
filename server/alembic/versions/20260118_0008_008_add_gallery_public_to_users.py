"""Add gallery_public column to users for public gallery opt-in.

Revision ID: 008
Revises: 007
Create Date: 2026-01-18

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add gallery_public column - default to False (opt-in)
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("gallery_public", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("gallery_public")
