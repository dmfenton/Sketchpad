"""Async SQLAlchemy engine and session management."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from code_monet.config import settings


def create_engine_instance() -> AsyncEngine:
    """Create async SQLAlchemy engine.

    SQLite with aiosqlite requires special pooling configuration
    since SQLite doesn't support concurrent connections well.
    """
    connect_args: dict[str, bool] = {}
    poolclass = None

    if settings.database_url.startswith("sqlite"):
        # SQLite-specific settings
        connect_args = {"check_same_thread": False}
        poolclass = StaticPool

    return create_async_engine(
        settings.database_url,
        echo=settings.database_echo,
        connect_args=connect_args,
        poolclass=poolclass,
    )


engine = create_engine_instance()

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional scope for database operations."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
