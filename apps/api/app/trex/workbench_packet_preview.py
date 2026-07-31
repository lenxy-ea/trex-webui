from __future__ import annotations

import base64
from typing import Any

from app.trex.workbench_layout import (
    workbench_gre_header_length as _gre_header_length,
    workbench_gtpu_extension_header_length as _workbench_gtpu_extension_header_length,
    workbench_gtpu_optional_header_length as _workbench_gtpu_optional_header_length,
    workbench_icmp_header_length as _icmp_header_length,
    workbench_inner_ether_type as _inner_ether_type,
    workbench_l2_header_length as _workbench_l2_header_length,
    workbench_mpls_label_field_name as _workbench_mpls_label_field_name,
    workbench_mpls_stack as _workbench_mpls_stack,
    workbench_mpls_tc_field_name as _workbench_mpls_tc_field_name,
    workbench_mpls_ttl_field_name as _workbench_mpls_ttl_field_name,
    workbench_outer_ether_type as _outer_ether_type,
    workbench_sctp_header_length as _sctp_header_length,
    workbench_vlan_cfi_field_name as _workbench_vlan_cfi_field_name,
    workbench_vlan_id_field_name as _workbench_vlan_id_field_name,
    workbench_vlan_priority_field_name as _workbench_vlan_priority_field_name,
    workbench_vlan_tag_count as _workbench_vlan_tag_count,
    workbench_vlan_tpid as _workbench_vlan_tpid,
    workbench_vxlan_inner_ip_version as _workbench_vxlan_inner_ip_version,
)
from app.trex.workbench_packet import hex_dump_lines as _hex_dump_lines, udp_auto_length as _udp_auto_length
from app.trex.workbench_packet_build import build_profile_packet as _build_profile_packet
from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version as _workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version as _workbench_gtpu_inner_ip_version,
    workbench_has_arp as _workbench_has_arp,
    workbench_has_dhcp as _workbench_has_dhcp,
    workbench_has_dns as _workbench_has_dns,
    workbench_has_gtpu as _workbench_has_gtpu,
    workbench_has_l3 as _workbench_has_l3,
    workbench_has_l4 as _workbench_has_l4,
    workbench_ip_version as _workbench_ip_version,
    workbench_is_icmpv6_nd as _workbench_is_icmpv6_nd,
    workbench_is_icmpv6_ra as _workbench_is_icmpv6_ra,
    workbench_is_icmpv6_rs as _workbench_is_icmpv6_rs,
    workbench_l3_header_length as _workbench_l3_header_length,
)
from app.trex.workbench_transport import (
    tcp_flags_text as _tcp_flags_text,
    tcp_header_length as _tcp_header_length,
    tcp_options_enabled as _tcp_options_enabled,
    tcp_options_preview_fields as _tcp_options_preview_fields,
    tcp_options_text as _tcp_options_text,
)
from app.trex.workbench_values import PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT

def packet_preview_record(stream: dict[str, Any], index: int) -> dict[str, Any]:
    packet_bytes = _build_profile_packet(stream)
    has_l3 = _workbench_has_l3(stream)
    has_l4 = _workbench_has_l4(stream)
    protocol = (
        "UDP"
        if stream["packet_type"].endswith("/UDP")
        else "TCP"
        if stream["packet_type"].endswith("/TCP")
        else "SCTP"
        if stream["packet_type"].endswith("/SCTP")
        else "ICMPv6"
        if stream["packet_type"].endswith("/ICMPv6")
        else "GRE"
        if stream["packet_type"].endswith("/GRE")
        else "ICMP"
        if stream["packet_type"].endswith("/ICMP")
        else "None"
    )
    l2_header_length = _workbench_l2_header_length(stream)
    l3_header_length = _workbench_l3_header_length(stream)
    ip_version = _workbench_ip_version(stream)
    ethernet_type = _outer_ether_type(stream)
    layers = [
        {
            "name": "Ethernet",
            "fields": {
                "destination": stream["ether_dst"],
                "source": stream["ether_src"],
                "type": f"0x{ethernet_type:04x}",
            },
        }
    ]
    for vlan_index in range(1, _workbench_vlan_tag_count(stream) + 1):
        priority_field = _workbench_vlan_priority_field_name(vlan_index)
        cfi_field = _workbench_vlan_cfi_field_name(vlan_index)
        id_field = _workbench_vlan_id_field_name(vlan_index)
        payload_type = (
            _workbench_vlan_tpid(stream, vlan_index + 1)
            if vlan_index < _workbench_vlan_tag_count(stream)
            else _inner_ether_type(stream)
        )
        layers.append(
            {
                "name": "802.1Q VLAN" if vlan_index == 1 else "802.1Q VLAN Inner",
                "fields": {
                    "tag": vlan_index,
                    "tpid": f"0x{_workbench_vlan_tpid(stream, vlan_index):04x}",
                    "priority": stream[priority_field],
                    "priority_mode": stream[f"{priority_field}_mode"],
                    "priority_count": stream[f"{priority_field}_count"],
                    "priority_step": stream[f"{priority_field}_step"],
                    "cfi_dei": stream[cfi_field],
                    "vlan": stream[id_field],
                    "vlan_mode": stream[f"{id_field}_mode"],
                    "vlan_count": stream[f"{id_field}_count"],
                    "vlan_step": stream[f"{id_field}_step"],
                    "type": f"0x{payload_type:04x}",
                },
            }
        )
    for label_index, label in enumerate(_workbench_mpls_stack(stream)):
        mpls_index = label_index + 1
        label_field = _workbench_mpls_label_field_name(mpls_index)
        tc_field = _workbench_mpls_tc_field_name(mpls_index)
        ttl_field = _workbench_mpls_ttl_field_name(mpls_index)
        payload_name = "MPLS"
        if label["bottom_of_stack"] == 1:
            payload_name = "IPv6" if ip_version == 6 else "IPv4"
        layers.append(
            {
                "name": "MPLS",
                "fields": {
                    "label": label["label"],
                    "traffic_class": label["traffic_class"],
                    "bottom_of_stack": label["bottom_of_stack"],
                    "ttl": label["ttl"],
                    "payload": payload_name,
                    "label_mode": stream[f"{label_field}_mode"],
                    "label_count": stream[f"{label_field}_count"],
                    "label_step": stream[f"{label_field}_step"],
                    "traffic_class_mode": stream[f"{tc_field}_mode"],
                    "traffic_class_count": stream[f"{tc_field}_count"],
                    "traffic_class_step": stream[f"{tc_field}_step"],
                    "ttl_mode": stream[f"{ttl_field}_mode"],
                    "ttl_count": stream[f"{ttl_field}_count"],
                    "ttl_step": stream[f"{ttl_field}_step"],
                },
            }
        )
    if _workbench_has_arp(stream):
        layers.append(
            {
                "name": "Address Resolution Protocol",
                "fields": {
                    "hardware_type": stream["arp_hardware_type"],
                    "protocol_type": f"0x{stream['arp_protocol_type'].lower()}",
                    "hardware_size": stream["arp_hardware_size"],
                    "protocol_size": stream["arp_protocol_size"],
                    "operation": stream["arp_operation"],
                    "operation_mode": stream["arp_operation_mode"],
                    "operation_count": stream["arp_operation_count"],
                    "operation_step": stream["arp_operation_step"],
                    "sender_mac": stream["arp_sender_mac"],
                    "sender_mac_mode": stream["arp_sender_mac_mode"],
                    "sender_mac_count": stream["arp_sender_mac_count"],
                    "sender_mac_step": stream["arp_sender_mac_step"],
                    "sender_ip": stream["arp_sender_ip"],
                    "sender_ip_mode": stream["arp_sender_ip_mode"],
                    "sender_ip_count": stream["arp_sender_ip_count"],
                    "sender_ip_step": stream["arp_sender_ip_step"],
                    "target_mac": stream["arp_target_mac"],
                    "target_mac_mode": stream["arp_target_mac_mode"],
                    "target_mac_count": stream["arp_target_mac_count"],
                    "target_mac_step": stream["arp_target_mac_step"],
                    "target_ip": stream["arp_target_ip"],
                    "target_ip_mode": stream["arp_target_ip_mode"],
                    "target_ip_count": stream["arp_target_ip_count"],
                    "target_ip_step": stream["arp_target_ip_step"],
                },
            }
        )
    if has_l3:
        ip_fields: dict[str, Any]
        if ip_version == 6:
            ip_fields = {
                "source": stream["ipv6_src"],
                "destination": stream["ipv6_dst"],
                "traffic_class": stream["ipv6_traffic_class"],
                "traffic_class_mode": stream["ipv6_traffic_class_mode"],
                "traffic_class_count": stream["ipv6_traffic_class_count"],
                "traffic_class_step": stream["ipv6_traffic_class_step"],
                "flow_label": stream["ipv6_flow_label"],
                "flow_label_mode": stream["ipv6_flow_label_mode"],
                "flow_label_count": stream["ipv6_flow_label_count"],
                "flow_label_step": stream["ipv6_flow_label_step"],
                "hop_limit": stream["ipv6_hop_limit"],
                "hop_limit_mode": stream["ipv6_hop_limit_mode"],
                "hop_limit_count": stream["ipv6_hop_limit_count"],
                "hop_limit_step": stream["ipv6_hop_limit_step"],
                "protocol": protocol,
            }
        else:
            ip_fields = {
                "source": stream["ipv4_src"],
                "destination": stream["ipv4_dst"],
                "dscp": stream["ipv4_dscp"],
                "dscp_mode": stream["ipv4_dscp_mode"],
                "dscp_count": stream["ipv4_dscp_count"],
                "dscp_step": stream["ipv4_dscp_step"],
                "ecn": stream["ipv4_ecn"],
                "ecn_mode": stream["ipv4_ecn_mode"],
                "ecn_count": stream["ipv4_ecn_count"],
                "ecn_step": stream["ipv4_ecn_step"],
                "tos": (stream["ipv4_dscp"] << 2) | stream["ipv4_ecn"],
                "identification": stream["ipv4_id"],
                "identification_mode": stream["ipv4_id_mode"],
                "identification_count": stream["ipv4_id_count"],
                "identification_step": stream["ipv4_id_step"],
                "flags": _ipv4_flags_text(stream),
                "fragment_offset": stream["ipv4_fragment_offset"],
                "fragment_offset_mode": stream["ipv4_fragment_offset_mode"],
                "fragment_offset_count": stream["ipv4_fragment_offset_count"],
                "fragment_offset_step": stream["ipv4_fragment_offset_step"],
                "ttl": stream["ipv4_ttl"],
                "ttl_mode": stream["ipv4_ttl_mode"],
                "ttl_count": stream["ipv4_ttl_count"],
                "ttl_step": stream["ipv4_ttl_step"],
                "checksum": stream["ipv4_checksum"] if stream["ipv4_checksum_override"] else "auto",
                "checksum_override": stream["ipv4_checksum_override"],
                "protocol": protocol,
            }
        layers.append(
            {
                "name": "Internet Protocol v6" if ip_version == 6 else "Internet Protocol v4",
                "fields": ip_fields,
            }
        )
    if has_l4:
        l4_fields: dict[str, Any] = {}
        if protocol in {"TCP", "UDP", "SCTP"}:
            l4_fields.update(
                {
                    "source_port": stream["l4_src_port"],
                    "destination_port": stream["l4_dst_port"],
                }
            )
        if protocol == "TCP":
            l4_fields.update(
                {
                    "sequence_number": stream["tcp_sequence_number"],
                    "sequence_mode": stream["tcp_sequence_mode"],
                    "sequence_count": stream["tcp_sequence_count"],
                    "sequence_step": stream["tcp_sequence_step"],
                    "acknowledge_number": stream["tcp_ack_number"],
                    "acknowledge_mode": stream["tcp_ack_mode"],
                    "acknowledge_count": stream["tcp_ack_count"],
                    "acknowledge_step": stream["tcp_ack_step"],
                    "window": stream["tcp_window"],
                    "window_mode": stream["tcp_window_mode"],
                    "window_count": stream["tcp_window_count"],
                    "window_step": stream["tcp_window_step"],
                    "checksum": stream["tcp_checksum"] if stream["tcp_checksum_override"] else "auto",
                    "checksum_override": stream["tcp_checksum_override"],
                    "checksum_mode": stream["tcp_checksum_mode"],
                    "checksum_count": stream["tcp_checksum_count"],
                    "checksum_step": stream["tcp_checksum_step"],
                    "header_length": _tcp_header_length(stream),
                    "options": _tcp_options_text(stream),
                    "urgent_pointer": stream["tcp_urgent_pointer"],
                    "urgent_pointer_mode": stream["tcp_urgent_pointer_mode"],
                    "urgent_pointer_count": stream["tcp_urgent_pointer_count"],
                    "urgent_pointer_step": stream["tcp_urgent_pointer_step"],
                    "flags": _tcp_flags_text(stream),
                    "flags_mode": stream["tcp_flags_mode"],
                    "flags_count": stream["tcp_flags_count"],
                    "flags_step": stream["tcp_flags_step"],
                }
            )
        elif protocol == "UDP":
            udp_length = stream["udp_length"] if stream["udp_length_override"] else _udp_auto_length(
                packet_bytes, l2_header_length, l3_header_length
            )
            l4_fields.update(
                {
                    "length": udp_length,
                    "length_mode": stream["udp_length_mode"],
                    "length_count": stream["udp_length_count"],
                    "length_step": stream["udp_length_step"],
                    "checksum": stream["udp_checksum"] if stream["udp_checksum_override"] else "auto",
                    "checksum_override": stream["udp_checksum_override"],
                    "checksum_mode": stream["udp_checksum_mode"],
                    "checksum_count": stream["udp_checksum_count"],
                    "checksum_step": stream["udp_checksum_step"],
                }
            )
        elif protocol == "SCTP":
            sctp_payload_length = max(
                0,
                len(packet_bytes) - l2_header_length - l3_header_length - _sctp_header_length(stream),
            )
            l4_fields.update(
                {
                    "verification_tag": stream["sctp_verification_tag"],
                    "verification_tag_mode": stream["sctp_verification_tag_mode"],
                    "verification_tag_count": stream["sctp_verification_tag_count"],
                    "verification_tag_step": stream["sctp_verification_tag_step"],
                    "checksum": stream["sctp_checksum"] if stream["sctp_checksum_override"] else "auto",
                    "checksum_override": stream["sctp_checksum_override"],
                    "chunk": "DATA",
                    "chunk_type": 0,
                    "data_flags": stream["sctp_data_flags"],
                    "data_flags_mode": stream["sctp_data_flags_mode"],
                    "data_flags_count": stream["sctp_data_flags_count"],
                    "data_flags_step": stream["sctp_data_flags_step"],
                    "chunk_length": 16 + sctp_payload_length,
                    "tsn": stream["sctp_tsn"],
                    "tsn_mode": stream["sctp_tsn_mode"],
                    "tsn_count": stream["sctp_tsn_count"],
                    "tsn_step": stream["sctp_tsn_step"],
                    "stream_id": stream["sctp_stream_id"],
                    "stream_id_mode": stream["sctp_stream_id_mode"],
                    "stream_id_count": stream["sctp_stream_id_count"],
                    "stream_id_step": stream["sctp_stream_id_step"],
                    "stream_sequence": stream["sctp_stream_sequence"],
                    "stream_sequence_mode": stream["sctp_stream_sequence_mode"],
                    "stream_sequence_count": stream["sctp_stream_sequence_count"],
                    "stream_sequence_step": stream["sctp_stream_sequence_step"],
                    "payload_protocol_id": stream["sctp_payload_protocol_id"],
                    "payload_protocol_id_mode": stream["sctp_payload_protocol_id_mode"],
                    "payload_protocol_id_count": stream["sctp_payload_protocol_id_count"],
                    "payload_protocol_id_step": stream["sctp_payload_protocol_id_step"],
                }
            )
        elif protocol == "GRE":
            l4_fields.update(
                {
                    "checksum_present": stream["gre_checksum_present"],
                    "checksum": stream["gre_checksum"] if stream["gre_checksum_override"] else "auto",
                    "checksum_override": stream["gre_checksum_override"],
                    "key_present": stream["gre_key_present"],
                    "key": stream["gre_key"],
                    "key_mode": stream["gre_key_mode"],
                    "key_count": stream["gre_key_count"],
                    "key_step": stream["gre_key_step"],
                    "sequence_present": stream["gre_sequence_present"],
                    "sequence": stream["gre_sequence"],
                    "sequence_mode": stream["gre_sequence_mode"],
                    "sequence_count": stream["gre_sequence_count"],
                    "sequence_step": stream["gre_sequence_step"],
                    "protocol_type": f"0x{stream['gre_protocol_type'].lower()}",
                }
            )
        else:
            l4_fields.update(
                {
                    "type": stream["icmp_type"],
                    "type_mode": stream["icmp_type_mode"],
                    "type_count": stream["icmp_type_count"],
                    "type_step": stream["icmp_type_step"],
                    "code": stream["icmp_code"],
                    "code_mode": stream["icmp_code_mode"],
                    "code_count": stream["icmp_code_count"],
                    "code_step": stream["icmp_code_step"],
                    "checksum": stream["icmp_checksum"] if stream["icmp_checksum_override"] else "auto",
                    "checksum_override": stream["icmp_checksum_override"],
                    "identifier": stream["icmp_identifier"],
                    "identifier_mode": stream["icmp_identifier_mode"],
                    "identifier_count": stream["icmp_identifier_count"],
                    "identifier_step": stream["icmp_identifier_step"],
                    "sequence": stream["icmp_sequence"],
                    "sequence_mode": stream["icmp_sequence_mode"],
                    "sequence_count": stream["icmp_sequence_count"],
                    "sequence_step": stream["icmp_sequence_step"],
                }
            )
            if _workbench_is_icmpv6_nd(stream):
                l4_fields.update(
                    {
                        "message": "Neighbor Solicitation" if stream["icmp_type"] == 135 else "Neighbor Advertisement",
                        "target": stream["icmpv6_nd_target"],
                        "include_link_layer_option": stream["icmpv6_nd_include_option"],
                        "option_type": "source link-layer address" if stream["icmp_type"] == 135 else "target link-layer address",
                        "option_mac": stream["icmpv6_nd_option_mac"],
                        "router": stream["icmpv6_nd_na_router"],
                        "solicited": stream["icmpv6_nd_na_solicited"],
                        "override": stream["icmpv6_nd_na_override"],
                    }
                )
            elif _workbench_is_icmpv6_rs(stream):
                l4_fields.update(
                    {
                        "message": "Router Solicitation",
                        "include_source_link_layer_option": stream["icmpv6_rs_include_slla"],
                        "option_type": "source link-layer address",
                        "source_link_layer_mac": stream["icmpv6_rs_slla_mac"],
                    }
                )
            elif _workbench_is_icmpv6_ra(stream):
                l4_fields.update(
                    {
                        "message": "Router Advertisement",
                        "current_hop_limit": stream["icmpv6_ra_cur_hop_limit"],
                        "managed": stream["icmpv6_ra_managed"],
                        "other": stream["icmpv6_ra_other"],
                        "router_lifetime": stream["icmpv6_ra_router_lifetime"],
                        "reachable_time": stream["icmpv6_ra_reachable_time"],
                        "retrans_timer": stream["icmpv6_ra_retrans_timer"],
                        "include_source_link_layer_option": stream["icmpv6_ra_include_slla"],
                        "source_link_layer_mac": stream["icmpv6_ra_slla_mac"],
                        "include_prefix": stream["icmpv6_ra_include_prefix"],
                        "prefix": stream["icmpv6_ra_prefix"],
                        "prefix_length": stream["icmpv6_ra_prefix_length"],
                        "on_link": stream["icmpv6_ra_prefix_on_link"],
                        "autonomous": stream["icmpv6_ra_prefix_autonomous"],
                        "valid_lifetime": stream["icmpv6_ra_prefix_valid_lifetime"],
                        "preferred_lifetime": stream["icmpv6_ra_prefix_preferred_lifetime"],
                    }
                )
        layers.append(
            {
                "name": protocol,
                "fields": l4_fields,
            }
        )
        if protocol == "TCP" and _tcp_options_enabled(stream):
            layers.append(
                {
                    "name": "TCP Options",
                    "fields": _tcp_options_preview_fields(stream),
                }
            )
        if protocol == "UDP" and _workbench_has_dns(stream):
            layers.append(
                {
                    "name": "Domain Name System",
                    "fields": {
                        "transaction_id": stream["dns_transaction_id"],
                        "transaction_id_mode": stream["dns_transaction_id_mode"],
                        "transaction_id_count": stream["dns_transaction_id_count"],
                        "transaction_id_step": stream["dns_transaction_id_step"],
                        "flags": f"0x{stream['dns_flags'].lower()}",
                        "flags_mode": stream["dns_flags_mode"],
                        "flags_count": stream["dns_flags_count"],
                        "flags_step": stream["dns_flags_step"],
                        "questions": 1,
                        "answers": 1 if stream["dns_answer_enabled"] else 0,
                        "query_name": stream["dns_query_name"],
                        "query_type": stream["dns_query_type"],
                        "query_type_mode": stream["dns_query_type_mode"],
                        "query_type_count": stream["dns_query_type_count"],
                        "query_type_step": stream["dns_query_type_step"],
                        "query_class": stream["dns_query_class"],
                        "query_class_mode": stream["dns_query_class_mode"],
                        "query_class_count": stream["dns_query_class_count"],
                        "query_class_step": stream["dns_query_class_step"],
                        "answer_enabled": stream["dns_answer_enabled"],
                        "answer_type": 1,
                        "answer_class": stream["dns_query_class"],
                        "answer_ttl": stream["dns_answer_ttl"],
                        "answer_ttl_mode": stream["dns_answer_ttl_mode"],
                        "answer_ttl_count": stream["dns_answer_ttl_count"],
                        "answer_ttl_step": stream["dns_answer_ttl_step"],
                        "answer_ipv4": stream["dns_answer_ipv4"],
                        "answer_ipv4_mode": stream["dns_answer_ipv4_mode"],
                        "answer_ipv4_count": stream["dns_answer_ipv4_count"],
                        "answer_ipv4_step": stream["dns_answer_ipv4_step"],
                    },
                }
            )
        if protocol == "UDP" and _workbench_has_dhcp(stream):
            layers.append(
                {
                    "name": "Dynamic Host Configuration Protocol",
                    "fields": {
                        "operation": stream["dhcp_operation"],
                        "operation_mode": stream["dhcp_operation_mode"],
                        "operation_count": stream["dhcp_operation_count"],
                        "operation_step": stream["dhcp_operation_step"],
                        "hops": stream["dhcp_hops"],
                        "hops_mode": stream["dhcp_hops_mode"],
                        "hops_count": stream["dhcp_hops_count"],
                        "hops_step": stream["dhcp_hops_step"],
                        "seconds": stream["dhcp_seconds"],
                        "seconds_mode": stream["dhcp_seconds_mode"],
                        "seconds_count": stream["dhcp_seconds_count"],
                        "seconds_step": stream["dhcp_seconds_step"],
                        "message_type": stream["dhcp_message_type"],
                        "message_type_mode": stream["dhcp_message_type_mode"],
                        "message_type_count": stream["dhcp_message_type_count"],
                        "message_type_step": stream["dhcp_message_type_step"],
                        "xid": stream["dhcp_xid"],
                        "xid_mode": stream["dhcp_xid_mode"],
                        "xid_count": stream["dhcp_xid_count"],
                        "xid_step": stream["dhcp_xid_step"],
                        "flags": f"0x{stream['dhcp_flags'].lower()}",
                        "flags_mode": stream["dhcp_flags_mode"],
                        "flags_count": stream["dhcp_flags_count"],
                        "flags_step": stream["dhcp_flags_step"],
                        "client_ip": stream["dhcp_client_ip"],
                        "client_ip_mode": stream["dhcp_client_ip_mode"],
                        "client_ip_count": stream["dhcp_client_ip_count"],
                        "client_ip_step": stream["dhcp_client_ip_step"],
                        "your_ip": stream["dhcp_your_ip"],
                        "your_ip_mode": stream["dhcp_your_ip_mode"],
                        "your_ip_count": stream["dhcp_your_ip_count"],
                        "your_ip_step": stream["dhcp_your_ip_step"],
                        "server_ip": stream["dhcp_server_ip"],
                        "server_ip_mode": stream["dhcp_server_ip_mode"],
                        "server_ip_count": stream["dhcp_server_ip_count"],
                        "server_ip_step": stream["dhcp_server_ip_step"],
                        "relay_ip": stream["dhcp_relay_ip"],
                        "relay_ip_mode": stream["dhcp_relay_ip_mode"],
                        "relay_ip_count": stream["dhcp_relay_ip_count"],
                        "relay_ip_step": stream["dhcp_relay_ip_step"],
                        "client_mac": stream["dhcp_client_mac"],
                        "client_mac_mode": stream["dhcp_client_mac_mode"],
                        "client_mac_count": stream["dhcp_client_mac_count"],
                        "client_mac_step": stream["dhcp_client_mac_step"],
                        "hostname": stream["dhcp_hostname"],
                        "parameter_request_list": stream["dhcp_parameter_request_list"],
                        "requested_ip": stream["dhcp_requested_ip"],
                        "requested_ip_mode": stream["dhcp_requested_ip_mode"],
                        "requested_ip_count": stream["dhcp_requested_ip_count"],
                        "requested_ip_step": stream["dhcp_requested_ip_step"],
                        "server_id": stream["dhcp_server_id"],
                        "server_id_mode": stream["dhcp_server_id_mode"],
                        "server_id_count": stream["dhcp_server_id_count"],
                        "server_id_step": stream["dhcp_server_id_step"],
                        "lease_time": stream["dhcp_lease_time"],
                        "lease_time_mode": stream["dhcp_lease_time_mode"],
                        "lease_time_count": stream["dhcp_lease_time_count"],
                        "lease_time_step": stream["dhcp_lease_time_step"],
                        "renewal_time": stream["dhcp_renewal_time"],
                        "renewal_time_mode": stream["dhcp_renewal_time_mode"],
                        "renewal_time_count": stream["dhcp_renewal_time_count"],
                        "renewal_time_step": stream["dhcp_renewal_time_step"],
                        "rebinding_time": stream["dhcp_rebinding_time"],
                        "rebinding_time_mode": stream["dhcp_rebinding_time_mode"],
                        "rebinding_time_count": stream["dhcp_rebinding_time_count"],
                        "rebinding_time_step": stream["dhcp_rebinding_time_step"],
                    },
                }
            )
        if protocol == "UDP" and _workbench_has_gtpu(stream):
            outer_payload_bytes = max(0, len(packet_bytes) - l2_header_length - l3_header_length - 8)
            gtpu_optional_header_length = _workbench_gtpu_optional_header_length(stream)
            gtpu_extension_header_length = _workbench_gtpu_extension_header_length(stream)
            gtpu_flags = (
                0x30
                | (0x04 if stream.get("gtpu_extension_enabled") else 0)
                | (0x02 if stream.get("gtpu_sequence_enabled") else 0)
                | (0x01 if stream.get("gtpu_npdu_enabled") else 0)
            )
            gtpu_inner_ip_version = _workbench_gtpu_inner_ip_version(stream)
            gtpu_inner_ip_length = 40 if gtpu_inner_ip_version == "IPv6" else 20
            inner_payload_bytes = max(
                0,
                outer_payload_bytes
                - 8
                - gtpu_optional_header_length
                - gtpu_extension_header_length
                - gtpu_inner_ip_length
                - 8,
            )
            gtpu_layers = [
                {
                    "name": "GPRS Tunneling Protocol User Plane",
                    "fields": {
                        "flags": f"0x{gtpu_flags:02x}",
                        "message_type": stream["gtpu_message_type"],
                        "length": max(0, outer_payload_bytes - 8),
                        "teid": stream["gtpu_teid"],
                        "teid_mode": stream["gtpu_teid_mode"],
                        "teid_count": stream["gtpu_teid_count"],
                        "teid_step": stream["gtpu_teid_step"],
                        "sequence_enabled": stream["gtpu_sequence_enabled"],
                        "sequence": stream["gtpu_sequence"],
                        "sequence_mode": stream["gtpu_sequence_mode"],
                        "sequence_count": stream["gtpu_sequence_count"],
                        "sequence_step": stream["gtpu_sequence_step"],
                        "n_pdu_enabled": stream["gtpu_npdu_enabled"],
                        "n_pdu_number": stream["gtpu_npdu"],
                        "n_pdu_mode": stream["gtpu_npdu_mode"],
                        "n_pdu_count": stream["gtpu_npdu_count"],
                        "n_pdu_step": stream["gtpu_npdu_step"],
                        "extension_enabled": stream["gtpu_extension_enabled"],
                        "next_extension_header": (
                            f"0x{PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT:02x}"
                            if stream["gtpu_extension_enabled"]
                            else "0x00"
                        ),
                        "extension_type": "UDP Port" if stream["gtpu_extension_enabled"] else "None",
                        "extension_udp_port": stream["gtpu_extension_udp_port"],
                        "extension_udp_port_mode": stream["gtpu_extension_udp_port_mode"],
                        "extension_udp_port_count": stream["gtpu_extension_udp_port_count"],
                        "extension_udp_port_step": stream["gtpu_extension_udp_port_step"],
                        "inner_ip_version": gtpu_inner_ip_version,
                    },
                }
            ]
            if gtpu_inner_ip_version == "IPv6":
                gtpu_layers.append(
                    {
                        "name": "Inner Internet Protocol v6",
                        "fields": {
                            "source": stream["gtpu_inner_ipv6_src"],
                            "source_mode": stream["gtpu_inner_ipv6_src_mode"],
                            "source_count": stream["gtpu_inner_ipv6_src_count"],
                            "source_step": stream["gtpu_inner_ipv6_src_step"],
                            "destination": stream["gtpu_inner_ipv6_dst"],
                            "destination_mode": stream["gtpu_inner_ipv6_dst_mode"],
                            "destination_count": stream["gtpu_inner_ipv6_dst_count"],
                            "destination_step": stream["gtpu_inner_ipv6_dst_step"],
                            "hop_limit": stream["gtpu_inner_ipv6_hop_limit"],
                            "hop_limit_mode": stream["gtpu_inner_ipv6_hop_limit_mode"],
                            "hop_limit_count": stream["gtpu_inner_ipv6_hop_limit_count"],
                            "hop_limit_step": stream["gtpu_inner_ipv6_hop_limit_step"],
                            "next_header": "UDP",
                        },
                    }
                )
            else:
                gtpu_layers.append(
                    {
                        "name": "Inner Internet Protocol v4",
                        "fields": {
                            "source": stream["gtpu_inner_ipv4_src"],
                            "source_mode": stream["gtpu_inner_ipv4_src_mode"],
                            "source_count": stream["gtpu_inner_ipv4_src_count"],
                            "source_step": stream["gtpu_inner_ipv4_src_step"],
                            "destination": stream["gtpu_inner_ipv4_dst"],
                            "destination_mode": stream["gtpu_inner_ipv4_dst_mode"],
                            "destination_count": stream["gtpu_inner_ipv4_dst_count"],
                            "destination_step": stream["gtpu_inner_ipv4_dst_step"],
                            "ttl": stream["gtpu_inner_ipv4_ttl"],
                            "ttl_mode": stream["gtpu_inner_ipv4_ttl_mode"],
                            "ttl_count": stream["gtpu_inner_ipv4_ttl_count"],
                            "ttl_step": stream["gtpu_inner_ipv4_ttl_step"],
                            "protocol": "UDP",
                        },
                    }
                )
            gtpu_layers.append(
                {
                    "name": "Inner UDP",
                    "fields": {
                        "source_port": stream["gtpu_inner_l4_src_port"],
                        "source_port_mode": stream["gtpu_inner_l4_src_port_mode"],
                        "source_port_count": stream["gtpu_inner_l4_src_port_count"],
                        "source_port_step": stream["gtpu_inner_l4_src_port_step"],
                        "destination_port": stream["gtpu_inner_l4_dst_port"],
                        "destination_port_mode": stream["gtpu_inner_l4_dst_port_mode"],
                        "destination_port_count": stream["gtpu_inner_l4_dst_port_count"],
                        "destination_port_step": stream["gtpu_inner_l4_dst_port_step"],
                        "length": 8 + inner_payload_bytes,
                        "checksum": "calculated" if gtpu_inner_ip_version == "IPv6" else "0x0000",
                    },
                }
            )
            layers.extend(gtpu_layers)
    if protocol == "GRE":
        gre_payload_bytes = max(0, len(packet_bytes) - l2_header_length - l3_header_length - _gre_header_length(stream))
        gre_inner_ip_version = _workbench_gre_inner_ip_version(stream)
        inner_ip_header_length = 40 if gre_inner_ip_version == "IPv6" else 20
        inner_payload_bytes = max(0, gre_payload_bytes - inner_ip_header_length - 8)
        inner_ip_layer = (
            {
                "name": "Inner Internet Protocol v6",
                "fields": {
                    "source": stream["gre_inner_ipv6_src"],
                    "source_mode": stream["gre_inner_ipv6_src_mode"],
                    "source_count": stream["gre_inner_ipv6_src_count"],
                    "source_step": stream["gre_inner_ipv6_src_step"],
                    "destination": stream["gre_inner_ipv6_dst"],
                    "destination_mode": stream["gre_inner_ipv6_dst_mode"],
                    "destination_count": stream["gre_inner_ipv6_dst_count"],
                    "destination_step": stream["gre_inner_ipv6_dst_step"],
                    "hop_limit": stream["gre_inner_ipv6_hop_limit"],
                    "hop_limit_mode": stream["gre_inner_ipv6_hop_limit_mode"],
                    "hop_limit_count": stream["gre_inner_ipv6_hop_limit_count"],
                    "hop_limit_step": stream["gre_inner_ipv6_hop_limit_step"],
                    "next_header": "UDP",
                },
            }
            if gre_inner_ip_version == "IPv6"
            else {
                "name": "Inner Internet Protocol v4",
                "fields": {
                    "source": stream["gre_inner_ipv4_src"],
                    "source_mode": stream["gre_inner_ipv4_src_mode"],
                    "source_count": stream["gre_inner_ipv4_src_count"],
                    "source_step": stream["gre_inner_ipv4_src_step"],
                    "destination": stream["gre_inner_ipv4_dst"],
                    "destination_mode": stream["gre_inner_ipv4_dst_mode"],
                    "destination_count": stream["gre_inner_ipv4_dst_count"],
                    "destination_step": stream["gre_inner_ipv4_dst_step"],
                    "ttl": stream["gre_inner_ipv4_ttl"],
                    "ttl_mode": stream["gre_inner_ipv4_ttl_mode"],
                    "ttl_count": stream["gre_inner_ipv4_ttl_count"],
                    "ttl_step": stream["gre_inner_ipv4_ttl_step"],
                    "protocol": "UDP",
                },
            }
        )
        layers.extend(
            [
                inner_ip_layer,
                {
                    "name": "Inner UDP",
                    "fields": {
                        "source_port": stream["gre_inner_l4_src_port"],
                        "source_port_mode": stream["gre_inner_l4_src_port_mode"],
                        "source_port_count": stream["gre_inner_l4_src_port_count"],
                        "source_port_step": stream["gre_inner_l4_src_port_step"],
                        "destination_port": stream["gre_inner_l4_dst_port"],
                        "destination_port_mode": stream["gre_inner_l4_dst_port_mode"],
                        "destination_port_count": stream["gre_inner_l4_dst_port_count"],
                        "destination_port_step": stream["gre_inner_l4_dst_port_step"],
                        "length": 8 + inner_payload_bytes,
                        "checksum": "calculated" if gre_inner_ip_version == "IPv6" else "0x0000",
                    },
                },
            ]
        )
    if stream.get("vxlan_enabled"):
        outer_payload_bytes = max(0, len(packet_bytes) - l2_header_length - l3_header_length - 8)
        vxlan_inner_ip_version = _workbench_vxlan_inner_ip_version(stream)
        vxlan_inner_ip_header_length = 40 if vxlan_inner_ip_version == "IPv6" else 20
        inner_payload_bytes = max(0, outer_payload_bytes - 8 - 14 - vxlan_inner_ip_header_length - 8)
        inner_ip_layer = (
            {
                "name": "Inner Internet Protocol v6",
                "fields": {
                    "source": stream["vxlan_inner_ipv6_src"],
                    "source_mode": stream["vxlan_inner_ipv6_src_mode"],
                    "source_count": stream["vxlan_inner_ipv6_src_count"],
                    "source_step": stream["vxlan_inner_ipv6_src_step"],
                    "destination": stream["vxlan_inner_ipv6_dst"],
                    "destination_mode": stream["vxlan_inner_ipv6_dst_mode"],
                    "destination_count": stream["vxlan_inner_ipv6_dst_count"],
                    "destination_step": stream["vxlan_inner_ipv6_dst_step"],
                    "hop_limit": stream["vxlan_inner_ipv6_hop_limit"],
                    "hop_limit_mode": stream["vxlan_inner_ipv6_hop_limit_mode"],
                    "hop_limit_count": stream["vxlan_inner_ipv6_hop_limit_count"],
                    "hop_limit_step": stream["vxlan_inner_ipv6_hop_limit_step"],
                    "next_header": "UDP",
                },
            }
            if vxlan_inner_ip_version == "IPv6"
            else {
                "name": "Inner Internet Protocol v4",
                "fields": {
                    "source": stream["vxlan_inner_ipv4_src"],
                    "source_mode": stream["vxlan_inner_ipv4_src_mode"],
                    "source_count": stream["vxlan_inner_ipv4_src_count"],
                    "source_step": stream["vxlan_inner_ipv4_src_step"],
                    "destination": stream["vxlan_inner_ipv4_dst"],
                    "destination_mode": stream["vxlan_inner_ipv4_dst_mode"],
                    "destination_count": stream["vxlan_inner_ipv4_dst_count"],
                    "destination_step": stream["vxlan_inner_ipv4_dst_step"],
                    "ttl": stream["vxlan_inner_ipv4_ttl"],
                    "ttl_mode": stream["vxlan_inner_ipv4_ttl_mode"],
                    "ttl_count": stream["vxlan_inner_ipv4_ttl_count"],
                    "ttl_step": stream["vxlan_inner_ipv4_ttl_step"],
                    "protocol": "UDP",
                },
            }
        )
        layers.extend(
            [
                {
                    "name": "VXLAN",
                    "fields": {
                        "flags": "0x08",
                        "vni": stream["vxlan_vni"],
                        "vni_mode": stream["vxlan_vni_mode"],
                        "vni_count": stream["vxlan_vni_count"],
                        "vni_step": stream["vxlan_vni_step"],
                    },
                },
                {
                    "name": "Inner Ethernet",
                    "fields": {
                        "destination": stream["vxlan_inner_ether_dst"],
                        "source": stream["vxlan_inner_ether_src"],
                        "type": "0x86dd" if vxlan_inner_ip_version == "IPv6" else "0x0800",
                    },
                },
                inner_ip_layer,
                {
                    "name": "Inner UDP",
                    "fields": {
                        "source_port": stream["vxlan_inner_l4_src_port"],
                        "source_port_mode": stream["vxlan_inner_l4_src_port_mode"],
                        "source_port_count": stream["vxlan_inner_l4_src_port_count"],
                        "source_port_step": stream["vxlan_inner_l4_src_port_step"],
                        "destination_port": stream["vxlan_inner_l4_dst_port"],
                        "destination_port_mode": stream["vxlan_inner_l4_dst_port_mode"],
                        "destination_port_count": stream["vxlan_inner_l4_dst_port_count"],
                        "destination_port_step": stream["vxlan_inner_l4_dst_port_step"],
                        "length": 8 + inner_payload_bytes,
                        "checksum": "calculated" if vxlan_inner_ip_version == "IPv6" else "0x0000",
                    },
                },
            ]
        )
    if _workbench_has_gtpu(stream):
        payload_bytes = max(
            0,
            len(packet_bytes)
            - l2_header_length
            - l3_header_length
            - 8
            - 8
            - _workbench_gtpu_optional_header_length(stream)
            - _workbench_gtpu_extension_header_length(stream)
            - 20
            - 8,
        )
    elif stream.get("vxlan_enabled"):
        vxlan_inner_ip_header_length = 40 if _workbench_vxlan_inner_ip_version(stream) == "IPv6" else 20
        payload_bytes = max(
            0,
            len(packet_bytes)
            - l2_header_length
            - l3_header_length
            - 8
            - 8
            - 14
            - vxlan_inner_ip_header_length
            - 8,
        )
    elif protocol == "GRE":
        payload_bytes = max(
            0,
            len(packet_bytes) - l2_header_length - l3_header_length - _gre_header_length(stream) - 20 - 8,
        )
    elif _workbench_has_arp(stream):
        payload_bytes = max(0, len(packet_bytes) - l2_header_length - 28)
    elif not has_l3:
        payload_bytes = max(0, len(packet_bytes) - l2_header_length)
    elif not has_l4:
        payload_bytes = max(0, len(packet_bytes) - l2_header_length - l3_header_length)
    else:
        if protocol == "TCP":
            l4_header_length = _tcp_header_length(stream)
        elif protocol == "GRE":
            l4_header_length = _gre_header_length(stream)
        elif protocol in {"ICMP", "ICMPv6"}:
            l4_header_length = _icmp_header_length(stream)
        else:
            l4_header_length = 8
        payload_bytes = max(
            0,
            len(packet_bytes)
            - l2_header_length
            - l3_header_length
            - l4_header_length,
        )
    layers.append(
        {
            "name": "Payload",
            "fields": {
                "bytes": payload_bytes,
                "enabled": stream["payload_enabled"],
                "type": stream["payload_type"],
                "pattern": stream["payload_pattern"],
            },
        }
    )
    return {
        "index": index + 1,
        "name": stream["name"],
        "packet_type": stream["packet_type"],
        "frame_length": stream["frame_length"],
        "wire_length": len(packet_bytes) + 4,
        "binary_base64": base64.b64encode(packet_bytes).decode("ascii"),
        "hex": packet_bytes.hex(),
        "hex_lines": _hex_dump_lines(packet_bytes),
        "layers": layers,
    }



def _ipv4_flags_text(stream: dict[str, Any]) -> str:
    enabled = []
    if stream.get("ipv4_flag_df"):
        enabled.append("DF")
    if stream.get("ipv4_flag_mf"):
        enabled.append("MF")
    return ",".join(enabled) if enabled else "-"
