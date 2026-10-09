"""Application configuration.

Two sources, validated at startup (RS-12):

* ``PlatformConfig``: non-secret, tunable settings loaded from ``config/defaults.toml`` and
  deep-merged with optional layers (HR10). The models carry no defaults on purpose: nothing
  tunable is hidden in code (HR0/HR8).
* ``Settings``: secrets and bootstrap values, read only from ``AURA_*`` environment variables.
"""

import tomllib
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.merge import deep_merge

DEFAULTS_PATH = Path(__file__).resolve().parents[1] / "config" / "defaults.toml"


class _StrictModel(BaseModel):
    """Rejects unknown keys so a typo in a config layer fails at startup."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class AppConfig(_StrictModel):
    name: str
    environment: Literal["development", "test", "production"]


class ServerConfig(_StrictModel):
    host: str
    port: int = Field(ge=1, le=65535)


class ApiConfig(_StrictModel):
    prefix: str
    openapi_enabled: bool

    @field_validator("prefix")
    @classmethod
    def _prefix_shape(cls, value: str) -> str:
        if not value.startswith("/") or value.endswith("/"):
            raise ValueError("prefix must start with '/' and must not end with '/'")
        return value


class LoggingConfig(_StrictModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class DatabaseConfig(_StrictModel):
    pool_size: int = Field(ge=1)
    max_overflow: int = Field(ge=0)
    pool_pre_ping: bool


class CorsConfig(_StrictModel):
    allowed_origins: list[str]
    allowed_methods: list[str]
    allowed_headers: list[str]
    max_age_seconds: int = Field(ge=0)

    @field_validator("allowed_origins")
    @classmethod
    def _origins_are_explicit(cls, value: list[str]) -> list[str]:
        """Cookies are credentialed, so wildcards and path-bearing origins are refused."""
        for origin in value:
            parts = urlsplit(origin)
            if parts.scheme not in {"http", "https"} or not parts.netloc or parts.path:
                raise ValueError(f"invalid CORS origin: {origin!r}")
        return value


class SecurityHeadersConfig(_StrictModel):
    content_security_policy: str
    referrer_policy: str
    permissions_policy: str
    hsts_enabled: bool
    hsts_max_age_seconds: int = Field(ge=0)


class PlatformConfig(_StrictModel):
    app: AppConfig
    server: ServerConfig
    api: ApiConfig
    logging: LoggingConfig
    database: DatabaseConfig
    cors: CorsConfig
    security_headers: SecurityHeadersConfig


class Settings(BaseSettings):
    """Secrets and bootstrap values; never logged and never returned by the API (RS-12)."""

    model_config = SettingsConfigDict(env_prefix="AURA_", extra="ignore")

    database_url: SecretStr
    config_file: Path | None = None

    @field_validator("database_url")
    @classmethod
    def _async_postgres_only(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith("postgresql+asyncpg://"):
            raise ValueError("database_url must use the postgresql+asyncpg:// scheme")
        return value


def _read_toml(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_platform_config(
    override_file: Path | None = None,
    overrides: Mapping[str, Any] | None = None,
) -> PlatformConfig:
    """Load defaults and deep-merge every higher-priority layer on top of them.

    Args:
        override_file: Optional TOML file (``AURA_CONFIG_FILE``) merged over the defaults.
        overrides: Optional mapping merged last; the admin console layer (F3) plugs in here.

    Returns:
        The validated, immutable platform configuration.

    Raises:
        pydantic.ValidationError: If the merged configuration is invalid or has unknown keys.
    """
    merged = _read_toml(DEFAULTS_PATH)
    if override_file is not None:
        merged = deep_merge(merged, _read_toml(override_file))
    if overrides is not None:
        merged = deep_merge(merged, overrides)
    return PlatformConfig.model_validate(merged)


def load_settings() -> Settings:
    """Read and validate the environment settings."""
    return Settings()
