from __future__ import annotations

import ipaddress
import random
import struct
from typing import Any

from app.trex.workbench_inputs import packet_binary_from_base64 as _packet_binary_from_base64
from app.trex.workbench_layout import (
    workbench_gre_header_length as _gre_header_length,
    workbench_gtpu_extension_header_length as _workbench_gtpu_extension_header_length,
    workbench_gtpu_optional_header_length as _workbench_gtpu_optional_header_length,
    workbench_icmp_header_length as _icmp_header_length,
    workbench_inner_ether_type as _inner_ether_type,
    workbench_l2_header_length as _workbench_l2_header_length,
    workbench_mpls_stack as _workbench_mpls_stack,
    workbench_outer_ether_type as _outer_ether_type,
    workbench_sctp_header_length as _sctp_header_length,
    workbench_vlan_tag_count as _workbench_vlan_tag_count,
    workbench_vlan_tci as _workbench_vlan_tci,
    workbench_vlan_tpid as _workbench_vlan_tpid,
    workbench_vxlan_inner_ip_version as _workbench_vxlan_inner_ip_version,
)
from app.trex.workbench_packet import (
    dhcp_parameter_request_list_bytes as _dhcp_parameter_request_list_bytes,
    dns_name_bytes as _dns_name_bytes,
    internet_checksum as _internet_checksum,
    ipv4_checksum as _ipv4_checksum,
    l4_checksum_ipv4 as _l4_checksum_ipv4,
    l4_checksum_ipv6 as _l4_checksum_ipv6,
    sctp_crc32c as _sctp_crc32c,
)
from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version as _workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version as _workbench_gtpu_inner_ip_version,
    workbench_has_arp as _workbench_has_arp,
    workbench_has_dhcp as _workbench_has_dhcp,
    workbench_has_dns as _workbench_has_dns,
    workbench_has_gtpu as _workbench_has_gtpu,
    workbench_has_l3 as _workbench_has_l3,
    workbench_ip_version as _workbench_ip_version,
    workbench_is_icmpv6_nd as _workbench_is_icmpv6_nd,
    workbench_is_icmpv6_ra as _workbench_is_icmpv6_ra,
    workbench_is_icmpv6_rs as _workbench_is_icmpv6_rs,
)
from app.trex.workbench_transport import (
    tcp_flags_value as _tcp_flags_value,
    tcp_header_length as _tcp_header_length,
    tcp_options_bytes as _tcp_options_bytes,
)
from app.trex.workbench_values import (
    PROFILE_DEFAULT_DHCP_CLIENT_IP,
    PROFILE_DEFAULT_DHCP_CLIENT_MAC,
    PROFILE_DEFAULT_DHCP_FLAGS,
    PROFILE_DEFAULT_DHCP_HOPS,
    PROFILE_DEFAULT_DHCP_HOSTNAME,
    PROFILE_DEFAULT_DHCP_MESSAGE_TYPE,
    PROFILE_DEFAULT_DHCP_OPERATION,
    PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
    PROFILE_DEFAULT_DHCP_RELAY_IP,
    PROFILE_DEFAULT_DHCP_REQUESTED_IP,
    PROFILE_DEFAULT_DHCP_SECONDS,
    PROFILE_DEFAULT_DHCP_SERVER_ID,
    PROFILE_DEFAULT_DHCP_SERVER_IP,
    PROFILE_DEFAULT_DHCP_XID,
    PROFILE_DEFAULT_DHCP_YOUR_IP,
    PROFILE_DEFAULT_DNS_ANSWER_IPV4,
    PROFILE_DEFAULT_DNS_ANSWER_TTL,
    PROFILE_DEFAULT_DNS_FLAGS,
    PROFILE_DEFAULT_DNS_QUERY_CLASS,
    PROFILE_DEFAULT_DNS_QUERY_NAME,
    PROFILE_DEFAULT_DNS_QUERY_TYPE,
    PROFILE_DEFAULT_DNS_TRANSACTION_ID,
    PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT,
    PROFILE_DHCP_MIN_PAYLOAD_BYTES,
)


def build_profile_packet(stream: dict[str, Any]) -> bytes:
    return _build_profile_packet(stream)


def dns_query_bytes(stream: dict[str, Any]) -> bytes:
    return _dns_query_bytes(stream)


def _build_profile_packet(stream: dict[str, Any]) -> bytes:
    packet_binary = stream.get("packet_binary_base64")
    decoded = _packet_binary_from_base64(packet_binary)
    if isinstance(decoded, bytes):
        return decoded
    if _workbench_has_arp(stream):
        return _build_arp_packet(stream)
    if not _workbench_has_l3(stream):
        return _build_ethernet_packet(stream)
    if _workbench_ip_version(stream) == 6:
        return _build_ipv6_packet(stream)
    return _build_ipv4_packet(stream)


def _build_ethernet_packet(stream: dict[str, Any]) -> bytes:
    target_length = max(60, stream["frame_length"] - 4)
    payload_len = max(0, target_length - _workbench_l2_header_length(stream))
    return _ethernet_header(stream) + _payload_bytes(stream, payload_len)


def _build_arp_packet(stream: dict[str, Any]) -> bytes:
    target_length = max(60, stream["frame_length"] - 4)
    l2_header_length = _workbench_l2_header_length(stream)
    arp_header = _arp_header(stream)
    payload_len = max(0, target_length - l2_header_length - len(arp_header))
    return _ethernet_header(stream) + arp_header + _payload_bytes(stream, payload_len)


def _build_ipv4_packet(stream: dict[str, Any]) -> bytes:
    target_length = max(60, stream["frame_length"] - 4)
    if stream["packet_type"].endswith("/UDP"):
        protocol = 17
        l4_header_length = 8
    elif stream["packet_type"].endswith("/TCP"):
        protocol = 6
        l4_header_length = _tcp_header_length(stream)
    elif stream["packet_type"].endswith("/SCTP"):
        protocol = 132
        l4_header_length = _sctp_header_length(stream)
    elif stream["packet_type"].endswith("/ICMP"):
        protocol = 1
        l4_header_length = _icmp_header_length(stream)
    elif stream["packet_type"].endswith("/GRE"):
        protocol = 47
        l4_header_length = _gre_header_length(stream)
    else:
        protocol = 0
        l4_header_length = 0
    l2_header_length = _workbench_l2_header_length(stream)
    payload_len = max(0, target_length - l2_header_length - 20 - l4_header_length)
    if _workbench_has_gtpu(stream):
        payload = _gtpu_payload_bytes(stream, payload_len)
    elif stream.get("vxlan_enabled"):
        payload = _vxlan_payload_bytes(stream, payload_len)
    elif protocol == 47:
        payload = _gre_payload_bytes(stream, payload_len)
    elif protocol == 17:
        payload = _udp_payload_bytes(stream, payload_len)
    elif protocol == 132:
        payload = _sctp_payload_bytes(stream, payload_len)
    else:
        payload = _payload_bytes(stream, payload_len)
    source = _ipv4_bytes(stream["ipv4_src"])
    destination = _ipv4_bytes(stream["ipv4_dst"])
    if protocol == 17:
        l4_header = _udp_header(stream, len(payload))
    elif protocol == 6:
        l4_header_without_checksum = _tcp_header(stream)
        checksum = _l4_checksum_ipv4(source, destination, protocol, l4_header_without_checksum + payload)
        l4_header = _tcp_header(stream, checksum)
    elif protocol == 132:
        l4_header = _sctp_header(stream, payload)
    elif protocol == 1:
        l4_header_without_checksum = _icmp_header(stream)
        checksum = _internet_checksum(l4_header_without_checksum + payload)
        l4_header = _icmp_header(stream, checksum)
    elif protocol == 47:
        l4_header = _gre_header(stream, payload)
    else:
        l4_header = b""
    total_length = 20 + len(l4_header) + len(payload)
    ipv4_flags_fragment = (
        (0x4000 if stream["ipv4_flag_df"] else 0)
        | (0x2000 if stream["ipv4_flag_mf"] else 0)
        | (stream["ipv4_fragment_offset"] & 0x1FFF)
    )
    ip_without_checksum = struct.pack(
        "!BBHHHBBH4s4s",
        0x45,
        ((stream["ipv4_dscp"] & 0x3F) << 2) | (stream["ipv4_ecn"] & 0x03),
        total_length,
        stream["ipv4_id"],
        ipv4_flags_fragment,
        stream["ipv4_ttl"],
        protocol,
        0,
        source,
        destination,
    )
    ip_checksum = int(stream["ipv4_checksum"], 16) if stream["ipv4_checksum_override"] else _ipv4_checksum(ip_without_checksum)
    ip_header = ip_without_checksum[:10] + struct.pack("!H", ip_checksum) + ip_without_checksum[12:]
    return _ethernet_header(stream) + ip_header + l4_header + payload


def _build_ipv6_packet(stream: dict[str, Any]) -> bytes:
    target_length = max(60, stream["frame_length"] - 4)
    if stream["packet_type"].endswith("/UDP"):
        protocol = 17
        l4_header_length = 8
    elif stream["packet_type"].endswith("/TCP"):
        protocol = 6
        l4_header_length = _tcp_header_length(stream)
    elif stream["packet_type"].endswith("/SCTP"):
        protocol = 132
        l4_header_length = _sctp_header_length(stream)
    elif stream["packet_type"].endswith("/ICMPv6"):
        protocol = 58
        l4_header_length = _icmp_header_length(stream)
    elif stream["packet_type"].endswith("/GRE"):
        protocol = 47
        l4_header_length = _gre_header_length(stream)
    else:
        protocol = 59
        l4_header_length = 0
    l2_header_length = _workbench_l2_header_length(stream)
    payload_len = max(0, target_length - l2_header_length - 40 - l4_header_length)
    if protocol == 47:
        payload = _gre_payload_bytes(stream, payload_len)
    elif protocol == 17:
        payload = _udp_payload_bytes(stream, payload_len)
    elif protocol == 132:
        payload = _sctp_payload_bytes(stream, payload_len)
    else:
        payload = _payload_bytes(stream, payload_len)
    l4_length = l4_header_length + len(payload)
    source = _ipv6_bytes(stream["ipv6_src"])
    destination = _ipv6_bytes(stream["ipv6_dst"])
    if protocol == 17:
        l4_header_without_checksum = _udp_header(stream, len(payload))
        checksum = _l4_checksum_ipv6(source, destination, protocol, l4_header_without_checksum + payload)
        l4_header = _udp_header(stream, len(payload), checksum)
    elif protocol == 6:
        l4_header_without_checksum = _tcp_header(stream)
        checksum = _l4_checksum_ipv6(source, destination, protocol, l4_header_without_checksum + payload)
        l4_header = _tcp_header(stream, checksum)
    elif protocol == 132:
        l4_header = _sctp_header(stream, payload)
    elif protocol == 58:
        l4_header_without_checksum = _icmp_header(stream)
        checksum = _l4_checksum_ipv6(source, destination, protocol, l4_header_without_checksum + payload)
        l4_header = _icmp_header(stream, checksum)
    elif protocol == 47:
        l4_header = _gre_header(stream, payload)
    else:
        l4_header = b""
    ipv6_header = struct.pack(
        "!IHBB16s16s",
        0x60000000 | ((stream["ipv6_traffic_class"] & 0xFF) << 20) | (stream["ipv6_flow_label"] & 0xFFFFF),
        l4_length,
        protocol,
        stream["ipv6_hop_limit"],
        source,
        destination,
    )
    return _ethernet_header(stream) + ipv6_header + l4_header + payload


def _vxlan_payload_bytes(stream: dict[str, Any], outer_payload_length: int) -> bytes:
    inner_ip_version = _workbench_vxlan_inner_ip_version(stream)
    inner_ip_header_length = 40 if inner_ip_version == "IPv6" else 20
    minimum_inner = 8 + 14 + inner_ip_header_length + 8
    inner_payload_length = max(0, outer_payload_length - minimum_inner)
    inner_payload = _payload_bytes(stream, inner_payload_length)
    if inner_ip_version == "IPv6":
        source = _ipv6_bytes(stream["vxlan_inner_ipv6_src"])
        destination = _ipv6_bytes(stream["vxlan_inner_ipv6_dst"])
        inner_udp_without_checksum = struct.pack(
            "!HHHH",
            stream["vxlan_inner_l4_src_port"],
            stream["vxlan_inner_l4_dst_port"],
            8 + len(inner_payload),
            0,
        )
        inner_udp_checksum = _l4_checksum_ipv6(source, destination, 17, inner_udp_without_checksum + inner_payload)
        inner_udp = struct.pack(
            "!HHHH",
            stream["vxlan_inner_l4_src_port"],
            stream["vxlan_inner_l4_dst_port"],
            8 + len(inner_payload),
            inner_udp_checksum,
        )
        inner_ip = struct.pack(
            "!IHBB16s16s",
            0x60000000,
            len(inner_udp) + len(inner_payload),
            17,
            stream["vxlan_inner_ipv6_hop_limit"],
            source,
            destination,
        )
        inner_ethertype = 0x86DD
    else:
        inner_udp = struct.pack(
            "!HHHH",
            stream["vxlan_inner_l4_src_port"],
            stream["vxlan_inner_l4_dst_port"],
            8 + len(inner_payload),
            0,
        )
        inner_total_length = 20 + len(inner_udp) + len(inner_payload)
        inner_ip_without_checksum = struct.pack(
            "!BBHHHBBH4s4s",
            0x45,
            0,
            inner_total_length,
            0x04D2,
            0,
            stream["vxlan_inner_ipv4_ttl"],
            17,
            0,
            _ipv4_bytes(stream["vxlan_inner_ipv4_src"]),
            _ipv4_bytes(stream["vxlan_inner_ipv4_dst"]),
        )
        inner_ip_checksum = _ipv4_checksum(inner_ip_without_checksum)
        inner_ip = inner_ip_without_checksum[:10] + struct.pack("!H", inner_ip_checksum) + inner_ip_without_checksum[12:]
        inner_ethertype = 0x0800
    inner_ethernet = (
        _mac_bytes(stream["vxlan_inner_ether_dst"])
        + _mac_bytes(stream["vxlan_inner_ether_src"])
        + struct.pack("!H", inner_ethertype)
    )
    vxlan_header = b"\x08\x00\x00\x00" + int(stream["vxlan_vni"]).to_bytes(3, "big") + b"\x00"
    return vxlan_header + inner_ethernet + inner_ip + inner_udp + inner_payload


def _gtpu_payload_bytes(stream: dict[str, Any], outer_payload_length: int) -> bytes:
    optional_header_length = _workbench_gtpu_optional_header_length(stream)
    extension_header_length = _workbench_gtpu_extension_header_length(stream)
    inner_ip_version = _workbench_gtpu_inner_ip_version(stream)
    inner_ip_header_length = 40 if inner_ip_version == "IPv6" else 20
    inner_payload_length = max(
        0, outer_payload_length - 8 - optional_header_length - extension_header_length - inner_ip_header_length - 8
    )
    inner_payload = _payload_bytes(stream, inner_payload_length)
    if inner_ip_version == "IPv6":
        source = _ipv6_bytes(stream["gtpu_inner_ipv6_src"])
        destination = _ipv6_bytes(stream["gtpu_inner_ipv6_dst"])
        inner_udp_without_checksum = struct.pack(
            "!HHHH",
            stream["gtpu_inner_l4_src_port"],
            stream["gtpu_inner_l4_dst_port"],
            8 + len(inner_payload),
            0,
        )
        inner_udp_checksum = _l4_checksum_ipv6(source, destination, 17, inner_udp_without_checksum + inner_payload)
        inner_udp = struct.pack(
            "!HHHH",
            stream["gtpu_inner_l4_src_port"],
            stream["gtpu_inner_l4_dst_port"],
            8 + len(inner_payload),
            inner_udp_checksum,
        )
        inner_ip = struct.pack(
            "!IHBB16s16s",
            0x60000000,
            len(inner_udp) + len(inner_payload),
            17,
            stream["gtpu_inner_ipv6_hop_limit"],
            source,
            destination,
        )
    else:
        inner_udp = struct.pack(
            "!HHHH",
            stream["gtpu_inner_l4_src_port"],
            stream["gtpu_inner_l4_dst_port"],
            8 + len(inner_payload),
            0,
        )
        inner_total_length = 20 + len(inner_udp) + len(inner_payload)
        inner_ip_without_checksum = struct.pack(
            "!BBHHHBBH4s4s",
            0x45,
            0,
            inner_total_length,
            0x04D2,
            0,
            stream["gtpu_inner_ipv4_ttl"],
            17,
            0,
            _ipv4_bytes(stream["gtpu_inner_ipv4_src"]),
            _ipv4_bytes(stream["gtpu_inner_ipv4_dst"]),
        )
        inner_ip_checksum = _ipv4_checksum(inner_ip_without_checksum)
        inner_ip = inner_ip_without_checksum[:10] + struct.pack("!H", inner_ip_checksum) + inner_ip_without_checksum[12:]
    inner_packet = inner_ip + inner_udp + inner_payload
    flags = 0x30
    if stream.get("gtpu_extension_enabled"):
        flags |= 0x04
    if stream.get("gtpu_sequence_enabled"):
        flags |= 0x02
    if stream.get("gtpu_npdu_enabled"):
        flags |= 0x01
    optional_header = b""
    if optional_header_length:
        optional_header = struct.pack(
            "!HBB",
            stream["gtpu_sequence"] & 0xFFFF,
            stream["gtpu_npdu"] & 0xFF if stream.get("gtpu_npdu_enabled") else 0,
            PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT if stream.get("gtpu_extension_enabled") else 0,
        )
    extension_header = b""
    if stream.get("gtpu_extension_enabled"):
        extension_header = struct.pack(
            "!BHB",
            1,
            stream["gtpu_extension_udp_port"] & 0xFFFF,
            0,
        )
    gtpu_header = struct.pack(
        "!BBHI",
        flags,
        stream["gtpu_message_type"] & 0xFF,
        (optional_header_length + extension_header_length + len(inner_packet)) & 0xFFFF,
        stream["gtpu_teid"] & 0xFFFFFFFF,
    )
    return gtpu_header + optional_header + extension_header + inner_packet


def _gre_payload_bytes(stream: dict[str, Any], gre_payload_length: int) -> bytes:
    if _workbench_gre_inner_ip_version(stream) == "IPv6":
        inner_payload_length = max(0, gre_payload_length - 40 - 8)
        inner_payload = _payload_bytes(stream, inner_payload_length)
        source = _ipv6_bytes(stream["gre_inner_ipv6_src"])
        destination = _ipv6_bytes(stream["gre_inner_ipv6_dst"])
        inner_udp_without_checksum = struct.pack(
            "!HHHH",
            stream["gre_inner_l4_src_port"],
            stream["gre_inner_l4_dst_port"],
            8 + len(inner_payload),
            0,
        )
        udp_checksum = _l4_checksum_ipv6(source, destination, 17, inner_udp_without_checksum + inner_payload)
        inner_udp = inner_udp_without_checksum[:6] + struct.pack("!H", udp_checksum)
        version_class_flow = 0x60000000
        inner_ip = struct.pack(
            "!IHBB16s16s",
            version_class_flow,
            len(inner_udp) + len(inner_payload),
            17,
            stream["gre_inner_ipv6_hop_limit"],
            source,
            destination,
        )
        return inner_ip + inner_udp + inner_payload

    inner_payload_length = max(0, gre_payload_length - 20 - 8)
    inner_payload = _payload_bytes(stream, inner_payload_length)
    inner_udp = struct.pack(
        "!HHHH",
        stream["gre_inner_l4_src_port"],
        stream["gre_inner_l4_dst_port"],
        8 + len(inner_payload),
        0,
    )
    inner_total_length = 20 + len(inner_udp) + len(inner_payload)
    inner_ip_without_checksum = struct.pack(
        "!BBHHHBBH4s4s",
        0x45,
        0,
        inner_total_length,
        0x04D2,
        0,
        stream["gre_inner_ipv4_ttl"],
        17,
        0,
        _ipv4_bytes(stream["gre_inner_ipv4_src"]),
        _ipv4_bytes(stream["gre_inner_ipv4_dst"]),
    )
    inner_ip_checksum = _ipv4_checksum(inner_ip_without_checksum)
    inner_ip = inner_ip_without_checksum[:10] + struct.pack("!H", inner_ip_checksum) + inner_ip_without_checksum[12:]
    return inner_ip + inner_udp + inner_payload


def _gre_header(stream: dict[str, Any], payload: bytes) -> bytes:
    flags = 0
    option_bytes = b""
    if stream.get("gre_checksum_present"):
        flags |= 0x8000
        option_bytes += b"\x00\x00\x00\x00"
    if stream.get("gre_key_present"):
        flags |= 0x2000
        option_bytes += int(stream["gre_key"]).to_bytes(4, "big")
    if stream.get("gre_sequence_present"):
        flags |= 0x1000
        option_bytes += int(stream["gre_sequence"]).to_bytes(4, "big")
    header = struct.pack("!HH", flags, int(stream["gre_protocol_type"], 16)) + option_bytes
    if stream.get("gre_checksum_present"):
        checksum = int(stream["gre_checksum"], 16) if stream.get("gre_checksum_override") else _internet_checksum(header + payload)
        header = header[:4] + struct.pack("!H", checksum & 0xFFFF) + header[6:]
    return header


def _sctp_payload_bytes(stream: dict[str, Any], length: int) -> bytes:
    return _payload_bytes(stream, length)


def _sctp_header(stream: dict[str, Any], payload: bytes) -> bytes:
    chunk_length = 16 + len(payload)
    header_without_checksum = struct.pack(
        "!HHI",
        stream["l4_src_port"],
        stream["l4_dst_port"],
        stream["sctp_verification_tag"],
    ) + b"\x00\x00\x00\x00"
    data_chunk = struct.pack(
        "!BBHIHHI",
        0,
        stream["sctp_data_flags"] & 0xFF,
        chunk_length & 0xFFFF,
        stream["sctp_tsn"],
        stream["sctp_stream_id"],
        stream["sctp_stream_sequence"],
        stream["sctp_payload_protocol_id"],
    )
    segment = header_without_checksum + data_chunk + payload
    checksum = int(stream["sctp_checksum"], 16) if stream.get("sctp_checksum_override") else _sctp_crc32c(segment)
    return header_without_checksum[:8] + struct.pack("<I", checksum & 0xFFFFFFFF) + data_chunk


def _ethernet_header(stream: dict[str, Any]) -> bytes:
    ethernet = _mac_bytes(stream["ether_dst"]) + _mac_bytes(stream["ether_src"])
    vlan_count = _workbench_vlan_tag_count(stream)
    if vlan_count:
        for vlan_index in range(1, vlan_count + 1):
            tpid = _outer_ether_type(stream) if vlan_index == 1 else _workbench_vlan_tpid(stream, vlan_index)
            ethernet += struct.pack(
                "!HH",
                tpid,
                _workbench_vlan_tci(stream, vlan_index),
            )
        ethernet += struct.pack("!H", _inner_ether_type(stream))
    else:
        ethernet += struct.pack("!H", _outer_ether_type(stream))
    if stream["mpls_enabled"]:
        ethernet += _mpls_header(stream)
    return ethernet


def _mpls_header(stream: dict[str, Any]) -> bytes:
    words = []
    for label in _workbench_mpls_stack(stream):
        word = (
            ((label["label"] & 0xFFFFF) << 12)
            | ((label["traffic_class"] & 0x7) << 9)
            | ((label["bottom_of_stack"] & 0x1) << 8)
            | (label["ttl"] & 0xFF)
        )
        words.append(struct.pack("!I", word))
    return b"".join(words)


def _payload_bytes(stream: dict[str, Any], length: int) -> bytes:
    if length <= 0:
        return b""
    if not stream.get("payload_enabled", True):
        return b"\x00" * length

    payload_type = stream.get("payload_type")
    if payload_type == "Increment Byte":
        source = bytes(range(1, 256))
        return _repeat_payload_bytes(source, length)
    if payload_type == "Decrement Byte":
        source = bytes(range(255, -1, -1))
        return _repeat_payload_bytes(source, length)
    if payload_type == "Random":
        hex_text = "43"
        while len(hex_text) < length * 2:
            hex_text += f"{random.getrandbits(32):x}"
        return bytes.fromhex(hex_text[: length * 2])
    return _payload_pattern_bytes(stream["payload_pattern"], length)


def _udp_payload_bytes(stream: dict[str, Any], length: int) -> bytes:
    if length <= 0:
        return b""
    if _workbench_has_dhcp(stream):
        dhcp_payload = _dhcp_message_bytes(stream)
        if len(dhcp_payload) >= length:
            return dhcp_payload[:length]
        return dhcp_payload + _payload_bytes(stream, length - len(dhcp_payload))
    if not _workbench_has_dns(stream):
        return _payload_bytes(stream, length)
    dns_payload = _dns_query_bytes(stream)
    if len(dns_payload) >= length:
        return dns_payload[:length]
    return dns_payload + _payload_bytes(stream, length - len(dns_payload))


def _dhcp_message_bytes(stream: dict[str, Any]) -> bytes:
    client_mac = _mac_bytes(stream.get("dhcp_client_mac", PROFILE_DEFAULT_DHCP_CLIENT_MAC))
    flags = int(str(stream.get("dhcp_flags", PROFILE_DEFAULT_DHCP_FLAGS)), 16) & 0xFFFF
    operation = int(stream.get("dhcp_operation", PROFILE_DEFAULT_DHCP_OPERATION)) & 0xFF
    hops = int(stream.get("dhcp_hops", PROFILE_DEFAULT_DHCP_HOPS)) & 0xFF
    seconds = int(stream.get("dhcp_seconds", PROFILE_DEFAULT_DHCP_SECONDS)) & 0xFFFF
    client_ip = _ipv4_bytes(str(stream.get("dhcp_client_ip", PROFILE_DEFAULT_DHCP_CLIENT_IP)))
    your_ip = _ipv4_bytes(str(stream.get("dhcp_your_ip", PROFILE_DEFAULT_DHCP_YOUR_IP)))
    server_ip = _ipv4_bytes(str(stream.get("dhcp_server_ip", PROFILE_DEFAULT_DHCP_SERVER_IP)))
    relay_ip = _ipv4_bytes(str(stream.get("dhcp_relay_ip", PROFILE_DEFAULT_DHCP_RELAY_IP)))
    bootp_header = struct.pack(
        "!BBBBIHH4s4s4s4s16s64s128s",
        operation,
        1,
        6,
        hops,
        int(stream.get("dhcp_xid", PROFILE_DEFAULT_DHCP_XID)) & 0xFFFFFFFF,
        seconds,
        flags,
        client_ip,
        your_ip,
        server_ip,
        relay_ip,
        client_mac + (b"\x00" * 10),
        b"\x00" * 64,
        b"\x00" * 128,
    )
    options = bytearray(b"\x63\x82\x53\x63")
    _dhcp_add_option(options, 53, bytes([int(stream.get("dhcp_message_type", PROFILE_DEFAULT_DHCP_MESSAGE_TYPE)) & 0xFF]))
    parameter_request = _dhcp_parameter_request_list_bytes(stream, PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
    if parameter_request:
        _dhcp_add_option(options, 55, parameter_request)
    hostname = str(stream.get("dhcp_hostname", PROFILE_DEFAULT_DHCP_HOSTNAME))
    if hostname:
        _dhcp_add_option(options, 12, hostname.encode("ascii"))
    requested_ip = str(stream.get("dhcp_requested_ip", PROFILE_DEFAULT_DHCP_REQUESTED_IP))
    if requested_ip != "0.0.0.0":
        _dhcp_add_option(options, 50, _ipv4_bytes(requested_ip))
    server_id = str(stream.get("dhcp_server_id", PROFILE_DEFAULT_DHCP_SERVER_ID))
    if server_id != "0.0.0.0":
        _dhcp_add_option(options, 54, _ipv4_bytes(server_id))
    for field, option_code in (
        ("dhcp_lease_time", 51),
        ("dhcp_renewal_time", 58),
        ("dhcp_rebinding_time", 59),
    ):
        value = int(stream.get(field, 0) or 0)
        if value > 0:
            _dhcp_add_option(options, option_code, (value & 0xFFFFFFFF).to_bytes(4, "big"))
    options.append(255)
    payload = bootp_header + bytes(options)
    if len(payload) < PROFILE_DHCP_MIN_PAYLOAD_BYTES:
        payload += b"\x00" * (PROFILE_DHCP_MIN_PAYLOAD_BYTES - len(payload))
    return payload


def _dhcp_add_option(options: bytearray, code: int, value: bytes) -> None:
    options.append(code & 0xFF)
    options.append(len(value) & 0xFF)
    options.extend(value)


def _dns_query_bytes(stream: dict[str, Any]) -> bytes:
    question = _dns_name_bytes(str(stream.get("dns_query_name", PROFILE_DEFAULT_DNS_QUERY_NAME))) + struct.pack(
        "!HH",
        int(stream.get("dns_query_type", PROFILE_DEFAULT_DNS_QUERY_TYPE)) & 0xFFFF,
        int(stream.get("dns_query_class", PROFILE_DEFAULT_DNS_QUERY_CLASS)) & 0xFFFF,
    )
    answer = b""
    if stream.get("dns_answer_enabled") is True:
        answer = (
            b"\xc0\x0c"
            + struct.pack(
                "!HHIH",
                1,
                int(stream.get("dns_query_class", PROFILE_DEFAULT_DNS_QUERY_CLASS)) & 0xFFFF,
                int(stream.get("dns_answer_ttl", PROFILE_DEFAULT_DNS_ANSWER_TTL)) & 0xFFFFFFFF,
                4,
            )
            + _ipv4_bytes(str(stream.get("dns_answer_ipv4", PROFILE_DEFAULT_DNS_ANSWER_IPV4)))
        )
    return (
        struct.pack(
            "!HHHHHH",
            int(stream.get("dns_transaction_id", PROFILE_DEFAULT_DNS_TRANSACTION_ID)) & 0xFFFF,
            int(str(stream.get("dns_flags", PROFILE_DEFAULT_DNS_FLAGS)), 16) & 0xFFFF,
            1,
            1 if answer else 0,
            0,
            0,
        )
        + question
        + answer
    )


def _payload_pattern_bytes(pattern: str, length: int) -> bytes:
    if length <= 0:
        return b""
    source = bytes.fromhex(pattern or "00")
    if not source:
        source = b"\x00"
    return _repeat_payload_bytes(source, length)


def _repeat_payload_bytes(source: bytes, length: int) -> bytes:
    if not source:
        source = b"\x00"
    repeat_count = (length + len(source) - 1) // len(source)
    return (source * repeat_count)[:length]


def _mac_bytes(value: str) -> bytes:
    return bytes(int(part, 16) for part in value.split(":"))


def _ipv4_bytes(value: str) -> bytes:
    return ipaddress.ip_address(value).packed


def _ipv6_bytes(value: str) -> bytes:
    return ipaddress.ip_address(value).packed


def _udp_header(stream: dict[str, Any], payload_length: int, checksum: int = 0) -> bytes:
    udp_length = stream["udp_length"] if stream["udp_length_override"] else max(8, 8 + payload_length)
    header_checksum = int(stream["udp_checksum"], 16) if stream["udp_checksum_override"] else checksum
    return struct.pack("!HHHH", stream["l4_src_port"], stream["l4_dst_port"], udp_length, header_checksum & 0xFFFF)


def _tcp_header(stream: dict[str, Any], checksum: int | None = None) -> bytes:
    flags = _tcp_flags_value(stream)
    options = _tcp_options_bytes(stream)
    data_offset_words = (20 + len(options)) // 4
    offset_flags = (data_offset_words << 12) | flags
    header_checksum = int(stream["tcp_checksum"], 16) if stream["tcp_checksum_override"] else (checksum or 0)
    return struct.pack(
        "!HHIIHHHH",
        stream["l4_src_port"],
        stream["l4_dst_port"],
        stream["tcp_sequence_number"],
        stream["tcp_ack_number"],
        offset_flags,
        stream["tcp_window"],
        header_checksum & 0xFFFF,
        stream["tcp_urgent_pointer"],
    ) + options


def _icmp_header(stream: dict[str, Any], checksum: int | None = None) -> bytes:
    header_checksum = int(stream["icmp_checksum"], 16) if stream["icmp_checksum_override"] else (checksum or 0)
    if _workbench_is_icmpv6_rs(stream):
        option = b""
        if stream.get("icmpv6_rs_include_slla"):
            option = struct.pack("!BB6s", 1, 1, _mac_bytes(stream["icmpv6_rs_slla_mac"]))
        return struct.pack(
            "!BBH",
            stream["icmp_type"],
            stream["icmp_code"],
            header_checksum & 0xFFFF,
        ) + b"\x00\x00\x00\x00" + option
    if _workbench_is_icmpv6_ra(stream):
        option = b""
        if stream.get("icmpv6_ra_include_slla"):
            option += struct.pack("!BB6s", 1, 1, _mac_bytes(stream["icmpv6_ra_slla_mac"]))
        if stream.get("icmpv6_ra_include_prefix"):
            prefix_flags = (
                (0x80 if stream.get("icmpv6_ra_prefix_on_link") else 0)
                | (0x40 if stream.get("icmpv6_ra_prefix_autonomous") else 0)
            )
            option += struct.pack(
                "!BBBBIII16s",
                3,
                4,
                stream["icmpv6_ra_prefix_length"],
                prefix_flags,
                stream["icmpv6_ra_prefix_valid_lifetime"],
                stream["icmpv6_ra_prefix_preferred_lifetime"],
                0,
                _ipv6_bytes(stream["icmpv6_ra_prefix"]),
            )
        flags = (0x80 if stream.get("icmpv6_ra_managed") else 0) | (0x40 if stream.get("icmpv6_ra_other") else 0)
        body = struct.pack(
            "!BBHII",
            stream["icmpv6_ra_cur_hop_limit"],
            flags,
            stream["icmpv6_ra_router_lifetime"],
            stream["icmpv6_ra_reachable_time"],
            stream["icmpv6_ra_retrans_timer"],
        )
        return struct.pack(
            "!BBH",
            stream["icmp_type"],
            stream["icmp_code"],
            header_checksum & 0xFFFF,
        ) + body + option
    if _workbench_is_icmpv6_nd(stream):
        option = b""
        if stream.get("icmpv6_nd_include_option"):
            option_type = 1 if int(stream["icmp_type"]) == 135 else 2
            option = struct.pack("!BB6s", option_type, 1, _mac_bytes(stream["icmpv6_nd_option_mac"]))
        if int(stream["icmp_type"]) == 136:
            flags = (
                (0x80 if stream.get("icmpv6_nd_na_router") else 0)
                | (0x40 if stream.get("icmpv6_nd_na_solicited") else 0)
                | (0x20 if stream.get("icmpv6_nd_na_override") else 0)
            )
            body = bytes([flags, 0, 0, 0]) + _ipv6_bytes(stream["icmpv6_nd_target"]) + option
        else:
            body = b"\x00\x00\x00\x00" + _ipv6_bytes(stream["icmpv6_nd_target"]) + option
        return struct.pack(
            "!BBH",
            stream["icmp_type"],
            stream["icmp_code"],
            header_checksum & 0xFFFF,
        ) + body
    return struct.pack(
        "!BBHHH",
        stream["icmp_type"],
        stream["icmp_code"],
        header_checksum & 0xFFFF,
        stream["icmp_identifier"],
        stream["icmp_sequence"],
    )


def _arp_header(stream: dict[str, Any]) -> bytes:
    return struct.pack(
        "!HHBBH6s4s6s4s",
        stream["arp_hardware_type"],
        int(stream["arp_protocol_type"], 16),
        stream["arp_hardware_size"],
        stream["arp_protocol_size"],
        stream["arp_operation"],
        _mac_bytes(stream["arp_sender_mac"]),
        _ipv4_bytes(stream["arp_sender_ip"]),
        _mac_bytes(stream["arp_target_mac"]),
        _ipv4_bytes(stream["arp_target_ip"]),
    )
