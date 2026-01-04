#!/usr/bin/env python3
"""Database utilities for local development and server management.

Usage:
    # Create a user locally
    uv run python scripts/db_utils.py create-user EMAIL PASSWORD

    # Generate password hash (for manual DB insert)
    uv run python scripts/db_utils.py hash-password PASSWORD

    # List users
    uv run python scripts/db_utils.py list-users
"""

import asyncio
import sys
from pathlib import Path

# Add server to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "server"))


def hash_password_cmd(password: str) -> None:
    """Generate a bcrypt hash for a password."""
    from drawing_agent.auth.password import hash_password

    hashed = hash_password(password)
    print(f"Password hash: {hashed}")
    print(f"\nTo insert via sqlite3:")
    print(f"sqlite3 data/drawing_agent.db \"INSERT INTO users (email, password_hash, is_active, created_at) VALUES ('EMAIL', '{hashed}', 1, datetime('now'));\"")


async def create_user_async(email: str, password: str) -> None:
    """Create a user in the database."""
    from drawing_agent.auth.password import hash_password
    from drawing_agent.db import get_session, repository

    async with get_session() as session:
        existing = await repository.get_user_by_email(session, email)
        if existing:
            print(f"User already exists: id={existing.id}")
            return
        user = await repository.create_user(session, email, hash_password(password))
        print(f"Created user: {user.email} (id={user.id})")


async def list_users_async() -> None:
    """List all users in the database."""
    from drawing_agent.db import get_session
    from sqlalchemy import text

    async with get_session() as session:
        result = await session.execute(text("SELECT id, email, is_active, created_at FROM users"))
        users = result.fetchall()

        if not users:
            print("No users found")
            return

        print(f"{'ID':<5} {'Email':<30} {'Active':<8} {'Created'}")
        print("-" * 70)
        for user in users:
            print(f"{user[0]:<5} {user[1]:<30} {user[2]:<8} {user[3]}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "create-user":
        if len(sys.argv) < 3:
            print("Usage: db_utils.py create-user EMAIL [PASSWORD]")
            sys.exit(1)
        email = sys.argv[2]
        if len(sys.argv) < 4:
            print("Usage: db_utils.py create-user EMAIL PASSWORD")
            sys.exit(1)
        password = sys.argv[3]
        asyncio.run(create_user_async(email, password))

    elif cmd == "hash-password":
        if len(sys.argv) < 3:
            print("Usage: db_utils.py hash-password PASSWORD")
            sys.exit(1)
        hash_password_cmd(sys.argv[2])

    elif cmd == "list-users":
        asyncio.run(list_users_async())

    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
