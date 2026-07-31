from __future__ import annotations

from dataclasses import dataclass
from typing import Any


PUBLIC_RESULT_DATA_REDACTED_BLOCKERS = frozenset(
    {
        "traffic_hard_stop_priority",
        "traffic_hard_stop_window_insufficient",
    }
)


@dataclass(frozen=True)
class TrexCallResult:
    ok: bool
    data: Any = None
    blocker: str | None = None
    error: str | None = None


def public_result_payload(result: TrexCallResult) -> dict[str, Any]:
    """Return the operator-facing envelope for a backend call result."""

    data = (
        None
        if not result.ok
        and result.blocker in PUBLIC_RESULT_DATA_REDACTED_BLOCKERS
        else result.data
    )
    return {
        "ok": result.ok,
        "data": data,
        "blocker": result.blocker,
        "error": result.error,
    }
