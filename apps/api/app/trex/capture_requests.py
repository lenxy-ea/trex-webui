from __future__ import annotations

from dataclasses import dataclass


CAPTURE_MODES = {"fixed", "cyclic"}
CAPTURE_BPF_MAX_CHARS = 1024
CAPTURE_LIMIT_MAX = 10_000
CAPTURE_FETCH_COUNT_MAX = 10_000
CAPTURE_FETCH_LIMIT_MAX = 1_000
CAPTURE_FETCH_BYTES_MAX = 16_000_000
CAPTURE_SNAPLEN_MAX = 65_535


@dataclass(frozen=True)
class CaptureRequestValidationError(Exception):
    blocker: str
    error: str


def normalize_capture_id(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CaptureRequestValidationError("capture_id_invalid", "capture id must be a non-negative integer")
    return value


def bounded_capture_int(value: object, minimum: int, maximum: int, blocker: str, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum or value > maximum:
        raise CaptureRequestValidationError(blocker, f"{label} must be an integer between {minimum} and {maximum}")
    return value


def normalize_capture_filter(value: object) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or "\x00" in value:
        raise CaptureRequestValidationError("capture_filter_invalid", "BPF filter must be clean text")
    candidate = value.strip()
    if len(candidate) > CAPTURE_BPF_MAX_CHARS:
        raise CaptureRequestValidationError("capture_filter_invalid", "BPF filter is too long")
    return candidate


def normalize_capture_mode(value: object) -> str:
    if value not in CAPTURE_MODES:
        raise CaptureRequestValidationError("capture_mode_invalid", "mode must be fixed or cyclic")
    return str(value)
