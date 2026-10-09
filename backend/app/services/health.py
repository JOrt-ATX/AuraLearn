"""Readiness checks."""

import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ServiceUnavailableError

logger = logging.getLogger(__name__)


async def check_database(session: AsyncSession) -> None:
    """Verify the database answers; raise ``ServiceUnavailableError`` otherwise.

    The driver error is logged server side and never reaches the client (RS-17).
    """
    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        logger.exception("database readiness check failed")
        raise ServiceUnavailableError from None
