"""Drop workspace and gallery_pieces tables.

Workspace data is now stored in the filesystem under agent_workspace/users/{user_id}/.

Revision ID: 002
Revises: 001
Create Date: 2026-01-03

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop gallery_pieces first (has FK to workspaces)
    op.drop_index("ix_gallery_pieces_workspace_id", table_name="gallery_pieces")
    op.drop_table("gallery_pieces")

    # Drop workspaces
    op.drop_index("ix_workspaces_user_id", table_name="workspaces")
    op.drop_table("workspaces")


def downgrade() -> None:
    # Recreate workspaces table
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("canvas_state", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="paused"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("monologue", sa.Text(), nullable=False, server_default=""),
        sa.Column("piece_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspaces_user_id", "workspaces", ["user_id"], unique=False)

    # Recreate gallery_pieces table
    op.create_table(
        "gallery_pieces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("piece_number", sa.Integer(), nullable=False),
        sa.Column("strokes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_gallery_pieces_workspace_id", "gallery_pieces", ["workspace_id"], unique=False
    )
