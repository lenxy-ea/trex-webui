from __future__ import annotations

import base64
from typing import Any

from app.trex.result import TrexCallResult
from app.trex.workbench_packet_build import dns_query_bytes as _dns_query_bytes
from app.trex.workbench_inputs import (
    clean_dhcp_hostname as _clean_dhcp_hostname,
    clean_dhcp_parameter_request_list as _clean_dhcp_parameter_request_list,
    clean_dns_query_name as _clean_dns_query_name,
    clean_payload_pattern as _clean_payload_pattern,
    normalize_workbench_advanced_fields as _normalize_workbench_advanced_fields,
    packet_binary_from_base64 as _packet_binary_from_base64,
)
from app.trex.workbench_layout import (
    workbench_gre_header_length as _gre_header_length,
    workbench_gtpu_extension_header_length as _workbench_gtpu_extension_header_length,
    workbench_gtpu_optional_header_length as _workbench_gtpu_optional_header_length,
    workbench_icmp_header_length as _icmp_header_length,
    workbench_l2_header_length as _workbench_l2_header_length,
    workbench_sctp_header_length as _sctp_header_length,
    workbench_vxlan_inner_ip_version as _workbench_vxlan_inner_ip_version,
)
from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version as _workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version as _workbench_gtpu_inner_ip_version,
    workbench_has_arp as _workbench_has_arp,
    workbench_has_dhcp as _workbench_has_dhcp,
    workbench_has_dns as _workbench_has_dns,
    workbench_has_gre as _workbench_has_gre,
    workbench_has_gtpu as _workbench_has_gtpu,
    workbench_has_icmp as _workbench_has_icmp,
    workbench_has_l3 as _workbench_has_l3,
    workbench_has_l4 as _workbench_has_l4,
    workbench_has_sctp as _workbench_has_sctp,
    workbench_has_transport_ports as _workbench_has_transport_ports,
    workbench_is_icmp_echo as _workbench_is_icmp_echo,
    workbench_is_icmpv6_control as _workbench_is_icmpv6_control,
    workbench_is_icmpv6_echo as _workbench_is_icmpv6_echo,
    workbench_l3_header_length as _workbench_l3_header_length,
    workbench_supports_variable_frame_length as _workbench_supports_variable_frame_length,
)
from app.trex.workbench_values import (
    CAPTURE_GTPU_PORT,
    PROFILE_DEFAULT_ARP_HARDWARE_SIZE,
    PROFILE_DEFAULT_ARP_HARDWARE_TYPE,
    PROFILE_DEFAULT_ARP_OPERATION,
    PROFILE_DEFAULT_ARP_PROTOCOL_SIZE,
    PROFILE_DEFAULT_ARP_PROTOCOL_TYPE,
    PROFILE_DEFAULT_DHCP_CLIENT_IP,
    PROFILE_DEFAULT_DHCP_CLIENT_MAC,
    PROFILE_DEFAULT_DHCP_FLAGS,
    PROFILE_DEFAULT_DHCP_HOPS,
    PROFILE_DEFAULT_DHCP_HOSTNAME,
    PROFILE_DEFAULT_DHCP_LEASE_TIME,
    PROFILE_DEFAULT_DHCP_MESSAGE_TYPE,
    PROFILE_DEFAULT_DHCP_OPERATION,
    PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
    PROFILE_DEFAULT_DHCP_REBINDING_TIME,
    PROFILE_DEFAULT_DHCP_RELAY_IP,
    PROFILE_DEFAULT_DHCP_RENEWAL_TIME,
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
    PROFILE_DEFAULT_DST_IPV4,
    PROFILE_DEFAULT_DST_IPV6,
    PROFILE_DEFAULT_DST_MAC,
    PROFILE_DEFAULT_DST_PORT,
    PROFILE_DEFAULT_ETHER_TYPE,
    PROFILE_DEFAULT_GRE_CHECKSUM,
    PROFILE_DEFAULT_GRE_INNER_DST_IPV4,
    PROFILE_DEFAULT_GRE_INNER_DST_IPV6,
    PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT,
    PROFILE_DEFAULT_GRE_INNER_SRC_IPV4,
    PROFILE_DEFAULT_GRE_INNER_SRC_IPV6,
    PROFILE_DEFAULT_GRE_KEY,
    PROFILE_DEFAULT_GRE_PROTOCOL_TYPE,
    PROFILE_DEFAULT_GRE_SEQUENCE,
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
    PROFILE_DEFAULT_ICMP_CHECKSUM,
    PROFILE_DEFAULT_ICMP_CODE,
    PROFILE_DEFAULT_ICMP_IDENTIFIER,
    PROFILE_DEFAULT_ICMP_SEQUENCE,
    PROFILE_DEFAULT_ICMP_TYPE,
    PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC,
    PROFILE_DEFAULT_ICMPV6_ND_TARGET,
    PROFILE_DEFAULT_ICMPV6_RA_PREFIX,
    PROFILE_DEFAULT_ICMPV6_RA_PREFIX_PREFERRED_LIFETIME,
    PROFILE_DEFAULT_ICMPV6_RA_PREFIX_VALID_LIFETIME,
    PROFILE_DEFAULT_ICMPV6_RA_ROUTER_LIFETIME,
    PROFILE_DEFAULT_ICMPV6_TYPE,
    PROFILE_DEFAULT_IP_DSCP,
    PROFILE_DEFAULT_IP_ECN,
    PROFILE_DEFAULT_IP_ID,
    PROFILE_DEFAULT_IP_TTL,
    PROFILE_DEFAULT_IPV4_CHECKSUM,
    PROFILE_DEFAULT_IPV6_FLOW_LABEL,
    PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS,
    PROFILE_DEFAULT_MPLS_LABEL,
    PROFILE_DEFAULT_MPLS_TC,
    PROFILE_DEFAULT_MPLS_TTL,
    PROFILE_DEFAULT_SCTP_CHECKSUM,
    PROFILE_DEFAULT_SCTP_DATA_FLAGS,
    PROFILE_DEFAULT_SCTP_PAYLOAD_PROTOCOL_ID,
    PROFILE_DEFAULT_SCTP_STREAM_ID,
    PROFILE_DEFAULT_SCTP_STREAM_SEQUENCE,
    PROFILE_DEFAULT_SCTP_TSN,
    PROFILE_DEFAULT_SCTP_VERIFICATION_TAG,
    PROFILE_DEFAULT_SRC_IPV4,
    PROFILE_DEFAULT_SRC_IPV6,
    PROFILE_DEFAULT_SRC_MAC,
    PROFILE_DEFAULT_SRC_PORT,
    PROFILE_DEFAULT_TCP_ACKNOWLEDGE,
    PROFILE_DEFAULT_TCP_CHECKSUM,
    PROFILE_DEFAULT_TCP_OPTION_MSS,
    PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE,
    PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE,
    PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO,
    PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE,
    PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE,
    PROFILE_DEFAULT_TCP_SEQUENCE,
    PROFILE_DEFAULT_TCP_URGENT_POINTER,
    PROFILE_DEFAULT_TCP_WINDOW,
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
    PROFILE_DEFAULT_VXLAN_OUTER_SRC_PORT,
    PROFILE_DEFAULT_VXLAN_VNI,
    PROFILE_DHCP_MIN_PAYLOAD_BYTES,
    PROFILE_MAX_VLAN_ID,
    PROFILE_WORKBENCH_CACHE_SIZE_TYPES,
    PROFILE_WORKBENCH_DHCP_FE_FIELDS,
    PROFILE_WORKBENCH_DNS_FE_FIELDS,
    PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
    PROFILE_WORKBENCH_FRAME_LENGTH_TYPES,
    PROFILE_WORKBENCH_GRE_INNER_IP_VERSIONS,
    PROFILE_WORKBENCH_GTPU_INNER_IP_VERSIONS,
    PROFILE_WORKBENCH_IPV4_ADDRESS_MODES,
    PROFILE_WORKBENCH_IPV6_ADDRESS_MODES,
    PROFILE_WORKBENCH_L4_PORT_MODES,
    PROFILE_WORKBENCH_MAC_ADDRESS_MODES,
    PROFILE_WORKBENCH_MODES,
    PROFILE_WORKBENCH_MPLS_LABEL_MODES,
    PROFILE_WORKBENCH_PACKET_TYPES,
    PROFILE_WORKBENCH_PAYLOAD_TYPES,
    PROFILE_WORKBENCH_RATE_TYPES,
    PROFILE_WORKBENCH_VXLAN_INNER_IP_VERSIONS,
    bool_value as _bool,
    bounded_float as _bounded_float,
    bounded_int as _bounded_int,
    bounded_large_unit_count as _bounded_large_unit_count,
    choice as _choice,
    clean_hex_dword_text_upper as _clean_hex_dword_text_upper,
    clean_hex_word_text as _clean_hex_word_text,
    clean_hex_word_text_upper as _clean_hex_word_text_upper,
    clean_ipv4_text as _clean_ipv4_text,
    clean_ipv6_text as _clean_ipv6_text,
    clean_mac_text as _clean_mac_text,
    clean_stream_name as _clean_stream_name,
    optional_bounded_int as _optional_bounded_int,
)

def normalize_workbench_streams(streams: list[dict[str, Any]]) -> list[dict[str, Any]] | TrexCallResult:
    if not isinstance(streams, list) or len(streams) == 0:
        return TrexCallResult(False, blocker="profile_streams_missing", error="at least one stream is required")
    if len(streams) > 512:
        return TrexCallResult(False, blocker="profile_streams_too_many", error="stream count exceeds 512")

    normalized: list[dict[str, Any]] = []
    for index, stream in enumerate(streams):
        if not isinstance(stream, dict):
            return TrexCallResult(False, blocker="profile_stream_invalid", error=f"stream {index + 1} must be an object")
        name = _clean_stream_name(stream.get("name"), index)
        packet_type = _choice(stream.get("packet_type"), PROFILE_WORKBENCH_PACKET_TYPES, "Ethernet/IPv4/UDP")
        mode = _choice(stream.get("mode"), PROFILE_WORKBENCH_MODES, "continuous")
        rate_type = _choice(stream.get("rate_type"), PROFILE_WORKBENCH_RATE_TYPES, "pps")
        vxlan_enabled = _bool(stream.get("vxlan_enabled"), False)
        gtpu_enabled = _bool(stream.get("gtpu_enabled"), False)
        if gtpu_enabled:
            vxlan_enabled = False
        if vxlan_enabled or gtpu_enabled:
            packet_type = "Ethernet/IPv4/UDP"
        packet_binary = _packet_binary_from_base64(stream.get("packet_binary_base64"))
        if isinstance(packet_binary, TrexCallResult):
            return packet_binary
        payload_enabled = _bool(stream.get("payload_enabled"), True)
        payload_type = _choice(stream.get("payload_type"), PROFILE_WORKBENCH_PAYLOAD_TYPES, "Fixed Word")
        payload_pattern = _clean_payload_pattern(stream.get("payload_pattern"))
        if isinstance(payload_pattern, TrexCallResult):
            if payload_enabled and payload_type == "Fixed Word":
                return payload_pattern
            payload_pattern = "00"
        dns_enabled = _bool(stream.get("dns_enabled"), False)
        dns_query_name = _clean_dns_query_name(stream.get("dns_query_name"), PROFILE_DEFAULT_DNS_QUERY_NAME)
        if isinstance(dns_query_name, TrexCallResult):
            if dns_enabled:
                return dns_query_name
            dns_query_name = PROFILE_DEFAULT_DNS_QUERY_NAME
        dns_answer_ipv4 = _clean_ipv4_text(stream.get("dns_answer_ipv4"), PROFILE_DEFAULT_DNS_ANSWER_IPV4)
        dhcp_enabled = _bool(stream.get("dhcp_enabled"), False)
        dhcp_hostname = _clean_dhcp_hostname(stream.get("dhcp_hostname"), PROFILE_DEFAULT_DHCP_HOSTNAME)
        if isinstance(dhcp_hostname, TrexCallResult):
            if dhcp_enabled:
                return dhcp_hostname
            dhcp_hostname = PROFILE_DEFAULT_DHCP_HOSTNAME
        dhcp_parameter_request_list = _clean_dhcp_parameter_request_list(
            stream.get("dhcp_parameter_request_list"),
            PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
        )
        if isinstance(dhcp_parameter_request_list, TrexCallResult):
            if dhcp_enabled:
                return dhcp_parameter_request_list
            dhcp_parameter_request_list = PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST
        frame_length_type = _choice(stream.get("frame_length_type"), PROFILE_WORKBENCH_FRAME_LENGTH_TYPES, "Fixed")
        frame_length = _bounded_int(stream.get("frame_length"), 64, 9216, 64)
        frame_length_min = _bounded_int(stream.get("frame_length_min"), 64, 9216, 64)
        frame_length_max = _bounded_int(stream.get("frame_length_max"), 64, 9216, max(1518, frame_length))
        if frame_length_type != "Fixed":
            frame_length_min = min(frame_length_min, 9211)
            if frame_length_max <= frame_length_min:
                frame_length_max = min(9216, frame_length_min + 5)
            frame_length = frame_length_max
        if packet_binary is not None:
            frame_length_type = "Fixed"
            frame_length = _bounded_int(len(packet_binary) + 4, 64, 9216, frame_length)
            frame_length_min = 64
            frame_length_max = max(1518, frame_length)
        next_stream_id = _optional_bounded_int(stream.get("next_stream_id"), 1, len(streams))
        l4_src_port_override = _bool(stream.get("l4_src_port_override"), False)
        l4_dst_port_override = _bool(stream.get("l4_dst_port_override"), False)
        l4_src_port_source = None if (vxlan_enabled or gtpu_enabled) and not l4_src_port_override else stream.get("l4_src_port")
        l4_dst_port_source = None if (vxlan_enabled or gtpu_enabled) and not l4_dst_port_override else stream.get("l4_dst_port")
        icmp_type_fallback = PROFILE_DEFAULT_ICMPV6_TYPE if packet_type.endswith("/ICMPv6") else PROFILE_DEFAULT_ICMP_TYPE
        normalized_stream = {
            "name": name,
            "packet_type": packet_type,
            "frame_length_type": frame_length_type,
            "frame_length": frame_length,
            "frame_length_min": frame_length_min,
            "frame_length_max": frame_length_max,
            "mode": mode,
            "rate_type": rate_type,
            "rate_value": _bounded_float(stream.get("rate_value"), 0.000001, 1_000_000_000_000.0, 1.0),
            "enabled": _bool(stream.get("enabled"), True),
            "self_start": _bool(stream.get("self_start"), True),
            "total_pkts": _bounded_int(stream.get("total_pkts"), 1, 4_294_967_295, 1),
            "pkts_per_burst": _bounded_int(stream.get("pkts_per_burst"), 1, 4_294_967_295, 1),
            "count": _bounded_int(stream.get("count"), 1, 4_294_967_295, 1),
            "next_stream_id": next_stream_id,
            "action_count": _bounded_int(stream.get("action_count"), 0, 4_294_967_295, 0)
            if next_stream_id is not None
            else 0,
            "isg": _bounded_float(stream.get("isg"), 0.0, 86_400.0, 0.0),
            "ibg": _bounded_float(stream.get("ibg"), 0.0, 86_400.0, 0.0),
            "pg_id": _bounded_int(stream.get("pg_id"), 0, 16_777_215, index + 1),
            "flow_stats_enabled": _bool(stream.get("flow_stats_enabled"), True),
            "latency_enabled": _bool(stream.get("latency_enabled"), False),
            "ether_dst": _clean_mac_text(stream.get("ether_dst"), PROFILE_DEFAULT_DST_MAC),
            "ether_src": _clean_mac_text(stream.get("ether_src"), PROFILE_DEFAULT_SRC_MAC),
            "ether_type_override": _bool(stream.get("ether_type_override"), False),
            "ether_type": _clean_hex_word_text(stream.get("ether_type"), PROFILE_DEFAULT_ETHER_TYPE),
            "ether_dst_mode": _choice(stream.get("ether_dst_mode"), PROFILE_WORKBENCH_MAC_ADDRESS_MODES, "TRex Config"),
            "ether_dst_count": _bounded_int(stream.get("ether_dst_count"), 1, 9999, 16),
            "ether_dst_step": _bounded_int(stream.get("ether_dst_step"), 1, 999, 1),
            "ether_src_mode": _choice(stream.get("ether_src_mode"), PROFILE_WORKBENCH_MAC_ADDRESS_MODES, "TRex Config"),
            "ether_src_count": _bounded_int(stream.get("ether_src_count"), 1, 9999, 16),
            "ether_src_step": _bounded_int(stream.get("ether_src_step"), 1, 999, 1),
            "arp_hardware_type": _bounded_int(
                stream.get("arp_hardware_type"), 0, 65_535, PROFILE_DEFAULT_ARP_HARDWARE_TYPE
            ),
            "arp_protocol_type": _clean_hex_word_text_upper(
                stream.get("arp_protocol_type"), PROFILE_DEFAULT_ARP_PROTOCOL_TYPE
            ),
            "arp_hardware_size": _bounded_int(
                stream.get("arp_hardware_size"), 0, 255, PROFILE_DEFAULT_ARP_HARDWARE_SIZE
            ),
            "arp_protocol_size": _bounded_int(
                stream.get("arp_protocol_size"), 0, 255, PROFILE_DEFAULT_ARP_PROTOCOL_SIZE
            ),
            "arp_operation": _bounded_int(
                stream.get("arp_operation"), 0, 65_535, PROFILE_DEFAULT_ARP_OPERATION
            ),
            "arp_operation_mode": _choice(
                stream.get("arp_operation_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "arp_operation_count": _bounded_int(stream.get("arp_operation_count"), 2, 65_536, 4),
            "arp_operation_step": _bounded_int(stream.get("arp_operation_step"), 1, 65_535, 1),
            "arp_sender_mac": _clean_mac_text(stream.get("arp_sender_mac"), PROFILE_DEFAULT_SRC_MAC),
            "arp_sender_mac_mode": _choice(
                stream.get("arp_sender_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "arp_sender_mac_count": _bounded_int(stream.get("arp_sender_mac_count"), 2, 100_000_000, 16),
            "arp_sender_mac_step": _bounded_int(stream.get("arp_sender_mac_step"), 1, 100_000_000, 1),
            "arp_sender_ip": _clean_ipv4_text(stream.get("arp_sender_ip"), PROFILE_DEFAULT_SRC_IPV4),
            "arp_sender_ip_mode": _choice(
                stream.get("arp_sender_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "arp_sender_ip_count": _bounded_int(stream.get("arp_sender_ip_count"), 2, 100_000_000, 16),
            "arp_sender_ip_step": _bounded_int(stream.get("arp_sender_ip_step"), 1, 100_000_000, 1),
            "arp_target_mac": _clean_mac_text(stream.get("arp_target_mac"), PROFILE_DEFAULT_DST_MAC),
            "arp_target_mac_mode": _choice(
                stream.get("arp_target_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "arp_target_mac_count": _bounded_int(stream.get("arp_target_mac_count"), 2, 100_000_000, 16),
            "arp_target_mac_step": _bounded_int(stream.get("arp_target_mac_step"), 1, 100_000_000, 1),
            "arp_target_ip": _clean_ipv4_text(stream.get("arp_target_ip"), PROFILE_DEFAULT_DST_IPV4),
            "arp_target_ip_mode": _choice(
                stream.get("arp_target_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "arp_target_ip_count": _bounded_int(stream.get("arp_target_ip_count"), 2, 100_000_000, 16),
            "arp_target_ip_step": _bounded_int(stream.get("arp_target_ip_step"), 1, 100_000_000, 1),
            "vlan_enabled": _bool(stream.get("vlan_enabled"), False),
            "vlan_tpid_override": _bool(stream.get("vlan_tpid_override"), False),
            "vlan_tpid": _clean_hex_word_text(stream.get("vlan_tpid"), PROFILE_DEFAULT_VLAN_TPID),
            "vlan_priority": _bounded_int(stream.get("vlan_priority"), 0, 7, 0),
            "vlan_priority_mode": _choice(
                stream.get("vlan_priority_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "vlan_priority_count": _bounded_int(stream.get("vlan_priority_count"), 2, 8, 4),
            "vlan_priority_step": _bounded_int(stream.get("vlan_priority_step"), 1, 7, 1),
            "vlan_cfi": _bounded_int(stream.get("vlan_cfi"), 0, 1, 0),
            "vlan_id": _bounded_int(stream.get("vlan_id"), 0, PROFILE_MAX_VLAN_ID, 0),
            "vlan_id_mode": _choice(stream.get("vlan_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "vlan_id_count": _bounded_int(stream.get("vlan_id_count"), 2, PROFILE_MAX_VLAN_ID + 1, 16),
            "vlan_id_step": _bounded_int(stream.get("vlan_id_step"), 1, PROFILE_MAX_VLAN_ID, 1),
            "vlan2_enabled": _bool(stream.get("vlan2_enabled"), False),
            "vlan2_tpid_override": _bool(stream.get("vlan2_tpid_override"), False),
            "vlan2_tpid": _clean_hex_word_text(stream.get("vlan2_tpid"), PROFILE_DEFAULT_VLAN_TPID),
            "vlan2_priority": _bounded_int(stream.get("vlan2_priority"), 0, 7, 0),
            "vlan2_priority_mode": _choice(
                stream.get("vlan2_priority_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "vlan2_priority_count": _bounded_int(stream.get("vlan2_priority_count"), 2, 8, 4),
            "vlan2_priority_step": _bounded_int(stream.get("vlan2_priority_step"), 1, 7, 1),
            "vlan2_cfi": _bounded_int(stream.get("vlan2_cfi"), 0, 1, 0),
            "vlan2_id": _bounded_int(stream.get("vlan2_id"), 0, PROFILE_MAX_VLAN_ID, 1),
            "vlan2_id_mode": _choice(stream.get("vlan2_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "vlan2_id_count": _bounded_int(stream.get("vlan2_id_count"), 2, PROFILE_MAX_VLAN_ID + 1, 16),
            "vlan2_id_step": _bounded_int(stream.get("vlan2_id_step"), 1, PROFILE_MAX_VLAN_ID, 1),
            "mpls_enabled": _bool(stream.get("mpls_enabled"), False),
            "mpls_label": _bounded_int(stream.get("mpls_label"), 0, 1_048_575, PROFILE_DEFAULT_MPLS_LABEL),
            "mpls_label_mode": _choice(stream.get("mpls_label_mode"), PROFILE_WORKBENCH_MPLS_LABEL_MODES, "Fixed"),
            "mpls_label_count": _bounded_int(stream.get("mpls_label_count"), 2, 1_048_576, 16),
            "mpls_label_step": _bounded_int(stream.get("mpls_label_step"), 1, 1_048_575, 1),
            "mpls_tc": _bounded_int(stream.get("mpls_tc"), 0, 7, PROFILE_DEFAULT_MPLS_TC),
            "mpls_tc_mode": _choice(stream.get("mpls_tc_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "mpls_tc_count": _bounded_int(stream.get("mpls_tc_count"), 2, 8, 4),
            "mpls_tc_step": _bounded_int(stream.get("mpls_tc_step"), 1, 7, 1),
            "mpls_ttl": _bounded_int(stream.get("mpls_ttl"), 0, 255, PROFILE_DEFAULT_MPLS_TTL),
            "mpls_ttl_mode": _choice(stream.get("mpls_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "mpls_ttl_count": _bounded_int(stream.get("mpls_ttl_count"), 2, 256, 16),
            "mpls_ttl_step": _bounded_int(stream.get("mpls_ttl_step"), 1, 255, 1),
            "mpls_label2_enabled": _bool(stream.get("mpls_label2_enabled"), False),
            "mpls_label2": _bounded_int(stream.get("mpls_label2"), 0, 1_048_575, PROFILE_DEFAULT_MPLS_LABEL + 1),
            "mpls_label2_mode": _choice(stream.get("mpls_label2_mode"), PROFILE_WORKBENCH_MPLS_LABEL_MODES, "Fixed"),
            "mpls_label2_count": _bounded_int(stream.get("mpls_label2_count"), 2, 1_048_576, 16),
            "mpls_label2_step": _bounded_int(stream.get("mpls_label2_step"), 1, 1_048_575, 1),
            "mpls_label2_tc": _bounded_int(stream.get("mpls_label2_tc"), 0, 7, PROFILE_DEFAULT_MPLS_TC),
            "mpls_label2_tc_mode": _choice(stream.get("mpls_label2_tc_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "mpls_label2_tc_count": _bounded_int(stream.get("mpls_label2_tc_count"), 2, 8, 4),
            "mpls_label2_tc_step": _bounded_int(stream.get("mpls_label2_tc_step"), 1, 7, 1),
            "mpls_label2_ttl": _bounded_int(stream.get("mpls_label2_ttl"), 0, 255, PROFILE_DEFAULT_MPLS_TTL),
            "mpls_label2_ttl_mode": _choice(
                stream.get("mpls_label2_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "mpls_label2_ttl_count": _bounded_int(stream.get("mpls_label2_ttl_count"), 2, 256, 16),
            "mpls_label2_ttl_step": _bounded_int(stream.get("mpls_label2_ttl_step"), 1, 255, 1),
            "mpls_label3_enabled": _bool(stream.get("mpls_label3_enabled"), False),
            "mpls_label3": _bounded_int(stream.get("mpls_label3"), 0, 1_048_575, PROFILE_DEFAULT_MPLS_LABEL + 2),
            "mpls_label3_mode": _choice(stream.get("mpls_label3_mode"), PROFILE_WORKBENCH_MPLS_LABEL_MODES, "Fixed"),
            "mpls_label3_count": _bounded_int(stream.get("mpls_label3_count"), 2, 1_048_576, 16),
            "mpls_label3_step": _bounded_int(stream.get("mpls_label3_step"), 1, 1_048_575, 1),
            "mpls_label3_tc": _bounded_int(stream.get("mpls_label3_tc"), 0, 7, PROFILE_DEFAULT_MPLS_TC),
            "mpls_label3_tc_mode": _choice(stream.get("mpls_label3_tc_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "mpls_label3_tc_count": _bounded_int(stream.get("mpls_label3_tc_count"), 2, 8, 4),
            "mpls_label3_tc_step": _bounded_int(stream.get("mpls_label3_tc_step"), 1, 7, 1),
            "mpls_label3_ttl": _bounded_int(stream.get("mpls_label3_ttl"), 0, 255, PROFILE_DEFAULT_MPLS_TTL),
            "mpls_label3_ttl_mode": _choice(
                stream.get("mpls_label3_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "mpls_label3_ttl_count": _bounded_int(stream.get("mpls_label3_ttl_count"), 2, 256, 16),
            "mpls_label3_ttl_step": _bounded_int(stream.get("mpls_label3_ttl_step"), 1, 255, 1),
            "vxlan_enabled": vxlan_enabled,
            "vxlan_vni": _bounded_int(stream.get("vxlan_vni"), 0, 16_777_215, PROFILE_DEFAULT_VXLAN_VNI),
            "vxlan_vni_mode": _choice(stream.get("vxlan_vni_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "vxlan_vni_count": _bounded_int(stream.get("vxlan_vni_count"), 2, 16_777_216, 16),
            "vxlan_vni_step": _bounded_int(stream.get("vxlan_vni_step"), 1, 16_777_215, 1),
            "vxlan_inner_ether_dst": _clean_mac_text(stream.get("vxlan_inner_ether_dst"), PROFILE_DEFAULT_DST_MAC),
            "vxlan_inner_ether_src": _clean_mac_text(stream.get("vxlan_inner_ether_src"), PROFILE_DEFAULT_SRC_MAC),
            "vxlan_inner_ip_version": _choice(
                stream.get("vxlan_inner_ip_version"), PROFILE_WORKBENCH_VXLAN_INNER_IP_VERSIONS, "IPv4"
            ),
            "vxlan_inner_ipv4_src": _clean_ipv4_text(
                stream.get("vxlan_inner_ipv4_src"), PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4
            ),
            "vxlan_inner_ipv4_src_mode": _choice(
                stream.get("vxlan_inner_ipv4_src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "vxlan_inner_ipv4_src_count": _bounded_int(
                stream.get("vxlan_inner_ipv4_src_count"), 2, 100_000_000, 16
            ),
            "vxlan_inner_ipv4_src_step": _bounded_int(
                stream.get("vxlan_inner_ipv4_src_step"), 1, 100_000_000, 1
            ),
            "vxlan_inner_ipv4_dst": _clean_ipv4_text(
                stream.get("vxlan_inner_ipv4_dst"), PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4
            ),
            "vxlan_inner_ipv4_dst_mode": _choice(
                stream.get("vxlan_inner_ipv4_dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "vxlan_inner_ipv4_dst_count": _bounded_int(
                stream.get("vxlan_inner_ipv4_dst_count"), 2, 100_000_000, 16
            ),
            "vxlan_inner_ipv4_dst_step": _bounded_int(
                stream.get("vxlan_inner_ipv4_dst_step"), 1, 100_000_000, 1
            ),
            "vxlan_inner_ipv4_ttl": _bounded_int(
                stream.get("vxlan_inner_ipv4_ttl"), 0, 255, PROFILE_DEFAULT_VXLAN_INNER_TTL
            ),
            "vxlan_inner_ipv4_ttl_mode": _choice(
                stream.get("vxlan_inner_ipv4_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "vxlan_inner_ipv4_ttl_count": _bounded_int(stream.get("vxlan_inner_ipv4_ttl_count"), 2, 256, 16),
            "vxlan_inner_ipv4_ttl_step": _bounded_int(stream.get("vxlan_inner_ipv4_ttl_step"), 1, 255, 1),
            "vxlan_inner_ipv6_src": _clean_ipv6_text(
                stream.get("vxlan_inner_ipv6_src"), PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6
            ),
            "vxlan_inner_ipv6_src_mode": _choice(
                stream.get("vxlan_inner_ipv6_src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "vxlan_inner_ipv6_src_count": _bounded_int(
                stream.get("vxlan_inner_ipv6_src_count"), 2, 100_000_000, 16
            ),
            "vxlan_inner_ipv6_src_step": _bounded_int(
                stream.get("vxlan_inner_ipv6_src_step"), 1, 100_000_000, 1
            ),
            "vxlan_inner_ipv6_dst": _clean_ipv6_text(
                stream.get("vxlan_inner_ipv6_dst"), PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6
            ),
            "vxlan_inner_ipv6_dst_mode": _choice(
                stream.get("vxlan_inner_ipv6_dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "vxlan_inner_ipv6_dst_count": _bounded_int(
                stream.get("vxlan_inner_ipv6_dst_count"), 2, 100_000_000, 16
            ),
            "vxlan_inner_ipv6_dst_step": _bounded_int(
                stream.get("vxlan_inner_ipv6_dst_step"), 1, 100_000_000, 1
            ),
            "vxlan_inner_ipv6_hop_limit": _bounded_int(
                stream.get("vxlan_inner_ipv6_hop_limit"), 0, 255, PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT
            ),
            "vxlan_inner_ipv6_hop_limit_mode": _choice(
                stream.get("vxlan_inner_ipv6_hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "vxlan_inner_ipv6_hop_limit_count": _bounded_int(
                stream.get("vxlan_inner_ipv6_hop_limit_count"), 2, 256, 16
            ),
            "vxlan_inner_ipv6_hop_limit_step": _bounded_int(
                stream.get("vxlan_inner_ipv6_hop_limit_step"), 1, 255, 1
            ),
            "vxlan_inner_l4_src_port": _bounded_int(
                stream.get("vxlan_inner_l4_src_port"), 0, 65_535, PROFILE_DEFAULT_SRC_PORT
            ),
            "vxlan_inner_l4_src_port_mode": _choice(
                stream.get("vxlan_inner_l4_src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "vxlan_inner_l4_src_port_count": _bounded_int(
                stream.get("vxlan_inner_l4_src_port_count"), 2, 65_536, 16
            ),
            "vxlan_inner_l4_src_port_step": _bounded_int(
                stream.get("vxlan_inner_l4_src_port_step"), 1, 65_535, 1
            ),
            "vxlan_inner_l4_dst_port": _bounded_int(
                stream.get("vxlan_inner_l4_dst_port"), 0, 65_535, PROFILE_DEFAULT_DST_PORT
            ),
            "vxlan_inner_l4_dst_port_mode": _choice(
                stream.get("vxlan_inner_l4_dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "vxlan_inner_l4_dst_port_count": _bounded_int(
                stream.get("vxlan_inner_l4_dst_port_count"), 2, 65_536, 16
            ),
            "vxlan_inner_l4_dst_port_step": _bounded_int(
                stream.get("vxlan_inner_l4_dst_port_step"), 1, 65_535, 1
            ),
            "gtpu_enabled": gtpu_enabled,
            "gtpu_message_type": _bounded_int(
                stream.get("gtpu_message_type"), 0, 255, PROFILE_DEFAULT_GTPU_MESSAGE_TYPE
            ),
            "gtpu_teid": _bounded_int(stream.get("gtpu_teid"), 0, 4_294_967_295, PROFILE_DEFAULT_GTPU_TEID),
            "gtpu_teid_mode": _choice(stream.get("gtpu_teid_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "gtpu_teid_count": _bounded_int(stream.get("gtpu_teid_count"), 2, 4_294_967_296, 16),
            "gtpu_teid_step": _bounded_int(stream.get("gtpu_teid_step"), 1, 4_294_967_295, 1),
            "gtpu_sequence_enabled": _bool(stream.get("gtpu_sequence_enabled"), False),
            "gtpu_sequence": _bounded_int(
                stream.get("gtpu_sequence"), 0, 65_535, PROFILE_DEFAULT_GTPU_SEQUENCE
            ),
            "gtpu_sequence_mode": _choice(
                stream.get("gtpu_sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gtpu_sequence_count": _bounded_int(stream.get("gtpu_sequence_count"), 2, 65_536, 16),
            "gtpu_sequence_step": _bounded_int(stream.get("gtpu_sequence_step"), 1, 65_535, 1),
            "gtpu_npdu_enabled": _bool(stream.get("gtpu_npdu_enabled"), False),
            "gtpu_npdu": _bounded_int(stream.get("gtpu_npdu"), 0, 255, PROFILE_DEFAULT_GTPU_NPDU),
            "gtpu_npdu_mode": _choice(stream.get("gtpu_npdu_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "gtpu_npdu_count": _bounded_int(stream.get("gtpu_npdu_count"), 2, 256, 16),
            "gtpu_npdu_step": _bounded_int(stream.get("gtpu_npdu_step"), 1, 255, 1),
            "gtpu_extension_enabled": _bool(stream.get("gtpu_extension_enabled"), False),
            "gtpu_extension_udp_port": _bounded_int(
                stream.get("gtpu_extension_udp_port"), 0, 65_535, PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT
            ),
            "gtpu_extension_udp_port_mode": _choice(
                stream.get("gtpu_extension_udp_port_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gtpu_extension_udp_port_count": _bounded_int(
                stream.get("gtpu_extension_udp_port_count"), 2, 65_536, 16
            ),
            "gtpu_extension_udp_port_step": _bounded_int(
                stream.get("gtpu_extension_udp_port_step"), 1, 65_535, 1
            ),
            "gtpu_inner_ip_version": _choice(
                stream.get("gtpu_inner_ip_version"), PROFILE_WORKBENCH_GTPU_INNER_IP_VERSIONS, "IPv4"
            ),
            "gtpu_inner_ipv4_src": _clean_ipv4_text(
                stream.get("gtpu_inner_ipv4_src"), PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4
            ),
            "gtpu_inner_ipv4_src_mode": _choice(
                stream.get("gtpu_inner_ipv4_src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "gtpu_inner_ipv4_src_count": _bounded_int(
                stream.get("gtpu_inner_ipv4_src_count"), 2, 100_000_000, 16
            ),
            "gtpu_inner_ipv4_src_step": _bounded_int(
                stream.get("gtpu_inner_ipv4_src_step"), 1, 100_000_000, 1
            ),
            "gtpu_inner_ipv4_dst": _clean_ipv4_text(
                stream.get("gtpu_inner_ipv4_dst"), PROFILE_DEFAULT_GTPU_INNER_DST_IPV4
            ),
            "gtpu_inner_ipv4_dst_mode": _choice(
                stream.get("gtpu_inner_ipv4_dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "gtpu_inner_ipv4_dst_count": _bounded_int(
                stream.get("gtpu_inner_ipv4_dst_count"), 2, 100_000_000, 16
            ),
            "gtpu_inner_ipv4_dst_step": _bounded_int(
                stream.get("gtpu_inner_ipv4_dst_step"), 1, 100_000_000, 1
            ),
            "gtpu_inner_ipv4_ttl": _bounded_int(
                stream.get("gtpu_inner_ipv4_ttl"), 0, 255, PROFILE_DEFAULT_GTPU_INNER_TTL
            ),
            "gtpu_inner_ipv4_ttl_mode": _choice(
                stream.get("gtpu_inner_ipv4_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gtpu_inner_ipv4_ttl_count": _bounded_int(stream.get("gtpu_inner_ipv4_ttl_count"), 2, 256, 16),
            "gtpu_inner_ipv4_ttl_step": _bounded_int(stream.get("gtpu_inner_ipv4_ttl_step"), 1, 255, 1),
            "gtpu_inner_ipv6_src": _clean_ipv6_text(
                stream.get("gtpu_inner_ipv6_src"), PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6
            ),
            "gtpu_inner_ipv6_src_mode": _choice(
                stream.get("gtpu_inner_ipv6_src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "gtpu_inner_ipv6_src_count": _bounded_int(
                stream.get("gtpu_inner_ipv6_src_count"), 2, 100_000_000, 16
            ),
            "gtpu_inner_ipv6_src_step": _bounded_int(
                stream.get("gtpu_inner_ipv6_src_step"), 1, 100_000_000, 1
            ),
            "gtpu_inner_ipv6_dst": _clean_ipv6_text(
                stream.get("gtpu_inner_ipv6_dst"), PROFILE_DEFAULT_GTPU_INNER_DST_IPV6
            ),
            "gtpu_inner_ipv6_dst_mode": _choice(
                stream.get("gtpu_inner_ipv6_dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "gtpu_inner_ipv6_dst_count": _bounded_int(
                stream.get("gtpu_inner_ipv6_dst_count"), 2, 100_000_000, 16
            ),
            "gtpu_inner_ipv6_dst_step": _bounded_int(
                stream.get("gtpu_inner_ipv6_dst_step"), 1, 100_000_000, 1
            ),
            "gtpu_inner_ipv6_hop_limit": _bounded_int(
                stream.get("gtpu_inner_ipv6_hop_limit"), 0, 255, PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT
            ),
            "gtpu_inner_ipv6_hop_limit_mode": _choice(
                stream.get("gtpu_inner_ipv6_hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gtpu_inner_ipv6_hop_limit_count": _bounded_int(
                stream.get("gtpu_inner_ipv6_hop_limit_count"), 2, 256, 16
            ),
            "gtpu_inner_ipv6_hop_limit_step": _bounded_int(
                stream.get("gtpu_inner_ipv6_hop_limit_step"), 1, 255, 1
            ),
            "gtpu_inner_l4_src_port": _bounded_int(
                stream.get("gtpu_inner_l4_src_port"), 0, 65_535, PROFILE_DEFAULT_SRC_PORT
            ),
            "gtpu_inner_l4_src_port_mode": _choice(
                stream.get("gtpu_inner_l4_src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "gtpu_inner_l4_src_port_count": _bounded_int(
                stream.get("gtpu_inner_l4_src_port_count"), 2, 65_536, 16
            ),
            "gtpu_inner_l4_src_port_step": _bounded_int(
                stream.get("gtpu_inner_l4_src_port_step"), 1, 65_535, 1
            ),
            "gtpu_inner_l4_dst_port": _bounded_int(
                stream.get("gtpu_inner_l4_dst_port"), 0, 65_535, PROFILE_DEFAULT_DST_PORT
            ),
            "gtpu_inner_l4_dst_port_mode": _choice(
                stream.get("gtpu_inner_l4_dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "gtpu_inner_l4_dst_port_count": _bounded_int(
                stream.get("gtpu_inner_l4_dst_port_count"), 2, 65_536, 16
            ),
            "gtpu_inner_l4_dst_port_step": _bounded_int(
                stream.get("gtpu_inner_l4_dst_port_step"), 1, 65_535, 1
            ),
            "gre_checksum_present": _bool(stream.get("gre_checksum_present"), False),
            "gre_checksum_override": _bool(stream.get("gre_checksum_override"), False),
            "gre_checksum": _clean_hex_word_text_upper(stream.get("gre_checksum"), PROFILE_DEFAULT_GRE_CHECKSUM),
            "gre_key_present": _bool(stream.get("gre_key_present"), False),
            "gre_key": _bounded_int(stream.get("gre_key"), 0, 4_294_967_295, PROFILE_DEFAULT_GRE_KEY),
            "gre_key_mode": _choice(stream.get("gre_key_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "gre_key_count": _bounded_int(stream.get("gre_key_count"), 2, 4_294_967_296, 16),
            "gre_key_step": _bounded_int(stream.get("gre_key_step"), 1, 4_294_967_295, 1),
            "gre_sequence_present": _bool(stream.get("gre_sequence_present"), False),
            "gre_sequence": _bounded_int(
                stream.get("gre_sequence"), 0, 4_294_967_295, PROFILE_DEFAULT_GRE_SEQUENCE
            ),
            "gre_sequence_mode": _choice(
                stream.get("gre_sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gre_sequence_count": _bounded_int(stream.get("gre_sequence_count"), 2, 4_294_967_296, 16),
            "gre_sequence_step": _bounded_int(stream.get("gre_sequence_step"), 1, 4_294_967_295, 1),
            "gre_protocol_type": _clean_hex_word_text_upper(
                stream.get("gre_protocol_type"), PROFILE_DEFAULT_GRE_PROTOCOL_TYPE
            ),
            "gre_inner_ip_version": _choice(
                stream.get("gre_inner_ip_version"),
                PROFILE_WORKBENCH_GRE_INNER_IP_VERSIONS,
                "IPv6" if str(stream.get("gre_protocol_type") or "").upper() == "86DD" else "IPv4",
            ),
            "gre_inner_ipv4_src": _clean_ipv4_text(
                stream.get("gre_inner_ipv4_src"), PROFILE_DEFAULT_GRE_INNER_SRC_IPV4
            ),
            "gre_inner_ipv4_src_mode": _choice(
                stream.get("gre_inner_ipv4_src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "gre_inner_ipv4_src_count": _bounded_int(
                stream.get("gre_inner_ipv4_src_count"), 2, 100_000_000, 16
            ),
            "gre_inner_ipv4_src_step": _bounded_int(
                stream.get("gre_inner_ipv4_src_step"), 1, 100_000_000, 1
            ),
            "gre_inner_ipv4_dst": _clean_ipv4_text(
                stream.get("gre_inner_ipv4_dst"), PROFILE_DEFAULT_GRE_INNER_DST_IPV4
            ),
            "gre_inner_ipv4_dst_mode": _choice(
                stream.get("gre_inner_ipv4_dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "gre_inner_ipv4_dst_count": _bounded_int(
                stream.get("gre_inner_ipv4_dst_count"), 2, 100_000_000, 16
            ),
            "gre_inner_ipv4_dst_step": _bounded_int(
                stream.get("gre_inner_ipv4_dst_step"), 1, 100_000_000, 1
            ),
            "gre_inner_ipv4_ttl": _bounded_int(stream.get("gre_inner_ipv4_ttl"), 0, 255, 64),
            "gre_inner_ipv4_ttl_mode": _choice(
                stream.get("gre_inner_ipv4_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gre_inner_ipv4_ttl_count": _bounded_int(stream.get("gre_inner_ipv4_ttl_count"), 2, 256, 16),
            "gre_inner_ipv4_ttl_step": _bounded_int(stream.get("gre_inner_ipv4_ttl_step"), 1, 255, 1),
            "gre_inner_ipv6_src": _clean_ipv6_text(
                stream.get("gre_inner_ipv6_src"), PROFILE_DEFAULT_GRE_INNER_SRC_IPV6
            ),
            "gre_inner_ipv6_src_mode": _choice(
                stream.get("gre_inner_ipv6_src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "gre_inner_ipv6_src_count": _bounded_int(
                stream.get("gre_inner_ipv6_src_count"), 2, 100_000_000, 16
            ),
            "gre_inner_ipv6_src_step": _bounded_int(
                stream.get("gre_inner_ipv6_src_step"), 1, 100_000_000, 1
            ),
            "gre_inner_ipv6_dst": _clean_ipv6_text(
                stream.get("gre_inner_ipv6_dst"), PROFILE_DEFAULT_GRE_INNER_DST_IPV6
            ),
            "gre_inner_ipv6_dst_mode": _choice(
                stream.get("gre_inner_ipv6_dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
            ),
            "gre_inner_ipv6_dst_count": _bounded_int(
                stream.get("gre_inner_ipv6_dst_count"), 2, 100_000_000, 16
            ),
            "gre_inner_ipv6_dst_step": _bounded_int(
                stream.get("gre_inner_ipv6_dst_step"), 1, 100_000_000, 1
            ),
            "gre_inner_ipv6_hop_limit": _bounded_int(
                stream.get("gre_inner_ipv6_hop_limit"), 0, 255, PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT
            ),
            "gre_inner_ipv6_hop_limit_mode": _choice(
                stream.get("gre_inner_ipv6_hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "gre_inner_ipv6_hop_limit_count": _bounded_int(
                stream.get("gre_inner_ipv6_hop_limit_count"), 2, 256, 16
            ),
            "gre_inner_ipv6_hop_limit_step": _bounded_int(
                stream.get("gre_inner_ipv6_hop_limit_step"), 1, 255, 1
            ),
            "gre_inner_l4_src_port": _bounded_int(
                stream.get("gre_inner_l4_src_port"), 0, 65_535, PROFILE_DEFAULT_SRC_PORT
            ),
            "gre_inner_l4_src_port_mode": _choice(
                stream.get("gre_inner_l4_src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "gre_inner_l4_src_port_count": _bounded_int(
                stream.get("gre_inner_l4_src_port_count"), 2, 65_536, 16
            ),
            "gre_inner_l4_src_port_step": _bounded_int(
                stream.get("gre_inner_l4_src_port_step"), 1, 65_535, 1
            ),
            "gre_inner_l4_dst_port": _bounded_int(
                stream.get("gre_inner_l4_dst_port"), 0, 65_535, PROFILE_DEFAULT_DST_PORT
            ),
            "gre_inner_l4_dst_port_mode": _choice(
                stream.get("gre_inner_l4_dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
            ),
            "gre_inner_l4_dst_port_count": _bounded_int(
                stream.get("gre_inner_l4_dst_port_count"), 2, 65_536, 16
            ),
            "gre_inner_l4_dst_port_step": _bounded_int(
                stream.get("gre_inner_l4_dst_port_step"), 1, 65_535, 1
            ),
            "ipv4_src": _clean_ipv4_text(stream.get("ipv4_src"), PROFILE_DEFAULT_SRC_IPV4),
            "ipv4_dst": _clean_ipv4_text(stream.get("ipv4_dst"), PROFILE_DEFAULT_DST_IPV4),
            "ipv4_src_mode": _choice(stream.get("ipv4_src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
            "ipv4_src_count": _bounded_large_unit_count(stream.get("ipv4_src_count"), 2, 100_000_000, 16),
            "ipv4_src_step": _bounded_int(stream.get("ipv4_src_step"), 1, 100_000_000, 1),
            "ipv4_dst_mode": _choice(stream.get("ipv4_dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
            "ipv4_dst_count": _bounded_large_unit_count(stream.get("ipv4_dst_count"), 2, 100_000_000, 16),
            "ipv4_dst_step": _bounded_int(stream.get("ipv4_dst_step"), 1, 100_000_000, 1),
            "ipv4_dscp": _bounded_int(stream.get("ipv4_dscp"), 0, 63, PROFILE_DEFAULT_IP_DSCP),
            "ipv4_dscp_mode": _choice(stream.get("ipv4_dscp_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "ipv4_dscp_count": _bounded_int(stream.get("ipv4_dscp_count"), 2, 64, 16),
            "ipv4_dscp_step": _bounded_int(stream.get("ipv4_dscp_step"), 1, 63, 1),
            "ipv4_ecn": _bounded_int(stream.get("ipv4_ecn"), 0, 3, PROFILE_DEFAULT_IP_ECN),
            "ipv4_ecn_mode": _choice(stream.get("ipv4_ecn_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "ipv4_ecn_count": _bounded_int(stream.get("ipv4_ecn_count"), 2, 4, 4),
            "ipv4_ecn_step": _bounded_int(stream.get("ipv4_ecn_step"), 1, 3, 1),
            "ipv4_id": _bounded_int(stream.get("ipv4_id"), 0, 65_535, PROFILE_DEFAULT_IP_ID),
            "ipv4_id_mode": _choice(stream.get("ipv4_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "ipv4_id_count": _bounded_int(stream.get("ipv4_id_count"), 2, 65_536, 16),
            "ipv4_id_step": _bounded_int(stream.get("ipv4_id_step"), 1, 65_535, 1),
            "ipv4_flag_df": _bool(stream.get("ipv4_flag_df"), False),
            "ipv4_flag_mf": _bool(stream.get("ipv4_flag_mf"), False),
            "ipv4_fragment_offset": _bounded_int(stream.get("ipv4_fragment_offset"), 0, 8191, 0),
            "ipv4_fragment_offset_mode": _choice(
                stream.get("ipv4_fragment_offset_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "ipv4_fragment_offset_count": _bounded_int(stream.get("ipv4_fragment_offset_count"), 2, 8192, 16),
            "ipv4_fragment_offset_step": _bounded_int(stream.get("ipv4_fragment_offset_step"), 1, 8191, 1),
            "ipv4_ttl": _bounded_int(stream.get("ipv4_ttl"), 0, 255, PROFILE_DEFAULT_IP_TTL),
            "ipv4_ttl_mode": _choice(stream.get("ipv4_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "ipv4_ttl_count": _bounded_int(stream.get("ipv4_ttl_count"), 2, 256, 16),
            "ipv4_ttl_step": _bounded_int(stream.get("ipv4_ttl_step"), 1, 255, 1),
            "ipv4_checksum_override": _bool(stream.get("ipv4_checksum_override"), False),
            "ipv4_checksum": _clean_hex_word_text_upper(stream.get("ipv4_checksum"), PROFILE_DEFAULT_IPV4_CHECKSUM),
            "ipv6_src": _clean_ipv6_text(stream.get("ipv6_src"), PROFILE_DEFAULT_SRC_IPV6),
            "ipv6_dst": _clean_ipv6_text(stream.get("ipv6_dst"), PROFILE_DEFAULT_DST_IPV6),
            "ipv6_src_mode": _choice(stream.get("ipv6_src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"),
            "ipv6_src_count": _bounded_int(stream.get("ipv6_src_count"), 2, 100_000_000, 16),
            "ipv6_src_step": _bounded_int(stream.get("ipv6_src_step"), 1, 100_000_000, 1),
            "ipv6_dst_mode": _choice(stream.get("ipv6_dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"),
            "ipv6_dst_count": _bounded_int(stream.get("ipv6_dst_count"), 2, 100_000_000, 16),
            "ipv6_dst_step": _bounded_int(stream.get("ipv6_dst_step"), 1, 100_000_000, 1),
            "ipv6_traffic_class": _bounded_int(
                stream.get("ipv6_traffic_class"), 0, 255, PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS
            ),
            "ipv6_traffic_class_mode": _choice(
                stream.get("ipv6_traffic_class_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "ipv6_traffic_class_count": _bounded_int(stream.get("ipv6_traffic_class_count"), 2, 256, 16),
            "ipv6_traffic_class_step": _bounded_int(stream.get("ipv6_traffic_class_step"), 1, 255, 1),
            "ipv6_flow_label": _bounded_int(
                stream.get("ipv6_flow_label"), 0, 1_048_575, PROFILE_DEFAULT_IPV6_FLOW_LABEL
            ),
            "ipv6_flow_label_mode": _choice(
                stream.get("ipv6_flow_label_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "ipv6_flow_label_count": _bounded_int(stream.get("ipv6_flow_label_count"), 2, 1_048_576, 16),
            "ipv6_flow_label_step": _bounded_int(stream.get("ipv6_flow_label_step"), 1, 1_048_575, 1),
            "ipv6_hop_limit": _bounded_int(stream.get("ipv6_hop_limit"), 0, 255, PROFILE_DEFAULT_IP_TTL),
            "ipv6_hop_limit_mode": _choice(
                stream.get("ipv6_hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "ipv6_hop_limit_count": _bounded_int(stream.get("ipv6_hop_limit_count"), 2, 256, 16),
            "ipv6_hop_limit_step": _bounded_int(stream.get("ipv6_hop_limit_step"), 1, 255, 1),
            "l4_src_port_override": l4_src_port_override,
            "l4_src_port": _bounded_int(
                l4_src_port_source,
                0,
                65_535,
                CAPTURE_GTPU_PORT
                if gtpu_enabled
                else PROFILE_DEFAULT_VXLAN_OUTER_SRC_PORT
                if vxlan_enabled
                else PROFILE_DEFAULT_SRC_PORT,
            ),
            "l4_src_port_mode": _choice(stream.get("l4_src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"),
            "l4_src_port_count": _bounded_int(stream.get("l4_src_port_count"), 2, 65_536, 16),
            "l4_src_port_step": _bounded_int(stream.get("l4_src_port_step"), 1, 65_535, 1),
            "l4_dst_port_override": l4_dst_port_override,
            "l4_dst_port": _bounded_int(
                l4_dst_port_source,
                0,
                65_535,
                CAPTURE_GTPU_PORT
                if gtpu_enabled
                else PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT
                if vxlan_enabled
                else PROFILE_DEFAULT_DST_PORT,
            ),
            "l4_dst_port_mode": _choice(stream.get("l4_dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"),
            "l4_dst_port_count": _bounded_int(stream.get("l4_dst_port_count"), 2, 65_536, 16),
            "l4_dst_port_step": _bounded_int(stream.get("l4_dst_port_step"), 1, 65_535, 1),
            "udp_length_override": _bool(stream.get("udp_length_override"), False),
            "udp_length": _bounded_int(stream.get("udp_length"), 8, 65_535, PROFILE_DEFAULT_UDP_LENGTH),
            "udp_length_mode": _choice(stream.get("udp_length_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "udp_length_count": _bounded_int(stream.get("udp_length_count"), 2, 65_528, 16),
            "udp_length_step": _bounded_int(stream.get("udp_length_step"), 1, 65_527, 1),
            "udp_checksum_override": _bool(stream.get("udp_checksum_override"), False),
            "udp_checksum": _clean_hex_word_text_upper(stream.get("udp_checksum"), PROFILE_DEFAULT_UDP_CHECKSUM),
            "udp_checksum_mode": _choice(stream.get("udp_checksum_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "udp_checksum_count": _bounded_int(stream.get("udp_checksum_count"), 2, 65_536, 16),
            "udp_checksum_step": _bounded_int(stream.get("udp_checksum_step"), 1, 65_535, 1),
            "dns_enabled": dns_enabled,
            "dns_transaction_id": _bounded_int(
                stream.get("dns_transaction_id"), 0, 65_535, PROFILE_DEFAULT_DNS_TRANSACTION_ID
            ),
            "dns_transaction_id_mode": _choice(
                stream.get("dns_transaction_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dns_transaction_id_count": _bounded_int(stream.get("dns_transaction_id_count"), 2, 65_536, 16),
            "dns_transaction_id_step": _bounded_int(stream.get("dns_transaction_id_step"), 1, 65_535, 1),
            "dns_flags": _clean_hex_word_text_upper(stream.get("dns_flags"), PROFILE_DEFAULT_DNS_FLAGS),
            "dns_flags_mode": _choice(stream.get("dns_flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "dns_flags_count": _bounded_int(stream.get("dns_flags_count"), 2, 65_536, 16),
            "dns_flags_step": _bounded_int(stream.get("dns_flags_step"), 1, 65_535, 1),
            "dns_query_name": dns_query_name,
            "dns_query_type": _bounded_int(stream.get("dns_query_type"), 0, 65_535, PROFILE_DEFAULT_DNS_QUERY_TYPE),
            "dns_query_type_mode": _choice(
                stream.get("dns_query_type_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dns_query_type_count": _bounded_int(stream.get("dns_query_type_count"), 2, 65_536, 16),
            "dns_query_type_step": _bounded_int(stream.get("dns_query_type_step"), 1, 65_535, 1),
            "dns_query_class": _bounded_int(
                stream.get("dns_query_class"), 0, 65_535, PROFILE_DEFAULT_DNS_QUERY_CLASS
            ),
            "dns_query_class_mode": _choice(
                stream.get("dns_query_class_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dns_query_class_count": _bounded_int(stream.get("dns_query_class_count"), 2, 65_536, 16),
            "dns_query_class_step": _bounded_int(stream.get("dns_query_class_step"), 1, 65_535, 1),
            "dns_answer_enabled": _bool(stream.get("dns_answer_enabled"), False),
            "dns_answer_ttl": _bounded_int(
                stream.get("dns_answer_ttl"), 0, 4_294_967_295, PROFILE_DEFAULT_DNS_ANSWER_TTL
            ),
            "dns_answer_ttl_mode": _choice(
                stream.get("dns_answer_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dns_answer_ttl_count": _bounded_int(stream.get("dns_answer_ttl_count"), 2, 4_294_967_296, 16),
            "dns_answer_ttl_step": _bounded_int(stream.get("dns_answer_ttl_step"), 1, 4_294_967_295, 1),
            "dns_answer_ipv4": dns_answer_ipv4,
            "dns_answer_ipv4_mode": _choice(
                stream.get("dns_answer_ipv4_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dns_answer_ipv4_count": _bounded_int(stream.get("dns_answer_ipv4_count"), 2, 100_000_000, 16),
            "dns_answer_ipv4_step": _bounded_int(stream.get("dns_answer_ipv4_step"), 1, 100_000_000, 1),
            "dhcp_enabled": dhcp_enabled,
            "dhcp_operation": _bounded_int(stream.get("dhcp_operation"), 1, 255, PROFILE_DEFAULT_DHCP_OPERATION),
            "dhcp_operation_mode": _choice(
                stream.get("dhcp_operation_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_operation_count": _bounded_int(stream.get("dhcp_operation_count"), 2, 256, 2),
            "dhcp_operation_step": _bounded_int(stream.get("dhcp_operation_step"), 1, 255, 1),
            "dhcp_hops": _bounded_int(stream.get("dhcp_hops"), 0, 255, PROFILE_DEFAULT_DHCP_HOPS),
            "dhcp_hops_mode": _choice(stream.get("dhcp_hops_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "dhcp_hops_count": _bounded_int(stream.get("dhcp_hops_count"), 2, 256, 16),
            "dhcp_hops_step": _bounded_int(stream.get("dhcp_hops_step"), 1, 255, 1),
            "dhcp_seconds": _bounded_int(stream.get("dhcp_seconds"), 0, 65_535, PROFILE_DEFAULT_DHCP_SECONDS),
            "dhcp_seconds_mode": _choice(
                stream.get("dhcp_seconds_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_seconds_count": _bounded_int(stream.get("dhcp_seconds_count"), 2, 65_536, 16),
            "dhcp_seconds_step": _bounded_int(stream.get("dhcp_seconds_step"), 1, 65_535, 1),
            "dhcp_message_type": _bounded_int(
                stream.get("dhcp_message_type"), 1, 255, PROFILE_DEFAULT_DHCP_MESSAGE_TYPE
            ),
            "dhcp_message_type_mode": _choice(
                stream.get("dhcp_message_type_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_message_type_count": _bounded_int(stream.get("dhcp_message_type_count"), 2, 255, 16),
            "dhcp_message_type_step": _bounded_int(stream.get("dhcp_message_type_step"), 1, 254, 1),
            "dhcp_xid": _bounded_int(stream.get("dhcp_xid"), 0, 4_294_967_295, PROFILE_DEFAULT_DHCP_XID),
            "dhcp_xid_mode": _choice(stream.get("dhcp_xid_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "dhcp_xid_count": _bounded_int(stream.get("dhcp_xid_count"), 2, 4_294_967_296, 16),
            "dhcp_xid_step": _bounded_int(stream.get("dhcp_xid_step"), 1, 4_294_967_295, 1),
            "dhcp_flags": _clean_hex_word_text_upper(stream.get("dhcp_flags"), PROFILE_DEFAULT_DHCP_FLAGS),
            "dhcp_flags_mode": _choice(stream.get("dhcp_flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "dhcp_flags_count": _bounded_int(stream.get("dhcp_flags_count"), 2, 65_536, 16),
            "dhcp_flags_step": _bounded_int(stream.get("dhcp_flags_step"), 1, 65_535, 1),
            "dhcp_client_ip": _clean_ipv4_text(stream.get("dhcp_client_ip"), PROFILE_DEFAULT_DHCP_CLIENT_IP),
            "dhcp_client_ip_mode": _choice(
                stream.get("dhcp_client_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_client_ip_count": _bounded_int(stream.get("dhcp_client_ip_count"), 2, 100_000_000, 16),
            "dhcp_client_ip_step": _bounded_int(stream.get("dhcp_client_ip_step"), 1, 100_000_000, 1),
            "dhcp_your_ip": _clean_ipv4_text(stream.get("dhcp_your_ip"), PROFILE_DEFAULT_DHCP_YOUR_IP),
            "dhcp_your_ip_mode": _choice(
                stream.get("dhcp_your_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_your_ip_count": _bounded_int(stream.get("dhcp_your_ip_count"), 2, 100_000_000, 16),
            "dhcp_your_ip_step": _bounded_int(stream.get("dhcp_your_ip_step"), 1, 100_000_000, 1),
            "dhcp_server_ip": _clean_ipv4_text(stream.get("dhcp_server_ip"), PROFILE_DEFAULT_DHCP_SERVER_IP),
            "dhcp_server_ip_mode": _choice(
                stream.get("dhcp_server_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_server_ip_count": _bounded_int(stream.get("dhcp_server_ip_count"), 2, 100_000_000, 16),
            "dhcp_server_ip_step": _bounded_int(stream.get("dhcp_server_ip_step"), 1, 100_000_000, 1),
            "dhcp_relay_ip": _clean_ipv4_text(stream.get("dhcp_relay_ip"), PROFILE_DEFAULT_DHCP_RELAY_IP),
            "dhcp_relay_ip_mode": _choice(
                stream.get("dhcp_relay_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_relay_ip_count": _bounded_int(stream.get("dhcp_relay_ip_count"), 2, 100_000_000, 16),
            "dhcp_relay_ip_step": _bounded_int(stream.get("dhcp_relay_ip_step"), 1, 100_000_000, 1),
            "dhcp_client_mac": _clean_mac_text(stream.get("dhcp_client_mac"), PROFILE_DEFAULT_DHCP_CLIENT_MAC),
            "dhcp_client_mac_mode": _choice(
                stream.get("dhcp_client_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_client_mac_count": _bounded_int(stream.get("dhcp_client_mac_count"), 2, 100_000_000, 16),
            "dhcp_client_mac_step": _bounded_int(stream.get("dhcp_client_mac_step"), 1, 100_000_000, 1),
            "dhcp_hostname": dhcp_hostname,
            "dhcp_requested_ip": _clean_ipv4_text(
                stream.get("dhcp_requested_ip"), PROFILE_DEFAULT_DHCP_REQUESTED_IP
            ),
            "dhcp_requested_ip_mode": _choice(
                stream.get("dhcp_requested_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_requested_ip_count": _bounded_int(stream.get("dhcp_requested_ip_count"), 2, 100_000_000, 16),
            "dhcp_requested_ip_step": _bounded_int(stream.get("dhcp_requested_ip_step"), 1, 100_000_000, 1),
            "dhcp_server_id": _clean_ipv4_text(stream.get("dhcp_server_id"), PROFILE_DEFAULT_DHCP_SERVER_ID),
            "dhcp_server_id_mode": _choice(
                stream.get("dhcp_server_id_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
            ),
            "dhcp_server_id_count": _bounded_int(stream.get("dhcp_server_id_count"), 2, 100_000_000, 16),
            "dhcp_server_id_step": _bounded_int(stream.get("dhcp_server_id_step"), 1, 100_000_000, 1),
            "dhcp_parameter_request_list": dhcp_parameter_request_list,
            "dhcp_lease_time": _bounded_int(
                stream.get("dhcp_lease_time"), 0, 4_294_967_295, PROFILE_DEFAULT_DHCP_LEASE_TIME
            ),
            "dhcp_lease_time_mode": _choice(
                stream.get("dhcp_lease_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_lease_time_count": _bounded_int(stream.get("dhcp_lease_time_count"), 2, 4_294_967_296, 16),
            "dhcp_lease_time_step": _bounded_int(stream.get("dhcp_lease_time_step"), 1, 4_294_967_295, 1),
            "dhcp_renewal_time": _bounded_int(
                stream.get("dhcp_renewal_time"), 0, 4_294_967_295, PROFILE_DEFAULT_DHCP_RENEWAL_TIME
            ),
            "dhcp_renewal_time_mode": _choice(
                stream.get("dhcp_renewal_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_renewal_time_count": _bounded_int(stream.get("dhcp_renewal_time_count"), 2, 4_294_967_296, 16),
            "dhcp_renewal_time_step": _bounded_int(stream.get("dhcp_renewal_time_step"), 1, 4_294_967_295, 1),
            "dhcp_rebinding_time": _bounded_int(
                stream.get("dhcp_rebinding_time"), 0, 4_294_967_295, PROFILE_DEFAULT_DHCP_REBINDING_TIME
            ),
            "dhcp_rebinding_time_mode": _choice(
                stream.get("dhcp_rebinding_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "dhcp_rebinding_time_count": _bounded_int(
                stream.get("dhcp_rebinding_time_count"), 2, 4_294_967_296, 16
            ),
            "dhcp_rebinding_time_step": _bounded_int(
                stream.get("dhcp_rebinding_time_step"), 1, 4_294_967_295, 1
            ),
            "tcp_sequence_number": _bounded_int(
                stream.get("tcp_sequence_number"), 0, 4_294_967_295, PROFILE_DEFAULT_TCP_SEQUENCE
            ),
            "tcp_sequence_mode": _choice(stream.get("tcp_sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "tcp_sequence_count": _bounded_int(stream.get("tcp_sequence_count"), 2, 4_294_967_296, 16),
            "tcp_sequence_step": _bounded_int(stream.get("tcp_sequence_step"), 1, 4_294_967_295, 1),
            "tcp_ack_number": _bounded_int(
                stream.get("tcp_ack_number"), 0, 4_294_967_295, PROFILE_DEFAULT_TCP_ACKNOWLEDGE
            ),
            "tcp_ack_mode": _choice(stream.get("tcp_ack_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "tcp_ack_count": _bounded_int(stream.get("tcp_ack_count"), 2, 4_294_967_296, 16),
            "tcp_ack_step": _bounded_int(stream.get("tcp_ack_step"), 1, 4_294_967_295, 1),
            "tcp_window": _bounded_int(stream.get("tcp_window"), 0, 65_535, PROFILE_DEFAULT_TCP_WINDOW),
            "tcp_window_mode": _choice(stream.get("tcp_window_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "tcp_window_count": _bounded_int(stream.get("tcp_window_count"), 2, 65_536, 16),
            "tcp_window_step": _bounded_int(stream.get("tcp_window_step"), 1, 65_535, 1),
            "tcp_checksum_override": _bool(stream.get("tcp_checksum_override"), False),
            "tcp_checksum": _clean_hex_word_text_upper(stream.get("tcp_checksum"), PROFILE_DEFAULT_TCP_CHECKSUM),
            "tcp_checksum_mode": _choice(stream.get("tcp_checksum_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "tcp_checksum_count": _bounded_int(stream.get("tcp_checksum_count"), 2, 65_536, 16),
            "tcp_checksum_step": _bounded_int(stream.get("tcp_checksum_step"), 1, 65_535, 1),
            "tcp_option_mss_enabled": _bool(stream.get("tcp_option_mss_enabled"), False),
            "tcp_option_mss": _bounded_int(
                stream.get("tcp_option_mss"), 0, 65_535, PROFILE_DEFAULT_TCP_OPTION_MSS
            ),
            "tcp_option_mss_mode": _choice(
                stream.get("tcp_option_mss_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_mss_count": _bounded_int(stream.get("tcp_option_mss_count"), 2, 65_536, 16),
            "tcp_option_mss_step": _bounded_int(stream.get("tcp_option_mss_step"), 1, 65_535, 1),
            "tcp_option_window_scale_enabled": _bool(stream.get("tcp_option_window_scale_enabled"), False),
            "tcp_option_window_scale": _bounded_int(
                stream.get("tcp_option_window_scale"), 0, 14, PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE
            ),
            "tcp_option_window_scale_mode": _choice(
                stream.get("tcp_option_window_scale_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_window_scale_count": _bounded_int(stream.get("tcp_option_window_scale_count"), 2, 256, 16),
            "tcp_option_window_scale_step": _bounded_int(stream.get("tcp_option_window_scale_step"), 1, 255, 1),
            "tcp_option_sack_permitted_enabled": _bool(stream.get("tcp_option_sack_permitted_enabled"), False),
            "tcp_option_sack_blocks_enabled": _bool(stream.get("tcp_option_sack_blocks_enabled"), False),
            "tcp_option_sack_left_edge": _bounded_int(
                stream.get("tcp_option_sack_left_edge"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE,
            ),
            "tcp_option_sack_left_edge_mode": _choice(
                stream.get("tcp_option_sack_left_edge_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_sack_left_edge_count": _bounded_int(
                stream.get("tcp_option_sack_left_edge_count"), 2, 4_294_967_296, 16
            ),
            "tcp_option_sack_left_edge_step": _bounded_int(
                stream.get("tcp_option_sack_left_edge_step"), 1, 4_294_967_295, 1
            ),
            "tcp_option_sack_right_edge": _bounded_int(
                stream.get("tcp_option_sack_right_edge"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE,
            ),
            "tcp_option_sack_right_edge_mode": _choice(
                stream.get("tcp_option_sack_right_edge_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_sack_right_edge_count": _bounded_int(
                stream.get("tcp_option_sack_right_edge_count"), 2, 4_294_967_296, 16
            ),
            "tcp_option_sack_right_edge_step": _bounded_int(
                stream.get("tcp_option_sack_right_edge_step"), 1, 4_294_967_295, 1
            ),
            "tcp_option_timestamp_enabled": _bool(stream.get("tcp_option_timestamp_enabled"), False),
            "tcp_option_timestamp_value": _bounded_int(
                stream.get("tcp_option_timestamp_value"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE,
            ),
            "tcp_option_timestamp_value_mode": _choice(
                stream.get("tcp_option_timestamp_value_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_timestamp_value_count": _bounded_int(
                stream.get("tcp_option_timestamp_value_count"), 2, 4_294_967_296, 16
            ),
            "tcp_option_timestamp_value_step": _bounded_int(
                stream.get("tcp_option_timestamp_value_step"), 1, 4_294_967_295, 1
            ),
            "tcp_option_timestamp_echo": _bounded_int(
                stream.get("tcp_option_timestamp_echo"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO,
            ),
            "tcp_option_timestamp_echo_mode": _choice(
                stream.get("tcp_option_timestamp_echo_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_option_timestamp_echo_count": _bounded_int(
                stream.get("tcp_option_timestamp_echo_count"), 2, 4_294_967_296, 16
            ),
            "tcp_option_timestamp_echo_step": _bounded_int(
                stream.get("tcp_option_timestamp_echo_step"), 1, 4_294_967_295, 1
            ),
            "sctp_verification_tag": _bounded_int(
                stream.get("sctp_verification_tag"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_SCTP_VERIFICATION_TAG,
            ),
            "sctp_verification_tag_mode": _choice(
                stream.get("sctp_verification_tag_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "sctp_verification_tag_count": _bounded_int(
                stream.get("sctp_verification_tag_count"), 2, 4_294_967_296, 16
            ),
            "sctp_verification_tag_step": _bounded_int(
                stream.get("sctp_verification_tag_step"), 1, 4_294_967_295, 1
            ),
            "sctp_checksum_override": _bool(stream.get("sctp_checksum_override"), False),
            "sctp_checksum": _clean_hex_dword_text_upper(
                stream.get("sctp_checksum"), PROFILE_DEFAULT_SCTP_CHECKSUM
            ),
            "sctp_data_flags": _bounded_int(
                stream.get("sctp_data_flags"), 0, 255, PROFILE_DEFAULT_SCTP_DATA_FLAGS
            ),
            "sctp_data_flags_mode": _choice(
                stream.get("sctp_data_flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "sctp_data_flags_count": _bounded_int(stream.get("sctp_data_flags_count"), 2, 256, 16),
            "sctp_data_flags_step": _bounded_int(stream.get("sctp_data_flags_step"), 1, 255, 1),
            "sctp_tsn": _bounded_int(stream.get("sctp_tsn"), 0, 4_294_967_295, PROFILE_DEFAULT_SCTP_TSN),
            "sctp_tsn_mode": _choice(stream.get("sctp_tsn_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "sctp_tsn_count": _bounded_int(stream.get("sctp_tsn_count"), 2, 4_294_967_296, 16),
            "sctp_tsn_step": _bounded_int(stream.get("sctp_tsn_step"), 1, 4_294_967_295, 1),
            "sctp_stream_id": _bounded_int(
                stream.get("sctp_stream_id"), 0, 65_535, PROFILE_DEFAULT_SCTP_STREAM_ID
            ),
            "sctp_stream_id_mode": _choice(
                stream.get("sctp_stream_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "sctp_stream_id_count": _bounded_int(stream.get("sctp_stream_id_count"), 2, 65_536, 16),
            "sctp_stream_id_step": _bounded_int(stream.get("sctp_stream_id_step"), 1, 65_535, 1),
            "sctp_stream_sequence": _bounded_int(
                stream.get("sctp_stream_sequence"), 0, 65_535, PROFILE_DEFAULT_SCTP_STREAM_SEQUENCE
            ),
            "sctp_stream_sequence_mode": _choice(
                stream.get("sctp_stream_sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "sctp_stream_sequence_count": _bounded_int(
                stream.get("sctp_stream_sequence_count"), 2, 65_536, 16
            ),
            "sctp_stream_sequence_step": _bounded_int(
                stream.get("sctp_stream_sequence_step"), 1, 65_535, 1
            ),
            "sctp_payload_protocol_id": _bounded_int(
                stream.get("sctp_payload_protocol_id"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_SCTP_PAYLOAD_PROTOCOL_ID,
            ),
            "sctp_payload_protocol_id_mode": _choice(
                stream.get("sctp_payload_protocol_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "sctp_payload_protocol_id_count": _bounded_int(
                stream.get("sctp_payload_protocol_id_count"), 2, 4_294_967_296, 16
            ),
            "sctp_payload_protocol_id_step": _bounded_int(
                stream.get("sctp_payload_protocol_id_step"), 1, 4_294_967_295, 1
            ),
            "icmp_type": _bounded_int(stream.get("icmp_type"), 0, 255, icmp_type_fallback),
            "icmp_type_mode": _choice(stream.get("icmp_type_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "icmp_type_count": _bounded_int(stream.get("icmp_type_count"), 2, 256, 16),
            "icmp_type_step": _bounded_int(stream.get("icmp_type_step"), 1, 255, 1),
            "icmp_code": _bounded_int(stream.get("icmp_code"), 0, 255, PROFILE_DEFAULT_ICMP_CODE),
            "icmp_code_mode": _choice(stream.get("icmp_code_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "icmp_code_count": _bounded_int(stream.get("icmp_code_count"), 2, 256, 16),
            "icmp_code_step": _bounded_int(stream.get("icmp_code_step"), 1, 255, 1),
            "icmp_checksum_override": _bool(stream.get("icmp_checksum_override"), False),
            "icmp_checksum": _clean_hex_word_text_upper(stream.get("icmp_checksum"), PROFILE_DEFAULT_ICMP_CHECKSUM),
            "icmp_identifier": _bounded_int(
                stream.get("icmp_identifier"), 0, 65_535, PROFILE_DEFAULT_ICMP_IDENTIFIER
            ),
            "icmp_identifier_mode": _choice(
                stream.get("icmp_identifier_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "icmp_identifier_count": _bounded_int(stream.get("icmp_identifier_count"), 2, 65_536, 16),
            "icmp_identifier_step": _bounded_int(stream.get("icmp_identifier_step"), 1, 65_535, 1),
            "icmp_sequence": _bounded_int(stream.get("icmp_sequence"), 0, 65_535, PROFILE_DEFAULT_ICMP_SEQUENCE),
            "icmp_sequence_mode": _choice(
                stream.get("icmp_sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "icmp_sequence_count": _bounded_int(stream.get("icmp_sequence_count"), 2, 65_536, 16),
            "icmp_sequence_step": _bounded_int(stream.get("icmp_sequence_step"), 1, 65_535, 1),
            "icmpv6_nd_target": _clean_ipv6_text(
                stream.get("icmpv6_nd_target"), PROFILE_DEFAULT_ICMPV6_ND_TARGET
            ),
            "icmpv6_nd_include_option": _bool(stream.get("icmpv6_nd_include_option"), True),
            "icmpv6_nd_option_mac": _clean_mac_text(
                stream.get("icmpv6_nd_option_mac"), PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC
            ),
            "icmpv6_nd_na_router": _bool(stream.get("icmpv6_nd_na_router"), False),
            "icmpv6_nd_na_solicited": _bool(stream.get("icmpv6_nd_na_solicited"), True),
            "icmpv6_nd_na_override": _bool(stream.get("icmpv6_nd_na_override"), True),
            "icmpv6_rs_include_slla": _bool(stream.get("icmpv6_rs_include_slla"), True),
            "icmpv6_rs_slla_mac": _clean_mac_text(
                stream.get("icmpv6_rs_slla_mac"), PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC
            ),
            "icmpv6_ra_cur_hop_limit": _bounded_int(stream.get("icmpv6_ra_cur_hop_limit"), 0, 255, 64),
            "icmpv6_ra_managed": _bool(stream.get("icmpv6_ra_managed"), False),
            "icmpv6_ra_other": _bool(stream.get("icmpv6_ra_other"), False),
            "icmpv6_ra_router_lifetime": _bounded_int(
                stream.get("icmpv6_ra_router_lifetime"),
                0,
                65_535,
                PROFILE_DEFAULT_ICMPV6_RA_ROUTER_LIFETIME,
            ),
            "icmpv6_ra_reachable_time": _bounded_int(stream.get("icmpv6_ra_reachable_time"), 0, 4_294_967_295, 0),
            "icmpv6_ra_retrans_timer": _bounded_int(stream.get("icmpv6_ra_retrans_timer"), 0, 4_294_967_295, 0),
            "icmpv6_ra_include_slla": _bool(stream.get("icmpv6_ra_include_slla"), True),
            "icmpv6_ra_slla_mac": _clean_mac_text(
                stream.get("icmpv6_ra_slla_mac"), PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC
            ),
            "icmpv6_ra_include_prefix": _bool(stream.get("icmpv6_ra_include_prefix"), True),
            "icmpv6_ra_prefix": _clean_ipv6_text(stream.get("icmpv6_ra_prefix"), PROFILE_DEFAULT_ICMPV6_RA_PREFIX),
            "icmpv6_ra_prefix_length": _bounded_int(stream.get("icmpv6_ra_prefix_length"), 0, 128, 64),
            "icmpv6_ra_prefix_on_link": _bool(stream.get("icmpv6_ra_prefix_on_link"), True),
            "icmpv6_ra_prefix_autonomous": _bool(stream.get("icmpv6_ra_prefix_autonomous"), True),
            "icmpv6_ra_prefix_valid_lifetime": _bounded_int(
                stream.get("icmpv6_ra_prefix_valid_lifetime"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_ICMPV6_RA_PREFIX_VALID_LIFETIME,
            ),
            "icmpv6_ra_prefix_preferred_lifetime": _bounded_int(
                stream.get("icmpv6_ra_prefix_preferred_lifetime"),
                0,
                4_294_967_295,
                PROFILE_DEFAULT_ICMPV6_RA_PREFIX_PREFERRED_LIFETIME,
            ),
            "tcp_urgent_pointer": _bounded_int(
                stream.get("tcp_urgent_pointer"), 0, 65_535, PROFILE_DEFAULT_TCP_URGENT_POINTER
            ),
            "tcp_urgent_pointer_mode": _choice(
                stream.get("tcp_urgent_pointer_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
            ),
            "tcp_urgent_pointer_count": _bounded_int(stream.get("tcp_urgent_pointer_count"), 2, 65_536, 16),
            "tcp_urgent_pointer_step": _bounded_int(stream.get("tcp_urgent_pointer_step"), 1, 65_535, 1),
            "tcp_flags_mode": _choice(stream.get("tcp_flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
            "tcp_flags_count": _bounded_int(stream.get("tcp_flags_count"), 2, 64, 16),
            "tcp_flags_step": _bounded_int(stream.get("tcp_flags_step"), 1, 63, 1),
            "tcp_flag_urg": _bool(stream.get("tcp_flag_urg"), False),
            "tcp_flag_ack": _bool(stream.get("tcp_flag_ack"), False),
            "tcp_flag_psh": _bool(stream.get("tcp_flag_psh"), False),
            "tcp_flag_rst": _bool(stream.get("tcp_flag_rst"), False),
            "tcp_flag_syn": _bool(stream.get("tcp_flag_syn"), False),
            "tcp_flag_fin": _bool(stream.get("tcp_flag_fin"), False),
            "payload_enabled": payload_enabled,
            "payload_type": payload_type,
            "payload_pattern": payload_pattern,
            "advanced_cache_size_type": _choice(
                stream.get("advanced_cache_size_type"), PROFILE_WORKBENCH_CACHE_SIZE_TYPES, "Auto"
            ),
            "advanced_cache_value": _bounded_int(stream.get("advanced_cache_value"), 0, 999_999, 5000),
            "packet_binary_base64": base64.b64encode(packet_binary).decode("ascii")
            if packet_binary is not None
            else None,
        }
        if not _workbench_has_l3(normalized_stream):
            normalized_stream["mpls_enabled"] = False
            normalized_stream["vxlan_enabled"] = False
            normalized_stream["gtpu_enabled"] = False
        if _workbench_has_arp(normalized_stream):
            normalized_stream["mpls_enabled"] = False
            normalized_stream["vxlan_enabled"] = False
            normalized_stream["gtpu_enabled"] = False
            normalized_stream["ipv4_checksum_override"] = False
            normalized_stream["flow_stats_enabled"] = False
            normalized_stream["latency_enabled"] = False
        if not normalized_stream["vlan_enabled"]:
            normalized_stream["vlan2_enabled"] = False
            for field in ("vlan_priority", "vlan_id", "vlan2_priority", "vlan2_id"):
                normalized_stream[f"{field}_mode"] = "Fixed"
        elif not normalized_stream["vlan2_enabled"]:
            for field in ("vlan2_priority", "vlan2_id"):
                normalized_stream[f"{field}_mode"] = "Fixed"
        if not normalized_stream["mpls_enabled"]:
            for field in (
                "mpls_label",
                "mpls_tc",
                "mpls_ttl",
                "mpls_label2",
                "mpls_label2_tc",
                "mpls_label2_ttl",
                "mpls_label3",
                "mpls_label3_tc",
                "mpls_label3_ttl",
            ):
                normalized_stream[f"{field}_mode"] = "Fixed"
        if not normalized_stream["mpls_label2_enabled"]:
            normalized_stream["mpls_label3_enabled"] = False
            for field in (
                "mpls_label2",
                "mpls_label2_tc",
                "mpls_label2_ttl",
                "mpls_label3",
                "mpls_label3_tc",
                "mpls_label3_ttl",
            ):
                normalized_stream[f"{field}_mode"] = "Fixed"
        elif not normalized_stream["mpls_label3_enabled"]:
            for field in ("mpls_label3", "mpls_label3_tc", "mpls_label3_ttl"):
                normalized_stream[f"{field}_mode"] = "Fixed"
        if not _workbench_has_l4(normalized_stream):
            normalized_stream["udp_length_mode"] = "Fixed"
        if _workbench_has_gre(normalized_stream):
            normalized_stream["frame_length_type"] = "Fixed"
            normalized_stream["udp_length_mode"] = "Fixed"
            normalized_stream["udp_checksum_mode"] = "Fixed"
            normalized_stream["tcp_checksum_mode"] = "Fixed"
            normalized_stream["gre_protocol_type"] = (
                "86DD" if _workbench_gre_inner_ip_version(normalized_stream) == "IPv6" else PROFILE_DEFAULT_GRE_PROTOCOL_TYPE
            )
            if normalized_stream["gre_key_mode"] != "Fixed":
                normalized_stream["gre_key_present"] = True
            if normalized_stream["gre_sequence_mode"] != "Fixed":
                normalized_stream["gre_sequence_present"] = True
            if _workbench_gre_inner_ip_version(normalized_stream) == "IPv6":
                normalized_stream["gre_inner_ipv4_src_mode"] = "Fixed"
                normalized_stream["gre_inner_ipv4_dst_mode"] = "Fixed"
                normalized_stream["gre_inner_ipv4_ttl_mode"] = "Fixed"
            else:
                normalized_stream["gre_inner_ipv6_src_mode"] = "Fixed"
                normalized_stream["gre_inner_ipv6_dst_mode"] = "Fixed"
                normalized_stream["gre_inner_ipv6_hop_limit_mode"] = "Fixed"
            gre_dynamic_fields = (
                "gre_key",
                "gre_sequence",
                "gre_inner_ipv4_src",
                "gre_inner_ipv4_dst",
                "gre_inner_ipv4_ttl",
                "gre_inner_ipv6_src",
                "gre_inner_ipv6_dst",
                "gre_inner_ipv6_hop_limit",
                "gre_inner_l4_src_port",
                "gre_inner_l4_dst_port",
            )
            if any(normalized_stream[f"{field}_mode"] != "Fixed" for field in gre_dynamic_fields):
                normalized_stream["gre_checksum_present"] = False
                normalized_stream["gre_checksum_override"] = False
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
        else:
            normalized_stream["gre_inner_ip_version"] = "IPv4"
            normalized_stream["gre_key_mode"] = "Fixed"
            normalized_stream["gre_sequence_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv4_src_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv4_dst_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv4_ttl_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv6_src_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv6_dst_mode"] = "Fixed"
            normalized_stream["gre_inner_ipv6_hop_limit_mode"] = "Fixed"
            normalized_stream["gre_inner_l4_src_port_mode"] = "Fixed"
            normalized_stream["gre_inner_l4_dst_port_mode"] = "Fixed"
        if _workbench_has_gtpu(normalized_stream):
            normalized_stream["frame_length_type"] = "Fixed"
            normalized_stream["l4_src_port_override"] = True
            normalized_stream["l4_src_port"] = CAPTURE_GTPU_PORT
            normalized_stream["l4_src_port_mode"] = "Fixed"
            normalized_stream["l4_dst_port_override"] = True
            normalized_stream["l4_dst_port"] = CAPTURE_GTPU_PORT
            normalized_stream["l4_dst_port_mode"] = "Fixed"
            normalized_stream["udp_length_override"] = False
            normalized_stream["udp_length_mode"] = "Fixed"
            normalized_stream["udp_checksum_override"] = False
            normalized_stream["udp_checksum_mode"] = "Fixed"
            normalized_stream["dns_enabled"] = False
            for field in PROFILE_WORKBENCH_DNS_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
            normalized_stream["dhcp_enabled"] = False
            for field in PROFILE_WORKBENCH_DHCP_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
            if not normalized_stream["gtpu_sequence_enabled"]:
                normalized_stream["gtpu_sequence_mode"] = "Fixed"
            if not normalized_stream["gtpu_npdu_enabled"]:
                normalized_stream["gtpu_npdu_mode"] = "Fixed"
            if not normalized_stream["gtpu_extension_enabled"]:
                normalized_stream["gtpu_extension_udp_port_mode"] = "Fixed"
            if normalized_stream["gtpu_inner_ip_version"] == "IPv6":
                normalized_stream["gtpu_inner_ipv4_src_mode"] = "Fixed"
                normalized_stream["gtpu_inner_ipv4_dst_mode"] = "Fixed"
                normalized_stream["gtpu_inner_ipv4_ttl_mode"] = "Fixed"
            else:
                normalized_stream["gtpu_inner_ipv6_src_mode"] = "Fixed"
                normalized_stream["gtpu_inner_ipv6_dst_mode"] = "Fixed"
                normalized_stream["gtpu_inner_ipv6_hop_limit_mode"] = "Fixed"
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
        else:
            normalized_stream["gtpu_sequence_enabled"] = False
            normalized_stream["gtpu_npdu_enabled"] = False
            normalized_stream["gtpu_extension_enabled"] = False
            normalized_stream["gtpu_inner_ip_version"] = "IPv4"
            normalized_stream["gtpu_teid_mode"] = "Fixed"
            normalized_stream["gtpu_sequence_mode"] = "Fixed"
            normalized_stream["gtpu_npdu_mode"] = "Fixed"
            normalized_stream["gtpu_extension_udp_port_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv4_src_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv4_dst_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv4_ttl_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv6_src_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv6_dst_mode"] = "Fixed"
            normalized_stream["gtpu_inner_ipv6_hop_limit_mode"] = "Fixed"
            normalized_stream["gtpu_inner_l4_src_port_mode"] = "Fixed"
            normalized_stream["gtpu_inner_l4_dst_port_mode"] = "Fixed"
        if not _workbench_has_transport_ports(normalized_stream):
            normalized_stream["l4_src_port_override"] = False
            normalized_stream["l4_src_port_mode"] = "Fixed"
            normalized_stream["l4_dst_port_override"] = False
            normalized_stream["l4_dst_port_mode"] = "Fixed"
        if not normalized_stream["packet_type"].endswith("/UDP"):
            normalized_stream["udp_length_override"] = False
            normalized_stream["udp_checksum_override"] = False
            normalized_stream["udp_checksum_mode"] = "Fixed"
            normalized_stream["dns_enabled"] = False
            for field in PROFILE_WORKBENCH_DNS_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
            normalized_stream["dhcp_enabled"] = False
            for field in PROFILE_WORKBENCH_DHCP_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if normalized_stream["dns_enabled"] and (
            normalized_stream["vxlan_enabled"] or normalized_stream["gtpu_enabled"]
        ):
            normalized_stream["dns_enabled"] = False
            for field in PROFILE_WORKBENCH_DNS_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if normalized_stream["dhcp_enabled"] and (
            normalized_stream["packet_type"] != "Ethernet/IPv4/UDP"
            or normalized_stream["vxlan_enabled"]
            or normalized_stream["gtpu_enabled"]
        ):
            normalized_stream["dhcp_enabled"] = False
            for field in PROFILE_WORKBENCH_DHCP_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if normalized_stream["dns_enabled"] and normalized_stream["dhcp_enabled"]:
            normalized_stream["dns_enabled"] = False
            for field in PROFILE_WORKBENCH_DNS_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if not normalized_stream["dhcp_enabled"]:
            for field in PROFILE_WORKBENCH_DHCP_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if not normalized_stream["dns_enabled"]:
            normalized_stream["dns_answer_enabled"] = False
            for field in PROFILE_WORKBENCH_DNS_FE_FIELDS:
                normalized_stream[f"{field}_mode"] = "Fixed"
        if normalized_stream["dns_enabled"]:
            normalized_stream["payload_enabled"] = True
            normalized_stream["udp_length_override"] = False
            if not normalized_stream["dns_answer_enabled"]:
                for field in ("dns_answer_ttl", "dns_answer_ipv4"):
                    normalized_stream[f"{field}_mode"] = "Fixed"
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
            if any(normalized_stream[f"{field}_mode"] != "Fixed" for field in PROFILE_WORKBENCH_DNS_FE_FIELDS):
                normalized_stream["udp_checksum_override"] = False
        if normalized_stream["dhcp_enabled"]:
            normalized_stream["payload_enabled"] = True
            normalized_stream["l4_src_port_override"] = True
            normalized_stream["l4_src_port"] = 68
            normalized_stream["l4_dst_port_override"] = True
            normalized_stream["l4_dst_port"] = 67
            if normalized_stream["dhcp_requested_ip"] == PROFILE_DEFAULT_DHCP_REQUESTED_IP:
                normalized_stream["dhcp_requested_ip_mode"] = "Fixed"
            if normalized_stream["dhcp_server_id"] == PROFILE_DEFAULT_DHCP_SERVER_ID:
                normalized_stream["dhcp_server_id_mode"] = "Fixed"
            for field in ("dhcp_lease_time", "dhcp_renewal_time", "dhcp_rebinding_time"):
                if normalized_stream[field] == 0:
                    normalized_stream[f"{field}_mode"] = "Fixed"
            normalized_stream["udp_length_override"] = False
            normalized_stream["udp_length_mode"] = "Fixed"
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
            if any(normalized_stream[f"{field}_mode"] != "Fixed" for field in PROFILE_WORKBENCH_DHCP_FE_FIELDS):
                normalized_stream["udp_checksum_override"] = False
        if not normalized_stream["packet_type"].endswith("/TCP"):
            normalized_stream["tcp_option_mss_enabled"] = False
            normalized_stream["tcp_option_mss_mode"] = "Fixed"
            normalized_stream["tcp_option_window_scale_enabled"] = False
            normalized_stream["tcp_option_window_scale_mode"] = "Fixed"
            normalized_stream["tcp_option_sack_permitted_enabled"] = False
            normalized_stream["tcp_option_sack_blocks_enabled"] = False
            normalized_stream["tcp_option_sack_left_edge_mode"] = "Fixed"
            normalized_stream["tcp_option_sack_right_edge_mode"] = "Fixed"
            normalized_stream["tcp_option_timestamp_enabled"] = False
            normalized_stream["tcp_option_timestamp_value_mode"] = "Fixed"
            normalized_stream["tcp_option_timestamp_echo_mode"] = "Fixed"
        else:
            if not normalized_stream["tcp_option_window_scale_enabled"]:
                normalized_stream["tcp_option_window_scale_mode"] = "Fixed"
            if not normalized_stream["tcp_option_sack_blocks_enabled"]:
                normalized_stream["tcp_option_sack_left_edge_mode"] = "Fixed"
                normalized_stream["tcp_option_sack_right_edge_mode"] = "Fixed"
            if not normalized_stream["tcp_option_timestamp_enabled"]:
                normalized_stream["tcp_option_timestamp_value_mode"] = "Fixed"
                normalized_stream["tcp_option_timestamp_echo_mode"] = "Fixed"
        if not normalized_stream["packet_type"].endswith("/SCTP"):
            normalized_stream["sctp_checksum_override"] = False
            normalized_stream["sctp_verification_tag_mode"] = "Fixed"
            normalized_stream["sctp_data_flags_mode"] = "Fixed"
            normalized_stream["sctp_tsn_mode"] = "Fixed"
            normalized_stream["sctp_stream_id_mode"] = "Fixed"
            normalized_stream["sctp_stream_sequence_mode"] = "Fixed"
            normalized_stream["sctp_payload_protocol_id_mode"] = "Fixed"
        elif (
            normalized_stream["sctp_verification_tag_mode"] != "Fixed"
            or normalized_stream["sctp_data_flags_mode"] != "Fixed"
            or normalized_stream["sctp_tsn_mode"] != "Fixed"
            or normalized_stream["sctp_stream_id_mode"] != "Fixed"
            or normalized_stream["sctp_stream_sequence_mode"] != "Fixed"
            or normalized_stream["sctp_payload_protocol_id_mode"] != "Fixed"
        ):
            normalized_stream["sctp_checksum_override"] = True
            normalized_stream["sctp_checksum"] = PROFILE_DEFAULT_SCTP_CHECKSUM
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
        elif normalized_stream["l4_src_port_mode"] != "Fixed" or normalized_stream["l4_dst_port_mode"] != "Fixed":
            normalized_stream["sctp_checksum_override"] = True
            normalized_stream["sctp_checksum"] = PROFILE_DEFAULT_SCTP_CHECKSUM
        if not _workbench_has_icmp(normalized_stream):
            normalized_stream["icmp_checksum_override"] = False
            normalized_stream["icmp_type_mode"] = "Fixed"
            normalized_stream["icmp_code_mode"] = "Fixed"
            normalized_stream["icmp_identifier_mode"] = "Fixed"
            normalized_stream["icmp_sequence_mode"] = "Fixed"
        if not _workbench_is_icmp_echo(normalized_stream):
            normalized_stream["icmp_type_mode"] = "Fixed"
            normalized_stream["icmp_code_mode"] = "Fixed"
            normalized_stream["icmp_identifier_mode"] = "Fixed"
            normalized_stream["icmp_sequence_mode"] = "Fixed"
        if not _workbench_is_icmpv6_echo(normalized_stream):
            normalized_stream["icmp_type_mode"] = "Fixed"
            normalized_stream["icmp_code_mode"] = "Fixed"
            normalized_stream["icmp_identifier_mode"] = "Fixed"
            normalized_stream["icmp_sequence_mode"] = "Fixed"
        if (
            normalized_stream["icmp_type_mode"] != "Fixed"
            or normalized_stream["icmp_code_mode"] != "Fixed"
            or normalized_stream["icmp_identifier_mode"] != "Fixed"
            or normalized_stream["icmp_sequence_mode"] != "Fixed"
        ):
            normalized_stream["icmp_checksum_override"] = False
        if normalized_stream["packet_type"].endswith("/ICMPv6"):
            normalized_stream["frame_length_type"] = "Fixed"
            normalized_stream["ipv6_src_mode"] = "Fixed"
            normalized_stream["ipv6_dst_mode"] = "Fixed"
            if _workbench_is_icmpv6_control(normalized_stream):
                normalized_stream["icmp_code"] = 0
                normalized_stream["icmp_code_mode"] = "Fixed"
                normalized_stream["ipv6_hop_limit"] = 255
                normalized_stream["ipv6_hop_limit_mode"] = "Fixed"
                minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
                normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
                normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
                normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
        if normalized_stream["vxlan_enabled"]:
            normalized_stream["l4_src_port_mode"] = "Fixed"
            normalized_stream["l4_dst_port_mode"] = "Fixed"
            normalized_stream["udp_length_mode"] = "Fixed"
            if normalized_stream["vxlan_inner_ip_version"] == "IPv6":
                normalized_stream["vxlan_inner_ipv4_src_mode"] = "Fixed"
                normalized_stream["vxlan_inner_ipv4_dst_mode"] = "Fixed"
                normalized_stream["vxlan_inner_ipv4_ttl_mode"] = "Fixed"
            else:
                normalized_stream["vxlan_inner_ipv6_src_mode"] = "Fixed"
                normalized_stream["vxlan_inner_ipv6_dst_mode"] = "Fixed"
                normalized_stream["vxlan_inner_ipv6_hop_limit_mode"] = "Fixed"
        else:
            normalized_stream["vxlan_inner_ip_version"] = "IPv4"
            normalized_stream["vxlan_vni_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv4_src_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv4_dst_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv4_ttl_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv6_src_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv6_dst_mode"] = "Fixed"
            normalized_stream["vxlan_inner_ipv6_hop_limit_mode"] = "Fixed"
            normalized_stream["vxlan_inner_l4_src_port_mode"] = "Fixed"
            normalized_stream["vxlan_inner_l4_dst_port_mode"] = "Fixed"
        if normalized_stream["vxlan_enabled"] and normalized_stream["frame_length_type"] != "Fixed":
            normalized_stream["frame_length_type"] = "Fixed"
        if normalized_stream["vxlan_enabled"] and packet_binary is None:
            minimum_frame_length = _workbench_minimum_wire_length(normalized_stream)
            normalized_stream["frame_length"] = max(normalized_stream["frame_length"], minimum_frame_length)
            normalized_stream["frame_length_min"] = max(normalized_stream["frame_length_min"], minimum_frame_length)
            normalized_stream["frame_length_max"] = max(normalized_stream["frame_length_max"], minimum_frame_length)
        if not _workbench_supports_variable_frame_length(normalized_stream):
            normalized_stream["frame_length_type"] = "Fixed"

        advanced_fields = _normalize_workbench_advanced_fields(stream, packet_binary)
        if isinstance(advanced_fields, TrexCallResult):
            return advanced_fields
        normalized_stream.update(advanced_fields)
        normalized.append(normalized_stream)
    return normalized


def _workbench_minimum_wire_length(stream: dict[str, Any]) -> int:
    if _workbench_has_dhcp(stream):
        return max(
            64,
            _workbench_l2_header_length(stream)
            + _workbench_l3_header_length(stream)
            + 8
            + PROFILE_DHCP_MIN_PAYLOAD_BYTES
            + 4,
        )
    if _workbench_has_dns(stream):
        return max(
            64,
            _workbench_l2_header_length(stream)
            + _workbench_l3_header_length(stream)
            + 8
            + len(_dns_query_bytes(stream))
            + 4,
        )
    if _workbench_is_icmpv6_control(stream):
        return max(64, _workbench_l2_header_length(stream) + 40 + _icmp_header_length(stream) + 4)
    if _workbench_has_gre(stream):
        gre_inner_l3_length = 40 if _workbench_gre_inner_ip_version(stream) == "IPv6" else 20
        return max(
            64,
            _workbench_l2_header_length(stream)
            + _workbench_l3_header_length(stream)
            + _gre_header_length(stream)
            + gre_inner_l3_length
            + 8
            + 4,
        )
    if _workbench_has_sctp(stream):
        return max(
            64,
            _workbench_l2_header_length(stream)
            + _workbench_l3_header_length(stream)
            + _sctp_header_length(stream)
            + 4,
        )
    if _workbench_has_gtpu(stream):
        inner_l3_length = 40 if _workbench_gtpu_inner_ip_version(stream) == "IPv6" else 20
        return max(
            64,
            _workbench_l2_header_length(stream)
            + 20
            + 8
            + 8
            + _workbench_gtpu_optional_header_length(stream)
            + _workbench_gtpu_extension_header_length(stream)
            + inner_l3_length
            + 8
            + 4,
        )
    if not stream.get("vxlan_enabled"):
        return 64
    outer_l2 = _workbench_l2_header_length(stream)
    inner_l3_length = 40 if _workbench_vxlan_inner_ip_version(stream) == "IPv6" else 20
    return outer_l2 + 20 + 8 + 8 + 14 + inner_l3_length + 8 + 4
