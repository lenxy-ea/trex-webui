import type { AdvancedVmBody } from "./model";
import { advancedNumberBounds } from "./advancedVmParameterModel";

export type AdvancedNumberWriteSpec = {
  checksumInstruction?: Record<string, unknown>;
  count: number;
  initValue: number;
  maxLimit: number;
  name: string;
  pktOffset: number;
  size: 1 | 2 | 4;
  step: number;
};

export function advancedNumberWriteInstructions({
  count,
  initValue,
  maxLimit,
  name,
  pktOffset,
  size,
  step
}: AdvancedNumberWriteSpec) {
  const bounds = advancedNumberBounds(initValue, count, step, maxLimit);
  return [
    {
      init_value: initValue,
      max_value: bounds.max,
      min_value: bounds.min,
      name,
      op: "inc",
      size,
      step,
      type: "flow_var"
    },
    {
      add_value: 0,
      is_big_endian: true,
      name,
      pkt_offset: pktOffset,
      type: "write_flow_var"
    }
  ];
}

export function buildAdvancedNumberWriteVmBody({
  checksumInstruction,
  count,
  initValue,
  maxLimit,
  name,
  pktOffset,
  size,
  step
}: AdvancedNumberWriteSpec): AdvancedVmBody {
  return {
    instructions: [
      ...advancedNumberWriteInstructions({ count, initValue, maxLimit, name, pktOffset, size, step }),
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: name
  };
}
