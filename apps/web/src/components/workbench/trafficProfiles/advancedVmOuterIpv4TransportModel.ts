import type { ProfileWorkbenchStream } from "../../../api";
import type { AdvancedVmBody } from "./model";
import {
  outerIpv4Offset,
  outerL4Offset
} from "./packetLayoutModel";
import {
  formatPacketIpv4,
  rawOuterIpv4L4Target,
  rawOuterTransportTarget,
  rawPacketHasBytes,
  rawPacketTcpHeaderOffset,
  rawPacketWord
} from "./rawPacketModel";
import { largeUnitCountNumber } from "./scalarValueModel";
import { advancedNumberWriteInstructions, buildAdvancedNumberWriteVmBody } from "./advancedVmNumberWriteModel";
import {
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix
} from "./advancedVmValueModel";

export function buildOuterUdpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 17, 11, 8);
  const udpOffset = rawTarget?.offset ?? outerL4Offset(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? {
      l2_len: outerIpv4Offset(stream),
      l3_len: 20,
      l4_type: 11,
      type: "fix_checksum_hw"
    },
    count: stream.l4_src_port_count,
    initValue: rawTarget ? rawPacketWord(rawTarget.bytes, udpOffset) : stream.l4_src_port,
    maxLimit: 65_535,
    name: "udp_src",
    pktOffset: udpOffset,
    size: 2,
    step: stream.l4_src_port_step
  });
}

export function buildOuterUdpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 17, 11, 8);
  const udpOffset = rawTarget?.offset ?? outerL4Offset(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? {
      l2_len: outerIpv4Offset(stream),
      l3_len: 20,
      l4_type: 11,
      type: "fix_checksum_hw"
    },
    count: stream.l4_dst_port_count,
    initValue: rawTarget ? rawPacketWord(rawTarget.bytes, udpOffset + 2) : stream.l4_dst_port,
    maxLimit: 65_535,
    name: "udp_dst",
    pktOffset: udpOffset + 2,
    size: 2,
    step: stream.l4_dst_port_step
  });
}

export function buildOuterIpv4TransportFiveTupleVmBody(
  stream: ProfileWorkbenchStream,
  {
    dstPortName,
    l4Type,
    minHeaderLength,
    protocol,
    srcPortName
  }: {
    dstPortName: string;
    l4Type: 11 | 13;
    minHeaderLength: number;
    protocol: 6 | 17;
    srcPortName: string;
  }
): AdvancedVmBody {
  const rawCandidate = rawOuterIpv4L4Target(stream, protocol);
  const rawTarget = rawCandidate
    && rawPacketHasBytes(rawCandidate.bytes, rawCandidate.offset, minHeaderLength)
    && (protocol !== 6 || rawPacketTcpHeaderOffset(rawCandidate.bytes, rawCandidate.offset) !== null)
    ? rawCandidate
    : null;
  const ipv4Offset = rawTarget?.l3Offset ?? outerIpv4Offset(stream);
  const l4Offset = rawTarget?.offset ?? outerL4Offset(stream);
  const ipv4SrcCount = largeUnitCountNumber(stream.ipv4_src_count);
  const ipv4DstCount = largeUnitCountNumber(stream.ipv4_dst_count);
  const ipv4SrcSuffix = ipv4FieldEngineSuffix(
    rawTarget ? formatPacketIpv4(rawTarget.bytes, ipv4Offset + 12) : stream.ipv4_src,
    ipv4SrcCount
  );
  const ipv4DstSuffix = ipv4FieldEngineSuffix(
    rawTarget ? formatPacketIpv4(rawTarget.bytes, ipv4Offset + 16) : stream.ipv4_dst,
    ipv4DstCount
  );
  const checksumInstruction = rawTarget
    ? {
        l2_len: rawTarget.l3Offset,
        l3_len: rawTarget.l3Length,
        l4_type: l4Type,
        type: "fix_checksum_hw"
      }
    : {
        l2_len: ipv4Offset,
        l3_len: 20,
        l4_type: l4Type,
        type: "fix_checksum_hw"
      };
  return {
    instructions: [
      ...advancedNumberWriteInstructions({
        count: ipv4SrcCount,
        initValue: ipv4SrcSuffix.initValue,
        maxLimit: fieldEngineMaxForSize(ipv4SrcSuffix.size),
        name: "ipv4_src",
        pktOffset: ipv4Offset + 16 - ipv4SrcSuffix.size,
        size: ipv4SrcSuffix.size,
        step: stream.ipv4_src_step
      }),
      ...advancedNumberWriteInstructions({
        count: ipv4DstCount,
        initValue: ipv4DstSuffix.initValue,
        maxLimit: fieldEngineMaxForSize(ipv4DstSuffix.size),
        name: "ipv4_dst",
        pktOffset: ipv4Offset + 20 - ipv4DstSuffix.size,
        size: ipv4DstSuffix.size,
        step: stream.ipv4_dst_step
      }),
      ...advancedNumberWriteInstructions({
        count: stream.l4_src_port_count,
        initValue: rawTarget ? rawPacketWord(rawTarget.bytes, l4Offset) : stream.l4_src_port,
        maxLimit: 65_535,
        name: srcPortName,
        pktOffset: l4Offset,
        size: 2,
        step: stream.l4_src_port_step
      }),
      ...advancedNumberWriteInstructions({
        count: stream.l4_dst_port_count,
        initValue: rawTarget ? rawPacketWord(rawTarget.bytes, l4Offset + 2) : stream.l4_dst_port,
        maxLimit: 65_535,
        name: dstPortName,
        pktOffset: l4Offset + 2,
        size: 2,
        step: stream.l4_dst_port_step
      }),
      checksumInstruction
    ],
    split_by_var: "ipv4_src"
  };
}

export function buildOuterUdpFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4TransportFiveTupleVmBody(stream, {
    dstPortName: "udp_dst",
    l4Type: 11,
    minHeaderLength: 8,
    protocol: 17,
    srcPortName: "udp_src"
  });
}

export function buildOuterTcpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 6, 13, 20);
  const tcpOffset = rawTarget?.offset ?? outerL4Offset(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? {
      l2_len: outerIpv4Offset(stream),
      l3_len: 20,
      l4_type: 13,
      type: "fix_checksum_hw"
    },
    count: stream.l4_src_port_count,
    initValue: rawTarget ? rawPacketWord(rawTarget.bytes, tcpOffset) : stream.l4_src_port,
    maxLimit: 65_535,
    name: "tcp_src",
    pktOffset: tcpOffset,
    size: 2,
    step: stream.l4_src_port_step
  });
}

export function buildOuterTcpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 6, 13, 20);
  const tcpOffset = rawTarget?.offset ?? outerL4Offset(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? {
      l2_len: outerIpv4Offset(stream),
      l3_len: 20,
      l4_type: 13,
      type: "fix_checksum_hw"
    },
    count: stream.l4_dst_port_count,
    initValue: rawTarget ? rawPacketWord(rawTarget.bytes, tcpOffset + 2) : stream.l4_dst_port,
    maxLimit: 65_535,
    name: "tcp_dst",
    pktOffset: tcpOffset + 2,
    size: 2,
    step: stream.l4_dst_port_step
  });
}

export function buildOuterTcpFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4TransportFiveTupleVmBody(stream, {
    dstPortName: "tcp_dst",
    l4Type: 13,
    minHeaderLength: 20,
    protocol: 6,
    srcPortName: "tcp_src"
  });
}
