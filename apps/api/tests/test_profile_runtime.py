from app.trex.profile_runtime import (
    is_profile_no_streams_exception,
    is_profile_not_runnable_exception,
    profile_no_streams_error,
)
from app.trex.workbench_values import PROFILE_NO_STREAMS_ERROR


def test_profile_no_streams_error_lists_sorted_tunables() -> None:
    assert (
        profile_no_streams_error({"vm": "cached", "size": 1500, "flow": "fs"})
        == f"{PROFILE_NO_STREAMS_ERROR}; provided tunables: flow, size, vm"
    )


def test_profile_no_streams_error_reports_missing_tunables() -> None:
    assert (
        profile_no_streams_error({})
        == f"{PROFILE_NO_STREAMS_ERROR}; no tunables were provided"
    )


def test_profile_no_streams_exception_matches_none_profile_result() -> None:
    assert is_profile_no_streams_exception(
        AttributeError("'NoneType' object has no attribute 'get_streams'")
    )


def test_profile_not_runnable_exception_matches_non_profile_shapes() -> None:
    assert is_profile_not_runnable_exception(
        AttributeError("'object' object has no attribute 'get_streams'")
    )
    assert is_profile_not_runnable_exception(ValueError("from_json: missing field 'packet'"))


def test_profile_runtime_classifiers_do_not_match_unrelated_errors() -> None:
    exc = RuntimeError("port is down")
    assert not is_profile_no_streams_exception(exc)
    assert not is_profile_not_runnable_exception(exc)
