import os
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from app.config import PlatformConfig, Settings, load_platform_config
from app.main import create_app


@pytest.fixture(scope="session")
def database_url() -> str:
    """Database for integration tests; failing (not skipping) keeps the gap visible (HR7)."""
    url = os.environ.get("AURA_TEST_DATABASE_URL")
    if not url:
        pytest.fail(
            "AURA_TEST_DATABASE_URL is not set. Start the database "
            "(docker compose up -d db) and point it at a throwaway database."
        )
    return url


@pytest.fixture
def config() -> PlatformConfig:
    return load_platform_config(overrides={"app": {"environment": "test"}})


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(database_url=SecretStr(database_url))


@pytest.fixture
async def app(config: PlatformConfig, settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(config, settings)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
