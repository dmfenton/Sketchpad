"""SQLAlchemy ORM models for Drawing Agent."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class User(Base):
    """User account."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace", back_populates="user", cascade="all, delete-orphan"
    )


class InviteCode(Base):
    """Invite code for user registration."""

    __tablename__ = "invite_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    used_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    # Relationships
    used_by_user: Mapped["User | None"] = relationship("User")


class Workspace(Base):
    """User workspace containing canvas state and notes."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # Canvas state stored as JSON
    # Structure: {"width": 800, "height": 600, "strokes": [...]}
    canvas_state: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=lambda: {"width": 800, "height": 600, "strokes": []},
        nullable=False,
    )

    # Agent state
    status: Mapped[str] = mapped_column(String(20), default="paused", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    monologue: Mapped[str] = mapped_column(Text, default="", nullable=False)
    piece_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="workspaces")
    gallery_pieces: Mapped[list["GalleryPiece"]] = relationship(
        "GalleryPiece", back_populates="workspace", cascade="all, delete-orphan"
    )


class GalleryPiece(Base):
    """Saved artwork in the gallery."""

    __tablename__ = "gallery_pieces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workspaces.id"), nullable=False, index=True
    )

    # Piece number within this workspace
    piece_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Strokes stored as JSON array
    strokes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="gallery_pieces"
    )
