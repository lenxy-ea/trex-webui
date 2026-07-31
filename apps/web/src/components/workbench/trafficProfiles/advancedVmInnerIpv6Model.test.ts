import { describe, expect, it } from "vitest";

import {
  buildRawInnerIpv6FlowLabelIncVmBody,
  buildRawInnerIpv6TrafficClassIncVmBody
} from "./advancedVmInnerIpv6Model";

describe("advancedVmInnerIpv6Model", () => {
  it("builds raw inner IPv6 traffic class and flow label masked writes", () => {
    const bytes = [0x6a, 0xbc, 0xde, 0xf0];

    expect(buildRawInnerIpv6TrafficClassIncVmBody(
      bytes,
      0,
      "inner_ipv6_traffic_class",
      3,
      2
    )).toEqual({
      instructions: [
        {
          init_value: 171,
          max_value: 173,
          min_value: 171,
          name: "inner_ipv6_traffic_class",
          op: "inc",
          size: 1,
          step: 2,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x0ff00000,
          name: "inner_ipv6_traffic_class",
          pkt_cast_size: 4,
          pkt_offset: 0,
          shift: 20,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "inner_ipv6_traffic_class"
    });

    expect(buildRawInnerIpv6FlowLabelIncVmBody(
      bytes,
      0,
      "inner_ipv6_flow_label",
      4,
      1
    )).toEqual({
      instructions: [
        {
          init_value: 843_504,
          max_value: 843_507,
          min_value: 843_504,
          name: "inner_ipv6_flow_label",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x000fffff,
          name: "inner_ipv6_flow_label",
          pkt_cast_size: 4,
          pkt_offset: 0,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "inner_ipv6_flow_label"
    });
  });
});
