"""Async engine and session factory (SQLAlchemy 2.0 + asyncpg)."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import DatabaseConfig


def create_engine(database_url: str, config: DatabaseConfig) -> AsyncEngine:
    """Create the pooled async engine.

    ``hide_parameters`` keeps bound values (possibly personal data) out of SQLAlchemy error
    messages and therefore out of the logs (RS-17).
    """
    return create_async_engine(
        database_url,
        pool_size=config.pool_size,
        max_overflow=config.max_overflow,
        pool_pre_ping=config.pool_pre_ping,
        hide_parameters=True,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Build the session factory bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_scope(factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """Yield one session per unit of work and always close it."""
    async with factory() as session:
        yield session
