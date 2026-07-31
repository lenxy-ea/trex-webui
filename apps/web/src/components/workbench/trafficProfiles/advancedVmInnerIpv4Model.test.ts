import { describe, expect, it } from "vitest";

import {
  buildRawInnerIpv4DscpIncVmBody,
  buildRawInnerIpv4EcnIncVmBody,
  buildRawInnerIpv4FlagVaryVmBody,
  buildRawInnerIpv4FragmentOffsetIncVmBody,
  buildRawInnerIpv4IdIncVmBody,
  buildStructuredInnerIpv4UdpFiveTupleVmBody
} from "./advancedVmInnerIpv4Model";

describe("advancedVmInnerIpv4Model", () => {
  it("builds structured inner IPv4 UDP five-tuple writes", () => {
    expect(buildStructuredInnerIpv4UdpFiveTupleVmBody({
      checksumInstruction: {
        l2_len: 50,
        l3_len: 20,
        l4_type: 11,
        type: "fix_checksum_hw"
      },
      dstAddress: "10.0.1.1",
      dstAddressCount: 3,
      dstAddressStep: 1,
      dstPort: 2000,
      dstPortCount: 2,
      dstPortStep: 1,
      innerIpv4Offset: 50,
      innerUdpOffset: 70,
      prefix: "gre_inner",
      srcAddress: "10.0.0.250",
      srcAddressCount: 8,
      srcAddressStep: 1,
      srcPort: 1000,
      srcPortCount: 3,
      srcPortStep: 2
    })).toEqual({
      instructions: [
        {
          init_value: 250,
          max_value: 257,
          min_value: 250,
          name: "gre_inner_ipv4_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_inner_ipv4_src",
          pkt_offset: 64,
          type: "write_flow_var"
        },
        {
          init_value: 1,
          max_value: 3,
          min_value: 1,
          name: "gre_inner_ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_inner_ipv4_dst",
          pkt_offset: 69,
          type: "write_flow_var"
        },
        {
          init_value: 1000,
          max_value: 1004,
          min_value: 1000,
          name: "gre_inner_udp_src",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_inner_udp_src",
          pkt_offset: 70,
          type: "write_flow_var"
        },
        {
          init_value: 2000,
          max_value: 2001,
          min_value: 2000,
          name: "gre_inner_udp_dst",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "gre_inner_udp_dst",
          pkt_offset: 72,
          type: "write_flow_var"
        },
        {
          l2_len: 50,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "gre_inner_ipv4_src"
    });
  });

  it("builds raw inner IPv4 header field writes", () => {
    const bytes = new Array<number>(24).fill(0);
    bytes[1] = 0xab;
    bytes[4] = 0x12;
    bytes[5] = 0x34;
    bytes[6] = 0x60;
    bytes[7] = 0x05;
    const checksumInstruction = {
      pkt_offset: 0,
      type: "fix_checksum_ipv4"
    };

    expect(buildRawInnerIpv4IdIncVmBody({
      bytes,
      checksumInstruction,
      count: 3,
      innerIpOffset: 0,
      step: 2,
      variableName: "inner_ipv4_id"
    })).toEqual({
      instructions: [
        {
          init_value: 4660,
          max_value: 4664,
          min_value: 4660,
          name: "inner_ipv4_id",
          op: "inc",
          size: 2,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "inner_ipv4_id",
          pkt_offset: 4,
          type: "write_flow_var"
        },
        checksumInstruction
      ],
      split_by_var: "inner_ipv4_id"
    });

    const dscpInstructions = buildRawInnerIpv4DscpIncVmBody({
      bytes,
      checksumInstruction,
      count: 4,
      innerIpOffset: 0,
      step: 1,
      variableName: "inner_ipv4_dscp"
    }).instructions as Record<string, unknown>[];
    expect(dscpInstructions[0]).toEqual({
      init_value: 42,
      max_value: 45,
      min_value: 42,
      name: "inner_ipv4_dscp",
      op: "inc",
      size: 1,
      step: 1,
      type: "flow_var"
    });

    const ecnInstructions = buildRawInnerIpv4EcnIncVmBody({
      bytes,
      checksumInstruction,
      count: 2,
      innerIpOffset: 0,
      step: 1,
      variableName: "inner_ipv4_ecn"
    }).instructions as Record<string, unknown>[];
    expect(ecnInstructions[1]).toEqual({
      add_value: 0,
      is_big_endian: true,
      mask: 0x03,
      name: "inner_ipv4_ecn",
      pkt_cast_size: 1,
      pkt_offset: 1,
      shift: 0,
      type: "write_mask_flow_var"
    });

    const fragmentInstructions = buildRawInnerIpv4FragmentOffsetIncVmBody({
      bytes,
      checksumInstruction,
      count: 2,
      innerIpOffset: 0,
      step: 1,
      variableName: "inner_ipv4_fragment_offset"
    }).instructions as Record<string, unknown>[];
    expect(fragmentInstructions[0]).toEqual({
      init_value: 5,
      max_value: 6,
      min_value: 5,
      name: "inner_ipv4_fragment_offset",
      op: "inc",
      size: 2,
      step: 1,
      type: "flow_var"
    });

    const flagInstructions = buildRawInnerIpv4FlagVaryVmBody({
      bytes,
      checksumInstruction,
      innerIpOffset: 0,
      target: "df",
      variablePrefix: "inner_ipv4"
    }).instructions as Record<string, unknown>[];
    expect(flagInstructions[0]).toEqual({
      init_value: 1,
      max_value: 1,
      min_value: 0,
      name: "inner_ipv4_df",
      op: "dec",
      size: 1,
      step: 1,
      type: "flow_var"
    });
  });
});
