import httpx

ALLOWED = "http://localhost:8080"


async def test_security_headers_are_present(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")
    headers = response.headers
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["Referrer-Policy"] == "no-referrer"
    assert headers["Cache-Control"] == "no-store"
    assert "Strict-Transport-Security" not in headers  # disabled until TLS exists (F8)


async def test_cors_allows_a_configured_origin_with_credentials(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/api/health", headers={"Origin": ALLOWED})
    assert response.headers["Access-Control-Allow-Origin"] == ALLOWED
    assert response.headers["Access-Control-Allow-Credentials"] == "true"


async def test_cors_does_not_allow_other_origins(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in response.headers


async def test_preflight_is_limited_to_configured_methods_and_headers(
    client: httpx.AsyncClient,
) -> None:
    response = await client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED,
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "X-CSRF-Token",
        },
    )
    assert response.status_code == 200
    assert "DELETE" in response.headers["Access-Control-Allow-Methods"]
    assert "X-Content-Type-Options" in response.headers  # preflights are hardened too

    rejected = await client.options(
        "/api/health",
        headers={"Origin": ALLOWED, "Access-Control-Request-Method": "TRACE"},
    )
    assert rejected.status_code == 400


async def test_swagger_ui_with_cdn_assets_is_not_served(client: httpx.AsyncClient) -> None:
    assert (await client.get("/docs")).status_code == 404
    assert (await client.get("/redoc")).status_code == 404
