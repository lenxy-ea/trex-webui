from __future__ import annotations

import base64
import ipaddress
from typing import Any

from app.trex.capture_decode import _mac_text
from app.trex.workbench_layout import workbench_default_outer_ether_type_for_fields
from app.trex.workbench_packet import ipv4_offsets, ipv6_offsets, packet_l2_payload_info
from app.trex.workbench_packet_fields import (
    arp_fields_from_packet,
    dhcp_fields_from_packet,
    dns_fields_from_packet,
    icmp_fields_from_packet,
    packet_byte_from_binary,
    packet_ipv6_flow_label_from_binary,
    packet_ipv6_traffic_class_from_binary,
    packet_word_from_binary,
    sctp_fields_from_packet,
    tcp_fields_from_packet,
    udp_checksum_from_packet,
    udp_length_from_packet,
)
from app.trex.workbench_values import (
    CAPTURE_GTPU_PORT,
    PROFILE_DEFAULT_DST_MAC,
    PROFILE_DEFAULT_DST_IPV4,
    PROFILE_DEFAULT_DST_IPV6,
    PROFILE_DEFAULT_DST_PORT,
    PROFILE_DEFAULT_GRE_CHECKSUM,
    PROFILE_DEFAULT_GRE_INNER_DST_IPV4,
    PROFILE_DEFAULT_GRE_INNER_DST_IPV6,
    PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT,
    PROFILE_DEFAULT_GRE_INNER_SRC_IPV4,
    PROFILE_DEFAULT_GRE_INNER_SRC_IPV6,
    PROFILE_DEFAULT_GRE_KEY,
    PROFILE_DEFAULT_GRE_PROTOCOL_TYPE,
    PROFILE_DEFAULT_GRE_SEQUENCE,
    PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT,
    PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT,
    PROFILE_DEFAULT_GTPU_INNER_DST_IPV4,
    PROFILE_DEFAULT_GTPU_INNER_DST_IPV6,
    PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT,
    PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4,
    PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6,
    PROFILE_DEFAULT_GTPU_INNER_TTL,
    PROFILE_DEFAULT_GTPU_MESSAGE_TYPE,
    PROFILE_DEFAULT_GTPU_NPDU,
    PROFILE_DEFAULT_GTPU_SEQUENCE,
    PROFILE_DEFAULT_GTPU_TEID,
    PROFILE_DEFAULT_ICMP_TYPE,
    PROFILE_DEFAULT_ICMPV6_TYPE,
    PROFILE_DEFAULT_IP_ID,
    PROFILE_DEFAULT_IP_TTL,
    PROFILE_DEFAULT_IPV4_CHECKSUM,
    PROFILE_DEFAULT_IPV6_FLOW_LABEL,
    PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS,
    PROFILE_DEFAULT_MPLS_LABEL,
    PROFILE_DEFAULT_MPLS_TC,
    PROFILE_DEFAULT_MPLS_TTL,
    PROFILE_DEFAULT_SRC_MAC,
    PROFILE_DEFAULT_SRC_IPV4,
    PROFILE_DEFAULT_SRC_IPV6,
    PROFILE_DEFAULT_SRC_PORT,
    PROFILE_DEFAULT_UDP_CHECKSUM,
    PROFILE_DEFAULT_UDP_LENGTH,
    PROFILE_DEFAULT_VLAN_TPID,
    PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4,
    PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6,
    PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT,
    PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4,
    PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6,
    PROFILE_DEFAULT_VXLAN_INNER_TTL,
    PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT,
    PROFILE_DEFAULT_VXLAN_VNI,
    default_arp_fields,
    default_icmp_fields,
    default_sctp_fields,
    default_tcp_fields,
)


def imported_ip_packet_classification(
    packet: bytes,
    ip_version: int,
    ip_offset: int,
    ihl: int,
    protocol: int | None,
) -> dict[str, Any] | None:
    l4_offset = ip_offset + ihl
    gre_info = None
    has_l4 = False
    if protocol == 6:
        packet_type = f"Ethernet/IPv{ip_version}/TCP"
        has_l4 = True
    elif protocol == 17:
        packet_type = f"Ethernet/IPv{ip_version}/UDP"
        has_l4 = True
    elif ip_version == 4 and protocol == 1:
        packet_type = "Ethernet/IPv4/ICMP"
        has_l4 = True
    elif ip_version == 6 and protocol == 58:
        packet_type = "Ethernet/IPv6/ICMPv6"
        has_l4 = True
    elif protocol == 47:
        gre_info = packet_gre_info(packet, l4_offset)
        if gre_info is None:
            return None
        packet_type = f"Ethernet/IPv{ip_version}/GRE"
        has_l4 = True
    elif protocol == 132:
        packet_type = f"Ethernet/IPv{ip_version}/SCTP"
        has_l4 = True
    elif ip_version == 4 and protocol == 0:
        packet_type = "Ethernet/IPv4"
    else:
        return None
    if has_l4 and len(packet) < l4_offset + 4:
        return None
    return {
        "gre_info": gre_info,
        "has_l4": has_l4,
        "l4_offset": l4_offset,
        "packet_type": packet_type,
    }


def imported_ip_header_fields(packet: bytes, packet_type: str, ip_offset: int) -> dict[str, Any]:
    is_ipv4 = packet_type.startswith("Ethernet/IPv4")
    is_ipv6 = packet_type.startswith("Ethernet/IPv6")
    ipv4_tos = packet_byte_from_binary(packet, ip_offset + 1, 0) if is_ipv4 else 0
    ipv4_fragment_word = int.from_bytes(packet[ip_offset + 6 : ip_offset + 8], "big") if is_ipv4 else 0
    return {
        "ipv4_src": ".".join(str(octet) for octet in packet[ip_offset + 12 : ip_offset + 16])
        if is_ipv4
        else PROFILE_DEFAULT_SRC_IPV4,
        "ipv4_dst": ".".join(str(octet) for octet in packet[ip_offset + 16 : ip_offset + 20])
        if is_ipv4
        else PROFILE_DEFAULT_DST_IPV4,
        "ipv4_tos": ipv4_tos,
        "ipv4_id": int.from_bytes(packet[ip_offset + 4 : ip_offset + 6], "big") if is_ipv4 else PROFILE_DEFAULT_IP_ID,
        "ipv4_fragment_word": ipv4_fragment_word,
        "ipv4_ttl": packet_byte_from_binary(packet, ip_offset + 8, PROFILE_DEFAULT_IP_TTL)
        if is_ipv4
        else PROFILE_DEFAULT_IP_TTL,
        "ipv4_checksum": f"{packet_word_from_binary(packet, ip_offset + 10, int(PROFILE_DEFAULT_IPV4_CHECKSUM, 16)):04X}"
        if is_ipv4
        else PROFILE_DEFAULT_IPV4_CHECKSUM,
        "ipv6_src": str(ipaddress.IPv6Address(packet[ip_offset + 8 : ip_offset + 24]))
        if is_ipv6
        else PROFILE_DEFAULT_SRC_IPV6,
        "ipv6_dst": str(ipaddress.IPv6Address(packet[ip_offset + 24 : ip_offset + 40]))
        if is_ipv6
        else PROFILE_DEFAULT_DST_IPV6,
        "ipv6_traffic_class": packet_ipv6_traffic_class_from_binary(packet, ip_offset, PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS)
        if is_ipv6
        else PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS,
        "ipv6_flow_label": packet_ipv6_flow_label_from_binary(packet, ip_offset, PROFILE_DEFAULT_IPV6_FLOW_LABEL)
        if is_ipv6
        else PROFILE_DEFAULT_IPV6_FLOW_LABEL,
        "ipv6_hop_limit": packet_byte_from_binary(packet, ip_offset + 7, PROFILE_DEFAULT_IP_TTL)
        if is_ipv6
        else PROFILE_DEFAULT_IP_TTL,
    }


def packet_vxlan_info(packet: bytes, l4_offset: int) -> dict[str, Any] | None:
    if len(packet) < l4_offset + 8 + 8 + 14:
        return None
    destination_port = int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big")
    if destination_port != PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT:
        return None
    vxlan_offset = l4_offset + 8
    if packet[vxlan_offset] & 0x08 != 0x08:
        return None
    vni = int.from_bytes(packet[vxlan_offset + 4 : vxlan_offset + 7], "big")
    inner_offset = vxlan_offset + 8
    inner_ip_offset = inner_offset + 14
    inner_ethertype = int.from_bytes(packet[inner_offset + 12 : inner_offset + 14], "big")
    if inner_ethertype == 0x0800:
        if len(packet) < inner_ip_offset + 20 or packet[inner_ip_offset] >> 4 != 4:
            return None
        inner_ihl = (packet[inner_ip_offset] & 0x0F) * 4
        if inner_ihl < 20 or len(packet) < inner_ip_offset + inner_ihl + 8:
            return None
        if packet[inner_ip_offset + 9] != 17:
            return None
        inner_l4_offset = inner_ip_offset + inner_ihl
        inner_info = {
            "inner_ip_version": "IPv4",
            "inner_ipv4_src": ".".join(str(octet) for octet in packet[inner_ip_offset + 12 : inner_ip_offset + 16]),
            "inner_ipv4_dst": ".".join(str(octet) for octet in packet[inner_ip_offset + 16 : inner_ip_offset + 20]),
            "inner_ipv4_ttl": packet[inner_ip_offset + 8],
            "inner_ipv6_src": PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6,
            "inner_ipv6_dst": PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6,
            "inner_ipv6_hop_limit": PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT,
        }
    elif inner_ethertype == 0x86DD:
        if len(packet) < inner_ip_offset + 40 + 8 or packet[inner_ip_offset] >> 4 != 6:
            return None
        if packet[inner_ip_offset + 6] != 17:
            return None
        inner_l4_offset = inner_ip_offset + 40
        inner_info = {
            "inner_ip_version": "IPv6",
            "inner_ipv4_src": PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4,
            "inner_ipv4_dst": PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4,
            "inner_ipv4_ttl": PROFILE_DEFAULT_VXLAN_INNER_TTL,
            "inner_ipv6_src": str(ipaddress.IPv6Address(packet[inner_ip_offset + 8 : inner_ip_offset + 24])),
            "inner_ipv6_dst": str(ipaddress.IPv6Address(packet[inner_ip_offset + 24 : inner_ip_offset + 40])),
            "inner_ipv6_hop_limit": packet[inner_ip_offset + 7],
        }
    else:
        return None
    return {
        "vni": vni,
        "inner_ether_dst": _mac_text(packet[inner_offset : inner_offset + 6]),
        "inner_ether_src": _mac_text(packet[inner_offset + 6 : inner_offset + 12]),
        **inner_info,
        "inner_l4_src_port": int.from_bytes(packet[inner_l4_offset : inner_l4_offset + 2], "big"),
        "inner_l4_dst_port": int.from_bytes(packet[inner_l4_offset + 2 : inner_l4_offset + 4], "big"),
    }


def packet_gtpu_info(packet: bytes, l4_offset: int) -> dict[str, Any] | None:
    if len(packet) < l4_offset + 8 + 8 + 20 + 8:
        return None
    source_port = int.from_bytes(packet[l4_offset : l4_offset + 2], "big")
    destination_port = int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big")
    if CAPTURE_GTPU_PORT not in {source_port, destination_port}:
        return None
    gtpu_offset = l4_offset + 8
    flags = packet[gtpu_offset]
    version = (flags >> 5) & 0x07
    if version != 1:
        return None
    message_type = packet[gtpu_offset + 1]
    if message_type != PROFILE_DEFAULT_GTPU_MESSAGE_TYPE:
        return None
    message_length = int.from_bytes(packet[gtpu_offset + 2 : gtpu_offset + 4], "big")
    teid = int.from_bytes(packet[gtpu_offset + 4 : gtpu_offset + 8], "big")
    inner_offset = gtpu_offset + 8
    sequence_enabled = bool(flags & 0x02)
    npdu_enabled = bool(flags & 0x01)
    sequence = PROFILE_DEFAULT_GTPU_SEQUENCE
    npdu = PROFILE_DEFAULT_GTPU_NPDU
    next_extension_header = 0
    extension_udp_port_enabled = False
    extension_udp_port = PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT
    if flags & 0x07:
        if len(packet) < inner_offset + 4:
            return None
        sequence = int.from_bytes(packet[inner_offset : inner_offset + 2], "big")
        npdu = packet[inner_offset + 2]
        next_extension_header = packet[inner_offset + 3]
        inner_offset += 4
    current_extension_header = next_extension_header
    extension_guard = 0
    while current_extension_header:
        if extension_guard >= 4 or len(packet) < inner_offset + 4:
            return None
        extension_guard += 1
        extension_length = packet[inner_offset] * 4
        if extension_length < 4 or len(packet) < inner_offset + extension_length:
            return None
        extension_next = packet[inner_offset + extension_length - 1]
        if current_extension_header == PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT:
            extension_udp_port_enabled = True
            extension_udp_port = int.from_bytes(packet[inner_offset + 1 : inner_offset + 3], "big")
        inner_offset += extension_length
        current_extension_header = extension_next
    if len(packet) < inner_offset + 20:
        return None
    inner_version = packet[inner_offset] >> 4
    if inner_version == 4:
        inner_ihl = (packet[inner_offset] & 0x0F) * 4
        if inner_ihl < 20 or len(packet) < inner_offset + inner_ihl + 8:
            return None
        if packet[inner_offset + 9] != 17:
            return None
        if message_length and len(packet) < inner_offset + min(message_length, inner_ihl + 8):
            return None
        inner_l4_offset = inner_offset + inner_ihl
        inner_info = {
            "inner_ip_version": "IPv4",
            "inner_ipv4_src": ".".join(str(octet) for octet in packet[inner_offset + 12 : inner_offset + 16]),
            "inner_ipv4_dst": ".".join(str(octet) for octet in packet[inner_offset + 16 : inner_offset + 20]),
            "inner_ipv4_ttl": packet[inner_offset + 8],
            "inner_ipv6_src": PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6,
            "inner_ipv6_dst": PROFILE_DEFAULT_GTPU_INNER_DST_IPV6,
            "inner_ipv6_hop_limit": PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT,
        }
    elif inner_version == 6:
        if len(packet) < inner_offset + 40 + 8:
            return None
        if packet[inner_offset + 6] != 17:
            return None
        if message_length and len(packet) < inner_offset + min(message_length, 40 + 8):
            return None
        inner_l4_offset = inner_offset + 40
        inner_info = {
            "inner_ip_version": "IPv6",
            "inner_ipv4_src": PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4,
            "inner_ipv4_dst": PROFILE_DEFAULT_GTPU_INNER_DST_IPV4,
            "inner_ipv4_ttl": PROFILE_DEFAULT_GTPU_INNER_TTL,
            "inner_ipv6_src": str(ipaddress.IPv6Address(packet[inner_offset + 8 : inner_offset + 24])),
            "inner_ipv6_dst": str(ipaddress.IPv6Address(packet[inner_offset + 24 : inner_offset + 40])),
            "inner_ipv6_hop_limit": packet[inner_offset + 7],
        }
    else:
        return None
    return {
        "flags": flags,
        "message_type": message_type,
        "teid": teid,
        "sequence_enabled": sequence_enabled,
        "sequence": sequence,
        "npdu_enabled": npdu_enabled,
        "npdu": npdu,
        "next_extension_header": next_extension_header,
        "extension_udp_port_enabled": extension_udp_port_enabled,
        "extension_udp_port": extension_udp_port,
        **inner_info,
        "inner_l4_src_port": int.from_bytes(packet[inner_l4_offset : inner_l4_offset + 2], "big"),
        "inner_l4_dst_port": int.from_bytes(packet[inner_l4_offset + 2 : inner_l4_offset + 4], "big"),
    }


def packet_gre_info(packet: bytes, l4_offset: int) -> dict[str, Any] | None:
    if len(packet) < l4_offset + 4:
        return None
    flags = int.from_bytes(packet[l4_offset : l4_offset + 2], "big")
    protocol_type = int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big")
    if flags & 0x7:
        return None
    offset = l4_offset + 4
    checksum_present = bool(flags & 0x8000)
    checksum = PROFILE_DEFAULT_GRE_CHECKSUM
    if checksum_present:
        if len(packet) < offset + 4:
            return None
        checksum = f"{int.from_bytes(packet[offset : offset + 2], 'big'):04X}"
        offset += 4
    key_present = bool(flags & 0x2000)
    key = PROFILE_DEFAULT_GRE_KEY
    if key_present:
        if len(packet) < offset + 4:
            return None
        key = int.from_bytes(packet[offset : offset + 4], "big")
        offset += 4
    sequence_present = bool(flags & 0x1000)
    sequence = PROFILE_DEFAULT_GRE_SEQUENCE
    if sequence_present:
        if len(packet) < offset + 4:
            return None
        sequence = int.from_bytes(packet[offset : offset + 4], "big")
        offset += 4
    inner_info: dict[str, Any]
    if protocol_type == 0x0800:
        if len(packet) < offset + 20 or packet[offset] >> 4 != 4:
            return None
        inner_ihl = (packet[offset] & 0x0F) * 4
        if inner_ihl < 20 or len(packet) < offset + inner_ihl + 8:
            return None
        if packet[offset + 9] != 17:
            return None
        inner_l4_offset = offset + inner_ihl
        inner_info = {
            "inner_ip_version": "IPv4",
            "inner_ipv4_src": ".".join(str(octet) for octet in packet[offset + 12 : offset + 16]),
            "inner_ipv4_dst": ".".join(str(octet) for octet in packet[offset + 16 : offset + 20]),
            "inner_ipv4_ttl": packet[offset + 8],
            "inner_ipv6_src": PROFILE_DEFAULT_GRE_INNER_SRC_IPV6,
            "inner_ipv6_dst": PROFILE_DEFAULT_GRE_INNER_DST_IPV6,
            "inner_ipv6_hop_limit": PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT,
        }
    elif protocol_type == 0x86DD:
        if len(packet) < offset + 40 or packet[offset] >> 4 != 6:
            return None
        if packet[offset + 6] != 17:
            return None
        inner_l4_offset = offset + 40
        if len(packet) < inner_l4_offset + 8:
            return None
        inner_info = {
            "inner_ip_version": "IPv6",
            "inner_ipv4_src": PROFILE_DEFAULT_GRE_INNER_SRC_IPV4,
            "inner_ipv4_dst": PROFILE_DEFAULT_GRE_INNER_DST_IPV4,
            "inner_ipv4_ttl": 64,
            "inner_ipv6_src": str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24])),
            "inner_ipv6_dst": str(ipaddress.IPv6Address(packet[offset + 24 : offset + 40])),
            "inner_ipv6_hop_limit": packet[offset + 7],
        }
    else:
        return None
    return {
        "checksum_present": checksum_present,
        "checksum": checksum,
        "key_present": key_present,
        "key": key,
        "sequence_present": sequence_present,
        "sequence": sequence,
        "protocol_type": f"{protocol_type:04X}",
        **inner_info,
        "inner_l4_src_port": int.from_bytes(packet[inner_l4_offset : inner_l4_offset + 2], "big"),
        "inner_l4_dst_port": int.from_bytes(packet[inner_l4_offset + 2 : inner_l4_offset + 4], "big"),
    }


def stream_from_ethernet_packet(packet: bytes, index: int) -> dict[str, Any] | None:
    if len(packet) + 4 > 9216:
        return None
    l2_info = packet_l2_payload_info(packet)
    if l2_info is None:
        return None
    ipv4_offset_info = ipv4_offsets(packet)
    ipv6_offset_info = ipv6_offsets(packet)

    ip_version = 4
    ip_offset = 0
    ihl = 0
    protocol: int | None = None
    l4_offset = 0
    packet_type = "Ethernet"
    has_l4 = False
    gre_info = None

    if ipv4_offset_info is not None or ipv6_offset_info is not None:
        ip_version = 6 if ipv6_offset_info is not None else 4
        offsets = ipv6_offset_info if ipv6_offset_info is not None else ipv4_offset_info
        if offsets is None:
            return None
        ip_offset, ihl, protocol = offsets
        classification = imported_ip_packet_classification(packet, ip_version, ip_offset, ihl, protocol)
        if classification is None:
            return None
        packet_type = classification["packet_type"]
        has_l4 = classification["has_l4"]
        l4_offset = classification["l4_offset"]
        gre_info = classification["gre_info"]
    elif l2_info["ether_type"] == 0x0806:
        packet_type = "Ethernet/ARP"

    vlan_stack = l2_info.get("vlan_stack", []) if l2_info is not None else []
    vlan_info = vlan_stack[0] if vlan_stack else None
    vlan2_info = vlan_stack[1] if len(vlan_stack) > 1 else None
    mpls_info = l2_info["mpls_info"] if l2_info is not None else None
    mpls_labels = mpls_info["labels"] if mpls_info is not None else []
    vlan_tpid = f"{vlan_info['tpid']:04x}" if vlan_info is not None else PROFILE_DEFAULT_VLAN_TPID
    packet_outer_ether_type = int.from_bytes(packet[12:14], "big")
    default_outer_ether_type = workbench_default_outer_ether_type_for_fields(
        packet_type,
        vlan_info is not None,
        mpls_info is not None,
        vlan_tpid,
    )
    ether_type_override = packet_outer_ether_type != default_outer_ether_type
    arp_fields = arp_fields_from_packet(packet, l2_info["ip_offset"]) if packet_type == "Ethernet/ARP" else default_arp_fields()
    tcp_fields = tcp_fields_from_packet(packet, l4_offset) if protocol == 6 else default_tcp_fields()
    sctp_fields = sctp_fields_from_packet(packet, l4_offset) if protocol == 132 else default_sctp_fields()
    icmp_fields = (
        icmp_fields_from_packet(
            packet,
            l4_offset,
            PROFILE_DEFAULT_ICMPV6_TYPE if protocol == 58 else PROFILE_DEFAULT_ICMP_TYPE,
        )
        if protocol in {1, 58}
        else default_icmp_fields()
    )
    vxlan_info = packet_vxlan_info(packet, l4_offset) if protocol == 17 else None
    gtpu_info = packet_gtpu_info(packet, l4_offset) if protocol == 17 else None
    gre_info = gre_info if protocol == 47 else None
    dns_fields = dns_fields_from_packet(packet, l4_offset, protocol == 17)
    dhcp_fields = dhcp_fields_from_packet(packet, l4_offset, protocol == 17)
    ip_header_fields = imported_ip_header_fields(packet, packet_type, ip_offset)
    return {
        "name": f"packet_{index + 1}",
        "packet_type": packet_type,
        "frame_length_type": "Fixed",
        "frame_length": max(64, len(packet) + 4),
        "frame_length_min": 64,
        "frame_length_max": max(1518, len(packet) + 4),
        "mode": "continuous",
        "rate_type": "pps",
        "rate_value": 1.0,
        "enabled": True,
        "self_start": True,
        "total_pkts": 1,
        "pkts_per_burst": 1,
        "count": 1,
        "next_stream_id": None,
        "action_count": 0,
        "isg": 0.0,
        "ibg": 0.0,
        "pg_id": index + 1,
        "flow_stats_enabled": True,
        "latency_enabled": False,
        "ether_dst": _mac_text(packet[0:6]),
        "ether_src": _mac_text(packet[6:12]),
        "ether_type_override": ether_type_override,
        "ether_type": f"{packet_outer_ether_type:04x}",
        "ether_dst_mode": "Fixed",
        "ether_dst_count": 16,
        "ether_dst_step": 1,
        "ether_src_mode": "Fixed",
        "ether_src_count": 16,
        "ether_src_step": 1,
        **arp_fields,
        "vlan_enabled": vlan_info is not None,
        "vlan_tpid_override": vlan_info is not None
        and vlan_info["tpid"] != int(PROFILE_DEFAULT_VLAN_TPID, 16),
        "vlan_tpid": vlan_tpid,
        "vlan_priority": vlan_info["priority"] if vlan_info is not None else 0,
        "vlan_priority_mode": "Fixed",
        "vlan_priority_count": 4,
        "vlan_priority_step": 1,
        "vlan_cfi": vlan_info["cfi"] if vlan_info is not None else 0,
        "vlan_id": vlan_info["vlan"] if vlan_info is not None else 0,
        "vlan_id_mode": "Fixed",
        "vlan_id_count": 16,
        "vlan_id_step": 1,
        "vlan2_enabled": vlan2_info is not None,
        "vlan2_tpid_override": vlan2_info is not None
        and vlan2_info["tpid"] != int(PROFILE_DEFAULT_VLAN_TPID, 16),
        "vlan2_tpid": f"{vlan2_info['tpid']:04x}" if vlan2_info is not None else PROFILE_DEFAULT_VLAN_TPID,
        "vlan2_priority": vlan2_info["priority"] if vlan2_info is not None else 0,
        "vlan2_priority_mode": "Fixed",
        "vlan2_priority_count": 4,
        "vlan2_priority_step": 1,
        "vlan2_cfi": vlan2_info["cfi"] if vlan2_info is not None else 0,
        "vlan2_id": vlan2_info["vlan"] if vlan2_info is not None else 1,
        "vlan2_id_mode": "Fixed",
        "vlan2_id_count": 16,
        "vlan2_id_step": 1,
        "mpls_enabled": mpls_info is not None,
        "mpls_label": mpls_labels[0]["label"] if mpls_labels else PROFILE_DEFAULT_MPLS_LABEL,
        "mpls_label_mode": "Fixed",
        "mpls_label_count": 16,
        "mpls_label_step": 1,
        "mpls_tc": mpls_labels[0]["traffic_class"] if mpls_labels else PROFILE_DEFAULT_MPLS_TC,
        "mpls_tc_mode": "Fixed",
        "mpls_tc_count": 4,
        "mpls_tc_step": 1,
        "mpls_ttl": mpls_labels[0]["ttl"] if mpls_labels else PROFILE_DEFAULT_MPLS_TTL,
        "mpls_ttl_mode": "Fixed",
        "mpls_ttl_count": 16,
        "mpls_ttl_step": 1,
        "mpls_label2_enabled": len(mpls_labels) > 1,
        "mpls_label2": mpls_labels[1]["label"] if len(mpls_labels) > 1 else PROFILE_DEFAULT_MPLS_LABEL + 1,
        "mpls_label2_mode": "Fixed",
        "mpls_label2_count": 16,
        "mpls_label2_step": 1,
        "mpls_label2_tc": mpls_labels[1]["traffic_class"] if len(mpls_labels) > 1 else PROFILE_DEFAULT_MPLS_TC,
        "mpls_label2_tc_mode": "Fixed",
        "mpls_label2_tc_count": 4,
        "mpls_label2_tc_step": 1,
        "mpls_label2_ttl": mpls_labels[1]["ttl"] if len(mpls_labels) > 1 else PROFILE_DEFAULT_MPLS_TTL,
        "mpls_label2_ttl_mode": "Fixed",
        "mpls_label2_ttl_count": 16,
        "mpls_label2_ttl_step": 1,
        "mpls_label3_enabled": len(mpls_labels) > 2,
        "mpls_label3": mpls_labels[2]["label"] if len(mpls_labels) > 2 else PROFILE_DEFAULT_MPLS_LABEL + 2,
        "mpls_label3_mode": "Fixed",
        "mpls_label3_count": 16,
        "mpls_label3_step": 1,
        "mpls_label3_tc": mpls_labels[2]["traffic_class"] if len(mpls_labels) > 2 else PROFILE_DEFAULT_MPLS_TC,
        "mpls_label3_tc_mode": "Fixed",
        "mpls_label3_tc_count": 4,
        "mpls_label3_tc_step": 1,
        "mpls_label3_ttl": mpls_labels[2]["ttl"] if len(mpls_labels) > 2 else PROFILE_DEFAULT_MPLS_TTL,
        "mpls_label3_ttl_mode": "Fixed",
        "mpls_label3_ttl_count": 16,
        "mpls_label3_ttl_step": 1,
        "vxlan_enabled": vxlan_info is not None,
        "vxlan_vni": vxlan_info["vni"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_VNI,
        "vxlan_vni_mode": "Fixed",
        "vxlan_vni_count": 16,
        "vxlan_vni_step": 1,
        "vxlan_inner_ether_dst": vxlan_info["inner_ether_dst"] if vxlan_info is not None else PROFILE_DEFAULT_DST_MAC,
        "vxlan_inner_ether_src": vxlan_info["inner_ether_src"] if vxlan_info is not None else PROFILE_DEFAULT_SRC_MAC,
        "vxlan_inner_ip_version": vxlan_info["inner_ip_version"] if vxlan_info is not None else "IPv4",
        "vxlan_inner_ipv4_src": vxlan_info["inner_ipv4_src"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4,
        "vxlan_inner_ipv4_src_mode": "Fixed",
        "vxlan_inner_ipv4_src_count": 16,
        "vxlan_inner_ipv4_src_step": 1,
        "vxlan_inner_ipv4_dst": vxlan_info["inner_ipv4_dst"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4,
        "vxlan_inner_ipv4_dst_mode": "Fixed",
        "vxlan_inner_ipv4_dst_count": 16,
        "vxlan_inner_ipv4_dst_step": 1,
        "vxlan_inner_ipv4_ttl": vxlan_info["inner_ipv4_ttl"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_TTL,
        "vxlan_inner_ipv4_ttl_mode": "Fixed",
        "vxlan_inner_ipv4_ttl_count": 16,
        "vxlan_inner_ipv4_ttl_step": 1,
        "vxlan_inner_ipv6_src": vxlan_info["inner_ipv6_src"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6,
        "vxlan_inner_ipv6_src_mode": "Fixed",
        "vxlan_inner_ipv6_src_count": 16,
        "vxlan_inner_ipv6_src_step": 1,
        "vxlan_inner_ipv6_dst": vxlan_info["inner_ipv6_dst"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6,
        "vxlan_inner_ipv6_dst_mode": "Fixed",
        "vxlan_inner_ipv6_dst_count": 16,
        "vxlan_inner_ipv6_dst_step": 1,
        "vxlan_inner_ipv6_hop_limit": vxlan_info["inner_ipv6_hop_limit"]
        if vxlan_info is not None
        else PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT,
        "vxlan_inner_ipv6_hop_limit_mode": "Fixed",
        "vxlan_inner_ipv6_hop_limit_count": 16,
        "vxlan_inner_ipv6_hop_limit_step": 1,
        "vxlan_inner_l4_src_port": vxlan_info["inner_l4_src_port"] if vxlan_info is not None else PROFILE_DEFAULT_SRC_PORT,
        "vxlan_inner_l4_src_port_mode": "Fixed",
        "vxlan_inner_l4_src_port_count": 16,
        "vxlan_inner_l4_src_port_step": 1,
        "vxlan_inner_l4_dst_port": vxlan_info["inner_l4_dst_port"] if vxlan_info is not None else PROFILE_DEFAULT_DST_PORT,
        "vxlan_inner_l4_dst_port_mode": "Fixed",
        "vxlan_inner_l4_dst_port_count": 16,
        "vxlan_inner_l4_dst_port_step": 1,
        "gtpu_enabled": gtpu_info is not None,
        "gtpu_message_type": gtpu_info["message_type"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_MESSAGE_TYPE,
        "gtpu_teid": gtpu_info["teid"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_TEID,
        "gtpu_teid_mode": "Fixed",
        "gtpu_teid_count": 16,
        "gtpu_teid_step": 1,
        "gtpu_sequence_enabled": gtpu_info["sequence_enabled"] if gtpu_info is not None else False,
        "gtpu_sequence": gtpu_info["sequence"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_SEQUENCE,
        "gtpu_sequence_mode": "Fixed",
        "gtpu_sequence_count": 16,
        "gtpu_sequence_step": 1,
        "gtpu_npdu_enabled": gtpu_info["npdu_enabled"] if gtpu_info is not None else False,
        "gtpu_npdu": gtpu_info["npdu"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_NPDU,
        "gtpu_npdu_mode": "Fixed",
        "gtpu_npdu_count": 16,
        "gtpu_npdu_step": 1,
        "gtpu_extension_enabled": gtpu_info["extension_udp_port_enabled"] if gtpu_info is not None else False,
        "gtpu_extension_udp_port": gtpu_info["extension_udp_port"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT,
        "gtpu_extension_udp_port_mode": "Fixed",
        "gtpu_extension_udp_port_count": 16,
        "gtpu_extension_udp_port_step": 1,
        "gtpu_inner_ip_version": gtpu_info["inner_ip_version"] if gtpu_info is not None else "IPv4",
        "gtpu_inner_ipv4_src": gtpu_info["inner_ipv4_src"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4,
        "gtpu_inner_ipv4_src_mode": "Fixed",
        "gtpu_inner_ipv4_src_count": 16,
        "gtpu_inner_ipv4_src_step": 1,
        "gtpu_inner_ipv4_dst": gtpu_info["inner_ipv4_dst"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_INNER_DST_IPV4,
        "gtpu_inner_ipv4_dst_mode": "Fixed",
        "gtpu_inner_ipv4_dst_count": 16,
        "gtpu_inner_ipv4_dst_step": 1,
        "gtpu_inner_ipv4_ttl": gtpu_info["inner_ipv4_ttl"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_TTL,
        "gtpu_inner_ipv4_ttl_mode": "Fixed",
        "gtpu_inner_ipv4_ttl_count": 16,
        "gtpu_inner_ipv4_ttl_step": 1,
        "gtpu_inner_ipv6_src": gtpu_info["inner_ipv6_src"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6,
        "gtpu_inner_ipv6_src_mode": "Fixed",
        "gtpu_inner_ipv6_src_count": 16,
        "gtpu_inner_ipv6_src_step": 1,
        "gtpu_inner_ipv6_dst": gtpu_info["inner_ipv6_dst"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_INNER_DST_IPV6,
        "gtpu_inner_ipv6_dst_mode": "Fixed",
        "gtpu_inner_ipv6_dst_count": 16,
        "gtpu_inner_ipv6_dst_step": 1,
        "gtpu_inner_ipv6_hop_limit": gtpu_info["inner_ipv6_hop_limit"]
        if gtpu_info is not None
        else PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT,
        "gtpu_inner_ipv6_hop_limit_mode": "Fixed",
        "gtpu_inner_ipv6_hop_limit_count": 16,
        "gtpu_inner_ipv6_hop_limit_step": 1,
        "gtpu_inner_l4_src_port": gtpu_info["inner_l4_src_port"] if gtpu_info is not None else PROFILE_DEFAULT_SRC_PORT,
        "gtpu_inner_l4_src_port_mode": "Fixed",
        "gtpu_inner_l4_src_port_count": 16,
        "gtpu_inner_l4_src_port_step": 1,
        "gtpu_inner_l4_dst_port": gtpu_info["inner_l4_dst_port"] if gtpu_info is not None else PROFILE_DEFAULT_DST_PORT,
        "gtpu_inner_l4_dst_port_mode": "Fixed",
        "gtpu_inner_l4_dst_port_count": 16,
        "gtpu_inner_l4_dst_port_step": 1,
        "gre_checksum_present": gre_info["checksum_present"] if gre_info is not None else False,
        "gre_checksum_override": gre_info is not None and gre_info["checksum_present"],
        "gre_checksum": gre_info["checksum"] if gre_info is not None else PROFILE_DEFAULT_GRE_CHECKSUM,
        "gre_key_present": gre_info["key_present"] if gre_info is not None else False,
        "gre_key": gre_info["key"] if gre_info is not None else PROFILE_DEFAULT_GRE_KEY,
        "gre_key_mode": "Fixed",
        "gre_key_count": 16,
        "gre_key_step": 1,
        "gre_sequence_present": gre_info["sequence_present"] if gre_info is not None else False,
        "gre_sequence": gre_info["sequence"] if gre_info is not None else PROFILE_DEFAULT_GRE_SEQUENCE,
        "gre_sequence_mode": "Fixed",
        "gre_sequence_count": 16,
        "gre_sequence_step": 1,
        "gre_protocol_type": gre_info["protocol_type"] if gre_info is not None else PROFILE_DEFAULT_GRE_PROTOCOL_TYPE,
        "gre_inner_ip_version": gre_info["inner_ip_version"] if gre_info is not None else "IPv4",
        "gre_inner_ipv4_src": gre_info["inner_ipv4_src"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_SRC_IPV4,
        "gre_inner_ipv4_src_mode": "Fixed",
        "gre_inner_ipv4_src_count": 16,
        "gre_inner_ipv4_src_step": 1,
        "gre_inner_ipv4_dst": gre_info["inner_ipv4_dst"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_DST_IPV4,
        "gre_inner_ipv4_dst_mode": "Fixed",
        "gre_inner_ipv4_dst_count": 16,
        "gre_inner_ipv4_dst_step": 1,
        "gre_inner_ipv4_ttl": gre_info["inner_ipv4_ttl"] if gre_info is not None else 64,
        "gre_inner_ipv4_ttl_mode": "Fixed",
        "gre_inner_ipv4_ttl_count": 16,
        "gre_inner_ipv4_ttl_step": 1,
        "gre_inner_ipv6_src": gre_info["inner_ipv6_src"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_SRC_IPV6,
        "gre_inner_ipv6_src_mode": "Fixed",
        "gre_inner_ipv6_src_count": 16,
        "gre_inner_ipv6_src_step": 1,
        "gre_inner_ipv6_dst": gre_info["inner_ipv6_dst"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_DST_IPV6,
        "gre_inner_ipv6_dst_mode": "Fixed",
        "gre_inner_ipv6_dst_count": 16,
        "gre_inner_ipv6_dst_step": 1,
        "gre_inner_ipv6_hop_limit": gre_info["inner_ipv6_hop_limit"]
        if gre_info is not None
        else PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT,
        "gre_inner_ipv6_hop_limit_mode": "Fixed",
        "gre_inner_ipv6_hop_limit_count": 16,
        "gre_inner_ipv6_hop_limit_step": 1,
        "gre_inner_l4_src_port": gre_info["inner_l4_src_port"] if gre_info is not None else PROFILE_DEFAULT_SRC_PORT,
        "gre_inner_l4_src_port_mode": "Fixed",
        "gre_inner_l4_src_port_count": 16,
        "gre_inner_l4_src_port_step": 1,
        "gre_inner_l4_dst_port": gre_info["inner_l4_dst_port"] if gre_info is not None else PROFILE_DEFAULT_DST_PORT,
        "gre_inner_l4_dst_port_mode": "Fixed",
        "gre_inner_l4_dst_port_count": 16,
        "gre_inner_l4_dst_port_step": 1,
        "ipv4_src": ip_header_fields["ipv4_src"],
        "ipv4_dst": ip_header_fields["ipv4_dst"],
        "ipv4_src_mode": "Fixed",
        "ipv4_src_count": 16,
        "ipv4_src_step": 1,
        "ipv4_dst_mode": "Fixed",
        "ipv4_dst_count": 16,
        "ipv4_dst_step": 1,
        "ipv4_dscp": ip_header_fields["ipv4_tos"] >> 2,
        "ipv4_dscp_mode": "Fixed",
        "ipv4_dscp_count": 16,
        "ipv4_dscp_step": 1,
        "ipv4_ecn": ip_header_fields["ipv4_tos"] & 0x03,
        "ipv4_ecn_mode": "Fixed",
        "ipv4_ecn_count": 4,
        "ipv4_ecn_step": 1,
        "ipv4_id": ip_header_fields["ipv4_id"],
        "ipv4_id_mode": "Fixed",
        "ipv4_id_count": 16,
        "ipv4_id_step": 1,
        "ipv4_flag_df": bool(ip_header_fields["ipv4_fragment_word"] & 0x4000),
        "ipv4_flag_mf": bool(ip_header_fields["ipv4_fragment_word"] & 0x2000),
        "ipv4_fragment_offset": ip_header_fields["ipv4_fragment_word"] & 0x1FFF,
        "ipv4_fragment_offset_mode": "Fixed",
        "ipv4_fragment_offset_count": 16,
        "ipv4_fragment_offset_step": 1,
        "ipv4_ttl": ip_header_fields["ipv4_ttl"],
        "ipv4_ttl_mode": "Fixed",
        "ipv4_ttl_count": 16,
        "ipv4_ttl_step": 1,
        "ipv4_checksum_override": packet_type.startswith("Ethernet/IPv4"),
        "ipv4_checksum": ip_header_fields["ipv4_checksum"],
        "ipv6_src": ip_header_fields["ipv6_src"],
        "ipv6_dst": ip_header_fields["ipv6_dst"],
        "ipv6_src_mode": "Fixed",
        "ipv6_src_count": 16,
        "ipv6_src_step": 1,
        "ipv6_dst_mode": "Fixed",
        "ipv6_dst_count": 16,
        "ipv6_dst_step": 1,
        "ipv6_traffic_class": ip_header_fields["ipv6_traffic_class"],
        "ipv6_traffic_class_mode": "Fixed",
        "ipv6_traffic_class_count": 16,
        "ipv6_traffic_class_step": 1,
        "ipv6_flow_label": ip_header_fields["ipv6_flow_label"],
        "ipv6_flow_label_mode": "Fixed",
        "ipv6_flow_label_count": 16,
        "ipv6_flow_label_step": 1,
        "ipv6_hop_limit": ip_header_fields["ipv6_hop_limit"],
        "ipv6_hop_limit_mode": "Fixed",
        "ipv6_hop_limit_count": 16,
        "ipv6_hop_limit_step": 1,
        "l4_src_port_override": has_l4,
        "l4_src_port": int.from_bytes(packet[l4_offset : l4_offset + 2], "big") if has_l4 else PROFILE_DEFAULT_SRC_PORT,
        "l4_dst_port_override": has_l4,
        "l4_dst_port": int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big") if has_l4 else PROFILE_DEFAULT_DST_PORT,
        "udp_length_override": protocol == 17,
        "udp_length": udp_length_from_packet(packet, l4_offset) if protocol == 17 else PROFILE_DEFAULT_UDP_LENGTH,
        "udp_length_mode": "Fixed",
        "udp_length_count": 16,
        "udp_length_step": 1,
        "udp_checksum_override": protocol == 17,
        "udp_checksum": udp_checksum_from_packet(packet, l4_offset) if protocol == 17 else PROFILE_DEFAULT_UDP_CHECKSUM,
        "udp_checksum_mode": "Fixed",
        "udp_checksum_count": 16,
        "udp_checksum_step": 1,
        **sctp_fields,
        **dns_fields,
        **dhcp_fields,
        **icmp_fields,
        **tcp_fields,
        "payload_enabled": True,
        "payload_type": "Fixed Word",
        "payload_pattern": "00",
        "advanced_cache_size_type": "Auto",
        "advanced_cache_value": 5000,
        "packet_binary_base64": base64.b64encode(packet).decode("ascii"),
    }
