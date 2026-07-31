import type { AdvancedVmBody } from "./model";
import {
  advancedNumberWriteInstructions,
  buildAdvancedNumberWriteVmBody
} from "./advancedVmNumberWriteModel";
import {
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix
} from "./advancedVmValueModel";
import { rawPacketWord } from "./rawPacketModel";

export type InnerIpv4UdpFiveTuplePrefix = "vxlan_inner" | "gtpu_inner" | "gre_inner";

export function buildStructuredInnerIpv4UdpFiveTupleVmBody({
  checksumInstruction,
  dstAddress,
  dstAddressCount,
  dstAddressStep,
  dstPort,
  dstPortCount,
  dstPortStep,
  innerIpv4Offset,
  innerUdpOffset,
  prefix,
  srcAddress,
  srcAddressCount,
  srcAddressStep,
  srcPort,
  srcPortCount,
  srcPortStep
}: {
  checksumInstruction: Record<string, unknown>;
  dstAddress: string;
  dstAddressCount: number;
  dstAddressStep: number;
  dstPort: number;
  dstPortCount: number;
  dstPortStep: number;
  innerIpv4Offset: number;
  innerUdpOffset: number;
  prefix: InnerIpv4UdpFiveTuplePrefix;
  srcAddress: string;
  srcAddressCount: number;
  srcAddressStep: number;
  srcPort: number;
  srcPortCount: number;
  srcPortStep: number;
}): AdvancedVmBody {
  const srcSuffix = ipv4FieldEngineSuffix(srcAddress, srcAddressCount);
  const dstSuffix = ipv4FieldEngineSuffix(dstAddress, dstAddressCount);
  const srcAddressName = `${prefix}_ipv4_src`;
  const dstAddressName = `${prefix}_ipv4_dst`;
  const srcPortName = `${prefix}_udp_src`;
  const dstPortName = `${prefix}_udp_dst`;
  return {
    instructions: [
      ...advancedNumberWriteInstructions({
        count: srcAddressCount,
        initValue: srcSuffix.initValue,
        maxLimit: fieldEngineMaxForSize(srcSuffix.size),
        name: srcAddressName,
        pktOffset: innerIpv4Offset + 16 - srcSuffix.size,
        size: srcSuffix.size,
        step: srcAddressStep
      }),
      ...advancedNumberWriteInstructions({
        count: dstAddressCount,
        initValue: dstSuffix.initValue,
        maxLimit: fieldEngineMaxForSize(dstSuffix.size),
        name: dstAddressName,
        pktOffset: innerIpv4Offset + 20 - dstSuffix.size,
        size: dstSuffix.size,
        step: dstAddressStep
      }),
      ...advancedNumberWriteInstructions({
        count: srcPortCount,
        initValue: srcPort,
        maxLimit: 65_535,
        name: srcPortName,
        pktOffset: innerUdpOffset,
        size: 2,
        step: srcPortStep
      }),
      ...advancedNumberWriteInstructions({
        count: dstPortCount,
        initValue: dstPort,
        maxLimit: 65_535,
        name: dstPortName,
        pktOffset: innerUdpOffset + 2,
        size: 2,
        step: dstPortStep
      }),
      checksumInstruction
    ],
    split_by_var: srcAddressName
  };
}

export function buildRawInnerIpv4IdIncVmBody({
  bytes,
  checksumInstruction,
  count,
  innerIpOffset,
  step,
  variableName
}: {
  bytes: number[];
  checksumInstruction?: Record<string, unknown>;
  count: number;
  innerIpOffset: number;
  step: number;
  variableName: string;
}): AdvancedVmBody {
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction,
    count,
    initValue: rawPacketWord(bytes, innerIpOffset + 4),
    maxLimit: 65_535,
    name: variableName,
    pktOffset: innerIpOffset + 4,
    size: 2,
    step
  });
}

export function buildRawInnerIpv4DscpIncVmBody({
  bytes,
  checksumInstruction,
  count,
  innerIpOffset,
  step,
  variableName
}: {
  bytes: number[];
  checksumInstruction?: Record<string, unknown>;
  count: number;
  innerIpOffset: number;
  step: number;
  variableName: string;
}): AdvancedVmBody {
  const initValue = ((bytes[innerIpOffset + 1] ?? 0) & 0xfc) >>> 2;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(63, initValue + count - 1),
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
        mask: 0xfc,
        name: variableName,
        pkt_cast_size: 1,
        pkt_offset: innerIpOffset + 1,
        shift: 2,
        type: "write_mask_flow_var"
      },
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: variableName
  };
}

export function buildRawInnerIpv4EcnIncVmBody({
  bytes,
  checksumInstruction,
  count,
  innerIpOffset,
  step,
  variableName
}: {
  bytes: number[];
  checksumInstruction?: Record<string, unknown>;
  count: number;
  innerIpOffset: number;
  step: number;
  variableName: string;
}): AdvancedVmBody {
  const initValue = (bytes[innerIpOffset + 1] ?? 0) & 0x03;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(3, initValue + count - 1),
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
        mask: 0x03,
        name: variableName,
        pkt_cast_size: 1,
        pkt_offset: innerIpOffset + 1,
        shift: 0,
        type: "write_mask_flow_var"
      },
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: variableName
  };
}

export function buildRawInnerIpv4FragmentOffsetIncVmBody({
  bytes,
  checksumInstruction,
  count,
  innerIpOffset,
  step,
  variableName
}: {
  bytes: number[];
  checksumInstruction?: Record<string, unknown>;
  count: number;
  innerIpOffset: number;
  step: number;
  variableName: string;
}): AdvancedVmBody {
  const initValue = rawPacketWord(bytes, innerIpOffset + 6) & 0x1fff;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(8191, initValue + count - 1),
        min_value: initValue,
        name: variableName,
        op: "inc",
        size: 2,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1fff,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: innerIpOffset + 6,
        shift: 0,
        type: "write_mask_flow_var"
      },
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: variableName
  };
}

export function buildRawInnerIpv4FlagVaryVmBody({
  bytes,
  checksumInstruction,
  innerIpOffset,
  target,
  variablePrefix
}: {
  bytes: number[];
  checksumInstruction?: Record<string, unknown>;
  innerIpOffset: number;
  target: "reserved" | "df" | "mf";
  variablePrefix: string;
}): AdvancedVmBody {
  const flag = {
    df: { mask: 0x4000, shift: 14, variableName: `${variablePrefix}_df` },
    mf: { mask: 0x2000, shift: 13, variableName: `${variablePrefix}_mf` },
    reserved: { mask: 0x8000, shift: 15, variableName: `${variablePrefix}_reserved` }
  }[target];
  const rawWord = rawPacketWord(bytes, innerIpOffset + 6);
  const initValue = (rawWord & flag.mask) >>> flag.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: 1,
        min_value: 0,
        name: flag.variableName,
        op: initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: flag.mask,
        name: flag.variableName,
        pkt_cast_size: 2,
        pkt_offset: innerIpOffset + 6,
        shift: flag.shift,
        type: "write_mask_flow_var"
      },
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: flag.variableName
  };
}
