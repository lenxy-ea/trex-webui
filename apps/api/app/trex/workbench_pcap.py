from __future__ import annotations

import base64
import binascii
import ipaddress
import re
import struct
from pathlib import Path
from typing import Any, Callable

from app.trex.result import TrexCallResult
from app.trex.workbench_inputs import packet_binary_from_base64
from app.trex.workbench_layout import workbench_vxlan_inner_ip_version
from app.trex.workbench_packet import internet_checksum, ipv4_checksum, ipv4_offsets
from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version,
    workbench_has_arp,
    workbench_has_gre,
    workbench_has_gtpu,
    workbench_has_icmp,
    workbench_has_l3,
    workbench_has_transport_ports,
    workbench_ip_version,
    workbench_is_icmp_echo,
    workbench_is_icmpv6_echo,
    workbench_is_icmpv6_nd,
    workbench_is_icmpv6_ra,
    workbench_is_icmpv6_rs,
)
from app.trex.workbench_values import (
    PROFILE_DEFAULT_DST_IPV4,
    PROFILE_DEFAULT_SRC_IPV4,
    PROFILE_PCAP_BASE64_MAX_CHARS,
    PROFILE_PCAP_IMPORT_RATE_MODES,
    PROFILE_PCAP_MAX_BYTES,
    PROFILE_PCAP_MAX_PACKETS,
    PROFILE_PCAP_NAME_ERROR,
    PROFILE_WORKBENCH_IPV4_ADDRESS_MODES,
    bool_value,
    bounded_float,
    bounded_int,
    choice,
    clean_ipv4_text,
)


def normalize_pcap_file_name(value: object, fallback_stem: str) -> str | TrexCallResult:
    if value is None or value == "":
        stem = _file_safe_stem(fallback_stem)
        return f"{stem}.pcap"
    if not isinstance(value, str):
        return TrexCallResult(False, blocker="profile_pcap_file_name_invalid", error=PROFILE_PCAP_NAME_ERROR)
    candidate = value.strip()
    if candidate == "" or candidate != value or "\x00" in candidate or "/" in candidate or "\\" in candidate:
        return TrexCallResult(False, blocker="profile_pcap_file_name_invalid", error=PROFILE_PCAP_NAME_ERROR)
    path = Path(candidate)
    if path.name in {".", ".."}:
        return TrexCallResult(False, blocker="profile_pcap_file_name_invalid", error=PROFILE_PCAP_NAME_ERROR)
    if path.suffix == "":
        candidate = f"{candidate}.pcap"
        path = Path(candidate)
    if path.suffix.lower() not in {".pcap", ".cap"}:
        return TrexCallResult(False, blocker="profile_pcap_file_name_invalid", error=PROFILE_PCAP_NAME_ERROR)
    return path.name


def pcap_bytes_for_packets(records: list[dict[str, Any]]) -> bytes:
    chunks = [struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65_535, 1)]
    for record in records:
        packet = record.get("packet")
        packet_bytes = packet if isinstance(packet, bytes) else b""
        timestamp = record.get("timestamp")
        if not isinstance(timestamp, (int, float)) or isinstance(timestamp, bool):
            timestamp = 0.0
        seconds = int(timestamp)
        microseconds = int((float(timestamp) - seconds) * 1_000_000)
        wirelen = record.get("wirelen")
        if not isinstance(wirelen, int):
            wirelen = len(packet_bytes)
        chunks.append(struct.pack("<IIII", seconds, microseconds, len(packet_bytes), wirelen))
        chunks.append(packet_bytes)
    return b"".join(chunks)


def normalize_pcap_import_options(options: dict[str, Any] | None) -> dict[str, Any] | None | TrexCallResult:
    if options is None:
        return None
    if not isinstance(options, dict):
        return TrexCallResult(
            False,
            blocker="profile_pcap_import_options_invalid",
            error="pcap import options must be an object",
        )
    return {
        "name_prefix": clean_pcap_import_prefix(options.get("name_prefix")),
        "rewrite_src_enabled": bool_value(options.get("rewrite_src_enabled"), False),
        "src_address": clean_ipv4_text(options.get("src_address"), PROFILE_DEFAULT_SRC_IPV4),
        "src_mode": choice(options.get("src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "src_count": bounded_int(options.get("src_count"), 1, 100_000_000, 16),
        "rewrite_dst_enabled": bool_value(options.get("rewrite_dst_enabled"), False),
        "dst_address": clean_ipv4_text(options.get("dst_address"), PROFILE_DEFAULT_DST_IPV4),
        "dst_mode": choice(options.get("dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dst_count": bounded_int(options.get("dst_count"), 1, 100_000_000, 16),
        "rate_mode": choice(options.get("rate_mode"), PROFILE_PCAP_IMPORT_RATE_MODES, "speedup"),
        "speedup": bounded_float(options.get("speedup"), 0.000001, 1_000_000_000.0, 1.0),
        "ipg": bounded_float(options.get("ipg"), 0.0, 86_400.0, 1.0),
        "loop_count": bounded_int(options.get("loop_count"), 0, 4_294_967_295, 0),
    }


def decode_pcap_import_content(content_base64: object) -> bytes | TrexCallResult:
    if not isinstance(content_base64, str) or len(content_base64) > PROFILE_PCAP_BASE64_MAX_CHARS:
        return TrexCallResult(False, blocker="profile_pcap_invalid", error="pcap content is missing or too large")
    try:
        pcap_bytes = base64.b64decode(content_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        return TrexCallResult(False, blocker="profile_pcap_invalid", error=str(exc))
    if len(pcap_bytes) > PROFILE_PCAP_MAX_BYTES:
        return TrexCallResult(False, blocker="profile_pcap_too_large", error="pcap content exceeds allowed size")
    return pcap_bytes


def clean_pcap_import_prefix(value: object) -> str:
    if not isinstance(value, str):
        return ""
    candidate = value.strip()
    if candidate == "" or "\x00" in candidate:
        return ""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", candidate).strip("_.-")
    return cleaned[:64]


def pcap_import_ipg_seconds(
    options: dict[str, Any],
    previous_timestamp: object,
    timestamp: object,
    first_stream: bool,
) -> float:
    if options["rate_mode"] == "ipg":
        return options["ipg"]
    if first_stream:
        return 1.0
    if not isinstance(previous_timestamp, (int, float)) or not isinstance(timestamp, (int, float)):
        return 1.0
    return max(0.0, float(timestamp) - float(previous_timestamp)) / options["speedup"]


def pcap_import_rewrite_state(streams: list[dict[str, Any]], options: dict[str, Any]) -> dict[str, str] | None:
    if not options["rewrite_src_enabled"] and not options["rewrite_dst_enabled"]:
        return None
    for stream in streams:
        if stream.get("packet_type", "").startswith("Ethernet/IPv4"):
            return {
                "default_src": str(stream["ipv4_src"]),
                "default_dst": str(stream["ipv4_dst"]),
            }
    return None


def pcap_import_ipv4_field_patch(
    stream: dict[str, Any],
    options: dict[str, Any],
    rewrite_state: dict[str, str],
) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if options["rewrite_src_enabled"]:
        field = pcap_import_rewrite_field(stream, rewrite_state["default_src"])
        if field is not None:
            patch[f"ipv4_{field}_mode"] = options["src_mode"]
            patch[f"ipv4_{field}_count"] = max(2, options["src_count"])
            patch[f"ipv4_{field}_step"] = 1
    if options["rewrite_dst_enabled"]:
        field = pcap_import_rewrite_field(stream, rewrite_state["default_dst"])
        if field is not None:
            patch[f"ipv4_{field}_mode"] = options["dst_mode"]
            patch[f"ipv4_{field}_count"] = max(2, options["dst_count"])
            patch[f"ipv4_{field}_step"] = 1
    return patch


def pcap_import_rewrite_field(stream: dict[str, Any], default_address: str) -> str | None:
    if stream.get("ipv4_src") == default_address:
        return "src"
    if stream.get("ipv4_dst") == default_address:
        return "dst"
    return None


def pcap_import_rewrite_ipv4_packet(
    packet: bytes,
    stream: dict[str, Any],
    options: dict[str, Any],
    rewrite_state: dict[str, str],
) -> bytes:
    offsets = ipv4_offsets(packet)
    if offsets is None:
        return packet
    ip_offset, ihl, protocol = offsets
    rewritten = bytearray(packet)
    if options["rewrite_src_enabled"]:
        replacement = _ipv4_bytes(options["src_address"])
        if stream["ipv4_src"] == rewrite_state["default_src"]:
            rewritten[ip_offset + 12 : ip_offset + 16] = replacement
        elif stream["ipv4_dst"] == rewrite_state["default_src"]:
            rewritten[ip_offset + 16 : ip_offset + 20] = replacement
    if options["rewrite_dst_enabled"]:
        replacement = _ipv4_bytes(options["dst_address"])
        if stream["ipv4_dst"] == rewrite_state["default_dst"]:
            rewritten[ip_offset + 16 : ip_offset + 20] = replacement
        elif stream["ipv4_src"] == rewrite_state["default_dst"]:
            rewritten[ip_offset + 12 : ip_offset + 16] = replacement
    refresh_ipv4_packet_checksums(rewritten, ip_offset, ihl, protocol)
    return bytes(rewritten)


def apply_pcap_import_options(
    streams: list[dict[str, Any]],
    options: dict[str, Any] | None,
    stream_from_packet: Callable[[bytes, int], dict[str, Any] | None],
) -> list[dict[str, Any]]:
    if options is None:
        return streams

    loop_count = options["loop_count"]
    prefix = options["name_prefix"]
    last_index = len(streams) - 1
    rewrite_state = pcap_import_rewrite_state(streams, options)
    updated: list[dict[str, Any]] = []
    for index, stream in enumerate(streams):
        previous_timestamp = streams[index - 1].get("_pcap_timestamp") if index > 0 else None
        timestamp = stream.get("_pcap_timestamp")
        ipg = pcap_import_ipg_seconds(options, previous_timestamp, timestamp, index == 0)
        base_stream = rewrite_pcap_import_stream_ipv4(stream, index, options, rewrite_state, stream_from_packet)
        name = f"{prefix}_packet_{index + 1}" if prefix else f"packet_{index + 1}"
        next_stream_id = index + 2 if index < last_index else 1 if loop_count > 0 else None
        updated_stream = {
            **base_stream,
            "name": name,
            "mode": "burst",
            "rate_type": "pps",
            "rate_value": max(1.0, 1.0 / ipg) if ipg > 0 else 1.0,
            "self_start": index == 0,
            "total_pkts": 1,
            "pkts_per_burst": 1,
            "count": 1,
            "next_stream_id": next_stream_id,
            "action_count": loop_count if index == last_index and loop_count > 0 else 0,
            "isg": ipg,
            "ibg": 0.0,
        }
        updated.append(updated_stream)
    return updated


def rewrite_pcap_import_stream_ipv4(
    stream: dict[str, Any],
    index: int,
    options: dict[str, Any],
    rewrite_state: dict[str, str] | None,
    stream_from_packet: Callable[[bytes, int], dict[str, Any] | None],
) -> dict[str, Any]:
    if rewrite_state is None or not str(stream.get("packet_type", "")).startswith("Ethernet/IPv4"):
        return stream
    packet_base64 = stream.get("packet_binary_base64")
    packet = packet_binary_from_base64(packet_base64)
    if not isinstance(packet, bytes):
        return stream

    rewritten = pcap_import_rewrite_ipv4_packet(packet, stream, options, rewrite_state)
    parsed = stream_from_packet(rewritten, index)
    if parsed is None:
        return stream
    parsed["_pcap_timestamp"] = stream.get("_pcap_timestamp")
    parsed.update(pcap_import_ipv4_field_patch(stream, options, rewrite_state))
    return parsed


def stream_flow_key(stream: dict[str, Any]) -> tuple[Any, ...]:
    endpoint_flow: frozenset[tuple[str, int]] | frozenset[tuple[str, str]]
    if workbench_has_arp(stream):
        endpoint_flow = frozenset(
            {
                (
                    str(stream["arp_sender_ip"]),
                    str(stream["arp_target_ip"]),
                    str(stream["arp_sender_mac"]),
                    str(stream["arp_target_mac"]),
                    str(stream["arp_operation"]),
                    str(stream["arp_operation_mode"]),
                    str(stream["arp_operation_count"]),
                    str(stream["arp_operation_step"]),
                    str(stream["arp_sender_mac_mode"]),
                    str(stream["arp_sender_mac_count"]),
                    str(stream["arp_sender_mac_step"]),
                    str(stream["arp_target_mac_mode"]),
                    str(stream["arp_target_mac_count"]),
                    str(stream["arp_target_mac_step"]),
                    str(stream["arp_sender_ip_mode"]),
                    str(stream["arp_sender_ip_count"]),
                    str(stream["arp_sender_ip_step"]),
                    str(stream["arp_target_ip_mode"]),
                    str(stream["arp_target_ip_count"]),
                    str(stream["arp_target_ip_step"]),
                ),
            }
        )
    elif not workbench_has_l3(stream):
        endpoint_flow = frozenset(
            {
                (stream["ether_src"], stream["ether_dst"]),
            }
        )
    elif not workbench_has_transport_ports(stream):
        endpoint_flow = frozenset(
            {
                (
                    stream["ipv6_src"] if workbench_ip_version(stream) == 6 else stream["ipv4_src"],
                    stream["ipv6_dst"] if workbench_ip_version(stream) == 6 else stream["ipv4_dst"],
                    stream.get("icmp_type") if workbench_has_icmp(stream) else None,
                    stream.get("icmp_type_mode") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_type_count") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_type_step") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_code") if workbench_has_icmp(stream) else None,
                    stream.get("icmp_code_mode") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_code_count") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_code_step") if workbench_is_icmpv6_echo(stream) else None,
                    stream.get("icmp_identifier") if workbench_has_icmp(stream) else None,
                    stream.get("icmp_identifier_mode") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmp_identifier_count") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmp_identifier_step") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmp_sequence") if workbench_has_icmp(stream) else None,
                    stream.get("icmp_sequence_mode") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmp_sequence_count") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmp_sequence_step") if workbench_is_icmp_echo(stream) else None,
                    stream.get("icmpv6_nd_target") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_nd_include_option") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_nd_option_mac") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_nd_na_router") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_nd_na_solicited") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_nd_na_override") if workbench_is_icmpv6_nd(stream) else None,
                    stream.get("icmpv6_rs_include_slla") if workbench_is_icmpv6_rs(stream) else None,
                    stream.get("icmpv6_rs_slla_mac") if workbench_is_icmpv6_rs(stream) else None,
                    stream.get("icmpv6_ra_cur_hop_limit") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_managed") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_other") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_router_lifetime") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_reachable_time") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_retrans_timer") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_include_slla") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_slla_mac") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_include_prefix") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix_length") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix_on_link") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix_autonomous") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix_valid_lifetime") if workbench_is_icmpv6_ra(stream) else None,
                    stream.get("icmpv6_ra_prefix_preferred_lifetime") if workbench_is_icmpv6_ra(stream) else None,
                ),
            }
        )
    else:
        src_ip = stream["ipv6_src"] if workbench_ip_version(stream) == 6 else stream["ipv4_src"]
        dst_ip = stream["ipv6_dst"] if workbench_ip_version(stream) == 6 else stream["ipv4_dst"]
        endpoint_flow = frozenset(
            {
                (src_ip, stream["l4_src_port"]),
                (dst_ip, stream["l4_dst_port"]),
            }
        )
    inner_flow = None
    if workbench_has_gtpu(stream):
        if workbench_gtpu_inner_ip_version(stream) == "IPv6":
            inner_endpoint_flow = frozenset(
                {
                    (stream["gtpu_inner_ipv6_src"], stream["gtpu_inner_l4_src_port"]),
                    (stream["gtpu_inner_ipv6_dst"], stream["gtpu_inner_l4_dst_port"]),
                }
            )
        else:
            inner_endpoint_flow = frozenset(
                {
                    (stream["gtpu_inner_ipv4_src"], stream["gtpu_inner_l4_src_port"]),
                    (stream["gtpu_inner_ipv4_dst"], stream["gtpu_inner_l4_dst_port"]),
                }
            )
        inner_flow = (
            stream["gtpu_message_type"],
            stream["gtpu_teid"],
            stream["gtpu_teid_mode"],
            stream["gtpu_teid_count"] if stream["gtpu_teid_mode"] != "Fixed" else None,
            stream["gtpu_teid_step"] if stream["gtpu_teid_mode"] != "Fixed" else None,
            stream["gtpu_sequence_enabled"],
            stream["gtpu_sequence"] if stream["gtpu_sequence_enabled"] else None,
            stream["gtpu_sequence_mode"] if stream["gtpu_sequence_enabled"] else "Fixed",
            stream["gtpu_sequence_count"]
            if stream["gtpu_sequence_enabled"] and stream["gtpu_sequence_mode"] != "Fixed"
            else None,
            stream["gtpu_sequence_step"]
            if stream["gtpu_sequence_enabled"] and stream["gtpu_sequence_mode"] != "Fixed"
            else None,
            stream["gtpu_npdu_enabled"],
            stream["gtpu_npdu"] if stream["gtpu_npdu_enabled"] else None,
            stream["gtpu_npdu_mode"] if stream["gtpu_npdu_enabled"] else "Fixed",
            stream["gtpu_npdu_count"]
            if stream["gtpu_npdu_enabled"] and stream["gtpu_npdu_mode"] != "Fixed"
            else None,
            stream["gtpu_npdu_step"]
            if stream["gtpu_npdu_enabled"] and stream["gtpu_npdu_mode"] != "Fixed"
            else None,
            stream["gtpu_extension_enabled"],
            stream["gtpu_extension_udp_port"] if stream["gtpu_extension_enabled"] else None,
            stream["gtpu_extension_udp_port_mode"] if stream["gtpu_extension_enabled"] else "Fixed",
            stream["gtpu_extension_udp_port_count"]
            if stream["gtpu_extension_enabled"] and stream["gtpu_extension_udp_port_mode"] != "Fixed"
            else None,
            stream["gtpu_extension_udp_port_step"]
            if stream["gtpu_extension_enabled"] and stream["gtpu_extension_udp_port_mode"] != "Fixed"
            else None,
            stream["gtpu_inner_ip_version"],
            inner_endpoint_flow,
        )
    elif stream.get("vxlan_enabled"):
        if workbench_vxlan_inner_ip_version(stream) == "IPv6":
            vxlan_inner_endpoint_flow = frozenset(
                {
                    (stream["vxlan_inner_ipv6_src"], stream["vxlan_inner_l4_src_port"]),
                    (stream["vxlan_inner_ipv6_dst"], stream["vxlan_inner_l4_dst_port"]),
                }
            )
        else:
            vxlan_inner_endpoint_flow = frozenset(
                {
                    (stream["vxlan_inner_ipv4_src"], stream["vxlan_inner_l4_src_port"]),
                    (stream["vxlan_inner_ipv4_dst"], stream["vxlan_inner_l4_dst_port"]),
                }
            )
        inner_flow = (
            stream["vxlan_vni"],
            stream["vxlan_inner_ip_version"],
            vxlan_inner_endpoint_flow,
        )
    elif workbench_has_gre(stream):
        if workbench_gre_inner_ip_version(stream) == "IPv6":
            gre_inner_endpoint_flow = frozenset(
                {
                    (
                        stream["gre_inner_ipv6_src"],
                        stream["gre_inner_ipv6_src_mode"],
                        stream["gre_inner_ipv6_src_count"] if stream["gre_inner_ipv6_src_mode"] != "Fixed" else None,
                        stream["gre_inner_ipv6_src_step"] if stream["gre_inner_ipv6_src_mode"] != "Fixed" else None,
                        stream["gre_inner_l4_src_port"],
                        stream["gre_inner_l4_src_port_mode"],
                        stream["gre_inner_l4_src_port_count"]
                        if stream["gre_inner_l4_src_port_mode"] != "Fixed"
                        else None,
                        stream["gre_inner_l4_src_port_step"]
                        if stream["gre_inner_l4_src_port_mode"] != "Fixed"
                        else None,
                    ),
                    (
                        stream["gre_inner_ipv6_dst"],
                        stream["gre_inner_ipv6_dst_mode"],
                        stream["gre_inner_ipv6_dst_count"] if stream["gre_inner_ipv6_dst_mode"] != "Fixed" else None,
                        stream["gre_inner_ipv6_dst_step"] if stream["gre_inner_ipv6_dst_mode"] != "Fixed" else None,
                        stream["gre_inner_l4_dst_port"],
                        stream["gre_inner_l4_dst_port_mode"],
                        stream["gre_inner_l4_dst_port_count"]
                        if stream["gre_inner_l4_dst_port_mode"] != "Fixed"
                        else None,
                        stream["gre_inner_l4_dst_port_step"]
                        if stream["gre_inner_l4_dst_port_mode"] != "Fixed"
                        else None,
                    ),
                }
            )
            gre_inner_ttl = stream["gre_inner_ipv6_hop_limit"]
            gre_inner_ttl_mode = stream["gre_inner_ipv6_hop_limit_mode"]
            gre_inner_ttl_count = stream["gre_inner_ipv6_hop_limit_count"]
            gre_inner_ttl_step = stream["gre_inner_ipv6_hop_limit_step"]
        else:
            gre_inner_endpoint_flow = frozenset(
                {
                    (
                        stream["gre_inner_ipv4_src"],
                        stream["gre_inner_ipv4_src_mode"],
                        stream["gre_inner_ipv4_src_count"] if stream["gre_inner_ipv4_src_mode"] != "Fixed" else None,
                        stream["gre_inner_ipv4_src_step"] if stream["gre_inner_ipv4_src_mode"] != "Fixed" else None,
                        stream["gre_inner_l4_src_port"],
                        stream["gre_inner_l4_src_port_mode"],
                        stream["gre_inner_l4_src_port_count"]
                        if stream["gre_inner_l4_src_port_mode"] != "Fixed"
                        else None,
                        stream["gre_inner_l4_src_port_step"]
                        if stream["gre_inner_l4_src_port_mode"] != "Fixed"
                        else None,
                    ),
                    (
                        stream["gre_inner_ipv4_dst"],
                        stream["gre_inner_ipv4_dst_mode"],
                        stream["gre_inner_ipv4_dst_count"] if stream["gre_inner_ipv4_dst_mode"] != "Fixed" else None,
                        stream["gre_inner_ipv4_dst_step"] if stream["gre_inner_ipv4_dst_mode"] != "Fixed" else None,
                        stream["gre_inner_l4_dst_port"],
                        stream["gre_inner_l4_dst_port_mode"],
                        stream["gre_inner_l4_dst_port_count"]
                        if stream["gre_inner_l4_dst_port_mode"] != "Fixed"
                        else None,
                        stream["gre_inner_l4_dst_port_step"]
                        if stream["gre_inner_l4_dst_port_mode"] != "Fixed"
                        else None,
                    ),
                }
            )
            gre_inner_ttl = stream["gre_inner_ipv4_ttl"]
            gre_inner_ttl_mode = stream["gre_inner_ipv4_ttl_mode"]
            gre_inner_ttl_count = stream["gre_inner_ipv4_ttl_count"]
            gre_inner_ttl_step = stream["gre_inner_ipv4_ttl_step"]
        inner_flow = (
            stream["gre_checksum_present"],
            stream["gre_checksum"] if stream["gre_checksum_present"] else None,
            stream["gre_key_present"],
            stream["gre_key"] if stream["gre_key_present"] else None,
            stream["gre_key_mode"],
            stream["gre_key_count"] if stream["gre_key_mode"] != "Fixed" else None,
            stream["gre_key_step"] if stream["gre_key_mode"] != "Fixed" else None,
            stream["gre_sequence_present"],
            stream["gre_sequence"] if stream["gre_sequence_present"] else None,
            stream["gre_sequence_mode"],
            stream["gre_sequence_count"] if stream["gre_sequence_mode"] != "Fixed" else None,
            stream["gre_sequence_step"] if stream["gre_sequence_mode"] != "Fixed" else None,
            stream["gre_inner_ip_version"],
            gre_inner_endpoint_flow,
            gre_inner_ttl,
            gre_inner_ttl_mode,
            gre_inner_ttl_count if gre_inner_ttl_mode != "Fixed" else None,
            gre_inner_ttl_step if gre_inner_ttl_mode != "Fixed" else None,
        )
    return (
        stream["packet_type"],
        stream["vlan_enabled"],
        stream["mpls_enabled"],
        stream.get("vxlan_enabled", False),
        stream.get("gtpu_enabled", False),
        endpoint_flow,
        inner_flow,
    )


def streams_from_pcap(
    pcap_bytes: bytes,
    max_packets: int,
    stream_from_packet: Callable[[bytes, int], dict[str, Any] | None],
) -> tuple[list[dict[str, Any]], int] | TrexCallResult:
    max_packets = bounded_int(max_packets, 1, PROFILE_PCAP_MAX_PACKETS, PROFILE_PCAP_MAX_PACKETS)
    parsed_header = pcap_header(pcap_bytes)
    if isinstance(parsed_header, TrexCallResult):
        return parsed_header
    endian, timestamp_resolution, link_type = parsed_header
    if link_type != 1:
        return TrexCallResult(False, blocker="profile_pcap_linktype_unsupported", error="only EN10MB pcap files are supported")

    streams: list[dict[str, Any]] = []
    unsupported_count = 0
    expected_flow: tuple[Any, ...] | None = None
    for packet, timestamp in pcap_records(pcap_bytes, endian=endian, timestamp_resolution=timestamp_resolution):
        if len(streams) >= max_packets:
            break
        stream = stream_from_packet(packet, len(streams))
        if stream is None:
            unsupported_count += 1
            continue
        flow = stream_flow_key(stream)
        if expected_flow is None:
            expected_flow = flow
        elif flow != expected_flow:
            return TrexCallResult(
                False,
                blocker="profile_pcap_flow_unsupported",
                error="pcap must contain one supported Ethernet, ARP, IPv4, IPv4 ICMP, or IPv4/IPv6 TCP/UDP flow",
            )
        stream["_pcap_timestamp"] = timestamp
        streams.append(stream)
    if not streams:
        return TrexCallResult(
            False,
            blocker="profile_pcap_packets_missing",
            error="pcap did not contain supported Ethernet, ARP, IPv4, IPv4 ICMP, or IPv4/IPv6 TCP/UDP packets",
        )
    return streams, unsupported_count


def refresh_ipv4_packet_checksums(packet: bytearray, ip_offset: int, ihl: int, protocol: int) -> None:
    if len(packet) < ip_offset + ihl:
        return
    packet[ip_offset + 10 : ip_offset + 12] = b"\x00\x00"
    packet[ip_offset + 10 : ip_offset + 12] = struct.pack("!H", ipv4_checksum(bytes(packet[ip_offset : ip_offset + ihl])))

    total_length = int.from_bytes(packet[ip_offset + 2 : ip_offset + 4], "big")
    available_l3_length = max(0, len(packet) - ip_offset)
    l3_length = min(total_length if total_length > 0 else available_l3_length, available_l3_length)
    l4_offset = ip_offset + ihl
    l4_length = max(0, l3_length - ihl)
    if protocol == 6 and l4_length >= 20 and len(packet) >= l4_offset + l4_length:
        checksum_offset = l4_offset + 16
    elif protocol == 17 and l4_length >= 8 and len(packet) >= l4_offset + l4_length:
        checksum_offset = l4_offset + 6
    else:
        return
    packet[checksum_offset : checksum_offset + 2] = b"\x00\x00"
    pseudo_header = (
        bytes(packet[ip_offset + 12 : ip_offset + 16])
        + bytes(packet[ip_offset + 16 : ip_offset + 20])
        + struct.pack("!BBH", 0, protocol, l4_length)
    )
    checksum = internet_checksum(pseudo_header + bytes(packet[l4_offset : l4_offset + l4_length])) or 0xFFFF
    packet[checksum_offset : checksum_offset + 2] = struct.pack("!H", checksum)


def pcap_header(pcap_bytes: bytes) -> tuple[str, int, int] | TrexCallResult:
    if len(pcap_bytes) < 24:
        return TrexCallResult(False, blocker="profile_pcap_invalid", error="pcap global header is truncated")
    magic = pcap_bytes[:4]
    magic_map = {
        b"\xd4\xc3\xb2\xa1": ("<", 1_000_000),
        b"\xa1\xb2\xc3\xd4": (">", 1_000_000),
        b"\x4d\x3c\xb2\xa1": ("<", 1_000_000_000),
        b"\xa1\xb2\x3c\x4d": (">", 1_000_000_000),
    }
    if magic == b"\x0a\x0d\x0d\x0a":
        return TrexCallResult(False, blocker="profile_pcapng_unsupported", error="pcapng import is not supported")
    if magic not in magic_map:
        return TrexCallResult(False, blocker="profile_pcap_invalid", error="pcap magic is not recognized")
    endian, timestamp_resolution = magic_map[magic]
    try:
        version_major, version_minor, _thiszone, _sigfigs, _snaplen, link_type = struct.unpack(
            f"{endian}HHiIII", pcap_bytes[4:24]
        )
    except struct.error as exc:
        return TrexCallResult(False, blocker="profile_pcap_invalid", error=str(exc))
    if (version_major, version_minor) != (2, 4):
        return TrexCallResult(False, blocker="profile_pcap_version_unsupported", error="pcap version must be 2.4")
    return endian, timestamp_resolution, link_type


def pcap_records(pcap_bytes: bytes, endian: str, timestamp_resolution: int) -> list[tuple[bytes, float]]:
    records: list[tuple[bytes, float]] = []
    offset = 24
    while offset + 16 <= len(pcap_bytes):
        timestamp_seconds, timestamp_fraction, included_length, _original_length = struct.unpack(
            f"{endian}IIII", pcap_bytes[offset : offset + 16]
        )
        offset += 16
        if included_length > PROFILE_PCAP_MAX_BYTES:
            break
        next_offset = offset + included_length
        if next_offset > len(pcap_bytes):
            break
        records.append((pcap_bytes[offset:next_offset], timestamp_seconds + (timestamp_fraction / timestamp_resolution)))
        offset = next_offset
    return records


def _file_safe_stem(value: str) -> str:
    candidate = "".join(character if character.isalnum() or character in {"-", "_", "."} else "_" for character in value)
    candidate = candidate.strip("._")
    return candidate[:80] if candidate else "stream"


def _ipv4_bytes(value: str) -> bytes:
    return ipaddress.IPv4Address(value).packed
