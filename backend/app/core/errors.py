"""Central error handling (RS-17).

The client only ever receives a stable ``code`` (the frontend localizes it, HR15), a generic
message and the request id. Internals, stack traces and submitted input are logged server side
and never returned.
"""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var

_CODE_BY_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "too_many_requests",
    500: "internal_error",
    503: "service_unavailable",
}


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    fields: list[dict[str, str]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class AppError(Exception):
    """Business error with a stable code; subclasses fix the HTTP status."""

    status_code = HTTPStatus.INTERNAL_SERVER_ERROR
    code = "internal_error"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or HTTPStatus(self.status_code).phrase
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = HTTPStatus.NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    status_code = HTTPStatus.CONFLICT
    code = "conflict"


class ServiceUnavailableError(AppError):
    status_code = HTTPStatus.SERVICE_UNAVAILABLE
    code = "service_unavailable"


def error_response(
    status: int,
    code: str,
    message: str,
    fields: list[dict[str, str]] | None = None,
) -> JSONResponse:
    """Build the single error envelope used by every failure path."""
    body = ErrorResponse(
        error=ErrorDetail(
            code=code,
            message=message,
            request_id=request_id_var.get(),
            fields=fields,
        )
    )
    return JSONResponse(status_code=status, content=jsonable_encoder(body, exclude_none=True))


def internal_error_response() -> JSONResponse:
    """Generic 500, sent by the context middleware for any exception that escapes the handlers."""
    return error_response(500, "internal_error", HTTPStatus.INTERNAL_SERVER_ERROR.phrase)


async def _app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AppError):  # pragma: no cover - guarded by registration
        raise exc
    return error_response(int(exc.status_code), exc.code, exc.message)


async def _http_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # pragma: no cover - guarded by registration
        raise exc
    code = _CODE_BY_STATUS.get(exc.status_code, f"http_{exc.status_code}")
    return error_response(exc.status_code, code, HTTPStatus(exc.status_code).phrase)


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):  # pragma: no cover - guarded by registration
        raise exc
    # Only location and type: pydantic's "input" would echo what the client submitted.
    fields = [
        {"loc": ".".join(str(part) for part in err["loc"]), "type": str(err["type"])}
        for err in exc.errors()
    ]
    return error_response(422, "validation_error", HTTPStatus.UNPROCESSABLE_ENTITY.phrase, fields)


def register_error_handlers(app: FastAPI) -> None:
    """Install the handlers so every error leaves through the same envelope."""
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
