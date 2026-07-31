import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterIpv4DfFlagVaryVmBody,
  buildOuterIpv4DscpIncVmBody,
  buildOuterIpv4IdIncVmBody,
  buildOuterIpv4SrcIncVmBody,
  buildOuterIpv4TtlIncVmBody,
  isAdvancedOuterIpv4Stream,
  isAdvancedOuterIpv4TcpStream,
  isAdvancedOuterIpv4UdpStream
} from "./advancedVmOuterIpv4Model";
import type { AdvancedVmBody } from "./model";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

function ipv4Stream(fields: Partial<ProfileWorkbenchStream> = {}) {
  return stream({
    gtpu_enabled: false,
    ipv4_dscp: 10,
    ipv4_dscp_count: 4,
    ipv4_dscp_step: 1,
    ipv4_dst: "10.0.0.20",
    ipv4_dst_count: 4,
    ipv4_dst_step: 1,
    ipv4_ecn: 1,
    ipv4_ecn_count: 2,
    ipv4_ecn_step: 1,
    ipv4_flag_df: true,
    ipv4_flag_mf: false,
    ipv4_fragment_offset: 5,
    ipv4_fragment_offset_count: 4,
    ipv4_fragment_offset_step: 1,
    ipv4_id: 0x1234,
    ipv4_id_count: 4,
    ipv4_id_step: 1,
    ipv4_src: "10.0.0.10",
    ipv4_src_count: 4,
    ipv4_src_step: 1,
    ipv4_ttl: 64,
    ipv4_ttl_count: 4,
    ipv4_ttl_step: 1,
    packet_type: "Ethernet/IPv4/UDP",
    vlan_enabled: false,
    vxlan_enabled: false,
    ...fields
  });
}

function rawIpv4FrameBase64(protocol: 6 | 17) {
  const l4Bytes = protocol === 17
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
    0x08, 0x00,
    0x45, 0xb9, 0x00, 20 + l4Bytes.length,
    0x12, 0x34,
    0x40, 0x05,
    64, protocol,
    0x00, 0x00,
    192, 0, 2, 10,
    198, 51, 100, 20,
    ...l4Bytes
  ];
  return btoa(String.fromCharCode(...bytes));
}

function instructions(body: AdvancedVmBody) {
  return body.instructions as Array<Record<string, unknown>>;
}

describe("advancedVmOuterIpv4Model", () => {
  it("builds structured outer IPv4 address and header Field Engine bodies", () => {
    const candidate = ipv4Stream();

    expect(buildOuterIpv4SrcIncVmBody(candidate)).toEqual({
      instructions: [
        {
          init_value: 10,
          max_value: 13,
          min_value: 10,
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
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_src"
    });

    expect(buildOuterIpv4IdIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 0x1234, name: "ip_id", type: "flow_var" }),
        expect.objectContaining({ name: "ip_id", pkt_offset: 18, type: "write_flow_var" })
      ]),
      split_by_var: "ip_id"
    });
    expect(buildOuterIpv4DscpIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 10, name: "ip_dscp", type: "flow_var" }),
        expect.objectContaining({ mask: 0xfc, name: "ip_dscp", pkt_offset: 15, shift: 2, type: "write_mask_flow_var" })
      ]),
      split_by_var: "ip_dscp"
    });
    expect(buildOuterIpv4DfFlagVaryVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 1, name: "ip_df", op: "dec", type: "flow_var" }),
        expect.objectContaining({ mask: 0x4000, name: "ip_df", pkt_offset: 20, shift: 14, type: "write_mask_flow_var" })
      ]),
      split_by_var: "ip_df"
    });
    expect(buildOuterIpv4TtlIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 64, name: "ip_ttl", type: "flow_var" }),
        expect.objectContaining({ name: "ip_ttl", pkt_offset: 22, type: "write_flow_var" })
      ]),
      split_by_var: "ip_ttl"
    });
  });

  it("uses raw packet offsets for outer IPv4 headers", () => {
    const candidate = ipv4Stream({
      packet_binary_base64: rawIpv4FrameBase64(17)
    });

    expect(instructions(buildOuterIpv4SrcIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 10, name: "ipv4_src", type: "flow_var" }),
      expect.objectContaining({ name: "ipv4_src", pkt_offset: 29, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(instructions(buildOuterIpv4DscpIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 46, name: "ip_dscp", type: "flow_var" }),
      expect.objectContaining({ mask: 0xfc, name: "ip_dscp", pkt_offset: 15, shift: 2, type: "write_mask_flow_var" })
    ]));
    expect(instructions(buildOuterIpv4TtlIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 64, name: "ip_ttl", type: "flow_var" }),
      expect.objectContaining({ name: "ip_ttl", pkt_offset: 22, type: "write_flow_var" })
    ]));
  });

  it("recognizes structured and raw outer IPv4 support", () => {
    expect(isAdvancedOuterIpv4Stream(ipv4Stream())).toBe(true);
    expect(isAdvancedOuterIpv4UdpStream(ipv4Stream())).toBe(true);
    expect(isAdvancedOuterIpv4TcpStream(ipv4Stream({ packet_type: "Ethernet/IPv4/TCP" }))).toBe(true);
    expect(isAdvancedOuterIpv4Stream(ipv4Stream({ vxlan_enabled: true }))).toBe(false);
    expect(isAdvancedOuterIpv4UdpStream(ipv4Stream({ gtpu_enabled: true }))).toBe(false);
    expect(isAdvancedOuterIpv4Stream(ipv4Stream({
      packet_binary_base64: rawIpv4FrameBase64(17),
      packet_type: "Ethernet/IPv6/UDP"
    }))).toBe(true);
    expect(isAdvancedOuterIpv4UdpStream(ipv4Stream({
      packet_binary_base64: rawIpv4FrameBase64(17),
      packet_type: "Ethernet/IPv6/UDP"
    }))).toBe(true);
    expect(isAdvancedOuterIpv4TcpStream(ipv4Stream({
      packet_binary_base64: rawIpv4FrameBase64(6),
      packet_type: "Ethernet/IPv6/TCP"
    }))).toBe(true);
  });
});
