"""Pure ASGI middleware: request context and access log, and security headers (RS-08)."""

import logging
import time
import uuid

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import SecurityHeadersConfig
from app.core.errors import internal_error_response
from app.core.logging import request_id_var

logger = logging.getLogger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware:
    """Assign a request id, log one access line, and turn escaped exceptions into a clean 500.

    The access line carries method, path and status only: never the query string, the headers
    or the body (RS-17).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        token = request_id_var.set(uuid.uuid4().hex)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id_var.get() or ""
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            logger.exception("unhandled error")
            if response_started:
                raise
            status = 500
            await internal_error_response()(scope, receive, send_wrapper)
        finally:
            logger.info(
                "request",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_var.reset(token)


class SecurityHeadersMiddleware:
    """Add the standard hardening headers to every response, errors and preflights included."""

    def __init__(self, app: ASGIApp, config: SecurityHeadersConfig) -> None:
        self.app = app
        self.headers = {
            "Content-Security-Policy": config.content_security_policy,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": config.referrer_policy,
            "Permissions-Policy": config.permissions_policy,
            "Cache-Control": "no-store",
        }
        if config.hsts_enabled:
            self.headers["Strict-Transport-Security"] = f"max-age={config.hsts_max_age_seconds}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.headers.items():
                    headers[name] = value
            await send(message)

        await self.app(scope, receive, send_wrapper)
