from __future__ import annotations

import ipaddress
import struct
from typing import Any

from app.trex.capture_decode import (
    _dhcp_parameter_request_list_text,
    _dns_name_end_offset,
    _mac_text,
    _tcp_options_from_packet,
)
from app.trex.result import TrexCallResult
from app.trex.workbench_inputs import (
    clean_dhcp_hostname as _clean_dhcp_hostname,
    clean_dns_query_name as _clean_dns_query_name,
)
from app.trex.workbench_values import (
    PROFILE_DEFAULT_DHCP_HOSTNAME,
    PROFILE_DEFAULT_DNS_QUERY_NAME,
    PROFILE_DEFAULT_DST_IPV4,
    PROFILE_DEFAULT_DST_MAC,
    PROFILE_DEFAULT_ICMP_TYPE,
    PROFILE_DEFAULT_SRC_IPV4,
    PROFILE_DEFAULT_SRC_MAC,
    PROFILE_DEFAULT_TCP_OPTION_MSS,
    PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE,
    PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE,
    PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO,
    PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE,
    PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE,
    PROFILE_DEFAULT_UDP_CHECKSUM,
    PROFILE_DEFAULT_UDP_LENGTH,
    default_arp_fields,
    default_dhcp_fields,
    default_dns_fields,
    default_icmp_fields,
    default_sctp_fields,
    default_tcp_fields,
)


def dns_fields_from_packet(packet: bytes, l4_offset: int, is_udp: bool) -> dict[str, Any]:
    fields = default_dns_fields()
    if not is_udp or len(packet) < l4_offset + 8:
        return fields
    src_port = int.from_bytes(packet[l4_offset : l4_offset + 2], "big")
    dst_port = int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big")
    if src_port != 53 and dst_port != 53:
        return fields
    udp_length = int.from_bytes(packet[l4_offset + 4 : l4_offset + 6], "big")
    payload_start = l4_offset + 8
    payload_end = min(len(packet), payload_start + max(0, udp_length - 8))
    payload = packet[payload_start:payload_end]
    if len(payload) < 17:
        return fields
    transaction_id, flags, question_count, answer_count, _authority_count, _additional_count = struct.unpack(
        "!HHHHHH", payload[:12]
    )
    if question_count < 1:
        return fields
    offset = 12
    labels: list[str] = []
    while offset < len(payload):
        label_length = payload[offset]
        offset += 1
        if label_length == 0:
            break
        if label_length & 0xC0:
            return fields
        if label_length > 63 or offset + label_length > len(payload):
            return fields
        try:
            label = payload[offset : offset + label_length].decode("ascii")
        except UnicodeDecodeError:
            return fields
        cleaned_label = _clean_dns_query_name(label, label)
        if isinstance(cleaned_label, TrexCallResult):
            return fields
        labels.append(label.lower())
        offset += label_length
    else:
        return fields
    if not labels or offset + 4 > len(payload):
        return fields
    query_name = ".".join(labels)
    cleaned_name = _clean_dns_query_name(query_name, PROFILE_DEFAULT_DNS_QUERY_NAME)
    if isinstance(cleaned_name, TrexCallResult):
        return fields
    query_type = int.from_bytes(payload[offset : offset + 2], "big")
    query_class = int.from_bytes(payload[offset + 2 : offset + 4], "big")
    answer_offset = offset + 4
    fields.update(
        {
            "dns_enabled": True,
            "dns_transaction_id": transaction_id,
            "dns_flags": f"{flags:04X}",
            "dns_query_name": cleaned_name,
            "dns_query_type": query_type,
            "dns_query_class": query_class,
        }
    )
    if answer_count >= 1:
        answer_name_end = _dns_name_end_offset(payload, answer_offset)
        if answer_name_end is not None and answer_name_end + 10 <= len(payload):
            answer_type = int.from_bytes(payload[answer_name_end : answer_name_end + 2], "big")
            answer_class = int.from_bytes(payload[answer_name_end + 2 : answer_name_end + 4], "big")
            answer_ttl = int.from_bytes(payload[answer_name_end + 4 : answer_name_end + 8], "big")
            answer_length = int.from_bytes(payload[answer_name_end + 8 : answer_name_end + 10], "big")
            answer_value_offset = answer_name_end + 10
            if (
                answer_type == 1
                and answer_class == query_class
                and answer_length == 4
                and answer_value_offset + 4 <= len(payload)
            ):
                fields.update(
                    {
                        "dns_answer_enabled": True,
                        "dns_answer_ttl": answer_ttl,
                        "dns_answer_ipv4": str(ipaddress.IPv4Address(payload[answer_value_offset : answer_value_offset + 4])),
                    }
                )
    return fields


def dhcp_fields_from_packet(packet: bytes, l4_offset: int, is_udp: bool) -> dict[str, Any]:
    fields = default_dhcp_fields()
    if not is_udp or len(packet) < l4_offset + 8:
        return fields
    src_port = int.from_bytes(packet[l4_offset : l4_offset + 2], "big")
    dst_port = int.from_bytes(packet[l4_offset + 2 : l4_offset + 4], "big")
    if {src_port, dst_port} != {67, 68}:
        return fields
    udp_length = int.from_bytes(packet[l4_offset + 4 : l4_offset + 6], "big")
    payload_start = l4_offset + 8
    payload_end = min(len(packet), payload_start + max(0, udp_length - 8))
    payload = packet[payload_start:payload_end]
    if len(payload) < 240 or payload[236:240] != b"\x63\x82\x53\x63":
        return fields
    client_mac = ":".join(f"{byte:02x}" for byte in payload[28:34])
    fields.update(
        {
            "dhcp_enabled": True,
            "dhcp_operation": payload[0],
            "dhcp_hops": payload[3],
            "dhcp_xid": int.from_bytes(payload[4:8], "big"),
            "dhcp_seconds": int.from_bytes(payload[8:10], "big"),
            "dhcp_flags": f"{int.from_bytes(payload[10:12], 'big'):04X}",
            "dhcp_client_ip": str(ipaddress.ip_address(payload[12:16])),
            "dhcp_your_ip": str(ipaddress.ip_address(payload[16:20])),
            "dhcp_server_ip": str(ipaddress.ip_address(payload[20:24])),
            "dhcp_relay_ip": str(ipaddress.ip_address(payload[24:28])),
            "dhcp_client_mac": client_mac,
        }
    )
    offset = 240
    while offset < len(payload):
        code = payload[offset]
        offset += 1
        if code == 0:
            continue
        if code == 255:
            break
        if offset >= len(payload):
            break
        option_length = payload[offset]
        offset += 1
        if offset + option_length > len(payload):
            break
        value = payload[offset : offset + option_length]
        offset += option_length
        if code == 53 and len(value) == 1:
            fields["dhcp_message_type"] = value[0]
        elif code == 12:
            try:
                hostname = value.decode("ascii")
            except UnicodeDecodeError:
                hostname = PROFILE_DEFAULT_DHCP_HOSTNAME
            cleaned_hostname = _clean_dhcp_hostname(hostname, PROFILE_DEFAULT_DHCP_HOSTNAME)
            if not isinstance(cleaned_hostname, TrexCallResult):
                fields["dhcp_hostname"] = cleaned_hostname
        elif code == 50 and len(value) == 4:
            fields["dhcp_requested_ip"] = str(ipaddress.ip_address(value))
        elif code == 54 and len(value) == 4:
            fields["dhcp_server_id"] = str(ipaddress.ip_address(value))
        elif code == 55:
            fields["dhcp_parameter_request_list"] = _dhcp_parameter_request_list_text(value)
        elif code == 51 and len(value) == 4:
            fields["dhcp_lease_time"] = int.from_bytes(value, "big")
        elif code == 58 and len(value) == 4:
            fields["dhcp_renewal_time"] = int.from_bytes(value, "big")
        elif code == 59 and len(value) == 4:
            fields["dhcp_rebinding_time"] = int.from_bytes(value, "big")
    return fields


def arp_fields_from_packet(packet: bytes, offset: int) -> dict[str, Any]:
    if len(packet) < offset + 8:
        return default_arp_fields()
    hardware_type, protocol_type, hardware_size, protocol_size, operation = struct.unpack(
        "!HHBBH", packet[offset : offset + 8]
    )
    fields = {
        "arp_hardware_type": hardware_type,
        "arp_protocol_type": f"{protocol_type:04X}",
        "arp_hardware_size": hardware_size,
        "arp_protocol_size": protocol_size,
        "arp_operation": operation,
        "arp_operation_mode": "Fixed",
        "arp_operation_count": 4,
        "arp_operation_step": 1,
        "arp_sender_mac": PROFILE_DEFAULT_SRC_MAC,
        "arp_sender_mac_mode": "Fixed",
        "arp_sender_mac_count": 16,
        "arp_sender_mac_step": 1,
        "arp_sender_ip": PROFILE_DEFAULT_SRC_IPV4,
        "arp_sender_ip_mode": "Fixed",
        "arp_sender_ip_count": 16,
        "arp_sender_ip_step": 1,
        "arp_target_mac": PROFILE_DEFAULT_DST_MAC,
        "arp_target_mac_mode": "Fixed",
        "arp_target_mac_count": 16,
        "arp_target_mac_step": 1,
        "arp_target_ip": PROFILE_DEFAULT_DST_IPV4,
        "arp_target_ip_mode": "Fixed",
        "arp_target_ip_count": 16,
        "arp_target_ip_step": 1,
    }
    if hardware_size == 6 and protocol_size == 4 and len(packet) >= offset + 28:
        fields.update(
            {
                "arp_sender_mac": _mac_text(packet[offset + 8 : offset + 14]),
                "arp_sender_ip": packet_ipv4_from_binary(packet, offset + 14, PROFILE_DEFAULT_SRC_IPV4),
                "arp_target_mac": _mac_text(packet[offset + 18 : offset + 24]),
                "arp_target_ip": packet_ipv4_from_binary(packet, offset + 24, PROFILE_DEFAULT_DST_IPV4),
            }
        )
    return fields


def tcp_fields_from_packet(packet: bytes, offset: int) -> dict[str, Any]:
    if len(packet) < offset + 20:
        return default_tcp_fields()
    flags = int.from_bytes(packet[offset + 12 : offset + 14], "big") & 0x003F
    options = _tcp_options_from_packet(packet, offset)
    return {
        "tcp_sequence_number": int.from_bytes(packet[offset + 4 : offset + 8], "big"),
        "tcp_sequence_mode": "Fixed",
        "tcp_sequence_count": 16,
        "tcp_sequence_step": 1,
        "tcp_ack_number": int.from_bytes(packet[offset + 8 : offset + 12], "big"),
        "tcp_ack_mode": "Fixed",
        "tcp_ack_count": 16,
        "tcp_ack_step": 1,
        "tcp_window": int.from_bytes(packet[offset + 14 : offset + 16], "big"),
        "tcp_window_mode": "Fixed",
        "tcp_window_count": 16,
        "tcp_window_step": 1,
        "tcp_checksum_override": True,
        "tcp_checksum": f"{int.from_bytes(packet[offset + 16 : offset + 18], 'big'):04X}",
        "tcp_checksum_mode": "Fixed",
        "tcp_checksum_count": 16,
        "tcp_checksum_step": 1,
        "tcp_option_mss_enabled": options["mss"] is not None,
        "tcp_option_mss": options["mss"] if options["mss"] is not None else PROFILE_DEFAULT_TCP_OPTION_MSS,
        "tcp_option_mss_mode": "Fixed",
        "tcp_option_mss_count": 16,
        "tcp_option_mss_step": 1,
        "tcp_option_window_scale_enabled": options["window_scale"] is not None,
        "tcp_option_window_scale": options["window_scale"]
        if options["window_scale"] is not None
        else PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE,
        "tcp_option_window_scale_mode": "Fixed",
        "tcp_option_window_scale_count": 16,
        "tcp_option_window_scale_step": 1,
        "tcp_option_sack_permitted_enabled": options["sack_permitted"],
        "tcp_option_sack_blocks_enabled": options["sack"] is not None,
        "tcp_option_sack_left_edge": options["sack"][0]
        if options["sack"] is not None
        else PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE,
        "tcp_option_sack_left_edge_mode": "Fixed",
        "tcp_option_sack_left_edge_count": 16,
        "tcp_option_sack_left_edge_step": 1,
        "tcp_option_sack_right_edge": options["sack"][1]
        if options["sack"] is not None
        else PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE,
        "tcp_option_sack_right_edge_mode": "Fixed",
        "tcp_option_sack_right_edge_count": 16,
        "tcp_option_sack_right_edge_step": 1,
        "tcp_option_timestamp_enabled": options["timestamp"] is not None,
        "tcp_option_timestamp_value": options["timestamp"][0]
        if options["timestamp"] is not None
        else PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE,
        "tcp_option_timestamp_value_mode": "Fixed",
        "tcp_option_timestamp_value_count": 16,
        "tcp_option_timestamp_value_step": 1,
        "tcp_option_timestamp_echo": options["timestamp"][1]
        if options["timestamp"] is not None
        else PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO,
        "tcp_option_timestamp_echo_mode": "Fixed",
        "tcp_option_timestamp_echo_count": 16,
        "tcp_option_timestamp_echo_step": 1,
        "tcp_urgent_pointer": int.from_bytes(packet[offset + 18 : offset + 20], "big"),
        "tcp_urgent_pointer_mode": "Fixed",
        "tcp_urgent_pointer_count": 16,
        "tcp_urgent_pointer_step": 1,
        "tcp_flags_mode": "Fixed",
        "tcp_flags_count": 16,
        "tcp_flags_step": 1,
        "tcp_flag_urg": bool(flags & 0x20),
        "tcp_flag_ack": bool(flags & 0x10),
        "tcp_flag_psh": bool(flags & 0x08),
        "tcp_flag_rst": bool(flags & 0x04),
        "tcp_flag_syn": bool(flags & 0x02),
        "tcp_flag_fin": bool(flags & 0x01),
    }


def sctp_fields_from_packet(packet: bytes, offset: int) -> dict[str, Any]:
    fields = default_sctp_fields()
    if len(packet) < offset + 12:
        return fields
    fields.update(
        {
            "sctp_verification_tag": int.from_bytes(packet[offset + 4 : offset + 8], "big"),
            "sctp_checksum_override": True,
            "sctp_checksum": f"{int.from_bytes(packet[offset + 8 : offset + 12], 'little'):08X}",
        }
    )
    chunk_offset = offset + 12
    if len(packet) >= chunk_offset + 16 and packet[chunk_offset] == 0:
        fields.update(
            {
                "sctp_data_flags": packet[chunk_offset + 1],
                "sctp_tsn": int.from_bytes(packet[chunk_offset + 4 : chunk_offset + 8], "big"),
                "sctp_stream_id": int.from_bytes(packet[chunk_offset + 8 : chunk_offset + 10], "big"),
                "sctp_stream_sequence": int.from_bytes(packet[chunk_offset + 10 : chunk_offset + 12], "big"),
                "sctp_payload_protocol_id": int.from_bytes(packet[chunk_offset + 12 : chunk_offset + 16], "big"),
            }
        )
    return fields


def icmp_fields_from_packet(
    packet: bytes,
    offset: int,
    default_type: int = PROFILE_DEFAULT_ICMP_TYPE,
) -> dict[str, Any]:
    if len(packet) < offset + 8:
        return default_icmp_fields(default_type)
    fields = default_icmp_fields(default_type)
    fields.update(
        {
            "icmp_type": packet[offset],
            "icmp_code": packet[offset + 1],
            "icmp_checksum_override": True,
            "icmp_checksum": f"{int.from_bytes(packet[offset + 2 : offset + 4], 'big'):04X}",
            "icmp_identifier": int.from_bytes(packet[offset + 4 : offset + 6], "big"),
            "icmp_sequence": int.from_bytes(packet[offset + 6 : offset + 8], "big"),
        }
    )
    if packet[offset] in {135, 136} and len(packet) >= offset + 24:
        fields["icmpv6_nd_target"] = str(ipaddress.IPv6Address(packet[offset + 8 : offset + 24]))
        if packet[offset] == 136:
            flags = packet[offset + 4]
            fields["icmpv6_nd_na_router"] = bool(flags & 0x80)
            fields["icmpv6_nd_na_solicited"] = bool(flags & 0x40)
            fields["icmpv6_nd_na_override"] = bool(flags & 0x20)
        option_offset = offset + 24
        if len(packet) >= option_offset + 8 and packet[option_offset + 1] >= 1 and packet[option_offset] in {1, 2}:
            fields["icmpv6_nd_include_option"] = True
            fields["icmpv6_nd_option_mac"] = _mac_text(packet[option_offset + 2 : option_offset + 8])
        else:
            fields["icmpv6_nd_include_option"] = False
    elif packet[offset] == 133:
        option_offset = offset + 8
        if len(packet) >= option_offset + 8 and packet[option_offset] == 1 and packet[option_offset + 1] >= 1:
            fields["icmpv6_rs_include_slla"] = True
            fields["icmpv6_rs_slla_mac"] = _mac_text(packet[option_offset + 2 : option_offset + 8])
        else:
            fields["icmpv6_rs_include_slla"] = False
    elif packet[offset] == 134 and len(packet) >= offset + 16:
        flags = packet[offset + 5]
        fields["icmpv6_ra_cur_hop_limit"] = packet[offset + 4]
        fields["icmpv6_ra_managed"] = bool(flags & 0x80)
        fields["icmpv6_ra_other"] = bool(flags & 0x40)
        fields["icmpv6_ra_router_lifetime"] = int.from_bytes(packet[offset + 6 : offset + 8], "big")
        fields["icmpv6_ra_reachable_time"] = int.from_bytes(packet[offset + 8 : offset + 12], "big")
        fields["icmpv6_ra_retrans_timer"] = int.from_bytes(packet[offset + 12 : offset + 16], "big")
        fields["icmpv6_ra_include_slla"] = False
        fields["icmpv6_ra_include_prefix"] = False
        option_offset = offset + 16
        while option_offset + 2 <= len(packet):
            option_type = packet[option_offset]
            option_length = packet[option_offset + 1] * 8
            if option_length < 8 or option_offset + option_length > len(packet):
                break
            if option_type == 1 and option_length >= 8:
                fields["icmpv6_ra_include_slla"] = True
                fields["icmpv6_ra_slla_mac"] = _mac_text(packet[option_offset + 2 : option_offset + 8])
            elif option_type == 3 and option_length >= 32:
                prefix_flags = packet[option_offset + 3]
                fields["icmpv6_ra_include_prefix"] = True
                fields["icmpv6_ra_prefix_length"] = packet[option_offset + 2]
                fields["icmpv6_ra_prefix_on_link"] = bool(prefix_flags & 0x80)
                fields["icmpv6_ra_prefix_autonomous"] = bool(prefix_flags & 0x40)
                fields["icmpv6_ra_prefix_valid_lifetime"] = int.from_bytes(
                    packet[option_offset + 4 : option_offset + 8], "big"
                )
                fields["icmpv6_ra_prefix_preferred_lifetime"] = int.from_bytes(
                    packet[option_offset + 8 : option_offset + 12], "big"
                )
                fields["icmpv6_ra_prefix"] = str(ipaddress.IPv6Address(packet[option_offset + 16 : option_offset + 32]))
            option_offset += option_length
    return fields


def udp_length_from_packet(packet: bytes, offset: int) -> int:
    if len(packet) < offset + 6:
        return PROFILE_DEFAULT_UDP_LENGTH
    return int.from_bytes(packet[offset + 4 : offset + 6], "big")


def udp_checksum_from_packet(packet: bytes, offset: int) -> str:
    if len(packet) < offset + 8:
        return PROFILE_DEFAULT_UDP_CHECKSUM
    return f"{int.from_bytes(packet[offset + 6 : offset + 8], 'big'):04X}"


def packet_mac_from_binary(packet: bytes, offset: int, fallback: str) -> str:
    if len(packet) >= offset + 6:
        return _mac_text(packet[offset : offset + 6])
    return fallback


def packet_ipv4_from_binary(packet: bytes, offset: int, fallback: str) -> str:
    if len(packet) >= offset + 4:
        return ".".join(str(octet) for octet in packet[offset : offset + 4])
    return fallback


def packet_ipv6_from_binary(packet: bytes, offset: int, fallback: str) -> str:
    if len(packet) >= offset + 16:
        return str(ipaddress.IPv6Address(packet[offset : offset + 16]))
    return fallback


def packet_byte_from_binary(packet: bytes, offset: int, fallback: int) -> int:
    if len(packet) > offset:
        return packet[offset]
    return fallback


def packet_word_from_binary(packet: bytes, offset: int, fallback: int) -> int:
    if len(packet) >= offset + 2:
        return int.from_bytes(packet[offset : offset + 2], "big")
    return fallback


def packet_ipv6_traffic_class_from_binary(packet: bytes, offset: int, fallback: int) -> int:
    if len(packet) >= offset + 2:
        return ((packet[offset] & 0x0F) << 4) | (packet[offset + 1] >> 4)
    return fallback


def packet_ipv6_flow_label_from_binary(packet: bytes, offset: int, fallback: int) -> int:
    if len(packet) >= offset + 4:
        return int.from_bytes(packet[offset : offset + 4], "big") & 0x000FFFFF
    return fallback


def packet_port_from_binary(packet: bytes, offset: int, fallback: int) -> int:
    if len(packet) >= offset + 2:
        return int.from_bytes(packet[offset : offset + 2], "big")
    return fallback
