"""Repository layer for database CRUD operations."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from drawing_agent.db.models import InviteCode, User

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
