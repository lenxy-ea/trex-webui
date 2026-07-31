from __future__ import annotations

import base64
import binascii
from typing import Any

from app.trex.result import TrexCallResult
from app.trex.workbench_inputs import (
    clean_dhcp_hostname as _clean_dhcp_hostname,
    clean_dhcp_parameter_request_list as _clean_dhcp_parameter_request_list,
    clean_dns_query_name as _clean_dns_query_name,
    clean_payload_pattern as _clean_payload_pattern,
)
from app.trex.workbench_layout import (
    workbench_default_outer_ether_type_for_fields as _default_outer_ether_type_for_fields,
)
from app.trex.workbench_packet import (
    ipv4_offsets as _ipv4_offsets,
    ipv6_offsets as _ipv6_offsets,
    packet_l2_payload_info as _packet_l2_payload_info,
    packet_protocol_from_binary as _packet_protocol_from_binary,
)
from app.trex.workbench_packet_fields import (
    arp_fields_from_packet as _arp_fields_from_packet,
    dhcp_fields_from_packet as _dhcp_fields_from_packet,
    dns_fields_from_packet as _dns_fields_from_packet,
    icmp_fields_from_packet as _icmp_fields_from_packet,
    packet_byte_from_binary as _packet_byte_from_binary,
    packet_ipv4_from_binary as _packet_ipv4_from_binary,
    packet_ipv6_flow_label_from_binary as _packet_ipv6_flow_label_from_binary,
    packet_ipv6_from_binary as _packet_ipv6_from_binary,
    packet_ipv6_traffic_class_from_binary as _packet_ipv6_traffic_class_from_binary,
    packet_mac_from_binary as _packet_mac_from_binary,
    packet_port_from_binary as _packet_port_from_binary,
    packet_word_from_binary as _packet_word_from_binary,
    sctp_fields_from_packet as _sctp_fields_from_packet,
    tcp_fields_from_packet as _tcp_fields_from_packet,
    udp_checksum_from_packet as _udp_checksum_from_packet,
    udp_length_from_packet as _udp_length_from_packet,
)
from app.trex.workbench_packet_import import (
    packet_gre_info as _packet_gre_info,
    packet_gtpu_info as _packet_gtpu_info,
    packet_vxlan_info as _packet_vxlan_info,
)
from app.trex.workbench_profile import (
    decode_workbench_packet_meta as _decode_packet_meta,
    mpls_label_value as _mpls_label_value,
    mpls_labels_from_meta_or_packet as _mpls_labels_from_meta_or_packet,
    vlan_tag_value as _vlan_tag_value,
    vlan_tags_from_meta_or_packet as _vlan_tags_from_meta_or_packet,
)
from app.trex.workbench_protocol import workbench_advanced_cache_from_vm as _advanced_cache_from_vm
from app.trex.workbench_values import (
    PROFILE_DEFAULT_DST_IPV4,
    PROFILE_DEFAULT_DST_IPV6,
    PROFILE_DEFAULT_DST_MAC,
    PROFILE_DEFAULT_DST_PORT,
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
    PROFILE_DEFAULT_ICMP_TYPE,
    PROFILE_DEFAULT_ICMPV6_TYPE,
    PROFILE_DEFAULT_IP_ID,
    PROFILE_DEFAULT_IP_TTL,
    PROFILE_DEFAULT_IPV4_CHECKSUM,
    PROFILE_DEFAULT_IPV6_FLOW_LABEL,
    PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS,
    PROFILE_DEFAULT_MPLS_LABEL,
    PROFILE_DEFAULT_MPLS_TC,
    PROFILE_DEFAULT_MPLS_TTL,
    PROFILE_DEFAULT_SRC_IPV4,
    PROFILE_DEFAULT_SRC_IPV6,
    PROFILE_DEFAULT_SRC_MAC,
    PROFILE_DEFAULT_SRC_PORT,
    PROFILE_DEFAULT_UDP_CHECKSUM,
    PROFILE_DEFAULT_UDP_LENGTH,
    PROFILE_DEFAULT_VLAN_TPID,
    PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4,
    PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6,
    PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT,
    PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4,
    PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6,
    PROFILE_DEFAULT_VXLAN_INNER_TTL,
    PROFILE_DEFAULT_VXLAN_VNI,
    PROFILE_MAX_VLAN_ID,
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
    default_arp_fields as _default_arp_fields,
    default_icmp_fields as _default_icmp_fields,
    default_sctp_fields as _default_sctp_fields,
    default_tcp_fields as _default_tcp_fields,
    optional_bounded_int as _optional_bounded_int,
)


def stream_from_gui_yaml(entry: dict[str, Any], stream_data: dict[str, Any], index: int) -> dict[str, Any]:
    mode_data = stream_data.get("mode") if isinstance(stream_data.get("mode"), dict) else {}
    rate_data = mode_data.get("rate") if isinstance(mode_data.get("rate"), dict) else {}
    packet_data = stream_data.get("packet") if isinstance(stream_data.get("packet"), dict) else {}
    flow_stats = stream_data.get("flow_stats") if isinstance(stream_data.get("flow_stats"), dict) else {}
    vm_data = stream_data.get("vm") if isinstance(stream_data.get("vm"), dict) else {}
    cache_type, cache_value = _advanced_cache_from_vm(vm_data)
    binary = packet_data.get("binary")
    binary_bytes = b""
    frame_length = 64
    if isinstance(binary, str):
        try:
            binary_bytes = base64.b64decode(binary, validate=True)
            frame_length = len(binary_bytes) + 4
        except (ValueError, binascii.Error):
            frame_length = 64
    meta = _decode_packet_meta(packet_data.get("meta"))
    selection = meta.get("protocol_selection") if isinstance(meta.get("protocol_selection"), dict) else {}
    ethernet = meta.get("ethernet") if isinstance(meta.get("ethernet"), dict) else {}
    mac = meta.get("mac") if isinstance(meta.get("mac"), dict) else {}
    mac_source = mac.get("source") if isinstance(mac.get("source"), dict) else {}
    mac_destination = mac.get("destination") if isinstance(mac.get("destination"), dict) else {}
    arp = meta.get("arp") if isinstance(meta.get("arp"), dict) else {}
    vlan = meta.get("vlan") if isinstance(meta.get("vlan"), dict) else {}
    mpls = meta.get("mpls") if isinstance(meta.get("mpls"), dict) else {}
    vxlan = meta.get("vxlan") if isinstance(meta.get("vxlan"), dict) else {}
    vxlan_inner_ethernet = (
        vxlan.get("inner_ethernet") if isinstance(vxlan.get("inner_ethernet"), dict) else {}
    )
    vxlan_inner_ipv4 = vxlan.get("inner_ipv4") if isinstance(vxlan.get("inner_ipv4"), dict) else {}
    vxlan_inner_ipv6 = vxlan.get("inner_ipv6") if isinstance(vxlan.get("inner_ipv6"), dict) else {}
    vxlan_inner_udp = vxlan.get("inner_udp") if isinstance(vxlan.get("inner_udp"), dict) else {}
    gtpu = meta.get("gtpu") if isinstance(meta.get("gtpu"), dict) else {}
    gtpu_inner_ipv4 = gtpu.get("inner_ipv4") if isinstance(gtpu.get("inner_ipv4"), dict) else {}
    gtpu_inner_ipv6 = gtpu.get("inner_ipv6") if isinstance(gtpu.get("inner_ipv6"), dict) else {}
    gtpu_inner_udp = gtpu.get("inner_udp") if isinstance(gtpu.get("inner_udp"), dict) else {}
    gre = meta.get("gre") if isinstance(meta.get("gre"), dict) else {}
    gre_inner_ipv4 = gre.get("inner_ipv4") if isinstance(gre.get("inner_ipv4"), dict) else {}
    gre_inner_ipv6 = gre.get("inner_ipv6") if isinstance(gre.get("inner_ipv6"), dict) else {}
    gre_inner_udp = gre.get("inner_udp") if isinstance(gre.get("inner_udp"), dict) else {}
    sctp = meta.get("sctp") if isinstance(meta.get("sctp"), dict) else {}
    ipv4 = meta.get("ipv4") if isinstance(meta.get("ipv4"), dict) else {}
    ipv6 = meta.get("ipv6") if isinstance(meta.get("ipv6"), dict) else {}
    l4 = meta.get("l4") if isinstance(meta.get("l4"), dict) else {}
    dns = meta.get("dns") if isinstance(meta.get("dns"), dict) else {}
    dhcp = meta.get("dhcp") if isinstance(meta.get("dhcp"), dict) else {}
    payload = meta.get("payload") if isinstance(meta.get("payload"), dict) else {}
    payload_pattern = _clean_payload_pattern(payload.get("pattern"))
    if isinstance(payload_pattern, TrexCallResult):
        payload_pattern = "00"
    frame_length_type = _choice(selection.get("frame_length_type"), PROFILE_WORKBENCH_FRAME_LENGTH_TYPES, "Fixed")
    frame_length = _bounded_int(selection.get("frame_length"), 64, 9216, frame_length)
    frame_length_min = _bounded_int(selection.get("min_length"), 64, 9216, 64)
    frame_length_max = _bounded_int(selection.get("max_length"), 64, 9216, max(1518, frame_length))
    if frame_length_type != "Fixed":
        frame_length_min = min(frame_length_min, 9211)
        if frame_length_max <= frame_length_min:
            frame_length_max = min(9216, frame_length_min + 5)
        frame_length = frame_length_max
    ipv4_offsets = _ipv4_offsets(binary_bytes)
    ipv6_offsets = _ipv6_offsets(binary_bytes)
    l2_info = _packet_l2_payload_info(binary_bytes)
    protocol_from_packet = _packet_protocol_from_binary(binary_bytes)
    packet_has_l3 = ipv4_offsets is not None or ipv6_offsets is not None
    selected_has_ipv6 = selection.get("is_ipv6_selected") is True or (
        not selection and ipv6_offsets is not None
    )
    selected_has_ipv4 = selection.get("is_ipv4_selected") is True or (
        not selection and ipv4_offsets is not None
    )
    selected_has_arp = selection.get("is_arp_selected") is True or (
        not selection and l2_info is not None and l2_info["ether_type"] == 0x0806
    )
    selected_ip_version = 6 if selected_has_ipv6 else 4
    offsets = ipv6_offsets if selected_ip_version == 6 else ipv4_offsets
    vlan_stack = l2_info.get("vlan_stack", []) if l2_info is not None else []
    vlan_info = vlan_stack[0] if vlan_stack else None
    vlan_tags = _vlan_tags_from_meta_or_packet(
        vlan,
        vlan_stack,
        tagged_selected=selection.get("is_tagged_vlan_selected") is True,
        has_selection=bool(selection),
    )
    vlan2_info = vlan_tags[1] if len(vlan_tags) > 1 else None
    vlan2_packet_info = vlan_stack[1] if len(vlan_stack) > 1 else None
    mpls_info = l2_info["mpls_info"] if l2_info is not None else None
    l4_offset_from_packet = offsets[0] + offsets[1] if offsets is not None else 0
    vxlan_info = _packet_vxlan_info(binary_bytes, l4_offset_from_packet) if l4_offset_from_packet else None
    gtpu_info = _packet_gtpu_info(binary_bytes, l4_offset_from_packet) if l4_offset_from_packet else None
    gre_info = _packet_gre_info(binary_bytes, l4_offset_from_packet) if l4_offset_from_packet else None
    vlan_enabled = selection.get("is_tagged_vlan_selected") is True or bool(vlan_tags)
    mpls_enabled = selection.get("is_mpls_selected") is True or mpls_info is not None
    vxlan_enabled = selection.get("is_vxlan_selected") is True or vxlan_info is not None
    gtpu_enabled = selection.get("is_gtpu_selected") is True or gtpu.get("enabled") is True or gtpu_info is not None
    if gtpu_enabled:
        vxlan_enabled = False
    mpls_labels = _mpls_labels_from_meta_or_packet(mpls, mpls_info) if mpls_enabled else []
    mpls_stack_length = len(mpls_labels) if mpls_labels else 1 if mpls_enabled else 0
    vlan_stack_length = len(vlan_tags) if vlan_tags else 1 if vlan_enabled else 0
    ip_offset = offsets[0] if offsets is not None else 14 + (4 * vlan_stack_length) + (4 * mpls_stack_length)
    ihl = offsets[1] if offsets is not None else 20
    l4_offset = ip_offset + ihl
    vlan_tpid_fallback = f"{vlan_info['tpid']:04x}" if vlan_info is not None else PROFILE_DEFAULT_VLAN_TPID
    vlan2_tpid_fallback = (
        f"{vlan2_packet_info['tpid']:04x}" if vlan2_packet_info is not None else PROFILE_DEFAULT_VLAN_TPID
    )
    vlan_id_source = vlan.get("v_id") if "v_id" in vlan else vlan.get("vlan")
    if selected_has_arp:
        packet_type = "Ethernet/ARP"
    elif selected_has_ipv4 or selected_has_ipv6 or packet_has_l3:
        selected_l4 = ""
        if selection.get("is_tcp_selected") is True or (not selection and protocol_from_packet == 6):
            selected_l4 = "/TCP"
        elif (
            selection.get("is_udp_selected") is True
            or gtpu_enabled
            or (not selection and protocol_from_packet == 17)
        ):
            selected_l4 = "/UDP"
        elif selection.get("is_gre_selected") is True or (not selection and protocol_from_packet == 47):
            selected_l4 = "/GRE"
        elif selection.get("is_sctp_selected") is True or (not selection and protocol_from_packet == 132):
            selected_l4 = "/SCTP"
        elif selected_ip_version == 4 and (
            selection.get("is_icmp_selected") is True or (not selection and protocol_from_packet == 1)
        ):
            selected_l4 = "/ICMP"
        elif selected_ip_version == 6 and (
            selection.get("is_icmpv6_selected") is True
            or selection.get("is_icmp_selected") is True
            or (not selection and protocol_from_packet == 58)
        ):
            selected_l4 = "/ICMPv6"
        packet_type = f"Ethernet/IPv{selected_ip_version}{selected_l4}"
    else:
        packet_type = "Ethernet"
    arp_packet_fields = (
        _arp_fields_from_packet(binary_bytes, l2_info["ip_offset"])
        if packet_type == "Ethernet/ARP" and l2_info is not None
        else _default_arp_fields()
    )
    tcp_packet_fields = _tcp_fields_from_packet(binary_bytes, l4_offset) if packet_type.endswith("/TCP") else _default_tcp_fields()
    sctp_packet_fields = (
        _sctp_fields_from_packet(binary_bytes, l4_offset) if packet_type.endswith("/SCTP") else _default_sctp_fields()
    )
    icmp_packet_fields = (
        _icmp_fields_from_packet(
            binary_bytes,
            l4_offset,
            PROFILE_DEFAULT_ICMPV6_TYPE if packet_type.endswith("/ICMPv6") else PROFILE_DEFAULT_ICMP_TYPE,
        )
        if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6")
        else _default_icmp_fields()
    )
    packet_has_l4 = packet_type.endswith("/TCP") or packet_type.endswith("/UDP") or packet_type.endswith("/SCTP")
    packet_src_port = _packet_port_from_binary(binary_bytes, l4_offset, PROFILE_DEFAULT_SRC_PORT) if packet_has_l4 else PROFILE_DEFAULT_SRC_PORT
    packet_dst_port = _packet_port_from_binary(binary_bytes, l4_offset + 2, PROFILE_DEFAULT_DST_PORT) if packet_has_l4 else PROFILE_DEFAULT_DST_PORT
    packet_udp_length = _udp_length_from_packet(binary_bytes, l4_offset) if packet_type.endswith("/UDP") else PROFILE_DEFAULT_UDP_LENGTH
    packet_udp_checksum = (
        _udp_checksum_from_packet(binary_bytes, l4_offset)
        if packet_type.endswith("/UDP")
        else PROFILE_DEFAULT_UDP_CHECKSUM
    )
    dns_packet_fields = _dns_fields_from_packet(binary_bytes, l4_offset, packet_type.endswith("/UDP"))
    dns_query_name = _clean_dns_query_name(dns.get("query_name"), dns_packet_fields["dns_query_name"])
    if isinstance(dns_query_name, TrexCallResult):
        dns_query_name = dns_packet_fields["dns_query_name"]
    dhcp_packet_fields = _dhcp_fields_from_packet(binary_bytes, l4_offset, packet_type.endswith("/UDP"))
    dhcp_hostname = _clean_dhcp_hostname(dhcp.get("hostname"), dhcp_packet_fields["dhcp_hostname"])
    if isinstance(dhcp_hostname, TrexCallResult):
        dhcp_hostname = dhcp_packet_fields["dhcp_hostname"]
    dhcp_parameter_request_list = _clean_dhcp_parameter_request_list(
        dhcp.get("parameter_request_list"),
        dhcp_packet_fields["dhcp_parameter_request_list"],
    )
    if isinstance(dhcp_parameter_request_list, TrexCallResult):
        dhcp_parameter_request_list = dhcp_packet_fields["dhcp_parameter_request_list"]
    packet_ipv4_tos = (
        _packet_byte_from_binary(binary_bytes, ip_offset + 1, 0)
        if selected_ip_version == 4 and packet_has_l3
        else 0
    )
    packet_ipv4_id = (
        _packet_word_from_binary(binary_bytes, ip_offset + 4, PROFILE_DEFAULT_IP_ID)
        if selected_ip_version == 4 and packet_has_l3
        else PROFILE_DEFAULT_IP_ID
    )
    packet_ipv4_fragment_word = (
        _packet_word_from_binary(binary_bytes, ip_offset + 6, 0)
        if selected_ip_version == 4 and packet_has_l3
        else 0
    )
    packet_ipv4_ttl = (
        _packet_byte_from_binary(binary_bytes, ip_offset + 8, PROFILE_DEFAULT_IP_TTL)
        if selected_ip_version == 4 and packet_has_l3
        else PROFILE_DEFAULT_IP_TTL
    )
    packet_ipv4_checksum = (
        f"{_packet_word_from_binary(binary_bytes, ip_offset + 10, int(PROFILE_DEFAULT_IPV4_CHECKSUM, 16)):04X}"
        if selected_ip_version == 4 and packet_has_l3
        else PROFILE_DEFAULT_IPV4_CHECKSUM
    )
    packet_ipv6_traffic_class = (
        _packet_ipv6_traffic_class_from_binary(binary_bytes, ip_offset, PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS)
        if selected_ip_version == 6 and packet_has_l3
        else PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS
    )
    packet_ipv6_flow_label = (
        _packet_ipv6_flow_label_from_binary(binary_bytes, ip_offset, PROFILE_DEFAULT_IPV6_FLOW_LABEL)
        if selected_ip_version == 6 and packet_has_l3
        else PROFILE_DEFAULT_IPV6_FLOW_LABEL
    )
    packet_ipv6_hop_limit = (
        _packet_byte_from_binary(binary_bytes, ip_offset + 7, PROFILE_DEFAULT_IP_TTL)
        if selected_ip_version == 6 and packet_has_l3
        else PROFILE_DEFAULT_IP_TTL
    )
    ipv4_tos = _bounded_int(ipv4.get("tos"), 0, 255, packet_ipv4_tos)
    vlan_tpid_source = _vlan_tag_value(
        vlan_tags,
        0,
        "tp_id",
        _vlan_tag_value(vlan_tags, 0, "tpid", vlan.get("tp_id")),
    )
    vlan_tpid_loaded = _clean_hex_word_text(vlan_tpid_source, vlan_tpid_fallback)
    vlan_tpid_override_loaded = _bool(
        _vlan_tag_value(vlan_tags, 0, "is_override_tp_id", vlan.get("is_override_tp_id")),
        vlan_info is not None and vlan_info["tpid"] != int(PROFILE_DEFAULT_VLAN_TPID, 16),
    )
    default_outer_ether_type = _default_outer_ether_type_for_fields(
        packet_type,
        vlan_enabled,
        mpls_enabled,
        vlan_tpid_loaded,
    )
    packet_outer_ether_type = _packet_word_from_binary(binary_bytes, 12, default_outer_ether_type)
    ether_type_loaded = _clean_hex_word_text(ethernet.get("type"), f"{packet_outer_ether_type:04x}")
    ether_type_override_requested = _bool(ethernet.get("is_override"), False)
    ether_type_override_source = ethernet.get("override_source")
    ether_type_override_loaded = ether_type_override_requested and (
        ether_type_override_source == "operator" or int(ether_type_loaded, 16) != default_outer_ether_type
    )
    return {
        "name": _clean_stream_name(entry.get("name"), index),
        "packet_type": packet_type,
        "frame_length_type": frame_length_type,
        "frame_length": frame_length,
        "frame_length_min": frame_length_min,
        "frame_length_max": frame_length_max,
        "mode": _choice(mode_data.get("type"), PROFILE_WORKBENCH_MODES, "continuous"),
        "rate_type": _choice(rate_data.get("type"), PROFILE_WORKBENCH_RATE_TYPES, "pps"),
        "rate_value": _bounded_float(rate_data.get("value"), 0.000001, 1_000_000_000_000.0, 1.0),
        "enabled": _bool(stream_data.get("enabled"), True),
        "self_start": _bool(stream_data.get("self_start"), True),
        "total_pkts": _bounded_int(mode_data.get("total_pkts"), 1, 4_294_967_295, 1),
        "pkts_per_burst": _bounded_int(mode_data.get("pkts_per_burst"), 1, 4_294_967_295, 1),
        "count": _bounded_int(mode_data.get("count"), 1, 4_294_967_295, 1),
        "next_stream_id": _optional_bounded_int(stream_data.get("next_stream_id"), 1, 4_294_967_295),
        "action_count": _bounded_int(stream_data.get("action_count"), 0, 4_294_967_295, 0),
        "isg": _bounded_float(stream_data.get("isg"), 0.0, 86_400.0, 0.0),
        "ibg": _bounded_float(mode_data.get("ibg"), 0.0, 86_400.0, 0.0),
        "pg_id": _bounded_int(flow_stats.get("stream_id"), 0, 16_777_215, index + 1),
        "flow_stats_enabled": _bool(flow_stats.get("enabled"), True),
        "latency_enabled": flow_stats.get("rule_type") == "latency",
        "ether_dst": _clean_mac_text(
            mac_destination.get("address"),
            _clean_mac_text(ethernet.get("dst"), _packet_mac_from_binary(binary_bytes, 0, PROFILE_DEFAULT_DST_MAC)),
        ),
        "ether_src": _clean_mac_text(
            mac_source.get("address"),
            _clean_mac_text(ethernet.get("src"), _packet_mac_from_binary(binary_bytes, 6, PROFILE_DEFAULT_SRC_MAC)),
        ),
        "ether_type_override": ether_type_override_loaded,
        "ether_type": ether_type_loaded,
        "ether_dst_mode": _choice(mac_destination.get("mode"), PROFILE_WORKBENCH_MAC_ADDRESS_MODES, "TRex Config"),
        "ether_dst_count": _bounded_int(mac_destination.get("count"), 1, 9999, 16),
        "ether_dst_step": _bounded_int(mac_destination.get("step"), 1, 999, 1),
        "ether_src_mode": _choice(mac_source.get("mode"), PROFILE_WORKBENCH_MAC_ADDRESS_MODES, "TRex Config"),
        "ether_src_count": _bounded_int(mac_source.get("count"), 1, 9999, 16),
        "ether_src_step": _bounded_int(mac_source.get("step"), 1, 999, 1),
        "arp_hardware_type": _bounded_int(
            arp.get("hardware_type"), 0, 65_535, arp_packet_fields["arp_hardware_type"]
        ),
        "arp_protocol_type": _clean_hex_word_text_upper(
            arp.get("protocol_type"), arp_packet_fields["arp_protocol_type"]
        ),
        "arp_hardware_size": _bounded_int(
            arp.get("hardware_size"), 0, 255, arp_packet_fields["arp_hardware_size"]
        ),
        "arp_protocol_size": _bounded_int(
            arp.get("protocol_size"), 0, 255, arp_packet_fields["arp_protocol_size"]
        ),
        "arp_operation": _bounded_int(arp.get("operation"), 0, 65_535, arp_packet_fields["arp_operation"]),
        "arp_operation_mode": _choice(
            arp.get("operation_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, arp_packet_fields["arp_operation_mode"]
        ),
        "arp_operation_count": _bounded_int(
            arp.get("operation_count"), 2, 65_536, arp_packet_fields["arp_operation_count"]
        ),
        "arp_operation_step": _bounded_int(
            arp.get("operation_step"), 1, 65_535, arp_packet_fields["arp_operation_step"]
        ),
        "arp_sender_mac": _clean_mac_text(arp.get("sender_mac"), arp_packet_fields["arp_sender_mac"]),
        "arp_sender_mac_mode": _choice(
            arp.get("sender_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, arp_packet_fields["arp_sender_mac_mode"]
        ),
        "arp_sender_mac_count": _bounded_int(
            arp.get("sender_mac_count"), 2, 100_000_000, arp_packet_fields["arp_sender_mac_count"]
        ),
        "arp_sender_mac_step": _bounded_int(
            arp.get("sender_mac_step"), 1, 100_000_000, arp_packet_fields["arp_sender_mac_step"]
        ),
        "arp_sender_ip": _clean_ipv4_text(arp.get("sender_ip"), arp_packet_fields["arp_sender_ip"]),
        "arp_sender_ip_mode": _choice(
            arp.get("sender_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, arp_packet_fields["arp_sender_ip_mode"]
        ),
        "arp_sender_ip_count": _bounded_int(
            arp.get("sender_ip_count"), 2, 100_000_000, arp_packet_fields["arp_sender_ip_count"]
        ),
        "arp_sender_ip_step": _bounded_int(
            arp.get("sender_ip_step"), 1, 100_000_000, arp_packet_fields["arp_sender_ip_step"]
        ),
        "arp_target_mac": _clean_mac_text(arp.get("target_mac"), arp_packet_fields["arp_target_mac"]),
        "arp_target_mac_mode": _choice(
            arp.get("target_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, arp_packet_fields["arp_target_mac_mode"]
        ),
        "arp_target_mac_count": _bounded_int(
            arp.get("target_mac_count"), 2, 100_000_000, arp_packet_fields["arp_target_mac_count"]
        ),
        "arp_target_mac_step": _bounded_int(
            arp.get("target_mac_step"), 1, 100_000_000, arp_packet_fields["arp_target_mac_step"]
        ),
        "arp_target_ip": _clean_ipv4_text(arp.get("target_ip"), arp_packet_fields["arp_target_ip"]),
        "arp_target_ip_mode": _choice(
            arp.get("target_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, arp_packet_fields["arp_target_ip_mode"]
        ),
        "arp_target_ip_count": _bounded_int(
            arp.get("target_ip_count"), 2, 100_000_000, arp_packet_fields["arp_target_ip_count"]
        ),
        "arp_target_ip_step": _bounded_int(
            arp.get("target_ip_step"), 1, 100_000_000, arp_packet_fields["arp_target_ip_step"]
        ),
        "vlan_enabled": vlan_enabled,
        "vlan_tpid_override": vlan_tpid_override_loaded,
        "vlan_tpid": vlan_tpid_loaded,
        "vlan_priority": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "priority", vlan.get("priority")),
            0,
            7,
            vlan_info["priority"] if vlan_info is not None else 0,
        ),
        "vlan_priority_mode": _choice(
            _vlan_tag_value(vlan_tags, 0, "priority_mode", vlan.get("priority_mode")),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "vlan_priority_count": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "priority_count", vlan.get("priority_count")), 2, 8, 4
        ),
        "vlan_priority_step": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "priority_step", vlan.get("priority_step")), 1, 7, 1
        ),
        "vlan_cfi": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "cfi", vlan.get("cfi")),
            0,
            1,
            vlan_info["cfi"] if vlan_info is not None else 0,
        ),
        "vlan_id": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "v_id", _vlan_tag_value(vlan_tags, 0, "vlan", vlan_id_source)),
            0,
            PROFILE_MAX_VLAN_ID,
            vlan_info["vlan"] if vlan_info is not None else 0,
        ),
        "vlan_id_mode": _choice(
            _vlan_tag_value(vlan_tags, 0, "v_id_mode", vlan.get("v_id_mode")),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "vlan_id_count": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "v_id_count", vlan.get("v_id_count")), 2, PROFILE_MAX_VLAN_ID + 1, 16
        ),
        "vlan_id_step": _bounded_int(
            _vlan_tag_value(vlan_tags, 0, "v_id_step", vlan.get("v_id_step")), 1, PROFILE_MAX_VLAN_ID, 1
        ),
        "vlan2_enabled": len(vlan_tags) > 1,
        "vlan2_tpid_override": _bool(
            _vlan_tag_value(vlan_tags, 1, "is_override_tp_id", False),
            vlan2_packet_info is not None and vlan2_packet_info.get("tpid") != int(PROFILE_DEFAULT_VLAN_TPID, 16),
        ),
        "vlan2_tpid": _clean_hex_word_text(
            _vlan_tag_value(vlan_tags, 1, "tp_id", _vlan_tag_value(vlan_tags, 1, "tpid", None)),
            vlan2_tpid_fallback,
        ),
        "vlan2_priority": _bounded_int(
            _vlan_tag_value(vlan_tags, 1, "priority", None),
            0,
            7,
            vlan2_packet_info["priority"] if vlan2_packet_info is not None else 0,
        ),
        "vlan2_priority_mode": _choice(
            _vlan_tag_value(vlan_tags, 1, "priority_mode", None), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "vlan2_priority_count": _bounded_int(_vlan_tag_value(vlan_tags, 1, "priority_count", None), 2, 8, 4),
        "vlan2_priority_step": _bounded_int(_vlan_tag_value(vlan_tags, 1, "priority_step", None), 1, 7, 1),
        "vlan2_cfi": _bounded_int(
            _vlan_tag_value(vlan_tags, 1, "cfi", None),
            0,
            1,
            vlan2_packet_info["cfi"] if vlan2_packet_info is not None else 0,
        ),
        "vlan2_id": _bounded_int(
            _vlan_tag_value(vlan_tags, 1, "v_id", _vlan_tag_value(vlan_tags, 1, "vlan", None)),
            0,
            PROFILE_MAX_VLAN_ID,
            vlan2_packet_info["vlan"] if vlan2_packet_info is not None else 1,
        ),
        "vlan2_id_mode": _choice(
            _vlan_tag_value(vlan_tags, 1, "v_id_mode", None), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "vlan2_id_count": _bounded_int(
            _vlan_tag_value(vlan_tags, 1, "v_id_count", None), 2, PROFILE_MAX_VLAN_ID + 1, 16
        ),
        "vlan2_id_step": _bounded_int(
            _vlan_tag_value(vlan_tags, 1, "v_id_step", None), 1, PROFILE_MAX_VLAN_ID, 1
        ),
        "mpls_enabled": mpls_enabled,
        "mpls_label": _bounded_int(
            mpls.get("label"),
            0,
            1_048_575,
            _mpls_label_value(mpls_labels, 0, "label", PROFILE_DEFAULT_MPLS_LABEL),
        ),
        "mpls_label_mode": _choice(
            mpls.get("label_mode", _mpls_label_value(mpls_labels, 0, "label_mode", "Fixed")),
            PROFILE_WORKBENCH_MPLS_LABEL_MODES,
            "Fixed",
        ),
        "mpls_label_count": _bounded_int(
            mpls.get("label_count", _mpls_label_value(mpls_labels, 0, "label_count", 16)),
            2,
            1_048_576,
            16,
        ),
        "mpls_label_step": _bounded_int(
            mpls.get("label_step", _mpls_label_value(mpls_labels, 0, "label_step", 1)),
            1,
            1_048_575,
            1,
        ),
        "mpls_tc": _bounded_int(
            mpls.get("traffic_class"),
            0,
            7,
            _mpls_label_value(mpls_labels, 0, "traffic_class", PROFILE_DEFAULT_MPLS_TC),
        ),
        "mpls_tc_mode": _choice(
            mpls.get("traffic_class_mode", _mpls_label_value(mpls_labels, 0, "traffic_class_mode", "Fixed")),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_tc_count": _bounded_int(
            mpls.get("traffic_class_count", _mpls_label_value(mpls_labels, 0, "traffic_class_count", 4)),
            2,
            8,
            4,
        ),
        "mpls_tc_step": _bounded_int(
            mpls.get("traffic_class_step", _mpls_label_value(mpls_labels, 0, "traffic_class_step", 1)),
            1,
            7,
            1,
        ),
        "mpls_ttl": _bounded_int(
            mpls.get("ttl"),
            0,
            255,
            _mpls_label_value(mpls_labels, 0, "ttl", PROFILE_DEFAULT_MPLS_TTL),
        ),
        "mpls_ttl_mode": _choice(
            mpls.get("ttl_mode", _mpls_label_value(mpls_labels, 0, "ttl_mode", "Fixed")),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_ttl_count": _bounded_int(
            mpls.get("ttl_count", _mpls_label_value(mpls_labels, 0, "ttl_count", 16)),
            2,
            256,
            16,
        ),
        "mpls_ttl_step": _bounded_int(
            mpls.get("ttl_step", _mpls_label_value(mpls_labels, 0, "ttl_step", 1)),
            1,
            255,
            1,
        ),
        "mpls_label2_enabled": mpls_enabled and len(mpls_labels) > 1,
        "mpls_label2": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "label", PROFILE_DEFAULT_MPLS_LABEL + 1),
            0,
            1_048_575,
            PROFILE_DEFAULT_MPLS_LABEL + 1,
        ),
        "mpls_label2_mode": _choice(
            _mpls_label_value(mpls_labels, 1, "label_mode", "Fixed"),
            PROFILE_WORKBENCH_MPLS_LABEL_MODES,
            "Fixed",
        ),
        "mpls_label2_count": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "label_count", 16),
            2,
            1_048_576,
            16,
        ),
        "mpls_label2_step": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "label_step", 1),
            1,
            1_048_575,
            1,
        ),
        "mpls_label2_tc": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "traffic_class", PROFILE_DEFAULT_MPLS_TC),
            0,
            7,
            PROFILE_DEFAULT_MPLS_TC,
        ),
        "mpls_label2_tc_mode": _choice(
            _mpls_label_value(mpls_labels, 1, "traffic_class_mode", "Fixed"),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_label2_tc_count": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "traffic_class_count", 4),
            2,
            8,
            4,
        ),
        "mpls_label2_tc_step": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "traffic_class_step", 1),
            1,
            7,
            1,
        ),
        "mpls_label2_ttl": _bounded_int(
            _mpls_label_value(mpls_labels, 1, "ttl", PROFILE_DEFAULT_MPLS_TTL),
            0,
            255,
            PROFILE_DEFAULT_MPLS_TTL,
        ),
        "mpls_label2_ttl_mode": _choice(
            _mpls_label_value(mpls_labels, 1, "ttl_mode", "Fixed"),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_label2_ttl_count": _bounded_int(_mpls_label_value(mpls_labels, 1, "ttl_count", 16), 2, 256, 16),
        "mpls_label2_ttl_step": _bounded_int(_mpls_label_value(mpls_labels, 1, "ttl_step", 1), 1, 255, 1),
        "mpls_label3_enabled": mpls_enabled and len(mpls_labels) > 2,
        "mpls_label3": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "label", PROFILE_DEFAULT_MPLS_LABEL + 2),
            0,
            1_048_575,
            PROFILE_DEFAULT_MPLS_LABEL + 2,
        ),
        "mpls_label3_mode": _choice(
            _mpls_label_value(mpls_labels, 2, "label_mode", "Fixed"),
            PROFILE_WORKBENCH_MPLS_LABEL_MODES,
            "Fixed",
        ),
        "mpls_label3_count": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "label_count", 16),
            2,
            1_048_576,
            16,
        ),
        "mpls_label3_step": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "label_step", 1),
            1,
            1_048_575,
            1,
        ),
        "mpls_label3_tc": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "traffic_class", PROFILE_DEFAULT_MPLS_TC),
            0,
            7,
            PROFILE_DEFAULT_MPLS_TC,
        ),
        "mpls_label3_tc_mode": _choice(
            _mpls_label_value(mpls_labels, 2, "traffic_class_mode", "Fixed"),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_label3_tc_count": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "traffic_class_count", 4),
            2,
            8,
            4,
        ),
        "mpls_label3_tc_step": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "traffic_class_step", 1),
            1,
            7,
            1,
        ),
        "mpls_label3_ttl": _bounded_int(
            _mpls_label_value(mpls_labels, 2, "ttl", PROFILE_DEFAULT_MPLS_TTL),
            0,
            255,
            PROFILE_DEFAULT_MPLS_TTL,
        ),
        "mpls_label3_ttl_mode": _choice(
            _mpls_label_value(mpls_labels, 2, "ttl_mode", "Fixed"),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            "Fixed",
        ),
        "mpls_label3_ttl_count": _bounded_int(_mpls_label_value(mpls_labels, 2, "ttl_count", 16), 2, 256, 16),
        "mpls_label3_ttl_step": _bounded_int(_mpls_label_value(mpls_labels, 2, "ttl_step", 1), 1, 255, 1),
        "vxlan_enabled": vxlan_enabled,
        "vxlan_vni": _bounded_int(
            vxlan.get("vni"),
            0,
            16_777_215,
            vxlan_info["vni"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_VNI,
        ),
        "vxlan_vni_mode": _choice(vxlan.get("vni_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "vxlan_vni_count": _bounded_int(vxlan.get("vni_count"), 2, 16_777_216, 16),
        "vxlan_vni_step": _bounded_int(vxlan.get("vni_step"), 1, 16_777_215, 1),
        "vxlan_inner_ether_dst": _clean_mac_text(
            vxlan_inner_ethernet.get("dst"),
            vxlan_info["inner_ether_dst"] if vxlan_info is not None else PROFILE_DEFAULT_DST_MAC,
        ),
        "vxlan_inner_ether_src": _clean_mac_text(
            vxlan_inner_ethernet.get("src"),
            vxlan_info["inner_ether_src"] if vxlan_info is not None else PROFILE_DEFAULT_SRC_MAC,
        ),
        "vxlan_inner_ip_version": _choice(
            vxlan.get("inner_ip_version"),
            PROFILE_WORKBENCH_VXLAN_INNER_IP_VERSIONS,
            vxlan_info["inner_ip_version"] if vxlan_info is not None else ("IPv6" if vxlan_inner_ipv6 else "IPv4"),
        ),
        "vxlan_inner_ipv4_src": _clean_ipv4_text(
            vxlan_inner_ipv4.get("src"),
            vxlan_info["inner_ipv4_src"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4,
        ),
        "vxlan_inner_ipv4_src_mode": _choice(
            vxlan_inner_ipv4.get("src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "vxlan_inner_ipv4_src_count": _bounded_int(vxlan_inner_ipv4.get("src_count"), 2, 100_000_000, 16),
        "vxlan_inner_ipv4_src_step": _bounded_int(vxlan_inner_ipv4.get("src_step"), 1, 100_000_000, 1),
        "vxlan_inner_ipv4_dst": _clean_ipv4_text(
            vxlan_inner_ipv4.get("dst"),
            vxlan_info["inner_ipv4_dst"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4,
        ),
        "vxlan_inner_ipv4_dst_mode": _choice(
            vxlan_inner_ipv4.get("dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "vxlan_inner_ipv4_dst_count": _bounded_int(vxlan_inner_ipv4.get("dst_count"), 2, 100_000_000, 16),
        "vxlan_inner_ipv4_dst_step": _bounded_int(vxlan_inner_ipv4.get("dst_step"), 1, 100_000_000, 1),
        "vxlan_inner_ipv4_ttl": _bounded_int(
            vxlan_inner_ipv4.get("ttl"),
            0,
            255,
            vxlan_info["inner_ipv4_ttl"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_TTL,
        ),
        "vxlan_inner_ipv4_ttl_mode": _choice(
            vxlan_inner_ipv4.get("ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "vxlan_inner_ipv4_ttl_count": _bounded_int(vxlan_inner_ipv4.get("ttl_count"), 2, 256, 16),
        "vxlan_inner_ipv4_ttl_step": _bounded_int(vxlan_inner_ipv4.get("ttl_step"), 1, 255, 1),
        "vxlan_inner_ipv6_src": _clean_ipv6_text(
            vxlan_inner_ipv6.get("src"),
            vxlan_info["inner_ipv6_src"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6,
        ),
        "vxlan_inner_ipv6_src_mode": _choice(
            vxlan_inner_ipv6.get("src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "vxlan_inner_ipv6_src_count": _bounded_int(vxlan_inner_ipv6.get("src_count"), 2, 100_000_000, 16),
        "vxlan_inner_ipv6_src_step": _bounded_int(vxlan_inner_ipv6.get("src_step"), 1, 100_000_000, 1),
        "vxlan_inner_ipv6_dst": _clean_ipv6_text(
            vxlan_inner_ipv6.get("dst"),
            vxlan_info["inner_ipv6_dst"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6,
        ),
        "vxlan_inner_ipv6_dst_mode": _choice(
            vxlan_inner_ipv6.get("dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "vxlan_inner_ipv6_dst_count": _bounded_int(vxlan_inner_ipv6.get("dst_count"), 2, 100_000_000, 16),
        "vxlan_inner_ipv6_dst_step": _bounded_int(vxlan_inner_ipv6.get("dst_step"), 1, 100_000_000, 1),
        "vxlan_inner_ipv6_hop_limit": _bounded_int(
            vxlan_inner_ipv6.get("hop_limit"),
            0,
            255,
            vxlan_info["inner_ipv6_hop_limit"] if vxlan_info is not None else PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT,
        ),
        "vxlan_inner_ipv6_hop_limit_mode": _choice(
            vxlan_inner_ipv6.get("hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "vxlan_inner_ipv6_hop_limit_count": _bounded_int(vxlan_inner_ipv6.get("hop_limit_count"), 2, 256, 16),
        "vxlan_inner_ipv6_hop_limit_step": _bounded_int(vxlan_inner_ipv6.get("hop_limit_step"), 1, 255, 1),
        "vxlan_inner_l4_src_port": _bounded_int(
            vxlan_inner_udp.get("src_port"),
            0,
            65_535,
            vxlan_info["inner_l4_src_port"] if vxlan_info is not None else PROFILE_DEFAULT_SRC_PORT,
        ),
        "vxlan_inner_l4_src_port_mode": _choice(
            vxlan_inner_udp.get("src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "vxlan_inner_l4_src_port_count": _bounded_int(vxlan_inner_udp.get("src_port_count"), 2, 65_536, 16),
        "vxlan_inner_l4_src_port_step": _bounded_int(vxlan_inner_udp.get("src_port_step"), 1, 65_535, 1),
        "vxlan_inner_l4_dst_port": _bounded_int(
            vxlan_inner_udp.get("dst_port"),
            0,
            65_535,
            vxlan_info["inner_l4_dst_port"] if vxlan_info is not None else PROFILE_DEFAULT_DST_PORT,
        ),
        "vxlan_inner_l4_dst_port_mode": _choice(
            vxlan_inner_udp.get("dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "vxlan_inner_l4_dst_port_count": _bounded_int(vxlan_inner_udp.get("dst_port_count"), 2, 65_536, 16),
        "vxlan_inner_l4_dst_port_step": _bounded_int(vxlan_inner_udp.get("dst_port_step"), 1, 65_535, 1),
        "gtpu_enabled": gtpu_enabled,
        "gtpu_message_type": _bounded_int(
            gtpu.get("message_type"),
            0,
            255,
            gtpu_info["message_type"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_MESSAGE_TYPE,
        ),
        "gtpu_teid": _bounded_int(
            gtpu.get("teid"),
            0,
            4_294_967_295,
            gtpu_info["teid"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_TEID,
        ),
        "gtpu_teid_mode": _choice(gtpu.get("teid_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "gtpu_teid_count": _bounded_int(gtpu.get("teid_count"), 2, 4_294_967_296, 16),
        "gtpu_teid_step": _bounded_int(gtpu.get("teid_step"), 1, 4_294_967_295, 1),
        "gtpu_sequence_enabled": _bool(
            gtpu.get("sequence_enabled"), gtpu_info["sequence_enabled"] if gtpu_info is not None else False
        ),
        "gtpu_sequence": _bounded_int(
            gtpu.get("sequence"),
            0,
            65_535,
            gtpu_info["sequence"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_SEQUENCE,
        ),
        "gtpu_sequence_mode": _choice(gtpu.get("sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "gtpu_sequence_count": _bounded_int(gtpu.get("sequence_count"), 2, 65_536, 16),
        "gtpu_sequence_step": _bounded_int(gtpu.get("sequence_step"), 1, 65_535, 1),
        "gtpu_npdu_enabled": _bool(
            gtpu.get("n_pdu_enabled"), gtpu_info["npdu_enabled"] if gtpu_info is not None else False
        ),
        "gtpu_npdu": _bounded_int(
            gtpu.get("n_pdu_number"),
            0,
            255,
            gtpu_info["npdu"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_NPDU,
        ),
        "gtpu_npdu_mode": _choice(gtpu.get("n_pdu_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "gtpu_npdu_count": _bounded_int(gtpu.get("n_pdu_count"), 2, 256, 16),
        "gtpu_npdu_step": _bounded_int(gtpu.get("n_pdu_step"), 1, 255, 1),
        "gtpu_extension_enabled": _bool(
            gtpu.get("extension_enabled"),
            gtpu_info["extension_udp_port_enabled"] if gtpu_info is not None else False,
        ),
        "gtpu_extension_udp_port": _bounded_int(
            gtpu.get("extension_udp_port"),
            0,
            65_535,
            gtpu_info["extension_udp_port"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT,
        ),
        "gtpu_extension_udp_port_mode": _choice(
            gtpu.get("extension_udp_port_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "gtpu_extension_udp_port_count": _bounded_int(gtpu.get("extension_udp_port_count"), 2, 65_536, 16),
        "gtpu_extension_udp_port_step": _bounded_int(gtpu.get("extension_udp_port_step"), 1, 65_535, 1),
        "gtpu_inner_ip_version": _choice(
            gtpu.get("inner_ip_version"),
            PROFILE_WORKBENCH_GTPU_INNER_IP_VERSIONS,
            gtpu_info["inner_ip_version"] if gtpu_info is not None else ("IPv6" if gtpu_inner_ipv6 else "IPv4"),
        ),
        "gtpu_inner_ipv4_src": _clean_ipv4_text(
            gtpu_inner_ipv4.get("src"),
            gtpu_info["inner_ipv4_src"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4,
        ),
        "gtpu_inner_ipv4_src_mode": _choice(
            gtpu_inner_ipv4.get("src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "gtpu_inner_ipv4_src_count": _bounded_int(gtpu_inner_ipv4.get("src_count"), 2, 100_000_000, 16),
        "gtpu_inner_ipv4_src_step": _bounded_int(gtpu_inner_ipv4.get("src_step"), 1, 100_000_000, 1),
        "gtpu_inner_ipv4_dst": _clean_ipv4_text(
            gtpu_inner_ipv4.get("dst"),
            gtpu_info["inner_ipv4_dst"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_DST_IPV4,
        ),
        "gtpu_inner_ipv4_dst_mode": _choice(
            gtpu_inner_ipv4.get("dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "gtpu_inner_ipv4_dst_count": _bounded_int(gtpu_inner_ipv4.get("dst_count"), 2, 100_000_000, 16),
        "gtpu_inner_ipv4_dst_step": _bounded_int(gtpu_inner_ipv4.get("dst_step"), 1, 100_000_000, 1),
        "gtpu_inner_ipv4_ttl": _bounded_int(
            gtpu_inner_ipv4.get("ttl"),
            0,
            255,
            gtpu_info["inner_ipv4_ttl"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_TTL,
        ),
        "gtpu_inner_ipv4_ttl_mode": _choice(
            gtpu_inner_ipv4.get("ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "gtpu_inner_ipv4_ttl_count": _bounded_int(gtpu_inner_ipv4.get("ttl_count"), 2, 256, 16),
        "gtpu_inner_ipv4_ttl_step": _bounded_int(gtpu_inner_ipv4.get("ttl_step"), 1, 255, 1),
        "gtpu_inner_ipv6_src": _clean_ipv6_text(
            gtpu_inner_ipv6.get("src"),
            gtpu_info["inner_ipv6_src"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6,
        ),
        "gtpu_inner_ipv6_src_mode": _choice(
            gtpu_inner_ipv6.get("src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "gtpu_inner_ipv6_src_count": _bounded_int(gtpu_inner_ipv6.get("src_count"), 2, 100_000_000, 16),
        "gtpu_inner_ipv6_src_step": _bounded_int(gtpu_inner_ipv6.get("src_step"), 1, 100_000_000, 1),
        "gtpu_inner_ipv6_dst": _clean_ipv6_text(
            gtpu_inner_ipv6.get("dst"),
            gtpu_info["inner_ipv6_dst"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_DST_IPV6,
        ),
        "gtpu_inner_ipv6_dst_mode": _choice(
            gtpu_inner_ipv6.get("dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "gtpu_inner_ipv6_dst_count": _bounded_int(gtpu_inner_ipv6.get("dst_count"), 2, 100_000_000, 16),
        "gtpu_inner_ipv6_dst_step": _bounded_int(gtpu_inner_ipv6.get("dst_step"), 1, 100_000_000, 1),
        "gtpu_inner_ipv6_hop_limit": _bounded_int(
            gtpu_inner_ipv6.get("hop_limit"),
            0,
            255,
            gtpu_info["inner_ipv6_hop_limit"] if gtpu_info is not None else PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT,
        ),
        "gtpu_inner_ipv6_hop_limit_mode": _choice(
            gtpu_inner_ipv6.get("hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "gtpu_inner_ipv6_hop_limit_count": _bounded_int(gtpu_inner_ipv6.get("hop_limit_count"), 2, 256, 16),
        "gtpu_inner_ipv6_hop_limit_step": _bounded_int(gtpu_inner_ipv6.get("hop_limit_step"), 1, 255, 1),
        "gtpu_inner_l4_src_port": _bounded_int(
            gtpu_inner_udp.get("src_port"),
            0,
            65_535,
            gtpu_info["inner_l4_src_port"] if gtpu_info is not None else PROFILE_DEFAULT_SRC_PORT,
        ),
        "gtpu_inner_l4_src_port_mode": _choice(
            gtpu_inner_udp.get("src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "gtpu_inner_l4_src_port_count": _bounded_int(gtpu_inner_udp.get("src_port_count"), 2, 65_536, 16),
        "gtpu_inner_l4_src_port_step": _bounded_int(gtpu_inner_udp.get("src_port_step"), 1, 65_535, 1),
        "gtpu_inner_l4_dst_port": _bounded_int(
            gtpu_inner_udp.get("dst_port"),
            0,
            65_535,
            gtpu_info["inner_l4_dst_port"] if gtpu_info is not None else PROFILE_DEFAULT_DST_PORT,
        ),
        "gtpu_inner_l4_dst_port_mode": _choice(
            gtpu_inner_udp.get("dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "gtpu_inner_l4_dst_port_count": _bounded_int(gtpu_inner_udp.get("dst_port_count"), 2, 65_536, 16),
        "gtpu_inner_l4_dst_port_step": _bounded_int(gtpu_inner_udp.get("dst_port_step"), 1, 65_535, 1),
        "gre_checksum_present": _bool(
            gre.get("checksum_present"), gre_info["checksum_present"] if gre_info is not None else False
        ),
        "gre_checksum_override": _bool(
            gre.get("is_override_checksum"), gre_info is not None and gre_info["checksum_present"]
        ),
        "gre_checksum": _clean_hex_word_text_upper(
            gre.get("checksum"), gre_info["checksum"] if gre_info is not None else PROFILE_DEFAULT_GRE_CHECKSUM
        ),
        "gre_key_present": _bool(gre.get("key_present"), gre_info["key_present"] if gre_info is not None else False),
        "gre_key": _bounded_int(
            gre.get("key"), 0, 4_294_967_295, gre_info["key"] if gre_info is not None else PROFILE_DEFAULT_GRE_KEY
        ),
        "gre_key_mode": _choice(gre.get("key_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "gre_key_count": _bounded_int(gre.get("key_count"), 2, 4_294_967_296, 16),
        "gre_key_step": _bounded_int(gre.get("key_step"), 1, 4_294_967_295, 1),
        "gre_sequence_present": _bool(
            gre.get("sequence_present"), gre_info["sequence_present"] if gre_info is not None else False
        ),
        "gre_sequence": _bounded_int(
            gre.get("sequence"),
            0,
            4_294_967_295,
            gre_info["sequence"] if gre_info is not None else PROFILE_DEFAULT_GRE_SEQUENCE,
        ),
        "gre_sequence_mode": _choice(gre.get("sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "gre_sequence_count": _bounded_int(gre.get("sequence_count"), 2, 4_294_967_296, 16),
        "gre_sequence_step": _bounded_int(gre.get("sequence_step"), 1, 4_294_967_295, 1),
        "gre_protocol_type": _clean_hex_word_text_upper(
            gre.get("protocol_type"),
            gre_info["protocol_type"] if gre_info is not None else PROFILE_DEFAULT_GRE_PROTOCOL_TYPE,
        ),
        "gre_inner_ip_version": _choice(
            gre.get("inner_ip_version"),
            PROFILE_WORKBENCH_GRE_INNER_IP_VERSIONS,
            gre_info["inner_ip_version"]
            if gre_info is not None
            else ("IPv6" if gre_inner_ipv6 or _clean_hex_word_text_upper(gre.get("protocol_type"), PROFILE_DEFAULT_GRE_PROTOCOL_TYPE) == "86DD" else "IPv4"),
        ),
        "gre_inner_ipv4_src": _clean_ipv4_text(
            gre_inner_ipv4.get("src"),
            gre_info["inner_ipv4_src"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_SRC_IPV4,
        ),
        "gre_inner_ipv4_src_mode": _choice(
            gre_inner_ipv4.get("src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "gre_inner_ipv4_src_count": _bounded_int(gre_inner_ipv4.get("src_count"), 2, 100_000_000, 16),
        "gre_inner_ipv4_src_step": _bounded_int(gre_inner_ipv4.get("src_step"), 1, 100_000_000, 1),
        "gre_inner_ipv4_dst": _clean_ipv4_text(
            gre_inner_ipv4.get("dst"),
            gre_info["inner_ipv4_dst"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_DST_IPV4,
        ),
        "gre_inner_ipv4_dst_mode": _choice(
            gre_inner_ipv4.get("dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "gre_inner_ipv4_dst_count": _bounded_int(gre_inner_ipv4.get("dst_count"), 2, 100_000_000, 16),
        "gre_inner_ipv4_dst_step": _bounded_int(gre_inner_ipv4.get("dst_step"), 1, 100_000_000, 1),
        "gre_inner_ipv4_ttl": _bounded_int(
            gre_inner_ipv4.get("ttl"), 0, 255, gre_info["inner_ipv4_ttl"] if gre_info is not None else 64
        ),
        "gre_inner_ipv4_ttl_mode": _choice(
            gre_inner_ipv4.get("ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "gre_inner_ipv4_ttl_count": _bounded_int(gre_inner_ipv4.get("ttl_count"), 2, 256, 16),
        "gre_inner_ipv4_ttl_step": _bounded_int(gre_inner_ipv4.get("ttl_step"), 1, 255, 1),
        "gre_inner_ipv6_src": _clean_ipv6_text(
            gre_inner_ipv6.get("src"),
            gre_info["inner_ipv6_src"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_SRC_IPV6,
        ),
        "gre_inner_ipv6_src_mode": _choice(
            gre_inner_ipv6.get("src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "gre_inner_ipv6_src_count": _bounded_int(gre_inner_ipv6.get("src_count"), 2, 100_000_000, 16),
        "gre_inner_ipv6_src_step": _bounded_int(gre_inner_ipv6.get("src_step"), 1, 100_000_000, 1),
        "gre_inner_ipv6_dst": _clean_ipv6_text(
            gre_inner_ipv6.get("dst"),
            gre_info["inner_ipv6_dst"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_DST_IPV6,
        ),
        "gre_inner_ipv6_dst_mode": _choice(
            gre_inner_ipv6.get("dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"
        ),
        "gre_inner_ipv6_dst_count": _bounded_int(gre_inner_ipv6.get("dst_count"), 2, 100_000_000, 16),
        "gre_inner_ipv6_dst_step": _bounded_int(gre_inner_ipv6.get("dst_step"), 1, 100_000_000, 1),
        "gre_inner_ipv6_hop_limit": _bounded_int(
            gre_inner_ipv6.get("hop_limit"),
            0,
            255,
            gre_info["inner_ipv6_hop_limit"] if gre_info is not None else PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT,
        ),
        "gre_inner_ipv6_hop_limit_mode": _choice(
            gre_inner_ipv6.get("hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "gre_inner_ipv6_hop_limit_count": _bounded_int(gre_inner_ipv6.get("hop_limit_count"), 2, 256, 16),
        "gre_inner_ipv6_hop_limit_step": _bounded_int(gre_inner_ipv6.get("hop_limit_step"), 1, 255, 1),
        "gre_inner_l4_src_port": _bounded_int(
            gre_inner_udp.get("src_port"),
            0,
            65_535,
            gre_info["inner_l4_src_port"] if gre_info is not None else PROFILE_DEFAULT_SRC_PORT,
        ),
        "gre_inner_l4_src_port_mode": _choice(
            gre_inner_udp.get("src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "gre_inner_l4_src_port_count": _bounded_int(gre_inner_udp.get("src_port_count"), 2, 65_536, 16),
        "gre_inner_l4_src_port_step": _bounded_int(gre_inner_udp.get("src_port_step"), 1, 65_535, 1),
        "gre_inner_l4_dst_port": _bounded_int(
            gre_inner_udp.get("dst_port"),
            0,
            65_535,
            gre_info["inner_l4_dst_port"] if gre_info is not None else PROFILE_DEFAULT_DST_PORT,
        ),
        "gre_inner_l4_dst_port_mode": _choice(
            gre_inner_udp.get("dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"
        ),
        "gre_inner_l4_dst_port_count": _bounded_int(gre_inner_udp.get("dst_port_count"), 2, 65_536, 16),
        "gre_inner_l4_dst_port_step": _bounded_int(gre_inner_udp.get("dst_port_step"), 1, 65_535, 1),
        "ipv4_src": _clean_ipv4_text(
            ipv4.get("src"), _packet_ipv4_from_binary(binary_bytes, ip_offset + 12, PROFILE_DEFAULT_SRC_IPV4)
            if selected_ip_version == 4 else PROFILE_DEFAULT_SRC_IPV4
        ),
        "ipv4_dst": _clean_ipv4_text(
            ipv4.get("dst"), _packet_ipv4_from_binary(binary_bytes, ip_offset + 16, PROFILE_DEFAULT_DST_IPV4)
            if selected_ip_version == 4 else PROFILE_DEFAULT_DST_IPV4
        ),
        "ipv4_src_mode": _choice(ipv4.get("src_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "ipv4_src_count": _bounded_large_unit_count(ipv4.get("src_count"), 2, 100_000_000, 16),
        "ipv4_src_step": _bounded_int(ipv4.get("src_step"), 1, 100_000_000, 1),
        "ipv4_dst_mode": _choice(ipv4.get("dst_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "ipv4_dst_count": _bounded_large_unit_count(ipv4.get("dst_count"), 2, 100_000_000, 16),
        "ipv4_dst_step": _bounded_int(ipv4.get("dst_step"), 1, 100_000_000, 1),
        "ipv4_dscp": _bounded_int(ipv4.get("dscp"), 0, 63, ipv4_tos >> 2),
        "ipv4_dscp_mode": _choice(ipv4.get("dscp_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "ipv4_dscp_count": _bounded_int(ipv4.get("dscp_count"), 2, 64, 16),
        "ipv4_dscp_step": _bounded_int(ipv4.get("dscp_step"), 1, 63, 1),
        "ipv4_ecn": _bounded_int(ipv4.get("ecn"), 0, 3, ipv4_tos & 0x03),
        "ipv4_ecn_mode": _choice(ipv4.get("ecn_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "ipv4_ecn_count": _bounded_int(ipv4.get("ecn_count"), 2, 4, 4),
        "ipv4_ecn_step": _bounded_int(ipv4.get("ecn_step"), 1, 3, 1),
        "ipv4_id": _bounded_int(ipv4.get("id"), 0, 65_535, packet_ipv4_id),
        "ipv4_id_mode": _choice(ipv4.get("id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "ipv4_id_count": _bounded_int(ipv4.get("id_count"), 2, 65_536, 16),
        "ipv4_id_step": _bounded_int(ipv4.get("id_step"), 1, 65_535, 1),
        "ipv4_flag_df": _bool(ipv4.get("flag_df"), bool(packet_ipv4_fragment_word & 0x4000)),
        "ipv4_flag_mf": _bool(ipv4.get("flag_mf"), bool(packet_ipv4_fragment_word & 0x2000)),
        "ipv4_fragment_offset": _bounded_int(
            ipv4.get("fragment_offset"), 0, 8191, packet_ipv4_fragment_word & 0x1FFF
        ),
        "ipv4_fragment_offset_mode": _choice(
            ipv4.get("fragment_offset_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "ipv4_fragment_offset_count": _bounded_int(ipv4.get("fragment_offset_count"), 2, 8192, 16),
        "ipv4_fragment_offset_step": _bounded_int(ipv4.get("fragment_offset_step"), 1, 8191, 1),
        "ipv4_ttl": _bounded_int(ipv4.get("ttl"), 0, 255, packet_ipv4_ttl),
        "ipv4_ttl_mode": _choice(ipv4.get("ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "ipv4_ttl_count": _bounded_int(ipv4.get("ttl_count"), 2, 256, 16),
        "ipv4_ttl_step": _bounded_int(ipv4.get("ttl_step"), 1, 255, 1),
        "ipv4_checksum_override": _bool(ipv4.get("is_override_checksum"), selected_ip_version == 4 and bool(binary_bytes)),
        "ipv4_checksum": _clean_hex_word_text_upper(ipv4.get("checksum"), packet_ipv4_checksum),
        "ipv6_src": _clean_ipv6_text(
            ipv6.get("src"), _packet_ipv6_from_binary(binary_bytes, ip_offset + 8, PROFILE_DEFAULT_SRC_IPV6)
            if selected_ip_version == 6 else PROFILE_DEFAULT_SRC_IPV6
        ),
        "ipv6_dst": _clean_ipv6_text(
            ipv6.get("dst"), _packet_ipv6_from_binary(binary_bytes, ip_offset + 24, PROFILE_DEFAULT_DST_IPV6)
            if selected_ip_version == 6 else PROFILE_DEFAULT_DST_IPV6
        ),
        "ipv6_src_mode": _choice(ipv6.get("src_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"),
        "ipv6_src_count": _bounded_int(ipv6.get("src_count"), 2, 100_000_000, 16),
        "ipv6_src_step": _bounded_int(ipv6.get("src_step"), 1, 100_000_000, 1),
        "ipv6_dst_mode": _choice(ipv6.get("dst_mode"), PROFILE_WORKBENCH_IPV6_ADDRESS_MODES, "Fixed"),
        "ipv6_dst_count": _bounded_int(ipv6.get("dst_count"), 2, 100_000_000, 16),
        "ipv6_dst_step": _bounded_int(ipv6.get("dst_step"), 1, 100_000_000, 1),
        "ipv6_traffic_class": _bounded_int(
            ipv6.get("traffic_class"), 0, 255, packet_ipv6_traffic_class
        ),
        "ipv6_traffic_class_mode": _choice(
            ipv6.get("traffic_class_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "ipv6_traffic_class_count": _bounded_int(ipv6.get("traffic_class_count"), 2, 256, 16),
        "ipv6_traffic_class_step": _bounded_int(ipv6.get("traffic_class_step"), 1, 255, 1),
        "ipv6_flow_label": _bounded_int(ipv6.get("flow_label"), 0, 1_048_575, packet_ipv6_flow_label),
        "ipv6_flow_label_mode": _choice(
            ipv6.get("flow_label_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "ipv6_flow_label_count": _bounded_int(ipv6.get("flow_label_count"), 2, 1_048_576, 16),
        "ipv6_flow_label_step": _bounded_int(ipv6.get("flow_label_step"), 1, 1_048_575, 1),
        "ipv6_hop_limit": _bounded_int(ipv6.get("hop_limit"), 0, 255, packet_ipv6_hop_limit),
        "ipv6_hop_limit_mode": _choice(ipv6.get("hop_limit_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "ipv6_hop_limit_count": _bounded_int(ipv6.get("hop_limit_count"), 2, 256, 16),
        "ipv6_hop_limit_step": _bounded_int(ipv6.get("hop_limit_step"), 1, 255, 1),
        "l4_src_port_override": _bool(l4.get("is_override_src_port"), packet_src_port != PROFILE_DEFAULT_SRC_PORT),
        "l4_src_port": _bounded_int(l4.get("src_port"), 0, 65_535, packet_src_port),
        "l4_src_port_mode": _choice(l4.get("src_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"),
        "l4_src_port_count": _bounded_int(l4.get("src_port_count"), 2, 65_536, 16),
        "l4_src_port_step": _bounded_int(l4.get("src_port_step"), 1, 65_535, 1),
        "l4_dst_port_override": _bool(l4.get("is_override_dst_port"), packet_dst_port != PROFILE_DEFAULT_DST_PORT),
        "l4_dst_port": _bounded_int(l4.get("dst_port"), 0, 65_535, packet_dst_port),
        "l4_dst_port_mode": _choice(l4.get("dst_port_mode"), PROFILE_WORKBENCH_L4_PORT_MODES, "Fixed"),
        "l4_dst_port_count": _bounded_int(l4.get("dst_port_count"), 2, 65_536, 16),
        "l4_dst_port_step": _bounded_int(l4.get("dst_port_step"), 1, 65_535, 1),
        "udp_length_override": _bool(l4.get("is_override_length"), packet_type.endswith("/UDP") and bool(binary_bytes)),
        "udp_length": _bounded_int(l4.get("length"), 8, 65_535, packet_udp_length),
        "udp_length_mode": _choice(l4.get("length_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "udp_length_count": _bounded_int(l4.get("length_count"), 2, 65_528, 16),
        "udp_length_step": _bounded_int(l4.get("length_step"), 1, 65_527, 1),
        "udp_checksum_override": _bool(l4.get("is_override_checksum"), packet_type.endswith("/UDP") and bool(binary_bytes)),
        "udp_checksum": _clean_hex_word_text_upper(l4.get("checksum"), packet_udp_checksum),
        "udp_checksum_mode": _choice(l4.get("checksum_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "udp_checksum_count": _bounded_int(l4.get("checksum_count"), 2, 65_536, 16),
        "udp_checksum_step": _bounded_int(l4.get("checksum_step"), 1, 65_535, 1),
        "dns_enabled": _bool(dns.get("enabled"), dns_packet_fields["dns_enabled"]),
        "dns_transaction_id": _bounded_int(
            dns.get("transaction_id"), 0, 65_535, dns_packet_fields["dns_transaction_id"]
        ),
        "dns_transaction_id_mode": _choice(
            dns.get("transaction_id_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "dns_transaction_id_count": _bounded_int(dns.get("transaction_id_count"), 2, 65_536, 16),
        "dns_transaction_id_step": _bounded_int(dns.get("transaction_id_step"), 1, 65_535, 1),
        "dns_flags": _clean_hex_word_text_upper(dns.get("flags"), dns_packet_fields["dns_flags"]),
        "dns_flags_mode": _choice(dns.get("flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dns_flags_count": _bounded_int(dns.get("flags_count"), 2, 65_536, 16),
        "dns_flags_step": _bounded_int(dns.get("flags_step"), 1, 65_535, 1),
        "dns_query_name": dns_query_name,
        "dns_query_type": _bounded_int(dns.get("query_type"), 0, 65_535, dns_packet_fields["dns_query_type"]),
        "dns_query_type_mode": _choice(dns.get("query_type_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dns_query_type_count": _bounded_int(dns.get("query_type_count"), 2, 65_536, 16),
        "dns_query_type_step": _bounded_int(dns.get("query_type_step"), 1, 65_535, 1),
        "dns_query_class": _bounded_int(dns.get("query_class"), 0, 65_535, dns_packet_fields["dns_query_class"]),
        "dns_query_class_mode": _choice(dns.get("query_class_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dns_query_class_count": _bounded_int(dns.get("query_class_count"), 2, 65_536, 16),
        "dns_query_class_step": _bounded_int(dns.get("query_class_step"), 1, 65_535, 1),
        "dns_answer_enabled": _bool(dns.get("answer_enabled"), dns_packet_fields["dns_answer_enabled"]),
        "dns_answer_ttl": _bounded_int(
            dns.get("answer_ttl"), 0, 4_294_967_295, dns_packet_fields["dns_answer_ttl"]
        ),
        "dns_answer_ttl_mode": _choice(dns.get("answer_ttl_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dns_answer_ttl_count": _bounded_int(dns.get("answer_ttl_count"), 2, 4_294_967_296, 16),
        "dns_answer_ttl_step": _bounded_int(dns.get("answer_ttl_step"), 1, 4_294_967_295, 1),
        "dns_answer_ipv4": _clean_ipv4_text(dns.get("answer_ipv4"), dns_packet_fields["dns_answer_ipv4"]),
        "dns_answer_ipv4_mode": _choice(dns.get("answer_ipv4_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dns_answer_ipv4_count": _bounded_int(dns.get("answer_ipv4_count"), 2, 100_000_000, 16),
        "dns_answer_ipv4_step": _bounded_int(dns.get("answer_ipv4_step"), 1, 100_000_000, 1),
        "dhcp_enabled": _bool(dhcp.get("enabled"), dhcp_packet_fields["dhcp_enabled"]),
        "dhcp_operation": _bounded_int(dhcp.get("operation"), 1, 255, dhcp_packet_fields["dhcp_operation"]),
        "dhcp_operation_mode": _choice(dhcp.get("operation_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_operation_count": _bounded_int(dhcp.get("operation_count"), 2, 256, 2),
        "dhcp_operation_step": _bounded_int(dhcp.get("operation_step"), 1, 255, 1),
        "dhcp_hops": _bounded_int(dhcp.get("hops"), 0, 255, dhcp_packet_fields["dhcp_hops"]),
        "dhcp_hops_mode": _choice(dhcp.get("hops_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_hops_count": _bounded_int(dhcp.get("hops_count"), 2, 256, 16),
        "dhcp_hops_step": _bounded_int(dhcp.get("hops_step"), 1, 255, 1),
        "dhcp_seconds": _bounded_int(dhcp.get("seconds"), 0, 65_535, dhcp_packet_fields["dhcp_seconds"]),
        "dhcp_seconds_mode": _choice(dhcp.get("seconds_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_seconds_count": _bounded_int(dhcp.get("seconds_count"), 2, 65_536, 16),
        "dhcp_seconds_step": _bounded_int(dhcp.get("seconds_step"), 1, 65_535, 1),
        "dhcp_message_type": _bounded_int(dhcp.get("message_type"), 1, 255, dhcp_packet_fields["dhcp_message_type"]),
        "dhcp_message_type_mode": _choice(dhcp.get("message_type_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_message_type_count": _bounded_int(dhcp.get("message_type_count"), 2, 255, 16),
        "dhcp_message_type_step": _bounded_int(dhcp.get("message_type_step"), 1, 254, 1),
        "dhcp_xid": _bounded_int(dhcp.get("xid"), 0, 4_294_967_295, dhcp_packet_fields["dhcp_xid"]),
        "dhcp_xid_mode": _choice(dhcp.get("xid_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_xid_count": _bounded_int(dhcp.get("xid_count"), 2, 4_294_967_296, 16),
        "dhcp_xid_step": _bounded_int(dhcp.get("xid_step"), 1, 4_294_967_295, 1),
        "dhcp_flags": _clean_hex_word_text_upper(dhcp.get("flags"), dhcp_packet_fields["dhcp_flags"]),
        "dhcp_flags_mode": _choice(dhcp.get("flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_flags_count": _bounded_int(dhcp.get("flags_count"), 2, 65_536, 16),
        "dhcp_flags_step": _bounded_int(dhcp.get("flags_step"), 1, 65_535, 1),
        "dhcp_client_ip": _clean_ipv4_text(dhcp.get("client_ip"), dhcp_packet_fields["dhcp_client_ip"]),
        "dhcp_client_ip_mode": _choice(dhcp.get("client_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dhcp_client_ip_count": _bounded_int(dhcp.get("client_ip_count"), 2, 100_000_000, 16),
        "dhcp_client_ip_step": _bounded_int(dhcp.get("client_ip_step"), 1, 100_000_000, 1),
        "dhcp_your_ip": _clean_ipv4_text(dhcp.get("your_ip"), dhcp_packet_fields["dhcp_your_ip"]),
        "dhcp_your_ip_mode": _choice(dhcp.get("your_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dhcp_your_ip_count": _bounded_int(dhcp.get("your_ip_count"), 2, 100_000_000, 16),
        "dhcp_your_ip_step": _bounded_int(dhcp.get("your_ip_step"), 1, 100_000_000, 1),
        "dhcp_server_ip": _clean_ipv4_text(dhcp.get("server_ip"), dhcp_packet_fields["dhcp_server_ip"]),
        "dhcp_server_ip_mode": _choice(dhcp.get("server_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dhcp_server_ip_count": _bounded_int(dhcp.get("server_ip_count"), 2, 100_000_000, 16),
        "dhcp_server_ip_step": _bounded_int(dhcp.get("server_ip_step"), 1, 100_000_000, 1),
        "dhcp_relay_ip": _clean_ipv4_text(dhcp.get("relay_ip"), dhcp_packet_fields["dhcp_relay_ip"]),
        "dhcp_relay_ip_mode": _choice(dhcp.get("relay_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dhcp_relay_ip_count": _bounded_int(dhcp.get("relay_ip_count"), 2, 100_000_000, 16),
        "dhcp_relay_ip_step": _bounded_int(dhcp.get("relay_ip_step"), 1, 100_000_000, 1),
        "dhcp_client_mac": _clean_mac_text(dhcp.get("client_mac"), dhcp_packet_fields["dhcp_client_mac"]),
        "dhcp_client_mac_mode": _choice(dhcp.get("client_mac_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_client_mac_count": _bounded_int(dhcp.get("client_mac_count"), 2, 100_000_000, 16),
        "dhcp_client_mac_step": _bounded_int(dhcp.get("client_mac_step"), 1, 100_000_000, 1),
        "dhcp_hostname": dhcp_hostname,
        "dhcp_requested_ip": _clean_ipv4_text(dhcp.get("requested_ip"), dhcp_packet_fields["dhcp_requested_ip"]),
        "dhcp_requested_ip_mode": _choice(
            dhcp.get("requested_ip_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"
        ),
        "dhcp_requested_ip_count": _bounded_int(dhcp.get("requested_ip_count"), 2, 100_000_000, 16),
        "dhcp_requested_ip_step": _bounded_int(dhcp.get("requested_ip_step"), 1, 100_000_000, 1),
        "dhcp_server_id": _clean_ipv4_text(dhcp.get("server_id"), dhcp_packet_fields["dhcp_server_id"]),
        "dhcp_server_id_mode": _choice(dhcp.get("server_id_mode"), PROFILE_WORKBENCH_IPV4_ADDRESS_MODES, "Fixed"),
        "dhcp_server_id_count": _bounded_int(dhcp.get("server_id_count"), 2, 100_000_000, 16),
        "dhcp_server_id_step": _bounded_int(dhcp.get("server_id_step"), 1, 100_000_000, 1),
        "dhcp_parameter_request_list": dhcp_parameter_request_list,
        "dhcp_lease_time": _bounded_int(
            dhcp.get("lease_time"), 0, 4_294_967_295, dhcp_packet_fields["dhcp_lease_time"]
        ),
        "dhcp_lease_time_mode": _choice(dhcp.get("lease_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_lease_time_count": _bounded_int(dhcp.get("lease_time_count"), 2, 4_294_967_296, 16),
        "dhcp_lease_time_step": _bounded_int(dhcp.get("lease_time_step"), 1, 4_294_967_295, 1),
        "dhcp_renewal_time": _bounded_int(
            dhcp.get("renewal_time"), 0, 4_294_967_295, dhcp_packet_fields["dhcp_renewal_time"]
        ),
        "dhcp_renewal_time_mode": _choice(dhcp.get("renewal_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"),
        "dhcp_renewal_time_count": _bounded_int(dhcp.get("renewal_time_count"), 2, 4_294_967_296, 16),
        "dhcp_renewal_time_step": _bounded_int(dhcp.get("renewal_time_step"), 1, 4_294_967_295, 1),
        "dhcp_rebinding_time": _bounded_int(
            dhcp.get("rebinding_time"), 0, 4_294_967_295, dhcp_packet_fields["dhcp_rebinding_time"]
        ),
        "dhcp_rebinding_time_mode": _choice(
            dhcp.get("rebinding_time_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, "Fixed"
        ),
        "dhcp_rebinding_time_count": _bounded_int(dhcp.get("rebinding_time_count"), 2, 4_294_967_296, 16),
        "dhcp_rebinding_time_step": _bounded_int(dhcp.get("rebinding_time_step"), 1, 4_294_967_295, 1),
        "icmp_type": _bounded_int(
            l4.get("icmp_type") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            0,
            255,
            icmp_packet_fields["icmp_type"],
        ),
        "icmp_type_mode": _choice(
            l4.get("icmp_type_mode") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            icmp_packet_fields["icmp_type_mode"],
        ),
        "icmp_type_count": _bounded_int(
            l4.get("icmp_type_count") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            2,
            256,
            icmp_packet_fields["icmp_type_count"],
        ),
        "icmp_type_step": _bounded_int(
            l4.get("icmp_type_step") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            1,
            255,
            icmp_packet_fields["icmp_type_step"],
        ),
        "icmp_code": _bounded_int(
            l4.get("icmp_code") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            0,
            255,
            icmp_packet_fields["icmp_code"],
        ),
        "icmp_code_mode": _choice(
            l4.get("icmp_code_mode") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            icmp_packet_fields["icmp_code_mode"],
        ),
        "icmp_code_count": _bounded_int(
            l4.get("icmp_code_count") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            2,
            256,
            icmp_packet_fields["icmp_code_count"],
        ),
        "icmp_code_step": _bounded_int(
            l4.get("icmp_code_step") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            1,
            255,
            icmp_packet_fields["icmp_code_step"],
        ),
        "icmp_checksum_override": _bool(
            l4.get("icmp_is_override_checksum") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmp_checksum_override"],
        ),
        "icmp_checksum": _clean_hex_word_text_upper(
            l4.get("icmp_checksum") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmp_checksum"],
        ),
        "icmp_identifier": _bounded_int(
            l4.get("icmp_identifier") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            0,
            65_535,
            icmp_packet_fields["icmp_identifier"],
        ),
        "icmp_identifier_mode": _choice(
            l4.get("icmp_identifier_mode") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            icmp_packet_fields["icmp_identifier_mode"],
        ),
        "icmp_identifier_count": _bounded_int(
            l4.get("icmp_identifier_count") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            2,
            65_536,
            icmp_packet_fields["icmp_identifier_count"],
        ),
        "icmp_identifier_step": _bounded_int(
            l4.get("icmp_identifier_step") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            1,
            65_535,
            icmp_packet_fields["icmp_identifier_step"],
        ),
        "icmp_sequence": _bounded_int(
            l4.get("icmp_sequence") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            0,
            65_535,
            icmp_packet_fields["icmp_sequence"],
        ),
        "icmp_sequence_mode": _choice(
            l4.get("icmp_sequence_mode") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            icmp_packet_fields["icmp_sequence_mode"],
        ),
        "icmp_sequence_count": _bounded_int(
            l4.get("icmp_sequence_count") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            2,
            65_536,
            icmp_packet_fields["icmp_sequence_count"],
        ),
        "icmp_sequence_step": _bounded_int(
            l4.get("icmp_sequence_step") if packet_type.endswith("/ICMP") or packet_type.endswith("/ICMPv6") else None,
            1,
            65_535,
            icmp_packet_fields["icmp_sequence_step"],
        ),
        "icmpv6_nd_target": _clean_ipv6_text(
            l4.get("icmpv6_nd_target") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_target"],
        ),
        "icmpv6_nd_include_option": _bool(
            l4.get("icmpv6_nd_include_option") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_include_option"],
        ),
        "icmpv6_nd_option_mac": _clean_mac_text(
            l4.get("icmpv6_nd_option_mac") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_option_mac"],
        ),
        "icmpv6_nd_na_router": _bool(
            l4.get("icmpv6_nd_na_router") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_na_router"],
        ),
        "icmpv6_nd_na_solicited": _bool(
            l4.get("icmpv6_nd_na_solicited") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_na_solicited"],
        ),
        "icmpv6_nd_na_override": _bool(
            l4.get("icmpv6_nd_na_override") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_nd_na_override"],
        ),
        "icmpv6_rs_include_slla": _bool(
            l4.get("icmpv6_rs_include_slla") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_rs_include_slla"],
        ),
        "icmpv6_rs_slla_mac": _clean_mac_text(
            l4.get("icmpv6_rs_slla_mac") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_rs_slla_mac"],
        ),
        "icmpv6_ra_cur_hop_limit": _bounded_int(
            l4.get("icmpv6_ra_cur_hop_limit") if packet_type.endswith("/ICMPv6") else None,
            0,
            255,
            icmp_packet_fields["icmpv6_ra_cur_hop_limit"],
        ),
        "icmpv6_ra_managed": _bool(
            l4.get("icmpv6_ra_managed") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_managed"],
        ),
        "icmpv6_ra_other": _bool(
            l4.get("icmpv6_ra_other") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_other"],
        ),
        "icmpv6_ra_router_lifetime": _bounded_int(
            l4.get("icmpv6_ra_router_lifetime") if packet_type.endswith("/ICMPv6") else None,
            0,
            65_535,
            icmp_packet_fields["icmpv6_ra_router_lifetime"],
        ),
        "icmpv6_ra_reachable_time": _bounded_int(
            l4.get("icmpv6_ra_reachable_time") if packet_type.endswith("/ICMPv6") else None,
            0,
            4_294_967_295,
            icmp_packet_fields["icmpv6_ra_reachable_time"],
        ),
        "icmpv6_ra_retrans_timer": _bounded_int(
            l4.get("icmpv6_ra_retrans_timer") if packet_type.endswith("/ICMPv6") else None,
            0,
            4_294_967_295,
            icmp_packet_fields["icmpv6_ra_retrans_timer"],
        ),
        "icmpv6_ra_include_slla": _bool(
            l4.get("icmpv6_ra_include_slla") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_include_slla"],
        ),
        "icmpv6_ra_slla_mac": _clean_mac_text(
            l4.get("icmpv6_ra_slla_mac") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_slla_mac"],
        ),
        "icmpv6_ra_include_prefix": _bool(
            l4.get("icmpv6_ra_include_prefix") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_include_prefix"],
        ),
        "icmpv6_ra_prefix": _clean_ipv6_text(
            l4.get("icmpv6_ra_prefix") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_prefix"],
        ),
        "icmpv6_ra_prefix_length": _bounded_int(
            l4.get("icmpv6_ra_prefix_length") if packet_type.endswith("/ICMPv6") else None,
            0,
            128,
            icmp_packet_fields["icmpv6_ra_prefix_length"],
        ),
        "icmpv6_ra_prefix_on_link": _bool(
            l4.get("icmpv6_ra_prefix_on_link") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_prefix_on_link"],
        ),
        "icmpv6_ra_prefix_autonomous": _bool(
            l4.get("icmpv6_ra_prefix_autonomous") if packet_type.endswith("/ICMPv6") else None,
            icmp_packet_fields["icmpv6_ra_prefix_autonomous"],
        ),
        "icmpv6_ra_prefix_valid_lifetime": _bounded_int(
            l4.get("icmpv6_ra_prefix_valid_lifetime") if packet_type.endswith("/ICMPv6") else None,
            0,
            4_294_967_295,
            icmp_packet_fields["icmpv6_ra_prefix_valid_lifetime"],
        ),
        "icmpv6_ra_prefix_preferred_lifetime": _bounded_int(
            l4.get("icmpv6_ra_prefix_preferred_lifetime") if packet_type.endswith("/ICMPv6") else None,
            0,
            4_294_967_295,
            icmp_packet_fields["icmpv6_ra_prefix_preferred_lifetime"],
        ),
        "tcp_sequence_number": _bounded_int(
            l4.get("sequence_number"), 0, 4_294_967_295, tcp_packet_fields["tcp_sequence_number"]
        ),
        "tcp_sequence_mode": _choice(
            l4.get("sequence_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, tcp_packet_fields["tcp_sequence_mode"]
        ),
        "tcp_sequence_count": _bounded_int(l4.get("sequence_count"), 2, 4_294_967_296, tcp_packet_fields["tcp_sequence_count"]),
        "tcp_sequence_step": _bounded_int(l4.get("sequence_step"), 1, 4_294_967_295, tcp_packet_fields["tcp_sequence_step"]),
        "tcp_ack_number": _bounded_int(l4.get("ack_number"), 0, 4_294_967_295, tcp_packet_fields["tcp_ack_number"]),
        "tcp_ack_mode": _choice(l4.get("ack_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, tcp_packet_fields["tcp_ack_mode"]),
        "tcp_ack_count": _bounded_int(l4.get("ack_count"), 2, 4_294_967_296, tcp_packet_fields["tcp_ack_count"]),
        "tcp_ack_step": _bounded_int(l4.get("ack_step"), 1, 4_294_967_295, tcp_packet_fields["tcp_ack_step"]),
        "tcp_window": _bounded_int(l4.get("window"), 0, 65_535, tcp_packet_fields["tcp_window"]),
        "tcp_window_mode": _choice(
            l4.get("window_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, tcp_packet_fields["tcp_window_mode"]
        ),
        "tcp_window_count": _bounded_int(l4.get("window_count"), 2, 65_536, tcp_packet_fields["tcp_window_count"]),
        "tcp_window_step": _bounded_int(l4.get("window_step"), 1, 65_535, tcp_packet_fields["tcp_window_step"]),
        "tcp_checksum_override": _bool(
            l4.get("is_override_checksum") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_checksum_override"],
        ),
        "tcp_checksum": _clean_hex_word_text_upper(
            l4.get("checksum") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_checksum"],
        ),
        "tcp_checksum_mode": _choice(
            l4.get("checksum_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_checksum_mode"],
        ),
        "tcp_checksum_count": _bounded_int(
            l4.get("checksum_count") if packet_type.endswith("/TCP") else None,
            2,
            65_536,
            tcp_packet_fields["tcp_checksum_count"],
        ),
        "tcp_checksum_step": _bounded_int(
            l4.get("checksum_step") if packet_type.endswith("/TCP") else None,
            1,
            65_535,
            tcp_packet_fields["tcp_checksum_step"],
        ),
        "tcp_option_mss_enabled": _bool(
            l4.get("mss_enabled") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_option_mss_enabled"],
        ),
        "tcp_option_mss": _bounded_int(
            l4.get("mss") if packet_type.endswith("/TCP") else None,
            0,
            65_535,
            tcp_packet_fields["tcp_option_mss"],
        ),
        "tcp_option_mss_mode": _choice(
            l4.get("mss_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_mss_mode"],
        ),
        "tcp_option_mss_count": _bounded_int(
            l4.get("mss_count") if packet_type.endswith("/TCP") else None,
            2,
            65_536,
            tcp_packet_fields["tcp_option_mss_count"],
        ),
        "tcp_option_mss_step": _bounded_int(
            l4.get("mss_step") if packet_type.endswith("/TCP") else None,
            1,
            65_535,
            tcp_packet_fields["tcp_option_mss_step"],
        ),
        "tcp_option_window_scale_enabled": _bool(
            l4.get("window_scale_enabled") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_option_window_scale_enabled"],
        ),
        "tcp_option_window_scale": _bounded_int(
            l4.get("window_scale") if packet_type.endswith("/TCP") else None,
            0,
            14,
            tcp_packet_fields["tcp_option_window_scale"],
        ),
        "tcp_option_window_scale_mode": _choice(
            l4.get("window_scale_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_window_scale_mode"],
        ),
        "tcp_option_window_scale_count": _bounded_int(
            l4.get("window_scale_count") if packet_type.endswith("/TCP") else None,
            2,
            256,
            tcp_packet_fields["tcp_option_window_scale_count"],
        ),
        "tcp_option_window_scale_step": _bounded_int(
            l4.get("window_scale_step") if packet_type.endswith("/TCP") else None,
            1,
            255,
            tcp_packet_fields["tcp_option_window_scale_step"],
        ),
        "tcp_option_sack_permitted_enabled": _bool(
            l4.get("sack_permitted_enabled") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_option_sack_permitted_enabled"],
        ),
        "tcp_option_sack_blocks_enabled": _bool(
            l4.get("sack_blocks_enabled") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_option_sack_blocks_enabled"],
        ),
        "tcp_option_sack_left_edge": _bounded_int(
            l4.get("sack_left_edge") if packet_type.endswith("/TCP") else None,
            0,
            4_294_967_295,
            tcp_packet_fields["tcp_option_sack_left_edge"],
        ),
        "tcp_option_sack_left_edge_mode": _choice(
            l4.get("sack_left_edge_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_sack_left_edge_mode"],
        ),
        "tcp_option_sack_left_edge_count": _bounded_int(
            l4.get("sack_left_edge_count") if packet_type.endswith("/TCP") else None,
            2,
            4_294_967_296,
            tcp_packet_fields["tcp_option_sack_left_edge_count"],
        ),
        "tcp_option_sack_left_edge_step": _bounded_int(
            l4.get("sack_left_edge_step") if packet_type.endswith("/TCP") else None,
            1,
            4_294_967_295,
            tcp_packet_fields["tcp_option_sack_left_edge_step"],
        ),
        "tcp_option_sack_right_edge": _bounded_int(
            l4.get("sack_right_edge") if packet_type.endswith("/TCP") else None,
            0,
            4_294_967_295,
            tcp_packet_fields["tcp_option_sack_right_edge"],
        ),
        "tcp_option_sack_right_edge_mode": _choice(
            l4.get("sack_right_edge_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_sack_right_edge_mode"],
        ),
        "tcp_option_sack_right_edge_count": _bounded_int(
            l4.get("sack_right_edge_count") if packet_type.endswith("/TCP") else None,
            2,
            4_294_967_296,
            tcp_packet_fields["tcp_option_sack_right_edge_count"],
        ),
        "tcp_option_sack_right_edge_step": _bounded_int(
            l4.get("sack_right_edge_step") if packet_type.endswith("/TCP") else None,
            1,
            4_294_967_295,
            tcp_packet_fields["tcp_option_sack_right_edge_step"],
        ),
        "tcp_option_timestamp_enabled": _bool(
            l4.get("timestamp_enabled") if packet_type.endswith("/TCP") else None,
            tcp_packet_fields["tcp_option_timestamp_enabled"],
        ),
        "tcp_option_timestamp_value": _bounded_int(
            l4.get("timestamp_value") if packet_type.endswith("/TCP") else None,
            0,
            4_294_967_295,
            tcp_packet_fields["tcp_option_timestamp_value"],
        ),
        "tcp_option_timestamp_value_mode": _choice(
            l4.get("timestamp_value_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_timestamp_value_mode"],
        ),
        "tcp_option_timestamp_value_count": _bounded_int(
            l4.get("timestamp_value_count") if packet_type.endswith("/TCP") else None,
            2,
            4_294_967_296,
            tcp_packet_fields["tcp_option_timestamp_value_count"],
        ),
        "tcp_option_timestamp_value_step": _bounded_int(
            l4.get("timestamp_value_step") if packet_type.endswith("/TCP") else None,
            1,
            4_294_967_295,
            tcp_packet_fields["tcp_option_timestamp_value_step"],
        ),
        "tcp_option_timestamp_echo": _bounded_int(
            l4.get("timestamp_echo") if packet_type.endswith("/TCP") else None,
            0,
            4_294_967_295,
            tcp_packet_fields["tcp_option_timestamp_echo"],
        ),
        "tcp_option_timestamp_echo_mode": _choice(
            l4.get("timestamp_echo_mode") if packet_type.endswith("/TCP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_option_timestamp_echo_mode"],
        ),
        "tcp_option_timestamp_echo_count": _bounded_int(
            l4.get("timestamp_echo_count") if packet_type.endswith("/TCP") else None,
            2,
            4_294_967_296,
            tcp_packet_fields["tcp_option_timestamp_echo_count"],
        ),
        "tcp_option_timestamp_echo_step": _bounded_int(
            l4.get("timestamp_echo_step") if packet_type.endswith("/TCP") else None,
            1,
            4_294_967_295,
            tcp_packet_fields["tcp_option_timestamp_echo_step"],
        ),
        "sctp_verification_tag": _bounded_int(
            sctp.get("verification_tag") if packet_type.endswith("/SCTP") else None,
            0,
            4_294_967_295,
            sctp_packet_fields["sctp_verification_tag"],
        ),
        "sctp_verification_tag_mode": _choice(
            sctp.get("verification_tag_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_verification_tag_mode"],
        ),
        "sctp_verification_tag_count": _bounded_int(
            sctp.get("verification_tag_count") if packet_type.endswith("/SCTP") else None,
            2,
            4_294_967_296,
            sctp_packet_fields["sctp_verification_tag_count"],
        ),
        "sctp_verification_tag_step": _bounded_int(
            sctp.get("verification_tag_step") if packet_type.endswith("/SCTP") else None,
            1,
            4_294_967_295,
            sctp_packet_fields["sctp_verification_tag_step"],
        ),
        "sctp_checksum_override": _bool(
            sctp.get("is_override_checksum") if packet_type.endswith("/SCTP") else None,
            sctp_packet_fields["sctp_checksum_override"],
        ),
        "sctp_checksum": _clean_hex_dword_text_upper(
            sctp.get("checksum") if packet_type.endswith("/SCTP") else None,
            sctp_packet_fields["sctp_checksum"],
        ),
        "sctp_data_flags": _bounded_int(
            sctp.get("data_flags") if packet_type.endswith("/SCTP") else None,
            0,
            255,
            sctp_packet_fields["sctp_data_flags"],
        ),
        "sctp_data_flags_mode": _choice(
            sctp.get("data_flags_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_data_flags_mode"],
        ),
        "sctp_data_flags_count": _bounded_int(
            sctp.get("data_flags_count") if packet_type.endswith("/SCTP") else None,
            2,
            256,
            sctp_packet_fields["sctp_data_flags_count"],
        ),
        "sctp_data_flags_step": _bounded_int(
            sctp.get("data_flags_step") if packet_type.endswith("/SCTP") else None,
            1,
            255,
            sctp_packet_fields["sctp_data_flags_step"],
        ),
        "sctp_tsn": _bounded_int(
            sctp.get("tsn") if packet_type.endswith("/SCTP") else None,
            0,
            4_294_967_295,
            sctp_packet_fields["sctp_tsn"],
        ),
        "sctp_tsn_mode": _choice(
            sctp.get("tsn_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_tsn_mode"],
        ),
        "sctp_tsn_count": _bounded_int(
            sctp.get("tsn_count") if packet_type.endswith("/SCTP") else None,
            2,
            4_294_967_296,
            sctp_packet_fields["sctp_tsn_count"],
        ),
        "sctp_tsn_step": _bounded_int(
            sctp.get("tsn_step") if packet_type.endswith("/SCTP") else None,
            1,
            4_294_967_295,
            sctp_packet_fields["sctp_tsn_step"],
        ),
        "sctp_stream_id": _bounded_int(
            sctp.get("stream_id") if packet_type.endswith("/SCTP") else None,
            0,
            65_535,
            sctp_packet_fields["sctp_stream_id"],
        ),
        "sctp_stream_id_mode": _choice(
            sctp.get("stream_id_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_stream_id_mode"],
        ),
        "sctp_stream_id_count": _bounded_int(
            sctp.get("stream_id_count") if packet_type.endswith("/SCTP") else None,
            2,
            65_536,
            sctp_packet_fields["sctp_stream_id_count"],
        ),
        "sctp_stream_id_step": _bounded_int(
            sctp.get("stream_id_step") if packet_type.endswith("/SCTP") else None,
            1,
            65_535,
            sctp_packet_fields["sctp_stream_id_step"],
        ),
        "sctp_stream_sequence": _bounded_int(
            sctp.get("stream_sequence") if packet_type.endswith("/SCTP") else None,
            0,
            65_535,
            sctp_packet_fields["sctp_stream_sequence"],
        ),
        "sctp_stream_sequence_mode": _choice(
            sctp.get("stream_sequence_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_stream_sequence_mode"],
        ),
        "sctp_stream_sequence_count": _bounded_int(
            sctp.get("stream_sequence_count") if packet_type.endswith("/SCTP") else None,
            2,
            65_536,
            sctp_packet_fields["sctp_stream_sequence_count"],
        ),
        "sctp_stream_sequence_step": _bounded_int(
            sctp.get("stream_sequence_step") if packet_type.endswith("/SCTP") else None,
            1,
            65_535,
            sctp_packet_fields["sctp_stream_sequence_step"],
        ),
        "sctp_payload_protocol_id": _bounded_int(
            sctp.get("payload_protocol_id") if packet_type.endswith("/SCTP") else None,
            0,
            4_294_967_295,
            sctp_packet_fields["sctp_payload_protocol_id"],
        ),
        "sctp_payload_protocol_id_mode": _choice(
            sctp.get("payload_protocol_id_mode") if packet_type.endswith("/SCTP") else None,
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            sctp_packet_fields["sctp_payload_protocol_id_mode"],
        ),
        "sctp_payload_protocol_id_count": _bounded_int(
            sctp.get("payload_protocol_id_count") if packet_type.endswith("/SCTP") else None,
            2,
            4_294_967_296,
            sctp_packet_fields["sctp_payload_protocol_id_count"],
        ),
        "sctp_payload_protocol_id_step": _bounded_int(
            sctp.get("payload_protocol_id_step") if packet_type.endswith("/SCTP") else None,
            1,
            4_294_967_295,
            sctp_packet_fields["sctp_payload_protocol_id_step"],
        ),
        "tcp_urgent_pointer": _bounded_int(
            l4.get("urgent_pointer"), 0, 65_535, tcp_packet_fields["tcp_urgent_pointer"]
        ),
        "tcp_urgent_pointer_mode": _choice(
            l4.get("urgent_pointer_mode"),
            PROFILE_WORKBENCH_FIELD_ENGINE_MODES,
            tcp_packet_fields["tcp_urgent_pointer_mode"],
        ),
        "tcp_urgent_pointer_count": _bounded_int(
            l4.get("urgent_pointer_count"), 2, 65_536, tcp_packet_fields["tcp_urgent_pointer_count"]
        ),
        "tcp_urgent_pointer_step": _bounded_int(
            l4.get("urgent_pointer_step"), 1, 65_535, tcp_packet_fields["tcp_urgent_pointer_step"]
        ),
        "tcp_flags_mode": _choice(
            l4.get("flags_mode"), PROFILE_WORKBENCH_FIELD_ENGINE_MODES, tcp_packet_fields["tcp_flags_mode"]
        ),
        "tcp_flags_count": _bounded_int(l4.get("flags_count"), 2, 64, tcp_packet_fields["tcp_flags_count"]),
        "tcp_flags_step": _bounded_int(l4.get("flags_step"), 1, 63, tcp_packet_fields["tcp_flags_step"]),
        "tcp_flag_urg": _bool(l4.get("is_urg"), tcp_packet_fields["tcp_flag_urg"]),
        "tcp_flag_ack": _bool(l4.get("is_ack"), tcp_packet_fields["tcp_flag_ack"]),
        "tcp_flag_psh": _bool(l4.get("is_psh"), tcp_packet_fields["tcp_flag_psh"]),
        "tcp_flag_rst": _bool(l4.get("is_rst"), tcp_packet_fields["tcp_flag_rst"]),
        "tcp_flag_syn": _bool(l4.get("is_sync"), tcp_packet_fields["tcp_flag_syn"]),
        "tcp_flag_fin": _bool(l4.get("is_fin"), tcp_packet_fields["tcp_flag_fin"]),
        "payload_enabled": _bool(selection.get("is_pattern_selected"), True),
        "payload_type": _choice(payload.get("type"), PROFILE_WORKBENCH_PAYLOAD_TYPES, "Fixed Word"),
        "payload_pattern": payload_pattern,
        "advanced_cache_size_type": cache_type,
        "advanced_cache_value": cache_value,
        "packet_binary_base64": base64.b64encode(binary_bytes).decode("ascii") if binary_bytes else None,
        "advanced_mode": _bool(stream_data.get("advanced_mode"), False),
        "packet_model": packet_data.get("model") if isinstance(packet_data.get("model"), str) else None,
        "packet_meta_base64": packet_data.get("meta") if isinstance(packet_data.get("meta"), str) else None,
        "advanced_vm": vm_data if stream_data.get("advanced_mode") is True else None,
        "_next_stream_name": entry.get("next"),
    }
