"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import PlatformConfig, Settings, load_platform_config, load_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.db.session import create_engine, create_session_factory


def create_app(config: PlatformConfig | None = None, settings: Settings | None = None) -> FastAPI:
    """Build the application; configuration is validated here, so a bad setup fails at startup."""
    settings = settings or load_settings()
    config = config or load_platform_config(settings.config_file)
    configure_logging(config.logging.level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url.get_secret_value(), config.database)
        app.state.session_factory = create_session_factory(engine)
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(
        title=config.app.name,
        lifespan=lifespan,
        docs_url=None,  # Swagger UI loads assets from a CDN: forbidden (RS-09).
        redoc_url=None,
        openapi_url=f"{config.api.prefix}/openapi.json" if config.api.openapi_enabled else None,
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=config.api.prefix)

    # add_middleware wraps the previous ones: the last one added runs first.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors.allowed_origins,
        allow_methods=config.cors.allowed_methods,
        allow_headers=config.cors.allowed_headers,
        allow_credentials=True,
        max_age=config.cors.max_age_seconds,
    )
    app.add_middleware(SecurityHeadersMiddleware, config=config.security_headers)
    return app
