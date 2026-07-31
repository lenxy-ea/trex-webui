import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterIpv6FlowLabelIncVmBody,
  buildOuterIpv6HopLimitIncVmBody,
  buildOuterIpv6SrcIncVmBody,
  buildOuterIpv6TrafficClassIncVmBody,
  buildOuterIpv6UdpFiveTupleVmBody,
  buildOuterIpv6UdpSrcPortIncVmBody,
  isAdvancedOuterIpv6Stream,
  isAdvancedOuterIpv6TcpStream,
  isAdvancedOuterIpv6UdpFiveTupleStream,
  isAdvancedOuterIpv6UdpStream
} from "./advancedVmOuterIpv6Model";
import type { AdvancedVmBody } from "./model";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

function ipv6Stream(fields: Partial<ProfileWorkbenchStream> = {}) {
  return stream({
    ipv6_dst: "2001:db8::20",
    ipv6_dst_count: 4,
    ipv6_dst_step: 1,
    ipv6_flow_label: 0x0cdef,
    ipv6_flow_label_count: 4,
    ipv6_flow_label_step: 1,
    ipv6_hop_limit: 64,
    ipv6_hop_limit_count: 4,
    ipv6_hop_limit_step: 1,
    ipv6_src: "2001:db8::10",
    ipv6_src_count: 4,
    ipv6_src_step: 1,
    ipv6_traffic_class: 0xab,
    ipv6_traffic_class_count: 4,
    ipv6_traffic_class_step: 1,
    l4_dst_port: 1026,
    l4_dst_port_count: 4,
    l4_dst_port_step: 1,
    l4_src_port: 1025,
    l4_src_port_count: 4,
    l4_src_port_step: 1,
    packet_type: "Ethernet/IPv6/UDP",
    vlan_enabled: false,
    ...fields
  });
}

function rawIpv6FrameBase64(nextHeader: 6 | 17) {
  const l4Bytes = nextHeader === 17
    ? [0x04, 0x01, 0x04, 0x02, 0x00, 0x0c, 0x00, 0x00]
    : [
        0x04, 0x01, 0x04, 0x02,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00,
        0x50, 0x02, 0x04, 0x00,
        0x00, 0x00, 0x00, 0x00
      ];
  const bytes = [
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x10,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x20,
    0x86, 0xdd,
    0x6a, 0xb0, 0xcd, 0xef,
    0x00, l4Bytes.length,
    nextHeader,
    64,
    0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10,
    0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x20,
    ...l4Bytes
  ];
  return btoa(String.fromCharCode(...bytes));
}

function instructions(body: AdvancedVmBody) {
  return body.instructions as Array<Record<string, unknown>>;
}

describe("advancedVmOuterIpv6Model", () => {
  it("builds structured outer IPv6 header Field Engine bodies", () => {
    const candidate = ipv6Stream();

    expect(buildOuterIpv6SrcIncVmBody(candidate)).toEqual({
      instructions: [
        {
          init_value: 16,
          max_value: 19,
          min_value: 16,
          name: "ipv6_src",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_src",
          pkt_offset: 37,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_src"
    });
    expect(buildOuterIpv6TrafficClassIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 0xab, name: "ipv6_traffic_class", type: "flow_var" }),
        expect.objectContaining({ mask: 0x0ff00000, pkt_offset: 14, shift: 20, type: "write_mask_flow_var" })
      ]),
      split_by_var: "ipv6_traffic_class"
    });
    expect(buildOuterIpv6FlowLabelIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 0x0cdef, name: "ipv6_flow_label", type: "flow_var" }),
        expect.objectContaining({ mask: 0x000fffff, pkt_offset: 14, type: "write_mask_flow_var" })
      ]),
      split_by_var: "ipv6_flow_label"
    });
    expect(buildOuterIpv6HopLimitIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 64, name: "ipv6_hop_limit", type: "flow_var" }),
        expect.objectContaining({ name: "ipv6_hop_limit", pkt_offset: 21, type: "write_flow_var" })
      ]),
      split_by_var: "ipv6_hop_limit"
    });
    expect(buildOuterIpv6UdpSrcPortIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 1025, name: "l4_src_port", type: "flow_var" }),
        expect.objectContaining({ name: "l4_src_port", pkt_offset: 54, type: "write_flow_var" }),
        expect.objectContaining({ l2_len: 14, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" })
      ]),
      split_by_var: "l4_src_port"
    });
  });

  it("uses raw packet offsets for outer IPv6 headers", () => {
    const candidate = ipv6Stream({
      packet_binary_base64: rawIpv6FrameBase64(17)
    });

    expect(instructions(buildOuterIpv6SrcIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 16, name: "ipv6_src", type: "flow_var" }),
      expect.objectContaining({ name: "ipv6_src", pkt_offset: 37, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(instructions(buildOuterIpv6TrafficClassIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 0xab, name: "ipv6_traffic_class", type: "flow_var" }),
      expect.objectContaining({ mask: 0x0ff00000, pkt_offset: 14, shift: 20, type: "write_mask_flow_var" })
    ]));
    expect(instructions(buildOuterIpv6FlowLabelIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 0x0cdef, name: "ipv6_flow_label", type: "flow_var" }),
      expect.objectContaining({ mask: 0x000fffff, pkt_offset: 14, shift: 0, type: "write_mask_flow_var" })
    ]));
  });

  it("recognizes structured and raw outer IPv6 support", () => {
    expect(isAdvancedOuterIpv6Stream(ipv6Stream())).toBe(true);
    expect(isAdvancedOuterIpv6UdpStream(ipv6Stream())).toBe(true);
    expect(isAdvancedOuterIpv6TcpStream(ipv6Stream({ packet_type: "Ethernet/IPv6/TCP" }))).toBe(true);
    expect(isAdvancedOuterIpv6UdpFiveTupleStream(ipv6Stream())).toBe(true);
    expect(isAdvancedOuterIpv6Stream(ipv6Stream({
      packet_binary_base64: rawIpv6FrameBase64(17),
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(true);
    expect(isAdvancedOuterIpv6UdpStream(ipv6Stream({
      packet_binary_base64: rawIpv6FrameBase64(17),
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(true);
    expect(isAdvancedOuterIpv6TcpStream(ipv6Stream({
      packet_binary_base64: rawIpv6FrameBase64(6),
      packet_type: "Ethernet/IPv4/TCP"
    }))).toBe(true);
  });

  it("builds raw outer IPv6 five tuple writes", () => {
    const body = buildOuterIpv6UdpFiveTupleVmBody(ipv6Stream({
      packet_binary_base64: rawIpv6FrameBase64(17)
    }));
    expect(instructions(body)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ipv6_src", pkt_offset: 37, type: "write_flow_var" }),
      expect.objectContaining({ name: "ipv6_dest", pkt_offset: 53, type: "write_flow_var" }),
      expect.objectContaining({ name: "l4_src_port", pkt_offset: 54, type: "write_flow_var" }),
      expect.objectContaining({ name: "l4_dest_port", pkt_offset: 56, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" })
    ]));
  });
});
