"""Deny by default (RS-04): a route must be declared here, or the build fails.

Phase 2 replaces this allowlist with the authorization framework: every route declares a role and
object policy and has an access-denied test. Until then the only routes are the public probes.

The route table is read from the OpenAPI schema (public API) because FastAPI's internal route
objects change between versions. Routes must therefore stay in the schema: never use
``include_in_schema=False`` on an endpoint.
"""

from fastapi import FastAPI

PUBLIC_ROUTES = {
    ("GET", "/api/health"),  # liveness probe
    ("GET", "/api/ready"),  # readiness probe
}


def test_every_route_is_explicitly_declared(app: FastAPI) -> None:
    declared = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }
    assert declared == PUBLIC_ROUTES, (
        "New route without an access policy. Declare it with a role/object policy "
        "(RS-04) or, if it is genuinely public, justify it in PUBLIC_ROUTES."
    )
