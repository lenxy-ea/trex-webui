import { describe, expect, it } from "vitest";

import {
  buildIpv6AddressIncVmBody,
  ipv6FieldEngineSuffix,
  isSafeIpv6AddressVmTarget
} from "./advancedVmIpv6AddressModel";
import type { ProfileWorkbenchStream } from "../../../api";

describe("advancedVmIpv6AddressModel", () => {
  it("selects the smallest safe IPv6 suffix size", () => {
    expect(ipv6FieldEngineSuffix("2001:db8::10", 4)).toEqual({
      initValue: 0x10,
      maxValue: 0x13,
      size: 1
    });
    expect(ipv6FieldEngineSuffix("2001:db8::ff", 4)).toEqual({
      initValue: 0xff,
      maxValue: 0x102,
      size: 2
    });
    expect(ipv6FieldEngineSuffix("2001:db8::ffff", 4)).toEqual({
      initValue: 0xffff,
      maxValue: 0x10002,
      size: 4
    });
  });

  it("builds IPv6 address writes and rejects invalid targets", () => {
    expect(buildIpv6AddressIncVmBody({
      address: "2001:db8::10",
      baseOffset: 22,
      checksumInstruction: { type: "fix_checksum_hw", l2_len: 14, l3_len: 40, l4_type: 11 },
      count: 4,
      name: "ipv6_src",
      step: 1
    })).toEqual({
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
        },
        { type: "fix_checksum_hw", l2_len: 14, l3_len: 40, l4_type: 11 }
      ],
      split_by_var: "ipv6_src"
    });
    expect(isSafeIpv6AddressVmTarget({} as ProfileWorkbenchStream, "2001:db8::10", 4)).toBe(true);
    expect(isSafeIpv6AddressVmTarget({} as ProfileWorkbenchStream, "not-ipv6", 4)).toBe(false);
  });
});
