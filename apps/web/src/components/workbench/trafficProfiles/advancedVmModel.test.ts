import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import { ADVANCED_VM_MAX_BYTES, advancedVmDefaultBody, type AdvancedVmTemplate } from "./model";
import {
  advancedVmTargetChoiceViewModel,
  buildOuterIpv4UdpChecksumIncVmBody,
  buildOuterIpv4UdpLengthIncVmBody,
  buildOuterTcpAckIncVmBody,
  buildOuterTcpChecksumIncVmBody,
  buildOuterTcpDstPortIncVmBody,
  buildOuterTcpFlagVaryVmBody,
  buildOuterTcpFlagsIncVmBody,
  buildOuterTcpFiveTupleVmBody,
  buildOuterTcpOptionMssIncVmBody,
  buildOuterTcpOptionSack2LeftIncVmBody,
  buildOuterTcpOptionSackLeftIncVmBody,
  buildOuterTcpOptionSackRightIncVmBody,
  buildOuterTcpOptionTimestampEchoIncVmBody,
  buildOuterTcpOptionTimestampValueIncVmBody,
  buildOuterTcpOptionWindowScaleIncVmBody,
  buildOuterTcpReservedBitsIncVmBody,
  buildOuterTcpSequenceIncVmBody,
  buildOuterTcpSrcPortIncVmBody,
  buildOuterTcpUrgentPointerIncVmBody,
  buildOuterTcpWindowIncVmBody,
  buildOuterUdpDstPortIncVmBody,
  buildOuterUdpFiveTupleVmBody,
  buildOuterUdpSrcPortIncVmBody,
  buildOuterIpv6UdpChecksumIncVmBody,
  buildOuterIpv6UdpLengthIncVmBody,
  buildGtpuExtensionUdpPortIncVmBody,
  buildGtpuMessageTypeIncVmBody,
  buildGtpuNpduIncVmBody,
  buildGtpuSequenceIncVmBody,
  buildGtpuTeidVmBody,
  buildGreKeyIncVmBody,
  buildGreProtocolTypeIncVmBody,
  buildGreSequenceIncVmBody,
  buildVxlanIFlagVaryVmBody,
  buildVxlanVniIncVmBody,
  greInnerChecksumInstruction,
  greInnerIpv4Offset,
  greOptionOffset,
  isGreInnerTcpStreamWithoutGreChecksum,
  isGreInnerUdpStreamWithoutGreChecksum,
  isGreKeyStreamWithoutGreChecksum,
  isGreSequenceStreamWithoutGreChecksum,
  isGreStreamWithoutGreChecksum,
  isAdvancedOuterTcpMssStream,
  isAdvancedOuterTcpStream,
  isAdvancedOuterTcpWindowScaleStream,
  isArpStream,
  isIcmpv6EchoStream,
  isInnerTaggedVlanStream,
  isIpv4GreAddressStreamWithoutGreChecksum,
  isIpv4GreStreamWithoutGreChecksum,
  isIpv4GreTtlStreamWithoutGreChecksum,
  isIpv6GreDstVmStreamWithoutGreChecksum,
  isIpv6GreSrcVmStreamWithoutGreChecksum,
  isIpv6GreStreamWithoutGreChecksum,
  isMplsStream,
  isRawIpv4GreStreamWithoutGreChecksum,
  isRawIpv6GreStreamWithoutGreChecksum,
  isOuterIpv4GtpuExtensionStream,
  isOuterIpv4GtpuInnerIpv4AddressStream,
  isOuterIpv4GtpuInnerIpv4Stream,
  isOuterIpv4GtpuInnerIpv6DstVmStream,
  isOuterIpv4GtpuInnerIpv6SrcVmStream,
  isOuterIpv4GtpuInnerIpv6Stream,
  isOuterIpv4GtpuInnerUdpStream,
  isOuterIpv4GtpuNpduStream,
  isOuterIpv4GtpuSequenceStream,
  isOuterIpv4GtpuStream,
  isOuterIpv4VxlanInnerEthernetStream,
  isOuterIpv4VxlanInnerIpv4AddressStream,
  isOuterIpv4VxlanInnerIpv4Stream,
  isOuterIpv4VxlanInnerIpv6DstVmStream,
  isOuterIpv4VxlanInnerIpv6SrcVmStream,
  isOuterIpv4VxlanInnerIpv6Stream,
  isOuterIpv4VxlanInnerUdpStream,
  isOuterIpv4VxlanStream,
  isSecondMplsStream,
  isStructuredOuterIpv4GtpuStream,
  isStructuredOuterIpv4VxlanStream,
  isTaggedVlanStream,
  isThirdMplsStream
} from "./advancedVmModel";
import {
  formatAdvancedVmJson,
  parseAdvancedVmJson
} from "./advancedVmJsonModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

const templateCatalog: AdvancedVmTemplate[] = [
  {
    name: "empty",
    label: "Empty",
    description: "No instructions.",
    requires: "none",
    body: advancedVmDefaultBody
  },
  {
    name: "tcp-seq",
    label: "TCP sequence",
    description: "Vary TCP sequence.",
    requires: "Ethernet/IPv4/TCP",
    supports: (candidate) => candidate.packet_type === "Ethernet/IPv4/TCP",
    body: {
      instructions: [{
        type: "flow_var",
        name: "seq",
        op: "inc",
        size: 4,
        init_value: 1,
        min_value: 1,
        max_value: 4,
        step: 1
      }],
      split_by_var: "seq"
    }
  }
];

describe("advancedVmModel JSON helpers", () => {
  it("formats empty advanced VM bodies with the default body", () => {
    expect(formatAdvancedVmJson(null)).toBe(`${JSON.stringify(advancedVmDefaultBody, null, 2)}\n`);
    expect(formatAdvancedVmJson({})).toBe(`${JSON.stringify(advancedVmDefaultBody, null, 2)}\n`);
  });

  it("parses valid Advanced VM JSON objects", () => {
    const parsed = parseAdvancedVmJson('{"cache_size":0,"instructions":[]}');

    expect(parsed.error).toBeNull();
    expect(parsed.bytes).toBeGreaterThan(0);
    expect(parsed.body).toEqual({ cache_size: 0, instructions: [] });
  });

  it("rejects empty, invalid, non-object, and oversized Advanced VM JSON", () => {
    expect(parseAdvancedVmJson("").error).toBe("Advanced VM JSON is empty.");
    expect(parseAdvancedVmJson("[").error).toBeTruthy();
    expect(parseAdvancedVmJson("[]").error).toBe("Advanced VM JSON must be an object.");

    const oversized = JSON.stringify({ value: "x".repeat(ADVANCED_VM_MAX_BYTES) });
    const parsed = parseAdvancedVmJson(oversized);
    expect(parsed.bytes).toBeGreaterThan(ADVANCED_VM_MAX_BYTES);
    expect(parsed.error).toBe(`Advanced VM exceeds ${ADVANCED_VM_MAX_BYTES} bytes.`);
  });
});

describe("advancedVmTargetChoiceViewModel", () => {
  it("derives Field Engine target choices and template options", () => {
    const tcpStream = stream({ packet_type: "Ethernet/IPv4/TCP" });
    const udpStream = stream({ packet_type: "Ethernet/IPv4/UDP" });
    const structuredView = advancedVmTargetChoiceViewModel({
      activeSource: "structured",
      activeStream: tcpStream,
      draft: {},
      rawStream: udpStream,
      structuredStream: tcpStream,
      templates: templateCatalog
    });

    expect(structuredView.structuredTargetRows).toHaveLength(1);
    expect(structuredView.rawTargetRows).toHaveLength(1);
    expect(structuredView.selectedTargetRows).toBe(structuredView.structuredTargetRows);
    expect(structuredView.readyTargetCount).toBe(1);
    expect(structuredView.templateOptions.find((template) => template.name === "tcp-seq")).toMatchObject({
      disabled: false,
      label: "TCP sequence"
    });

    const rawView = advancedVmTargetChoiceViewModel({
      activeSource: "raw",
      activeStream: udpStream,
      draft: {},
      rawStream: udpStream,
      structuredStream: tcpStream,
      templates: templateCatalog
    });

    expect(rawView.selectedTargetRows).toBe(rawView.rawTargetRows);
    expect(rawView.readyTargetCount).toBe(0);
    expect(rawView.rawTargetRows[0]).toMatchObject({
      blockedReason: "Ethernet/IPv4/TCP",
      compatible: false,
      ready: false
    });
    expect(rawView.templateOptions.find((template) => template.name === "tcp-seq")).toMatchObject({
      disabled: true
    });
  });
});

describe("advancedVmModel stream support predicates", () => {
  it("recognizes structured outer TCP option support", () => {
    const tcpStream = stream({ packet_type: "Ethernet/IPv4/TCP", tcp_option_mss_enabled: true });

    expect(isAdvancedOuterTcpStream(tcpStream)).toBe(true);
    expect(isAdvancedOuterTcpMssStream(tcpStream)).toBe(true);
    expect(isAdvancedOuterTcpWindowScaleStream(
      stream({ packet_type: "Ethernet/IPv6/TCP", tcp_option_window_scale_enabled: true })
    )).toBe(true);
    expect(isAdvancedOuterTcpStream(stream({ packet_type: "Ethernet/IPv4/UDP" }))).toBe(false);
  });

  it("recognizes structured ARP and ICMPv6 echo streams", () => {
    expect(isArpStream(stream({ packet_type: "Ethernet/ARP" }))).toBe(true);
    expect(isIcmpv6EchoStream(stream({ packet_type: "Ethernet/IPv6/ICMPv6", icmp_type: 128 }))).toBe(true);
    expect(isIcmpv6EchoStream(stream({ packet_type: "Ethernet/IPv6/ICMPv6", icmp_type: 135 }))).toBe(false);
  });

  it("recognizes structured VLAN tag support", () => {
    expect(isTaggedVlanStream(stream({ vlan_enabled: true }))).toBe(true);
    expect(isInnerTaggedVlanStream(stream({ vlan_enabled: true, vlan2_enabled: true }))).toBe(true);
    expect(isInnerTaggedVlanStream(stream({ vlan_enabled: true, vlan2_enabled: false }))).toBe(false);
    expect(isTaggedVlanStream(stream({}))).toBe(false);
  });

  it("recognizes structured MPLS label support", () => {
    expect(isMplsStream(stream({ mpls_enabled: true }))).toBe(true);
    expect(isSecondMplsStream(stream({ mpls_enabled: true, mpls_label2_enabled: true }))).toBe(true);
    expect(isThirdMplsStream(stream({
      mpls_enabled: true,
      mpls_label2_enabled: true,
      mpls_label3_enabled: true
    }))).toBe(true);
    expect(isSecondMplsStream(stream({ mpls_enabled: true, mpls_label2_enabled: false }))).toBe(false);
    expect(isThirdMplsStream(stream({ mpls_enabled: true, mpls_label2_enabled: true }))).toBe(false);
    expect(isMplsStream(stream({}))).toBe(false);
  });

  it("recognizes structured GTP-U support", () => {
    const gtpuIpv4 = stream({
      gtpu_enabled: true,
      gtpu_extension_enabled: true,
      gtpu_inner_ip_version: "IPv4",
      gtpu_npdu_enabled: true,
      gtpu_sequence_enabled: true,
      packet_type: "Ethernet/IPv4/UDP"
    });
    const gtpuIpv6 = stream({
      gtpu_enabled: true,
      gtpu_inner_ip_version: "IPv6",
      gtpu_inner_ipv6_dst: "2001:db8::20",
      gtpu_inner_ipv6_dst_count: 4,
      gtpu_inner_ipv6_src: "2001:db8::10",
      gtpu_inner_ipv6_src_count: 4,
      packet_type: "Ethernet/IPv4/UDP"
    });

    expect(isStructuredOuterIpv4GtpuStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuInnerUdpStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv4Stream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv4AddressStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuSequenceStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuNpduStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuExtensionStream(gtpuIpv4)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv6Stream(gtpuIpv4)).toBe(false);

    expect(isOuterIpv4GtpuInnerIpv6Stream(gtpuIpv6)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv6SrcVmStream(gtpuIpv6)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv6DstVmStream(gtpuIpv6)).toBe(true);
    expect(isOuterIpv4GtpuInnerIpv4Stream(gtpuIpv6)).toBe(false);

    expect(isStructuredOuterIpv4GtpuStream(stream({
      gtpu_enabled: false,
      l4_dst_port: 2152,
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(true);
    expect(isOuterIpv4GtpuInnerUdpStream(stream({
      gtpu_enabled: false,
      l4_dst_port: 2152,
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(false);
  });

  it("recognizes structured VXLAN support", () => {
    const vxlanIpv4 = stream({
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true,
      vxlan_inner_ip_version: "IPv4"
    });
    const vxlanIpv6 = stream({
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true,
      vxlan_inner_ip_version: "IPv6",
      vxlan_inner_ipv6_dst: "2001:db8::40",
      vxlan_inner_ipv6_dst_count: 4,
      vxlan_inner_ipv6_src: "2001:db8::30",
      vxlan_inner_ipv6_src_count: 4
    });

    expect(isStructuredOuterIpv4VxlanStream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanStream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanInnerEthernetStream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanInnerUdpStream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv4Stream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv4AddressStream(vxlanIpv4)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv6Stream(vxlanIpv4)).toBe(false);

    expect(isOuterIpv4VxlanInnerIpv6Stream(vxlanIpv6)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv6SrcVmStream(vxlanIpv6)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv6DstVmStream(vxlanIpv6)).toBe(true);
    expect(isOuterIpv4VxlanInnerIpv4Stream(vxlanIpv6)).toBe(false);

    expect(isStructuredOuterIpv4VxlanStream(stream({
      gtpu_enabled: true,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true
    }))).toBe(false);
  });

  it("recognizes structured GRE support without GRE checksum", () => {
    const greIpv4 = stream({
      gre_checksum_present: false,
      gre_inner_ip_version: "IPv4",
      gre_key_present: true,
      gre_protocol_type: "0800",
      gre_sequence_present: true,
      packet_type: "Ethernet/IPv4/GRE"
    });
    const greIpv6 = stream({
      gre_checksum_present: false,
      gre_inner_ip_version: "IPv6",
      gre_inner_ipv6_dst: "2001:db8::60",
      gre_inner_ipv6_dst_count: 4,
      gre_inner_ipv6_src: "2001:db8::50",
      gre_inner_ipv6_src_count: 4,
      gre_protocol_type: "86DD",
      packet_type: "Ethernet/IPv4/GRE"
    });

    expect(isGreStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isGreKeyStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isGreSequenceStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isIpv4GreStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isIpv4GreAddressStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isIpv4GreTtlStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isRawIpv4GreStreamWithoutGreChecksum(greIpv4)).toBe(false);
    expect(isGreInnerUdpStreamWithoutGreChecksum(greIpv4)).toBe(true);
    expect(isGreInnerTcpStreamWithoutGreChecksum(greIpv4)).toBe(false);

    expect(isIpv6GreStreamWithoutGreChecksum(greIpv6)).toBe(true);
    expect(isIpv6GreSrcVmStreamWithoutGreChecksum(greIpv6)).toBe(true);
    expect(isIpv6GreDstVmStreamWithoutGreChecksum(greIpv6)).toBe(true);
    expect(isRawIpv6GreStreamWithoutGreChecksum(greIpv6)).toBe(false);
    expect(isIpv4GreStreamWithoutGreChecksum(greIpv6)).toBe(false);

    expect(isGreStreamWithoutGreChecksum(stream({
      gre_checksum_present: true,
      gre_inner_ip_version: "IPv4",
      gre_protocol_type: "0800",
      packet_type: "Ethernet/IPv4/GRE"
    }))).toBe(false);
  });

  it("derives structured GRE option and inner checksum offsets", () => {
    const greIpv4 = stream({
      gre_checksum_present: true,
      gre_inner_ip_version: "IPv4",
      gre_key_present: true,
      gre_sequence_present: true,
      packet_type: "Ethernet/IPv4/GRE"
    });
    const greIpv6 = stream({
      gre_checksum_present: true,
      gre_inner_ip_version: "IPv6",
      gre_key_present: true,
      gre_sequence_present: true,
      packet_type: "Ethernet/IPv4/GRE"
    });

    expect(greOptionOffset(greIpv4, "key")).toBe(42);
    expect(greOptionOffset(greIpv4, "sequence")).toBe(46);
    expect(greInnerIpv4Offset(greIpv4)).toBe(50);
    expect(greInnerChecksumInstruction(greIpv4)).toEqual({
      l2_len: 50,
      l3_len: 20,
      l4_type: 11,
      type: "fix_checksum_hw"
    });
    expect(greInnerChecksumInstruction(greIpv6)).toEqual({
      l2_len: 50,
      l3_len: 40,
      l4_type: 11,
      type: "fix_checksum_hw"
    });
  });

  it("builds structured GRE protocol type, key, and sequence writes", () => {
    const greStream = stream({
      gre_checksum_present: true,
      gre_key: 123,
      gre_key_count: 3,
      gre_key_present: true,
      gre_key_step: 2,
      gre_protocol_type: "0800",
      gre_sequence: 77,
      gre_sequence_count: 3,
      gre_sequence_present: true,
      gre_sequence_step: 1,
      packet_type: "Ethernet/IPv4/GRE"
    });

    expect(buildGreProtocolTypeIncVmBody(greStream)).toEqual({
      instructions: [
        {
          init_value: 2048,
          max_value: 2063,
          min_value: 2048,
          name: "gre_protocol_type",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_protocol_type",
          pkt_offset: 36,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gre_protocol_type"
    });

    expect(buildGreKeyIncVmBody(greStream)).toEqual({
      instructions: [
        {
          init_value: 123,
          max_value: 127,
          min_value: 123,
          name: "gre_key",
          op: "inc",
          size: 4,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_key",
          pkt_offset: 42,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gre_key"
    });

    expect(buildGreSequenceIncVmBody(greStream)).toEqual({
      instructions: [
        {
          init_value: 77,
          max_value: 79,
          min_value: 77,
          name: "gre_sequence",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_sequence",
          pkt_offset: 46,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gre_sequence"
    });
  });
});

describe("advancedVmModel outer UDP VM body builders", () => {
  const udpIpv4Stream = stream({
    ipv4_dst: "10.0.0.2",
    ipv4_dst_count: 4,
    ipv4_dst_step: 1,
    ipv4_src: "10.0.0.1",
    ipv4_src_count: 4,
    ipv4_src_step: 1,
    l4_dst_port: 2048,
    l4_dst_port_count: 4,
    l4_dst_port_step: 2,
    l4_src_port: 1025,
    l4_src_port_count: 4,
    l4_src_port_step: 2,
    packet_type: "Ethernet/IPv4/UDP",
    udp_checksum: "BEEF",
    udp_checksum_count: 3,
    udp_checksum_step: 1,
    udp_length: 128,
    udp_length_count: 3,
    udp_length_step: 4
  });

  it("builds outer UDP source and destination port writes at the structured L4 offsets", () => {
    expect(buildOuterUdpSrcPortIncVmBody(udpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 1025,
          max_value: 1031,
          min_value: 1025,
          name: "udp_src",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_src"
    });

    expect(buildOuterUdpDstPortIncVmBody(udpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 2048,
          max_value: 2054,
          min_value: 2048,
          name: "udp_dst",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_dst"
    });
  });

  it("builds IPv4/UDP five-tuple writes with one checksum repair", () => {
    expect(buildOuterUdpFiveTupleVmBody(udpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 4,
          min_value: 1,
          name: "ipv4_src",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_src",
          pkt_offset: 29,
          type: "write_flow_var"
        },
        {
          init_value: 2,
          max_value: 5,
          min_value: 2,
          name: "ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_dst",
          pkt_offset: 33,
          type: "write_flow_var"
        },
        {
          init_value: 1025,
          max_value: 1031,
          min_value: 1025,
          name: "udp_src",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        {
          init_value: 2048,
          max_value: 2054,
          min_value: 2048,
          name: "udp_dst",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_src"
    });
  });

  it("builds IPv4 and IPv6 UDP length/checksum writes at protocol-specific offsets", () => {
    const udpIpv6Stream = stream({
      ...udpIpv4Stream,
      packet_type: "Ethernet/IPv6/UDP"
    });

    expect(buildOuterIpv4UdpLengthIncVmBody(udpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 128,
          max_value: 130,
          min_value: 128,
          name: "udp_length",
          op: "inc",
          size: 2,
          step: 4,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_length",
          pkt_offset: 38,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_length"
    });

    expect(buildOuterIpv6UdpLengthIncVmBody(udpIpv6Stream)).toEqual({
      instructions: [
        {
          init_value: 128,
          max_value: 130,
          min_value: 128,
          name: "udp_length",
          op: "inc",
          size: 2,
          step: 4,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_length",
          pkt_offset: 58,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_length"
    });

    expect(buildOuterIpv4UdpChecksumIncVmBody(udpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 48879,
          max_value: 48881,
          min_value: 48879,
          name: "udp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_checksum",
          pkt_offset: 40,
          type: "write_flow_var"
        }
      ],
      split_by_var: "udp_checksum"
    });

    expect(buildOuterIpv6UdpChecksumIncVmBody(udpIpv6Stream)).toEqual({
      instructions: [
        {
          init_value: 48879,
          max_value: 48881,
          min_value: 48879,
          name: "udp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_checksum",
          pkt_offset: 60,
          type: "write_flow_var"
        }
      ],
      split_by_var: "udp_checksum"
    });
  });
});

describe("advancedVmModel VXLAN VM body builders", () => {
  const vxlanStream = stream({
    packet_type: "Ethernet/IPv4/UDP",
    vxlan_vni: 1000,
    vxlan_vni_count: 3,
    vxlan_vni_step: 2
  });

  it("builds VXLAN VNI masked writes at the structured VXLAN offset", () => {
    expect(buildVxlanVniIncVmBody(vxlanStream)).toEqual({
      instructions: [
        {
          init_value: 1000,
          max_value: 1004,
          min_value: 1000,
          name: "vxlan_vni",
          op: "inc",
          size: 4,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xFFFFFF00,
          name: "vxlan_vni",
          pkt_cast_size: 4,
          pkt_offset: 46,
          shift: 8,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "vxlan_vni"
    });
  });

  it("builds VXLAN I-flag masked writes at the structured flags offset", () => {
    expect(buildVxlanIFlagVaryVmBody(vxlanStream)).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "vxlan_i_flag",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x08,
          name: "vxlan_i_flag",
          pkt_cast_size: 1,
          pkt_offset: 42,
          shift: 3,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "vxlan_i_flag"
    });
  });
});

describe("advancedVmModel GTP-U VM body builders", () => {
  const gtpuStream = stream({
    gtpu_enabled: true,
    gtpu_extension_enabled: true,
    gtpu_extension_udp_port: 65000,
    gtpu_extension_udp_port_count: 4,
    gtpu_extension_udp_port_step: 1,
    gtpu_message_type: 255,
    gtpu_npdu: 3,
    gtpu_npdu_count: 4,
    gtpu_npdu_enabled: true,
    gtpu_npdu_step: 1,
    gtpu_sequence: 7,
    gtpu_sequence_count: 4,
    gtpu_sequence_enabled: true,
    gtpu_sequence_step: 1,
    packet_type: "Ethernet/IPv4/UDP"
  });

  it("builds outer GTP-U fixed header writes", () => {
    expect(buildGtpuMessageTypeIncVmBody(gtpuStream)).toEqual({
      instructions: [
        {
          init_value: 255,
          max_value: 255,
          min_value: 255,
          name: "gtpu_message_type",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gtpu_message_type",
          pkt_offset: 43,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 17,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "gtpu_message_type"
    });

    expect(buildGtpuTeidVmBody(gtpuStream)).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 4096,
          min_value: 1,
          name: "gtpu_teid",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gtpu_teid",
          pkt_offset: 46,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 17,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "gtpu_teid"
    });
  });

  it("builds outer GTP-U optional header and extension writes", () => {
    expect(buildGtpuSequenceIncVmBody(gtpuStream)).toEqual({
      instructions: [
        {
          init_value: 7,
          max_value: 10,
          min_value: 7,
          name: "gtpu_sequence",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gtpu_sequence",
          pkt_offset: 50,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gtpu_sequence"
    });

    expect(buildGtpuNpduIncVmBody(gtpuStream)).toEqual({
      instructions: [
        {
          init_value: 3,
          max_value: 6,
          min_value: 3,
          name: "gtpu_npdu",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gtpu_npdu",
          pkt_offset: 52,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gtpu_npdu"
    });

    expect(buildGtpuExtensionUdpPortIncVmBody(gtpuStream)).toEqual({
      instructions: [
        {
          init_value: 65000,
          max_value: 65003,
          min_value: 65000,
          name: "gtpu_extension_udp_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gtpu_extension_udp_port",
          pkt_offset: 55,
          type: "write_flow_var"
        }
      ],
      split_by_var: "gtpu_extension_udp_port"
    });
  });
});

describe("advancedVmModel outer TCP VM body builders", () => {
  const tcpChecksumRepair = {
    l2_len: 14,
    l3_len: 20,
    l4_type: 13,
    type: "fix_checksum_hw"
  };
  const tcpIpv4Stream = stream({
    ipv4_dst: "10.0.0.12",
    ipv4_dst_count: 4,
    ipv4_dst_step: 1,
    ipv4_src: "10.0.0.11",
    ipv4_src_count: 4,
    ipv4_src_step: 1,
    l4_dst_port: 443,
    l4_dst_port_count: 4,
    l4_dst_port_step: 3,
    l4_src_port: 49152,
    l4_src_port_count: 4,
    l4_src_port_step: 3,
    packet_type: "Ethernet/IPv4/TCP",
    tcp_ack_count: 3,
    tcp_ack_number: 2000,
    tcp_ack_step: 5,
    tcp_checksum: "BEEF",
    tcp_checksum_count: 3,
    tcp_checksum_step: 1,
    tcp_flag_ack: true,
    tcp_flag_syn: true,
    tcp_flags_count: 4,
    tcp_flags_step: 1,
    tcp_option_mss: 1460,
    tcp_option_mss_count: 3,
    tcp_option_mss_enabled: true,
    tcp_option_mss_step: 2,
    tcp_option_sack_blocks_enabled: true,
    tcp_option_sack_left_edge: 100,
    tcp_option_sack_left_edge_count: 3,
    tcp_option_sack_left_edge_step: 7,
    tcp_option_sack_permitted_enabled: true,
    tcp_option_sack_right_edge: 200,
    tcp_option_sack_right_edge_count: 3,
    tcp_option_sack_right_edge_step: 7,
    tcp_option_timestamp_echo: 4000,
    tcp_option_timestamp_echo_count: 3,
    tcp_option_timestamp_echo_step: 9,
    tcp_option_timestamp_enabled: true,
    tcp_option_timestamp_value: 3000,
    tcp_option_timestamp_value_count: 3,
    tcp_option_timestamp_value_step: 9,
    tcp_option_window_scale: 6,
    tcp_option_window_scale_count: 3,
    tcp_option_window_scale_enabled: true,
    tcp_option_window_scale_step: 1,
    tcp_sequence_count: 3,
    tcp_sequence_number: 1000,
    tcp_sequence_step: 5,
    tcp_urgent_pointer: 9,
    tcp_urgent_pointer_count: 3,
    tcp_urgent_pointer_step: 1,
    tcp_window: 1024,
    tcp_window_count: 3,
    tcp_window_step: 4
  });

  it("builds outer TCP source and destination port writes at the structured L4 offsets", () => {
    expect(buildOuterTcpSrcPortIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 49152,
          max_value: 49161,
          min_value: 49152,
          name: "tcp_src",
          op: "inc",
          size: 2,
          step: 3,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_src"
    });

    expect(buildOuterTcpDstPortIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 443,
          max_value: 452,
          min_value: 443,
          name: "tcp_dst",
          op: "inc",
          size: 2,
          step: 3,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_dst"
    });
  });

  it("builds IPv4/TCP five-tuple writes with one checksum repair", () => {
    expect(buildOuterTcpFiveTupleVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 11,
          max_value: 14,
          min_value: 11,
          name: "ipv4_src",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_src",
          pkt_offset: 29,
          type: "write_flow_var"
        },
        {
          init_value: 12,
          max_value: 15,
          min_value: 12,
          name: "ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_dst",
          pkt_offset: 33,
          type: "write_flow_var"
        },
        {
          init_value: 49152,
          max_value: 49161,
          min_value: 49152,
          name: "tcp_src",
          op: "inc",
          size: 2,
          step: 3,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        {
          init_value: 443,
          max_value: 452,
          min_value: 443,
          name: "tcp_dst",
          op: "inc",
          size: 2,
          step: 3,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "ipv4_src"
    });
  });

  it("builds TCP sequence, ack, window, and urgent pointer writes", () => {
    expect(buildOuterTcpSequenceIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 1000,
          max_value: 1002,
          min_value: 1000,
          name: "tcp_sequence",
          op: "inc",
          size: 4,
          step: 5,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_sequence",
          pkt_offset: 38,
          type: "write_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_sequence"
    });

    expect(buildOuterTcpAckIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 2000,
        max_value: 2002,
        min_value: 2000,
        name: "tcp_ack",
        op: "inc",
        size: 4,
        step: 5,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_ack",
        pkt_offset: 42,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpWindowIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 1024,
        max_value: 1026,
        min_value: 1024,
        name: "tcp_window",
        op: "inc",
        size: 2,
        step: 4,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_window",
        pkt_offset: 48,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpUrgentPointerIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 9,
        max_value: 11,
        min_value: 9,
        name: "tcp_urgent_pointer",
        op: "inc",
        size: 2,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_urgent_pointer",
        pkt_offset: 52,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);
  });

  it("builds TCP flag byte, reserved-bit, single-flag, and checksum writes", () => {
    expect(buildOuterTcpFlagsIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 18,
          max_value: 21,
          min_value: 18,
          name: "tcp_flags",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x3F,
          name: "tcp_flags",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 0,
          type: "write_mask_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_flags"
    });

    expect(buildOuterTcpReservedBitsIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 0,
        max_value: 0x0F,
        min_value: 0,
        name: "tcp_reserved_bits",
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0F,
        name: "tcp_reserved_bits",
        pkt_cast_size: 1,
        pkt_offset: 46,
        shift: 0,
        type: "write_mask_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpFlagVaryVmBody(tcpIpv4Stream, "syn")).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "tcp_flag_syn",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x02,
          name: "tcp_flag_syn",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 1,
          type: "write_mask_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_flag_syn"
    });

    expect(buildOuterTcpChecksumIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 48879,
          max_value: 48881,
          min_value: 48879,
          name: "tcp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_checksum",
          pkt_offset: 50,
          type: "write_flow_var"
        }
      ],
      split_by_var: "tcp_checksum"
    });
  });

  it("builds TCP option MSS, window-scale, timestamp, and SACK writes", () => {
    expect(buildOuterTcpOptionMssIncVmBody(tcpIpv4Stream)).toEqual({
      instructions: [
        {
          init_value: 1460,
          max_value: 1462,
          min_value: 1460,
          name: "tcp_option_mss",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_mss",
          pkt_offset: 56,
          type: "write_flow_var"
        },
        tcpChecksumRepair
      ],
      split_by_var: "tcp_option_mss"
    });

    expect(buildOuterTcpOptionWindowScaleIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 6,
        max_value: 8,
        min_value: 6,
        name: "tcp_option_window_scale",
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_window_scale",
        pkt_offset: 85,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpOptionTimestampValueIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 3000,
        max_value: 3002,
        min_value: 3000,
        name: "tcp_option_timestamp_value",
        op: "inc",
        size: 4,
        step: 9,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_timestamp_value",
        pkt_offset: 74,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpOptionTimestampEchoIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 4000,
        max_value: 4002,
        min_value: 4000,
        name: "tcp_option_timestamp_echo",
        op: "inc",
        size: 4,
        step: 9,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_timestamp_echo",
        pkt_offset: 78,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpOptionSackLeftIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 100,
        max_value: 102,
        min_value: 100,
        name: "tcp_option_sack_left_edge",
        op: "inc",
        size: 4,
        step: 7,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_sack_left_edge",
        pkt_offset: 62,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpOptionSackRightIncVmBody(tcpIpv4Stream).instructions).toEqual([
      {
        init_value: 200,
        max_value: 202,
        min_value: 200,
        name: "tcp_option_sack_right_edge",
        op: "inc",
        size: 4,
        step: 7,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_sack_right_edge",
        pkt_offset: 66,
        type: "write_flow_var"
      },
      tcpChecksumRepair
    ]);

    expect(buildOuterTcpOptionSack2LeftIncVmBody(tcpIpv4Stream).split_by_var).toBe(
      "tcp_option_sack2_left_edge"
    );
  });
});
