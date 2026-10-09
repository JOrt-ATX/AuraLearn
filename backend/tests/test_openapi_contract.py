from pathlib import Path

from app.export_openapi import build_openapi, render

COMMITTED = Path(__file__).resolve().parents[1] / "openapi.json"


def test_committed_openapi_matches_the_code() -> None:
    """Regenerate with `python -m app.export_openapi openapi.json` and `npm run api:types`."""
    assert COMMITTED.read_text(encoding="utf-8") == render(build_openapi())
