import type { ProfileWorkbenchStream } from "../../../api";
import type { AdvancedVmBody } from "./model";
import {
  outerTcpChecksumInstruction,
  outerTcpOffset
} from "./packetLayoutModel";
import {
  rawOuterTcpFixedHeaderTarget,
  rawPacketNumberValue,
  rawPacketWord
} from "./rawPacketModel";
import { rawTcpChecksumInstruction } from "./advancedVmTcpOptionModel";

function buildOuterTcpNumberIncVmBody(stream: ProfileWorkbenchStream, field: "sequence" | "ack"): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const variableName = field === "ack" ? "tcp_ack" : "tcp_sequence";
  const fieldOffset = field === "ack" ? 8 : 4;
  const initValue = rawTarget
    ? rawPacketNumberValue(rawTarget.bytes, tcpOffset + fieldOffset, 4)
    : field === "ack"
      ? stream.tcp_ack_number
      : stream.tcp_sequence_number;
  const count = field === "ack" ? stream.tcp_ack_count : stream.tcp_sequence_count;
  const step = field === "ack" ? stream.tcp_ack_step : stream.tcp_sequence_step;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(4_294_967_295, initValue + count - 1),
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
        name: variableName,
        pkt_offset: tcpOffset + fieldOffset,
        type: "write_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: variableName
  };
}

export function buildOuterTcpSequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpNumberIncVmBody(stream, "sequence");
}

export function buildOuterTcpAckIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpNumberIncVmBody(stream, "ack");
}

export function buildOuterTcpWindowIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const initValue = rawTarget ? rawPacketWord(rawTarget.bytes, tcpOffset + 14) : stream.tcp_window;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + stream.tcp_window_count - 1),
        min_value: initValue,
        name: "tcp_window",
        op: "inc",
        size: 2,
        step: stream.tcp_window_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_window",
        pkt_offset: tcpOffset + 14,
        type: "write_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_window"
  };
}

export function buildOuterTcpUrgentPointerIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const initValue = rawTarget ? rawPacketWord(rawTarget.bytes, tcpOffset + 18) : stream.tcp_urgent_pointer;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + stream.tcp_urgent_pointer_count - 1),
        min_value: initValue,
        name: "tcp_urgent_pointer",
        op: "inc",
        size: 2,
        step: stream.tcp_urgent_pointer_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_urgent_pointer",
        pkt_offset: tcpOffset + 18,
        type: "write_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_urgent_pointer"
  };
}

function tcpFlagsValue(stream: ProfileWorkbenchStream) {
  return (
    (stream.tcp_flag_urg ? 0x20 : 0)
    | (stream.tcp_flag_ack ? 0x10 : 0)
    | (stream.tcp_flag_psh ? 0x08 : 0)
    | (stream.tcp_flag_rst ? 0x04 : 0)
    | (stream.tcp_flag_syn ? 0x02 : 0)
    | (stream.tcp_flag_fin ? 0x01 : 0)
  );
}

const tcpFlagTargetFields = {
  ack: { key: "tcp_flag_ack", mask: 0x10, variableName: "tcp_flag_ack" },
  fin: { key: "tcp_flag_fin", mask: 0x01, variableName: "tcp_flag_fin" },
  psh: { key: "tcp_flag_psh", mask: 0x08, variableName: "tcp_flag_psh" },
  rst: { key: "tcp_flag_rst", mask: 0x04, variableName: "tcp_flag_rst" },
  syn: { key: "tcp_flag_syn", mask: 0x02, variableName: "tcp_flag_syn" },
  urg: { key: "tcp_flag_urg", mask: 0x20, variableName: "tcp_flag_urg" }
} as const;

export type TcpFlagTarget = keyof typeof tcpFlagTargetFields;

export function buildOuterTcpFlagsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const initValue = rawTarget ? (rawTarget.bytes[tcpOffset + 13] ?? 0) & 0x3F : tcpFlagsValue(stream);
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(0x3F, initValue + stream.tcp_flags_count - 1),
        min_value: initValue,
        name: "tcp_flags",
        op: "inc",
        size: 1,
        step: stream.tcp_flags_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x3F,
        name: "tcp_flags",
        pkt_cast_size: 1,
        pkt_offset: tcpOffset + 13,
        shift: 0,
        type: "write_mask_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_flags"
  };
}

export function buildOuterTcpReservedBitsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const initValue = rawTarget ? (rawTarget.bytes[tcpOffset + 12] ?? 0) & 0x0F : 0;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: 0x0F,
        min_value: 0,
        name: "tcp_reserved_bits",
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0F,
        name: "tcp_reserved_bits",
        pkt_cast_size: 1,
        pkt_offset: tcpOffset + 12,
        shift: 0,
        type: "write_mask_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_reserved_bits"
  };
}

export function buildOuterTcpFlagVaryVmBody(stream: ProfileWorkbenchStream, flag: TcpFlagTarget): AdvancedVmBody {
  const target = tcpFlagTargetFields[flag];
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const initValue = rawTarget
    ? ((rawTarget.bytes[tcpOffset + 13] ?? 0) & target.mask) === 0 ? 0 : 1
    : stream[target.key] ? 1 : 0;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: 1,
        min_value: 0,
        name: target.variableName,
        op: initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: target.mask,
        name: target.variableName,
        pkt_cast_size: 1,
        pkt_offset: tcpOffset + 13,
        shift: Math.log2(target.mask),
        type: "write_mask_flow_var"
      },
      rawTarget ? rawTcpChecksumInstruction(rawTarget) : outerTcpChecksumInstruction(stream)
    ],
    split_by_var: target.variableName
  };
}

export function buildOuterTcpChecksumIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTcpFixedHeaderTarget(stream);
  const tcpOffset = rawTarget?.offset ?? outerTcpOffset(stream);
  const checksumInit = Number.parseInt(stream.tcp_checksum, 16);
  const initValue = rawTarget
    ? rawPacketWord(rawTarget.bytes, tcpOffset + 16)
    : Number.isFinite(checksumInit)
      ? checksumInit
      : 0;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + stream.tcp_checksum_count - 1),
        min_value: initValue,
        name: "tcp_checksum",
        op: "inc",
        size: 2,
        step: stream.tcp_checksum_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_checksum",
        pkt_offset: tcpOffset + 16,
        type: "write_flow_var"
      }
    ],
    split_by_var: "tcp_checksum"
  };
}
