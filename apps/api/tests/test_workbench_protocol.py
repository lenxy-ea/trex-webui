from app.trex.workbench_protocol import (
    field_engine_operation,
    frame_length_operation,
    workbench_advanced_cache_from_vm,
    workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version,
    workbench_has_arp,
    workbench_has_dhcp,
    workbench_has_dns,
    workbench_has_gre,
    workbench_has_gtpu,
    workbench_has_icmp,
    workbench_has_l3,
    workbench_has_l4,
    workbench_has_sctp,
    workbench_has_transport_ports,
    workbench_ip_version,
    workbench_is_icmp_echo,
    workbench_is_icmpv6_control,
    workbench_is_icmpv6_echo,
    workbench_is_icmpv6_nd,
    workbench_is_icmpv6_ra,
    workbench_is_icmpv6_router,
    workbench_is_icmpv6_rs,
    workbench_l3_header_length,
    workbench_supports_variable_frame_length,
    workbench_vm_cache_size,
)


def test_field_engine_and_frame_length_operations_match_trex_vm_ops() -> None:
    assert field_engine_operation("Increment Host") == "inc"
    assert field_engine_operation("Decrement") == "dec"
    assert field_engine_operation("Random") == "random"
    assert field_engine_operation("Fixed") == "Fixed"
    assert field_engine_operation(None) == "Fixed"

    assert frame_length_operation("Increment") == "inc"
    assert frame_length_operation("Decrement") == "dec"
    assert frame_length_operation("Random") == "random"
    assert frame_length_operation("Fixed") == "Fixed"


def test_workbench_vm_cache_size_honors_disable_enable_and_auto_defaults() -> None:
    assert workbench_vm_cache_size({"advanced_cache_size_type": "Disable", "advanced_cache_value": 123}) == 0
    assert workbench_vm_cache_size({"advanced_cache_size_type": "Enable", "advanced_cache_value": "42"}) == 42
    assert workbench_vm_cache_size({"advanced_cache_size_type": "Enable", "advanced_cache_value": "too-large"}) == 5000
    assert workbench_vm_cache_size({"advanced_cache_size_type": "Auto"}) == 5000


def test_workbench_advanced_cache_from_vm_restores_workbench_cache_mode() -> None:
    assert workbench_advanced_cache_from_vm({"cache_size": 0}) == ("Disable", 5000)
    assert workbench_advanced_cache_from_vm({"cache_size": "42"}) == ("Enable", 42)
    assert workbench_advanced_cache_from_vm({"cache_size": 5000}) == ("Auto", 5000)
    assert workbench_advanced_cache_from_vm({"cache_size": "too-large"}) == ("Auto", 5000)


def test_workbench_protocol_predicates_classify_l3_l4_and_tunnels() -> None:
    udp = {"packet_type": "Ethernet/IPv4/UDP"}
    gre = {"packet_type": "Ethernet/IPv6/GRE", "gre_protocol_type": "86DD"}
    gtpu = {"packet_type": "Ethernet/IPv4/UDP", "gtpu_enabled": True, "gtpu_inner_ip_version": "IPv6"}

    assert workbench_has_l3(udp) is True
    assert workbench_ip_version(udp) == 4
    assert workbench_l3_header_length(udp) == 20
    assert workbench_has_l4(udp) is True
    assert workbench_has_transport_ports(udp) is True
    assert workbench_has_arp({"packet_type": "Ethernet/ARP"}) is True

    assert workbench_has_gre(gre) is True
    assert workbench_gre_inner_ip_version(gre) == "IPv6"
    assert workbench_l3_header_length(gre) == 40

    assert workbench_has_gtpu(gtpu) is True
    assert workbench_gtpu_inner_ip_version(gtpu) == "IPv6"


def test_dns_and_dhcp_are_plain_udp_helpers_not_tunnel_payloads() -> None:
    dns = {"packet_type": "Ethernet/IPv6/UDP", "dns_enabled": True}
    dhcp = {"packet_type": "Ethernet/IPv4/UDP", "dhcp_enabled": True}
    vxlan_dns = {**dns, "vxlan_enabled": True}
    gtpu_dhcp = {**dhcp, "gtpu_enabled": True}

    assert workbench_has_dns(dns) is True
    assert workbench_has_dhcp(dhcp) is True
    assert workbench_has_dns(vxlan_dns) is False
    assert workbench_has_dhcp(gtpu_dhcp) is False


def test_icmp_helpers_distinguish_echo_and_ipv6_control_messages() -> None:
    icmp_echo = {"packet_type": "Ethernet/IPv4/ICMP", "icmp_type": 8}
    icmpv6_echo = {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 128}
    router_solicit = {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 133}
    router_advert = {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 134}
    neighbor_solicit = {"packet_type": "Ethernet/IPv6/ICMPv6", "icmp_type": 135}

    assert workbench_has_icmp(icmp_echo) is True
    assert workbench_is_icmp_echo(icmp_echo) is True
    assert workbench_is_icmpv6_echo(icmpv6_echo) is True
    assert workbench_is_icmpv6_rs(router_solicit) is True
    assert workbench_is_icmpv6_ra(router_advert) is True
    assert workbench_is_icmpv6_router(router_solicit) is True
    assert workbench_is_icmpv6_router(router_advert) is True
    assert workbench_is_icmpv6_nd(neighbor_solicit) is True
    assert workbench_is_icmpv6_control(neighbor_solicit) is True


def test_variable_frame_length_is_disabled_for_fixed_size_protocol_builders() -> None:
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/UDP"}) is True
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/GRE"}) is False
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/SCTP"}) is False
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/ICMP"}) is False
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/UDP", "gtpu_enabled": True}) is False
    assert workbench_supports_variable_frame_length({"packet_type": "Ethernet/IPv4/UDP", "vxlan_enabled": True}) is False


def test_non_l3_and_transport_classification_are_conservative() -> None:
    ethernet = {"packet_type": "Ethernet"}
    arp = {"packet_type": "Ethernet/ARP"}
    sctp = {"packet_type": "Ethernet/IPv6/SCTP"}

    assert workbench_has_l3(ethernet) is False
    assert workbench_l3_header_length(ethernet) == 0
    assert workbench_has_l4(arp) is False
    assert workbench_has_sctp(sctp) is True
    assert workbench_has_transport_ports(sctp) is True
