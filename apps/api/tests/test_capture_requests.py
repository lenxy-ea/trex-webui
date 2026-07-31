from __future__ import annotations

import pytest

from app.trex.capture_requests import (
    CAPTURE_BPF_MAX_CHARS,
    CaptureRequestValidationError,
    bounded_capture_int,
    normalize_capture_filter,
    normalize_capture_id,
    normalize_capture_mode,
)


def test_normalize_capture_id_rejects_invalid_values() -> None:
    with pytest.raises(CaptureRequestValidationError) as exc_info:
        normalize_capture_id(-1)

    assert exc_info.value.blocker == "capture_id_invalid"
    assert exc_info.value.error == "capture id must be a non-negative integer"


def test_bounded_capture_int_preserves_blocker_and_bounds() -> None:
    assert bounded_capture_int(2, 1, 3, "capture_limit_invalid", "limit") == 2

    with pytest.raises(CaptureRequestValidationError) as exc_info:
        bounded_capture_int(4, 1, 3, "capture_limit_invalid", "limit")

    assert exc_info.value.blocker == "capture_limit_invalid"
    assert exc_info.value.error == "limit must be an integer between 1 and 3"


def test_normalize_capture_filter_trims_and_rejects_unsafe_text() -> None:
    assert normalize_capture_filter(None) == ""
    assert normalize_capture_filter(" udp port 53 ") == "udp port 53"

    with pytest.raises(CaptureRequestValidationError) as exc_info:
        normalize_capture_filter("x" * (CAPTURE_BPF_MAX_CHARS + 1))

    assert exc_info.value.blocker == "capture_filter_invalid"
    assert exc_info.value.error == "BPF filter is too long"


def test_normalize_capture_mode_accepts_only_known_modes() -> None:
    assert normalize_capture_mode("fixed") == "fixed"
    assert normalize_capture_mode("cyclic") == "cyclic"

    with pytest.raises(CaptureRequestValidationError) as exc_info:
        normalize_capture_mode("rolling")

    assert exc_info.value.blocker == "capture_mode_invalid"
    assert exc_info.value.error == "mode must be fixed or cyclic"
