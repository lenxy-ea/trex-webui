import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterIpv4UdpChecksumIncVmBody,
  buildOuterIpv4UdpLengthIncVmBody,
  buildOuterIpv6UdpChecksumIncVmBody,
  buildOuterIpv6UdpLengthIncVmBody
} from "./advancedVmUdpHeaderModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

describe("advancedVmUdpHeaderModel", () => {
  const udpIpv4Stream = stream({
    packet_type: "Ethernet/IPv4/UDP",
    udp_checksum: "BEEF",
    udp_checksum_count: 3,
    udp_checksum_step: 1,
    udp_length: 128,
    udp_length_count: 3,
    udp_length_step: 4
  });
  const udpIpv6Stream = stream({
    ...udpIpv4Stream,
    packet_type: "Ethernet/IPv6/UDP"
  });

  it("builds IPv4 and IPv6 UDP length writes with checksum repair", () => {
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

    expect(buildOuterIpv6UdpLengthIncVmBody(udpIpv6Stream).instructions).toContainEqual({
      l2_len: 14,
      l3_len: 40,
      l4_type: 11,
      type: "fix_checksum_hw"
    });
  });

  it("builds IPv4 and IPv6 UDP checksum writes", () => {
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

    expect(buildOuterIpv6UdpChecksumIncVmBody(udpIpv6Stream)).toMatchObject({
      instructions: [
        { init_value: 48879, name: "udp_checksum", step: 1 },
        { name: "udp_checksum", pkt_offset: 60 }
      ],
      split_by_var: "udp_checksum"
    });
  });
});
