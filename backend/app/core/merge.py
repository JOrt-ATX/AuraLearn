"""Deep merge for nested configuration (HR10)."""

from collections.abc import Mapping
from copy import deepcopy
from typing import Any


def deep_merge(base: Mapping[str, Any], override: Mapping[str, Any]) -> dict[str, Any]:
    """Merge ``override`` into ``base`` recursively and return a new dict.

    Mappings present on both sides are merged key by key, so a partial override never drops
    sibling keys (a shallow merge would). Any other value, lists included, replaces the base
    value. Neither input is modified.

    Args:
        base: The lower-priority configuration layer.
        override: The higher-priority configuration layer.

    Returns:
        A new dictionary holding the merged configuration.
    """
    merged: dict[str, Any] = deepcopy(dict(base))
    for key, value in override.items():
        current = merged.get(key)
        if isinstance(current, Mapping) and isinstance(value, Mapping):
            merged[key] = deep_merge(current, value)
        else:
            merged[key] = deepcopy(value)
    return merged
