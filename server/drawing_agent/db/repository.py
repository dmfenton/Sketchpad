"""Repository layer for database CRUD operations."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from drawing_agent.db.models import GalleryPiece, InviteCode, User, Workspace

# =============================================================================
# User Repository
# =============================================================================


async def create_user(
    session: AsyncSession,
    email: str,
    password_hash: str,
) -> User:
    """Create a new user."""
    user = User(email=email, password_hash=password_hash)
    session.add(user)
    await session.flush()
    return user


async def get_user_by_id(session: AsyncSession, user_id: int) -> User | None:
    """Get user by ID."""
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    """Get user by email."""
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def deactivate_user(session: AsyncSession, user_id: int) -> bool:
    """Deactivate a user account. Returns True if user existed."""
    user = await get_user_by_id(session, user_id)
    if user:
        user.is_active = False
        return True
    return False


# =============================================================================
# Invite Code Repository
# =============================================================================


async def create_invite_code(session: AsyncSession, code: str) -> InviteCode:
    """Create a new invite code."""
    invite = InviteCode(code=code)
    session.add(invite)
    await session.flush()
    return invite


async def get_invite_code(session: AsyncSession, code: str) -> InviteCode | None:
    """Get invite code by code string."""
    result = await session.execute(select(InviteCode).where(InviteCode.code == code))
    return result.scalar_one_or_none()


async def list_invite_codes(session: AsyncSession) -> list[InviteCode]:
    """List all invite codes, ordered by creation date."""
    result = await session.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    return list(result.scalars().all())


async def use_invite_code(
    session: AsyncSession,
    code: str,
    user_id: int,
) -> InviteCode | None:
    """Mark an invite code as used. Returns None if code doesn't exist or already used."""
    invite = await get_invite_code(session, code)
    if invite is None or invite.used_at is not None:
        return None
    invite.used_at = datetime.now(UTC)
    invite.used_by_user_id = user_id
    return invite


async def revoke_invite_code(session: AsyncSession, code: str) -> bool:
    """Delete an unused invite code. Returns True if code existed and was unused."""
    invite = await get_invite_code(session, code)
    if invite is None:
        return False
    if invite.used_at is not None:
        return False  # Don't revoke already-used codes
    await session.delete(invite)
    return True


# =============================================================================
# Workspace Repository
# =============================================================================


async def create_workspace(
    session: AsyncSession,
    user_id: int,
    canvas_state: dict[str, Any] | None = None,
) -> Workspace:
    """Create a new workspace for a user."""
    workspace = Workspace(user_id=user_id)
    if canvas_state is not None:
        workspace.canvas_state = canvas_state
    session.add(workspace)
    await session.flush()
    return workspace


async def get_workspace_by_id(session: AsyncSession, workspace_id: int) -> Workspace | None:
    """Get workspace by ID."""
    result = await session.execute(select(Workspace).where(Workspace.id == workspace_id))
    return result.scalar_one_or_none()


async def get_workspace_by_user_id(session: AsyncSession, user_id: int) -> Workspace | None:
    """Get workspace by user ID. Each user has one workspace."""
    result = await session.execute(select(Workspace).where(Workspace.user_id == user_id))
    return result.scalar_one_or_none()


async def get_or_create_workspace(session: AsyncSession, user_id: int) -> Workspace:
    """Get existing workspace or create a new one for the user."""
    workspace = await get_workspace_by_user_id(session, user_id)
    if workspace is None:
        workspace = await create_workspace(session, user_id)
    return workspace


async def update_workspace_canvas(
    session: AsyncSession,
    workspace_id: int,
    canvas_state: dict[str, Any],
) -> Workspace | None:
    """Update workspace canvas state."""
    workspace = await get_workspace_by_id(session, workspace_id)
    if workspace:
        workspace.canvas_state = canvas_state
    return workspace


async def update_workspace_agent_state(
    session: AsyncSession,
    workspace_id: int,
    *,
    status: str | None = None,
    notes: str | None = None,
    monologue: str | None = None,
    piece_count: int | None = None,
) -> Workspace | None:
    """Update workspace agent state fields."""
    workspace = await get_workspace_by_id(session, workspace_id)
    if workspace:
        if status is not None:
            workspace.status = status
        if notes is not None:
            workspace.notes = notes
        if monologue is not None:
            workspace.monologue = monologue
        if piece_count is not None:
            workspace.piece_count = piece_count
    return workspace


# =============================================================================
# Gallery Piece Repository
# =============================================================================


async def create_gallery_piece(
    session: AsyncSession,
    workspace_id: int,
    piece_number: int,
    strokes: list[dict[str, Any]],
) -> GalleryPiece:
    """Create a new gallery piece."""
    piece = GalleryPiece(
        workspace_id=workspace_id,
        piece_number=piece_number,
        strokes=strokes,
    )
    session.add(piece)
    await session.flush()
    return piece


async def get_gallery_piece(
    session: AsyncSession,
    workspace_id: int,
    piece_number: int,
) -> GalleryPiece | None:
    """Get a specific gallery piece."""
    result = await session.execute(
        select(GalleryPiece).where(
            GalleryPiece.workspace_id == workspace_id,
            GalleryPiece.piece_number == piece_number,
        )
    )
    return result.scalar_one_or_none()


async def list_gallery_pieces(
    session: AsyncSession,
    workspace_id: int,
) -> list[GalleryPiece]:
    """List all gallery pieces for a workspace, ordered by piece number."""
    result = await session.execute(
        select(GalleryPiece)
        .where(GalleryPiece.workspace_id == workspace_id)
        .order_by(GalleryPiece.piece_number)
    )
    return list(result.scalars().all())


async def delete_gallery_piece(
    session: AsyncSession,
    workspace_id: int,
    piece_number: int,
) -> bool:
    """Delete a gallery piece. Returns True if it existed."""
    piece = await get_gallery_piece(session, workspace_id, piece_number)
    if piece:
        await session.delete(piece)
        return True
    return False
