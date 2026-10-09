"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_scope


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Provide a database session bound to the application's engine."""
    async for session in session_scope(request.app.state.session_factory):
        yield session
