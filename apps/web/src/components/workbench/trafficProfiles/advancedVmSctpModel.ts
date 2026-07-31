import type { ProfileWorkbenchStream } from "../../../api";
import {
  advancedVmDefaultBody,
  type AdvancedVmBody
} from "./model";
import {
  outerSctpOffset
} from "./packetLayoutModel";
import {
  rawOuterSctpTarget,
  rawPacketHasBytes,
  rawPacketNumberValue
} from "./rawPacketModel";

export function isAdvancedOuterSctpStream(stream: ProfileWorkbenchStream | null | undefined) {
  if (!stream) {
    return false;
  }
  if (stream.packet_binary_base64) {
    return Boolean(rawOuterSctpTarget(stream, 12));
  }
  return Boolean(
    stream.packet_type === "Ethernet/IPv4/SCTP"
      || stream.packet_type === "Ethernet/IPv6/SCTP"
  );
}

function sctpDataFlagsTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterSctpTarget(stream, 14);
  if (rawTarget) {
    if ((rawTarget.bytes[rawTarget.offset + 12] ?? -1) !== 0) {
      return null;
    }
    return {
      flags: rawTarget.bytes[rawTarget.offset + 13] ?? 0,
      flagsOffset: rawTarget.offset + 13
    };
  }
  if (stream && (stream.packet_type === "Ethernet/IPv4/SCTP" || stream.packet_type === "Ethernet/IPv6/SCTP")) {
    return {
      flags: stream.sctp_data_flags,
      flagsOffset: outerSctpOffset(stream) + 13
    };
  }
  return null;
}

export function isAdvancedOuterSctpDataStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(sctpDataFlagsTarget(stream));
}

type SctpAdvancedField =
  | "source_port"
  | "destination_port"
  | "verification_tag"
  | "data_flags"
  | "tsn"
  | "stream_id"
  | "stream_sequence"
  | "payload_protocol_id";
type SctpDataFlagMaskedField = "reserved" | "immediate_sack" | "unordered" | "beginning" | "ending";

type SctpAdvancedFieldSpec = {
  value: number;
  count: number;
  step: number;
  size: 1 | 2 | 4;
  maxLimit: number;
  offsetWithinSctp: number;
};

function sctpAdvancedFieldSpec(stream: ProfileWorkbenchStream, field: SctpAdvancedField): SctpAdvancedFieldSpec {
  switch (field) {
    case "source_port":
      return {
        value: stream.l4_src_port,
        count: stream.l4_src_port_count,
        step: stream.l4_src_port_step,
        size: 2,
        maxLimit: 65_535,
        offsetWithinSctp: 0
      };
    case "destination_port":
      return {
        value: stream.l4_dst_port,
        count: stream.l4_dst_port_count,
        step: stream.l4_dst_port_step,
        size: 2,
        maxLimit: 65_535,
        offsetWithinSctp: 2
      };
    case "verification_tag":
      return {
        value: stream.sctp_verification_tag,
        count: stream.sctp_verification_tag_count,
        step: stream.sctp_verification_tag_step,
        size: 4,
        maxLimit: 4_294_967_295,
        offsetWithinSctp: 4
      };
    case "data_flags":
      return {
        value: stream.sctp_data_flags,
        count: stream.sctp_data_flags_count,
        step: stream.sctp_data_flags_step,
        size: 1,
        maxLimit: 255,
        offsetWithinSctp: 13
      };
    case "tsn":
      return {
        value: stream.sctp_tsn,
        count: stream.sctp_tsn_count,
        step: stream.sctp_tsn_step,
        size: 4,
        maxLimit: 4_294_967_295,
        offsetWithinSctp: 16
      };
    case "stream_id":
      return {
        value: stream.sctp_stream_id,
        count: stream.sctp_stream_id_count,
        step: stream.sctp_stream_id_step,
        size: 2,
        maxLimit: 65_535,
        offsetWithinSctp: 20
      };
    case "stream_sequence":
      return {
        value: stream.sctp_stream_sequence,
        count: stream.sctp_stream_sequence_count,
        step: stream.sctp_stream_sequence_step,
        size: 2,
        maxLimit: 65_535,
        offsetWithinSctp: 22
      };
    case "payload_protocol_id":
      return {
        value: stream.sctp_payload_protocol_id,
        count: stream.sctp_payload_protocol_id_count,
        step: stream.sctp_payload_protocol_id_step,
        size: 4,
        maxLimit: 4_294_967_295,
        offsetWithinSctp: 24
      };
  }
}

function buildSctpNumberIncVmBody(stream: ProfileWorkbenchStream, field: SctpAdvancedField): AdvancedVmBody {
  const spec = sctpAdvancedFieldSpec(stream, field);
  const variableName = `sctp_${field}`;
  const rawTarget = rawOuterSctpTarget(stream, spec.offsetWithinSctp + spec.size);
  const rawDataChunkAvailable = rawTarget && rawPacketHasBytes(rawTarget.bytes, rawTarget.offset + 12, 1)
    ? rawTarget.bytes[rawTarget.offset + 12] === 0
    : false;
  const useRawTarget = Boolean(
    rawTarget
      && (
        field === "source_port"
        || field === "destination_port"
        || field === "verification_tag"
        || rawDataChunkAvailable
      )
  );
  const initValue = useRawTarget && rawTarget
    ? rawPacketNumberValue(rawTarget.bytes, rawTarget.offset + spec.offsetWithinSctp, spec.size)
    : spec.value;
  const pktOffset = useRawTarget && rawTarget
    ? rawTarget.offset + spec.offsetWithinSctp
    : outerSctpOffset(stream) + spec.offsetWithinSctp;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(spec.maxLimit, initValue + spec.count - 1),
        min_value: initValue,
        name: variableName,
        op: "inc",
        size: spec.size,
        step: spec.step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: variableName,
        pkt_offset: pktOffset,
        type: "write_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildSctpSourcePortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "source_port");
}

export function buildSctpDestinationPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "destination_port");
}

export function buildSctpVerificationTagIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "verification_tag");
}

export function buildSctpDataFlagsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "data_flags");
}

function buildSctpDataFlagMaskedVmBody(stream: ProfileWorkbenchStream, field: SctpDataFlagMaskedField): AdvancedVmBody {
  const target = sctpDataFlagsTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const spec = {
    beginning: { mask: 0x02, name: "sctp_data_beginning_fragment", shift: 1 },
    ending: { mask: 0x01, name: "sctp_data_ending_fragment", shift: 0 },
    immediate_sack: { mask: 0x08, name: "sctp_data_immediate_sack", shift: 3 },
    reserved: { mask: 0xf0, name: "sctp_data_reserved_flags", shift: 4 },
    unordered: { mask: 0x04, name: "sctp_data_unordered", shift: 2 }
  }[field];
  const initValue = ((target.flags & spec.mask) >>> spec.shift) >>> 0;
  const maxValue = spec.mask >>> spec.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: maxValue === 1 ? 1 : Math.min(maxValue, initValue + 3),
        min_value: maxValue === 1 ? 0 : initValue,
        name: spec.name,
        op: maxValue === 1 && initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: spec.mask,
        name: spec.name,
        pkt_cast_size: 1,
        pkt_offset: target.flagsOffset,
        shift: spec.shift,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: spec.name
  };
}

export function buildSctpDataReservedFlagsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpDataFlagMaskedVmBody(stream, "reserved");
}

export function buildSctpDataImmediateSackFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpDataFlagMaskedVmBody(stream, "immediate_sack");
}

export function buildSctpDataUnorderedFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpDataFlagMaskedVmBody(stream, "unordered");
}

export function buildSctpDataBeginningFragmentFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpDataFlagMaskedVmBody(stream, "beginning");
}

export function buildSctpDataEndingFragmentFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpDataFlagMaskedVmBody(stream, "ending");
}

export function buildSctpTsnIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "tsn");
}

export function buildSctpStreamIdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "stream_id");
}

export function buildSctpStreamSequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "stream_sequence");
}

export function buildSctpPayloadProtocolIdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildSctpNumberIncVmBody(stream, "payload_protocol_id");
}
