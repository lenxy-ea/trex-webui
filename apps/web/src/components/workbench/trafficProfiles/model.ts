import type { ProfileWorkbenchStream } from "../../../api";
import { ipVersionName } from "./protocolSelectionModel";
import {
  largeUnitCountValue,
  numberValue
} from "./scalarValueModel";

export const packetTypes: ProfileWorkbenchStream["packet_type"][] = [
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
  "Ethernet/IPv6/SCTP"
];

export const frameLengthTypes: ProfileWorkbenchStream["frame_length_type"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const macAddressModes: ProfileWorkbenchStream["ether_src_mode"][] = ["Fixed", "Increment", "Decrement", "TRex Config"];
export const arpMacModes: ProfileWorkbenchStream["arp_sender_mac_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv4AddressModes: ProfileWorkbenchStream["ipv4_src_mode"][] = ["Fixed", "Increment Host", "Decrement Host", "Random Host"];
export const ipv4DscpModes: ProfileWorkbenchStream["ipv4_dscp_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv4EcnModes: ProfileWorkbenchStream["ipv4_ecn_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv4IdModes: ProfileWorkbenchStream["ipv4_id_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv4FragmentOffsetModes: ProfileWorkbenchStream["ipv4_fragment_offset_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv4TtlModes: ProfileWorkbenchStream["ipv4_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv6AddressModes: ProfileWorkbenchStream["ipv6_src_mode"][] = ["Fixed", "Increment Host", "Decrement Host", "Random Host"];
export const ipv6TrafficClassModes: ProfileWorkbenchStream["ipv6_traffic_class_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv6FlowLabelModes: ProfileWorkbenchStream["ipv6_flow_label_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const ipv6HopLimitModes: ProfileWorkbenchStream["ipv6_hop_limit_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const vlanPriorityModes: ProfileWorkbenchStream["vlan_priority_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const vlanIdModes: ProfileWorkbenchStream["vlan_id_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const arpOperationModes: ProfileWorkbenchStream["arp_operation_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const vxlanVniModes: ProfileWorkbenchStream["vxlan_vni_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const vxlanInnerIpv4TtlModes: ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const vxlanInnerIpVersions: ProfileWorkbenchStream["vxlan_inner_ip_version"][] = ["IPv4", "IPv6"];
export const vxlanInnerIpv6HopLimitModes: ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuTeidModes: ProfileWorkbenchStream["gtpu_teid_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuSequenceModes: ProfileWorkbenchStream["gtpu_sequence_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuNpduModes: ProfileWorkbenchStream["gtpu_npdu_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuExtensionUdpPortModes: ProfileWorkbenchStream["gtpu_extension_udp_port_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuInnerIpVersions: ProfileWorkbenchStream["gtpu_inner_ip_version"][] = ["IPv4", "IPv6"];
export const gtpuInnerIpv4TtlModes: ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const gtpuInnerIpv6HopLimitModes: ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const greInnerIpv6HopLimitModes: ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const mplsLabelModes: ProfileWorkbenchStream["mpls_label_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const mplsTrafficClassModes: ProfileWorkbenchStream["mpls_tc_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const mplsTtlModes: ProfileWorkbenchStream["mpls_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const l4PortModes: ProfileWorkbenchStream["l4_src_port_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const udpLengthModes: ProfileWorkbenchStream["udp_length_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const udpChecksumModes: ProfileWorkbenchStream["udp_checksum_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsTransactionIdModes: ProfileWorkbenchStream["dns_transaction_id_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsFlagsModes: ProfileWorkbenchStream["dns_flags_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsQueryTypeModes: ProfileWorkbenchStream["dns_query_type_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsQueryClassModes: ProfileWorkbenchStream["dns_query_class_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsAnswerTtlModes: ProfileWorkbenchStream["dns_answer_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dnsAnswerIpv4Modes: ProfileWorkbenchStream["dns_answer_ipv4_mode"][] = ["Fixed", "Increment Host", "Decrement Host", "Random Host"];
export const dhcpMessageTypeModes: ProfileWorkbenchStream["dhcp_message_type_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpXidModes: ProfileWorkbenchStream["dhcp_xid_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpFlagsModes: ProfileWorkbenchStream["dhcp_flags_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpOperationModes: ProfileWorkbenchStream["dhcp_operation_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpByteModes: ProfileWorkbenchStream["dhcp_hops_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpSecondsModes: ProfileWorkbenchStream["dhcp_seconds_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpTimerModes: ProfileWorkbenchStream["dhcp_lease_time_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const dhcpBootpIpModes: ProfileWorkbenchStream["dhcp_client_ip_mode"][] = ["Fixed", "Increment Host", "Decrement Host", "Random Host"];
export const dhcpClientMacModes: ProfileWorkbenchStream["dhcp_client_mac_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpNumberModes: ProfileWorkbenchStream["tcp_sequence_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpWindowModes: ProfileWorkbenchStream["tcp_window_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpChecksumModes: ProfileWorkbenchStream["tcp_checksum_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpOptionMssModes: ProfileWorkbenchStream["tcp_option_mss_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpOptionWindowScaleModes: ProfileWorkbenchStream["tcp_option_window_scale_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpOptionSackModes: ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpOptionTimestampModes: ProfileWorkbenchStream["tcp_option_timestamp_value_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpUrgentPointerModes: ProfileWorkbenchStream["tcp_urgent_pointer_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const tcpFlagsModes: ProfileWorkbenchStream["tcp_flags_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const sctpNumberModes: ProfileWorkbenchStream["sctp_tsn_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const greNumberModes: ProfileWorkbenchStream["gre_key_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const greInnerIpVersions: ProfileWorkbenchStream["gre_inner_ip_version"][] = ["IPv4", "IPv6"];
export const greInnerIpv4TtlModes: ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const icmpTypeModes: ProfileWorkbenchStream["icmp_type_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const icmpCodeModes: ProfileWorkbenchStream["icmp_code_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const icmpNumberModes: ProfileWorkbenchStream["icmp_identifier_mode"][] = ["Fixed", "Increment", "Decrement", "Random"];
export const modeTypes: ProfileWorkbenchStream["mode"][] = ["continuous", "burst", "multi_burst"];
export const rateTypes: ProfileWorkbenchStream["rate_type"][] = ["pps", "bps L1", "bps L2", "percentage"];
export const cacheSizeTypes: ProfileWorkbenchStream["advanced_cache_size_type"][] = ["Auto", "Enable", "Disable"];
export const payloadTypes: ProfileWorkbenchStream["payload_type"][] = ["Fixed Word", "Increment Byte", "Decrement Byte", "Random"];

export const vlanPriorityValues = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const vlanCfiValues = [0, 1] as const;
export const mplsTrafficClassValues = vlanPriorityValues;
export const vxlanDefaultFrameLength = 128;
export const gtpuDefaultFrameLength = 96;
export const gtpuInnerIpv6DefaultFrameLength = 116;

export const tunableVmTypes = ["", "var1", "var2", "random", "tuple", "size", "cached"];
export const tunableFlowTypes = ["", "no-fs", "fs", "fsl"];
export const shortcutTunableNames = new Set(["size", "vm", "flow", "pg_id"]);

export type TcpFlagKey =
  | "tcp_flag_ack"
  | "tcp_flag_fin"
  | "tcp_flag_psh"
  | "tcp_flag_rst"
  | "tcp_flag_syn"
  | "tcp_flag_urg";

export const tcpFlagControls: Array<{ label: string; key: TcpFlagKey }> = [
  { label: "URG", key: "tcp_flag_urg" },
  { label: "ACK", key: "tcp_flag_ack" },
  { label: "PSH", key: "tcp_flag_psh" },
  { label: "RST", key: "tcp_flag_rst" },
  { label: "SYN", key: "tcp_flag_syn" },
  { label: "FIN", key: "tcp_flag_fin" }
];

export function isRawPacketAdvancedStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream?.packet_binary_base64 && stream.packet_type === "Ethernet");
}

export function hasDynamicSctpDataField(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && (
        stream.sctp_verification_tag_mode !== "Fixed"
        || stream.sctp_data_flags_mode !== "Fixed"
        || stream.sctp_tsn_mode !== "Fixed"
        || stream.sctp_stream_id_mode !== "Fixed"
        || stream.sctp_stream_sequence_mode !== "Fixed"
        || stream.sctp_payload_protocol_id_mode !== "Fixed"
      )
  );
}

export function isSctpChecksumLocked(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && (
        stream.l4_src_port_mode !== "Fixed"
        || stream.l4_dst_port_mode !== "Fixed"
        || hasDynamicSctpDataField(stream)
      )
  );
}

export function hasStructuredAdvancedTargetIntent(stream: ProfileWorkbenchStream | null | undefined) {
  if (!stream || stream.packet_type === "Ethernet") {
    return false;
  }
  return Boolean(
    stream.packet_type !== "Ethernet/IPv4/UDP"
      || stream.frame_length_type !== "Fixed"
      || stream.ether_dst !== "00:00:00:00:00:00"
      || stream.ether_src !== "00:00:00:00:00:00"
      || stream.ether_dst_mode !== "TRex Config"
      || stream.ether_src_mode !== "TRex Config"
      || stream.ether_type_override
      || stream.vlan_enabled
      || stream.vlan2_enabled
      || stream.mpls_enabled
      || stream.mpls_label2_enabled
      || stream.mpls_label3_enabled
      || stream.vxlan_enabled
      || stream.gtpu_enabled
      || stream.gre_checksum_present
      || stream.gre_key_present
      || stream.gre_sequence_present
      || stream.ipv4_src !== "16.0.0.1"
      || stream.ipv4_dst !== "48.0.0.1"
      || stream.ipv4_src_mode !== "Fixed"
      || stream.ipv4_dst_mode !== "Fixed"
      || stream.ipv4_dscp !== 0
      || stream.ipv4_ecn !== 0
      || stream.ipv4_id !== 1234
      || stream.ipv4_flag_df
      || stream.ipv4_flag_mf
      || stream.ipv4_fragment_offset !== 0
      || stream.ipv4_ttl !== 127
      || stream.ipv4_checksum_override
      || stream.ipv6_src !== "2001:db8::1"
      || stream.ipv6_dst !== "2001:db8::2"
      || stream.ipv6_src_mode !== "Fixed"
      || stream.ipv6_dst_mode !== "Fixed"
      || stream.ipv6_traffic_class !== 0
      || stream.ipv6_flow_label !== 0
      || stream.ipv6_hop_limit !== 127
      || stream.l4_src_port_override
      || stream.l4_dst_port_override
      || stream.l4_src_port !== 1025
      || stream.l4_dst_port !== 12
      || stream.l4_src_port_mode !== "Fixed"
      || stream.l4_dst_port_mode !== "Fixed"
      || stream.udp_length_override
      || stream.udp_checksum_override
      || stream.dns_enabled
      || stream.dhcp_enabled
  );
}

export function isIcmpPacketType(packetType: ProfileWorkbenchStream["packet_type"]) {
  return packetType === "Ethernet/IPv4/ICMP" || packetType === "Ethernet/IPv6/ICMPv6";
}

export function supportsVariableFrameLength(stream: ProfileWorkbenchStream | null | undefined) {
  if (!stream) {
    return false;
  }
  const packetType = stream.packet_type;
  return !(
    stream.vxlan_enabled
    || stream.gtpu_enabled
    || isIcmpPacketType(packetType)
    || packetType.endsWith("/GRE")
    || packetType.endsWith("/SCTP")
  );
}

export function isVariableFrameLengthStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && supportsVariableFrameLength(stream) && stream.frame_length_type !== "Fixed");
}

export function frameLengthOperation(frameLengthType: ProfileWorkbenchStream["frame_length_type"]) {
  if (frameLengthType === "Increment") {
    return "inc";
  }
  if (frameLengthType === "Decrement") {
    return "dec";
  }
  if (frameLengthType === "Random") {
    return "random";
  }
  return "Fixed";
}

export function isIcmpv6NdStream(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && (stream.icmp_type === 135 || stream.icmp_type === 136);
}

export function isIcmpv6RsStream(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && stream.icmp_type === 133;
}

export function isIcmpv6RaStream(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && stream.icmp_type === 134;
}

export function isIcmpv6ControlStream(stream: ProfileWorkbenchStream) {
  return isIcmpv6RsStream(stream) || isIcmpv6RaStream(stream) || isIcmpv6NdStream(stream);
}

export function workbenchMplsLabelCount(stream: ProfileWorkbenchStream) {
  if (!stream.mpls_enabled) {
    return 0;
  }
  return 1 + (stream.mpls_label2_enabled ? 1 : 0) + (stream.mpls_label2_enabled && stream.mpls_label3_enabled ? 1 : 0);
}

export function workbenchVlanHeaderLength(stream: ProfileWorkbenchStream) {
  if (!stream.vlan_enabled) {
    return 0;
  }
  return stream.vlan2_enabled ? 8 : 4;
}

export function icmpv6ControlMinimumFrameLength(stream: ProfileWorkbenchStream, icmpType = stream.icmp_type) {
  const l2HeaderLength = 14 + workbenchVlanHeaderLength(stream) + (workbenchMplsLabelCount(stream) * 4);
  let icmpLength = 8;
  if (icmpType === 133) {
    icmpLength = 8 + (stream.icmpv6_rs_include_slla ? 8 : 0);
  } else if (icmpType === 134) {
    icmpLength = 16 + (stream.icmpv6_ra_include_slla ? 8 : 0) + (stream.icmpv6_ra_include_prefix ? 32 : 0);
  } else if (icmpType === 135 || icmpType === 136) {
    icmpLength = 24 + (stream.icmpv6_nd_include_option ? 8 : 0);
  }
  return Math.max(64, l2HeaderLength + 40 + icmpLength + 4);
}

export type Icmpv6RsProtocolViewModel = {
  includeSllaChecked: boolean;
  sllaMacDisabled: boolean;
  sllaMacValue: string;
};

export function icmpv6RsProtocolViewModel(stream: ProfileWorkbenchStream): Icmpv6RsProtocolViewModel {
  return {
    includeSllaChecked: stream.icmpv6_rs_include_slla,
    sllaMacDisabled: !stream.icmpv6_rs_include_slla,
    sllaMacValue: stream.icmpv6_rs_slla_mac
  };
}

export type Icmpv6NdProtocolViewModel = {
  includeOptionChecked: boolean;
  naFlagsVisible: boolean;
  naOverrideChecked: boolean;
  naRouterChecked: boolean;
  naSolicitedChecked: boolean;
  optionMacDisabled: boolean;
  optionMacValue: string;
  targetValue: string;
};

export function icmpv6NdProtocolViewModel(stream: ProfileWorkbenchStream): Icmpv6NdProtocolViewModel {
  return {
    includeOptionChecked: stream.icmpv6_nd_include_option,
    naFlagsVisible: stream.icmp_type === 136,
    naOverrideChecked: stream.icmpv6_nd_na_override,
    naRouterChecked: stream.icmpv6_nd_na_router,
    naSolicitedChecked: stream.icmpv6_nd_na_solicited,
    optionMacDisabled: !stream.icmpv6_nd_include_option,
    optionMacValue: stream.icmpv6_nd_option_mac,
    targetValue: stream.icmpv6_nd_target
  };
}

export type L4PortControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["l4_src_port_mode"] | ProfileWorkbenchStream["l4_dst_port_mode"];
  modeDisabled: boolean;
  modeOptions: typeof l4PortModes;
  overrideChecked: boolean;
  overrideDisabled: boolean;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export type L4PortProtocolViewModel = {
  destination: L4PortControlViewModel;
  source: L4PortControlViewModel;
};

export function l4PortProtocolViewModel(stream: ProfileWorkbenchStream): L4PortProtocolViewModel {
  const tunnelLocked = stream.vxlan_enabled || stream.gtpu_enabled;
  const sourceDynamic = stream.l4_src_port_mode !== "Fixed";
  const destinationDynamic = stream.l4_dst_port_mode !== "Fixed";
  return {
    destination: {
      countDisabled: tunnelLocked || !stream.l4_dst_port_override || !destinationDynamic,
      countValue: numberValue(stream.l4_dst_port_count),
      mode: stream.l4_dst_port_mode,
      modeDisabled: tunnelLocked || !stream.l4_dst_port_override,
      modeOptions: l4PortModes,
      overrideChecked: stream.l4_dst_port_override,
      overrideDisabled: tunnelLocked,
      stepDisabled: tunnelLocked || !stream.l4_dst_port_override || !destinationDynamic,
      stepValue: numberValue(stream.l4_dst_port_step),
      value: numberValue(stream.l4_dst_port),
      valueDisabled: tunnelLocked || !stream.l4_dst_port_override
    },
    source: {
      countDisabled: tunnelLocked || !stream.l4_src_port_override || !sourceDynamic,
      countValue: numberValue(stream.l4_src_port_count),
      mode: stream.l4_src_port_mode,
      modeDisabled: tunnelLocked || !stream.l4_src_port_override,
      modeOptions: l4PortModes,
      overrideChecked: stream.l4_src_port_override,
      overrideDisabled: tunnelLocked,
      stepDisabled: tunnelLocked || !stream.l4_src_port_override || !sourceDynamic,
      stepValue: numberValue(stream.l4_src_port_step),
      value: numberValue(stream.l4_src_port),
      valueDisabled: tunnelLocked || !stream.l4_src_port_override
    }
  };
}

export type TcpCoreNumberControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_sequence_mode"]
    | ProfileWorkbenchStream["tcp_ack_mode"]
    | ProfileWorkbenchStream["tcp_window_mode"];
  modeOptions: typeof tcpNumberModes | typeof tcpWindowModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type TcpCoreProtocolViewModel = {
  acknowledge: TcpCoreNumberControlViewModel;
  sequence: TcpCoreNumberControlViewModel;
  window: TcpCoreNumberControlViewModel;
};

export function tcpCoreProtocolViewModel(stream: ProfileWorkbenchStream): TcpCoreProtocolViewModel {
  const sequenceDynamic = stream.tcp_sequence_mode !== "Fixed";
  const acknowledgeDynamic = stream.tcp_ack_mode !== "Fixed";
  const windowDynamic = stream.tcp_window_mode !== "Fixed";
  return {
    acknowledge: {
      countDisabled: !acknowledgeDynamic,
      countValue: numberValue(stream.tcp_ack_count),
      mode: stream.tcp_ack_mode,
      modeOptions: tcpNumberModes,
      stepDisabled: !acknowledgeDynamic,
      stepValue: numberValue(stream.tcp_ack_step),
      value: numberValue(stream.tcp_ack_number)
    },
    sequence: {
      countDisabled: !sequenceDynamic,
      countValue: numberValue(stream.tcp_sequence_count),
      mode: stream.tcp_sequence_mode,
      modeOptions: tcpNumberModes,
      stepDisabled: !sequenceDynamic,
      stepValue: numberValue(stream.tcp_sequence_step),
      value: numberValue(stream.tcp_sequence_number)
    },
    window: {
      countDisabled: !windowDynamic,
      countValue: numberValue(stream.tcp_window_count),
      mode: stream.tcp_window_mode,
      modeOptions: tcpWindowModes,
      stepDisabled: !windowDynamic,
      stepValue: numberValue(stream.tcp_window_step),
      value: numberValue(stream.tcp_window)
    }
  };
}

export type TcpChecksumProtocolViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_checksum_mode"];
  modeDisabled: boolean;
  modeOptions: typeof tcpChecksumModes;
  overrideChecked: boolean;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export function tcpChecksumProtocolViewModel(stream: ProfileWorkbenchStream): TcpChecksumProtocolViewModel {
  const dynamic = stream.tcp_checksum_mode !== "Fixed";
  return {
    countDisabled: !stream.tcp_checksum_override || !dynamic,
    countValue: numberValue(stream.tcp_checksum_count),
    mode: stream.tcp_checksum_mode,
    modeDisabled: !stream.tcp_checksum_override,
    modeOptions: tcpChecksumModes,
    overrideChecked: stream.tcp_checksum_override,
    stepDisabled: !stream.tcp_checksum_override || !dynamic,
    stepValue: numberValue(stream.tcp_checksum_step),
    value: stream.tcp_checksum,
    valueDisabled: !stream.tcp_checksum_override
  };
}

export type TcpMssOptionViewModel = {
  countDisabled: boolean;
  countValue: string;
  enabledChecked: boolean;
  mode: ProfileWorkbenchStream["tcp_option_mss_mode"];
  modeDisabled: boolean;
  modeOptions: typeof tcpOptionMssModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export function tcpMssOptionViewModel(stream: ProfileWorkbenchStream): TcpMssOptionViewModel {
  const dynamic = stream.tcp_option_mss_mode !== "Fixed";
  return {
    countDisabled: !stream.tcp_option_mss_enabled || !dynamic,
    countValue: numberValue(stream.tcp_option_mss_count),
    enabledChecked: stream.tcp_option_mss_enabled,
    mode: stream.tcp_option_mss_mode,
    modeDisabled: !stream.tcp_option_mss_enabled,
    modeOptions: tcpOptionMssModes,
    stepDisabled: !stream.tcp_option_mss_enabled || !dynamic,
    stepValue: numberValue(stream.tcp_option_mss_step),
    value: numberValue(stream.tcp_option_mss),
    valueDisabled: !stream.tcp_option_mss_enabled
  };
}

export type TcpWindowScaleOptionViewModel = {
  countDisabled: boolean;
  countValue: string;
  enabledChecked: boolean;
  mode: ProfileWorkbenchStream["tcp_option_window_scale_mode"];
  modeDisabled: boolean;
  modeOptions: typeof tcpOptionWindowScaleModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export function tcpWindowScaleOptionViewModel(stream: ProfileWorkbenchStream): TcpWindowScaleOptionViewModel {
  const dynamic = stream.tcp_option_window_scale_mode !== "Fixed";
  return {
    countDisabled: !stream.tcp_option_window_scale_enabled || !dynamic,
    countValue: numberValue(stream.tcp_option_window_scale_count),
    enabledChecked: stream.tcp_option_window_scale_enabled,
    mode: stream.tcp_option_window_scale_mode,
    modeDisabled: !stream.tcp_option_window_scale_enabled,
    modeOptions: tcpOptionWindowScaleModes,
    stepDisabled: !stream.tcp_option_window_scale_enabled || !dynamic,
    stepValue: numberValue(stream.tcp_option_window_scale_step),
    value: numberValue(stream.tcp_option_window_scale),
    valueDisabled: !stream.tcp_option_window_scale_enabled
  };
}

export type TcpSackEdgeControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"];
  modeDisabled: boolean;
  modeOptions: typeof tcpOptionSackModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export type TcpSackOptionViewModel = {
  blocksChecked: boolean;
  left: TcpSackEdgeControlViewModel;
  permittedChecked: boolean;
  right: TcpSackEdgeControlViewModel;
};

function tcpSackEdgeControlViewModel(
  enabled: boolean,
  value: number,
  mode: ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"],
  count: number,
  step: number
): TcpSackEdgeControlViewModel {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !enabled || !dynamic,
    countValue: numberValue(count),
    mode,
    modeDisabled: !enabled,
    modeOptions: tcpOptionSackModes,
    stepDisabled: !enabled || !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value),
    valueDisabled: !enabled
  };
}

export function tcpSackOptionViewModel(stream: ProfileWorkbenchStream): TcpSackOptionViewModel {
  return {
    blocksChecked: stream.tcp_option_sack_blocks_enabled,
    left: tcpSackEdgeControlViewModel(
      stream.tcp_option_sack_blocks_enabled,
      stream.tcp_option_sack_left_edge,
      stream.tcp_option_sack_left_edge_mode,
      stream.tcp_option_sack_left_edge_count,
      stream.tcp_option_sack_left_edge_step
    ),
    permittedChecked: stream.tcp_option_sack_permitted_enabled,
    right: tcpSackEdgeControlViewModel(
      stream.tcp_option_sack_blocks_enabled,
      stream.tcp_option_sack_right_edge,
      stream.tcp_option_sack_right_edge_mode,
      stream.tcp_option_sack_right_edge_count,
      stream.tcp_option_sack_right_edge_step
    )
  };
}

export type TcpTimestampFieldControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_option_timestamp_value_mode"];
  modeDisabled: boolean;
  modeOptions: typeof tcpOptionTimestampModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export type TcpTimestampOptionViewModel = {
  echo: TcpTimestampFieldControlViewModel;
  enabledChecked: boolean;
  value: TcpTimestampFieldControlViewModel;
};

function tcpTimestampFieldControlViewModel(
  enabled: boolean,
  value: number,
  mode: ProfileWorkbenchStream["tcp_option_timestamp_value_mode"],
  count: number,
  step: number
): TcpTimestampFieldControlViewModel {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !enabled || !dynamic,
    countValue: numberValue(count),
    mode,
    modeDisabled: !enabled,
    modeOptions: tcpOptionTimestampModes,
    stepDisabled: !enabled || !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value),
    valueDisabled: !enabled
  };
}

export function tcpTimestampOptionViewModel(stream: ProfileWorkbenchStream): TcpTimestampOptionViewModel {
  return {
    echo: tcpTimestampFieldControlViewModel(
      stream.tcp_option_timestamp_enabled,
      stream.tcp_option_timestamp_echo,
      stream.tcp_option_timestamp_echo_mode,
      stream.tcp_option_timestamp_echo_count,
      stream.tcp_option_timestamp_echo_step
    ),
    enabledChecked: stream.tcp_option_timestamp_enabled,
    value: tcpTimestampFieldControlViewModel(
      stream.tcp_option_timestamp_enabled,
      stream.tcp_option_timestamp_value,
      stream.tcp_option_timestamp_value_mode,
      stream.tcp_option_timestamp_value_count,
      stream.tcp_option_timestamp_value_step
    )
  };
}

export type TcpUrgentPointerControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_urgent_pointer_mode"];
  modeOptions: typeof tcpUrgentPointerModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type TcpFlagControlViewModel = {
  checked: boolean;
  key: TcpFlagKey;
  label: string;
};

export type TcpFlagsControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["tcp_flags_mode"];
  modeOptions: typeof tcpFlagsModes;
  rows: TcpFlagControlViewModel[];
  stepDisabled: boolean;
  stepValue: string;
};

export type TcpUrgentFlagsProtocolViewModel = {
  flags: TcpFlagsControlViewModel;
  urgentPointer: TcpUrgentPointerControlViewModel;
};

export function tcpUrgentFlagsProtocolViewModel(stream: ProfileWorkbenchStream): TcpUrgentFlagsProtocolViewModel {
  const urgentPointerDynamic = stream.tcp_urgent_pointer_mode !== "Fixed";
  const flagsDynamic = stream.tcp_flags_mode !== "Fixed";
  return {
    flags: {
      countDisabled: !flagsDynamic,
      countValue: numberValue(stream.tcp_flags_count),
      mode: stream.tcp_flags_mode,
      modeOptions: tcpFlagsModes,
      rows: tcpFlagControls.map((flag) => ({
        checked: Boolean(stream[flag.key]),
        key: flag.key,
        label: flag.label
      })),
      stepDisabled: !flagsDynamic,
      stepValue: numberValue(stream.tcp_flags_step)
    },
    urgentPointer: {
      countDisabled: !urgentPointerDynamic,
      countValue: numberValue(stream.tcp_urgent_pointer_count),
      mode: stream.tcp_urgent_pointer_mode,
      modeOptions: tcpUrgentPointerModes,
      stepDisabled: !urgentPointerDynamic,
      stepValue: numberValue(stream.tcp_urgent_pointer_step),
      value: numberValue(stream.tcp_urgent_pointer)
    }
  };
}

export type UdpProtocolViewModel = {
  checksumCountDisabled: boolean;
  checksumCountValue: string;
  checksumMode: ProfileWorkbenchStream["udp_checksum_mode"];
  checksumModeDisabled: boolean;
  checksumModeOptions: typeof udpChecksumModes;
  checksumOverrideChecked: boolean;
  checksumOverrideDisabled: boolean;
  checksumStepDisabled: boolean;
  checksumStepValue: string;
  checksumValue: string;
  checksumValueDisabled: boolean;
  lengthCountDisabled: boolean;
  lengthCountValue: string;
  lengthMode: ProfileWorkbenchStream["udp_length_mode"];
  lengthModeDisabled: boolean;
  lengthModeOptions: typeof udpLengthModes;
  lengthOverrideChecked: boolean;
  lengthOverrideDisabled: boolean;
  lengthStepDisabled: boolean;
  lengthStepValue: string;
  lengthValue: string;
  lengthValueDisabled: boolean;
};

export function udpProtocolViewModel(stream: ProfileWorkbenchStream): UdpProtocolViewModel {
  const tunnelLocked = stream.vxlan_enabled || stream.gtpu_enabled;
  const lengthDynamic = stream.udp_length_mode !== "Fixed";
  const checksumDynamic = stream.udp_checksum_mode !== "Fixed";
  return {
    checksumCountDisabled: tunnelLocked || !stream.udp_checksum_override || !checksumDynamic,
    checksumCountValue: numberValue(stream.udp_checksum_count),
    checksumMode: stream.udp_checksum_mode,
    checksumModeDisabled: tunnelLocked || !stream.udp_checksum_override,
    checksumModeOptions: udpChecksumModes,
    checksumOverrideChecked: stream.udp_checksum_override,
    checksumOverrideDisabled: stream.gtpu_enabled,
    checksumStepDisabled: tunnelLocked || !stream.udp_checksum_override || !checksumDynamic,
    checksumStepValue: numberValue(stream.udp_checksum_step),
    checksumValue: stream.udp_checksum,
    checksumValueDisabled: tunnelLocked || !stream.udp_checksum_override,
    lengthCountDisabled: tunnelLocked || !stream.udp_length_override || !lengthDynamic,
    lengthCountValue: numberValue(stream.udp_length_count),
    lengthMode: stream.udp_length_mode,
    lengthModeDisabled: tunnelLocked || !stream.udp_length_override,
    lengthModeOptions: udpLengthModes,
    lengthOverrideChecked: stream.udp_length_override,
    lengthOverrideDisabled: tunnelLocked,
    lengthStepDisabled: tunnelLocked || !stream.udp_length_override || !lengthDynamic,
    lengthStepValue: numberValue(stream.udp_length_step),
    lengthValue: numberValue(stream.udp_length),
    lengthValueDisabled: tunnelLocked || !stream.udp_length_override
  };
}

type DnsMode =
  | ProfileWorkbenchStream["dns_answer_ipv4_mode"]
  | ProfileWorkbenchStream["dns_answer_ttl_mode"]
  | ProfileWorkbenchStream["dns_flags_mode"]
  | ProfileWorkbenchStream["dns_query_class_mode"]
  | ProfileWorkbenchStream["dns_query_type_mode"]
  | ProfileWorkbenchStream["dns_transaction_id_mode"];

export type DnsFieldControlViewModel<TMode extends DnsMode, TOptions extends readonly TMode[]> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeDisabled: boolean;
  modeOptions: TOptions;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export type DnsProtocolViewModel = {
  answerEnabledChecked: boolean;
  answerEnabledDisabled: boolean;
  answerIpv4: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_answer_ipv4_mode"], typeof dnsAnswerIpv4Modes>;
  answerTtl: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_answer_ttl_mode"], typeof dnsAnswerTtlModes>;
  flags: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_flags_mode"], typeof dnsFlagsModes>;
  queryClass: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_query_class_mode"], typeof dnsQueryClassModes>;
  queryEnabledChecked: boolean;
  queryEnabledDisabled: boolean;
  queryNameDisabled: boolean;
  queryNameValue: string;
  queryType: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_query_type_mode"], typeof dnsQueryTypeModes>;
  transactionId: DnsFieldControlViewModel<ProfileWorkbenchStream["dns_transaction_id_mode"], typeof dnsTransactionIdModes>;
};

function dnsFieldControlViewModel<TMode extends DnsMode, TOptions extends readonly TMode[]>(
  value: string,
  mode: TMode,
  modeOptions: TOptions,
  count: number,
  step: number,
  enabled: boolean
): DnsFieldControlViewModel<TMode, TOptions> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !enabled || !dynamic,
    countValue: numberValue(count),
    mode,
    modeDisabled: !enabled,
    modeOptions,
    stepDisabled: !enabled || !dynamic,
    stepValue: numberValue(step),
    value,
    valueDisabled: !enabled
  };
}

export function dnsProtocolViewModel(stream: ProfileWorkbenchStream): DnsProtocolViewModel {
  const queryEnabled = stream.dns_enabled;
  const answerEnabled = queryEnabled && stream.dns_answer_enabled;
  return {
    answerEnabledChecked: stream.dns_answer_enabled,
    answerEnabledDisabled: !queryEnabled,
    answerIpv4: dnsFieldControlViewModel(
      stream.dns_answer_ipv4,
      stream.dns_answer_ipv4_mode,
      dnsAnswerIpv4Modes,
      stream.dns_answer_ipv4_count,
      stream.dns_answer_ipv4_step,
      answerEnabled
    ),
    answerTtl: dnsFieldControlViewModel(
      numberValue(stream.dns_answer_ttl),
      stream.dns_answer_ttl_mode,
      dnsAnswerTtlModes,
      stream.dns_answer_ttl_count,
      stream.dns_answer_ttl_step,
      answerEnabled
    ),
    flags: dnsFieldControlViewModel(
      stream.dns_flags,
      stream.dns_flags_mode,
      dnsFlagsModes,
      stream.dns_flags_count,
      stream.dns_flags_step,
      queryEnabled
    ),
    queryClass: dnsFieldControlViewModel(
      numberValue(stream.dns_query_class),
      stream.dns_query_class_mode,
      dnsQueryClassModes,
      stream.dns_query_class_count,
      stream.dns_query_class_step,
      queryEnabled
    ),
    queryEnabledChecked: queryEnabled,
    queryEnabledDisabled: stream.vxlan_enabled || stream.gtpu_enabled || stream.dhcp_enabled,
    queryNameDisabled: !queryEnabled,
    queryNameValue: stream.dns_query_name,
    queryType: dnsFieldControlViewModel(
      numberValue(stream.dns_query_type),
      stream.dns_query_type_mode,
      dnsQueryTypeModes,
      stream.dns_query_type_count,
      stream.dns_query_type_step,
      queryEnabled
    ),
    transactionId: dnsFieldControlViewModel(
      numberValue(stream.dns_transaction_id),
      stream.dns_transaction_id_mode,
      dnsTransactionIdModes,
      stream.dns_transaction_id_count,
      stream.dns_transaction_id_step,
      queryEnabled
    )
  };
}

export type DhcpFieldControlViewModel<TMode extends string, TOptions extends readonly string[]> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeDisabled: boolean;
  modeOptions: TOptions;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
  valueDisabled: boolean;
};

export type DhcpProtocolViewModel = {
  clientIp: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_client_ip_mode"], typeof dhcpBootpIpModes>;
  clientMac: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_client_mac_mode"], typeof dhcpClientMacModes>;
  flags: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_flags_mode"], typeof dhcpFlagsModes>;
  hostnameDisabled: boolean;
  hostnameValue: string;
  hops: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_hops_mode"], typeof dhcpByteModes>;
  leaseTime: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_lease_time_mode"], typeof dhcpTimerModes>;
  messageEnabledChecked: boolean;
  messageEnabledDisabled: boolean;
  messageType: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_message_type_mode"], typeof dhcpMessageTypeModes>;
  operation: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_operation_mode"], typeof dhcpOperationModes>;
  parameterRequestListDisabled: boolean;
  parameterRequestListValue: string;
  rebindingTime: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_rebinding_time_mode"], typeof dhcpTimerModes>;
  relayIp: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_relay_ip_mode"], typeof dhcpBootpIpModes>;
  renewalTime: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_renewal_time_mode"], typeof dhcpTimerModes>;
  requestedIp: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_requested_ip_mode"], typeof ipv4AddressModes>;
  seconds: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_seconds_mode"], typeof dhcpSecondsModes>;
  serverId: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_server_id_mode"], typeof ipv4AddressModes>;
  serverIp: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_server_ip_mode"], typeof dhcpBootpIpModes>;
  xid: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_xid_mode"], typeof dhcpXidModes>;
  yourIp: DhcpFieldControlViewModel<ProfileWorkbenchStream["dhcp_your_ip_mode"], typeof dhcpBootpIpModes>;
};

function dhcpFieldControlViewModel<TMode extends string, TOptions extends readonly string[]>(
  value: string,
  mode: TMode,
  modeOptions: TOptions,
  count: number,
  step: number,
  enabled: boolean,
  dynamicControlsEnabled = enabled
): DhcpFieldControlViewModel<TMode, TOptions> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamicControlsEnabled || !dynamic,
    countValue: numberValue(count),
    mode,
    modeDisabled: !dynamicControlsEnabled,
    modeOptions,
    stepDisabled: !dynamicControlsEnabled || !dynamic,
    stepValue: numberValue(step),
    value,
    valueDisabled: !enabled
  };
}

export function dhcpProtocolViewModel(stream: ProfileWorkbenchStream): DhcpProtocolViewModel {
  const enabled = stream.dhcp_enabled;
  return {
    clientIp: dhcpFieldControlViewModel(
      stream.dhcp_client_ip,
      stream.dhcp_client_ip_mode,
      dhcpBootpIpModes,
      stream.dhcp_client_ip_count,
      stream.dhcp_client_ip_step,
      enabled
    ),
    clientMac: dhcpFieldControlViewModel(
      stream.dhcp_client_mac,
      stream.dhcp_client_mac_mode,
      dhcpClientMacModes,
      stream.dhcp_client_mac_count,
      stream.dhcp_client_mac_step,
      enabled
    ),
    flags: dhcpFieldControlViewModel(
      stream.dhcp_flags,
      stream.dhcp_flags_mode,
      dhcpFlagsModes,
      stream.dhcp_flags_count,
      stream.dhcp_flags_step,
      enabled
    ),
    hostnameDisabled: !enabled,
    hostnameValue: stream.dhcp_hostname,
    hops: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_hops),
      stream.dhcp_hops_mode,
      dhcpByteModes,
      stream.dhcp_hops_count,
      stream.dhcp_hops_step,
      enabled
    ),
    leaseTime: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_lease_time),
      stream.dhcp_lease_time_mode,
      dhcpTimerModes,
      stream.dhcp_lease_time_count,
      stream.dhcp_lease_time_step,
      enabled,
      enabled && stream.dhcp_lease_time !== 0
    ),
    messageEnabledChecked: enabled,
    messageEnabledDisabled:
      stream.packet_type !== "Ethernet/IPv4/UDP"
      || stream.vxlan_enabled
      || stream.gtpu_enabled
      || stream.dns_enabled,
    messageType: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_message_type),
      stream.dhcp_message_type_mode,
      dhcpMessageTypeModes,
      stream.dhcp_message_type_count,
      stream.dhcp_message_type_step,
      enabled
    ),
    operation: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_operation),
      stream.dhcp_operation_mode,
      dhcpOperationModes,
      stream.dhcp_operation_count,
      stream.dhcp_operation_step,
      enabled
    ),
    parameterRequestListDisabled: !enabled,
    parameterRequestListValue: stream.dhcp_parameter_request_list,
    rebindingTime: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_rebinding_time),
      stream.dhcp_rebinding_time_mode,
      dhcpTimerModes,
      stream.dhcp_rebinding_time_count,
      stream.dhcp_rebinding_time_step,
      enabled,
      enabled && stream.dhcp_rebinding_time !== 0
    ),
    relayIp: dhcpFieldControlViewModel(
      stream.dhcp_relay_ip,
      stream.dhcp_relay_ip_mode,
      dhcpBootpIpModes,
      stream.dhcp_relay_ip_count,
      stream.dhcp_relay_ip_step,
      enabled
    ),
    renewalTime: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_renewal_time),
      stream.dhcp_renewal_time_mode,
      dhcpTimerModes,
      stream.dhcp_renewal_time_count,
      stream.dhcp_renewal_time_step,
      enabled,
      enabled && stream.dhcp_renewal_time !== 0
    ),
    requestedIp: dhcpFieldControlViewModel(
      stream.dhcp_requested_ip,
      stream.dhcp_requested_ip_mode,
      ipv4AddressModes,
      stream.dhcp_requested_ip_count,
      stream.dhcp_requested_ip_step,
      enabled
    ),
    seconds: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_seconds),
      stream.dhcp_seconds_mode,
      dhcpSecondsModes,
      stream.dhcp_seconds_count,
      stream.dhcp_seconds_step,
      enabled
    ),
    serverId: dhcpFieldControlViewModel(
      stream.dhcp_server_id,
      stream.dhcp_server_id_mode,
      ipv4AddressModes,
      stream.dhcp_server_id_count,
      stream.dhcp_server_id_step,
      enabled
    ),
    serverIp: dhcpFieldControlViewModel(
      stream.dhcp_server_ip,
      stream.dhcp_server_ip_mode,
      dhcpBootpIpModes,
      stream.dhcp_server_ip_count,
      stream.dhcp_server_ip_step,
      enabled
    ),
    xid: dhcpFieldControlViewModel(
      numberValue(stream.dhcp_xid),
      stream.dhcp_xid_mode,
      dhcpXidModes,
      stream.dhcp_xid_count,
      stream.dhcp_xid_step,
      enabled
    ),
    yourIp: dhcpFieldControlViewModel(
      stream.dhcp_your_ip,
      stream.dhcp_your_ip_mode,
      dhcpBootpIpModes,
      stream.dhcp_your_ip_count,
      stream.dhcp_your_ip_step,
      enabled
    )
  };
}

type SctpNumberMode =
  | ProfileWorkbenchStream["sctp_data_flags_mode"]
  | ProfileWorkbenchStream["sctp_payload_protocol_id_mode"]
  | ProfileWorkbenchStream["sctp_stream_id_mode"]
  | ProfileWorkbenchStream["sctp_stream_sequence_mode"]
  | ProfileWorkbenchStream["sctp_tsn_mode"]
  | ProfileWorkbenchStream["sctp_verification_tag_mode"];

export type SctpNumberControlViewModel<TMode extends SctpNumberMode> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeOptions: typeof sctpNumberModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type SctpProtocolViewModel = {
  checksumLocked: boolean;
  checksumOverrideChecked: boolean;
  checksumOverrideDisabled: boolean;
  checksumValue: string;
  checksumValueDisabled: boolean;
  dataFlags: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_data_flags_mode"]>;
  payloadProtocolId: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_payload_protocol_id_mode"]>;
  streamId: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_stream_id_mode"]>;
  streamSequence: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_stream_sequence_mode"]>;
  tsn: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_tsn_mode"]>;
  verificationTag: SctpNumberControlViewModel<ProfileWorkbenchStream["sctp_verification_tag_mode"]>;
};

function sctpNumberControlViewModel<TMode extends SctpNumberMode>(
  value: number,
  mode: TMode,
  count: number,
  step: number
): SctpNumberControlViewModel<TMode> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamic,
    countValue: numberValue(count),
    mode,
    modeOptions: sctpNumberModes,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value)
  };
}

export function sctpProtocolViewModel(stream: ProfileWorkbenchStream): SctpProtocolViewModel {
  const checksumLocked = isSctpChecksumLocked(stream);
  return {
    checksumLocked,
    checksumOverrideChecked: stream.sctp_checksum_override,
    checksumOverrideDisabled: checksumLocked,
    checksumValue: stream.sctp_checksum,
    checksumValueDisabled: !stream.sctp_checksum_override || checksumLocked,
    dataFlags: sctpNumberControlViewModel(
      stream.sctp_data_flags,
      stream.sctp_data_flags_mode,
      stream.sctp_data_flags_count,
      stream.sctp_data_flags_step
    ),
    payloadProtocolId: sctpNumberControlViewModel(
      stream.sctp_payload_protocol_id,
      stream.sctp_payload_protocol_id_mode,
      stream.sctp_payload_protocol_id_count,
      stream.sctp_payload_protocol_id_step
    ),
    streamId: sctpNumberControlViewModel(
      stream.sctp_stream_id,
      stream.sctp_stream_id_mode,
      stream.sctp_stream_id_count,
      stream.sctp_stream_id_step
    ),
    streamSequence: sctpNumberControlViewModel(
      stream.sctp_stream_sequence,
      stream.sctp_stream_sequence_mode,
      stream.sctp_stream_sequence_count,
      stream.sctp_stream_sequence_step
    ),
    tsn: sctpNumberControlViewModel(
      stream.sctp_tsn,
      stream.sctp_tsn_mode,
      stream.sctp_tsn_count,
      stream.sctp_tsn_step
    ),
    verificationTag: sctpNumberControlViewModel(
      stream.sctp_verification_tag,
      stream.sctp_verification_tag_mode,
      stream.sctp_verification_tag_count,
      stream.sctp_verification_tag_step
    )
  };
}

export type EthernetAddressControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["ether_dst_mode"] | ProfileWorkbenchStream["ether_src_mode"];
  modeOptions: typeof macAddressModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type EthernetProtocolViewModel = {
  destination: EthernetAddressControlViewModel;
  source: EthernetAddressControlViewModel;
};

function ethernetAddressControlViewModel(
  value: string,
  mode: ProfileWorkbenchStream["ether_dst_mode"] | ProfileWorkbenchStream["ether_src_mode"],
  count: number,
  step: number
): EthernetAddressControlViewModel {
  const dynamic = mode !== "Fixed" && mode !== "TRex Config";
  return {
    countDisabled: !dynamic,
    countValue: numberValue(count),
    mode,
    modeOptions: macAddressModes,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value
  };
}

export function ethernetProtocolViewModel(stream: ProfileWorkbenchStream): EthernetProtocolViewModel {
  return {
    destination: ethernetAddressControlViewModel(
      stream.ether_dst,
      stream.ether_dst_mode,
      stream.ether_dst_count,
      stream.ether_dst_step
    ),
    source: ethernetAddressControlViewModel(
      stream.ether_src,
      stream.ether_src_mode,
      stream.ether_src_count,
      stream.ether_src_step
    )
  };
}

export type Ipv4AddressControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["ipv4_dst_mode"] | ProfileWorkbenchStream["ipv4_src_mode"];
  modeOptions: typeof ipv4AddressModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type Ipv4AddressProtocolViewModel = {
  destination: Ipv4AddressControlViewModel;
  source: Ipv4AddressControlViewModel;
};

function ipv4AddressControlViewModel(
  value: string,
  mode: ProfileWorkbenchStream["ipv4_dst_mode"] | ProfileWorkbenchStream["ipv4_src_mode"],
  count: number | string,
  step: number
): Ipv4AddressControlViewModel {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamic,
    countValue: largeUnitCountValue(count),
    mode,
    modeOptions: ipv4AddressModes,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value
  };
}

export function ipv4AddressProtocolViewModel(stream: ProfileWorkbenchStream): Ipv4AddressProtocolViewModel {
  return {
    destination: ipv4AddressControlViewModel(
      stream.ipv4_dst,
      stream.ipv4_dst_mode,
      stream.ipv4_dst_count,
      stream.ipv4_dst_step
    ),
    source: ipv4AddressControlViewModel(
      stream.ipv4_src,
      stream.ipv4_src_mode,
      stream.ipv4_src_count,
      stream.ipv4_src_step
    )
  };
}

type Ipv4ScalarMode =
  | ProfileWorkbenchStream["ipv4_dscp_mode"]
  | ProfileWorkbenchStream["ipv4_ecn_mode"]
  | ProfileWorkbenchStream["ipv4_fragment_offset_mode"]
  | ProfileWorkbenchStream["ipv4_id_mode"]
  | ProfileWorkbenchStream["ipv4_ttl_mode"];

export type Ipv4ScalarControlViewModel<TMode extends Ipv4ScalarMode, TOptions extends readonly TMode[]> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeOptions: TOptions;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type Ipv4ScalarProtocolViewModel = {
  dscp: Ipv4ScalarControlViewModel<ProfileWorkbenchStream["ipv4_dscp_mode"], typeof ipv4DscpModes>;
  ecn: Ipv4ScalarControlViewModel<ProfileWorkbenchStream["ipv4_ecn_mode"], typeof ipv4EcnModes>;
  fragmentOffset: Ipv4ScalarControlViewModel<
    ProfileWorkbenchStream["ipv4_fragment_offset_mode"],
    typeof ipv4FragmentOffsetModes
  >;
  identification: Ipv4ScalarControlViewModel<ProfileWorkbenchStream["ipv4_id_mode"], typeof ipv4IdModes>;
  ttl: Ipv4ScalarControlViewModel<ProfileWorkbenchStream["ipv4_ttl_mode"], typeof ipv4TtlModes>;
};

function ipv4ScalarControlViewModel<TMode extends Ipv4ScalarMode, TOptions extends readonly TMode[]>(
  value: number,
  mode: TMode,
  modeOptions: TOptions,
  count: number,
  step: number
): Ipv4ScalarControlViewModel<TMode, TOptions> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamic,
    countValue: numberValue(count),
    mode,
    modeOptions,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value)
  };
}

export function ipv4ScalarProtocolViewModel(stream: ProfileWorkbenchStream): Ipv4ScalarProtocolViewModel {
  return {
    dscp: ipv4ScalarControlViewModel(
      stream.ipv4_dscp,
      stream.ipv4_dscp_mode,
      ipv4DscpModes,
      stream.ipv4_dscp_count,
      stream.ipv4_dscp_step
    ),
    ecn: ipv4ScalarControlViewModel(
      stream.ipv4_ecn,
      stream.ipv4_ecn_mode,
      ipv4EcnModes,
      stream.ipv4_ecn_count,
      stream.ipv4_ecn_step
    ),
    fragmentOffset: ipv4ScalarControlViewModel(
      stream.ipv4_fragment_offset,
      stream.ipv4_fragment_offset_mode,
      ipv4FragmentOffsetModes,
      stream.ipv4_fragment_offset_count,
      stream.ipv4_fragment_offset_step
    ),
    identification: ipv4ScalarControlViewModel(
      stream.ipv4_id,
      stream.ipv4_id_mode,
      ipv4IdModes,
      stream.ipv4_id_count,
      stream.ipv4_id_step
    ),
    ttl: ipv4ScalarControlViewModel(
      stream.ipv4_ttl,
      stream.ipv4_ttl_mode,
      ipv4TtlModes,
      stream.ipv4_ttl_count,
      stream.ipv4_ttl_step
    )
  };
}

export type Ipv4FlagsChecksumProtocolViewModel = {
  checksumDisabled: boolean;
  checksumOverrideChecked: boolean;
  checksumValue: string;
  dontFragmentChecked: boolean;
  moreFragmentsChecked: boolean;
};

export function ipv4FlagsChecksumProtocolViewModel(
  stream: ProfileWorkbenchStream
): Ipv4FlagsChecksumProtocolViewModel {
  return {
    checksumDisabled: !stream.ipv4_checksum_override,
    checksumOverrideChecked: stream.ipv4_checksum_override,
    checksumValue: stream.ipv4_checksum,
    dontFragmentChecked: stream.ipv4_flag_df,
    moreFragmentsChecked: stream.ipv4_flag_mf
  };
}

type IcmpMode =
  | ProfileWorkbenchStream["icmp_code_mode"]
  | ProfileWorkbenchStream["icmp_identifier_mode"]
  | ProfileWorkbenchStream["icmp_sequence_mode"]
  | ProfileWorkbenchStream["icmp_type_mode"];

export type IcmpControlViewModel<TMode extends IcmpMode, TOptions extends readonly TMode[]> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeDisabled: boolean;
  modeOptions: TOptions;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type IcmpProtocolViewModel = {
  checksumOverrideChecked: boolean;
  checksumOverrideDisabled: boolean;
  checksumValue: string;
  checksumValueDisabled: boolean;
  code: IcmpControlViewModel<ProfileWorkbenchStream["icmp_code_mode"], typeof icmpCodeModes>;
  identifier: IcmpControlViewModel<ProfileWorkbenchStream["icmp_identifier_mode"], typeof icmpNumberModes>;
  sequence: IcmpControlViewModel<ProfileWorkbenchStream["icmp_sequence_mode"], typeof icmpNumberModes>;
  type: IcmpControlViewModel<ProfileWorkbenchStream["icmp_type_mode"], typeof icmpTypeModes>;
};

export type IcmpProtocolViewModelOptions = {
  echoEnabled: boolean;
  v6EchoEnabled: boolean;
};

function icmpControlViewModel<TMode extends IcmpMode, TOptions extends readonly TMode[]>(
  value: number,
  mode: TMode,
  modeOptions: TOptions,
  count: number,
  step: number,
  enabled: boolean
): IcmpControlViewModel<TMode, TOptions> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !enabled || !dynamic,
    countValue: numberValue(count),
    mode,
    modeDisabled: !enabled,
    modeOptions,
    stepDisabled: !enabled || !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value)
  };
}

export function icmpProtocolViewModel(
  stream: ProfileWorkbenchStream,
  options: IcmpProtocolViewModelOptions
): IcmpProtocolViewModel {
  const checksumLocked = stream.icmp_type_mode !== "Fixed"
    || stream.icmp_code_mode !== "Fixed"
    || stream.icmp_identifier_mode !== "Fixed"
    || stream.icmp_sequence_mode !== "Fixed";
  return {
    checksumOverrideChecked: stream.icmp_checksum_override,
    checksumOverrideDisabled: checksumLocked,
    checksumValue: stream.icmp_checksum,
    checksumValueDisabled: !stream.icmp_checksum_override || checksumLocked,
    code: icmpControlViewModel(
      stream.icmp_code,
      stream.icmp_code_mode,
      icmpCodeModes,
      stream.icmp_code_count,
      stream.icmp_code_step,
      options.v6EchoEnabled
    ),
    identifier: icmpControlViewModel(
      stream.icmp_identifier,
      stream.icmp_identifier_mode,
      icmpNumberModes,
      stream.icmp_identifier_count,
      stream.icmp_identifier_step,
      options.echoEnabled
    ),
    sequence: icmpControlViewModel(
      stream.icmp_sequence,
      stream.icmp_sequence_mode,
      icmpNumberModes,
      stream.icmp_sequence_count,
      stream.icmp_sequence_step,
      options.echoEnabled
    ),
    type: icmpControlViewModel(
      stream.icmp_type,
      stream.icmp_type_mode,
      icmpTypeModes,
      stream.icmp_type_count,
      stream.icmp_type_step,
      options.v6EchoEnabled
    )
  };
}

export type Icmpv6RaProtocolViewModel = {
  currentHopLimitValue: string;
  includePrefixChecked: boolean;
  includeSllaChecked: boolean;
  managedChecked: boolean;
  otherChecked: boolean;
  prefixAutonomousChecked: boolean;
  prefixAutonomousDisabled: boolean;
  prefixDisabled: boolean;
  prefixLengthDisabled: boolean;
  prefixLengthValue: string;
  prefixOnLinkChecked: boolean;
  prefixOnLinkDisabled: boolean;
  prefixPreferredLifetimeDisabled: boolean;
  prefixPreferredLifetimeValue: string;
  prefixValidLifetimeDisabled: boolean;
  prefixValidLifetimeValue: string;
  prefixValue: string;
  reachableTimeValue: string;
  retransTimerValue: string;
  routerLifetimeValue: string;
  sllaMacDisabled: boolean;
  sllaMacValue: string;
};

export function icmpv6RaProtocolViewModel(stream: ProfileWorkbenchStream): Icmpv6RaProtocolViewModel {
  const prefixDisabled = !stream.icmpv6_ra_include_prefix;
  return {
    currentHopLimitValue: numberValue(stream.icmpv6_ra_cur_hop_limit),
    includePrefixChecked: stream.icmpv6_ra_include_prefix,
    includeSllaChecked: stream.icmpv6_ra_include_slla,
    managedChecked: stream.icmpv6_ra_managed,
    otherChecked: stream.icmpv6_ra_other,
    prefixAutonomousChecked: stream.icmpv6_ra_prefix_autonomous,
    prefixAutonomousDisabled: prefixDisabled,
    prefixDisabled,
    prefixLengthDisabled: prefixDisabled,
    prefixLengthValue: numberValue(stream.icmpv6_ra_prefix_length),
    prefixOnLinkChecked: stream.icmpv6_ra_prefix_on_link,
    prefixOnLinkDisabled: prefixDisabled,
    prefixPreferredLifetimeDisabled: prefixDisabled,
    prefixPreferredLifetimeValue: numberValue(stream.icmpv6_ra_prefix_preferred_lifetime),
    prefixValidLifetimeDisabled: prefixDisabled,
    prefixValidLifetimeValue: numberValue(stream.icmpv6_ra_prefix_valid_lifetime),
    prefixValue: stream.icmpv6_ra_prefix,
    reachableTimeValue: numberValue(stream.icmpv6_ra_reachable_time),
    retransTimerValue: numberValue(stream.icmpv6_ra_retrans_timer),
    routerLifetimeValue: numberValue(stream.icmpv6_ra_router_lifetime),
    sllaMacDisabled: !stream.icmpv6_ra_include_slla,
    sllaMacValue: stream.icmpv6_ra_slla_mac
  };
}

export type Ipv6AddressControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["ipv6_dst_mode"] | ProfileWorkbenchStream["ipv6_src_mode"];
  modeOptions: typeof ipv6AddressModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type Ipv6AddressProtocolViewModel = {
  destination: Ipv6AddressControlViewModel;
  source: Ipv6AddressControlViewModel;
};

function ipv6AddressControlViewModel(
  value: string,
  mode: ProfileWorkbenchStream["ipv6_dst_mode"] | ProfileWorkbenchStream["ipv6_src_mode"],
  count: number,
  step: number
): Ipv6AddressControlViewModel {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamic,
    countValue: numberValue(count),
    mode,
    modeOptions: ipv6AddressModes,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value
  };
}

export function ipv6AddressProtocolViewModel(stream: ProfileWorkbenchStream): Ipv6AddressProtocolViewModel {
  return {
    destination: ipv6AddressControlViewModel(
      stream.ipv6_dst,
      stream.ipv6_dst_mode,
      stream.ipv6_dst_count,
      stream.ipv6_dst_step
    ),
    source: ipv6AddressControlViewModel(
      stream.ipv6_src,
      stream.ipv6_src_mode,
      stream.ipv6_src_count,
      stream.ipv6_src_step
    )
  };
}

type Ipv6ScalarMode =
  | ProfileWorkbenchStream["ipv6_traffic_class_mode"]
  | ProfileWorkbenchStream["ipv6_flow_label_mode"]
  | ProfileWorkbenchStream["ipv6_hop_limit_mode"];

export type Ipv6ScalarControlViewModel<TMode extends Ipv6ScalarMode, TOptions extends readonly TMode[]> = {
  countDisabled: boolean;
  countValue: string;
  mode: TMode;
  modeOptions: TOptions;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type Ipv6ScalarProtocolViewModel = {
  flowLabel: Ipv6ScalarControlViewModel<ProfileWorkbenchStream["ipv6_flow_label_mode"], typeof ipv6FlowLabelModes>;
  hopLimit: Ipv6ScalarControlViewModel<ProfileWorkbenchStream["ipv6_hop_limit_mode"], typeof ipv6HopLimitModes>;
  trafficClass: Ipv6ScalarControlViewModel<
    ProfileWorkbenchStream["ipv6_traffic_class_mode"],
    typeof ipv6TrafficClassModes
  >;
};

function ipv6ScalarControlViewModel<TMode extends Ipv6ScalarMode, TOptions extends readonly TMode[]>(
  value: number,
  mode: TMode,
  modeOptions: TOptions,
  count: number,
  step: number
): Ipv6ScalarControlViewModel<TMode, TOptions> {
  const dynamic = mode !== "Fixed";
  return {
    countDisabled: !dynamic,
    countValue: numberValue(count),
    mode,
    modeOptions,
    stepDisabled: !dynamic,
    stepValue: numberValue(step),
    value: numberValue(value)
  };
}

export function ipv6ScalarProtocolViewModel(stream: ProfileWorkbenchStream): Ipv6ScalarProtocolViewModel {
  return {
    flowLabel: ipv6ScalarControlViewModel(
      stream.ipv6_flow_label,
      stream.ipv6_flow_label_mode,
      ipv6FlowLabelModes,
      stream.ipv6_flow_label_count,
      stream.ipv6_flow_label_step
    ),
    hopLimit: ipv6ScalarControlViewModel(
      stream.ipv6_hop_limit,
      stream.ipv6_hop_limit_mode,
      ipv6HopLimitModes,
      stream.ipv6_hop_limit_count,
      stream.ipv6_hop_limit_step
    ),
    trafficClass: ipv6ScalarControlViewModel(
      stream.ipv6_traffic_class,
      stream.ipv6_traffic_class_mode,
      ipv6TrafficClassModes,
      stream.ipv6_traffic_class_count,
      stream.ipv6_traffic_class_step
    )
  };
}

export type ArpOperationControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["arp_operation_mode"];
  modeOptions: typeof arpOperationModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type ArpAddressControlViewModel = {
  countDisabled: boolean;
  countValue: string;
  mode: ProfileWorkbenchStream["arp_sender_mac_mode"]
    | ProfileWorkbenchStream["arp_sender_ip_mode"]
    | ProfileWorkbenchStream["arp_target_mac_mode"]
    | ProfileWorkbenchStream["arp_target_ip_mode"];
  modeOptions: typeof arpMacModes | typeof ipv4AddressModes;
  stepDisabled: boolean;
  stepValue: string;
  value: string;
};

export type ArpProtocolViewModel = {
  hardwareSizeValue: string;
  hardwareTypeValue: string;
  operation: ArpOperationControlViewModel;
  protocolSizeValue: string;
  protocolTypeValue: string;
  senderIp: ArpAddressControlViewModel;
  senderMac: ArpAddressControlViewModel;
  targetIp: ArpAddressControlViewModel;
  targetMac: ArpAddressControlViewModel;
};

export function arpProtocolViewModel(stream: ProfileWorkbenchStream): ArpProtocolViewModel {
  const operationDynamic = stream.arp_operation_mode !== "Fixed";
  const senderMacDynamic = stream.arp_sender_mac_mode !== "Fixed";
  const senderIpDynamic = stream.arp_sender_ip_mode !== "Fixed";
  const targetMacDynamic = stream.arp_target_mac_mode !== "Fixed";
  const targetIpDynamic = stream.arp_target_ip_mode !== "Fixed";
  return {
    hardwareSizeValue: numberValue(stream.arp_hardware_size),
    hardwareTypeValue: numberValue(stream.arp_hardware_type),
    operation: {
      countDisabled: !operationDynamic,
      countValue: numberValue(stream.arp_operation_count),
      mode: stream.arp_operation_mode,
      modeOptions: arpOperationModes,
      stepDisabled: !operationDynamic,
      stepValue: numberValue(stream.arp_operation_step),
      value: numberValue(stream.arp_operation)
    },
    protocolSizeValue: numberValue(stream.arp_protocol_size),
    protocolTypeValue: stream.arp_protocol_type,
    senderIp: {
      countDisabled: !senderIpDynamic,
      countValue: numberValue(stream.arp_sender_ip_count),
      mode: stream.arp_sender_ip_mode,
      modeOptions: ipv4AddressModes,
      stepDisabled: !senderIpDynamic,
      stepValue: numberValue(stream.arp_sender_ip_step),
      value: stream.arp_sender_ip
    },
    senderMac: {
      countDisabled: !senderMacDynamic,
      countValue: numberValue(stream.arp_sender_mac_count),
      mode: stream.arp_sender_mac_mode,
      modeOptions: arpMacModes,
      stepDisabled: !senderMacDynamic,
      stepValue: numberValue(stream.arp_sender_mac_step),
      value: stream.arp_sender_mac
    },
    targetIp: {
      countDisabled: !targetIpDynamic,
      countValue: numberValue(stream.arp_target_ip_count),
      mode: stream.arp_target_ip_mode,
      modeOptions: ipv4AddressModes,
      stepDisabled: !targetIpDynamic,
      stepValue: numberValue(stream.arp_target_ip_step),
      value: stream.arp_target_ip
    },
    targetMac: {
      countDisabled: !targetMacDynamic,
      countValue: numberValue(stream.arp_target_mac_count),
      mode: stream.arp_target_mac_mode,
      modeOptions: arpMacModes,
      stepDisabled: !targetMacDynamic,
      stepValue: numberValue(stream.arp_target_mac_step),
      value: stream.arp_target_mac
    }
  };
}

export function ipEtherTypeText(packetType: ProfileWorkbenchStream["packet_type"]) {
  if (packetType === "Ethernet/ARP") {
    return "0806";
  }
  if (ipVersionName(packetType) === "None") {
    return "FFFF";
  }
  return ipVersionName(packetType) === "IPv6" ? "86DD" : "0800";
}

export function mediaAccessTypeText(stream: ProfileWorkbenchStream) {
  if (stream.ether_type_override) {
    return stream.ether_type;
  }
  if (stream.vlan_enabled) {
    return stream.vlan_tpid_override ? stream.vlan_tpid : "8100";
  }
  return stream.mpls_enabled ? "8847" : ipEtherTypeText(stream.packet_type);
}

export type MediaAccessProtocolViewModel = {
  etherTypeOverrideChecked: boolean;
  etherTypeValue: string;
  typeValueDisabled: boolean;
};

export function mediaAccessProtocolViewModel(stream: ProfileWorkbenchStream): MediaAccessProtocolViewModel {
  return {
    etherTypeOverrideChecked: stream.ether_type_override,
    etherTypeValue: mediaAccessTypeText(stream),
    typeValueDisabled: !stream.ether_type_override
  };
}

export function vlanPayloadTypeText(stream: ProfileWorkbenchStream) {
  if (stream.vlan_enabled && stream.vlan2_enabled) {
    return stream.vlan2_tpid_override ? stream.vlan2_tpid : "8100";
  }
  return stream.mpls_enabled ? "8847" : ipEtherTypeText(stream.packet_type);
}

export type VlanProtocolViewModel = {
  cfiOptions: typeof vlanCfiValues;
  cfiValue: string;
  enabled: boolean;
  idCountDisabled: boolean;
  idCountValue: string;
  idMode: ProfileWorkbenchStream["vlan_id_mode"];
  idModeOptions: typeof vlanIdModes;
  idStepDisabled: boolean;
  idStepValue: string;
  innerTagChecked: boolean;
  payloadTypeValue: string;
  priorityCountDisabled: boolean;
  priorityCountValue: string;
  priorityMode: ProfileWorkbenchStream["vlan_priority_mode"];
  priorityModeOptions: typeof vlanPriorityModes;
  priorityOptions: typeof vlanPriorityValues;
  priorityStepDisabled: boolean;
  priorityStepValue: string;
  priorityValue: string;
  tpidDisabled: boolean;
  tpidOverrideChecked: boolean;
  tpidValue: string;
  vlanIdValue: string;
};

export function vlanProtocolViewModel(stream: ProfileWorkbenchStream): VlanProtocolViewModel {
  const priorityDynamic = stream.vlan_priority_mode !== "Fixed";
  const idDynamic = stream.vlan_id_mode !== "Fixed";
  return {
    cfiOptions: vlanCfiValues,
    cfiValue: numberValue(stream.vlan_cfi),
    enabled: stream.vlan_enabled,
    idCountDisabled: !idDynamic,
    idCountValue: numberValue(stream.vlan_id_count),
    idMode: stream.vlan_id_mode,
    idModeOptions: vlanIdModes,
    idStepDisabled: !idDynamic,
    idStepValue: numberValue(stream.vlan_id_step),
    innerTagChecked: stream.vlan2_enabled,
    payloadTypeValue: vlanPayloadTypeText(stream),
    priorityCountDisabled: !priorityDynamic,
    priorityCountValue: numberValue(stream.vlan_priority_count),
    priorityMode: stream.vlan_priority_mode,
    priorityModeOptions: vlanPriorityModes,
    priorityOptions: vlanPriorityValues,
    priorityStepDisabled: !priorityDynamic,
    priorityStepValue: numberValue(stream.vlan_priority_step),
    priorityValue: numberValue(stream.vlan_priority),
    tpidDisabled: !stream.vlan_tpid_override,
    tpidOverrideChecked: stream.vlan_tpid_override,
    tpidValue: stream.vlan_tpid,
    vlanIdValue: numberValue(stream.vlan_id)
  };
}

export function streamPayloadTypeText(stream: ProfileWorkbenchStream) {
  return stream.mpls_enabled ? "8847" : ipEtherTypeText(stream.packet_type);
}

export type VlanInnerTagProtocolViewModel = {
  cfiOptions: typeof vlanCfiValues;
  cfiValue: string;
  enabled: boolean;
  idCountDisabled: boolean;
  idCountValue: string;
  idMode: ProfileWorkbenchStream["vlan2_id_mode"];
  idModeOptions: typeof vlanIdModes;
  idStepDisabled: boolean;
  idStepValue: string;
  payloadTypeValue: string;
  priorityCountDisabled: boolean;
  priorityCountValue: string;
  priorityMode: ProfileWorkbenchStream["vlan2_priority_mode"];
  priorityModeOptions: typeof vlanPriorityModes;
  priorityOptions: typeof vlanPriorityValues;
  priorityStepDisabled: boolean;
  priorityStepValue: string;
  priorityValue: string;
  tpidDisabled: boolean;
  tpidOverrideChecked: boolean;
  tpidValue: string;
  vlanIdValue: string;
};

export function vlanInnerTagProtocolViewModel(stream: ProfileWorkbenchStream): VlanInnerTagProtocolViewModel {
  const priorityDynamic = stream.vlan2_priority_mode !== "Fixed";
  const idDynamic = stream.vlan2_id_mode !== "Fixed";
  return {
    cfiOptions: vlanCfiValues,
    cfiValue: numberValue(stream.vlan2_cfi),
    enabled: stream.vlan2_enabled,
    idCountDisabled: !idDynamic,
    idCountValue: numberValue(stream.vlan2_id_count),
    idMode: stream.vlan2_id_mode,
    idModeOptions: vlanIdModes,
    idStepDisabled: !idDynamic,
    idStepValue: numberValue(stream.vlan2_id_step),
    payloadTypeValue: streamPayloadTypeText(stream),
    priorityCountDisabled: !priorityDynamic,
    priorityCountValue: numberValue(stream.vlan2_priority_count),
    priorityMode: stream.vlan2_priority_mode,
    priorityModeOptions: vlanPriorityModes,
    priorityOptions: vlanPriorityValues,
    priorityStepDisabled: !priorityDynamic,
    priorityStepValue: numberValue(stream.vlan2_priority_step),
    priorityValue: numberValue(stream.vlan2_priority),
    tpidDisabled: !stream.vlan2_tpid_override,
    tpidOverrideChecked: stream.vlan2_tpid_override,
    tpidValue: stream.vlan2_tpid,
    vlanIdValue: numberValue(stream.vlan2_id)
  };
}

export type MplsProtocolViewModel = {
  bottomOfStackValue: string;
  enabled: boolean;
  labelCountDisabled: boolean;
  labelCountValue: string;
  labelMode: ProfileWorkbenchStream["mpls_label_mode"];
  labelModeOptions: typeof mplsLabelModes;
  labelStepDisabled: boolean;
  labelStepValue: string;
  labelValue: string;
  secondLabelChecked: boolean;
  thirdLabelChecked: boolean;
  thirdLabelDisabled: boolean;
  trafficClassCountDisabled: boolean;
  trafficClassCountValue: string;
  trafficClassMode: ProfileWorkbenchStream["mpls_tc_mode"];
  trafficClassModeOptions: typeof mplsTrafficClassModes;
  trafficClassOptions: typeof mplsTrafficClassValues;
  trafficClassStepDisabled: boolean;
  trafficClassStepValue: string;
  trafficClassValue: string;
  ttlCountDisabled: boolean;
  ttlCountValue: string;
  ttlMode: ProfileWorkbenchStream["mpls_ttl_mode"];
  ttlModeOptions: typeof mplsTtlModes;
  ttlStepDisabled: boolean;
  ttlStepValue: string;
  ttlValue: string;
};

export function mplsProtocolViewModel(stream: ProfileWorkbenchStream): MplsProtocolViewModel {
  const labelDynamic = stream.mpls_label_mode !== "Fixed";
  const trafficClassDynamic = stream.mpls_tc_mode !== "Fixed";
  const ttlDynamic = stream.mpls_ttl_mode !== "Fixed";
  return {
    bottomOfStackValue: stream.mpls_label2_enabled ? "0" : "1",
    enabled: stream.mpls_enabled,
    labelCountDisabled: !labelDynamic,
    labelCountValue: numberValue(stream.mpls_label_count),
    labelMode: stream.mpls_label_mode,
    labelModeOptions: mplsLabelModes,
    labelStepDisabled: !labelDynamic,
    labelStepValue: numberValue(stream.mpls_label_step),
    labelValue: numberValue(stream.mpls_label),
    secondLabelChecked: stream.mpls_label2_enabled,
    thirdLabelChecked: stream.mpls_label3_enabled,
    thirdLabelDisabled: !stream.mpls_label2_enabled,
    trafficClassCountDisabled: !trafficClassDynamic,
    trafficClassCountValue: numberValue(stream.mpls_tc_count),
    trafficClassMode: stream.mpls_tc_mode,
    trafficClassModeOptions: mplsTrafficClassModes,
    trafficClassOptions: mplsTrafficClassValues,
    trafficClassStepDisabled: !trafficClassDynamic,
    trafficClassStepValue: numberValue(stream.mpls_tc_step),
    trafficClassValue: numberValue(stream.mpls_tc),
    ttlCountDisabled: !ttlDynamic,
    ttlCountValue: numberValue(stream.mpls_ttl_count),
    ttlMode: stream.mpls_ttl_mode,
    ttlModeOptions: mplsTtlModes,
    ttlStepDisabled: !ttlDynamic,
    ttlStepValue: numberValue(stream.mpls_ttl_step),
    ttlValue: numberValue(stream.mpls_ttl)
  };
}

export type MplsSecondLabelProtocolViewModel = {
  bottomOfStackValue: string;
  enabled: boolean;
  labelCountDisabled: boolean;
  labelCountValue: string;
  labelMode: ProfileWorkbenchStream["mpls_label2_mode"];
  labelModeOptions: typeof mplsLabelModes;
  labelStepDisabled: boolean;
  labelStepValue: string;
  labelValue: string;
  trafficClassCountDisabled: boolean;
  trafficClassCountValue: string;
  trafficClassMode: ProfileWorkbenchStream["mpls_label2_tc_mode"];
  trafficClassModeOptions: typeof mplsTrafficClassModes;
  trafficClassOptions: typeof mplsTrafficClassValues;
  trafficClassStepDisabled: boolean;
  trafficClassStepValue: string;
  trafficClassValue: string;
  ttlCountDisabled: boolean;
  ttlCountValue: string;
  ttlMode: ProfileWorkbenchStream["mpls_label2_ttl_mode"];
  ttlModeOptions: typeof mplsTtlModes;
  ttlStepDisabled: boolean;
  ttlStepValue: string;
  ttlValue: string;
};

export function mplsSecondLabelProtocolViewModel(stream: ProfileWorkbenchStream): MplsSecondLabelProtocolViewModel {
  const labelDynamic = stream.mpls_label2_mode !== "Fixed";
  const trafficClassDynamic = stream.mpls_label2_tc_mode !== "Fixed";
  const ttlDynamic = stream.mpls_label2_ttl_mode !== "Fixed";
  return {
    bottomOfStackValue: stream.mpls_label3_enabled ? "0" : "1",
    enabled: stream.mpls_label2_enabled,
    labelCountDisabled: !labelDynamic,
    labelCountValue: numberValue(stream.mpls_label2_count),
    labelMode: stream.mpls_label2_mode,
    labelModeOptions: mplsLabelModes,
    labelStepDisabled: !labelDynamic,
    labelStepValue: numberValue(stream.mpls_label2_step),
    labelValue: numberValue(stream.mpls_label2),
    trafficClassCountDisabled: !trafficClassDynamic,
    trafficClassCountValue: numberValue(stream.mpls_label2_tc_count),
    trafficClassMode: stream.mpls_label2_tc_mode,
    trafficClassModeOptions: mplsTrafficClassModes,
    trafficClassOptions: mplsTrafficClassValues,
    trafficClassStepDisabled: !trafficClassDynamic,
    trafficClassStepValue: numberValue(stream.mpls_label2_tc_step),
    trafficClassValue: numberValue(stream.mpls_label2_tc),
    ttlCountDisabled: !ttlDynamic,
    ttlCountValue: numberValue(stream.mpls_label2_ttl_count),
    ttlMode: stream.mpls_label2_ttl_mode,
    ttlModeOptions: mplsTtlModes,
    ttlStepDisabled: !ttlDynamic,
    ttlStepValue: numberValue(stream.mpls_label2_ttl_step),
    ttlValue: numberValue(stream.mpls_label2_ttl)
  };
}

export type MplsThirdLabelProtocolViewModel = {
  bottomOfStackValue: string;
  enabled: boolean;
  labelCountDisabled: boolean;
  labelCountValue: string;
  labelMode: ProfileWorkbenchStream["mpls_label3_mode"];
  labelModeOptions: typeof mplsLabelModes;
  labelStepDisabled: boolean;
  labelStepValue: string;
  labelValue: string;
  trafficClassCountDisabled: boolean;
  trafficClassCountValue: string;
  trafficClassMode: ProfileWorkbenchStream["mpls_label3_tc_mode"];
  trafficClassModeOptions: typeof mplsTrafficClassModes;
  trafficClassOptions: typeof mplsTrafficClassValues;
  trafficClassStepDisabled: boolean;
  trafficClassStepValue: string;
  trafficClassValue: string;
  ttlCountDisabled: boolean;
  ttlCountValue: string;
  ttlMode: ProfileWorkbenchStream["mpls_label3_ttl_mode"];
  ttlModeOptions: typeof mplsTtlModes;
  ttlStepDisabled: boolean;
  ttlStepValue: string;
  ttlValue: string;
};

export function mplsThirdLabelProtocolViewModel(stream: ProfileWorkbenchStream): MplsThirdLabelProtocolViewModel {
  const labelDynamic = stream.mpls_label3_mode !== "Fixed";
  const trafficClassDynamic = stream.mpls_label3_tc_mode !== "Fixed";
  const ttlDynamic = stream.mpls_label3_ttl_mode !== "Fixed";
  return {
    bottomOfStackValue: "1",
    enabled: stream.mpls_label2_enabled && stream.mpls_label3_enabled,
    labelCountDisabled: !labelDynamic,
    labelCountValue: numberValue(stream.mpls_label3_count),
    labelMode: stream.mpls_label3_mode,
    labelModeOptions: mplsLabelModes,
    labelStepDisabled: !labelDynamic,
    labelStepValue: numberValue(stream.mpls_label3_step),
    labelValue: numberValue(stream.mpls_label3),
    trafficClassCountDisabled: !trafficClassDynamic,
    trafficClassCountValue: numberValue(stream.mpls_label3_tc_count),
    trafficClassMode: stream.mpls_label3_tc_mode,
    trafficClassModeOptions: mplsTrafficClassModes,
    trafficClassOptions: mplsTrafficClassValues,
    trafficClassStepDisabled: !trafficClassDynamic,
    trafficClassStepValue: numberValue(stream.mpls_label3_tc_step),
    trafficClassValue: numberValue(stream.mpls_label3_tc),
    ttlCountDisabled: !ttlDynamic,
    ttlCountValue: numberValue(stream.mpls_label3_ttl_count),
    ttlMode: stream.mpls_label3_ttl_mode,
    ttlModeOptions: mplsTtlModes,
    ttlStepDisabled: !ttlDynamic,
    ttlStepValue: numberValue(stream.mpls_label3_ttl_step),
    ttlValue: numberValue(stream.mpls_label3_ttl)
  };
}

export type VxlanProtocolViewModel = {
  enabled: boolean;
  innerEtherDstValue: string;
  innerEtherProtocolValue: string;
  innerEtherSrcValue: string;
  innerEtherTypeValue: string;
  innerIpVersion: ProfileWorkbenchStream["vxlan_inner_ip_version"];
  innerIpVersionOptions: typeof vxlanInnerIpVersions;
  innerIpv4AddressModeOptions: typeof ipv4AddressModes;
  innerIpv4DstCountDisabled: boolean;
  innerIpv4DstCountValue: string;
  innerIpv4DstMode: ProfileWorkbenchStream["vxlan_inner_ipv4_dst_mode"];
  innerIpv4DstStepDisabled: boolean;
  innerIpv4DstStepValue: string;
  innerIpv4DstValue: string;
  innerIpv4SrcCountDisabled: boolean;
  innerIpv4SrcCountValue: string;
  innerIpv4SrcMode: ProfileWorkbenchStream["vxlan_inner_ipv4_src_mode"];
  innerIpv4SrcStepDisabled: boolean;
  innerIpv4SrcStepValue: string;
  innerIpv4SrcValue: string;
  innerIpv4TtlCountDisabled: boolean;
  innerIpv4TtlCountValue: string;
  innerIpv4TtlMode: ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"];
  innerIpv4TtlModeOptions: typeof vxlanInnerIpv4TtlModes;
  innerIpv4TtlStepDisabled: boolean;
  innerIpv4TtlStepValue: string;
  innerIpv4TtlValue: string;
  innerIpv6AddressModeOptions: typeof ipv6AddressModes;
  innerIpv6DstCountDisabled: boolean;
  innerIpv6DstCountValue: string;
  innerIpv6DstMode: ProfileWorkbenchStream["vxlan_inner_ipv6_dst_mode"];
  innerIpv6DstStepDisabled: boolean;
  innerIpv6DstStepValue: string;
  innerIpv6DstValue: string;
  innerIpv6HopLimitCountDisabled: boolean;
  innerIpv6HopLimitCountValue: string;
  innerIpv6HopLimitMode: ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"];
  innerIpv6HopLimitModeOptions: typeof vxlanInnerIpv6HopLimitModes;
  innerIpv6HopLimitStepDisabled: boolean;
  innerIpv6HopLimitStepValue: string;
  innerIpv6HopLimitValue: string;
  innerIpv6SrcCountDisabled: boolean;
  innerIpv6SrcCountValue: string;
  innerIpv6SrcMode: ProfileWorkbenchStream["vxlan_inner_ipv6_src_mode"];
  innerIpv6SrcStepDisabled: boolean;
  innerIpv6SrcStepValue: string;
  innerIpv6SrcValue: string;
  innerL4DstPortCountDisabled: boolean;
  innerL4DstPortCountValue: string;
  innerL4DstPortMode: ProfileWorkbenchStream["vxlan_inner_l4_dst_port_mode"];
  innerL4DstPortStepDisabled: boolean;
  innerL4DstPortStepValue: string;
  innerL4DstPortValue: string;
  innerL4PortModeOptions: typeof l4PortModes;
  innerL4SrcPortCountDisabled: boolean;
  innerL4SrcPortCountValue: string;
  innerL4SrcPortMode: ProfileWorkbenchStream["vxlan_inner_l4_src_port_mode"];
  innerL4SrcPortStepDisabled: boolean;
  innerL4SrcPortStepValue: string;
  innerL4SrcPortValue: string;
  udpPortValue: string;
  usesIpv6: boolean;
  vniCountDisabled: boolean;
  vniCountValue: string;
  vniMode: ProfileWorkbenchStream["vxlan_vni_mode"];
  vniModeOptions: typeof vxlanVniModes;
  vniStepDisabled: boolean;
  vniStepValue: string;
  vniValue: string;
};

export function vxlanProtocolViewModel(stream: ProfileWorkbenchStream): VxlanProtocolViewModel {
  const vniDynamic = stream.vxlan_vni_mode !== "Fixed";
  const innerIpv4SrcDynamic = stream.vxlan_inner_ipv4_src_mode !== "Fixed";
  const innerIpv4DstDynamic = stream.vxlan_inner_ipv4_dst_mode !== "Fixed";
  const innerIpv4TtlDynamic = stream.vxlan_inner_ipv4_ttl_mode !== "Fixed";
  const innerIpv6SrcDynamic = stream.vxlan_inner_ipv6_src_mode !== "Fixed";
  const innerIpv6DstDynamic = stream.vxlan_inner_ipv6_dst_mode !== "Fixed";
  const innerIpv6HopLimitDynamic = stream.vxlan_inner_ipv6_hop_limit_mode !== "Fixed";
  const innerL4SrcPortDynamic = stream.vxlan_inner_l4_src_port_mode !== "Fixed";
  const innerL4DstPortDynamic = stream.vxlan_inner_l4_dst_port_mode !== "Fixed";
  const usesIpv6 = stream.vxlan_inner_ip_version === "IPv6";
  return {
    enabled: stream.vxlan_enabled,
    innerEtherDstValue: stream.vxlan_inner_ether_dst,
    innerEtherProtocolValue: stream.vxlan_inner_ip_version,
    innerEtherSrcValue: stream.vxlan_inner_ether_src,
    innerEtherTypeValue: usesIpv6 ? "86dd" : "0800",
    innerIpVersion: stream.vxlan_inner_ip_version,
    innerIpVersionOptions: vxlanInnerIpVersions,
    innerIpv4AddressModeOptions: ipv4AddressModes,
    innerIpv4DstCountDisabled: !innerIpv4DstDynamic,
    innerIpv4DstCountValue: numberValue(stream.vxlan_inner_ipv4_dst_count),
    innerIpv4DstMode: stream.vxlan_inner_ipv4_dst_mode,
    innerIpv4DstStepDisabled: !innerIpv4DstDynamic,
    innerIpv4DstStepValue: numberValue(stream.vxlan_inner_ipv4_dst_step),
    innerIpv4DstValue: stream.vxlan_inner_ipv4_dst,
    innerIpv4SrcCountDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcCountValue: numberValue(stream.vxlan_inner_ipv4_src_count),
    innerIpv4SrcMode: stream.vxlan_inner_ipv4_src_mode,
    innerIpv4SrcStepDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcStepValue: numberValue(stream.vxlan_inner_ipv4_src_step),
    innerIpv4SrcValue: stream.vxlan_inner_ipv4_src,
    innerIpv4TtlCountDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlCountValue: numberValue(stream.vxlan_inner_ipv4_ttl_count),
    innerIpv4TtlMode: stream.vxlan_inner_ipv4_ttl_mode,
    innerIpv4TtlModeOptions: vxlanInnerIpv4TtlModes,
    innerIpv4TtlStepDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlStepValue: numberValue(stream.vxlan_inner_ipv4_ttl_step),
    innerIpv4TtlValue: numberValue(stream.vxlan_inner_ipv4_ttl),
    innerIpv6AddressModeOptions: ipv6AddressModes,
    innerIpv6DstCountDisabled: !innerIpv6DstDynamic,
    innerIpv6DstCountValue: numberValue(stream.vxlan_inner_ipv6_dst_count),
    innerIpv6DstMode: stream.vxlan_inner_ipv6_dst_mode,
    innerIpv6DstStepDisabled: !innerIpv6DstDynamic,
    innerIpv6DstStepValue: numberValue(stream.vxlan_inner_ipv6_dst_step),
    innerIpv6DstValue: stream.vxlan_inner_ipv6_dst,
    innerIpv6HopLimitCountDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitCountValue: numberValue(stream.vxlan_inner_ipv6_hop_limit_count),
    innerIpv6HopLimitMode: stream.vxlan_inner_ipv6_hop_limit_mode,
    innerIpv6HopLimitModeOptions: vxlanInnerIpv6HopLimitModes,
    innerIpv6HopLimitStepDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitStepValue: numberValue(stream.vxlan_inner_ipv6_hop_limit_step),
    innerIpv6HopLimitValue: numberValue(stream.vxlan_inner_ipv6_hop_limit),
    innerIpv6SrcCountDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcCountValue: numberValue(stream.vxlan_inner_ipv6_src_count),
    innerIpv6SrcMode: stream.vxlan_inner_ipv6_src_mode,
    innerIpv6SrcStepDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcStepValue: numberValue(stream.vxlan_inner_ipv6_src_step),
    innerIpv6SrcValue: stream.vxlan_inner_ipv6_src,
    innerL4DstPortCountDisabled: !innerL4DstPortDynamic,
    innerL4DstPortCountValue: numberValue(stream.vxlan_inner_l4_dst_port_count),
    innerL4DstPortMode: stream.vxlan_inner_l4_dst_port_mode,
    innerL4DstPortStepDisabled: !innerL4DstPortDynamic,
    innerL4DstPortStepValue: numberValue(stream.vxlan_inner_l4_dst_port_step),
    innerL4DstPortValue: numberValue(stream.vxlan_inner_l4_dst_port),
    innerL4PortModeOptions: l4PortModes,
    innerL4SrcPortCountDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortCountValue: numberValue(stream.vxlan_inner_l4_src_port_count),
    innerL4SrcPortMode: stream.vxlan_inner_l4_src_port_mode,
    innerL4SrcPortStepDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortStepValue: numberValue(stream.vxlan_inner_l4_src_port_step),
    innerL4SrcPortValue: numberValue(stream.vxlan_inner_l4_src_port),
    udpPortValue: "4789",
    usesIpv6,
    vniCountDisabled: !vniDynamic,
    vniCountValue: numberValue(stream.vxlan_vni_count),
    vniMode: stream.vxlan_vni_mode,
    vniModeOptions: vxlanVniModes,
    vniStepDisabled: !vniDynamic,
    vniStepValue: numberValue(stream.vxlan_vni_step),
    vniValue: numberValue(stream.vxlan_vni)
  };
}

export type GtpuProtocolViewModel = {
  enabled: boolean;
  extensionEnabled: boolean;
  extensionTypeValue: string;
  extensionUdpPortCountDisabled: boolean;
  extensionUdpPortCountValue: string;
  extensionUdpPortDisabled: boolean;
  extensionUdpPortMode: ProfileWorkbenchStream["gtpu_extension_udp_port_mode"];
  extensionUdpPortModeDisabled: boolean;
  extensionUdpPortModeOptions: typeof gtpuExtensionUdpPortModes;
  extensionUdpPortStepDisabled: boolean;
  extensionUdpPortStepValue: string;
  extensionUdpPortValue: string;
  innerIpv4AddressModeOptions: typeof ipv4AddressModes;
  innerIpv4DstCountDisabled: boolean;
  innerIpv4DstCountValue: string;
  innerIpv4DstMode: ProfileWorkbenchStream["gtpu_inner_ipv4_dst_mode"];
  innerIpv4DstStepDisabled: boolean;
  innerIpv4DstStepValue: string;
  innerIpv4DstValue: string;
  innerIpv4SrcCountDisabled: boolean;
  innerIpv4SrcCountValue: string;
  innerIpv4SrcMode: ProfileWorkbenchStream["gtpu_inner_ipv4_src_mode"];
  innerIpv4SrcStepDisabled: boolean;
  innerIpv4SrcStepValue: string;
  innerIpv4SrcValue: string;
  innerIpv4TtlCountDisabled: boolean;
  innerIpv4TtlCountValue: string;
  innerIpv4TtlMode: ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"];
  innerIpv4TtlModeOptions: typeof gtpuInnerIpv4TtlModes;
  innerIpv4TtlStepDisabled: boolean;
  innerIpv4TtlStepValue: string;
  innerIpv4TtlValue: string;
  innerIpv6AddressModeOptions: typeof ipv6AddressModes;
  innerIpv6DstCountDisabled: boolean;
  innerIpv6DstCountValue: string;
  innerIpv6DstMode: ProfileWorkbenchStream["gtpu_inner_ipv6_dst_mode"];
  innerIpv6DstStepDisabled: boolean;
  innerIpv6DstStepValue: string;
  innerIpv6DstValue: string;
  innerIpv6HopLimitCountDisabled: boolean;
  innerIpv6HopLimitCountValue: string;
  innerIpv6HopLimitMode: ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"];
  innerIpv6HopLimitModeOptions: typeof gtpuInnerIpv6HopLimitModes;
  innerIpv6HopLimitStepDisabled: boolean;
  innerIpv6HopLimitStepValue: string;
  innerIpv6HopLimitValue: string;
  innerIpv6SrcCountDisabled: boolean;
  innerIpv6SrcCountValue: string;
  innerIpv6SrcMode: ProfileWorkbenchStream["gtpu_inner_ipv6_src_mode"];
  innerIpv6SrcStepDisabled: boolean;
  innerIpv6SrcStepValue: string;
  innerIpv6SrcValue: string;
  innerIpVersion: ProfileWorkbenchStream["gtpu_inner_ip_version"];
  innerIpVersionOptions: typeof gtpuInnerIpVersions;
  innerL4DstPortCountDisabled: boolean;
  innerL4DstPortCountValue: string;
  innerL4DstPortMode: ProfileWorkbenchStream["gtpu_inner_l4_dst_port_mode"];
  innerL4DstPortStepDisabled: boolean;
  innerL4DstPortStepValue: string;
  innerL4DstPortValue: string;
  innerL4PortModeOptions: typeof l4PortModes;
  innerL4SrcPortCountDisabled: boolean;
  innerL4SrcPortCountValue: string;
  innerL4SrcPortMode: ProfileWorkbenchStream["gtpu_inner_l4_src_port_mode"];
  innerL4SrcPortStepDisabled: boolean;
  innerL4SrcPortStepValue: string;
  innerL4SrcPortValue: string;
  messageTypeValue: string;
  npduCountDisabled: boolean;
  npduCountValue: string;
  npduEnabled: boolean;
  npduMode: ProfileWorkbenchStream["gtpu_npdu_mode"];
  npduModeDisabled: boolean;
  npduModeOptions: typeof gtpuNpduModes;
  npduStepDisabled: boolean;
  npduStepValue: string;
  npduValue: string;
  npduValueDisabled: boolean;
  sequenceCountDisabled: boolean;
  sequenceCountValue: string;
  sequenceEnabled: boolean;
  sequenceMode: ProfileWorkbenchStream["gtpu_sequence_mode"];
  sequenceModeDisabled: boolean;
  sequenceModeOptions: typeof gtpuSequenceModes;
  sequenceStepDisabled: boolean;
  sequenceStepValue: string;
  sequenceValue: string;
  sequenceValueDisabled: boolean;
  teidCountDisabled: boolean;
  teidCountValue: string;
  teidMode: ProfileWorkbenchStream["gtpu_teid_mode"];
  teidModeOptions: typeof gtpuTeidModes;
  teidStepDisabled: boolean;
  teidStepValue: string;
  teidValue: string;
  udpPortValue: string;
  usesIpv6: boolean;
};

export function gtpuProtocolViewModel(stream: ProfileWorkbenchStream): GtpuProtocolViewModel {
  const teidDynamic = stream.gtpu_teid_mode !== "Fixed";
  const sequenceDynamic = stream.gtpu_sequence_mode !== "Fixed";
  const npduDynamic = stream.gtpu_npdu_mode !== "Fixed";
  const extensionUdpPortDynamic = stream.gtpu_extension_udp_port_mode !== "Fixed";
  const innerIpv4SrcDynamic = stream.gtpu_inner_ipv4_src_mode !== "Fixed";
  const innerIpv4DstDynamic = stream.gtpu_inner_ipv4_dst_mode !== "Fixed";
  const innerIpv4TtlDynamic = stream.gtpu_inner_ipv4_ttl_mode !== "Fixed";
  const innerIpv6SrcDynamic = stream.gtpu_inner_ipv6_src_mode !== "Fixed";
  const innerIpv6DstDynamic = stream.gtpu_inner_ipv6_dst_mode !== "Fixed";
  const innerIpv6HopLimitDynamic = stream.gtpu_inner_ipv6_hop_limit_mode !== "Fixed";
  const innerL4SrcPortDynamic = stream.gtpu_inner_l4_src_port_mode !== "Fixed";
  const innerL4DstPortDynamic = stream.gtpu_inner_l4_dst_port_mode !== "Fixed";
  const usesIpv6 = stream.gtpu_inner_ip_version === "IPv6";
  return {
    enabled: stream.gtpu_enabled,
    extensionEnabled: stream.gtpu_extension_enabled,
    extensionTypeValue: "UDP Port (0x40)",
    extensionUdpPortCountDisabled: !stream.gtpu_extension_enabled || !extensionUdpPortDynamic,
    extensionUdpPortCountValue: numberValue(stream.gtpu_extension_udp_port_count),
    extensionUdpPortDisabled: !stream.gtpu_extension_enabled,
    extensionUdpPortMode: stream.gtpu_extension_udp_port_mode,
    extensionUdpPortModeDisabled: !stream.gtpu_extension_enabled,
    extensionUdpPortModeOptions: gtpuExtensionUdpPortModes,
    extensionUdpPortStepDisabled: !stream.gtpu_extension_enabled || !extensionUdpPortDynamic,
    extensionUdpPortStepValue: numberValue(stream.gtpu_extension_udp_port_step),
    extensionUdpPortValue: numberValue(stream.gtpu_extension_udp_port),
    innerIpv4AddressModeOptions: ipv4AddressModes,
    innerIpv4DstCountDisabled: !innerIpv4DstDynamic,
    innerIpv4DstCountValue: numberValue(stream.gtpu_inner_ipv4_dst_count),
    innerIpv4DstMode: stream.gtpu_inner_ipv4_dst_mode,
    innerIpv4DstStepDisabled: !innerIpv4DstDynamic,
    innerIpv4DstStepValue: numberValue(stream.gtpu_inner_ipv4_dst_step),
    innerIpv4DstValue: stream.gtpu_inner_ipv4_dst,
    innerIpv4SrcCountDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcCountValue: numberValue(stream.gtpu_inner_ipv4_src_count),
    innerIpv4SrcMode: stream.gtpu_inner_ipv4_src_mode,
    innerIpv4SrcStepDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcStepValue: numberValue(stream.gtpu_inner_ipv4_src_step),
    innerIpv4SrcValue: stream.gtpu_inner_ipv4_src,
    innerIpv4TtlCountDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlCountValue: numberValue(stream.gtpu_inner_ipv4_ttl_count),
    innerIpv4TtlMode: stream.gtpu_inner_ipv4_ttl_mode,
    innerIpv4TtlModeOptions: gtpuInnerIpv4TtlModes,
    innerIpv4TtlStepDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlStepValue: numberValue(stream.gtpu_inner_ipv4_ttl_step),
    innerIpv4TtlValue: numberValue(stream.gtpu_inner_ipv4_ttl),
    innerIpv6AddressModeOptions: ipv6AddressModes,
    innerIpv6DstCountDisabled: !innerIpv6DstDynamic,
    innerIpv6DstCountValue: numberValue(stream.gtpu_inner_ipv6_dst_count),
    innerIpv6DstMode: stream.gtpu_inner_ipv6_dst_mode,
    innerIpv6DstStepDisabled: !innerIpv6DstDynamic,
    innerIpv6DstStepValue: numberValue(stream.gtpu_inner_ipv6_dst_step),
    innerIpv6DstValue: stream.gtpu_inner_ipv6_dst,
    innerIpv6HopLimitCountDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitCountValue: numberValue(stream.gtpu_inner_ipv6_hop_limit_count),
    innerIpv6HopLimitMode: stream.gtpu_inner_ipv6_hop_limit_mode,
    innerIpv6HopLimitModeOptions: gtpuInnerIpv6HopLimitModes,
    innerIpv6HopLimitStepDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitStepValue: numberValue(stream.gtpu_inner_ipv6_hop_limit_step),
    innerIpv6HopLimitValue: numberValue(stream.gtpu_inner_ipv6_hop_limit),
    innerIpv6SrcCountDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcCountValue: numberValue(stream.gtpu_inner_ipv6_src_count),
    innerIpv6SrcMode: stream.gtpu_inner_ipv6_src_mode,
    innerIpv6SrcStepDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcStepValue: numberValue(stream.gtpu_inner_ipv6_src_step),
    innerIpv6SrcValue: stream.gtpu_inner_ipv6_src,
    innerIpVersion: stream.gtpu_inner_ip_version,
    innerIpVersionOptions: gtpuInnerIpVersions,
    innerL4DstPortCountDisabled: !innerL4DstPortDynamic,
    innerL4DstPortCountValue: numberValue(stream.gtpu_inner_l4_dst_port_count),
    innerL4DstPortMode: stream.gtpu_inner_l4_dst_port_mode,
    innerL4DstPortStepDisabled: !innerL4DstPortDynamic,
    innerL4DstPortStepValue: numberValue(stream.gtpu_inner_l4_dst_port_step),
    innerL4DstPortValue: numberValue(stream.gtpu_inner_l4_dst_port),
    innerL4PortModeOptions: l4PortModes,
    innerL4SrcPortCountDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortCountValue: numberValue(stream.gtpu_inner_l4_src_port_count),
    innerL4SrcPortMode: stream.gtpu_inner_l4_src_port_mode,
    innerL4SrcPortStepDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortStepValue: numberValue(stream.gtpu_inner_l4_src_port_step),
    innerL4SrcPortValue: numberValue(stream.gtpu_inner_l4_src_port),
    messageTypeValue: numberValue(stream.gtpu_message_type),
    npduCountDisabled: !stream.gtpu_npdu_enabled || !npduDynamic,
    npduCountValue: numberValue(stream.gtpu_npdu_count),
    npduEnabled: stream.gtpu_npdu_enabled,
    npduMode: stream.gtpu_npdu_mode,
    npduModeDisabled: !stream.gtpu_npdu_enabled,
    npduModeOptions: gtpuNpduModes,
    npduStepDisabled: !stream.gtpu_npdu_enabled || !npduDynamic,
    npduStepValue: numberValue(stream.gtpu_npdu_step),
    npduValue: numberValue(stream.gtpu_npdu),
    npduValueDisabled: !stream.gtpu_npdu_enabled,
    sequenceCountDisabled: !stream.gtpu_sequence_enabled || !sequenceDynamic,
    sequenceCountValue: numberValue(stream.gtpu_sequence_count),
    sequenceEnabled: stream.gtpu_sequence_enabled,
    sequenceMode: stream.gtpu_sequence_mode,
    sequenceModeDisabled: !stream.gtpu_sequence_enabled,
    sequenceModeOptions: gtpuSequenceModes,
    sequenceStepDisabled: !stream.gtpu_sequence_enabled || !sequenceDynamic,
    sequenceStepValue: numberValue(stream.gtpu_sequence_step),
    sequenceValue: numberValue(stream.gtpu_sequence),
    sequenceValueDisabled: !stream.gtpu_sequence_enabled,
    teidCountDisabled: !teidDynamic,
    teidCountValue: numberValue(stream.gtpu_teid_count),
    teidMode: stream.gtpu_teid_mode,
    teidModeOptions: gtpuTeidModes,
    teidStepDisabled: !teidDynamic,
    teidStepValue: numberValue(stream.gtpu_teid_step),
    teidValue: numberValue(stream.gtpu_teid),
    udpPortValue: "2152",
    usesIpv6
  };
}

export type GreProtocolViewModel = {
  checksumOverride: boolean;
  checksumOverrideDisabled: boolean;
  checksumPresent: boolean;
  checksumPresentDisabled: boolean;
  checksumValue: string;
  checksumValueDisabled: boolean;
  innerIpVersion: ProfileWorkbenchStream["gre_inner_ip_version"];
  innerIpVersionOptions: typeof greInnerIpVersions;
  innerIpv4AddressModeOptions: typeof ipv4AddressModes;
  innerIpv4DstCountDisabled: boolean;
  innerIpv4DstCountValue: string;
  innerIpv4DstMode: ProfileWorkbenchStream["gre_inner_ipv4_dst_mode"];
  innerIpv4DstStepDisabled: boolean;
  innerIpv4DstStepValue: string;
  innerIpv4DstValue: string;
  innerIpv4SrcCountDisabled: boolean;
  innerIpv4SrcCountValue: string;
  innerIpv4SrcMode: ProfileWorkbenchStream["gre_inner_ipv4_src_mode"];
  innerIpv4SrcStepDisabled: boolean;
  innerIpv4SrcStepValue: string;
  innerIpv4SrcValue: string;
  innerIpv4TtlCountDisabled: boolean;
  innerIpv4TtlCountValue: string;
  innerIpv4TtlMode: ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"];
  innerIpv4TtlModeOptions: typeof greInnerIpv4TtlModes;
  innerIpv4TtlStepDisabled: boolean;
  innerIpv4TtlStepValue: string;
  innerIpv4TtlValue: string;
  innerIpv6AddressModeOptions: typeof ipv6AddressModes;
  innerIpv6DstCountDisabled: boolean;
  innerIpv6DstCountValue: string;
  innerIpv6DstMode: ProfileWorkbenchStream["gre_inner_ipv6_dst_mode"];
  innerIpv6DstStepDisabled: boolean;
  innerIpv6DstStepValue: string;
  innerIpv6DstValue: string;
  innerIpv6HopLimitCountDisabled: boolean;
  innerIpv6HopLimitCountValue: string;
  innerIpv6HopLimitMode: ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"];
  innerIpv6HopLimitModeOptions: typeof greInnerIpv6HopLimitModes;
  innerIpv6HopLimitStepDisabled: boolean;
  innerIpv6HopLimitStepValue: string;
  innerIpv6HopLimitValue: string;
  innerIpv6SrcCountDisabled: boolean;
  innerIpv6SrcCountValue: string;
  innerIpv6SrcMode: ProfileWorkbenchStream["gre_inner_ipv6_src_mode"];
  innerIpv6SrcStepDisabled: boolean;
  innerIpv6SrcStepValue: string;
  innerIpv6SrcValue: string;
  innerL4DstPortCountDisabled: boolean;
  innerL4DstPortCountValue: string;
  innerL4DstPortMode: ProfileWorkbenchStream["gre_inner_l4_dst_port_mode"];
  innerL4DstPortStepDisabled: boolean;
  innerL4DstPortStepValue: string;
  innerL4DstPortValue: string;
  innerL4PortModeOptions: typeof l4PortModes;
  innerL4SrcPortCountDisabled: boolean;
  innerL4SrcPortCountValue: string;
  innerL4SrcPortMode: ProfileWorkbenchStream["gre_inner_l4_src_port_mode"];
  innerL4SrcPortStepDisabled: boolean;
  innerL4SrcPortStepValue: string;
  innerL4SrcPortValue: string;
  keyCountDisabled: boolean;
  keyCountValue: string;
  keyMode: ProfileWorkbenchStream["gre_key_mode"];
  keyModeDisabled: boolean;
  keyModeOptions: typeof greNumberModes;
  keyPresent: boolean;
  keyStepDisabled: boolean;
  keyStepValue: string;
  keyValue: string;
  keyValueDisabled: boolean;
  protocolTypeValue: string;
  sequenceCountDisabled: boolean;
  sequenceCountValue: string;
  sequenceMode: ProfileWorkbenchStream["gre_sequence_mode"];
  sequenceModeDisabled: boolean;
  sequenceModeOptions: typeof greNumberModes;
  sequencePresent: boolean;
  sequenceStepDisabled: boolean;
  sequenceStepValue: string;
  sequenceValue: string;
  sequenceValueDisabled: boolean;
  usesIpv6: boolean;
};

export function greProtocolViewModel(stream: ProfileWorkbenchStream): GreProtocolViewModel {
  const keyDynamic = stream.gre_key_mode !== "Fixed";
  const sequenceDynamic = stream.gre_sequence_mode !== "Fixed";
  const innerIpv4SrcDynamic = stream.gre_inner_ipv4_src_mode !== "Fixed";
  const innerIpv4DstDynamic = stream.gre_inner_ipv4_dst_mode !== "Fixed";
  const innerIpv4TtlDynamic = stream.gre_inner_ipv4_ttl_mode !== "Fixed";
  const innerIpv6SrcDynamic = stream.gre_inner_ipv6_src_mode !== "Fixed";
  const innerIpv6DstDynamic = stream.gre_inner_ipv6_dst_mode !== "Fixed";
  const innerIpv6HopLimitDynamic = stream.gre_inner_ipv6_hop_limit_mode !== "Fixed";
  const innerL4SrcPortDynamic = stream.gre_inner_l4_src_port_mode !== "Fixed";
  const innerL4DstPortDynamic = stream.gre_inner_l4_dst_port_mode !== "Fixed";
  return {
    checksumOverride: stream.gre_checksum_override,
    checksumOverrideDisabled: !stream.gre_checksum_present,
    checksumPresent: stream.gre_checksum_present,
    checksumPresentDisabled: stream.gre_key_mode !== "Fixed" || stream.gre_sequence_mode !== "Fixed",
    checksumValue: stream.gre_checksum,
    checksumValueDisabled: !stream.gre_checksum_present || !stream.gre_checksum_override,
    innerIpVersion: stream.gre_inner_ip_version,
    innerIpVersionOptions: greInnerIpVersions,
    innerIpv4AddressModeOptions: ipv4AddressModes,
    innerIpv4DstCountDisabled: !innerIpv4DstDynamic,
    innerIpv4DstCountValue: numberValue(stream.gre_inner_ipv4_dst_count),
    innerIpv4DstMode: stream.gre_inner_ipv4_dst_mode,
    innerIpv4DstStepDisabled: !innerIpv4DstDynamic,
    innerIpv4DstStepValue: numberValue(stream.gre_inner_ipv4_dst_step),
    innerIpv4DstValue: stream.gre_inner_ipv4_dst,
    innerIpv4SrcCountDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcCountValue: numberValue(stream.gre_inner_ipv4_src_count),
    innerIpv4SrcMode: stream.gre_inner_ipv4_src_mode,
    innerIpv4SrcStepDisabled: !innerIpv4SrcDynamic,
    innerIpv4SrcStepValue: numberValue(stream.gre_inner_ipv4_src_step),
    innerIpv4SrcValue: stream.gre_inner_ipv4_src,
    innerIpv4TtlCountDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlCountValue: numberValue(stream.gre_inner_ipv4_ttl_count),
    innerIpv4TtlMode: stream.gre_inner_ipv4_ttl_mode,
    innerIpv4TtlModeOptions: greInnerIpv4TtlModes,
    innerIpv4TtlStepDisabled: !innerIpv4TtlDynamic,
    innerIpv4TtlStepValue: numberValue(stream.gre_inner_ipv4_ttl_step),
    innerIpv4TtlValue: numberValue(stream.gre_inner_ipv4_ttl),
    innerIpv6AddressModeOptions: ipv6AddressModes,
    innerIpv6DstCountDisabled: !innerIpv6DstDynamic,
    innerIpv6DstCountValue: numberValue(stream.gre_inner_ipv6_dst_count),
    innerIpv6DstMode: stream.gre_inner_ipv6_dst_mode,
    innerIpv6DstStepDisabled: !innerIpv6DstDynamic,
    innerIpv6DstStepValue: numberValue(stream.gre_inner_ipv6_dst_step),
    innerIpv6DstValue: stream.gre_inner_ipv6_dst,
    innerIpv6HopLimitCountDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitCountValue: numberValue(stream.gre_inner_ipv6_hop_limit_count),
    innerIpv6HopLimitMode: stream.gre_inner_ipv6_hop_limit_mode,
    innerIpv6HopLimitModeOptions: greInnerIpv6HopLimitModes,
    innerIpv6HopLimitStepDisabled: !innerIpv6HopLimitDynamic,
    innerIpv6HopLimitStepValue: numberValue(stream.gre_inner_ipv6_hop_limit_step),
    innerIpv6HopLimitValue: numberValue(stream.gre_inner_ipv6_hop_limit),
    innerIpv6SrcCountDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcCountValue: numberValue(stream.gre_inner_ipv6_src_count),
    innerIpv6SrcMode: stream.gre_inner_ipv6_src_mode,
    innerIpv6SrcStepDisabled: !innerIpv6SrcDynamic,
    innerIpv6SrcStepValue: numberValue(stream.gre_inner_ipv6_src_step),
    innerIpv6SrcValue: stream.gre_inner_ipv6_src,
    innerL4DstPortCountDisabled: !innerL4DstPortDynamic,
    innerL4DstPortCountValue: numberValue(stream.gre_inner_l4_dst_port_count),
    innerL4DstPortMode: stream.gre_inner_l4_dst_port_mode,
    innerL4DstPortStepDisabled: !innerL4DstPortDynamic,
    innerL4DstPortStepValue: numberValue(stream.gre_inner_l4_dst_port_step),
    innerL4DstPortValue: numberValue(stream.gre_inner_l4_dst_port),
    innerL4PortModeOptions: l4PortModes,
    innerL4SrcPortCountDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortCountValue: numberValue(stream.gre_inner_l4_src_port_count),
    innerL4SrcPortMode: stream.gre_inner_l4_src_port_mode,
    innerL4SrcPortStepDisabled: !innerL4SrcPortDynamic,
    innerL4SrcPortStepValue: numberValue(stream.gre_inner_l4_src_port_step),
    innerL4SrcPortValue: numberValue(stream.gre_inner_l4_src_port),
    keyCountDisabled: !stream.gre_key_present || !keyDynamic,
    keyCountValue: numberValue(stream.gre_key_count),
    keyMode: stream.gre_key_mode,
    keyModeDisabled: !stream.gre_key_present,
    keyModeOptions: greNumberModes,
    keyPresent: stream.gre_key_present,
    keyStepDisabled: !stream.gre_key_present || !keyDynamic,
    keyStepValue: numberValue(stream.gre_key_step),
    keyValue: numberValue(stream.gre_key),
    keyValueDisabled: !stream.gre_key_present,
    protocolTypeValue: stream.gre_protocol_type,
    sequenceCountDisabled: !stream.gre_sequence_present || !sequenceDynamic,
    sequenceCountValue: numberValue(stream.gre_sequence_count),
    sequenceMode: stream.gre_sequence_mode,
    sequenceModeDisabled: !stream.gre_sequence_present,
    sequenceModeOptions: greNumberModes,
    sequencePresent: stream.gre_sequence_present,
    sequenceStepDisabled: !stream.gre_sequence_present || !sequenceDynamic,
    sequenceStepValue: numberValue(stream.gre_sequence_step),
    sequenceValue: numberValue(stream.gre_sequence),
    sequenceValueDisabled: !stream.gre_sequence_present,
    usesIpv6: stream.gre_inner_ip_version === "IPv6"
  };
}

export function formatLayerField(value: string | number | boolean) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export const ADVANCED_VM_MAX_BYTES = 1_000_000;
export const advancedVmDefaultBody = {
  instructions: [],
  split_by_var: ""
};
export const advancedVmFlowVarOperations = ["inc", "dec", "random"] as const;
export const advancedVmFlowVarFields = ["init_value", "min_value", "max_value", "step"] as const;

export type AdvancedVmBody = Record<string, unknown>;
export type AdvancedVmFlowVarOperation = (typeof advancedVmFlowVarOperations)[number];
export type AdvancedVmFlowVarField = (typeof advancedVmFlowVarFields)[number];
export type AdvancedVmTemplateParameterDraft = Record<string, string>;
export type RawPacketFieldDraft = Record<string, string>;
export type RawPacketFieldStatus = {
  kind: "ok" | "error";
  text: string;
};

export const emptyAdvancedVmTemplateParameterDraft: AdvancedVmTemplateParameterDraft = {};
export const emptyRawPacketFieldDraft: RawPacketFieldDraft = {};

export type AdvancedVmTemplate = {
  name: string;
  label: string;
  description: string;
  requires: string;
  body?: AdvancedVmBody;
  buildBody?: (stream: ProfileWorkbenchStream) => AdvancedVmBody;
  hideWhenUnsupportedWithoutRaw?: boolean;
  supports?: (stream: ProfileWorkbenchStream) => boolean;
};

export type AdvancedVmFlowVarRow = {
  name: string;
  op: string;
  init_value: number | string;
  min_value: number | string;
  max_value: number | string;
  step: number | string;
};

export type AdvancedVmTargetRow = {
  template: AdvancedVmTemplate;
  compatible: boolean;
  ready: boolean;
  blockedReason: string;
  variables: string;
  writeOffsets: string;
  writeOffsetValues: number[];
  checksumRepair: string;
  splitBy: string;
};
