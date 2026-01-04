"""Repository layer for database CRUD operations."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from drawing_agent.db.models import InviteCode, MagicLinkToken, User

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
# Magic Link Token Repository
# =============================================================================


async def create_magic_link_token(
    session: AsyncSession,
    token: str,
    code: str,
    email: str,
    expires_at: datetime,
) -> MagicLinkToken:
    """Create a new magic link token with verification code."""
    magic_link = MagicLinkToken(token=token, code=code, email=email, expires_at=expires_at)
    session.add(magic_link)
    await session.flush()
    return magic_link


async def get_magic_link_token(session: AsyncSession, token: str) -> MagicLinkToken | None:
    """Get magic link token by token string."""
    result = await session.execute(select(MagicLinkToken).where(MagicLinkToken.token == token))
    return result.scalar_one_or_none()


async def use_magic_link_token(session: AsyncSession, token: str) -> MagicLinkToken | None:
    """Mark a magic link token as used. Returns None if token doesn't exist, expired, or already used."""
    magic_link = await get_magic_link_token(session, token)
    if magic_link is None:
        return None
    if magic_link.used_at is not None:
        return None  # Already used
    if magic_link.expires_at < datetime.now(UTC):
        return None  # Expired
    magic_link.used_at = datetime.now(UTC)
    return magic_link


async def get_magic_link_by_code(
    session: AsyncSession, email: str, code: str
) -> MagicLinkToken | None:
    """Get magic link token by email and code."""
    result = await session.execute(
        select(MagicLinkToken).where(
            MagicLinkToken.email == email,
            MagicLinkToken.code == code,
        )
    )
    return result.scalar_one_or_none()


async def use_magic_link_code(
    session: AsyncSession, email: str, code: str
) -> MagicLinkToken | None:
    """Mark a magic link token as used by code. Returns None if not found, expired, or already used."""
    magic_link = await get_magic_link_by_code(session, email, code)
    if magic_link is None:
        return None
    if magic_link.used_at is not None:
        return None  # Already used
    if magic_link.expires_at < datetime.now(UTC):
        return None  # Expired
    magic_link.used_at = datetime.now(UTC)
    return magic_link


async def cleanup_expired_magic_links(session: AsyncSession) -> int:
    """Delete expired magic link tokens. Returns count of deleted tokens."""
    from sqlalchemy import delete

    result = await session.execute(
        delete(MagicLinkToken).where(MagicLinkToken.expires_at < datetime.now(UTC))
    )
    return result.rowcount
