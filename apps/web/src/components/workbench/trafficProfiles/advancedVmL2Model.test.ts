import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterEtherTypeIncVmBody,
  buildOuterMacDstIncVmBody,
  buildOuterMacSrcIncVmBody,
  isOuterEtherTypeStream
} from "./advancedVmL2Model";
import type { AdvancedVmBody } from "./model";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

function ethernetFrameBase64(etherType: number) {
  const bytes = [
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x10,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x20,
    (etherType >> 8) & 0xff, etherType & 0xff,
    0x00, 0x01, 0x02, 0x03
  ];
  return btoa(String.fromCharCode(...bytes));
}

function instructions(body: AdvancedVmBody) {
  return body.instructions as Array<Record<string, unknown>>;
}

describe("advancedVmL2Model", () => {
  it("builds structured outer MAC Field Engine write bodies", () => {
    const candidate = stream({
      ether_dst: "00:00:00:00:00:10",
      ether_dst_count: 4,
      ether_dst_step: 2,
      ether_src: "00:00:00:00:00:20",
      ether_src_count: 3,
      ether_src_step: 1,
      packet_type: "Ethernet/IPv4/UDP"
    });

    expect(buildOuterMacDstIncVmBody(candidate)).toEqual({
      instructions: [
        {
          init_value: 16,
          max_value: 22,
          min_value: 16,
          name: "mac_dest",
          op: "inc",
          size: 1,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "mac_dest",
          pkt_offset: 5,
          type: "write_flow_var"
        }
      ],
      split_by_var: "mac_dest"
    });

    expect(buildOuterMacSrcIncVmBody(candidate)).toEqual({
      instructions: [
        {
          init_value: 32,
          max_value: 34,
          min_value: 32,
          name: "mac_src",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "mac_src",
          pkt_offset: 11,
          type: "write_flow_var"
        }
      ],
      split_by_var: "mac_src"
    });
  });

  it("uses raw packet bytes for outer MAC and EtherType targets", () => {
    const candidate = stream({
      ether_dst: "00:00:00:00:00:01",
      ether_dst_count: 4,
      ether_dst_step: 1,
      packet_binary_base64: ethernetFrameBase64(0x86dd),
      packet_type: "Ethernet/IPv4/UDP"
    });

    expect(instructions(buildOuterMacDstIncVmBody(candidate))).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 0x10, name: "mac_dest", type: "flow_var" }),
      expect.objectContaining({ name: "mac_dest", pkt_offset: 5, type: "write_flow_var" })
    ]));
    expect(buildOuterEtherTypeIncVmBody(candidate)).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({ init_value: 0x86dd, name: "ether_type", size: 2, type: "flow_var" }),
        expect.objectContaining({ name: "ether_type", pkt_offset: 12, type: "write_flow_var" })
      ]),
      split_by_var: "ether_type"
    });
  });

  it("recognizes structured and raw outer EtherType support", () => {
    expect(isOuterEtherTypeStream(stream({ packet_type: "Ethernet/IPv4/UDP" }))).toBe(true);
    expect(isOuterEtherTypeStream(stream({ mpls_enabled: true, packet_type: "Ethernet/IPv4/UDP" }))).toBe(false);
    expect(isOuterEtherTypeStream(stream({ packet_type: "Ethernet/IPv4/UDP", vlan_enabled: true }))).toBe(false);
    expect(isOuterEtherTypeStream(stream({
      packet_binary_base64: ethernetFrameBase64(0x0800),
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(true);
    expect(isOuterEtherTypeStream(stream({
      packet_binary_base64: ethernetFrameBase64(0x8100),
      packet_type: "Ethernet/IPv4/UDP"
    }))).toBe(false);
  });

  it("builds structured outer EtherType Field Engine body from packet type", () => {
    const body = buildOuterEtherTypeIncVmBody(stream({ packet_type: "Ethernet/IPv4/UDP" }));

    expect(body).toMatchObject({
      instructions: expect.arrayContaining([
        expect.objectContaining({
          init_value: 0x0800,
          max_value: 0x080f,
          min_value: 0x0800,
          name: "ether_type",
          size: 2,
          step: 1,
          type: "flow_var"
        }),
        expect.objectContaining({
          name: "ether_type",
          pkt_offset: 12,
          type: "write_flow_var"
        })
      ]),
      split_by_var: "ether_type"
    });
  });
});
