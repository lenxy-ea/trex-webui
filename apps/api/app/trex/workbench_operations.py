from __future__ import annotations

import base64
from collections.abc import Callable
from typing import Any

from app.core.settings import TrexEnvironment
from app.trex.profile_files import (
    PROFILE_NAME_ERROR,
    matching_root,
    normalize_profile_file_name,
    profile_record,
    writable_profile_root,
)
from app.trex.result import TrexCallResult
from app.trex.workbench_gui_import import stream_from_gui_yaml as _stream_from_gui_yaml
from app.trex.workbench_gui_render import gui_stream_entry as _gui_stream_entry
from app.trex.workbench_normalize import normalize_workbench_streams as _normalize_workbench_streams
from app.trex.workbench_packet_build import build_profile_packet as _build_profile_packet
from app.trex.workbench_packet_import import stream_from_ethernet_packet as _stream_from_ethernet_packet
from app.trex.workbench_packet_preview import packet_preview_record as _packet_preview_record
from app.trex.workbench_pcap import (
    apply_pcap_import_options as _apply_pcap_import_options,
    decode_pcap_import_content as _decode_pcap_import_content,
    normalize_pcap_file_name as _normalize_pcap_file_name,
    normalize_pcap_import_options as _normalize_pcap_import_options,
    pcap_bytes_for_packets as _pcap_bytes_for_packets,
    streams_from_pcap as _streams_from_pcap,
)
from app.trex.workbench_profile import (
    load_workbench_profile_document as _load_workbench_profile_document,
    streams_from_workbench_profile_document as _streams_from_workbench_profile_document,
)
from app.trex.workbench_render import (
    render_workbench_yaml as _render_workbench_yaml,
    resolve_loaded_next_stream_ids as _resolve_loaded_next_stream_ids,
    stream_summary as _stream_summary,
)
from app.trex.workbench_values import PROFILE_PCAP_MAX_PACKETS


ProfileResolver = Callable[[str], TrexCallResult]


def render_workbench_profile(streams: list[dict[str, Any]]) -> TrexCallResult:
    normalized = _normalize_workbench_streams(streams)
    if isinstance(normalized, TrexCallResult):
        return normalized
    content = _render_workbench_yaml(normalized, _gui_stream_entry)
    return TrexCallResult(
        True,
        data={
            "content": content,
            "streams": [_stream_summary(stream, index, normalized) for index, stream in enumerate(normalized)],
            "packet_previews": [_packet_preview_record(stream, index) for index, stream in enumerate(normalized)],
        },
    )


def save_workbench_profile(
    env: TrexEnvironment,
    profile_name: str,
    streams: list[dict[str, Any]],
) -> TrexCallResult:
    normalized = _normalize_workbench_streams(streams)
    if isinstance(normalized, TrexCallResult):
        return normalized
    root, root_error = writable_profile_root(env.profile_roots)
    if root is None:
        return TrexCallResult(False, blocker="profile_root_path_invalid", error=root_error)

    file_name = normalize_profile_file_name(profile_name)
    if file_name is None:
        return TrexCallResult(False, blocker="profile_name_invalid", error=PROFILE_NAME_ERROR)

    try:
        root.mkdir(parents=True, exist_ok=True)
        target = (root / file_name).resolve()
        target.relative_to(root.resolve())
        content = _render_workbench_yaml(normalized, _gui_stream_entry)
        target.write_text(content, encoding="utf-8")
        profile = profile_record(target, root.resolve())
    except (OSError, ValueError) as exc:
        return TrexCallResult(False, blocker="profile_save_failed", error=str(exc))

    return TrexCallResult(
        True,
        data={
            "profile": profile,
            "content": content,
            "streams": [_stream_summary(stream, index, normalized) for index, stream in enumerate(normalized)],
            "packet_previews": [_packet_preview_record(stream, index) for index, stream in enumerate(normalized)],
        },
    )


def export_workbench_profile_yaml(profile_name: str, streams: list[dict[str, Any]]) -> TrexCallResult:
    normalized = _normalize_workbench_streams(streams)
    if isinstance(normalized, TrexCallResult):
        return normalized
    file_name = normalize_profile_file_name(profile_name)
    if file_name is None:
        return TrexCallResult(False, blocker="profile_name_invalid", error=PROFILE_NAME_ERROR)
    content = _render_workbench_yaml(normalized, _gui_stream_entry)
    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "file_name": file_name,
            "content": content,
            "bytes": len(content.encode("utf-8")),
            "streams": [_stream_summary(stream, index, normalized) for index, stream in enumerate(normalized)],
            "packet_previews": [_packet_preview_record(stream, index) for index, stream in enumerate(normalized)],
        },
    )


def export_workbench_stream_pcap(stream: dict[str, Any], file_name: str | None = None) -> TrexCallResult:
    normalized = _normalize_workbench_streams([stream])
    if isinstance(normalized, TrexCallResult):
        return normalized
    normalized_stream = normalized[0]
    normalized_file_name = _normalize_pcap_file_name(file_name, normalized_stream["name"])
    if isinstance(normalized_file_name, TrexCallResult):
        return normalized_file_name
    packet_bytes = _build_profile_packet(normalized_stream)
    pcap_bytes = _pcap_bytes_for_packets([{"packet": packet_bytes, "timestamp": 0.0, "wirelen": len(packet_bytes)}])
    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "file_name": normalized_file_name,
            "content_base64": base64.b64encode(pcap_bytes).decode("ascii"),
            "bytes": len(pcap_bytes),
            "stream": _stream_summary(normalized_stream, 0),
            "packet_preview": _packet_preview_record(normalized_stream, 0),
        },
    )


def import_workbench_pcap(
    file_name: str,
    content_base64: str,
    max_packets: int = PROFILE_PCAP_MAX_PACKETS,
    options: dict[str, Any] | None = None,
) -> TrexCallResult:
    normalized_file_name = _normalize_pcap_file_name(file_name, "imported")
    if isinstance(normalized_file_name, TrexCallResult):
        return normalized_file_name
    normalized_options = _normalize_pcap_import_options(options)
    if isinstance(normalized_options, TrexCallResult):
        return normalized_options
    pcap_bytes = _decode_pcap_import_content(content_base64)
    if isinstance(pcap_bytes, TrexCallResult):
        return pcap_bytes
    parsed = _streams_from_pcap(
        pcap_bytes,
        max_packets=max_packets,
        stream_from_packet=_stream_from_ethernet_packet,
    )
    if isinstance(parsed, TrexCallResult):
        return parsed
    streams, unsupported_count = parsed
    streams = _apply_pcap_import_options(
        streams,
        normalized_options,
        stream_from_packet=_stream_from_ethernet_packet,
    )
    normalized = _normalize_workbench_streams(streams)
    if isinstance(normalized, TrexCallResult):
        return normalized
    return TrexCallResult(
        True,
        data={
            "accepted": True,
            "file_name": normalized_file_name,
            "import_options": normalized_options,
            "packet_count": len(normalized),
            "unsupported_count": unsupported_count,
            "content": _render_workbench_yaml(normalized, _gui_stream_entry),
            "streams": normalized,
            "stream_summaries": [_stream_summary(stream, index, normalized) for index, stream in enumerate(normalized)],
            "packet_previews": [_packet_preview_record(stream, index) for index, stream in enumerate(normalized)],
        },
    )


def load_workbench_profile(
    env: TrexEnvironment,
    profile_path: str,
    resolve_profile_path: ProfileResolver,
) -> TrexCallResult:
    resolved = resolve_profile_path(profile_path)
    if not resolved.ok:
        return resolved
    profile_file = resolved.data
    suffix = profile_file.suffix.lower()
    if suffix not in {".yaml", ".yml", ".json"}:
        return TrexCallResult(
            False,
            blocker="profile_workbench_unsupported",
            error="only YAML or JSON profiles can be loaded into the stream workbench",
        )
    root = matching_root(profile_file, env.profile_roots)
    if root is None:
        return TrexCallResult(False, blocker="profile_path_denied_or_missing", error=str(profile_file))
    try:
        content = profile_file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return TrexCallResult(False, blocker="profile_load_failed", error=str(exc))
    loaded = _load_workbench_profile_document(content, suffix)
    if isinstance(loaded, TrexCallResult):
        return loaded

    parsed_streams = _streams_from_workbench_profile_document(
        loaded,
        suffix,
        stream_from_gui_yaml=_stream_from_gui_yaml,
        normalize_workbench_streams=_normalize_workbench_streams,
    )
    if isinstance(parsed_streams, TrexCallResult):
        return parsed_streams
    streams = parsed_streams
    _resolve_loaded_next_stream_ids(streams)
    summaries = [_stream_summary(stream, index, streams) for index, stream in enumerate(streams)]

    return TrexCallResult(
        True,
        data={
            "profile": profile_record(profile_file, root),
            "content": content,
            "streams": streams,
            "stream_summaries": summaries,
            "packet_previews": [_packet_preview_record(stream, index) for index, stream in enumerate(streams)],
        },
    )
