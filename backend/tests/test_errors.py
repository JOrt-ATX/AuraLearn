import json
import logging

import httpx
import pytest
from fastapi import FastAPI
from pydantic import BaseModel

from app.core.errors import ConflictError
from app.core.logging import JsonFormatter


class _Payload(BaseModel):
    name: str


@pytest.fixture
def probe_app(app: FastAPI) -> FastAPI:
    @app.get("/probe/boom")
    async def boom() -> None:
        raise RuntimeError("internal detail: password=hunter2")

    @app.get("/probe/conflict")
    async def conflict() -> None:
        raise ConflictError

    @app.post("/probe/body")
    async def body(payload: _Payload) -> _Payload:
        return payload

    return app


async def test_unknown_route_uses_the_error_envelope(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/nope")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "not_found"
    assert error["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.usefixtures("probe_app")
async def test_business_errors_keep_their_code(client: httpx.AsyncClient) -> None:
    response = await client.get("/probe/conflict")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


@pytest.mark.usefixtures("probe_app")
async def test_validation_errors_do_not_echo_the_submitted_input(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/probe/body", json={"name": 123, "secret": "s3cr3t-value"})
    assert response.status_code == 422
    assert "s3cr3t-value" not in response.text
    assert "input" not in response.text
    assert response.json()["error"]["fields"] == [{"loc": "body.name", "type": "string_type"}]


@pytest.mark.usefixtures("probe_app")
async def test_unhandled_errors_are_generic_logged_and_still_hardened(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR):
        response = await client.get("/probe/boom")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "hunter2" not in response.text
    assert "RuntimeError" not in response.text
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Request-ID"]
    assert any(record.exc_info for record in caplog.records)  # the detail is logged server side


@pytest.mark.usefixtures("probe_app")
async def test_access_log_has_no_query_string_and_is_json(
    client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.access"):
        await client.get("/api/health?token=abc123")
    record = next(r for r in caplog.records if r.name == "app.access")
    line = json.loads(JsonFormatter().format(record))
    assert line["path"] == "/api/health"
    assert line["status"] == 200
    assert "abc123" not in json.dumps(line)
