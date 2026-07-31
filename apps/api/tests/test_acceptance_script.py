from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "trex_real_acceptance.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("trex_real_acceptance", SCRIPT_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


acceptance = load_script_module()


def test_api_url_accepts_root_and_api_base_url() -> None:
    assert acceptance.api_url("http://127.0.0.1", "/api/health") == "http://127.0.0.1/api/health"
    assert acceptance.api_url("http://127.0.0.1/api", "/api/health") == "http://127.0.0.1/api/health"


def test_parse_tunables_requires_key_value_pairs() -> None:
    assert acceptance.parse_tunables(["src=16.0.0.1", "dst=48.0.0.1"]) == {
        "src": "16.0.0.1",
        "dst": "48.0.0.1",
    }

    with pytest.raises(acceptance.AcceptanceError):
        acceptance.parse_tunables(["src"])


def test_required_traffic_session_id_requires_exact_persisted_identity() -> None:
    assert (
        acceptance.required_traffic_session_id(
            {"data": {"session": {"id": "session-123"}}},
            "traffic start",
        )
        == "session-123"
    )

    for payload in (
        {},
        {"data": {}},
        {"data": {"session": {}}},
        {"data": {"session": {"id": ""}}},
    ):
        with pytest.raises(acceptance.AcceptanceError):
            acceptance.required_traffic_session_id(payload, "traffic start")


def test_load_workbench_streams_accepts_list_or_document(tmp_path: Path) -> None:
    list_file = tmp_path / "streams-list.json"
    list_file.write_text('[{"name":"stream-1","packet_type":"Ethernet/IPv4/UDP"}]', encoding="utf-8")
    document_file = tmp_path / "streams-document.json"
    document_file.write_text('{"streams":[{"name":"stream-2","packet_type":"Ethernet/IPv4/UDP"}]}', encoding="utf-8")

    assert acceptance.load_workbench_streams(str(list_file)) == [
        {"name": "stream-1", "packet_type": "Ethernet/IPv4/UDP"}
    ]
    assert acceptance.load_workbench_streams(str(document_file)) == [
        {"name": "stream-2", "packet_type": "Ethernet/IPv4/UDP"}
    ]

    invalid_file = tmp_path / "invalid.json"
    invalid_file.write_text('{"streams":[]}', encoding="utf-8")
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.load_workbench_streams(str(invalid_file))


def test_parse_workbench_streams_json_accepts_inline_document() -> None:
    assert acceptance.parse_workbench_streams_json('{"streams":[{"name":"stream-1"}]}') == [{"name": "stream-1"}]

    with pytest.raises(acceptance.AcceptanceError):
        acceptance.parse_workbench_streams_json("{bad-json")


def test_infer_capture_bpf_filter_from_expected_layer_chain() -> None:
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4", []) == "ip"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv6", []) == "ip6"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > UDP", []) == "udp"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > TCP", []) == "tcp"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > ICMP", []) == "icmp"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv6 > ICMPv6", []) == "icmp6"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > GRE > IPv4 > UDP", []) == "proto gre"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > GRE > IPv6 > UDP", []) == "proto gre"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv6 > GRE > IPv4 > UDP", []) == "ip6 proto 47"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv4 > SCTP", []) == "ip proto 132"
    assert acceptance.infer_capture_bpf_filter("Ethernet > IPv6 > SCTP", []) == "ip6 proto 132"
    assert acceptance.infer_capture_bpf_filter("Ethernet > ARP", []) == "arp"


def test_infer_capture_bpf_filter_uses_profile_field_evidence_for_link_encapsulation() -> None:
    assert (
        acceptance.infer_capture_bpf_filter(
            "Ethernet > IPv4 > UDP",
            [{"field_expectations": [{"field": "802.1Q VLAN[2].VLAN ID"}]}],
        )
        == ""
    )
    assert (
        acceptance.infer_capture_bpf_filter(
            "Ethernet > IPv4 > UDP",
            [{"field_expectations": [{"field": "MPLS[3].TTL"}]}],
        )
        == ""
    )


def test_workbench_stream_intent_rows_capture_expected_layer_chains() -> None:
    streams = [
        {"name": "udp", "packet_type": "Ethernet/IPv4/UDP", "rate_value": 1000, "rate_type": "pps"},
        {
            "name": "gtpu",
            "packet_type": "Ethernet/IPv4/UDP",
            "frame_length_type": "Fixed",
            "frame_length": 64,
            "src_ipv4": "16.0.0.1",
            "dst_ipv4": "48.0.0.1",
            "ipv4_ttl": 64,
            "gtpu_enabled": True,
            "gtpu_extension_enabled": True,
            "gtpu_sequence_enabled": True,
            "gtpu_sequence": 7,
            "gtpu_sequence_mode": "Increment",
            "gtpu_sequence_count": 4,
            "gtpu_sequence_step": 1,
            "gtpu_npdu_enabled": True,
            "gtpu_npdu": 3,
            "gtpu_npdu_mode": "Increment",
            "gtpu_npdu_count": 4,
            "gtpu_npdu_step": 1,
            "gtpu_extension_udp_port": 65000,
            "gtpu_extension_udp_port_mode": "Increment",
            "gtpu_extension_udp_port_count": 4,
            "gtpu_extension_udp_port_step": 1,
            "gtpu_inner_ip_version": "IPv6",
            "gtpu_inner_ipv6_src_mode": "Increment Host",
            "gtpu_inner_ipv6_src_count": 4,
            "gtpu_inner_ipv6_src_step": 1,
        },
        {
            "name": "gre",
            "packet_type": "Ethernet/IPv4/GRE",
            "frame_length_type": "Fixed",
            "frame_length": 64,
            "src_ipv4": "16.0.0.1",
            "dst_ipv4": "48.0.0.1",
            "ipv4_ttl": 64,
            "gre_key_present": True,
            "gre_key": 0x12345678,
            "gre_key_mode": "Increment",
            "gre_key_count": 4,
            "gre_key_step": 1,
            "gre_sequence_present": True,
            "gre_sequence": 7,
            "gre_sequence_mode": "Increment",
            "gre_sequence_count": 4,
            "gre_sequence_step": 1,
            "gre_inner_ipv4_src": "10.2.0.10",
            "gre_inner_ipv4_src_mode": "Increment Host",
            "gre_inner_ipv4_src_count": 4,
            "gre_inner_ipv4_src_step": 1,
            "gre_inner_ipv4_dst": "10.2.0.20",
            "gre_inner_ipv4_dst_mode": "Increment Host",
            "gre_inner_ipv4_dst_count": 4,
            "gre_inner_ipv4_dst_step": 1,
            "gre_inner_ipv4_ttl": 40,
            "gre_inner_ipv4_ttl_mode": "Increment",
            "gre_inner_ipv4_ttl_count": 4,
            "gre_inner_ipv4_ttl_step": 1,
            "gre_inner_l4_src_port": 32000,
            "gre_inner_l4_src_port_mode": "Increment",
            "gre_inner_l4_src_port_count": 4,
            "gre_inner_l4_src_port_step": 1,
            "gre_inner_l4_dst_port": 32100,
            "gre_inner_l4_dst_port_mode": "Increment",
            "gre_inner_l4_dst_port_count": 4,
            "gre_inner_l4_dst_port_step": 1,
        },
        {
            "name": "arp",
            "packet_type": "Ethernet/ARP",
            "arp_hardware_type": 1,
            "arp_protocol_type": "0800",
            "arp_hardware_size": 6,
            "arp_protocol_size": 4,
            "arp_operation": 1,
            "arp_operation_mode": "Increment",
            "arp_operation_count": 2,
            "arp_operation_step": 1,
            "arp_sender_mac": "00:11:22:33:44:50",
            "arp_sender_mac_mode": "Increment",
            "arp_sender_mac_count": 4,
            "arp_sender_mac_step": 1,
            "arp_sender_ip": "10.0.0.1",
            "arp_sender_ip_mode": "Increment Host",
            "arp_sender_ip_count": 4,
            "arp_sender_ip_step": 1,
            "arp_target_ip": "10.0.0.2",
        },
        {
            "name": "icmpv6",
            "packet_type": "Ethernet/IPv6/ICMPv6",
            "icmp_type": 128,
            "icmp_identifier": 4660,
            "icmp_identifier_mode": "Increment",
            "icmp_identifier_count": 4,
            "icmp_identifier_step": 1,
            "icmp_sequence": 7,
            "icmp_sequence_mode": "Increment",
            "icmp_sequence_count": 4,
            "icmp_sequence_step": 1,
        },
        {
            "name": "sctp",
            "packet_type": "Ethernet/IPv4/SCTP",
            "l4_src_port_override": True,
            "l4_src_port": 5000,
            "l4_src_port_mode": "Increment",
            "l4_src_port_count": 4,
            "l4_src_port_step": 1,
            "l4_dst_port_override": True,
            "l4_dst_port": 6000,
            "sctp_verification_tag": 0x10203040,
            "sctp_verification_tag_mode": "Increment",
            "sctp_verification_tag_count": 4,
            "sctp_verification_tag_step": 1,
            "sctp_data_flags": 3,
            "sctp_data_flags_mode": "Increment",
            "sctp_data_flags_count": 4,
            "sctp_data_flags_step": 1,
            "sctp_tsn": 100,
            "sctp_tsn_mode": "Increment",
            "sctp_tsn_count": 4,
            "sctp_tsn_step": 1,
            "sctp_stream_id": 7,
            "sctp_stream_sequence": 9,
            "sctp_payload_protocol_id": 0x11223344,
        },
        {
            "name": "dns",
            "packet_type": "Ethernet/IPv4/UDP",
            "l4_src_port_override": True,
            "l4_src_port": 53000,
            "l4_dst_port_override": True,
            "l4_dst_port": 53,
            "dns_enabled": True,
            "dns_transaction_id": 0x1234,
            "dns_transaction_id_mode": "Increment",
            "dns_transaction_id_count": 4,
            "dns_transaction_id_step": 1,
            "dns_flags": "0100",
            "dns_flags_mode": "Increment",
            "dns_flags_count": 2,
            "dns_flags_step": 32768,
            "dns_query_name": "service.example",
            "dns_query_type": 1,
            "dns_query_type_mode": "Increment",
            "dns_query_type_count": 2,
            "dns_query_type_step": 27,
            "dns_query_class": 1,
            "dns_query_class_mode": "Increment",
            "dns_query_class_count": 2,
            "dns_query_class_step": 2,
            "dns_answer_enabled": True,
            "dns_answer_ttl": 60,
            "dns_answer_ttl_mode": "Increment",
            "dns_answer_ttl_count": 4,
            "dns_answer_ttl_step": 5,
            "dns_answer_ipv4": "192.0.2.10",
            "dns_answer_ipv4_mode": "Increment Host",
            "dns_answer_ipv4_count": 4,
            "dns_answer_ipv4_step": 1,
        },
        {
            "name": "dhcp",
            "packet_type": "Ethernet/IPv4/UDP",
            "l4_src_port_override": True,
            "l4_src_port": 68,
            "l4_dst_port_override": True,
            "l4_dst_port": 67,
            "dhcp_enabled": True,
            "dhcp_message_type": 1,
            "dhcp_message_type_mode": "Increment",
            "dhcp_message_type_count": 4,
            "dhcp_message_type_step": 1,
            "dhcp_xid": 0x3903F326,
            "dhcp_xid_mode": "Increment",
            "dhcp_xid_count": 4,
            "dhcp_xid_step": 1,
            "dhcp_flags": "0000",
            "dhcp_flags_mode": "Increment",
            "dhcp_flags_count": 4,
            "dhcp_flags_step": 1,
            "dhcp_client_ip": "192.0.2.20",
            "dhcp_client_ip_mode": "Increment Host",
            "dhcp_client_ip_count": 4,
            "dhcp_client_ip_step": 1,
            "dhcp_your_ip": "192.0.2.30",
            "dhcp_your_ip_mode": "Increment Host",
            "dhcp_your_ip_count": 4,
            "dhcp_your_ip_step": 1,
            "dhcp_server_ip": "192.0.2.40",
            "dhcp_server_ip_mode": "Increment Host",
            "dhcp_server_ip_count": 4,
            "dhcp_server_ip_step": 1,
            "dhcp_relay_ip": "192.0.2.50",
            "dhcp_relay_ip_mode": "Increment Host",
            "dhcp_relay_ip_count": 4,
            "dhcp_relay_ip_step": 1,
            "dhcp_client_mac": "66:55:44:33:22:10",
            "dhcp_client_mac_mode": "Increment",
            "dhcp_client_mac_count": 4,
            "dhcp_client_mac_step": 1,
            "dhcp_hostname": "trex-lab",
            "dhcp_requested_ip": "192.0.2.10",
            "dhcp_requested_ip_mode": "Increment Host",
            "dhcp_requested_ip_count": 4,
            "dhcp_requested_ip_step": 1,
            "dhcp_server_id": "192.0.2.1",
            "dhcp_server_id_mode": "Increment Host",
            "dhcp_server_id_count": 4,
            "dhcp_server_id_step": 1,
            "dhcp_parameter_request_list": "1,3,6,15",
            "dhcp_lease_time": 3600,
            "dhcp_lease_time_mode": "Increment",
            "dhcp_lease_time_count": 4,
            "dhcp_lease_time_step": 60,
            "dhcp_renewal_time": 1800,
            "dhcp_renewal_time_mode": "Increment",
            "dhcp_renewal_time_count": 4,
            "dhcp_renewal_time_step": 30,
            "dhcp_rebinding_time": 3150,
            "dhcp_rebinding_time_mode": "Increment",
            "dhcp_rebinding_time_count": 4,
            "dhcp_rebinding_time_step": 45,
        },
        {
            "name": "vxlan",
            "packet_type": "Ethernet/IPv4/UDP",
            "frame_length_type": "Fixed",
            "frame_length": 64,
            "src_ipv4": "16.0.0.1",
            "dst_ipv4": "48.0.0.1",
            "ipv4_ttl": 64,
            "vxlan_enabled": True,
            "vxlan_vni": 4096,
            "vxlan_vni_mode": "Increment",
            "vxlan_vni_count": 4,
            "vxlan_vni_step": 1,
            "vxlan_inner_ether_dst": "66:55:44:33:22:11",
            "vxlan_inner_ether_src": "10:20:30:40:50:60",
            "vxlan_inner_ipv4_src": "10.1.0.10",
            "vxlan_inner_ipv4_src_mode": "Increment Host",
            "vxlan_inner_ipv4_src_count": 4,
            "vxlan_inner_ipv4_src_step": 1,
        },
        {
            "name": "qinq",
            "packet_type": "Ethernet/IPv4/UDP",
            "vlan_enabled": True,
            "vlan_tpid_override": True,
            "vlan_tpid": "88a8",
            "vlan_priority": 1,
            "vlan_cfi": 0,
            "vlan_id": 100,
            "vlan2_enabled": True,
            "vlan2_tpid": "8100",
            "vlan2_priority": 2,
            "vlan2_priority_mode": "Increment",
            "vlan2_priority_count": 4,
            "vlan2_priority_step": 1,
            "vlan2_cfi": 0,
            "vlan2_id": 200,
            "vlan2_id_mode": "Increment",
            "vlan2_id_count": 4,
            "vlan2_id_step": 1,
        },
        {
            "name": "mpls-stack",
            "packet_type": "Ethernet/IPv4/UDP",
            "mpls_enabled": True,
            "mpls_label": 100,
            "mpls_tc": 1,
            "mpls_ttl": 40,
            "mpls_label2_enabled": True,
            "mpls_label2": 200,
            "mpls_label2_mode": "Increment",
            "mpls_label2_count": 4,
            "mpls_label2_step": 1,
            "mpls_label2_tc": 2,
            "mpls_label2_tc_mode": "Increment",
            "mpls_label2_tc_count": 4,
            "mpls_label2_tc_step": 1,
            "mpls_label2_ttl": 50,
            "mpls_label2_ttl_mode": "Increment",
            "mpls_label2_ttl_count": 4,
            "mpls_label2_ttl_step": 1,
            "mpls_label3_enabled": True,
            "mpls_label3": 300,
            "mpls_label3_mode": "Increment",
            "mpls_label3_count": 4,
            "mpls_label3_step": 1,
            "mpls_label3_tc": 3,
            "mpls_label3_tc_mode": "Increment",
            "mpls_label3_tc_count": 4,
            "mpls_label3_tc_step": 1,
            "mpls_label3_ttl": 60,
            "mpls_label3_ttl_mode": "Increment",
            "mpls_label3_ttl_count": 4,
            "mpls_label3_ttl_step": 1,
        },
        {
            "name": "ipv4-header",
            "packet_type": "Ethernet/IPv4/UDP",
            "ipv4_dscp": 10,
            "ipv4_dscp_mode": "Increment",
            "ipv4_dscp_count": 4,
            "ipv4_dscp_step": 1,
            "ipv4_ecn": 3,
            "ipv4_id": 100,
            "ipv4_id_mode": "Increment",
            "ipv4_id_count": 4,
            "ipv4_id_step": 1,
            "ipv4_flag_df": True,
            "ipv4_flag_mf": True,
            "ipv4_fragment_offset": 100,
            "ipv4_fragment_offset_mode": "Increment",
            "ipv4_fragment_offset_count": 4,
            "ipv4_fragment_offset_step": 1,
            "ipv4_ttl": 40,
            "ipv4_ttl_mode": "Increment",
            "ipv4_ttl_count": 4,
            "ipv4_ttl_step": 1,
        },
        {
            "name": "ipv6-header",
            "packet_type": "Ethernet/IPv6/UDP",
            "ipv6_traffic_class": 10,
            "ipv6_traffic_class_mode": "Increment",
            "ipv6_traffic_class_count": 4,
            "ipv6_traffic_class_step": 1,
            "ipv6_flow_label": 100,
            "ipv6_flow_label_mode": "Increment",
            "ipv6_flow_label_count": 4,
            "ipv6_flow_label_step": 1,
            "ipv6_hop_limit": 40,
            "ipv6_hop_limit_mode": "Increment",
            "ipv6_hop_limit_count": 4,
            "ipv6_hop_limit_step": 1,
        },
        {
            "name": "tcp-header",
            "packet_type": "Ethernet/IPv4/TCP",
            "l4_src_port": 12345,
            "l4_dst_port": 443,
            "tcp_sequence_number": 1000,
            "tcp_sequence_mode": "Increment",
            "tcp_sequence_count": 4,
            "tcp_sequence_step": 1,
            "tcp_ack_number": 2000,
            "tcp_ack_mode": "Increment",
            "tcp_ack_count": 4,
            "tcp_ack_step": 1,
            "tcp_window": 1024,
            "tcp_window_mode": "Increment",
            "tcp_window_count": 4,
            "tcp_window_step": 1,
            "tcp_flag_syn": True,
            "tcp_flags_mode": "Increment",
            "tcp_flags_count": 4,
            "tcp_flags_step": 1,
            "tcp_urgent_pointer": 20,
            "tcp_urgent_pointer_mode": "Increment",
            "tcp_urgent_pointer_count": 4,
            "tcp_urgent_pointer_step": 1,
            "tcp_checksum_override": True,
            "tcp_checksum": "BEEF",
            "tcp_checksum_mode": "Increment",
            "tcp_checksum_count": 4,
            "tcp_checksum_step": 1,
        },
        {
            "name": "udp-header",
            "packet_type": "Ethernet/IPv4/UDP",
            "l4_src_port": 12345,
            "l4_dst_port": 53,
            "udp_length_override": True,
            "udp_length": 90,
            "udp_length_mode": "Increment",
            "udp_length_count": 4,
            "udp_length_step": 1,
            "udp_checksum_override": True,
            "udp_checksum": "BEEF",
            "udp_checksum_mode": "Increment",
            "udp_checksum_count": 4,
            "udp_checksum_step": 1,
        },
        {
            "name": "udp-checksum",
            "packet_type": "Ethernet/IPv4/UDP",
            "udp_checksum_override": True,
            "udp_checksum": "BEEF",
            "udp_checksum_mode": "Increment",
            "udp_checksum_count": 4,
            "udp_checksum_step": 1,
        },
        {
            "name": "tcp-options",
            "packet_type": "Ethernet/IPv4/TCP",
            "tcp_flag_syn": True,
            "tcp_option_mss_enabled": True,
            "tcp_option_mss": 1460,
            "tcp_option_mss_mode": "Increment",
            "tcp_option_mss_count": 4,
            "tcp_option_mss_step": 1,
            "tcp_option_window_scale_enabled": True,
            "tcp_option_window_scale": 7,
            "tcp_option_window_scale_mode": "Increment",
            "tcp_option_window_scale_count": 4,
            "tcp_option_window_scale_step": 1,
            "tcp_option_sack_permitted_enabled": True,
            "tcp_option_sack_blocks_enabled": True,
            "tcp_option_sack_left_edge": 1000,
            "tcp_option_sack_left_edge_mode": "Increment",
            "tcp_option_sack_left_edge_count": 4,
            "tcp_option_sack_left_edge_step": 1,
            "tcp_option_sack_right_edge": 2000,
            "tcp_option_sack_right_edge_mode": "Increment",
            "tcp_option_sack_right_edge_count": 4,
            "tcp_option_sack_right_edge_step": 1,
            "tcp_option_timestamp_enabled": True,
            "tcp_option_timestamp_value": 123456,
            "tcp_option_timestamp_value_mode": "Increment",
            "tcp_option_timestamp_value_count": 4,
            "tcp_option_timestamp_value_step": 1,
            "tcp_option_timestamp_echo": 654321,
            "tcp_option_timestamp_echo_mode": "Increment",
            "tcp_option_timestamp_echo_count": 4,
            "tcp_option_timestamp_echo_step": 1,
        },
        {
            "name": "gtpu-ipv4-envelope",
            "packet_type": "Ethernet/IPv4/UDP",
            "frame_length_type": "Fixed",
            "frame_length": 64,
            "src_ipv4": "16.0.0.1",
            "dst_ipv4": "48.0.0.1",
            "ipv4_ttl": 64,
            "gtpu_enabled": True,
            "gtpu_extension_enabled": True,
            "gtpu_sequence_enabled": True,
            "gtpu_sequence": 7,
            "gtpu_sequence_mode": "Increment",
            "gtpu_sequence_count": 4,
            "gtpu_sequence_step": 1,
            "gtpu_npdu_enabled": True,
            "gtpu_npdu": 3,
            "gtpu_npdu_mode": "Increment",
            "gtpu_npdu_count": 4,
            "gtpu_npdu_step": 1,
            "gtpu_extension_udp_port": 65000,
            "gtpu_extension_udp_port_mode": "Increment",
            "gtpu_extension_udp_port_count": 4,
            "gtpu_extension_udp_port_step": 1,
            "gtpu_inner_ip_version": "IPv4",
            "gtpu_inner_ipv4_src": "10.3.0.10",
            "gtpu_inner_ipv4_src_mode": "Increment Host",
            "gtpu_inner_ipv4_src_count": 4,
            "gtpu_inner_ipv4_src_step": 1,
            "gtpu_inner_ipv4_dst": "10.3.0.20",
            "gtpu_inner_ipv4_ttl": 40,
            "gtpu_inner_ipv4_ttl_mode": "Increment",
            "gtpu_inner_ipv4_ttl_count": 4,
            "gtpu_inner_ipv4_ttl_step": 1,
            "gtpu_inner_l4_src_port": 33000,
            "gtpu_inner_l4_src_port_mode": "Increment",
            "gtpu_inner_l4_src_port_count": 4,
            "gtpu_inner_l4_src_port_step": 1,
            "gtpu_inner_l4_dst_port": 33100,
        },
    ]

    rows = acceptance.workbench_stream_intent_rows(streams)

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[0]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[0]["field_expectation_count"] == 5
    assert rows[0]["field_expectations"][0]["field"] == "IPv4.Source"
    assert rows[0]["field_expectations"][0]["expected_values"] == ["16.0.0.1"]
    assert rows[1]["packet_type"] == "Ethernet/IPv4/UDP/GTP-U IPv6"
    assert rows[1]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP"
    assert rows[1]["field_engines"] == [
        "gtpu_extension_udp_port: Increment x4 step 1",
        "gtpu_inner_ipv6_src: Increment Host x4 step 1",
        "gtpu_npdu: Increment x4 step 1",
        "gtpu_sequence: Increment x4 step 1",
    ]
    assert rows[1]["field_expectation_count"] == 37
    gtpu_fields = {expectation["field"]: expectation for expectation in rows[1]["field_expectations"]}
    assert gtpu_fields["IPv4.Source"]["expected_values"] == ["16.0.0.1"]
    assert gtpu_fields["IPv4.Destination"]["expected_values"] == ["48.0.0.1"]
    assert gtpu_fields["IPv4.TTL"]["expected_values"] == ["64"]
    assert gtpu_fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert gtpu_fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert gtpu_fields["IPv4.Total Length"]["expected_values"] == ["92"]
    assert gtpu_fields["UDP.Source Port"]["expected_values"] == ["2152"]
    assert gtpu_fields["UDP.Destination Port"]["expected_values"] == ["2152"]
    assert gtpu_fields["UDP.Length"]["expected_values"] == ["72"]
    assert gtpu_fields["UDP.Payload Length"]["expected_values"] == ["64"]
    assert gtpu_fields["IPv6.Source"]["expected_values"] == [
        "2001:db8:30::1",
        "2001:db8:30::2",
        "2001:db8:30::3",
        "2001:db8:30::4",
    ]
    assert gtpu_fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert gtpu_fields["IPv6.Payload Length"]["expected_values"] == ["8"]
    assert gtpu_fields["UDP[2].Length"]["expected_values"] == ["8"]
    assert gtpu_fields["UDP[2].Payload Length"]["expected_values"] == ["0"]
    assert gtpu_fields["GTP-U.Flags"]["expected_values"] == ["0x37"]
    assert gtpu_fields["GTP-U.Version"]["expected_values"] == ["1"]
    assert gtpu_fields["GTP-U.Protocol Type"]["expected_values"] == ["GTP"]
    assert gtpu_fields["GTP-U.Message Type"]["expected_values"] == ["G-PDU (255)"]
    assert gtpu_fields["GTP-U.Length"]["expected_values"] == ["56"]
    assert gtpu_fields["GTP-U.Payload Length"]["expected_values"] == ["52"]
    assert gtpu_fields["GTP-U.TEID"]["expected_values"] == ["0x12345678"]
    assert gtpu_fields["GTP-U.Extension Header"]["expected_values"] == ["yes"]
    assert gtpu_fields["GTP-U.Sequence Number Present"]["expected_values"] == ["yes"]
    assert gtpu_fields["GTP-U.N-PDU Present"]["expected_values"] == ["yes"]
    assert gtpu_fields["GTP-U.Sequence"]["expected_values"] == ["7", "8", "9", "10"]
    assert gtpu_fields["GTP-U.N-PDU Number"]["expected_values"] == ["3", "4", "5", "6"]
    assert gtpu_fields["GTP-U.Next Extension Header"]["expected_values"] == ["0x40"]
    assert gtpu_fields["GTP-U Extension.Type"]["expected_values"] == ["UDP Port (0x40)"]
    assert gtpu_fields["GTP-U Extension.Length Units"]["expected_values"] == ["1"]
    assert gtpu_fields["GTP-U Extension.Length"]["expected_values"] == ["4"]
    assert gtpu_fields["GTP-U Extension.UDP Port"]["expected_values"] == ["65000", "65001", "65002", "65003"]
    assert gtpu_fields["GTP-U Extension.Next Extension Header"]["expected_values"] == ["0x00"]
    assert rows[2]["expected_layer_chain"] == "Ethernet > IPv4 > GRE > IPv4 > UDP"
    assert rows[2]["field_engines"] == [
        "gre_inner_ipv4_dst: Increment Host x4 step 1",
        "gre_inner_ipv4_src: Increment Host x4 step 1",
        "gre_inner_ipv4_ttl: Increment x4 step 1",
        "gre_inner_l4_dst_port: Increment x4 step 1",
        "gre_inner_l4_src_port: Increment x4 step 1",
        "gre_key: Increment x4 step 1",
        "gre_sequence: Increment x4 step 1",
    ]
    assert rows[2]["field_expectation_count"] == 20
    gre_fields = {expectation["field"]: expectation for expectation in rows[2]["field_expectations"]}
    assert gre_fields["IPv4.Source"]["expected_values"] == ["16.0.0.1"]
    assert gre_fields["IPv4.Destination"]["expected_values"] == ["48.0.0.1"]
    assert gre_fields["IPv4.TTL"]["expected_values"] == ["64"]
    assert gre_fields["IPv4.Protocol"]["expected_values"] == ["GRE"]
    assert gre_fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert gre_fields["IPv4.Total Length"]["expected_values"] == ["60"]
    assert gre_fields["GRE.Flags"]["expected_values"] == ["0x3000"]
    assert gre_fields["GRE.Protocol Type"]["expected_values"] == ["0x0800"]
    assert gre_fields["GRE.Key"]["expected_values"] == [
        "0x12345678",
        "0x12345679",
        "0x1234567a",
        "0x1234567b",
    ]
    assert gre_fields["GRE.Sequence"]["expected_values"] == ["7", "8", "9", "10"]
    assert gre_fields["IPv4[2].Source"]["expected_values"] == [
        "10.2.0.10",
        "10.2.0.11",
        "10.2.0.12",
        "10.2.0.13",
    ]
    assert gre_fields["IPv4[2].TTL"]["expected_values"] == ["40", "41", "42", "43"]
    assert gre_fields["IPv4[2].Protocol"]["expected_values"] == ["UDP"]
    assert gre_fields["IPv4[2].Header Length"]["expected_values"] == ["20"]
    assert gre_fields["IPv4[2].Total Length"]["expected_values"] == ["28"]
    assert gre_fields["UDP.Source Port"]["expected_values"] == ["32000", "32001", "32002", "32003"]
    assert gre_fields["UDP.Length"]["expected_values"] == ["8"]
    assert gre_fields["UDP.Payload Length"]["expected_values"] == ["0"]
    assert rows[3]["expected_layer_chain"] == "Ethernet > ARP"
    assert rows[3]["field_expectation_count"] == 9
    arp_fields = {expectation["field"]: expectation for expectation in rows[3]["field_expectations"]}
    assert arp_fields["ARP.Hardware Type"]["expected_values"] == ["1"]
    assert arp_fields["ARP.Protocol Type"]["expected_values"] == ["0x0800"]
    assert arp_fields["ARP.Hardware Size"]["expected_values"] == ["6"]
    assert arp_fields["ARP.Protocol Size"]["expected_values"] == ["4"]
    assert arp_fields["ARP.Operation"]["expected_values"] == ["request", "reply"]
    assert arp_fields["ARP.Operation"]["mode"] == "Increment"
    assert arp_fields["ARP.Sender MAC"]["expected_values"] == [
        "00:11:22:33:44:50",
        "00:11:22:33:44:51",
        "00:11:22:33:44:52",
        "00:11:22:33:44:53",
    ]
    assert arp_fields["ARP.Sender IP"]["expected_values"] == ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]
    assert rows[4]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[4]["field_expectation_count"] == 9
    icmpv6_fields = {expectation["field"]: expectation for expectation in rows[4]["field_expectations"]}
    assert icmpv6_fields["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert icmpv6_fields["ICMPv6.Type"]["expected_values"] == ["128"]
    assert icmpv6_fields["ICMPv6.Type Name"]["expected_values"] == ["Echo Request"]
    assert icmpv6_fields["ICMPv6.Code"]["expected_values"] == ["0"]
    assert rows[4]["field_expectations"][-2]["field"] == "ICMPv6.Identifier"
    assert rows[4]["field_expectations"][-2]["expected_values"] == ["4660", "4661", "4662", "4663"]
    assert rows[4]["field_expectations"][-1]["field"] == "ICMPv6.Sequence"
    assert rows[4]["field_expectations"][-1]["expected_values"] == ["7", "8", "9", "10"]
    assert rows[5]["expected_layer_chain"] == "Ethernet > IPv4 > SCTP"
    assert rows[5]["field_expectation_count"] == 12
    assert rows[5]["field_expectations"][3]["field"] == "SCTP.Source Port"
    assert rows[5]["field_expectations"][3]["expected_values"] == ["5000", "5001", "5002", "5003"]
    assert rows[5]["field_expectations"][5]["field"] == "SCTP.Verification Tag"
    assert rows[5]["field_expectations"][5]["expected_values"] == [
        "0x10203040",
        "0x10203041",
        "0x10203042",
        "0x10203043",
    ]
    sctp_fields = {expectation["field"]: expectation for expectation in rows[5]["field_expectations"]}
    assert sctp_fields["SCTP.Chunk Type"]["expected_values"] == ["DATA"]
    assert sctp_fields["SCTP.Chunk Flags"]["expected_values"] == ["0x03", "0x04", "0x05", "0x06"]
    assert sctp_fields["SCTP.TSN"]["expected_values"] == ["100", "101", "102", "103"]
    assert rows[5]["field_expectations"][-1]["field"] == "SCTP.Payload Protocol ID"
    assert rows[5]["field_expectations"][-1]["expected_values"] == ["287454020"]
    assert rows[6]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > DNS"
    assert rows[6]["field_expectation_count"] == 21
    dns_fields = {expectation["field"]: expectation for expectation in rows[6]["field_expectations"]}
    assert dns_fields["DNS.Transaction ID"]["expected_values"] == ["0x1234", "0x1235", "0x1236", "0x1237"]
    assert dns_fields["DNS.Flags"]["expected_values"] == ["0x0100", "0x8100"]
    assert dns_fields["DNS.QR"]["expected_values"] == ["query", "response"]
    assert dns_fields["DNS.Opcode"]["expected_values"] == ["0"]
    assert dns_fields["DNS.Response Code"]["expected_values"] == ["0"]
    assert dns_fields["DNS.Answers"]["expected_values"] == ["1"]
    assert dns_fields["DNS.Query Name"]["expected_values"] == ["service.example"]
    assert dns_fields["DNS.Query Type"]["expected_values"] == ["A", "AAAA"]
    assert dns_fields["DNS.Query Class"]["expected_values"] == ["IN", "CH"]
    assert dns_fields["DNS.Answer Type"]["expected_values"] == ["A"]
    assert dns_fields["DNS.Answer Class"]["expected_values"] == ["IN"]
    assert dns_fields["DNS.Answer TTL"]["expected_values"] == ["60", "65", "70", "75"]
    assert dns_fields["DNS.Answer IPv4"]["expected_values"] == ["192.0.2.10", "192.0.2.11", "192.0.2.12", "192.0.2.13"]
    assert rows[7]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > DHCP"
    assert rows[7]["field_expectation_count"] == 26
    dhcp_fields = {expectation["field"]: expectation for expectation in rows[7]["field_expectations"]}
    assert dhcp_fields["DHCP.Operation"]["expected_values"] == ["request"]
    assert dhcp_fields["DHCP.Hops"]["expected_values"] == ["0"]
    assert dhcp_fields["DHCP.Seconds"]["expected_values"] == ["0"]
    assert dhcp_fields["DHCP.Transaction ID"]["expected_values"] == [
        "0x3903f326",
        "0x3903f327",
        "0x3903f328",
        "0x3903f329",
    ]
    assert dhcp_fields["DHCP.Flags"]["expected_values"] == ["0x0000", "0x0001", "0x0002", "0x0003"]
    assert dhcp_fields["DHCP.Client IP"]["expected_values"] == [
        "192.0.2.20",
        "192.0.2.21",
        "192.0.2.22",
        "192.0.2.23",
    ]
    assert dhcp_fields["DHCP.Your IP"]["expected_values"] == [
        "192.0.2.30",
        "192.0.2.31",
        "192.0.2.32",
        "192.0.2.33",
    ]
    assert dhcp_fields["DHCP.Server IP"]["expected_values"] == [
        "192.0.2.40",
        "192.0.2.41",
        "192.0.2.42",
        "192.0.2.43",
    ]
    assert dhcp_fields["DHCP.Relay IP"]["expected_values"] == [
        "192.0.2.50",
        "192.0.2.51",
        "192.0.2.52",
        "192.0.2.53",
    ]
    assert dhcp_fields["DHCP.Message Type"]["expected_values"] == ["Discover", "Offer", "Request", "Decline"]
    assert dhcp_fields["DHCP.Client MAC"]["expected_values"] == [
        "66:55:44:33:22:10",
        "66:55:44:33:22:11",
        "66:55:44:33:22:12",
        "66:55:44:33:22:13",
    ]
    assert dhcp_fields["DHCP.Hostname"]["expected_values"] == ["trex-lab"]
    assert dhcp_fields["DHCP.Parameter Request List"]["expected_values"] == ["1,3,6,15"]
    assert dhcp_fields["DHCP.Requested IP"]["expected_values"] == [
        "192.0.2.10",
        "192.0.2.11",
        "192.0.2.12",
        "192.0.2.13",
    ]
    assert dhcp_fields["DHCP.Server ID"]["expected_values"] == [
        "192.0.2.1",
        "192.0.2.2",
        "192.0.2.3",
        "192.0.2.4",
    ]
    assert dhcp_fields["DHCP.Lease Time"]["expected_values"] == ["3600", "3660", "3720", "3780"]
    assert dhcp_fields["DHCP.Renewal Time"]["expected_values"] == ["1800", "1830", "1860", "1890"]
    assert dhcp_fields["DHCP.Rebinding Time"]["expected_values"] == ["3150", "3195", "3240", "3285"]
    assert rows[8]["packet_type"] == "Ethernet/IPv4/UDP/VXLAN IPv4"
    assert rows[8]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv4 > UDP"
    assert rows[8]["field_engines"] == [
        "vxlan_inner_ipv4_src: Increment Host x4 step 1",
        "vxlan_vni: Increment x4 step 1",
    ]
    assert rows[8]["field_expectation_count"] == 27
    assert rows[8]["field_expectations"][0]["field"] == "IPv4.Source"
    assert rows[8]["field_expectations"][0]["expected_values"] == ["16.0.0.1"]
    vxlan_fields = {field["field"]: field for field in rows[8]["field_expectations"]}
    assert vxlan_fields["IPv4.Destination"]["expected_values"] == ["48.0.0.1"]
    assert vxlan_fields["IPv4.TTL"]["expected_values"] == ["64"]
    assert vxlan_fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert vxlan_fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert vxlan_fields["IPv4.Total Length"]["expected_values"] == ["78"]
    assert vxlan_fields["UDP.Source Port"]["expected_values"] == ["1337"]
    assert vxlan_fields["UDP.Destination Port"]["expected_values"] == ["4789"]
    assert vxlan_fields["UDP.Length"]["expected_values"] == ["58"]
    assert vxlan_fields["UDP.Payload Length"]["expected_values"] == ["50"]
    assert vxlan_fields["IPv4[2].Source"]["expected_values"] == [
        "10.1.0.10",
        "10.1.0.11",
        "10.1.0.12",
        "10.1.0.13",
    ]
    assert vxlan_fields["IPv4[2].Protocol"]["expected_values"] == ["UDP"]
    assert vxlan_fields["IPv4[2].Header Length"]["expected_values"] == ["20"]
    assert vxlan_fields["IPv4[2].Total Length"]["expected_values"] == ["28"]
    assert vxlan_fields["UDP[2].Length"]["expected_values"] == ["8"]
    assert vxlan_fields["UDP[2].Payload Length"]["expected_values"] == ["0"]
    assert vxlan_fields["VXLAN.Flags"]["expected_values"] == ["0x08"]
    assert vxlan_fields["VXLAN.Reserved"]["expected_values"] == ["0x000000"]
    assert vxlan_fields["VXLAN.VNI"]["expected_values"] == ["4096", "4097", "4098", "4099"]
    assert vxlan_fields["VXLAN.VNI Reserved"]["expected_values"] == ["0x00"]
    assert vxlan_fields["Inner Ethernet.Destination"]["expected_values"] == ["66:55:44:33:22:11"]
    assert vxlan_fields["Inner Ethernet.Source"]["expected_values"] == ["10:20:30:40:50:60"]
    assert vxlan_fields["Inner Ethernet.EtherType"]["expected_values"] == ["0x0800"]
    assert rows[9]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[9]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[9]["field_engines"] == [
        "vlan2_id: Increment x4 step 1",
        "vlan2_priority: Increment x4 step 1",
    ]
    assert rows[9]["field_expectation_count"] == 13
    assert rows[9]["field_expectations"][0]["field"] == "802.1Q VLAN.TPID"
    assert rows[9]["field_expectations"][0]["expected_values"] == ["0x88a8"]
    assert rows[9]["field_expectations"][3]["field"] == "802.1Q VLAN.VLAN ID"
    assert rows[9]["field_expectations"][3]["expected_values"] == ["100"]
    assert rows[9]["field_expectations"][4]["field"] == "802.1Q VLAN[2].TPID"
    assert rows[9]["field_expectations"][4]["expected_values"] == ["0x8100"]
    assert rows[9]["field_expectations"][5]["field"] == "802.1Q VLAN[2].Priority"
    assert rows[9]["field_expectations"][5]["expected_values"] == ["2", "3", "4", "5"]
    assert rows[9]["field_expectations"][7]["field"] == "802.1Q VLAN[2].VLAN ID"
    assert rows[9]["field_expectations"][7]["expected_values"] == ["200", "201", "202", "203"]
    assert rows[10]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[10]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[10]["field_engines"] == [
        "mpls_label2: Increment x4 step 1",
        "mpls_label2_tc: Increment x4 step 1",
        "mpls_label2_ttl: Increment x4 step 1",
        "mpls_label3: Increment x4 step 1",
        "mpls_label3_tc: Increment x4 step 1",
        "mpls_label3_ttl: Increment x4 step 1",
    ]
    assert rows[10]["field_expectation_count"] == 17
    assert rows[10]["field_expectations"][0]["field"] == "MPLS.Label"
    assert rows[10]["field_expectations"][0]["expected_values"] == ["100"]
    assert rows[10]["field_expectations"][2]["field"] == "MPLS.Bottom Of Stack"
    assert rows[10]["field_expectations"][2]["expected_values"] == ["0"]
    assert rows[10]["field_expectations"][4]["field"] == "MPLS[2].Label"
    assert rows[10]["field_expectations"][4]["expected_values"] == ["200", "201", "202", "203"]
    assert rows[10]["field_expectations"][8]["field"] == "MPLS[3].Label"
    assert rows[10]["field_expectations"][8]["expected_values"] == ["300", "301", "302", "303"]
    assert rows[10]["field_expectations"][10]["field"] == "MPLS[3].Bottom Of Stack"
    assert rows[10]["field_expectations"][10]["expected_values"] == ["1"]
    assert rows[10]["field_expectations"][11]["field"] == "MPLS[3].TTL"
    assert rows[10]["field_expectations"][11]["expected_values"] == ["60", "61", "62", "63"]
    assert rows[11]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[11]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[11]["field_engines"] == [
        "ipv4_dscp: Increment x4 step 1",
        "ipv4_fragment_offset: Increment x4 step 1",
        "ipv4_id: Increment x4 step 1",
        "ipv4_ttl: Increment x4 step 1",
    ]
    assert rows[11]["field_expectation_count"] == 10
    assert rows[11]["field_expectations"][2]["field"] == "IPv4.TTL"
    assert rows[11]["field_expectations"][2]["expected_values"] == ["40", "41", "42", "43"]
    assert rows[11]["field_expectations"][3]["field"] == "IPv4.DSCP"
    assert rows[11]["field_expectations"][3]["expected_values"] == ["10", "11", "12", "13"]
    assert rows[11]["field_expectations"][4]["field"] == "IPv4.ECN"
    assert rows[11]["field_expectations"][4]["expected_values"] == ["3"]
    assert rows[11]["field_expectations"][5]["field"] == "IPv4.Identification"
    assert rows[11]["field_expectations"][5]["expected_values"] == ["100", "101", "102", "103"]
    assert rows[11]["field_expectations"][6]["field"] == "IPv4.Flags"
    assert rows[11]["field_expectations"][6]["expected_values"] == ["DF, MF"]
    assert rows[11]["field_expectations"][7]["field"] == "IPv4.Fragment Offset"
    assert rows[11]["field_expectations"][7]["expected_values"] == ["100", "101", "102", "103"]
    assert rows[12]["packet_type"] == "Ethernet/IPv6/UDP"
    assert rows[12]["expected_layer_chain"] == "Ethernet > IPv6 > UDP"
    assert rows[12]["field_engines"] == [
        "ipv6_flow_label: Increment x4 step 1",
        "ipv6_hop_limit: Increment x4 step 1",
        "ipv6_traffic_class: Increment x4 step 1",
    ]
    assert rows[12]["field_expectation_count"] == 8
    assert rows[12]["field_expectations"][2]["field"] == "IPv6.Hop Limit"
    assert rows[12]["field_expectations"][2]["expected_values"] == ["40", "41", "42", "43"]
    assert rows[12]["field_expectations"][3]["field"] == "IPv6.Next Header"
    assert rows[12]["field_expectations"][3]["expected_values"] == ["UDP"]
    assert rows[12]["field_expectations"][4]["field"] == "IPv6.Traffic Class"
    assert rows[12]["field_expectations"][4]["expected_values"] == ["10", "11", "12", "13"]
    assert rows[12]["field_expectations"][5]["field"] == "IPv6.Flow Label"
    assert rows[12]["field_expectations"][5]["expected_values"] == ["100", "101", "102", "103"]
    assert rows[13]["packet_type"] == "Ethernet/IPv4/TCP"
    assert rows[13]["expected_layer_chain"] == "Ethernet > IPv4 > TCP"
    assert rows[13]["field_engines"] == [
        "tcp_ack: Increment x4 step 1",
        "tcp_checksum: Increment x4 step 1",
        "tcp_flags: Increment x4 step 1",
        "tcp_sequence: Increment x4 step 1",
        "tcp_urgent_pointer: Increment x4 step 1",
        "tcp_window: Increment x4 step 1",
    ]
    assert rows[13]["field_expectation_count"] == 10
    assert rows[13]["field_expectations"][5]["field"] == "TCP.Sequence"
    assert rows[13]["field_expectations"][5]["expected_values"] == ["1000", "1001", "1002", "1003"]
    assert rows[13]["field_expectations"][6]["field"] == "TCP.Acknowledge"
    assert rows[13]["field_expectations"][6]["expected_values"] == ["2000", "2001", "2002", "2003"]
    assert rows[13]["field_expectations"][7]["field"] == "TCP.Window"
    assert rows[13]["field_expectations"][7]["expected_values"] == ["1024", "1025", "1026", "1027"]
    assert rows[13]["field_expectations"][8]["field"] == "TCP.Flags"
    assert rows[13]["field_expectations"][8]["expected_values"] == ["SYN", "SYN, FIN", "RST", "RST, FIN"]
    assert rows[13]["field_expectations"][9]["field"] == "TCP.Urgent Pointer"
    assert rows[13]["field_expectations"][9]["expected_values"] == ["20", "21", "22", "23"]
    assert rows[14]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[14]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[14]["field_engines"] == [
        "udp_checksum: Increment x4 step 1",
        "udp_length: Increment x4 step 1",
    ]
    assert rows[14]["field_expectation_count"] == 7
    assert rows[14]["field_expectations"][5]["field"] == "UDP.Length"
    assert rows[14]["field_expectations"][5]["expected_values"] == ["90", "91", "92", "93"]
    assert rows[14]["field_expectations"][6]["field"] == "UDP.Payload Length"
    assert rows[14]["field_expectations"][6]["expected_values"] == ["82", "83", "84", "85"]
    assert all(expectation["field"] != "UDP.Checksum" for expectation in rows[14]["field_expectations"])
    assert rows[15]["packet_type"] == "Ethernet/IPv4/UDP"
    assert rows[15]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[15]["field_engines"] == [
        "udp_checksum: Increment x4 step 1",
    ]
    assert rows[15]["field_expectation_count"] == 6
    assert rows[15]["field_expectations"][5]["field"] == "UDP.Checksum"
    assert rows[15]["field_expectations"][5]["expected_values"] == ["0xbeef", "0xbef0", "0xbef1", "0xbef2"]
    assert rows[16]["packet_type"] == "Ethernet/IPv4/TCP"
    assert rows[16]["expected_layer_chain"] == "Ethernet > IPv4 > TCP"
    assert rows[16]["field_engines"] == [
        "tcp_option_mss: Increment x4 step 1",
        "tcp_option_sack_left_edge: Increment x4 step 1",
        "tcp_option_sack_right_edge: Increment x4 step 1",
        "tcp_option_timestamp_echo: Increment x4 step 1",
        "tcp_option_timestamp_value: Increment x4 step 1",
        "tcp_option_window_scale: Increment x4 step 1",
    ]
    assert rows[16]["field_expectation_count"] == 18
    assert rows[16]["field_expectations"][10]["field"] == "TCP.Header Length"
    assert rows[16]["field_expectations"][10]["expected_values"] == ["52"]
    assert rows[16]["field_expectations"][11]["field"] == "TCP.Option MSS"
    assert rows[16]["field_expectations"][11]["expected_values"] == ["1460", "1461", "1462", "1463"]
    assert rows[16]["field_expectations"][12]["field"] == "TCP.Option SACK Permitted"
    assert rows[16]["field_expectations"][12]["expected_values"] == ["yes"]
    assert rows[16]["field_expectations"][13]["field"] == "TCP.Option SACK Left Edge"
    assert rows[16]["field_expectations"][13]["expected_values"] == ["1000", "1001", "1002", "1003"]
    assert rows[16]["field_expectations"][14]["field"] == "TCP.Option SACK Right Edge"
    assert rows[16]["field_expectations"][14]["expected_values"] == ["2000", "2001", "2002", "2003"]
    assert rows[16]["field_expectations"][15]["field"] == "TCP.Option Timestamp Value"
    assert rows[16]["field_expectations"][15]["expected_values"] == ["123456", "123457", "123458", "123459"]
    assert rows[16]["field_expectations"][16]["field"] == "TCP.Option Timestamp Echo"
    assert rows[16]["field_expectations"][16]["expected_values"] == ["654321", "654322", "654323", "654324"]
    assert rows[16]["field_expectations"][17]["field"] == "TCP.Option Window Scale"
    assert rows[16]["field_expectations"][17]["expected_values"] == ["7", "8", "9", "10"]
    gtpu_ipv4_row = next(row for row in rows if row["name"] == "gtpu-ipv4-envelope")
    assert gtpu_ipv4_row["packet_type"] == "Ethernet/IPv4/UDP/GTP-U IPv4"
    assert gtpu_ipv4_row["expected_layer_chain"] == "Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv4 > UDP"
    assert gtpu_ipv4_row["field_expectation_count"] == 38
    gtpu_ipv4_fields = {expectation["field"]: expectation for expectation in gtpu_ipv4_row["field_expectations"]}
    assert gtpu_ipv4_fields["IPv4[2].Source"]["expected_values"] == [
        "10.3.0.10",
        "10.3.0.11",
        "10.3.0.12",
        "10.3.0.13",
    ]
    assert gtpu_ipv4_fields["IPv4[2].TTL"]["expected_values"] == ["40", "41", "42", "43"]
    assert gtpu_ipv4_fields["IPv4[2].Protocol"]["expected_values"] == ["UDP"]
    assert gtpu_ipv4_fields["IPv4[2].Header Length"]["expected_values"] == ["20"]
    assert gtpu_ipv4_fields["IPv4[2].Total Length"]["expected_values"] == ["28"]
    assert gtpu_ipv4_fields["UDP[2].Source Port"]["expected_values"] == ["33000", "33001", "33002", "33003"]
    assert gtpu_ipv4_fields["UDP[2].Destination Port"]["expected_values"] == ["33100"]
    assert gtpu_ipv4_fields["UDP[2].Length"]["expected_values"] == ["8"]
    assert gtpu_ipv4_fields["UDP[2].Payload Length"]["expected_values"] == ["0"]
    assert gtpu_ipv4_fields["UDP.Length"]["expected_values"] == ["52"]
    assert gtpu_ipv4_fields["UDP.Payload Length"]["expected_values"] == ["44"]
    assert gtpu_ipv4_fields["GTP-U.Length"]["expected_values"] == ["36"]
    assert gtpu_ipv4_fields["GTP-U.Payload Length"]["expected_values"] == ["32"]


def test_workbench_stream_intent_rows_capture_gre_inner_ipv6_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "gre-inner-ipv6",
                "packet_type": "Ethernet/IPv4/GRE",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "gre_key_present": True,
                "gre_key": 0x12345678,
                "gre_sequence_present": True,
                "gre_sequence": 7,
                "gre_inner_ip_version": "IPv6",
                "gre_inner_ipv6_src": "2001:db8:40::10",
                "gre_inner_ipv6_src_mode": "Increment Host",
                "gre_inner_ipv6_src_count": 4,
                "gre_inner_ipv6_src_step": 1,
                "gre_inner_ipv6_dst": "2001:db8:40::20",
                "gre_inner_ipv6_dst_mode": "Increment Host",
                "gre_inner_ipv6_dst_count": 4,
                "gre_inner_ipv6_dst_step": 1,
                "gre_inner_ipv6_hop_limit": 42,
                "gre_inner_ipv6_hop_limit_mode": "Increment",
                "gre_inner_ipv6_hop_limit_count": 4,
                "gre_inner_ipv6_hop_limit_step": 1,
                "gre_inner_l4_src_port": 32000,
                "gre_inner_l4_src_port_mode": "Increment",
                "gre_inner_l4_src_port_count": 4,
                "gre_inner_l4_src_port_step": 1,
                "gre_inner_l4_dst_port": 32100,
                "gre_inner_l4_dst_port_mode": "Increment",
                "gre_inner_l4_dst_port_count": 4,
                "gre_inner_l4_dst_port_step": 1,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > GRE > IPv6 > UDP"
    assert rows[0]["field_expectation_count"] == 19
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Protocol"]["expected_values"] == ["GRE"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["80"]
    assert fields["GRE.Flags"]["expected_values"] == ["0x3000"]
    assert fields["GRE.Protocol Type"]["expected_values"] == ["0x86dd"]
    assert fields["GRE.Key"]["expected_values"] == ["0x12345678"]
    assert fields["GRE.Sequence"]["expected_values"] == ["7"]
    assert fields["IPv6.Source"]["expected_values"] == [
        "2001:db8:40::10",
        "2001:db8:40::11",
        "2001:db8:40::12",
        "2001:db8:40::13",
    ]
    assert fields["IPv6.Destination"]["expected_values"] == [
        "2001:db8:40::20",
        "2001:db8:40::21",
        "2001:db8:40::22",
        "2001:db8:40::23",
    ]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["42", "43", "44", "45"]
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["8"]
    assert fields["UDP.Source Port"]["expected_values"] == ["32000", "32001", "32002", "32003"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["32100", "32101", "32102", "32103"]
    assert fields["UDP.Length"]["expected_values"] == ["8"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["0"]


def test_workbench_stream_intent_rows_capture_vxlan_inner_ipv6_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "vxlan-inner-ipv6",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "vxlan_enabled": True,
                "vxlan_vni": 4096,
                "vxlan_vni_mode": "Increment",
                "vxlan_vni_count": 4,
                "vxlan_vni_step": 1,
                "vxlan_inner_ether_dst": "66:55:44:33:22:11",
                "vxlan_inner_ether_src": "10:20:30:40:50:60",
                "vxlan_inner_ip_version": "IPv6",
                "vxlan_inner_ipv6_src": "2001:db8:50::10",
                "vxlan_inner_ipv6_src_mode": "Increment Host",
                "vxlan_inner_ipv6_src_count": 4,
                "vxlan_inner_ipv6_src_step": 1,
                "vxlan_inner_ipv6_dst": "2001:db8:50::20",
                "vxlan_inner_ipv6_dst_mode": "Increment Host",
                "vxlan_inner_ipv6_dst_count": 4,
                "vxlan_inner_ipv6_dst_step": 1,
                "vxlan_inner_ipv6_hop_limit": 40,
                "vxlan_inner_ipv6_hop_limit_mode": "Increment",
                "vxlan_inner_ipv6_hop_limit_count": 4,
                "vxlan_inner_ipv6_hop_limit_step": 1,
                "vxlan_inner_l4_src_port": 32000,
                "vxlan_inner_l4_src_port_mode": "Increment",
                "vxlan_inner_l4_src_port_count": 4,
                "vxlan_inner_l4_src_port_step": 1,
                "vxlan_inner_l4_dst_port": 32100,
                "vxlan_inner_l4_dst_port_mode": "Increment",
                "vxlan_inner_l4_dst_port_count": 4,
                "vxlan_inner_l4_dst_port_step": 1,
            }
        ]
    )

    assert rows[0]["packet_type"] == "Ethernet/IPv4/UDP/VXLAN IPv6"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv6 > UDP"
    assert rows[0]["field_engines"] == [
        "vxlan_inner_ipv6_dst: Increment Host x4 step 1",
        "vxlan_inner_ipv6_hop_limit: Increment x4 step 1",
        "vxlan_inner_ipv6_src: Increment Host x4 step 1",
        "vxlan_inner_l4_dst_port: Increment x4 step 1",
        "vxlan_inner_l4_src_port: Increment x4 step 1",
        "vxlan_vni: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 26
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Source"]["expected_values"] == ["16.0.0.1"]
    assert fields["IPv4.Destination"]["expected_values"] == ["48.0.0.1"]
    assert fields["IPv4.TTL"]["expected_values"] == ["64"]
    assert fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["98"]
    assert fields["UDP.Source Port"]["expected_values"] == ["1337"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["4789"]
    assert fields["UDP.Length"]["expected_values"] == ["78"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Source"]["expected_values"] == [
        "2001:db8:50::10",
        "2001:db8:50::11",
        "2001:db8:50::12",
        "2001:db8:50::13",
    ]
    assert fields["IPv6.Destination"]["expected_values"] == [
        "2001:db8:50::20",
        "2001:db8:50::21",
        "2001:db8:50::22",
        "2001:db8:50::23",
    ]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["40", "41", "42", "43"]
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["8"]
    assert fields["UDP[2].Source Port"]["expected_values"] == ["32000", "32001", "32002", "32003"]
    assert fields["UDP[2].Destination Port"]["expected_values"] == ["32100", "32101", "32102", "32103"]
    assert fields["UDP[2].Length"]["expected_values"] == ["8"]
    assert fields["UDP[2].Payload Length"]["expected_values"] == ["0"]
    assert fields["VXLAN.VNI"]["expected_values"] == ["4096", "4097", "4098", "4099"]
    assert fields["Inner Ethernet.EtherType"]["expected_values"] == ["0x86dd"]


def test_workbench_stream_intent_rows_capture_arp_reply_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "arp-reply",
                "packet_type": "Ethernet/ARP",
                "arp_hardware_type": 1,
                "arp_protocol_type": "0800",
                "arp_hardware_size": 6,
                "arp_protocol_size": 4,
                "arp_operation": 2,
                "arp_operation_mode": "Fixed",
                "arp_operation_count": 4,
                "arp_operation_step": 1,
                "arp_sender_mac": "66:55:44:33:22:11",
                "arp_sender_ip": "10.0.0.2",
                "arp_target_mac": "00:11:22:33:44:55",
                "arp_target_ip": "10.0.0.1",
            }
        ]
    )
    assert rows[0]["expected_layer_chain"] == "Ethernet > ARP"
    assert rows[0]["field_expectation_count"] == 9
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["ARP.Hardware Type"]["expected_values"] == ["1"]
    assert fields["ARP.Protocol Type"]["expected_values"] == ["0x0800"]
    assert fields["ARP.Hardware Size"]["expected_values"] == ["6"]
    assert fields["ARP.Protocol Size"]["expected_values"] == ["4"]
    assert fields["ARP.Operation"]["expected_values"] == ["reply"]
    assert fields["ARP.Sender MAC"]["expected_values"] == ["66:55:44:33:22:11"]
    assert fields["ARP.Sender IP"]["expected_values"] == ["10.0.0.2"]
    assert fields["ARP.Target MAC"]["expected_values"] == ["00:11:22:33:44:55"]
    assert fields["ARP.Target IP"]["expected_values"] == ["10.0.0.1"]


def test_sctp_checksum_expectation_requires_fixed_checksum_covered_fields() -> None:
    fixed_stream = {
        "name": "sctp-checksum",
        "packet_type": "Ethernet/IPv4/SCTP",
        "frame_length_type": "Fixed",
        "frame_length": 128,
        "src_ipv4": "16.0.0.1",
        "dst_ipv4": "48.0.0.1",
        "ipv4_ttl": 64,
        "l4_src_port_override": True,
        "l4_src_port": 5000,
        "l4_dst_port_override": True,
        "l4_dst_port": 6000,
        "sctp_verification_tag": 0x10203040,
        "sctp_checksum_override": True,
        "sctp_checksum": "AABBCCDD",
        "sctp_data_flags": 3,
        "sctp_tsn": 100,
        "sctp_stream_id": 7,
        "sctp_stream_sequence": 9,
        "sctp_payload_protocol_id": 0x11223344,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 18
    assert fields["IPv4.Protocol"]["expected_values"] == ["SCTP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["110"]
    assert fields["SCTP.Checksum"]["expected_values"] == ["0xaabbccdd"]

    ipv6_fixed_stream = {
        **fixed_stream,
        "name": "ipv6-sctp-checksum",
        "packet_type": "Ethernet/IPv6/SCTP",
        "ipv6_src": "2001:db8::10",
        "ipv6_dst": "2001:db8::20",
        "ipv6_traffic_class": 171,
        "ipv6_flow_label": 9029,
        "ipv6_hop_limit": 42,
    }
    ipv6_rows = acceptance.workbench_stream_intent_rows([ipv6_fixed_stream])
    ipv6_fields = {expectation["field"]: expectation for expectation in ipv6_rows[0]["field_expectations"]}
    assert ipv6_rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > SCTP"
    assert ipv6_rows[0]["field_expectation_count"] == 19
    assert ipv6_fields["IPv6.Next Header"]["expected_values"] == ["SCTP"]
    assert ipv6_fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert ipv6_fields["SCTP.Checksum"]["expected_values"] == ["0xaabbccdd"]

    dynamic_stream = {
        **fixed_stream,
        "name": "sctp-dynamic",
        "sctp_verification_tag_mode": "Increment",
        "sctp_verification_tag_count": 4,
        "sctp_verification_tag_step": 1,
    }
    dynamic_rows = acceptance.workbench_stream_intent_rows([dynamic_stream])
    dynamic_fields = {expectation["field"]: expectation for expectation in dynamic_rows[0]["field_expectations"]}
    assert "SCTP.Checksum" not in dynamic_fields


def test_workbench_stream_intent_rows_capture_sctp_minimum_envelope_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "sctp-minimum",
                "packet_type": "Ethernet/IPv4/SCTP",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "l4_src_port_override": True,
                "l4_src_port": 5000,
                "l4_src_port_mode": "Increment",
                "l4_src_port_count": 4,
                "l4_src_port_step": 1,
                "l4_dst_port_override": True,
                "l4_dst_port": 6000,
                "sctp_verification_tag": 0x10203040,
                "sctp_verification_tag_mode": "Increment",
                "sctp_verification_tag_count": 4,
                "sctp_verification_tag_step": 1,
                "sctp_data_flags": 3,
                "sctp_data_flags_mode": "Increment",
                "sctp_data_flags_count": 4,
                "sctp_data_flags_step": 1,
                "sctp_tsn": 100,
                "sctp_tsn_mode": "Increment",
                "sctp_tsn_count": 4,
                "sctp_tsn_step": 1,
                "sctp_stream_id": 7,
                "sctp_stream_sequence": 9,
                "sctp_payload_protocol_id": 0x11223344,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > SCTP"
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Total Length"]["expected_values"] == ["48"]
    assert fields["SCTP.Source Port"]["expected_values"] == ["5000", "5001", "5002", "5003"]
    assert fields["SCTP.Verification Tag"]["expected_values"] == [
        "0x10203040",
        "0x10203041",
        "0x10203042",
        "0x10203043",
    ]
    assert fields["SCTP.Chunk Flags"]["expected_values"] == ["0x03", "0x04", "0x05", "0x06"]
    assert fields["SCTP.Chunk Length"]["expected_values"] == ["16"]
    assert fields["SCTP.TSN"]["expected_values"] == ["100", "101", "102", "103"]
    assert fields["SCTP.Payload Length"]["expected_values"] == ["0"]


def test_workbench_stream_intent_rows_capture_ipv6_sctp_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-sctp-data-fe",
                "packet_type": "Ethernet/IPv6/SCTP",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port_override": True,
                "l4_src_port": 2905,
                "l4_dst_port_override": True,
                "l4_dst_port": 2906,
                "sctp_verification_tag": 0x10203040,
                "sctp_verification_tag_mode": "Increment",
                "sctp_verification_tag_count": 4,
                "sctp_verification_tag_step": 1,
                "sctp_data_flags": 3,
                "sctp_data_flags_mode": "Increment",
                "sctp_data_flags_count": 4,
                "sctp_data_flags_step": 1,
                "sctp_tsn": 100,
                "sctp_tsn_mode": "Increment",
                "sctp_tsn_count": 4,
                "sctp_tsn_step": 1,
                "sctp_stream_id": 7,
                "sctp_stream_id_mode": "Increment",
                "sctp_stream_id_count": 4,
                "sctp_stream_id_step": 1,
                "sctp_stream_sequence": 9,
                "sctp_stream_sequence_mode": "Increment",
                "sctp_stream_sequence_count": 4,
                "sctp_stream_sequence_step": 1,
                "sctp_payload_protocol_id": 0x11223344,
                "sctp_payload_protocol_id_mode": "Increment",
                "sctp_payload_protocol_id_count": 4,
                "sctp_payload_protocol_id_step": 1,
            }
        ]
    )

    assert rows[0]["packet_type"] == "Ethernet/IPv6/SCTP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > SCTP"
    assert rows[0]["field_engines"] == [
        "sctp_data_flags: Increment x4 step 1",
        "sctp_payload_protocol_id: Increment x4 step 1",
        "sctp_stream_id: Increment x4 step 1",
        "sctp_stream_sequence: Increment x4 step 1",
        "sctp_tsn: Increment x4 step 1",
        "sctp_verification_tag: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 18
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Source"]["expected_values"] == ["2001:db8::10"]
    assert fields["IPv6.Destination"]["expected_values"] == ["2001:db8::20"]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["42"]
    assert fields["IPv6.Next Header"]["expected_values"] == ["SCTP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["28"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["SCTP.Source Port"]["expected_values"] == ["2905"]
    assert fields["SCTP.Destination Port"]["expected_values"] == ["2906"]
    assert fields["SCTP.Verification Tag"]["expected_values"] == [
        "0x10203040",
        "0x10203041",
        "0x10203042",
        "0x10203043",
    ]
    assert fields["SCTP.Chunk Type"]["expected_values"] == ["DATA"]
    assert fields["SCTP.Chunk Flags"]["expected_values"] == ["0x03", "0x04", "0x05", "0x06"]
    assert fields["SCTP.Chunk Length"]["expected_values"] == ["16"]
    assert fields["SCTP.TSN"]["expected_values"] == ["100", "101", "102", "103"]
    assert fields["SCTP.Stream ID"]["expected_values"] == ["7", "8", "9", "10"]
    assert fields["SCTP.Stream Sequence"]["expected_values"] == ["9", "10", "11", "12"]
    assert fields["SCTP.Payload Protocol ID"]["expected_values"] == [
        "287454020",
        "287454021",
        "287454022",
        "287454023",
    ]
    assert fields["SCTP.Payload Length"]["expected_values"] == ["0"]
    assert "SCTP.Checksum" not in fields


def test_workbench_stream_intent_rows_capture_ipv6_dns_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-dns-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port_override": True,
                "l4_src_port": 53000,
                "l4_dst_port_override": True,
                "l4_dst_port": 53,
                "dns_enabled": True,
                "dns_transaction_id": 0x1234,
                "dns_transaction_id_mode": "Increment",
                "dns_transaction_id_count": 4,
                "dns_transaction_id_step": 1,
                "dns_flags": "0100",
                "dns_flags_mode": "Increment",
                "dns_flags_count": 2,
                "dns_flags_step": 32768,
                "dns_query_name": "service.example",
                "dns_query_type": 1,
                "dns_query_type_mode": "Increment",
                "dns_query_type_count": 2,
                "dns_query_type_step": 27,
                "dns_query_class": 1,
                "dns_query_class_mode": "Increment",
                "dns_query_class_count": 2,
                "dns_query_class_step": 2,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > UDP > DNS"
    assert rows[0]["field_engines"] == [
        "dns_flags: Increment x2 step 32768",
        "dns_query_class: Increment x2 step 2",
        "dns_query_type: Increment x2 step 27",
        "dns_transaction_id: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 23
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Source"]["expected_values"] == ["2001:db8::10"]
    assert fields["IPv6.Destination"]["expected_values"] == ["2001:db8::20"]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["42"]
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["UDP.Source Port"]["expected_values"] == ["53000"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["53"]
    assert fields["UDP.Length"]["expected_values"] == ["70"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["62"]
    assert fields["DNS.Transaction ID"]["expected_values"] == ["0x1234", "0x1235", "0x1236", "0x1237"]
    assert fields["DNS.Flags"]["expected_values"] == ["0x0100", "0x8100"]
    assert fields["DNS.QR"]["expected_values"] == ["query", "response"]
    assert fields["DNS.Opcode"]["expected_values"] == ["0"]
    assert fields["DNS.Response Code"]["expected_values"] == ["0"]
    assert fields["DNS.Query Name"]["expected_values"] == ["service.example"]
    assert fields["DNS.Query Type"]["expected_values"] == ["A", "AAAA"]
    assert fields["DNS.Query Class"]["expected_values"] == ["IN", "CH"]


def test_workbench_stream_intent_rows_capture_dns_minimum_envelope_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "dns-minimum-report-field-match",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "l4_src_port_override": True,
                "l4_src_port": 53000,
                "l4_dst_port_override": True,
                "l4_dst_port": 53,
                "dns_enabled": True,
                "dns_transaction_id": 0x1234,
                "dns_transaction_id_mode": "Increment",
                "dns_transaction_id_count": 4,
                "dns_transaction_id_step": 1,
                "dns_flags": "0100",
                "dns_flags_mode": "Increment",
                "dns_flags_count": 2,
                "dns_flags_step": 32768,
                "dns_query_name": "service.example",
                "dns_query_type": 1,
                "dns_query_type_mode": "Increment",
                "dns_query_type_count": 2,
                "dns_query_type_step": 27,
                "dns_query_class": 1,
                "dns_query_class_mode": "Increment",
                "dns_query_class_count": 2,
                "dns_query_class_step": 2,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > DNS"
    assert rows[0]["field_engines"] == [
        "dns_flags: Increment x2 step 32768",
        "dns_query_class: Increment x2 step 2",
        "dns_query_type: Increment x2 step 27",
        "dns_transaction_id: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 22
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["61"]
    assert fields["UDP.Source Port"]["expected_values"] == ["53000"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["53"]
    assert fields["UDP.Length"]["expected_values"] == ["41"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["33"]
    assert fields["DNS.Transaction ID"]["expected_values"] == ["0x1234", "0x1235", "0x1236", "0x1237"]
    assert fields["DNS.Flags"]["expected_values"] == ["0x0100", "0x8100"]
    assert fields["DNS.QR"]["expected_values"] == ["query", "response"]
    assert fields["DNS.Opcode"]["expected_values"] == ["0"]
    assert fields["DNS.Response Code"]["expected_values"] == ["0"]
    assert fields["DNS.Query Name"]["expected_values"] == ["service.example"]
    assert fields["DNS.Query Type"]["expected_values"] == ["A", "AAAA"]
    assert fields["DNS.Query Class"]["expected_values"] == ["IN", "CH"]


def test_workbench_stream_intent_rows_capture_dhcp_envelope_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "dhcp-report-field-match",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 320,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "l4_src_port_override": True,
                "l4_src_port": 68,
                "l4_dst_port_override": True,
                "l4_dst_port": 67,
                "dhcp_enabled": True,
                "dhcp_operation": 1,
                "dhcp_operation_mode": "Increment",
                "dhcp_operation_count": 2,
                "dhcp_operation_step": 1,
                "dhcp_hops": 1,
                "dhcp_hops_mode": "Increment",
                "dhcp_hops_count": 4,
                "dhcp_hops_step": 1,
                "dhcp_seconds": 10,
                "dhcp_seconds_mode": "Increment",
                "dhcp_seconds_count": 4,
                "dhcp_seconds_step": 10,
                "dhcp_message_type": 1,
                "dhcp_message_type_mode": "Increment",
                "dhcp_message_type_count": 4,
                "dhcp_message_type_step": 1,
                "dhcp_xid": 0x3903F326,
                "dhcp_xid_mode": "Increment",
                "dhcp_xid_count": 4,
                "dhcp_xid_step": 1,
                "dhcp_flags": "0000",
                "dhcp_flags_mode": "Increment",
                "dhcp_flags_count": 4,
                "dhcp_flags_step": 1,
                "dhcp_client_ip": "192.0.2.20",
                "dhcp_client_ip_mode": "Increment Host",
                "dhcp_client_ip_count": 4,
                "dhcp_client_ip_step": 1,
                "dhcp_your_ip": "192.0.2.30",
                "dhcp_your_ip_mode": "Increment Host",
                "dhcp_your_ip_count": 4,
                "dhcp_your_ip_step": 1,
                "dhcp_server_ip": "192.0.2.40",
                "dhcp_server_ip_mode": "Increment Host",
                "dhcp_server_ip_count": 4,
                "dhcp_server_ip_step": 1,
                "dhcp_relay_ip": "192.0.2.50",
                "dhcp_relay_ip_mode": "Increment Host",
                "dhcp_relay_ip_count": 4,
                "dhcp_relay_ip_step": 1,
                "dhcp_client_mac": "66:55:44:33:22:10",
                "dhcp_client_mac_mode": "Increment",
                "dhcp_client_mac_count": 4,
                "dhcp_client_mac_step": 1,
                "dhcp_hostname": "trex-lab",
                "dhcp_requested_ip": "192.0.2.10",
                "dhcp_requested_ip_mode": "Increment Host",
                "dhcp_requested_ip_count": 4,
                "dhcp_requested_ip_step": 1,
                "dhcp_server_id": "192.0.2.1",
                "dhcp_server_id_mode": "Increment Host",
                "dhcp_server_id_count": 4,
                "dhcp_server_id_step": 1,
                "dhcp_parameter_request_list": "1,3,6,15",
                "dhcp_lease_time": 3600,
                "dhcp_lease_time_mode": "Increment",
                "dhcp_lease_time_count": 4,
                "dhcp_lease_time_step": 60,
                "dhcp_renewal_time": 1800,
                "dhcp_renewal_time_mode": "Increment",
                "dhcp_renewal_time_count": 4,
                "dhcp_renewal_time_step": 30,
                "dhcp_rebinding_time": 3150,
                "dhcp_rebinding_time_mode": "Increment",
                "dhcp_rebinding_time_count": 4,
                "dhcp_rebinding_time_step": 45,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > UDP > DHCP"
    assert rows[0]["field_engines"] == [
        "dhcp_client_ip: Increment Host x4 step 1",
        "dhcp_client_mac: Increment x4 step 1",
        "dhcp_flags: Increment x4 step 1",
        "dhcp_hops: Increment x4 step 1",
        "dhcp_lease_time: Increment x4 step 60",
        "dhcp_message_type: Increment x4 step 1",
        "dhcp_operation: Increment x2 step 1",
        "dhcp_rebinding_time: Increment x4 step 45",
        "dhcp_relay_ip: Increment Host x4 step 1",
        "dhcp_renewal_time: Increment x4 step 30",
        "dhcp_requested_ip: Increment Host x4 step 1",
        "dhcp_seconds: Increment x4 step 10",
        "dhcp_server_id: Increment Host x4 step 1",
        "dhcp_server_ip: Increment Host x4 step 1",
        "dhcp_xid: Increment x4 step 1",
        "dhcp_your_ip: Increment Host x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 31
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Source"]["expected_values"] == ["16.0.0.1"]
    assert fields["IPv4.Destination"]["expected_values"] == ["48.0.0.1"]
    assert fields["IPv4.TTL"]["expected_values"] == ["64"]
    assert fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["328"]
    assert fields["UDP.Source Port"]["expected_values"] == ["68"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["67"]
    assert fields["UDP.Length"]["expected_values"] == ["308"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["300"]
    assert fields["DHCP.Operation"]["expected_values"] == ["request", "reply"]
    assert fields["DHCP.Hops"]["expected_values"] == ["1", "2", "3", "4"]
    assert fields["DHCP.Seconds"]["expected_values"] == ["10", "20", "30", "40"]
    assert fields["DHCP.Transaction ID"]["expected_values"] == [
        "0x3903f326",
        "0x3903f327",
        "0x3903f328",
        "0x3903f329",
    ]
    assert fields["DHCP.Flags"]["expected_values"] == ["0x0000", "0x0001", "0x0002", "0x0003"]
    assert fields["DHCP.Client IP"]["expected_values"] == [
        "192.0.2.20",
        "192.0.2.21",
        "192.0.2.22",
        "192.0.2.23",
    ]
    assert fields["DHCP.Your IP"]["expected_values"] == [
        "192.0.2.30",
        "192.0.2.31",
        "192.0.2.32",
        "192.0.2.33",
    ]
    assert fields["DHCP.Server IP"]["expected_values"] == [
        "192.0.2.40",
        "192.0.2.41",
        "192.0.2.42",
        "192.0.2.43",
    ]
    assert fields["DHCP.Relay IP"]["expected_values"] == [
        "192.0.2.50",
        "192.0.2.51",
        "192.0.2.52",
        "192.0.2.53",
    ]
    assert fields["DHCP.Message Type"]["expected_values"] == ["Discover", "Offer", "Request", "Decline"]
    assert fields["DHCP.Client MAC"]["expected_values"] == [
        "66:55:44:33:22:10",
        "66:55:44:33:22:11",
        "66:55:44:33:22:12",
        "66:55:44:33:22:13",
    ]
    assert fields["DHCP.Hostname"]["expected_values"] == ["trex-lab"]
    assert fields["DHCP.Parameter Request List"]["expected_values"] == ["1,3,6,15"]
    assert fields["DHCP.Requested IP"]["expected_values"] == [
        "192.0.2.10",
        "192.0.2.11",
        "192.0.2.12",
        "192.0.2.13",
    ]
    assert fields["DHCP.Server ID"]["expected_values"] == [
        "192.0.2.1",
        "192.0.2.2",
        "192.0.2.3",
        "192.0.2.4",
    ]
    assert fields["DHCP.Lease Time"]["expected_values"] == ["3600", "3660", "3720", "3780"]
    assert fields["DHCP.Renewal Time"]["expected_values"] == ["1800", "1830", "1860", "1890"]
    assert fields["DHCP.Rebinding Time"]["expected_values"] == ["3150", "3195", "3240", "3285"]


def test_workbench_stream_intent_rows_capture_ipv6_tcp_options_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-tcp-options-fe",
                "packet_type": "Ethernet/IPv6/TCP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port": 1025,
                "l4_dst_port": 12,
                "tcp_sequence_number": 1_234_567,
                "tcp_ack_number": 7_654_321,
                "tcp_window": 9999,
                "tcp_flag_syn": True,
                "tcp_urgent_pointer": 1111,
                "tcp_option_mss_enabled": True,
                "tcp_option_mss": 1460,
                "tcp_option_mss_mode": "Increment",
                "tcp_option_mss_count": 4,
                "tcp_option_mss_step": 1,
                "tcp_option_window_scale_enabled": True,
                "tcp_option_window_scale": 7,
                "tcp_option_window_scale_mode": "Increment",
                "tcp_option_window_scale_count": 4,
                "tcp_option_window_scale_step": 1,
                "tcp_option_sack_permitted_enabled": True,
                "tcp_option_sack_blocks_enabled": True,
                "tcp_option_sack_left_edge": 1000,
                "tcp_option_sack_left_edge_mode": "Increment",
                "tcp_option_sack_left_edge_count": 4,
                "tcp_option_sack_left_edge_step": 1,
                "tcp_option_sack_right_edge": 2000,
                "tcp_option_sack_right_edge_mode": "Increment",
                "tcp_option_sack_right_edge_count": 4,
                "tcp_option_sack_right_edge_step": 1,
                "tcp_option_timestamp_enabled": True,
                "tcp_option_timestamp_value": 123456,
                "tcp_option_timestamp_value_mode": "Increment",
                "tcp_option_timestamp_value_count": 4,
                "tcp_option_timestamp_value_step": 1,
                "tcp_option_timestamp_echo": 654321,
                "tcp_option_timestamp_echo_mode": "Increment",
                "tcp_option_timestamp_echo_count": 4,
                "tcp_option_timestamp_echo_step": 1,
            }
        ]
    )

    assert rows[0]["packet_type"] == "Ethernet/IPv6/TCP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > TCP"
    assert rows[0]["field_engines"] == [
        "tcp_option_mss: Increment x4 step 1",
        "tcp_option_sack_left_edge: Increment x4 step 1",
        "tcp_option_sack_right_edge: Increment x4 step 1",
        "tcp_option_timestamp_echo: Increment x4 step 1",
        "tcp_option_timestamp_value: Increment x4 step 1",
        "tcp_option_window_scale: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 23
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Source"]["expected_values"] == ["2001:db8::10"]
    assert fields["IPv6.Destination"]["expected_values"] == ["2001:db8::20"]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["42"]
    assert fields["IPv6.Next Header"]["expected_values"] == ["TCP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["TCP.Source Port"]["expected_values"] == ["1025"]
    assert fields["TCP.Destination Port"]["expected_values"] == ["12"]
    assert fields["TCP.Header Length"]["expected_values"] == ["52"]
    assert fields["TCP.Payload Length"]["expected_values"] == ["18"]
    assert fields["TCP.Option MSS"]["expected_values"] == ["1460", "1461", "1462", "1463"]
    assert fields["TCP.Option SACK Permitted"]["expected_values"] == ["yes"]
    assert fields["TCP.Option SACK Left Edge"]["expected_values"] == ["1000", "1001", "1002", "1003"]
    assert fields["TCP.Option SACK Right Edge"]["expected_values"] == ["2000", "2001", "2002", "2003"]
    assert fields["TCP.Option Timestamp Value"]["expected_values"] == ["123456", "123457", "123458", "123459"]
    assert fields["TCP.Option Timestamp Echo"]["expected_values"] == ["654321", "654322", "654323", "654324"]
    assert fields["TCP.Option Window Scale"]["expected_values"] == ["7", "8", "9", "10"]
    assert "TCP.Checksum" not in fields


def test_workbench_stream_intent_rows_capture_ipv6_l3_only_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-l3-only-fe",
                "packet_type": "Ethernet/IPv6",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_src_mode": "Increment Host",
                "ipv6_src_count": 4,
                "ipv6_src_step": 1,
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 40,
                "ipv6_hop_limit_mode": "Increment",
                "ipv6_hop_limit_count": 4,
                "ipv6_hop_limit_step": 1,
            }
        ]
    )

    assert rows[0]["packet_type"] == "Ethernet/IPv6"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6"
    assert rows[0]["field_engines"] == [
        "ipv6_hop_limit: Increment x4 step 1",
        "ipv6_src: Increment Host x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 6
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Source"]["expected_values"] == [
        "2001:db8::10",
        "2001:db8::11",
        "2001:db8::12",
        "2001:db8::13",
    ]
    assert fields["IPv6.Destination"]["expected_values"] == ["2001:db8::20"]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["40", "41", "42", "43"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert "IPv6.Next Header" not in fields


def test_workbench_stream_intent_rows_capture_ipv4_l3_only_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv4-l3-only-fe",
                "packet_type": "Ethernet/IPv4",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv4_src": "10.10.0.10",
                "ipv4_src_mode": "Increment Host",
                "ipv4_src_count": 4,
                "ipv4_src_step": 1,
                "ipv4_dst": "10.20.0.20",
                "ipv4_dscp": 10,
                "ipv4_dscp_mode": "Increment",
                "ipv4_dscp_count": 4,
                "ipv4_dscp_step": 1,
                "ipv4_ecn": 3,
                "ipv4_id": 100,
                "ipv4_id_mode": "Increment",
                "ipv4_id_count": 4,
                "ipv4_id_step": 1,
                "ipv4_flag_df": True,
                "ipv4_flag_mf": True,
                "ipv4_fragment_offset": 100,
                "ipv4_fragment_offset_mode": "Increment",
                "ipv4_fragment_offset_count": 4,
                "ipv4_fragment_offset_step": 1,
                "ipv4_ttl": 40,
                "ipv4_ttl_mode": "Increment",
                "ipv4_ttl_count": 4,
                "ipv4_ttl_step": 1,
            }
        ]
    )

    assert rows[0]["packet_type"] == "Ethernet/IPv4"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4"
    assert rows[0]["field_engines"] == [
        "ipv4_dscp: Increment x4 step 1",
        "ipv4_fragment_offset: Increment x4 step 1",
        "ipv4_id: Increment x4 step 1",
        "ipv4_src: Increment Host x4 step 1",
        "ipv4_ttl: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 10
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv4.Source"]["expected_values"] == [
        "10.10.0.10",
        "10.10.0.11",
        "10.10.0.12",
        "10.10.0.13",
    ]
    assert fields["IPv4.Destination"]["expected_values"] == ["10.20.0.20"]
    assert fields["IPv4.TTL"]["expected_values"] == ["40", "41", "42", "43"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["110"]
    assert fields["IPv4.DSCP"]["expected_values"] == ["10", "11", "12", "13"]
    assert fields["IPv4.ECN"]["expected_values"] == ["3"]
    assert fields["IPv4.Identification"]["expected_values"] == ["100", "101", "102", "103"]
    assert fields["IPv4.Flags"]["expected_values"] == ["DF, MF"]
    assert fields["IPv4.Fragment Offset"]["expected_values"] == ["100", "101", "102", "103"]
    assert "IPv4.Protocol" not in fields
    assert "IPv4.Checksum" not in fields


def test_workbench_stream_intent_rows_capture_mpls_stack_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "mpls-stack-fe",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "mpls_enabled": True,
                "mpls_label": 100,
                "mpls_tc": 1,
                "mpls_ttl": 40,
                "mpls_label2_enabled": True,
                "mpls_label2": 200,
                "mpls_label2_mode": "Increment",
                "mpls_label2_count": 4,
                "mpls_label2_step": 1,
                "mpls_label2_tc": 2,
                "mpls_label2_tc_mode": "Increment",
                "mpls_label2_tc_count": 4,
                "mpls_label2_tc_step": 1,
                "mpls_label2_ttl": 50,
                "mpls_label2_ttl_mode": "Increment",
                "mpls_label2_ttl_count": 4,
                "mpls_label2_ttl_step": 1,
                "mpls_label3_enabled": True,
                "mpls_label3": 300,
                "mpls_label3_mode": "Increment",
                "mpls_label3_count": 4,
                "mpls_label3_step": 1,
                "mpls_label3_tc": 3,
                "mpls_label3_tc_mode": "Increment",
                "mpls_label3_tc_count": 4,
                "mpls_label3_tc_step": 1,
                "mpls_label3_ttl": 60,
                "mpls_label3_ttl_mode": "Increment",
                "mpls_label3_ttl_count": 4,
                "mpls_label3_ttl_step": 1,
            }
        ]
    )

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > UDP"
    assert rows[0]["field_engines"] == [
        "mpls_label2: Increment x4 step 1",
        "mpls_label2_tc: Increment x4 step 1",
        "mpls_label2_ttl: Increment x4 step 1",
        "mpls_label3: Increment x4 step 1",
        "mpls_label3_tc: Increment x4 step 1",
        "mpls_label3_ttl: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 22
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["MPLS.Label"]["expected_values"] == ["100"]
    assert fields["MPLS.Traffic Class"]["expected_values"] == ["1"]
    assert fields["MPLS.Bottom Of Stack"]["expected_values"] == ["0"]
    assert fields["MPLS.TTL"]["expected_values"] == ["40"]
    assert fields["MPLS[2].Label"]["expected_values"] == ["200", "201", "202", "203"]
    assert fields["MPLS[2].Traffic Class"]["expected_values"] == ["2", "3", "4", "5"]
    assert fields["MPLS[2].Bottom Of Stack"]["expected_values"] == ["0"]
    assert fields["MPLS[2].TTL"]["expected_values"] == ["50", "51", "52", "53"]
    assert fields["MPLS[3].Label"]["expected_values"] == ["300", "301", "302", "303"]
    assert fields["MPLS[3].Traffic Class"]["expected_values"] == ["3", "4", "5", "6"]
    assert fields["MPLS[3].Bottom Of Stack"]["expected_values"] == ["1"]
    assert fields["MPLS[3].TTL"]["expected_values"] == ["60", "61", "62", "63"]
    assert fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["98"]
    assert fields["UDP.Length"]["expected_values"] == ["78"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["70"]


def test_icmp_echo_expectations_include_header_and_fixed_checksum_fields() -> None:
    fixed_stream = {
        "name": "icmp-checksum",
        "packet_type": "Ethernet/IPv4/ICMP",
        "frame_length_type": "Fixed",
        "frame_length": 96,
        "src_ipv4": "16.0.0.1",
        "dst_ipv4": "48.0.0.1",
        "ipv4_ttl": 64,
        "icmp_type": 8,
        "icmp_code": 0,
        "icmp_checksum_override": True,
        "icmp_checksum": "BEEF",
        "icmp_identifier": 4660,
        "icmp_sequence": 7,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 12
    assert fields["IPv4.Protocol"]["expected_values"] == ["ICMP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["78"]
    assert fields["ICMP.Type"]["expected_values"] == ["8"]
    assert fields["ICMP.Type Name"]["expected_values"] == ["Echo Request"]
    assert fields["ICMP.Code"]["expected_values"] == ["0"]
    assert fields["ICMP.Checksum"]["expected_values"] == ["0xbeef"]
    assert fields["ICMP.Identifier"]["expected_values"] == ["4660"]
    assert fields["ICMP.Sequence"]["expected_values"] == ["7"]

    dynamic_stream = {
        **fixed_stream,
        "name": "icmp-dynamic",
        "icmp_identifier_mode": "Increment",
        "icmp_identifier_count": 4,
        "icmp_identifier_step": 1,
    }
    dynamic_rows = acceptance.workbench_stream_intent_rows([dynamic_stream])
    dynamic_fields = {expectation["field"]: expectation for expectation in dynamic_rows[0]["field_expectations"]}
    assert "ICMP.Checksum" not in dynamic_fields


def test_workbench_stream_intent_rows_capture_icmp_echo_field_engines() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmp-echo-fe",
                "packet_type": "Ethernet/IPv4/ICMP",
                "frame_length_type": "Fixed",
                "frame_length": 96,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "icmp_type": 8,
                "icmp_code": 0,
                "icmp_identifier": 4660,
                "icmp_identifier_mode": "Increment",
                "icmp_identifier_count": 4,
                "icmp_identifier_step": 1,
                "icmp_sequence": 7,
                "icmp_sequence_mode": "Increment",
                "icmp_sequence_count": 4,
                "icmp_sequence_step": 1,
            }
        ]
    )

    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > ICMP"
    assert rows[0]["field_engines"] == [
        "icmp_identifier: Increment x4 step 1",
        "icmp_sequence: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 11
    assert fields["IPv4.Protocol"]["expected_values"] == ["ICMP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["78"]
    assert fields["ICMP.Type"]["expected_values"] == ["8"]
    assert fields["ICMP.Type Name"]["expected_values"] == ["Echo Request"]
    assert fields["ICMP.Code"]["expected_values"] == ["0"]
    assert fields["ICMP.Identifier"]["expected_values"] == ["4660", "4661", "4662", "4663"]
    assert fields["ICMP.Sequence"]["expected_values"] == ["7", "8", "9", "10"]
    assert "ICMP.Checksum" not in fields


def test_workbench_stream_intent_rows_capture_icmp_echo_reply_field_engines() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmp-reply-fe",
                "packet_type": "Ethernet/IPv4/ICMP",
                "frame_length_type": "Fixed",
                "frame_length": 96,
                "ipv4_src": "48.0.0.1",
                "ipv4_dst": "16.0.0.1",
                "ipv4_ttl": 64,
                "icmp_type": 0,
                "icmp_code": 0,
                "icmp_identifier": 4660,
                "icmp_identifier_mode": "Increment",
                "icmp_identifier_count": 4,
                "icmp_identifier_step": 1,
                "icmp_sequence": 7,
                "icmp_sequence_mode": "Increment",
                "icmp_sequence_count": 4,
                "icmp_sequence_step": 1,
            },
            {
                "name": "icmpv6-reply-fe",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 96,
                "ipv6_src": "2001:db8::2",
                "ipv6_dst": "2001:db8::1",
                "ipv6_hop_limit": 64,
                "icmp_type": 129,
                "icmp_code": 0,
                "icmp_identifier": 4660,
                "icmp_identifier_mode": "Increment",
                "icmp_identifier_count": 4,
                "icmp_identifier_step": 1,
                "icmp_sequence": 7,
                "icmp_sequence_mode": "Increment",
                "icmp_sequence_count": 4,
                "icmp_sequence_step": 1,
            },
        ]
    )

    ipv4_fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    ipv6_fields = {expectation["field"]: expectation for expectation in rows[1]["field_expectations"]}
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > ICMP"
    assert rows[0]["field_engines"] == [
        "icmp_identifier: Increment x4 step 1",
        "icmp_sequence: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 11
    assert ipv4_fields["ICMP.Type"]["expected_values"] == ["0"]
    assert ipv4_fields["ICMP.Type Name"]["expected_values"] == ["Echo Reply"]
    assert ipv4_fields["ICMP.Identifier"]["expected_values"] == ["4660", "4661", "4662", "4663"]
    assert ipv4_fields["ICMP.Sequence"]["expected_values"] == ["7", "8", "9", "10"]
    assert "ICMP.Checksum" not in ipv4_fields

    assert rows[1]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[1]["field_engines"] == [
        "icmp_identifier: Increment x4 step 1",
        "icmp_sequence: Increment x4 step 1",
    ]
    assert rows[1]["field_expectation_count"] == 10
    assert ipv6_fields["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert ipv6_fields["IPv6.Payload Length"]["expected_values"] == ["38"]
    assert ipv6_fields["ICMPv6.Type"]["expected_values"] == ["129"]
    assert ipv6_fields["ICMPv6.Type Name"]["expected_values"] == ["Echo Reply"]
    assert ipv6_fields["ICMPv6.Identifier"]["expected_values"] == ["4660", "4661", "4662", "4663"]
    assert ipv6_fields["ICMPv6.Sequence"]["expected_values"] == ["7", "8", "9", "10"]
    assert "ICMPv6.Checksum" not in ipv6_fields


def test_icmpv6_echo_expectations_include_fixed_checksum_fields() -> None:
    fixed_stream = {
        "name": "icmpv6-checksum",
        "packet_type": "Ethernet/IPv6/ICMPv6",
        "frame_length_type": "Fixed",
        "frame_length": 96,
        "ipv6_src": "2001:db8::1",
        "ipv6_dst": "2001:db8::2",
        "ipv6_hop_limit": 64,
        "icmp_type": 128,
        "icmp_code": 0,
        "icmp_checksum_override": True,
        "icmp_checksum": "BEEF",
        "icmp_identifier": 4660,
        "icmp_sequence": 7,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[0]["field_expectation_count"] == 11
    assert fields["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["38"]
    assert fields["ICMPv6.Type"]["expected_values"] == ["128"]
    assert fields["ICMPv6.Type Name"]["expected_values"] == ["Echo Request"]
    assert fields["ICMPv6.Code"]["expected_values"] == ["0"]
    assert fields["ICMPv6.Checksum"]["expected_values"] == ["0xbeef"]
    assert fields["ICMPv6.Identifier"]["expected_values"] == ["4660"]
    assert fields["ICMPv6.Sequence"]["expected_values"] == ["7"]

    dynamic_stream = {
        **fixed_stream,
        "name": "icmpv6-dynamic",
        "ipv6_src_mode": "Increment Host",
        "ipv6_src_count": 4,
        "ipv6_src_step": 1,
    }
    dynamic_rows = acceptance.workbench_stream_intent_rows([dynamic_stream])
    dynamic_fields = {expectation["field"]: expectation for expectation in dynamic_rows[0]["field_expectations"]}
    assert "ICMPv6.Checksum" not in dynamic_fields


def test_icmp_echo_reply_expectations_match_ipv4_and_ipv6_type_names() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmp-reply",
                "packet_type": "Ethernet/IPv4/ICMP",
                "frame_length_type": "Fixed",
                "frame_length": 96,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "icmp_type": 0,
                "icmp_code": 0,
                "icmp_identifier": 4660,
                "icmp_sequence": 7,
            },
            {
                "name": "icmpv6-reply",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 96,
                "ipv6_src": "2001:db8::2",
                "ipv6_dst": "2001:db8::1",
                "ipv6_hop_limit": 64,
                "icmp_type": 129,
                "icmp_code": 0,
                "icmp_identifier": 4660,
                "icmp_sequence": 7,
            },
        ]
    )

    ipv4_fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    ipv6_fields = {expectation["field"]: expectation for expectation in rows[1]["field_expectations"]}

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv4 > ICMP"
    assert rows[0]["field_expectation_count"] == 11
    assert ipv4_fields["IPv4.Protocol"]["expected_values"] == ["ICMP"]
    assert ipv4_fields["IPv4.Total Length"]["expected_values"] == ["78"]
    assert ipv4_fields["ICMP.Type"]["expected_values"] == ["0"]
    assert ipv4_fields["ICMP.Type Name"]["expected_values"] == ["Echo Reply"]
    assert ipv4_fields["ICMP.Code"]["expected_values"] == ["0"]
    assert ipv4_fields["ICMP.Identifier"]["expected_values"] == ["4660"]
    assert ipv4_fields["ICMP.Sequence"]["expected_values"] == ["7"]
    assert "ICMP.Checksum" not in ipv4_fields

    assert rows[1]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[1]["field_expectation_count"] == 10
    assert ipv6_fields["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert ipv6_fields["IPv6.Payload Length"]["expected_values"] == ["38"]
    assert ipv6_fields["ICMPv6.Type"]["expected_values"] == ["129"]
    assert ipv6_fields["ICMPv6.Type Name"]["expected_values"] == ["Echo Reply"]
    assert ipv6_fields["ICMPv6.Code"]["expected_values"] == ["0"]
    assert ipv6_fields["ICMPv6.Identifier"]["expected_values"] == ["4660"]
    assert ipv6_fields["ICMPv6.Sequence"]["expected_values"] == ["7"]
    assert "ICMPv6.Checksum" not in ipv6_fields


def test_ipv4_checksum_expectation_requires_fixed_checksum_covered_fields() -> None:
    fixed_stream = {
        "name": "ipv4-checksum",
        "packet_type": "Ethernet/IPv4/UDP",
        "frame_length_type": "Fixed",
        "frame_length": 128,
        "src_ipv4": "16.0.0.1",
        "dst_ipv4": "48.0.0.1",
        "ipv4_ttl": 64,
        "ipv4_checksum_override": True,
        "ipv4_checksum": "BEEF",
        "l4_src_port": 1025,
        "l4_dst_port": 12,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 11
    assert fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["110"]
    assert fields["IPv4.Checksum"]["expected_values"] == ["0xbeef"]
    assert fields["UDP.Length"]["expected_values"] == ["90"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["82"]

    dynamic_stream = {
        **fixed_stream,
        "name": "ipv4-dynamic",
        "ipv4_ttl_mode": "Increment",
        "ipv4_ttl_count": 4,
        "ipv4_ttl_step": 1,
    }
    dynamic_rows = acceptance.workbench_stream_intent_rows([dynamic_stream])
    dynamic_fields = {expectation["field"]: expectation for expectation in dynamic_rows[0]["field_expectations"]}
    assert "IPv4.Checksum" not in dynamic_fields


def test_ipv6_envelope_expectations_include_fixed_next_header_and_payload_length() -> None:
    fixed_stream = {
        "name": "ipv6-envelope",
        "packet_type": "Ethernet/IPv6/UDP",
        "frame_length_type": "Fixed",
        "frame_length": 128,
        "ipv6_src": "2001:db8::1",
        "ipv6_dst": "2001:db8::2",
        "ipv6_hop_limit": 64,
        "l4_src_port": 1025,
        "l4_dst_port": 12,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 9
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Source"]["expected_values"] == ["2001:db8::1"]
    assert fields["IPv6.Destination"]["expected_values"] == ["2001:db8::2"]
    assert fields["IPv6.Hop Limit"]["expected_values"] == ["64"]
    assert fields["UDP.Source Port"]["expected_values"] == ["1025"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["12"]
    assert fields["UDP.Length"]["expected_values"] == ["70"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["62"]

    variable_stream = {
        **fixed_stream,
        "name": "ipv6-variable",
        "frame_length_type": "Random",
    }
    variable_rows = acceptance.workbench_stream_intent_rows([variable_stream])
    variable_fields = {expectation["field"]: expectation for expectation in variable_rows[0]["field_expectations"]}
    assert "IPv6.Next Header" in variable_fields
    assert "IPv6.Payload Length" not in variable_fields


def test_workbench_stream_intent_rows_capture_ipv6_udp_port_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-udp-port-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port_override": True,
                "l4_src_port": 4000,
                "l4_src_port_mode": "Increment",
                "l4_src_port_count": 4,
                "l4_src_port_step": 1,
                "l4_dst_port_override": True,
                "l4_dst_port": 5000,
                "l4_dst_port_mode": "Increment",
                "l4_dst_port_count": 4,
                "l4_dst_port_step": 1,
            }
        ]
    )
    assert rows[0]["packet_type"] == "Ethernet/IPv6/UDP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > UDP"
    assert rows[0]["field_engines"] == [
        "l4_dst_port: Increment x4 step 1",
        "l4_src_port: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 11
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["UDP.Source Port"]["expected_values"] == ["4000", "4001", "4002", "4003"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["5000", "5001", "5002", "5003"]
    assert fields["UDP.Length"]["expected_values"] == ["70"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["62"]


def test_workbench_stream_intent_rows_capture_ipv6_udp_checksum_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-udp-checksum-fe",
                "packet_type": "Ethernet/IPv6/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port_override": True,
                "l4_src_port": 4000,
                "l4_dst_port_override": True,
                "l4_dst_port": 5000,
                "udp_checksum_override": True,
                "udp_checksum": "BEEF",
                "udp_checksum_mode": "Increment",
                "udp_checksum_count": 4,
                "udp_checksum_step": 1,
            }
        ]
    )
    assert rows[0]["packet_type"] == "Ethernet/IPv6/UDP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > UDP"
    assert rows[0]["field_engines"] == [
        "udp_checksum: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 12
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Next Header"]["expected_values"] == ["UDP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["UDP.Source Port"]["expected_values"] == ["4000"]
    assert fields["UDP.Destination Port"]["expected_values"] == ["5000"]
    assert fields["UDP.Length"]["expected_values"] == ["70"]
    assert fields["UDP.Payload Length"]["expected_values"] == ["62"]
    assert fields["UDP.Checksum"]["expected_values"] == ["0xbeef", "0xbef0", "0xbef1", "0xbef2"]


def test_tcp_envelope_expectations_include_fixed_header_and_payload_length() -> None:
    fixed_stream = {
        "name": "tcp-envelope",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length_type": "Fixed",
        "frame_length": 128,
        "src_ipv4": "16.0.0.1",
        "dst_ipv4": "48.0.0.1",
        "ipv4_ttl": 64,
        "l4_src_port": 1025,
        "l4_dst_port": 12,
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 14
    assert fields["IPv4.Protocol"]["expected_values"] == ["TCP"]
    assert fields["IPv4.Header Length"]["expected_values"] == ["20"]
    assert fields["IPv4.Total Length"]["expected_values"] == ["110"]
    assert fields["TCP.Source Port"]["expected_values"] == ["1025"]
    assert fields["TCP.Destination Port"]["expected_values"] == ["12"]
    assert fields["TCP.Header Length"]["expected_values"] == ["20"]
    assert fields["TCP.Payload Length"]["expected_values"] == ["70"]

    variable_stream = {
        **fixed_stream,
        "name": "tcp-variable",
        "frame_length_type": "Random",
    }
    variable_rows = acceptance.workbench_stream_intent_rows([variable_stream])
    variable_fields = {expectation["field"]: expectation for expectation in variable_rows[0]["field_expectations"]}
    assert "TCP.Header Length" not in variable_fields
    assert "TCP.Payload Length" not in variable_fields


def test_tcp_checksum_expectation_requires_fixed_checksum_covered_fields() -> None:
    fixed_stream = {
        "name": "tcp-checksum",
        "packet_type": "Ethernet/IPv4/TCP",
        "frame_length_type": "Fixed",
        "frame_length": 128,
        "src_ipv4": "16.0.0.1",
        "dst_ipv4": "48.0.0.1",
        "ipv4_ttl": 64,
        "l4_src_port": 1025,
        "l4_dst_port": 12,
        "tcp_sequence_number": 1_234_567,
        "tcp_ack_number": 7_654_321,
        "tcp_window": 9999,
        "tcp_urgent_pointer": 1111,
        "tcp_checksum_override": True,
        "tcp_checksum": "BEEF",
    }
    rows = acceptance.workbench_stream_intent_rows([fixed_stream])
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert rows[0]["field_expectation_count"] == 15
    assert fields["TCP.Header Length"]["expected_values"] == ["20"]
    assert fields["TCP.Payload Length"]["expected_values"] == ["70"]
    assert fields["TCP.Checksum"]["expected_values"] == ["0xbeef"]

    dynamic_stream = {
        **fixed_stream,
        "name": "tcp-dynamic",
        "tcp_window_mode": "Increment",
        "tcp_window_count": 4,
        "tcp_window_step": 1,
    }
    dynamic_rows = acceptance.workbench_stream_intent_rows([dynamic_stream])
    dynamic_fields = {expectation["field"]: expectation for expectation in dynamic_rows[0]["field_expectations"]}
    assert "TCP.Checksum" not in dynamic_fields


def test_ipv6_tcp_checksum_field_engine_expectations() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-tcp-checksum-fe",
                "packet_type": "Ethernet/IPv6/TCP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port": 1025,
                "l4_dst_port": 12,
                "tcp_sequence_number": 1_234_567,
                "tcp_ack_number": 7_654_321,
                "tcp_window": 9999,
                "tcp_flag_syn": True,
                "tcp_urgent_pointer": 1111,
                "tcp_checksum_override": True,
                "tcp_checksum": "BEEF",
                "tcp_checksum_mode": "Increment",
                "tcp_checksum_count": 4,
                "tcp_checksum_step": 1,
            }
        ]
    )
    assert rows[0]["packet_type"] == "Ethernet/IPv6/TCP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > TCP"
    assert rows[0]["field_engines"] == ["tcp_checksum: Increment x4 step 1"]
    assert rows[0]["field_expectation_count"] == 17
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Next Header"]["expected_values"] == ["TCP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["TCP.Source Port"]["expected_values"] == ["1025"]
    assert fields["TCP.Destination Port"]["expected_values"] == ["12"]
    assert fields["TCP.Header Length"]["expected_values"] == ["20"]
    assert fields["TCP.Payload Length"]["expected_values"] == ["50"]
    assert fields["TCP.Flags"]["expected_values"] == ["SYN"]
    assert fields["TCP.Checksum"]["expected_values"] == ["0xbeef", "0xbef0", "0xbef1", "0xbef2"]


def test_ipv6_tcp_header_field_engine_expectations() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-tcp-header-fe",
                "packet_type": "Ethernet/IPv6/TCP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_traffic_class": 171,
                "ipv6_flow_label": 9029,
                "ipv6_hop_limit": 42,
                "l4_src_port": 12345,
                "l4_dst_port": 443,
                "tcp_sequence_number": 1000,
                "tcp_sequence_mode": "Increment",
                "tcp_sequence_count": 4,
                "tcp_sequence_step": 1,
                "tcp_ack_number": 2000,
                "tcp_ack_mode": "Increment",
                "tcp_ack_count": 4,
                "tcp_ack_step": 1,
                "tcp_window": 1024,
                "tcp_window_mode": "Increment",
                "tcp_window_count": 4,
                "tcp_window_step": 1,
                "tcp_flag_syn": True,
                "tcp_flags_mode": "Increment",
                "tcp_flags_count": 4,
                "tcp_flags_step": 1,
                "tcp_urgent_pointer": 20,
                "tcp_urgent_pointer_mode": "Increment",
                "tcp_urgent_pointer_count": 4,
                "tcp_urgent_pointer_step": 1,
            }
        ]
    )
    assert rows[0]["packet_type"] == "Ethernet/IPv6/TCP"
    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > TCP"
    assert rows[0]["field_engines"] == [
        "tcp_ack: Increment x4 step 1",
        "tcp_flags: Increment x4 step 1",
        "tcp_sequence: Increment x4 step 1",
        "tcp_urgent_pointer: Increment x4 step 1",
        "tcp_window: Increment x4 step 1",
    ]
    assert rows[0]["field_expectation_count"] == 16
    fields = {expectation["field"]: expectation for expectation in rows[0]["field_expectations"]}
    assert fields["IPv6.Next Header"]["expected_values"] == ["TCP"]
    assert fields["IPv6.Payload Length"]["expected_values"] == ["70"]
    assert fields["IPv6.Traffic Class"]["expected_values"] == ["171"]
    assert fields["IPv6.Flow Label"]["expected_values"] == ["9029"]
    assert fields["TCP.Source Port"]["expected_values"] == ["12345"]
    assert fields["TCP.Destination Port"]["expected_values"] == ["443"]
    assert fields["TCP.Header Length"]["expected_values"] == ["20"]
    assert fields["TCP.Payload Length"]["expected_values"] == ["50"]
    assert fields["TCP.Sequence"]["expected_values"] == ["1000", "1001", "1002", "1003"]
    assert fields["TCP.Acknowledge"]["expected_values"] == ["2000", "2001", "2002", "2003"]
    assert fields["TCP.Window"]["expected_values"] == ["1024", "1025", "1026", "1027"]
    assert fields["TCP.Flags"]["expected_values"] == ["SYN", "SYN, FIN", "RST", "RST, FIN"]
    assert fields["TCP.Urgent Pointer"]["expected_values"] == ["20", "21", "22", "23"]
    assert "TCP.Checksum" not in fields


def test_capture_layer_match_compares_workbench_intent_to_decode_summary() -> None:
    profile_streams = [
        {
            "enabled": True,
            "expected_layer_chain": "Ethernet > IPv4 > UDP",
        }
    ]
    summary = {
        "layer_chains": ["Ethernet > IPv4 > UDP"],
    }

    match = acceptance.build_capture_layer_match(profile_streams, summary)

    assert match["status"] == "pass"
    assert match["matched"] == ["Ethernet > IPv4 > UDP"]
    assert match["missing"] == []

    mismatch = acceptance.build_capture_layer_match(profile_streams, {"layer_chains": ["Ethernet > IPv4 > TCP"]})
    assert mismatch["status"] == "fail"
    assert mismatch["missing"] == ["Ethernet > IPv4 > UDP"]
    assert mismatch["unexpected"] == ["Ethernet > IPv4 > TCP"]


def test_capture_field_match_compares_workbench_intent_to_decoded_fields() -> None:
    streams = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "gre-inner",
                "packet_type": "Ethernet/IPv4/GRE",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "gre_key_present": True,
                "gre_key": 0x12345678,
                "gre_key_mode": "Increment",
                "gre_key_count": 2,
                "gre_key_step": 1,
                "gre_sequence_present": True,
                "gre_sequence": 7,
                "gre_sequence_mode": "Increment",
                "gre_sequence_count": 2,
                "gre_sequence_step": 1,
                "gre_inner_ipv4_src": "10.2.0.10",
                "gre_inner_ipv4_src_mode": "Increment Host",
                "gre_inner_ipv4_src_count": 2,
                "gre_inner_ipv4_src_step": 1,
                "gre_inner_ipv4_dst": "10.2.0.20",
                "gre_inner_ipv4_dst_mode": "Increment Host",
                "gre_inner_ipv4_dst_count": 2,
                "gre_inner_ipv4_dst_step": 1,
                "gre_inner_ipv4_ttl": 40,
                "gre_inner_ipv4_ttl_mode": "Increment",
                "gre_inner_ipv4_ttl_count": 2,
                "gre_inner_l4_src_port": 32000,
                "gre_inner_l4_src_port_mode": "Increment",
                "gre_inner_l4_src_port_count": 2,
                "gre_inner_l4_dst_port": 32100,
                "gre_inner_l4_dst_port_mode": "Increment",
                "gre_inner_l4_dst_port_count": 2,
            }
        ]
    )
    payload = {
        "data": {
            "packets": [
                {
                    "decoded_layers": [
                        {"name": "Ethernet", "fields": []},
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "16.0.0.1"},
                                {"name": "Destination", "value": "48.0.0.1"},
                                {"name": "Protocol", "value": "GRE"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "60"},
                                {"name": "TTL", "value": "64"},
                            ],
                        },
                        {
                            "name": "GRE",
                            "fields": [
                                {"name": "Flags", "value": "0x3000"},
                                {"name": "Protocol Type", "value": "0x0800"},
                                {"name": "Key", "value": "0x12345678"},
                                {"name": "Sequence", "value": "7"},
                            ],
                        },
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "10.2.0.10"},
                                {"name": "Destination", "value": "10.2.0.20"},
                                {"name": "Protocol", "value": "UDP"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "28"},
                                {"name": "TTL", "value": "40"},
                            ],
                        },
                        {
                            "name": "UDP",
                            "fields": [
                                {"name": "Source Port", "value": "32000"},
                                {"name": "Destination Port", "value": "32100"},
                                {"name": "Length", "value": "8"},
                                {"name": "Payload Length", "value": "0"},
                            ],
                        },
                    ]
                },
                {
                    "decoded_layers": [
                        {"name": "Ethernet", "fields": []},
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "16.0.0.1"},
                                {"name": "Destination", "value": "48.0.0.1"},
                                {"name": "Protocol", "value": "GRE"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "60"},
                                {"name": "TTL", "value": "64"},
                            ],
                        },
                        {
                            "name": "GRE",
                            "fields": [
                                {"name": "Flags", "value": "0x3000"},
                                {"name": "Protocol Type", "value": "0x0800"},
                                {"name": "Key", "value": "0x12345679"},
                                {"name": "Sequence", "value": "8"},
                            ],
                        },
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "10.2.0.11"},
                                {"name": "Destination", "value": "10.2.0.21"},
                                {"name": "Protocol", "value": "UDP"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "28"},
                                {"name": "TTL", "value": "41"},
                            ],
                        },
                        {
                            "name": "UDP",
                            "fields": [
                                {"name": "Source Port", "value": "32001"},
                                {"name": "Destination Port", "value": "32101"},
                                {"name": "Length", "value": "8"},
                                {"name": "Payload Length", "value": "0"},
                            ],
                        },
                    ]
                },
            ]
        }
    }

    summary = acceptance.capture_field_summary(payload)
    match = acceptance.build_capture_field_match(streams, summary)

    assert summary["fields"]["IPv4.Source"] == ["16.0.0.1"]
    assert summary["fields"]["IPv4.Protocol"] == ["GRE"]
    assert summary["fields"]["IPv4.Total Length"] == ["60"]
    assert summary["fields"]["IPv4[2].Source"] == ["10.2.0.10", "10.2.0.11"]
    assert summary["fields"]["IPv4[2].Protocol"] == ["UDP"]
    assert summary["fields"]["IPv4[2].Total Length"] == ["28"]
    assert summary["fields"]["GRE.Key"] == ["0x12345678", "0x12345679"]
    assert summary["fields"]["GRE.Sequence"] == ["7", "8"]
    assert summary["fields"]["UDP.Source Port"] == ["32000", "32001"]
    assert summary["fields"]["UDP.Length"] == ["8"]
    assert summary["fields"]["UDP.Payload Length"] == ["0"]
    assert match["status"] == "pass"
    assert len(match["missing"]) == 0

    mismatch_summary = {"fields": {"IPv4[2].Source": ["10.2.0.10"]}}
    mismatch = acceptance.build_capture_field_match(streams, mismatch_summary)
    assert mismatch["status"] == "fail"
    assert any(item["field"] == "IPv4[2].Source" for item in mismatch["missing"])
    ipv4_source_missing = next(item for item in mismatch["missing"] if item["field"] == "IPv4[2].Source")
    assert ipv4_source_missing["missing_values"] == ["10.2.0.11"]


def test_capture_field_match_includes_gre_checksum_override() -> None:
    streams = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "gre-checksum",
                "packet_type": "Ethernet/IPv4/GRE",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "gre_checksum_present": True,
                "gre_checksum_override": True,
                "gre_checksum": "BEEF",
                "gre_key_present": True,
                "gre_key": 0x12345678,
                "gre_sequence_present": True,
                "gre_sequence": 7,
                "gre_inner_ipv4_src": "10.2.0.10",
                "gre_inner_ipv4_dst": "10.2.0.20",
                "gre_inner_ipv4_ttl": 42,
                "gre_inner_l4_src_port": 32000,
                "gre_inner_l4_dst_port": 32100,
            }
        ]
    )
    gre_fields = {expectation["field"]: expectation for expectation in streams[0]["field_expectations"]}

    assert streams[0]["field_expectation_count"] == 21
    assert gre_fields["GRE.Flags"]["expected_values"] == ["0xb000"]
    assert gre_fields["GRE.Checksum"]["expected_values"] == ["0xbeef"]
    assert gre_fields["GRE.Key"]["expected_values"] == ["0x12345678"]
    assert gre_fields["GRE.Sequence"]["expected_values"] == ["7"]
    assert gre_fields["IPv4[2].Protocol"]["expected_values"] == ["UDP"]
    assert gre_fields["IPv4[2].Total Length"]["expected_values"] == ["74"]
    assert gre_fields["UDP.Length"]["expected_values"] == ["54"]
    assert gre_fields["UDP.Payload Length"]["expected_values"] == ["46"]

    summary = acceptance.capture_field_summary(
        {
            "data": {
                "packets": [
                    {
                        "decoded_layers": [
                            {"name": "Ethernet", "fields": []},
                            {
                                "name": "IPv4",
                                "fields": [
                                    {"name": "Source", "value": "16.0.0.1"},
                                    {"name": "Destination", "value": "48.0.0.1"},
                                    {"name": "Protocol", "value": "GRE"},
                                    {"name": "Header Length", "value": "20"},
                                    {"name": "Total Length", "value": "110"},
                                    {"name": "TTL", "value": "64"},
                                ],
                            },
                            {
                                "name": "GRE",
                                "fields": [
                                    {"name": "Flags", "value": "0xb000"},
                                    {"name": "Protocol Type", "value": "0x0800"},
                                    {"name": "Checksum", "value": "0xbeef"},
                                    {"name": "Key", "value": "0x12345678"},
                                    {"name": "Sequence", "value": "7"},
                                ],
                            },
                            {
                                "name": "IPv4",
                                "fields": [
                                    {"name": "Source", "value": "10.2.0.10"},
                                    {"name": "Destination", "value": "10.2.0.20"},
                                    {"name": "Protocol", "value": "UDP"},
                                    {"name": "Header Length", "value": "20"},
                                    {"name": "Total Length", "value": "74"},
                                    {"name": "TTL", "value": "42"},
                                ],
                            },
                            {
                                "name": "UDP",
                                "fields": [
                                    {"name": "Source Port", "value": "32000"},
                                    {"name": "Destination Port", "value": "32100"},
                                    {"name": "Length", "value": "54"},
                                    {"name": "Payload Length", "value": "46"},
                                ],
                            },
                        ]
                    }
                ]
            }
        }
    )
    match = acceptance.build_capture_field_match(streams, summary)

    assert summary["fields"]["GRE.Checksum"] == ["0xbeef"]
    assert match["status"] == "pass"
    assert match["missing"] == []


def test_capture_field_match_includes_ipv6_gre_outer_fields() -> None:
    streams = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ipv6-gre",
                "packet_type": "Ethernet/IPv6/GRE",
                "frame_length_type": "Fixed",
                "frame_length": 160,
                "ipv6_src": "2001:db8::10",
                "ipv6_dst": "2001:db8::20",
                "ipv6_hop_limit": 42,
                "gre_key_present": True,
                "gre_key": 0x10203040,
                "gre_inner_ipv4_src": "10.2.1.10",
                "gre_inner_ipv4_dst": "10.2.1.20",
                "gre_inner_ipv4_ttl": 64,
                "gre_inner_l4_src_port": 30000,
                "gre_inner_l4_dst_port": 30001,
            }
        ]
    )
    gre_fields = {expectation["field"]: expectation for expectation in streams[0]["field_expectations"]}

    assert streams[0]["expected_layer_chain"] == "Ethernet > IPv6 > GRE > IPv4 > UDP"
    assert streams[0]["field_expectation_count"] == 18
    assert gre_fields["IPv6.Source"]["expected_values"] == ["2001:db8::10"]
    assert gre_fields["IPv6.Destination"]["expected_values"] == ["2001:db8::20"]
    assert gre_fields["IPv6.Hop Limit"]["expected_values"] == ["42"]
    assert gre_fields["IPv6.Next Header"]["expected_values"] == ["GRE"]
    assert gre_fields["IPv6.Payload Length"]["expected_values"] == ["102"]
    assert gre_fields["GRE.Flags"]["expected_values"] == ["0x2000"]
    assert gre_fields["GRE.Key"]["expected_values"] == ["0x10203040"]
    assert gre_fields["IPv4.Protocol"]["expected_values"] == ["UDP"]
    assert gre_fields["IPv4.Total Length"]["expected_values"] == ["94"]
    assert gre_fields["UDP.Length"]["expected_values"] == ["74"]
    assert gre_fields["UDP.Payload Length"]["expected_values"] == ["66"]

    summary = acceptance.capture_field_summary(
        {
            "data": {
                "packets": [
                    {
                        "decoded_layers": [
                            {"name": "Ethernet", "fields": []},
                            {
                                "name": "IPv6",
                                "fields": [
                                    {"name": "Source", "value": "2001:db8::10"},
                                    {"name": "Destination", "value": "2001:db8::20"},
                                    {"name": "Next Header", "value": "GRE"},
                                    {"name": "Payload Length", "value": "102"},
                                    {"name": "Hop Limit", "value": "42"},
                                ],
                            },
                            {
                                "name": "GRE",
                                "fields": [
                                    {"name": "Flags", "value": "0x2000"},
                                    {"name": "Protocol Type", "value": "0x0800"},
                                    {"name": "Key", "value": "0x10203040"},
                                ],
                            },
                            {
                                "name": "IPv4",
                                "fields": [
                                    {"name": "Source", "value": "10.2.1.10"},
                                    {"name": "Destination", "value": "10.2.1.20"},
                                    {"name": "Protocol", "value": "UDP"},
                                    {"name": "Header Length", "value": "20"},
                                    {"name": "Total Length", "value": "94"},
                                    {"name": "TTL", "value": "64"},
                                ],
                            },
                            {
                                "name": "UDP",
                                "fields": [
                                    {"name": "Source Port", "value": "30000"},
                                    {"name": "Destination Port", "value": "30001"},
                                    {"name": "Length", "value": "74"},
                                    {"name": "Payload Length", "value": "66"},
                                ],
                            },
                        ]
                    }
                ]
            }
        }
    )
    match = acceptance.build_capture_field_match(streams, summary)

    assert summary["fields"]["IPv6.Next Header"] == ["GRE"]
    assert match["status"] == "pass"
    assert match["missing"] == []


def test_capture_field_match_includes_explicit_ethernet_mac_fields() -> None:
    streams = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "ethernet-mac",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
                "ether_dst": "02:00:00:00:00:04",
                "ether_dst_mode": "Fixed",
                "ether_src": "02:00:00:00:00:00",
                "ether_src_mode": "Increment",
                "ether_src_count": 2,
                "ether_src_step": 1,
                "src_ipv4": "16.0.0.1",
                "dst_ipv4": "48.0.0.1",
                "ipv4_ttl": 64,
                "l4_src_port": 1025,
                "l4_dst_port": 12,
            },
            {
                "name": "trex-config-mac",
                "packet_type": "Ethernet/IPv4/UDP",
                "frame_length_type": "Fixed",
                "frame_length": 128,
            },
        ]
    )
    explicit_fields = {expectation["field"]: expectation for expectation in streams[0]["field_expectations"]}
    default_fields = {expectation["field"]: expectation for expectation in streams[1]["field_expectations"]}
    assert explicit_fields["Ethernet.Destination"]["expected_values"] == ["02:00:00:00:00:04"]
    assert explicit_fields["Ethernet.Source"]["expected_values"] == [
        "02:00:00:00:00:00",
        "02:00:00:00:00:01",
    ]
    assert "Ethernet.Destination" not in default_fields
    assert "Ethernet.Source" not in default_fields

    payload = {
        "data": {
            "packets": [
                {
                    "decoded_layers": [
                        {
                            "name": "Ethernet",
                            "fields": [
                                {"name": "Destination", "value": "02:00:00:00:00:04"},
                                {"name": "Source", "value": "02:00:00:00:00:00"},
                            ],
                        },
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "16.0.0.1"},
                                {"name": "Destination", "value": "48.0.0.1"},
                                {"name": "Protocol", "value": "UDP"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "110"},
                                {"name": "TTL", "value": "64"},
                            ],
                        },
                        {
                            "name": "UDP",
                            "fields": [
                                {"name": "Source Port", "value": "1025"},
                                {"name": "Destination Port", "value": "12"},
                                {"name": "Length", "value": "90"},
                                {"name": "Payload Length", "value": "82"},
                            ],
                        },
                    ]
                },
                {
                    "decoded_layers": [
                        {
                            "name": "Ethernet",
                            "fields": [
                                {"name": "Destination", "value": "02:00:00:00:00:04"},
                                {"name": "Source", "value": "02:00:00:00:00:01"},
                            ],
                        },
                        {
                            "name": "IPv4",
                            "fields": [
                                {"name": "Source", "value": "16.0.0.1"},
                                {"name": "Destination", "value": "48.0.0.1"},
                                {"name": "Protocol", "value": "UDP"},
                                {"name": "Header Length", "value": "20"},
                                {"name": "Total Length", "value": "110"},
                                {"name": "TTL", "value": "64"},
                            ],
                        },
                        {
                            "name": "UDP",
                            "fields": [
                                {"name": "Source Port", "value": "1025"},
                                {"name": "Destination Port", "value": "12"},
                                {"name": "Length", "value": "90"},
                                {"name": "Payload Length", "value": "82"},
                            ],
                        },
                    ]
                },
            ]
        }
    }

    summary = acceptance.capture_field_summary(payload)
    match = acceptance.build_capture_field_match([streams[0]], summary)

    assert summary["fields"]["Ethernet.Destination"] == ["02:00:00:00:00:04"]
    assert summary["fields"]["Ethernet.Source"] == ["02:00:00:00:00:00", "02:00:00:00:00:01"]
    assert match["status"] == "pass"
    assert {
        item["field"]: item["observed_values"]
        for item in match["matched"]
        if item["field"] in {"Ethernet.Destination", "Ethernet.Source"}
    } == {
        "Ethernet.Destination": ["02:00:00:00:00:04"],
        "Ethernet.Source": ["02:00:00:00:00:00", "02:00:00:00:00:01"],
    }


def test_workbench_stream_intent_rows_capture_icmpv6_router_advertisement_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmpv6-ra",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "ipv6_src": "fe80::1",
                "ipv6_dst": "ff02::1",
                "ipv6_hop_limit": 255,
                "icmp_type": 134,
                "icmp_code": 0,
                "icmpv6_ra_cur_hop_limit": 42,
                "icmpv6_ra_managed": True,
                "icmpv6_ra_other": True,
                "icmpv6_ra_router_lifetime": 900,
                "icmpv6_ra_reachable_time": 1234,
                "icmpv6_ra_retrans_timer": 5678,
                "icmpv6_ra_include_slla": True,
                "icmpv6_ra_slla_mac": "66:55:44:33:22:11",
                "icmpv6_ra_include_prefix": True,
                "icmpv6_ra_prefix": "2001:db8:100::",
                "icmpv6_ra_prefix_length": 64,
                "icmpv6_ra_prefix_on_link": True,
                "icmpv6_ra_prefix_autonomous": False,
                "icmpv6_ra_prefix_valid_lifetime": 3600,
                "icmpv6_ra_prefix_preferred_lifetime": 1800,
            }
        ]
    )

    expectations = rows[0]["field_expectations"]
    by_field = {expectation["field"]: expectation for expectation in expectations}

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[0]["field_expectation_count"] == 21
    assert by_field["IPv6.Source"]["expected_values"] == ["fe80::1"]
    assert by_field["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert by_field["IPv6.Payload Length"]["expected_values"] == ["56"]
    assert by_field["ICMPv6.Type"]["expected_values"] == ["134"]
    assert by_field["ICMPv6.Type Name"]["expected_values"] == ["Router Advertisement"]
    assert by_field["ICMPv6.Current Hop Limit"]["expected_values"] == ["42"]
    assert by_field["ICMPv6.Flags"]["expected_values"] == ["0xc0"]
    assert by_field["ICMPv6.Option MAC"]["expected_values"] == ["66:55:44:33:22:11"]
    assert by_field["ICMPv6.Prefix Flags"]["expected_values"] == ["0x80"]
    assert by_field["ICMPv6.Prefix"]["expected_values"] == ["2001:db8:100::"]
    assert by_field["ICMPv6.Option Type"]["expected_values"] == ["Source Link-Layer Address", "Prefix Information"]


def test_workbench_stream_intent_rows_capture_icmpv6_router_solicitation_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmpv6-rs",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "ipv6_src": "fe80::1",
                "ipv6_dst": "ff02::2",
                "ipv6_hop_limit": 255,
                "icmp_type": 133,
                "icmp_code": 0,
                "icmpv6_rs_include_slla": True,
                "icmpv6_rs_slla_mac": "66:55:44:33:22:11",
            }
        ]
    )

    expectations = rows[0]["field_expectations"]
    by_field = {expectation["field"]: expectation for expectation in expectations}

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[0]["field_expectation_count"] == 12
    assert by_field["IPv6.Source"]["expected_values"] == ["fe80::1"]
    assert by_field["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert by_field["IPv6.Payload Length"]["expected_values"] == ["16"]
    assert by_field["ICMPv6.Type"]["expected_values"] == ["133"]
    assert by_field["ICMPv6.Type Name"]["expected_values"] == ["Router Solicitation"]
    assert by_field["ICMPv6.Code"]["expected_values"] == ["0"]
    assert by_field["ICMPv6.Reserved"]["expected_values"] == ["0x00000000"]
    assert by_field["ICMPv6.Option Type"]["expected_values"] == ["Source Link-Layer Address"]
    assert by_field["ICMPv6.Option Length"]["expected_values"] == ["8"]
    assert by_field["ICMPv6.Option MAC"]["expected_values"] == ["66:55:44:33:22:11"]


def test_workbench_stream_intent_rows_capture_icmpv6_neighbor_solicitation_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmpv6-ns",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "ipv6_src": "fe80::1",
                "ipv6_dst": "ff02::1:ff00:2",
                "ipv6_hop_limit": 255,
                "icmp_type": 135,
                "icmp_code": 0,
                "icmpv6_nd_target": "2001:db8::2",
                "icmpv6_nd_include_option": True,
                "icmpv6_nd_option_mac": "66:55:44:33:22:11",
            }
        ]
    )

    expectations = rows[0]["field_expectations"]
    by_field = {expectation["field"]: expectation for expectation in expectations}

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[0]["field_expectation_count"] == 13
    assert by_field["IPv6.Source"]["expected_values"] == ["fe80::1"]
    assert by_field["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert by_field["IPv6.Payload Length"]["expected_values"] == ["32"]
    assert by_field["ICMPv6.Type"]["expected_values"] == ["135"]
    assert by_field["ICMPv6.Type Name"]["expected_values"] == ["Neighbor Solicitation"]
    assert by_field["ICMPv6.Flags"]["expected_values"] == ["0x00000000"]
    assert by_field["ICMPv6.Target"]["expected_values"] == ["2001:db8::2"]
    assert by_field["ICMPv6.Option Type"]["expected_values"] == ["Source Link-Layer Address"]
    assert by_field["ICMPv6.Option Length"]["expected_values"] == ["8"]
    assert by_field["ICMPv6.Option MAC"]["expected_values"] == ["66:55:44:33:22:11"]


def test_workbench_stream_intent_rows_capture_icmpv6_neighbor_advertisement_fields() -> None:
    rows = acceptance.workbench_stream_intent_rows(
        [
            {
                "name": "icmpv6-na",
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "frame_length_type": "Fixed",
                "frame_length": 64,
                "ipv6_src": "fe80::2",
                "ipv6_dst": "ff02::1",
                "ipv6_hop_limit": 255,
                "icmp_type": 136,
                "icmp_code": 0,
                "icmpv6_nd_target": "2001:db8::2",
                "icmpv6_nd_include_option": True,
                "icmpv6_nd_option_mac": "66:55:44:33:22:11",
                "icmpv6_nd_na_router": True,
                "icmpv6_nd_na_solicited": True,
                "icmpv6_nd_na_override": True,
            }
        ]
    )

    expectations = rows[0]["field_expectations"]
    by_field = {expectation["field"]: expectation for expectation in expectations}

    assert rows[0]["expected_layer_chain"] == "Ethernet > IPv6 > ICMPv6"
    assert rows[0]["field_expectation_count"] == 13
    assert by_field["IPv6.Source"]["expected_values"] == ["fe80::2"]
    assert by_field["IPv6.Next Header"]["expected_values"] == ["ICMPv6"]
    assert by_field["IPv6.Payload Length"]["expected_values"] == ["32"]
    assert by_field["ICMPv6.Type"]["expected_values"] == ["136"]
    assert by_field["ICMPv6.Type Name"]["expected_values"] == ["Neighbor Advertisement"]
    assert by_field["ICMPv6.Flags"]["expected_values"] == ["0xe0000000"]
    assert by_field["ICMPv6.Target"]["expected_values"] == ["2001:db8::2"]
    assert by_field["ICMPv6.Option Type"]["expected_values"] == ["Target Link-Layer Address"]
    assert by_field["ICMPv6.Option Length"]["expected_values"] == ["8"]
    assert by_field["ICMPv6.Option MAC"]["expected_values"] == ["66:55:44:33:22:11"]


def test_total_counter_reads_numeric_total_values() -> None:
    payload = {"data": {"total": {"opackets": "42", "ipackets": 41}}}

    assert acceptance.total_counter(payload, "opackets") == 42
    assert acceptance.total_counter(payload, "ipackets") == 41
    assert acceptance.total_counter(payload, "missing") == 0


def test_compact_stats_sample_summarizes_drop_queue_and_latency() -> None:
    payload = {
        "data": {
            "total": {"opackets": 42, "ipackets": 41, "tx_pps": 10, "rx_pps": 9},
            "global": {"rx_drop_bps": 1000, "queue_full": 2},
            "latency": {
                "7": {"err": {"dropped": 3, "dup": 1}},
                "8": {"errors": {"seq_too_low": "2"}},
            },
        }
    }

    sample = acceptance.compact_stats_sample(payload)

    assert sample["opackets"] == 42
    assert sample["ipackets"] == 41
    assert sample["drop_bps"] == 1000
    assert sample["queue_full"] == 2
    assert sample["latency_errors"] == 6


def test_active_port_ids_ignores_idle_down_and_streams_states() -> None:
    payload = {
        "data": {
            "ports": [
                {"id": 0, "info": {"status": "IDLE"}},
                {"id": 1, "info": {"status": "STREAMS"}},
                {"id": 2, "info": {"status": "TX"}},
                {"id": 3, "info": {"status": "PAUSE"}},
                {"id": 4, "info": {"status": "DOWN"}},
            ]
        }
    }

    assert acceptance.active_port_ids(payload) == {2, 3}


def test_capture_decode_summary_reads_backend_layer_chains() -> None:
    payload = {
        "data": {
            "packets": [
                {
                    "info": "16.0.0.1:2152 -> 48.0.0.1:2152 GTP-U",
                    "binary_base64": "AAAA",
                    "decoded_layers": [
                        {"name": "Ethernet"},
                        {"name": "IPv4"},
                        {"name": "UDP"},
                        {"name": "GTP-U"},
                        {"name": "GTP-U Extension"},
                        {"name": "IPv4"},
                        {"name": "UDP"},
                    ],
                },
                {"info": "short", "decoded_layers": []},
            ]
        }
    }

    summary = acceptance.capture_decode_summary(payload)

    assert summary == {
        "packet_count": 2,
        "decoded_packets": 1,
        "layer_chains": ["Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv4 > UDP"],
        "first_packet_info": "16.0.0.1:2152 -> 48.0.0.1:2152 GTP-U",
    }
    acceptance.ensure_expected_layer_chain(summary, "Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv4 > UDP")
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_expected_layer_chain(summary, "Ethernet > IPv4 > TCP")


def test_report_archive_payload_requires_capture_decode_summary() -> None:
    content = '{"payload":{"capture_decode_summary":{"decoded_packets":1,"layer_chains":["Ethernet > IPv4 > UDP"]}}}'

    summary = acceptance.ensure_report_archive_capture_decode(content, "Ethernet > IPv4 > UDP")

    assert summary["decoded_packets"] == 1

    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_capture_decode('{"payload":{}}', None)
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_capture_decode(content, "Ethernet > IPv4 > TCP")


def test_report_archive_evidence_requires_clean_run_loop() -> None:
    content = """
    {
      "payload": {
        "verdict": "pass",
        "traffic_session": {
          "started_at": "2026-06-05T00:00:00+00:00",
          "ended_at": "2026-06-05T00:00:02+00:00",
          "profile": "udp_1pkt_simple.py",
          "ports": [0],
          "multiplier": "5kpps",
          "start_result": {"ok": true},
          "stop_result": {"ok": true}
        },
        "stats_samples": [
          {"opackets": 10, "ipackets": 10}
        ],
        "stats_after_stop_sample": {"opackets": 10, "ipackets": 10},
        "capture_status_after_stop": {"ok": true, "data": {"captures": []}},
        "ports_after_stop": {
          "ok": true,
          "data": {
            "ports": [
              {"id": 0, "info": {"status": "IDLE"}},
              {"id": 1, "info": {"status": "IDLE"}}
            ]
          }
        }
      }
    }
    """

    evidence = acceptance.ensure_report_archive_run_evidence(content, 0)

    assert evidence["verdict"] == "pass"
    assert evidence["sample_count"] == 1
    assert evidence["traffic_session"]["profile"] == "udp_1pkt_simple.py"

    missing_stop = content.replace('"stop_result": {"ok": true}', '"stop_result": {"ok": false}')
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_run_evidence(missing_stop, 0)

    active_port = content.replace('"status": "IDLE"', '"status": "TX"', 1)
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_run_evidence(active_port, 0)


def test_report_archive_requires_profile_capture_match_when_requested() -> None:
    content = """
    {
      "payload": {
        "profile_streams": [
          {
            "name": "udp",
            "expected_layer_chain": "Ethernet > IPv4 > UDP"
          }
        ],
        "capture_layer_match": {
          "status": "pass",
          "expected": ["Ethernet > IPv4 > UDP"],
          "observed": ["Ethernet > IPv4 > UDP"],
          "matched": ["Ethernet > IPv4 > UDP"],
          "missing": []
        }
      }
    }
    """

    match = acceptance.ensure_report_archive_profile_capture_match(content, True, "Ethernet > IPv4 > UDP")

    assert match["status"] == "pass"

    transparent_match = content.replace(
        '"observed": ["Ethernet > IPv4 > UDP"]',
        '"observed": ["Ethernet > 802.1Q VLAN > 802.1Q VLAN > IPv4 > UDP"]',
    )
    match = acceptance.ensure_report_archive_profile_capture_match(
        transparent_match,
        True,
        "Ethernet > 802.1Q VLAN > 802.1Q VLAN > IPv4 > UDP",
    )

    assert match["status"] == "pass"

    mpls_match = content.replace(
        '"observed": ["Ethernet > IPv4 > UDP"]',
        '"observed": ["Ethernet > MPLS > MPLS > IPv4 > UDP"]',
    )
    match = acceptance.ensure_report_archive_profile_capture_match(
        mpls_match,
        True,
        "Ethernet > MPLS > MPLS > IPv4 > UDP",
    )

    assert match["status"] == "pass"

    missing_match = content.replace('"capture_layer_match"', '"capture_match_missing"')
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_profile_capture_match(missing_match, True, "Ethernet > IPv4 > UDP")

    mismatch = content.replace('"status": "pass"', '"status": "fail"')
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_profile_capture_match(mismatch, True, "Ethernet > IPv4 > UDP")


def test_report_archive_requires_profile_capture_field_match_when_requested() -> None:
    content = """
    {
      "payload": {
        "profile_streams": [
          {
            "name": "udp",
            "field_expectation_count": 1,
            "field_expectations": [
              {
                "field": "IPv4.Source",
                "expected_values": ["16.0.0.1"]
              }
            ]
          }
        ],
        "capture_field_summary": {
          "fields": {
            "IPv4.Source": ["16.0.0.1"]
          }
        },
        "capture_field_match": {
          "status": "pass",
          "matched": [
            {
              "field": "IPv4.Source",
              "expected_values": ["16.0.0.1"],
              "observed_values": ["16.0.0.1"],
              "missing_values": []
            }
          ],
          "missing": []
        }
      }
    }
    """

    match = acceptance.ensure_report_archive_profile_capture_fields(content, True)

    assert match["status"] == "pass"

    missing_match = content.replace('"capture_field_match"', '"capture_field_match_missing"')
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_profile_capture_fields(missing_match, True)

    mismatch = content.replace('"status": "pass"', '"status": "fail"')
    with pytest.raises(acceptance.AcceptanceError):
        acceptance.ensure_report_archive_profile_capture_fields(mismatch, True)


def test_report_archive_rejects_binary_payload_keys() -> None:
    clean = '{"payload":{"capture_decode_summary":{"decoded_packets":1}}}'
    acceptance.ensure_report_archive_has_no_binary_payloads(clean)

    leaked = '{"payload":{"packets":[{"binary_base64":"AAAA"}]}}'
    with pytest.raises(acceptance.AcceptanceError) as exc_info:
        acceptance.ensure_report_archive_has_no_binary_payloads(leaked)

    assert "$.packets[0].binary_base64" in str(exc_info.value.payload["paths"])


def test_report_markdown_summarizes_acceptance_verdict() -> None:
    run = {
        "run_id": "20260605T000000Z",
        "base_url": "http://127.0.0.1",
        "profile": "udp_1pkt_simple.py",
        "tx_port": 0,
        "rx_port": 1,
        "multiplier": "5kpps",
        "duration_seconds": 2,
        "observe_seconds": 1,
        "verdict": "pass",
        "stats_samples": [{"opackets": 10, "ipackets": 10, "drop_bps": 0, "queue_full": 0, "latency_errors": 0}],
        "stats_last": {"data": {"total": {"oerrors": 0, "ierrors": 0}}},
        "capture_stop": {"ok": True, "data": {"packet_count": 3}},
        "capture_decode_summary": {
            "packet_count": 3,
            "decoded_packets": 3,
            "layer_chains": ["Ethernet > IPv4 > UDP"],
            "first_packet_info": "16.0.0.1:1025 -> 48.0.0.1:12",
        },
        "capture_field_summary": {
            "packet_count": 3,
            "decoded_packets": 3,
            "fields": {
                "IPv4.Source": ["16.0.0.1"],
                "UDP.Source Port": ["1025"],
            },
        },
        "profile_streams": [
            {
                "name": "udp",
                "expected_layer_chain": "Ethernet > IPv4 > UDP",
                "field_expectation_count": 1,
                "field_expectations": [
                    {
                        "field": "IPv4.Source",
                        "expected_values": ["16.0.0.1"],
                    }
                ],
            }
        ],
        "capture_layer_match": {
            "status": "pass",
            "summary": "Capture decode matched 1 expected stream layer chain(s)",
            "matched": ["Ethernet > IPv4 > UDP"],
            "missing": [],
        },
        "capture_field_match": {
            "status": "pass",
            "summary": "Capture decode matched 1 expected profile field(s)",
            "matched": [
                {
                    "field": "IPv4.Source",
                    "expected_values": ["16.0.0.1"],
                    "observed_values": ["16.0.0.1"],
                    "missing_values": [],
                }
            ],
            "missing": [],
        },
        "capture_status_after_stop": {"ok": True, "data": {"captures": []}},
        "ports_after_stop": {"ok": True, "data": {"ports": [{"id": 0, "info": {"status": "IDLE"}}]}},
        "report_save": {"ok": True, "data": {"file": {"name": "trex-acceptance.json"}}},
        "traffic_session": {
            "started_at": "2026-06-05T00:00:00+00:00",
            "ended_at": "2026-06-05T00:00:02+00:00",
            "profile": "udp_1pkt_simple.py",
            "ports": [0],
            "multiplier": "5kpps",
            "requested_duration": 2,
            "observe_seconds": 1,
            "tunables": {},
            "start_result": {"ok": True},
            "stop_result": {"ok": True},
        },
    }

    markdown = acceptance.report_markdown(run)

    assert "# TRex Acceptance Run 20260605T000000Z" in markdown
    assert "| Verdict | pass |" in markdown
    assert "| Capture packets | 3 |" in markdown
    assert "| Capture decoded packets | 3 |" in markdown
    assert "| Capture layer chains | Ethernet > IPv4 > UDP |" in markdown
    assert "| Profile streams | 1 |" in markdown
    assert "| Profile/capture match | pass: Capture decode matched 1 expected stream layer chain(s) |" in markdown
    assert "| Profile/capture fields | pass: Capture decode matched 1 expected profile field(s) |" in markdown
    assert "| Traffic stopped | yes |" in markdown
    assert "## Capture Decode" in markdown
    assert "## Capture Fields" in markdown
    assert "## Profile Streams" in markdown
    assert "## Profile/Capture Match" in markdown
    assert "## Profile/Capture Fields" in markdown
    assert '"stop_result": {' in markdown


def test_report_markdown_omits_binary_payloads_from_failure_details() -> None:
    run = {
        "run_id": "20260605T000000Z",
        "base_url": "http://127.0.0.1",
        "profile": "udp_1pkt_simple.py",
        "tx_port": 0,
        "rx_port": 1,
        "multiplier": "5kpps",
        "duration_seconds": 2,
        "observe_seconds": 1,
        "verdict": "fail",
        "stats_samples": [],
        "capture_stop": {"ok": True, "data": {"packet_count": 0}},
        "traffic_session": {"stop_result": None},
        "failure": {
            "stage": "capture stop",
            "payload": {"data": {"saved_file": {"content_base64": "AAAA", "name": "capture.pcap"}}},
        },
    }

    markdown = acceptance.report_markdown(run)

    assert "content_base64" not in markdown
    assert "AAAA" not in markdown
    assert "capture.pcap" in markdown


def test_sanitize_report_payload_removes_capture_binary_content() -> None:
    payload = {
        "packet": {
            "binary_base64": "AAAA",
            "hex_preview": "0000",
            "nested": [{"content_base64": "BBBB", "name": "capture.pcap"}],
        }
    }

    sanitized = acceptance.sanitize_report_payload(payload)

    assert sanitized == {
        "packet": {
            "hex_preview": "0000",
            "nested": [{"name": "capture.pcap"}],
        }
    }
