from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.trex.workbench_values import PROFILE_NO_STREAMS_ERROR


def profile_no_streams_error(tunables: Mapping[str, Any]) -> str:
    if tunables:
        keys = ", ".join(sorted(str(key) for key in tunables))
        return f"{PROFILE_NO_STREAMS_ERROR}; provided tunables: {keys}"
    return f"{PROFILE_NO_STREAMS_ERROR}; no tunables were provided"


def is_profile_no_streams_exception(exc: Exception) -> bool:
    return "'NoneType' object has no attribute 'get_streams'" in str(exc)


def is_profile_not_runnable_exception(exc: Exception) -> bool:
    error_text = str(exc)
    return (
        "object has no attribute 'get_streams'" in error_text
        or "from_json: missing field 'packet'" in error_text
    )
