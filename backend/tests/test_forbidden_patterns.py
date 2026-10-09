import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_forbidden.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_forbidden", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_forbidden"] = module
    spec.loader.exec_module(module)
    return module


check = _load()


def codes(source: str) -> list[str]:
    return [problem.split()[1] for problem in check.check_source(source, "x.py")]


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("from __future__ import annotations\n", ["FP001"]),
        ("from __future__ import division\n", []),
        ("text = body[:200]\n", ["FP002"]),
        ("text = body[0:200]\n", ["FP002"]),
        ("text = body[:limit]\n", []),
        ("page = rows[10:20]\n", []),
        ("text = body[:200]  # hr6-ok: log label, not content\n", []),
        ("import time\ntime.sleep(1)\n", ["FP003"]),
        ("import asyncio\nawait_this = asyncio.sleep\n", []),
        ("max_iterations = 5\n", ["FP004"]),
        ("x = 1  # TODO: later\n", ["FP005"]),
        ("x = 'a TODO inside a string is not a comment'\n", []),
        ("x = 1\n", []),
    ],
)
def test_pattern_detection(source: str, expected: list[str]) -> None:
    assert codes(source) == expected


def test_the_application_code_is_clean() -> None:
    assert check.main([]) == 0
