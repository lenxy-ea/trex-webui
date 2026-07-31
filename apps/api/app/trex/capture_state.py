from __future__ import annotations

import re
from typing import Any, Iterable


def capture_status_records(captures: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(captures, dict):
        iterator = captures.items()
    else:
        iterator = enumerate(captures if isinstance(captures, list) else [])
    for capture_id, capture in iterator:
        if not isinstance(capture, dict):
            continue
        record = dict(capture)
        normalized_id = record.get("id", capture_id)
        record["id"] = int(normalized_id) if str(normalized_id).isdigit() else normalized_id
        records.append(record)
    return sorted(records, key=lambda record: int(record["id"]) if str(record.get("id")).isdigit() else 0)


def capture_status_payload(captures: Any) -> dict[str, Any]:
    records = capture_status_records(captures)
    return {
        "captures": records,
        "port_usage": capture_port_usage(records),
    }


def capture_port_usage(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    usage: dict[int, dict[str, Any]] = {}
    for record in records:
        recorder_id = record.get("id")
        for direction, field_name in (("rx", "rx_recorder_ids"), ("tx", "tx_recorder_ids")):
            for port in capture_record_ports(record, direction):
                entry = usage.setdefault(
                    port,
                    {
                        "port": port,
                        "rx_recorder_ids": [],
                        "tx_recorder_ids": [],
                    },
                )
                if recorder_id not in entry[field_name]:
                    entry[field_name].append(recorder_id)
    return [usage[port] for port in sorted(usage)]


def capture_record_ports(record: dict[str, Any], direction: str) -> list[int]:
    capture_filter = record.get("filter")
    if not isinstance(capture_filter, dict):
        return []
    return capture_port_list(capture_filter.get(direction))


def capture_port_list(value: object) -> list[int]:
    if isinstance(value, bool):
        return []
    if isinstance(value, list):
        return dedupe_ports([int_or_none(item) for item in value])
    if isinstance(value, int) and value >= 0:
        ports: list[int] = []
        for index in range(64):
            if (value // (2 ** index)) % 2 == 1:
                ports.append(index)
        return ports
    if isinstance(value, str) and value.strip():
        stripped = value.strip()
        if stripped.isdigit():
            return capture_port_list(int(stripped))
        return dedupe_ports(int_or_none(item) for item in re.split(r"[,\s]+", stripped))
    return []


def dedupe_ports(values: Iterable[int | None]) -> list[int]:
    ports: list[int] = []
    for value in values:
        if value is not None and value >= 0 and value not in ports:
            ports.append(value)
    return ports


def int_or_none(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None
