"""Filesystem persistence helpers for workspace state."""

from __future__ import annotations

import re
from pathlib import Path as FilePath

import aiofiles
import aiofiles.os

from code_monet.config import settings

# UUID validation pattern
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def get_base_dir() -> FilePath:
    """Get the base directory for user workspaces, resolved relative to server dir."""
    server_dir = FilePath(__file__).parent.parent.parent
    return (server_dir / settings.workspace_base_dir).resolve()


def validate_user_id(user_id: str) -> None:
    """Validate user_id is a valid UUID string (path traversal protection).

    Raises:
        ValueError: If user_id is not a valid UUID format.
    """
    if not isinstance(user_id, str) or not UUID_PATTERN.match(user_id):
        raise ValueError(f"Invalid user_id (must be UUID): {user_id}")


def get_user_dir(user_id: str) -> FilePath:
    """Get the directory path for a user's workspace.

    Args:
        user_id: User's UUID string.

    Returns:
        Resolved path to user's workspace directory.

    Raises:
        ValueError: If user_id is invalid or path traversal detected.
    """
    validate_user_id(user_id)
    base_dir = get_base_dir()
    user_dir = (base_dir / str(user_id)).resolve()

    # Ensure path stays within base directory (path traversal protection)
    if not str(user_dir).startswith(str(base_dir)):
        raise ValueError(f"Invalid user directory path for user {user_id}")

    return user_dir


async def ensure_user_dirs(user_dir: FilePath) -> None:
    """Create user workspace directories if they don't exist."""
    await aiofiles.os.makedirs(user_dir, exist_ok=True)
    await aiofiles.os.makedirs(user_dir / "gallery", exist_ok=True)


async def atomic_write(file_path: FilePath, data: str) -> None:
    """Write data to file atomically using temp file + rename.

    Args:
        file_path: Target file path.
        data: String data to write.
    """
    temp_file = file_path.with_suffix(file_path.suffix + ".tmp")
    async with aiofiles.open(temp_file, "w") as f:
        await f.write(data)
    # Atomic rename (on POSIX systems)
    await aiofiles.os.replace(temp_file, file_path)
