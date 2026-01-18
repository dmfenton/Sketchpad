"""SQLAlchemy ORM models for Drawing Agent."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class User(Base):
    """User account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    gallery_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class InviteCode(Base):
    """Invite code for user registration."""

    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # Relationships
    used_by_user: Mapped["User | None"] = relationship("User")


class MagicLinkToken(Base):
    """Magic link token for passwordless authentication."""

    __tablename__ = "magic_link_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(10), nullable=False, default="app")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CanvasShare(Base):
    """Public share link for a canvas piece."""

    __tablename__ = "canvas_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    piece_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
