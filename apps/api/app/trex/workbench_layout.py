from __future__ import annotations

import re
from typing import Any

from app.trex.workbench_protocol import (
    workbench_gre_inner_ip_version,
    workbench_has_arp,
    workbench_has_l3,
    workbench_ip_version,
    workbench_is_icmpv6_nd,
    workbench_is_icmpv6_ra,
    workbench_is_icmpv6_rs,
    workbench_l3_header_length,
)
from app.trex.workbench_values import (
    PROFILE_DEFAULT_ETHER_TYPE,
    PROFILE_DEFAULT_MPLS_LABEL,
    PROFILE_DEFAULT_MPLS_TC,
    PROFILE_DEFAULT_MPLS_TTL,
    PROFILE_DEFAULT_VLAN_TPID,
    clean_hex_word_text,
)


def workbench_vlan_field_enabled(stream: dict[str, Any], index: int) -> bool:
    if index == 1:
        return bool(stream.get("vlan_enabled"))
    return bool(stream.get("vlan_enabled") and stream.get("vlan2_enabled"))


def workbench_vlan_id_field_name(index: int) -> str:
    return "vlan_id" if index == 1 else f"vlan{index}_id"


def workbench_vlan_priority_field_name(index: int) -> str:
    return "vlan_priority" if index == 1 else f"vlan{index}_priority"


def workbench_vlan_tpid_field_name(index: int) -> str:
    return "vlan_tpid" if index == 1 else f"vlan{index}_tpid"


def workbench_vlan_tpid_override_field_name(index: int) -> str:
    return "vlan_tpid_override" if index == 1 else f"vlan{index}_tpid_override"


def workbench_vlan_cfi_field_name(index: int) -> str:
    return "vlan_cfi" if index == 1 else f"vlan{index}_cfi"


def workbench_vlan_index_offset(index: int) -> int:
    return 14 + (4 * (index - 1))


def workbench_mpls_field_enabled(stream: dict[str, Any], index: int) -> bool:
    if not stream.get("mpls_enabled"):
        return False
    if index == 1:
        return True
    if index == 2:
        return bool(stream.get("mpls_label2_enabled"))
    if index == 3:
        return bool(stream.get("mpls_label2_enabled") and stream.get("mpls_label3_enabled"))
    return False


def workbench_mpls_label_field_name(index: int) -> str:
    return "mpls_label" if index == 1 else f"mpls_label{index}"


def workbench_mpls_tc_field_name(index: int) -> str:
    return "mpls_tc" if index == 1 else f"mpls_label{index}_tc"


def workbench_mpls_ttl_field_name(index: int) -> str:
    return "mpls_ttl" if index == 1 else f"mpls_label{index}_ttl"


def workbench_mpls_stack(stream: dict[str, Any]) -> list[dict[str, int]]:
    if not stream.get("mpls_enabled"):
        return []
    stack = [
        {
            "label": int(stream.get("mpls_label", PROFILE_DEFAULT_MPLS_LABEL)),
            "traffic_class": int(stream.get("mpls_tc", PROFILE_DEFAULT_MPLS_TC)),
            "ttl": int(stream.get("mpls_ttl", PROFILE_DEFAULT_MPLS_TTL)),
        }
    ]
    for index in (2, 3):
        if index == 3 and not stream.get("mpls_label2_enabled"):
            continue
        if stream.get(f"mpls_label{index}_enabled"):
            stack.append(
                {
                    "label": int(stream.get(f"mpls_label{index}", PROFILE_DEFAULT_MPLS_LABEL + index - 1)),
                    "traffic_class": int(stream.get(f"mpls_label{index}_tc", PROFILE_DEFAULT_MPLS_TC)),
                    "ttl": int(stream.get(f"mpls_label{index}_ttl", PROFILE_DEFAULT_MPLS_TTL)),
                }
            )
    for index, label in enumerate(stack):
        label["bottom_of_stack"] = 1 if index == len(stack) - 1 else 0
    return stack


def workbench_vlan_tag_count(stream: dict[str, Any]) -> int:
    if not stream.get("vlan_enabled"):
        return 0
    return 2 if stream.get("vlan2_enabled") else 1


def workbench_l2_header_length(stream: dict[str, Any]) -> int:
    return 14 + (4 * workbench_vlan_tag_count(stream)) + (4 * len(workbench_mpls_stack(stream)))


def workbench_ip_offset(stream: dict[str, Any]) -> int:
    return workbench_l2_header_length(stream)


def workbench_mpls_offset(stream: dict[str, Any]) -> int:
    return 14 + (4 * workbench_vlan_tag_count(stream))


def workbench_mpls_index_offset(stream: dict[str, Any], index: int) -> int:
    return workbench_mpls_offset(stream) + (4 * max(0, index - 1))


def workbench_vlan_tpid(stream: dict[str, Any], index: int) -> int:
    override_field = workbench_vlan_tpid_override_field_name(index)
    tpid_field = workbench_vlan_tpid_field_name(index)
    tpid = stream.get(tpid_field) if stream.get(override_field) else PROFILE_DEFAULT_VLAN_TPID
    if isinstance(tpid, str) and re.fullmatch(r"[0-9a-fA-F]{4}", tpid):
        return int(tpid, 16)
    return int(PROFILE_DEFAULT_VLAN_TPID, 16)


def workbench_vlan_tci(stream: dict[str, Any], index: int) -> int:
    priority = stream[workbench_vlan_priority_field_name(index)]
    cfi = stream[workbench_vlan_cfi_field_name(index)]
    vlan_id = stream[workbench_vlan_id_field_name(index)]
    return ((priority & 0x7) << 13) | ((cfi & 0x1) << 12) | (vlan_id & 0x0FFF)


def workbench_vxlan_vni_offset(stream: dict[str, Any]) -> int:
    return workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 4


def workbench_vxlan_inner_ipv4_offset(stream: dict[str, Any]) -> int:
    return workbench_vxlan_vni_offset(stream) + 4 + 14


def workbench_vxlan_inner_ip_version(stream: dict[str, Any]) -> str:
    return "IPv6" if stream.get("vxlan_inner_ip_version") == "IPv6" else "IPv4"


def workbench_gtpu_teid_offset(stream: dict[str, Any]) -> int:
    return workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 8 + 4


def workbench_gtpu_optional_header_length(stream: dict[str, Any]) -> int:
    return (
        4
        if stream.get("gtpu_sequence_enabled") or stream.get("gtpu_npdu_enabled") or stream.get("gtpu_extension_enabled")
        else 0
    )


def workbench_gtpu_optional_header_offset(stream: dict[str, Any]) -> int:
    return workbench_gtpu_teid_offset(stream) + 4


def workbench_gtpu_extension_header_length(stream: dict[str, Any]) -> int:
    return 4 if stream.get("gtpu_extension_enabled") else 0


def workbench_gtpu_extension_header_offset(stream: dict[str, Any]) -> int:
    return workbench_gtpu_optional_header_offset(stream) + workbench_gtpu_optional_header_length(stream)


def workbench_gtpu_inner_ipv4_offset(stream: dict[str, Any]) -> int:
    return workbench_gtpu_extension_header_offset(stream) + workbench_gtpu_extension_header_length(stream)


def workbench_icmp_header_length(stream: dict[str, Any]) -> int:
    if workbench_is_icmpv6_rs(stream):
        return 8 + (8 if stream.get("icmpv6_rs_include_slla") else 0)
    if workbench_is_icmpv6_ra(stream):
        return (
            16
            + (8 if stream.get("icmpv6_ra_include_slla") else 0)
            + (32 if stream.get("icmpv6_ra_include_prefix") else 0)
        )
    if workbench_is_icmpv6_nd(stream):
        return 24 + (8 if stream.get("icmpv6_nd_include_option") else 0)
    return 8


def workbench_gre_header_length(stream: dict[str, Any]) -> int:
    return (
        4
        + (4 if stream.get("gre_checksum_present") else 0)
        + (4 if stream.get("gre_key_present") else 0)
        + (4 if stream.get("gre_sequence_present") else 0)
    )


def workbench_gre_inner_ipv4_offset(stream: dict[str, Any]) -> int:
    return workbench_ip_offset(stream) + workbench_l3_header_length(stream) + workbench_gre_header_length(stream)


def workbench_gre_option_offset(stream: dict[str, Any], field: str) -> int | None:
    if field not in {"key", "sequence"}:
        return None
    offset = workbench_ip_offset(stream) + workbench_l3_header_length(stream) + 4
    if stream.get("gre_checksum_present"):
        offset += 4
    if field == "key":
        return offset if stream.get("gre_key_present") else None
    if stream.get("gre_key_present"):
        offset += 4
    return offset if stream.get("gre_sequence_present") else None


def workbench_gre_inner_checksum_instruction(stream: dict[str, Any]) -> dict[str, Any]:
    return {
        "l2_len": workbench_gre_inner_ipv4_offset(stream),
        "l3_len": 40 if workbench_gre_inner_ip_version(stream) == "IPv6" else 20,
        "l4_type": 11,
        "type": "fix_checksum_hw",
    }


def workbench_sctp_header_length(stream: dict[str, Any]) -> int:
    return 28


def workbench_l3_ether_type(stream: dict[str, Any]) -> int:
    if workbench_has_arp(stream):
        return 0x0806
    if not workbench_has_l3(stream):
        return 0xFFFF
    return 0x86DD if workbench_ip_version(stream) == 6 else 0x0800


def workbench_ether_type_override(stream: dict[str, Any]) -> int:
    ether_type = stream.get("ether_type", PROFILE_DEFAULT_ETHER_TYPE)
    if isinstance(ether_type, str) and re.fullmatch(r"[0-9a-fA-F]{4}", ether_type):
        return int(ether_type, 16)
    return int(PROFILE_DEFAULT_ETHER_TYPE, 16)


def workbench_inner_ether_type(stream: dict[str, Any]) -> int:
    return 0x8847 if stream.get("mpls_enabled") else workbench_l3_ether_type(stream)


def workbench_outer_ether_type(stream: dict[str, Any]) -> int:
    if stream.get("ether_type_override"):
        return workbench_ether_type_override(stream)
    if not stream.get("vlan_enabled"):
        return workbench_inner_ether_type(stream)
    return workbench_vlan_tpid(stream, 1)


def workbench_default_outer_ether_type_for_fields(
    packet_type: str,
    vlan_enabled: bool,
    mpls_enabled: bool,
    vlan_tpid: str = PROFILE_DEFAULT_VLAN_TPID,
) -> int:
    if vlan_enabled:
        return int(clean_hex_word_text(vlan_tpid, PROFILE_DEFAULT_VLAN_TPID), 16)
    if mpls_enabled:
        return 0x8847
    if packet_type == "Ethernet/ARP":
        return 0x0806
    if packet_type == "Ethernet":
        return 0xFFFF
    if packet_type.startswith("Ethernet/IPv6"):
        return 0x86DD
    return 0x0800
