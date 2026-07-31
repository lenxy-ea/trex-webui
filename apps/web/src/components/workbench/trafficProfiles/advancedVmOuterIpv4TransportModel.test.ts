import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterTcpDstPortIncVmBody,
  buildOuterTcpFiveTupleVmBody,
  buildOuterUdpFiveTupleVmBody,
  buildOuterUdpSrcPortIncVmBody
} from "./advancedVmOuterIpv4TransportModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

describe("advancedVmOuterIpv4TransportModel", () => {
  const udpChecksumRepair = {
    l2_len: 14,
    l3_len: 20,
    l4_type: 11,
    type: "fix_checksum_hw"
  };
  const tcpChecksumRepair = {
    l2_len: 14,
    l3_len: 20,
    l4_type: 13,
    type: "fix_checksum_hw"
  };
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
    packet_type: "Ethernet/IPv4/UDP"
  });
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
    packet_type: "Ethernet/IPv4/TCP"
  });

  it("builds IPv4 UDP port and five-tuple writes", () => {
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
        udpChecksumRepair
      ],
      split_by_var: "udp_src"
    });

    const udpFiveTupleInstructions = buildOuterUdpFiveTupleVmBody(udpIpv4Stream).instructions as unknown[];
    expect(udpFiveTupleInstructions[udpFiveTupleInstructions.length - 1]).toEqual(udpChecksumRepair);
  });

  it("builds IPv4 TCP port and five-tuple writes", () => {
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

    expect(buildOuterTcpFiveTupleVmBody(tcpIpv4Stream)).toMatchObject({
      instructions: [
        { init_value: 11, name: "ipv4_src", step: 1 },
        { name: "ipv4_src", pkt_offset: 29 },
        { init_value: 12, name: "ipv4_dst", step: 1 },
        { name: "ipv4_dst", pkt_offset: 33 },
        { init_value: 49152, name: "tcp_src", step: 3 },
        { name: "tcp_src", pkt_offset: 34 },
        { init_value: 443, name: "tcp_dst", step: 3 },
        { name: "tcp_dst", pkt_offset: 36 },
        tcpChecksumRepair
      ],
      split_by_var: "ipv4_src"
    });
  });
});
