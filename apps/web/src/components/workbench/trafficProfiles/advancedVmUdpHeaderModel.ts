import type { ProfileWorkbenchStream } from "../../../api";
import type { AdvancedVmBody } from "./model";
import {
  outerIpv4Offset,
  outerIpv6ChecksumInstruction,
  outerIpv6L4Offset,
  outerL4Offset
} from "./packetLayoutModel";
import {
  rawOuterTransportTarget,
  rawPacketWord
} from "./rawPacketModel";

function buildOuterUdpLengthIncVmBody(stream: ProfileWorkbenchStream, ipVersion: "IPv4" | "IPv6"): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 17, 11, 8);
  const udpOffset = rawTarget?.offset ?? (ipVersion === "IPv6" ? outerIpv6L4Offset(stream) : outerL4Offset(stream));
  const checksumInstruction =
    rawTarget?.checksumInstruction
    ?? (ipVersion === "IPv6"
      ? outerIpv6ChecksumInstruction(stream, 11)
      : {
          l2_len: outerIpv4Offset(stream),
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        });
  const initValue = rawTarget ? rawPacketWord(rawTarget.bytes, udpOffset + 4) : stream.udp_length;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + stream.udp_length_count - 1),
        min_value: initValue,
        name: "udp_length",
        op: "inc",
        size: 2,
        step: stream.udp_length_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "udp_length",
        pkt_offset: udpOffset + 4,
        type: "write_flow_var"
      },
      checksumInstruction
    ],
    split_by_var: "udp_length"
  };
}

function buildOuterUdpChecksumIncVmBody(stream: ProfileWorkbenchStream, ipVersion: "IPv4" | "IPv6"): AdvancedVmBody {
  const rawTarget = rawOuterTransportTarget(stream, 17, 11, 8);
  const udpOffset = rawTarget?.offset ?? (ipVersion === "IPv6" ? outerIpv6L4Offset(stream) : outerL4Offset(stream));
  const checksumInit = Number.parseInt(stream.udp_checksum, 16);
  const initValue = rawTarget
    ? rawPacketWord(rawTarget.bytes, udpOffset + 6)
    : Number.isFinite(checksumInit) ? checksumInit : 0;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(65_535, initValue + stream.udp_checksum_count - 1),
        min_value: initValue,
        name: "udp_checksum",
        op: "inc",
        size: 2,
        step: stream.udp_checksum_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "udp_checksum",
        pkt_offset: udpOffset + 6,
        type: "write_flow_var"
      }
    ],
    split_by_var: "udp_checksum"
  };
}

export function buildOuterIpv4UdpLengthIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterUdpLengthIncVmBody(stream, "IPv4");
}

export function buildOuterIpv4UdpChecksumIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterUdpChecksumIncVmBody(stream, "IPv4");
}

export function buildOuterIpv6UdpLengthIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterUdpLengthIncVmBody(stream, "IPv6");
}

export function buildOuterIpv6UdpChecksumIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterUdpChecksumIncVmBody(stream, "IPv6");
}
