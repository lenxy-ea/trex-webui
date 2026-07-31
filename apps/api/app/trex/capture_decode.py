from __future__ import annotations

import base64
import ipaddress
import struct
from typing import Any

from app.trex.capture_files import (
    packet_bytes_from_value as _packet_bytes,
    packet_timestamp_seconds as _packet_timestamp_seconds,
)

CAPTURE_GTPU_PORT = 2152
CAPTURE_UDP_IP_TUNNEL_PORTS = {3544, 3797}
PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT = 0x40
PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT = 4789
PROFILE_MPLS_ETHER_TYPES = {0x8847, 0x8848}


def _capture_packet_record(packet: dict[str, Any]) -> dict[str, Any]:
    packet_bytes = _packet_bytes(packet.get("binary"))
    timestamp = _packet_timestamp_seconds(packet.get("ts"))
    wirelen = packet.get("wirelen")
    if not isinstance(wirelen, int):
        wirelen = len(packet_bytes)
    summary = _ethernet_summary(packet_bytes)
    return {
        "index": _safe_int(packet.get("index"), 0),
        "time": timestamp,
        "port": packet.get("port"),
        "mode": _clean_packet_text(packet.get("origin")) or _clean_packet_text(packet.get("mode")) or "-",
        "destination": summary["destination"],
        "source": summary["source"],
        "type": summary["type"],
        "length": len(packet_bytes),
        "wirelen": wirelen,
        "info": summary["info"],
        "binary_base64": base64.b64encode(packet_bytes).decode("ascii"),
        "hex_preview": packet_bytes[:64].hex(),
        "decoded_layers": _capture_decoded_layers(packet_bytes),
    }


def _clean_packet_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate or "\x00" in candidate:
        return None
    return candidate[:128]


def _safe_int(value: object, fallback: int) -> int:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return fallback


def _capture_layer(name: str, fields: list[tuple[str, object]]) -> dict[str, Any]:
    return {
        "name": name,
        "fields": [
            {"name": field_name, "value": str(value)}
            for field_name, value in fields
            if value is not None
        ],
    }


def _capture_decoded_layers(packet: bytes) -> list[dict[str, Any]]:
    if len(packet) < 14:
        return [_capture_layer("Packet", [("Status", "Short packet"), ("Length", len(packet))])]

    layers: list[dict[str, Any]] = []
    _append_ethernet_frame_layers(layers, packet, 0, len(packet), "Ethernet")
    return layers


def _append_ethernet_frame_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    name: str,
) -> None:
    frame_end = min(len(packet), packet_end)
    if frame_end < offset + 14:
        layers.append(
            _capture_layer(
                name,
                [
                    ("Status", f"Truncated {name}"),
                    ("Length", max(0, frame_end - offset)),
                ],
            )
        )
        return

    destination = _mac_text(packet[offset : offset + 6])
    source = _mac_text(packet[offset + 6 : offset + 12])
    eth_type = int.from_bytes(packet[offset + 12 : offset + 14], "big")
    layers.append(
        _capture_layer(
            name,
            [
                ("Destination", destination),
                ("Source", source),
                ("EtherType", f"0x{eth_type:04x}"),
            ],
        )
    )

    payload_offset = offset + 14
    vlan_index = 1
    while eth_type in {0x8100, 0x88A8, 0x9100} and vlan_index <= 2:
        if frame_end < payload_offset + 4:
            layers.append(_capture_layer("802.1Q VLAN", [("Status", "Truncated VLAN tag")]))
            return
        tci = int.from_bytes(packet[payload_offset : payload_offset + 2], "big")
        inner_type = int.from_bytes(packet[payload_offset + 2 : payload_offset + 4], "big")
        layers.append(
            _capture_layer(
                "802.1Q VLAN",
                [
                    ("TPID", f"0x{eth_type:04x}"),
                    ("Tag", vlan_index),
                    ("Priority", (tci >> 13) & 0x07),
                    ("DEI", (tci >> 12) & 0x01),
                    ("VLAN ID", tci & 0x0FFF),
                    ("Inner Type", f"0x{inner_type:04x}"),
                ],
            )
        )
        eth_type = inner_type
        payload_offset += 4
        vlan_index += 1

    if eth_type == 0x0800:
        _append_ipv4_layers(layers, packet, payload_offset, frame_end)
    elif eth_type == 0x86DD:
        _append_ipv6_layers(layers, packet, payload_offset, frame_end)
    elif eth_type == 0x0806:
        _append_arp_layers(layers, packet, payload_offset)
    elif eth_type in PROFILE_MPLS_ETHER_TYPES:
        _append_mpls_layers(layers, packet, payload_offset, frame_end, eth_type)
    else:
        layers.append(
            _capture_layer(
                "Payload",
                [
                    ("EtherType", f"0x{eth_type:04x}"),
                    ("Length", max(0, frame_end - payload_offset)),
                ],
            )
        )


def _append_mpls_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    eth_type: int,
) -> None:
    frame_end = min(len(packet), packet_end)
    current_offset = offset
    for stack_index in range(1, 9):
        if frame_end < current_offset + 4:
            layers.append(
                _capture_layer(
                    "MPLS",
                    [
                        ("Status", "Truncated MPLS label"),
                        ("Stack Entry", stack_index),
                        ("EtherType", f"0x{eth_type:04x}"),
                    ],
                )
            )
            return
        word = int.from_bytes(packet[current_offset : current_offset + 4], "big")
        bottom_of_stack = (word >> 8) & 0x1
        layers.append(
            _capture_layer(
                "MPLS",
                [
                    ("Stack Entry", stack_index),
                    ("EtherType", f"0x{eth_type:04x}" if stack_index == 1 else None),
                    ("Label", (word >> 12) & 0xFFFFF),
                    ("Traffic Class", (word >> 9) & 0x7),
                    ("Bottom Of Stack", bottom_of_stack),
                    ("TTL", word & 0xFF),
                ],
            )
        )
        current_offset += 4
        if bottom_of_stack == 1:
            if frame_end <= current_offset:
                layers.append(_capture_layer("MPLS Payload", [("Length", 0)]))
                return
            version = packet[current_offset] >> 4
            if version == 4:
                _append_ipv4_layers(layers, packet, current_offset, frame_end)
            elif version == 6:
                _append_ipv6_layers(layers, packet, current_offset, frame_end)
            else:
                layers.append(
                    _capture_layer(
                        "MPLS Payload",
                        [
                            ("First Nibble", f"0x{version:x}"),
                            ("Length", max(0, frame_end - current_offset)),
                        ],
                    )
                )
            return
    layers.append(_capture_layer("MPLS Payload", [("Status", "MPLS label stack too deep")]))


def _append_ipv4_layers(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int | None = None) -> None:
    frame_end = min(len(packet), packet_end) if packet_end is not None else len(packet)
    if frame_end < offset + 20:
        layers.append(_capture_layer("IPv4", [("Status", "Truncated IPv4")]))
        return
    ihl = (packet[offset] & 0x0F) * 4
    version = packet[offset] >> 4
    if version != 4 or ihl < 20 or frame_end < offset + ihl:
        layers.append(_capture_layer("IPv4", [("Status", "Malformed IPv4"), ("Version", version), ("Header Length", ihl)]))
        return
    total_length = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    packet_end = min(frame_end, offset + total_length) if total_length >= ihl else frame_end
    protocol = packet[offset + 9]
    flags_fragment = int.from_bytes(packet[offset + 6 : offset + 8], "big")
    src_ip = ".".join(str(octet) for octet in packet[offset + 12 : offset + 16])
    dst_ip = ".".join(str(octet) for octet in packet[offset + 16 : offset + 20])
    layers.append(
        _capture_layer(
            "IPv4",
            [
                ("Source", src_ip),
                ("Destination", dst_ip),
                ("Protocol", _ip_protocol_name(protocol)),
                ("Header Length", ihl),
                ("Total Length", total_length),
                ("TTL", packet[offset + 8]),
                ("DSCP", packet[offset + 1] >> 2),
                ("ECN", packet[offset + 1] & 0x03),
                ("Identification", int.from_bytes(packet[offset + 4 : offset + 6], "big")),
                ("Flags", _ipv4_flags(flags_fragment)),
                ("Fragment Offset", flags_fragment & 0x1FFF),
                ("Checksum", f"0x{int.from_bytes(packet[offset + 10 : offset + 12], 'big'):04x}"),
            ],
        )
    )
    _append_transport_layers(layers, packet, offset + ihl, packet_end, protocol, ipv6=False)


def _append_ipv6_layers(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int | None = None) -> None:
    frame_end = min(len(packet), packet_end) if packet_end is not None else len(packet)
    if frame_end < offset + 40:
        layers.append(_capture_layer("IPv6", [("Status", "Truncated IPv6")]))
        return
    version = packet[offset] >> 4
    if version != 6:
        layers.append(_capture_layer("IPv6", [("Status", "Malformed IPv6"), ("Version", version)]))
        return
    protocol = packet[offset + 6]
    payload_length = int.from_bytes(packet[offset + 4 : offset + 6], "big")
    packet_end = min(frame_end, offset + 40 + payload_length) if payload_length > 0 else frame_end
    src_ip = str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))
    dst_ip = str(ipaddress.IPv6Address(packet[offset + 24 : offset + 40]))
    traffic_class = ((packet[offset] & 0x0F) << 4) | (packet[offset + 1] >> 4)
    flow_label = ((packet[offset + 1] & 0x0F) << 16) | int.from_bytes(packet[offset + 2 : offset + 4], "big")
    layers.append(
        _capture_layer(
            "IPv6",
            [
                ("Source", src_ip),
                ("Destination", dst_ip),
                ("Next Header", _ip_protocol_name(protocol, ipv6=True)),
                ("Payload Length", payload_length),
                ("Traffic Class", traffic_class),
                ("Flow Label", flow_label),
                ("Hop Limit", packet[offset + 7]),
            ],
        )
    )
    _append_transport_layers(layers, packet, offset + 40, packet_end, protocol, ipv6=True)


def _append_transport_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    protocol: int,
    *,
    ipv6: bool,
) -> None:
    if protocol == 17:
        _append_udp_layer(layers, packet, offset, packet_end)
    elif protocol == 6:
        _append_tcp_layer(layers, packet, offset, packet_end)
    elif protocol == 132:
        _append_sctp_layer(layers, packet, offset, packet_end)
    elif protocol in {1, 58}:
        _append_icmp_layer(layers, packet, offset, protocol, ipv6=ipv6)
    elif protocol == 47:
        _append_gre_layers(layers, packet, offset)
    elif protocol in {4, 41}:
        _append_ip_tunnel_layers(layers, packet, offset, packet_end, protocol, outer_ipv6=ipv6)


def _append_udp_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> None:
    if len(packet) < offset + 8:
        layers.append(_capture_layer("UDP", [("Status", "Truncated UDP")]))
        return
    src_port, dst_port, udp_length, checksum = struct.unpack("!HHHH", packet[offset : offset + 8])
    payload_offset = offset + 8
    payload_end = min(packet_end, offset + udp_length)
    layers.append(
        _capture_layer(
            "UDP",
            [
                ("Source Port", src_port),
                ("Destination Port", dst_port),
                ("Length", udp_length),
                ("Checksum", f"0x{checksum:04x}"),
                ("Payload Length", max(0, payload_end - payload_offset)),
            ],
        )
    )
    vxlan_port_seen = (
        src_port == PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT
        or dst_port == PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT
    )
    if vxlan_port_seen and _append_vxlan_layers(layers, packet, payload_offset, payload_end):
        return
    if ({src_port, dst_port} & {CAPTURE_GTPU_PORT}) and _append_gtpu_layers(layers, packet, payload_offset, payload_end):
        return
    if ({src_port, dst_port} & CAPTURE_UDP_IP_TUNNEL_PORTS) and _append_udp_ip_tunnel_layers(
        layers,
        packet,
        payload_offset,
        payload_end,
        src_port,
        dst_port,
    ):
        return
    if (src_port == 53 or dst_port == 53) and payload_end - payload_offset >= 12:
        _append_dns_layer(layers, packet, payload_offset, payload_end)
    elif ({src_port, dst_port} & {67, 68}) and payload_end - payload_offset >= 240:
        _append_dhcp_layer(layers, packet, payload_offset, payload_end)


def _append_vxlan_layers(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> bool:
    payload_end = min(len(packet), packet_end)
    if payload_end < offset + 8:
        return False
    flags = packet[offset]
    if flags & 0x08 != 0x08:
        return False
    reserved = int.from_bytes(packet[offset + 1 : offset + 4], "big")
    vni = int.from_bytes(packet[offset + 4 : offset + 7], "big")
    vni_reserved = packet[offset + 7]
    inner_offset = offset + 8
    layers.append(
        _capture_layer(
            "VXLAN",
            [
                ("Flags", f"0x{flags:02x}"),
                ("Reserved", f"0x{reserved:06x}"),
                ("VNI", vni),
                ("VNI Reserved", f"0x{vni_reserved:02x}"),
                ("Payload Length", max(0, payload_end - inner_offset)),
            ],
        )
    )
    _append_ethernet_frame_layers(layers, packet, inner_offset, payload_end, "Inner Ethernet")
    return True


def _append_gtpu_layers(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> bool:
    payload_end = min(len(packet), packet_end)
    if payload_end < offset + 8:
        layers.append(
            _capture_layer(
                "GTP-U",
                [
                    ("Status", "Truncated GTP-U"),
                    ("Length", max(0, payload_end - offset)),
                ],
            )
        )
        return True

    flags = packet[offset]
    version = (flags >> 5) & 0x07
    protocol_type = (flags >> 4) & 0x01
    message_type = packet[offset + 1]
    payload_length = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    teid = int.from_bytes(packet[offset + 4 : offset + 8], "big")
    gtpu_end = min(payload_end, offset + 8 + payload_length)
    cursor = offset + 8
    extension_header_flag = bool(flags & 0x04)
    sequence_flag = bool(flags & 0x02)
    n_pdu_flag = bool(flags & 0x01)
    next_extension_header = 0
    fields: list[tuple[str, object]] = [
        ("Flags", f"0x{flags:02x}"),
        ("Version", version),
        ("Protocol Type", "GTP" if protocol_type else "GTP'"),
        ("Message Type", _gtpu_message_type_name(message_type)),
        ("Length", payload_length),
        ("TEID", f"0x{teid:08x}"),
        ("Extension Header", "yes" if extension_header_flag else "no"),
        ("Sequence Number Present", "yes" if sequence_flag else "no"),
        ("N-PDU Present", "yes" if n_pdu_flag else "no"),
    ]

    if version != 1 or protocol_type != 1:
        fields.append(("Status", "Unexpected GTP-U flags"))
        layers.append(_capture_layer("GTP-U", fields))
        return True

    if extension_header_flag or sequence_flag or n_pdu_flag:
        if gtpu_end < cursor + 4:
            fields.append(("Status", "Truncated GTP-U optional header"))
            layers.append(_capture_layer("GTP-U", fields))
            return True
        fields.extend(
            [
                ("Sequence", int.from_bytes(packet[cursor : cursor + 2], "big")),
                ("N-PDU Number", packet[cursor + 2]),
                ("Next Extension Header", f"0x{packet[cursor + 3]:02x}"),
            ]
        )
        next_extension_header = packet[cursor + 3]
        cursor += 4

    fields.append(("Payload Length", max(0, gtpu_end - cursor)))
    layers.append(_capture_layer("GTP-U", fields))

    if message_type != 0xFF or gtpu_end <= cursor:
        return True
    if extension_header_flag and next_extension_header:
        cursor = _append_gtpu_extension_layers(layers, packet, cursor, gtpu_end, next_extension_header)
        if gtpu_end <= cursor:
            return True

    version = packet[cursor] >> 4
    if version == 4:
        _append_ipv4_layers(layers, packet, cursor, gtpu_end)
    elif version == 6:
        _append_ipv6_layers(layers, packet, cursor, gtpu_end)
    else:
        layers.append(
            _capture_layer(
                "GTP-U Payload",
                [
                    ("First Nibble", f"0x{version:x}"),
                    ("Length", max(0, gtpu_end - cursor)),
                ],
            )
        )
    return True


def _gtpu_extension_header_name(extension_header: int) -> str:
    if extension_header == PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT:
        return f"UDP Port (0x{extension_header:02x})"
    return f"0x{extension_header:02x}"


def _append_gtpu_extension_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    next_extension_header: int,
) -> int:
    cursor = offset
    current_extension_header = next_extension_header
    extension_guard = 0
    while current_extension_header:
        fields: list[tuple[str, object]] = [
            ("Type", _gtpu_extension_header_name(current_extension_header)),
        ]
        if extension_guard >= 4:
            fields.append(("Status", "GTP-U extension chain too deep"))
            fields.append(("Next Extension Header", f"0x{current_extension_header:02x}"))
            layers.append(_capture_layer("GTP-U Extension", fields))
            return cursor
        if packet_end < cursor + 4:
            fields.extend(
                [
                    ("Status", "Truncated GTP-U extension"),
                    ("Length", max(0, packet_end - cursor)),
                ]
            )
            layers.append(_capture_layer("GTP-U Extension", fields))
            return packet_end
        extension_guard += 1
        extension_length_units = packet[cursor]
        extension_length = extension_length_units * 4
        fields.extend(
            [
                ("Length Units", extension_length_units),
                ("Length", extension_length),
            ]
        )
        if extension_length < 4:
            fields.append(("Status", "Invalid GTP-U extension length"))
            layers.append(_capture_layer("GTP-U Extension", fields))
            return cursor
        if packet_end < cursor + extension_length:
            fields.extend(
                [
                    ("Status", "Truncated GTP-U extension"),
                    ("Available Length", max(0, packet_end - cursor)),
                ]
            )
            layers.append(_capture_layer("GTP-U Extension", fields))
            return packet_end
        extension_next = packet[cursor + extension_length - 1]
        if current_extension_header == PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT:
            fields.append(("UDP Port", int.from_bytes(packet[cursor + 1 : cursor + 3], "big")))
        fields.append(("Next Extension Header", f"0x{extension_next:02x}"))
        layers.append(_capture_layer("GTP-U Extension", fields))
        cursor += extension_length
        current_extension_header = extension_next
    return cursor


def _append_ip_tunnel_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    protocol: int,
    *,
    outer_ipv6: bool,
) -> None:
    payload_end = min(len(packet), packet_end)
    inner_name = "IPv4" if protocol == 4 else "IPv6"
    outer_name = "IPv6" if outer_ipv6 else "IPv4"
    if payload_end <= offset:
        layers.append(
            _capture_layer(
                "IP Tunnel",
                [
                    ("Encapsulation", inner_name),
                    ("Outer", outer_name),
                    ("Status", "Truncated tunnel payload"),
                ],
            )
        )
        return

    version = packet[offset] >> 4
    fields: list[tuple[str, object]] = [
        ("Encapsulation", inner_name),
        ("Outer", outer_name),
        ("Payload Length", max(0, payload_end - offset)),
    ]
    if (protocol == 4 and version != 4) or (protocol == 41 and version != 6):
        fields.extend([("Status", "Unexpected inner IP version"), ("Inner Version", version)])
        layers.append(_capture_layer("IP Tunnel", fields))
        return

    layers.append(_capture_layer("IP Tunnel", fields))
    if protocol == 4:
        _append_ipv4_layers(layers, packet, offset, payload_end)
    else:
        _append_ipv6_layers(layers, packet, offset, payload_end)


def _append_udp_ip_tunnel_layers(
    layers: list[dict[str, Any]],
    packet: bytes,
    offset: int,
    packet_end: int,
    src_port: int,
    dst_port: int,
) -> bool:
    payload_end = min(len(packet), packet_end)
    if payload_end <= offset:
        return False
    version = packet[offset] >> 4
    if version not in {4, 6}:
        return False
    inner_name = "IPv4" if version == 4 else "IPv6"
    fields: list[tuple[str, object]] = [
        ("Encapsulation", inner_name),
        ("Tunnel Type", "Teredo / IP over UDP" if ({src_port, dst_port} & {3544}) else "IP over UDP"),
        ("Source Port", src_port),
        ("Destination Port", dst_port),
        ("Payload Length", max(0, payload_end - offset)),
    ]
    layers.append(_capture_layer("UDP Tunnel", fields))
    if version == 4:
        _append_ipv4_layers(layers, packet, offset, payload_end)
    else:
        _append_ipv6_layers(layers, packet, offset, payload_end)
    return True


def _append_tcp_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> None:
    if len(packet) < offset + 20:
        layers.append(_capture_layer("TCP", [("Status", "Truncated TCP")]))
        return
    src_port, dst_port = struct.unpack("!HH", packet[offset : offset + 4])
    data_offset = max(20, (packet[offset + 12] >> 4) * 4)
    options = _tcp_options_from_packet(packet, offset)
    fields: list[tuple[str, object]] = [
        ("Source Port", src_port),
        ("Destination Port", dst_port),
        ("Sequence", int.from_bytes(packet[offset + 4 : offset + 8], "big")),
        ("Acknowledge", int.from_bytes(packet[offset + 8 : offset + 12], "big")),
        ("Header Length", data_offset),
        ("Flags", _tcp_flags(packet[offset + 13])),
        ("Window", int.from_bytes(packet[offset + 14 : offset + 16], "big")),
        ("Checksum", f"0x{int.from_bytes(packet[offset + 16 : offset + 18], 'big'):04x}"),
        ("Urgent Pointer", int.from_bytes(packet[offset + 18 : offset + 20], "big")),
        ("Payload Length", max(0, packet_end - offset - data_offset)),
    ]
    if options["mss"] is not None:
        fields.append(("Option MSS", options["mss"]))
    if options["sack_permitted"]:
        fields.append(("Option SACK Permitted", "yes"))
    if options["sack"] is not None:
        sack_left_edge, sack_right_edge = options["sack"]
        fields.append(("Option SACK Left Edge", sack_left_edge))
        fields.append(("Option SACK Right Edge", sack_right_edge))
    if options["timestamp"] is not None:
        timestamp_value, timestamp_echo = options["timestamp"]
        fields.append(("Option Timestamp Value", timestamp_value))
        fields.append(("Option Timestamp Echo", timestamp_echo))
    if options["window_scale"] is not None:
        fields.append(("Option Window Scale", options["window_scale"]))
    layers.append(
        _capture_layer(
            "TCP",
            fields,
        )
    )


def _append_sctp_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> None:
    if len(packet) < offset + 12:
        layers.append(_capture_layer("SCTP", [("Status", "Truncated SCTP")]))
        return
    src_port, dst_port, verification_tag = struct.unpack("!HHI", packet[offset : offset + 8])
    checksum = int.from_bytes(packet[offset + 8 : offset + 12], "little")
    fields: list[tuple[str, object]] = [
        ("Source Port", src_port),
        ("Destination Port", dst_port),
        ("Verification Tag", f"0x{verification_tag:08x}"),
        ("Checksum", f"0x{checksum:08x}"),
    ]
    chunk_offset = offset + 12
    if len(packet) >= chunk_offset + 16:
        chunk_type = packet[chunk_offset]
        chunk_flags = packet[chunk_offset + 1]
        chunk_length = int.from_bytes(packet[chunk_offset + 2 : chunk_offset + 4], "big")
        fields.extend(
            [
                ("Chunk Type", _sctp_chunk_name(chunk_type)),
                ("Chunk Flags", f"0x{chunk_flags:02x}"),
                ("Chunk Length", chunk_length),
            ]
        )
        if chunk_type == 0:
            fields.extend(
                [
                    ("TSN", int.from_bytes(packet[chunk_offset + 4 : chunk_offset + 8], "big")),
                    ("Stream ID", int.from_bytes(packet[chunk_offset + 8 : chunk_offset + 10], "big")),
                    ("Stream Sequence", int.from_bytes(packet[chunk_offset + 10 : chunk_offset + 12], "big")),
                    ("Payload Protocol ID", int.from_bytes(packet[chunk_offset + 12 : chunk_offset + 16], "big")),
                    ("Payload Length", max(0, min(packet_end, chunk_offset + chunk_length) - chunk_offset - 16)),
                ]
            )
    layers.append(_capture_layer("SCTP", fields))


def _sctp_chunk_name(chunk_type: int) -> str:
    names = {
        0: "DATA",
        1: "INIT",
        2: "INIT ACK",
        3: "SACK",
        4: "HEARTBEAT",
        5: "HEARTBEAT ACK",
        6: "ABORT",
        7: "SHUTDOWN",
        8: "SHUTDOWN ACK",
        9: "ERROR",
        10: "COOKIE ECHO",
        11: "COOKIE ACK",
        14: "SHUTDOWN COMPLETE",
    }
    return names.get(chunk_type, str(chunk_type))


def _append_icmp_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, protocol: int, *, ipv6: bool) -> None:
    name = "ICMPv6" if ipv6 or protocol == 58 else "ICMP"
    if len(packet) < offset + 4:
        layers.append(_capture_layer(name, [("Status", f"Truncated {name}")]))
        return
    icmp_type = packet[offset]
    icmp_code = packet[offset + 1]
    fields: list[tuple[str, object]] = [
        ("Type", icmp_type),
        ("Type Name", _icmp_type_name(icmp_type, ipv6=ipv6 or protocol == 58)),
        ("Code", icmp_code),
        ("Checksum", f"0x{int.from_bytes(packet[offset + 2 : offset + 4], 'big'):04x}"),
    ]
    if icmp_type in {0, 8, 128, 129} and len(packet) >= offset + 8:
        fields.extend(
            [
                ("Identifier", int.from_bytes(packet[offset + 4 : offset + 6], "big")),
                ("Sequence", int.from_bytes(packet[offset + 6 : offset + 8], "big")),
            ]
        )
    elif (ipv6 or protocol == 58) and icmp_type in {135, 136} and len(packet) >= offset + 24:
        flags = int.from_bytes(packet[offset + 4 : offset + 8], "big")
        fields.append(("Flags", f"0x{flags:08x}"))
        fields.append(("Target", str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))))
        option = _icmpv6_options_summary(packet, offset + 24)
        if option is not None:
            fields.extend(option)
    elif (ipv6 or protocol == 58) and icmp_type == 133 and len(packet) >= offset + 8:
        fields.append(("Reserved", f"0x{int.from_bytes(packet[offset + 4 : offset + 8], 'big'):08x}"))
        option = _icmpv6_options_summary(packet, offset + 8)
        if option is not None:
            fields.extend(option)
    elif (ipv6 or protocol == 58) and icmp_type == 134 and len(packet) >= offset + 16:
        fields.extend(
            [
                ("Current Hop Limit", packet[offset + 4]),
                ("Flags", f"0x{packet[offset + 5]:02x}"),
                ("Router Lifetime", int.from_bytes(packet[offset + 6 : offset + 8], "big")),
                ("Reachable Time", int.from_bytes(packet[offset + 8 : offset + 12], "big")),
                ("Retrans Timer", int.from_bytes(packet[offset + 12 : offset + 16], "big")),
            ]
        )
        option = _icmpv6_options_summary(packet, offset + 16)
        if option is not None:
            fields.extend(option)
    layers.append(_capture_layer(name, fields))


def _append_gre_layers(layers: list[dict[str, Any]], packet: bytes, offset: int) -> None:
    if len(packet) < offset + 4:
        layers.append(_capture_layer("GRE", [("Status", "Truncated GRE")]))
        return
    flags = int.from_bytes(packet[offset : offset + 2], "big")
    protocol_type = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    cursor = offset + 4
    fields: list[tuple[str, object]] = [
        ("Flags", f"0x{flags:04x}"),
        ("Protocol Type", f"0x{protocol_type:04x}"),
    ]
    if flags & 0x8000:
        if len(packet) < cursor + 4:
            layers.append(_capture_layer("GRE", [*fields, ("Status", "Truncated GRE checksum")]))
            return
        fields.extend(
            [
                ("Checksum", f"0x{int.from_bytes(packet[cursor : cursor + 2], 'big'):04x}"),
                ("Reserved", f"0x{int.from_bytes(packet[cursor + 2 : cursor + 4], 'big'):04x}"),
            ]
        )
        cursor += 4
    if flags & 0x2000:
        if len(packet) < cursor + 4:
            layers.append(_capture_layer("GRE", [*fields, ("Status", "Truncated GRE key")]))
            return
        fields.append(("Key", f"0x{int.from_bytes(packet[cursor : cursor + 4], 'big'):08x}"))
        cursor += 4
    if flags & 0x1000:
        if len(packet) < cursor + 4:
            layers.append(_capture_layer("GRE", [*fields, ("Status", "Truncated GRE sequence")]))
            return
        fields.append(("Sequence", int.from_bytes(packet[cursor : cursor + 4], "big")))
        cursor += 4
    fields.append(("Payload Length", max(0, len(packet) - cursor)))
    layers.append(_capture_layer("GRE", fields))
    if protocol_type == 0x0800:
        _append_ipv4_layers(layers, packet, cursor)
    elif protocol_type == 0x86DD:
        _append_ipv6_layers(layers, packet, cursor)
    else:
        layers.append(
            _capture_layer(
                "GRE Payload",
                [("Protocol Type", f"0x{protocol_type:04x}"), ("Length", max(0, len(packet) - cursor))],
            )
        )


def _append_dns_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> None:
    if packet_end - offset < 12:
        layers.append(_capture_layer("DNS", [("Status", "Truncated DNS")]))
        return
    transaction_id, flags, qdcount, ancount, nscount, arcount = struct.unpack("!HHHHHH", packet[offset : offset + 12])
    query_name, query_type, query_class = _dns_query_summary(packet, offset + 12, packet_end, offset)
    fields: list[tuple[str, object]] = [
        ("Transaction ID", f"0x{transaction_id:04x}"),
        ("Flags", f"0x{flags:04x}"),
        ("QR", "response" if flags & 0x8000 else "query"),
        ("Opcode", (flags >> 11) & 0x0F),
        ("Response Code", flags & 0x0F),
        ("Questions", qdcount),
        ("Answers", ancount),
        ("Authority RRs", nscount),
        ("Additional RRs", arcount),
        ("Query Name", query_name),
        ("Query Type", query_type),
        ("Query Class", query_class),
    ]
    payload = packet[offset:packet_end]
    question_name_end = _dns_name_end_offset(payload, 12)
    answer_offset = offset + question_name_end + 4 if question_name_end is not None else None
    if ancount >= 1 and answer_offset is not None and answer_offset < packet_end:
        answer_name_end = _dns_name_end_offset(payload, answer_offset - offset)
        if answer_name_end is not None and offset + answer_name_end + 10 <= packet_end:
            answer_header_offset = offset + answer_name_end
            answer_type = int.from_bytes(packet[answer_header_offset : answer_header_offset + 2], "big")
            answer_class = int.from_bytes(packet[answer_header_offset + 2 : answer_header_offset + 4], "big")
            answer_ttl = int.from_bytes(packet[answer_header_offset + 4 : answer_header_offset + 8], "big")
            answer_length = int.from_bytes(packet[answer_header_offset + 8 : answer_header_offset + 10], "big")
            answer_value_offset = answer_header_offset + 10
            fields.extend(
                [
                    ("Answer Type", _dns_query_type_name(answer_type)),
                    ("Answer Class", _dns_query_class_name(answer_class)),
                    ("Answer TTL", answer_ttl),
                    ("Answer Length", answer_length),
                ]
            )
            if answer_type == 1 and answer_length == 4 and answer_value_offset + 4 <= packet_end:
                fields.append(("Answer IPv4", str(ipaddress.IPv4Address(packet[answer_value_offset : answer_value_offset + 4]))))
    layers.append(
        _capture_layer(
            "DNS",
            fields,
        )
    )


def _append_dhcp_layer(layers: list[dict[str, Any]], packet: bytes, offset: int, packet_end: int) -> None:
    if packet_end - offset < 240:
        layers.append(_capture_layer("DHCP", [("Status", "Truncated DHCP")]))
        return
    magic = packet[offset + 236 : offset + 240]
    fields: list[tuple[str, object]] = [
        ("Operation", _bootp_operation_name(packet[offset])),
        ("Hardware Type", packet[offset + 1]),
        ("Hardware Size", packet[offset + 2]),
        ("Hops", packet[offset + 3]),
        ("Transaction ID", f"0x{int.from_bytes(packet[offset + 4 : offset + 8], 'big'):08x}"),
        ("Seconds", int.from_bytes(packet[offset + 8 : offset + 10], "big")),
        ("Flags", f"0x{int.from_bytes(packet[offset + 10 : offset + 12], 'big'):04x}"),
        ("Client IP", str(ipaddress.IPv4Address(packet[offset + 12 : offset + 16]))),
        ("Your IP", str(ipaddress.IPv4Address(packet[offset + 16 : offset + 20]))),
        ("Server IP", str(ipaddress.IPv4Address(packet[offset + 20 : offset + 24]))),
        ("Relay IP", str(ipaddress.IPv4Address(packet[offset + 24 : offset + 28]))),
        ("Client MAC", _mac_text(packet[offset + 28 : offset + 34])),
        ("Magic Cookie", magic.hex()),
    ]
    if magic == b"\x63\x82\x53\x63":
        fields.extend(_dhcp_option_summary(packet, offset + 240, packet_end))
    else:
        fields.append(("Status", "Missing DHCP magic cookie"))
    layers.append(_capture_layer("DHCP", fields))


def _icmp_type_name(icmp_type: int, *, ipv6: bool) -> str:
    if ipv6:
        names = {
            1: "Destination Unreachable",
            2: "Packet Too Big",
            3: "Time Exceeded",
            4: "Parameter Problem",
            128: "Echo Request",
            129: "Echo Reply",
            133: "Router Solicitation",
            134: "Router Advertisement",
            135: "Neighbor Solicitation",
            136: "Neighbor Advertisement",
        }
    else:
        names = {
            0: "Echo Reply",
            3: "Destination Unreachable",
            5: "Redirect",
            8: "Echo Request",
            11: "Time Exceeded",
            12: "Parameter Problem",
        }
    return names.get(icmp_type, str(icmp_type))


def _icmpv6_options_summary(packet: bytes, offset: int) -> list[tuple[str, object]] | None:
    if len(packet) <= offset:
        return None
    fields: list[tuple[str, object]] = []
    cursor = offset
    option_guard = 0
    while cursor < len(packet):
        if len(packet) < cursor + 2:
            fields.append(("Option", "truncated"))
            break
        option_type = packet[cursor]
        option_length_units = packet[cursor + 1]
        if option_length_units <= 0:
            fields.append(("Option", f"type {option_type} length 0"))
            break
        option_length = option_length_units * 8
        if len(packet) < cursor + option_length:
            fields.append(("Option", f"type {option_type} truncated"))
            break
        fields.extend(
            [
                ("Option Type", _icmpv6_option_name(option_type)),
                ("Option Length", option_length),
            ]
        )
        if option_type in {1, 2} and option_length >= 8:
            fields.append(("Option MAC", _mac_text(packet[cursor + 2 : cursor + 8])))
        elif option_type == 3 and option_length >= 32:
            fields.extend(
                [
                    ("Prefix Length", packet[cursor + 2]),
                    ("Prefix Flags", f"0x{packet[cursor + 3]:02x}"),
                    ("Prefix Valid Lifetime", int.from_bytes(packet[cursor + 4 : cursor + 8], "big")),
                    ("Prefix Preferred Lifetime", int.from_bytes(packet[cursor + 8 : cursor + 12], "big")),
                    ("Prefix", str(ipaddress.IPv6Address(packet[cursor + 16 : cursor + 32]))),
                ]
            )
        cursor += option_length
        option_guard += 1
        if option_guard >= 16:
            fields.append(("Option", "too many options"))
            break
    return fields or None


def _icmpv6_option_name(option_type: int) -> str:
    names = {
        1: "Source Link-Layer Address",
        2: "Target Link-Layer Address",
        3: "Prefix Information",
    }
    return names.get(option_type, str(option_type))


def _dns_query_summary(
    packet: bytes,
    offset: int,
    packet_end: int,
    message_offset: int = 0,
) -> tuple[str | None, str | None, str | None]:
    labels: list[str] = []
    cursor = offset
    jumped = False
    jump_return: int | None = None
    jumps = 0
    while cursor < packet_end:
        label_length = packet[cursor]
        if label_length == 0:
            cursor += 1
            break
        if label_length & 0xC0 == 0xC0:
            if cursor + 1 >= packet_end:
                return "truncated pointer", None, None
            pointer = message_offset + (((label_length & 0x3F) << 8) | packet[cursor + 1])
            if pointer >= packet_end or jumps >= 4:
                return "invalid pointer", None, None
            if not jumped:
                jump_return = cursor + 2
                jumped = True
            cursor = pointer
            jumps += 1
            continue
        if label_length & 0xC0:
            return "invalid label", None, None
        cursor += 1
        if cursor + label_length > packet_end:
            return "truncated name", None, None
        label = packet[cursor : cursor + label_length].decode("ascii", errors="replace")
        labels.append(label)
        cursor += label_length
    query_end = jump_return if jumped and jump_return is not None else cursor
    if query_end + 4 > packet_end:
        return ".".join(labels) if labels else ".", None, None
    query_type = int.from_bytes(packet[query_end : query_end + 2], "big")
    query_class = int.from_bytes(packet[query_end + 2 : query_end + 4], "big")
    return ".".join(labels) if labels else ".", _dns_query_type_name(query_type), _dns_query_class_name(query_class)


def _dns_query_type_name(query_type: int) -> str:
    names = {1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 28: "AAAA", 33: "SRV", 255: "ANY"}
    return names.get(query_type, str(query_type))


def _dns_query_class_name(query_class: int) -> str:
    names = {1: "IN", 3: "CH", 4: "HS", 255: "ANY"}
    return names.get(query_class, str(query_class))


def _bootp_operation_name(value: int) -> str:
    if value == 1:
        return "request"
    if value == 2:
        return "reply"
    return str(value)


def _dhcp_option_summary(packet: bytes, offset: int, packet_end: int) -> list[tuple[str, object]]:
    fields: list[tuple[str, object]] = []
    cursor = offset
    while cursor < packet_end:
        option = packet[cursor]
        cursor += 1
        if option == 255:
            break
        if option == 0:
            continue
        if cursor >= packet_end:
            fields.append(("Option", f"{option} truncated"))
            break
        length = packet[cursor]
        cursor += 1
        if cursor + length > packet_end:
            fields.append(("Option", f"{option} truncated"))
            break
        value = packet[cursor : cursor + length]
        cursor += length
        if option == 53 and length >= 1:
            fields.append(("Message Type", _dhcp_message_type_name(value[0])))
        elif option == 12:
            fields.append(("Hostname", value.decode("ascii", errors="replace")))
        elif option == 50 and length == 4:
            fields.append(("Requested IP", str(ipaddress.IPv4Address(value))))
        elif option == 54 and length == 4:
            fields.append(("Server ID", str(ipaddress.IPv4Address(value))))
        elif option == 55:
            fields.append(("Parameter Request List", _dhcp_parameter_request_list_text(value)))
        elif option == 51 and length == 4:
            fields.append(("Lease Time", int.from_bytes(value, "big")))
        elif option == 58 and length == 4:
            fields.append(("Renewal Time", int.from_bytes(value, "big")))
        elif option == 59 and length == 4:
            fields.append(("Rebinding Time", int.from_bytes(value, "big")))
    return fields


def _dhcp_parameter_request_list_text(value: bytes) -> str:
    return ",".join(str(option) for option in value)


def _dhcp_message_type_from_payload(packet: bytes, offset: int, packet_end: int) -> str | None:
    if packet_end - offset < 240 or packet[offset + 236 : offset + 240] != b"\x63\x82\x53\x63":
        return None
    cursor = offset + 240
    while cursor < packet_end:
        option = packet[cursor]
        cursor += 1
        if option == 255:
            return None
        if option == 0:
            continue
        if cursor >= packet_end:
            return None
        length = packet[cursor]
        cursor += 1
        if cursor + length > packet_end:
            return None
        value = packet[cursor : cursor + length]
        cursor += length
        if option == 53 and length >= 1:
            return _dhcp_message_type_name(value[0])
    return None


def _dhcp_message_type_name(value: int) -> str:
    names = {
        1: "Discover",
        2: "Offer",
        3: "Request",
        4: "Decline",
        5: "Ack",
        6: "Nak",
        7: "Release",
        8: "Inform",
    }
    return names.get(value, str(value))


def _gtpu_message_type_name(value: int) -> str:
    names = {
        1: "Echo Request",
        2: "Echo Response",
        26: "Error Indication",
        31: "Supported Extension Headers Notification",
        254: "End Marker",
        255: "G-PDU",
    }
    label = names.get(value, "Message")
    return f"{label} ({value})"


def _append_arp_layers(layers: list[dict[str, Any]], packet: bytes, offset: int) -> None:
    if len(packet) < offset + 28:
        layers.append(_capture_layer("ARP", [("Status", "Truncated ARP")]))
        return
    hlen = packet[offset + 4]
    plen = packet[offset + 5]
    operation = int.from_bytes(packet[offset + 6 : offset + 8], "big")
    fields: list[tuple[str, object]] = [
        ("Hardware Type", int.from_bytes(packet[offset : offset + 2], "big")),
        ("Protocol Type", f"0x{int.from_bytes(packet[offset + 2 : offset + 4], 'big'):04x}"),
        ("Hardware Size", hlen),
        ("Protocol Size", plen),
        ("Operation", _arp_operation_name(operation)),
    ]
    if hlen == 6 and plen == 4 and len(packet) >= offset + 8 + (2 * hlen) + (2 * plen):
        sender_mac_offset = offset + 8
        sender_ip_offset = sender_mac_offset + hlen
        target_mac_offset = sender_ip_offset + plen
        target_ip_offset = target_mac_offset + hlen
        fields.extend(
            [
                ("Sender MAC", _mac_text(packet[sender_mac_offset : sender_mac_offset + hlen])),
                ("Sender IP", ".".join(str(octet) for octet in packet[sender_ip_offset : sender_ip_offset + plen])),
                ("Target MAC", _mac_text(packet[target_mac_offset : target_mac_offset + hlen])),
                ("Target IP", ".".join(str(octet) for octet in packet[target_ip_offset : target_ip_offset + plen])),
            ]
        )
    else:
        fields.append(("Status", "Unsupported ARP address sizes"))
    layers.append(_capture_layer("ARP", fields))


def _ip_protocol_name(protocol: int, *, ipv6: bool = False) -> str:
    names = {1: "ICMP", 4: "IPv4", 6: "TCP", 17: "UDP", 41: "IPv6", 47: "GRE", 58: "ICMPv6", 132: "SCTP"}
    return names.get(protocol, f"{'IPv6' if ipv6 else 'IP'} protocol {protocol}")


def _ipv4_flags(flags_fragment: int) -> str:
    flags = []
    if flags_fragment & 0x8000:
        flags.append("Reserved")
    if flags_fragment & 0x4000:
        flags.append("DF")
    if flags_fragment & 0x2000:
        flags.append("MF")
    return ", ".join(flags) if flags else "-"


def _arp_operation_name(operation: int) -> str:
    if operation == 1:
        return "request"
    if operation == 2:
        return "reply"
    return str(operation)


def _ethernet_summary(packet: bytes) -> dict[str, str]:
    if len(packet) < 14:
        return {"destination": "-", "source": "-", "type": "-", "info": "Short packet"}
    destination = _mac_text(packet[0:6])
    source = _mac_text(packet[6:12])
    eth_type = int.from_bytes(packet[12:14], "big")
    offset = 14
    vlan_ids: list[int] = []
    while eth_type in {0x8100, 0x88A8, 0x9100} and len(packet) >= offset + 4 and len(vlan_ids) < 2:
        tci = int.from_bytes(packet[offset : offset + 2], "big")
        vlan_ids.append(tci & 0x0FFF)
        eth_type = int.from_bytes(packet[offset + 2 : offset + 4], "big")
        offset += 4
    prefix = "802.1Q/" if vlan_ids else ""
    if eth_type == 0x0800:
        return _ipv4_summary(packet, offset, prefix, destination, source)
    if eth_type == 0x86DD:
        return _ipv6_summary(packet, offset, prefix, destination, source)
    if eth_type == 0x0806:
        return _arp_summary(packet, offset, prefix, destination, source)
    vlan_detail = f" VLAN {','.join(str(vlan_id) for vlan_id in vlan_ids)}" if vlan_ids else ""
    return {"destination": destination, "source": source, "type": f"{prefix}0x{eth_type:04x}", "info": f"Ethernet frame{vlan_detail}"}


def _ipv4_summary(packet: bytes, offset: int, prefix: str, ethernet_destination: str, ethernet_source: str) -> dict[str, str]:
    if len(packet) < offset + 20:
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}IPv4", "info": "Truncated IPv4"}
    ihl = (packet[offset] & 0x0F) * 4
    if packet[offset] >> 4 != 4 or ihl < 20 or len(packet) < offset + ihl:
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}IPv4", "info": "Malformed IPv4"}
    total_length = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    packet_end = min(len(packet), offset + total_length) if total_length >= ihl else len(packet)
    protocol = packet[offset + 9]
    src_ip = ".".join(str(octet) for octet in packet[offset + 12 : offset + 16])
    dst_ip = ".".join(str(octet) for octet in packet[offset + 16 : offset + 20])
    protocol_name = _ip_protocol_name(protocol)
    l4_offset = offset + ihl
    detail = f"{src_ip} -> {dst_ip}"
    if protocol in {6, 17} and len(packet) >= l4_offset + 4:
        detail = _l4_detail(packet, l4_offset, packet_end, protocol, src_ip, dst_ip)
    elif protocol == 1:
        detail = _icmp_detail(packet, l4_offset, src_ip, dst_ip, ipv6=False)
    elif protocol == 47:
        detail = _gre_detail(packet, l4_offset, src_ip, dst_ip)
    elif protocol in {4, 41}:
        detail = _ip_tunnel_detail(packet, l4_offset, packet_end, protocol, src_ip, dst_ip, outer="IPv4")
    return {"destination": dst_ip, "source": src_ip, "type": f"{prefix}IPv4/{protocol_name}", "info": detail}


def _ipv6_summary(packet: bytes, offset: int, prefix: str, ethernet_destination: str, ethernet_source: str) -> dict[str, str]:
    if len(packet) < offset + 40:
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}IPv6", "info": "Truncated IPv6"}
    if packet[offset] >> 4 != 6:
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}IPv6", "info": "Malformed IPv6"}
    protocol = packet[offset + 6]
    payload_length = int.from_bytes(packet[offset + 4 : offset + 6], "big")
    packet_end = min(len(packet), offset + 40 + payload_length) if payload_length > 0 else len(packet)
    src_ip = str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))
    dst_ip = str(ipaddress.IPv6Address(packet[offset + 24 : offset + 40]))
    protocol_name = _ip_protocol_name(protocol, ipv6=True)
    l4_offset = offset + 40
    detail = f"{src_ip} -> {dst_ip}"
    if protocol in {6, 17} and len(packet) >= l4_offset + 4:
        detail = _l4_detail(packet, l4_offset, packet_end, protocol, src_ip, dst_ip)
    elif protocol == 58:
        detail = _icmp_detail(packet, l4_offset, src_ip, dst_ip, ipv6=True)
    elif protocol == 47:
        detail = _gre_detail(packet, l4_offset, src_ip, dst_ip)
    elif protocol in {4, 41}:
        detail = _ip_tunnel_detail(packet, l4_offset, packet_end, protocol, src_ip, dst_ip, outer="IPv6")
    return {"destination": dst_ip, "source": src_ip, "type": f"{prefix}IPv6/{protocol_name}", "info": detail}


def _arp_summary(packet: bytes, offset: int, prefix: str, ethernet_destination: str, ethernet_source: str) -> dict[str, str]:
    if len(packet) < offset + 28:
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}ARP", "info": "Truncated ARP"}
    hlen = packet[offset + 4]
    plen = packet[offset + 5]
    operation = int.from_bytes(packet[offset + 6 : offset + 8], "big")
    if hlen != 6 or plen != 4 or len(packet) < offset + 8 + (2 * hlen) + (2 * plen):
        return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}ARP", "info": "ARP packet"}
    sender_mac_offset = offset + 8
    sender_ip_offset = sender_mac_offset + hlen
    target_mac_offset = sender_ip_offset + plen
    target_ip_offset = target_mac_offset + hlen
    sender_mac = _mac_text(packet[sender_mac_offset : sender_mac_offset + hlen])
    sender_ip = ".".join(str(octet) for octet in packet[sender_ip_offset : sender_ip_offset + plen])
    target_ip = ".".join(str(octet) for octet in packet[target_ip_offset : target_ip_offset + plen])
    if operation == 1:
        info = f"[Request] Who has {target_ip} tell {sender_ip}"
    elif operation == 2:
        info = f"[Reply] {sender_ip} is at {sender_mac}"
    else:
        info = f"ARP operation {operation}"
    return {"destination": ethernet_destination, "source": ethernet_source, "type": f"{prefix}ARP", "info": info}


def _l4_detail(packet: bytes, offset: int, packet_end: int, protocol: int, src_ip: str, dst_ip: str) -> str:
    src_port, dst_port = struct.unpack("!HH", packet[offset : offset + 4])
    source = _endpoint_text(src_ip, src_port)
    destination = _endpoint_text(dst_ip, dst_port)
    if protocol == 17:
        detail = f"{source} -> {destination}"
        if len(packet) >= offset + 8:
            udp_length = int.from_bytes(packet[offset + 4 : offset + 6], "big")
            payload_offset = offset + 8
            payload_end = min(packet_end, offset + udp_length)
            if (src_port == 53 or dst_port == 53) and payload_end - payload_offset >= 12:
                query_name, query_type, _query_class = _dns_query_summary(packet, payload_offset + 12, payload_end, payload_offset)
                if query_name:
                    detail = f"{detail} DNS {query_name}"
                    if query_type:
                        detail = f"{detail} {query_type}"
            elif ({src_port, dst_port} & {67, 68}) and payload_end - payload_offset >= 240:
                message_type = _dhcp_message_type_from_payload(packet, payload_offset, payload_end)
                if message_type:
                    detail = f"{detail} DHCP {message_type}"
            elif ({src_port, dst_port} & {CAPTURE_GTPU_PORT}) and payload_end - payload_offset >= 8:
                gtpu_detail = _gtpu_detail(packet, payload_offset, payload_end)
                if gtpu_detail:
                    detail = f"{detail} {gtpu_detail}"
            elif ({src_port, dst_port} & CAPTURE_UDP_IP_TUNNEL_PORTS) and payload_end > payload_offset:
                version = packet[payload_offset] >> 4
                if version == 4:
                    detail = f"{detail} IPv4-over-UDP"
                elif version == 6:
                    detail = f"{detail} IPv6-over-UDP"
        return detail
    if protocol == 132:
        detail = f"{source} -> {destination} SCTP"
        chunk_offset = offset + 12
        if len(packet) >= chunk_offset + 16 and packet[chunk_offset] == 0:
            tsn = int.from_bytes(packet[chunk_offset + 4 : chunk_offset + 8], "big")
            stream_id = int.from_bytes(packet[chunk_offset + 8 : chunk_offset + 10], "big")
            detail = f"{detail} TSN {tsn} stream {stream_id}"
        return detail
    if protocol != 6 or len(packet) < offset + 20:
        return f"{source} -> {destination}"
    data_offset = max(20, (packet[offset + 12] >> 4) * 4)
    flags = _tcp_flags(packet[offset + 13])
    sequence = int.from_bytes(packet[offset + 4 : offset + 8], "big")
    acknowledge = int.from_bytes(packet[offset + 8 : offset + 12], "big")
    window = int.from_bytes(packet[offset + 14 : offset + 16], "big")
    payload_length = max(0, packet_end - offset - data_offset)
    return (
        f"{source} -> {destination} "
        f"[{flags}] Seq={sequence} Ack={acknowledge} Win={window} Len={payload_length}"
    )


def _gtpu_detail(packet: bytes, offset: int, packet_end: int) -> str | None:
    payload_end = min(len(packet), packet_end)
    if payload_end < offset + 8:
        return "GTP-U truncated"
    flags = packet[offset]
    message_type = packet[offset + 1]
    payload_length = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    teid = int.from_bytes(packet[offset + 4 : offset + 8], "big")
    version = (flags >> 5) & 0x07
    protocol_type = (flags >> 4) & 0x01
    gtpu_end = min(payload_end, offset + 8 + payload_length)
    cursor = offset + 8
    extension_header_flag = bool(flags & 0x04)
    sequence_flag = bool(flags & 0x02)
    n_pdu_flag = bool(flags & 0x01)
    next_extension_header = 0
    detail = f"GTP-U {_gtpu_message_type_name(message_type)} teid=0x{teid:08x}"
    if version != 1 or protocol_type != 1:
        return f"{detail} unexpected-flags"
    if flags & 0x07:
        if gtpu_end < cursor + 4:
            return f"{detail} truncated"
        sequence = int.from_bytes(packet[cursor : cursor + 2], "big")
        n_pdu = packet[cursor + 2]
        next_extension_header = packet[cursor + 3]
        optional_parts = []
        if sequence_flag:
            optional_parts.append(f"seq={sequence}")
        if n_pdu_flag:
            optional_parts.append(f"n-pdu={n_pdu}")
        if extension_header_flag:
            optional_parts.append(f"ext=0x{next_extension_header:02x}")
        if optional_parts:
            detail = f"{detail} {' '.join(optional_parts)}"
        cursor += 4
    if extension_header_flag and next_extension_header:
        cursor, extension_parts = _gtpu_extension_detail(packet, cursor, gtpu_end, next_extension_header)
        if extension_parts:
            detail = f"{detail} {' '.join(extension_parts)}"
    if message_type != 0xFF or gtpu_end <= cursor:
        return detail
    inner_version = packet[cursor] >> 4
    if inner_version == 4 and gtpu_end >= cursor + 20:
        ihl = (packet[cursor] & 0x0F) * 4
        if ihl >= 20 and gtpu_end >= cursor + ihl:
            source = ".".join(str(octet) for octet in packet[cursor + 12 : cursor + 16])
            destination = ".".join(str(octet) for octet in packet[cursor + 16 : cursor + 20])
            protocol_name = _ip_protocol_name(packet[cursor + 9])
            return f"{detail} inner IPv4 {source} -> {destination} {protocol_name}"
    if inner_version == 6 and gtpu_end >= cursor + 40:
        source = str(ipaddress.IPv6Address(packet[cursor + 8 : cursor + 24]))
        destination = str(ipaddress.IPv6Address(packet[cursor + 24 : cursor + 40]))
        protocol_name = _ip_protocol_name(packet[cursor + 6], ipv6=True)
        return f"{detail} inner IPv6 {source} -> {destination} {protocol_name}"
    return f"{detail} inner version {inner_version}"


def _gtpu_extension_detail(
    packet: bytes,
    offset: int,
    packet_end: int,
    next_extension_header: int,
) -> tuple[int, list[str]]:
    cursor = offset
    current_extension_header = next_extension_header
    extension_guard = 0
    detail_parts: list[str] = []
    while current_extension_header:
        if extension_guard >= 4:
            detail_parts.append("extension-chain-too-deep")
            return cursor, detail_parts
        if packet_end < cursor + 4:
            detail_parts.append("truncated-extension")
            return packet_end, detail_parts
        extension_guard += 1
        extension_length = packet[cursor] * 4
        if extension_length < 4:
            detail_parts.append("invalid-extension-length")
            return cursor, detail_parts
        if packet_end < cursor + extension_length:
            detail_parts.append("truncated-extension")
            return packet_end, detail_parts
        extension_next = packet[cursor + extension_length - 1]
        if current_extension_header == PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT:
            detail_parts.append(f"udp-port={int.from_bytes(packet[cursor + 1 : cursor + 3], 'big')}")
        cursor += extension_length
        current_extension_header = extension_next
    return cursor, detail_parts


def _icmp_detail(packet: bytes, offset: int, src_ip: str, dst_ip: str, *, ipv6: bool) -> str:
    if len(packet) < offset + 4:
        return f"{src_ip} -> {dst_ip} Truncated {'ICMPv6' if ipv6 else 'ICMP'}"
    icmp_type = packet[offset]
    type_name = _icmp_type_name(icmp_type, ipv6=ipv6)
    if icmp_type in {0, 8, 128, 129} and len(packet) >= offset + 8:
        identifier = int.from_bytes(packet[offset + 4 : offset + 6], "big")
        sequence = int.from_bytes(packet[offset + 6 : offset + 8], "big")
        return f"{src_ip} -> {dst_ip} {type_name} id={identifier} seq={sequence}"
    if ipv6 and icmp_type in {135, 136} and len(packet) >= offset + 24:
        target = str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))
        return f"{src_ip} -> {dst_ip} {type_name} target={target}"
    return f"{src_ip} -> {dst_ip} {type_name}"


def _gre_detail(packet: bytes, offset: int, src_ip: str, dst_ip: str) -> str:
    if len(packet) < offset + 4:
        return f"{src_ip} -> {dst_ip} Truncated GRE"
    flags = int.from_bytes(packet[offset : offset + 2], "big")
    protocol_type = int.from_bytes(packet[offset + 2 : offset + 4], "big")
    parts = [f"{src_ip} -> {dst_ip} GRE protocol 0x{protocol_type:04x}"]
    if flags & 0x2000:
        key_offset = offset + 4 + (4 if flags & 0x8000 else 0)
        if len(packet) >= key_offset + 4:
            parts.append(f"key=0x{int.from_bytes(packet[key_offset : key_offset + 4], 'big'):08x}")
    if flags & 0x1000:
        sequence_offset = offset + 4 + (4 if flags & 0x8000 else 0) + (4 if flags & 0x2000 else 0)
        if len(packet) >= sequence_offset + 4:
            parts.append(f"seq={int.from_bytes(packet[sequence_offset : sequence_offset + 4], 'big')}")
    return " ".join(parts)


def _ip_tunnel_detail(
    packet: bytes,
    offset: int,
    packet_end: int,
    protocol: int,
    src_ip: str,
    dst_ip: str,
    *,
    outer: str,
) -> str:
    inner = "IPv4" if protocol == 4 else "IPv6"
    prefix = f"{src_ip} -> {dst_ip} {inner}-in-{outer}"
    payload_end = min(len(packet), packet_end)
    if payload_end <= offset:
        return f"{prefix} truncated"

    version = packet[offset] >> 4
    if protocol == 4:
        if version != 4 or payload_end < offset + 20:
            return f"{prefix} malformed inner IPv4"
        ihl = (packet[offset] & 0x0F) * 4
        if ihl < 20 or payload_end < offset + ihl:
            return f"{prefix} malformed inner IPv4"
        inner_src = ".".join(str(octet) for octet in packet[offset + 12 : offset + 16])
        inner_dst = ".".join(str(octet) for octet in packet[offset + 16 : offset + 20])
        return f"{prefix} {inner_src} -> {inner_dst} {_ip_protocol_name(packet[offset + 9])}"

    if version != 6 or payload_end < offset + 40:
        return f"{prefix} malformed inner IPv6"
    inner_src = str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))
    inner_dst = str(ipaddress.IPv6Address(packet[offset + 24 : offset + 40]))
    return f"{prefix} {inner_src} -> {inner_dst} {_ip_protocol_name(packet[offset + 6], ipv6=True)}"


def _endpoint_text(address: str, port: int) -> str:
    return f"[{address}]:{port}" if ":" in address else f"{address}:{port}"


def _tcp_flags(value: int) -> str:
    flags = [
        ("URG", 0x20),
        ("ACK", 0x10),
        ("PSH", 0x08),
        ("RST", 0x04),
        ("SYN", 0x02),
        ("FIN", 0x01),
    ]
    enabled = [name for name, mask in flags if value & mask]
    return ", ".join(enabled) if enabled else "-"


def _dns_name_end_offset(payload: bytes, offset: int) -> int | None:
    while offset < len(payload):
        label_length = payload[offset]
        if label_length & 0xC0 == 0xC0:
            return offset + 2 if offset + 2 <= len(payload) else None
        offset += 1
        if label_length == 0:
            return offset
        if label_length > 63 or offset + label_length > len(payload):
            return None
        offset += label_length
    return None



def _tcp_options_from_packet(packet: bytes, offset: int) -> dict[str, Any]:
    parsed: dict[str, Any] = {
        "mss": None,
        "window_scale": None,
        "sack_permitted": False,
        "sack": None,
        "timestamp": None,
    }
    if len(packet) < offset + 20:
        return parsed
    data_offset = (packet[offset + 12] >> 4) * 4
    if data_offset <= 20 or data_offset > 60 or len(packet) < offset + data_offset:
        return parsed
    options = packet[offset + 20 : offset + data_offset]
    index = 0
    while index < len(options):
        kind = options[index]
        if kind == 0:
            break
        if kind == 1:
            index += 1
            continue
        if index + 2 > len(options):
            break
        option_length = options[index + 1]
        if option_length < 2 or index + option_length > len(options):
            break
        body = options[index + 2 : index + option_length]
        if kind == 2 and option_length == 4:
            parsed["mss"] = int.from_bytes(body, "big")
        elif kind == 3 and option_length == 3:
            parsed["window_scale"] = body[0]
        elif kind == 4 and option_length == 2:
            parsed["sack_permitted"] = True
        elif kind == 5 and option_length >= 10 and (option_length - 2) % 8 == 0:
            parsed["sack"] = (
                int.from_bytes(body[0:4], "big"),
                int.from_bytes(body[4:8], "big"),
            )
        elif kind == 8 and option_length == 10:
            parsed["timestamp"] = (
                int.from_bytes(body[0:4], "big"),
                int.from_bytes(body[4:8], "big"),
            )
        index += option_length
    return parsed



def _mac_text(value: bytes) -> str:
    return ":".join(f"{octet:02x}" for octet in value)
