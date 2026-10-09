import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND = Path(__file__).resolve().parents[1]


def _config() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    return cfg


async def _scalar(url: str, sql: str) -> object:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            return (await connection.execute(text(sql))).scalar()
    finally:
        await engine.dispose()


def test_base_migration_enables_pgvector_and_is_reversible(
    database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AURA_DATABASE_URL", database_url)
    ext = "SELECT count(*) FROM pg_extension WHERE extname = 'vector'"

    command.upgrade(_config(), "head")
    assert asyncio.run(_scalar(database_url, ext)) == 1
    assert asyncio.run(_scalar(database_url, "SELECT version_num FROM alembic_version")) == "0001"

    command.downgrade(_config(), "base")
    assert asyncio.run(_scalar(database_url, ext)) == 0

    command.upgrade(_config(), "head")
    assert asyncio.run(_scalar(database_url, ext)) == 1
