from __future__ import annotations

import ipaddress
import re
from typing import Any

PROFILE_WORKBENCH_PACKET_TYPES = {
    "Ethernet",
    "Ethernet/ARP",
    "Ethernet/IPv4",
    "Ethernet/IPv6",
    "Ethernet/IPv4/UDP",
    "Ethernet/IPv4/TCP",
    "Ethernet/IPv4/ICMP",
    "Ethernet/IPv4/GRE",
    "Ethernet/IPv4/SCTP",
    "Ethernet/IPv6/UDP",
    "Ethernet/IPv6/TCP",
    "Ethernet/IPv6/ICMPv6",
    "Ethernet/IPv6/GRE",
    "Ethernet/IPv6/SCTP",
}
PROFILE_WORKBENCH_MODES = {"continuous", "burst", "multi_burst"}
PROFILE_WORKBENCH_RATE_TYPES = {"pps", "bps L1", "bps L2", "percentage"}
PROFILE_WORKBENCH_CACHE_SIZE_TYPES = {"Auto", "Enable", "Disable"}
PROFILE_WORKBENCH_FRAME_LENGTH_TYPES = {"Fixed", "Increment", "Decrement", "Random"}
PROFILE_WORKBENCH_MAC_ADDRESS_MODES = {"Fixed", "Increment", "Decrement", "TRex Config"}
PROFILE_WORKBENCH_IPV4_ADDRESS_MODES = {"Fixed", "Increment Host", "Decrement Host", "Random Host"}
PROFILE_WORKBENCH_IPV6_ADDRESS_MODES = PROFILE_WORKBENCH_IPV4_ADDRESS_MODES
PROFILE_WORKBENCH_FIELD_ENGINE_MODES = {"Fixed", "Increment", "Decrement", "Random"}
PROFILE_WORKBENCH_VXLAN_INNER_IP_VERSIONS = {"IPv4", "IPv6"}
PROFILE_WORKBENCH_GTPU_INNER_IP_VERSIONS = {"IPv4", "IPv6"}
PROFILE_WORKBENCH_GRE_INNER_IP_VERSIONS = {"IPv4", "IPv6"}
PROFILE_WORKBENCH_MPLS_LABEL_MODES = PROFILE_WORKBENCH_FIELD_ENGINE_MODES
PROFILE_WORKBENCH_L4_PORT_MODES = PROFILE_WORKBENCH_FIELD_ENGINE_MODES
PROFILE_WORKBENCH_PAYLOAD_TYPES = {"Fixed Word", "Increment Byte", "Decrement Byte", "Random"}
PROFILE_PCAP_IMPORT_RATE_MODES = {"speedup", "ipg"}
PROFILE_DEFAULT_DST_MAC = "00:00:00:00:00:00"
PROFILE_DEFAULT_SRC_MAC = "00:00:00:00:00:00"
PROFILE_DEFAULT_ETHER_TYPE = "0800"
PROFILE_DEFAULT_ARP_HARDWARE_TYPE = 1
PROFILE_DEFAULT_ARP_PROTOCOL_TYPE = "0800"
PROFILE_DEFAULT_ARP_HARDWARE_SIZE = 6
PROFILE_DEFAULT_ARP_PROTOCOL_SIZE = 4
PROFILE_DEFAULT_ARP_OPERATION = 1
PROFILE_DEFAULT_VLAN_TPID = "8100"
PROFILE_MAX_VLAN_ID = 4094
PROFILE_DEFAULT_MPLS_LABEL = 17
PROFILE_DEFAULT_MPLS_TC = 0
PROFILE_DEFAULT_MPLS_TTL = 255
PROFILE_MPLS_ETHER_TYPES = {0x8847, 0x8848}
PROFILE_DEFAULT_VXLAN_VNI = 42
PROFILE_DEFAULT_VXLAN_OUTER_SRC_PORT = 1337
PROFILE_DEFAULT_VXLAN_OUTER_DST_PORT = 4789
CAPTURE_GTPU_PORT = 2152
CAPTURE_UDP_IP_TUNNEL_PORTS = {3544, 3797}
PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV4 = "10.0.0.1"
PROFILE_DEFAULT_VXLAN_INNER_DST_IPV4 = "10.0.0.2"
PROFILE_DEFAULT_VXLAN_INNER_TTL = 127
PROFILE_DEFAULT_VXLAN_INNER_SRC_IPV6 = "2001:db8:50::1"
PROFILE_DEFAULT_VXLAN_INNER_DST_IPV6 = "2001:db8:50::2"
PROFILE_DEFAULT_VXLAN_INNER_HOP_LIMIT = 64
PROFILE_DEFAULT_GTPU_MESSAGE_TYPE = 255
PROFILE_DEFAULT_GTPU_TEID = 0x12345678
PROFILE_DEFAULT_GTPU_SEQUENCE = 0
PROFILE_DEFAULT_GTPU_NPDU = 0
PROFILE_DEFAULT_GTPU_EXTENSION_TYPE_UDP_PORT = 0x40
PROFILE_DEFAULT_GTPU_EXTENSION_UDP_PORT = CAPTURE_GTPU_PORT
PROFILE_DEFAULT_GTPU_INNER_SRC_IPV4 = "10.3.0.1"
PROFILE_DEFAULT_GTPU_INNER_DST_IPV4 = "10.3.0.2"
PROFILE_DEFAULT_GTPU_INNER_TTL = 64
PROFILE_DEFAULT_GTPU_INNER_SRC_IPV6 = "2001:db8:30::1"
PROFILE_DEFAULT_GTPU_INNER_DST_IPV6 = "2001:db8:30::2"
PROFILE_DEFAULT_GTPU_INNER_HOP_LIMIT = 64
PROFILE_DEFAULT_GRE_PROTOCOL_TYPE = "0800"
PROFILE_DEFAULT_GRE_INNER_SRC_IPV4 = "10.2.0.1"
PROFILE_DEFAULT_GRE_INNER_DST_IPV4 = "10.2.0.2"
PROFILE_DEFAULT_GRE_INNER_SRC_IPV6 = "2001:db8:40::1"
PROFILE_DEFAULT_GRE_INNER_DST_IPV6 = "2001:db8:40::2"
PROFILE_DEFAULT_GRE_INNER_HOP_LIMIT = 64
PROFILE_DEFAULT_GRE_CHECKSUM = "0000"
PROFILE_DEFAULT_GRE_KEY = 0
PROFILE_DEFAULT_GRE_SEQUENCE = 0
PROFILE_DEFAULT_SRC_IPV4 = "16.0.0.1"
PROFILE_DEFAULT_DST_IPV4 = "48.0.0.1"
PROFILE_DEFAULT_SRC_IPV6 = "2001:db8::1"
PROFILE_DEFAULT_DST_IPV6 = "2001:db8::2"
PROFILE_DEFAULT_IP_TTL = 127
PROFILE_DEFAULT_IP_DSCP = 0
PROFILE_DEFAULT_IP_ECN = 0
PROFILE_DEFAULT_IP_ID = 1234
PROFILE_DEFAULT_IPV4_CHECKSUM = "0000"
PROFILE_DEFAULT_IPV6_TRAFFIC_CLASS = 0
PROFILE_DEFAULT_IPV6_FLOW_LABEL = 0
PROFILE_DEFAULT_SRC_PORT = 1025
PROFILE_DEFAULT_DST_PORT = 12
PROFILE_DEFAULT_UDP_LENGTH = 26
PROFILE_DEFAULT_UDP_CHECKSUM = "0000"
PROFILE_DEFAULT_DNS_TRANSACTION_ID = 0x1234
PROFILE_DEFAULT_DNS_FLAGS = "0100"
PROFILE_DEFAULT_DNS_QUERY_NAME = "example.com"
PROFILE_DEFAULT_DNS_QUERY_TYPE = 1
PROFILE_DEFAULT_DNS_QUERY_CLASS = 1
PROFILE_DEFAULT_DNS_ANSWER_TTL = 60
PROFILE_DEFAULT_DNS_ANSWER_IPV4 = "192.0.2.1"
PROFILE_WORKBENCH_DNS_FE_FIELDS = (
    "dns_transaction_id",
    "dns_flags",
    "dns_query_type",
    "dns_query_class",
    "dns_answer_ttl",
    "dns_answer_ipv4",
)
PROFILE_DEFAULT_DHCP_MESSAGE_TYPE = 1
PROFILE_WORKBENCH_DHCP_FE_FIELDS = (
    "dhcp_operation",
    "dhcp_hops",
    "dhcp_seconds",
    "dhcp_message_type",
    "dhcp_flags",
    "dhcp_client_ip",
    "dhcp_your_ip",
    "dhcp_server_ip",
    "dhcp_relay_ip",
    "dhcp_client_mac",
    "dhcp_requested_ip",
    "dhcp_server_id",
    "dhcp_lease_time",
    "dhcp_renewal_time",
    "dhcp_rebinding_time",
    "dhcp_xid",
)
PROFILE_DEFAULT_DHCP_OPERATION = 1
PROFILE_DEFAULT_DHCP_HOPS = 0
PROFILE_DEFAULT_DHCP_SECONDS = 0
PROFILE_DEFAULT_DHCP_XID = 0x3903F326
PROFILE_DEFAULT_DHCP_FLAGS = "8000"
PROFILE_DEFAULT_DHCP_CLIENT_IP = "0.0.0.0"
PROFILE_DEFAULT_DHCP_YOUR_IP = "0.0.0.0"
PROFILE_DEFAULT_DHCP_SERVER_IP = "0.0.0.0"
PROFILE_DEFAULT_DHCP_RELAY_IP = "0.0.0.0"
PROFILE_DEFAULT_DHCP_CLIENT_MAC = "00:11:22:33:44:55"
PROFILE_DEFAULT_DHCP_HOSTNAME = "trex-webui"
PROFILE_DEFAULT_DHCP_REQUESTED_IP = "0.0.0.0"
PROFILE_DEFAULT_DHCP_SERVER_ID = "0.0.0.0"
PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST = "1,3,6,15,28,51,58,59"
PROFILE_DEFAULT_DHCP_LEASE_TIME = 0
PROFILE_DEFAULT_DHCP_RENEWAL_TIME = 0
PROFILE_DEFAULT_DHCP_REBINDING_TIME = 0
PROFILE_DHCP_MIN_PAYLOAD_BYTES = 300
PROFILE_DEFAULT_TCP_SEQUENCE = 1_234_567
PROFILE_DEFAULT_TCP_ACKNOWLEDGE = 7_654_321
PROFILE_DEFAULT_TCP_WINDOW = 9999
PROFILE_DEFAULT_TCP_CHECKSUM = "ABCD"
PROFILE_DEFAULT_TCP_URGENT_POINTER = 1111
PROFILE_DEFAULT_TCP_OPTION_MSS = 1460
PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE = 7
PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE = 1
PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO = 0
PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE = 1000
PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE = 2000
PROFILE_DEFAULT_SCTP_VERIFICATION_TAG = 0x12345678
PROFILE_DEFAULT_SCTP_CHECKSUM = "00000000"
PROFILE_DEFAULT_SCTP_DATA_FLAGS = 0x03
PROFILE_DEFAULT_SCTP_TSN = 1
PROFILE_DEFAULT_SCTP_STREAM_ID = 0
PROFILE_DEFAULT_SCTP_STREAM_SEQUENCE = 0
PROFILE_DEFAULT_SCTP_PAYLOAD_PROTOCOL_ID = 0
PROFILE_DEFAULT_ICMP_TYPE = 8
PROFILE_DEFAULT_ICMPV6_TYPE = 128
PROFILE_DEFAULT_ICMP_CODE = 0
PROFILE_DEFAULT_ICMP_CHECKSUM = "0000"
PROFILE_DEFAULT_ICMP_IDENTIFIER = 1
PROFILE_DEFAULT_ICMP_SEQUENCE = 1
PROFILE_DEFAULT_ICMPV6_ND_TARGET = PROFILE_DEFAULT_DST_IPV6
PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC = PROFILE_DEFAULT_SRC_MAC
PROFILE_DEFAULT_ICMPV6_RA_PREFIX = "2001:db8:1::"
PROFILE_DEFAULT_ICMPV6_RA_ROUTER_LIFETIME = 1800
PROFILE_DEFAULT_ICMPV6_RA_PREFIX_VALID_LIFETIME = 2_592_000
PROFILE_DEFAULT_ICMPV6_RA_PREFIX_PREFERRED_LIFETIME = 604_800
PROFILE_PCAP_BASE64_MAX_CHARS = 16_000_000
PROFILE_PCAP_MAX_BYTES = 12_000_000
PROFILE_PCAP_MAX_PACKETS = 512
PROFILE_PACKET_MODEL_MAX_CHARS = 4_000_000
PROFILE_ADVANCED_VM_MAX_BYTES = 1_000_000
PROFILE_PCAP_NAME_ERROR = "pcap file name must be a clean .pcap or .cap file name"
PROFILE_NO_STREAMS_ERROR = (
    "profile did not return any streams; Python profile may require tunables or may have received unsupported tunables"
)
PROFILE_NOT_TRAFFIC_PROFILE_ERROR = (
    "profile is not a runnable STL traffic profile; selected file does not expose stream packet data"
)


def default_dns_fields() -> dict[str, Any]:
    return {
        "dns_enabled": False,
        "dns_transaction_id": PROFILE_DEFAULT_DNS_TRANSACTION_ID,
        "dns_transaction_id_mode": "Fixed",
        "dns_transaction_id_count": 16,
        "dns_transaction_id_step": 1,
        "dns_flags": PROFILE_DEFAULT_DNS_FLAGS,
        "dns_flags_mode": "Fixed",
        "dns_flags_count": 16,
        "dns_flags_step": 1,
        "dns_query_name": PROFILE_DEFAULT_DNS_QUERY_NAME,
        "dns_query_type": PROFILE_DEFAULT_DNS_QUERY_TYPE,
        "dns_query_type_mode": "Fixed",
        "dns_query_type_count": 16,
        "dns_query_type_step": 1,
        "dns_query_class": PROFILE_DEFAULT_DNS_QUERY_CLASS,
        "dns_query_class_mode": "Fixed",
        "dns_query_class_count": 16,
        "dns_query_class_step": 1,
        "dns_answer_enabled": False,
        "dns_answer_ttl": PROFILE_DEFAULT_DNS_ANSWER_TTL,
        "dns_answer_ttl_mode": "Fixed",
        "dns_answer_ttl_count": 16,
        "dns_answer_ttl_step": 1,
        "dns_answer_ipv4": PROFILE_DEFAULT_DNS_ANSWER_IPV4,
        "dns_answer_ipv4_mode": "Fixed",
        "dns_answer_ipv4_count": 16,
        "dns_answer_ipv4_step": 1,
    }


def default_dhcp_fields() -> dict[str, Any]:
    return {
        "dhcp_enabled": False,
        "dhcp_operation": PROFILE_DEFAULT_DHCP_OPERATION,
        "dhcp_operation_mode": "Fixed",
        "dhcp_operation_count": 2,
        "dhcp_operation_step": 1,
        "dhcp_hops": PROFILE_DEFAULT_DHCP_HOPS,
        "dhcp_hops_mode": "Fixed",
        "dhcp_hops_count": 16,
        "dhcp_hops_step": 1,
        "dhcp_seconds": PROFILE_DEFAULT_DHCP_SECONDS,
        "dhcp_seconds_mode": "Fixed",
        "dhcp_seconds_count": 16,
        "dhcp_seconds_step": 1,
        "dhcp_message_type": PROFILE_DEFAULT_DHCP_MESSAGE_TYPE,
        "dhcp_message_type_mode": "Fixed",
        "dhcp_message_type_count": 16,
        "dhcp_message_type_step": 1,
        "dhcp_xid": PROFILE_DEFAULT_DHCP_XID,
        "dhcp_xid_mode": "Fixed",
        "dhcp_xid_count": 16,
        "dhcp_xid_step": 1,
        "dhcp_flags": PROFILE_DEFAULT_DHCP_FLAGS,
        "dhcp_flags_mode": "Fixed",
        "dhcp_flags_count": 16,
        "dhcp_flags_step": 1,
        "dhcp_client_ip": PROFILE_DEFAULT_DHCP_CLIENT_IP,
        "dhcp_client_ip_mode": "Fixed",
        "dhcp_client_ip_count": 16,
        "dhcp_client_ip_step": 1,
        "dhcp_your_ip": PROFILE_DEFAULT_DHCP_YOUR_IP,
        "dhcp_your_ip_mode": "Fixed",
        "dhcp_your_ip_count": 16,
        "dhcp_your_ip_step": 1,
        "dhcp_server_ip": PROFILE_DEFAULT_DHCP_SERVER_IP,
        "dhcp_server_ip_mode": "Fixed",
        "dhcp_server_ip_count": 16,
        "dhcp_server_ip_step": 1,
        "dhcp_relay_ip": PROFILE_DEFAULT_DHCP_RELAY_IP,
        "dhcp_relay_ip_mode": "Fixed",
        "dhcp_relay_ip_count": 16,
        "dhcp_relay_ip_step": 1,
        "dhcp_client_mac": PROFILE_DEFAULT_DHCP_CLIENT_MAC,
        "dhcp_client_mac_mode": "Fixed",
        "dhcp_client_mac_count": 16,
        "dhcp_client_mac_step": 1,
        "dhcp_hostname": PROFILE_DEFAULT_DHCP_HOSTNAME,
        "dhcp_requested_ip": PROFILE_DEFAULT_DHCP_REQUESTED_IP,
        "dhcp_requested_ip_mode": "Fixed",
        "dhcp_requested_ip_count": 16,
        "dhcp_requested_ip_step": 1,
        "dhcp_server_id": PROFILE_DEFAULT_DHCP_SERVER_ID,
        "dhcp_server_id_mode": "Fixed",
        "dhcp_server_id_count": 16,
        "dhcp_server_id_step": 1,
        "dhcp_parameter_request_list": PROFILE_DEFAULT_DHCP_PARAMETER_REQUEST_LIST,
        "dhcp_lease_time": PROFILE_DEFAULT_DHCP_LEASE_TIME,
        "dhcp_lease_time_mode": "Fixed",
        "dhcp_lease_time_count": 16,
        "dhcp_lease_time_step": 1,
        "dhcp_renewal_time": PROFILE_DEFAULT_DHCP_RENEWAL_TIME,
        "dhcp_renewal_time_mode": "Fixed",
        "dhcp_renewal_time_count": 16,
        "dhcp_renewal_time_step": 1,
        "dhcp_rebinding_time": PROFILE_DEFAULT_DHCP_REBINDING_TIME,
        "dhcp_rebinding_time_mode": "Fixed",
        "dhcp_rebinding_time_count": 16,
        "dhcp_rebinding_time_step": 1,
    }


def default_arp_fields() -> dict[str, Any]:
    return {
        "arp_hardware_type": PROFILE_DEFAULT_ARP_HARDWARE_TYPE,
        "arp_protocol_type": PROFILE_DEFAULT_ARP_PROTOCOL_TYPE,
        "arp_hardware_size": PROFILE_DEFAULT_ARP_HARDWARE_SIZE,
        "arp_protocol_size": PROFILE_DEFAULT_ARP_PROTOCOL_SIZE,
        "arp_operation": PROFILE_DEFAULT_ARP_OPERATION,
        "arp_operation_mode": "Fixed",
        "arp_operation_count": 4,
        "arp_operation_step": 1,
        "arp_sender_mac": PROFILE_DEFAULT_SRC_MAC,
        "arp_sender_mac_mode": "Fixed",
        "arp_sender_mac_count": 16,
        "arp_sender_mac_step": 1,
        "arp_sender_ip": PROFILE_DEFAULT_SRC_IPV4,
        "arp_sender_ip_mode": "Fixed",
        "arp_sender_ip_count": 16,
        "arp_sender_ip_step": 1,
        "arp_target_mac": PROFILE_DEFAULT_DST_MAC,
        "arp_target_mac_mode": "Fixed",
        "arp_target_mac_count": 16,
        "arp_target_mac_step": 1,
        "arp_target_ip": PROFILE_DEFAULT_DST_IPV4,
        "arp_target_ip_mode": "Fixed",
        "arp_target_ip_count": 16,
        "arp_target_ip_step": 1,
    }


def default_tcp_fields() -> dict[str, Any]:
    return {
        "tcp_sequence_number": PROFILE_DEFAULT_TCP_SEQUENCE,
        "tcp_sequence_mode": "Fixed",
        "tcp_sequence_count": 16,
        "tcp_sequence_step": 1,
        "tcp_ack_number": PROFILE_DEFAULT_TCP_ACKNOWLEDGE,
        "tcp_ack_mode": "Fixed",
        "tcp_ack_count": 16,
        "tcp_ack_step": 1,
        "tcp_window": PROFILE_DEFAULT_TCP_WINDOW,
        "tcp_window_mode": "Fixed",
        "tcp_window_count": 16,
        "tcp_window_step": 1,
        "tcp_checksum_override": False,
        "tcp_checksum": PROFILE_DEFAULT_TCP_CHECKSUM,
        "tcp_checksum_mode": "Fixed",
        "tcp_checksum_count": 16,
        "tcp_checksum_step": 1,
        "tcp_option_mss_enabled": False,
        "tcp_option_mss": PROFILE_DEFAULT_TCP_OPTION_MSS,
        "tcp_option_mss_mode": "Fixed",
        "tcp_option_mss_count": 16,
        "tcp_option_mss_step": 1,
        "tcp_option_window_scale_enabled": False,
        "tcp_option_window_scale": PROFILE_DEFAULT_TCP_OPTION_WINDOW_SCALE,
        "tcp_option_window_scale_mode": "Fixed",
        "tcp_option_window_scale_count": 16,
        "tcp_option_window_scale_step": 1,
        "tcp_option_sack_permitted_enabled": False,
        "tcp_option_sack_blocks_enabled": False,
        "tcp_option_sack_left_edge": PROFILE_DEFAULT_TCP_OPTION_SACK_LEFT_EDGE,
        "tcp_option_sack_left_edge_mode": "Fixed",
        "tcp_option_sack_left_edge_count": 16,
        "tcp_option_sack_left_edge_step": 1,
        "tcp_option_sack_right_edge": PROFILE_DEFAULT_TCP_OPTION_SACK_RIGHT_EDGE,
        "tcp_option_sack_right_edge_mode": "Fixed",
        "tcp_option_sack_right_edge_count": 16,
        "tcp_option_sack_right_edge_step": 1,
        "tcp_option_timestamp_enabled": False,
        "tcp_option_timestamp_value": PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_VALUE,
        "tcp_option_timestamp_value_mode": "Fixed",
        "tcp_option_timestamp_value_count": 16,
        "tcp_option_timestamp_value_step": 1,
        "tcp_option_timestamp_echo": PROFILE_DEFAULT_TCP_OPTION_TIMESTAMP_ECHO,
        "tcp_option_timestamp_echo_mode": "Fixed",
        "tcp_option_timestamp_echo_count": 16,
        "tcp_option_timestamp_echo_step": 1,
        "tcp_urgent_pointer": PROFILE_DEFAULT_TCP_URGENT_POINTER,
        "tcp_urgent_pointer_mode": "Fixed",
        "tcp_urgent_pointer_count": 16,
        "tcp_urgent_pointer_step": 1,
        "tcp_flags_mode": "Fixed",
        "tcp_flags_count": 16,
        "tcp_flags_step": 1,
        "tcp_flag_urg": False,
        "tcp_flag_ack": False,
        "tcp_flag_psh": False,
        "tcp_flag_rst": False,
        "tcp_flag_syn": False,
        "tcp_flag_fin": False,
    }


def default_sctp_fields() -> dict[str, Any]:
    return {
        "sctp_verification_tag": PROFILE_DEFAULT_SCTP_VERIFICATION_TAG,
        "sctp_verification_tag_mode": "Fixed",
        "sctp_verification_tag_count": 16,
        "sctp_verification_tag_step": 1,
        "sctp_checksum_override": False,
        "sctp_checksum": PROFILE_DEFAULT_SCTP_CHECKSUM,
        "sctp_data_flags": PROFILE_DEFAULT_SCTP_DATA_FLAGS,
        "sctp_data_flags_mode": "Fixed",
        "sctp_data_flags_count": 16,
        "sctp_data_flags_step": 1,
        "sctp_tsn": PROFILE_DEFAULT_SCTP_TSN,
        "sctp_tsn_mode": "Fixed",
        "sctp_tsn_count": 16,
        "sctp_tsn_step": 1,
        "sctp_stream_id": PROFILE_DEFAULT_SCTP_STREAM_ID,
        "sctp_stream_id_mode": "Fixed",
        "sctp_stream_id_count": 16,
        "sctp_stream_id_step": 1,
        "sctp_stream_sequence": PROFILE_DEFAULT_SCTP_STREAM_SEQUENCE,
        "sctp_stream_sequence_mode": "Fixed",
        "sctp_stream_sequence_count": 16,
        "sctp_stream_sequence_step": 1,
        "sctp_payload_protocol_id": PROFILE_DEFAULT_SCTP_PAYLOAD_PROTOCOL_ID,
        "sctp_payload_protocol_id_mode": "Fixed",
        "sctp_payload_protocol_id_count": 16,
        "sctp_payload_protocol_id_step": 1,
    }


def default_icmp_fields(default_type: int = PROFILE_DEFAULT_ICMP_TYPE) -> dict[str, Any]:
    return {
        "icmp_type": default_type,
        "icmp_type_mode": "Fixed",
        "icmp_type_count": 16,
        "icmp_type_step": 1,
        "icmp_code": PROFILE_DEFAULT_ICMP_CODE,
        "icmp_code_mode": "Fixed",
        "icmp_code_count": 16,
        "icmp_code_step": 1,
        "icmp_checksum_override": False,
        "icmp_checksum": PROFILE_DEFAULT_ICMP_CHECKSUM,
        "icmp_identifier": PROFILE_DEFAULT_ICMP_IDENTIFIER,
        "icmp_identifier_mode": "Fixed",
        "icmp_identifier_count": 16,
        "icmp_identifier_step": 1,
        "icmp_sequence": PROFILE_DEFAULT_ICMP_SEQUENCE,
        "icmp_sequence_mode": "Fixed",
        "icmp_sequence_count": 16,
        "icmp_sequence_step": 1,
        "icmpv6_nd_target": PROFILE_DEFAULT_ICMPV6_ND_TARGET,
        "icmpv6_nd_include_option": True,
        "icmpv6_nd_option_mac": PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC,
        "icmpv6_nd_na_router": False,
        "icmpv6_nd_na_solicited": True,
        "icmpv6_nd_na_override": True,
        "icmpv6_rs_include_slla": True,
        "icmpv6_rs_slla_mac": PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC,
        "icmpv6_ra_cur_hop_limit": 64,
        "icmpv6_ra_managed": False,
        "icmpv6_ra_other": False,
        "icmpv6_ra_router_lifetime": PROFILE_DEFAULT_ICMPV6_RA_ROUTER_LIFETIME,
        "icmpv6_ra_reachable_time": 0,
        "icmpv6_ra_retrans_timer": 0,
        "icmpv6_ra_include_slla": True,
        "icmpv6_ra_slla_mac": PROFILE_DEFAULT_ICMPV6_ND_OPTION_MAC,
        "icmpv6_ra_include_prefix": True,
        "icmpv6_ra_prefix": PROFILE_DEFAULT_ICMPV6_RA_PREFIX,
        "icmpv6_ra_prefix_length": 64,
        "icmpv6_ra_prefix_on_link": True,
        "icmpv6_ra_prefix_autonomous": True,
        "icmpv6_ra_prefix_valid_lifetime": PROFILE_DEFAULT_ICMPV6_RA_PREFIX_VALID_LIFETIME,
        "icmpv6_ra_prefix_preferred_lifetime": PROFILE_DEFAULT_ICMPV6_RA_PREFIX_PREFERRED_LIFETIME,
    }


def looks_like_mac(value: str) -> bool:
    parts = value.split(":")
    return len(parts) == 6 and all(len(part) == 2 and all(char in "0123456789abcdefABCDEF" for char in part) for part in parts)


def clean_stream_name(value: object, index: int) -> str:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate != "" and candidate == value and "\x00" not in candidate:
            return candidate[:128]
    return f"stream-{index + 1}"


def choice(value: object, allowed: set[str], fallback: str) -> str:
    return value if isinstance(value, str) and value in allowed else fallback


def bool_value(value: object, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def clean_mac_text(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip().lower()
        if candidate == value.lower() and looks_like_mac(candidate):
            return candidate
    return fallback


def clean_hex_word_text(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip().lower()
        if len(candidate) == 4 and re.fullmatch(r"[0-9a-f]{4}", candidate) is not None:
            return candidate
    if isinstance(value, int) and 0 <= value <= 0xFFFF:
        return f"{value:04x}"
    return fallback


def clean_hex_word_text_upper(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip().upper()
        if len(candidate) == 4 and re.fullmatch(r"[0-9A-F]{4}", candidate) is not None:
            return candidate
    return fallback


def clean_hex_dword_text_upper(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip().upper()
        if len(candidate) == 8 and re.fullmatch(r"[0-9A-F]{8}", candidate) is not None:
            return candidate
    return fallback


def clean_ipv4_text(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip()
        try:
            parsed = ipaddress.ip_address(candidate)
        except ValueError:
            parsed = None
        if parsed is not None and parsed.version == 4:
            return str(parsed)
    return fallback


def clean_ipv6_text(value: object, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip()
        try:
            parsed = ipaddress.ip_address(candidate)
        except ValueError:
            parsed = None
        if parsed is not None and parsed.version == 6:
            return str(parsed)
    return fallback


def bounded_int(value: object, minimum: int, maximum: int, fallback: int) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= maximum:
        return value
    if isinstance(value, float) and value.is_integer() and minimum <= value <= maximum:
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value)
        if minimum <= parsed <= maximum:
            return parsed
    return fallback


_LARGE_UNIT_COUNT_RE = re.compile(r"^\s*(\d{1,10}(?:\.\d{1,2})?)\s*([KMGkmg])\s*$")


def bounded_large_unit_count(value: object, minimum: int, maximum: int, fallback: int) -> int:
    parsed = bounded_int(value, minimum, maximum, fallback)
    if parsed != fallback:
        return parsed
    if isinstance(value, float) and not isinstance(value, bool):
        truncated = int(value)
        if minimum <= truncated <= maximum:
            return truncated
    if not isinstance(value, str):
        return fallback

    candidate: float | None = None
    stripped = value.strip()
    try:
        candidate = float(stripped)
    except ValueError:
        match = _LARGE_UNIT_COUNT_RE.fullmatch(stripped)
        if match is None:
            return fallback
        number = float(match.group(1))
        multiplier = {"K": 1_000, "M": 1_000_000, "G": 1_000_000_000}[match.group(2).upper()]
        candidate = number * multiplier

    if candidate is None:
        return fallback
    truncated = int(candidate)
    if minimum <= truncated <= maximum:
        return truncated
    return fallback


def optional_bounded_int(value: object, minimum: int, maximum: int) -> int | None:
    if value is None:
        return None
    parsed = bounded_int(value, minimum, maximum, -1)
    return parsed if parsed != -1 else None


def bounded_float(value: object, minimum: float, maximum: float, fallback: float) -> float:
    candidate: float | None = None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        candidate = float(value)
    elif isinstance(value, str):
        try:
            candidate = float(value)
        except ValueError:
            candidate = None
    if candidate is not None and minimum <= candidate <= maximum:
        return candidate
    return fallback
