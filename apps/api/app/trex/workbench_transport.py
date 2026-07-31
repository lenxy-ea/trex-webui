from __future__ import annotations

import struct
from typing import Any


def tcp_flags_text(stream: dict[str, Any]) -> str:
    enabled = [
        label
        for label, key in [
            ("URG", "tcp_flag_urg"),
            ("ACK", "tcp_flag_ack"),
            ("PSH", "tcp_flag_psh"),
            ("RST", "tcp_flag_rst"),
            ("SYN", "tcp_flag_syn"),
            ("FIN", "tcp_flag_fin"),
        ]
        if stream.get(key)
    ]
    return ",".join(enabled) if enabled else "-"


def tcp_flags_value(stream: dict[str, Any]) -> int:
    return (
        (0x20 if stream["tcp_flag_urg"] else 0)
        | (0x10 if stream["tcp_flag_ack"] else 0)
        | (0x08 if stream["tcp_flag_psh"] else 0)
        | (0x04 if stream["tcp_flag_rst"] else 0)
        | (0x02 if stream["tcp_flag_syn"] else 0)
        | (0x01 if stream["tcp_flag_fin"] else 0)
    )


def tcp_options_enabled(stream: dict[str, Any]) -> bool:
    return bool(
        stream.get("tcp_option_mss_enabled")
        or stream.get("tcp_option_window_scale_enabled")
        or stream.get("tcp_option_sack_permitted_enabled")
        or stream.get("tcp_option_sack_blocks_enabled")
        or stream.get("tcp_option_timestamp_enabled")
    )


def tcp_options_text(stream: dict[str, Any]) -> str:
    enabled = []
    if stream.get("tcp_option_mss_enabled"):
        enabled.append(f"MSS={stream['tcp_option_mss']}")
    if stream.get("tcp_option_sack_permitted_enabled"):
        enabled.append("SACK permitted")
    if stream.get("tcp_option_sack_blocks_enabled"):
        enabled.append(f"SACK={stream['tcp_option_sack_left_edge']}-{stream['tcp_option_sack_right_edge']}")
    if stream.get("tcp_option_timestamp_enabled"):
        enabled.append(f"TS={stream['tcp_option_timestamp_value']}/{stream['tcp_option_timestamp_echo']}")
    if stream.get("tcp_option_window_scale_enabled"):
        enabled.append(f"WS={stream['tcp_option_window_scale']}")
    return ", ".join(enabled) if enabled else "-"


def tcp_options_preview_fields(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "mss_enabled": stream["tcp_option_mss_enabled"],
        "mss": stream["tcp_option_mss"],
        "mss_mode": stream["tcp_option_mss_mode"],
        "mss_count": stream["tcp_option_mss_count"],
        "mss_step": stream["tcp_option_mss_step"],
        "window_scale_enabled": stream["tcp_option_window_scale_enabled"],
        "window_scale": stream["tcp_option_window_scale"],
        "window_scale_mode": stream["tcp_option_window_scale_mode"],
        "window_scale_count": stream["tcp_option_window_scale_count"],
        "window_scale_step": stream["tcp_option_window_scale_step"],
        "sack_permitted": stream["tcp_option_sack_permitted_enabled"],
        "sack_blocks_enabled": stream["tcp_option_sack_blocks_enabled"],
        "sack_left_edge": stream["tcp_option_sack_left_edge"],
        "sack_left_edge_mode": stream["tcp_option_sack_left_edge_mode"],
        "sack_left_edge_count": stream["tcp_option_sack_left_edge_count"],
        "sack_left_edge_step": stream["tcp_option_sack_left_edge_step"],
        "sack_right_edge": stream["tcp_option_sack_right_edge"],
        "sack_right_edge_mode": stream["tcp_option_sack_right_edge_mode"],
        "sack_right_edge_count": stream["tcp_option_sack_right_edge_count"],
        "sack_right_edge_step": stream["tcp_option_sack_right_edge_step"],
        "timestamp_enabled": stream["tcp_option_timestamp_enabled"],
        "timestamp_value": stream["tcp_option_timestamp_value"],
        "timestamp_value_mode": stream["tcp_option_timestamp_value_mode"],
        "timestamp_value_count": stream["tcp_option_timestamp_value_count"],
        "timestamp_value_step": stream["tcp_option_timestamp_value_step"],
        "timestamp_echo": stream["tcp_option_timestamp_echo"],
        "timestamp_echo_mode": stream["tcp_option_timestamp_echo_mode"],
        "timestamp_echo_count": stream["tcp_option_timestamp_echo_count"],
        "timestamp_echo_step": stream["tcp_option_timestamp_echo_step"],
        "bytes": tcp_options_bytes(stream).hex(),
    }


def tcp_options_bytes(stream: dict[str, Any]) -> bytes:
    options = b""
    if stream.get("tcp_option_mss_enabled"):
        options += struct.pack("!BBH", 2, 4, stream["tcp_option_mss"] & 0xFFFF)
    if stream.get("tcp_option_sack_permitted_enabled"):
        options += b"\x04\x02"
    if stream.get("tcp_option_sack_blocks_enabled"):
        options += (
            b"\x05\x0a"
            + int(stream["tcp_option_sack_left_edge"]).to_bytes(4, "big")
            + int(stream["tcp_option_sack_right_edge"]).to_bytes(4, "big")
        )
    if stream.get("tcp_option_timestamp_enabled"):
        options += (
            b"\x01\x01\x08\x0a"
            + int(stream["tcp_option_timestamp_value"]).to_bytes(4, "big")
            + int(stream["tcp_option_timestamp_echo"]).to_bytes(4, "big")
        )
    if stream.get("tcp_option_window_scale_enabled"):
        options += bytes([1, 3, 3, stream["tcp_option_window_scale"] & 0xFF])
    padding = (-len(options)) % 4
    if padding:
        options += b"\x00" * padding
    return options


def tcp_header_length(stream: dict[str, Any]) -> int:
    return 20 + len(tcp_options_bytes(stream))


def tcp_option_mss_value_offset(stream: dict[str, Any]) -> int | None:
    if not stream.get("tcp_option_mss_enabled"):
        return None
    return tcp_option_value_offset(stream, kind=2, option_length=4, value_offset=2)


def tcp_option_timestamp_value_offset(stream: dict[str, Any], field: str) -> int | None:
    if not stream.get("tcp_option_timestamp_enabled"):
        return None
    if field == "value":
        return tcp_option_value_offset(stream, kind=8, option_length=10, value_offset=2)
    if field == "echo":
        return tcp_option_value_offset(stream, kind=8, option_length=10, value_offset=6)
    return None


def tcp_option_sack_value_offset(stream: dict[str, Any], field: str) -> int | None:
    if not stream.get("tcp_option_sack_blocks_enabled"):
        return None
    if field == "left_edge":
        return tcp_option_value_offset(stream, kind=5, option_length=10, value_offset=2)
    if field == "right_edge":
        return tcp_option_value_offset(stream, kind=5, option_length=10, value_offset=6)
    return None


def tcp_option_window_scale_value_offset(stream: dict[str, Any]) -> int | None:
    if not stream.get("tcp_option_window_scale_enabled"):
        return None
    return tcp_option_value_offset(stream, kind=3, option_length=3, value_offset=2)


def tcp_option_value_offset(
    stream: dict[str, Any], *, kind: int, option_length: int, value_offset: int
) -> int | None:
    offset = 20
    options = tcp_options_bytes(stream)
    while offset < 20 + len(options):
        candidate_kind = options[offset - 20]
        if candidate_kind == 0:
            return None
        if candidate_kind == 1:
            offset += 1
            continue
        if offset - 20 + 2 > len(options):
            return None
        candidate_length = options[offset - 20 + 1]
        if candidate_length < 2 or offset - 20 + candidate_length > len(options):
            return None
        if candidate_kind == kind and candidate_length == option_length:
            return offset + value_offset
        offset += candidate_length
    return None
