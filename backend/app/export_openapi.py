"""Write the OpenAPI document to a file: ``python -m app.export_openapi openapi.json``.

The frontend generates its typed API client from this file (RNF-04), and a test fails when the
committed copy no longer matches the code, so the contract cannot drift silently.
"""

import json
import sys
from pathlib import Path
from typing import Any

from pydantic import SecretStr

from app.config import Settings, load_platform_config
from app.main import create_app


def build_openapi() -> dict[str, Any]:
    """Build the schema without a database: the lifespan (and so the engine) never runs."""
    settings = Settings(database_url=SecretStr("postgresql+asyncpg://openapi:unused@localhost/unused"))
    return create_app(load_platform_config(), settings).openapi()


def render(schema: dict[str, Any]) -> str:
    """Serialise deterministically so diffs only show real contract changes."""
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m app.export_openapi <output.json>")
    Path(sys.argv[1]).write_text(render(build_openapi()), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
