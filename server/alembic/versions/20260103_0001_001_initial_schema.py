"""Initial schema with users, invite codes, workspaces, and gallery.

Revision ID: 001
Revises:
Create Date: 2026-01-03

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Invite codes table
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["used_by_user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"], unique=True)

    # Workspaces table
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

    # Gallery pieces table
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
    op.create_index("ix_gallery_pieces_workspace_id", "gallery_pieces", ["workspace_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_gallery_pieces_workspace_id", table_name="gallery_pieces")
    op.drop_table("gallery_pieces")
    op.drop_index("ix_workspaces_user_id", table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_index("ix_invite_codes_code", table_name="invite_codes")
    op.drop_table("invite_codes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
