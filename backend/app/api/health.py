from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.core.errors import ErrorResponse
from app.services import health as health_service

router = APIRouter(tags=["health"])


class StatusResponse(BaseModel):
    status: Literal["ok"]


# Public by design: orchestrators probe these without a session.
# Declared in tests/test_route_policy.py.
@router.get("/health", summary="Liveness probe")
async def health() -> StatusResponse:
    return StatusResponse(status="ok")


@router.get(
    "/ready",
    summary="Readiness probe (checks the database)",
    responses={503: {"model": ErrorResponse, "description": "Database unavailable"}},
)
async def ready(session: Annotated[AsyncSession, Depends(get_session)]) -> StatusResponse:
    await health_service.check_database(session)
    return StatusResponse(status="ok")
