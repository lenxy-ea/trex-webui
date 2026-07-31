from app.trex.workbench_packet import (
    ipv4_offsets,
    ipv6_offsets,
    packet_l2_payload_info,
    packet_mpls_stack_info,
    packet_protocol_from_binary,
    packet_vlan_info,
    packet_vlan_stack_info,
)


def ethernet_header(ether_type: int) -> bytes:
    return b"\xaa\xbb\xcc\xdd\xee\xff" + b"\x11\x22\x33\x44\x55\x66" + ether_type.to_bytes(2, "big")


def ipv4_header(protocol: int = 17) -> bytes:
    return bytes(
        [
            0x45,
            0,
            0,
            20,
            0,
            1,
            0,
            0,
            64,
            protocol,
            0,
            0,
            10,
            0,
            0,
            1,
            10,
            0,
            0,
            2,
        ]
    )


def ipv6_header(next_header: int = 6) -> bytes:
    return bytes([0x60, 0, 0, 0, 0, 0, next_header, 64]) + bytes.fromhex("20010db8000000000000000000000001") + bytes.fromhex(
        "20010db8000000000000000000000002"
    )


def test_ipv4_and_ipv6_offsets_include_packet_protocol() -> None:
    ipv4_packet = ethernet_header(0x0800) + ipv4_header(17)
    ipv6_packet = ethernet_header(0x86DD) + ipv6_header(6)

    assert ipv4_offsets(ipv4_packet) == (14, 20, 17)
    assert ipv6_offsets(ipv6_packet) == (14, 40, 6)
    assert packet_protocol_from_binary(ipv4_packet) == 17
    assert packet_protocol_from_binary(ipv6_packet) == 6


def test_vlan_stack_updates_l2_payload_offset() -> None:
    tci = (5 << 13) | 100
    packet = ethernet_header(0x8100) + tci.to_bytes(2, "big") + b"\x08\x00" + ipv4_header(1)

    assert packet_vlan_stack_info(packet) == [
        {"tpid": 0x8100, "priority": 5, "cfi": 0, "vlan": 100, "inner_type": 0x0800}
    ]
    assert packet_vlan_info(packet) == {"tpid": 0x8100, "priority": 5, "cfi": 0, "vlan": 100, "inner_type": 0x0800}
    assert packet_l2_payload_info(packet) == {
        "ether_type": 0x0800,
        "ip_offset": 18,
        "vlan_info": {"tpid": 0x8100, "priority": 5, "cfi": 0, "vlan": 100, "inner_type": 0x0800},
        "vlan_stack": [{"tpid": 0x8100, "priority": 5, "cfi": 0, "vlan": 100, "inner_type": 0x0800}],
        "mpls_info": None,
    }


def test_mpls_stack_updates_l2_payload_offset_and_detects_inner_ip() -> None:
    label_word = (17 << 12) | (3 << 9) | (1 << 8) | 64
    packet = ethernet_header(0x8847) + label_word.to_bytes(4, "big") + ipv6_header(58)

    assert packet_mpls_stack_info(packet, 14) == {
        "labels": [{"label": 17, "traffic_class": 3, "bottom_of_stack": 1, "ttl": 64}],
        "payload_offset": 18,
    }
    assert packet_l2_payload_info(packet) == {
        "ether_type": 0x86DD,
        "ip_offset": 18,
        "vlan_info": None,
        "vlan_stack": [],
        "mpls_info": {
            "labels": [{"label": 17, "traffic_class": 3, "bottom_of_stack": 1, "ttl": 64}],
            "payload_offset": 18,
        },
    }
    assert ipv6_offsets(packet) == (18, 40, 58)
