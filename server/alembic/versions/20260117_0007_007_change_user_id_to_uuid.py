"""Change user id from integer to UUID string.

Revision ID: 007
Revises: 006
Create Date: 2026-01-17

This migration changes the User.id column from Integer to String(36) to use UUIDs.
This enables user-specific URLs (like gallery thumbnails) without exposing enumerable IDs.
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Change user.id from Integer to String(36) UUID.

    SQLite doesn't support ALTER COLUMN, so we use batch mode which recreates the table.
    This migration:
    1. Recreates users table with String(36) id
    2. Generates UUID for existing user
    3. Updates foreign key references in invite_codes and canvas_shares
    """
    conn = op.get_bind()

    # Step 1: Get existing users and generate UUIDs for them
    users = conn.execute(
        sa.text("SELECT id, email, password_hash, is_active, created_at FROM users")
    ).fetchall()
    user_id_map: dict[int, str] = {}
    for user in users:
        new_uuid = str(uuid4())
        user_id_map[user[0]] = new_uuid

    # Step 2: Get existing invite_codes that reference users
    invite_codes = conn.execute(
        sa.text("SELECT id, code, created_at, used_at, used_by_user_id FROM invite_codes")
    ).fetchall()

    # Step 3: Get existing canvas_shares that reference users
    canvas_shares = conn.execute(
        sa.text("SELECT id, token, user_id, piece_number, title, created_at FROM canvas_shares")
    ).fetchall()

    # Step 4: Drop foreign key constraints by recreating tables
    # Drop canvas_shares first (depends on users)
    op.drop_table("canvas_shares")

    # Drop invite_codes (depends on users)
    op.drop_index("ix_invite_codes_code", table_name="invite_codes")
    op.drop_table("invite_codes")

    # Step 5: Recreate users table with String(36) id
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Step 6: Re-insert users with new UUIDs
    for user in users:
        old_id = user[0]
        new_id = user_id_map[old_id]
        conn.execute(
            sa.text(
                "INSERT INTO users (id, email, password_hash, is_active, created_at) "
                "VALUES (:id, :email, :password_hash, :is_active, :created_at)"
            ),
            {
                "id": new_id,
                "email": user[1],
                "password_hash": user[2],
                "is_active": user[3],
                "created_at": user[4],
            },
        )

    # Step 7: Recreate invite_codes with String(36) foreign key
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"], unique=True)

    # Re-insert invite_codes with mapped user IDs
    for code in invite_codes:
        old_user_id = code[4]
        new_user_id = user_id_map.get(old_user_id) if old_user_id else None
        conn.execute(
            sa.text(
                "INSERT INTO invite_codes (id, code, created_at, used_at, used_by_user_id) "
                "VALUES (:id, :code, :created_at, :used_at, :used_by_user_id)"
            ),
            {
                "id": code[0],
                "code": code[1],
                "created_at": code[2],
                "used_at": code[3],
                "used_by_user_id": new_user_id,
            },
        )

    # Step 8: Recreate canvas_shares with String(36) foreign key
    op.create_table(
        "canvas_shares",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("piece_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_canvas_shares_token", "canvas_shares", ["token"], unique=True)

    # Re-insert canvas_shares with mapped user IDs
    for share in canvas_shares:
        old_user_id = share[2]
        new_user_id = user_id_map.get(old_user_id)
        if new_user_id:  # Only insert if user exists
            conn.execute(
                sa.text(
                    "INSERT INTO canvas_shares (id, token, user_id, piece_number, title, created_at) "
                    "VALUES (:id, :token, :user_id, :piece_number, :title, :created_at)"
                ),
                {
                    "id": share[0],
                    "token": share[1],
                    "user_id": new_user_id,
                    "piece_number": share[3],
                    "title": share[4],
                    "created_at": share[5],
                },
            )


def downgrade() -> None:
    """Revert to integer user IDs.

    Note: This will lose UUID values and assign new sequential IDs.
    """
    conn = op.get_bind()

    # Get existing users
    users = conn.execute(
        sa.text("SELECT id, email, password_hash, is_active, created_at FROM users")
    ).fetchall()

    # Create mapping from UUID to new integer ID
    user_id_map: dict[str, int] = {}
    for i, user in enumerate(users, start=1):
        user_id_map[user[0]] = i

    # Get existing invite_codes
    invite_codes = conn.execute(
        sa.text("SELECT id, code, created_at, used_at, used_by_user_id FROM invite_codes")
    ).fetchall()

    # Get existing canvas_shares
    canvas_shares = conn.execute(
        sa.text("SELECT id, token, user_id, piece_number, title, created_at FROM canvas_shares")
    ).fetchall()

    # Drop tables in reverse order
    op.drop_index("ix_canvas_shares_token", table_name="canvas_shares")
    op.drop_table("canvas_shares")
    op.drop_index("ix_invite_codes_code", table_name="invite_codes")
    op.drop_table("invite_codes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    # Recreate users with Integer id
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

    # Re-insert users with integer IDs
    for user in users:
        old_uuid = user[0]
        new_id = user_id_map[old_uuid]
        conn.execute(
            sa.text(
                "INSERT INTO users (id, email, password_hash, is_active, created_at) "
                "VALUES (:id, :email, :password_hash, :is_active, :created_at)"
            ),
            {
                "id": new_id,
                "email": user[1],
                "password_hash": user[2],
                "is_active": user[3],
                "created_at": user[4],
            },
        )

    # Recreate invite_codes with Integer foreign key
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["used_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"], unique=True)

    # Re-insert invite_codes
    for code in invite_codes:
        old_user_id = code[4]
        new_user_id = user_id_map.get(old_user_id) if old_user_id else None
        conn.execute(
            sa.text(
                "INSERT INTO invite_codes (id, code, created_at, used_at, used_by_user_id) "
                "VALUES (:id, :code, :created_at, :used_at, :used_by_user_id)"
            ),
            {
                "id": code[0],
                "code": code[1],
                "created_at": code[2],
                "used_at": code[3],
                "used_by_user_id": new_user_id,
            },
        )

    # Recreate canvas_shares with Integer foreign key
    op.create_table(
        "canvas_shares",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("piece_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_canvas_shares_token", "canvas_shares", ["token"], unique=True)

    # Re-insert canvas_shares
    for share in canvas_shares:
        old_user_id = share[2]
        new_user_id = user_id_map.get(old_user_id)
        if new_user_id:
            conn.execute(
                sa.text(
                    "INSERT INTO canvas_shares (id, token, user_id, piece_number, title, created_at) "
                    "VALUES (:id, :token, :user_id, :piece_number, :title, :created_at)"
                ),
                {
                    "id": share[0],
                    "token": share[1],
                    "user_id": new_user_id,
                    "piece_number": share[3],
                    "title": share[4],
                    "created_at": share[5],
                },
            )
