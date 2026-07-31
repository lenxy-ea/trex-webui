#!/usr/bin/env python3.11
"""Strict readiness contract for the real-TRex system overview."""

from __future__ import annotations

import json
import sys


MAX_RESPONSE_BYTES = 1024 * 1024


def strict_load(content: bytes) -> object:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                fail(f"response contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        fail(f"response contains non-finite value {value}")

    try:
        return json.loads(
            content,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except (json.JSONDecodeError, UnicodeError) as exc:
        fail(f"response is not valid JSON: {exc}")


def fail(message: str) -> None:
    raise SystemExit(f"TRex overview contract failed: {message}")


def successful_result(root: object, field: str) -> dict[str, object]:
    if not isinstance(root, dict):
        fail("response root is not an object")
    result = root.get(field)
    if not isinstance(result, dict):
        fail(f"{field} is missing or is not an object")
    if result.get("ok") is not True:
        fail(f"{field}.ok is not true")
    if result.get("blocker") not in {None, ""}:
        fail(f"{field}.blocker is present")
    if result.get("error") not in {None, ""}:
        fail(f"{field}.error is present")
    return result


def validate(payload: object) -> None:
    successful_result(payload, "trex_probe")
    ports_result = successful_result(payload, "trex_ports")
    data = ports_result.get("data")
    if not isinstance(data, dict):
        fail("trex_ports.data is missing or is not an object")
    port_ids = data.get("port_ids")
    if (
        not isinstance(port_ids, list)
        or not port_ids
        or any(
            isinstance(port, bool) or not isinstance(port, int) or port < 0
            for port in port_ids
        )
        or len(port_ids) != len(set(port_ids))
    ):
        fail("trex_ports.data.port_ids must be non-empty, unique non-negative integers")


def main() -> int:
    content = sys.stdin.buffer.read(MAX_RESPONSE_BYTES + 1)
    if len(content) > MAX_RESPONSE_BYTES:
        fail("response exceeds the size limit")
    payload = strict_load(content)
    validate(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
