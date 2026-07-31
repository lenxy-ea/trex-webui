import type { ProfileWorkbenchStream } from "../../../api";
import {
  frameLengthOperation,
  workbenchMplsLabelCount,
  workbenchVlanHeaderLength,
  type AdvancedVmBody
} from "./model";
import { hasIpLayer } from "./protocolSelectionModel";

export function workbenchOuterL2HeaderLength(stream: ProfileWorkbenchStream) {
  return 14 + workbenchVlanHeaderLength(stream) + (workbenchMplsLabelCount(stream) * 4);
}

export function outerMplsOffset(stream: ProfileWorkbenchStream) {
  return 14 + workbenchVlanHeaderLength(stream);
}

export function outerIpv4Offset(stream: ProfileWorkbenchStream) {
  return workbenchOuterL2HeaderLength(stream);
}

export function outerL4Offset(stream: ProfileWorkbenchStream) {
  return outerIpv4Offset(stream) + 20;
}

export function outerIpv6Offset(stream: ProfileWorkbenchStream) {
  return workbenchOuterL2HeaderLength(stream);
}

export function outerIpv6L4Offset(stream: ProfileWorkbenchStream) {
  return outerIpv6Offset(stream) + 40;
}

export function outerIcmpv6Offset(stream: ProfileWorkbenchStream) {
  return outerIpv6Offset(stream) + 40;
}

export function outerSctpOffset(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/SCTP" ? outerIpv6L4Offset(stream) : outerL4Offset(stream);
}

export function outerUdpPayloadOffset(stream: ProfileWorkbenchStream) {
  return (stream.packet_type.startsWith("Ethernet/IPv6") ? outerIpv6L4Offset(stream) : outerL4Offset(stream)) + 8;
}

export function outerIpv6ChecksumInstruction(stream: ProfileWorkbenchStream, l4Type: 11 | 13) {
  return {
    l2_len: outerIpv6Offset(stream),
    l3_len: 40,
    l4_type: l4Type,
    type: "fix_checksum_hw"
  };
}

export function outerUdpChecksumInstruction(stream: ProfileWorkbenchStream) {
  return stream.packet_type.startsWith("Ethernet/IPv6")
    ? outerIpv6ChecksumInstruction(stream, 11)
    : {
        l2_len: outerIpv4Offset(stream),
        l3_len: 20,
        l4_type: 11,
        type: "fix_checksum_hw"
      };
}

export function outerTcpOffset(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/TCP" ? outerIpv6L4Offset(stream) : outerL4Offset(stream);
}

export function outerTcpChecksumInstruction(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/TCP"
    ? outerIpv6ChecksumInstruction(stream, 13)
    : {
        l2_len: outerIpv4Offset(stream),
        l3_len: 20,
        l4_type: 13,
        type: "fix_checksum_hw"
      };
}

export function outerIpv4ChecksumL4Type(stream: ProfileWorkbenchStream) {
  if (stream.packet_type === "Ethernet/IPv4/UDP") {
    return 11;
  }
  if (stream.packet_type === "Ethernet/IPv4/TCP") {
    return 13;
  }
  return 17;
}

export function outerIpv4ChecksumRepairInstruction(stream: ProfileWorkbenchStream) {
  if (stream.packet_type === "Ethernet/IPv4/UDP" || stream.packet_type === "Ethernet/IPv4/TCP") {
    return {
      l2_len: outerIpv4Offset(stream),
      l3_len: 20,
      l4_type: outerIpv4ChecksumL4Type(stream),
      type: "fix_checksum_hw"
    };
  }
  return {
    pkt_offset: outerIpv4Offset(stream),
    type: "fix_checksum_ipv4"
  };
}

export function packetLengthChecksumInstruction(stream: ProfileWorkbenchStream): Record<string, unknown> | null {
  if (!hasIpLayer(stream.packet_type)) {
    return null;
  }
  if (
    stream.packet_type === "Ethernet/IPv4"
    || stream.packet_type === "Ethernet/IPv4/ICMP"
    || stream.packet_type === "Ethernet/IPv4/GRE"
    || stream.packet_type === "Ethernet/IPv4/SCTP"
  ) {
    return {
      pkt_offset: outerIpv4Offset(stream),
      type: "fix_checksum_ipv4"
    };
  }
  if (stream.packet_type === "Ethernet/IPv6/ICMPv6") {
    return {
      l2_len: outerIpv6Offset(stream),
      l3_len: 40,
      type: "fix_checksum_icmpv6"
    };
  }
  if (stream.packet_type === "Ethernet/IPv6/UDP") {
    return outerIpv6ChecksumInstruction(stream, 11);
  }
  if (stream.packet_type === "Ethernet/IPv6/TCP") {
    return outerIpv6ChecksumInstruction(stream, 13);
  }
  if (stream.packet_type === "Ethernet/IPv4/UDP" || stream.packet_type === "Ethernet/IPv4/TCP") {
    return outerIpv4ChecksumRepairInstruction(stream);
  }
  return null;
}

export function buildPacketLengthVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const operation = frameLengthOperation(stream.frame_length_type);
  const minFrameLength = Number.isFinite(stream.frame_length_min) ? stream.frame_length_min : 64;
  const maxFrameLength = Number.isFinite(stream.frame_length_max) ? stream.frame_length_max : Math.max(minFrameLength, 1518);
  const l2Length = workbenchOuterL2HeaderLength(stream);
  const instructions: Array<Record<string, unknown>> = [
    {
      init_value: minFrameLength - 4,
      max_value: maxFrameLength - 4,
      min_value: minFrameLength - 4,
      name: "pkt_len",
      op: operation === "Fixed" ? "inc" : operation,
      size: 2,
      step: 1,
      type: "flow_var"
    },
    {
      name: "pkt_len",
      type: "trim_pkt_size"
    }
  ];

  if (hasIpLayer(stream.packet_type)) {
    const isIpv6 = stream.packet_type.startsWith("Ethernet/IPv6");
    const ipOffset = isIpv6 ? outerIpv6Offset(stream) : outerIpv4Offset(stream);
    const l3HeaderLength = isIpv6 ? 40 : 20;
    instructions.push({
      add_value: isIpv6 ? -(l2Length + l3HeaderLength) : -l2Length,
      is_big_endian: true,
      name: "pkt_len",
      pkt_offset: ipOffset + (isIpv6 ? 4 : 2),
      type: "write_flow_var"
    });
    if (stream.packet_type.endsWith("/UDP")) {
      instructions.push({
        add_value: -(l2Length + l3HeaderLength),
        is_big_endian: true,
        name: "pkt_len",
        pkt_offset: ipOffset + l3HeaderLength + 4,
        type: "write_flow_var"
      });
    }
    const checksumInstruction = packetLengthChecksumInstruction(stream);
    if (checksumInstruction) {
      instructions.push(checksumInstruction);
    }
  }

  return {
    instructions,
    split_by_var: "pkt_len"
  };
}
