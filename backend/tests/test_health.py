import httpx
from pydantic import SecretStr

from app.config import PlatformConfig, Settings
from app.main import create_app


async def test_health_is_ok(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_is_ok_with_database(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_returns_503_without_leaking_driver_details(config: PlatformConfig) -> None:
    unreachable = Settings(database_url=SecretStr("postgresql+asyncpg://u:hunter2@127.0.0.1:1/x"))
    app = create_app(config, unreachable)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"
    for secret in ("hunter2", "127.0.0.1", "asyncpg", "Traceback"):
        assert secret not in response.text
