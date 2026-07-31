from __future__ import annotations

from typing import Any

from app.trex.workbench_values import bounded_int


def field_engine_operation(mode: object) -> str:
    if isinstance(mode, str):
        if mode.startswith("Increment"):
            return "inc"
        if mode.startswith("Decrement"):
            return "dec"
        if mode.startswith("Random"):
            return "random"
    return "Fixed"


def frame_length_operation(frame_length_type: object) -> str:
    if frame_length_type == "Increment":
        return "inc"
    if frame_length_type == "Decrement":
        return "dec"
    if frame_length_type == "Random":
        return "random"
    return "Fixed"


def workbench_vm_cache_size(stream: dict[str, Any]) -> int:
    cache_type = stream.get("advanced_cache_size_type")
    if cache_type == "Disable":
        return 0
    if cache_type == "Enable":
        return bounded_int(stream.get("advanced_cache_value"), 0, 999_999, 5000)
    return 5000


def workbench_advanced_cache_from_vm(vm_data: dict[str, Any]) -> tuple[str, int]:
    parsed = bounded_int(vm_data.get("cache_size"), 0, 999_999, 5000)
    if parsed == 0:
        return "Disable", 5000
    if parsed != 5000:
        return "Enable", parsed
    return "Auto", 5000


def workbench_ip_version(stream: dict[str, Any]) -> int:
    return 6 if str(stream.get("packet_type", "")).startswith("Ethernet/IPv6") else 4


def workbench_has_l3(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")).startswith("Ethernet/IPv")


def workbench_has_arp(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")) == "Ethernet/ARP"


def workbench_has_l4(stream: dict[str, Any]) -> bool:
    packet_type = str(stream.get("packet_type", ""))
    return (
        packet_type.endswith("/TCP")
        or packet_type.endswith("/UDP")
        or packet_type.endswith("/SCTP")
        or packet_type.endswith("/ICMP")
        or packet_type.endswith("/ICMPv6")
        or packet_type.endswith("/GRE")
    )


def workbench_has_sctp(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")).endswith("/SCTP")


def workbench_has_gre(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")).endswith("/GRE")


def workbench_has_gtpu(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")) == "Ethernet/IPv4/UDP" and stream.get("gtpu_enabled") is True


def workbench_gtpu_inner_ip_version(stream: dict[str, Any]) -> str:
    return "IPv6" if stream.get("gtpu_inner_ip_version") == "IPv6" else "IPv4"


def workbench_gre_inner_ip_version(stream: dict[str, Any]) -> str:
    if stream.get("gre_inner_ip_version") == "IPv6":
        return "IPv6"
    return "IPv6" if str(stream.get("gre_protocol_type") or "").upper() == "86DD" else "IPv4"


def workbench_has_icmp(stream: dict[str, Any]) -> bool:
    packet_type = str(stream.get("packet_type", ""))
    return packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6")


def workbench_supports_variable_frame_length(stream: dict[str, Any]) -> bool:
    if (
        workbench_has_gre(stream)
        or workbench_has_gtpu(stream)
        or stream.get("vxlan_enabled") is True
        or workbench_has_icmp(stream)
        or workbench_has_sctp(stream)
    ):
        return False
    return True


def workbench_is_icmpv6_nd(stream: dict[str, Any]) -> bool:
    if not str(stream.get("packet_type", "")).endswith("/ICMPv6"):
        return False
    return int(stream.get("icmp_type", 0)) in {135, 136}


def workbench_is_icmpv6_rs(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")).endswith("/ICMPv6") and int(stream.get("icmp_type", 0)) == 133


def workbench_is_icmpv6_ra(stream: dict[str, Any]) -> bool:
    return str(stream.get("packet_type", "")).endswith("/ICMPv6") and int(stream.get("icmp_type", 0)) == 134


def workbench_is_icmpv6_router(stream: dict[str, Any]) -> bool:
    return workbench_is_icmpv6_rs(stream) or workbench_is_icmpv6_ra(stream)


def workbench_is_icmpv6_control(stream: dict[str, Any]) -> bool:
    return workbench_is_icmpv6_router(stream) or workbench_is_icmpv6_nd(stream)


def workbench_is_icmpv6_echo(stream: dict[str, Any]) -> bool:
    if not str(stream.get("packet_type", "")).endswith("/ICMPv6"):
        return False
    return int(stream.get("icmp_type", 0)) in {128, 129}


def workbench_is_icmp_echo(stream: dict[str, Any]) -> bool:
    packet_type = str(stream.get("packet_type", ""))
    icmp_type = int(stream.get("icmp_type", 0))
    return (packet_type.endswith("/ICMP") and icmp_type in {0, 8}) or workbench_is_icmpv6_echo(stream)


def workbench_has_transport_ports(stream: dict[str, Any]) -> bool:
    packet_type = str(stream.get("packet_type", ""))
    return packet_type.endswith("/TCP") or packet_type.endswith("/UDP") or packet_type.endswith("/SCTP")


def workbench_has_dns(stream: dict[str, Any]) -> bool:
    return (
        str(stream.get("packet_type", "")).endswith("/UDP")
        and stream.get("dns_enabled") is True
        and not stream.get("vxlan_enabled")
        and not stream.get("gtpu_enabled")
    )


def workbench_has_dhcp(stream: dict[str, Any]) -> bool:
    return (
        str(stream.get("packet_type", "")) == "Ethernet/IPv4/UDP"
        and stream.get("dhcp_enabled") is True
        and not stream.get("vxlan_enabled")
        and not stream.get("gtpu_enabled")
    )


def workbench_l3_header_length(stream: dict[str, Any]) -> int:
    if not workbench_has_l3(stream):
        return 0
    return 40 if workbench_ip_version(stream) == 6 else 20
