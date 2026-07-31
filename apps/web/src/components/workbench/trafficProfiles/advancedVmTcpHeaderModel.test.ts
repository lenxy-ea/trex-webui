import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildOuterTcpChecksumIncVmBody,
  buildOuterTcpFlagVaryVmBody,
  buildOuterTcpFlagsIncVmBody,
  buildOuterTcpSequenceIncVmBody,
  buildOuterTcpWindowIncVmBody
} from "./advancedVmTcpHeaderModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

describe("advancedVmTcpHeaderModel", () => {
  const tcpChecksumRepair = {
    l2_len: 14,
    l3_len: 20,
    l4_type: 13,
    type: "fix_checksum_hw"
  };
  const tcpIpv4Stream = stream({
    packet_type: "Ethernet/IPv4/TCP",
    tcp_checksum: "BEEF",
    tcp_checksum_count: 3,
    tcp_checksum_step: 1,
    tcp_flag_ack: true,
    tcp_flag_syn: true,
    tcp_flags_count: 4,
    tcp_flags_step: 1,
    tcp_sequence_count: 3,
    tcp_sequence_number: 1000,
    tcp_sequence_step: 5,
    tcp_window: 1024,
    tcp_window_count: 3,
    tcp_window_step: 4
  });

  it("builds fixed TCP header number writes with checksum repair", () => {
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
  });

  it("builds masked flag writes and manual checksum writes", () => {
    expect(buildOuterTcpFlagsIncVmBody(tcpIpv4Stream).split_by_var).toBe("tcp_flags");
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
});
