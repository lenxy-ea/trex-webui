from __future__ import annotations

import ipaddress
from typing import Any

from app.trex.workbench_layout import (
    workbench_gre_inner_ipv4_offset,
    workbench_gre_option_offset,
    workbench_gtpu_extension_header_offset,
    workbench_gtpu_inner_ipv4_offset,
    workbench_gtpu_optional_header_offset,
    workbench_gtpu_teid_offset,
    workbench_l2_header_length,
    workbench_ip_offset,
    workbench_mpls_field_enabled,
    workbench_mpls_index_offset,
    workbench_mpls_label_field_name,
    workbench_mpls_tc_field_name,
    workbench_mpls_ttl_field_name,
    workbench_vlan_field_enabled,
    workbench_vlan_id_field_name,
    workbench_vlan_index_offset,
    workbench_vlan_priority_field_name,
    workbench_vxlan_inner_ip_version,
    workbench_vxlan_inner_ipv4_offset,
    workbench_vxlan_vni_offset,
)
from app.trex.workbench_packet import dhcp_parameter_request_list_bytes, dns_name_bytes
from app.trex.workbench_protocol import (
    field_engine_operation,
    frame_length_operation,
    workbench_gre_inner_ip_version,
    workbench_gtpu_inner_ip_version,
    workbench_has_dhcp,
    workbench_has_gre,
    workbench_has_gtpu,
    workbench_has_dns,
    workbench_has_l3,
    workbench_ip_version,
    workbench_l3_header_length,
    workbench_supports_variable_frame_length,
)
from app.trex.workbench_transport import (
    tcp_flags_value,
    tcp_option_mss_value_offset,
    tcp_option_sack_value_offset,
    tcp_option_timestamp_value_offset,
    tcp_option_window_scale_value_offset,
)
from app.trex.workbench_values import (
    PROFILE_DEFAULT_DHCP_HOSTNAME,
    PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
    PROFILE_DEFAULT_DHCP_REQUESTED_IP,
    PROFILE_DEFAULT_DHCP_SERVER_ID,
    PROFILE_MAX_VLAN_ID,
)


def ipv4_field_engine_size_and_init(address: str, count: int) -> tuple[int, int]:
    octets = [int(part) for part in address.split(".")]
    init_value = octets[3]
    if init_value + count < 256:
        return 1, init_value
    init_value = (octets[2] << 8) + octets[3]
    if init_value + count < 65_536:
        return 2, init_value
    return 4, (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3]


def ipv6_field_engine_size_and_init(address: str, count: int) -> tuple[int, int]:
    value = int(ipaddress.IPv6Address(address))
    init_value = value & 0xFF
    if init_value + count < 256:
        return 1, init_value
    init_value = value & 0xFFFF
    if init_value + count < 65_536:
        return 2, init_value
    init_value = value & 0xFFFFFFFF
    if init_value + count < 4_294_967_296:
        return 4, init_value
    return 8, value & 0xFFFFFFFFFFFFFFFF


def mpls_label_field_engine_size_and_init(label: int, count: int) -> tuple[int, int]:
    if label + count < 256:
        return 1, label
    if label + count < 65_536:
        return 2, label
    return 4, label


def mac_field_engine_size_and_init(address: str, count: int) -> tuple[int, int]:
    octets = [int(part, 16) for part in address.split(":")]
    init_value = octets[5]
    if init_value + count < 256:
        return 1, init_value
    init_value = (octets[4] << 8) + octets[5]
    if init_value + count < 65_536:
        return 2, init_value
    return 4, (octets[2] << 24) + (octets[3] << 16) + (octets[4] << 8) + octets[5]


def workbench_u16_field_engine_bounds(
    init_value: int, count: int, step: int, operation: str
) -> tuple[int, int]:
    if operation == "dec":
        return max(0, init_value - (count - 1) * step), init_value
    if operation == "inc":
        return init_value, min(65_535, init_value + (count - 1) * step)
    return init_value, min(65_535, init_value + count - 1)


def workbench_u32_field_engine_bounds(
    init_value: int, count: int, step: int, operation: str
) -> tuple[int, int]:
    if operation == "dec":
        return max(0, init_value - (count - 1) * step), init_value
    if operation == "inc":
        return init_value, min(4_294_967_295, init_value + (count - 1) * step)
    return init_value, min(4_294_967_295, init_value + count - 1)


def workbench_mac_address_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    mode = stream[f"ether_{field}_mode"]
    operation = field_engine_operation(mode)
    variable_name = f"mac_{'dest' if field == 'dst' else 'src'}"
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"ether_{field}_count"]
    address = stream[f"ether_{field}"]
    size, init_value = mac_field_engine_size_and_init(address, count)
    base_offset = 0 if field == "dst" else 6
    packet_offset = base_offset + 6 - size

    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"ether_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_ipv4_address_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get(f"ipv4_{field}_mode"))
    variable_name = f"ip_{'dest' if field == 'dst' else 'src'}"
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"ipv4_{field}_count"]
    address = stream[f"ipv4_{field}"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    base_offset = workbench_ip_offset(stream) + (16 if field == "dst" else 12)
    packet_offset = base_offset + 4 - size

    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"ipv4_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_ipv6_address_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get(f"ipv6_{field}_mode"))
    variable_name = f"ipv6_{'dest' if field == 'dst' else 'src'}"
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"ipv6_{field}_count"]
    address = stream[f"ipv6_{field}"]
    size, init_value = ipv6_field_engine_size_and_init(address, count)
    base_offset = workbench_ip_offset(stream) + (24 if field == "dst" else 8)
    packet_offset = base_offset + 16 - size

    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"ipv6_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_ipv4_id_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv4_id_mode"))
    variable_name = "ip_id"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv4_id"]
    count = stream["ipv4_id_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["ipv4_id_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + 4,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_ipv4_dscp_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv4_dscp_mode"))
    variable_name = "ip_dscp"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv4_dscp"]
    count = stream["ipv4_dscp_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(63, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["ipv4_dscp_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFC,
            "name": variable_name,
            "pkt_cast_size": 1,
            "pkt_offset": workbench_ip_offset(stream) + 1,
            "shift": 2,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_ipv4_ecn_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv4_ecn_mode"))
    variable_name = "ip_ecn"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv4_ecn"]
    count = stream["ipv4_ecn_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(3, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["ipv4_ecn_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x03,
            "name": variable_name,
            "pkt_cast_size": 1,
            "pkt_offset": workbench_ip_offset(stream) + 1,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_ipv4_fragment_offset_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv4_fragment_offset_mode"))
    variable_name = "ip_fragment_offset"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv4_fragment_offset"]
    count = stream["ipv4_fragment_offset_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(8191, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["ipv4_fragment_offset_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x1FFF,
            "name": variable_name,
            "pkt_cast_size": 2,
            "pkt_offset": workbench_ip_offset(stream) + 6,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_ipv4_ttl_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv4_ttl_mode"))
    variable_name = "ip_ttl"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv4_ttl"]
    count = stream["ipv4_ttl_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["ipv4_ttl_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + 8,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_ipv6_flow_label_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv6_flow_label_mode"))
    variable_name = "ipv6_flow_label"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv6_flow_label"]
    return [
        {
            "init_value": init_value,
            "max_value": min(1_048_575, init_value + stream["ipv6_flow_label_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream["ipv6_flow_label_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x000FFFFF,
            "name": variable_name,
            "pkt_cast_size": 4,
            "pkt_offset": workbench_ip_offset(stream),
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_ipv6_traffic_class_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv6_traffic_class_mode"))
    variable_name = "ipv6_traffic_class"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv6_traffic_class"]
    count = stream["ipv6_traffic_class_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["ipv6_traffic_class_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x0FF00000,
            "name": variable_name,
            "pkt_cast_size": 4,
            "pkt_offset": workbench_ip_offset(stream),
            "shift": 20,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_ipv6_hop_limit_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    operation = field_engine_operation(stream.get("ipv6_hop_limit_mode"))
    variable_name = "ipv6_hop_limit"
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["ipv6_hop_limit"]
    count = stream["ipv6_hop_limit_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["ipv6_hop_limit_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + 7,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_l4_port_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"l4_{'dest' if field == 'dst' else 'src'}_port"
    if not stream.get(f"l4_{field}_port_override"):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"l4_{field}_port_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[f"l4_{field}_port"]
    count = stream[f"l4_{field}_port_count"]
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + (2 if field == "dst" else 0)
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream[f"l4_{field}_port_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_udp_length_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "udp_length"
    if not stream.get("udp_length_override"):
        return [], variable_name
    operation = field_engine_operation(stream.get("udp_length_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["udp_length"]
    count = stream["udp_length_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["udp_length_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 4,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_udp_checksum_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "udp_checksum"
    if not stream.get("udp_checksum_override"):
        return [], variable_name
    operation = field_engine_operation(stream.get("udp_checksum_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(stream["udp_checksum"], 16)
    count = stream["udp_checksum_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["udp_checksum_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 6,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_window_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_window"
    operation = field_engine_operation(stream.get("tcp_window_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["tcp_window"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + stream["tcp_window_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["tcp_window_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 14,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_urgent_pointer_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_urgent_pointer"
    operation = field_engine_operation(stream.get("tcp_urgent_pointer_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["tcp_urgent_pointer"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + stream["tcp_urgent_pointer_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["tcp_urgent_pointer_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 18,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_checksum_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_checksum"
    if not stream.get("tcp_checksum_override"):
        return [], variable_name
    operation = field_engine_operation(stream.get("tcp_checksum_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(stream["tcp_checksum"], 16)
    count = stream["tcp_checksum_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["tcp_checksum_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 16,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_number_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"tcp_{'ack' if field == 'ack' else 'sequence'}"
    mode_key = f"tcp_{field}_mode"
    operation = field_engine_operation(stream.get(mode_key))
    if operation == "Fixed":
        return [], variable_name

    value_key = "tcp_ack_number" if field == "ack" else "tcp_sequence_number"
    count_key = f"tcp_{field}_count"
    step_key = f"tcp_{field}_step"
    init_value = stream[value_key]
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + (8 if field == "ack" else 4)
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + stream[count_key] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream[step_key],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_flags_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_flags"
    operation = field_engine_operation(stream.get("tcp_flags_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = tcp_flags_value(stream)
    count = stream["tcp_flags_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(0x3F, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["tcp_flags_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x3F,
            "name": variable_name,
            "pkt_cast_size": 1,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 13,
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_tcp_option_mss_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_option_mss"
    if not stream.get("tcp_option_mss_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("tcp_option_mss_mode"))
    if operation == "Fixed":
        return [], variable_name

    value_offset = tcp_option_mss_value_offset(stream)
    if value_offset is None:
        return [], variable_name
    init_value = stream["tcp_option_mss"]
    count = stream["tcp_option_mss_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["tcp_option_mss_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + value_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_option_timestamp_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"tcp_option_timestamp_{field}"
    if field not in {"value", "echo"} or not stream.get("tcp_option_timestamp_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    value_offset = tcp_option_timestamp_value_offset(stream, field)
    if value_offset is None:
        return [], variable_name
    init_value = stream[variable_name]
    count = stream[f"{variable_name}_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + value_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_option_sack_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"tcp_option_sack_{field}"
    if field not in {"left_edge", "right_edge"} or not stream.get("tcp_option_sack_blocks_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    value_offset = tcp_option_sack_value_offset(stream, field)
    if value_offset is None:
        return [], variable_name
    init_value = stream[variable_name]
    count = stream[f"{variable_name}_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + value_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_tcp_option_window_scale_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "tcp_option_window_scale"
    if not stream.get("tcp_option_window_scale_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("tcp_option_window_scale_mode"))
    if operation == "Fixed":
        return [], variable_name

    value_offset = tcp_option_window_scale_value_offset(stream)
    if value_offset is None:
        return [], variable_name
    init_value = stream[variable_name]
    count = stream["tcp_option_window_scale_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["tcp_option_window_scale_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_ip_offset(stream) + workbench_l3_header_length(stream) + value_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_sctp_tsn_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    return workbench_sctp_number_vm_instructions(stream, "tsn")


def workbench_sctp_number_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"sctp_{field}"
    if field not in {"verification_tag", "data_flags", "tsn", "stream_id", "stream_sequence", "payload_protocol_id"}:
        return [], variable_name
    operation = field_engine_operation(stream.get(f"sctp_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    size = {
        "verification_tag": 4,
        "data_flags": 1,
        "tsn": 4,
        "stream_id": 2,
        "stream_sequence": 2,
        "payload_protocol_id": 4,
    }[field]
    max_limit = {1: 255, 2: 65_535, 4: 4_294_967_295}[size]
    offset_within_sctp = {
        "verification_tag": 4,
        "data_flags": 13,
        "tsn": 16,
        "stream_id": 20,
        "stream_sequence": 22,
        "payload_protocol_id": 24,
    }[field]
    init_value = stream[f"sctp_{field}"]
    count = stream[f"sctp_{field}_count"]
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + offset_within_sctp
    return [
        {
            "init_value": init_value,
            "max_value": min(max_limit, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"sctp_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_icmp_number_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"icmp_{field}"
    operation = field_engine_operation(stream.get(f"icmp_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    field_spec = {
        "type": ("icmp_type", 0, 1, 255),
        "code": ("icmp_code", 1, 1, 255),
        "identifier": ("icmp_identifier", 4, 2, 65_535),
        "sequence": ("icmp_sequence", 6, 2, 65_535),
    }.get(field)
    if field_spec is None:
        return [], variable_name
    value_key, offset_within_icmp, size, max_limit = field_spec
    init_value = stream[value_key]
    count = stream[f"icmp_{field}_count"]
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + offset_within_icmp
    return [
        {
            "init_value": init_value,
            "max_value": min(max_limit, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"icmp_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_packet_length_vm_instructions(stream: dict[str, Any]) -> list[dict[str, Any]]:
    operation = frame_length_operation(stream.get("frame_length_type"))
    if operation == "Fixed" or not workbench_supports_variable_frame_length(stream):
        return []
    l2_length = workbench_l2_header_length(stream)
    base_instructions: list[dict[str, Any]] = [
        {
            "init_value": stream["frame_length_min"] - 4,
            "max_value": stream["frame_length_max"] - 4,
            "min_value": stream["frame_length_min"] - 4,
            "name": "pkt_len",
            "op": operation,
            "size": 2,
            "step": 1,
            "type": "flow_var",
        },
        {"name": "pkt_len", "type": "trim_pkt_size"},
    ]
    if not workbench_has_l3(stream):
        return base_instructions
    ip_version = workbench_ip_version(stream)
    l3_header_length = workbench_l3_header_length(stream)
    ip_len_offset = workbench_ip_offset(stream) + (2 if ip_version == 4 else 4)
    instructions = base_instructions + [
        {
            "add_value": -l2_length if ip_version == 4 else -(l2_length + l3_header_length),
            "is_big_endian": True,
            "name": "pkt_len",
            "pkt_offset": ip_len_offset,
            "type": "write_flow_var",
        },
    ]
    if stream["packet_type"].endswith("/UDP"):
        udp_len_offset = workbench_ip_offset(stream) + l3_header_length + 4
        instructions.insert(
            3,
            {
                "add_value": -(l2_length + l3_header_length),
                "is_big_endian": True,
                "name": "pkt_len",
                "pkt_offset": udp_len_offset,
                "type": "write_flow_var",
            },
        )
    return instructions


def workbench_dns_transaction_id_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dns_transaction_id"
    if not workbench_has_dns(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dns_transaction_id_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["dns_transaction_id"]
    count = stream["dns_transaction_id_count"]
    min_value, max_value = workbench_u16_field_engine_bounds(
        init_value, count, stream["dns_transaction_id_step"], operation
    )
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["dns_transaction_id_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dns_flags_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dns_flags"
    if not workbench_has_dns(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dns_flags_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(stream["dns_flags"], 16)
    count = stream["dns_flags_count"]
    step = stream["dns_flags_step"]
    min_value, max_value = workbench_u16_field_engine_bounds(init_value, count, step, operation)
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 2
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dns_question_field_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    if field not in {"query_type", "query_class"}:
        raise ValueError(f"unsupported DNS question field: {field}")
    variable_name = f"dns_{field}"
    if not workbench_has_dns(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[variable_name]
    count = stream[f"{variable_name}_count"]
    step = stream[f"{variable_name}_step"]
    min_value, max_value = workbench_u16_field_engine_bounds(init_value, count, step, operation)
    question_offset = 0 if field == "query_type" else 2
    packet_offset = (
        workbench_ip_offset(stream)
        + workbench_l3_header_length(stream)
        + 8
        + 12
        + len(dns_name_bytes(stream["dns_query_name"]))
        + question_offset
    )
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dns_answer_offset(stream: dict[str, Any]) -> int | None:
    if not workbench_has_dns(stream) or stream.get("dns_answer_enabled") is not True:
        return None
    return (
        workbench_ip_offset(stream)
        + workbench_l3_header_length(stream)
        + 8
        + 12
        + len(dns_name_bytes(stream["dns_query_name"]))
        + 4
    )


def workbench_dns_answer_ttl_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dns_answer_ttl"
    answer_offset = workbench_dns_answer_offset(stream)
    if answer_offset is None:
        return [], variable_name
    operation = field_engine_operation(stream.get("dns_answer_ttl_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["dns_answer_ttl"]
    count = stream["dns_answer_ttl_count"]
    step = stream["dns_answer_ttl_step"]
    min_value, max_value = workbench_u32_field_engine_bounds(init_value, count, step, operation)
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": answer_offset + 6,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dns_answer_ipv4_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dns_answer_ipv4"
    answer_offset = workbench_dns_answer_offset(stream)
    if answer_offset is None:
        return [], variable_name
    operation = field_engine_operation(stream.get("dns_answer_ipv4_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream["dns_answer_ipv4_count"]
    size, init_value = ipv4_field_engine_size_and_init(stream["dns_answer_ipv4"], count)
    packet_offset = answer_offset + 12 + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream["dns_answer_ipv4_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_xid_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dhcp_xid"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dhcp_xid_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["dhcp_xid"]
    count = stream["dhcp_xid_count"]
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 4
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream["dhcp_xid_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_bootp_number_vm_instructions(
    stream: dict[str, Any],
    field: str,
    *,
    payload_offset: int,
    size: int,
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"dhcp_{field}"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(stream[variable_name])
    count = int(stream[f"{variable_name}_count"])
    step = int(stream[f"{variable_name}_step"])
    max_value_for_size = (1 << (size * 8)) - 1
    if operation == "dec":
        min_value = max(0, init_value - (count - 1) * step)
        max_value = min(max_value_for_size, init_value)
    elif operation == "inc":
        min_value = max(0, init_value)
        max_value = min(max_value_for_size, init_value + (count - 1) * step)
    else:
        min_value = 0
        max_value = max_value_for_size
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + payload_offset
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_message_type_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dhcp_message_type"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dhcp_message_type_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["dhcp_message_type"]
    count = stream["dhcp_message_type_count"]
    step = stream["dhcp_message_type_step"]
    if operation == "dec":
        min_value, max_value = max(1, init_value - (count - 1) * step), init_value
    elif operation == "inc":
        min_value, max_value = init_value, min(255, init_value + (count - 1) * step)
    else:
        min_value, max_value = 1, 255
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 242
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_flags_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dhcp_flags"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dhcp_flags_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(str(stream["dhcp_flags"]), 16) & 0xFFFF
    count = stream["dhcp_flags_count"]
    step = stream["dhcp_flags_step"]
    min_value, max_value = workbench_u16_field_engine_bounds(init_value, count, step, operation)
    packet_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 10
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_client_mac_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "dhcp_client_mac"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("dhcp_client_mac_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream["dhcp_client_mac_count"]
    address = stream["dhcp_client_mac"]
    size, init_value = mac_field_engine_size_and_init(address, count)
    base_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 28
    packet_offset = base_offset + 6 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream["dhcp_client_mac_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_bootp_ipv4_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    payload_offsets = {
        "client_ip": 12,
        "your_ip": 16,
        "server_ip": 20,
        "relay_ip": 24,
    }
    if field not in payload_offsets:
        raise ValueError(f"unsupported DHCP BOOTP IPv4 field: {field}")
    variable_name = f"dhcp_{field}"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    address = str(stream.get(variable_name, "0.0.0.0"))
    count = stream[f"{variable_name}_count"]
    step = stream[f"{variable_name}_step"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    max_for_size = (1 << (size * 8)) - 1
    if operation == "dec":
        min_value = max(0, init_value - (count - 1) * step)
        max_value = init_value
    elif operation == "inc":
        min_value = init_value
        max_value = min(max_for_size, init_value + (count - 1) * step)
    else:
        min_value = 0
        max_value = max_for_size
    base_offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + payload_offsets[field]
    packet_offset = base_offset + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_option_value_offset(stream: dict[str, Any], code: int) -> int | None:
    if not workbench_has_dhcp(stream):
        return None
    offset = 240
    options: list[tuple[int, int]] = [
        (53, 1),
    ]
    parameter_request = dhcp_parameter_request_list_bytes(stream, PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST)
    if parameter_request:
        options.append((55, len(parameter_request)))
    hostname = str(stream.get("dhcp_hostname", PROFILE_DEFAULT_DHCP_HOSTNAME))
    if hostname:
        options.append((12, len(hostname.encode("ascii", errors="ignore"))))
    if str(stream.get("dhcp_requested_ip", PROFILE_DEFAULT_DHCP_REQUESTED_IP)) != PROFILE_DEFAULT_DHCP_REQUESTED_IP:
        options.append((50, 4))
    if str(stream.get("dhcp_server_id", PROFILE_DEFAULT_DHCP_SERVER_ID)) != PROFILE_DEFAULT_DHCP_SERVER_ID:
        options.append((54, 4))
    for field, option_code in (
        ("dhcp_lease_time", 51),
        ("dhcp_renewal_time", 58),
        ("dhcp_rebinding_time", 59),
    ):
        if int(stream.get(field, 0) or 0) > 0:
            options.append((option_code, 4))
    for option_code, option_length in options:
        if option_code == code:
            return workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + offset + 2
        offset += 2 + option_length
    return None


def workbench_dhcp_ipv4_option_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    if field not in {"requested_ip", "server_id"}:
        raise ValueError(f"unsupported DHCP IPv4 option field: {field}")
    variable_name = f"dhcp_{field}"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name
    address = str(stream.get(variable_name, PROFILE_DEFAULT_DHCP_REQUESTED_IP))
    if address == "0.0.0.0":
        return [], variable_name
    option_offset = workbench_dhcp_option_value_offset(stream, 50 if field == "requested_ip" else 54)
    if option_offset is None:
        return [], variable_name

    count = stream[f"{variable_name}_count"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": option_offset + 4 - size,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_dhcp_u32_option_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    option_codes = {
        "lease_time": 51,
        "renewal_time": 58,
        "rebinding_time": 59,
    }
    if field not in option_codes:
        raise ValueError(f"unsupported DHCP u32 option field: {field}")
    variable_name = f"dhcp_{field}"
    if not workbench_has_dhcp(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = int(stream.get(variable_name, 0) or 0)
    if init_value <= 0:
        return [], variable_name
    option_offset = workbench_dhcp_option_value_offset(stream, option_codes[field])
    if option_offset is None:
        return [], variable_name

    count = int(stream[f"{variable_name}_count"])
    step = int(stream[f"{variable_name}_step"])
    if operation == "dec":
        min_value = max(0, init_value - (count - 1) * step)
        max_value = init_value
    elif operation == "inc":
        min_value = init_value
        max_value = min(4_294_967_295, init_value + (count - 1) * step)
    else:
        min_value = 0
        max_value = 4_294_967_295
    return [
        {
            "init_value": init_value,
            "max_value": max_value,
            "min_value": min_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": step,
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": option_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_arp_operation_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "arp_operation"
    operation = field_engine_operation(stream.get("arp_operation_mode"))
    if operation == "Fixed":
        return [], variable_name

    arp_offset = workbench_l2_header_length(stream)
    return [
        {
            "init_value": stream["arp_operation"],
            "max_value": stream["arp_operation"] + stream["arp_operation_count"] - 1,
            "min_value": stream["arp_operation"],
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["arp_operation_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": arp_offset + 6,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_arp_ip_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"arp_{field}_ip"
    operation = field_engine_operation(stream.get(f"arp_{field}_ip_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"arp_{field}_ip_count"]
    address = stream[f"arp_{field}_ip"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    arp_offset = workbench_l2_header_length(stream)
    base_offset = arp_offset + (24 if field == "target" else 14)
    packet_offset = base_offset + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"arp_{field}_ip_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_arp_mac_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"arp_{field}_mac"
    operation = field_engine_operation(stream.get(f"arp_{field}_mac_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"arp_{field}_mac_count"]
    address = stream[f"arp_{field}_mac"]
    size, init_value = mac_field_engine_size_and_init(address, count)
    arp_offset = workbench_l2_header_length(stream)
    base_offset = arp_offset + (18 if field == "target" else 8)
    packet_offset = base_offset + 6 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"arp_{field}_mac_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vlan_id_vm_instructions(stream: dict[str, Any], index: int) -> tuple[list[dict[str, Any]], str]:
    variable_name = workbench_vlan_id_field_name(index)
    if not workbench_vlan_field_enabled(stream, index):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[variable_name]
    return [
        {
            "init_value": init_value,
            "max_value": min(PROFILE_MAX_VLAN_ID, init_value + stream[f"{variable_name}_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x0FFF,
            "name": variable_name,
            "pkt_cast_size": 2,
            "pkt_offset": workbench_vlan_index_offset(index),
            "shift": 0,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_vlan_priority_vm_instructions(stream: dict[str, Any], index: int) -> tuple[list[dict[str, Any]], str]:
    variable_name = workbench_vlan_priority_field_name(index)
    if not workbench_vlan_field_enabled(stream, index):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[variable_name]
    return [
        {
            "init_value": init_value,
            "max_value": min(7, init_value + stream[f"{variable_name}_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xE000,
            "name": variable_name,
            "pkt_cast_size": 2,
            "pkt_offset": workbench_vlan_index_offset(index),
            "shift": 13,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_mpls_label_vm_instructions(stream: dict[str, Any], index: int = 1) -> tuple[list[dict[str, Any]], str]:
    variable_name = workbench_mpls_label_field_name(index)
    if not workbench_mpls_field_enabled(stream, index):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"{variable_name}_count"]
    label = stream[variable_name]
    size, init_value = mpls_label_field_engine_size_and_init(label, count)
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFF000,
            "name": variable_name,
            "pkt_cast_size": 4,
            "pkt_offset": workbench_mpls_index_offset(stream, index),
            "shift": 12,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_mpls_tc_vm_instructions(stream: dict[str, Any], index: int = 1) -> tuple[list[dict[str, Any]], str]:
    variable_name = workbench_mpls_tc_field_name(index)
    if not workbench_mpls_field_enabled(stream, index):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[variable_name]
    return [
        {
            "init_value": init_value,
            "max_value": min(7, init_value + stream[f"{variable_name}_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0x00000E00,
            "name": variable_name,
            "pkt_cast_size": 4,
            "pkt_offset": workbench_mpls_index_offset(stream, index),
            "shift": 9,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_mpls_ttl_vm_instructions(stream: dict[str, Any], index: int = 1) -> tuple[list[dict[str, Any]], str]:
    variable_name = workbench_mpls_ttl_field_name(index)
    if not workbench_mpls_field_enabled(stream, index):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"{variable_name}_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[variable_name]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + stream[f"{variable_name}_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream[f"{variable_name}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_mpls_index_offset(stream, index) + 3,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_number_vm_instructions(stream: dict[str, Any], field: str) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gre_{field}"
    if not workbench_has_gre(stream) or not stream.get(f"gre_{field}_present"):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gre_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    packet_offset = workbench_gre_option_offset(stream, field)
    if packet_offset is None:
        return [], variable_name
    init_value = stream[f"gre_{field}"]
    count = stream[f"gre_{field}_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream[f"gre_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_inner_ipv4_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gre_inner_ipv4_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gre(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gre_inner_ipv4_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"gre_inner_ipv4_{field}_count"]
    address = stream[f"gre_inner_ipv4_{field}"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    base_offset = workbench_gre_inner_ipv4_offset(stream) + (16 if field == "dst" else 12)
    packet_offset = base_offset + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"gre_inner_ipv4_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_inner_ipv4_ttl_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gre_inner_ipv4_ttl"
    if not workbench_has_gre(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("gre_inner_ipv4_ttl_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gre_inner_ipv4_ttl"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + stream["gre_inner_ipv4_ttl_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["gre_inner_ipv4_ttl_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gre_inner_ipv4_offset(stream) + 8,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_inner_ipv6_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gre_inner_ipv6_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gre(stream) or workbench_gre_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gre_inner_ipv6_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"gre_inner_ipv6_{field}_count"]
    address = stream[f"gre_inner_ipv6_{field}"]
    size, init_value = ipv6_field_engine_size_and_init(address, count)
    base_offset = workbench_gre_inner_ipv4_offset(stream) + (24 if field == "dst" else 8)
    packet_offset = base_offset + 16 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"gre_inner_ipv6_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_inner_ipv6_hop_limit_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gre_inner_ipv6_hop_limit"
    if not workbench_has_gre(stream) or workbench_gre_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get("gre_inner_ipv6_hop_limit_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gre_inner_ipv6_hop_limit"]
    count = stream["gre_inner_ipv6_hop_limit_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["gre_inner_ipv6_hop_limit_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gre_inner_ipv4_offset(stream) + 7,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gre_inner_l4_port_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gre_inner_udp_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gre(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gre_inner_l4_{field}_port_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[f"gre_inner_l4_{field}_port"]
    count = stream[f"gre_inner_l4_{field}_port_count"]
    inner_l3_length = 40 if workbench_gre_inner_ip_version(stream) == "IPv6" else 20
    packet_offset = workbench_gre_inner_ipv4_offset(stream) + inner_l3_length + (2 if field == "dst" else 0)
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream[f"gre_inner_l4_{field}_port_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_teid_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_teid"
    if not workbench_has_gtpu(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_teid_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_teid"]
    count = stream["gtpu_teid_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(4_294_967_295, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream["gtpu_teid_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_teid_offset(stream),
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_sequence_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_sequence"
    if not workbench_has_gtpu(stream) or not stream.get("gtpu_sequence_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_sequence_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_sequence"]
    count = stream["gtpu_sequence_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["gtpu_sequence_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_optional_header_offset(stream),
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_npdu_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_npdu"
    if not workbench_has_gtpu(stream) or not stream.get("gtpu_npdu_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_npdu_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_npdu"]
    count = stream["gtpu_npdu_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["gtpu_npdu_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_optional_header_offset(stream) + 2,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_extension_udp_port_vm_instructions(
    stream: dict[str, Any]
) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_extension_udp_port"
    if not workbench_has_gtpu(stream) or not stream.get("gtpu_extension_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_extension_udp_port_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_extension_udp_port"]
    count = stream["gtpu_extension_udp_port_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream["gtpu_extension_udp_port_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_extension_header_offset(stream) + 1,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_inner_ipv4_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gtpu_inner_ipv4_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gtpu(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gtpu_inner_ipv4_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"gtpu_inner_ipv4_{field}_count"]
    address = stream[f"gtpu_inner_ipv4_{field}"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    base_offset = workbench_gtpu_inner_ipv4_offset(stream) + (16 if field == "dst" else 12)
    packet_offset = base_offset + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"gtpu_inner_ipv4_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_inner_ipv4_ttl_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_inner_ipv4_ttl"
    if not workbench_has_gtpu(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_inner_ipv4_ttl_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_inner_ipv4_ttl"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + stream["gtpu_inner_ipv4_ttl_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["gtpu_inner_ipv4_ttl_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_inner_ipv4_offset(stream) + 8,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_inner_ipv6_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gtpu_inner_ipv6_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gtpu(stream) or workbench_gtpu_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gtpu_inner_ipv6_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"gtpu_inner_ipv6_{field}_count"]
    address = stream[f"gtpu_inner_ipv6_{field}"]
    size, init_value = ipv6_field_engine_size_and_init(address, count)
    base_offset = workbench_gtpu_inner_ipv4_offset(stream) + (24 if field == "dst" else 8)
    packet_offset = base_offset + 16 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"gtpu_inner_ipv6_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_inner_ipv6_hop_limit_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "gtpu_inner_ipv6_hop_limit"
    if not workbench_has_gtpu(stream) or workbench_gtpu_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get("gtpu_inner_ipv6_hop_limit_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["gtpu_inner_ipv6_hop_limit"]
    count = stream["gtpu_inner_ipv6_hop_limit_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["gtpu_inner_ipv6_hop_limit_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_gtpu_inner_ipv4_offset(stream) + 7,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_gtpu_inner_l4_port_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"gtpu_inner_udp_{'dst' if field == 'dst' else 'src'}"
    if not workbench_has_gtpu(stream):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"gtpu_inner_l4_{field}_port_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[f"gtpu_inner_l4_{field}_port"]
    count = stream[f"gtpu_inner_l4_{field}_port_count"]
    inner_l3_length = 40 if workbench_gtpu_inner_ip_version(stream) == "IPv6" else 20
    packet_offset = workbench_gtpu_inner_ipv4_offset(stream) + inner_l3_length + (2 if field == "dst" else 0)
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream[f"gtpu_inner_l4_{field}_port_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vxlan_vni_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "vxlan_vni"
    if not stream.get("vxlan_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get("vxlan_vni_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["vxlan_vni"]
    return [
        {
            "init_value": init_value,
            "max_value": min(16_777_215, init_value + stream["vxlan_vni_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 4,
            "step": stream["vxlan_vni_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "mask": 0xFFFFFF00,
            "name": variable_name,
            "pkt_cast_size": 4,
            "pkt_offset": workbench_vxlan_vni_offset(stream),
            "shift": 8,
            "type": "write_mask_flow_var",
        },
    ], variable_name


def workbench_vxlan_inner_ipv4_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"vxlan_inner_ipv4_{'dst' if field == 'dst' else 'src'}"
    if not stream.get("vxlan_enabled") or workbench_vxlan_inner_ip_version(stream) != "IPv4":
        return [], variable_name
    operation = field_engine_operation(stream.get(f"vxlan_inner_ipv4_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"vxlan_inner_ipv4_{field}_count"]
    address = stream[f"vxlan_inner_ipv4_{field}"]
    size, init_value = ipv4_field_engine_size_and_init(address, count)
    base_offset = workbench_vxlan_inner_ipv4_offset(stream) + (16 if field == "dst" else 12)
    packet_offset = base_offset + 4 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"vxlan_inner_ipv4_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vxlan_inner_l4_port_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"vxlan_inner_udp_{'dst' if field == 'dst' else 'src'}"
    if not stream.get("vxlan_enabled"):
        return [], variable_name
    operation = field_engine_operation(stream.get(f"vxlan_inner_l4_{field}_port_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream[f"vxlan_inner_l4_{field}_port"]
    count = stream[f"vxlan_inner_l4_{field}_port_count"]
    inner_l3_length = 40 if workbench_vxlan_inner_ip_version(stream) == "IPv6" else 20
    packet_offset = workbench_vxlan_inner_ipv4_offset(stream) + inner_l3_length + (2 if field == "dst" else 0)
    return [
        {
            "init_value": init_value,
            "max_value": min(65_535, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 2,
            "step": stream[f"vxlan_inner_l4_{field}_port_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vxlan_inner_ipv4_ttl_vm_instructions(stream: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    variable_name = "vxlan_inner_ipv4_ttl"
    if not stream.get("vxlan_enabled") or workbench_vxlan_inner_ip_version(stream) != "IPv4":
        return [], variable_name
    operation = field_engine_operation(stream.get("vxlan_inner_ipv4_ttl_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["vxlan_inner_ipv4_ttl"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + stream["vxlan_inner_ipv4_ttl_count"] - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["vxlan_inner_ipv4_ttl_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_vxlan_inner_ipv4_offset(stream) + 8,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vxlan_inner_ipv6_address_vm_instructions(
    stream: dict[str, Any], field: str
) -> tuple[list[dict[str, Any]], str]:
    variable_name = f"vxlan_inner_ipv6_{'dst' if field == 'dst' else 'src'}"
    if not stream.get("vxlan_enabled") or workbench_vxlan_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get(f"vxlan_inner_ipv6_{field}_mode"))
    if operation == "Fixed":
        return [], variable_name

    count = stream[f"vxlan_inner_ipv6_{field}_count"]
    address = stream[f"vxlan_inner_ipv6_{field}"]
    size, init_value = ipv6_field_engine_size_and_init(address, count)
    base_offset = workbench_vxlan_inner_ipv4_offset(stream) + (24 if field == "dst" else 8)
    packet_offset = base_offset + 16 - size
    return [
        {
            "init_value": init_value,
            "max_value": init_value + count - 1,
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": size,
            "step": stream[f"vxlan_inner_ipv6_{field}_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": packet_offset,
            "type": "write_flow_var",
        },
    ], variable_name


def workbench_vxlan_inner_ipv6_hop_limit_vm_instructions(
    stream: dict[str, Any]
) -> tuple[list[dict[str, Any]], str]:
    variable_name = "vxlan_inner_ipv6_hop_limit"
    if not stream.get("vxlan_enabled") or workbench_vxlan_inner_ip_version(stream) != "IPv6":
        return [], variable_name
    operation = field_engine_operation(stream.get("vxlan_inner_ipv6_hop_limit_mode"))
    if operation == "Fixed":
        return [], variable_name

    init_value = stream["vxlan_inner_ipv6_hop_limit"]
    count = stream["vxlan_inner_ipv6_hop_limit_count"]
    return [
        {
            "init_value": init_value,
            "max_value": min(255, init_value + count - 1),
            "min_value": init_value,
            "name": variable_name,
            "op": operation,
            "size": 1,
            "step": stream["vxlan_inner_ipv6_hop_limit_step"],
            "type": "flow_var",
        },
        {
            "add_value": 0,
            "is_big_endian": True,
            "name": variable_name,
            "pkt_offset": workbench_vxlan_inner_ipv4_offset(stream) + 7,
            "type": "write_flow_var",
        },
    ], variable_name
