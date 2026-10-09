from app.core.merge import deep_merge


def test_nested_override_keeps_sibling_keys() -> None:
    base = {"cors": {"allowed_origins": ["a"], "max_age_seconds": 600}, "level": "INFO"}
    merged = deep_merge(base, {"cors": {"max_age_seconds": 5}})
    assert merged == {"cors": {"allowed_origins": ["a"], "max_age_seconds": 5}, "level": "INFO"}


def test_a_shallow_merge_would_have_dropped_the_sibling() -> None:
    base = {"cors": {"allowed_origins": ["a"], "max_age_seconds": 600}}
    shallow: dict[str, dict[str, object]] = {**base, **{"cors": {"max_age_seconds": 5}}}
    assert "allowed_origins" not in shallow["cors"]
    deep = deep_merge(base, {"cors": {"max_age_seconds": 5}})
    assert deep["cors"]["allowed_origins"] == ["a"]


def test_lists_and_scalars_are_replaced() -> None:
    merged = deep_merge({"a": [1, 2], "b": 1, "c": {"x": 1}}, {"a": [3], "b": {"y": 2}, "c": 5})
    assert merged == {"a": [3], "b": {"y": 2}, "c": 5}


def test_inputs_are_not_modified_and_results_are_independent() -> None:
    base = {"a": {"b": [1]}}
    override = {"a": {"c": {"d": 1}}}
    merged = deep_merge(base, override)
    merged["a"]["b"].append(2)
    merged["a"]["c"]["d"] = 9
    assert base == {"a": {"b": [1]}}
    assert override == {"a": {"c": {"d": 1}}}
