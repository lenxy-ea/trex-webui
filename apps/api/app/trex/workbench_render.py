from __future__ import annotations

from collections.abc import Callable
from typing import Any

import yaml


GuiStreamEntryBuilder = Callable[[dict[str, Any], int, list[dict[str, Any]]], dict[str, Any]]


def next_stream_name(stream: dict[str, Any], streams: list[dict[str, Any]]) -> str:
    next_stream_id = stream.get("next_stream_id")
    if not isinstance(next_stream_id, int) or next_stream_id < 1 or next_stream_id > len(streams):
        return "-1"
    return str(streams[next_stream_id - 1]["name"])


def next_stream_summary_label(stream: dict[str, Any], streams: list[dict[str, Any]] | None = None) -> str:
    next_stream = next_stream_name(stream, streams or [stream])
    return "-" if next_stream == "-1" else next_stream


def stream_summary(stream: dict[str, Any], index: int, streams: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "index": index + 1,
        "name": stream["name"],
        "packet_type": stream["packet_type"],
        "length": stream["frame_length"],
        "mode": stream["mode"],
        "rate": f"{stream['rate_value']:g} {stream['rate_type']}",
        "next_stream": next_stream_summary_label(stream, streams),
    }


def resolve_loaded_next_stream_ids(streams: list[dict[str, Any]]) -> None:
    name_to_id = {stream["name"]: index + 1 for index, stream in enumerate(streams)}
    for stream in streams:
        next_name = stream.pop("_next_stream_name", None)
        if isinstance(next_name, str) and next_name not in {"", "-1", "None"}:
            stream["next_stream_id"] = name_to_id.get(next_name)
        elif not isinstance(stream.get("next_stream_id"), int):
            stream["next_stream_id"] = None
        if stream["next_stream_id"] is None:
            stream["action_count"] = 0


def render_workbench_yaml(streams: list[dict[str, Any]], build_entry: GuiStreamEntryBuilder) -> str:
    entries = [build_entry(stream, index, streams) for index, stream in enumerate(streams)]
    return "---\n" + yaml.safe_dump(entries, sort_keys=False, default_flow_style=False, allow_unicode=False)
