import type { ProfileWorkbenchStream } from "../../../api";
import {
  outerIpv6ChecksumInstruction,
  outerIpv6L4Offset,
  outerIpv6Offset
} from "./packetLayoutModel";
import {
  formatPacketIpv6,
  rawOuterIpv6L4Target,
  rawOuterIpv6Target,
  rawOuterIpv6TransportTarget,
  rawOuterTransportTarget,
  rawPacketNumberValue,
  rawPacketTcpHeaderOffset,
  rawPacketWord
} from "./rawPacketModel";
import {
  advancedVmDefaultBody,
  type AdvancedVmBody
} from "./model";
import { largeUnitCountNumber } from "./scalarValueModel";
import { buildAdvancedNumberWriteVmBody } from "./advancedVmNumberWriteModel";
import {
  buildIpv6AddressIncVmBody,
  ipv6AddressFlowVarInstructions,
  ipv6FieldEngineSuffix,
  isSafeIpv6AddressVmTarget
} from "./advancedVmIpv6AddressModel";

export function isAdvancedOuterIpv6Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && (stream.packet_type.startsWith("Ethernet/IPv6") || rawOuterIpv6Target(stream)));
}

export function isAdvancedOuterIpv6SrcVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv6Target(stream);
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(
      formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 8),
      largeUnitCountNumber(stream.ipv6_src_count)
    ) !== null;
  }
  return Boolean(isAdvancedOuterIpv6Stream(stream) && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_src, stream?.ipv6_src_count));
}

export function isAdvancedOuterIpv6DstVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv6Target(stream);
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(
      formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 24),
      largeUnitCountNumber(stream.ipv6_dst_count)
    ) !== null;
  }
  return Boolean(isAdvancedOuterIpv6Stream(stream) && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_dst, stream?.ipv6_dst_count));
}

export function isAdvancedOuterIpv6UdpStream(stream: ProfileWorkbenchStream | null | undefined) {
  if (!stream) {
    return false;
  }
  if (stream.packet_binary_base64) {
    return Boolean(rawOuterIpv6L4Target(stream, 17));
  }
  return stream.packet_type === "Ethernet/IPv6/UDP";
}

export function isAdvancedOuterIpv6TcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv6L4Target(stream, 6);
  if (!stream) {
    return false;
  }
  if (stream.packet_binary_base64) {
    return Boolean(rawTarget && rawPacketTcpHeaderOffset(rawTarget.bytes, rawTarget.offset) !== null);
  }
  return Boolean(
    stream.packet_type === "Ethernet/IPv6/TCP"
      || (rawTarget && rawPacketTcpHeaderOffset(rawTarget.bytes, rawTarget.offset) !== null)
  );
}

export function isAdvancedOuterIpv6UdpFiveTupleStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv6TransportTarget(stream, 11);
  if (stream && rawTarget) {
    return (
      ipv6FieldEngineSuffix(formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 8), largeUnitCountNumber(stream.ipv6_src_count)) !== null
      && ipv6FieldEngineSuffix(formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 24), largeUnitCountNumber(stream.ipv6_dst_count)) !== null
    );
  }
  return Boolean(
    isAdvancedOuterIpv6UdpStream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_src, stream?.ipv6_src_count)
      && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_dst, stream?.ipv6_dst_count)
  );
}

export function isAdvancedOuterIpv6TcpFiveTupleStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv6TransportTarget(stream, 13);
  if (stream && rawTarget) {
    return (
      ipv6FieldEngineSuffix(formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 8), largeUnitCountNumber(stream.ipv6_src_count)) !== null
      && ipv6FieldEngineSuffix(formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 24), largeUnitCountNumber(stream.ipv6_dst_count)) !== null
    );
  }
  return Boolean(
    isAdvancedOuterIpv6TcpStream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_src, stream?.ipv6_src_count)
      && isSafeIpv6AddressVmTarget(stream, stream?.ipv6_dst, stream?.ipv6_dst_count)
  );
}

function rawOuterIpv6ChecksumRepairInstruction(stream: ProfileWorkbenchStream | null | undefined) {
  const udpTarget = rawOuterIpv6L4Target(stream, 17);
  if (udpTarget) {
    return {
      l2_len: udpTarget.l3Offset,
      l3_len: 40,
      l4_type: 11,
      type: "fix_checksum_hw"
    };
  }
  const tcpTarget = rawOuterIpv6L4Target(stream, 6);
  if (tcpTarget) {
    return {
      l2_len: tcpTarget.l3Offset,
      l3_len: 40,
      l4_type: 13,
      type: "fix_checksum_hw"
    };
  }
  const icmpv6Target = rawOuterIpv6L4Target(stream, 58);
  if (icmpv6Target) {
    return {
      l2_len: icmpv6Target.l3Offset,
      l3_len: 40,
      type: "fix_checksum_icmpv6"
    };
  }
  return null;
}

function buildOuterIpv6AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const variableName = field === "dst" ? "ipv6_dest" : "ipv6_src";
  const address = field === "dst" ? stream.ipv6_dst : stream.ipv6_src;
  const count = field === "dst" ? stream.ipv6_dst_count : stream.ipv6_src_count;
  const step = field === "dst" ? stream.ipv6_dst_step : stream.ipv6_src_step;
  const rawTarget = rawOuterIpv6Target(stream);
  if (rawTarget) {
    return buildIpv6AddressIncVmBody({
      address: formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + (field === "dst" ? 24 : 8)),
      baseOffset: rawTarget.l3Offset + (field === "dst" ? 24 : 8),
      checksumInstruction: rawOuterIpv6ChecksumRepairInstruction(stream) ?? undefined,
      count,
      name: variableName,
      step
    });
  }
  const ipv6Offset = outerIpv6Offset(stream);
  return buildIpv6AddressIncVmBody({
    address,
    baseOffset: ipv6Offset + (field === "dst" ? 24 : 8),
    count,
    name: variableName,
    step
  });
}

export function buildOuterIpv6SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6AddressIncVmBody(stream, "src");
}

export function buildOuterIpv6DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6AddressIncVmBody(stream, "dst");
}

function buildOuterIpv6L4PortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst", l4Type: 11 | 13): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, l4Type === 11 ? 17 : 6, l4Type, l4Type === 11 ? 8 : 20);
  const l4Offset = rawTarget?.offset ?? outerIpv6L4Offset(stream);
  const variableName = field === "dst" ? "l4_dest_port" : "l4_src_port";
  const port = field === "dst" ? stream.l4_dst_port : stream.l4_src_port;
  const count = field === "dst" ? stream.l4_dst_port_count : stream.l4_src_port_count;
  const step = field === "dst" ? stream.l4_dst_port_step : stream.l4_src_port_step;
  const initValue = rawTarget ? rawPacketWord(rawTarget.bytes, l4Offset + (field === "dst" ? 2 : 0)) : port;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + count - 1),
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
        name: variableName,
        pkt_offset: l4Offset + (field === "dst" ? 2 : 0),
        type: "write_flow_var"
      },
      rawTarget?.checksumInstruction ?? outerIpv6ChecksumInstruction(stream, l4Type)
    ],
    split_by_var: variableName
  };
}

export function buildOuterIpv6UdpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6L4PortIncVmBody(stream, "src", 11);
}

export function buildOuterIpv6UdpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6L4PortIncVmBody(stream, "dst", 11);
}

export function buildOuterIpv6TcpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6L4PortIncVmBody(stream, "src", 13);
}

export function buildOuterIpv6TcpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6L4PortIncVmBody(stream, "dst", 13);
}

function buildOuterIpv6TransportFiveTupleVmBody(stream: ProfileWorkbenchStream, l4Type: 11 | 13): AdvancedVmBody {
  const rawTarget = rawOuterIpv6TransportTarget(stream, l4Type);
  const ipv6Offset = rawTarget?.l3Offset ?? outerIpv6Offset(stream);
  const l4Offset = rawTarget?.offset ?? outerIpv6L4Offset(stream);
  const srcInstructions = ipv6AddressFlowVarInstructions({
    address: rawTarget ? formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 8) : stream.ipv6_src,
    baseOffset: ipv6Offset + 8,
    count: stream.ipv6_src_count,
    name: "ipv6_src",
    step: stream.ipv6_src_step
  });
  const dstInstructions = ipv6AddressFlowVarInstructions({
    address: rawTarget ? formatPacketIpv6(rawTarget.bytes, rawTarget.l3Offset + 24) : stream.ipv6_dst,
    baseOffset: ipv6Offset + 24,
    count: stream.ipv6_dst_count,
    name: "ipv6_dest",
    step: stream.ipv6_dst_step
  });
  if (!srcInstructions || !dstInstructions) {
    return advancedVmDefaultBody;
  }
  const srcPortInitValue = rawTarget ? rawPacketWord(rawTarget.bytes, l4Offset) : stream.l4_src_port;
  const dstPortInitValue = rawTarget ? rawPacketWord(rawTarget.bytes, l4Offset + 2) : stream.l4_dst_port;
  return {
    instructions: [
      ...srcInstructions,
      ...dstInstructions,
      {
        init_value: srcPortInitValue,
        max_value: Math.min(65_535, srcPortInitValue + stream.l4_src_port_count - 1),
        min_value: srcPortInitValue,
        name: "l4_src_port",
        op: "inc",
        size: 2,
        step: stream.l4_src_port_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "l4_src_port",
        pkt_offset: l4Offset,
        type: "write_flow_var"
      },
      {
        init_value: dstPortInitValue,
        max_value: Math.min(65_535, dstPortInitValue + stream.l4_dst_port_count - 1),
        min_value: dstPortInitValue,
        name: "l4_dest_port",
        op: "inc",
        size: 2,
        step: stream.l4_dst_port_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "l4_dest_port",
        pkt_offset: l4Offset + 2,
        type: "write_flow_var"
      },
      rawTarget?.checksumInstruction ?? outerIpv6ChecksumInstruction(stream, l4Type)
    ],
    split_by_var: "ipv6_src"
  };
}

export function buildOuterIpv6UdpFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6TransportFiveTupleVmBody(stream, 11);
}

export function buildOuterIpv6TcpFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv6TransportFiveTupleVmBody(stream, 13);
}

export function buildOuterIpv6TrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv6Target(stream);
  const ipv6Offset = rawTarget?.l3Offset ?? outerIpv6Offset(stream);
  const initValue = rawTarget
    ? ((((rawTarget.bytes[ipv6Offset] ?? 0) & 0x0f) << 4) | (((rawTarget.bytes[ipv6Offset + 1] ?? 0) & 0xf0) >>> 4))
    : stream.ipv6_traffic_class;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(255, initValue + stream.ipv6_traffic_class_count - 1),
        min_value: initValue,
        name: "ipv6_traffic_class",
        op: "inc",
        size: 1,
        step: stream.ipv6_traffic_class_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0FF00000,
        name: "ipv6_traffic_class",
        pkt_cast_size: 4,
        pkt_offset: ipv6Offset,
        shift: 20,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "ipv6_traffic_class"
  };
}

export function buildOuterIpv6FlowLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv6Target(stream);
  const ipv6Offset = rawTarget?.l3Offset ?? outerIpv6Offset(stream);
  const initValue = rawTarget
    ? rawPacketNumberValue(rawTarget.bytes, ipv6Offset, 4) & 0x000fffff
    : stream.ipv6_flow_label;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(1_048_575, initValue + stream.ipv6_flow_label_count - 1),
        min_value: initValue,
        name: "ipv6_flow_label",
        op: "inc",
        size: 4,
        step: stream.ipv6_flow_label_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x000FFFFF,
        name: "ipv6_flow_label",
        pkt_cast_size: 4,
        pkt_offset: ipv6Offset,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "ipv6_flow_label"
  };
}

export function buildOuterIpv6HopLimitIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv6Target(stream);
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      count: stream.ipv6_hop_limit_count,
      initValue: rawTarget.bytes[rawTarget.l3Offset + 7] ?? 0,
      maxLimit: 255,
      name: "ipv6_hop_limit",
      pktOffset: rawTarget.l3Offset + 7,
      size: 1,
      step: stream.ipv6_hop_limit_step
    });
  }
  const ipv6Offset = outerIpv6Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv6_hop_limit,
        max_value: Math.min(255, stream.ipv6_hop_limit + stream.ipv6_hop_limit_count - 1),
        min_value: stream.ipv6_hop_limit,
        name: "ipv6_hop_limit",
        op: "inc",
        size: 1,
        step: stream.ipv6_hop_limit_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "ipv6_hop_limit",
        pkt_offset: ipv6Offset + 7,
        type: "write_flow_var"
      }
    ],
    split_by_var: "ipv6_hop_limit"
  };
}
