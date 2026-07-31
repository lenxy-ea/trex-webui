import type { ProfileWorkbenchStream } from "../../../api";
import {
  gtpuDefaultFrameLength,
  gtpuInnerIpv6DefaultFrameLength,
  icmpv6ControlMinimumFrameLength,
  supportsVariableFrameLength,
  vxlanDefaultFrameLength,
  workbenchMplsLabelCount,
  workbenchVlanHeaderLength,
  type TcpFlagKey
} from "./model";
import {
  ipVersionName,
  packetTypeFor,
  protocolName,
  type L3Selection,
  type L4Selection
} from "./protocolSelectionModel";

export type StreamPatch = Partial<ProfileWorkbenchStream>;
export type StreamPatchHandlers = {
  applyPatch: (patch: StreamPatch) => void;
};
export type StreamPatchChangeHandler = (streamIndex: number, patch: StreamPatch) => void;

export function selectedStreamPatchHandlersForIndex(
  streamIndex: number,
  changeStream: StreamPatchChangeHandler
): StreamPatchHandlers {
  return {
    applyPatch: (patch) => changeStream(streamIndex, patch)
  };
}

export type SelectedStreamPatchAction =
  | {
      kind: "stream-mode";
      mode: ProfileWorkbenchStream["mode"];
    }
  | {
      enabled: boolean;
      kind: "stream-enabled";
    }
  | {
      kind: "self-start";
      selfStart: boolean;
    }
  | {
      kind: "total-packets";
      totalPackets: number;
    }
  | {
      count: number;
      kind: "burst-count";
    }
  | {
      kind: "packets-per-burst";
      packetsPerBurst: number;
    }
  | {
      kind: "rate-type";
      rateType: ProfileWorkbenchStream["rate_type"];
    }
  | {
      kind: "rate-value";
      rateValue: number;
    }
  | {
      kind: "after-stream-stop";
    }
  | {
      kind: "after-stream-goto";
    }
  | {
      kind: "next-stream";
      nextStreamId: number;
    }
  | {
      enabled: boolean;
      kind: "loop-action-count-enabled";
    }
  | {
      actionCount: number;
      kind: "loop-action-count";
    }
  | {
      isg: number;
      kind: "isg";
    }
  | {
      ibg: number;
      kind: "ibg";
    }
  | {
      enabled: boolean;
      kind: "flow-stats-enabled";
    }
  | {
      kind: "pg-id";
      pgId: number;
    }
  | {
      enabled: boolean;
      kind: "latency-enabled";
    }
  | {
      kind: "stream-name";
      name: string;
    }
  | {
      frameLength: number;
      kind: "packet-frame-length";
    }
  | {
      frameLengthMin: number;
      kind: "frame-length-min";
    }
  | {
      frameLengthMax: number;
      kind: "frame-length-max";
    }
  | {
      kind: "ether-type-override";
      override: boolean;
    }
  | {
      etherType: string;
      kind: "ether-type";
    }
  | {
      address: string;
      kind: "ether-dst";
    }
  | {
      kind: "ether-dst-mode";
      mode: ProfileWorkbenchStream["ether_dst_mode"];
    }
  | {
      count: number;
      kind: "ether-dst-count";
    }
  | {
      kind: "ether-dst-step";
      step: number;
    }
  | {
      address: string;
      kind: "ether-src";
    }
  | {
      kind: "ether-src-mode";
      mode: ProfileWorkbenchStream["ether_src_mode"];
    }
  | {
      count: number;
      kind: "ether-src-count";
    }
  | {
      kind: "ether-src-step";
      step: number;
    }
  | {
      kind: "arp-hardware-type";
      value: number;
    }
  | {
      kind: "arp-protocol-type";
      value: string;
    }
  | {
      kind: "arp-hardware-size";
      value: number;
    }
  | {
      kind: "arp-protocol-size";
      value: number;
    }
  | {
      kind: "arp-operation";
      value: number;
    }
  | {
      kind: "arp-operation-mode";
      mode: ProfileWorkbenchStream["arp_operation_mode"];
    }
  | {
      count: number;
      kind: "arp-operation-count";
    }
  | {
      kind: "arp-operation-step";
      step: number;
    }
  | {
      kind: "arp-sender-mac";
      value: string;
    }
  | {
      kind: "arp-sender-mac-mode";
      mode: ProfileWorkbenchStream["arp_sender_mac_mode"];
    }
  | {
      count: number;
      kind: "arp-sender-mac-count";
    }
  | {
      kind: "arp-sender-mac-step";
      step: number;
    }
  | {
      kind: "arp-sender-ip";
      value: string;
    }
  | {
      kind: "arp-sender-ip-mode";
      mode: ProfileWorkbenchStream["arp_sender_ip_mode"];
    }
  | {
      count: number;
      kind: "arp-sender-ip-count";
    }
  | {
      kind: "arp-sender-ip-step";
      step: number;
    }
  | {
      kind: "arp-target-mac";
      value: string;
    }
  | {
      kind: "arp-target-mac-mode";
      mode: ProfileWorkbenchStream["arp_target_mac_mode"];
    }
  | {
      count: number;
      kind: "arp-target-mac-count";
    }
  | {
      kind: "arp-target-mac-step";
      step: number;
    }
  | {
      kind: "arp-target-ip";
      value: string;
    }
  | {
      kind: "arp-target-ip-mode";
      mode: ProfileWorkbenchStream["arp_target_ip_mode"];
    }
  | {
      count: number;
      kind: "arp-target-ip-count";
    }
  | {
      kind: "arp-target-ip-step";
      step: number;
    }
  | {
      address: string;
      kind: "ipv4-dst";
    }
  | {
      kind: "ipv4-dst-mode";
      mode: ProfileWorkbenchStream["ipv4_dst_mode"];
    }
  | {
      count: ProfileWorkbenchStream["ipv4_dst_count"];
      kind: "ipv4-dst-count";
    }
  | {
      kind: "ipv4-dst-step";
      step: number;
    }
  | {
      address: string;
      kind: "ipv4-src";
    }
  | {
      kind: "ipv4-src-mode";
      mode: ProfileWorkbenchStream["ipv4_src_mode"];
    }
  | {
      count: ProfileWorkbenchStream["ipv4_src_count"];
      kind: "ipv4-src-count";
    }
  | {
      kind: "ipv4-src-step";
      step: number;
    }
  | {
      dscp: number;
      kind: "ipv4-dscp";
    }
  | {
      kind: "ipv4-dscp-mode";
      mode: ProfileWorkbenchStream["ipv4_dscp_mode"];
    }
  | {
      count: number;
      kind: "ipv4-dscp-count";
    }
  | {
      kind: "ipv4-dscp-step";
      step: number;
    }
  | {
      ecn: number;
      kind: "ipv4-ecn";
    }
  | {
      kind: "ipv4-ecn-mode";
      mode: ProfileWorkbenchStream["ipv4_ecn_mode"];
    }
  | {
      count: number;
      kind: "ipv4-ecn-count";
    }
  | {
      kind: "ipv4-ecn-step";
      step: number;
    }
  | {
      identification: number;
      kind: "ipv4-identification";
    }
  | {
      kind: "ipv4-identification-mode";
      mode: ProfileWorkbenchStream["ipv4_id_mode"];
    }
  | {
      count: number;
      kind: "ipv4-identification-count";
    }
  | {
      kind: "ipv4-identification-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "ipv4-df-flag";
    }
  | {
      enabled: boolean;
      kind: "ipv4-mf-flag";
    }
  | {
      fragmentOffset: number;
      kind: "ipv4-fragment-offset";
    }
  | {
      kind: "ipv4-fragment-offset-mode";
      mode: ProfileWorkbenchStream["ipv4_fragment_offset_mode"];
    }
  | {
      count: number;
      kind: "ipv4-fragment-offset-count";
    }
  | {
      kind: "ipv4-fragment-offset-step";
      step: number;
    }
  | {
      kind: "ipv4-ttl";
      ttl: number;
    }
  | {
      kind: "ipv4-ttl-mode";
      mode: ProfileWorkbenchStream["ipv4_ttl_mode"];
    }
  | {
      count: number;
      kind: "ipv4-ttl-count";
    }
  | {
      kind: "ipv4-ttl-step";
      step: number;
    }
  | {
      kind: "ipv4-checksum-override";
      override: boolean;
    }
  | {
      checksum: string;
      kind: "ipv4-checksum";
    }
  | {
      address: string;
      kind: "ipv6-dst";
    }
  | {
      kind: "ipv6-dst-mode";
      mode: ProfileWorkbenchStream["ipv6_dst_mode"];
    }
  | {
      count: number;
      kind: "ipv6-dst-count";
    }
  | {
      kind: "ipv6-dst-step";
      step: number;
    }
  | {
      address: string;
      kind: "ipv6-src";
    }
  | {
      kind: "ipv6-src-mode";
      mode: ProfileWorkbenchStream["ipv6_src_mode"];
    }
  | {
      count: number;
      kind: "ipv6-src-count";
    }
  | {
      kind: "ipv6-src-step";
      step: number;
    }
  | {
      kind: "ipv6-traffic-class";
      trafficClass: number;
    }
  | {
      kind: "ipv6-traffic-class-mode";
      mode: ProfileWorkbenchStream["ipv6_traffic_class_mode"];
    }
  | {
      count: number;
      kind: "ipv6-traffic-class-count";
    }
  | {
      kind: "ipv6-traffic-class-step";
      step: number;
    }
  | {
      flowLabel: number;
      kind: "ipv6-flow-label";
    }
  | {
      kind: "ipv6-flow-label-mode";
      mode: ProfileWorkbenchStream["ipv6_flow_label_mode"];
    }
  | {
      count: number;
      kind: "ipv6-flow-label-count";
    }
  | {
      kind: "ipv6-flow-label-step";
      step: number;
    }
  | {
      hopLimit: number;
      kind: "ipv6-hop-limit";
    }
  | {
      kind: "ipv6-hop-limit-mode";
      mode: ProfileWorkbenchStream["ipv6_hop_limit_mode"];
    }
  | {
      count: number;
      kind: "ipv6-hop-limit-count";
    }
  | {
      kind: "ipv6-hop-limit-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "vlan-selection";
    }
  | {
      kind: "vlan-tpid-override";
      override: boolean;
    }
  | {
      kind: "vlan-tpid";
      tpid: string;
    }
  | {
      kind: "vlan-priority";
      priority: number;
    }
  | {
      kind: "vlan-priority-mode";
      mode: ProfileWorkbenchStream["vlan_priority_mode"];
    }
  | {
      count: number;
      kind: "vlan-priority-count";
    }
  | {
      kind: "vlan-priority-step";
      step: number;
    }
  | {
      cfi: number;
      kind: "vlan-cfi";
    }
  | {
      kind: "vlan-id";
      vlanId: number;
    }
  | {
      kind: "vlan-id-mode";
      mode: ProfileWorkbenchStream["vlan_id_mode"];
    }
  | {
      count: number;
      kind: "vlan-id-count";
    }
  | {
      kind: "vlan-id-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "vlan-inner-selection";
    }
  | {
      kind: "vlan-inner-tpid-override";
      override: boolean;
    }
  | {
      kind: "vlan-inner-tpid";
      tpid: string;
    }
  | {
      kind: "vlan-inner-priority";
      priority: number;
    }
  | {
      kind: "vlan-inner-priority-mode";
      mode: ProfileWorkbenchStream["vlan2_priority_mode"];
    }
  | {
      count: number;
      kind: "vlan-inner-priority-count";
    }
  | {
      kind: "vlan-inner-priority-step";
      step: number;
    }
  | {
      cfi: number;
      kind: "vlan-inner-cfi";
    }
  | {
      kind: "vlan-inner-id";
      vlanId: number;
    }
  | {
      kind: "vlan-inner-id-mode";
      mode: ProfileWorkbenchStream["vlan2_id_mode"];
    }
  | {
      count: number;
      kind: "vlan-inner-id-count";
    }
  | {
      kind: "vlan-inner-id-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "mpls-selection";
    }
  | {
      kind: "mpls-label";
      label: number;
    }
  | {
      kind: "mpls-label-mode";
      mode: ProfileWorkbenchStream["mpls_label_mode"];
    }
  | {
      count: number;
      kind: "mpls-label-count";
    }
  | {
      kind: "mpls-label-step";
      step: number;
    }
  | {
      kind: "mpls-traffic-class";
      trafficClass: number;
    }
  | {
      kind: "mpls-traffic-class-mode";
      mode: ProfileWorkbenchStream["mpls_tc_mode"];
    }
  | {
      count: number;
      kind: "mpls-traffic-class-count";
    }
  | {
      kind: "mpls-traffic-class-step";
      step: number;
    }
  | {
      kind: "mpls-ttl";
      ttl: number;
    }
  | {
      kind: "mpls-ttl-mode";
      mode: ProfileWorkbenchStream["mpls_ttl_mode"];
    }
  | {
      count: number;
      kind: "mpls-ttl-count";
    }
  | {
      kind: "mpls-ttl-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "mpls-second-label-selection";
    }
  | {
      kind: "mpls-second-label";
      label: number;
    }
  | {
      kind: "mpls-second-label-mode";
      mode: ProfileWorkbenchStream["mpls_label2_mode"];
    }
  | {
      count: number;
      kind: "mpls-second-label-count";
    }
  | {
      kind: "mpls-second-label-step";
      step: number;
    }
  | {
      kind: "mpls-second-traffic-class";
      trafficClass: number;
    }
  | {
      kind: "mpls-second-traffic-class-mode";
      mode: ProfileWorkbenchStream["mpls_label2_tc_mode"];
    }
  | {
      count: number;
      kind: "mpls-second-traffic-class-count";
    }
  | {
      kind: "mpls-second-traffic-class-step";
      step: number;
    }
  | {
      kind: "mpls-second-ttl";
      ttl: number;
    }
  | {
      kind: "mpls-second-ttl-mode";
      mode: ProfileWorkbenchStream["mpls_label2_ttl_mode"];
    }
  | {
      count: number;
      kind: "mpls-second-ttl-count";
    }
  | {
      kind: "mpls-second-ttl-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "mpls-third-label-selection";
    }
  | {
      kind: "mpls-third-label";
      label: number;
    }
  | {
      kind: "mpls-third-label-mode";
      mode: ProfileWorkbenchStream["mpls_label3_mode"];
    }
  | {
      count: number;
      kind: "mpls-third-label-count";
    }
  | {
      kind: "mpls-third-label-step";
      step: number;
    }
  | {
      kind: "mpls-third-traffic-class";
      trafficClass: number;
    }
  | {
      kind: "mpls-third-traffic-class-mode";
      mode: ProfileWorkbenchStream["mpls_label3_tc_mode"];
    }
  | {
      count: number;
      kind: "mpls-third-traffic-class-count";
    }
  | {
      kind: "mpls-third-traffic-class-step";
      step: number;
    }
  | {
      kind: "mpls-third-ttl";
      ttl: number;
    }
  | {
      kind: "mpls-third-ttl-mode";
      mode: ProfileWorkbenchStream["mpls_label3_ttl_mode"];
    }
  | {
      count: number;
      kind: "mpls-third-ttl-count";
    }
  | {
      kind: "mpls-third-ttl-step";
      step: number;
    }
  | {
      kind: "tunnel-selection";
      tunnel: "none" | "vxlan" | "gtpu";
    }
  | {
      kind: "l3-selection";
      selection: L3Selection;
    }
  | {
      kind: "l4-selection";
      selection: L4Selection;
    }
  | {
      enabled: boolean;
      kind: "l4-src-port-override-selection";
    }
  | {
      kind: "l4-src-port";
      port: number;
    }
  | {
      kind: "l4-src-port-mode";
      mode: ProfileWorkbenchStream["l4_src_port_mode"];
    }
  | {
      count: number;
      kind: "l4-src-port-count";
    }
  | {
      kind: "l4-src-port-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "l4-dst-port-override-selection";
    }
  | {
      kind: "l4-dst-port";
      port: number;
    }
  | {
      kind: "l4-dst-port-mode";
      mode: ProfileWorkbenchStream["l4_dst_port_mode"];
    }
  | {
      count: number;
      kind: "l4-dst-port-count";
    }
  | {
      kind: "l4-dst-port-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "udp-length-override-selection";
    }
  | {
      kind: "udp-length";
      length: number;
    }
  | {
      kind: "udp-length-mode";
      mode: ProfileWorkbenchStream["udp_length_mode"];
    }
  | {
      count: number;
      kind: "udp-length-count";
    }
  | {
      kind: "udp-length-step";
      step: number;
    }
  | {
      kind: "udp-checksum-override";
      override: boolean;
    }
  | {
      checksum: string;
      kind: "udp-checksum";
    }
  | {
      kind: "udp-checksum-mode";
      mode: ProfileWorkbenchStream["udp_checksum_mode"];
    }
  | {
      count: number;
      kind: "udp-checksum-count";
    }
  | {
      kind: "udp-checksum-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "payload-selection";
    }
  | {
      kind: "payload-type";
      payloadType: ProfileWorkbenchStream["payload_type"];
    }
  | {
      kind: "payload-pattern";
      pattern: string;
    }
  | {
      kind: "payload-pattern-import";
      pattern: string;
    }
  | {
      cacheSizeType: ProfileWorkbenchStream["advanced_cache_size_type"];
      kind: "advanced-cache-size-type";
    }
  | {
      cacheValue: number;
      kind: "advanced-cache-value";
    }
  | {
      enabled: boolean;
      kind: "dns-selection";
    }
  | {
      enabled: boolean;
      kind: "dns-answer-selection";
    }
  | {
      field: DnsNumericPatchField;
      kind: "dns-number";
      value: number;
    }
  | {
      field: DnsTextPatchField;
      kind: "dns-text";
      value: string;
    }
  | DnsModePatchAction
  | {
      count: number;
      field: DnsVariablePatchField;
      kind: "dns-count";
    }
  | {
      field: DnsVariablePatchField;
      kind: "dns-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "dhcp-selection";
    }
  | {
      field: DhcpBootpNumericPatchField;
      kind: "dhcp-bootp-number";
      value: number;
    }
  | {
      field: DhcpBootpTextPatchField;
      kind: "dhcp-bootp-text";
      value: string;
    }
  | DhcpBootpModePatchAction
  | {
      count: number;
      field: DhcpBootpVariablePatchField;
      kind: "dhcp-bootp-count";
    }
  | {
      field: DhcpBootpVariablePatchField;
      kind: "dhcp-bootp-step";
      step: number;
    }
  | {
      field: DhcpBootpAddressPatchField;
      kind: "dhcp-bootp-address-text";
      value: string;
    }
  | DhcpBootpAddressModePatchAction
  | {
      count: number;
      field: DhcpBootpAddressPatchField;
      kind: "dhcp-bootp-address-count";
    }
  | {
      field: DhcpBootpAddressPatchField;
      kind: "dhcp-bootp-address-step";
      step: number;
    }
  | {
      field: DhcpOptionTextPatchField;
      kind: "dhcp-option-text";
      value: string;
    }
  | {
      field: DhcpOptionTimerPatchField;
      kind: "dhcp-option-timer-number";
      value: number;
    }
  | DhcpOptionTimerModePatchAction
  | {
      count: number;
      field: DhcpOptionTimerPatchField;
      kind: "dhcp-option-timer-count";
    }
  | {
      field: DhcpOptionTimerPatchField;
      kind: "dhcp-option-timer-step";
      step: number;
    }
  | {
      field: DhcpOptionAddressPatchField;
      kind: "dhcp-option-address-text";
      value: string;
    }
  | DhcpOptionAddressModePatchAction
  | {
      count: number;
      field: DhcpOptionAddressPatchField;
      kind: "dhcp-option-address-count";
    }
  | {
      field: DhcpOptionAddressPatchField;
      kind: "dhcp-option-address-step";
      step: number;
    }
  | {
      frameLengthType: ProfileWorkbenchStream["frame_length_type"];
      kind: "frame-length-type";
    }
  | {
      kind: "packet-type";
      packetType: ProfileWorkbenchStream["packet_type"];
    }
  | {
      icmpType: number;
      kind: "icmp-type";
    }
  | {
      kind: "icmp-type-mode";
      mode: ProfileWorkbenchStream["icmp_type_mode"];
    }
  | {
      count: number;
      kind: "icmp-type-count";
    }
  | {
      kind: "icmp-type-step";
      step: number;
    }
  | {
      code: number;
      kind: "icmp-code";
    }
  | {
      kind: "icmp-code-mode";
      mode: ProfileWorkbenchStream["icmp_code_mode"];
    }
  | {
      count: number;
      kind: "icmp-code-count";
    }
  | {
      kind: "icmp-code-step";
      step: number;
    }
  | {
      identifier: number;
      kind: "icmp-identifier";
    }
  | {
      kind: "icmp-identifier-mode";
      mode: ProfileWorkbenchStream["icmp_identifier_mode"];
    }
  | {
      count: number;
      kind: "icmp-identifier-count";
    }
  | {
      kind: "icmp-identifier-step";
      step: number;
    }
  | {
      kind: "icmp-sequence";
      sequence: number;
    }
  | {
      kind: "icmp-sequence-mode";
      mode: ProfileWorkbenchStream["icmp_sequence_mode"];
    }
  | {
      count: number;
      kind: "icmp-sequence-count";
    }
  | {
      kind: "icmp-sequence-step";
      step: number;
    }
  | {
      kind: "icmp-checksum-override";
      override: boolean;
    }
  | {
      checksum: string;
      kind: "icmp-checksum";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-rs-slla-selection";
    }
  | {
      kind: "icmpv6-rs-slla-mac";
      mac: string;
    }
  | {
      hopLimit: number;
      kind: "icmpv6-ra-current-hop-limit";
    }
  | {
      kind: "icmpv6-ra-router-lifetime";
      lifetime: number;
    }
  | {
      kind: "icmpv6-ra-reachable-time";
      reachableTime: number;
    }
  | {
      kind: "icmpv6-ra-retrans-timer";
      retransTimer: number;
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-managed-flag";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-other-flag";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-slla-selection";
    }
  | {
      kind: "icmpv6-ra-slla-mac";
      mac: string;
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-prefix-selection";
    }
  | {
      kind: "icmpv6-ra-prefix";
      prefix: string;
    }
  | {
      kind: "icmpv6-ra-prefix-length";
      prefixLength: number;
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-prefix-on-link-flag";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-ra-prefix-autonomous-flag";
    }
  | {
      kind: "icmpv6-ra-prefix-valid-lifetime";
      lifetime: number;
    }
  | {
      kind: "icmpv6-ra-prefix-preferred-lifetime";
      lifetime: number;
    }
  | {
      kind: "icmpv6-nd-target";
      target: string;
    }
  | {
      enabled: boolean;
      kind: "icmpv6-nd-option-selection";
    }
  | {
      kind: "icmpv6-nd-option-mac";
      mac: string;
    }
  | {
      enabled: boolean;
      kind: "icmpv6-nd-na-router-flag";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-nd-na-solicited-flag";
    }
  | {
      enabled: boolean;
      kind: "icmpv6-nd-na-override-flag";
    }
  | {
      enabled: boolean;
      kind: "vxlan-selection";
    }
  | {
      kind: "vxlan-vni";
      vni: number;
    }
  | {
      kind: "vxlan-vni-mode";
      mode: ProfileWorkbenchStream["vxlan_vni_mode"];
    }
  | {
      count: number;
      kind: "vxlan-vni-count";
    }
  | {
      kind: "vxlan-vni-step";
      step: number;
    }
  | {
      kind: "vxlan-inner-ip-version";
      version: ProfileWorkbenchStream["vxlan_inner_ip_version"];
    }
  | {
      kind: "vxlan-inner-ipv6-hop-limit";
      hopLimit: number;
    }
  | {
      kind: "vxlan-inner-ipv6-hop-limit-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv6-hop-limit-count";
    }
  | {
      kind: "vxlan-inner-ipv6-hop-limit-step";
      step: number;
    }
  | {
      kind: "vxlan-inner-ipv4-ttl";
      ttl: number;
    }
  | {
      kind: "vxlan-inner-ipv4-ttl-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv4-ttl-count";
    }
  | {
      kind: "vxlan-inner-ipv4-ttl-step";
      step: number;
    }
  | {
      address: string;
      kind: "vxlan-inner-ether-dst";
    }
  | {
      address: string;
      kind: "vxlan-inner-ether-src";
    }
  | {
      address: string;
      kind: "vxlan-inner-ipv6-src";
    }
  | {
      kind: "vxlan-inner-ipv6-src-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv6_src_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv6-src-count";
    }
  | {
      kind: "vxlan-inner-ipv6-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "vxlan-inner-ipv6-dst";
    }
  | {
      kind: "vxlan-inner-ipv6-dst-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv6_dst_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv6-dst-count";
    }
  | {
      kind: "vxlan-inner-ipv6-dst-step";
      step: number;
    }
  | {
      address: string;
      kind: "vxlan-inner-ipv4-src";
    }
  | {
      kind: "vxlan-inner-ipv4-src-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv4_src_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv4-src-count";
    }
  | {
      kind: "vxlan-inner-ipv4-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "vxlan-inner-ipv4-dst";
    }
  | {
      kind: "vxlan-inner-ipv4-dst-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_ipv4_dst_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-ipv4-dst-count";
    }
  | {
      kind: "vxlan-inner-ipv4-dst-step";
      step: number;
    }
  | {
      kind: "vxlan-inner-l4-src-port";
      port: number;
    }
  | {
      kind: "vxlan-inner-l4-src-port-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_l4_src_port_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-l4-src-port-count";
    }
  | {
      kind: "vxlan-inner-l4-src-port-step";
      step: number;
    }
  | {
      kind: "vxlan-inner-l4-dst-port";
      port: number;
    }
  | {
      kind: "vxlan-inner-l4-dst-port-mode";
      mode: ProfileWorkbenchStream["vxlan_inner_l4_dst_port_mode"];
    }
  | {
      count: number;
      kind: "vxlan-inner-l4-dst-port-count";
    }
  | {
      kind: "vxlan-inner-l4-dst-port-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gtpu-selection";
    }
  | {
      kind: "gtpu-message-type";
      messageType: number;
    }
  | {
      kind: "gtpu-teid";
      teid: number;
    }
  | {
      kind: "gtpu-teid-mode";
      mode: ProfileWorkbenchStream["gtpu_teid_mode"];
    }
  | {
      count: number;
      kind: "gtpu-teid-count";
    }
  | {
      kind: "gtpu-teid-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gtpu-sequence-selection";
    }
  | {
      kind: "gtpu-sequence";
      sequence: number;
    }
  | {
      kind: "gtpu-sequence-mode";
      mode: ProfileWorkbenchStream["gtpu_sequence_mode"];
    }
  | {
      count: number;
      kind: "gtpu-sequence-count";
    }
  | {
      kind: "gtpu-sequence-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gtpu-npdu-selection";
    }
  | {
      kind: "gtpu-npdu";
      npdu: number;
    }
  | {
      kind: "gtpu-npdu-mode";
      mode: ProfileWorkbenchStream["gtpu_npdu_mode"];
    }
  | {
      count: number;
      kind: "gtpu-npdu-count";
    }
  | {
      kind: "gtpu-npdu-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gtpu-extension-selection";
    }
  | {
      kind: "gtpu-extension-udp-port";
      port: number;
    }
  | {
      kind: "gtpu-extension-udp-port-mode";
      mode: ProfileWorkbenchStream["gtpu_extension_udp_port_mode"];
    }
  | {
      count: number;
      kind: "gtpu-extension-udp-port-count";
    }
  | {
      kind: "gtpu-extension-udp-port-step";
      step: number;
    }
  | {
      kind: "gtpu-inner-ip-version";
      version: ProfileWorkbenchStream["gtpu_inner_ip_version"];
    }
  | {
      kind: "gtpu-inner-ipv4-ttl";
      ttl: number;
    }
  | {
      kind: "gtpu-inner-ipv4-ttl-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv4-ttl-count";
    }
  | {
      kind: "gtpu-inner-ipv4-ttl-step";
      step: number;
    }
  | {
      hopLimit: number;
      kind: "gtpu-inner-ipv6-hop-limit";
    }
  | {
      kind: "gtpu-inner-ipv6-hop-limit-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv6-hop-limit-count";
    }
  | {
      kind: "gtpu-inner-ipv6-hop-limit-step";
      step: number;
    }
  | {
      address: string;
      kind: "gtpu-inner-ipv4-src";
    }
  | {
      kind: "gtpu-inner-ipv4-src-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv4_src_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv4-src-count";
    }
  | {
      kind: "gtpu-inner-ipv4-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "gtpu-inner-ipv4-dst";
    }
  | {
      kind: "gtpu-inner-ipv4-dst-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv4_dst_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv4-dst-count";
    }
  | {
      kind: "gtpu-inner-ipv4-dst-step";
      step: number;
    }
  | {
      address: string;
      kind: "gtpu-inner-ipv6-src";
    }
  | {
      kind: "gtpu-inner-ipv6-src-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv6_src_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv6-src-count";
    }
  | {
      kind: "gtpu-inner-ipv6-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "gtpu-inner-ipv6-dst";
    }
  | {
      kind: "gtpu-inner-ipv6-dst-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_ipv6_dst_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-ipv6-dst-count";
    }
  | {
      kind: "gtpu-inner-ipv6-dst-step";
      step: number;
    }
  | {
      kind: "gtpu-inner-l4-src-port";
      port: number;
    }
  | {
      kind: "gtpu-inner-l4-src-port-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_l4_src_port_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-l4-src-port-count";
    }
  | {
      kind: "gtpu-inner-l4-src-port-step";
      step: number;
    }
  | {
      kind: "gtpu-inner-l4-dst-port";
      port: number;
    }
  | {
      kind: "gtpu-inner-l4-dst-port-mode";
      mode: ProfileWorkbenchStream["gtpu_inner_l4_dst_port_mode"];
    }
  | {
      count: number;
      kind: "gtpu-inner-l4-dst-port-count";
    }
  | {
      kind: "gtpu-inner-l4-dst-port-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gre-checksum-selection";
    }
  | {
      enabled: boolean;
      kind: "gre-checksum-override";
    }
  | {
      checksum: string;
      kind: "gre-checksum";
    }
  | {
      enabled: boolean;
      kind: "gre-key-selection";
    }
  | {
      key: number;
      kind: "gre-key";
    }
  | {
      kind: "gre-key-mode";
      mode: ProfileWorkbenchStream["gre_key_mode"];
    }
  | {
      count: number;
      kind: "gre-key-count";
    }
  | {
      kind: "gre-key-step";
      step: number;
    }
  | {
      enabled: boolean;
      kind: "gre-sequence-selection";
    }
  | {
      kind: "gre-sequence";
      sequence: number;
    }
  | {
      kind: "gre-sequence-mode";
      mode: ProfileWorkbenchStream["gre_sequence_mode"];
    }
  | {
      count: number;
      kind: "gre-sequence-count";
    }
  | {
      kind: "gre-sequence-step";
      step: number;
    }
  | {
      address: string;
      kind: "gre-inner-ipv6-src";
    }
  | {
      kind: "gre-inner-ipv6-src-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv6_src_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv6-src-count";
    }
  | {
      kind: "gre-inner-ipv6-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "gre-inner-ipv6-dst";
    }
  | {
      kind: "gre-inner-ipv6-dst-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv6_dst_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv6-dst-count";
    }
  | {
      kind: "gre-inner-ipv6-dst-step";
      step: number;
    }
  | {
      hopLimit: number;
      kind: "gre-inner-ipv6-hop-limit";
    }
  | {
      kind: "gre-inner-ipv6-hop-limit-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv6-hop-limit-count";
    }
  | {
      kind: "gre-inner-ipv6-hop-limit-step";
      step: number;
    }
  | {
      address: string;
      kind: "gre-inner-ipv4-src";
    }
  | {
      kind: "gre-inner-ipv4-src-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv4_src_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv4-src-count";
    }
  | {
      kind: "gre-inner-ipv4-src-step";
      step: number;
    }
  | {
      address: string;
      kind: "gre-inner-ipv4-dst";
    }
  | {
      kind: "gre-inner-ipv4-dst-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv4_dst_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv4-dst-count";
    }
  | {
      kind: "gre-inner-ipv4-dst-step";
      step: number;
    }
  | {
      kind: "gre-inner-ipv4-ttl";
      ttl: number;
    }
  | {
      kind: "gre-inner-ipv4-ttl-mode";
      mode: ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-ipv4-ttl-count";
    }
  | {
      kind: "gre-inner-ipv4-ttl-step";
      step: number;
    }
  | {
      kind: "gre-inner-l4-src-port";
      port: number;
    }
  | {
      kind: "gre-inner-l4-src-port-mode";
      mode: ProfileWorkbenchStream["gre_inner_l4_src_port_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-l4-src-port-count";
    }
  | {
      kind: "gre-inner-l4-src-port-step";
      step: number;
    }
  | {
      kind: "gre-inner-l4-dst-port";
      port: number;
    }
  | {
      kind: "gre-inner-l4-dst-port-mode";
      mode: ProfileWorkbenchStream["gre_inner_l4_dst_port_mode"];
    }
  | {
      count: number;
      kind: "gre-inner-l4-dst-port-count";
    }
  | {
      kind: "gre-inner-l4-dst-port-step";
      step: number;
    }
  | {
      kind: "gre-inner-ip-version";
      version: ProfileWorkbenchStream["gre_inner_ip_version"];
    }
  | {
      field: SctpNumericPatchField;
      kind: "sctp-number";
      value: number;
    }
  | SctpModePatchAction
  | {
      count: number;
      field: SctpVariablePatchField;
      kind: "sctp-count";
    }
  | {
      field: SctpVariablePatchField;
      kind: "sctp-step";
      step: number;
    }
  | {
      kind: "sctp-checksum-override";
      override: boolean;
    }
  | {
      checksum: string;
      kind: "sctp-checksum";
    }
  | {
      field: TcpCoreNumericPatchField;
      kind: "tcp-core-number";
      value: number;
    }
  | TcpCoreModePatchAction
  | {
      count: number;
      field: TcpCoreVariablePatchField;
      kind: "tcp-core-count";
    }
  | {
      field: TcpCoreVariablePatchField;
      kind: "tcp-core-step";
      step: number;
    }
  | {
      kind: "tcp-checksum-override";
      override: boolean;
    }
  | {
      checksum: string;
      kind: "tcp-checksum";
    }
  | {
      checked: boolean;
      flag: TcpFlagKey;
      kind: "tcp-flag";
    }
  | {
      enabled: boolean;
      kind: "tcp-option-selection";
      option: TcpOptionSelection;
    }
  | {
      field: TcpOptionNumericPatchField;
      kind: "tcp-option-number";
      value: number;
    }
  | TcpOptionModePatchAction
  | {
      count: number;
      field: TcpOptionVariablePatchField;
      kind: "tcp-option-count";
    }
  | {
      field: TcpOptionVariablePatchField;
      kind: "tcp-option-step";
      step: number;
    };
export type IcmpChecksumCoupledModeField =
  | "icmp_type_mode"
  | "icmp_code_mode"
  | "icmp_identifier_mode"
  | "icmp_sequence_mode";
export type GreChecksumInvalidatingModeField =
  | "gre_key_mode"
  | "gre_sequence_mode"
  | "gre_inner_ipv6_src_mode"
  | "gre_inner_ipv6_dst_mode"
  | "gre_inner_ipv6_hop_limit_mode"
  | "gre_inner_ipv4_src_mode"
  | "gre_inner_ipv4_dst_mode"
  | "gre_inner_ipv4_ttl_mode"
  | "gre_inner_l4_src_port_mode"
  | "gre_inner_l4_dst_port_mode";
export type GrePresenceField = "gre_key_present" | "gre_sequence_present";
export type L4PortOverrideSelection = "source" | "destination";
export type SctpChecksumCoupledModeField =
  | "sctp_verification_tag_mode"
  | "sctp_data_flags_mode"
  | "sctp_tsn_mode"
  | "sctp_stream_id_mode"
  | "sctp_stream_sequence_mode"
  | "sctp_payload_protocol_id_mode";
export type SctpNumericPatchField =
  | "verification-tag"
  | "data-flags"
  | "tsn"
  | "stream-id"
  | "stream-sequence"
  | "payload-protocol-id";
export type SctpVariablePatchField = SctpNumericPatchField;
export type SctpModePatchAction =
  | {
      field: "verification-tag";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_verification_tag_mode"];
    }
  | {
      field: "data-flags";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_data_flags_mode"];
    }
  | {
      field: "tsn";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_tsn_mode"];
    }
  | {
      field: "stream-id";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_stream_id_mode"];
    }
  | {
      field: "stream-sequence";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_stream_sequence_mode"];
    }
  | {
      field: "payload-protocol-id";
      kind: "sctp-mode";
      mode: ProfileWorkbenchStream["sctp_payload_protocol_id_mode"];
    };
export type TcpCoreNumericPatchField = "sequence" | "acknowledge" | "window" | "urgent-pointer";
export type TcpCoreVariablePatchField = TcpCoreNumericPatchField | "checksum" | "flags";
export type TcpCoreModePatchAction =
  | {
      field: "sequence";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_sequence_mode"];
    }
  | {
      field: "acknowledge";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_ack_mode"];
    }
  | {
      field: "window";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_window_mode"];
    }
  | {
      field: "checksum";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_checksum_mode"];
    }
  | {
      field: "urgent-pointer";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_urgent_pointer_mode"];
    }
  | {
      field: "flags";
      kind: "tcp-core-mode";
      mode: ProfileWorkbenchStream["tcp_flags_mode"];
    };
export type TcpOptionSelection = "mss" | "window-scale" | "sack-permitted" | "sack-block" | "timestamp";
export type TcpOptionNumericPatchField =
  | "mss"
  | "window-scale"
  | "sack-left-edge"
  | "sack-right-edge"
  | "timestamp-value"
  | "timestamp-echo";
export type TcpOptionVariablePatchField = TcpOptionNumericPatchField;
export type TcpOptionModePatchAction =
  | {
      field: "mss";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_mss_mode"];
    }
  | {
      field: "window-scale";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_window_scale_mode"];
    }
  | {
      field: "sack-left-edge";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"];
    }
  | {
      field: "sack-right-edge";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_sack_right_edge_mode"];
    }
  | {
      field: "timestamp-value";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_timestamp_value_mode"];
    }
  | {
      field: "timestamp-echo";
      kind: "tcp-option-mode";
      mode: ProfileWorkbenchStream["tcp_option_timestamp_echo_mode"];
    };
export type DnsNumericPatchField =
  | "transaction-id"
  | "query-type"
  | "query-class"
  | "answer-ttl";
export type DnsTextPatchField = "flags" | "query-name" | "answer-ipv4";
export type DnsVariablePatchField =
  | "transaction-id"
  | "flags"
  | "query-type"
  | "query-class"
  | "answer-ttl"
  | "answer-ipv4";
export type DnsModePatchAction =
  | {
      field: "transaction-id";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_transaction_id_mode"];
    }
  | {
      field: "flags";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_flags_mode"];
    }
  | {
      field: "query-type";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_query_type_mode"];
    }
  | {
      field: "query-class";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_query_class_mode"];
    }
  | {
      field: "answer-ttl";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_answer_ttl_mode"];
    }
  | {
      field: "answer-ipv4";
      kind: "dns-mode";
      mode: ProfileWorkbenchStream["dns_answer_ipv4_mode"];
    };
export type DhcpBootpNumericPatchField =
  | "operation"
  | "hops"
  | "seconds"
  | "message-type"
  | "xid";
export type DhcpBootpTextPatchField = "flags";
export type DhcpBootpVariablePatchField =
  | "operation"
  | "hops"
  | "seconds"
  | "message-type"
  | "xid"
  | "flags";
export type DhcpBootpAddressPatchField =
  | "client-ip"
  | "your-ip"
  | "server-ip"
  | "relay-ip"
  | "client-mac";
export type DhcpOptionTextPatchField = "hostname" | "parameter-request-list";
export type DhcpOptionTimerPatchField = "lease-time" | "renewal-time" | "rebinding-time";
export type DhcpOptionAddressPatchField = "requested-ip" | "server-id";
export type DhcpBootpModePatchAction =
  | {
      field: "operation";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_operation_mode"];
    }
  | {
      field: "hops";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_hops_mode"];
    }
  | {
      field: "seconds";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_seconds_mode"];
    }
  | {
      field: "message-type";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_message_type_mode"];
    }
  | {
      field: "xid";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_xid_mode"];
    }
  | {
      field: "flags";
      kind: "dhcp-bootp-mode";
      mode: ProfileWorkbenchStream["dhcp_flags_mode"];
    };
export type DhcpBootpAddressModePatchAction =
  | {
      field: "client-ip";
      kind: "dhcp-bootp-address-mode";
      mode: ProfileWorkbenchStream["dhcp_client_ip_mode"];
    }
  | {
      field: "your-ip";
      kind: "dhcp-bootp-address-mode";
      mode: ProfileWorkbenchStream["dhcp_your_ip_mode"];
    }
  | {
      field: "server-ip";
      kind: "dhcp-bootp-address-mode";
      mode: ProfileWorkbenchStream["dhcp_server_ip_mode"];
    }
  | {
      field: "relay-ip";
      kind: "dhcp-bootp-address-mode";
      mode: ProfileWorkbenchStream["dhcp_relay_ip_mode"];
    }
  | {
      field: "client-mac";
      kind: "dhcp-bootp-address-mode";
      mode: ProfileWorkbenchStream["dhcp_client_mac_mode"];
    };
export type DhcpOptionTimerModePatchAction =
  | {
      field: "lease-time";
      kind: "dhcp-option-timer-mode";
      mode: ProfileWorkbenchStream["dhcp_lease_time_mode"];
    }
  | {
      field: "renewal-time";
      kind: "dhcp-option-timer-mode";
      mode: ProfileWorkbenchStream["dhcp_renewal_time_mode"];
    }
  | {
      field: "rebinding-time";
      kind: "dhcp-option-timer-mode";
      mode: ProfileWorkbenchStream["dhcp_rebinding_time_mode"];
    };
export type DhcpOptionAddressModePatchAction =
  | {
      field: "requested-ip";
      kind: "dhcp-option-address-mode";
      mode: ProfileWorkbenchStream["dhcp_requested_ip_mode"];
    }
  | {
      field: "server-id";
      kind: "dhcp-option-address-mode";
      mode: ProfileWorkbenchStream["dhcp_server_id_mode"];
    };

export function runStreamPatch(patch: StreamPatch | null, handlers: StreamPatchHandlers) {
  if (!patch) {
    return false;
  }
  handlers.applyPatch(patch);
  return true;
}

export function dnsNumericPatch(field: DnsNumericPatchField, value: number): StreamPatch {
  switch (field) {
    case "transaction-id":
      return { dns_transaction_id: value };
    case "query-type":
      return { dns_query_type: value };
    case "query-class":
      return { dns_query_class: value };
    case "answer-ttl":
      return { dns_answer_ttl: value };
  }
}

export function dnsTextPatch(field: DnsTextPatchField, value: string): StreamPatch {
  switch (field) {
    case "flags":
      return { dns_flags: value };
    case "query-name":
      return { dns_query_name: value };
    case "answer-ipv4":
      return { dns_answer_ipv4: value };
  }
}

export function dnsModePatch(action: DnsModePatchAction): StreamPatch {
  switch (action.field) {
    case "transaction-id":
      return { dns_transaction_id_mode: action.mode };
    case "flags":
      return { dns_flags_mode: action.mode };
    case "query-type":
      return { dns_query_type_mode: action.mode };
    case "query-class":
      return { dns_query_class_mode: action.mode };
    case "answer-ttl":
      return { dns_answer_ttl_mode: action.mode };
    case "answer-ipv4":
      return { dns_answer_ipv4_mode: action.mode };
  }
}

export function dnsCountPatch(field: DnsVariablePatchField, count: number): StreamPatch {
  switch (field) {
    case "transaction-id":
      return { dns_transaction_id_count: count };
    case "flags":
      return { dns_flags_count: count };
    case "query-type":
      return { dns_query_type_count: count };
    case "query-class":
      return { dns_query_class_count: count };
    case "answer-ttl":
      return { dns_answer_ttl_count: count };
    case "answer-ipv4":
      return { dns_answer_ipv4_count: count };
  }
}

export function dnsStepPatch(field: DnsVariablePatchField, step: number): StreamPatch {
  switch (field) {
    case "transaction-id":
      return { dns_transaction_id_step: step };
    case "flags":
      return { dns_flags_step: step };
    case "query-type":
      return { dns_query_type_step: step };
    case "query-class":
      return { dns_query_class_step: step };
    case "answer-ttl":
      return { dns_answer_ttl_step: step };
    case "answer-ipv4":
      return { dns_answer_ipv4_step: step };
  }
}

export function dhcpBootpNumericPatch(field: DhcpBootpNumericPatchField, value: number): StreamPatch {
  switch (field) {
    case "operation":
      return { dhcp_operation: value };
    case "hops":
      return { dhcp_hops: value };
    case "seconds":
      return { dhcp_seconds: value };
    case "message-type":
      return { dhcp_message_type: value };
    case "xid":
      return { dhcp_xid: value };
  }
}

export function dhcpBootpTextPatch(field: DhcpBootpTextPatchField, value: string): StreamPatch {
  switch (field) {
    case "flags":
      return { dhcp_flags: value };
  }
}

export function dhcpBootpModePatch(action: DhcpBootpModePatchAction): StreamPatch {
  switch (action.field) {
    case "operation":
      return { dhcp_operation_mode: action.mode };
    case "hops":
      return { dhcp_hops_mode: action.mode };
    case "seconds":
      return { dhcp_seconds_mode: action.mode };
    case "message-type":
      return { dhcp_message_type_mode: action.mode };
    case "xid":
      return { dhcp_xid_mode: action.mode };
    case "flags":
      return { dhcp_flags_mode: action.mode };
  }
}

export function dhcpBootpCountPatch(field: DhcpBootpVariablePatchField, count: number): StreamPatch {
  switch (field) {
    case "operation":
      return { dhcp_operation_count: count };
    case "hops":
      return { dhcp_hops_count: count };
    case "seconds":
      return { dhcp_seconds_count: count };
    case "message-type":
      return { dhcp_message_type_count: count };
    case "xid":
      return { dhcp_xid_count: count };
    case "flags":
      return { dhcp_flags_count: count };
  }
}

export function dhcpBootpStepPatch(field: DhcpBootpVariablePatchField, step: number): StreamPatch {
  switch (field) {
    case "operation":
      return { dhcp_operation_step: step };
    case "hops":
      return { dhcp_hops_step: step };
    case "seconds":
      return { dhcp_seconds_step: step };
    case "message-type":
      return { dhcp_message_type_step: step };
    case "xid":
      return { dhcp_xid_step: step };
    case "flags":
      return { dhcp_flags_step: step };
  }
}

export function dhcpBootpAddressTextPatch(field: DhcpBootpAddressPatchField, value: string): StreamPatch {
  switch (field) {
    case "client-ip":
      return { dhcp_client_ip: value };
    case "your-ip":
      return { dhcp_your_ip: value };
    case "server-ip":
      return { dhcp_server_ip: value };
    case "relay-ip":
      return { dhcp_relay_ip: value };
    case "client-mac":
      return { dhcp_client_mac: value };
  }
}

export function dhcpBootpAddressModePatch(action: DhcpBootpAddressModePatchAction): StreamPatch {
  switch (action.field) {
    case "client-ip":
      return { dhcp_client_ip_mode: action.mode };
    case "your-ip":
      return { dhcp_your_ip_mode: action.mode };
    case "server-ip":
      return { dhcp_server_ip_mode: action.mode };
    case "relay-ip":
      return { dhcp_relay_ip_mode: action.mode };
    case "client-mac":
      return { dhcp_client_mac_mode: action.mode };
  }
}

export function dhcpBootpAddressCountPatch(field: DhcpBootpAddressPatchField, count: number): StreamPatch {
  switch (field) {
    case "client-ip":
      return { dhcp_client_ip_count: count };
    case "your-ip":
      return { dhcp_your_ip_count: count };
    case "server-ip":
      return { dhcp_server_ip_count: count };
    case "relay-ip":
      return { dhcp_relay_ip_count: count };
    case "client-mac":
      return { dhcp_client_mac_count: count };
  }
}

export function dhcpBootpAddressStepPatch(field: DhcpBootpAddressPatchField, step: number): StreamPatch {
  switch (field) {
    case "client-ip":
      return { dhcp_client_ip_step: step };
    case "your-ip":
      return { dhcp_your_ip_step: step };
    case "server-ip":
      return { dhcp_server_ip_step: step };
    case "relay-ip":
      return { dhcp_relay_ip_step: step };
    case "client-mac":
      return { dhcp_client_mac_step: step };
  }
}

export function dhcpOptionTextPatch(field: DhcpOptionTextPatchField, value: string): StreamPatch {
  switch (field) {
    case "hostname":
      return { dhcp_hostname: value };
    case "parameter-request-list":
      return { dhcp_parameter_request_list: value };
  }
}

export function dhcpOptionTimerNumericPatch(field: DhcpOptionTimerPatchField, value: number): StreamPatch {
  switch (field) {
    case "lease-time":
      return { dhcp_lease_time: value };
    case "renewal-time":
      return { dhcp_renewal_time: value };
    case "rebinding-time":
      return { dhcp_rebinding_time: value };
  }
}

export function dhcpOptionTimerModePatch(action: DhcpOptionTimerModePatchAction): StreamPatch {
  switch (action.field) {
    case "lease-time":
      return { dhcp_lease_time_mode: action.mode };
    case "renewal-time":
      return { dhcp_renewal_time_mode: action.mode };
    case "rebinding-time":
      return { dhcp_rebinding_time_mode: action.mode };
  }
}

export function dhcpOptionTimerCountPatch(field: DhcpOptionTimerPatchField, count: number): StreamPatch {
  switch (field) {
    case "lease-time":
      return { dhcp_lease_time_count: count };
    case "renewal-time":
      return { dhcp_renewal_time_count: count };
    case "rebinding-time":
      return { dhcp_rebinding_time_count: count };
  }
}

export function dhcpOptionTimerStepPatch(field: DhcpOptionTimerPatchField, step: number): StreamPatch {
  switch (field) {
    case "lease-time":
      return { dhcp_lease_time_step: step };
    case "renewal-time":
      return { dhcp_renewal_time_step: step };
    case "rebinding-time":
      return { dhcp_rebinding_time_step: step };
  }
}

export function dhcpOptionAddressTextPatch(field: DhcpOptionAddressPatchField, value: string): StreamPatch {
  switch (field) {
    case "requested-ip":
      return { dhcp_requested_ip: value };
    case "server-id":
      return { dhcp_server_id: value };
  }
}

export function dhcpOptionAddressModePatch(action: DhcpOptionAddressModePatchAction): StreamPatch {
  switch (action.field) {
    case "requested-ip":
      return { dhcp_requested_ip_mode: action.mode };
    case "server-id":
      return { dhcp_server_id_mode: action.mode };
  }
}

export function dhcpOptionAddressCountPatch(field: DhcpOptionAddressPatchField, count: number): StreamPatch {
  switch (field) {
    case "requested-ip":
      return { dhcp_requested_ip_count: count };
    case "server-id":
      return { dhcp_server_id_count: count };
  }
}

export function dhcpOptionAddressStepPatch(field: DhcpOptionAddressPatchField, step: number): StreamPatch {
  switch (field) {
    case "requested-ip":
      return { dhcp_requested_ip_step: step };
    case "server-id":
      return { dhcp_server_id_step: step };
  }
}

export function sctpNumericPatch(field: SctpNumericPatchField, value: number): StreamPatch {
  switch (field) {
    case "verification-tag":
      return { sctp_verification_tag: value };
    case "data-flags":
      return { sctp_data_flags: value };
    case "tsn":
      return { sctp_tsn: value };
    case "stream-id":
      return { sctp_stream_id: value };
    case "stream-sequence":
      return { sctp_stream_sequence: value };
    case "payload-protocol-id":
      return { sctp_payload_protocol_id: value };
  }
}

export function sctpModePatch(action: SctpModePatchAction, stream: ProfileWorkbenchStream): StreamPatch {
  switch (action.field) {
    case "verification-tag":
      return sctpChecksumCoupledModePatch("sctp_verification_tag_mode", action.mode, stream);
    case "data-flags":
      return sctpChecksumCoupledModePatch("sctp_data_flags_mode", action.mode, stream);
    case "tsn":
      return sctpChecksumCoupledModePatch("sctp_tsn_mode", action.mode, stream);
    case "stream-id":
      return sctpChecksumCoupledModePatch("sctp_stream_id_mode", action.mode, stream);
    case "stream-sequence":
      return sctpChecksumCoupledModePatch("sctp_stream_sequence_mode", action.mode, stream);
    case "payload-protocol-id":
      return sctpChecksumCoupledModePatch("sctp_payload_protocol_id_mode", action.mode, stream);
  }
}

export function sctpCountPatch(field: SctpVariablePatchField, count: number): StreamPatch {
  switch (field) {
    case "verification-tag":
      return { sctp_verification_tag_count: count };
    case "data-flags":
      return { sctp_data_flags_count: count };
    case "tsn":
      return { sctp_tsn_count: count };
    case "stream-id":
      return { sctp_stream_id_count: count };
    case "stream-sequence":
      return { sctp_stream_sequence_count: count };
    case "payload-protocol-id":
      return { sctp_payload_protocol_id_count: count };
  }
}

export function sctpStepPatch(field: SctpVariablePatchField, step: number): StreamPatch {
  switch (field) {
    case "verification-tag":
      return { sctp_verification_tag_step: step };
    case "data-flags":
      return { sctp_data_flags_step: step };
    case "tsn":
      return { sctp_tsn_step: step };
    case "stream-id":
      return { sctp_stream_id_step: step };
    case "stream-sequence":
      return { sctp_stream_sequence_step: step };
    case "payload-protocol-id":
      return { sctp_payload_protocol_id_step: step };
  }
}

export function tcpCoreNumericPatch(field: TcpCoreNumericPatchField, value: number): StreamPatch {
  switch (field) {
    case "sequence":
      return { tcp_sequence_number: value };
    case "acknowledge":
      return { tcp_ack_number: value };
    case "window":
      return { tcp_window: value };
    case "urgent-pointer":
      return { tcp_urgent_pointer: value };
  }
}

export function tcpCoreModePatch(action: TcpCoreModePatchAction): StreamPatch {
  switch (action.field) {
    case "sequence":
      return { tcp_sequence_mode: action.mode };
    case "acknowledge":
      return { tcp_ack_mode: action.mode };
    case "window":
      return { tcp_window_mode: action.mode };
    case "checksum":
      return { tcp_checksum_mode: action.mode };
    case "urgent-pointer":
      return { tcp_urgent_pointer_mode: action.mode };
    case "flags":
      return { tcp_flags_mode: action.mode };
  }
}

export function tcpCoreCountPatch(field: TcpCoreVariablePatchField, count: number): StreamPatch {
  switch (field) {
    case "sequence":
      return { tcp_sequence_count: count };
    case "acknowledge":
      return { tcp_ack_count: count };
    case "window":
      return { tcp_window_count: count };
    case "checksum":
      return { tcp_checksum_count: count };
    case "urgent-pointer":
      return { tcp_urgent_pointer_count: count };
    case "flags":
      return { tcp_flags_count: count };
  }
}

export function tcpCoreStepPatch(field: TcpCoreVariablePatchField, step: number): StreamPatch {
  switch (field) {
    case "sequence":
      return { tcp_sequence_step: step };
    case "acknowledge":
      return { tcp_ack_step: step };
    case "window":
      return { tcp_window_step: step };
    case "checksum":
      return { tcp_checksum_step: step };
    case "urgent-pointer":
      return { tcp_urgent_pointer_step: step };
    case "flags":
      return { tcp_flags_step: step };
  }
}

export function tcpFlagPatch(flag: TcpFlagKey, checked: boolean): StreamPatch {
  return { [flag]: checked } as StreamPatch;
}

export function tcpOptionNumericPatch(field: TcpOptionNumericPatchField, value: number): StreamPatch {
  switch (field) {
    case "mss":
      return { tcp_option_mss: value };
    case "window-scale":
      return { tcp_option_window_scale: value };
    case "sack-left-edge":
      return { tcp_option_sack_left_edge: value };
    case "sack-right-edge":
      return { tcp_option_sack_right_edge: value };
    case "timestamp-value":
      return { tcp_option_timestamp_value: value };
    case "timestamp-echo":
      return { tcp_option_timestamp_echo: value };
  }
}

export function tcpOptionModePatch(action: TcpOptionModePatchAction): StreamPatch {
  switch (action.field) {
    case "mss":
      return { tcp_option_mss_mode: action.mode };
    case "window-scale":
      return { tcp_option_window_scale_mode: action.mode };
    case "sack-left-edge":
      return { tcp_option_sack_left_edge_mode: action.mode };
    case "sack-right-edge":
      return { tcp_option_sack_right_edge_mode: action.mode };
    case "timestamp-value":
      return { tcp_option_timestamp_value_mode: action.mode };
    case "timestamp-echo":
      return { tcp_option_timestamp_echo_mode: action.mode };
  }
}

export function tcpOptionCountPatch(field: TcpOptionVariablePatchField, count: number): StreamPatch {
  switch (field) {
    case "mss":
      return { tcp_option_mss_count: count };
    case "window-scale":
      return { tcp_option_window_scale_count: count };
    case "sack-left-edge":
      return { tcp_option_sack_left_edge_count: count };
    case "sack-right-edge":
      return { tcp_option_sack_right_edge_count: count };
    case "timestamp-value":
      return { tcp_option_timestamp_value_count: count };
    case "timestamp-echo":
      return { tcp_option_timestamp_echo_count: count };
  }
}

export function tcpOptionStepPatch(field: TcpOptionVariablePatchField, step: number): StreamPatch {
  switch (field) {
    case "mss":
      return { tcp_option_mss_step: step };
    case "window-scale":
      return { tcp_option_window_scale_step: step };
    case "sack-left-edge":
      return { tcp_option_sack_left_edge_step: step };
    case "sack-right-edge":
      return { tcp_option_sack_right_edge_step: step };
    case "timestamp-value":
      return { tcp_option_timestamp_value_step: step };
    case "timestamp-echo":
      return { tcp_option_timestamp_echo_step: step };
  }
}

export function streamModeAction(mode: ProfileWorkbenchStream["mode"]): SelectedStreamPatchAction {
  return { kind: "stream-mode", mode };
}

export function streamEnabledAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "stream-enabled" };
}

export function selfStartAction(selfStart: boolean): SelectedStreamPatchAction {
  return { kind: "self-start", selfStart };
}

export function totalPacketsAction(totalPackets: number): SelectedStreamPatchAction {
  return { kind: "total-packets", totalPackets };
}

export function burstCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "burst-count" };
}

export function packetsPerBurstAction(packetsPerBurst: number): SelectedStreamPatchAction {
  return { kind: "packets-per-burst", packetsPerBurst };
}

export function rateTypeAction(rateType: ProfileWorkbenchStream["rate_type"]): SelectedStreamPatchAction {
  return { kind: "rate-type", rateType };
}

export function rateValueAction(rateValue: number): SelectedStreamPatchAction {
  return { kind: "rate-value", rateValue };
}

export function afterStreamStopAction(): SelectedStreamPatchAction {
  return { kind: "after-stream-stop" };
}

export function afterStreamGotoAction(): SelectedStreamPatchAction {
  return { kind: "after-stream-goto" };
}

export function nextStreamAction(nextStreamId: number): SelectedStreamPatchAction {
  return { kind: "next-stream", nextStreamId };
}

export function loopActionCountEnabledAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "loop-action-count-enabled" };
}

export function loopActionCountAction(actionCount: number): SelectedStreamPatchAction {
  return { actionCount, kind: "loop-action-count" };
}

export function isgAction(isg: number): SelectedStreamPatchAction {
  return { isg, kind: "isg" };
}

export function ibgAction(ibg: number): SelectedStreamPatchAction {
  return { ibg, kind: "ibg" };
}

export function flowStatsEnabledAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "flow-stats-enabled" };
}

export function pgIdAction(pgId: number): SelectedStreamPatchAction {
  return { kind: "pg-id", pgId };
}

export function latencyEnabledAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "latency-enabled" };
}

export function streamNameAction(name: string): SelectedStreamPatchAction {
  return { kind: "stream-name", name };
}

export function packetFrameLengthAction(frameLength: number): SelectedStreamPatchAction {
  return { frameLength, kind: "packet-frame-length" };
}

export function frameLengthMinAction(frameLengthMin: number): SelectedStreamPatchAction {
  return { frameLengthMin, kind: "frame-length-min" };
}

export function frameLengthMaxAction(frameLengthMax: number): SelectedStreamPatchAction {
  return { frameLengthMax, kind: "frame-length-max" };
}

export function etherTypeOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "ether-type-override", override };
}

export function etherTypeAction(etherType: string): SelectedStreamPatchAction {
  return { etherType, kind: "ether-type" };
}

export function etherDestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ether-dst" };
}

export function etherDestinationModeAction(
  mode: ProfileWorkbenchStream["ether_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "ether-dst-mode", mode };
}

export function etherDestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ether-dst-count" };
}

export function etherDestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ether-dst-step", step };
}

export function etherSourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ether-src" };
}

export function etherSourceModeAction(
  mode: ProfileWorkbenchStream["ether_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "ether-src-mode", mode };
}

export function etherSourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ether-src-count" };
}

export function etherSourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ether-src-step", step };
}

export function arpHardwareTypeAction(value: number): SelectedStreamPatchAction {
  return { kind: "arp-hardware-type", value };
}

export function arpProtocolTypeAction(value: string): SelectedStreamPatchAction {
  return { kind: "arp-protocol-type", value };
}

export function arpHardwareSizeAction(value: number): SelectedStreamPatchAction {
  return { kind: "arp-hardware-size", value };
}

export function arpProtocolSizeAction(value: number): SelectedStreamPatchAction {
  return { kind: "arp-protocol-size", value };
}

export function arpOperationAction(value: number): SelectedStreamPatchAction {
  return { kind: "arp-operation", value };
}

export function arpOperationModeAction(
  mode: ProfileWorkbenchStream["arp_operation_mode"]
): SelectedStreamPatchAction {
  return { kind: "arp-operation-mode", mode };
}

export function arpOperationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "arp-operation-count" };
}

export function arpOperationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "arp-operation-step", step };
}

export function arpSenderMacAction(value: string): SelectedStreamPatchAction {
  return { kind: "arp-sender-mac", value };
}

export function arpSenderMacModeAction(
  mode: ProfileWorkbenchStream["arp_sender_mac_mode"]
): SelectedStreamPatchAction {
  return { kind: "arp-sender-mac-mode", mode };
}

export function arpSenderMacCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "arp-sender-mac-count" };
}

export function arpSenderMacStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "arp-sender-mac-step", step };
}

export function arpSenderIpAction(value: string): SelectedStreamPatchAction {
  return { kind: "arp-sender-ip", value };
}

export function arpSenderIpModeAction(
  mode: ProfileWorkbenchStream["arp_sender_ip_mode"]
): SelectedStreamPatchAction {
  return { kind: "arp-sender-ip-mode", mode };
}

export function arpSenderIpCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "arp-sender-ip-count" };
}

export function arpSenderIpStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "arp-sender-ip-step", step };
}

export function arpTargetMacAction(value: string): SelectedStreamPatchAction {
  return { kind: "arp-target-mac", value };
}

export function arpTargetMacModeAction(
  mode: ProfileWorkbenchStream["arp_target_mac_mode"]
): SelectedStreamPatchAction {
  return { kind: "arp-target-mac-mode", mode };
}

export function arpTargetMacCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "arp-target-mac-count" };
}

export function arpTargetMacStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "arp-target-mac-step", step };
}

export function arpTargetIpAction(value: string): SelectedStreamPatchAction {
  return { kind: "arp-target-ip", value };
}

export function arpTargetIpModeAction(
  mode: ProfileWorkbenchStream["arp_target_ip_mode"]
): SelectedStreamPatchAction {
  return { kind: "arp-target-ip-mode", mode };
}

export function arpTargetIpCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "arp-target-ip-count" };
}

export function arpTargetIpStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "arp-target-ip-step", step };
}

export function ipv4DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ipv4-dst" };
}

export function ipv4DestinationModeAction(
  mode: ProfileWorkbenchStream["ipv4_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-dst-mode", mode };
}

export function ipv4DestinationCountAction(
  count: ProfileWorkbenchStream["ipv4_dst_count"]
): SelectedStreamPatchAction {
  return { count, kind: "ipv4-dst-count" };
}

export function ipv4DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-dst-step", step };
}

export function ipv4SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ipv4-src" };
}

export function ipv4SourceModeAction(
  mode: ProfileWorkbenchStream["ipv4_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-src-mode", mode };
}

export function ipv4SourceCountAction(
  count: ProfileWorkbenchStream["ipv4_src_count"]
): SelectedStreamPatchAction {
  return { count, kind: "ipv4-src-count" };
}

export function ipv4SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-src-step", step };
}

export function ipv4DscpAction(dscp: number): SelectedStreamPatchAction {
  return { dscp, kind: "ipv4-dscp" };
}

export function ipv4DscpModeAction(
  mode: ProfileWorkbenchStream["ipv4_dscp_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-dscp-mode", mode };
}

export function ipv4DscpCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv4-dscp-count" };
}

export function ipv4DscpStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-dscp-step", step };
}

export function ipv4EcnAction(ecn: number): SelectedStreamPatchAction {
  return { ecn, kind: "ipv4-ecn" };
}

export function ipv4EcnModeAction(
  mode: ProfileWorkbenchStream["ipv4_ecn_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-ecn-mode", mode };
}

export function ipv4EcnCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv4-ecn-count" };
}

export function ipv4EcnStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-ecn-step", step };
}

export function ipv4IdentificationAction(identification: number): SelectedStreamPatchAction {
  return { identification, kind: "ipv4-identification" };
}

export function ipv4IdentificationModeAction(
  mode: ProfileWorkbenchStream["ipv4_id_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-identification-mode", mode };
}

export function ipv4IdentificationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv4-identification-count" };
}

export function ipv4IdentificationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-identification-step", step };
}

export function ipv4DfFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "ipv4-df-flag" };
}

export function ipv4MfFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "ipv4-mf-flag" };
}

export function ipv4FragmentOffsetAction(fragmentOffset: number): SelectedStreamPatchAction {
  return { fragmentOffset, kind: "ipv4-fragment-offset" };
}

export function ipv4FragmentOffsetModeAction(
  mode: ProfileWorkbenchStream["ipv4_fragment_offset_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-fragment-offset-mode", mode };
}

export function ipv4FragmentOffsetCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv4-fragment-offset-count" };
}

export function ipv4FragmentOffsetStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-fragment-offset-step", step };
}

export function ipv4TtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "ipv4-ttl", ttl };
}

export function ipv4TtlModeAction(
  mode: ProfileWorkbenchStream["ipv4_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv4-ttl-mode", mode };
}

export function ipv4TtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv4-ttl-count" };
}

export function ipv4TtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv4-ttl-step", step };
}

export function ipv4ChecksumOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "ipv4-checksum-override", override };
}

export function ipv4ChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "ipv4-checksum" };
}

export function ipv6DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ipv6-dst" };
}

export function ipv6DestinationModeAction(
  mode: ProfileWorkbenchStream["ipv6_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv6-dst-mode", mode };
}

export function ipv6DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv6-dst-count" };
}

export function ipv6DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv6-dst-step", step };
}

export function ipv6SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "ipv6-src" };
}

export function ipv6SourceModeAction(
  mode: ProfileWorkbenchStream["ipv6_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv6-src-mode", mode };
}

export function ipv6SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv6-src-count" };
}

export function ipv6SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv6-src-step", step };
}

export function ipv6TrafficClassAction(trafficClass: number): SelectedStreamPatchAction {
  return { kind: "ipv6-traffic-class", trafficClass };
}

export function ipv6TrafficClassModeAction(
  mode: ProfileWorkbenchStream["ipv6_traffic_class_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv6-traffic-class-mode", mode };
}

export function ipv6TrafficClassCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv6-traffic-class-count" };
}

export function ipv6TrafficClassStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv6-traffic-class-step", step };
}

export function ipv6FlowLabelAction(flowLabel: number): SelectedStreamPatchAction {
  return { flowLabel, kind: "ipv6-flow-label" };
}

export function ipv6FlowLabelModeAction(
  mode: ProfileWorkbenchStream["ipv6_flow_label_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv6-flow-label-mode", mode };
}

export function ipv6FlowLabelCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv6-flow-label-count" };
}

export function ipv6FlowLabelStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv6-flow-label-step", step };
}

export function ipv6HopLimitAction(hopLimit: number): SelectedStreamPatchAction {
  return { hopLimit, kind: "ipv6-hop-limit" };
}

export function ipv6HopLimitModeAction(
  mode: ProfileWorkbenchStream["ipv6_hop_limit_mode"]
): SelectedStreamPatchAction {
  return { kind: "ipv6-hop-limit-mode", mode };
}

export function ipv6HopLimitCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "ipv6-hop-limit-count" };
}

export function ipv6HopLimitStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "ipv6-hop-limit-step", step };
}

export function frameLengthTypeAction(
  frameLengthType: ProfileWorkbenchStream["frame_length_type"]
): SelectedStreamPatchAction {
  return { frameLengthType, kind: "frame-length-type" };
}

export function vlanSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "vlan-selection" };
}

export function vlanTpidOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "vlan-tpid-override", override };
}

export function vlanTpidAction(tpid: string): SelectedStreamPatchAction {
  return { kind: "vlan-tpid", tpid };
}

export function vlanPriorityAction(priority: number): SelectedStreamPatchAction {
  return { kind: "vlan-priority", priority };
}

export function vlanPriorityModeAction(
  mode: ProfileWorkbenchStream["vlan_priority_mode"]
): SelectedStreamPatchAction {
  return { kind: "vlan-priority-mode", mode };
}

export function vlanPriorityCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vlan-priority-count" };
}

export function vlanPriorityStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vlan-priority-step", step };
}

export function vlanCfiAction(cfi: number): SelectedStreamPatchAction {
  return { cfi, kind: "vlan-cfi" };
}

export function vlanIdAction(vlanId: number): SelectedStreamPatchAction {
  return { kind: "vlan-id", vlanId };
}

export function vlanIdModeAction(
  mode: ProfileWorkbenchStream["vlan_id_mode"]
): SelectedStreamPatchAction {
  return { kind: "vlan-id-mode", mode };
}

export function vlanIdCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vlan-id-count" };
}

export function vlanIdStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vlan-id-step", step };
}

export function vlanInnerSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "vlan-inner-selection" };
}

export function vlanInnerTpidOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "vlan-inner-tpid-override", override };
}

export function vlanInnerTpidAction(tpid: string): SelectedStreamPatchAction {
  return { kind: "vlan-inner-tpid", tpid };
}

export function vlanInnerPriorityAction(priority: number): SelectedStreamPatchAction {
  return { kind: "vlan-inner-priority", priority };
}

export function vlanInnerPriorityModeAction(
  mode: ProfileWorkbenchStream["vlan2_priority_mode"]
): SelectedStreamPatchAction {
  return { kind: "vlan-inner-priority-mode", mode };
}

export function vlanInnerPriorityCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vlan-inner-priority-count" };
}

export function vlanInnerPriorityStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vlan-inner-priority-step", step };
}

export function vlanInnerCfiAction(cfi: number): SelectedStreamPatchAction {
  return { cfi, kind: "vlan-inner-cfi" };
}

export function vlanInnerIdAction(vlanId: number): SelectedStreamPatchAction {
  return { kind: "vlan-inner-id", vlanId };
}

export function vlanInnerIdModeAction(
  mode: ProfileWorkbenchStream["vlan2_id_mode"]
): SelectedStreamPatchAction {
  return { kind: "vlan-inner-id-mode", mode };
}

export function vlanInnerIdCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vlan-inner-id-count" };
}

export function vlanInnerIdStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vlan-inner-id-step", step };
}

export function mplsSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "mpls-selection" };
}

export function mplsLabelAction(label: number): SelectedStreamPatchAction {
  return { kind: "mpls-label", label };
}

export function mplsLabelModeAction(
  mode: ProfileWorkbenchStream["mpls_label_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-label-mode", mode };
}

export function mplsLabelCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-label-count" };
}

export function mplsLabelStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-label-step", step };
}

export function mplsTrafficClassAction(trafficClass: number): SelectedStreamPatchAction {
  return { kind: "mpls-traffic-class", trafficClass };
}

export function mplsTrafficClassModeAction(
  mode: ProfileWorkbenchStream["mpls_tc_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-traffic-class-mode", mode };
}

export function mplsTrafficClassCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-traffic-class-count" };
}

export function mplsTrafficClassStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-traffic-class-step", step };
}

export function mplsTtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "mpls-ttl", ttl };
}

export function mplsTtlModeAction(
  mode: ProfileWorkbenchStream["mpls_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-ttl-mode", mode };
}

export function mplsTtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-ttl-count" };
}

export function mplsTtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-ttl-step", step };
}

export function mplsSecondLabelSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "mpls-second-label-selection" };
}

export function mplsSecondLabelAction(label: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-label", label };
}

export function mplsSecondLabelModeAction(
  mode: ProfileWorkbenchStream["mpls_label2_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-second-label-mode", mode };
}

export function mplsSecondLabelCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-second-label-count" };
}

export function mplsSecondLabelStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-label-step", step };
}

export function mplsSecondTrafficClassAction(trafficClass: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-traffic-class", trafficClass };
}

export function mplsSecondTrafficClassModeAction(
  mode: ProfileWorkbenchStream["mpls_label2_tc_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-second-traffic-class-mode", mode };
}

export function mplsSecondTrafficClassCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-second-traffic-class-count" };
}

export function mplsSecondTrafficClassStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-traffic-class-step", step };
}

export function mplsSecondTtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-ttl", ttl };
}

export function mplsSecondTtlModeAction(
  mode: ProfileWorkbenchStream["mpls_label2_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-second-ttl-mode", mode };
}

export function mplsSecondTtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-second-ttl-count" };
}

export function mplsSecondTtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-second-ttl-step", step };
}

export function mplsThirdLabelSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "mpls-third-label-selection" };
}

export function mplsThirdLabelAction(label: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-label", label };
}

export function mplsThirdLabelModeAction(
  mode: ProfileWorkbenchStream["mpls_label3_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-third-label-mode", mode };
}

export function mplsThirdLabelCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-third-label-count" };
}

export function mplsThirdLabelStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-label-step", step };
}

export function mplsThirdTrafficClassAction(trafficClass: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-traffic-class", trafficClass };
}

export function mplsThirdTrafficClassModeAction(
  mode: ProfileWorkbenchStream["mpls_label3_tc_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-third-traffic-class-mode", mode };
}

export function mplsThirdTrafficClassCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-third-traffic-class-count" };
}

export function mplsThirdTrafficClassStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-traffic-class-step", step };
}

export function mplsThirdTtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-ttl", ttl };
}

export function mplsThirdTtlModeAction(
  mode: ProfileWorkbenchStream["mpls_label3_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "mpls-third-ttl-mode", mode };
}

export function mplsThirdTtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "mpls-third-ttl-count" };
}

export function mplsThirdTtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "mpls-third-ttl-step", step };
}

export function tunnelSelectionAction(tunnel: "none" | "vxlan" | "gtpu"): SelectedStreamPatchAction {
  return { kind: "tunnel-selection", tunnel };
}

export function l3SelectionAction(selection: L3Selection): SelectedStreamPatchAction {
  return { kind: "l3-selection", selection };
}

export function l4SelectionAction(selection: L4Selection): SelectedStreamPatchAction {
  return { kind: "l4-selection", selection };
}

export function l4SourcePortOverrideSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "l4-src-port-override-selection" };
}

export function l4SourcePortAction(port: number): SelectedStreamPatchAction {
  return { kind: "l4-src-port", port };
}

export function l4SourcePortModeAction(
  mode: ProfileWorkbenchStream["l4_src_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "l4-src-port-mode", mode };
}

export function l4SourcePortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "l4-src-port-count" };
}

export function l4SourcePortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "l4-src-port-step", step };
}

export function l4DestinationPortOverrideSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "l4-dst-port-override-selection" };
}

export function l4DestinationPortAction(port: number): SelectedStreamPatchAction {
  return { kind: "l4-dst-port", port };
}

export function l4DestinationPortModeAction(
  mode: ProfileWorkbenchStream["l4_dst_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "l4-dst-port-mode", mode };
}

export function l4DestinationPortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "l4-dst-port-count" };
}

export function l4DestinationPortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "l4-dst-port-step", step };
}

export function udpLengthOverrideSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "udp-length-override-selection" };
}

export function udpLengthAction(length: number): SelectedStreamPatchAction {
  return { kind: "udp-length", length };
}

export function udpLengthModeAction(
  mode: ProfileWorkbenchStream["udp_length_mode"]
): SelectedStreamPatchAction {
  return { kind: "udp-length-mode", mode };
}

export function udpLengthCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "udp-length-count" };
}

export function udpLengthStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "udp-length-step", step };
}

export function udpChecksumOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "udp-checksum-override", override };
}

export function udpChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "udp-checksum" };
}

export function udpChecksumModeAction(
  mode: ProfileWorkbenchStream["udp_checksum_mode"]
): SelectedStreamPatchAction {
  return { kind: "udp-checksum-mode", mode };
}

export function udpChecksumCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "udp-checksum-count" };
}

export function udpChecksumStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "udp-checksum-step", step };
}

export function payloadSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "payload-selection" };
}

export function payloadTypeAction(
  payloadType: ProfileWorkbenchStream["payload_type"]
): SelectedStreamPatchAction {
  return { kind: "payload-type", payloadType };
}

export function payloadPatternAction(pattern: string): SelectedStreamPatchAction {
  return { kind: "payload-pattern", pattern };
}

export function payloadPatternImportAction(pattern: string): SelectedStreamPatchAction {
  return { kind: "payload-pattern-import", pattern };
}

export function advancedCacheSizeTypeAction(
  cacheSizeType: ProfileWorkbenchStream["advanced_cache_size_type"]
): SelectedStreamPatchAction {
  return { cacheSizeType, kind: "advanced-cache-size-type" };
}

export function advancedCacheValueAction(cacheValue: number): SelectedStreamPatchAction {
  return { cacheValue, kind: "advanced-cache-value" };
}

export function packetTypeAction(packetType: ProfileWorkbenchStream["packet_type"]): SelectedStreamPatchAction {
  return { kind: "packet-type", packetType };
}

export function icmpTypeAction(icmpType: number): SelectedStreamPatchAction {
  return { icmpType, kind: "icmp-type" };
}

export function icmpTypeModeAction(
  mode: ProfileWorkbenchStream["icmp_type_mode"]
): SelectedStreamPatchAction {
  return { kind: "icmp-type-mode", mode };
}

export function icmpTypeCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "icmp-type-count" };
}

export function icmpTypeStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "icmp-type-step", step };
}

export function icmpCodeAction(code: number): SelectedStreamPatchAction {
  return { code, kind: "icmp-code" };
}

export function icmpCodeModeAction(
  mode: ProfileWorkbenchStream["icmp_code_mode"]
): SelectedStreamPatchAction {
  return { kind: "icmp-code-mode", mode };
}

export function icmpCodeCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "icmp-code-count" };
}

export function icmpCodeStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "icmp-code-step", step };
}

export function icmpIdentifierAction(identifier: number): SelectedStreamPatchAction {
  return { identifier, kind: "icmp-identifier" };
}

export function icmpIdentifierModeAction(
  mode: ProfileWorkbenchStream["icmp_identifier_mode"]
): SelectedStreamPatchAction {
  return { kind: "icmp-identifier-mode", mode };
}

export function icmpIdentifierCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "icmp-identifier-count" };
}

export function icmpIdentifierStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "icmp-identifier-step", step };
}

export function icmpSequenceAction(sequence: number): SelectedStreamPatchAction {
  return { kind: "icmp-sequence", sequence };
}

export function icmpSequenceModeAction(
  mode: ProfileWorkbenchStream["icmp_sequence_mode"]
): SelectedStreamPatchAction {
  return { kind: "icmp-sequence-mode", mode };
}

export function icmpSequenceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "icmp-sequence-count" };
}

export function icmpSequenceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "icmp-sequence-step", step };
}

export function icmpChecksumOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "icmp-checksum-override", override };
}

export function icmpChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "icmp-checksum" };
}

export function icmpv6RsSllaSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-rs-slla-selection" };
}

export function icmpv6RsSllaMacAction(mac: string): SelectedStreamPatchAction {
  return { kind: "icmpv6-rs-slla-mac", mac };
}

export function icmpv6RaCurrentHopLimitAction(hopLimit: number): SelectedStreamPatchAction {
  return { hopLimit, kind: "icmpv6-ra-current-hop-limit" };
}

export function icmpv6RaRouterLifetimeAction(lifetime: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-router-lifetime", lifetime };
}

export function icmpv6RaReachableTimeAction(reachableTime: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-reachable-time", reachableTime };
}

export function icmpv6RaRetransTimerAction(retransTimer: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-retrans-timer", retransTimer };
}

export function icmpv6RaManagedFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-managed-flag" };
}

export function icmpv6RaOtherFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-other-flag" };
}

export function icmpv6RaSllaSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-slla-selection" };
}

export function icmpv6RaSllaMacAction(mac: string): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-slla-mac", mac };
}

export function icmpv6RaPrefixSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-prefix-selection" };
}

export function icmpv6RaPrefixAction(prefix: string): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-prefix", prefix };
}

export function icmpv6RaPrefixLengthAction(prefixLength: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-prefix-length", prefixLength };
}

export function icmpv6RaPrefixOnLinkFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-prefix-on-link-flag" };
}

export function icmpv6RaPrefixAutonomousFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-ra-prefix-autonomous-flag" };
}

export function icmpv6RaPrefixValidLifetimeAction(lifetime: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-prefix-valid-lifetime", lifetime };
}

export function icmpv6RaPrefixPreferredLifetimeAction(lifetime: number): SelectedStreamPatchAction {
  return { kind: "icmpv6-ra-prefix-preferred-lifetime", lifetime };
}

export function icmpv6NdTargetAction(target: string): SelectedStreamPatchAction {
  return { kind: "icmpv6-nd-target", target };
}

export function icmpv6NdOptionSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-nd-option-selection" };
}

export function icmpv6NdOptionMacAction(mac: string): SelectedStreamPatchAction {
  return { kind: "icmpv6-nd-option-mac", mac };
}

export function icmpv6NdNaRouterFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-nd-na-router-flag" };
}

export function icmpv6NdNaSolicitedFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-nd-na-solicited-flag" };
}

export function icmpv6NdNaOverrideFlagAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "icmpv6-nd-na-override-flag" };
}

export function dnsSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "dns-selection" };
}

export function dnsAnswerSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "dns-answer-selection" };
}

export function dnsNumberAction(field: DnsNumericPatchField, value: number): SelectedStreamPatchAction {
  return { field, kind: "dns-number", value };
}

export function dnsTextAction(field: DnsTextPatchField, value: string): SelectedStreamPatchAction {
  return { field, kind: "dns-text", value };
}

export function dnsModeAction(
  field: "transaction-id",
  mode: ProfileWorkbenchStream["dns_transaction_id_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: "flags",
  mode: ProfileWorkbenchStream["dns_flags_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: "query-type",
  mode: ProfileWorkbenchStream["dns_query_type_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: "query-class",
  mode: ProfileWorkbenchStream["dns_query_class_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: "answer-ttl",
  mode: ProfileWorkbenchStream["dns_answer_ttl_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: "answer-ipv4",
  mode: ProfileWorkbenchStream["dns_answer_ipv4_mode"]
): DnsModePatchAction;
export function dnsModeAction(
  field: DnsModePatchAction["field"],
  mode: DnsModePatchAction["mode"]
): DnsModePatchAction {
  return { field, kind: "dns-mode", mode } as DnsModePatchAction;
}

export function dnsCountAction(field: DnsVariablePatchField, count: number): SelectedStreamPatchAction {
  return { count, field, kind: "dns-count" };
}

export function dnsStepAction(field: DnsVariablePatchField, step: number): SelectedStreamPatchAction {
  return { field, kind: "dns-step", step };
}

export function dhcpSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "dhcp-selection" };
}

export function dhcpBootpNumberAction(
  field: DhcpBootpNumericPatchField,
  value: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-bootp-number", value };
}

export function dhcpBootpTextAction(
  field: DhcpBootpTextPatchField,
  value: string
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-bootp-text", value };
}

export function dhcpBootpModeAction(
  field: "operation",
  mode: ProfileWorkbenchStream["dhcp_operation_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: "hops",
  mode: ProfileWorkbenchStream["dhcp_hops_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: "seconds",
  mode: ProfileWorkbenchStream["dhcp_seconds_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: "message-type",
  mode: ProfileWorkbenchStream["dhcp_message_type_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: "xid",
  mode: ProfileWorkbenchStream["dhcp_xid_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: "flags",
  mode: ProfileWorkbenchStream["dhcp_flags_mode"]
): DhcpBootpModePatchAction;
export function dhcpBootpModeAction(
  field: DhcpBootpModePatchAction["field"],
  mode: DhcpBootpModePatchAction["mode"]
): DhcpBootpModePatchAction {
  return { field, kind: "dhcp-bootp-mode", mode } as DhcpBootpModePatchAction;
}

export function dhcpBootpCountAction(
  field: DhcpBootpVariablePatchField,
  count: number
): SelectedStreamPatchAction {
  return { count, field, kind: "dhcp-bootp-count" };
}

export function dhcpBootpStepAction(
  field: DhcpBootpVariablePatchField,
  step: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-bootp-step", step };
}

export function dhcpBootpAddressTextAction(
  field: DhcpBootpAddressPatchField,
  value: string
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-bootp-address-text", value };
}

export function dhcpBootpAddressModeAction(
  field: "client-ip",
  mode: ProfileWorkbenchStream["dhcp_client_ip_mode"]
): DhcpBootpAddressModePatchAction;
export function dhcpBootpAddressModeAction(
  field: "your-ip",
  mode: ProfileWorkbenchStream["dhcp_your_ip_mode"]
): DhcpBootpAddressModePatchAction;
export function dhcpBootpAddressModeAction(
  field: "server-ip",
  mode: ProfileWorkbenchStream["dhcp_server_ip_mode"]
): DhcpBootpAddressModePatchAction;
export function dhcpBootpAddressModeAction(
  field: "relay-ip",
  mode: ProfileWorkbenchStream["dhcp_relay_ip_mode"]
): DhcpBootpAddressModePatchAction;
export function dhcpBootpAddressModeAction(
  field: "client-mac",
  mode: ProfileWorkbenchStream["dhcp_client_mac_mode"]
): DhcpBootpAddressModePatchAction;
export function dhcpBootpAddressModeAction(
  field: DhcpBootpAddressModePatchAction["field"],
  mode: DhcpBootpAddressModePatchAction["mode"]
): DhcpBootpAddressModePatchAction {
  return { field, kind: "dhcp-bootp-address-mode", mode } as DhcpBootpAddressModePatchAction;
}

export function dhcpBootpAddressCountAction(
  field: DhcpBootpAddressPatchField,
  count: number
): SelectedStreamPatchAction {
  return { count, field, kind: "dhcp-bootp-address-count" };
}

export function dhcpBootpAddressStepAction(
  field: DhcpBootpAddressPatchField,
  step: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-bootp-address-step", step };
}

export function dhcpOptionTextAction(
  field: DhcpOptionTextPatchField,
  value: string
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-option-text", value };
}

export function dhcpOptionTimerNumberAction(
  field: DhcpOptionTimerPatchField,
  value: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-option-timer-number", value };
}

export function dhcpOptionTimerModeAction(
  field: "lease-time",
  mode: ProfileWorkbenchStream["dhcp_lease_time_mode"]
): DhcpOptionTimerModePatchAction;
export function dhcpOptionTimerModeAction(
  field: "renewal-time",
  mode: ProfileWorkbenchStream["dhcp_renewal_time_mode"]
): DhcpOptionTimerModePatchAction;
export function dhcpOptionTimerModeAction(
  field: "rebinding-time",
  mode: ProfileWorkbenchStream["dhcp_rebinding_time_mode"]
): DhcpOptionTimerModePatchAction;
export function dhcpOptionTimerModeAction(
  field: DhcpOptionTimerModePatchAction["field"],
  mode: DhcpOptionTimerModePatchAction["mode"]
): DhcpOptionTimerModePatchAction {
  return { field, kind: "dhcp-option-timer-mode", mode } as DhcpOptionTimerModePatchAction;
}

export function dhcpOptionTimerCountAction(
  field: DhcpOptionTimerPatchField,
  count: number
): SelectedStreamPatchAction {
  return { count, field, kind: "dhcp-option-timer-count" };
}

export function dhcpOptionTimerStepAction(
  field: DhcpOptionTimerPatchField,
  step: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-option-timer-step", step };
}

export function dhcpOptionAddressTextAction(
  field: DhcpOptionAddressPatchField,
  value: string
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-option-address-text", value };
}

export function dhcpOptionAddressModeAction(
  field: "requested-ip",
  mode: ProfileWorkbenchStream["dhcp_requested_ip_mode"]
): DhcpOptionAddressModePatchAction;
export function dhcpOptionAddressModeAction(
  field: "server-id",
  mode: ProfileWorkbenchStream["dhcp_server_id_mode"]
): DhcpOptionAddressModePatchAction;
export function dhcpOptionAddressModeAction(
  field: DhcpOptionAddressModePatchAction["field"],
  mode: DhcpOptionAddressModePatchAction["mode"]
): DhcpOptionAddressModePatchAction {
  return { field, kind: "dhcp-option-address-mode", mode } as DhcpOptionAddressModePatchAction;
}

export function dhcpOptionAddressCountAction(
  field: DhcpOptionAddressPatchField,
  count: number
): SelectedStreamPatchAction {
  return { count, field, kind: "dhcp-option-address-count" };
}

export function dhcpOptionAddressStepAction(
  field: DhcpOptionAddressPatchField,
  step: number
): SelectedStreamPatchAction {
  return { field, kind: "dhcp-option-address-step", step };
}

export function sctpNumberAction(field: SctpNumericPatchField, value: number): SelectedStreamPatchAction {
  return { field, kind: "sctp-number", value };
}

export function sctpModeAction(
  field: "verification-tag",
  mode: ProfileWorkbenchStream["sctp_verification_tag_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: "data-flags",
  mode: ProfileWorkbenchStream["sctp_data_flags_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: "tsn",
  mode: ProfileWorkbenchStream["sctp_tsn_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: "stream-id",
  mode: ProfileWorkbenchStream["sctp_stream_id_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: "stream-sequence",
  mode: ProfileWorkbenchStream["sctp_stream_sequence_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: "payload-protocol-id",
  mode: ProfileWorkbenchStream["sctp_payload_protocol_id_mode"]
): SctpModePatchAction;
export function sctpModeAction(
  field: SctpModePatchAction["field"],
  mode: SctpModePatchAction["mode"]
): SctpModePatchAction {
  return { field, kind: "sctp-mode", mode } as SctpModePatchAction;
}

export function sctpCountAction(field: SctpVariablePatchField, count: number): SelectedStreamPatchAction {
  return { count, field, kind: "sctp-count" };
}

export function sctpStepAction(field: SctpVariablePatchField, step: number): SelectedStreamPatchAction {
  return { field, kind: "sctp-step", step };
}

export function sctpChecksumOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "sctp-checksum-override", override };
}

export function sctpChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "sctp-checksum" };
}

export function tcpCoreNumberAction(field: TcpCoreNumericPatchField, value: number): SelectedStreamPatchAction {
  return { field, kind: "tcp-core-number", value };
}

export function tcpCoreModeAction(
  field: "sequence",
  mode: ProfileWorkbenchStream["tcp_sequence_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: "acknowledge",
  mode: ProfileWorkbenchStream["tcp_ack_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: "window",
  mode: ProfileWorkbenchStream["tcp_window_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: "checksum",
  mode: ProfileWorkbenchStream["tcp_checksum_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: "urgent-pointer",
  mode: ProfileWorkbenchStream["tcp_urgent_pointer_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: "flags",
  mode: ProfileWorkbenchStream["tcp_flags_mode"]
): TcpCoreModePatchAction;
export function tcpCoreModeAction(
  field: TcpCoreModePatchAction["field"],
  mode: TcpCoreModePatchAction["mode"]
): TcpCoreModePatchAction {
  return { field, kind: "tcp-core-mode", mode } as TcpCoreModePatchAction;
}

export function tcpCoreCountAction(field: TcpCoreVariablePatchField, count: number): SelectedStreamPatchAction {
  return { count, field, kind: "tcp-core-count" };
}

export function tcpCoreStepAction(field: TcpCoreVariablePatchField, step: number): SelectedStreamPatchAction {
  return { field, kind: "tcp-core-step", step };
}

export function tcpChecksumOverrideAction(override: boolean): SelectedStreamPatchAction {
  return { kind: "tcp-checksum-override", override };
}

export function tcpChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "tcp-checksum" };
}

export function tcpFlagAction(flag: TcpFlagKey, checked: boolean): SelectedStreamPatchAction {
  return { checked, flag, kind: "tcp-flag" };
}

export function tcpOptionSelectionAction(
  option: TcpOptionSelection,
  enabled: boolean
): SelectedStreamPatchAction {
  return { enabled, kind: "tcp-option-selection", option };
}

export function tcpOptionNumberAction(
  field: TcpOptionNumericPatchField,
  value: number
): SelectedStreamPatchAction {
  return { field, kind: "tcp-option-number", value };
}

export function tcpOptionModeAction(
  field: "mss",
  mode: ProfileWorkbenchStream["tcp_option_mss_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: "window-scale",
  mode: ProfileWorkbenchStream["tcp_option_window_scale_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: "sack-left-edge",
  mode: ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: "sack-right-edge",
  mode: ProfileWorkbenchStream["tcp_option_sack_right_edge_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: "timestamp-value",
  mode: ProfileWorkbenchStream["tcp_option_timestamp_value_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: "timestamp-echo",
  mode: ProfileWorkbenchStream["tcp_option_timestamp_echo_mode"]
): TcpOptionModePatchAction;
export function tcpOptionModeAction(
  field: TcpOptionModePatchAction["field"],
  mode: TcpOptionModePatchAction["mode"]
): TcpOptionModePatchAction {
  return { field, kind: "tcp-option-mode", mode } as TcpOptionModePatchAction;
}

export function tcpOptionCountAction(
  field: TcpOptionVariablePatchField,
  count: number
): SelectedStreamPatchAction {
  return { count, field, kind: "tcp-option-count" };
}

export function tcpOptionStepAction(
  field: TcpOptionVariablePatchField,
  step: number
): SelectedStreamPatchAction {
  return { field, kind: "tcp-option-step", step };
}

export function vxlanVniAction(vni: number): SelectedStreamPatchAction {
  return { kind: "vxlan-vni", vni };
}

export function vxlanVniModeAction(
  mode: ProfileWorkbenchStream["vxlan_vni_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-vni-mode", mode };
}

export function vxlanVniCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-vni-count" };
}

export function vxlanVniStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-vni-step", step };
}

export function vxlanInnerIpVersionAction(
  version: ProfileWorkbenchStream["vxlan_inner_ip_version"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ip-version", version };
}

export function vxlanInnerIpv6HopLimitAction(hopLimit: number): SelectedStreamPatchAction {
  return { hopLimit, kind: "vxlan-inner-ipv6-hop-limit" };
}

export function vxlanInnerIpv6HopLimitModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-hop-limit-mode", mode };
}

export function vxlanInnerIpv6HopLimitCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv6-hop-limit-count" };
}

export function vxlanInnerIpv6HopLimitStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-hop-limit-step", step };
}

export function vxlanInnerIpv4TtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-ttl", ttl };
}

export function vxlanInnerIpv4TtlModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-ttl-mode", mode };
}

export function vxlanInnerIpv4TtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv4-ttl-count" };
}

export function vxlanInnerIpv4TtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-ttl-step", step };
}

export function vxlanInnerEtherDestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ether-dst" };
}

export function vxlanInnerEtherSourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ether-src" };
}

export function vxlanInnerIpv6SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ipv6-src" };
}

export function vxlanInnerIpv6SourceModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-src-mode", mode };
}

export function vxlanInnerIpv6SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv6-src-count" };
}

export function vxlanInnerIpv6SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-src-step", step };
}

export function vxlanInnerIpv6DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ipv6-dst" };
}

export function vxlanInnerIpv6DestinationModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-dst-mode", mode };
}

export function vxlanInnerIpv6DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv6-dst-count" };
}

export function vxlanInnerIpv6DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv6-dst-step", step };
}

export function vxlanInnerIpv4SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ipv4-src" };
}

export function vxlanInnerIpv4SourceModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-src-mode", mode };
}

export function vxlanInnerIpv4SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv4-src-count" };
}

export function vxlanInnerIpv4SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-src-step", step };
}

export function vxlanInnerIpv4DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "vxlan-inner-ipv4-dst" };
}

export function vxlanInnerIpv4DestinationModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-dst-mode", mode };
}

export function vxlanInnerIpv4DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-ipv4-dst-count" };
}

export function vxlanInnerIpv4DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-ipv4-dst-step", step };
}

export function vxlanInnerL4SourcePortAction(port: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-src-port", port };
}

export function vxlanInnerL4SourcePortModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_l4_src_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-src-port-mode", mode };
}

export function vxlanInnerL4SourcePortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-l4-src-port-count" };
}

export function vxlanInnerL4SourcePortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-src-port-step", step };
}

export function vxlanInnerL4DestinationPortAction(port: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-dst-port", port };
}

export function vxlanInnerL4DestinationPortModeAction(
  mode: ProfileWorkbenchStream["vxlan_inner_l4_dst_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-dst-port-mode", mode };
}

export function vxlanInnerL4DestinationPortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "vxlan-inner-l4-dst-port-count" };
}

export function vxlanInnerL4DestinationPortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "vxlan-inner-l4-dst-port-step", step };
}

export function gtpuMessageTypeAction(messageType: number): SelectedStreamPatchAction {
  return { kind: "gtpu-message-type", messageType };
}

export function gtpuTeidAction(teid: number): SelectedStreamPatchAction {
  return { kind: "gtpu-teid", teid };
}

export function gtpuTeidModeAction(
  mode: ProfileWorkbenchStream["gtpu_teid_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-teid-mode", mode };
}

export function gtpuTeidCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-teid-count" };
}

export function gtpuTeidStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-teid-step", step };
}

export function gtpuSequenceSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gtpu-sequence-selection" };
}

export function gtpuSequenceAction(sequence: number): SelectedStreamPatchAction {
  return { kind: "gtpu-sequence", sequence };
}

export function gtpuSequenceModeAction(
  mode: ProfileWorkbenchStream["gtpu_sequence_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-sequence-mode", mode };
}

export function gtpuSequenceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-sequence-count" };
}

export function gtpuSequenceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-sequence-step", step };
}

export function gtpuNpduSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gtpu-npdu-selection" };
}

export function gtpuNpduAction(npdu: number): SelectedStreamPatchAction {
  return { kind: "gtpu-npdu", npdu };
}

export function gtpuNpduModeAction(
  mode: ProfileWorkbenchStream["gtpu_npdu_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-npdu-mode", mode };
}

export function gtpuNpduCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-npdu-count" };
}

export function gtpuNpduStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-npdu-step", step };
}

export function gtpuExtensionSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gtpu-extension-selection" };
}

export function gtpuExtensionUdpPortAction(port: number): SelectedStreamPatchAction {
  return { kind: "gtpu-extension-udp-port", port };
}

export function gtpuExtensionUdpPortModeAction(
  mode: ProfileWorkbenchStream["gtpu_extension_udp_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-extension-udp-port-mode", mode };
}

export function gtpuExtensionUdpPortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-extension-udp-port-count" };
}

export function gtpuExtensionUdpPortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-extension-udp-port-step", step };
}

export function gtpuInnerIpVersionAction(
  version: ProfileWorkbenchStream["gtpu_inner_ip_version"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ip-version", version };
}

export function gtpuInnerIpv4TtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-ttl", ttl };
}

export function gtpuInnerIpv4TtlModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-ttl-mode", mode };
}

export function gtpuInnerIpv4TtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv4-ttl-count" };
}

export function gtpuInnerIpv4TtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-ttl-step", step };
}

export function gtpuInnerIpv6HopLimitAction(hopLimit: number): SelectedStreamPatchAction {
  return { hopLimit, kind: "gtpu-inner-ipv6-hop-limit" };
}

export function gtpuInnerIpv6HopLimitModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-hop-limit-mode", mode };
}

export function gtpuInnerIpv6HopLimitCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv6-hop-limit-count" };
}

export function gtpuInnerIpv6HopLimitStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-hop-limit-step", step };
}

export function gtpuInnerIpv4SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gtpu-inner-ipv4-src" };
}

export function gtpuInnerIpv4SourceModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-src-mode", mode };
}

export function gtpuInnerIpv4SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv4-src-count" };
}

export function gtpuInnerIpv4SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-src-step", step };
}

export function gtpuInnerIpv4DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gtpu-inner-ipv4-dst" };
}

export function gtpuInnerIpv4DestinationModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-dst-mode", mode };
}

export function gtpuInnerIpv4DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv4-dst-count" };
}

export function gtpuInnerIpv4DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv4-dst-step", step };
}

export function gtpuInnerIpv6SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gtpu-inner-ipv6-src" };
}

export function gtpuInnerIpv6SourceModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-src-mode", mode };
}

export function gtpuInnerIpv6SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv6-src-count" };
}

export function gtpuInnerIpv6SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-src-step", step };
}

export function gtpuInnerIpv6DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gtpu-inner-ipv6-dst" };
}

export function gtpuInnerIpv6DestinationModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-dst-mode", mode };
}

export function gtpuInnerIpv6DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-ipv6-dst-count" };
}

export function gtpuInnerIpv6DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-ipv6-dst-step", step };
}

export function gtpuInnerL4SourcePortAction(port: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-src-port", port };
}

export function gtpuInnerL4SourcePortModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_l4_src_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-src-port-mode", mode };
}

export function gtpuInnerL4SourcePortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-l4-src-port-count" };
}

export function gtpuInnerL4SourcePortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-src-port-step", step };
}

export function gtpuInnerL4DestinationPortAction(port: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-dst-port", port };
}

export function gtpuInnerL4DestinationPortModeAction(
  mode: ProfileWorkbenchStream["gtpu_inner_l4_dst_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-dst-port-mode", mode };
}

export function gtpuInnerL4DestinationPortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gtpu-inner-l4-dst-port-count" };
}

export function gtpuInnerL4DestinationPortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gtpu-inner-l4-dst-port-step", step };
}

export function greInnerIpVersionAction(
  version: ProfileWorkbenchStream["gre_inner_ip_version"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ip-version", version };
}

export function greChecksumSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gre-checksum-selection" };
}

export function greChecksumOverrideAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gre-checksum-override" };
}

export function greChecksumAction(checksum: string): SelectedStreamPatchAction {
  return { checksum, kind: "gre-checksum" };
}

export function greKeySelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gre-key-selection" };
}

export function greKeyAction(key: number): SelectedStreamPatchAction {
  return { key, kind: "gre-key" };
}

export function greKeyModeAction(
  mode: ProfileWorkbenchStream["gre_key_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-key-mode", mode };
}

export function greKeyCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-key-count" };
}

export function greKeyStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-key-step", step };
}

export function greSequenceSelectionAction(enabled: boolean): SelectedStreamPatchAction {
  return { enabled, kind: "gre-sequence-selection" };
}

export function greSequenceAction(sequence: number): SelectedStreamPatchAction {
  return { kind: "gre-sequence", sequence };
}

export function greSequenceModeAction(
  mode: ProfileWorkbenchStream["gre_sequence_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-sequence-mode", mode };
}

export function greSequenceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-sequence-count" };
}

export function greSequenceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-sequence-step", step };
}

export function greInnerIpv6SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gre-inner-ipv6-src" };
}

export function greInnerIpv6SourceModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-src-mode", mode };
}

export function greInnerIpv6SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv6-src-count" };
}

export function greInnerIpv6SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-src-step", step };
}

export function greInnerIpv6DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gre-inner-ipv6-dst" };
}

export function greInnerIpv6DestinationModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-dst-mode", mode };
}

export function greInnerIpv6DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv6-dst-count" };
}

export function greInnerIpv6DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-dst-step", step };
}

export function greInnerIpv6HopLimitAction(hopLimit: number): SelectedStreamPatchAction {
  return { hopLimit, kind: "gre-inner-ipv6-hop-limit" };
}

export function greInnerIpv6HopLimitModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-hop-limit-mode", mode };
}

export function greInnerIpv6HopLimitCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv6-hop-limit-count" };
}

export function greInnerIpv6HopLimitStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv6-hop-limit-step", step };
}

export function greInnerIpv4SourceAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gre-inner-ipv4-src" };
}

export function greInnerIpv4SourceModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_src_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-src-mode", mode };
}

export function greInnerIpv4SourceCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv4-src-count" };
}

export function greInnerIpv4SourceStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-src-step", step };
}

export function greInnerIpv4DestinationAction(address: string): SelectedStreamPatchAction {
  return { address, kind: "gre-inner-ipv4-dst" };
}

export function greInnerIpv4DestinationModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_dst_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-dst-mode", mode };
}

export function greInnerIpv4DestinationCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv4-dst-count" };
}

export function greInnerIpv4DestinationStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-dst-step", step };
}

export function greInnerIpv4TtlAction(ttl: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-ttl", ttl };
}

export function greInnerIpv4TtlModeAction(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-ttl-mode", mode };
}

export function greInnerIpv4TtlCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-ipv4-ttl-count" };
}

export function greInnerIpv4TtlStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-ipv4-ttl-step", step };
}

export function greInnerL4SourcePortAction(port: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-src-port", port };
}

export function greInnerL4SourcePortModeAction(
  mode: ProfileWorkbenchStream["gre_inner_l4_src_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-src-port-mode", mode };
}

export function greInnerL4SourcePortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-l4-src-port-count" };
}

export function greInnerL4SourcePortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-src-port-step", step };
}

export function greInnerL4DestinationPortAction(port: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-dst-port", port };
}

export function greInnerL4DestinationPortModeAction(
  mode: ProfileWorkbenchStream["gre_inner_l4_dst_port_mode"]
): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-dst-port-mode", mode };
}

export function greInnerL4DestinationPortCountAction(count: number): SelectedStreamPatchAction {
  return { count, kind: "gre-inner-l4-dst-port-count" };
}

export function greInnerL4DestinationPortStepAction(step: number): SelectedStreamPatchAction {
  return { kind: "gre-inner-l4-dst-port-step", step };
}

export function selectedStreamPatch(
  action: SelectedStreamPatchAction,
  stream: ProfileWorkbenchStream | null
): StreamPatch | null {
  switch (action.kind) {
    case "stream-mode":
      return streamModePatch(action.mode, stream);
    case "stream-enabled":
      return { enabled: action.enabled };
    case "self-start":
      return { self_start: action.selfStart };
    case "total-packets":
      return { total_pkts: action.totalPackets };
    case "burst-count":
      return { count: action.count };
    case "packets-per-burst":
      return { pkts_per_burst: action.packetsPerBurst };
    case "rate-type":
      return { rate_type: action.rateType };
    case "rate-value":
      return { rate_value: action.rateValue };
    case "after-stream-stop":
      return afterStreamStopPatch();
    case "after-stream-goto":
      return stream ? afterStreamGotoPatch(stream) : null;
    case "next-stream":
      return nextStreamSelectionPatch(action.nextStreamId);
    case "loop-action-count-enabled":
      return stream ? loopActionCountEnabledPatch(action.enabled, stream) : null;
    case "loop-action-count":
      return { action_count: action.actionCount };
    case "isg":
      return { isg: action.isg };
    case "ibg":
      return { ibg: action.ibg };
    case "flow-stats-enabled":
      return { flow_stats_enabled: action.enabled };
    case "pg-id":
      return { pg_id: action.pgId };
    case "latency-enabled":
      return { latency_enabled: action.enabled };
    case "stream-name":
      return { name: action.name };
    case "packet-frame-length":
      return frameLengthValuePatch(action.frameLength);
    case "frame-length-min":
      return frameLengthMinPatch(action.frameLengthMin);
    case "frame-length-max":
      return frameLengthMaxPatch(action.frameLengthMax);
    case "ether-type-override":
      return { ether_type_override: action.override };
    case "ether-type":
      return { ether_type: action.etherType };
    case "ether-dst":
      return { ether_dst: action.address };
    case "ether-dst-mode":
      return { ether_dst_mode: action.mode };
    case "ether-dst-count":
      return { ether_dst_count: action.count };
    case "ether-dst-step":
      return { ether_dst_step: action.step };
    case "ether-src":
      return { ether_src: action.address };
    case "ether-src-mode":
      return { ether_src_mode: action.mode };
    case "ether-src-count":
      return { ether_src_count: action.count };
    case "ether-src-step":
      return { ether_src_step: action.step };
    case "arp-hardware-type":
      return { arp_hardware_type: action.value };
    case "arp-protocol-type":
      return { arp_protocol_type: action.value };
    case "arp-hardware-size":
      return { arp_hardware_size: action.value };
    case "arp-protocol-size":
      return { arp_protocol_size: action.value };
    case "arp-operation":
      return { arp_operation: action.value };
    case "arp-operation-mode":
      return { arp_operation_mode: action.mode };
    case "arp-operation-count":
      return { arp_operation_count: action.count };
    case "arp-operation-step":
      return { arp_operation_step: action.step };
    case "arp-sender-mac":
      return { arp_sender_mac: action.value };
    case "arp-sender-mac-mode":
      return { arp_sender_mac_mode: action.mode };
    case "arp-sender-mac-count":
      return { arp_sender_mac_count: action.count };
    case "arp-sender-mac-step":
      return { arp_sender_mac_step: action.step };
    case "arp-sender-ip":
      return { arp_sender_ip: action.value };
    case "arp-sender-ip-mode":
      return { arp_sender_ip_mode: action.mode };
    case "arp-sender-ip-count":
      return { arp_sender_ip_count: action.count };
    case "arp-sender-ip-step":
      return { arp_sender_ip_step: action.step };
    case "arp-target-mac":
      return { arp_target_mac: action.value };
    case "arp-target-mac-mode":
      return { arp_target_mac_mode: action.mode };
    case "arp-target-mac-count":
      return { arp_target_mac_count: action.count };
    case "arp-target-mac-step":
      return { arp_target_mac_step: action.step };
    case "arp-target-ip":
      return { arp_target_ip: action.value };
    case "arp-target-ip-mode":
      return { arp_target_ip_mode: action.mode };
    case "arp-target-ip-count":
      return { arp_target_ip_count: action.count };
    case "arp-target-ip-step":
      return { arp_target_ip_step: action.step };
    case "ipv4-dst":
      return { ipv4_dst: action.address };
    case "ipv4-dst-mode":
      return { ipv4_dst_mode: action.mode };
    case "ipv4-dst-count":
      return { ipv4_dst_count: action.count };
    case "ipv4-dst-step":
      return { ipv4_dst_step: action.step };
    case "ipv4-src":
      return { ipv4_src: action.address };
    case "ipv4-src-mode":
      return { ipv4_src_mode: action.mode };
    case "ipv4-src-count":
      return { ipv4_src_count: action.count };
    case "ipv4-src-step":
      return { ipv4_src_step: action.step };
    case "ipv4-dscp":
      return { ipv4_dscp: action.dscp };
    case "ipv4-dscp-mode":
      return { ipv4_dscp_mode: action.mode };
    case "ipv4-dscp-count":
      return { ipv4_dscp_count: action.count };
    case "ipv4-dscp-step":
      return { ipv4_dscp_step: action.step };
    case "ipv4-ecn":
      return { ipv4_ecn: action.ecn };
    case "ipv4-ecn-mode":
      return { ipv4_ecn_mode: action.mode };
    case "ipv4-ecn-count":
      return { ipv4_ecn_count: action.count };
    case "ipv4-ecn-step":
      return { ipv4_ecn_step: action.step };
    case "ipv4-identification":
      return { ipv4_id: action.identification };
    case "ipv4-identification-mode":
      return { ipv4_id_mode: action.mode };
    case "ipv4-identification-count":
      return { ipv4_id_count: action.count };
    case "ipv4-identification-step":
      return { ipv4_id_step: action.step };
    case "ipv4-df-flag":
      return { ipv4_flag_df: action.enabled };
    case "ipv4-mf-flag":
      return { ipv4_flag_mf: action.enabled };
    case "ipv4-fragment-offset":
      return { ipv4_fragment_offset: action.fragmentOffset };
    case "ipv4-fragment-offset-mode":
      return { ipv4_fragment_offset_mode: action.mode };
    case "ipv4-fragment-offset-count":
      return { ipv4_fragment_offset_count: action.count };
    case "ipv4-fragment-offset-step":
      return { ipv4_fragment_offset_step: action.step };
    case "ipv4-ttl":
      return { ipv4_ttl: action.ttl };
    case "ipv4-ttl-mode":
      return { ipv4_ttl_mode: action.mode };
    case "ipv4-ttl-count":
      return { ipv4_ttl_count: action.count };
    case "ipv4-ttl-step":
      return { ipv4_ttl_step: action.step };
    case "ipv4-checksum-override":
      return { ipv4_checksum_override: action.override };
    case "ipv4-checksum":
      return { ipv4_checksum: action.checksum };
    case "ipv6-dst":
      return { ipv6_dst: action.address };
    case "ipv6-dst-mode":
      return { ipv6_dst_mode: action.mode };
    case "ipv6-dst-count":
      return { ipv6_dst_count: action.count };
    case "ipv6-dst-step":
      return { ipv6_dst_step: action.step };
    case "ipv6-src":
      return { ipv6_src: action.address };
    case "ipv6-src-mode":
      return { ipv6_src_mode: action.mode };
    case "ipv6-src-count":
      return { ipv6_src_count: action.count };
    case "ipv6-src-step":
      return { ipv6_src_step: action.step };
    case "ipv6-traffic-class":
      return { ipv6_traffic_class: action.trafficClass };
    case "ipv6-traffic-class-mode":
      return { ipv6_traffic_class_mode: action.mode };
    case "ipv6-traffic-class-count":
      return { ipv6_traffic_class_count: action.count };
    case "ipv6-traffic-class-step":
      return { ipv6_traffic_class_step: action.step };
    case "ipv6-flow-label":
      return { ipv6_flow_label: action.flowLabel };
    case "ipv6-flow-label-mode":
      return { ipv6_flow_label_mode: action.mode };
    case "ipv6-flow-label-count":
      return { ipv6_flow_label_count: action.count };
    case "ipv6-flow-label-step":
      return { ipv6_flow_label_step: action.step };
    case "ipv6-hop-limit":
      return { ipv6_hop_limit: action.hopLimit };
    case "ipv6-hop-limit-mode":
      return { ipv6_hop_limit_mode: action.mode };
    case "ipv6-hop-limit-count":
      return { ipv6_hop_limit_count: action.count };
    case "ipv6-hop-limit-step":
      return { ipv6_hop_limit_step: action.step };
    case "vlan-selection":
      return vlanSelectionPatch(action.enabled);
    case "vlan-tpid-override":
      return { vlan_tpid_override: action.override };
    case "vlan-tpid":
      return { vlan_tpid: action.tpid };
    case "vlan-priority":
      return { vlan_priority: action.priority };
    case "vlan-priority-mode":
      return { vlan_priority_mode: action.mode };
    case "vlan-priority-count":
      return { vlan_priority_count: action.count };
    case "vlan-priority-step":
      return { vlan_priority_step: action.step };
    case "vlan-cfi":
      return { vlan_cfi: action.cfi };
    case "vlan-id":
      return { vlan_id: action.vlanId };
    case "vlan-id-mode":
      return { vlan_id_mode: action.mode };
    case "vlan-id-count":
      return { vlan_id_count: action.count };
    case "vlan-id-step":
      return { vlan_id_step: action.step };
    case "vlan-inner-selection":
      return stream ? vlanInnerTagSelectionPatch(action.enabled, stream) : null;
    case "vlan-inner-tpid-override":
      return { vlan2_tpid_override: action.override };
    case "vlan-inner-tpid":
      return { vlan2_tpid: action.tpid };
    case "vlan-inner-priority":
      return { vlan2_priority: action.priority };
    case "vlan-inner-priority-mode":
      return { vlan2_priority_mode: action.mode };
    case "vlan-inner-priority-count":
      return { vlan2_priority_count: action.count };
    case "vlan-inner-priority-step":
      return { vlan2_priority_step: action.step };
    case "vlan-inner-cfi":
      return { vlan2_cfi: action.cfi };
    case "vlan-inner-id":
      return { vlan2_id: action.vlanId };
    case "vlan-inner-id-mode":
      return { vlan2_id_mode: action.mode };
    case "vlan-inner-id-count":
      return { vlan2_id_count: action.count };
    case "vlan-inner-id-step":
      return { vlan2_id_step: action.step };
    case "mpls-selection":
      return mplsSelectionPatch(action.enabled);
    case "mpls-label":
      return { mpls_label: action.label };
    case "mpls-label-mode":
      return { mpls_label_mode: action.mode };
    case "mpls-label-count":
      return { mpls_label_count: action.count };
    case "mpls-label-step":
      return { mpls_label_step: action.step };
    case "mpls-traffic-class":
      return { mpls_tc: action.trafficClass };
    case "mpls-traffic-class-mode":
      return { mpls_tc_mode: action.mode };
    case "mpls-traffic-class-count":
      return { mpls_tc_count: action.count };
    case "mpls-traffic-class-step":
      return { mpls_tc_step: action.step };
    case "mpls-ttl":
      return { mpls_ttl: action.ttl };
    case "mpls-ttl-mode":
      return { mpls_ttl_mode: action.mode };
    case "mpls-ttl-count":
      return { mpls_ttl_count: action.count };
    case "mpls-ttl-step":
      return { mpls_ttl_step: action.step };
    case "mpls-second-label-selection":
      return stream ? mplsSecondLabelSelectionPatch(action.enabled, stream) : null;
    case "mpls-second-label":
      return { mpls_label2: action.label };
    case "mpls-second-label-mode":
      return { mpls_label2_mode: action.mode };
    case "mpls-second-label-count":
      return { mpls_label2_count: action.count };
    case "mpls-second-label-step":
      return { mpls_label2_step: action.step };
    case "mpls-second-traffic-class":
      return { mpls_label2_tc: action.trafficClass };
    case "mpls-second-traffic-class-mode":
      return { mpls_label2_tc_mode: action.mode };
    case "mpls-second-traffic-class-count":
      return { mpls_label2_tc_count: action.count };
    case "mpls-second-traffic-class-step":
      return { mpls_label2_tc_step: action.step };
    case "mpls-second-ttl":
      return { mpls_label2_ttl: action.ttl };
    case "mpls-second-ttl-mode":
      return { mpls_label2_ttl_mode: action.mode };
    case "mpls-second-ttl-count":
      return { mpls_label2_ttl_count: action.count };
    case "mpls-second-ttl-step":
      return { mpls_label2_ttl_step: action.step };
    case "mpls-third-label-selection":
      return stream ? mplsThirdLabelSelectionPatch(action.enabled, stream) : null;
    case "mpls-third-label":
      return { mpls_label3: action.label };
    case "mpls-third-label-mode":
      return { mpls_label3_mode: action.mode };
    case "mpls-third-label-count":
      return { mpls_label3_count: action.count };
    case "mpls-third-label-step":
      return { mpls_label3_step: action.step };
    case "mpls-third-traffic-class":
      return { mpls_label3_tc: action.trafficClass };
    case "mpls-third-traffic-class-mode":
      return { mpls_label3_tc_mode: action.mode };
    case "mpls-third-traffic-class-count":
      return { mpls_label3_tc_count: action.count };
    case "mpls-third-traffic-class-step":
      return { mpls_label3_tc_step: action.step };
    case "mpls-third-ttl":
      return { mpls_label3_ttl: action.ttl };
    case "mpls-third-ttl-mode":
      return { mpls_label3_ttl_mode: action.mode };
    case "mpls-third-ttl-count":
      return { mpls_label3_ttl_count: action.count };
    case "mpls-third-ttl-step":
      return { mpls_label3_ttl_step: action.step };
    case "tunnel-selection":
      if (action.tunnel === "none") {
        return tunnelDisabledPatch();
      }
      return action.tunnel === "vxlan"
        ? vxlanSelectionPatch(true, stream)
        : gtpuSelectionPatch(true, stream);
    case "l3-selection":
      return stream ? packetTypePatch(packetTypeForL3Selection(action.selection, stream), stream) : null;
    case "l4-selection":
      return stream ? packetTypePatch(packetTypeForL4Selection(action.selection, stream), stream) : null;
    case "l4-src-port-override-selection":
      return stream ? l4PortOverrideSelectionPatch("source", action.enabled, stream) : null;
    case "l4-src-port":
      return { l4_src_port: action.port };
    case "l4-src-port-mode":
      return { l4_src_port_mode: action.mode };
    case "l4-src-port-count":
      return { l4_src_port_count: action.count };
    case "l4-src-port-step":
      return { l4_src_port_step: action.step };
    case "l4-dst-port-override-selection":
      return stream ? l4PortOverrideSelectionPatch("destination", action.enabled, stream) : null;
    case "l4-dst-port":
      return { l4_dst_port: action.port };
    case "l4-dst-port-mode":
      return { l4_dst_port_mode: action.mode };
    case "l4-dst-port-count":
      return { l4_dst_port_count: action.count };
    case "l4-dst-port-step":
      return { l4_dst_port_step: action.step };
    case "udp-length-override-selection":
      return stream ? udpLengthOverrideSelectionPatch(action.enabled, stream) : null;
    case "udp-length":
      return { udp_length: action.length };
    case "udp-length-mode":
      return { udp_length_mode: action.mode };
    case "udp-length-count":
      return { udp_length_count: action.count };
    case "udp-length-step":
      return { udp_length_step: action.step };
    case "udp-checksum-override":
      return { udp_checksum_override: action.override };
    case "udp-checksum":
      return { udp_checksum: action.checksum };
    case "udp-checksum-mode":
      return { udp_checksum_mode: action.mode };
    case "udp-checksum-count":
      return { udp_checksum_count: action.count };
    case "udp-checksum-step":
      return { udp_checksum_step: action.step };
    case "dns-selection":
      return stream ? dnsSelectionPatch(action.enabled, stream) : null;
    case "dns-answer-selection":
      return stream ? dnsAnswerSelectionPatch(action.enabled, stream) : null;
    case "dns-number":
      return dnsNumericPatch(action.field, action.value);
    case "dns-text":
      return dnsTextPatch(action.field, action.value);
    case "dns-mode":
      return dnsModePatch(action);
    case "dns-count":
      return dnsCountPatch(action.field, action.count);
    case "dns-step":
      return dnsStepPatch(action.field, action.step);
    case "dhcp-selection":
      return stream ? dhcpSelectionPatch(action.enabled, stream) : null;
    case "dhcp-bootp-number":
      return dhcpBootpNumericPatch(action.field, action.value);
    case "dhcp-bootp-text":
      return dhcpBootpTextPatch(action.field, action.value);
    case "dhcp-bootp-mode":
      return dhcpBootpModePatch(action);
    case "dhcp-bootp-count":
      return dhcpBootpCountPatch(action.field, action.count);
    case "dhcp-bootp-step":
      return dhcpBootpStepPatch(action.field, action.step);
    case "dhcp-bootp-address-text":
      return dhcpBootpAddressTextPatch(action.field, action.value);
    case "dhcp-bootp-address-mode":
      return dhcpBootpAddressModePatch(action);
    case "dhcp-bootp-address-count":
      return dhcpBootpAddressCountPatch(action.field, action.count);
    case "dhcp-bootp-address-step":
      return dhcpBootpAddressStepPatch(action.field, action.step);
    case "dhcp-option-text":
      return dhcpOptionTextPatch(action.field, action.value);
    case "dhcp-option-timer-number":
      return dhcpOptionTimerNumericPatch(action.field, action.value);
    case "dhcp-option-timer-mode":
      return dhcpOptionTimerModePatch(action);
    case "dhcp-option-timer-count":
      return dhcpOptionTimerCountPatch(action.field, action.count);
    case "dhcp-option-timer-step":
      return dhcpOptionTimerStepPatch(action.field, action.step);
    case "dhcp-option-address-text":
      return dhcpOptionAddressTextPatch(action.field, action.value);
    case "dhcp-option-address-mode":
      return dhcpOptionAddressModePatch(action);
    case "dhcp-option-address-count":
      return dhcpOptionAddressCountPatch(action.field, action.count);
    case "dhcp-option-address-step":
      return dhcpOptionAddressStepPatch(action.field, action.step);
    case "sctp-number":
      return sctpNumericPatch(action.field, action.value);
    case "sctp-mode":
      return stream ? sctpModePatch(action, stream) : null;
    case "sctp-count":
      return sctpCountPatch(action.field, action.count);
    case "sctp-step":
      return sctpStepPatch(action.field, action.step);
    case "sctp-checksum-override":
      return { sctp_checksum_override: action.override };
    case "sctp-checksum":
      return { sctp_checksum: action.checksum };
    case "tcp-core-number":
      return tcpCoreNumericPatch(action.field, action.value);
    case "tcp-core-mode":
      return tcpCoreModePatch(action);
    case "tcp-core-count":
      return tcpCoreCountPatch(action.field, action.count);
    case "tcp-core-step":
      return tcpCoreStepPatch(action.field, action.step);
    case "tcp-checksum-override":
      return { tcp_checksum_override: action.override };
    case "tcp-checksum":
      return { tcp_checksum: action.checksum };
    case "tcp-flag":
      return tcpFlagPatch(action.flag, action.checked);
    case "tcp-option-selection":
      return tcpOptionSelectionPatch(action.option, action.enabled);
    case "tcp-option-number":
      return tcpOptionNumericPatch(action.field, action.value);
    case "tcp-option-mode":
      return tcpOptionModePatch(action);
    case "tcp-option-count":
      return tcpOptionCountPatch(action.field, action.count);
    case "tcp-option-step":
      return tcpOptionStepPatch(action.field, action.step);
    case "payload-selection":
      return payloadSelectionPatch(action.enabled);
    case "payload-type":
      return { payload_type: action.payloadType };
    case "payload-pattern":
      return { payload_pattern: action.pattern };
    case "payload-pattern-import":
      return payloadPatternImportPatch(action.pattern);
    case "advanced-cache-size-type":
      return { advanced_cache_size_type: action.cacheSizeType };
    case "advanced-cache-value":
      return { advanced_cache_value: action.cacheValue };
    case "frame-length-type":
      return frameLengthTypePatch(action.frameLengthType, stream);
    case "packet-type":
      return packetTypePatch(action.packetType, stream);
    case "icmp-type":
      return icmpTypePatch(action.icmpType, stream);
    case "icmp-type-mode":
      return stream ? icmpChecksumCoupledModePatch("icmp_type_mode", action.mode, stream) : null;
    case "icmp-type-count":
      return { icmp_type_count: action.count };
    case "icmp-type-step":
      return { icmp_type_step: action.step };
    case "icmp-code":
      return { icmp_code: action.code };
    case "icmp-code-mode":
      return stream ? icmpChecksumCoupledModePatch("icmp_code_mode", action.mode, stream) : null;
    case "icmp-code-count":
      return { icmp_code_count: action.count };
    case "icmp-code-step":
      return { icmp_code_step: action.step };
    case "icmp-identifier":
      return { icmp_identifier: action.identifier };
    case "icmp-identifier-mode":
      return stream ? icmpChecksumCoupledModePatch("icmp_identifier_mode", action.mode, stream) : null;
    case "icmp-identifier-count":
      return { icmp_identifier_count: action.count };
    case "icmp-identifier-step":
      return { icmp_identifier_step: action.step };
    case "icmp-sequence":
      return { icmp_sequence: action.sequence };
    case "icmp-sequence-mode":
      return stream ? icmpChecksumCoupledModePatch("icmp_sequence_mode", action.mode, stream) : null;
    case "icmp-sequence-count":
      return { icmp_sequence_count: action.count };
    case "icmp-sequence-step":
      return { icmp_sequence_step: action.step };
    case "icmp-checksum-override":
      return { icmp_checksum_override: action.override };
    case "icmp-checksum":
      return { icmp_checksum: action.checksum };
    case "icmpv6-rs-slla-selection":
      return stream ? icmpv6RsSllaSelectionPatch(action.enabled, stream) : null;
    case "icmpv6-rs-slla-mac":
      return { icmpv6_rs_slla_mac: action.mac };
    case "icmpv6-ra-current-hop-limit":
      return { icmpv6_ra_cur_hop_limit: action.hopLimit };
    case "icmpv6-ra-router-lifetime":
      return { icmpv6_ra_router_lifetime: action.lifetime };
    case "icmpv6-ra-reachable-time":
      return { icmpv6_ra_reachable_time: action.reachableTime };
    case "icmpv6-ra-retrans-timer":
      return { icmpv6_ra_retrans_timer: action.retransTimer };
    case "icmpv6-ra-managed-flag":
      return { icmpv6_ra_managed: action.enabled };
    case "icmpv6-ra-other-flag":
      return { icmpv6_ra_other: action.enabled };
    case "icmpv6-ra-slla-selection":
      return stream ? icmpv6RaSllaSelectionPatch(action.enabled, stream) : null;
    case "icmpv6-ra-slla-mac":
      return { icmpv6_ra_slla_mac: action.mac };
    case "icmpv6-ra-prefix-selection":
      return stream ? icmpv6RaPrefixSelectionPatch(action.enabled, stream) : null;
    case "icmpv6-ra-prefix":
      return { icmpv6_ra_prefix: action.prefix };
    case "icmpv6-ra-prefix-length":
      return { icmpv6_ra_prefix_length: action.prefixLength };
    case "icmpv6-ra-prefix-on-link-flag":
      return { icmpv6_ra_prefix_on_link: action.enabled };
    case "icmpv6-ra-prefix-autonomous-flag":
      return { icmpv6_ra_prefix_autonomous: action.enabled };
    case "icmpv6-ra-prefix-valid-lifetime":
      return { icmpv6_ra_prefix_valid_lifetime: action.lifetime };
    case "icmpv6-ra-prefix-preferred-lifetime":
      return { icmpv6_ra_prefix_preferred_lifetime: action.lifetime };
    case "icmpv6-nd-target":
      return { icmpv6_nd_target: action.target };
    case "icmpv6-nd-option-selection":
      return { icmpv6_nd_include_option: action.enabled };
    case "icmpv6-nd-option-mac":
      return { icmpv6_nd_option_mac: action.mac };
    case "icmpv6-nd-na-router-flag":
      return { icmpv6_nd_na_router: action.enabled };
    case "icmpv6-nd-na-solicited-flag":
      return { icmpv6_nd_na_solicited: action.enabled };
    case "icmpv6-nd-na-override-flag":
      return { icmpv6_nd_na_override: action.enabled };
    case "vxlan-selection":
      return vxlanSelectionPatch(action.enabled, stream);
    case "vxlan-vni":
      return { vxlan_vni: action.vni };
    case "vxlan-vni-mode":
      return { vxlan_vni_mode: action.mode };
    case "vxlan-vni-count":
      return { vxlan_vni_count: action.count };
    case "vxlan-vni-step":
      return { vxlan_vni_step: action.step };
    case "vxlan-inner-ip-version":
      return vxlanInnerIpVersionPatch(action.version, stream);
    case "vxlan-inner-ipv6-hop-limit":
      return { vxlan_inner_ipv6_hop_limit: action.hopLimit };
    case "vxlan-inner-ipv6-hop-limit-mode":
      return { vxlan_inner_ipv6_hop_limit_mode: action.mode };
    case "vxlan-inner-ipv6-hop-limit-count":
      return { vxlan_inner_ipv6_hop_limit_count: action.count };
    case "vxlan-inner-ipv6-hop-limit-step":
      return { vxlan_inner_ipv6_hop_limit_step: action.step };
    case "vxlan-inner-ipv4-ttl":
      return { vxlan_inner_ipv4_ttl: action.ttl };
    case "vxlan-inner-ipv4-ttl-mode":
      return { vxlan_inner_ipv4_ttl_mode: action.mode };
    case "vxlan-inner-ipv4-ttl-count":
      return { vxlan_inner_ipv4_ttl_count: action.count };
    case "vxlan-inner-ipv4-ttl-step":
      return { vxlan_inner_ipv4_ttl_step: action.step };
    case "vxlan-inner-ether-dst":
      return { vxlan_inner_ether_dst: action.address };
    case "vxlan-inner-ether-src":
      return { vxlan_inner_ether_src: action.address };
    case "vxlan-inner-ipv6-src":
      return { vxlan_inner_ipv6_src: action.address };
    case "vxlan-inner-ipv6-src-mode":
      return { vxlan_inner_ipv6_src_mode: action.mode };
    case "vxlan-inner-ipv6-src-count":
      return { vxlan_inner_ipv6_src_count: action.count };
    case "vxlan-inner-ipv6-src-step":
      return { vxlan_inner_ipv6_src_step: action.step };
    case "vxlan-inner-ipv6-dst":
      return { vxlan_inner_ipv6_dst: action.address };
    case "vxlan-inner-ipv6-dst-mode":
      return { vxlan_inner_ipv6_dst_mode: action.mode };
    case "vxlan-inner-ipv6-dst-count":
      return { vxlan_inner_ipv6_dst_count: action.count };
    case "vxlan-inner-ipv6-dst-step":
      return { vxlan_inner_ipv6_dst_step: action.step };
    case "vxlan-inner-ipv4-src":
      return { vxlan_inner_ipv4_src: action.address };
    case "vxlan-inner-ipv4-src-mode":
      return { vxlan_inner_ipv4_src_mode: action.mode };
    case "vxlan-inner-ipv4-src-count":
      return { vxlan_inner_ipv4_src_count: action.count };
    case "vxlan-inner-ipv4-src-step":
      return { vxlan_inner_ipv4_src_step: action.step };
    case "vxlan-inner-ipv4-dst":
      return { vxlan_inner_ipv4_dst: action.address };
    case "vxlan-inner-ipv4-dst-mode":
      return { vxlan_inner_ipv4_dst_mode: action.mode };
    case "vxlan-inner-ipv4-dst-count":
      return { vxlan_inner_ipv4_dst_count: action.count };
    case "vxlan-inner-ipv4-dst-step":
      return { vxlan_inner_ipv4_dst_step: action.step };
    case "vxlan-inner-l4-src-port":
      return { vxlan_inner_l4_src_port: action.port };
    case "vxlan-inner-l4-src-port-mode":
      return { vxlan_inner_l4_src_port_mode: action.mode };
    case "vxlan-inner-l4-src-port-count":
      return { vxlan_inner_l4_src_port_count: action.count };
    case "vxlan-inner-l4-src-port-step":
      return { vxlan_inner_l4_src_port_step: action.step };
    case "vxlan-inner-l4-dst-port":
      return { vxlan_inner_l4_dst_port: action.port };
    case "vxlan-inner-l4-dst-port-mode":
      return { vxlan_inner_l4_dst_port_mode: action.mode };
    case "vxlan-inner-l4-dst-port-count":
      return { vxlan_inner_l4_dst_port_count: action.count };
    case "vxlan-inner-l4-dst-port-step":
      return { vxlan_inner_l4_dst_port_step: action.step };
    case "gtpu-selection":
      return gtpuSelectionPatch(action.enabled, stream);
    case "gtpu-message-type":
      return { gtpu_message_type: action.messageType };
    case "gtpu-teid":
      return { gtpu_teid: action.teid };
    case "gtpu-teid-mode":
      return { gtpu_teid_mode: action.mode };
    case "gtpu-teid-count":
      return { gtpu_teid_count: action.count };
    case "gtpu-teid-step":
      return { gtpu_teid_step: action.step };
    case "gtpu-sequence-selection":
      return stream ? gtpuSequenceSelectionPatch(action.enabled, stream) : null;
    case "gtpu-sequence":
      return { gtpu_sequence: action.sequence };
    case "gtpu-sequence-mode":
      return { gtpu_sequence_mode: action.mode };
    case "gtpu-sequence-count":
      return { gtpu_sequence_count: action.count };
    case "gtpu-sequence-step":
      return { gtpu_sequence_step: action.step };
    case "gtpu-npdu-selection":
      return stream ? gtpuNpduSelectionPatch(action.enabled, stream) : null;
    case "gtpu-npdu":
      return { gtpu_npdu: action.npdu };
    case "gtpu-npdu-mode":
      return { gtpu_npdu_mode: action.mode };
    case "gtpu-npdu-count":
      return { gtpu_npdu_count: action.count };
    case "gtpu-npdu-step":
      return { gtpu_npdu_step: action.step };
    case "gtpu-extension-selection":
      return stream ? gtpuExtensionSelectionPatch(action.enabled, stream) : null;
    case "gtpu-extension-udp-port":
      return { gtpu_extension_udp_port: action.port };
    case "gtpu-extension-udp-port-mode":
      return { gtpu_extension_udp_port_mode: action.mode };
    case "gtpu-extension-udp-port-count":
      return { gtpu_extension_udp_port_count: action.count };
    case "gtpu-extension-udp-port-step":
      return { gtpu_extension_udp_port_step: action.step };
    case "gtpu-inner-ip-version":
      return gtpuInnerIpVersionPatch(action.version, stream);
    case "gtpu-inner-ipv4-ttl":
      return { gtpu_inner_ipv4_ttl: action.ttl };
    case "gtpu-inner-ipv4-ttl-mode":
      return { gtpu_inner_ipv4_ttl_mode: action.mode };
    case "gtpu-inner-ipv4-ttl-count":
      return { gtpu_inner_ipv4_ttl_count: action.count };
    case "gtpu-inner-ipv4-ttl-step":
      return { gtpu_inner_ipv4_ttl_step: action.step };
    case "gtpu-inner-ipv6-hop-limit":
      return { gtpu_inner_ipv6_hop_limit: action.hopLimit };
    case "gtpu-inner-ipv6-hop-limit-mode":
      return { gtpu_inner_ipv6_hop_limit_mode: action.mode };
    case "gtpu-inner-ipv6-hop-limit-count":
      return { gtpu_inner_ipv6_hop_limit_count: action.count };
    case "gtpu-inner-ipv6-hop-limit-step":
      return { gtpu_inner_ipv6_hop_limit_step: action.step };
    case "gtpu-inner-ipv4-src":
      return { gtpu_inner_ipv4_src: action.address };
    case "gtpu-inner-ipv4-src-mode":
      return { gtpu_inner_ipv4_src_mode: action.mode };
    case "gtpu-inner-ipv4-src-count":
      return { gtpu_inner_ipv4_src_count: action.count };
    case "gtpu-inner-ipv4-src-step":
      return { gtpu_inner_ipv4_src_step: action.step };
    case "gtpu-inner-ipv4-dst":
      return { gtpu_inner_ipv4_dst: action.address };
    case "gtpu-inner-ipv4-dst-mode":
      return { gtpu_inner_ipv4_dst_mode: action.mode };
    case "gtpu-inner-ipv4-dst-count":
      return { gtpu_inner_ipv4_dst_count: action.count };
    case "gtpu-inner-ipv4-dst-step":
      return { gtpu_inner_ipv4_dst_step: action.step };
    case "gtpu-inner-ipv6-src":
      return { gtpu_inner_ipv6_src: action.address };
    case "gtpu-inner-ipv6-src-mode":
      return { gtpu_inner_ipv6_src_mode: action.mode };
    case "gtpu-inner-ipv6-src-count":
      return { gtpu_inner_ipv6_src_count: action.count };
    case "gtpu-inner-ipv6-src-step":
      return { gtpu_inner_ipv6_src_step: action.step };
    case "gtpu-inner-ipv6-dst":
      return { gtpu_inner_ipv6_dst: action.address };
    case "gtpu-inner-ipv6-dst-mode":
      return { gtpu_inner_ipv6_dst_mode: action.mode };
    case "gtpu-inner-ipv6-dst-count":
      return { gtpu_inner_ipv6_dst_count: action.count };
    case "gtpu-inner-ipv6-dst-step":
      return { gtpu_inner_ipv6_dst_step: action.step };
    case "gtpu-inner-l4-src-port":
      return { gtpu_inner_l4_src_port: action.port };
    case "gtpu-inner-l4-src-port-mode":
      return { gtpu_inner_l4_src_port_mode: action.mode };
    case "gtpu-inner-l4-src-port-count":
      return { gtpu_inner_l4_src_port_count: action.count };
    case "gtpu-inner-l4-src-port-step":
      return { gtpu_inner_l4_src_port_step: action.step };
    case "gtpu-inner-l4-dst-port":
      return { gtpu_inner_l4_dst_port: action.port };
    case "gtpu-inner-l4-dst-port-mode":
      return { gtpu_inner_l4_dst_port_mode: action.mode };
    case "gtpu-inner-l4-dst-port-count":
      return { gtpu_inner_l4_dst_port_count: action.count };
    case "gtpu-inner-l4-dst-port-step":
      return { gtpu_inner_l4_dst_port_step: action.step };
    case "gre-checksum-selection":
      return stream ? greChecksumSelectionPatch(action.enabled, stream) : null;
    case "gre-checksum-override":
      return { gre_checksum_override: action.enabled };
    case "gre-checksum":
      return { gre_checksum: action.checksum };
    case "gre-key-selection":
      return stream ? greKeySelectionPatch(action.enabled, stream) : null;
    case "gre-key":
      return { gre_key: action.key };
    case "gre-key-mode":
      return greChecksumInvalidatingModePatch("gre_key_mode", action.mode, "gre_key_present");
    case "gre-key-count":
      return { gre_key_count: action.count };
    case "gre-key-step":
      return { gre_key_step: action.step };
    case "gre-sequence-selection":
      return stream ? greSequenceSelectionPatch(action.enabled, stream) : null;
    case "gre-sequence":
      return { gre_sequence: action.sequence };
    case "gre-sequence-mode":
      return greChecksumInvalidatingModePatch("gre_sequence_mode", action.mode, "gre_sequence_present");
    case "gre-sequence-count":
      return { gre_sequence_count: action.count };
    case "gre-sequence-step":
      return { gre_sequence_step: action.step };
    case "gre-inner-ipv6-src":
      return { gre_inner_ipv6_src: action.address };
    case "gre-inner-ipv6-src-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv6_src_mode", action.mode);
    case "gre-inner-ipv6-src-count":
      return { gre_inner_ipv6_src_count: action.count };
    case "gre-inner-ipv6-src-step":
      return { gre_inner_ipv6_src_step: action.step };
    case "gre-inner-ipv6-dst":
      return { gre_inner_ipv6_dst: action.address };
    case "gre-inner-ipv6-dst-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv6_dst_mode", action.mode);
    case "gre-inner-ipv6-dst-count":
      return { gre_inner_ipv6_dst_count: action.count };
    case "gre-inner-ipv6-dst-step":
      return { gre_inner_ipv6_dst_step: action.step };
    case "gre-inner-ipv6-hop-limit":
      return { gre_inner_ipv6_hop_limit: action.hopLimit };
    case "gre-inner-ipv6-hop-limit-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv6_hop_limit_mode", action.mode);
    case "gre-inner-ipv6-hop-limit-count":
      return { gre_inner_ipv6_hop_limit_count: action.count };
    case "gre-inner-ipv6-hop-limit-step":
      return { gre_inner_ipv6_hop_limit_step: action.step };
    case "gre-inner-ipv4-src":
      return { gre_inner_ipv4_src: action.address };
    case "gre-inner-ipv4-src-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv4_src_mode", action.mode);
    case "gre-inner-ipv4-src-count":
      return { gre_inner_ipv4_src_count: action.count };
    case "gre-inner-ipv4-src-step":
      return { gre_inner_ipv4_src_step: action.step };
    case "gre-inner-ipv4-dst":
      return { gre_inner_ipv4_dst: action.address };
    case "gre-inner-ipv4-dst-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv4_dst_mode", action.mode);
    case "gre-inner-ipv4-dst-count":
      return { gre_inner_ipv4_dst_count: action.count };
    case "gre-inner-ipv4-dst-step":
      return { gre_inner_ipv4_dst_step: action.step };
    case "gre-inner-ipv4-ttl":
      return { gre_inner_ipv4_ttl: action.ttl };
    case "gre-inner-ipv4-ttl-mode":
      return greChecksumInvalidatingModePatch("gre_inner_ipv4_ttl_mode", action.mode);
    case "gre-inner-ipv4-ttl-count":
      return { gre_inner_ipv4_ttl_count: action.count };
    case "gre-inner-ipv4-ttl-step":
      return { gre_inner_ipv4_ttl_step: action.step };
    case "gre-inner-l4-src-port":
      return { gre_inner_l4_src_port: action.port };
    case "gre-inner-l4-src-port-mode":
      return greChecksumInvalidatingModePatch("gre_inner_l4_src_port_mode", action.mode);
    case "gre-inner-l4-src-port-count":
      return { gre_inner_l4_src_port_count: action.count };
    case "gre-inner-l4-src-port-step":
      return { gre_inner_l4_src_port_step: action.step };
    case "gre-inner-l4-dst-port":
      return { gre_inner_l4_dst_port: action.port };
    case "gre-inner-l4-dst-port-mode":
      return greChecksumInvalidatingModePatch("gre_inner_l4_dst_port_mode", action.mode);
    case "gre-inner-l4-dst-port-count":
      return { gre_inner_l4_dst_port_count: action.count };
    case "gre-inner-l4-dst-port-step":
      return { gre_inner_l4_dst_port_step: action.step };
    case "gre-inner-ip-version":
      return greInnerIpVersionPatch(action.version, stream);
  }
}

export function runSelectedStreamPatchAction(
  action: SelectedStreamPatchAction,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runStreamPatch(selectedStreamPatch(action, stream), handlers);
}

export function runSelectedStreamPatch(
  action: SelectedStreamPatchAction,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatchAction(action, stream, handlers);
}

export function runStreamModeChange(
  mode: ProfileWorkbenchStream["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(streamModeAction(mode), stream, handlers);
}

export function runStreamEnabledChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(streamEnabledAction(enabled), stream, handlers);
}

export function runSelfStartChange(
  selfStart: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(selfStartAction(selfStart), stream, handlers);
}

export function runTotalPacketsChange(
  totalPackets: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(totalPacketsAction(totalPackets), stream, handlers);
}

export function runBurstCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(burstCountAction(count), stream, handlers);
}

export function runPacketsPerBurstChange(
  packetsPerBurst: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(packetsPerBurstAction(packetsPerBurst), stream, handlers);
}

export function runRateTypeChange(
  rateType: ProfileWorkbenchStream["rate_type"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(rateTypeAction(rateType), stream, handlers);
}

export function runRateValueChange(
  rateValue: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(rateValueAction(rateValue), stream, handlers);
}

export function runAfterStreamStopChange(
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(afterStreamStopAction(), stream, handlers);
}

export function runAfterStreamGotoChange(
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(afterStreamGotoAction(), stream, handlers);
}

export function runNextStreamChange(
  nextStreamId: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(nextStreamAction(nextStreamId), stream, handlers);
}

export function runLoopActionCountEnabledChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(loopActionCountEnabledAction(enabled), stream, handlers);
}

export function runLoopActionCountChange(
  actionCount: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(loopActionCountAction(actionCount), stream, handlers);
}

export function runIsgChange(
  isg: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(isgAction(isg), stream, handlers);
}

export function runIbgChange(
  ibg: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ibgAction(ibg), stream, handlers);
}

export function runFlowStatsEnabledChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(flowStatsEnabledAction(enabled), stream, handlers);
}

export function runPgIdChange(
  pgId: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(pgIdAction(pgId), stream, handlers);
}

export function runLatencyEnabledChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(latencyEnabledAction(enabled), stream, handlers);
}

export function runStreamNameChange(
  name: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(streamNameAction(name), stream, handlers);
}

export function runPacketFrameLengthChange(
  frameLength: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(packetFrameLengthAction(frameLength), stream, handlers);
}

export function runFrameLengthMinChange(
  frameLengthMin: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(frameLengthMinAction(frameLengthMin), stream, handlers);
}

export function runFrameLengthMaxChange(
  frameLengthMax: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(frameLengthMaxAction(frameLengthMax), stream, handlers);
}

export function runFrameLengthTypeChange(
  frameLengthType: ProfileWorkbenchStream["frame_length_type"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(frameLengthTypeAction(frameLengthType), stream, handlers);
}

export function runEtherTypeOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherTypeOverrideAction(override), stream, handlers);
}

export function runEtherTypeChange(
  etherType: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherTypeAction(etherType), stream, handlers);
}

export function runEtherDestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherDestinationAction(address), stream, handlers);
}

export function runEtherDestinationModeChange(
  mode: ProfileWorkbenchStream["ether_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherDestinationModeAction(mode), stream, handlers);
}

export function runEtherDestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherDestinationCountAction(count), stream, handlers);
}

export function runEtherDestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherDestinationStepAction(step), stream, handlers);
}

export function runEtherSourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherSourceAction(address), stream, handlers);
}

export function runEtherSourceModeChange(
  mode: ProfileWorkbenchStream["ether_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherSourceModeAction(mode), stream, handlers);
}

export function runEtherSourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherSourceCountAction(count), stream, handlers);
}

export function runEtherSourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(etherSourceStepAction(step), stream, handlers);
}

export function runArpHardwareTypeChange(
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpHardwareTypeAction(value), stream, handlers);
}

export function runArpProtocolTypeChange(
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpProtocolTypeAction(value), stream, handlers);
}

export function runArpHardwareSizeChange(
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpHardwareSizeAction(value), stream, handlers);
}

export function runArpProtocolSizeChange(
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpProtocolSizeAction(value), stream, handlers);
}

export function runArpOperationChange(
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpOperationAction(value), stream, handlers);
}

export function runArpOperationModeChange(
  mode: ProfileWorkbenchStream["arp_operation_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpOperationModeAction(mode), stream, handlers);
}

export function runArpOperationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpOperationCountAction(count), stream, handlers);
}

export function runArpOperationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpOperationStepAction(step), stream, handlers);
}

export function runArpSenderMacChange(
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderMacAction(value), stream, handlers);
}

export function runArpSenderMacModeChange(
  mode: ProfileWorkbenchStream["arp_sender_mac_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderMacModeAction(mode), stream, handlers);
}

export function runArpSenderMacCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderMacCountAction(count), stream, handlers);
}

export function runArpSenderMacStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderMacStepAction(step), stream, handlers);
}

export function runArpSenderIpChange(
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderIpAction(value), stream, handlers);
}

export function runArpSenderIpModeChange(
  mode: ProfileWorkbenchStream["arp_sender_ip_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderIpModeAction(mode), stream, handlers);
}

export function runArpSenderIpCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderIpCountAction(count), stream, handlers);
}

export function runArpSenderIpStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpSenderIpStepAction(step), stream, handlers);
}

export function runArpTargetMacChange(
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetMacAction(value), stream, handlers);
}

export function runArpTargetMacModeChange(
  mode: ProfileWorkbenchStream["arp_target_mac_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetMacModeAction(mode), stream, handlers);
}

export function runArpTargetMacCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetMacCountAction(count), stream, handlers);
}

export function runArpTargetMacStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetMacStepAction(step), stream, handlers);
}

export function runArpTargetIpChange(
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetIpAction(value), stream, handlers);
}

export function runArpTargetIpModeChange(
  mode: ProfileWorkbenchStream["arp_target_ip_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetIpModeAction(mode), stream, handlers);
}

export function runArpTargetIpCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetIpCountAction(count), stream, handlers);
}

export function runArpTargetIpStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(arpTargetIpStepAction(step), stream, handlers);
}

export function runIpv4DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DestinationAction(address), stream, handlers);
}

export function runIpv4DestinationModeChange(
  mode: ProfileWorkbenchStream["ipv4_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DestinationModeAction(mode), stream, handlers);
}

export function runIpv4DestinationCountChange(
  count: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DestinationCountAction(count), stream, handlers);
}

export function runIpv4DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DestinationStepAction(step), stream, handlers);
}

export function runIpv4SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4SourceAction(address), stream, handlers);
}

export function runIpv4SourceModeChange(
  mode: ProfileWorkbenchStream["ipv4_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4SourceModeAction(mode), stream, handlers);
}

export function runIpv4SourceCountChange(
  count: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4SourceCountAction(count), stream, handlers);
}

export function runIpv4SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4SourceStepAction(step), stream, handlers);
}

export function runIpv4DscpChange(
  dscp: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DscpAction(dscp), stream, handlers);
}

export function runIpv4DscpModeChange(
  mode: ProfileWorkbenchStream["ipv4_dscp_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DscpModeAction(mode), stream, handlers);
}

export function runIpv4DscpCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DscpCountAction(count), stream, handlers);
}

export function runIpv4DscpStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DscpStepAction(step), stream, handlers);
}

export function runIpv4EcnChange(
  ecn: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4EcnAction(ecn), stream, handlers);
}

export function runIpv4EcnModeChange(
  mode: ProfileWorkbenchStream["ipv4_ecn_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4EcnModeAction(mode), stream, handlers);
}

export function runIpv4EcnCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4EcnCountAction(count), stream, handlers);
}

export function runIpv4EcnStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4EcnStepAction(step), stream, handlers);
}

export function runIpv4IdentificationChange(
  identification: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4IdentificationAction(identification), stream, handlers);
}

export function runIpv4IdentificationModeChange(
  mode: ProfileWorkbenchStream["ipv4_id_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4IdentificationModeAction(mode), stream, handlers);
}

export function runIpv4IdentificationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4IdentificationCountAction(count), stream, handlers);
}

export function runIpv4IdentificationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4IdentificationStepAction(step), stream, handlers);
}

export function runIpv4DfFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4DfFlagAction(enabled), stream, handlers);
}

export function runIpv4MfFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4MfFlagAction(enabled), stream, handlers);
}

export function runIpv4FragmentOffsetChange(
  fragmentOffset: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4FragmentOffsetAction(fragmentOffset), stream, handlers);
}

export function runIpv4FragmentOffsetModeChange(
  mode: ProfileWorkbenchStream["ipv4_fragment_offset_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4FragmentOffsetModeAction(mode), stream, handlers);
}

export function runIpv4FragmentOffsetCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4FragmentOffsetCountAction(count), stream, handlers);
}

export function runIpv4FragmentOffsetStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4FragmentOffsetStepAction(step), stream, handlers);
}

export function runIpv4TtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4TtlAction(ttl), stream, handlers);
}

export function runIpv4TtlModeChange(
  mode: ProfileWorkbenchStream["ipv4_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4TtlModeAction(mode), stream, handlers);
}

export function runIpv4TtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4TtlCountAction(count), stream, handlers);
}

export function runIpv4TtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4TtlStepAction(step), stream, handlers);
}

export function runIpv4ChecksumOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4ChecksumOverrideAction(override), stream, handlers);
}

export function runIpv4ChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv4ChecksumAction(checksum), stream, handlers);
}

export function runIpv6DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6DestinationAction(address), stream, handlers);
}

export function runIpv6DestinationModeChange(
  mode: ProfileWorkbenchStream["ipv6_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6DestinationModeAction(mode), stream, handlers);
}

export function runIpv6DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6DestinationCountAction(count), stream, handlers);
}

export function runIpv6DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6DestinationStepAction(step), stream, handlers);
}

export function runIpv6SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6SourceAction(address), stream, handlers);
}

export function runIpv6SourceModeChange(
  mode: ProfileWorkbenchStream["ipv6_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6SourceModeAction(mode), stream, handlers);
}

export function runIpv6SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6SourceCountAction(count), stream, handlers);
}

export function runIpv6SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6SourceStepAction(step), stream, handlers);
}

export function runIpv6TrafficClassChange(
  trafficClass: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6TrafficClassAction(trafficClass), stream, handlers);
}

export function runIpv6TrafficClassModeChange(
  mode: ProfileWorkbenchStream["ipv6_traffic_class_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6TrafficClassModeAction(mode), stream, handlers);
}

export function runIpv6TrafficClassCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6TrafficClassCountAction(count), stream, handlers);
}

export function runIpv6TrafficClassStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6TrafficClassStepAction(step), stream, handlers);
}

export function runIpv6FlowLabelChange(
  flowLabel: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6FlowLabelAction(flowLabel), stream, handlers);
}

export function runIpv6FlowLabelModeChange(
  mode: ProfileWorkbenchStream["ipv6_flow_label_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6FlowLabelModeAction(mode), stream, handlers);
}

export function runIpv6FlowLabelCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6FlowLabelCountAction(count), stream, handlers);
}

export function runIpv6FlowLabelStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6FlowLabelStepAction(step), stream, handlers);
}

export function runIpv6HopLimitChange(
  hopLimit: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6HopLimitAction(hopLimit), stream, handlers);
}

export function runIpv6HopLimitModeChange(
  mode: ProfileWorkbenchStream["ipv6_hop_limit_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6HopLimitModeAction(mode), stream, handlers);
}

export function runIpv6HopLimitCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6HopLimitCountAction(count), stream, handlers);
}

export function runIpv6HopLimitStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(ipv6HopLimitStepAction(step), stream, handlers);
}

export function runVlanSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanSelectionAction(enabled), stream, handlers);
}

export function runVlanTpidOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanTpidOverrideAction(override), stream, handlers);
}

export function runVlanTpidChange(
  tpid: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanTpidAction(tpid), stream, handlers);
}

export function runVlanPriorityChange(
  priority: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanPriorityAction(priority), stream, handlers);
}

export function runVlanPriorityModeChange(
  mode: ProfileWorkbenchStream["vlan_priority_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanPriorityModeAction(mode), stream, handlers);
}

export function runVlanPriorityCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanPriorityCountAction(count), stream, handlers);
}

export function runVlanPriorityStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanPriorityStepAction(step), stream, handlers);
}

export function runVlanCfiChange(
  cfi: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanCfiAction(cfi), stream, handlers);
}

export function runVlanIdChange(
  vlanId: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanIdAction(vlanId), stream, handlers);
}

export function runVlanIdModeChange(
  mode: ProfileWorkbenchStream["vlan_id_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanIdModeAction(mode), stream, handlers);
}

export function runVlanIdCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanIdCountAction(count), stream, handlers);
}

export function runVlanIdStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanIdStepAction(step), stream, handlers);
}

export function runVlanInnerSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerSelectionAction(enabled), stream, handlers);
}

export function runVlanInnerTpidOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerTpidOverrideAction(override), stream, handlers);
}

export function runVlanInnerTpidChange(
  tpid: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerTpidAction(tpid), stream, handlers);
}

export function runVlanInnerPriorityChange(
  priority: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerPriorityAction(priority), stream, handlers);
}

export function runVlanInnerPriorityModeChange(
  mode: ProfileWorkbenchStream["vlan2_priority_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerPriorityModeAction(mode), stream, handlers);
}

export function runVlanInnerPriorityCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerPriorityCountAction(count), stream, handlers);
}

export function runVlanInnerPriorityStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerPriorityStepAction(step), stream, handlers);
}

export function runVlanInnerCfiChange(
  cfi: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerCfiAction(cfi), stream, handlers);
}

export function runVlanInnerIdChange(
  vlanId: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerIdAction(vlanId), stream, handlers);
}

export function runVlanInnerIdModeChange(
  mode: ProfileWorkbenchStream["vlan2_id_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerIdModeAction(mode), stream, handlers);
}

export function runVlanInnerIdCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerIdCountAction(count), stream, handlers);
}

export function runVlanInnerIdStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vlanInnerIdStepAction(step), stream, handlers);
}

export function runMplsSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSelectionAction(enabled), stream, handlers);
}

export function runMplsLabelChange(
  label: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsLabelAction(label), stream, handlers);
}

export function runMplsLabelModeChange(
  mode: ProfileWorkbenchStream["mpls_label_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsLabelModeAction(mode), stream, handlers);
}

export function runMplsLabelCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsLabelCountAction(count), stream, handlers);
}

export function runMplsLabelStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsLabelStepAction(step), stream, handlers);
}

export function runMplsTrafficClassChange(
  trafficClass: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTrafficClassAction(trafficClass), stream, handlers);
}

export function runMplsTrafficClassModeChange(
  mode: ProfileWorkbenchStream["mpls_tc_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTrafficClassModeAction(mode), stream, handlers);
}

export function runMplsTrafficClassCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTrafficClassCountAction(count), stream, handlers);
}

export function runMplsTrafficClassStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTrafficClassStepAction(step), stream, handlers);
}

export function runMplsTtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTtlAction(ttl), stream, handlers);
}

export function runMplsTtlModeChange(
  mode: ProfileWorkbenchStream["mpls_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTtlModeAction(mode), stream, handlers);
}

export function runMplsTtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTtlCountAction(count), stream, handlers);
}

export function runMplsTtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsTtlStepAction(step), stream, handlers);
}

export function runMplsSecondLabelSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondLabelSelectionAction(enabled), stream, handlers);
}

export function runMplsSecondLabelChange(
  label: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondLabelAction(label), stream, handlers);
}

export function runMplsSecondLabelModeChange(
  mode: ProfileWorkbenchStream["mpls_label2_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondLabelModeAction(mode), stream, handlers);
}

export function runMplsSecondLabelCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondLabelCountAction(count), stream, handlers);
}

export function runMplsSecondLabelStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondLabelStepAction(step), stream, handlers);
}

export function runMplsSecondTrafficClassChange(
  trafficClass: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTrafficClassAction(trafficClass), stream, handlers);
}

export function runMplsSecondTrafficClassModeChange(
  mode: ProfileWorkbenchStream["mpls_label2_tc_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTrafficClassModeAction(mode), stream, handlers);
}

export function runMplsSecondTrafficClassCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTrafficClassCountAction(count), stream, handlers);
}

export function runMplsSecondTrafficClassStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTrafficClassStepAction(step), stream, handlers);
}

export function runMplsSecondTtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTtlAction(ttl), stream, handlers);
}

export function runMplsSecondTtlModeChange(
  mode: ProfileWorkbenchStream["mpls_label2_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTtlModeAction(mode), stream, handlers);
}

export function runMplsSecondTtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTtlCountAction(count), stream, handlers);
}

export function runMplsSecondTtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsSecondTtlStepAction(step), stream, handlers);
}

export function runMplsThirdLabelSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdLabelSelectionAction(enabled), stream, handlers);
}

export function runMplsThirdLabelChange(
  label: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdLabelAction(label), stream, handlers);
}

export function runMplsThirdLabelModeChange(
  mode: ProfileWorkbenchStream["mpls_label3_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdLabelModeAction(mode), stream, handlers);
}

export function runMplsThirdLabelCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdLabelCountAction(count), stream, handlers);
}

export function runMplsThirdLabelStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdLabelStepAction(step), stream, handlers);
}

export function runMplsThirdTrafficClassChange(
  trafficClass: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTrafficClassAction(trafficClass), stream, handlers);
}

export function runMplsThirdTrafficClassModeChange(
  mode: ProfileWorkbenchStream["mpls_label3_tc_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTrafficClassModeAction(mode), stream, handlers);
}

export function runMplsThirdTrafficClassCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTrafficClassCountAction(count), stream, handlers);
}

export function runMplsThirdTrafficClassStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTrafficClassStepAction(step), stream, handlers);
}

export function runMplsThirdTtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTtlAction(ttl), stream, handlers);
}

export function runMplsThirdTtlModeChange(
  mode: ProfileWorkbenchStream["mpls_label3_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTtlModeAction(mode), stream, handlers);
}

export function runMplsThirdTtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTtlCountAction(count), stream, handlers);
}

export function runMplsThirdTtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(mplsThirdTtlStepAction(step), stream, handlers);
}

export function runTunnelSelectionChange(
  tunnel: "none" | "vxlan" | "gtpu",
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tunnelSelectionAction(tunnel), stream, handlers);
}

export function runL3SelectionChange(
  selection: L3Selection,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l3SelectionAction(selection), stream, handlers);
}

export function runL4SelectionChange(
  selection: L4Selection,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SelectionAction(selection), stream, handlers);
}

export function runL4SourcePortOverrideSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SourcePortOverrideSelectionAction(enabled), stream, handlers);
}

export function runL4SourcePortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SourcePortAction(port), stream, handlers);
}

export function runL4SourcePortModeChange(
  mode: ProfileWorkbenchStream["l4_src_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SourcePortModeAction(mode), stream, handlers);
}

export function runL4SourcePortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SourcePortCountAction(count), stream, handlers);
}

export function runL4SourcePortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4SourcePortStepAction(step), stream, handlers);
}

export function runL4DestinationPortOverrideSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4DestinationPortOverrideSelectionAction(enabled), stream, handlers);
}

export function runL4DestinationPortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4DestinationPortAction(port), stream, handlers);
}

export function runL4DestinationPortModeChange(
  mode: ProfileWorkbenchStream["l4_dst_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4DestinationPortModeAction(mode), stream, handlers);
}

export function runL4DestinationPortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4DestinationPortCountAction(count), stream, handlers);
}

export function runL4DestinationPortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(l4DestinationPortStepAction(step), stream, handlers);
}

export function runUdpLengthOverrideSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpLengthOverrideSelectionAction(enabled), stream, handlers);
}

export function runUdpLengthChange(
  length: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpLengthAction(length), stream, handlers);
}

export function runUdpLengthModeChange(
  mode: ProfileWorkbenchStream["udp_length_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpLengthModeAction(mode), stream, handlers);
}

export function runUdpLengthCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpLengthCountAction(count), stream, handlers);
}

export function runUdpLengthStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpLengthStepAction(step), stream, handlers);
}

export function runUdpChecksumOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpChecksumOverrideAction(override), stream, handlers);
}

export function runUdpChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpChecksumAction(checksum), stream, handlers);
}

export function runUdpChecksumModeChange(
  mode: ProfileWorkbenchStream["udp_checksum_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpChecksumModeAction(mode), stream, handlers);
}

export function runUdpChecksumCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpChecksumCountAction(count), stream, handlers);
}

export function runUdpChecksumStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(udpChecksumStepAction(step), stream, handlers);
}

export function runDnsSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsSelectionAction(enabled), stream, handlers);
}

export function runDnsAnswerSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsAnswerSelectionAction(enabled), stream, handlers);
}

export function runDnsNumberChange(
  field: DnsNumericPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsNumberAction(field, value), stream, handlers);
}

export function runDnsTextChange(
  field: DnsTextPatchField,
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsTextAction(field, value), stream, handlers);
}

export function runDnsModeChange(
  field: "transaction-id",
  mode: ProfileWorkbenchStream["dns_transaction_id_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: "flags",
  mode: ProfileWorkbenchStream["dns_flags_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: "query-type",
  mode: ProfileWorkbenchStream["dns_query_type_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: "query-class",
  mode: ProfileWorkbenchStream["dns_query_class_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: "answer-ttl",
  mode: ProfileWorkbenchStream["dns_answer_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: "answer-ipv4",
  mode: ProfileWorkbenchStream["dns_answer_ipv4_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
): boolean;
export function runDnsModeChange(
  field: DnsModePatchAction["field"],
  mode: DnsModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch({ field, kind: "dns-mode", mode } as DnsModePatchAction, stream, handlers);
}

export function runDnsCountChange(
  field: DnsVariablePatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsCountAction(field, count), stream, handlers);
}

export function runDnsStepChange(
  field: DnsVariablePatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dnsStepAction(field, step), stream, handlers);
}

export function runDhcpSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpSelectionAction(enabled), stream, handlers);
}

export function runDhcpBootpNumberChange(
  field: DhcpBootpNumericPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpNumberAction(field, value), stream, handlers);
}

export function runDhcpBootpTextChange(
  field: DhcpBootpTextPatchField,
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpTextAction(field, value), stream, handlers);
}

export function runDhcpBootpModeChange(
  field: DhcpBootpModePatchAction["field"],
  mode: DhcpBootpModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch({ field, kind: "dhcp-bootp-mode", mode } as DhcpBootpModePatchAction, stream, handlers);
}

export function runDhcpBootpCountChange(
  field: DhcpBootpVariablePatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpCountAction(field, count), stream, handlers);
}

export function runDhcpBootpStepChange(
  field: DhcpBootpVariablePatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpStepAction(field, step), stream, handlers);
}

export function runDhcpBootpAddressTextChange(
  field: DhcpBootpAddressPatchField,
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpAddressTextAction(field, value), stream, handlers);
}

export function runDhcpBootpAddressModeChange(
  field: DhcpBootpAddressModePatchAction["field"],
  mode: DhcpBootpAddressModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(
    { field, kind: "dhcp-bootp-address-mode", mode } as DhcpBootpAddressModePatchAction,
    stream,
    handlers
  );
}

export function runDhcpBootpAddressCountChange(
  field: DhcpBootpAddressPatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpAddressCountAction(field, count), stream, handlers);
}

export function runDhcpBootpAddressStepChange(
  field: DhcpBootpAddressPatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpBootpAddressStepAction(field, step), stream, handlers);
}

export function runDhcpOptionTextChange(
  field: DhcpOptionTextPatchField,
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionTextAction(field, value), stream, handlers);
}

export function runDhcpOptionTimerNumberChange(
  field: DhcpOptionTimerPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionTimerNumberAction(field, value), stream, handlers);
}

export function runDhcpOptionTimerModeChange(
  field: DhcpOptionTimerModePatchAction["field"],
  mode: DhcpOptionTimerModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(
    { field, kind: "dhcp-option-timer-mode", mode } as DhcpOptionTimerModePatchAction,
    stream,
    handlers
  );
}

export function runDhcpOptionTimerCountChange(
  field: DhcpOptionTimerPatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionTimerCountAction(field, count), stream, handlers);
}

export function runDhcpOptionTimerStepChange(
  field: DhcpOptionTimerPatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionTimerStepAction(field, step), stream, handlers);
}

export function runDhcpOptionAddressTextChange(
  field: DhcpOptionAddressPatchField,
  value: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionAddressTextAction(field, value), stream, handlers);
}

export function runDhcpOptionAddressModeChange(
  field: DhcpOptionAddressModePatchAction["field"],
  mode: DhcpOptionAddressModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(
    { field, kind: "dhcp-option-address-mode", mode } as DhcpOptionAddressModePatchAction,
    stream,
    handlers
  );
}

export function runDhcpOptionAddressCountChange(
  field: DhcpOptionAddressPatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionAddressCountAction(field, count), stream, handlers);
}

export function runDhcpOptionAddressStepChange(
  field: DhcpOptionAddressPatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(dhcpOptionAddressStepAction(field, step), stream, handlers);
}

export function runSctpNumberChange(
  field: SctpNumericPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(sctpNumberAction(field, value), stream, handlers);
}

export function runSctpModeChange(
  field: SctpModePatchAction["field"],
  mode: SctpModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch({ field, kind: "sctp-mode", mode } as SctpModePatchAction, stream, handlers);
}

export function runSctpCountChange(
  field: SctpVariablePatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(sctpCountAction(field, count), stream, handlers);
}

export function runSctpStepChange(
  field: SctpVariablePatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(sctpStepAction(field, step), stream, handlers);
}

export function runSctpChecksumOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(sctpChecksumOverrideAction(override), stream, handlers);
}

export function runSctpChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(sctpChecksumAction(checksum), stream, handlers);
}

export function runTcpCoreNumberChange(
  field: TcpCoreNumericPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpCoreNumberAction(field, value), stream, handlers);
}

export function runTcpCoreModeChange(
  field: TcpCoreModePatchAction["field"],
  mode: TcpCoreModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch({ field, kind: "tcp-core-mode", mode } as TcpCoreModePatchAction, stream, handlers);
}

export function runTcpCoreCountChange(
  field: TcpCoreVariablePatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpCoreCountAction(field, count), stream, handlers);
}

export function runTcpCoreStepChange(
  field: TcpCoreVariablePatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpCoreStepAction(field, step), stream, handlers);
}

export function runTcpChecksumOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpChecksumOverrideAction(override), stream, handlers);
}

export function runTcpChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpChecksumAction(checksum), stream, handlers);
}

export function runTcpFlagChange(
  flag: TcpFlagKey,
  checked: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpFlagAction(flag, checked), stream, handlers);
}

export function runTcpOptionSelectionChange(
  option: TcpOptionSelection,
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpOptionSelectionAction(option, enabled), stream, handlers);
}

export function runTcpOptionNumberChange(
  field: TcpOptionNumericPatchField,
  value: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpOptionNumberAction(field, value), stream, handlers);
}

export function runTcpOptionModeChange(
  field: TcpOptionModePatchAction["field"],
  mode: TcpOptionModePatchAction["mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch({ field, kind: "tcp-option-mode", mode } as TcpOptionModePatchAction, stream, handlers);
}

export function runTcpOptionCountChange(
  field: TcpOptionVariablePatchField,
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpOptionCountAction(field, count), stream, handlers);
}

export function runTcpOptionStepChange(
  field: TcpOptionVariablePatchField,
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(tcpOptionStepAction(field, step), stream, handlers);
}

export function runPayloadSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(payloadSelectionAction(enabled), stream, handlers);
}

export function runPayloadTypeChange(
  payloadType: ProfileWorkbenchStream["payload_type"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(payloadTypeAction(payloadType), stream, handlers);
}

export function runPayloadPatternChange(
  pattern: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(payloadPatternAction(pattern), stream, handlers);
}

export function runPayloadPatternImportChange(
  pattern: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(payloadPatternImportAction(pattern), stream, handlers);
}

export function runAdvancedCacheSizeTypeChange(
  cacheSizeType: ProfileWorkbenchStream["advanced_cache_size_type"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(advancedCacheSizeTypeAction(cacheSizeType), stream, handlers);
}

export function runAdvancedCacheValueChange(
  cacheValue: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(advancedCacheValueAction(cacheValue), stream, handlers);
}

export function runPacketTypeChange(
  packetType: ProfileWorkbenchStream["packet_type"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(packetTypeAction(packetType), stream, handlers);
}

export function runIcmpTypeChange(
  icmpType: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpTypeAction(icmpType), stream, handlers);
}

export function runIcmpTypeModeChange(
  mode: ProfileWorkbenchStream["icmp_type_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpTypeModeAction(mode), stream, handlers);
}

export function runIcmpTypeCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpTypeCountAction(count), stream, handlers);
}

export function runIcmpTypeStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpTypeStepAction(step), stream, handlers);
}

export function runIcmpCodeChange(
  code: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpCodeAction(code), stream, handlers);
}

export function runIcmpCodeModeChange(
  mode: ProfileWorkbenchStream["icmp_code_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpCodeModeAction(mode), stream, handlers);
}

export function runIcmpCodeCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpCodeCountAction(count), stream, handlers);
}

export function runIcmpCodeStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpCodeStepAction(step), stream, handlers);
}

export function runIcmpIdentifierChange(
  identifier: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpIdentifierAction(identifier), stream, handlers);
}

export function runIcmpIdentifierModeChange(
  mode: ProfileWorkbenchStream["icmp_identifier_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpIdentifierModeAction(mode), stream, handlers);
}

export function runIcmpIdentifierCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpIdentifierCountAction(count), stream, handlers);
}

export function runIcmpIdentifierStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpIdentifierStepAction(step), stream, handlers);
}

export function runIcmpSequenceChange(
  sequence: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpSequenceAction(sequence), stream, handlers);
}

export function runIcmpSequenceModeChange(
  mode: ProfileWorkbenchStream["icmp_sequence_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpSequenceModeAction(mode), stream, handlers);
}

export function runIcmpSequenceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpSequenceCountAction(count), stream, handlers);
}

export function runIcmpSequenceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpSequenceStepAction(step), stream, handlers);
}

export function runIcmpChecksumOverrideChange(
  override: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpChecksumOverrideAction(override), stream, handlers);
}

export function runIcmpChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpChecksumAction(checksum), stream, handlers);
}

export function runIcmpv6RsSllaSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RsSllaSelectionAction(enabled), stream, handlers);
}

export function runIcmpv6RsSllaMacChange(
  mac: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RsSllaMacAction(mac), stream, handlers);
}

export function runIcmpv6RaCurrentHopLimitChange(
  hopLimit: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaCurrentHopLimitAction(hopLimit), stream, handlers);
}

export function runIcmpv6RaRouterLifetimeChange(
  lifetime: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaRouterLifetimeAction(lifetime), stream, handlers);
}

export function runIcmpv6RaReachableTimeChange(
  reachableTime: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaReachableTimeAction(reachableTime), stream, handlers);
}

export function runIcmpv6RaRetransTimerChange(
  retransTimer: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaRetransTimerAction(retransTimer), stream, handlers);
}

export function runIcmpv6RaManagedFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaManagedFlagAction(enabled), stream, handlers);
}

export function runIcmpv6RaOtherFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaOtherFlagAction(enabled), stream, handlers);
}

export function runIcmpv6RaSllaSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaSllaSelectionAction(enabled), stream, handlers);
}

export function runIcmpv6RaSllaMacChange(
  mac: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaSllaMacAction(mac), stream, handlers);
}

export function runIcmpv6RaPrefixSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixSelectionAction(enabled), stream, handlers);
}

export function runIcmpv6RaPrefixChange(
  prefix: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixAction(prefix), stream, handlers);
}

export function runIcmpv6RaPrefixLengthChange(
  prefixLength: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixLengthAction(prefixLength), stream, handlers);
}

export function runIcmpv6RaPrefixOnLinkFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixOnLinkFlagAction(enabled), stream, handlers);
}

export function runIcmpv6RaPrefixAutonomousFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixAutonomousFlagAction(enabled), stream, handlers);
}

export function runIcmpv6RaPrefixValidLifetimeChange(
  lifetime: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixValidLifetimeAction(lifetime), stream, handlers);
}

export function runIcmpv6RaPrefixPreferredLifetimeChange(
  lifetime: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6RaPrefixPreferredLifetimeAction(lifetime), stream, handlers);
}

export function runIcmpv6NdTargetChange(
  target: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdTargetAction(target), stream, handlers);
}

export function runIcmpv6NdOptionSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdOptionSelectionAction(enabled), stream, handlers);
}

export function runIcmpv6NdOptionMacChange(
  mac: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdOptionMacAction(mac), stream, handlers);
}

export function runIcmpv6NdNaRouterFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdNaRouterFlagAction(enabled), stream, handlers);
}

export function runIcmpv6NdNaSolicitedFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdNaSolicitedFlagAction(enabled), stream, handlers);
}

export function runIcmpv6NdNaOverrideFlagChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(icmpv6NdNaOverrideFlagAction(enabled), stream, handlers);
}

export function runVxlanInnerIpVersionChange(
  version: ProfileWorkbenchStream["vxlan_inner_ip_version"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpVersionAction(version), stream, handlers);
}

export function runVxlanVniChange(
  vni: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanVniAction(vni), stream, handlers);
}

export function runVxlanVniModeChange(
  mode: ProfileWorkbenchStream["vxlan_vni_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanVniModeAction(mode), stream, handlers);
}

export function runVxlanVniCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanVniCountAction(count), stream, handlers);
}

export function runVxlanVniStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanVniStepAction(step), stream, handlers);
}

export function runVxlanInnerIpv6HopLimitChange(
  hopLimit: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6HopLimitAction(hopLimit), stream, handlers);
}

export function runVxlanInnerIpv6HopLimitModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6HopLimitModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv6HopLimitCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6HopLimitCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv6HopLimitStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6HopLimitStepAction(step), stream, handlers);
}

export function runVxlanInnerIpv4TtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4TtlAction(ttl), stream, handlers);
}

export function runVxlanInnerIpv4TtlModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4TtlModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv4TtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4TtlCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv4TtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4TtlStepAction(step), stream, handlers);
}

export function runVxlanInnerEtherDestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerEtherDestinationAction(address), stream, handlers);
}

export function runVxlanInnerEtherSourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerEtherSourceAction(address), stream, handlers);
}

export function runVxlanInnerIpv6SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6SourceAction(address), stream, handlers);
}

export function runVxlanInnerIpv6SourceModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6SourceModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv6SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6SourceCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv6SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6SourceStepAction(step), stream, handlers);
}

export function runVxlanInnerIpv6DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6DestinationAction(address), stream, handlers);
}

export function runVxlanInnerIpv6DestinationModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv6_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6DestinationModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv6DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6DestinationCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv6DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv6DestinationStepAction(step), stream, handlers);
}

export function runVxlanInnerIpv4SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4SourceAction(address), stream, handlers);
}

export function runVxlanInnerIpv4SourceModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4SourceModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv4SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4SourceCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv4SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4SourceStepAction(step), stream, handlers);
}

export function runVxlanInnerIpv4DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4DestinationAction(address), stream, handlers);
}

export function runVxlanInnerIpv4DestinationModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_ipv4_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4DestinationModeAction(mode), stream, handlers);
}

export function runVxlanInnerIpv4DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4DestinationCountAction(count), stream, handlers);
}

export function runVxlanInnerIpv4DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerIpv4DestinationStepAction(step), stream, handlers);
}

export function runVxlanInnerL4SourcePortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4SourcePortAction(port), stream, handlers);
}

export function runVxlanInnerL4SourcePortModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_l4_src_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4SourcePortModeAction(mode), stream, handlers);
}

export function runVxlanInnerL4SourcePortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4SourcePortCountAction(count), stream, handlers);
}

export function runVxlanInnerL4SourcePortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4SourcePortStepAction(step), stream, handlers);
}

export function runVxlanInnerL4DestinationPortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4DestinationPortAction(port), stream, handlers);
}

export function runVxlanInnerL4DestinationPortModeChange(
  mode: ProfileWorkbenchStream["vxlan_inner_l4_dst_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4DestinationPortModeAction(mode), stream, handlers);
}

export function runVxlanInnerL4DestinationPortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4DestinationPortCountAction(count), stream, handlers);
}

export function runVxlanInnerL4DestinationPortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(vxlanInnerL4DestinationPortStepAction(step), stream, handlers);
}

export function runGtpuInnerIpVersionChange(
  version: ProfileWorkbenchStream["gtpu_inner_ip_version"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpVersionAction(version), stream, handlers);
}

export function runGtpuMessageTypeChange(
  messageType: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuMessageTypeAction(messageType), stream, handlers);
}

export function runGtpuTeidChange(
  teid: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuTeidAction(teid), stream, handlers);
}

export function runGtpuTeidModeChange(
  mode: ProfileWorkbenchStream["gtpu_teid_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuTeidModeAction(mode), stream, handlers);
}

export function runGtpuTeidCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuTeidCountAction(count), stream, handlers);
}

export function runGtpuTeidStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuTeidStepAction(step), stream, handlers);
}

export function runGtpuSequenceSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuSequenceSelectionAction(enabled), stream, handlers);
}

export function runGtpuSequenceChange(
  sequence: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuSequenceAction(sequence), stream, handlers);
}

export function runGtpuSequenceModeChange(
  mode: ProfileWorkbenchStream["gtpu_sequence_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuSequenceModeAction(mode), stream, handlers);
}

export function runGtpuSequenceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuSequenceCountAction(count), stream, handlers);
}

export function runGtpuSequenceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuSequenceStepAction(step), stream, handlers);
}

export function runGtpuNpduSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuNpduSelectionAction(enabled), stream, handlers);
}

export function runGtpuNpduChange(
  npdu: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuNpduAction(npdu), stream, handlers);
}

export function runGtpuNpduModeChange(
  mode: ProfileWorkbenchStream["gtpu_npdu_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuNpduModeAction(mode), stream, handlers);
}

export function runGtpuNpduCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuNpduCountAction(count), stream, handlers);
}

export function runGtpuNpduStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuNpduStepAction(step), stream, handlers);
}

export function runGtpuExtensionSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuExtensionSelectionAction(enabled), stream, handlers);
}

export function runGtpuExtensionUdpPortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuExtensionUdpPortAction(port), stream, handlers);
}

export function runGtpuExtensionUdpPortModeChange(
  mode: ProfileWorkbenchStream["gtpu_extension_udp_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuExtensionUdpPortModeAction(mode), stream, handlers);
}

export function runGtpuExtensionUdpPortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuExtensionUdpPortCountAction(count), stream, handlers);
}

export function runGtpuExtensionUdpPortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuExtensionUdpPortStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv4TtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4TtlAction(ttl), stream, handlers);
}

export function runGtpuInnerIpv4TtlModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4TtlModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv4TtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4TtlCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv4TtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4TtlStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv6HopLimitChange(
  hopLimit: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6HopLimitAction(hopLimit), stream, handlers);
}

export function runGtpuInnerIpv6HopLimitModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6HopLimitModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv6HopLimitCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6HopLimitCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv6HopLimitStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6HopLimitStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv4SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4SourceAction(address), stream, handlers);
}

export function runGtpuInnerIpv4SourceModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4SourceModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv4SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4SourceCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv4SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4SourceStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv4DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4DestinationAction(address), stream, handlers);
}

export function runGtpuInnerIpv4DestinationModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv4_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4DestinationModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv4DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4DestinationCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv4DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv4DestinationStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv6SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6SourceAction(address), stream, handlers);
}

export function runGtpuInnerIpv6SourceModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6SourceModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv6SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6SourceCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv6SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6SourceStepAction(step), stream, handlers);
}

export function runGtpuInnerIpv6DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6DestinationAction(address), stream, handlers);
}

export function runGtpuInnerIpv6DestinationModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_ipv6_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6DestinationModeAction(mode), stream, handlers);
}

export function runGtpuInnerIpv6DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6DestinationCountAction(count), stream, handlers);
}

export function runGtpuInnerIpv6DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerIpv6DestinationStepAction(step), stream, handlers);
}

export function runGtpuInnerL4SourcePortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4SourcePortAction(port), stream, handlers);
}

export function runGtpuInnerL4SourcePortModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_l4_src_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4SourcePortModeAction(mode), stream, handlers);
}

export function runGtpuInnerL4SourcePortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4SourcePortCountAction(count), stream, handlers);
}

export function runGtpuInnerL4SourcePortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4SourcePortStepAction(step), stream, handlers);
}

export function runGtpuInnerL4DestinationPortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4DestinationPortAction(port), stream, handlers);
}

export function runGtpuInnerL4DestinationPortModeChange(
  mode: ProfileWorkbenchStream["gtpu_inner_l4_dst_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4DestinationPortModeAction(mode), stream, handlers);
}

export function runGtpuInnerL4DestinationPortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4DestinationPortCountAction(count), stream, handlers);
}

export function runGtpuInnerL4DestinationPortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(gtpuInnerL4DestinationPortStepAction(step), stream, handlers);
}

export function runGreInnerIpVersionChange(
  version: ProfileWorkbenchStream["gre_inner_ip_version"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpVersionAction(version), stream, handlers);
}

export function runGreChecksumSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greChecksumSelectionAction(enabled), stream, handlers);
}

export function runGreChecksumOverrideChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greChecksumOverrideAction(enabled), stream, handlers);
}

export function runGreChecksumChange(
  checksum: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greChecksumAction(checksum), stream, handlers);
}

export function runGreKeySelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greKeySelectionAction(enabled), stream, handlers);
}

export function runGreKeyChange(
  key: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greKeyAction(key), stream, handlers);
}

export function runGreKeyModeChange(
  mode: ProfileWorkbenchStream["gre_key_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greKeyModeAction(mode), stream, handlers);
}

export function runGreKeyCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greKeyCountAction(count), stream, handlers);
}

export function runGreKeyStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greKeyStepAction(step), stream, handlers);
}

export function runGreSequenceSelectionChange(
  enabled: boolean,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greSequenceSelectionAction(enabled), stream, handlers);
}

export function runGreSequenceChange(
  sequence: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greSequenceAction(sequence), stream, handlers);
}

export function runGreSequenceModeChange(
  mode: ProfileWorkbenchStream["gre_sequence_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greSequenceModeAction(mode), stream, handlers);
}

export function runGreSequenceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greSequenceCountAction(count), stream, handlers);
}

export function runGreSequenceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greSequenceStepAction(step), stream, handlers);
}

export function runGreInnerIpv6SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6SourceAction(address), stream, handlers);
}

export function runGreInnerIpv6SourceModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6SourceModeAction(mode), stream, handlers);
}

export function runGreInnerIpv6SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6SourceCountAction(count), stream, handlers);
}

export function runGreInnerIpv6SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6SourceStepAction(step), stream, handlers);
}

export function runGreInnerIpv6DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6DestinationAction(address), stream, handlers);
}

export function runGreInnerIpv6DestinationModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6DestinationModeAction(mode), stream, handlers);
}

export function runGreInnerIpv6DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6DestinationCountAction(count), stream, handlers);
}

export function runGreInnerIpv6DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6DestinationStepAction(step), stream, handlers);
}

export function runGreInnerIpv6HopLimitChange(
  hopLimit: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6HopLimitAction(hopLimit), stream, handlers);
}

export function runGreInnerIpv6HopLimitModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6HopLimitModeAction(mode), stream, handlers);
}

export function runGreInnerIpv6HopLimitCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6HopLimitCountAction(count), stream, handlers);
}

export function runGreInnerIpv6HopLimitStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv6HopLimitStepAction(step), stream, handlers);
}

export function runGreInnerIpv4SourceChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4SourceAction(address), stream, handlers);
}

export function runGreInnerIpv4SourceModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_src_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4SourceModeAction(mode), stream, handlers);
}

export function runGreInnerIpv4SourceCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4SourceCountAction(count), stream, handlers);
}

export function runGreInnerIpv4SourceStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4SourceStepAction(step), stream, handlers);
}

export function runGreInnerIpv4DestinationChange(
  address: string,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4DestinationAction(address), stream, handlers);
}

export function runGreInnerIpv4DestinationModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_dst_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4DestinationModeAction(mode), stream, handlers);
}

export function runGreInnerIpv4DestinationCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4DestinationCountAction(count), stream, handlers);
}

export function runGreInnerIpv4DestinationStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4DestinationStepAction(step), stream, handlers);
}

export function runGreInnerIpv4TtlChange(
  ttl: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4TtlAction(ttl), stream, handlers);
}

export function runGreInnerIpv4TtlModeChange(
  mode: ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4TtlModeAction(mode), stream, handlers);
}

export function runGreInnerIpv4TtlCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4TtlCountAction(count), stream, handlers);
}

export function runGreInnerIpv4TtlStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerIpv4TtlStepAction(step), stream, handlers);
}

export function runGreInnerL4SourcePortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4SourcePortAction(port), stream, handlers);
}

export function runGreInnerL4SourcePortModeChange(
  mode: ProfileWorkbenchStream["gre_inner_l4_src_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4SourcePortModeAction(mode), stream, handlers);
}

export function runGreInnerL4SourcePortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4SourcePortCountAction(count), stream, handlers);
}

export function runGreInnerL4SourcePortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4SourcePortStepAction(step), stream, handlers);
}

export function runGreInnerL4DestinationPortChange(
  port: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4DestinationPortAction(port), stream, handlers);
}

export function runGreInnerL4DestinationPortModeChange(
  mode: ProfileWorkbenchStream["gre_inner_l4_dst_port_mode"],
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4DestinationPortModeAction(mode), stream, handlers);
}

export function runGreInnerL4DestinationPortCountChange(
  count: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4DestinationPortCountAction(count), stream, handlers);
}

export function runGreInnerL4DestinationPortStepChange(
  step: number,
  stream: ProfileWorkbenchStream | null,
  handlers: StreamPatchHandlers
) {
  return runSelectedStreamPatch(greInnerL4DestinationPortStepAction(step), stream, handlers);
}

export function streamModePatch(mode: ProfileWorkbenchStream["mode"], stream: ProfileWorkbenchStream | null): StreamPatch {
  const patch: StreamPatch = { mode };
  if (mode === "continuous") {
    patch.next_stream_id = null;
    patch.action_count = 0;
    patch.count = 1;
  }
  if (mode === "burst") {
    patch.count = 1;
  }
  if (mode === "multi_burst") {
    patch.count = Math.max(2, stream?.count ?? 2);
  }
  return patch;
}

export function afterStreamStopPatch(): StreamPatch {
  return {
    next_stream_id: null,
    action_count: 0
  };
}

export function afterStreamGotoPatch(stream: ProfileWorkbenchStream): StreamPatch {
  return {
    next_stream_id: stream.next_stream_id ?? 1,
    action_count: stream.action_count
  };
}

export function nextStreamSelectionPatch(nextStreamId: number): StreamPatch {
  return { next_stream_id: nextStreamId };
}

export function loopActionCountEnabledPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    action_count: enabled ? Math.max(1, stream.action_count) : 0
  };
}

export function frameLengthValuePatch(frameLength: number): StreamPatch {
  return { frame_length: frameLength };
}

export function frameLengthMinPatch(frameLengthMin: number): StreamPatch {
  return { frame_length_min: frameLengthMin };
}

export function frameLengthMaxPatch(frameLengthMax: number): StreamPatch {
  return {
    frame_length: frameLengthMax,
    frame_length_max: frameLengthMax
  };
}

export function frameLengthTypePatch(
  frameLengthType: ProfileWorkbenchStream["frame_length_type"],
  stream: ProfileWorkbenchStream | null
): StreamPatch | null {
  if (stream && !supportsVariableFrameLength(stream) && frameLengthType !== "Fixed") {
    return null;
  }
  const patch: StreamPatch = { frame_length_type: frameLengthType };
  if (frameLengthType !== "Fixed" && stream) {
    const minLength = Number.isFinite(stream.frame_length_min) ? stream.frame_length_min : 64;
    const maxLengthSource = Number.isFinite(stream.frame_length_max) ? stream.frame_length_max : stream.frame_length;
    const maxLength = Math.max(maxLengthSource, minLength + 5);
    patch.frame_length_min = minLength;
    patch.frame_length_max = maxLength;
    patch.frame_length = maxLength;
  }
  return patch;
}

export function l4PortOverrideSelectionPatch(
  selection: L4PortOverrideSelection,
  enabled: boolean,
  stream: ProfileWorkbenchStream
): StreamPatch {
  if (selection === "source") {
    return {
      l4_src_port_override: enabled,
      l4_src_port_mode: enabled ? stream.l4_src_port_mode : "Fixed"
    };
  }
  return {
    l4_dst_port_override: enabled,
    l4_dst_port_mode: enabled ? stream.l4_dst_port_mode : "Fixed"
  };
}

export function udpLengthOverrideSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    udp_length_override: enabled,
    udp_length_mode: enabled ? stream.udp_length_mode : "Fixed"
  };
}

export function packetTypePatch(
  packetType: ProfileWorkbenchStream["packet_type"],
  stream: ProfileWorkbenchStream | null
): StreamPatch | null {
  if ((stream?.vxlan_enabled || stream?.gtpu_enabled) && packetType !== "Ethernet/IPv4/UDP") {
    return null;
  }
  const patch: StreamPatch = { packet_type: packetType };
  const nextProtocol = protocolName(packetType);
  if (packetType === "Ethernet/ARP") {
    patch.mpls_enabled = false;
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.flow_stats_enabled = false;
    patch.latency_enabled = false;
    patch.l4_src_port_override = false;
    patch.l4_src_port_mode = "Fixed";
    patch.l4_dst_port_override = false;
    patch.l4_dst_port_mode = "Fixed";
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  } else if (packetType === "Ethernet") {
    patch.mpls_enabled = false;
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.l4_src_port_override = false;
    patch.l4_src_port_mode = "Fixed";
    patch.l4_dst_port_override = false;
    patch.l4_dst_port_mode = "Fixed";
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  } else if (nextProtocol === "None") {
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.l4_src_port_override = false;
    patch.l4_src_port_mode = "Fixed";
    patch.l4_dst_port_override = false;
    patch.l4_dst_port_mode = "Fixed";
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  } else if (nextProtocol === "ICMP") {
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.frame_length_type = "Fixed";
    patch.icmp_type = packetType === "Ethernet/IPv6/ICMPv6" ? 128 : 8;
    patch.icmp_code = 0;
    patch.l4_src_port_override = false;
    patch.l4_src_port_mode = "Fixed";
    patch.l4_dst_port_override = false;
    patch.l4_dst_port_mode = "Fixed";
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
    if (packetType === "Ethernet/IPv6/ICMPv6") {
      patch.ipv6_src_mode = "Fixed";
      patch.ipv6_dst_mode = "Fixed";
    }
  } else if (nextProtocol === "GRE") {
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.frame_length_type = "Fixed";
    patch.frame_length = Math.max(stream?.frame_length ?? 96, 96);
    patch.l4_src_port_override = false;
    patch.l4_src_port_mode = "Fixed";
    patch.l4_dst_port_override = false;
    patch.l4_dst_port_mode = "Fixed";
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  } else if (nextProtocol === "SCTP") {
    const minimumLength =
      14
      + (stream ? workbenchVlanHeaderLength(stream) : 0)
      + ((stream ? workbenchMplsLabelCount(stream) : 0) * 4)
      + (packetType.startsWith("Ethernet/IPv6") ? 40 : 20)
      + 28
      + 4;
    patch.vxlan_enabled = false;
    patch.gtpu_enabled = false;
    patch.frame_length_type = "Fixed";
    patch.frame_length = Math.max(stream?.frame_length ?? minimumLength, minimumLength);
    patch.frame_length_min = Math.max(stream?.frame_length_min ?? minimumLength, minimumLength);
    patch.udp_length_override = false;
    patch.udp_length_mode = "Fixed";
    patch.udp_checksum_override = false;
    patch.udp_checksum_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  } else {
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  }
  if (nextProtocol !== "SCTP") {
    patch.sctp_checksum_override = false;
    patch.sctp_verification_tag_mode = "Fixed";
    patch.sctp_data_flags_mode = "Fixed";
    patch.sctp_tsn_mode = "Fixed";
    patch.sctp_stream_id_mode = "Fixed";
    patch.sctp_stream_sequence_mode = "Fixed";
    patch.sctp_payload_protocol_id_mode = "Fixed";
  }
  if (patch.gtpu_enabled === false) {
    patch.gtpu_teid_mode = "Fixed";
    patch.gtpu_sequence_enabled = false;
    patch.gtpu_sequence_mode = "Fixed";
    patch.gtpu_npdu_enabled = false;
    patch.gtpu_npdu_mode = "Fixed";
    patch.gtpu_extension_enabled = false;
    patch.gtpu_extension_udp_port_mode = "Fixed";
    patch.gtpu_inner_ip_version = "IPv4";
    patch.gtpu_inner_ipv4_src_mode = "Fixed";
    patch.gtpu_inner_ipv4_dst_mode = "Fixed";
    patch.gtpu_inner_ipv4_ttl_mode = "Fixed";
    patch.gtpu_inner_ipv6_src_mode = "Fixed";
    patch.gtpu_inner_ipv6_dst_mode = "Fixed";
    patch.gtpu_inner_ipv6_hop_limit_mode = "Fixed";
    patch.gtpu_inner_l4_src_port_mode = "Fixed";
    patch.gtpu_inner_l4_dst_port_mode = "Fixed";
  }
  if (patch.vxlan_enabled === false) {
    patch.vxlan_inner_ip_version = "IPv4";
    patch.vxlan_vni_mode = "Fixed";
    patch.vxlan_inner_ipv4_src_mode = "Fixed";
    patch.vxlan_inner_ipv4_dst_mode = "Fixed";
    patch.vxlan_inner_ipv4_ttl_mode = "Fixed";
    patch.vxlan_inner_ipv6_src_mode = "Fixed";
    patch.vxlan_inner_ipv6_dst_mode = "Fixed";
    patch.vxlan_inner_ipv6_hop_limit_mode = "Fixed";
    patch.vxlan_inner_l4_src_port_mode = "Fixed";
    patch.vxlan_inner_l4_dst_port_mode = "Fixed";
  }
  return patch;
}

export function icmpTypePatch(icmpType: number, stream: ProfileWorkbenchStream | null): StreamPatch {
  const patch: StreamPatch = { icmp_type: icmpType };
  if (stream?.packet_type === "Ethernet/IPv6/ICMPv6" && [133, 134, 135, 136].includes(icmpType)) {
    patch.icmp_code = 0;
    patch.icmp_type_mode = "Fixed";
    patch.icmp_code_mode = "Fixed";
    patch.icmp_checksum_override = false;
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
    patch.ipv6_hop_limit = 255;
    patch.ipv6_hop_limit_mode = "Fixed";
    patch.frame_length_type = "Fixed";
    patch.frame_length = Math.max(stream.frame_length, icmpv6ControlMinimumFrameLength(stream, icmpType));
    if (icmpType === 133) {
      patch.icmpv6_rs_include_slla = stream.icmpv6_rs_include_slla ?? true;
      patch.icmpv6_rs_slla_mac = stream.icmpv6_rs_slla_mac || stream.ether_src;
    } else if (icmpType === 134) {
      patch.icmpv6_ra_include_slla = stream.icmpv6_ra_include_slla ?? true;
      patch.icmpv6_ra_slla_mac = stream.icmpv6_ra_slla_mac || stream.ether_src;
      patch.icmpv6_ra_include_prefix = stream.icmpv6_ra_include_prefix ?? true;
    } else {
      patch.icmpv6_nd_include_option = stream.icmpv6_nd_include_option ?? true;
      patch.icmpv6_nd_target = stream.icmpv6_nd_target || stream.ipv6_dst;
      patch.icmpv6_nd_option_mac = stream.icmpv6_nd_option_mac || stream.ether_src;
    }
  } else if (stream?.packet_type !== "Ethernet/IPv6/ICMPv6" || ![128, 129].includes(icmpType)) {
    patch.icmp_type_mode = "Fixed";
    patch.icmp_code_mode = "Fixed";
    patch.icmp_identifier_mode = "Fixed";
    patch.icmp_sequence_mode = "Fixed";
  }
  return patch;
}

export function icmpv6RsSllaSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(
      stream.frame_length,
      icmpv6ControlMinimumFrameLength({
        ...stream,
        icmpv6_rs_include_slla: enabled
      })
    ),
    icmpv6_rs_include_slla: enabled
  };
}

export function icmpv6RaSllaSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(
      stream.frame_length,
      icmpv6ControlMinimumFrameLength({
        ...stream,
        icmpv6_ra_include_slla: enabled
      })
    ),
    icmpv6_ra_include_slla: enabled
  };
}

export function icmpv6RaPrefixSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(
      stream.frame_length,
      icmpv6ControlMinimumFrameLength({
        ...stream,
        icmpv6_ra_include_prefix: enabled
      })
    ),
    icmpv6_ra_include_prefix: enabled
  };
}

export function vlanSelectionPatch(enabled: boolean): StreamPatch {
  if (enabled) {
    return { vlan_enabled: true };
  }
  return {
    vlan_enabled: false,
    vlan_priority_mode: "Fixed",
    vlan_id_mode: "Fixed",
    vlan2_enabled: false,
    vlan2_priority_mode: "Fixed",
    vlan2_id_mode: "Fixed"
  };
}

export function mplsSelectionPatch(enabled: boolean): StreamPatch {
  return { mpls_enabled: enabled };
}

export function mplsSecondLabelSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    mpls_label2_enabled: enabled,
    mpls_label2_mode: enabled ? stream.mpls_label2_mode : "Fixed",
    mpls_label2_tc_mode: enabled ? stream.mpls_label2_tc_mode : "Fixed",
    mpls_label2_ttl_mode: enabled ? stream.mpls_label2_ttl_mode : "Fixed",
    mpls_label3_enabled: enabled ? stream.mpls_label3_enabled : false,
    mpls_label3_mode: enabled ? stream.mpls_label3_mode : "Fixed",
    mpls_label3_tc_mode: enabled ? stream.mpls_label3_tc_mode : "Fixed",
    mpls_label3_ttl_mode: enabled ? stream.mpls_label3_ttl_mode : "Fixed"
  };
}

export function mplsThirdLabelSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    mpls_label2_enabled: true,
    mpls_label3_enabled: enabled,
    mpls_label3_mode: enabled ? stream.mpls_label3_mode : "Fixed",
    mpls_label3_tc_mode: enabled ? stream.mpls_label3_tc_mode : "Fixed",
    mpls_label3_ttl_mode: enabled ? stream.mpls_label3_ttl_mode : "Fixed"
  };
}

export function packetTypeForL3Selection(
  selection: L3Selection,
  stream: ProfileWorkbenchStream
): ProfileWorkbenchStream["packet_type"] {
  return packetTypeFor(selection, protocolName(stream.packet_type));
}

export function packetTypeForL4Selection(
  selection: L4Selection,
  stream: ProfileWorkbenchStream
): ProfileWorkbenchStream["packet_type"] {
  return packetTypeFor(ipVersionName(stream.packet_type), selection);
}

export function payloadSelectionPatch(enabled: boolean): StreamPatch {
  return { payload_enabled: enabled };
}

export function payloadPatternImportPatch(pattern: string): StreamPatch {
  return {
    payload_enabled: true,
    payload_type: "Fixed Word",
    payload_pattern: pattern === "" ? "00" : pattern.toUpperCase()
  };
}

function udpApplicationMinimumFrameLength(stream: ProfileWorkbenchStream, payloadLength: number): number {
  return (
    14
    + workbenchVlanHeaderLength(stream)
    + (workbenchMplsLabelCount(stream) * 4)
    + (stream.packet_type.startsWith("Ethernet/IPv6") ? 40 : 20)
    + 8
    + payloadLength
    + 4
  );
}

function minimumFrameLengthPatch(stream: ProfileWorkbenchStream, minimumFrameLength: number): StreamPatch {
  return {
    frame_length: Math.max(stream.frame_length, minimumFrameLength),
    frame_length_min: Math.max(stream.frame_length_min, minimumFrameLength),
    frame_length_max: Math.max(stream.frame_length_max, minimumFrameLength)
  };
}

export function dnsSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  const patch: StreamPatch = {
    dns_enabled: enabled,
    dns_transaction_id_mode: enabled ? stream.dns_transaction_id_mode : "Fixed",
    dns_flags_mode: enabled ? stream.dns_flags_mode : "Fixed",
    dns_query_type_mode: enabled ? stream.dns_query_type_mode : "Fixed",
    dns_query_class_mode: enabled ? stream.dns_query_class_mode : "Fixed",
    dns_answer_enabled: enabled ? stream.dns_answer_enabled : false,
    dns_answer_ttl_mode: enabled ? stream.dns_answer_ttl_mode : "Fixed",
    dns_answer_ipv4_mode: enabled ? stream.dns_answer_ipv4_mode : "Fixed",
    dhcp_enabled: enabled ? false : stream.dhcp_enabled,
    dhcp_operation_mode: enabled ? "Fixed" : stream.dhcp_operation_mode,
    dhcp_hops_mode: enabled ? "Fixed" : stream.dhcp_hops_mode,
    dhcp_seconds_mode: enabled ? "Fixed" : stream.dhcp_seconds_mode,
    dhcp_message_type_mode: enabled ? "Fixed" : stream.dhcp_message_type_mode,
    dhcp_flags_mode: enabled ? "Fixed" : stream.dhcp_flags_mode,
    dhcp_client_ip_mode: enabled ? "Fixed" : stream.dhcp_client_ip_mode,
    dhcp_your_ip_mode: enabled ? "Fixed" : stream.dhcp_your_ip_mode,
    dhcp_server_ip_mode: enabled ? "Fixed" : stream.dhcp_server_ip_mode,
    dhcp_relay_ip_mode: enabled ? "Fixed" : stream.dhcp_relay_ip_mode,
    dhcp_client_mac_mode: enabled ? "Fixed" : stream.dhcp_client_mac_mode,
    dhcp_requested_ip_mode: enabled ? "Fixed" : stream.dhcp_requested_ip_mode,
    dhcp_server_id_mode: enabled ? "Fixed" : stream.dhcp_server_id_mode,
    dhcp_xid_mode: enabled ? "Fixed" : stream.dhcp_xid_mode,
    frame_length: stream.frame_length,
    frame_length_min: stream.frame_length_min,
    frame_length_max: stream.frame_length_max,
    l4_dst_port_override: enabled ? true : stream.l4_dst_port_override,
    l4_dst_port: enabled ? 53 : stream.l4_dst_port,
    udp_length_override: enabled ? false : stream.udp_length_override,
    udp_length_mode: enabled ? "Fixed" : stream.udp_length_mode,
    udp_checksum_override: enabled ? false : stream.udp_checksum_override
  };
  if (enabled) {
    Object.assign(patch, minimumFrameLengthPatch(stream, udpApplicationMinimumFrameLength(stream, 29)));
  }
  return patch;
}

export function dnsAnswerSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  const patch: StreamPatch = {
    dns_answer_enabled: enabled,
    dns_flags: enabled && stream.dns_flags.toUpperCase() === "0100" ? "8180" : stream.dns_flags,
    dns_query_type: enabled ? 1 : stream.dns_query_type,
    dns_query_type_mode: enabled ? "Fixed" : stream.dns_query_type_mode,
    dns_query_class_mode: enabled ? "Fixed" : stream.dns_query_class_mode,
    dns_answer_ttl_mode: enabled ? stream.dns_answer_ttl_mode : "Fixed",
    dns_answer_ipv4_mode: enabled ? stream.dns_answer_ipv4_mode : "Fixed",
    frame_length: stream.frame_length,
    frame_length_min: stream.frame_length_min,
    frame_length_max: stream.frame_length_max
  };
  if (enabled) {
    Object.assign(patch, minimumFrameLengthPatch(stream, udpApplicationMinimumFrameLength(stream, 45)));
  }
  return patch;
}

export function dhcpSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  const patch: StreamPatch = {
    dhcp_enabled: enabled,
    dhcp_operation_mode: enabled ? stream.dhcp_operation_mode : "Fixed",
    dhcp_hops_mode: enabled ? stream.dhcp_hops_mode : "Fixed",
    dhcp_seconds_mode: enabled ? stream.dhcp_seconds_mode : "Fixed",
    dhcp_message_type_mode: enabled ? stream.dhcp_message_type_mode : "Fixed",
    dhcp_flags_mode: enabled ? stream.dhcp_flags_mode : "Fixed",
    dhcp_client_ip_mode: enabled ? stream.dhcp_client_ip_mode : "Fixed",
    dhcp_your_ip_mode: enabled ? stream.dhcp_your_ip_mode : "Fixed",
    dhcp_server_ip_mode: enabled ? stream.dhcp_server_ip_mode : "Fixed",
    dhcp_relay_ip_mode: enabled ? stream.dhcp_relay_ip_mode : "Fixed",
    dhcp_client_mac_mode: enabled ? stream.dhcp_client_mac_mode : "Fixed",
    dhcp_requested_ip_mode: enabled ? stream.dhcp_requested_ip_mode : "Fixed",
    dhcp_server_id_mode: enabled ? stream.dhcp_server_id_mode : "Fixed",
    dhcp_xid_mode: enabled ? stream.dhcp_xid_mode : "Fixed",
    dns_enabled: enabled ? false : stream.dns_enabled,
    dns_transaction_id_mode: enabled ? "Fixed" : stream.dns_transaction_id_mode,
    dns_flags_mode: enabled ? "Fixed" : stream.dns_flags_mode,
    dns_query_type_mode: enabled ? "Fixed" : stream.dns_query_type_mode,
    dns_query_class_mode: enabled ? "Fixed" : stream.dns_query_class_mode,
    dns_answer_enabled: enabled ? false : stream.dns_answer_enabled,
    dns_answer_ttl_mode: enabled ? "Fixed" : stream.dns_answer_ttl_mode,
    dns_answer_ipv4_mode: enabled ? "Fixed" : stream.dns_answer_ipv4_mode,
    frame_length: stream.frame_length,
    frame_length_min: stream.frame_length_min,
    frame_length_max: stream.frame_length_max,
    l4_src_port_override: enabled ? true : stream.l4_src_port_override,
    l4_src_port: enabled ? 68 : stream.l4_src_port,
    l4_dst_port_override: enabled ? true : stream.l4_dst_port_override,
    l4_dst_port: enabled ? 67 : stream.l4_dst_port,
    udp_length_override: enabled ? false : stream.udp_length_override,
    udp_length_mode: enabled ? "Fixed" : stream.udp_length_mode,
    udp_checksum_override: enabled ? false : stream.udp_checksum_override
  };
  if (enabled) {
    Object.assign(patch, minimumFrameLengthPatch(stream, udpApplicationMinimumFrameLength(stream, 300)));
  }
  return patch;
}

export function vlanInnerTagSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    vlan2_enabled: enabled,
    vlan2_priority_mode: enabled ? stream.vlan2_priority_mode : "Fixed",
    vlan2_id_mode: enabled ? stream.vlan2_id_mode : "Fixed"
  };
}

export function tunnelDisabledPatch(): StreamPatch {
  return {
    gtpu_enabled: false,
    gtpu_teid_mode: "Fixed",
    gtpu_sequence_enabled: false,
    gtpu_sequence_mode: "Fixed",
    gtpu_npdu_enabled: false,
    gtpu_npdu_mode: "Fixed",
    gtpu_extension_enabled: false,
    gtpu_extension_udp_port_mode: "Fixed",
    gtpu_inner_ipv4_src_mode: "Fixed",
    gtpu_inner_ipv4_dst_mode: "Fixed",
    gtpu_inner_ipv4_ttl_mode: "Fixed",
    gtpu_inner_ipv6_src_mode: "Fixed",
    gtpu_inner_ipv6_dst_mode: "Fixed",
    gtpu_inner_ipv6_hop_limit_mode: "Fixed",
    gtpu_inner_l4_src_port_mode: "Fixed",
    gtpu_inner_l4_dst_port_mode: "Fixed",
    vxlan_enabled: false
  };
}

export function vxlanSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream | null): StreamPatch {
  if (!enabled) {
    return {
      vxlan_enabled: false,
      vxlan_inner_ip_version: "IPv4",
      vxlan_vni_mode: "Fixed",
      vxlan_inner_ipv4_src_mode: "Fixed",
      vxlan_inner_ipv4_dst_mode: "Fixed",
      vxlan_inner_ipv4_ttl_mode: "Fixed",
      vxlan_inner_ipv6_src_mode: "Fixed",
      vxlan_inner_ipv6_dst_mode: "Fixed",
      vxlan_inner_ipv6_hop_limit_mode: "Fixed",
      vxlan_inner_l4_src_port_mode: "Fixed",
      vxlan_inner_l4_dst_port_mode: "Fixed"
    };
  }
  const frameLength = Math.max(stream?.frame_length ?? vxlanDefaultFrameLength, vxlanDefaultFrameLength);
  return {
    vxlan_enabled: true,
    gtpu_enabled: false,
    gtpu_sequence_enabled: false,
    gtpu_npdu_enabled: false,
    gtpu_extension_enabled: false,
    gtpu_sequence_mode: "Fixed",
    gtpu_npdu_mode: "Fixed",
    gtpu_extension_udp_port_mode: "Fixed",
    vxlan_inner_ip_version: stream?.vxlan_inner_ip_version ?? "IPv4",
    packet_type: "Ethernet/IPv4/UDP",
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_max: Math.max(stream?.frame_length_max ?? frameLength, frameLength),
    l4_src_port_override: true,
    l4_src_port: 1337,
    l4_src_port_mode: "Fixed",
    l4_dst_port_override: true,
    l4_dst_port: 4789,
    l4_dst_port_mode: "Fixed",
    udp_length_override: false,
    udp_length_mode: "Fixed",
    udp_checksum_override: false,
    udp_checksum_mode: "Fixed"
  };
}

export function vxlanInnerIpVersionPatch(
  version: ProfileWorkbenchStream["vxlan_inner_ip_version"],
  stream: ProfileWorkbenchStream | null
): StreamPatch {
  const defaultLength = vxlanDefaultFrameLength;
  const frameLength = Math.max(stream?.frame_length ?? defaultLength, defaultLength);
  const patch: StreamPatch = {
    vxlan_inner_ip_version: version,
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_max: Math.max(stream?.frame_length_max ?? frameLength, frameLength)
  };
  if (version === "IPv6") {
    patch.vxlan_inner_ipv4_src_mode = "Fixed";
    patch.vxlan_inner_ipv4_dst_mode = "Fixed";
    patch.vxlan_inner_ipv4_ttl_mode = "Fixed";
  } else {
    patch.vxlan_inner_ipv6_src_mode = "Fixed";
    patch.vxlan_inner_ipv6_dst_mode = "Fixed";
    patch.vxlan_inner_ipv6_hop_limit_mode = "Fixed";
  }
  return patch;
}

export function gtpuSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream | null): StreamPatch {
  if (!enabled) {
    return {
      gtpu_enabled: false,
      gtpu_teid_mode: "Fixed",
      gtpu_sequence_enabled: false,
      gtpu_sequence_mode: "Fixed",
      gtpu_npdu_enabled: false,
      gtpu_npdu_mode: "Fixed",
      gtpu_extension_enabled: false,
      gtpu_extension_udp_port_mode: "Fixed",
      gtpu_inner_ip_version: "IPv4",
      gtpu_inner_ipv4_src_mode: "Fixed",
      gtpu_inner_ipv4_dst_mode: "Fixed",
      gtpu_inner_ipv4_ttl_mode: "Fixed",
      gtpu_inner_ipv6_src_mode: "Fixed",
      gtpu_inner_ipv6_dst_mode: "Fixed",
      gtpu_inner_ipv6_hop_limit_mode: "Fixed",
      gtpu_inner_l4_src_port_mode: "Fixed",
      gtpu_inner_l4_dst_port_mode: "Fixed"
    };
  }
  const frameLength = Math.max(stream?.frame_length ?? gtpuDefaultFrameLength, gtpuDefaultFrameLength);
  return {
    gtpu_enabled: true,
    vxlan_enabled: false,
    gtpu_inner_ip_version: stream?.gtpu_inner_ip_version ?? "IPv4",
    packet_type: "Ethernet/IPv4/UDP",
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_max: Math.max(stream?.frame_length_max ?? frameLength, frameLength),
    l4_src_port_override: true,
    l4_src_port: 2152,
    l4_src_port_mode: "Fixed",
    l4_dst_port_override: true,
    l4_dst_port: 2152,
    l4_dst_port_mode: "Fixed",
    udp_length_override: false,
    udp_length_mode: "Fixed",
    udp_checksum_override: false,
    udp_checksum_mode: "Fixed",
    dns_enabled: false,
    dns_transaction_id_mode: "Fixed",
    dns_flags_mode: "Fixed",
    dns_query_type_mode: "Fixed",
    dns_query_class_mode: "Fixed",
    dhcp_enabled: false,
    dhcp_operation_mode: "Fixed",
    dhcp_hops_mode: "Fixed",
    dhcp_seconds_mode: "Fixed",
    dhcp_message_type_mode: "Fixed",
    dhcp_flags_mode: "Fixed",
    dhcp_client_ip_mode: "Fixed",
    dhcp_your_ip_mode: "Fixed",
    dhcp_server_ip_mode: "Fixed",
    dhcp_relay_ip_mode: "Fixed",
    dhcp_client_mac_mode: "Fixed",
    dhcp_requested_ip_mode: "Fixed",
    dhcp_server_id_mode: "Fixed",
    dhcp_xid_mode: "Fixed"
  };
}

export function gtpuSequenceSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    gtpu_sequence_enabled: enabled,
    gtpu_sequence_mode: enabled ? stream.gtpu_sequence_mode : "Fixed"
  };
}

export function gtpuNpduSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    gtpu_npdu_enabled: enabled,
    gtpu_npdu_mode: enabled ? stream.gtpu_npdu_mode : "Fixed"
  };
}

export function gtpuExtensionSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    gtpu_extension_enabled: enabled,
    gtpu_extension_udp_port_mode: enabled ? stream.gtpu_extension_udp_port_mode : "Fixed"
  };
}

export function gtpuInnerIpVersionPatch(
  version: ProfileWorkbenchStream["gtpu_inner_ip_version"],
  stream: ProfileWorkbenchStream | null
): StreamPatch {
  const defaultLength = version === "IPv6" ? gtpuInnerIpv6DefaultFrameLength : gtpuDefaultFrameLength;
  const frameLength = Math.max(stream?.frame_length ?? defaultLength, defaultLength);
  const patch: StreamPatch = {
    gtpu_inner_ip_version: version,
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_max: Math.max(stream?.frame_length_max ?? frameLength, frameLength)
  };
  if (version === "IPv6") {
    patch.gtpu_inner_ipv4_src_mode = "Fixed";
    patch.gtpu_inner_ipv4_dst_mode = "Fixed";
    patch.gtpu_inner_ipv4_ttl_mode = "Fixed";
  } else {
    patch.gtpu_inner_ipv6_src_mode = "Fixed";
    patch.gtpu_inner_ipv6_dst_mode = "Fixed";
    patch.gtpu_inner_ipv6_hop_limit_mode = "Fixed";
  }
  return patch;
}

export function greInnerIpVersionPatch(
  version: ProfileWorkbenchStream["gre_inner_ip_version"],
  stream: ProfileWorkbenchStream | null
): StreamPatch {
  const isIpv6 = version === "IPv6";
  const defaultLength = isIpv6 ? 90 : 64;
  return {
    frame_length: Math.max(stream?.frame_length ?? defaultLength, defaultLength),
    gre_inner_ip_version: version,
    gre_protocol_type: isIpv6 ? "86DD" : "0800",
    gre_inner_ipv4_src_mode: isIpv6 ? "Fixed" : (stream?.gre_inner_ipv4_src_mode ?? "Fixed"),
    gre_inner_ipv4_dst_mode: isIpv6 ? "Fixed" : (stream?.gre_inner_ipv4_dst_mode ?? "Fixed"),
    gre_inner_ipv4_ttl_mode: isIpv6 ? "Fixed" : (stream?.gre_inner_ipv4_ttl_mode ?? "Fixed"),
    gre_inner_ipv6_src_mode: isIpv6 ? (stream?.gre_inner_ipv6_src_mode ?? "Fixed") : "Fixed",
    gre_inner_ipv6_dst_mode: isIpv6 ? (stream?.gre_inner_ipv6_dst_mode ?? "Fixed") : "Fixed",
    gre_inner_ipv6_hop_limit_mode: isIpv6 ? (stream?.gre_inner_ipv6_hop_limit_mode ?? "Fixed") : "Fixed"
  };
}

export function greChecksumSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(stream.frame_length, enabled ? 100 : 96),
    gre_checksum_present: enabled,
    gre_checksum_override: enabled ? stream.gre_checksum_override : false
  };
}

export function greKeySelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(stream.frame_length, enabled ? 100 : 96),
    gre_key_present: enabled,
    gre_key_mode: enabled ? stream.gre_key_mode : "Fixed"
  };
}

export function greSequenceSelectionPatch(enabled: boolean, stream: ProfileWorkbenchStream): StreamPatch {
  return {
    frame_length: Math.max(stream.frame_length, enabled ? 100 : 96),
    gre_sequence_present: enabled,
    gre_sequence_mode: enabled ? stream.gre_sequence_mode : "Fixed"
  };
}

export function greChecksumInvalidatingModePatch(
  field: GreChecksumInvalidatingModeField,
  mode: ProfileWorkbenchStream[GreChecksumInvalidatingModeField],
  presenceField?: GrePresenceField
): StreamPatch {
  const patch: StreamPatch = {
    gre_checksum_override: false,
    gre_checksum_present: false,
    [field]: mode
  } as StreamPatch;
  if (presenceField) {
    patch[presenceField] = true;
  }
  return patch;
}

export function sctpChecksumCoupledModePatch(
  field: SctpChecksumCoupledModeField,
  mode: ProfileWorkbenchStream[SctpChecksumCoupledModeField],
  stream: ProfileWorkbenchStream
): StreamPatch {
  return {
    sctp_checksum_override: mode === "Fixed" ? stream.sctp_checksum_override : true,
    sctp_checksum: mode === "Fixed" ? stream.sctp_checksum : "00000000",
    [field]: mode
  } as StreamPatch;
}

export function icmpChecksumCoupledModePatch(
  field: IcmpChecksumCoupledModeField,
  mode: ProfileWorkbenchStream[IcmpChecksumCoupledModeField],
  stream: ProfileWorkbenchStream
): StreamPatch {
  return {
    icmp_checksum_override: mode === "Fixed" ? stream.icmp_checksum_override : false,
    [field]: mode
  } as StreamPatch;
}

export function tcpOptionSelectionPatch(option: TcpOptionSelection, enabled: boolean): StreamPatch {
  if (option === "mss") {
    return { tcp_option_mss_enabled: enabled };
  }
  if (option === "window-scale") {
    return { tcp_option_window_scale_enabled: enabled };
  }
  if (option === "sack-permitted") {
    return { tcp_option_sack_permitted_enabled: enabled };
  }
  if (option === "sack-block") {
    return { tcp_option_sack_blocks_enabled: enabled };
  }
  return { tcp_option_timestamp_enabled: enabled };
}
