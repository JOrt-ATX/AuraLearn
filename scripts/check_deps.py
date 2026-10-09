"""Dependency gate (G3, G4, LLM03): existence, cooldown, exact pins and known vulnerabilities.

Reads frontend/package-lock.json and backend/uv.lock (the full transitive trees), so a young or
vulnerable transitive package cannot slip in. Cooldown exceptions must be listed in
docs/dependency-policy.json with the advisory they fix, and stale exceptions fail the check.

Standard library only, so it runs before any dependency is installed.
Usage: python scripts/check_deps.py
"""

import json
import sys
import tomllib
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
NPM_REGISTRY = "https://registry.npmjs.org"
PYPI_REGISTRY = "https://pypi.org/pypi"
OSV_BATCH = "https://api.osv.dev/v1/querybatch"
WORKERS = 12


@dataclass(frozen=True)
class Locked:
    ecosystem: str
    name: str
    version: str
    published: datetime | None = None


def _https(url: str) -> str:
    """Only HTTPS endpoints are ever contacted (no file: or custom schemes)."""
    if not url.startswith("https://"):
        raise ValueError(f"refusing non-HTTPS URL: {url}")
    return url


def _get_json(url: str) -> Any:
    request = urllib.request.Request(  # noqa: S310 - HTTPS enforced by _https
        _https(url), headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(request) as response:  # noqa: S310 - HTTPS enforced by _https
        return json.load(response)


def _post_json(url: str, payload: dict[str, Any]) -> Any:
    request = urllib.request.Request(  # noqa: S310 - HTTPS enforced by _https
        _https(url),
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:  # noqa: S310 - HTTPS enforced by _https
        return json.load(response)


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read_npm_lock(path: Path) -> list[Locked]:
    found: dict[tuple[str, str], Locked] = {}
    for key, entry in json.loads(path.read_text(encoding="utf-8"))["packages"].items():
        if not key or entry.get("link") or "version" not in entry:
            continue
        name = entry.get("name") or key.rsplit("node_modules/", 1)[-1]
        found[(name, entry["version"])] = Locked("npm", name, entry["version"])
    return list(found.values())


def read_uv_lock(path: Path) -> list[Locked]:
    found: list[Locked] = []
    for package in tomllib.loads(path.read_text(encoding="utf-8"))["package"]:
        if "registry" not in package.get("source", {}):
            continue
        stamps = [a["upload-time"] for a in package.get("wheels", []) if "upload-time" in a]
        if "sdist" in package and "upload-time" in package["sdist"]:
            stamps.append(package["sdist"]["upload-time"])
        published = min(_parse_time(s) for s in stamps) if stamps else None
        found.append(Locked("PyPI", package["name"], package["version"], published))
    return found


def check_pins() -> list[str]:
    """Every direct dependency must be an exact version (RS-20)."""
    problems: list[str] = []
    package = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    for section in ("dependencies", "devDependencies"):
        for name, spec in package.get(section, {}).items():
            if not spec[:1].isdigit() or not all(c.isdigit() or c == "." for c in spec):
                problems.append(f"frontend: {name} is not an exact version ({spec!r})")
    project = tomllib.loads((ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8"))
    specs = project["project"]["dependencies"] + project["dependency-groups"]["dev"]
    problems.extend(
        f"backend: {spec} is not pinned with '=='" for spec in specs if "==" not in spec
    )
    return problems


def resolve_npm(item: Locked, cache: dict[str, Any]) -> tuple[Locked, str | None]:
    """Return the item with its publish time, or a problem if it does not exist (G4)."""
    try:
        if item.name not in cache:
            cache[item.name] = _get_json(f"{NPM_REGISTRY}/{item.name.replace('/', '%2f')}")
        stamp = cache[item.name].get("time", {}).get(item.version)
        if not stamp or item.version not in cache[item.name].get("versions", {}):
            return item, f"npm {item.name}@{item.version} does not exist in the registry"
        return Locked(item.ecosystem, item.name, item.version, _parse_time(stamp)), None
    except urllib.error.URLError as error:
        return item, f"npm {item.name}@{item.version}: registry unreachable ({error})"


def resolve_pypi(item: Locked) -> tuple[Locked, str | None]:
    try:
        _get_json(f"{PYPI_REGISTRY}/{item.name}/{item.version}/json")
    except urllib.error.URLError as error:
        return item, f"PyPI {item.name}=={item.version} not found or unreachable ({error})"
    if item.published is None:
        return item, f"PyPI {item.name}=={item.version} has no upload time in uv.lock"
    return item, None


def vulnerable(items: list[Locked]) -> dict[Locked, list[str]]:
    result: dict[Locked, list[str]] = {}
    for start in range(0, len(items), 500):
        chunk = items[start : start + 500]
        queries = [
            {"package": {"name": i.name, "ecosystem": i.ecosystem}, "version": i.version}
            for i in chunk
        ]
        for item, answer in zip(
            chunk, _post_json(OSV_BATCH, {"queries": queries})["results"], strict=True
        ):
            if answer.get("vulns"):
                result[item] = [v["id"] for v in answer["vulns"]]
    return result


def main() -> int:
    policy = json.loads((ROOT / "docs" / "dependency-policy.json").read_text(encoding="utf-8"))
    cooldown_days: int = policy["cooldown_days"]
    exceptions = {(e["ecosystem"], e["name"], e["version"]): e for e in policy["exceptions"]}
    now = datetime.now(UTC)
    problems = check_pins()

    npm_items = read_npm_lock(ROOT / "frontend" / "package-lock.json")
    py_items = read_uv_lock(ROOT / "backend" / "uv.lock")
    cache: dict[str, Any] = {}
    with ThreadPoolExecutor(WORKERS) as pool:
        resolved_npm = list(pool.map(lambda i: resolve_npm(i, cache), npm_items))
        resolved_py = list(pool.map(resolve_pypi, py_items))
    resolved: list[Locked] = []
    for item, problem in resolved_npm + resolved_py:
        if problem:
            problems.append(problem)
        resolved.append(item)

    used: set[tuple[str, str, str]] = set()
    for item in resolved:
        if item.published is None:
            continue
        age_days = (now - item.published).days
        key = (item.ecosystem, item.name, item.version)
        if age_days < cooldown_days:
            if key in exceptions:
                used.add(key)
            else:
                problems.append(
                    f"{item.ecosystem} {item.name}@{item.version} is {age_days} days old "
                    f"(cooldown {cooldown_days}) and has no recorded exception"
                )
    for key in exceptions.keys() - {(i.ecosystem, i.name, i.version) for i in resolved}:
        problems.append(f"stale exception, not in any lockfile: {key}")
    for key in exceptions.keys() - used:
        problems.append(f"exception no longer needed (already past the cooldown): {key}")

    for item, ids in vulnerable(resolved).items():
        problems.append(
            f"{item.ecosystem} {item.name}@{item.version} has known vulnerabilities: "
            f"{', '.join(ids)}"
        )

    lines = [
        f"checked {len(npm_items)} npm and {len(py_items)} PyPI locked packages "
        f"(cooldown {cooldown_days} days, {len(used)} security exceptions in use)",
        *(f"FAIL {problem}" for problem in problems),
    ]
    sys.stdout.write("\n".join(lines) + "\n")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
