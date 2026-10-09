"""Forbidden-pattern gate for Python code (G1, HR6, HR18/HR19, RS-21).

Uses the ``ast`` module, never regular expressions (HR11): a pattern is judged by what the code
*is*, not by how it is spelled. Applies to application code under ``backend/app`` only.

Rules:
  FP001  ``from __future__ import annotations``: breaks FastAPI ``include_router()`` (RS-21).
  FP002  slicing a value with a literal upper bound, ``x[:200]`` (HR6: never truncate content).
         Suppress on a line that is NOT content with a trailing ``# hr6-ok: <reason>``.
  FP003  ``time.sleep()``: sleep loops and fixed waits in agentic code are forbidden (HR18/HR19).
  FP004  an identifier named ``max_iterations`` (a hard cap on an agentic loop, HR18/HR19).
  FP005  TODO / FIXME comments in committed code.

Usage: python scripts/check_forbidden.py [files...]   (default: every file under backend/app)
"""

import ast
import io
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "backend" / "app"
SUPPRESS_MARKER = "hr6-ok:"
DEBT_MARKERS = ("TODO", "FIXME")


def _is_literal_cut(node: ast.Subscript) -> bool:
    """True for ``x[:N]`` / ``x[0:N]`` where N is an integer literal."""
    index = node.slice
    if not isinstance(index, ast.Slice) or index.step is not None:
        return False
    starts_at_zero = index.lower is None or (
        isinstance(index.lower, ast.Constant) and index.lower.value == 0
    )
    return (
        starts_at_zero
        and isinstance(index.upper, ast.Constant)
        and isinstance(index.upper.value, int)
    )


def check_source(source: str, filename: str) -> list[str]:
    """Return one ``file:line CODE message`` string per violation."""
    tree = ast.parse(source, filename=filename)
    lines = source.splitlines()
    found: list[str] = []

    def report(node: ast.AST, code: str, message: str) -> None:
        found.append(f"{filename}:{getattr(node, 'lineno', 0)} {code} {message}")

    for node in ast.walk(tree):
        if (
            isinstance(node, ast.ImportFrom)
            and node.module == "__future__"
            and any(alias.name == "annotations" for alias in node.names)
        ):
            report(node, "FP001", "from __future__ import annotations is forbidden (RS-21)")
        elif isinstance(node, ast.Subscript) and _is_literal_cut(node):
            line = lines[node.lineno - 1] if node.lineno <= len(lines) else ""
            if SUPPRESS_MARKER not in line:
                report(
                    node,
                    "FP002",
                    f"literal truncation; summarize instead (HR6) or add '# {SUPPRESS_MARKER} why'",
                )
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "sleep"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "time"
        ):
            report(node, "FP003", "time.sleep() is forbidden; use the watchdog (HR18/HR19)")
        elif isinstance(node, ast.Name) and node.id == "max_iterations":
            report(node, "FP004", "hard iteration cap is forbidden; use a watchdog (HR18/HR19)")

    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT and any(m in token.string for m in DEBT_MARKERS):
            found.append(f"{filename}:{token.start[0]} FP005 TODO/FIXME comment in committed code")
    return found


def main(argv: list[str]) -> int:
    files = [Path(a) for a in argv] if argv else sorted(APP.rglob("*.py"))
    problems: list[str] = []
    for path in files:
        resolved = path.resolve()
        if resolved.suffix != ".py" or APP not in resolved.parents:
            continue
        problems.extend(check_source(resolved.read_text(encoding="utf-8"), str(path)))
    sys.stdout.write("".join(f"{p}\n" for p in problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
