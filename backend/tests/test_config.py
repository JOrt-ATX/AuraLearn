from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from app.config import Settings, load_platform_config, load_settings


def test_defaults_load_and_validate() -> None:
    config = load_platform_config()
    assert config.api.prefix == "/api"
    assert "*" not in config.cors.allowed_origins


def test_override_file_is_deep_merged_over_defaults(tmp_path: Path) -> None:
    override = tmp_path / "override.toml"
    override.write_text("[cors]\nmax_age_seconds = 5\n", encoding="utf-8")
    config = load_platform_config(override_file=override)
    assert config.cors.max_age_seconds == 5
    assert config.cors.allowed_origins  # sibling keys survive (HR10)


def test_in_memory_overrides_win_over_the_file(tmp_path: Path) -> None:
    override = tmp_path / "override.toml"
    override.write_text("[logging]\nlevel = 'DEBUG'\n", encoding="utf-8")
    config = load_platform_config(override, {"logging": {"level": "ERROR"}})
    assert config.logging.level == "ERROR"


def test_unknown_keys_fail_at_startup() -> None:
    with pytest.raises(ValidationError):
        load_platform_config(overrides={"cors": {"allowed_origin": ["http://x"]}})


@pytest.mark.parametrize("origin", ["*", "http://localhost/path", "localhost:3000", "ftp://x"])
def test_invalid_cors_origins_are_rejected(origin: str) -> None:
    with pytest.raises(ValidationError):
        load_platform_config(overrides={"cors": {"allowed_origins": [origin]}})


def test_missing_database_url_fails_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AURA_DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        load_settings()


def test_database_url_must_use_the_async_postgres_scheme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AURA_DATABASE_URL", "postgresql://u:p@h/db")
    with pytest.raises(ValidationError):
        load_settings()


def test_secret_is_not_exposed_by_repr_or_str() -> None:
    settings = Settings(database_url=SecretStr("postgresql+asyncpg://u:hunter2@h/db"))
    assert "hunter2" not in repr(settings)
    assert "hunter2" not in str(settings)
