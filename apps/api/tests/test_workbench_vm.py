from app.trex.workbench_vm import (
    ipv4_field_engine_size_and_init,
    ipv6_field_engine_size_and_init,
    mac_field_engine_size_and_init,
    mpls_label_field_engine_size_and_init,
    workbench_arp_ip_vm_instructions,
    workbench_arp_mac_vm_instructions,
    workbench_arp_operation_vm_instructions,
    workbench_dhcp_bootp_ipv4_vm_instructions,
    workbench_dhcp_bootp_number_vm_instructions,
    workbench_dhcp_client_mac_vm_instructions,
    workbench_dhcp_flags_vm_instructions,
    workbench_dhcp_ipv4_option_vm_instructions,
    workbench_dhcp_message_type_vm_instructions,
    workbench_dhcp_u32_option_vm_instructions,
    workbench_dhcp_xid_vm_instructions,
    workbench_dns_answer_ipv4_vm_instructions,
    workbench_dns_answer_ttl_vm_instructions,
    workbench_dns_flags_vm_instructions,
    workbench_dns_question_field_vm_instructions,
    workbench_dns_transaction_id_vm_instructions,
    workbench_gre_inner_ipv4_address_vm_instructions,
    workbench_gre_inner_ipv4_ttl_vm_instructions,
    workbench_gre_inner_ipv6_address_vm_instructions,
    workbench_gre_inner_ipv6_hop_limit_vm_instructions,
    workbench_gre_inner_l4_port_vm_instructions,
    workbench_gre_number_vm_instructions,
    workbench_gtpu_extension_udp_port_vm_instructions,
    workbench_gtpu_inner_ipv4_address_vm_instructions,
    workbench_gtpu_inner_ipv4_ttl_vm_instructions,
    workbench_gtpu_inner_ipv6_address_vm_instructions,
    workbench_gtpu_inner_ipv6_hop_limit_vm_instructions,
    workbench_gtpu_inner_l4_port_vm_instructions,
    workbench_gtpu_npdu_vm_instructions,
    workbench_gtpu_sequence_vm_instructions,
    workbench_gtpu_teid_vm_instructions,
    workbench_icmp_number_vm_instructions,
    workbench_ipv4_address_vm_instructions,
    workbench_ipv4_dscp_vm_instructions,
    workbench_ipv4_ecn_vm_instructions,
    workbench_ipv4_fragment_offset_vm_instructions,
    workbench_ipv4_id_vm_instructions,
    workbench_ipv4_ttl_vm_instructions,
    workbench_ipv6_address_vm_instructions,
    workbench_ipv6_flow_label_vm_instructions,
    workbench_ipv6_hop_limit_vm_instructions,
    workbench_ipv6_traffic_class_vm_instructions,
    workbench_l4_port_vm_instructions,
    workbench_mac_address_vm_instructions,
    workbench_mpls_label_vm_instructions,
    workbench_mpls_tc_vm_instructions,
    workbench_mpls_ttl_vm_instructions,
    workbench_packet_length_vm_instructions,
    workbench_sctp_number_vm_instructions,
    workbench_sctp_tsn_vm_instructions,
    workbench_tcp_checksum_vm_instructions,
    workbench_tcp_flags_vm_instructions,
    workbench_tcp_number_vm_instructions,
    workbench_tcp_option_mss_vm_instructions,
    workbench_tcp_option_sack_vm_instructions,
    workbench_tcp_option_timestamp_vm_instructions,
    workbench_tcp_option_window_scale_vm_instructions,
    workbench_tcp_urgent_pointer_vm_instructions,
    workbench_tcp_window_vm_instructions,
    workbench_udp_checksum_vm_instructions,
    workbench_udp_length_vm_instructions,
    workbench_vlan_id_vm_instructions,
    workbench_vlan_priority_vm_instructions,
    workbench_vxlan_inner_ipv4_address_vm_instructions,
    workbench_vxlan_inner_ipv4_ttl_vm_instructions,
    workbench_vxlan_inner_ipv6_address_vm_instructions,
    workbench_vxlan_inner_ipv6_hop_limit_vm_instructions,
    workbench_vxlan_inner_l4_port_vm_instructions,
    workbench_vxlan_vni_vm_instructions,
)


def _gre_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/IPv4/GRE",
        "vlan_enabled": False,
        "vlan2_enabled": False,
        "mpls_enabled": False,
        "mpls_label2_enabled": False,
        "mpls_label3_enabled": False,
        "gre_checksum_present": False,
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
        "gre_inner_ip_version": "IPv4",
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
        "gre_inner_ipv6_src": "2001:db8:40::10",
        "gre_inner_ipv6_src_mode": "Increment Host",
        "gre_inner_ipv6_src_count": 4,
        "gre_inner_ipv6_src_step": 1,
        "gre_inner_ipv6_dst": "2001:db8:40::20",
        "gre_inner_ipv6_dst_mode": "Increment Host",
        "gre_inner_ipv6_dst_count": 4,
        "gre_inner_ipv6_dst_step": 1,
        "gre_inner_ipv6_hop_limit": 40,
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


def _gtpu_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/IPv4/UDP",
        "vlan_enabled": False,
        "vlan2_enabled": False,
        "mpls_enabled": False,
        "mpls_label2_enabled": False,
        "mpls_label3_enabled": False,
        "gtpu_enabled": True,
        "gtpu_teid": 0xABCDEF01,
        "gtpu_teid_mode": "Increment",
        "gtpu_teid_count": 4,
        "gtpu_teid_step": 1,
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
        "gtpu_extension_enabled": True,
        "gtpu_extension_udp_port": 65000,
        "gtpu_extension_udp_port_mode": "Increment",
        "gtpu_extension_udp_port_count": 4,
        "gtpu_extension_udp_port_step": 1,
        "gtpu_inner_ip_version": "IPv4",
        "gtpu_inner_ipv4_src": "10.9.0.1",
        "gtpu_inner_ipv4_src_mode": "Increment Host",
        "gtpu_inner_ipv4_src_count": 4,
        "gtpu_inner_ipv4_src_step": 1,
        "gtpu_inner_ipv4_dst": "10.9.0.2",
        "gtpu_inner_ipv4_dst_mode": "Increment Host",
        "gtpu_inner_ipv4_dst_count": 4,
        "gtpu_inner_ipv4_dst_step": 1,
        "gtpu_inner_ipv4_ttl": 40,
        "gtpu_inner_ipv4_ttl_mode": "Increment",
        "gtpu_inner_ipv4_ttl_count": 4,
        "gtpu_inner_ipv4_ttl_step": 1,
        "gtpu_inner_ipv6_src": "2001:db8:10::1",
        "gtpu_inner_ipv6_src_mode": "Increment Host",
        "gtpu_inner_ipv6_src_count": 4,
        "gtpu_inner_ipv6_src_step": 1,
        "gtpu_inner_ipv6_dst": "2001:db8:20::2",
        "gtpu_inner_ipv6_dst_mode": "Increment Host",
        "gtpu_inner_ipv6_dst_count": 4,
        "gtpu_inner_ipv6_dst_step": 1,
        "gtpu_inner_ipv6_hop_limit": 40,
        "gtpu_inner_ipv6_hop_limit_mode": "Increment",
        "gtpu_inner_ipv6_hop_limit_count": 4,
        "gtpu_inner_ipv6_hop_limit_step": 1,
        "gtpu_inner_l4_src_port": 5000,
        "gtpu_inner_l4_src_port_mode": "Increment",
        "gtpu_inner_l4_src_port_count": 4,
        "gtpu_inner_l4_src_port_step": 1,
        "gtpu_inner_l4_dst_port": 6000,
        "gtpu_inner_l4_dst_port_mode": "Increment",
        "gtpu_inner_l4_dst_port_count": 4,
        "gtpu_inner_l4_dst_port_step": 1,
    }


def _vxlan_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/IPv4/UDP",
        "vlan_enabled": False,
        "vlan2_enabled": False,
        "mpls_enabled": False,
        "mpls_label2_enabled": False,
        "mpls_label3_enabled": False,
        "vxlan_enabled": True,
        "vxlan_vni": 4096,
        "vxlan_vni_mode": "Increment",
        "vxlan_vni_count": 4,
        "vxlan_vni_step": 1,
        "vxlan_inner_ip_version": "IPv4",
        "vxlan_inner_ipv4_src": "10.1.0.10",
        "vxlan_inner_ipv4_src_mode": "Increment Host",
        "vxlan_inner_ipv4_src_count": 4,
        "vxlan_inner_ipv4_src_step": 1,
        "vxlan_inner_ipv4_dst": "10.1.0.20",
        "vxlan_inner_ipv4_dst_mode": "Increment Host",
        "vxlan_inner_ipv4_dst_count": 4,
        "vxlan_inner_ipv4_dst_step": 1,
        "vxlan_inner_ipv4_ttl": 40,
        "vxlan_inner_ipv4_ttl_mode": "Increment",
        "vxlan_inner_ipv4_ttl_count": 4,
        "vxlan_inner_ipv4_ttl_step": 1,
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


def _tagged_mpls_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/IPv4/UDP",
        "vlan_enabled": True,
        "vlan_priority": 5,
        "vlan_priority_mode": "Increment",
        "vlan_priority_count": 4,
        "vlan_priority_step": 1,
        "vlan_cfi": 1,
        "vlan_id": 100,
        "vlan_id_mode": "Increment",
        "vlan_id_count": 4,
        "vlan_id_step": 1,
        "vlan2_enabled": True,
        "vlan2_priority": 1,
        "vlan2_priority_mode": "Increment",
        "vlan2_priority_count": 4,
        "vlan2_priority_step": 1,
        "vlan2_cfi": 0,
        "vlan2_id": 200,
        "vlan2_id_mode": "Increment",
        "vlan2_id_count": 4,
        "vlan2_id_step": 1,
        "mpls_enabled": True,
        "mpls_label": 17,
        "mpls_label_mode": "Increment",
        "mpls_label_count": 4,
        "mpls_label_step": 1,
        "mpls_tc": 1,
        "mpls_tc_mode": "Increment",
        "mpls_tc_count": 4,
        "mpls_tc_step": 1,
        "mpls_ttl": 64,
        "mpls_ttl_mode": "Increment",
        "mpls_ttl_count": 4,
        "mpls_ttl_step": 1,
        "mpls_label2_enabled": True,
        "mpls_label2": 300,
        "mpls_label2_mode": "Increment",
        "mpls_label2_count": 4,
        "mpls_label2_step": 1,
        "mpls_label2_tc": 2,
        "mpls_label2_tc_mode": "Increment",
        "mpls_label2_tc_count": 4,
        "mpls_label2_tc_step": 1,
        "mpls_label2_ttl": 63,
        "mpls_label2_ttl_mode": "Increment",
        "mpls_label2_ttl_count": 4,
        "mpls_label2_ttl_step": 1,
        "mpls_label3_enabled": False,
        "ipv4_src": "16.0.0.1",
        "ipv4_src_mode": "Random Host",
        "ipv4_src_count": 4,
        "ipv4_src_step": 1,
        "ipv4_dst": "48.0.0.250",
        "ipv4_dst_mode": "Increment Host",
        "ipv4_dst_count": 16,
        "ipv4_dst_step": 2,
        "ipv6_src": "2001:db8::1",
        "ipv6_src_mode": "Random Host",
        "ipv6_src_count": 4,
        "ipv6_src_step": 1,
        "ipv6_dst": "2001:db8::12f8",
        "ipv6_dst_mode": "Increment Host",
        "ipv6_dst_count": 16,
        "ipv6_dst_step": 2,
    }


def _arp_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/ARP",
        "vlan_enabled": True,
        "vlan2_enabled": True,
        "mpls_enabled": False,
        "mpls_label2_enabled": False,
        "mpls_label3_enabled": False,
        "ether_dst": "00:00:00:00:00:f0",
        "ether_dst_mode": "Increment",
        "ether_dst_count": 16,
        "ether_dst_step": 2,
        "ether_src": "00:11:22:33:44:01",
        "ether_src_mode": "Decrement",
        "ether_src_count": 4,
        "ether_src_step": 1,
        "arp_operation": 1,
        "arp_operation_mode": "Increment",
        "arp_operation_count": 2,
        "arp_operation_step": 1,
        "arp_sender_ip": "10.0.0.1",
        "arp_sender_ip_mode": "Increment Host",
        "arp_sender_ip_count": 4,
        "arp_sender_ip_step": 1,
        "arp_target_ip": "10.0.0.250",
        "arp_target_ip_mode": "Increment Host",
        "arp_target_ip_count": 10,
        "arp_target_ip_step": 1,
        "arp_sender_mac": "00:11:22:33:44:50",
        "arp_sender_mac_mode": "Increment",
        "arp_sender_mac_count": 4,
        "arp_sender_mac_step": 1,
        "arp_target_mac": "00:11:22:33:44:f0",
        "arp_target_mac_mode": "Increment",
        "arp_target_mac_count": 16,
        "arp_target_mac_step": 2,
    }


def _ip_header_stream() -> dict[str, object]:
    stream = _tagged_mpls_stream()
    stream.update(
        {
            "ipv4_id": 100,
            "ipv4_id_mode": "Increment",
            "ipv4_id_count": 4,
            "ipv4_id_step": 1,
            "ipv4_dscp": 10,
            "ipv4_dscp_mode": "Increment",
            "ipv4_dscp_count": 4,
            "ipv4_dscp_step": 1,
            "ipv4_ecn": 0,
            "ipv4_ecn_mode": "Increment",
            "ipv4_ecn_count": 4,
            "ipv4_ecn_step": 1,
            "ipv4_fragment_offset": 100,
            "ipv4_fragment_offset_mode": "Increment",
            "ipv4_fragment_offset_count": 4,
            "ipv4_fragment_offset_step": 1,
            "ipv4_ttl": 40,
            "ipv4_ttl_mode": "Increment",
            "ipv4_ttl_count": 4,
            "ipv4_ttl_step": 1,
            "ipv6_flow_label": 100,
            "ipv6_flow_label_mode": "Increment",
            "ipv6_flow_label_count": 4,
            "ipv6_flow_label_step": 1,
            "ipv6_traffic_class": 10,
            "ipv6_traffic_class_mode": "Increment",
            "ipv6_traffic_class_count": 4,
            "ipv6_traffic_class_step": 1,
            "ipv6_hop_limit": 40,
            "ipv6_hop_limit_mode": "Increment",
            "ipv6_hop_limit_count": 4,
            "ipv6_hop_limit_step": 1,
            "l4_src_port_override": True,
            "l4_src_port": 1025,
            "l4_src_port_mode": "Increment",
            "l4_src_port_count": 4,
            "l4_src_port_step": 1,
            "l4_dst_port_override": True,
            "l4_dst_port": 2048,
            "l4_dst_port_mode": "Decrement",
            "l4_dst_port_count": 4,
            "l4_dst_port_step": 1,
            "udp_length_override": True,
            "udp_length": 64,
            "udp_length_mode": "Increment",
            "udp_length_count": 4,
            "udp_length_step": 1,
            "udp_checksum_override": True,
            "udp_checksum": "BEEF",
            "udp_checksum_mode": "Increment",
            "udp_checksum_count": 4,
            "udp_checksum_step": 1,
            "tcp_window": 1024,
            "tcp_window_mode": "Increment",
            "tcp_window_count": 4,
            "tcp_window_step": 1,
            "tcp_urgent_pointer": 20,
            "tcp_urgent_pointer_mode": "Increment",
            "tcp_urgent_pointer_count": 4,
            "tcp_urgent_pointer_step": 1,
            "tcp_checksum_override": True,
            "tcp_checksum": "BEEF",
            "tcp_checksum_mode": "Increment",
            "tcp_checksum_count": 4,
            "tcp_checksum_step": 1,
            "tcp_sequence_number": 1000,
            "tcp_sequence_mode": "Increment",
            "tcp_sequence_count": 4,
            "tcp_sequence_step": 1,
            "tcp_ack_number": 2000,
            "tcp_ack_mode": "Increment",
            "tcp_ack_count": 4,
            "tcp_ack_step": 1,
            "tcp_flag_urg": False,
            "tcp_flag_ack": False,
            "tcp_flag_psh": False,
            "tcp_flag_rst": False,
            "tcp_flag_syn": True,
            "tcp_flag_fin": False,
            "tcp_flags_mode": "Increment",
            "tcp_flags_count": 4,
            "tcp_flags_step": 1,
        }
    )
    return stream


def _sctp_stream() -> dict[str, object]:
    stream = {**_ip_header_stream(), "packet_type": "Ethernet/IPv4/SCTP"}
    stream.update(
        {
            "sctp_verification_tag": 0x12345678,
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
            "sctp_stream_sequence": 11,
            "sctp_stream_sequence_mode": "Increment",
            "sctp_stream_sequence_count": 4,
            "sctp_stream_sequence_step": 1,
            "sctp_payload_protocol_id": 0,
            "sctp_payload_protocol_id_mode": "Increment",
            "sctp_payload_protocol_id_count": 4,
            "sctp_payload_protocol_id_step": 1,
        }
    )
    return stream


def _icmp_stream() -> dict[str, object]:
    stream = {**_ip_header_stream(), "packet_type": "Ethernet/IPv4/ICMP"}
    stream.update(
        {
            "icmp_type": 8,
            "icmp_type_mode": "Increment",
            "icmp_type_count": 4,
            "icmp_type_step": 1,
            "icmp_code": 0,
            "icmp_code_mode": "Increment",
            "icmp_code_count": 4,
            "icmp_code_step": 1,
            "icmp_identifier": 100,
            "icmp_identifier_mode": "Increment",
            "icmp_identifier_count": 4,
            "icmp_identifier_step": 1,
            "icmp_sequence": 200,
            "icmp_sequence_mode": "Increment",
            "icmp_sequence_count": 4,
            "icmp_sequence_step": 1,
        }
    )
    return stream


def _dns_stream() -> dict[str, object]:
    stream = _ip_header_stream()
    stream.update(
        {
            "dns_enabled": True,
            "dns_query_name": "example.com",
            "dns_transaction_id": 0x1234,
            "dns_transaction_id_mode": "Increment",
            "dns_transaction_id_count": 4,
            "dns_transaction_id_step": 1,
            "dns_flags": "0100",
            "dns_flags_mode": "Increment",
            "dns_flags_count": 2,
            "dns_flags_step": 0x8000,
            "dns_query_type": 1,
            "dns_query_type_mode": "Increment",
            "dns_query_type_count": 4,
            "dns_query_type_step": 1,
            "dns_query_class": 1,
            "dns_query_class_mode": "Increment",
            "dns_query_class_count": 4,
            "dns_query_class_step": 1,
            "dns_answer_enabled": True,
            "dns_answer_ttl": 60,
            "dns_answer_ttl_mode": "Increment",
            "dns_answer_ttl_count": 4,
            "dns_answer_ttl_step": 5,
            "dns_answer_ipv4": "192.0.2.10",
            "dns_answer_ipv4_mode": "Increment Host",
            "dns_answer_ipv4_count": 4,
            "dns_answer_ipv4_step": 1,
        }
    )
    return stream


def _dhcp_stream() -> dict[str, object]:
    stream = _ip_header_stream()
    stream.update(
        {
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
            "dhcp_client_ip": "10.10.0.10",
            "dhcp_client_ip_mode": "Increment Host",
            "dhcp_client_ip_count": 4,
            "dhcp_client_ip_step": 1,
            "dhcp_your_ip": "10.10.0.20",
            "dhcp_your_ip_mode": "Increment Host",
            "dhcp_your_ip_count": 4,
            "dhcp_your_ip_step": 1,
            "dhcp_server_ip": "10.10.0.30",
            "dhcp_server_ip_mode": "Increment Host",
            "dhcp_server_ip_count": 4,
            "dhcp_server_ip_step": 1,
            "dhcp_relay_ip": "10.10.0.40",
            "dhcp_relay_ip_mode": "Increment Host",
            "dhcp_relay_ip_count": 4,
            "dhcp_relay_ip_step": 1,
            "dhcp_client_mac": "00:11:22:33:44:10",
            "dhcp_client_mac_mode": "Increment",
            "dhcp_client_mac_count": 4,
            "dhcp_client_mac_step": 1,
            "dhcp_hostname": "trex-webui",
            "dhcp_requested_ip": "10.0.0.10",
            "dhcp_requested_ip_mode": "Increment Host",
            "dhcp_requested_ip_count": 4,
            "dhcp_requested_ip_step": 1,
            "dhcp_server_id": "10.0.0.1",
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
    )
    return stream


def _tcp_options_stream() -> dict[str, object]:
    stream = {**_ip_header_stream(), "packet_type": "Ethernet/IPv4/TCP"}
    stream.update(
        {
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
    )
    return stream


def test_ip_address_field_engine_suffix_sizes() -> None:
    assert ipv4_field_engine_size_and_init("10.0.0.250", 4) == (1, 250)
    assert ipv4_field_engine_size_and_init("10.0.0.250", 10) == (2, 250)
    assert ipv4_field_engine_size_and_init("10.0.255.250", 10) == (4, 167837690)

    assert ipv6_field_engine_size_and_init("2001:db8::fa", 4) == (1, 250)
    assert ipv6_field_engine_size_and_init("2001:db8::fa", 10) == (2, 250)
    assert ipv6_field_engine_size_and_init("2001:db8::fffa", 10) == (4, 65530)
    assert ipv6_field_engine_size_and_init("2001:db8::ffff:fffa", 10) == (8, 4294967290)


def test_mac_address_vm_instructions_use_suffix_sizes_and_offsets() -> None:
    stream = _arp_stream()
    dst_instructions, dst_name = workbench_mac_address_vm_instructions(stream, "dst")
    src_instructions, src_name = workbench_mac_address_vm_instructions(stream, "src")

    assert mac_field_engine_size_and_init("00:00:00:00:00:f0", 16) == (2, 240)
    assert mac_field_engine_size_and_init("00:11:22:33:44:01", 4) == (1, 1)
    assert dst_name == "mac_dest"
    assert dst_instructions == [
        {
            "init_value": 240,
            "max_value": 255,
            "min_value": 240,
            "name": "mac_dest",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "mac_dest",
            "pkt_offset": 4,
            "type": "write_flow_var",
        },
    ]
    assert src_name == "mac_src"
    assert src_instructions[0]["op"] == "dec"
    assert src_instructions[0]["size"] == 1
    assert src_instructions[1]["pkt_offset"] == 11


def test_arp_vm_instructions_use_tagged_l2_offsets() -> None:
    stream = _arp_stream()
    operation_instructions, operation_name = workbench_arp_operation_vm_instructions(stream)
    sender_ip_instructions, sender_ip_name = workbench_arp_ip_vm_instructions(stream, "sender")
    target_ip_instructions, target_ip_name = workbench_arp_ip_vm_instructions(stream, "target")
    sender_mac_instructions, sender_mac_name = workbench_arp_mac_vm_instructions(stream, "sender")
    target_mac_instructions, target_mac_name = workbench_arp_mac_vm_instructions(stream, "target")

    assert operation_name == "arp_operation"
    assert operation_instructions == [
        {
            "init_value": 1,
            "max_value": 2,
            "min_value": 1,
            "name": "arp_operation",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "arp_operation",
            "pkt_offset": 28,
            "type": "write_flow_var",
        },
    ]
    assert sender_ip_name == "arp_sender_ip"
    assert sender_ip_instructions[1]["pkt_offset"] == 39
    assert target_ip_name == "arp_target_ip"
    assert target_ip_instructions[0]["size"] == 2
    assert target_ip_instructions[1]["pkt_offset"] == 48
    assert sender_mac_name == "arp_sender_mac"
    assert sender_mac_instructions[0]["init_value"] == 80
    assert sender_mac_instructions[1]["pkt_offset"] == 35
    assert target_mac_name == "arp_target_mac"
    assert target_mac_instructions[0]["init_value"] == 0x44F0
    assert target_mac_instructions[1]["pkt_offset"] == 44


def test_vlan_vm_instructions_use_tci_masks_and_offsets() -> None:
    stream = _tagged_mpls_stream()
    priority_instructions, priority_name = workbench_vlan_priority_vm_instructions(stream, 1)
    id_instructions, id_name = workbench_vlan_id_vm_instructions(stream, 2)

    assert priority_name == "vlan_priority"
    assert priority_instructions == [
        {
            "init_value": 5,
            "max_value": 7,
            "min_value": 5,
            "name": "vlan_priority",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xE000,
            "name": "vlan_priority",
            "pkt_cast_size": 2,
            "pkt_offset": 14,
            "shift": 13,
            "type": "write_mask_flow_var",
        },
    ]
    assert id_name == "vlan2_id"
    assert id_instructions[1]["mask"] == 0x0FFF
    assert id_instructions[1]["pkt_offset"] == 18
    assert id_instructions[1]["shift"] == 0


def test_outer_ip_address_vm_instructions_use_encapsulation_offsets() -> None:
    stream = _tagged_mpls_stream()
    ipv4_dst_instructions, ipv4_dst_name = workbench_ipv4_address_vm_instructions(stream, "dst")
    ipv4_src_instructions, ipv4_src_name = workbench_ipv4_address_vm_instructions(stream, "src")
    ipv6_stream = {**stream, "packet_type": "Ethernet/IPv6/UDP"}
    ipv6_dst_instructions, ipv6_dst_name = workbench_ipv6_address_vm_instructions(ipv6_stream, "dst")
    ipv6_src_instructions, ipv6_src_name = workbench_ipv6_address_vm_instructions(ipv6_stream, "src")

    assert ipv4_dst_name == "ip_dest"
    assert ipv4_dst_instructions == [
        {
            "init_value": 250,
            "max_value": 265,
            "min_value": 250,
            "name": "ip_dest",
            "op": "inc",
            "size": 2,
            "step": 2,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "ip_dest",
            "pkt_offset": 48,
            "type": "write_flow_var",
        },
    ]
    assert ipv4_src_name == "ip_src"
    assert ipv4_src_instructions[0]["op"] == "random"
    assert ipv4_src_instructions[1]["pkt_offset"] == 45
    assert ipv6_dst_name == "ipv6_dest"
    assert ipv6_dst_instructions[0]["init_value"] == 4856
    assert ipv6_dst_instructions[1]["pkt_offset"] == 68
    assert ipv6_src_name == "ipv6_src"
    assert ipv6_src_instructions[0]["op"] == "random"
    assert ipv6_src_instructions[1]["pkt_offset"] == 53


def test_ipv4_header_vm_instructions_use_encapsulation_offsets() -> None:
    stream = _ip_header_stream()
    id_instructions, id_name = workbench_ipv4_id_vm_instructions(stream)
    dscp_instructions, dscp_name = workbench_ipv4_dscp_vm_instructions(stream)
    ecn_instructions, ecn_name = workbench_ipv4_ecn_vm_instructions(stream)
    fragment_instructions, fragment_name = workbench_ipv4_fragment_offset_vm_instructions(stream)
    ttl_instructions, ttl_name = workbench_ipv4_ttl_vm_instructions(stream)

    assert id_name == "ip_id"
    assert id_instructions[0]["max_value"] == 103
    assert id_instructions[1]["pkt_offset"] == 34
    assert dscp_name == "ip_dscp"
    assert dscp_instructions[1]["mask"] == 0xFC
    assert dscp_instructions[1]["pkt_offset"] == 31
    assert dscp_instructions[1]["shift"] == 2
    assert ecn_name == "ip_ecn"
    assert ecn_instructions[1]["mask"] == 0x03
    assert ecn_instructions[1]["pkt_offset"] == 31
    assert ecn_instructions[1]["shift"] == 0
    assert fragment_name == "ip_fragment_offset"
    assert fragment_instructions[1]["mask"] == 0x1FFF
    assert fragment_instructions[1]["pkt_offset"] == 36
    assert ttl_name == "ip_ttl"
    assert ttl_instructions[1]["pkt_offset"] == 38


def test_ipv6_header_vm_instructions_use_encapsulation_offsets() -> None:
    stream = {**_ip_header_stream(), "packet_type": "Ethernet/IPv6/UDP"}
    flow_instructions, flow_name = workbench_ipv6_flow_label_vm_instructions(stream)
    traffic_instructions, traffic_name = workbench_ipv6_traffic_class_vm_instructions(stream)
    hop_instructions, hop_name = workbench_ipv6_hop_limit_vm_instructions(stream)

    assert flow_name == "ipv6_flow_label"
    assert flow_instructions[1]["mask"] == 0x000FFFFF
    assert flow_instructions[1]["pkt_offset"] == 30
    assert flow_instructions[1]["shift"] == 0
    assert traffic_name == "ipv6_traffic_class"
    assert traffic_instructions[1]["mask"] == 0x0FF00000
    assert traffic_instructions[1]["pkt_offset"] == 30
    assert traffic_instructions[1]["shift"] == 20
    assert hop_name == "ipv6_hop_limit"
    assert hop_instructions[1]["pkt_offset"] == 37


def test_l4_and_udp_vm_instructions_use_encapsulation_offsets() -> None:
    stream = _ip_header_stream()
    src_instructions, src_name = workbench_l4_port_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_l4_port_vm_instructions(stream, "dst")
    length_instructions, length_name = workbench_udp_length_vm_instructions(stream)
    checksum_instructions, checksum_name = workbench_udp_checksum_vm_instructions(stream)

    assert src_name == "l4_src_port"
    assert src_instructions[0]["max_value"] == 1028
    assert src_instructions[1]["pkt_offset"] == 50
    assert dst_name == "l4_dest_port"
    assert dst_instructions[0]["op"] == "dec"
    assert dst_instructions[1]["pkt_offset"] == 52
    assert length_name == "udp_length"
    assert length_instructions[1]["pkt_offset"] == 54
    assert checksum_name == "udp_checksum"
    assert checksum_instructions[0]["init_value"] == 0xBEEF
    assert checksum_instructions[1]["pkt_offset"] == 56


def test_dns_vm_instructions_use_query_name_offsets() -> None:
    stream = _dns_stream()
    transaction_instructions, transaction_name = workbench_dns_transaction_id_vm_instructions(stream)
    flags_instructions, flags_name = workbench_dns_flags_vm_instructions(stream)
    query_type_instructions, query_type_name = workbench_dns_question_field_vm_instructions(stream, "query_type")
    query_class_instructions, query_class_name = workbench_dns_question_field_vm_instructions(stream, "query_class")
    ttl_instructions, ttl_name = workbench_dns_answer_ttl_vm_instructions(stream)
    answer_ip_instructions, answer_ip_name = workbench_dns_answer_ipv4_vm_instructions(stream)

    assert transaction_name == "dns_transaction_id"
    assert transaction_instructions[0]["init_value"] == 0x1234
    assert transaction_instructions[1]["pkt_offset"] == 58
    assert flags_name == "dns_flags"
    assert flags_instructions[0]["max_value"] == 0x8100
    assert flags_instructions[1]["pkt_offset"] == 60
    assert query_type_name == "dns_query_type"
    assert query_type_instructions[1]["pkt_offset"] == 83
    assert query_class_name == "dns_query_class"
    assert query_class_instructions[1]["pkt_offset"] == 85
    assert ttl_name == "dns_answer_ttl"
    assert ttl_instructions[0]["max_value"] == 75
    assert ttl_instructions[1]["pkt_offset"] == 93
    assert answer_ip_name == "dns_answer_ipv4"
    assert answer_ip_instructions[0]["init_value"] == 10
    assert answer_ip_instructions[1]["pkt_offset"] == 102


def test_dhcp_vm_instructions_use_payload_and_option_offsets() -> None:
    stream = _dhcp_stream()
    operation_instructions, operation_name = workbench_dhcp_bootp_number_vm_instructions(
        stream, "operation", payload_offset=0, size=1
    )
    xid_instructions, xid_name = workbench_dhcp_xid_vm_instructions(stream)
    message_type_instructions, message_type_name = workbench_dhcp_message_type_vm_instructions(stream)
    flags_instructions, flags_name = workbench_dhcp_flags_vm_instructions(stream)
    client_mac_instructions, client_mac_name = workbench_dhcp_client_mac_vm_instructions(stream)
    client_ip_instructions, client_ip_name = workbench_dhcp_bootp_ipv4_vm_instructions(stream, "client_ip")
    requested_ip_instructions, requested_ip_name = workbench_dhcp_ipv4_option_vm_instructions(stream, "requested_ip")
    server_id_instructions, server_id_name = workbench_dhcp_ipv4_option_vm_instructions(stream, "server_id")
    lease_instructions, lease_name = workbench_dhcp_u32_option_vm_instructions(stream, "lease_time")
    renewal_instructions, renewal_name = workbench_dhcp_u32_option_vm_instructions(stream, "renewal_time")
    rebinding_instructions, rebinding_name = workbench_dhcp_u32_option_vm_instructions(stream, "rebinding_time")

    assert operation_name == "dhcp_operation"
    assert operation_instructions[1]["pkt_offset"] == 58
    assert xid_name == "dhcp_xid"
    assert xid_instructions[0]["max_value"] == 0x3903F329
    assert xid_instructions[1]["pkt_offset"] == 62
    assert message_type_name == "dhcp_message_type"
    assert message_type_instructions[1]["pkt_offset"] == 300
    assert flags_name == "dhcp_flags"
    assert flags_instructions[1]["pkt_offset"] == 68
    assert client_mac_name == "dhcp_client_mac"
    assert client_mac_instructions[1]["pkt_offset"] == 91
    assert client_ip_name == "dhcp_client_ip"
    assert client_ip_instructions[1]["pkt_offset"] == 73
    assert requested_ip_name == "dhcp_requested_ip"
    assert requested_ip_instructions[1]["pkt_offset"] == 324
    assert server_id_name == "dhcp_server_id"
    assert server_id_instructions[1]["pkt_offset"] == 330
    assert lease_name == "dhcp_lease_time"
    assert lease_instructions[0]["max_value"] == 3780
    assert lease_instructions[1]["pkt_offset"] == 333
    assert renewal_name == "dhcp_renewal_time"
    assert renewal_instructions[1]["pkt_offset"] == 339
    assert rebinding_name == "dhcp_rebinding_time"
    assert rebinding_instructions[1]["pkt_offset"] == 345


def test_tcp_vm_instructions_use_encapsulation_offsets() -> None:
    stream = {**_ip_header_stream(), "packet_type": "Ethernet/IPv4/TCP"}
    sequence_instructions, sequence_name = workbench_tcp_number_vm_instructions(stream, "sequence")
    ack_instructions, ack_name = workbench_tcp_number_vm_instructions(stream, "ack")
    window_instructions, window_name = workbench_tcp_window_vm_instructions(stream)
    urgent_instructions, urgent_name = workbench_tcp_urgent_pointer_vm_instructions(stream)
    checksum_instructions, checksum_name = workbench_tcp_checksum_vm_instructions(stream)
    flags_instructions, flags_name = workbench_tcp_flags_vm_instructions(stream)

    assert sequence_name == "tcp_sequence"
    assert sequence_instructions[0]["max_value"] == 1003
    assert sequence_instructions[1]["pkt_offset"] == 54
    assert ack_name == "tcp_ack"
    assert ack_instructions[0]["init_value"] == 2000
    assert ack_instructions[1]["pkt_offset"] == 58
    assert window_name == "tcp_window"
    assert window_instructions[0]["max_value"] == 1027
    assert window_instructions[1]["pkt_offset"] == 64
    assert urgent_name == "tcp_urgent_pointer"
    assert urgent_instructions[1]["pkt_offset"] == 68
    assert checksum_name == "tcp_checksum"
    assert checksum_instructions[0]["init_value"] == 0xBEEF
    assert checksum_instructions[1]["pkt_offset"] == 66
    assert flags_name == "tcp_flags"
    assert flags_instructions[0]["init_value"] == 0x02
    assert flags_instructions[1]["mask"] == 0x3F
    assert flags_instructions[1]["pkt_offset"] == 63


def test_tcp_option_vm_instructions_use_option_value_offsets() -> None:
    stream = _tcp_options_stream()
    mss_instructions, mss_name = workbench_tcp_option_mss_vm_instructions(stream)
    sack_left_instructions, sack_left_name = workbench_tcp_option_sack_vm_instructions(stream, "left_edge")
    sack_right_instructions, sack_right_name = workbench_tcp_option_sack_vm_instructions(stream, "right_edge")
    timestamp_value_instructions, timestamp_value_name = workbench_tcp_option_timestamp_vm_instructions(
        stream, "value"
    )
    timestamp_echo_instructions, timestamp_echo_name = workbench_tcp_option_timestamp_vm_instructions(
        stream, "echo"
    )
    window_scale_instructions, window_scale_name = workbench_tcp_option_window_scale_vm_instructions(stream)

    assert mss_name == "tcp_option_mss"
    assert mss_instructions[0]["max_value"] == 1463
    assert mss_instructions[1]["pkt_offset"] == 72
    assert sack_left_name == "tcp_option_sack_left_edge"
    assert sack_left_instructions[1]["pkt_offset"] == 78
    assert sack_right_name == "tcp_option_sack_right_edge"
    assert sack_right_instructions[1]["pkt_offset"] == 82
    assert timestamp_value_name == "tcp_option_timestamp_value"
    assert timestamp_value_instructions[1]["pkt_offset"] == 90
    assert timestamp_echo_name == "tcp_option_timestamp_echo"
    assert timestamp_echo_instructions[1]["pkt_offset"] == 94
    assert window_scale_name == "tcp_option_window_scale"
    assert window_scale_instructions[0]["max_value"] == 10
    assert window_scale_instructions[1]["pkt_offset"] == 101


def test_sctp_vm_instructions_use_encapsulation_offsets() -> None:
    stream = _sctp_stream()
    verification_instructions, verification_name = workbench_sctp_number_vm_instructions(stream, "verification_tag")
    flags_instructions, flags_name = workbench_sctp_number_vm_instructions(stream, "data_flags")
    tsn_instructions, tsn_name = workbench_sctp_tsn_vm_instructions(stream)
    stream_id_instructions, stream_id_name = workbench_sctp_number_vm_instructions(stream, "stream_id")
    sequence_instructions, sequence_name = workbench_sctp_number_vm_instructions(stream, "stream_sequence")
    protocol_instructions, protocol_name = workbench_sctp_number_vm_instructions(stream, "payload_protocol_id")

    assert verification_name == "sctp_verification_tag"
    assert verification_instructions[0]["init_value"] == 0x12345678
    assert verification_instructions[1]["pkt_offset"] == 54
    assert flags_name == "sctp_data_flags"
    assert flags_instructions[0]["size"] == 1
    assert flags_instructions[1]["pkt_offset"] == 63
    assert tsn_name == "sctp_tsn"
    assert tsn_instructions[0]["max_value"] == 103
    assert tsn_instructions[1]["pkt_offset"] == 66
    assert stream_id_name == "sctp_stream_id"
    assert stream_id_instructions[0]["size"] == 2
    assert stream_id_instructions[1]["pkt_offset"] == 70
    assert sequence_name == "sctp_stream_sequence"
    assert sequence_instructions[1]["pkt_offset"] == 72
    assert protocol_name == "sctp_payload_protocol_id"
    assert protocol_instructions[1]["pkt_offset"] == 74


def test_icmp_vm_instructions_use_encapsulation_offsets() -> None:
    stream = _icmp_stream()
    type_instructions, type_name = workbench_icmp_number_vm_instructions(stream, "type")
    code_instructions, code_name = workbench_icmp_number_vm_instructions(stream, "code")
    identifier_instructions, identifier_name = workbench_icmp_number_vm_instructions(stream, "identifier")
    sequence_instructions, sequence_name = workbench_icmp_number_vm_instructions(stream, "sequence")

    assert type_name == "icmp_type"
    assert type_instructions[0]["init_value"] == 8
    assert type_instructions[1]["pkt_offset"] == 50
    assert code_name == "icmp_code"
    assert code_instructions[0]["size"] == 1
    assert code_instructions[1]["pkt_offset"] == 51
    assert identifier_name == "icmp_identifier"
    assert identifier_instructions[0]["max_value"] == 103
    assert identifier_instructions[1]["pkt_offset"] == 54
    assert sequence_name == "icmp_sequence"
    assert sequence_instructions[1]["pkt_offset"] == 56


def test_packet_length_vm_instructions_update_ip_and_udp_lengths() -> None:
    stream = {**_ip_header_stream(), "frame_length_type": "Increment", "frame_length_min": 64, "frame_length_max": 128}

    instructions = workbench_packet_length_vm_instructions(stream)

    assert instructions == [
        {
            "init_value": 60,
            "max_value": 124,
            "min_value": 60,
            "name": "pkt_len",
            "op": "inc",
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
        {
            "add_value": -30,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 32,
            "type": "write_flow_var",
        },
        {
            "add_value": -50,
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": 54,
            "type": "write_flow_var",
        },
    ]


def test_mpls_vm_instructions_use_stack_offsets_and_masks() -> None:
    stream = _tagged_mpls_stream()
    label_instructions, label_name = workbench_mpls_label_vm_instructions(stream, 1)
    tc_instructions, tc_name = workbench_mpls_tc_vm_instructions(stream, 2)
    ttl_instructions, ttl_name = workbench_mpls_ttl_vm_instructions(stream, 2)

    assert mpls_label_field_engine_size_and_init(17, 4) == (1, 17)
    assert label_name == "mpls_label"
    assert label_instructions == [
        {
            "init_value": 17,
            "max_value": 20,
            "min_value": 17,
            "name": "mpls_label",
            "op": "inc",
            "size": 1,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFF000,
            "name": "mpls_label",
            "pkt_cast_size": 4,
            "pkt_offset": 22,
            "shift": 12,
            "type": "write_mask_flow_var",
        },
    ]
    assert tc_name == "mpls_label2_tc"
    assert tc_instructions[1]["mask"] == 0x00000E00
    assert tc_instructions[1]["pkt_offset"] == 26
    assert tc_instructions[1]["shift"] == 9
    assert ttl_name == "mpls_label2_ttl"
    assert ttl_instructions[1]["pkt_offset"] == 29
    assert ttl_instructions[1]["type"] == "write_flow_var"


def test_gre_number_vm_instructions_use_layout_offsets() -> None:
    key_instructions, key_name = workbench_gre_number_vm_instructions(_gre_stream(), "key")
    sequence_instructions, sequence_name = workbench_gre_number_vm_instructions(_gre_stream(), "sequence")

    assert key_name == "gre_key"
    assert key_instructions == [
        {
            "init_value": 0x12345678,
            "max_value": 0x1234567B,
            "min_value": 0x12345678,
            "name": "gre_key",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": "gre_key",
            "pkt_offset": 38,
            "type": "write_flow_var",
        },
    ]
    assert sequence_name == "gre_sequence"
    assert sequence_instructions[1]["pkt_offset"] == 42


def test_gre_inner_ipv4_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = _gre_stream()
    src_instructions, src_name = workbench_gre_inner_ipv4_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_gre_inner_ipv4_address_vm_instructions(stream, "dst")
    ttl_instructions, ttl_name = workbench_gre_inner_ipv4_ttl_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_gre_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_gre_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "gre_inner_ipv4_src"
    assert src_instructions[0]["init_value"] == 10
    assert src_instructions[1]["pkt_offset"] == 61
    assert dst_name == "gre_inner_ipv4_dst"
    assert dst_instructions[0]["init_value"] == 20
    assert dst_instructions[1]["pkt_offset"] == 65
    assert ttl_name == "gre_inner_ipv4_ttl"
    assert ttl_instructions[1]["pkt_offset"] == 54
    assert l4_src_name == "gre_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 66
    assert l4_dst_name == "gre_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 68


def test_gre_inner_ipv6_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = {**_gre_stream(), "gre_inner_ip_version": "IPv6"}
    src_instructions, src_name = workbench_gre_inner_ipv6_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_gre_inner_ipv6_address_vm_instructions(stream, "dst")
    hop_instructions, hop_name = workbench_gre_inner_ipv6_hop_limit_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_gre_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_gre_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "gre_inner_ipv6_src"
    assert src_instructions[0]["init_value"] == 16
    assert src_instructions[1]["pkt_offset"] == 69
    assert dst_name == "gre_inner_ipv6_dst"
    assert dst_instructions[0]["init_value"] == 32
    assert dst_instructions[1]["pkt_offset"] == 85
    assert hop_name == "gre_inner_ipv6_hop_limit"
    assert hop_instructions[1]["pkt_offset"] == 53
    assert l4_src_name == "gre_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 86
    assert l4_dst_name == "gre_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 88


def test_gtpu_outer_vm_instructions_use_optional_extension_offsets() -> None:
    stream = _gtpu_stream()
    teid_instructions, teid_name = workbench_gtpu_teid_vm_instructions(stream)
    sequence_instructions, sequence_name = workbench_gtpu_sequence_vm_instructions(stream)
    npdu_instructions, npdu_name = workbench_gtpu_npdu_vm_instructions(stream)
    extension_instructions, extension_name = workbench_gtpu_extension_udp_port_vm_instructions(stream)

    assert teid_name == "gtpu_teid"
    assert teid_instructions[0]["init_value"] == 0xABCDEF01
    assert teid_instructions[1]["pkt_offset"] == 46
    assert sequence_name == "gtpu_sequence"
    assert sequence_instructions[1]["pkt_offset"] == 50
    assert npdu_name == "gtpu_npdu"
    assert npdu_instructions[1]["pkt_offset"] == 52
    assert extension_name == "gtpu_extension_udp_port"
    assert extension_instructions[1]["pkt_offset"] == 55


def test_gtpu_inner_ipv4_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = _gtpu_stream()
    src_instructions, src_name = workbench_gtpu_inner_ipv4_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_gtpu_inner_ipv4_address_vm_instructions(stream, "dst")
    ttl_instructions, ttl_name = workbench_gtpu_inner_ipv4_ttl_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_gtpu_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_gtpu_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "gtpu_inner_ipv4_src"
    assert src_instructions[0]["init_value"] == 1
    assert src_instructions[1]["pkt_offset"] == 73
    assert dst_name == "gtpu_inner_ipv4_dst"
    assert dst_instructions[0]["init_value"] == 2
    assert dst_instructions[1]["pkt_offset"] == 77
    assert ttl_name == "gtpu_inner_ipv4_ttl"
    assert ttl_instructions[1]["pkt_offset"] == 66
    assert l4_src_name == "gtpu_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 78
    assert l4_dst_name == "gtpu_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 80


def test_gtpu_inner_ipv6_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = {**_gtpu_stream(), "gtpu_inner_ip_version": "IPv6"}
    src_instructions, src_name = workbench_gtpu_inner_ipv6_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_gtpu_inner_ipv6_address_vm_instructions(stream, "dst")
    hop_instructions, hop_name = workbench_gtpu_inner_ipv6_hop_limit_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_gtpu_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_gtpu_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "gtpu_inner_ipv6_src"
    assert src_instructions[0]["init_value"] == 1
    assert src_instructions[1]["pkt_offset"] == 81
    assert dst_name == "gtpu_inner_ipv6_dst"
    assert dst_instructions[0]["init_value"] == 2
    assert dst_instructions[1]["pkt_offset"] == 97
    assert hop_name == "gtpu_inner_ipv6_hop_limit"
    assert hop_instructions[1]["pkt_offset"] == 65
    assert l4_src_name == "gtpu_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 98
    assert l4_dst_name == "gtpu_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 100


def test_vxlan_vni_vm_instructions_use_vni_mask_offset() -> None:
    instructions, variable_name = workbench_vxlan_vni_vm_instructions(_vxlan_stream())

    assert variable_name == "vxlan_vni"
    assert instructions == [
        {
            "init_value": 4096,
            "max_value": 4099,
            "min_value": 4096,
            "name": "vxlan_vni",
            "op": "inc",
            "size": 4,
            "step": 1,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFFF00,
            "name": "vxlan_vni",
            "pkt_cast_size": 4,
            "pkt_offset": 46,
            "shift": 8,
            "type": "write_mask_flow_var",
        },
    ]


def test_vxlan_inner_ipv4_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = _vxlan_stream()
    src_instructions, src_name = workbench_vxlan_inner_ipv4_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_vxlan_inner_ipv4_address_vm_instructions(stream, "dst")
    ttl_instructions, ttl_name = workbench_vxlan_inner_ipv4_ttl_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_vxlan_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_vxlan_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "vxlan_inner_ipv4_src"
    assert src_instructions[0]["init_value"] == 10
    assert src_instructions[1]["pkt_offset"] == 79
    assert dst_name == "vxlan_inner_ipv4_dst"
    assert dst_instructions[0]["init_value"] == 20
    assert dst_instructions[1]["pkt_offset"] == 83
    assert ttl_name == "vxlan_inner_ipv4_ttl"
    assert ttl_instructions[1]["pkt_offset"] == 72
    assert l4_src_name == "vxlan_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 84
    assert l4_dst_name == "vxlan_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 86


def test_vxlan_inner_ipv6_and_l4_vm_instructions_use_inner_offsets() -> None:
    stream = {**_vxlan_stream(), "vxlan_inner_ip_version": "IPv6"}
    src_instructions, src_name = workbench_vxlan_inner_ipv6_address_vm_instructions(stream, "src")
    dst_instructions, dst_name = workbench_vxlan_inner_ipv6_address_vm_instructions(stream, "dst")
    hop_instructions, hop_name = workbench_vxlan_inner_ipv6_hop_limit_vm_instructions(stream)
    l4_src_instructions, l4_src_name = workbench_vxlan_inner_l4_port_vm_instructions(stream, "src")
    l4_dst_instructions, l4_dst_name = workbench_vxlan_inner_l4_port_vm_instructions(stream, "dst")

    assert src_name == "vxlan_inner_ipv6_src"
    assert src_instructions[0]["init_value"] == 16
    assert src_instructions[1]["pkt_offset"] == 87
    assert dst_name == "vxlan_inner_ipv6_dst"
    assert dst_instructions[0]["init_value"] == 32
    assert dst_instructions[1]["pkt_offset"] == 103
    assert hop_name == "vxlan_inner_ipv6_hop_limit"
    assert hop_instructions[1]["pkt_offset"] == 71
    assert l4_src_name == "vxlan_inner_udp_src"
    assert l4_src_instructions[1]["pkt_offset"] == 104
    assert l4_dst_name == "vxlan_inner_udp_dst"
    assert l4_dst_instructions[1]["pkt_offset"] == 106
