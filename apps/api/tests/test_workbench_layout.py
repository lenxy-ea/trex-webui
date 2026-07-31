from app.trex.workbench_layout import (
    workbench_default_outer_ether_type_for_fields,
    workbench_ether_type_override,
    workbench_gre_header_length,
    workbench_gre_inner_checksum_instruction,
    workbench_gre_inner_ipv4_offset,
    workbench_gre_option_offset,
    workbench_gtpu_extension_header_length,
    workbench_gtpu_extension_header_offset,
    workbench_gtpu_inner_ipv4_offset,
    workbench_gtpu_optional_header_length,
    workbench_gtpu_optional_header_offset,
    workbench_gtpu_teid_offset,
    workbench_icmp_header_length,
    workbench_inner_ether_type,
    workbench_ip_offset,
    workbench_l2_header_length,
    workbench_l3_ether_type,
    workbench_mpls_field_enabled,
    workbench_mpls_index_offset,
    workbench_mpls_label_field_name,
    workbench_mpls_offset,
    workbench_mpls_stack,
    workbench_mpls_tc_field_name,
    workbench_mpls_ttl_field_name,
    workbench_outer_ether_type,
    workbench_vlan_cfi_field_name,
    workbench_vlan_field_enabled,
    workbench_vlan_id_field_name,
    workbench_vlan_index_offset,
    workbench_vlan_priority_field_name,
    workbench_vlan_tag_count,
    workbench_vlan_tci,
    workbench_vlan_tpid,
    workbench_vlan_tpid_field_name,
    workbench_vlan_tpid_override_field_name,
    workbench_vxlan_inner_ip_version,
    workbench_vxlan_inner_ipv4_offset,
    workbench_vxlan_vni_offset,
    workbench_sctp_header_length,
)


def _base_stream() -> dict[str, object]:
    return {
        "packet_type": "Ethernet/IPv4/UDP",
        "vlan_enabled": False,
        "vlan2_enabled": False,
        "mpls_enabled": False,
        "mpls_label2_enabled": False,
        "mpls_label3_enabled": False,
    }


def _tagged_stream() -> dict[str, object]:
    return {
        **_base_stream(),
        "vlan_enabled": True,
        "vlan2_enabled": True,
        "vlan_tpid_override": True,
        "vlan_tpid": "88A8",
        "vlan_priority": 5,
        "vlan_cfi": 1,
        "vlan_id": 100,
        "vlan2_tpid_override": False,
        "vlan2_tpid": "9100",
        "vlan2_priority": 3,
        "vlan2_cfi": 0,
        "vlan2_id": 200,
    }


def test_vlan_field_names_and_offsets_match_workbench_schema() -> None:
    assert workbench_vlan_id_field_name(1) == "vlan_id"
    assert workbench_vlan_id_field_name(2) == "vlan2_id"
    assert workbench_vlan_priority_field_name(1) == "vlan_priority"
    assert workbench_vlan_priority_field_name(2) == "vlan2_priority"
    assert workbench_vlan_tpid_field_name(1) == "vlan_tpid"
    assert workbench_vlan_tpid_override_field_name(2) == "vlan2_tpid_override"
    assert workbench_vlan_cfi_field_name(2) == "vlan2_cfi"
    assert workbench_vlan_index_offset(1) == 14
    assert workbench_vlan_index_offset(2) == 18

    assert workbench_vlan_field_enabled(_base_stream(), 1) is False
    assert workbench_vlan_field_enabled(_tagged_stream(), 1) is True
    assert workbench_vlan_field_enabled(_tagged_stream(), 2) is True


def test_vlan_tpid_tci_and_tag_count_use_stream_layout_fields() -> None:
    stream = _tagged_stream()

    assert workbench_vlan_tag_count(_base_stream()) == 0
    assert workbench_vlan_tag_count(stream) == 2
    assert workbench_vlan_tpid(stream, 1) == 0x88A8
    assert workbench_vlan_tpid(stream, 2) == 0x8100
    assert workbench_vlan_tci(stream, 1) == 0xB064
    assert workbench_vlan_tci(stream, 2) == 0x60C8


def test_mpls_field_names_stack_and_offsets_are_derived_together() -> None:
    stream = {
        **_tagged_stream(),
        "mpls_enabled": True,
        "mpls_label": 17,
        "mpls_tc": 1,
        "mpls_ttl": 64,
        "mpls_label2_enabled": True,
        "mpls_label2": 18,
        "mpls_label2_tc": 2,
        "mpls_label2_ttl": 63,
        "mpls_label3_enabled": True,
        "mpls_label3": 19,
        "mpls_label3_tc": 3,
        "mpls_label3_ttl": 62,
    }

    assert workbench_mpls_label_field_name(1) == "mpls_label"
    assert workbench_mpls_label_field_name(3) == "mpls_label3"
    assert workbench_mpls_tc_field_name(2) == "mpls_label2_tc"
    assert workbench_mpls_ttl_field_name(3) == "mpls_label3_ttl"
    assert workbench_mpls_field_enabled(stream, 1) is True
    assert workbench_mpls_field_enabled(stream, 3) is True
    assert workbench_mpls_offset(stream) == 22
    assert workbench_mpls_index_offset(stream, 3) == 30
    assert workbench_mpls_stack(stream) == [
        {"label": 17, "traffic_class": 1, "ttl": 64, "bottom_of_stack": 0},
        {"label": 18, "traffic_class": 2, "ttl": 63, "bottom_of_stack": 0},
        {"label": 19, "traffic_class": 3, "ttl": 62, "bottom_of_stack": 1},
    ]


def test_l2_ip_offsets_include_vlan_and_mpls_encapsulation() -> None:
    assert workbench_l2_header_length(_base_stream()) == 14
    assert workbench_ip_offset(_base_stream()) == 14

    tagged_mpls = {
        **_tagged_stream(),
        "mpls_enabled": True,
        "mpls_label": 17,
        "mpls_tc": 0,
        "mpls_ttl": 255,
        "mpls_label2_enabled": True,
        "mpls_label2": 18,
        "mpls_label2_tc": 0,
        "mpls_label2_ttl": 255,
    }

    assert workbench_l2_header_length(tagged_mpls) == 30
    assert workbench_ip_offset(tagged_mpls) == 30


def test_vxlan_offsets_are_derived_from_outer_l2_and_l3_lengths() -> None:
    stream = {**_base_stream(), "vxlan_inner_ip_version": "IPv6"}

    assert workbench_vxlan_vni_offset(stream) == 46
    assert workbench_vxlan_inner_ipv4_offset(stream) == 64
    assert workbench_vxlan_inner_ip_version(stream) == "IPv6"
    assert workbench_vxlan_inner_ip_version({**stream, "vxlan_inner_ip_version": "IPv4"}) == "IPv4"


def test_gtpu_offsets_include_optional_and_extension_headers() -> None:
    stream = {
        **_base_stream(),
        "gtpu_sequence_enabled": True,
        "gtpu_npdu_enabled": False,
        "gtpu_extension_enabled": True,
    }

    assert workbench_gtpu_teid_offset(stream) == 46
    assert workbench_gtpu_optional_header_length(stream) == 4
    assert workbench_gtpu_optional_header_offset(stream) == 50
    assert workbench_gtpu_extension_header_length(stream) == 4
    assert workbench_gtpu_extension_header_offset(stream) == 54
    assert workbench_gtpu_inner_ipv4_offset(stream) == 58

    plain_gtpu = {**_base_stream(), "gtpu_sequence_enabled": False, "gtpu_npdu_enabled": False, "gtpu_extension_enabled": False}
    assert workbench_gtpu_optional_header_length(plain_gtpu) == 0
    assert workbench_gtpu_extension_header_length(plain_gtpu) == 0
    assert workbench_gtpu_inner_ipv4_offset(plain_gtpu) == 50


def test_gre_and_fixed_l4_header_lengths_live_with_layout_offsets() -> None:
    gre = {
        **_tagged_stream(),
        "gre_checksum_present": True,
        "gre_key_present": True,
        "gre_sequence_present": False,
    }

    assert workbench_gre_header_length({}) == 4
    assert workbench_gre_header_length(gre) == 12
    assert workbench_gre_inner_ipv4_offset(gre) == 54
    assert workbench_gre_option_offset(gre, "key") == 50
    assert workbench_gre_option_offset(gre, "sequence") is None
    assert workbench_gre_option_offset({**gre, "gre_sequence_present": True}, "sequence") == 54
    assert workbench_gre_inner_checksum_instruction(gre) == {
        "l2_len": 54,
        "l3_len": 20,
        "l4_type": 11,
        "type": "fix_checksum_hw",
    }
    assert workbench_gre_inner_checksum_instruction({**gre, "gre_inner_ip_version": "IPv6"}) == {
        "l2_len": 54,
        "l3_len": 40,
        "l4_type": 11,
        "type": "fix_checksum_hw",
    }
    assert workbench_sctp_header_length({}) == 28


def test_icmp_header_length_tracks_echo_and_icmpv6_control_options() -> None:
    assert workbench_icmp_header_length({"packet_type": "Ethernet/IPv4/ICMP", "icmp_type": 8}) == 8
    assert (
        workbench_icmp_header_length(
            {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 133, "icmpv6_rs_include_slla": True}
        )
        == 16
    )
    assert (
        workbench_icmp_header_length(
            {
                "packet_type": "Ethernet/IPv6/ICMPv6",
                "icmp_type": 134,
                "icmpv6_ra_include_slla": True,
                "icmpv6_ra_include_prefix": True,
            }
        )
        == 56
    )
    assert (
        workbench_icmp_header_length(
            {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 135, "icmpv6_nd_include_option": True}
        )
        == 32
    )


def test_ether_type_helpers_keep_l3_and_override_rules_together() -> None:
    assert workbench_l3_ether_type({"packet_type": "Ethernet/ARP"}) == 0x0806
    assert workbench_l3_ether_type({"packet_type": "Ethernet/IPv4/UDP"}) == 0x0800
    assert workbench_l3_ether_type({"packet_type": "Ethernet/IPv6/UDP"}) == 0x86DD
    assert workbench_l3_ether_type({"packet_type": "Ethernet"}) == 0xFFFF

    assert workbench_ether_type_override({"ether_type": "86DD"}) == 0x86DD
    assert workbench_ether_type_override({"ether_type": "not-hex"}) == 0x0800


def test_inner_and_outer_ether_type_follow_vlan_mpls_and_override_rules() -> None:
    assert workbench_inner_ether_type({"packet_type": "Ethernet/IPv6/UDP", "mpls_enabled": False}) == 0x86DD
    assert workbench_inner_ether_type({"packet_type": "Ethernet/IPv4/UDP", "mpls_enabled": True}) == 0x8847

    assert workbench_outer_ether_type({"packet_type": "Ethernet/IPv4/UDP", "vlan_enabled": False}) == 0x0800
    assert (
        workbench_outer_ether_type(
            {
                "packet_type": "Ethernet/IPv4/UDP",
                "vlan_enabled": True,
                "vlan_tpid_override": True,
                "vlan_tpid": "88A8",
            }
        )
        == 0x88A8
    )
    assert (
        workbench_outer_ether_type(
            {
                "packet_type": "Ethernet/IPv4/UDP",
                "ether_type_override": True,
                "ether_type": "86DD",
                "vlan_enabled": True,
                "vlan_tpid_override": False,
            }
        )
        == 0x86DD
    )


def test_default_outer_ether_type_for_fields_matches_loaded_packet_defaults() -> None:
    assert workbench_default_outer_ether_type_for_fields("Ethernet/IPv4/UDP", False, False) == 0x0800
    assert workbench_default_outer_ether_type_for_fields("Ethernet/IPv6/UDP", False, False) == 0x86DD
    assert workbench_default_outer_ether_type_for_fields("Ethernet/ARP", False, False) == 0x0806
    assert workbench_default_outer_ether_type_for_fields("Ethernet", False, False) == 0xFFFF
    assert workbench_default_outer_ether_type_for_fields("Ethernet/IPv4/UDP", False, True) == 0x8847
    assert workbench_default_outer_ether_type_for_fields("Ethernet/IPv4/UDP", True, False, "88A8") == 0x88A8
    assert workbench_default_outer_ether_type_for_fields("Ethernet/IPv4/UDP", True, False, "bad") == 0x8100
