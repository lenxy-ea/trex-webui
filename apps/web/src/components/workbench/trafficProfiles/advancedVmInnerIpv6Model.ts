import type { AdvancedVmBody } from "./model";
import { rawPacketNumberValue } from "./rawPacketModel";

export function buildRawInnerIpv6TrafficClassIncVmBody(
  bytes: number[],
  innerIpOffset: number,
  variableName: string,
  count: number,
  step: number
): AdvancedVmBody {
  const initValue =
    (((bytes[innerIpOffset] ?? 0) & 0x0f) << 4)
    | (((bytes[innerIpOffset + 1] ?? 0) & 0xf0) >>> 4);
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(255, initValue + count - 1),
        min_value: initValue,
        name: variableName,
        op: "inc",
        size: 1,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0ff00000,
        name: variableName,
        pkt_cast_size: 4,
        pkt_offset: innerIpOffset,
        shift: 20,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildRawInnerIpv6FlowLabelIncVmBody(
  bytes: number[],
  innerIpOffset: number,
  variableName: string,
  count: number,
  step: number
): AdvancedVmBody {
  const initValue = rawPacketNumberValue(bytes, innerIpOffset, 4) & 0x000fffff;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(1_048_575, initValue + count - 1),
        min_value: initValue,
        name: variableName,
        op: "inc",
        size: 4,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x000fffff,
        name: variableName,
        pkt_cast_size: 4,
        pkt_offset: innerIpOffset,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}
