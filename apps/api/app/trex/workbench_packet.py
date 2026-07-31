from __future__ import annotations

import struct
from typing import Any

from app.trex.result import TrexCallResult
from app.trex.workbench_inputs import clean_dhcp_parameter_request_list
from app.trex.workbench_values import PROFILE_MPLS_ETHER_TYPES


def internet_checksum(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    checksum = 0
    for index in range(0, len(data), 2):
        checksum += (data[index] << 8) + data[index + 1]
        checksum = (checksum & 0xFFFF) + (checksum >> 16)
    return (~checksum) & 0xFFFF


def ipv4_checksum(header: bytes) -> int:
    return internet_checksum(header)


def l4_checksum_ipv6(source: bytes, destination: bytes, protocol: int, payload: bytes) -> int:
    pseudo_header = source + destination + struct.pack("!I3xB", len(payload), protocol)
    checksum = internet_checksum(pseudo_header + payload)
    return checksum or 0xFFFF


def l4_checksum_ipv4(source: bytes, destination: bytes, protocol: int, payload: bytes) -> int:
    pseudo_header = source + destination + struct.pack("!BBH", 0, protocol, len(payload))
    checksum = internet_checksum(pseudo_header + payload)
    return checksum or 0xFFFF


def sctp_crc32c(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for octet in data:
        crc ^= octet
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0x82F63B78
            else:
                crc >>= 1
            crc &= 0xFFFFFFFF
    return (~crc) & 0xFFFFFFFF


def hex_dump_lines(packet: bytes) -> list[dict[str, str]]:
    lines: list[dict[str, str]] = []
    for offset in range(0, len(packet), 16):
        chunk = packet[offset : offset + 16]
        lines.append(
            {
                "offset": f"{offset:04x}",
                "hex": " ".join(f"{octet:02x}" for octet in chunk),
                "ascii": "".join(chr(octet) if 32 <= octet <= 126 else "." for octet in chunk),
            }
        )
    return lines


def udp_auto_length(packet: bytes, l2_header_length: int, l3_header_length: int = 20) -> int:
    return max(8, len(packet) - l2_header_length - l3_header_length)


def dns_name_bytes(name: str) -> bytes:
    labels = name.rstrip(".").split(".")
    encoded = bytearray()
    for label in labels:
        raw = label.encode("ascii")
        encoded.append(len(raw))
        encoded.extend(raw)
    encoded.append(0)
    return bytes(encoded)


def dhcp_parameter_request_list_bytes(stream: dict[str, Any], fallback: str) -> bytes:
    cleaned = clean_dhcp_parameter_request_list(stream.get("dhcp_parameter_request_list"), fallback)
    if isinstance(cleaned, TrexCallResult) or cleaned == "":
        return b""
    return bytes(int(token, 10) for token in cleaned.split(",") if token != "")


def ipv4_offsets(packet: bytes) -> tuple[int, int, int] | None:
    l2_info = packet_l2_payload_info(packet)
    if l2_info is None:
        return None
    ether_type = l2_info["ether_type"]
    ip_offset = l2_info["ip_offset"]
    if ether_type != 0x0800 or len(packet) < ip_offset + 20:
        return None
    version = packet[ip_offset] >> 4
    ihl = (packet[ip_offset] & 0x0F) * 4
    if version != 4 or ihl < 20 or len(packet) < ip_offset + ihl:
        return None
    return ip_offset, ihl, packet[ip_offset + 9]


def ipv6_offsets(packet: bytes) -> tuple[int, int, int] | None:
    l2_info = packet_l2_payload_info(packet)
    if l2_info is None:
        return None
    ether_type = l2_info["ether_type"]
    ip_offset = l2_info["ip_offset"]
    if ether_type != 0x86DD or len(packet) < ip_offset + 40:
        return None
    version = packet[ip_offset] >> 4
    if version != 6:
        return None
    return ip_offset, 40, packet[ip_offset + 6]


def packet_l2_payload_info(packet: bytes) -> dict[str, Any] | None:
    if len(packet) < 14:
        return None
    ether_type = int.from_bytes(packet[12:14], "big")
    ip_offset = 14
    vlan_stack = packet_vlan_stack_info(packet)
    vlan_info = vlan_stack[0] if vlan_stack else None
    if vlan_stack:
        ether_type = vlan_stack[-1]["inner_type"]
        ip_offset = 14 + (4 * len(vlan_stack))

    mpls_info = None
    if ether_type in PROFILE_MPLS_ETHER_TYPES:
        mpls_info = packet_mpls_stack_info(packet, ip_offset)
        if mpls_info is None:
            return None
        ip_offset = mpls_info["payload_offset"]
        if len(packet) <= ip_offset:
            return None
        version = packet[ip_offset] >> 4
        if version == 4:
            ether_type = 0x0800
        elif version == 6:
            ether_type = 0x86DD
        else:
            return None

    return {
        "ether_type": ether_type,
        "ip_offset": ip_offset,
        "vlan_info": vlan_info,
        "vlan_stack": vlan_stack,
        "mpls_info": mpls_info,
    }


def packet_mpls_stack_info(packet: bytes, offset: int) -> dict[str, Any] | None:
    labels: list[dict[str, int]] = []
    current_offset = offset
    for _ in range(8):
        if len(packet) < current_offset + 4:
            return None
        word = int.from_bytes(packet[current_offset : current_offset + 4], "big")
        labels.append(
            {
                "label": (word >> 12) & 0xFFFFF,
                "traffic_class": (word >> 9) & 0x7,
                "bottom_of_stack": (word >> 8) & 0x1,
                "ttl": word & 0xFF,
            }
        )
        current_offset += 4
        if labels[-1]["bottom_of_stack"] == 1:
            return {"labels": labels, "payload_offset": current_offset}
    return None


def packet_vlan_stack_info(packet: bytes) -> list[dict[str, int]]:
    tags: list[dict[str, int]] = []
    if len(packet) < 18:
        return tags
    ether_type = int.from_bytes(packet[12:14], "big")
    offset = 14
    vlan_tpid_values = {0x8100, 0x88A8, 0x9100}
    while len(packet) >= offset + 4 and len(tags) < 2:
        tci = int.from_bytes(packet[offset : offset + 2], "big")
        inner_type = int.from_bytes(packet[offset + 2 : offset + 4], "big")
        if ether_type not in vlan_tpid_values:
            break
        tags.append(
            {
                "tpid": ether_type,
                "priority": (tci >> 13) & 0x7,
                "cfi": (tci >> 12) & 0x1,
                "vlan": tci & 0x0FFF,
                "inner_type": inner_type,
            }
        )
        ether_type = inner_type
        offset += 4
    return tags


def packet_vlan_info(packet: bytes) -> dict[str, int] | None:
    stack = packet_vlan_stack_info(packet)
    return stack[0] if stack else None


def packet_protocol_from_binary(packet: bytes) -> int | None:
    offsets = ipv4_offsets(packet) or ipv6_offsets(packet)
    return offsets[2] if offsets is not None else None
