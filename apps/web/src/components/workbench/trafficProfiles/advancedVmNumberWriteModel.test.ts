import { describe, expect, it } from "vitest";

import {
  advancedNumberWriteInstructions,
  buildAdvancedNumberWriteVmBody
} from "./advancedVmNumberWriteModel";

describe("advancedVmNumberWriteModel", () => {
  it("builds a flow var followed by a packet write instruction", () => {
    expect(advancedNumberWriteInstructions({
      count: 4,
      initValue: 10,
      maxLimit: 20,
      name: "ipv4_id",
      pktOffset: 18,
      size: 2,
      step: 3
    })).toEqual([
      {
        init_value: 10,
        max_value: 19,
        min_value: 10,
        name: "ipv4_id",
        op: "inc",
        size: 2,
        step: 3,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "ipv4_id",
        pkt_offset: 18,
        type: "write_flow_var"
      }
    ]);
  });

  it("builds a VM body and appends checksum repair when present", () => {
    expect(buildAdvancedNumberWriteVmBody({
      checksumInstruction: { type: "fix_ipv4_cs" },
      count: 2,
      initValue: 1,
      maxLimit: 255,
      name: "ttl",
      pktOffset: 22,
      size: 1,
      step: 1
    })).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 2,
          min_value: 1,
          name: "ttl",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ttl",
          pkt_offset: 22,
          type: "write_flow_var"
        },
        { type: "fix_ipv4_cs" }
      ],
      split_by_var: "ttl"
    });
  });
});
