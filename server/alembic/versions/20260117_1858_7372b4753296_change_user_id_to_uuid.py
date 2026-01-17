"""change_user_id_to_uuid

Revision ID: 7372b4753296
Revises: 005
Create Date: 2026-01-17 18:58:10.425388

"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7372b4753296"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Change user id from INTEGER to UUID (String(36))."""
    conn = op.get_bind()

    # Get existing users with their integer IDs
    users = conn.execute(
        sa.text("SELECT id, email, password_hash, is_active, created_at FROM users")
    ).fetchall()

    # Build mapping from old int ID to new UUID
    id_mapping = {row[0]: str(uuid4()) for row in users}

    # Create new users table with String(36) id
    op.create_table(
        "users_new",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_new_email", "users_new", ["email"], unique=True)

    # Copy users with new UUIDs
    for row in users:
        old_id, email, password_hash, is_active, created_at = row
        new_id = id_mapping[old_id]
        conn.execute(
            sa.text(
                "INSERT INTO users_new (id, email, password_hash, is_active, created_at) VALUES (:id, :email, :password_hash, :is_active, :created_at)"
            ),
            {
                "id": new_id,
                "email": email,
                "password_hash": password_hash,
                "is_active": is_active,
                "created_at": created_at,
            },
        )

    # Update foreign keys in invite_codes (created_by)
    for old_id, new_id in id_mapping.items():
        conn.execute(
            sa.text("UPDATE invite_codes SET created_by = :new_id WHERE created_by = :old_id"),
            {"new_id": new_id, "old_id": str(old_id)},
        )

    # Update foreign keys in canvas_shares (user_id)
    for old_id, new_id in id_mapping.items():
        conn.execute(
            sa.text("UPDATE canvas_shares SET user_id = :new_id WHERE user_id = :old_id"),
            {"new_id": new_id, "old_id": str(old_id)},
        )

    # Drop old table and rename new
    op.drop_index("ix_users_email", "users")
    op.drop_table("users")
    op.rename_table("users_new", "users")
    op.drop_index("ix_users_new_email", "users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    """Revert to INTEGER id - data loss warning for UUIDs."""
    # This would lose the UUID values - not recommended
    raise NotImplementedError("Downgrade not supported - would lose UUID data")
