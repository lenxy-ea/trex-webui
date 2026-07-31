import type { ProfileWorkbenchStream } from "../../../api";
import {
  outerTcpChecksumInstruction,
  outerTcpOffset
} from "./packetLayoutModel";
import {
  rawTcpOptionValueTarget,
  type RawTcpOptionTargetName
} from "./rawPacketModel";
import type { AdvancedVmBody } from "./model";
import { buildAdvancedNumberWriteVmBody } from "./advancedVmNumberWriteModel";

export function rawTcpChecksumInstruction(target: { l3Length: number; l3Offset: number }) {
  return {
    l2_len: target.l3Offset,
    l3_len: target.l3Length,
    l4_type: 13,
    type: "fix_checksum_hw"
  };
}

function tcpOptionValueOffset(
  stream: ProfileWorkbenchStream,
  target: "mss" | "sack-left-edge" | "sack-right-edge" | "timestamp-value" | "timestamp-echo" | "window-scale"
) {
  let offset = 20;
  if (stream.tcp_option_mss_enabled) {
    if (target === "mss") {
      return offset + 2;
    }
    offset += 4;
  }
  if (stream.tcp_option_sack_permitted_enabled) {
    offset += 2;
  }
  if (stream.tcp_option_sack_blocks_enabled) {
    if (target === "sack-left-edge") {
      return offset + 2;
    }
    if (target === "sack-right-edge") {
      return offset + 6;
    }
    offset += 10;
  }
  if (stream.tcp_option_timestamp_enabled) {
    if (target === "timestamp-value") {
      return offset + 4;
    }
    if (target === "timestamp-echo") {
      return offset + 8;
    }
    offset += 12;
  }
  if (stream.tcp_option_window_scale_enabled && target === "window-scale") {
    return offset + 3;
  }
  return null;
}

export function buildOuterTcpOptionMssIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawTcpOptionValueTarget(stream, "mss");
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawTcpChecksumInstruction(rawTarget),
      count: 4,
      initValue: rawTarget.value,
      maxLimit: rawTarget.maxLimit,
      name: "tcp_option_mss",
      pktOffset: rawTarget.valueOffset,
      size: rawTarget.size,
      step: 1
    });
  }
  const tcpOffset = outerTcpOffset(stream);
  return {
    instructions: [
      {
        init_value: stream.tcp_option_mss,
        max_value: Math.min(65_535, stream.tcp_option_mss + stream.tcp_option_mss_count - 1),
        min_value: stream.tcp_option_mss,
        name: "tcp_option_mss",
        op: "inc",
        size: 2,
        step: stream.tcp_option_mss_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_mss",
        pkt_offset: tcpOffset + (tcpOptionValueOffset(stream, "mss") ?? 22),
        type: "write_flow_var"
      },
      outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_option_mss"
  };
}

export function buildOuterTcpOptionWindowScaleIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawTcpOptionValueTarget(stream, "window-scale");
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawTcpChecksumInstruction(rawTarget),
      count: 4,
      initValue: rawTarget.value,
      maxLimit: rawTarget.maxLimit,
      name: "tcp_option_window_scale",
      pktOffset: rawTarget.valueOffset,
      size: rawTarget.size,
      step: 1
    });
  }
  const tcpOffset = outerTcpOffset(stream);
  return {
    instructions: [
      {
        init_value: stream.tcp_option_window_scale,
        max_value: Math.min(255, stream.tcp_option_window_scale + stream.tcp_option_window_scale_count - 1),
        min_value: stream.tcp_option_window_scale,
        name: "tcp_option_window_scale",
        op: "inc",
        size: 1,
        step: stream.tcp_option_window_scale_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "tcp_option_window_scale",
        pkt_offset: tcpOffset + (tcpOptionValueOffset(stream, "window-scale") ?? 23),
        type: "write_flow_var"
      },
      outerTcpChecksumInstruction(stream)
    ],
    split_by_var: "tcp_option_window_scale"
  };
}

function buildOuterTcpOptionTimestampIncVmBody(stream: ProfileWorkbenchStream, field: "value" | "echo"): AdvancedVmBody {
  const rawTarget = rawTcpOptionValueTarget(stream, field === "value" ? "timestamp-value" : "timestamp-echo");
  const tcpOffset = outerTcpOffset(stream);
  const variableName = `tcp_option_timestamp_${field}`;
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawTcpChecksumInstruction(rawTarget),
      count: 4,
      initValue: rawTarget.value,
      maxLimit: rawTarget.maxLimit,
      name: variableName,
      pktOffset: rawTarget.valueOffset,
      size: rawTarget.size,
      step: 1
    });
  }
  const initValue = field === "value" ? stream.tcp_option_timestamp_value : stream.tcp_option_timestamp_echo;
  const count = field === "value" ? stream.tcp_option_timestamp_value_count : stream.tcp_option_timestamp_echo_count;
  const step = field === "value" ? stream.tcp_option_timestamp_value_step : stream.tcp_option_timestamp_echo_step;
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
        pkt_offset: tcpOffset + (tcpOptionValueOffset(stream, field === "value" ? "timestamp-value" : "timestamp-echo") ?? (field === "value" ? 24 : 28)),
        type: "write_flow_var"
      },
      outerTcpChecksumInstruction(stream)
    ],
    split_by_var: variableName
  };
}

export function buildOuterTcpOptionTimestampValueIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionTimestampIncVmBody(stream, "value");
}

export function buildOuterTcpOptionTimestampEchoIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionTimestampIncVmBody(stream, "echo");
}

function buildOuterTcpOptionSackIncVmBody(
  stream: ProfileWorkbenchStream,
  field: "left_edge" | "right_edge",
  blockIndex = 1
): AdvancedVmBody {
  let rawTargetName: RawTcpOptionTargetName = field === "left_edge" ? "sack-left-edge" : "sack-right-edge";
  if (blockIndex === 2) {
    rawTargetName = field === "left_edge" ? "sack2-left-edge" : "sack2-right-edge";
  } else if (blockIndex === 3) {
    rawTargetName = field === "left_edge" ? "sack3-left-edge" : "sack3-right-edge";
  } else if (blockIndex === 4) {
    rawTargetName = field === "left_edge" ? "sack4-left-edge" : "sack4-right-edge";
  }
  const rawTarget = rawTcpOptionValueTarget(stream, rawTargetName);
  const tcpOffset = outerTcpOffset(stream);
  const variableName = blockIndex > 1 ? `tcp_option_sack${blockIndex}_${field}` : `tcp_option_sack_${field}`;
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawTcpChecksumInstruction(rawTarget),
      count: 4,
      initValue: rawTarget.value,
      maxLimit: rawTarget.maxLimit,
      name: variableName,
      pktOffset: rawTarget.valueOffset,
      size: rawTarget.size,
      step: 1
    });
  }
  const initValue = field === "left_edge" ? stream.tcp_option_sack_left_edge : stream.tcp_option_sack_right_edge;
  const count = field === "left_edge" ? stream.tcp_option_sack_left_edge_count : stream.tcp_option_sack_right_edge_count;
  const step = field === "left_edge" ? stream.tcp_option_sack_left_edge_step : stream.tcp_option_sack_right_edge_step;
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
        pkt_offset: tcpOffset + (tcpOptionValueOffset(stream, field === "left_edge" ? "sack-left-edge" : "sack-right-edge") ?? (field === "left_edge" ? 28 : 32)),
        type: "write_flow_var"
      },
      outerTcpChecksumInstruction(stream)
    ],
    split_by_var: variableName
  };
}

export function buildOuterTcpOptionSackLeftIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "left_edge");
}

export function buildOuterTcpOptionSackRightIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "right_edge");
}

export function buildOuterTcpOptionSack2LeftIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "left_edge", 2);
}

export function buildOuterTcpOptionSack2RightIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "right_edge", 2);
}

export function buildOuterTcpOptionSack3LeftIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "left_edge", 3);
}

export function buildOuterTcpOptionSack3RightIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "right_edge", 3);
}

export function buildOuterTcpOptionSack4LeftIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "left_edge", 4);
}

export function buildOuterTcpOptionSack4RightIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterTcpOptionSackIncVmBody(stream, "right_edge", 4);
}
