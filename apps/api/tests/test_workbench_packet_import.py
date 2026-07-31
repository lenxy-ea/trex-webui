import ipaddress

from app.trex.workbench_packet_import import (
    imported_ip_header_fields,
    imported_ip_packet_classification,
    stream_from_ethernet_packet,
)


def ipv4_header(protocol: int) -> bytes:
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


def test_imported_ip_packet_classification_accepts_l4_protocols() -> None:
    packet = b"\x00" * 14 + ipv4_header(17) + b"\x04\x01\x00\x0c"

    classification = imported_ip_packet_classification(packet, 4, 14, 20, 17)

    assert classification == {
        "gre_info": None,
        "has_l4": True,
        "l4_offset": 34,
        "packet_type": "Ethernet/IPv4/UDP",
    }


def test_imported_ip_packet_classification_rejects_unsupported_protocols() -> None:
    packet = b"\x00" * 14 + ipv4_header(99)

    assert imported_ip_packet_classification(packet, 4, 14, 20, 99) is None


def test_imported_ip_packet_classification_rejects_invalid_gre() -> None:
    packet = b"\x00" * 14 + ipv4_header(47) + b"\x00\x00\x08\x00"

    assert imported_ip_packet_classification(packet, 4, 14, 20, 47) is None


def test_imported_ip_header_fields_reads_ipv4_values() -> None:
    header = bytearray(ipv4_header(17))
    header[1] = 0xAB
    header[4:6] = (0x1234).to_bytes(2, "big")
    header[6:8] = (0x4007).to_bytes(2, "big")
    header[8] = 31
    header[10:12] = bytes.fromhex("cafe")
    packet = b"\x00" * 14 + bytes(header)

    fields = imported_ip_header_fields(packet, "Ethernet/IPv4/UDP", 14)

    assert fields["ipv4_src"] == "10.0.0.1"
    assert fields["ipv4_dst"] == "10.0.0.2"
    assert fields["ipv4_tos"] == 0xAB
    assert fields["ipv4_id"] == 0x1234
    assert fields["ipv4_fragment_word"] == 0x4007
    assert fields["ipv4_ttl"] == 31
    assert fields["ipv4_checksum"] == "CAFE"


def test_imported_ip_header_fields_reads_ipv6_values() -> None:
    first_word = (6 << 28) | (0xAB << 20) | 0x12345
    header = bytearray(first_word.to_bytes(4, "big"))
    header.extend((0).to_bytes(2, "big"))
    header.append(59)
    header.append(42)
    header.extend(ipaddress.IPv6Address("2001:db8:1::10").packed)
    header.extend(ipaddress.IPv6Address("2001:db8:2::20").packed)
    packet = b"\x00" * 14 + bytes(header)

    fields = imported_ip_header_fields(packet, "Ethernet/IPv6", 14)

    assert fields["ipv6_src"] == "2001:db8:1::10"
    assert fields["ipv6_dst"] == "2001:db8:2::20"
    assert fields["ipv6_traffic_class"] == 0xAB
    assert fields["ipv6_flow_label"] == 0x12345
    assert fields["ipv6_hop_limit"] == 42


def test_stream_from_ethernet_packet_builds_udp_workbench_stream() -> None:
    ethernet = bytes.fromhex("001122334455aabbccddeeff0800")
    header = bytearray(ipv4_header(17))
    header[2:4] = (28).to_bytes(2, "big")
    udp = (1025).to_bytes(2, "big") + (12).to_bytes(2, "big") + (8).to_bytes(2, "big") + b"\x00\x00"
    packet = ethernet + bytes(header) + udp

    stream = stream_from_ethernet_packet(packet, 0)

    assert stream is not None
    assert stream["name"] == "packet_1"
    assert stream["packet_type"] == "Ethernet/IPv4/UDP"
    assert stream["frame_length"] == 64
    assert stream["ether_dst"] == "00:11:22:33:44:55"
    assert stream["ether_src"] == "aa:bb:cc:dd:ee:ff"
    assert stream["ipv4_src"] == "10.0.0.1"
    assert stream["ipv4_dst"] == "10.0.0.2"
    assert stream["l4_src_port_override"] is True
    assert stream["l4_src_port"] == 1025
    assert stream["l4_dst_port"] == 12
    assert stream["udp_length"] == 8
    assert stream["pg_id"] == 1
    assert isinstance(stream["packet_binary_base64"], str) and stream["packet_binary_base64"]
