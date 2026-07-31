import type { ProfileWorkbenchStream } from "../../../api";
import {
  outerIpv4ChecksumRepairInstruction,
  outerIpv4Offset
} from "./packetLayoutModel";
import {
  formatPacketIpv4,
  rawOuterIpv4L4Target,
  rawOuterIpv4Target,
  rawPacketTcpHeaderOffset,
  rawPacketWord
} from "./rawPacketModel";
import type { AdvancedVmBody } from "./model";
import { largeUnitCountNumber } from "./scalarValueModel";
import { buildAdvancedNumberWriteVmBody } from "./advancedVmNumberWriteModel";
import {
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix
} from "./advancedVmValueModel";

export function isAdvancedOuterIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && (
        rawOuterIpv4Target(stream)
        || (
          stream.packet_type.startsWith("Ethernet/IPv4")
          && !stream.vxlan_enabled
          && !stream.gtpu_enabled
        )
      )
  );
}

export function isAdvancedOuterIpv4UdpStream(stream: ProfileWorkbenchStream | null | undefined) {
  if (!stream) {
    return false;
  }
  if (stream.packet_binary_base64) {
    return Boolean(rawOuterIpv4L4Target(stream, 17));
  }
  return Boolean(
    stream.packet_type === "Ethernet/IPv4/UDP"
      && !stream.vxlan_enabled
      && !stream.gtpu_enabled
  );
}

export function isAdvancedOuterIpv4TcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterIpv4L4Target(stream, 6);
  if (!stream) {
    return false;
  }
  if (stream.packet_binary_base64) {
    return Boolean(rawTarget && rawPacketTcpHeaderOffset(rawTarget.bytes, rawTarget.offset) !== null);
  }
  return Boolean(
    stream.packet_type === "Ethernet/IPv4/TCP"
      && !stream.vxlan_enabled
      && !stream.gtpu_enabled
  );
}

export function rawIpv4ChecksumRepairInstruction(target: NonNullable<ReturnType<typeof rawOuterIpv4Target>>) {
  if (target.protocol === 17 || target.protocol === 6) {
    return {
      l2_len: target.l3Offset,
      l3_len: target.l3Length,
      l4_type: target.protocol === 17 ? 11 : 13,
      type: "fix_checksum_hw"
    };
  }
  return {
    pkt_offset: target.l3Offset,
    type: "fix_checksum_ipv4"
  };
}

function buildOuterIpv4AddressVmBody(
  stream: ProfileWorkbenchStream,
  field: "src" | "dst",
  operation: "inc" | "random"
): AdvancedVmBody {
  const count = largeUnitCountNumber(field === "src" ? stream.ipv4_src_count : stream.ipv4_dst_count);
  const step = field === "src" ? stream.ipv4_src_step : stream.ipv4_dst_step;
  const variableName = field === "src" ? "ipv4_src" : "ipv4_dst";
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    const baseOffset = rawTarget.l3Offset + (field === "dst" ? 16 : 12);
    const suffix = ipv4FieldEngineSuffix(formatPacketIpv4(rawTarget.bytes, baseOffset), count);
    const maxLimit = fieldEngineMaxForSize(suffix.size);
    const maxValue = operation === "random" ? maxLimit : Math.min(maxLimit, suffix.initValue + count - 1);
    return {
      instructions: [
        {
          init_value: suffix.initValue,
          max_value: maxValue,
          min_value: operation === "random" ? 0 : suffix.initValue,
          name: variableName,
          op: operation,
          size: suffix.size,
          step,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: variableName,
          pkt_offset: baseOffset + 4 - suffix.size,
          type: "write_flow_var"
        },
        rawIpv4ChecksumRepairInstruction(rawTarget)
      ],
      split_by_var: variableName
    };
  }
  const address = field === "src" ? stream.ipv4_src : stream.ipv4_dst;
  const suffix = ipv4FieldEngineSuffix(address, count);
  const maxValue = Math.min(fieldEngineMaxForSize(suffix.size), suffix.initValue + count - 1);
  const baseOffset = outerIpv4Offset(stream) + (field === "dst" ? 16 : 12);
  return {
    instructions: [
      {
        init_value: suffix.initValue,
        max_value: maxValue,
        min_value: suffix.initValue,
        name: variableName,
        op: operation,
        size: suffix.size,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: variableName,
        pkt_offset: baseOffset + 4 - suffix.size,
        type: "write_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: variableName
  };
}

export function buildOuterIpv4SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4AddressVmBody(stream, "src", "inc");
}

export function buildOuterIpv4SrcRandomVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4AddressVmBody(stream, "src", "random");
}

export function buildOuterIpv4DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4AddressVmBody(stream, "dst", "inc");
}

export function buildOuterIpv4DstRandomVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4AddressVmBody(stream, "dst", "random");
}

export function buildOuterIpv4IdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawIpv4ChecksumRepairInstruction(rawTarget),
      count: stream.ipv4_id_count,
      initValue: rawPacketWord(rawTarget.bytes, rawTarget.l3Offset + 4),
      maxLimit: 65_535,
      name: "ip_id",
      pktOffset: rawTarget.l3Offset + 4,
      size: 2,
      step: stream.ipv4_id_step
    });
  }
  const ipv4Offset = outerIpv4Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv4_id,
        max_value: Math.min(65_535, stream.ipv4_id + stream.ipv4_id_count - 1),
        min_value: stream.ipv4_id,
        name: "ip_id",
        op: "inc",
        size: 2,
        step: stream.ipv4_id_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "ip_id",
        pkt_offset: ipv4Offset + 4,
        type: "write_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: "ip_id"
  };
}

export function buildOuterIpv4DscpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    const initValue = ((rawTarget.bytes[rawTarget.l3Offset + 1] ?? 0) & 0xfc) >>> 2;
    return {
      instructions: [
        {
          init_value: initValue,
          max_value: Math.min(63, initValue + stream.ipv4_dscp_count - 1),
          min_value: initValue,
          name: "ip_dscp",
          op: "inc",
          size: 1,
          step: stream.ipv4_dscp_step,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xFC,
          name: "ip_dscp",
          pkt_cast_size: 1,
          pkt_offset: rawTarget.l3Offset + 1,
          shift: 2,
          type: "write_mask_flow_var"
        },
        rawIpv4ChecksumRepairInstruction(rawTarget)
      ],
      split_by_var: "ip_dscp"
    };
  }
  const ipv4Offset = outerIpv4Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv4_dscp,
        max_value: Math.min(63, stream.ipv4_dscp + stream.ipv4_dscp_count - 1),
        min_value: stream.ipv4_dscp,
        name: "ip_dscp",
        op: "inc",
        size: 1,
        step: stream.ipv4_dscp_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xFC,
        name: "ip_dscp",
        pkt_cast_size: 1,
        pkt_offset: ipv4Offset + 1,
        shift: 2,
        type: "write_mask_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: "ip_dscp"
  };
}

export function buildOuterIpv4EcnIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    const initValue = (rawTarget.bytes[rawTarget.l3Offset + 1] ?? 0) & 0x03;
    return {
      instructions: [
        {
          init_value: initValue,
          max_value: Math.min(3, initValue + stream.ipv4_ecn_count - 1),
          min_value: initValue,
          name: "ip_ecn",
          op: "inc",
          size: 1,
          step: stream.ipv4_ecn_step,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x03,
          name: "ip_ecn",
          pkt_cast_size: 1,
          pkt_offset: rawTarget.l3Offset + 1,
          shift: 0,
          type: "write_mask_flow_var"
        },
        rawIpv4ChecksumRepairInstruction(rawTarget)
      ],
      split_by_var: "ip_ecn"
    };
  }
  const ipv4Offset = outerIpv4Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv4_ecn,
        max_value: Math.min(3, stream.ipv4_ecn + stream.ipv4_ecn_count - 1),
        min_value: stream.ipv4_ecn,
        name: "ip_ecn",
        op: "inc",
        size: 1,
        step: stream.ipv4_ecn_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x03,
        name: "ip_ecn",
        pkt_cast_size: 1,
        pkt_offset: ipv4Offset + 1,
        shift: 0,
        type: "write_mask_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: "ip_ecn"
  };
}

export function buildOuterIpv4FragmentOffsetIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    const initValue = rawPacketWord(rawTarget.bytes, rawTarget.l3Offset + 6) & 0x1fff;
    return {
      instructions: [
        {
          init_value: initValue,
          max_value: Math.min(8191, initValue + stream.ipv4_fragment_offset_count - 1),
          min_value: initValue,
          name: "ip_fragment_offset",
          op: "inc",
          size: 2,
          step: stream.ipv4_fragment_offset_step,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x1FFF,
          name: "ip_fragment_offset",
          pkt_cast_size: 2,
          pkt_offset: rawTarget.l3Offset + 6,
          shift: 0,
          type: "write_mask_flow_var"
        },
        rawIpv4ChecksumRepairInstruction(rawTarget)
      ],
      split_by_var: "ip_fragment_offset"
    };
  }
  const ipv4Offset = outerIpv4Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv4_fragment_offset,
        max_value: Math.min(8191, stream.ipv4_fragment_offset + stream.ipv4_fragment_offset_count - 1),
        min_value: stream.ipv4_fragment_offset,
        name: "ip_fragment_offset",
        op: "inc",
        size: 2,
        step: stream.ipv4_fragment_offset_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1FFF,
        name: "ip_fragment_offset",
        pkt_cast_size: 2,
        pkt_offset: ipv4Offset + 6,
        shift: 0,
        type: "write_mask_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: "ip_fragment_offset"
  };
}

function buildOuterIpv4FlagVaryVmBody(
  stream: ProfileWorkbenchStream,
  target: "reserved" | "df" | "mf"
): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  const flag = {
    df: { initValue: stream.ipv4_flag_df ? 1 : 0, mask: 0x4000, shift: 14, variableName: "ip_df" },
    mf: { initValue: stream.ipv4_flag_mf ? 1 : 0, mask: 0x2000, shift: 13, variableName: "ip_mf" },
    reserved: { initValue: 0, mask: 0x8000, shift: 15, variableName: "ip_reserved" }
  }[target];
  const rawWord = rawTarget ? rawPacketWord(rawTarget.bytes, rawTarget.l3Offset + 6) : null;
  const initValue = rawWord === null ? flag.initValue : (rawWord & flag.mask) >>> flag.shift;
  const ipv4Offset = rawTarget ? rawTarget.l3Offset : outerIpv4Offset(stream);
  const checksumInstruction = rawTarget ? rawIpv4ChecksumRepairInstruction(rawTarget) : outerIpv4ChecksumRepairInstruction(stream);

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
        pkt_offset: ipv4Offset + 6,
        shift: flag.shift,
        type: "write_mask_flow_var"
      },
      checksumInstruction
    ],
    split_by_var: flag.variableName
  };
}

export function buildOuterIpv4ReservedFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4FlagVaryVmBody(stream, "reserved");
}

export function buildOuterIpv4DfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4FlagVaryVmBody(stream, "df");
}

export function buildOuterIpv4MfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterIpv4FlagVaryVmBody(stream, "mf");
}

export function buildOuterIpv4TtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterIpv4Target(stream);
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawIpv4ChecksumRepairInstruction(rawTarget),
      count: stream.ipv4_ttl_count,
      initValue: rawTarget.bytes[rawTarget.l3Offset + 8] ?? 0,
      maxLimit: 255,
      name: "ip_ttl",
      pktOffset: rawTarget.l3Offset + 8,
      size: 1,
      step: stream.ipv4_ttl_step
    });
  }
  const ipv4Offset = outerIpv4Offset(stream);
  return {
    instructions: [
      {
        init_value: stream.ipv4_ttl,
        max_value: Math.min(255, stream.ipv4_ttl + stream.ipv4_ttl_count - 1),
        min_value: stream.ipv4_ttl,
        name: "ip_ttl",
        op: "inc",
        size: 1,
        step: stream.ipv4_ttl_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: "ip_ttl",
        pkt_offset: ipv4Offset + 8,
        type: "write_flow_var"
      },
      outerIpv4ChecksumRepairInstruction(stream)
    ],
    split_by_var: "ip_ttl"
  };
}
