import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterTcpOptionMssIncVmBody,
  buildOuterTcpOptionSack2LeftIncVmBody,
  rawTcpChecksumInstruction
} from "./advancedVmTcpOptionModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

describe("advancedVmTcpOptionModel", () => {
  const tcpChecksumRepair = {
    l2_len: 14,
    l3_len: 20,
    l4_type: 13,
    type: "fix_checksum_hw"
  };
  const tcpIpv4Stream = stream({
    packet_type: "Ethernet/IPv4/TCP",
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
    tcp_option_timestamp_enabled: true,
    tcp_option_window_scale_enabled: true
  });

  it("builds raw TCP checksum repair instructions", () => {
    expect(rawTcpChecksumInstruction({ l3Length: 40, l3Offset: 18 })).toEqual({
      l2_len: 18,
      l3_len: 40,
      l4_type: 13,
      type: "fix_checksum_hw"
    });
  });

  it("builds structured TCP option writes with checksum repair", () => {
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

    expect(buildOuterTcpOptionSack2LeftIncVmBody(tcpIpv4Stream).split_by_var).toBe(
      "tcp_option_sack2_left_edge"
    );
  });
});
