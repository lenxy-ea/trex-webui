from __future__ import annotations

import base64
import struct

from app.trex.result import TrexCallResult
from app.trex.workbench_packet import internet_checksum, ipv4_checksum
from app.trex.workbench_pcap import (
    apply_pcap_import_options,
    clean_pcap_import_prefix,
    decode_pcap_import_content,
    normalize_pcap_file_name,
    normalize_pcap_import_options,
    pcap_bytes_for_packets,
    pcap_header,
    pcap_import_ipv4_field_patch,
    pcap_import_ipg_seconds,
    pcap_import_rewrite_ipv4_packet,
    pcap_import_rewrite_field,
    pcap_import_rewrite_state,
    pcap_records,
    streams_from_pcap,
)


def test_normalize_pcap_file_name_accepts_clean_names_and_fallbacks() -> None:
    assert normalize_pcap_file_name(None, "stream one") == "stream_one.pcap"
    assert normalize_pcap_file_name("", "..bad/name") == "bad_name.pcap"
    assert normalize_pcap_file_name("trace", "fallback") == "trace.pcap"
    assert normalize_pcap_file_name("trace.cap", "fallback") == "trace.cap"


def test_normalize_pcap_file_name_rejects_paths_and_bad_suffixes() -> None:
    path_value = normalize_pcap_file_name("../trace.pcap", "fallback")
    bad_suffix = normalize_pcap_file_name("trace.txt", "fallback")
    padded = normalize_pcap_file_name(" trace.pcap ", "fallback")
    non_text = normalize_pcap_file_name(123, "fallback")

    for result in (path_value, bad_suffix, padded, non_text):
        assert isinstance(result, TrexCallResult)
        assert result.blocker == "profile_pcap_file_name_invalid"


def test_pcap_bytes_header_and_records_round_trip_packets() -> None:
    pcap_bytes = pcap_bytes_for_packets(
        [
            {"packet": b"\x01\x02", "timestamp": 1.25, "wirelen": 60},
            {"packet": b"\x03", "timestamp": "bad"},
        ]
    )

    assert pcap_header(pcap_bytes) == ("<", 1_000_000, 1)
    records = pcap_records(pcap_bytes, endian="<", timestamp_resolution=1_000_000)

    assert records == [(b"\x01\x02", 1.25), (b"\x03", 0.0)]


def test_pcap_header_rejects_invalid_and_unsupported_pcap_files() -> None:
    truncated = pcap_header(b"\xd4\xc3\xb2\xa1")
    pcapng = pcap_header(b"\x0a\x0d\x0d\x0a" + b"\x00" * 20)
    wrong_version = pcap_header(struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 3, 0, 0, 65_535, 1))

    assert isinstance(truncated, TrexCallResult)
    assert truncated.blocker == "profile_pcap_invalid"
    assert isinstance(pcapng, TrexCallResult)
    assert pcapng.blocker == "profile_pcapng_unsupported"
    assert isinstance(wrong_version, TrexCallResult)
    assert wrong_version.blocker == "profile_pcap_version_unsupported"


def test_normalize_pcap_import_options_sanitizes_original_gui_fields() -> None:
    normalized = normalize_pcap_import_options(
        {
            "name_prefix": " trace / demo ",
            "rewrite_src_enabled": True,
            "src_address": "not-an-ip",
            "src_mode": "Increment Host",
            "src_count": "32",
            "rewrite_dst_enabled": True,
            "dst_address": "30.0.0.1",
            "dst_mode": "Random Host",
            "dst_count": 64,
            "rate_mode": "ipg",
            "speedup": 2,
            "ipg": 0.25,
            "loop_count": 3,
        }
    )

    assert normalized == {
        "name_prefix": "trace_demo",
        "rewrite_src_enabled": True,
        "src_address": "16.0.0.1",
        "src_mode": "Increment Host",
        "src_count": 32,
        "rewrite_dst_enabled": True,
        "dst_address": "30.0.0.1",
        "dst_mode": "Random Host",
        "dst_count": 64,
        "rate_mode": "ipg",
        "speedup": 2.0,
        "ipg": 0.25,
        "loop_count": 3,
    }


def test_normalize_pcap_import_options_rejects_non_object() -> None:
    result = normalize_pcap_import_options(["bad"])  # type: ignore[arg-type]

    assert isinstance(result, TrexCallResult)
    assert result.blocker == "profile_pcap_import_options_invalid"


def test_decode_pcap_import_content_validates_content() -> None:
    assert decode_pcap_import_content(base64.b64encode(b"pcap-bytes").decode("ascii")) == b"pcap-bytes"

    missing = decode_pcap_import_content(None)
    invalid = decode_pcap_import_content("not base64")

    assert isinstance(missing, TrexCallResult)
    assert missing.blocker == "profile_pcap_invalid"
    assert isinstance(invalid, TrexCallResult)
    assert invalid.blocker == "profile_pcap_invalid"


def test_clean_pcap_import_prefix_and_ipg_seconds() -> None:
    assert clean_pcap_import_prefix(" . demo / flow ! ") == "demo_flow"
    assert clean_pcap_import_prefix("\x00bad") == ""
    assert pcap_import_ipg_seconds({"rate_mode": "ipg", "ipg": 0.5, "speedup": 1.0}, 1.0, 2.0, False) == 0.5
    assert pcap_import_ipg_seconds({"rate_mode": "speedup", "ipg": 0.5, "speedup": 2.0}, 1.0, 2.0, False) == 0.5
    assert pcap_import_ipg_seconds({"rate_mode": "speedup", "ipg": 0.5, "speedup": 2.0}, 1.0, 2.0, True) == 1.0


def test_pcap_import_rewrite_state_uses_first_ipv4_flow_roles() -> None:
    options = {
        "rewrite_src_enabled": True,
        "rewrite_dst_enabled": True,
    }
    streams = [
        {"packet_type": "Ethernet/IPv6/UDP"},
        {"packet_type": "Ethernet/IPv4/UDP", "ipv4_src": "10.0.0.1", "ipv4_dst": "10.0.0.2"},
        {"packet_type": "Ethernet/IPv4/UDP", "ipv4_src": "10.0.0.2", "ipv4_dst": "10.0.0.1"},
    ]

    assert pcap_import_rewrite_state(streams, options) == {"default_src": "10.0.0.1", "default_dst": "10.0.0.2"}
    assert pcap_import_rewrite_state(streams, {"rewrite_src_enabled": False, "rewrite_dst_enabled": False}) is None


def test_pcap_import_ipv4_field_patch_maps_forward_and_reverse_flows() -> None:
    options = {
        "rewrite_src_enabled": True,
        "src_mode": "Increment Host",
        "src_count": 1,
        "rewrite_dst_enabled": True,
        "dst_mode": "Random Host",
        "dst_count": 64,
    }
    rewrite_state = {"default_src": "10.0.0.1", "default_dst": "10.0.0.2"}
    forward = {"ipv4_src": "10.0.0.1", "ipv4_dst": "10.0.0.2"}
    reverse = {"ipv4_src": "10.0.0.2", "ipv4_dst": "10.0.0.1"}

    assert pcap_import_rewrite_field(forward, "10.0.0.1") == "src"
    assert pcap_import_rewrite_field(reverse, "10.0.0.1") == "dst"
    assert pcap_import_ipv4_field_patch(forward, options, rewrite_state) == {
        "ipv4_src_mode": "Increment Host",
        "ipv4_src_count": 2,
        "ipv4_src_step": 1,
        "ipv4_dst_mode": "Random Host",
        "ipv4_dst_count": 64,
        "ipv4_dst_step": 1,
    }
    assert pcap_import_ipv4_field_patch(reverse, options, rewrite_state) == {
        "ipv4_dst_mode": "Increment Host",
        "ipv4_dst_count": 2,
        "ipv4_dst_step": 1,
        "ipv4_src_mode": "Random Host",
        "ipv4_src_count": 64,
        "ipv4_src_step": 1,
    }


def test_pcap_import_rewrite_ipv4_packet_updates_addresses_and_checksums() -> None:
    ethernet = b"\xaa\xbb\xcc\xdd\xee\xff" + b"\x11\x22\x33\x44\x55\x66" + b"\x08\x00"
    ipv4 = bytes(
        [
            0x45,
            0,
            0,
            28,
            0,
            1,
            0,
            0,
            64,
            17,
            0,
            0,
            10,
            0,
            0,
            1,
            10,
            0,
            0,
            2,
        ]
    )
    udp = struct.pack("!HHHH", 1025, 12, 8, 0)
    packet = ethernet + ipv4 + udp
    rewritten = pcap_import_rewrite_ipv4_packet(
        packet,
        {"ipv4_src": "10.0.0.1", "ipv4_dst": "10.0.0.2"},
        {
            "rewrite_src_enabled": True,
            "src_address": "16.0.0.1",
            "rewrite_dst_enabled": True,
            "dst_address": "48.0.0.1",
        },
        {"default_src": "10.0.0.1", "default_dst": "10.0.0.2"},
    )

    ip_offset = 14
    udp_offset = 34
    assert rewritten[ip_offset + 12 : ip_offset + 16] == b"\x10\x00\x00\x01"
    assert rewritten[ip_offset + 16 : ip_offset + 20] == b"\x30\x00\x00\x01"
    ip_header = bytearray(rewritten[ip_offset : ip_offset + 20])
    ip_header[10:12] = b"\x00\x00"
    assert int.from_bytes(rewritten[ip_offset + 10 : ip_offset + 12], "big") == ipv4_checksum(bytes(ip_header))
    udp_segment = bytearray(rewritten[udp_offset : udp_offset + 8])
    udp_segment[6:8] = b"\x00\x00"
    expected_udp_checksum = internet_checksum(
        rewritten[ip_offset + 12 : ip_offset + 20]
        + struct.pack("!BBH", 0, 17, 8)
        + bytes(udp_segment)
    )
    assert int.from_bytes(rewritten[udp_offset + 6 : udp_offset + 8], "big") == expected_udp_checksum


def test_apply_pcap_import_options_rewrites_ipv4_stream_through_parser_callback() -> None:
    ethernet = b"\xaa\xbb\xcc\xdd\xee\xff" + b"\x11\x22\x33\x44\x55\x66" + b"\x08\x00"
    ipv4 = bytes([0x45, 0, 0, 28, 0, 1, 0, 0, 64, 17, 0, 0, 10, 0, 0, 1, 10, 0, 0, 2])
    udp = struct.pack("!HHHH", 1025, 12, 8, 0)
    stream = {
        "packet_type": "Ethernet/IPv4/UDP",
        "ipv4_src": "10.0.0.1",
        "ipv4_dst": "10.0.0.2",
        "packet_binary_base64": base64.b64encode(ethernet + ipv4 + udp).decode("ascii"),
        "_pcap_timestamp": 1.0,
    }
    options = {
        "name_prefix": "trace",
        "rewrite_src_enabled": True,
        "src_address": "16.0.0.1",
        "src_mode": "Increment Host",
        "src_count": 4,
        "rewrite_dst_enabled": True,
        "dst_address": "48.0.0.1",
        "dst_mode": "Random Host",
        "dst_count": 8,
        "rate_mode": "ipg",
        "speedup": 1.0,
        "ipg": 0.25,
        "loop_count": 3,
    }
    seen_packets: list[bytes] = []

    def stream_from_packet(packet: bytes, index: int) -> dict[str, object] | None:
        seen_packets.append(packet)
        return {
            "name": f"parsed_{index + 1}",
            "packet_type": "Ethernet/IPv4/UDP",
            "ipv4_src": "16.0.0.1",
            "ipv4_dst": "48.0.0.1",
        }

    updated = apply_pcap_import_options([stream], options, stream_from_packet)

    assert seen_packets[0][26:30] == b"\x10\x00\x00\x01"
    assert seen_packets[0][30:34] == b"\x30\x00\x00\x01"
    assert updated[0]["name"] == "trace_packet_1"
    assert updated[0]["mode"] == "burst"
    assert updated[0]["rate_value"] == 4.0
    assert updated[0]["self_start"] is True
    assert updated[0]["next_stream_id"] == 1
    assert updated[0]["action_count"] == 3
    assert updated[0]["ipv4_src_mode"] == "Increment Host"
    assert updated[0]["ipv4_dst_mode"] == "Random Host"
    assert updated[0]["_pcap_timestamp"] == 1.0


def test_streams_from_pcap_uses_parser_callbacks_and_preserves_timestamps() -> None:
    pcap_bytes = pcap_bytes_for_packets(
        [
            {"packet": b"unsupported", "timestamp": 1.0},
            {"packet": b"flow-a-1", "timestamp": 2.25},
            {"packet": b"flow-a-2", "timestamp": 3.5},
            {"packet": b"flow-a-3", "timestamp": 4.75},
        ]
    )

    def stream_from_packet(packet: bytes, index: int) -> dict[str, object] | None:
        if packet.startswith(b"unsupported"):
            return None
        return {
            "name": f"packet_{index + 1}",
            "packet_type": "Ethernet",
            "ether_src": "00:11:22:33:44:55",
            "ether_dst": "66:55:44:33:22:11",
            "vlan_enabled": False,
            "mpls_enabled": False,
            "packet": packet.decode("ascii"),
        }

    parsed = streams_from_pcap(
        pcap_bytes,
        max_packets=2,
        stream_from_packet=stream_from_packet,
    )

    assert not isinstance(parsed, TrexCallResult)
    streams, unsupported_count = parsed
    assert unsupported_count == 1
    assert [stream["name"] for stream in streams] == ["packet_1", "packet_2"]
    assert [stream["_pcap_timestamp"] for stream in streams] == [2.25, 3.5]


def test_streams_from_pcap_rejects_mixed_flows() -> None:
    pcap_bytes = pcap_bytes_for_packets(
        [
            {"packet": b"flow-a", "timestamp": 1.0},
            {"packet": b"flow-b", "timestamp": 2.0},
        ]
    )

    result = streams_from_pcap(
        pcap_bytes,
        max_packets=4,
        stream_from_packet=lambda packet, index: {
            "name": f"packet_{index + 1}",
            "packet_type": "Ethernet",
            "ether_src": "00:11:22:33:44:55",
            "ether_dst": "66:55:44:33:22:11" if packet == b"flow-a" else "66:55:44:33:22:12",
            "vlan_enabled": False,
            "mpls_enabled": False,
        },
    )

    assert isinstance(result, TrexCallResult)
    assert result.blocker == "profile_pcap_flow_unsupported"


def test_streams_from_pcap_rejects_missing_supported_packets() -> None:
    pcap_bytes = pcap_bytes_for_packets([{"packet": b"unsupported", "timestamp": 1.0}])

    result = streams_from_pcap(
        pcap_bytes,
        max_packets=4,
        stream_from_packet=lambda _packet, _index: None,
    )

    assert isinstance(result, TrexCallResult)
    assert result.blocker == "profile_pcap_packets_missing"
