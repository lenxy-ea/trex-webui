from __future__ import annotations

import base64
from typing import Any

from app.trex.workbench_packet_build import build_profile_packet as _build_profile_packet
from app.trex.workbench_packet_meta import packet_meta as _packet_meta
from app.trex.workbench_render import next_stream_name as _next_stream_name
from app.trex.workbench_layout import (
    workbench_gre_inner_checksum_instruction as _workbench_gre_inner_checksum_instruction,
    workbench_gtpu_inner_ipv4_offset as _workbench_gtpu_inner_ipv4_offset,
    workbench_ip_offset as _workbench_ip_offset,
    workbench_l2_header_length as _workbench_l2_header_length,
    workbench_vxlan_inner_ip_version as _workbench_vxlan_inner_ip_version,
    workbench_vxlan_inner_ipv4_offset as _workbench_vxlan_inner_ipv4_offset,
)
from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version as _workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version as _workbench_gtpu_inner_ip_version,
    workbench_has_arp as _workbench_has_arp,
    workbench_has_gre as _workbench_has_gre,
    workbench_has_gtpu as _workbench_has_gtpu,
    workbench_has_icmp as _workbench_has_icmp,
    workbench_has_l3 as _workbench_has_l3,
    workbench_has_l4 as _workbench_has_l4,
    workbench_has_sctp as _workbench_has_sctp,
    workbench_has_transport_ports as _workbench_has_transport_ports,
    workbench_ip_version as _workbench_ip_version,
    workbench_is_icmpv6_echo as _workbench_is_icmpv6_echo,
    workbench_l3_header_length as _workbench_l3_header_length,
    workbench_vm_cache_size as _workbench_vm_cache_size,
)
from app.trex.workbench_vm import (
    workbench_arp_ip_vm_instructions as _workbench_arp_ip_vm_instructions,
    workbench_arp_mac_vm_instructions as _workbench_arp_mac_vm_instructions,
    workbench_arp_operation_vm_instructions as _workbench_arp_operation_vm_instructions,
    workbench_dhcp_bootp_ipv4_vm_instructions as _workbench_dhcp_bootp_ipv4_vm_instructions,
    workbench_dhcp_bootp_number_vm_instructions as _workbench_dhcp_bootp_number_vm_instructions,
    workbench_dhcp_client_mac_vm_instructions as _workbench_dhcp_client_mac_vm_instructions,
    workbench_dhcp_flags_vm_instructions as _workbench_dhcp_flags_vm_instructions,
    workbench_dhcp_ipv4_option_vm_instructions as _workbench_dhcp_ipv4_option_vm_instructions,
    workbench_dhcp_message_type_vm_instructions as _workbench_dhcp_message_type_vm_instructions,
    workbench_dhcp_u32_option_vm_instructions as _workbench_dhcp_u32_option_vm_instructions,
    workbench_dhcp_xid_vm_instructions as _workbench_dhcp_xid_vm_instructions,
    workbench_dns_answer_ipv4_vm_instructions as _workbench_dns_answer_ipv4_vm_instructions,
    workbench_dns_answer_ttl_vm_instructions as _workbench_dns_answer_ttl_vm_instructions,
    workbench_dns_flags_vm_instructions as _workbench_dns_flags_vm_instructions,
    workbench_dns_question_field_vm_instructions as _workbench_dns_question_field_vm_instructions,
    workbench_dns_transaction_id_vm_instructions as _workbench_dns_transaction_id_vm_instructions,
    workbench_gre_inner_ipv4_address_vm_instructions as _workbench_gre_inner_ipv4_address_vm_instructions,
    workbench_gre_inner_ipv4_ttl_vm_instructions as _workbench_gre_inner_ipv4_ttl_vm_instructions,
    workbench_gre_inner_ipv6_address_vm_instructions as _workbench_gre_inner_ipv6_address_vm_instructions,
    workbench_gre_inner_ipv6_hop_limit_vm_instructions as _workbench_gre_inner_ipv6_hop_limit_vm_instructions,
    workbench_gre_inner_l4_port_vm_instructions as _workbench_gre_inner_l4_port_vm_instructions,
    workbench_gre_number_vm_instructions as _workbench_gre_number_vm_instructions,
    workbench_gtpu_extension_udp_port_vm_instructions as _workbench_gtpu_extension_udp_port_vm_instructions,
    workbench_gtpu_inner_ipv4_address_vm_instructions as _workbench_gtpu_inner_ipv4_address_vm_instructions,
    workbench_gtpu_inner_ipv4_ttl_vm_instructions as _workbench_gtpu_inner_ipv4_ttl_vm_instructions,
    workbench_gtpu_inner_ipv6_address_vm_instructions as _workbench_gtpu_inner_ipv6_address_vm_instructions,
    workbench_gtpu_inner_ipv6_hop_limit_vm_instructions as _workbench_gtpu_inner_ipv6_hop_limit_vm_instructions,
    workbench_gtpu_inner_l4_port_vm_instructions as _workbench_gtpu_inner_l4_port_vm_instructions,
    workbench_gtpu_npdu_vm_instructions as _workbench_gtpu_npdu_vm_instructions,
    workbench_gtpu_sequence_vm_instructions as _workbench_gtpu_sequence_vm_instructions,
    workbench_gtpu_teid_vm_instructions as _workbench_gtpu_teid_vm_instructions,
    workbench_icmp_number_vm_instructions as _workbench_icmp_number_vm_instructions,
    workbench_ipv4_address_vm_instructions as _workbench_ipv4_address_vm_instructions,
    workbench_ipv4_dscp_vm_instructions as _workbench_ipv4_dscp_vm_instructions,
    workbench_ipv4_ecn_vm_instructions as _workbench_ipv4_ecn_vm_instructions,
    workbench_ipv4_fragment_offset_vm_instructions as _workbench_ipv4_fragment_offset_vm_instructions,
    workbench_ipv4_id_vm_instructions as _workbench_ipv4_id_vm_instructions,
    workbench_ipv4_ttl_vm_instructions as _workbench_ipv4_ttl_vm_instructions,
    workbench_ipv6_address_vm_instructions as _workbench_ipv6_address_vm_instructions,
    workbench_ipv6_flow_label_vm_instructions as _workbench_ipv6_flow_label_vm_instructions,
    workbench_ipv6_hop_limit_vm_instructions as _workbench_ipv6_hop_limit_vm_instructions,
    workbench_ipv6_traffic_class_vm_instructions as _workbench_ipv6_traffic_class_vm_instructions,
    workbench_l4_port_vm_instructions as _workbench_l4_port_vm_instructions,
    workbench_mac_address_vm_instructions as _workbench_mac_address_vm_instructions,
    workbench_mpls_label_vm_instructions as _workbench_mpls_label_vm_instructions,
    workbench_mpls_tc_vm_instructions as _workbench_mpls_tc_vm_instructions,
    workbench_mpls_ttl_vm_instructions as _workbench_mpls_ttl_vm_instructions,
    workbench_packet_length_vm_instructions as _workbench_packet_length_vm_instructions,
    workbench_sctp_number_vm_instructions as _workbench_sctp_number_vm_instructions,
    workbench_tcp_checksum_vm_instructions as _workbench_tcp_checksum_vm_instructions,
    workbench_tcp_flags_vm_instructions as _workbench_tcp_flags_vm_instructions,
    workbench_tcp_number_vm_instructions as _workbench_tcp_number_vm_instructions,
    workbench_tcp_option_mss_vm_instructions as _workbench_tcp_option_mss_vm_instructions,
    workbench_tcp_option_sack_vm_instructions as _workbench_tcp_option_sack_vm_instructions,
    workbench_tcp_option_timestamp_vm_instructions as _workbench_tcp_option_timestamp_vm_instructions,
    workbench_tcp_option_window_scale_vm_instructions as _workbench_tcp_option_window_scale_vm_instructions,
    workbench_tcp_urgent_pointer_vm_instructions as _workbench_tcp_urgent_pointer_vm_instructions,
    workbench_tcp_window_vm_instructions as _workbench_tcp_window_vm_instructions,
    workbench_udp_checksum_vm_instructions as _workbench_udp_checksum_vm_instructions,
    workbench_udp_length_vm_instructions as _workbench_udp_length_vm_instructions,
    workbench_vlan_id_vm_instructions as _workbench_vlan_id_vm_instructions,
    workbench_vlan_priority_vm_instructions as _workbench_vlan_priority_vm_instructions,
    workbench_vxlan_inner_ipv4_address_vm_instructions as _workbench_vxlan_inner_ipv4_address_vm_instructions,
    workbench_vxlan_inner_ipv4_ttl_vm_instructions as _workbench_vxlan_inner_ipv4_ttl_vm_instructions,
    workbench_vxlan_inner_ipv6_address_vm_instructions as _workbench_vxlan_inner_ipv6_address_vm_instructions,
    workbench_vxlan_inner_ipv6_hop_limit_vm_instructions as _workbench_vxlan_inner_ipv6_hop_limit_vm_instructions,
    workbench_vxlan_inner_l4_port_vm_instructions as _workbench_vxlan_inner_l4_port_vm_instructions,
    workbench_vxlan_vni_vm_instructions as _workbench_vxlan_vni_vm_instructions,
)

def gui_stream_entry(stream: dict[str, Any], index: int, streams: list[dict[str, Any]]) -> dict[str, Any]:
    packet_bytes = _build_profile_packet(stream)
    packet_binary = base64.b64encode(packet_bytes).decode("ascii")
    next_stream = _next_stream_name(stream, streams) if stream["mode"] != "continuous" else "-1"
    advanced_mode = stream.get("advanced_mode") is True
    vm_body = _advanced_vm_body(stream) if advanced_mode else _workbench_vm_body(stream)
    packet_meta = (
        stream.get("packet_meta_base64")
        if advanced_mode and isinstance(stream.get("packet_meta_base64"), str)
        else _packet_meta(stream, packet_binary)
    )
    entry = {
        "name": stream["name"],
        "stream": {
            "action_count": stream["action_count"] if next_stream != "-1" else 0,
            "enabled": stream["enabled"],
            "flags": 0,
            "flow_stats": {
                "enabled": stream["flow_stats_enabled"],
                "rule_type": "latency" if stream["latency_enabled"] else "stats",
                "stream_id": stream["pg_id"],
            },
            "isg": stream["isg"],
            "mode": {
                "rate": {"type": stream["rate_type"], "value": stream["rate_value"]},
                "type": stream["mode"],
                "total_pkts": stream["total_pkts"],
                "pkts_per_burst": stream["pkts_per_burst"],
                "ibg": stream["ibg"],
                "count": stream["count"],
            },
            "packet": {
                "binary": packet_binary,
                "meta": packet_meta,
                "model": stream.get("packet_model") if advanced_mode and isinstance(stream.get("packet_model"), str) else "",
            },
            "self_start": stream["self_start"],
            "advanced_mode": advanced_mode,
            "vm": vm_body,
        },
        "stream_id": index,
    }
    if next_stream != "-1":
        entry["next"] = next_stream
    return entry

def _advanced_vm_body(stream: dict[str, Any]) -> dict[str, Any]:
    advanced_vm = stream.get("advanced_vm")
    if isinstance(advanced_vm, dict):
        return advanced_vm
    return {
        "instructions": [],
        "split_by_var": "",
    }

def _workbench_vm_body(stream: dict[str, Any]) -> dict[str, Any]:
    instructions: list[dict[str, Any]] = []
    terminal_checksum_instructions: list[dict[str, Any]] = []
    split_by_var = ""
    checksum_required = False
    vxlan_inner_checksum_required = False
    gtpu_inner_checksum_required = False
    gre_inner_checksum_required = False

    for field in ("dst", "src"):
        address_instructions, variable_name = _workbench_mac_address_vm_instructions(stream, field)
        if address_instructions:
            instructions.extend(address_instructions)
            split_by_var = variable_name

    for vlan_index in (1, 2):
        for vlan_builder in (_workbench_vlan_priority_vm_instructions, _workbench_vlan_id_vm_instructions):
            vlan_instructions, variable_name = vlan_builder(stream, vlan_index)
            if vlan_instructions:
                instructions.extend(vlan_instructions)
                if vlan_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    for mpls_index in (1, 2, 3):
        for mpls_builder in (
            _workbench_mpls_label_vm_instructions,
            _workbench_mpls_tc_vm_instructions,
            _workbench_mpls_ttl_vm_instructions,
        ):
            mpls_instructions, variable_name = mpls_builder(stream, mpls_index)
            if mpls_instructions:
                instructions.extend(mpls_instructions)
                if mpls_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    vxlan_vni_instructions, variable_name = _workbench_vxlan_vni_vm_instructions(stream)
    if vxlan_vni_instructions:
        instructions.extend(vxlan_vni_instructions)
        if vxlan_vni_instructions[0]["op"] != "random":
            split_by_var = variable_name
    if stream.get("vxlan_enabled"):
        if _workbench_vxlan_inner_ip_version(stream) == "IPv4":
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_vxlan_inner_ipv4_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    vxlan_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_ttl_instructions, variable_name = _workbench_vxlan_inner_ipv4_ttl_vm_instructions(stream)
            if inner_ttl_instructions:
                instructions.extend(inner_ttl_instructions)
                vxlan_inner_checksum_required = True
                if inner_ttl_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        else:
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_vxlan_inner_ipv6_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    vxlan_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_hop_limit_instructions, variable_name = _workbench_vxlan_inner_ipv6_hop_limit_vm_instructions(stream)
            if inner_hop_limit_instructions:
                instructions.extend(inner_hop_limit_instructions)
                if inner_hop_limit_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        for field in ("dst", "src"):
            inner_port_instructions, variable_name = _workbench_vxlan_inner_l4_port_vm_instructions(stream, field)
            if inner_port_instructions:
                instructions.extend(inner_port_instructions)
                vxlan_inner_checksum_required = True
                if inner_port_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    gtpu_teid_instructions, variable_name = _workbench_gtpu_teid_vm_instructions(stream)
    if gtpu_teid_instructions:
        instructions.extend(gtpu_teid_instructions)
        if gtpu_teid_instructions[0]["op"] != "random":
            split_by_var = variable_name
    if _workbench_has_gtpu(stream):
        for field_builder in (
            _workbench_gtpu_sequence_vm_instructions,
            _workbench_gtpu_npdu_vm_instructions,
            _workbench_gtpu_extension_udp_port_vm_instructions,
        ):
            gtpu_optional_instructions, variable_name = field_builder(stream)
            if gtpu_optional_instructions:
                instructions.extend(gtpu_optional_instructions)
                if gtpu_optional_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        if _workbench_gtpu_inner_ip_version(stream) == "IPv4":
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_gtpu_inner_ipv4_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    gtpu_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_ttl_instructions, variable_name = _workbench_gtpu_inner_ipv4_ttl_vm_instructions(stream)
            if inner_ttl_instructions:
                instructions.extend(inner_ttl_instructions)
                gtpu_inner_checksum_required = True
                if inner_ttl_instructions[0]["op"] != "random":
                    split_by_var = variable_name
            for field in ("dst", "src"):
                inner_port_instructions, variable_name = _workbench_gtpu_inner_l4_port_vm_instructions(stream, field)
                if inner_port_instructions:
                    instructions.extend(inner_port_instructions)
                    gtpu_inner_checksum_required = True
                    if inner_port_instructions[0]["op"] != "random":
                        split_by_var = variable_name
        else:
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_gtpu_inner_ipv6_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    gtpu_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_hop_limit_instructions, variable_name = _workbench_gtpu_inner_ipv6_hop_limit_vm_instructions(stream)
            if inner_hop_limit_instructions:
                instructions.extend(inner_hop_limit_instructions)
                if inner_hop_limit_instructions[0]["op"] != "random":
                    split_by_var = variable_name
            for field in ("dst", "src"):
                inner_port_instructions, variable_name = _workbench_gtpu_inner_l4_port_vm_instructions(stream, field)
                if inner_port_instructions:
                    instructions.extend(inner_port_instructions)
                    gtpu_inner_checksum_required = True
                    if inner_port_instructions[0]["op"] != "random":
                        split_by_var = variable_name

    if _workbench_has_gre(stream):
        for field in ("key", "sequence"):
            gre_instructions, variable_name = _workbench_gre_number_vm_instructions(stream, field)
            if gre_instructions:
                instructions.extend(gre_instructions)
                if gre_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        if _workbench_gre_inner_ip_version(stream) == "IPv4":
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_gre_inner_ipv4_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    gre_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_ttl_instructions, variable_name = _workbench_gre_inner_ipv4_ttl_vm_instructions(stream)
            if inner_ttl_instructions:
                instructions.extend(inner_ttl_instructions)
                gre_inner_checksum_required = True
                if inner_ttl_instructions[0]["op"] != "random":
                    split_by_var = variable_name
            for field in ("dst", "src"):
                inner_port_instructions, variable_name = _workbench_gre_inner_l4_port_vm_instructions(stream, field)
                if inner_port_instructions:
                    instructions.extend(inner_port_instructions)
                    gre_inner_checksum_required = True
                    if inner_port_instructions[0]["op"] != "random":
                        split_by_var = variable_name
        else:
            for field in ("dst", "src"):
                inner_ip_instructions, variable_name = _workbench_gre_inner_ipv6_address_vm_instructions(stream, field)
                if inner_ip_instructions:
                    instructions.extend(inner_ip_instructions)
                    gre_inner_checksum_required = True
                    if inner_ip_instructions[0]["op"] != "random":
                        split_by_var = variable_name
            inner_hop_limit_instructions, variable_name = _workbench_gre_inner_ipv6_hop_limit_vm_instructions(stream)
            if inner_hop_limit_instructions:
                instructions.extend(inner_hop_limit_instructions)
                if inner_hop_limit_instructions[0]["op"] != "random":
                    split_by_var = variable_name
            for field in ("dst", "src"):
                inner_port_instructions, variable_name = _workbench_gre_inner_l4_port_vm_instructions(stream, field)
                if inner_port_instructions:
                    instructions.extend(inner_port_instructions)
                    gre_inner_checksum_required = True
                    if inner_port_instructions[0]["op"] != "random":
                        split_by_var = variable_name

    if _workbench_has_arp(stream):
        arp_operation_instructions, variable_name = _workbench_arp_operation_vm_instructions(stream)
        if arp_operation_instructions:
            instructions.extend(arp_operation_instructions)
            if arp_operation_instructions[0]["op"] != "random":
                split_by_var = variable_name
        for field in ("target", "sender"):
            arp_instructions, variable_name = _workbench_arp_ip_vm_instructions(stream, field)
            if arp_instructions:
                instructions.extend(arp_instructions)
                if arp_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        for field in ("target", "sender"):
            arp_instructions, variable_name = _workbench_arp_mac_vm_instructions(stream, field)
            if arp_instructions:
                instructions.extend(arp_instructions)
                if arp_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    if _workbench_has_l3(stream) and _workbench_ip_version(stream) == 4:
        for field in ("dst", "src"):
            address_instructions, variable_name = _workbench_ipv4_address_vm_instructions(stream, field)
            if address_instructions:
                instructions.extend(address_instructions)
                checksum_required = True
                if address_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        ipv4_dscp_instructions, variable_name = _workbench_ipv4_dscp_vm_instructions(stream)
        if ipv4_dscp_instructions:
            instructions.extend(ipv4_dscp_instructions)
            checksum_required = True
            if ipv4_dscp_instructions[0]["op"] != "random":
                split_by_var = variable_name
        ipv4_ecn_instructions, variable_name = _workbench_ipv4_ecn_vm_instructions(stream)
        if ipv4_ecn_instructions:
            instructions.extend(ipv4_ecn_instructions)
            checksum_required = True
            if ipv4_ecn_instructions[0]["op"] != "random":
                split_by_var = variable_name
        ipv4_id_instructions, variable_name = _workbench_ipv4_id_vm_instructions(stream)
        if ipv4_id_instructions:
            instructions.extend(ipv4_id_instructions)
            checksum_required = True
            if ipv4_id_instructions[0]["op"] != "random":
                split_by_var = variable_name
        ipv4_fragment_offset_instructions, variable_name = _workbench_ipv4_fragment_offset_vm_instructions(stream)
        if ipv4_fragment_offset_instructions:
            instructions.extend(ipv4_fragment_offset_instructions)
            checksum_required = True
            if ipv4_fragment_offset_instructions[0]["op"] != "random":
                split_by_var = variable_name
        ipv4_ttl_instructions, variable_name = _workbench_ipv4_ttl_vm_instructions(stream)
        if ipv4_ttl_instructions:
            instructions.extend(ipv4_ttl_instructions)
            checksum_required = True
            if ipv4_ttl_instructions[0]["op"] != "random":
                split_by_var = variable_name
    elif _workbench_has_l3(stream):
        for field in ("dst", "src"):
            address_instructions, variable_name = _workbench_ipv6_address_vm_instructions(stream, field)
            if address_instructions:
                instructions.extend(address_instructions)
                checksum_required = True
                if address_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        traffic_class_instructions, variable_name = _workbench_ipv6_traffic_class_vm_instructions(stream)
        if traffic_class_instructions:
            instructions.extend(traffic_class_instructions)
            if traffic_class_instructions[0]["op"] != "random":
                split_by_var = variable_name
        flow_label_instructions, variable_name = _workbench_ipv6_flow_label_vm_instructions(stream)
        if flow_label_instructions:
            instructions.extend(flow_label_instructions)
            if flow_label_instructions[0]["op"] != "random":
                split_by_var = variable_name
        hop_limit_instructions, variable_name = _workbench_ipv6_hop_limit_vm_instructions(stream)
        if hop_limit_instructions:
            instructions.extend(hop_limit_instructions)
            if hop_limit_instructions[0]["op"] != "random":
                split_by_var = variable_name

    if _workbench_has_transport_ports(stream):
        for field in ("dst", "src"):
            port_instructions, variable_name = _workbench_l4_port_vm_instructions(stream, field)
            if port_instructions:
                instructions.extend(port_instructions)
                if not _workbench_has_sctp(stream):
                    checksum_required = _workbench_has_l3(stream)
                if port_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    if stream["packet_type"].endswith("/UDP"):
        for dns_instructions, variable_name in (
            _workbench_dns_transaction_id_vm_instructions(stream),
            _workbench_dns_flags_vm_instructions(stream),
            _workbench_dns_question_field_vm_instructions(stream, "query_type"),
            _workbench_dns_question_field_vm_instructions(stream, "query_class"),
            _workbench_dns_answer_ttl_vm_instructions(stream),
            _workbench_dns_answer_ipv4_vm_instructions(stream),
        ):
            if not dns_instructions:
                continue
            instructions.extend(dns_instructions)
            checksum_required = _workbench_has_l3(stream)
            if dns_instructions[0]["op"] != "random":
                split_by_var = variable_name
        for field, payload_offset, size in (
            ("operation", 0, 1),
            ("hops", 3, 1),
            ("seconds", 8, 2),
        ):
            dhcp_bootp_number_instructions, variable_name = _workbench_dhcp_bootp_number_vm_instructions(
                stream, field, payload_offset=payload_offset, size=size
            )
            if dhcp_bootp_number_instructions:
                instructions.extend(dhcp_bootp_number_instructions)
                checksum_required = _workbench_has_l3(stream)
                if dhcp_bootp_number_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        dhcp_xid_instructions, variable_name = _workbench_dhcp_xid_vm_instructions(stream)
        if dhcp_xid_instructions:
            instructions.extend(dhcp_xid_instructions)
            checksum_required = _workbench_has_l3(stream)
            if dhcp_xid_instructions[0]["op"] != "random":
                split_by_var = variable_name
        dhcp_message_type_instructions, variable_name = _workbench_dhcp_message_type_vm_instructions(stream)
        if dhcp_message_type_instructions:
            instructions.extend(dhcp_message_type_instructions)
            checksum_required = _workbench_has_l3(stream)
            if dhcp_message_type_instructions[0]["op"] != "random":
                split_by_var = variable_name
        dhcp_flags_instructions, variable_name = _workbench_dhcp_flags_vm_instructions(stream)
        if dhcp_flags_instructions:
            instructions.extend(dhcp_flags_instructions)
            checksum_required = _workbench_has_l3(stream)
            if dhcp_flags_instructions[0]["op"] != "random":
                split_by_var = variable_name
        dhcp_client_mac_instructions, variable_name = _workbench_dhcp_client_mac_vm_instructions(stream)
        if dhcp_client_mac_instructions:
            instructions.extend(dhcp_client_mac_instructions)
            checksum_required = _workbench_has_l3(stream)
            if dhcp_client_mac_instructions[0]["op"] != "random":
                split_by_var = variable_name
        for field in ("client_ip", "your_ip", "server_ip", "relay_ip"):
            dhcp_bootp_ip_instructions, variable_name = _workbench_dhcp_bootp_ipv4_vm_instructions(stream, field)
            if dhcp_bootp_ip_instructions:
                instructions.extend(dhcp_bootp_ip_instructions)
                checksum_required = _workbench_has_l3(stream)
                if dhcp_bootp_ip_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        for field in ("requested_ip", "server_id"):
            dhcp_ip_option_instructions, variable_name = _workbench_dhcp_ipv4_option_vm_instructions(stream, field)
            if dhcp_ip_option_instructions:
                instructions.extend(dhcp_ip_option_instructions)
                checksum_required = _workbench_has_l3(stream)
                if dhcp_ip_option_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        for field in ("lease_time", "renewal_time", "rebinding_time"):
            dhcp_u32_option_instructions, variable_name = _workbench_dhcp_u32_option_vm_instructions(stream, field)
            if dhcp_u32_option_instructions:
                instructions.extend(dhcp_u32_option_instructions)
                checksum_required = _workbench_has_l3(stream)
                if dhcp_u32_option_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        udp_length_instructions, variable_name = _workbench_udp_length_vm_instructions(stream)
        if udp_length_instructions:
            instructions.extend(udp_length_instructions)
            checksum_required = _workbench_has_l3(stream)
            if udp_length_instructions[0]["op"] != "random":
                split_by_var = variable_name
        udp_checksum_instructions, variable_name = _workbench_udp_checksum_vm_instructions(stream)
        if udp_checksum_instructions:
            terminal_checksum_instructions.extend(udp_checksum_instructions)
            if udp_checksum_instructions[0]["op"] != "random":
                split_by_var = variable_name

    if stream["packet_type"].endswith("/TCP"):
        for field in ("ack", "sequence"):
            tcp_instructions, variable_name = _workbench_tcp_number_vm_instructions(stream, field)
            if tcp_instructions:
                instructions.extend(tcp_instructions)
                checksum_required = _workbench_has_l3(stream)
                if tcp_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        tcp_window_instructions, variable_name = _workbench_tcp_window_vm_instructions(stream)
        if tcp_window_instructions:
            instructions.extend(tcp_window_instructions)
            checksum_required = _workbench_has_l3(stream)
            if tcp_window_instructions[0]["op"] != "random":
                split_by_var = variable_name
        tcp_urgent_pointer_instructions, variable_name = _workbench_tcp_urgent_pointer_vm_instructions(stream)
        if tcp_urgent_pointer_instructions:
            instructions.extend(tcp_urgent_pointer_instructions)
            checksum_required = _workbench_has_l3(stream)
            if tcp_urgent_pointer_instructions[0]["op"] != "random":
                split_by_var = variable_name
        tcp_flags_instructions, variable_name = _workbench_tcp_flags_vm_instructions(stream)
        if tcp_flags_instructions:
            instructions.extend(tcp_flags_instructions)
            checksum_required = _workbench_has_l3(stream)
            if tcp_flags_instructions[0]["op"] != "random":
                split_by_var = variable_name
        tcp_mss_instructions, variable_name = _workbench_tcp_option_mss_vm_instructions(stream)
        if tcp_mss_instructions:
            instructions.extend(tcp_mss_instructions)
            checksum_required = _workbench_has_l3(stream)
            if tcp_mss_instructions[0]["op"] != "random":
                split_by_var = variable_name
        for field in ("left_edge", "right_edge"):
            tcp_sack_instructions, variable_name = _workbench_tcp_option_sack_vm_instructions(stream, field)
            if tcp_sack_instructions:
                instructions.extend(tcp_sack_instructions)
                checksum_required = _workbench_has_l3(stream)
                if tcp_sack_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        for field in ("value", "echo"):
            tcp_timestamp_instructions, variable_name = _workbench_tcp_option_timestamp_vm_instructions(stream, field)
            if tcp_timestamp_instructions:
                instructions.extend(tcp_timestamp_instructions)
                checksum_required = _workbench_has_l3(stream)
                if tcp_timestamp_instructions[0]["op"] != "random":
                    split_by_var = variable_name
        tcp_window_scale_instructions, variable_name = _workbench_tcp_option_window_scale_vm_instructions(stream)
        if tcp_window_scale_instructions:
            instructions.extend(tcp_window_scale_instructions)
            checksum_required = _workbench_has_l3(stream)
            if tcp_window_scale_instructions[0]["op"] != "random":
                split_by_var = variable_name
        tcp_checksum_instructions, variable_name = _workbench_tcp_checksum_vm_instructions(stream)
        if tcp_checksum_instructions:
            terminal_checksum_instructions.extend(tcp_checksum_instructions)
            if tcp_checksum_instructions[0]["op"] != "random":
                split_by_var = variable_name

    if _workbench_has_sctp(stream):
        for field in ("verification_tag", "data_flags", "tsn", "stream_id", "stream_sequence", "payload_protocol_id"):
            sctp_instructions, variable_name = _workbench_sctp_number_vm_instructions(stream, field)
            if sctp_instructions:
                instructions.extend(sctp_instructions)
                if sctp_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    if _workbench_is_icmpv6_echo(stream):
        for field in ("type", "code"):
            icmp_instructions, variable_name = _workbench_icmp_number_vm_instructions(stream, field)
            if icmp_instructions:
                instructions.extend(icmp_instructions)
                checksum_required = True
                if icmp_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    if _workbench_is_icmpv6_echo(stream):
        for field in ("identifier", "sequence"):
            icmp_instructions, variable_name = _workbench_icmp_number_vm_instructions(stream, field)
            if icmp_instructions:
                instructions.extend(icmp_instructions)
                checksum_required = True
                if icmp_instructions[0]["op"] != "random":
                    split_by_var = variable_name

    packet_length_instructions = _workbench_packet_length_vm_instructions(stream)
    if packet_length_instructions:
        instructions.extend(packet_length_instructions)
        checksum_required = _workbench_has_l3(stream)

    if checksum_required:
        checksum_instruction = _workbench_checksum_instruction(stream)
        if checksum_instruction:
            instructions.append(checksum_instruction)
    if vxlan_inner_checksum_required:
        instructions.append(_workbench_vxlan_inner_checksum_instruction(stream))
    if gtpu_inner_checksum_required:
        instructions.append(_workbench_gtpu_inner_checksum_instruction(stream))
    if gre_inner_checksum_required:
        instructions.append(_workbench_gre_inner_checksum_instruction(stream))
    instructions.extend(terminal_checksum_instructions)

    return {
        "split_by_var": split_by_var,
        "instructions": instructions,
        "cache_size": _workbench_vm_cache_size(stream),
    }


def _workbench_checksum_instruction(stream: dict[str, Any]) -> dict[str, Any] | None:
    if not _workbench_has_l4(stream):
        if _workbench_has_l3(stream) and _workbench_ip_version(stream) == 4:
            return {"pkt_offset": _workbench_ip_offset(stream), "type": "fix_checksum_ipv4"}
        return None
    if _workbench_has_gre(stream):
        if _workbench_ip_version(stream) == 4:
            return {"pkt_offset": _workbench_ip_offset(stream), "type": "fix_checksum_ipv4"}
        return None
    if _workbench_has_icmp(stream):
        if _workbench_ip_version(stream) == 4:
            return {"pkt_offset": _workbench_ip_offset(stream), "type": "fix_checksum_ipv4"}
        return {
            "l2_len": _workbench_l2_header_length(stream),
            "l3_len": _workbench_l3_header_length(stream),
            "type": "fix_checksum_icmpv6",
        }
    if _workbench_has_sctp(stream):
        if _workbench_ip_version(stream) == 4:
            return {"pkt_offset": _workbench_ip_offset(stream), "type": "fix_checksum_ipv4"}
        return None

    l2_length = _workbench_l2_header_length(stream)
    return {
        "l2_len": l2_length,
        "l3_len": _workbench_l3_header_length(stream),
        "l4_type": 13 if stream["packet_type"].endswith("/TCP") else 11,
        "type": "fix_checksum_hw",
    }


def _workbench_gtpu_inner_checksum_instruction(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "l2_len": _workbench_gtpu_inner_ipv4_offset(stream),
        "l3_len": 40 if _workbench_gtpu_inner_ip_version(stream) == "IPv6" else 20,
        "l4_type": 11,
        "type": "fix_checksum_hw",
    }


def _workbench_vxlan_inner_checksum_instruction(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "l2_len": _workbench_vxlan_inner_ipv4_offset(stream),
        "l3_len": 40 if _workbench_vxlan_inner_ip_version(stream) == "IPv6" else 20,
        "l4_type": 11,
        "type": "fix_checksum_hw",
    }
