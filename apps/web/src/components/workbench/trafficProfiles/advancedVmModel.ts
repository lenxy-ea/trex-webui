import type { ProfileWorkbenchStream } from "../../../api";
import {
  outerIpv4Offset,
  outerIcmpv6Offset,
  outerL4Offset,
  outerMplsOffset,
  outerUdpChecksumInstruction,
  outerUdpPayloadOffset,
  workbenchOuterL2HeaderLength
} from "./packetLayoutModel";
import {
  formatPacketIpv4,
  formatPacketMac,
  icmpv4EchoRawTarget,
  icmpv6EchoRawTarget,
  icmpv6LinkLayerOptionMacTarget,
  icmpv6NaFlagsTarget,
  icmpv6NdTargetAddressTarget,
  icmpv6RaFixedTarget,
  icmpv6RaPrefixInfoTarget,
  ipv4OptionTypeTarget,
  ipv4RouterAlertTarget,
  ipv6AhHeaderTarget,
  ipv6ExtensionOptionTypeTarget,
  ipv6FragmentHeaderTarget,
  ipv6JumboPayloadTarget,
  ipv6RouterAlertTarget,
  ipv6RoutingHeaderTarget,
  rawDnsAnswerTarget,
  rawDnsQueryTarget,
  rawDhcpTarget,
  rawGreInnerChecksumInstruction,
  rawGreInnerIpv4AddressTarget,
  rawGreInnerIpv4ChecksumInstruction,
  rawGreInnerIpv4Target,
  rawGreInnerIpv4TcpTarget,
  rawGreInnerIpv4UdpTarget,
  rawGreInnerIpv6Target,
  rawGreInnerIpv6TcpTarget,
  rawGreInnerIpv6UdpTarget,
  rawGreOptionTarget,
  rawGtpuInnerIpv4AddressTarget,
  rawGtpuInnerIpv4Target,
  rawGtpuInnerIpv4TcpTarget,
  rawGtpuInnerIpv4UdpTarget,
  rawGtpuInnerIpv6AddressTarget,
  rawGtpuInnerIpv6Target,
  rawGtpuInnerIpv6TcpTarget,
  rawGtpuInnerIpv6UdpTarget,
  rawGtpuTarget,
  rawMplsLabelTarget,
  rawOuterGreTarget,
  rawPacketNumberValue,
  rawPacketWord,
  rawTcpOptionValueTarget,
  rawVlanTagTarget,
  rawVxlanInnerArpTarget,
  rawVxlanInnerEthernetTarget,
  rawVxlanInnerIpv4AddressTarget,
  rawVxlanInnerIpv4Target,
  rawVxlanInnerIpv4TcpTarget,
  rawVxlanInnerIpv4UdpTarget,
  rawVxlanInnerIpv6AddressTarget,
  rawVxlanInnerIpv6Target,
  rawVxlanInnerIpv6TcpTarget,
  rawVxlanInnerIpv6UdpTarget,
  rawVxlanInnerVlanTagTarget,
  rawVxlanTarget,
  type RawTcpOptionTargetName
} from "./rawPacketModel";
import {
  advancedVmDefaultBody,
  type AdvancedVmBody,
  isRawPacketAdvancedStream
} from "./model";
import { largeUnitCountNumber } from "./scalarValueModel";
import {
  advancedNumberBounds
} from "./advancedVmParameterModel";
import {
  buildAdvancedNumberWriteVmBody
} from "./advancedVmNumberWriteModel";
import {
  buildRawInnerIpv4DscpIncVmBody,
  buildRawInnerIpv4EcnIncVmBody,
  buildRawInnerIpv4FlagVaryVmBody,
  buildRawInnerIpv4FragmentOffsetIncVmBody,
  buildRawInnerIpv4IdIncVmBody,
  buildStructuredInnerIpv4UdpFiveTupleVmBody
} from "./advancedVmInnerIpv4Model";
import {
  buildRawInnerIpv6FlowLabelIncVmBody,
  buildRawInnerIpv6TrafficClassIncVmBody
} from "./advancedVmInnerIpv6Model";
import { isAdvancedOuterIpv4TcpStream } from "./advancedVmOuterIpv4Model";
import { isAdvancedOuterIpv6TcpStream } from "./advancedVmOuterIpv6Model";
import {
  buildIpv6AddressIncVmBody,
  ipv6FieldEngineSuffix,
  isSafeIpv6AddressVmTarget
} from "./advancedVmIpv6AddressModel";
import {
  dhcpParameterRequestFirstValue,
  dhcpParameterRequestListLength,
  dnsNameWireLength,
  dnsQueryNameFirstLabelByte,
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix,
  macFieldEngineSuffix,
  parseHexWord
} from "./advancedVmValueModel";

export {
  advancedNumberBounds,
  advancedVmFlowVarFieldLabel,
  advancedVmFlowVarInputAttributes,
  advancedVmFlowVarMaskLimit,
  advancedVmFlowVarMaxLimit,
  advancedVmFlowVarNumber,
  advancedVmFlowVarOperation,
  advancedVmFlowVarRangeCount,
  advancedVmFlowVarRows,
  advancedVmParameterizedTemplateBody,
  advancedVmTemplateBody,
  advancedVmTemplateDraftHas,
  advancedVmTemplateParameterKey,
  advancedVmTemplateParameterValidationError,
  advancedVmTemplateParameterValue,
  parseAdvancedVmTemplateNumber
} from "./advancedVmParameterModel";
export {
  dhcpParameterRequestFirstValue,
  dhcpParameterRequestListLength,
  dnsNameWireLength,
  dnsQueryNameFirstLabelByte,
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix,
  ipv4Parts,
  macFieldEngineSuffix,
  macParts,
  parseHexWord
} from "./advancedVmValueModel";
export {
  advancedVmInstructionObjects,
  advancedVmTargetChecksumRepair,
  advancedVmTargetChoiceViewModel,
  advancedVmTargetWriteOffsets,
  advancedVmTargetWriteOffsetValues,
  advancedVmTemplateTargetRowsForStream,
  type AdvancedVmTargetChoiceSource,
  type AdvancedVmTargetChoiceView,
  type AdvancedVmTemplateOption
} from "./advancedVmTargetModel";
export {
  advancedVmNamedTargetTemplateDraft,
  advancedVmTargetTemplateDraft,
  advancedVmTemplateDraftText,
  advancedVmTemplateViewModel,
  appendedAdvancedVmTemplateDraftText,
  type AdvancedVmTemplateDraftResult,
  type AdvancedVmTemplateView
} from "./advancedVmTemplateDraftModel";
export {
  advancedNumberWriteInstructions,
  buildAdvancedNumberWriteVmBody,
  type AdvancedNumberWriteSpec
} from "./advancedVmNumberWriteModel";
export {
  buildRawInnerIpv4DscpIncVmBody,
  buildRawInnerIpv4EcnIncVmBody,
  buildRawInnerIpv4FlagVaryVmBody,
  buildRawInnerIpv4FragmentOffsetIncVmBody,
  buildRawInnerIpv4IdIncVmBody,
  buildStructuredInnerIpv4UdpFiveTupleVmBody,
  type InnerIpv4UdpFiveTuplePrefix
} from "./advancedVmInnerIpv4Model";
export {
  buildRawInnerIpv6FlowLabelIncVmBody,
  buildRawInnerIpv6TrafficClassIncVmBody
} from "./advancedVmInnerIpv6Model";
export {
  buildIpv6AddressIncVmBody,
  ipv6AddressFlowVarInstructions,
  ipv6FieldEngineSuffix,
  isSafeIpv6AddressVmTarget
} from "./advancedVmIpv6AddressModel";
export {
  buildOuterIpv4DfFlagVaryVmBody,
  buildOuterIpv4DscpIncVmBody,
  buildOuterIpv4DstIncVmBody,
  buildOuterIpv4DstRandomVmBody,
  buildOuterIpv4EcnIncVmBody,
  buildOuterIpv4FragmentOffsetIncVmBody,
  buildOuterIpv4IdIncVmBody,
  buildOuterIpv4MfFlagVaryVmBody,
  buildOuterIpv4ReservedFlagVaryVmBody,
  buildOuterIpv4SrcIncVmBody,
  buildOuterIpv4SrcRandomVmBody,
  buildOuterIpv4TtlIncVmBody,
  isAdvancedOuterIpv4Stream,
  isAdvancedOuterIpv4TcpStream,
  isAdvancedOuterIpv4UdpStream,
  rawIpv4ChecksumRepairInstruction
} from "./advancedVmOuterIpv4Model";
export {
  buildOuterIpv6DstIncVmBody,
  buildOuterIpv6FlowLabelIncVmBody,
  buildOuterIpv6HopLimitIncVmBody,
  buildOuterIpv6SrcIncVmBody,
  buildOuterIpv6TcpDstPortIncVmBody,
  buildOuterIpv6TcpFiveTupleVmBody,
  buildOuterIpv6TcpSrcPortIncVmBody,
  buildOuterIpv6TrafficClassIncVmBody,
  buildOuterIpv6UdpDstPortIncVmBody,
  buildOuterIpv6UdpFiveTupleVmBody,
  buildOuterIpv6UdpSrcPortIncVmBody,
  isAdvancedOuterIpv6DstVmStream,
  isAdvancedOuterIpv6SrcVmStream,
  isAdvancedOuterIpv6Stream,
  isAdvancedOuterIpv6TcpFiveTupleStream,
  isAdvancedOuterIpv6TcpStream,
  isAdvancedOuterIpv6UdpFiveTupleStream,
  isAdvancedOuterIpv6UdpStream
} from "./advancedVmOuterIpv6Model";
export {
  buildOuterEtherTypeIncVmBody,
  buildOuterMacDstIncVmBody,
  buildOuterMacSrcIncVmBody,
  isOuterEtherTypeStream
} from "./advancedVmL2Model";
export {
  buildArpOperationIncVmBody,
  buildArpSenderIpIncVmBody,
  buildArpSenderMacIncVmBody,
  buildArpTargetIpIncVmBody,
  buildArpTargetMacIncVmBody,
  isArpStream
} from "./advancedVmArpModel";
export {
  buildSctpDataBeginningFragmentFlagVmBody,
  buildSctpDataEndingFragmentFlagVmBody,
  buildSctpDataFlagsIncVmBody,
  buildSctpDataImmediateSackFlagVmBody,
  buildSctpDataReservedFlagsIncVmBody,
  buildSctpDataUnorderedFlagVmBody,
  buildSctpDestinationPortIncVmBody,
  buildSctpPayloadProtocolIdIncVmBody,
  buildSctpSourcePortIncVmBody,
  buildSctpStreamIdIncVmBody,
  buildSctpStreamSequenceIncVmBody,
  buildSctpTsnIncVmBody,
  buildSctpVerificationTagIncVmBody,
  isAdvancedOuterSctpDataStream,
  isAdvancedOuterSctpStream
} from "./advancedVmSctpModel";
export {
  buildOuterTcpAckIncVmBody,
  buildOuterTcpChecksumIncVmBody,
  buildOuterTcpFlagVaryVmBody,
  buildOuterTcpFlagsIncVmBody,
  buildOuterTcpReservedBitsIncVmBody,
  buildOuterTcpSequenceIncVmBody,
  buildOuterTcpUrgentPointerIncVmBody,
  buildOuterTcpWindowIncVmBody,
  type TcpFlagTarget
} from "./advancedVmTcpHeaderModel";
export {
  buildOuterIpv4TransportFiveTupleVmBody,
  buildOuterTcpDstPortIncVmBody,
  buildOuterTcpFiveTupleVmBody,
  buildOuterTcpSrcPortIncVmBody,
  buildOuterUdpDstPortIncVmBody,
  buildOuterUdpFiveTupleVmBody,
  buildOuterUdpSrcPortIncVmBody
} from "./advancedVmOuterIpv4TransportModel";
export {
  buildOuterIpv4UdpChecksumIncVmBody,
  buildOuterIpv4UdpLengthIncVmBody,
  buildOuterIpv6UdpChecksumIncVmBody,
  buildOuterIpv6UdpLengthIncVmBody
} from "./advancedVmUdpHeaderModel";
export {
  buildOuterTcpOptionMssIncVmBody,
  buildOuterTcpOptionSack2LeftIncVmBody,
  buildOuterTcpOptionSack2RightIncVmBody,
  buildOuterTcpOptionSack3LeftIncVmBody,
  buildOuterTcpOptionSack3RightIncVmBody,
  buildOuterTcpOptionSack4LeftIncVmBody,
  buildOuterTcpOptionSack4RightIncVmBody,
  buildOuterTcpOptionSackLeftIncVmBody,
  buildOuterTcpOptionSackRightIncVmBody,
  buildOuterTcpOptionTimestampEchoIncVmBody,
  buildOuterTcpOptionTimestampValueIncVmBody,
  buildOuterTcpOptionWindowScaleIncVmBody,
  rawTcpChecksumInstruction
} from "./advancedVmTcpOptionModel";

export function vxlanInnerIpv4Offset(
  stream: ProfileWorkbenchStream,
  rawTarget: ReturnType<typeof rawVxlanTarget> = rawVxlanTarget(stream)
) {
  return rawTarget && "innerIpOffset" in rawTarget ? rawTarget.innerIpOffset : workbenchOuterL2HeaderLength(stream) + 50;
}

export function vxlanInnerChecksumInstruction(
  stream: ProfileWorkbenchStream,
  rawTarget: ReturnType<typeof rawVxlanTarget> = rawVxlanTarget(stream),
  l4Type: 11 | 13 = 11
) {
  if (rawTarget && "innerIpOffset" in rawTarget) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: l4Type,
      type: "fix_checksum_hw"
    };
  }
  return {
    l2_len: vxlanInnerIpv4Offset(stream),
    l3_len: stream.vxlan_inner_ip_version === "IPv6" ? 40 : 20,
    l4_type: l4Type,
    type: "fix_checksum_hw"
  };
}

export function vxlanInnerIpv4ChecksumInstruction(
  stream: ProfileWorkbenchStream,
  rawTarget: ReturnType<typeof rawVxlanInnerIpv4Target> = rawVxlanInnerIpv4Target(stream)
) {
  if (rawTarget && rawTarget.innerUdpOffset !== null) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: 11,
      type: "fix_checksum_hw"
    };
  }
  if (rawTarget && rawTarget.innerTcpOffset !== null) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: 13,
      type: "fix_checksum_hw"
    };
  }
  if (rawTarget) {
    return {
      pkt_offset: rawTarget.innerIpOffset,
      type: "fix_checksum_ipv4"
    };
  }
  return vxlanInnerChecksumInstruction(stream, rawTarget);
}

export function buildVxlanInnerFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4UdpTarget(stream);
  const innerIpv4Offset = rawTarget?.innerIpOffset ?? vxlanInnerIpv4Offset(stream);
  const innerUdpOffset = innerIpv4Offset + 20;
  if (rawTarget && rawTarget.innerUdpOffset !== null) {
    const innerUdpOffset = rawTarget.innerUdpOffset;
    return {
      instructions: [
        {
          init_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4),
          max_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4) + stream.vxlan_inner_ipv4_src_count - 1,
          min_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4),
          name: "vxlan_inner_ipv4_src",
          op: "inc",
          size: 4,
          step: stream.vxlan_inner_ipv4_src_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "vxlan_inner_ipv4_src",
          pkt_offset: rawTarget.innerIpv4SrcOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4),
          max_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4) + stream.vxlan_inner_ipv4_dst_count - 1,
          min_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4),
          name: "vxlan_inner_ipv4_dst",
          op: "inc",
          size: 4,
          step: stream.vxlan_inner_ipv4_dst_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "vxlan_inner_ipv4_dst",
          pkt_offset: rawTarget.innerIpv4DstOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawTarget.innerUdpSrcPort ?? 0,
          max_value: Math.min(65_535, (rawTarget.innerUdpSrcPort ?? 0) + stream.vxlan_inner_l4_src_port_count - 1),
          min_value: rawTarget.innerUdpSrcPort ?? 0,
          name: "vxlan_inner_udp_src",
          op: "inc",
          size: 2,
          step: stream.vxlan_inner_l4_src_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "vxlan_inner_udp_src",
          pkt_offset: innerUdpOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawTarget.innerUdpDstPort ?? 0,
          max_value: Math.min(65_535, (rawTarget.innerUdpDstPort ?? 0) + stream.vxlan_inner_l4_dst_port_count - 1),
          min_value: rawTarget.innerUdpDstPort ?? 0,
          name: "vxlan_inner_udp_dst",
          op: "inc",
          size: 2,
          step: stream.vxlan_inner_l4_dst_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "vxlan_inner_udp_dst",
          pkt_offset: innerUdpOffset + 2,
          type: "write_flow_var"
        },
        vxlanInnerChecksumInstruction(stream, rawTarget)
      ],
      split_by_var: "vxlan_inner_ipv4_src"
    };
  }
  return buildStructuredInnerIpv4UdpFiveTupleVmBody({
    checksumInstruction: vxlanInnerChecksumInstruction(stream, rawTarget),
    dstAddress: stream.vxlan_inner_ipv4_dst,
    dstAddressCount: stream.vxlan_inner_ipv4_dst_count,
    dstAddressStep: stream.vxlan_inner_ipv4_dst_step,
    dstPort: stream.vxlan_inner_l4_dst_port,
    dstPortCount: stream.vxlan_inner_l4_dst_port_count,
    dstPortStep: stream.vxlan_inner_l4_dst_port_step,
    innerIpv4Offset,
    innerUdpOffset,
    prefix: "vxlan_inner",
    srcAddress: stream.vxlan_inner_ipv4_src,
    srcAddressCount: stream.vxlan_inner_ipv4_src_count,
    srcAddressStep: stream.vxlan_inner_ipv4_src_step,
    srcPort: stream.vxlan_inner_l4_src_port,
    srcPortCount: stream.vxlan_inner_l4_src_port_count,
    srcPortStep: stream.vxlan_inner_l4_src_port_step
  });
}

function buildVxlanInnerIpv4AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4AddressTarget(stream);
  const address = rawTarget
    ? field === "src" ? rawTarget.innerIpv4Src : rawTarget.innerIpv4Dst
    : field === "src" ? stream.vxlan_inner_ipv4_src : stream.vxlan_inner_ipv4_dst;
  const count = field === "src" ? stream.vxlan_inner_ipv4_src_count : stream.vxlan_inner_ipv4_dst_count;
  const step = field === "src" ? stream.vxlan_inner_ipv4_src_step : stream.vxlan_inner_ipv4_dst_step;
  const suffix = ipv4FieldEngineSuffix(address, count);
  const baseOffset = rawTarget
    ? field === "src" ? rawTarget.innerIpv4SrcOffset : rawTarget.innerIpv4DstOffset
    : vxlanInnerIpv4Offset(stream) + (field === "dst" ? 16 : 12);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: `vxlan_inner_ipv4_${field}`,
    pktOffset: baseOffset + 4 - suffix.size,
    size: suffix.size,
    step
  });
}

export function buildVxlanInnerIpv4SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv4AddressIncVmBody(stream, "src");
}

export function buildVxlanInnerIpv4DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv4AddressIncVmBody(stream, "dst");
}

export function buildVxlanInnerIpv4TtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.vxlan_inner_ipv4_ttl_count,
    initValue: rawTarget ? rawTarget.innerIpv4Ttl : stream.vxlan_inner_ipv4_ttl,
    maxLimit: 255,
    name: "vxlan_inner_ipv4_ttl",
    pktOffset: rawTarget?.innerIpv4TtlOffset ?? vxlanInnerIpv4Offset(stream) + 8,
    size: 1,
    step: stream.vxlan_inner_ipv4_ttl_step
  });
}

export function buildVxlanInnerIpv4IdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4IdIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_id_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_id_step,
    variableName: "vxlan_inner_ipv4_id"
  });
}

export function buildVxlanInnerIpv4DscpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4DscpIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_dscp_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_dscp_step,
    variableName: "vxlan_inner_ipv4_dscp"
  });
}

export function buildVxlanInnerIpv4EcnIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4EcnIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_ecn_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_ecn_step,
    variableName: "vxlan_inner_ipv4_ecn"
  });
}

export function buildVxlanInnerIpv4FragmentOffsetIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4FragmentOffsetIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_fragment_offset_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_fragment_offset_step,
    variableName: "vxlan_inner_ipv4_fragment_offset"
  });
}

function buildVxlanInnerIpv4FlagVaryVmBody(stream: ProfileWorkbenchStream, target: "reserved" | "df" | "mf"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4FlagVaryVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: vxlanInnerIpv4ChecksumInstruction(stream, rawTarget),
    innerIpOffset: rawTarget.innerIpOffset,
    target,
    variablePrefix: "vxlan_inner_ipv4"
  });
}

export function buildVxlanInnerIpv4ReservedFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv4FlagVaryVmBody(stream, "reserved");
}

export function buildVxlanInnerIpv4DfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv4FlagVaryVmBody(stream, "df");
}

export function buildVxlanInnerIpv4MfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv4FlagVaryVmBody(stream, "mf");
}

function buildVxlanInnerMacAddressIncVmBody(stream: ProfileWorkbenchStream, field: "dst" | "src"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerEthernetTarget(stream);
  const count = 16;
  const step = 1;
  const address = rawTarget
    ? formatPacketMac(rawTarget.bytes, rawTarget.innerEthernetOffset + (field === "src" ? 6 : 0))
    : field === "src" ? stream.vxlan_inner_ether_src : stream.vxlan_inner_ether_dst;
  const suffix = macFieldEngineSuffix(address, count);
  const baseOffset = (rawTarget?.innerEthernetOffset ?? workbenchOuterL2HeaderLength(stream) + 36) + (field === "src" ? 6 : 0);
  return buildAdvancedNumberWriteVmBody({
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: `vxlan_inner_mac_${field}`,
    pktOffset: baseOffset + 6 - suffix.size,
    size: suffix.size,
    step
  });
}

export function buildVxlanInnerMacDstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerMacAddressIncVmBody(stream, "dst");
}

export function buildVxlanInnerMacSrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerMacAddressIncVmBody(stream, "src");
}

export function buildVxlanInnerEtherTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerEthernetTarget(stream);
  const initValue = rawTarget
    ? rawPacketWord(rawTarget.bytes, rawTarget.innerEthernetOffset + 12)
    : stream.vxlan_inner_ip_version === "IPv6" ? 0x86dd : 0x0800;
  return buildAdvancedNumberWriteVmBody({
    count: 16,
    initValue,
    maxLimit: 65_535,
    name: "vxlan_inner_ether_type",
    pktOffset: (rawTarget?.innerEthernetOffset ?? workbenchOuterL2HeaderLength(stream) + 36) + 12,
    size: 2,
    step: 1
  });
}

export function buildVxlanInnerVlanIdIncVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVxlanInnerVlanTagTarget(stream, index);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const variableName = index === 1 ? "vxlan_inner_vlan_id" : "vxlan_inner_vlan2_id";
  return {
    instructions: [
      {
        init_value: rawTarget.vlanId,
        max_value: Math.min(4094, rawTarget.vlanId + 15),
        min_value: rawTarget.vlanId,
        name: variableName,
        op: "inc",
        size: 2,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0fff,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: rawTarget.tciOffset,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildVxlanInnerSecondVlanIdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerVlanIdIncVmBody(stream, 2);
}

export function buildVxlanInnerVlanPriorityIncVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVxlanInnerVlanTagTarget(stream, index);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const variableName = index === 1 ? "vxlan_inner_vlan_priority" : "vxlan_inner_vlan2_priority";
  return {
    instructions: [
      {
        init_value: rawTarget.priority,
        max_value: Math.min(7, rawTarget.priority + 3),
        min_value: rawTarget.priority,
        name: variableName,
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xe000,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: rawTarget.tciOffset,
        shift: 13,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildVxlanInnerSecondVlanPriorityIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerVlanPriorityIncVmBody(stream, 2);
}

export function buildVxlanInnerVlanCfiVaryVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVxlanInnerVlanTagTarget(stream, index);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const variableName = index === 1 ? "vxlan_inner_vlan_cfi" : "vxlan_inner_vlan2_cfi";
  return {
    instructions: [
      {
        init_value: rawTarget.cfi,
        max_value: 1,
        min_value: 0,
        name: variableName,
        op: rawTarget.cfi === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1000,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: rawTarget.tciOffset,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildVxlanInnerSecondVlanCfiVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerVlanCfiVaryVmBody(stream, 2);
}

export function buildVxlanInnerArpOperationIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerArpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_operation_count,
    initValue: rawTarget.operation,
    maxLimit: 65_535,
    name: "vxlan_inner_arp_operation",
    pktOffset: rawTarget.operationOffset,
    size: 2,
    step: stream.arp_operation_step
  });
}

export function buildVxlanInnerArpSenderIpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerArpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const suffix = ipv4FieldEngineSuffix(rawTarget.senderIp, stream.arp_sender_ip_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_sender_ip_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "vxlan_inner_arp_sender_ip",
    pktOffset: rawTarget.senderIpOffset + 4 - suffix.size,
    size: suffix.size,
    step: stream.arp_sender_ip_step
  });
}

export function buildVxlanInnerArpTargetIpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerArpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const suffix = ipv4FieldEngineSuffix(rawTarget.targetIp, stream.arp_target_ip_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_target_ip_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "vxlan_inner_arp_target_ip",
    pktOffset: rawTarget.targetIpOffset + 4 - suffix.size,
    size: suffix.size,
    step: stream.arp_target_ip_step
  });
}

export function buildVxlanInnerArpSenderMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerArpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const suffix = macFieldEngineSuffix(rawTarget.senderMac, stream.arp_sender_mac_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_sender_mac_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "vxlan_inner_arp_sender_mac",
    pktOffset: rawTarget.senderMacOffset + 6 - suffix.size,
    size: suffix.size,
    step: stream.arp_sender_mac_step
  });
}

export function buildVxlanInnerArpTargetMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerArpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const suffix = macFieldEngineSuffix(rawTarget.targetMac, stream.arp_target_mac_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_target_mac_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "vxlan_inner_arp_target_mac",
    pktOffset: rawTarget.targetMacOffset + 6 - suffix.size,
    size: suffix.size,
    step: stream.arp_target_mac_step
  });
}

function buildVxlanInnerIpv6AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv6AddressTarget(stream);
  const address = rawTarget
    ? field === "src" ? rawTarget.innerIpv6Src : rawTarget.innerIpv6Dst
    : field === "src" ? stream.vxlan_inner_ipv6_src : stream.vxlan_inner_ipv6_dst;
  const count = field === "src" ? stream.vxlan_inner_ipv6_src_count : stream.vxlan_inner_ipv6_dst_count;
  const step = field === "src" ? stream.vxlan_inner_ipv6_src_step : stream.vxlan_inner_ipv6_dst_step;
  const baseOffset = rawTarget
    ? field === "src" ? rawTarget.innerIpv6SrcOffset : rawTarget.innerIpv6DstOffset
    : vxlanInnerIpv4Offset(stream) + (field === "dst" ? 24 : 8);
  return buildIpv6AddressIncVmBody({
    address,
    baseOffset,
    checksumInstruction: vxlanInnerChecksumInstruction(stream, rawTarget, rawTarget?.innerTcpOffset !== null && rawTarget?.innerTcpOffset !== undefined ? 13 : 11),
    count,
    name: `vxlan_inner_ipv6_${field}`,
    step
  });
}

export function buildVxlanInnerIpv6SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv6AddressIncVmBody(stream, "src");
}

export function buildVxlanInnerIpv6DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerIpv6AddressIncVmBody(stream, "dst");
}

export function buildVxlanInnerIpv6HopLimitIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv6Target(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.vxlan_inner_ipv6_hop_limit_count,
    initValue: rawTarget ? rawTarget.innerIpv6HopLimit : stream.vxlan_inner_ipv6_hop_limit,
    maxLimit: 255,
    name: "vxlan_inner_ipv6_hop_limit",
    pktOffset: rawTarget?.innerIpv6HopLimitOffset ?? vxlanInnerIpv4Offset(stream) + 7,
    size: 1,
    step: stream.vxlan_inner_ipv6_hop_limit_step
  });
}

export function buildVxlanInnerIpv6TrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6TrafficClassIncVmBody(
    rawTarget.bytes,
    rawTarget.innerIpOffset,
    "vxlan_inner_ipv6_traffic_class",
    stream.ipv6_traffic_class_count,
    stream.ipv6_traffic_class_step
  );
}

export function buildVxlanInnerIpv6FlowLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6FlowLabelIncVmBody(
    rawTarget.bytes,
    rawTarget.innerIpOffset,
    "vxlan_inner_ipv6_flow_label",
    stream.ipv6_flow_label_count,
    stream.ipv6_flow_label_step
  );
}

function buildVxlanInnerUdpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4UdpTarget(stream) ?? rawVxlanInnerIpv6UdpTarget(stream);
  const initValue = rawTarget
    ? field === "src" ? rawTarget.innerUdpSrcPort ?? 0 : rawTarget.innerUdpDstPort ?? 0
    : field === "src" ? stream.vxlan_inner_l4_src_port : stream.vxlan_inner_l4_dst_port;
  const count = field === "src" ? stream.vxlan_inner_l4_src_port_count : stream.vxlan_inner_l4_dst_port_count;
  const step = field === "src" ? stream.vxlan_inner_l4_src_port_step : stream.vxlan_inner_l4_dst_port_step;
  const innerL3Length = stream.vxlan_inner_ip_version === "IPv6" ? 40 : 20;
  const udpFieldOffset = rawTarget && rawTarget.innerUdpOffset !== null
    ? rawTarget.innerUdpOffset + (field === "dst" ? 2 : 0)
    : vxlanInnerIpv4Offset(stream) + innerL3Length + (field === "dst" ? 2 : 0);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: vxlanInnerChecksumInstruction(stream, rawTarget),
    count,
    initValue,
    maxLimit: 65_535,
    name: `vxlan_inner_udp_${field}`,
    pktOffset: udpFieldOffset,
    size: 2,
    step
  });
}

export function buildVxlanInnerUdpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerUdpPortIncVmBody(stream, "src");
}

export function buildVxlanInnerUdpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerUdpPortIncVmBody(stream, "dst");
}

function buildVxlanInnerTcpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawVxlanInnerIpv4TcpTarget(stream) ?? rawVxlanInnerIpv6TcpTarget(stream);
  const tcpOffset = rawTarget?.innerTcpOffset ?? null;
  if (!rawTarget || tcpOffset === null) {
    return advancedVmDefaultBody;
  }
  const fieldOffset = tcpOffset + (field === "dst" ? 2 : 0);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: vxlanInnerChecksumInstruction(stream, rawTarget, 13),
    count: field === "src" ? stream.vxlan_inner_l4_src_port_count : stream.vxlan_inner_l4_dst_port_count,
    initValue: rawPacketWord(rawTarget.bytes, fieldOffset),
    maxLimit: 65_535,
    name: `vxlan_inner_tcp_${field}`,
    pktOffset: fieldOffset,
    size: 2,
    step: field === "src" ? stream.vxlan_inner_l4_src_port_step : stream.vxlan_inner_l4_dst_port_step
  });
}

export function buildVxlanInnerTcpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerTcpPortIncVmBody(stream, "src");
}

export function buildVxlanInnerTcpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVxlanInnerTcpPortIncVmBody(stream, "dst");
}

export function isAdvancedOuterTcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return isAdvancedOuterIpv4TcpStream(stream) || isAdvancedOuterIpv6TcpStream(stream);
}

function isAdvancedRawTcpOptionStream(stream: ProfileWorkbenchStream | null | undefined, targetName: RawTcpOptionTargetName) {
  return Boolean(rawTcpOptionValueTarget(stream, targetName));
}

export function isAdvancedOuterTcpMssStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean((isAdvancedOuterTcpStream(stream) && stream?.tcp_option_mss_enabled) || isAdvancedRawTcpOptionStream(stream, "mss"));
}

export function isAdvancedOuterTcpWindowScaleStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    (isAdvancedOuterTcpStream(stream) && stream?.tcp_option_window_scale_enabled)
    || isAdvancedRawTcpOptionStream(stream, "window-scale")
  );
}

export function isAdvancedOuterTcpSackBlockStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    (isAdvancedOuterTcpStream(stream) && stream?.tcp_option_sack_blocks_enabled)
    || isAdvancedRawTcpOptionStream(stream, "sack-left-edge")
    || isAdvancedRawTcpOptionStream(stream, "sack-right-edge")
  );
}

export function isAdvancedRawTcpSackSecondBlockStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    isAdvancedRawTcpOptionStream(stream, "sack2-left-edge")
    || isAdvancedRawTcpOptionStream(stream, "sack2-right-edge")
  );
}

export function isAdvancedRawTcpSackThirdBlockStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    isAdvancedRawTcpOptionStream(stream, "sack3-left-edge")
    || isAdvancedRawTcpOptionStream(stream, "sack3-right-edge")
  );
}

export function isAdvancedRawTcpSackFourthBlockStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    isAdvancedRawTcpOptionStream(stream, "sack4-left-edge")
    || isAdvancedRawTcpOptionStream(stream, "sack4-right-edge")
  );
}

export function isAdvancedOuterTcpTimestampStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    (isAdvancedOuterTcpStream(stream) && stream?.tcp_option_timestamp_enabled)
    || isAdvancedRawTcpOptionStream(stream, "timestamp-value")
    || isAdvancedRawTcpOptionStream(stream, "timestamp-echo")
  );
}

export function isStructuredOuterIpv4GtpuStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && stream.packet_type === "Ethernet/IPv4/UDP"
      && !stream.vxlan_enabled
      && (stream.gtpu_enabled || (!stream.gtpu_enabled && (stream.l4_src_port === 2152 || stream.l4_dst_port === 2152)))
  );
}

export function isOuterIpv4GtpuStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGtpuTarget(stream) || isStructuredOuterIpv4GtpuStream(stream));
}

function gtpuTeidOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream)) {
  if (rawTarget) {
    return rawTarget.teidOffset;
  }
  return workbenchOuterL2HeaderLength(stream) + 32;
}

function gtpuMessageTypeOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream)) {
  if (rawTarget) {
    return rawTarget.gtpuOffset + 1;
  }
  return gtpuTeidOffset(stream, rawTarget) - 3;
}

export function gtpuOptionalHeaderLength(stream: ProfileWorkbenchStream) {
  return stream.gtpu_sequence_enabled || stream.gtpu_npdu_enabled || stream.gtpu_extension_enabled ? 4 : 0;
}

function gtpuOptionalHeaderOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream)) {
  return rawTarget?.sequenceOffset ?? gtpuTeidOffset(stream, rawTarget) + 4;
}

function gtpuExtensionHeaderOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream)) {
  return rawTarget?.extensionUdpPortOffset !== null && rawTarget?.extensionUdpPortOffset !== undefined
    ? rawTarget.extensionUdpPortOffset - 1
    : gtpuOptionalHeaderOffset(stream, rawTarget) + gtpuOptionalHeaderLength(stream);
}

export function buildGtpuSequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.gtpu_sequence_count,
    initValue: rawTarget?.sequence ?? stream.gtpu_sequence,
    maxLimit: 65_535,
    name: "gtpu_sequence",
    pktOffset: rawTarget?.sequenceOffset ?? gtpuOptionalHeaderOffset(stream, rawTarget),
    size: 2,
    step: stream.gtpu_sequence_step
  });
}

export function buildGtpuNpduIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.gtpu_npdu_count,
    initValue: rawTarget?.npdu ?? stream.gtpu_npdu,
    maxLimit: 255,
    name: "gtpu_npdu",
    pktOffset: rawTarget?.npduOffset ?? gtpuOptionalHeaderOffset(stream, rawTarget) + 2,
    size: 1,
    step: stream.gtpu_npdu_step
  });
}

export function buildGtpuExtensionUdpPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.gtpu_extension_udp_port_count,
    initValue: rawTarget?.extensionUdpPort ?? stream.gtpu_extension_udp_port,
    maxLimit: 65_535,
    name: "gtpu_extension_udp_port",
    pktOffset: rawTarget?.extensionUdpPortOffset ?? gtpuExtensionHeaderOffset(stream, rawTarget) + 1,
    size: 2,
    step: stream.gtpu_extension_udp_port_step
  });
}

export function buildGtpuMessageTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuTarget(stream);
  const checksumInstruction = rawTarget?.checksumInstruction ?? {
    l2_len: workbenchOuterL2HeaderLength(stream),
    l3_len: 20,
    l4_type: 17,
    type: "fix_checksum_hw"
  };
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction,
    count: 4,
    initValue: rawTarget?.messageType ?? stream.gtpu_message_type,
    maxLimit: 255,
    name: "gtpu_message_type",
    pktOffset: gtpuMessageTypeOffset(stream, rawTarget),
    size: 1,
    step: 1
  });
}

export function buildGtpuTeidVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuTarget(stream);
  if (rawTarget) {
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction: rawTarget.checksumInstruction,
      count: stream.gtpu_teid_count,
      initValue: rawTarget.teid,
      maxLimit: 4_294_967_295,
      name: "gtpu_teid",
      pktOffset: gtpuTeidOffset(stream, rawTarget),
      size: 4,
      step: stream.gtpu_teid_step
    });
  }
  return {
    instructions: [
      {
        init_value: 1,
        max_value: 4096,
        min_value: 1,
        name: "gtpu_teid",
        op: "inc",
        size: 4,
        step: 1,
        type: "flow_var"
      },
      {
        is_big_endian: true,
        name: "gtpu_teid",
        pkt_offset: gtpuTeidOffset(stream),
        type: "write_flow_var"
      },
      {
        l2_len: workbenchOuterL2HeaderLength(stream),
        l3_len: 20,
        l4_type: 17,
        type: "fix_checksum_hw"
      }
    ],
    split_by_var: "gtpu_teid"
  };
}

function gtpuInnerIpv4Offset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream)) {
  if (rawTarget && "innerIpOffset" in rawTarget) {
    return rawTarget.innerIpOffset;
  }
  const extensionHeaderLength = stream.gtpu_extension_enabled ? 4 : 0;
  return workbenchOuterL2HeaderLength(stream) + 36 + gtpuOptionalHeaderLength(stream) + extensionHeaderLength;
}

function gtpuInnerChecksumInstruction(
  stream: ProfileWorkbenchStream,
  rawTarget: ReturnType<typeof rawGtpuTarget> = rawGtpuTarget(stream),
  l4Type: 11 | 13 = 11
) {
  if (rawTarget && "innerIpOffset" in rawTarget) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: l4Type,
      type: "fix_checksum_hw"
    };
  }
  return {
    l2_len: gtpuInnerIpv4Offset(stream),
    l3_len: stream.gtpu_inner_ip_version === "IPv6" ? 40 : 20,
    l4_type: l4Type,
    type: "fix_checksum_hw"
  };
}

function gtpuInnerIpv4ChecksumInstruction(
  stream: ProfileWorkbenchStream,
  rawTarget: ReturnType<typeof rawGtpuInnerIpv4Target> = rawGtpuInnerIpv4Target(stream)
) {
  if (rawTarget && rawTarget.innerUdpOffset !== null) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: 11,
      type: "fix_checksum_hw"
    };
  }
  if (rawTarget && rawTarget.innerTcpOffset !== null) {
    return {
      l2_len: rawTarget.innerIpOffset,
      l3_len: rawTarget.innerIpHeaderLength,
      l4_type: 13,
      type: "fix_checksum_hw"
    };
  }
  if (rawTarget) {
    return {
      pkt_offset: rawTarget.innerIpOffset,
      type: "fix_checksum_ipv4"
    };
  }
  return gtpuInnerChecksumInstruction(stream, rawTarget);
}

export function buildGtpuInnerFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4UdpTarget(stream);
  const innerIpv4Offset = rawTarget?.innerIpOffset ?? gtpuInnerIpv4Offset(stream);
  const innerUdpOffset = innerIpv4Offset + 20;
  if (rawTarget && rawTarget.innerUdpOffset !== null) {
    const innerUdpOffset = rawTarget.innerUdpOffset;
    return {
      instructions: [
        {
          init_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4),
          max_value: Math.min(4_294_967_295, rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4) + stream.gtpu_inner_ipv4_src_count - 1),
          min_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4SrcOffset, 4),
          name: "gtpu_inner_ipv4_src",
          op: "inc",
          size: 4,
          step: stream.gtpu_inner_ipv4_src_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gtpu_inner_ipv4_src",
          pkt_offset: rawTarget.innerIpv4SrcOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4),
          max_value: Math.min(4_294_967_295, rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4) + stream.gtpu_inner_ipv4_dst_count - 1),
          min_value: rawPacketNumberValue(rawTarget.bytes, rawTarget.innerIpv4DstOffset, 4),
          name: "gtpu_inner_ipv4_dst",
          op: "inc",
          size: 4,
          step: stream.gtpu_inner_ipv4_dst_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gtpu_inner_ipv4_dst",
          pkt_offset: rawTarget.innerIpv4DstOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawTarget.innerUdpSrcPort ?? 0,
          max_value: Math.min(65_535, (rawTarget.innerUdpSrcPort ?? 0) + stream.gtpu_inner_l4_src_port_count - 1),
          min_value: rawTarget.innerUdpSrcPort ?? 0,
          name: "gtpu_inner_udp_src",
          op: "inc",
          size: 2,
          step: stream.gtpu_inner_l4_src_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gtpu_inner_udp_src",
          pkt_offset: innerUdpOffset,
          type: "write_flow_var"
        },
        {
          init_value: rawTarget.innerUdpDstPort ?? 0,
          max_value: Math.min(65_535, (rawTarget.innerUdpDstPort ?? 0) + stream.gtpu_inner_l4_dst_port_count - 1),
          min_value: rawTarget.innerUdpDstPort ?? 0,
          name: "gtpu_inner_udp_dst",
          op: "inc",
          size: 2,
          step: stream.gtpu_inner_l4_dst_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gtpu_inner_udp_dst",
          pkt_offset: innerUdpOffset + 2,
          type: "write_flow_var"
        },
        gtpuInnerChecksumInstruction(stream, rawTarget)
      ],
      split_by_var: "gtpu_inner_ipv4_src"
    };
  }
  return buildStructuredInnerIpv4UdpFiveTupleVmBody({
    checksumInstruction: gtpuInnerChecksumInstruction(stream, rawTarget),
    dstAddress: stream.gtpu_inner_ipv4_dst,
    dstAddressCount: stream.gtpu_inner_ipv4_dst_count,
    dstAddressStep: stream.gtpu_inner_ipv4_dst_step,
    dstPort: stream.gtpu_inner_l4_dst_port,
    dstPortCount: stream.gtpu_inner_l4_dst_port_count,
    dstPortStep: stream.gtpu_inner_l4_dst_port_step,
    innerIpv4Offset,
    innerUdpOffset,
    prefix: "gtpu_inner",
    srcAddress: stream.gtpu_inner_ipv4_src,
    srcAddressCount: stream.gtpu_inner_ipv4_src_count,
    srcAddressStep: stream.gtpu_inner_ipv4_src_step,
    srcPort: stream.gtpu_inner_l4_src_port,
    srcPortCount: stream.gtpu_inner_l4_src_port_count,
    srcPortStep: stream.gtpu_inner_l4_src_port_step
  });
}

function buildGtpuInnerIpv4AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4AddressTarget(stream);
  const address = rawTarget
    ? field === "src" ? rawTarget.innerIpv4Src : rawTarget.innerIpv4Dst
    : field === "src" ? stream.gtpu_inner_ipv4_src : stream.gtpu_inner_ipv4_dst;
  const count = field === "src" ? stream.gtpu_inner_ipv4_src_count : stream.gtpu_inner_ipv4_dst_count;
  const step = field === "src" ? stream.gtpu_inner_ipv4_src_step : stream.gtpu_inner_ipv4_dst_step;
  const suffix = ipv4FieldEngineSuffix(address, count);
  const baseOffset = rawTarget
    ? field === "src" ? rawTarget.innerIpv4SrcOffset : rawTarget.innerIpv4DstOffset
    : gtpuInnerIpv4Offset(stream) + (field === "dst" ? 16 : 12);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: `gtpu_inner_ipv4_${field}`,
    pktOffset: baseOffset + 4 - suffix.size,
    size: suffix.size,
    step
  });
}

export function buildGtpuInnerIpv4SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv4AddressIncVmBody(stream, "src");
}

export function buildGtpuInnerIpv4DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv4AddressIncVmBody(stream, "dst");
}

export function buildGtpuInnerIpv4TtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.gtpu_inner_ipv4_ttl_count,
    initValue: rawTarget ? rawTarget.innerIpv4Ttl : stream.gtpu_inner_ipv4_ttl,
    maxLimit: 255,
    name: "gtpu_inner_ipv4_ttl",
    pktOffset: rawTarget?.innerIpv4TtlOffset ?? gtpuInnerIpv4Offset(stream) + 8,
    size: 1,
    step: stream.gtpu_inner_ipv4_ttl_step
  });
}

export function buildGtpuInnerIpv4IdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4IdIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_id_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_id_step,
    variableName: "gtpu_inner_ipv4_id"
  });
}

export function buildGtpuInnerIpv4DscpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4DscpIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_dscp_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_dscp_step,
    variableName: "gtpu_inner_ipv4_dscp"
  });
}

export function buildGtpuInnerIpv4EcnIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4EcnIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_ecn_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_ecn_step,
    variableName: "gtpu_inner_ipv4_ecn"
  });
}

export function buildGtpuInnerIpv4FragmentOffsetIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4FragmentOffsetIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    count: stream.ipv4_fragment_offset_count,
    innerIpOffset: rawTarget.innerIpOffset,
    step: stream.ipv4_fragment_offset_step,
    variableName: "gtpu_inner_ipv4_fragment_offset"
  });
}

function buildGtpuInnerIpv4FlagVaryVmBody(stream: ProfileWorkbenchStream, target: "reserved" | "df" | "mf"): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv4FlagVaryVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: gtpuInnerIpv4ChecksumInstruction(stream, rawTarget),
    innerIpOffset: rawTarget.innerIpOffset,
    target,
    variablePrefix: "gtpu_inner_ipv4"
  });
}

export function buildGtpuInnerIpv4ReservedFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv4FlagVaryVmBody(stream, "reserved");
}

export function buildGtpuInnerIpv4DfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv4FlagVaryVmBody(stream, "df");
}

export function buildGtpuInnerIpv4MfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv4FlagVaryVmBody(stream, "mf");
}

function buildGtpuInnerIpv6AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv6AddressTarget(stream);
  const address = rawTarget
    ? field === "src" ? rawTarget.innerIpv6Src : rawTarget.innerIpv6Dst
    : field === "src" ? stream.gtpu_inner_ipv6_src : stream.gtpu_inner_ipv6_dst;
  const count = field === "src" ? stream.gtpu_inner_ipv6_src_count : stream.gtpu_inner_ipv6_dst_count;
  const step = field === "src" ? stream.gtpu_inner_ipv6_src_step : stream.gtpu_inner_ipv6_dst_step;
  const baseOffset = rawTarget
    ? field === "src" ? rawTarget.innerIpv6SrcOffset : rawTarget.innerIpv6DstOffset
    : gtpuInnerIpv4Offset(stream) + (field === "dst" ? 24 : 8);
  return buildIpv6AddressIncVmBody({
    address,
    baseOffset,
    checksumInstruction: gtpuInnerChecksumInstruction(stream, rawTarget, rawTarget?.innerTcpOffset !== null && rawTarget?.innerTcpOffset !== undefined ? 13 : 11),
    count,
    name: `gtpu_inner_ipv6_${field}`,
    step
  });
}

export function buildGtpuInnerIpv6SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv6AddressIncVmBody(stream, "src");
}

export function buildGtpuInnerIpv6DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerIpv6AddressIncVmBody(stream, "dst");
}

export function buildGtpuInnerIpv6HopLimitIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv6Target(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.gtpu_inner_ipv6_hop_limit_count,
    initValue: rawTarget ? rawTarget.innerIpv6HopLimit : stream.gtpu_inner_ipv6_hop_limit,
    maxLimit: 255,
    name: "gtpu_inner_ipv6_hop_limit",
    pktOffset: rawTarget?.innerIpv6HopLimitOffset ?? gtpuInnerIpv4Offset(stream) + 7,
    size: 1,
    step: stream.gtpu_inner_ipv6_hop_limit_step
  });
}

export function buildGtpuInnerIpv6TrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6TrafficClassIncVmBody(
    rawTarget.bytes,
    rawTarget.innerIpOffset,
    "gtpu_inner_ipv6_traffic_class",
    stream.ipv6_traffic_class_count,
    stream.ipv6_traffic_class_step
  );
}

export function buildGtpuInnerIpv6FlowLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6FlowLabelIncVmBody(
    rawTarget.bytes,
    rawTarget.innerIpOffset,
    "gtpu_inner_ipv6_flow_label",
    stream.ipv6_flow_label_count,
    stream.ipv6_flow_label_step
  );
}

function buildGtpuInnerUdpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4UdpTarget(stream) ?? rawGtpuInnerIpv6UdpTarget(stream);
  const initValue = rawTarget
    ? field === "src" ? rawTarget.innerUdpSrcPort ?? 0 : rawTarget.innerUdpDstPort ?? 0
    : field === "src" ? stream.gtpu_inner_l4_src_port : stream.gtpu_inner_l4_dst_port;
  const count = field === "src" ? stream.gtpu_inner_l4_src_port_count : stream.gtpu_inner_l4_dst_port_count;
  const step = field === "src" ? stream.gtpu_inner_l4_src_port_step : stream.gtpu_inner_l4_dst_port_step;
  const innerL3Length = stream.gtpu_inner_ip_version === "IPv6" ? 40 : 20;
  const udpFieldOffset = rawTarget && rawTarget.innerUdpOffset !== null
    ? rawTarget.innerUdpOffset + (field === "dst" ? 2 : 0)
    : gtpuInnerIpv4Offset(stream) + innerL3Length + (field === "dst" ? 2 : 0);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: gtpuInnerChecksumInstruction(stream, rawTarget),
    count,
    initValue,
    maxLimit: 65_535,
    name: `gtpu_inner_udp_${field}`,
    pktOffset: udpFieldOffset,
    size: 2,
    step
  });
}

export function buildGtpuInnerUdpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerUdpPortIncVmBody(stream, "src");
}

export function buildGtpuInnerUdpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerUdpPortIncVmBody(stream, "dst");
}

function buildGtpuInnerTcpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGtpuInnerIpv4TcpTarget(stream) ?? rawGtpuInnerIpv6TcpTarget(stream);
  const tcpOffset = rawTarget?.innerTcpOffset ?? null;
  if (!rawTarget || tcpOffset === null) {
    return advancedVmDefaultBody;
  }
  const fieldOffset = tcpOffset + (field === "dst" ? 2 : 0);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: gtpuInnerChecksumInstruction(stream, rawTarget, 13),
    count: field === "src" ? stream.gtpu_inner_l4_src_port_count : stream.gtpu_inner_l4_dst_port_count,
    initValue: rawPacketWord(rawTarget.bytes, fieldOffset),
    maxLimit: 65_535,
    name: `gtpu_inner_tcp_${field}`,
    pktOffset: fieldOffset,
    size: 2,
    step: field === "src" ? stream.gtpu_inner_l4_src_port_step : stream.gtpu_inner_l4_dst_port_step
  });
}

export function buildGtpuInnerTcpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerTcpPortIncVmBody(stream, "src");
}

export function buildGtpuInnerTcpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGtpuInnerTcpPortIncVmBody(stream, "dst");
}


export function isOuterIpv4GtpuInnerUdpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawGtpuInnerIpv4UdpTarget(stream)
      || rawGtpuInnerIpv6UdpTarget(stream)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled)
  );
}

export function isOuterIpv4GtpuInnerTcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGtpuInnerIpv4TcpTarget(stream) || rawGtpuInnerIpv6TcpTarget(stream));
}

export function isOuterIpv4GtpuInnerIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawGtpuInnerIpv4UdpTarget(stream)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4GtpuInnerIpv4AddressStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawGtpuInnerIpv4AddressTarget(stream)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4GtpuInnerIpv4TtlStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawGtpuInnerIpv4Target(stream)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4GtpuInnerRawIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGtpuInnerIpv4Target(stream));
}

export function isOuterIpv4GtpuInnerIpv6Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawGtpuInnerIpv6Target(stream)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_inner_ip_version === "IPv6")
  );
}

export function isOuterIpv4GtpuInnerRawIpv6Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGtpuInnerIpv6Target(stream));
}

export function isOuterIpv4GtpuInnerIpv6SrcVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuInnerIpv6AddressTarget(stream);
  if (stream && rawGtpuInnerIpv6Target(stream) && !rawTarget) {
    return false;
  }
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Src, largeUnitCountNumber(stream.gtpu_inner_ipv6_src_count)) !== null;
  }
  return Boolean(
    isOuterIpv4GtpuInnerIpv6Stream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.gtpu_inner_ipv6_src, stream?.gtpu_inner_ipv6_src_count)
  );
}

export function isOuterIpv4GtpuInnerIpv6DstVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuInnerIpv6AddressTarget(stream);
  if (stream && rawGtpuInnerIpv6Target(stream) && !rawTarget) {
    return false;
  }
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Dst, largeUnitCountNumber(stream.gtpu_inner_ipv6_dst_count)) !== null;
  }
  return Boolean(
    isOuterIpv4GtpuInnerIpv6Stream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.gtpu_inner_ipv6_dst, stream?.gtpu_inner_ipv6_dst_count)
  );
}

export function isOuterIpv4GtpuSequenceStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return Boolean(
    (rawTarget && rawTarget.sequenceOffset !== null)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_sequence_enabled)
  );
}

export function isOuterIpv4GtpuNpduStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return Boolean(
    (rawTarget && rawTarget.npduOffset !== null)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_npdu_enabled)
  );
}

export function isOuterIpv4GtpuExtensionStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return Boolean(
    (rawTarget && rawTarget.extensionUdpPortOffset !== null)
      || (isStructuredOuterIpv4GtpuStream(stream) && stream?.gtpu_enabled && stream.gtpu_extension_enabled)
  );
}

export function isStructuredOuterIpv4VxlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && stream.packet_type === "Ethernet/IPv4/UDP"
      && stream.vxlan_enabled
      && !stream.gtpu_enabled
  );
}

export function isOuterIpv4VxlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return Boolean(rawTarget || isStructuredOuterIpv4VxlanStream(stream));
}

function vxlanVniOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawVxlanTarget> = rawVxlanTarget(stream)) {
  return rawTarget?.vniOffset ?? outerUdpPayloadOffset(stream) + 4;
}

function vxlanFlagsOffset(stream: ProfileWorkbenchStream, rawTarget: ReturnType<typeof rawVxlanTarget> = rawVxlanTarget(stream)) {
  return rawTarget?.vxlanOffset ?? vxlanVniOffset(stream, rawTarget) - 4;
}

export function buildVxlanVniIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanTarget(stream);
  const initValue = rawTarget?.vni ?? stream.vxlan_vni;
  const bounds = advancedNumberBounds(initValue, stream.vxlan_vni_count, stream.vxlan_vni_step, 16_777_215);
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: bounds.max,
        min_value: bounds.min,
        name: "vxlan_vni",
        op: "inc",
        size: 4,
        step: stream.vxlan_vni_step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xFFFFFF00,
        name: "vxlan_vni",
        pkt_cast_size: 4,
        pkt_offset: vxlanVniOffset(stream, rawTarget),
        shift: 8,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "vxlan_vni"
  };
}

export function buildVxlanIFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawVxlanTarget(stream);
  const flags = rawTarget ? rawTarget.bytes[rawTarget.vxlanOffset] ?? 0 : 0x08;
  const initValue = (flags & 0x08) >>> 3;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: 1,
        min_value: 0,
        name: "vxlan_i_flag",
        op: initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x08,
        name: "vxlan_i_flag",
        pkt_cast_size: 1,
        pkt_offset: vxlanFlagsOffset(stream, rawTarget),
        shift: 3,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "vxlan_i_flag"
  };
}

export function isOuterIpv4VxlanInnerEthernetStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerEthernetTarget(stream) || isStructuredOuterIpv4VxlanStream(stream));
}

export function isOuterIpv4VxlanInnerVlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerVlanTagTarget(stream));
}

export function isOuterIpv4VxlanInnerSecondVlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerVlanTagTarget(stream, 2));
}

export function isOuterIpv4VxlanInnerArpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerArpTarget(stream));
}

export function isOuterIpv4VxlanInnerUdpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawVxlanInnerIpv4UdpTarget(stream)
      || rawVxlanInnerIpv6UdpTarget(stream)
      || isStructuredOuterIpv4VxlanStream(stream)
  );
}

export function isOuterIpv4VxlanInnerTcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerIpv4TcpTarget(stream) || rawVxlanInnerIpv6TcpTarget(stream));
}

export function isOuterIpv4VxlanInnerIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawVxlanInnerIpv4UdpTarget(stream)
      || (isStructuredOuterIpv4VxlanStream(stream) && stream?.vxlan_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4VxlanInnerRawIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerIpv4Target(stream));
}

export function isOuterIpv4VxlanInnerIpv4AddressStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawVxlanInnerIpv4AddressTarget(stream)
      || (isStructuredOuterIpv4VxlanStream(stream) && stream?.vxlan_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4VxlanInnerIpv4TtlStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawVxlanInnerIpv4Target(stream)
      || (isStructuredOuterIpv4VxlanStream(stream) && stream?.vxlan_inner_ip_version === "IPv4")
  );
}

export function isOuterIpv4VxlanInnerIpv6Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    rawVxlanInnerIpv6Target(stream)
      || (isStructuredOuterIpv4VxlanStream(stream) && stream?.vxlan_inner_ip_version === "IPv6")
  );
}

export function isOuterIpv4VxlanInnerRawIpv6Stream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVxlanInnerIpv6Target(stream));
}

export function isOuterIpv4VxlanInnerIpv6SrcVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanInnerIpv6AddressTarget(stream);
  if (stream && rawVxlanInnerIpv6Target(stream) && !rawTarget) {
    return false;
  }
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Src, largeUnitCountNumber(stream.vxlan_inner_ipv6_src_count)) !== null;
  }
  return Boolean(
    isOuterIpv4VxlanInnerIpv6Stream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.vxlan_inner_ipv6_src, stream?.vxlan_inner_ipv6_src_count)
  );
}

export function isOuterIpv4VxlanInnerIpv6DstVmStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanInnerIpv6AddressTarget(stream);
  if (stream && rawVxlanInnerIpv6Target(stream) && !rawTarget) {
    return false;
  }
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Dst, largeUnitCountNumber(stream.vxlan_inner_ipv6_dst_count)) !== null;
  }
  return Boolean(
    isOuterIpv4VxlanInnerIpv6Stream(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.vxlan_inner_ipv6_dst, stream?.vxlan_inner_ipv6_dst_count)
  );
}

export function isGreStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawOuterGreTarget(stream);
  return Boolean(
    (rawTarget && !rawTarget.checksumPresent)
      || (
        stream
        && stream.packet_type === "Ethernet/IPv4/GRE"
        && !stream.vxlan_enabled
        && !stream.gtpu_enabled
        && !stream.gre_checksum_present
      )
  );
}

export function isGreKeyStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGreOptionTarget(stream, "key") || (isGreStreamWithoutGreChecksum(stream) && stream?.gre_key_present));
}

export function isGreSequenceStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGreOptionTarget(stream, "sequence") || (isGreStreamWithoutGreChecksum(stream) && stream?.gre_sequence_present));
}

function buildGreNumberIncVmBody(stream: ProfileWorkbenchStream, field: "key" | "sequence"): AdvancedVmBody {
  const rawTarget = rawGreOptionTarget(stream, field);
  const initValue = rawTarget?.value ?? (field === "key" ? stream.gre_key : stream.gre_sequence);
  const count = field === "key" ? stream.gre_key_count : stream.gre_sequence_count;
  const step = field === "key" ? stream.gre_key_step : stream.gre_sequence_step;
  return buildAdvancedNumberWriteVmBody({
    count,
    initValue,
    maxLimit: 4_294_967_295,
    name: `gre_${field}`,
    pktOffset: rawTarget?.offset ?? greOptionOffset(stream, field),
    size: 4,
    step
  });
}

export function buildGreProtocolTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterGreTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: 16,
    initValue: rawTarget ? rawTarget.protocolType : parseHexWord(stream.gre_protocol_type),
    maxLimit: 65_535,
    name: "gre_protocol_type",
    pktOffset: rawTarget ? rawTarget.greOffset + 2 : outerL4Offset(stream) + 2,
    size: 2,
    step: 1
  });
}

export function buildGreKeyIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreNumberIncVmBody(stream, "key");
}

export function buildGreSequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreNumberIncVmBody(stream, "sequence");
}

export function isIpv4GreStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  if (rawOuterGreTarget(stream)) {
    return rawGreInnerIpv4Target(stream, true) !== null;
  }
  return Boolean(
    isGreStreamWithoutGreChecksum(stream)
      && stream
      && stream.gre_protocol_type === "0800"
      && stream.gre_inner_ip_version === "IPv4"
  );
}

export function isIpv4GreAddressStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  if (rawOuterGreTarget(stream)) {
    return rawGreInnerIpv4AddressTarget(stream) !== null;
  }
  return Boolean(
    isGreStreamWithoutGreChecksum(stream)
      && stream
      && stream.gre_protocol_type === "0800"
      && stream.gre_inner_ip_version === "IPv4"
  );
}

export function isIpv4GreTtlStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  if (rawOuterGreTarget(stream)) {
    return rawGreInnerIpv4Target(stream) !== null;
  }
  return Boolean(
    isGreStreamWithoutGreChecksum(stream)
      && stream
      && stream.gre_protocol_type === "0800"
      && stream.gre_inner_ip_version === "IPv4"
  );
}

export function isRawIpv4GreStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGreInnerIpv4Target(stream));
}

export function isIpv6GreStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  if (rawOuterGreTarget(stream)) {
    return rawGreInnerIpv6Target(stream) !== null;
  }
  return Boolean(
    isGreStreamWithoutGreChecksum(stream)
      && stream
      && stream.gre_protocol_type === "86DD"
      && stream.gre_inner_ip_version === "IPv6"
  );
}

export function isRawIpv6GreStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGreInnerIpv6Target(stream));
}

export function isIpv6GreSrcVmStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGreInnerIpv6UdpTarget(stream) ?? rawGreInnerIpv6TcpTarget(stream);
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Src, largeUnitCountNumber(stream.gre_inner_ipv6_src_count)) !== null;
  }
  if (rawGreInnerIpv6Target(stream)) {
    return false;
  }
  return Boolean(
    isIpv6GreStreamWithoutGreChecksum(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.gre_inner_ipv6_src, stream?.gre_inner_ipv6_src_count)
  );
}

export function isIpv6GreDstVmStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGreInnerIpv6UdpTarget(stream) ?? rawGreInnerIpv6TcpTarget(stream);
  if (stream && rawTarget) {
    return ipv6FieldEngineSuffix(rawTarget.innerIpv6Dst, largeUnitCountNumber(stream.gre_inner_ipv6_dst_count)) !== null;
  }
  if (rawGreInnerIpv6Target(stream)) {
    return false;
  }
  return Boolean(
    isIpv6GreStreamWithoutGreChecksum(stream)
      && isSafeIpv6AddressVmTarget(stream, stream?.gre_inner_ipv6_dst, stream?.gre_inner_ipv6_dst_count)
  );
}

export function isGreInnerUdpStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  if (rawGreInnerIpv4Target(stream) || rawGreInnerIpv6Target(stream)) {
    return Boolean(rawGreInnerIpv4UdpTarget(stream) || rawGreInnerIpv6UdpTarget(stream));
  }
  return Boolean(
    isIpv4GreStreamWithoutGreChecksum(stream)
      || isIpv6GreStreamWithoutGreChecksum(stream)
  );
}

export function isGreInnerTcpStreamWithoutGreChecksum(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawGreInnerIpv4TcpTarget(stream) || rawGreInnerIpv6TcpTarget(stream));
}

function greOptionLength(stream: ProfileWorkbenchStream) {
  return (stream.gre_checksum_present ? 4 : 0) + (stream.gre_key_present ? 4 : 0) + (stream.gre_sequence_present ? 4 : 0);
}

export function greOptionOffset(stream: ProfileWorkbenchStream, field: "key" | "sequence") {
  let offset = outerIpv4Offset(stream) + 20 + 4;
  if (stream.gre_checksum_present) {
    offset += 4;
  }
  if (field === "key") {
    return offset;
  }
  if (stream.gre_key_present) {
    offset += 4;
  }
  return offset;
}

export function greInnerIpv4Offset(stream: ProfileWorkbenchStream) {
  return workbenchOuterL2HeaderLength(stream) + 24 + greOptionLength(stream);
}

export function greInnerChecksumInstruction(stream: ProfileWorkbenchStream) {
  return {
    l2_len: greInnerIpv4Offset(stream),
    l3_len: stream.gre_inner_ip_version === "IPv6" ? 40 : 20,
    l4_type: 11,
    type: "fix_checksum_hw"
  };
}

export function buildGreInnerFiveTupleVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4UdpTarget(stream);
  if (rawTarget) {
    const srcSuffix = ipv4FieldEngineSuffix(formatPacketIpv4(rawTarget.bytes, rawTarget.innerL3Offset + 12), stream.gre_inner_ipv4_src_count);
    const dstSuffix = ipv4FieldEngineSuffix(formatPacketIpv4(rawTarget.bytes, rawTarget.innerL3Offset + 16), stream.gre_inner_ipv4_dst_count);
    const srcPort = rawPacketWord(rawTarget.bytes, rawTarget.udpOffset);
    const dstPort = rawPacketWord(rawTarget.bytes, rawTarget.udpOffset + 2);
    return {
      instructions: [
        {
          init_value: srcSuffix.initValue,
          max_value: Math.min(fieldEngineMaxForSize(srcSuffix.size), srcSuffix.initValue + stream.gre_inner_ipv4_src_count - 1),
          min_value: srcSuffix.initValue,
          name: "gre_inner_ipv4_src",
          op: "inc",
          size: srcSuffix.size,
          step: stream.gre_inner_ipv4_src_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gre_inner_ipv4_src",
          pkt_offset: rawTarget.innerL3Offset + 16 - srcSuffix.size,
          type: "write_flow_var"
        },
        {
          init_value: dstSuffix.initValue,
          max_value: Math.min(fieldEngineMaxForSize(dstSuffix.size), dstSuffix.initValue + stream.gre_inner_ipv4_dst_count - 1),
          min_value: dstSuffix.initValue,
          name: "gre_inner_ipv4_dst",
          op: "inc",
          size: dstSuffix.size,
          step: stream.gre_inner_ipv4_dst_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gre_inner_ipv4_dst",
          pkt_offset: rawTarget.innerL3Offset + 20 - dstSuffix.size,
          type: "write_flow_var"
        },
        {
          init_value: srcPort,
          max_value: Math.min(65_535, srcPort + stream.gre_inner_l4_src_port_count - 1),
          min_value: srcPort,
          name: "gre_inner_udp_src",
          op: "inc",
          size: 2,
          step: stream.gre_inner_l4_src_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gre_inner_udp_src",
          pkt_offset: rawTarget.udpOffset,
          type: "write_flow_var"
        },
        {
          init_value: dstPort,
          max_value: Math.min(65_535, dstPort + stream.gre_inner_l4_dst_port_count - 1),
          min_value: dstPort,
          name: "gre_inner_udp_dst",
          op: "inc",
          size: 2,
          step: stream.gre_inner_l4_dst_port_step,
          type: "flow_var"
        },
        {
          is_big_endian: true,
          name: "gre_inner_udp_dst",
          pkt_offset: rawTarget.udpOffset + 2,
          type: "write_flow_var"
        },
        rawGreInnerIpv4ChecksumInstruction(rawTarget)
      ],
      split_by_var: "gre_inner_ipv4_src"
    };
  }
  const innerIpv4Offset = greInnerIpv4Offset(stream);
  const innerUdpOffset = innerIpv4Offset + 20;
  return buildStructuredInnerIpv4UdpFiveTupleVmBody({
    checksumInstruction: greInnerChecksumInstruction(stream),
    dstAddress: stream.gre_inner_ipv4_dst,
    dstAddressCount: stream.gre_inner_ipv4_dst_count,
    dstAddressStep: stream.gre_inner_ipv4_dst_step,
    dstPort: stream.gre_inner_l4_dst_port,
    dstPortCount: stream.gre_inner_l4_dst_port_count,
    dstPortStep: stream.gre_inner_l4_dst_port_step,
    innerIpv4Offset,
    innerUdpOffset,
    prefix: "gre_inner",
    srcAddress: stream.gre_inner_ipv4_src,
    srcAddressCount: stream.gre_inner_ipv4_src_count,
    srcAddressStep: stream.gre_inner_ipv4_src_step,
    srcPort: stream.gre_inner_l4_src_port,
    srcPortCount: stream.gre_inner_l4_src_port_count,
    srcPortStep: stream.gre_inner_l4_src_port_step
  });
}

function buildGreInnerIpv4AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4AddressTarget(stream);
  const address = rawTarget
    ? formatPacketIpv4(rawTarget.bytes, rawTarget.innerL3Offset + (field === "dst" ? 16 : 12))
    : field === "src" ? stream.gre_inner_ipv4_src : stream.gre_inner_ipv4_dst;
  const count = field === "src" ? stream.gre_inner_ipv4_src_count : stream.gre_inner_ipv4_dst_count;
  const step = field === "src" ? stream.gre_inner_ipv4_src_step : stream.gre_inner_ipv4_dst_step;
  const suffix = ipv4FieldEngineSuffix(address, count);
  const baseOffset = rawTarget?.innerL3Offset ?? greInnerIpv4Offset(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget ? rawGreInnerIpv4ChecksumInstruction(rawTarget) : greInnerChecksumInstruction(stream),
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: `gre_inner_ipv4_${field}`,
    pktOffset: baseOffset + (field === "dst" ? 20 : 16) - suffix.size,
    size: suffix.size,
    step
  });
}

export function buildGreInnerIpv4SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv4AddressIncVmBody(stream, "src");
}

export function buildGreInnerIpv4DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv4AddressIncVmBody(stream, "dst");
}

export function buildGreInnerIpv4TtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget ? rawGreInnerIpv4ChecksumInstruction(rawTarget) : greInnerChecksumInstruction(stream),
    count: stream.gre_inner_ipv4_ttl_count,
    initValue: rawTarget ? rawTarget.bytes[rawTarget.innerL3Offset + 8] ?? stream.gre_inner_ipv4_ttl : stream.gre_inner_ipv4_ttl,
    maxLimit: 255,
    name: "gre_inner_ipv4_ttl",
    pktOffset: (rawTarget?.innerL3Offset ?? greInnerIpv4Offset(stream)) + 8,
    size: 1,
    step: stream.gre_inner_ipv4_ttl_step
  });
}

export function buildGreInnerIpv4IdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const checksumTarget = rawGreInnerIpv4AddressTarget(stream) ?? rawTarget;
  return buildRawInnerIpv4IdIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: rawGreInnerIpv4ChecksumInstruction(checksumTarget),
    count: stream.ipv4_id_count,
    innerIpOffset: rawTarget.innerL3Offset,
    step: stream.ipv4_id_step,
    variableName: "gre_inner_ipv4_id"
  });
}

export function buildGreInnerIpv4DscpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const checksumTarget = rawGreInnerIpv4AddressTarget(stream) ?? rawTarget;
  return buildRawInnerIpv4DscpIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: rawGreInnerIpv4ChecksumInstruction(checksumTarget),
    count: stream.ipv4_dscp_count,
    innerIpOffset: rawTarget.innerL3Offset,
    step: stream.ipv4_dscp_step,
    variableName: "gre_inner_ipv4_dscp"
  });
}

export function buildGreInnerIpv4EcnIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const checksumTarget = rawGreInnerIpv4AddressTarget(stream) ?? rawTarget;
  return buildRawInnerIpv4EcnIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: rawGreInnerIpv4ChecksumInstruction(checksumTarget),
    count: stream.ipv4_ecn_count,
    innerIpOffset: rawTarget.innerL3Offset,
    step: stream.ipv4_ecn_step,
    variableName: "gre_inner_ipv4_ecn"
  });
}

export function buildGreInnerIpv4FragmentOffsetIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const checksumTarget = rawGreInnerIpv4AddressTarget(stream) ?? rawTarget;
  return buildRawInnerIpv4FragmentOffsetIncVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: rawGreInnerIpv4ChecksumInstruction(checksumTarget),
    count: stream.ipv4_fragment_offset_count,
    innerIpOffset: rawTarget.innerL3Offset,
    step: stream.ipv4_fragment_offset_step,
    variableName: "gre_inner_ipv4_fragment_offset"
  });
}

function buildGreInnerIpv4FlagVaryVmBody(stream: ProfileWorkbenchStream, target: "reserved" | "df" | "mf"): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const checksumTarget = rawGreInnerIpv4AddressTarget(stream) ?? rawTarget;
  return buildRawInnerIpv4FlagVaryVmBody({
    bytes: rawTarget.bytes,
    checksumInstruction: rawGreInnerIpv4ChecksumInstruction(checksumTarget),
    innerIpOffset: rawTarget.innerL3Offset,
    target,
    variablePrefix: "gre_inner_ipv4"
  });
}

export function buildGreInnerIpv4ReservedFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv4FlagVaryVmBody(stream, "reserved");
}

export function buildGreInnerIpv4DfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv4FlagVaryVmBody(stream, "df");
}

export function buildGreInnerIpv4MfFlagVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv4FlagVaryVmBody(stream, "mf");
}

function buildGreInnerIpv6AddressIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv6UdpTarget(stream) ?? rawGreInnerIpv6TcpTarget(stream);
  const address = rawTarget
    ? field === "src" ? rawTarget.innerIpv6Src : rawTarget.innerIpv6Dst
    : field === "src" ? stream.gre_inner_ipv6_src : stream.gre_inner_ipv6_dst;
  const count = field === "src" ? stream.gre_inner_ipv6_src_count : stream.gre_inner_ipv6_dst_count;
  const step = field === "src" ? stream.gre_inner_ipv6_src_step : stream.gre_inner_ipv6_dst_step;
  const baseOffset = rawTarget
    ? field === "src" ? rawTarget.innerIpv6SrcOffset : rawTarget.innerIpv6DstOffset
    : greInnerIpv4Offset(stream) + (field === "dst" ? 24 : 8);
  return buildIpv6AddressIncVmBody({
    address,
    baseOffset,
    checksumInstruction: rawTarget ? rawGreInnerChecksumInstruction(rawTarget, rawTarget.innerProtocol === 6 ? 13 : 11) : greInnerChecksumInstruction(stream),
    count,
    name: `gre_inner_ipv6_${field}`,
    step
  });
}

export function buildGreInnerIpv6SrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv6AddressIncVmBody(stream, "src");
}

export function buildGreInnerIpv6DstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerIpv6AddressIncVmBody(stream, "dst");
}

export function buildGreInnerIpv6HopLimitIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv6Target(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.gre_inner_ipv6_hop_limit_count,
    initValue: rawTarget ? rawTarget.innerIpv6HopLimit : stream.gre_inner_ipv6_hop_limit,
    maxLimit: 255,
    name: "gre_inner_ipv6_hop_limit",
    pktOffset: rawTarget?.innerIpv6HopLimitOffset ?? greInnerIpv4Offset(stream) + 7,
    size: 1,
    step: stream.gre_inner_ipv6_hop_limit_step
  });
}

export function buildGreInnerIpv6TrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6TrafficClassIncVmBody(
    rawTarget.bytes,
    rawTarget.innerL3Offset,
    "gre_inner_ipv6_traffic_class",
    stream.ipv6_traffic_class_count,
    stream.ipv6_traffic_class_step
  );
}

export function buildGreInnerIpv6FlowLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv6Target(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  return buildRawInnerIpv6FlowLabelIncVmBody(
    rawTarget.bytes,
    rawTarget.innerL3Offset,
    "gre_inner_ipv6_flow_label",
    stream.ipv6_flow_label_count,
    stream.ipv6_flow_label_step
  );
}

function buildGreInnerUdpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4UdpTarget(stream) ?? rawGreInnerIpv6UdpTarget(stream);
  const initValue = rawTarget
    ? rawPacketWord(rawTarget.bytes, rawTarget.udpOffset + (field === "dst" ? 2 : 0))
    : field === "src" ? stream.gre_inner_l4_src_port : stream.gre_inner_l4_dst_port;
  const count = field === "src" ? stream.gre_inner_l4_src_port_count : stream.gre_inner_l4_dst_port_count;
  const step = field === "src" ? stream.gre_inner_l4_src_port_step : stream.gre_inner_l4_dst_port_step;
  const innerL3Length = stream.gre_inner_ip_version === "IPv6" ? 40 : 20;
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget ? rawGreInnerChecksumInstruction(rawTarget) : greInnerChecksumInstruction(stream),
    count,
    initValue,
    maxLimit: 65_535,
    name: `gre_inner_udp_${field}`,
    pktOffset: rawTarget ? rawTarget.udpOffset + (field === "dst" ? 2 : 0) : greInnerIpv4Offset(stream) + innerL3Length + (field === "dst" ? 2 : 0),
    size: 2,
    step
  });
}

export function buildGreInnerUdpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerUdpPortIncVmBody(stream, "src");
}

export function buildGreInnerUdpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerUdpPortIncVmBody(stream, "dst");
}

function buildGreInnerTcpPortIncVmBody(stream: ProfileWorkbenchStream, field: "src" | "dst"): AdvancedVmBody {
  const rawTarget = rawGreInnerIpv4TcpTarget(stream) ?? rawGreInnerIpv6TcpTarget(stream);
  if (!rawTarget) {
    return advancedVmDefaultBody;
  }
  const fieldOffset = rawTarget.tcpOffset + (field === "dst" ? 2 : 0);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawGreInnerChecksumInstruction(rawTarget, 13),
    count: field === "src" ? stream.gre_inner_l4_src_port_count : stream.gre_inner_l4_dst_port_count,
    initValue: rawPacketWord(rawTarget.bytes, fieldOffset),
    maxLimit: 65_535,
    name: `gre_inner_tcp_${field}`,
    pktOffset: fieldOffset,
    size: 2,
    step: field === "src" ? stream.gre_inner_l4_src_port_step : stream.gre_inner_l4_dst_port_step
  });
}

export function buildGreInnerTcpSrcPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerTcpPortIncVmBody(stream, "src");
}

export function buildGreInnerTcpDstPortIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildGreInnerTcpPortIncVmBody(stream, "dst");
}


export function buildIpv4RouterAlertIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv4RouterAlertTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: {
      pkt_offset: target.ipv4Offset,
      type: "fix_checksum_ipv4"
    },
    count: 4,
    initValue: target.value,
    maxLimit: 65_535,
    name: "ipv4_router_alert",
    pktOffset: target.valueOffset,
    size: 2,
    step: 1
  });
}

type Ipv4OptionTypeField = "class" | "copied" | "number";

function buildIpv4OptionTypeMaskedVmBody(stream: ProfileWorkbenchStream, field: Ipv4OptionTypeField): AdvancedVmBody {
  const target = ipv4OptionTypeTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const spec = {
    class: { count: 4, mask: 0x60, max: 3, shift: 5, variableName: "ipv4_option_class" },
    copied: { count: 2, mask: 0x80, max: 1, shift: 7, variableName: "ipv4_option_copied" },
    number: { count: 4, mask: 0x1f, max: 31, shift: 0, variableName: "ipv4_option_number" }
  }[field];
  const initValue = (target.optionType & spec.mask) >>> spec.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: field === "copied" ? 1 : Math.min(spec.max, initValue + spec.count - 1),
        min_value: field === "copied" ? 0 : initValue,
        name: spec.variableName,
        op: field === "copied" && initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: spec.mask,
        name: spec.variableName,
        pkt_cast_size: 1,
        pkt_offset: target.typeOffset,
        shift: spec.shift,
        type: "write_mask_flow_var"
      },
      {
        pkt_offset: target.ipv4Offset,
        type: "fix_checksum_ipv4"
      }
    ],
    split_by_var: spec.variableName
  };
}

export function buildIpv4OptionCopiedFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv4OptionTypeMaskedVmBody(stream, "copied");
}

export function buildIpv4OptionClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv4OptionTypeMaskedVmBody(stream, "class");
}

export function buildIpv4OptionNumberIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv4OptionTypeMaskedVmBody(stream, "number");
}

export function buildIpv6RouterAlertIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6RouterAlertTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.value,
    maxLimit: 65_535,
    name: "ipv6_router_alert",
    pktOffset: target.valueOffset,
    size: 2,
    step: 1
  });
}

type Ipv6ExtensionOptionTypeField = "action" | "change" | "number";

function buildIpv6ExtensionOptionTypeMaskedVmBody(
  stream: ProfileWorkbenchStream,
  field: Ipv6ExtensionOptionTypeField
): AdvancedVmBody {
  const target = ipv6ExtensionOptionTypeTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const spec = {
    action: { count: 4, mask: 0xc0, max: 3, shift: 6, variableName: "ipv6_option_action" },
    change: { count: 2, mask: 0x20, max: 1, shift: 5, variableName: "ipv6_option_change_en_route" },
    number: { count: 4, mask: 0x1f, max: 31, shift: 0, variableName: "ipv6_option_number" }
  }[field];
  const initValue = (target.optionType & spec.mask) >>> spec.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: field === "change" ? 1 : Math.min(spec.max, initValue + spec.count - 1),
        min_value: field === "change" ? 0 : initValue,
        name: spec.variableName,
        op: field === "change" && initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: spec.mask,
        name: spec.variableName,
        pkt_cast_size: 1,
        pkt_offset: target.typeOffset,
        shift: spec.shift,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: spec.variableName
  };
}

export function buildIpv6ExtensionOptionActionIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv6ExtensionOptionTypeMaskedVmBody(stream, "action");
}

export function buildIpv6ExtensionOptionChangeFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv6ExtensionOptionTypeMaskedVmBody(stream, "change");
}

export function buildIpv6ExtensionOptionNumberIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIpv6ExtensionOptionTypeMaskedVmBody(stream, "number");
}

export function buildIpv6JumboPayloadIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6JumboPayloadTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.value,
    maxLimit: 4_294_967_295,
    name: "ipv6_jumbo_payload_length",
    pktOffset: target.valueOffset,
    size: 4,
    step: 1
  });
}

export function buildIpv6FragmentIdentificationIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6FragmentHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.identification,
    maxLimit: 4_294_967_295,
    name: "ipv6_fragment_identification",
    pktOffset: target.identificationOffset,
    size: 4,
    step: 1
  });
}

export function buildIpv6FragmentOffsetIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6FragmentHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const bounds = advancedNumberBounds(target.fragmentOffset, 4, 1, 8_191);
  return {
    instructions: [
      {
        init_value: target.fragmentOffset,
        max_value: bounds.max,
        min_value: bounds.min,
        name: "ipv6_fragment_offset",
        op: "inc",
        size: 2,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xfff8,
        name: "ipv6_fragment_offset",
        pkt_cast_size: 2,
        pkt_offset: target.fragmentWordOffset,
        shift: 3,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "ipv6_fragment_offset"
  };
}

export function buildIpv6FragmentMoreFragmentsVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6FragmentHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return {
    instructions: [
      {
        init_value: target.moreFragments,
        max_value: 1,
        min_value: 0,
        name: "ipv6_fragment_more_fragments",
        op: target.moreFragments === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0001,
        name: "ipv6_fragment_more_fragments",
        pkt_cast_size: 2,
        pkt_offset: target.fragmentWordOffset,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "ipv6_fragment_more_fragments"
  };
}

export function buildIpv6FragmentReservedBitsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6FragmentHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const bounds = advancedNumberBounds(target.reservedBits, 4, 1, 3);
  return {
    instructions: [
      {
        init_value: target.reservedBits,
        max_value: bounds.max,
        min_value: bounds.min,
        name: "ipv6_fragment_reserved_bits",
        op: "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0006,
        name: "ipv6_fragment_reserved_bits",
        pkt_cast_size: 2,
        pkt_offset: target.fragmentWordOffset,
        shift: 1,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: "ipv6_fragment_reserved_bits"
  };
}

export function buildIpv6AhSpiIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6AhHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.spi,
    maxLimit: 4_294_967_295,
    name: "ipv6_ah_spi",
    pktOffset: target.spiOffset,
    size: 4,
    step: 1
  });
}

export function buildIpv6AhSequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6AhHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.sequence,
    maxLimit: 4_294_967_295,
    name: "ipv6_ah_sequence",
    pktOffset: target.sequenceOffset,
    size: 4,
    step: 1
  });
}

export function buildIpv6RoutingTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6RoutingHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.routingType,
    maxLimit: 255,
    name: "ipv6_routing_type",
    pktOffset: target.routingTypeOffset,
    size: 1,
    step: 1
  });
}

export function buildIpv6RoutingSegmentsLeftIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = ipv6RoutingHeaderTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    count: 4,
    initValue: target.segmentsLeft,
    maxLimit: 255,
    name: "ipv6_routing_segments_left",
    pktOffset: target.segmentsLeftOffset,
    size: 1,
    step: 1
  });
}

type Icmpv4EchoChecksumCoupledField = "type" | "code" | "identifier" | "sequence";

function icmpv4EchoChecksumCoupledSpec(
  stream: ProfileWorkbenchStream,
  field: Icmpv4EchoChecksumCoupledField
) {
  const target = icmpv4EchoRawTarget(stream);
  if (!target) {
    return null;
  }
  const specs: Record<Icmpv4EchoChecksumCoupledField, {
    count: number;
    fieldMax: number;
    fieldOffset: number;
    fieldSize: 1 | 2;
    step: number;
    value: number;
    wordUnit: number;
  }> = {
    code: {
      count: stream.icmp_code_count,
      fieldMax: 255,
      fieldOffset: target.codeOffset,
      fieldSize: 1,
      step: stream.icmp_code_step,
      value: target.code,
      wordUnit: 1
    },
    identifier: {
      count: stream.icmp_identifier_count,
      fieldMax: 65_535,
      fieldOffset: target.identifierOffset,
      fieldSize: 2,
      step: stream.icmp_identifier_step,
      value: target.identifier,
      wordUnit: 1
    },
    sequence: {
      count: stream.icmp_sequence_count,
      fieldMax: 65_535,
      fieldOffset: target.sequenceOffset,
      fieldSize: 2,
      step: stream.icmp_sequence_step,
      value: target.sequence,
      wordUnit: 1
    },
    type: {
      count: stream.icmp_type_count,
      fieldMax: 255,
      fieldOffset: target.typeOffset,
      fieldSize: 1,
      step: stream.icmp_type_step,
      value: target.type,
      wordUnit: 256
    }
  };
  const spec = specs[field];
  if (
    !Number.isInteger(spec.count)
    || !Number.isInteger(spec.step)
    || spec.count < 2
    || spec.step < 1
  ) {
    return null;
  }
  const fieldDelta = spec.step * (spec.count - 1);
  const checksumDelta = fieldDelta * spec.wordUnit;
  if (
    spec.value + fieldDelta > spec.fieldMax
    || checksumDelta > 65_535
    || target.checksum < checksumDelta
  ) {
    return null;
  }
  return {
    ...spec,
    checksum: target.checksum,
    checksumMin: target.checksum - checksumDelta,
    checksumOffset: target.checksumOffset,
    checksumStep: spec.step * spec.wordUnit,
    field
  };
}

export function isAdvancedIcmpv4EchoTypeStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && icmpv4EchoChecksumCoupledSpec(stream, "type"));
}

export function isAdvancedIcmpv4EchoCodeStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && icmpv4EchoChecksumCoupledSpec(stream, "code"));
}

export function isAdvancedIcmpv4EchoIdentifierStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && isRawPacketAdvancedStream(stream) && icmpv4EchoChecksumCoupledSpec(stream, "identifier"));
}

export function isAdvancedIcmpv4EchoSequenceStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && isRawPacketAdvancedStream(stream) && icmpv4EchoChecksumCoupledSpec(stream, "sequence"));
}

export function isIcmpv6EchoStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(
    stream
      && (
        (stream.packet_type === "Ethernet/IPv6/ICMPv6" && (stream.icmp_type === 128 || stream.icmp_type === 129))
        || icmpv6EchoRawTarget(stream)
      )
  );
}

export function isIcmpEchoStream(stream: ProfileWorkbenchStream) {
  return isIcmpv6EchoStream(stream);
}

function buildIcmpv4EchoChecksumCoupledVmBody(
  stream: ProfileWorkbenchStream,
  field: Icmpv4EchoChecksumCoupledField
): AdvancedVmBody {
  const spec = icmpv4EchoChecksumCoupledSpec(stream, field);
  if (!spec) {
    return advancedVmDefaultBody;
  }
  const variableName = `icmp_${field}`;
  const checksumVariableName = `${variableName}_csum`;
  return {
    instructions: [
      {
        init_value: spec.value,
        max_value: spec.value + (spec.step * (spec.count - 1)),
        min_value: spec.value,
        name: variableName,
        op: "inc",
        size: spec.fieldSize,
        step: spec.step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: variableName,
        pkt_offset: spec.fieldOffset,
        type: "write_flow_var"
      },
      {
        init_value: spec.checksum,
        max_value: spec.checksum,
        min_value: spec.checksumMin,
        name: checksumVariableName,
        op: "dec",
        size: 2,
        step: spec.checksumStep,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: checksumVariableName,
        pkt_offset: spec.checksumOffset,
        type: "write_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildIcmpv4TypeChecksumCoupledVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv4EchoChecksumCoupledVmBody(stream, "type");
}

export function buildIcmpv4CodeChecksumCoupledVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv4EchoChecksumCoupledVmBody(stream, "code");
}

export function buildIcmpv4IdentifierChecksumCoupledVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv4EchoChecksumCoupledVmBody(stream, "identifier");
}

export function buildIcmpv4SequenceChecksumCoupledVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv4EchoChecksumCoupledVmBody(stream, "sequence");
}

type Icmpv6AdvancedField = "type" | "code" | "identifier" | "sequence";

function buildIcmpv6NumberIncVmBody(stream: ProfileWorkbenchStream, field: Icmpv6AdvancedField): AdvancedVmBody {
  const rawTarget = icmpv6EchoRawTarget(stream);
  const icmpv6Offset = rawTarget ? rawTarget.offset : outerIcmpv6Offset(stream);
  const specs: Record<Icmpv6AdvancedField, {
    count: number;
    offset: number;
    size: 1 | 2;
    step: number;
    value: number;
  }> = {
    type: {
      count: stream.icmp_type_count,
      offset: 0,
      size: 1,
      step: stream.icmp_type_step,
      value: rawTarget ? rawTarget.type : stream.icmp_type
    },
    code: {
      count: stream.icmp_code_count,
      offset: 1,
      size: 1,
      step: stream.icmp_code_step,
      value: rawTarget ? rawTarget.code : stream.icmp_code
    },
    identifier: {
      count: stream.icmp_identifier_count,
      offset: 4,
      size: 2,
      step: stream.icmp_identifier_step,
      value: rawTarget ? rawTarget.identifier : stream.icmp_identifier
    },
    sequence: {
      count: stream.icmp_sequence_count,
      offset: 6,
      size: 2,
      step: stream.icmp_sequence_step,
      value: rawTarget ? rawTarget.sequence : stream.icmp_sequence
    }
  };
  const spec = specs[field];
  const maxLimit = spec.size === 1 ? 255 : 65_535;
  const variableName = `icmp_${field}`;
  return {
    instructions: [
      {
        init_value: spec.value,
        max_value: Math.min(maxLimit, spec.value + spec.count - 1),
        min_value: spec.value,
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
        pkt_offset: icmpv6Offset + spec.offset,
        type: "write_flow_var"
      },
      {
        l2_len: rawTarget ? rawTarget.l3Offset : workbenchOuterL2HeaderLength(stream),
        l3_len: 40,
        type: "fix_checksum_icmpv6"
      }
    ],
    split_by_var: variableName
  };
}

export function buildIcmpv6TypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv6NumberIncVmBody(stream, "type");
}

export function buildIcmpv6CodeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv6NumberIncVmBody(stream, "code");
}

export function buildIcmpv6IdentifierIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv6NumberIncVmBody(stream, "identifier");
}

export function buildIcmpv6SequenceIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildIcmpv6NumberIncVmBody(stream, "sequence");
}

export function isAdvancedIcmpv6NdTargetAddressStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(icmpv6NdTargetAddressTarget(stream));
}

export function isAdvancedIcmpv6NaFlagsStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(icmpv6NaFlagsTarget(stream));
}

export function isAdvancedIcmpv6RaFixedStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(icmpv6RaFixedTarget(stream));
}

export function isAdvancedIcmpv6RaPrefixInfoStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(icmpv6RaPrefixInfoTarget(stream));
}

export function isAdvancedIcmpv6LinkLayerOptionMacStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(icmpv6LinkLayerOptionMacTarget(stream));
}

function icmpv6RawChecksumInstruction(l3Offset: number) {
  return {
    l2_len: l3Offset,
    l3_len: 40,
    type: "fix_checksum_icmpv6"
  };
}

function buildIcmpv6MaskedBitVmBody({
  l3Offset,
  mask,
  name,
  pktCastSize,
  pktOffset,
  shift,
  value
}: {
  l3Offset: number;
  mask: number;
  name: string;
  pktCastSize: 1 | 2 | 4;
  pktOffset: number;
  shift: number;
  value: number;
}): AdvancedVmBody {
  return {
    instructions: [
      {
        init_value: value,
        max_value: 1,
        min_value: 0,
        name,
        op: value === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask,
        name,
        pkt_cast_size: pktCastSize,
        pkt_offset: pktOffset,
        shift,
        type: "write_mask_flow_var"
      },
      icmpv6RawChecksumInstruction(l3Offset)
    ],
    split_by_var: name
  };
}

export function buildIcmpv6NdTargetAddressIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6NdTargetAddressTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIpv6AddressIncVmBody({
    address: target.address,
    baseOffset: target.valueOffset,
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    name: "icmpv6_nd_target",
    step: 1
  });
}

export function buildIcmpv6NaRouterFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6NaFlagsTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x80000000,
    name: "icmpv6_na_router",
    pktCastSize: 4,
    pktOffset: target.flagsOffset,
    shift: 31,
    value: target.routerFlag
  });
}

export function buildIcmpv6NaSolicitedFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6NaFlagsTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x40000000,
    name: "icmpv6_na_solicited",
    pktCastSize: 4,
    pktOffset: target.flagsOffset,
    shift: 30,
    value: target.solicitedFlag
  });
}

export function buildIcmpv6NaOverrideFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6NaFlagsTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x20000000,
    name: "icmpv6_na_override",
    pktCastSize: 4,
    pktOffset: target.flagsOffset,
    shift: 29,
    value: target.overrideFlag
  });
}

export function buildIcmpv6RaManagedFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x80,
    name: "icmpv6_ra_managed",
    pktCastSize: 1,
    pktOffset: target.flagsOffset,
    shift: 7,
    value: target.managedFlag
  });
}

export function buildIcmpv6RaOtherFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x40,
    name: "icmpv6_ra_other",
    pktCastSize: 1,
    pktOffset: target.flagsOffset,
    shift: 6,
    value: target.otherFlag
  });
}

export function buildIcmpv6RaCurrentHopLimitIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.currentHopLimit,
    maxLimit: 255,
    name: "icmpv6_ra_current_hop_limit",
    pktOffset: target.currentHopLimitOffset,
    size: 1,
    step: 1
  });
}

export function buildIcmpv6RaRouterLifetimeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.routerLifetime,
    maxLimit: 65_535,
    name: "icmpv6_ra_router_lifetime",
    pktOffset: target.routerLifetimeOffset,
    size: 2,
    step: 1
  });
}

export function buildIcmpv6RaReachableTimeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.reachableTime,
    maxLimit: 4_294_967_295,
    name: "icmpv6_ra_reachable_time",
    pktOffset: target.reachableTimeOffset,
    size: 4,
    step: 1
  });
}

export function buildIcmpv6RaRetransTimerIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaFixedTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.retransTimer,
    maxLimit: 4_294_967_295,
    name: "icmpv6_ra_retrans_timer",
    pktOffset: target.retransTimerOffset,
    size: 4,
    step: 1
  });
}

export function buildIcmpv6RaPrefixOnLinkFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x80,
    name: "icmpv6_ra_prefix_on_link",
    pktCastSize: 1,
    pktOffset: target.flagsOffset,
    shift: 7,
    value: target.onLinkFlag
  });
}

export function buildIcmpv6RaPrefixAutonomousFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIcmpv6MaskedBitVmBody({
    l3Offset: target.l3Offset,
    mask: 0x40,
    name: "icmpv6_ra_prefix_autonomous",
    pktCastSize: 1,
    pktOffset: target.flagsOffset,
    shift: 6,
    value: target.autonomousFlag
  });
}

export function buildIcmpv6RaPrefixLengthIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.prefixLength,
    maxLimit: 128,
    name: "icmpv6_ra_prefix_length",
    pktOffset: target.prefixLengthOffset,
    size: 1,
    step: 1
  });
}

export function buildIcmpv6RaPrefixValidLifetimeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.validLifetime,
    maxLimit: 4_294_967_295,
    name: "icmpv6_ra_prefix_valid_lifetime",
    pktOffset: target.validLifetimeOffset,
    size: 4,
    step: 1
  });
}

export function buildIcmpv6RaPrefixPreferredLifetimeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: target.preferredLifetime,
    maxLimit: 4_294_967_295,
    name: "icmpv6_ra_prefix_preferred_lifetime",
    pktOffset: target.preferredLifetimeOffset,
    size: 4,
    step: 1
  });
}

export function buildIcmpv6RaPrefixIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6RaPrefixInfoTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  return buildIpv6AddressIncVmBody({
    address: target.prefix,
    baseOffset: target.prefixOffset,
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    name: "icmpv6_ra_prefix",
    step: 1
  });
}

export function buildIcmpv6LinkLayerOptionMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const target = icmpv6LinkLayerOptionMacTarget(stream);
  if (!target) {
    return advancedVmDefaultBody;
  }
  const suffix = macFieldEngineSuffix(target.mac, 4);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: icmpv6RawChecksumInstruction(target.l3Offset),
    count: 4,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: target.optionType === 2 ? "icmpv6_tlla_mac" : "icmpv6_slla_mac",
    pktOffset: target.valueOffset + 6 - suffix.size,
    size: suffix.size,
    step: 1
  });
}

export function isTaggedVlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVlanTagTarget(stream, 1) || stream?.vlan_enabled);
}

export function isInnerTaggedVlanStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawVlanTagTarget(stream, 2) || (stream?.vlan_enabled && stream.vlan2_enabled));
}

export function buildVlanIdIncVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVlanTagTarget(stream, index);
  const variableName = index === 1 ? "vlan_id" : "vlan2_id";
  const initValue = rawTarget ? rawTarget.vlanId : index === 1 ? stream.vlan_id : stream.vlan2_id;
  const count = index === 1 ? stream.vlan_id_count : stream.vlan2_id_count;
  const step = index === 1 ? stream.vlan_id_step : stream.vlan2_id_step;
  const pktOffset = rawTarget ? rawTarget.tciOffset : 14 + (4 * (index - 1));

  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(4094, initValue + count - 1),
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
        mask: 0x0FFF,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: pktOffset,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildInnerVlanIdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVlanIdIncVmBody(stream, 2);
}

export function buildVlanPriorityIncVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVlanTagTarget(stream, index);
  const variableName = index === 1 ? "vlan_priority" : "vlan2_priority";
  const initValue = rawTarget ? rawTarget.priority : index === 1 ? stream.vlan_priority : stream.vlan2_priority;
  const count = index === 1 ? stream.vlan_priority_count : stream.vlan2_priority_count;
  const step = index === 1 ? stream.vlan_priority_step : stream.vlan2_priority_step;
  const pktOffset = rawTarget ? rawTarget.tciOffset : 14 + (4 * (index - 1));

  return {
    instructions: [
      {
        init_value: initValue,
        max_value: Math.min(7, initValue + count - 1),
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
        mask: 0xE000,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: pktOffset,
        shift: 13,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildInnerVlanPriorityIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVlanPriorityIncVmBody(stream, 2);
}

export function buildVlanCfiVaryVmBody(stream: ProfileWorkbenchStream, index: 1 | 2 = 1): AdvancedVmBody {
  const rawTarget = rawVlanTagTarget(stream, index);
  const variableName = index === 1 ? "vlan_cfi" : "vlan2_cfi";
  const initValue = rawTarget ? rawTarget.cfi : index === 1 ? stream.vlan_cfi : stream.vlan2_cfi;
  const pktOffset = rawTarget ? rawTarget.tciOffset : 14 + (4 * (index - 1));

  return {
    instructions: [
      {
        init_value: initValue,
        max_value: 1,
        min_value: 0,
        name: variableName,
        op: initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1000,
        name: variableName,
        pkt_cast_size: 2,
        pkt_offset: pktOffset,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildInnerVlanCfiVaryVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildVlanCfiVaryVmBody(stream, 2);
}

function mplsLabelFieldEngineSize(label: number, count: number) {
  if (label + count < 256) {
    return 1;
  }
  if (label + count < 65_536) {
    return 2;
  }
  return 4;
}

function mplsLabelFieldName(index: 1 | 2 | 3) {
  return index === 1 ? "mpls_label" : `mpls_label${index}`;
}

function mplsTrafficClassFieldName(index: 1 | 2 | 3) {
  return index === 1 ? "mpls_tc" : `mpls_label${index}_tc`;
}

function mplsTtlFieldName(index: 1 | 2 | 3) {
  return index === 1 ? "mpls_ttl" : `mpls_label${index}_ttl`;
}

function mplsNumberField(stream: ProfileWorkbenchStream, field: string) {
  const value = stream[field as keyof ProfileWorkbenchStream];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isMplsStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawMplsLabelTarget(stream, 1) || stream?.mpls_enabled);
}

export function isSecondMplsStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawMplsLabelTarget(stream, 2) || (stream?.mpls_enabled && stream.mpls_label2_enabled));
}

export function isThirdMplsStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawMplsLabelTarget(stream, 3) || (stream?.mpls_enabled && stream.mpls_label2_enabled && stream.mpls_label3_enabled));
}

function buildMplsLabelIncVmBodyForIndex(stream: ProfileWorkbenchStream, index: 1 | 2 | 3): AdvancedVmBody {
  const rawTarget = rawMplsLabelTarget(stream, index);
  const mplsOffset = rawTarget ? rawTarget.offset : outerMplsOffset(stream) + (4 * (index - 1));
  const variableName = mplsLabelFieldName(index);
  const label = rawTarget ? rawTarget.label : mplsNumberField(stream, variableName);
  const count = mplsNumberField(stream, `${variableName}_count`);
  const step = mplsNumberField(stream, `${variableName}_step`);
  return {
    instructions: [
      {
        init_value: label,
        max_value: label + count - 1,
        min_value: label,
        name: variableName,
        op: "inc",
        size: mplsLabelFieldEngineSize(label, count),
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xFFFFF000,
        name: variableName,
        pkt_cast_size: 4,
        pkt_offset: mplsOffset,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildMplsLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsLabelIncVmBodyForIndex(stream, 1);
}

export function buildSecondMplsLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsLabelIncVmBodyForIndex(stream, 2);
}

export function buildThirdMplsLabelIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsLabelIncVmBodyForIndex(stream, 3);
}

function buildMplsTrafficClassIncVmBodyForIndex(stream: ProfileWorkbenchStream, index: 1 | 2 | 3): AdvancedVmBody {
  const rawTarget = rawMplsLabelTarget(stream, index);
  const mplsOffset = rawTarget ? rawTarget.offset : outerMplsOffset(stream) + (4 * (index - 1));
  const variableName = mplsTrafficClassFieldName(index);
  const trafficClass = rawTarget ? rawTarget.trafficClass : mplsNumberField(stream, variableName);
  const count = mplsNumberField(stream, `${variableName}_count`);
  const step = mplsNumberField(stream, `${variableName}_step`);
  return {
    instructions: [
      {
        init_value: trafficClass,
        max_value: Math.min(7, trafficClass + count - 1),
        min_value: trafficClass,
        name: variableName,
        op: "inc",
        size: 1,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x00000E00,
        name: variableName,
        pkt_cast_size: 4,
        pkt_offset: mplsOffset,
        shift: 9,
        type: "write_mask_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildMplsTrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTrafficClassIncVmBodyForIndex(stream, 1);
}

export function buildSecondMplsTrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTrafficClassIncVmBodyForIndex(stream, 2);
}

export function buildThirdMplsTrafficClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTrafficClassIncVmBodyForIndex(stream, 3);
}

function buildMplsTtlIncVmBodyForIndex(stream: ProfileWorkbenchStream, index: 1 | 2 | 3): AdvancedVmBody {
  const rawTarget = rawMplsLabelTarget(stream, index);
  const mplsOffset = rawTarget ? rawTarget.offset : outerMplsOffset(stream) + (4 * (index - 1));
  const variableName = mplsTtlFieldName(index);
  const ttl = rawTarget ? rawTarget.ttl : mplsNumberField(stream, variableName);
  const count = mplsNumberField(stream, `${variableName}_count`);
  const step = mplsNumberField(stream, `${variableName}_step`);
  return {
    instructions: [
      {
        init_value: ttl,
        max_value: Math.min(255, ttl + count - 1),
        min_value: ttl,
        name: variableName,
        op: "inc",
        size: 1,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name: variableName,
        pkt_offset: mplsOffset + 3,
        type: "write_flow_var"
      }
    ],
    split_by_var: variableName
  };
}

export function buildMplsTtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTtlIncVmBodyForIndex(stream, 1);
}

export function buildSecondMplsTtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTtlIncVmBodyForIndex(stream, 2);
}

export function buildThirdMplsTtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildMplsTtlIncVmBodyForIndex(stream, 3);
}

export function isAdvancedDnsStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawDnsQueryTarget(stream) || (stream && stream.packet_type.endsWith("/UDP") && stream.dns_enabled));
}

export function isAdvancedDnsQueryNameStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDnsQueryTarget(stream);
  return Boolean(
    (rawTarget && rawTarget.queryNameFirstByteOffset !== null)
      || (
        stream
          && stream.packet_type.endsWith("/UDP")
          && stream.dns_enabled
          && dnsQueryNameFirstLabelByte(stream.dns_query_name) !== null
      )
  );
}

export function isAdvancedDnsAnswerStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawDnsAnswerTarget(stream) || (stream && stream.packet_type.endsWith("/UDP") && stream.dns_enabled && stream.dns_answer_enabled));
}

export function isAdvancedDnsAnswerIpv4Stream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDnsAnswerTarget(stream);
  return Boolean(
    (rawTarget && rawTarget.answerIpv4 && rawTarget.answerIpv4Offset !== null)
      || (stream && stream.packet_type.endsWith("/UDP") && stream.dns_enabled && stream.dns_answer_enabled)
  );
}

type DnsAdvancedField =
  | "additional_rrs"
  | "answers"
  | "authority_rrs"
  | "questions"
  | "transaction_id"
  | "flags"
  | "query_type"
  | "query_class"
  | "answer_ttl"
  | "answer_type"
  | "answer_class"
  | "answer_ipv4";

type DnsFlagMaskedField =
  | "aa"
  | "opcode"
  | "ra"
  | "rcode"
  | "rd"
  | "reserved"
  | "response"
  | "tc";

function buildDnsFieldIncVmBody(stream: ProfileWorkbenchStream, field: DnsAdvancedField): AdvancedVmBody {
  const rawTarget = rawDnsQueryTarget(stream);
  const rawAnswerTarget = rawDnsAnswerTarget(stream);
  const useRawQueryTarget = Boolean(
    rawTarget
      && (
        field === "additional_rrs"
        || field === "answers"
        || field === "authority_rrs"
        || field === "flags"
        || field === "query_class"
        || field === "query_type"
        || field === "questions"
        || field === "transaction_id"
      )
  );
  const useRawAnswerTarget = Boolean(
    rawAnswerTarget
      && (
        field === "answer_class"
        || field === "answer_ttl"
        || field === "answer_type"
        || (field === "answer_ipv4" && rawAnswerTarget.answerIpv4 && rawAnswerTarget.answerIpv4Offset !== null)
      )
  );
  const payloadOffset = useRawQueryTarget && rawTarget ? rawTarget.payloadOffset : outerUdpPayloadOffset(stream);
  const checksumInstruction = useRawQueryTarget && rawTarget
    ? rawTarget.checksumInstruction
    : useRawAnswerTarget && rawAnswerTarget
      ? rawAnswerTarget.checksumInstruction
      : outerUdpChecksumInstruction(stream);
  const queryNameLength = useRawQueryTarget && rawTarget ? rawTarget.queryNameLength : dnsNameWireLength(stream.dns_query_name);
  if (field === "answer_ipv4") {
    const rawAnswerIpv4Offset = useRawAnswerTarget && rawAnswerTarget && rawAnswerTarget.answerIpv4Offset !== null
      ? rawAnswerTarget.answerIpv4Offset
      : null;
    const answerOffset = payloadOffset + 12 + queryNameLength + 4;
    const suffix = ipv4FieldEngineSuffix(rawAnswerTarget?.answerIpv4 ?? stream.dns_answer_ipv4, stream.dns_answer_ipv4_count);
    return buildAdvancedNumberWriteVmBody({
      checksumInstruction,
      count: stream.dns_answer_ipv4_count,
      initValue: suffix.initValue,
      maxLimit: fieldEngineMaxForSize(suffix.size),
      name: "dns_answer_ipv4",
      pktOffset: rawAnswerIpv4Offset !== null ? rawAnswerIpv4Offset + 4 - suffix.size : answerOffset + 12 + 4 - suffix.size,
      size: suffix.size,
      step: stream.dns_answer_ipv4_step
    });
  }
  const spec = {
    additional_rrs: {
      count: 4,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.additionalCount : 0,
      maxLimit: 65_535,
      name: "dns_additional_rrs",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.additionalCountOffset : payloadOffset + 10,
      size: 2 as const,
      step: 1
    },
    answers: {
      count: 4,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.answerCount : stream.dns_answer_enabled ? 1 : 0,
      maxLimit: 65_535,
      name: "dns_answers",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.answerCountOffset : payloadOffset + 6,
      size: 2 as const,
      step: 1
    },
    authority_rrs: {
      count: 4,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.authorityCount : 0,
      maxLimit: 65_535,
      name: "dns_authority_rrs",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.authorityCountOffset : payloadOffset + 8,
      size: 2 as const,
      step: 1
    },
    questions: {
      count: 4,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.questionCount : 1,
      maxLimit: 65_535,
      name: "dns_questions",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.questionCountOffset : payloadOffset + 4,
      size: 2 as const,
      step: 1
    },
    transaction_id: {
      count: stream.dns_transaction_id_count,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.transactionId : stream.dns_transaction_id,
      maxLimit: 65_535,
      name: "dns_transaction_id",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.transactionIdOffset : payloadOffset,
      size: 2 as const,
      step: stream.dns_transaction_id_step
    },
    flags: {
      count: stream.dns_flags_count,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.flags : parseHexWord(stream.dns_flags),
      maxLimit: 65_535,
      name: "dns_flags",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.flagsOffset : payloadOffset + 2,
      size: 2 as const,
      step: stream.dns_flags_step
    },
    query_type: {
      count: stream.dns_query_type_count,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.queryType : stream.dns_query_type,
      maxLimit: 65_535,
      name: "dns_query_type",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.queryTypeOffset : payloadOffset + 12 + queryNameLength,
      size: 2 as const,
      step: stream.dns_query_type_step
    },
    query_class: {
      count: stream.dns_query_class_count,
      initValue: useRawQueryTarget && rawTarget ? rawTarget.queryClass : stream.dns_query_class,
      maxLimit: 65_535,
      name: "dns_query_class",
      pktOffset: useRawQueryTarget && rawTarget ? rawTarget.queryClassOffset : payloadOffset + 12 + queryNameLength + 2,
      size: 2 as const,
      step: stream.dns_query_class_step
    },
    answer_type: {
      count: 4,
      initValue: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerType : 1,
      maxLimit: 65_535,
      name: "dns_answer_type",
      pktOffset: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerTypeOffset : payloadOffset + 12 + queryNameLength + 4 + 2,
      size: 2 as const,
      step: 1
    },
    answer_class: {
      count: 4,
      initValue: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerClass : 1,
      maxLimit: 65_535,
      name: "dns_answer_class",
      pktOffset: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerClassOffset : payloadOffset + 12 + queryNameLength + 4 + 4,
      size: 2 as const,
      step: 1
    },
    answer_ttl: {
      count: stream.dns_answer_ttl_count,
      initValue: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerTtl : stream.dns_answer_ttl,
      maxLimit: 4_294_967_295,
      name: "dns_answer_ttl",
      pktOffset: useRawAnswerTarget && rawAnswerTarget ? rawAnswerTarget.answerTtlOffset : payloadOffset + 12 + queryNameLength + 4 + 6,
      size: 4 as const,
      step: stream.dns_answer_ttl_step
    }
  }[field];
  return buildAdvancedNumberWriteVmBody({ ...spec, checksumInstruction });
}

export function buildDnsTransactionIdIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "transaction_id");
}

export function buildDnsFlagsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "flags");
}

export function buildDnsQuestionsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "questions");
}

export function buildDnsAnswersIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "answers");
}

export function buildDnsAuthorityRrsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "authority_rrs");
}

export function buildDnsAdditionalRrsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "additional_rrs");
}

function buildDnsFlagMaskedVmBody(stream: ProfileWorkbenchStream, field: DnsFlagMaskedField): AdvancedVmBody {
  const rawTarget = rawDnsQueryTarget(stream);
  const flags = rawTarget ? rawTarget.flags : parseHexWord(stream.dns_flags);
  const flagsOffset = rawTarget ? rawTarget.flagsOffset : outerUdpPayloadOffset(stream) + 2;
  const checksumInstruction = rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream);
  const target = {
    aa: { mask: 0x0400, name: "dns_aa", shift: 10 },
    opcode: { mask: 0x7800, name: "dns_opcode", shift: 11 },
    ra: { mask: 0x0080, name: "dns_ra", shift: 7 },
    rcode: { mask: 0x000f, name: "dns_rcode", shift: 0 },
    rd: { mask: 0x0100, name: "dns_rd", shift: 8 },
    reserved: { mask: 0x0070, name: "dns_reserved", shift: 4 },
    response: { mask: 0x8000, name: "dns_response", shift: 15 },
    tc: { mask: 0x0200, name: "dns_tc", shift: 9 }
  }[field];
  const initValue = ((flags & target.mask) >>> target.shift) >>> 0;
  const maxValue = target.mask >>> target.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: maxValue === 1 ? 1 : Math.min(maxValue, initValue + 3),
        min_value: maxValue === 1 ? 0 : initValue,
        name: target.name,
        op: maxValue === 1 && initValue === 1 ? "dec" : "inc",
        size: 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: target.mask,
        name: target.name,
        pkt_cast_size: 2,
        pkt_offset: flagsOffset,
        shift: target.shift,
        type: "write_mask_flow_var"
      },
      checksumInstruction
    ],
    split_by_var: target.name
  };
}

export function buildDnsResponseFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "response");
}

export function buildDnsOpcodeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "opcode");
}

export function buildDnsAuthoritativeAnswerFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "aa");
}

export function buildDnsTruncatedFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "tc");
}

export function buildDnsRecursionDesiredFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "rd");
}

export function buildDnsRecursionAvailableFlagVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "ra");
}

export function buildDnsReservedFlagsIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "reserved");
}

export function buildDnsResponseCodeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFlagMaskedVmBody(stream, "rcode");
}

export function buildDnsQueryTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "query_type");
}

export function buildDnsQueryClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "query_class");
}

export function buildDnsQueryNameFirstByteIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawDnsQueryTarget(stream);
  const rawOffset = rawTarget?.queryNameFirstByteOffset ?? null;
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: 4,
    initValue: rawTarget && rawOffset !== null
      ? rawTarget.queryNameFirstByte
      : dnsQueryNameFirstLabelByte(stream.dns_query_name) ?? 0,
    maxLimit: 255,
    name: "dns_query_name_byte",
    pktOffset: rawOffset ?? outerUdpPayloadOffset(stream) + 13,
    size: 1,
    step: 1
  });
}

export function buildDnsAnswerTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "answer_type");
}

export function buildDnsAnswerClassIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "answer_class");
}

export function buildDnsAnswerTtlIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "answer_ttl");
}

export function buildDnsAnswerIpv4IncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildDnsFieldIncVmBody(stream, "answer_ipv4");
}

export function isAdvancedDhcpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(rawDhcpTarget(stream) || (stream && stream.packet_type.endsWith("/UDP") && stream.dhcp_enabled));
}

export function isAdvancedDhcpMessageTypeStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.messageTypeOption)
    : Boolean(stream && stream.packet_type.endsWith("/UDP") && stream.dhcp_enabled);
}

export function isAdvancedDhcpRequestedIpStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.requestedIpOption)
    : Boolean(isAdvancedDhcpStream(stream) && stream?.dhcp_requested_ip !== "0.0.0.0");
}

export function isAdvancedDhcpServerIdStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.serverIdOption)
    : Boolean(isAdvancedDhcpStream(stream) && stream?.dhcp_server_id !== "0.0.0.0");
}

export function isAdvancedDhcpLeaseTimeStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.leaseTimeOption)
    : Boolean(isAdvancedDhcpStream(stream) && (stream?.dhcp_lease_time ?? 0) > 0);
}

export function isAdvancedDhcpRenewalTimeStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.renewalTimeOption)
    : Boolean(isAdvancedDhcpStream(stream) && (stream?.dhcp_renewal_time ?? 0) > 0);
}

export function isAdvancedDhcpRebindingTimeStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.rebindingTimeOption)
    : Boolean(isAdvancedDhcpStream(stream) && (stream?.dhcp_rebinding_time ?? 0) > 0);
}

export function isAdvancedDhcpParameterRequestStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.parameterRequestOption)
    : Boolean(isAdvancedDhcpStream(stream) && dhcpParameterRequestListLength(stream?.dhcp_parameter_request_list ?? "") > 0);
}

export function isAdvancedDhcpHostnameStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return rawTarget
    ? Boolean(rawTarget.hostnameOption)
    : Boolean(isAdvancedDhcpStream(stream) && (stream?.dhcp_hostname ?? "").length > 0);
}

export function isAdvancedDhcpClientIdentifierStream(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawDhcpTarget(stream);
  return Boolean(rawTarget?.clientIdentifierOption);
}

function dhcpOptionValueOffset(stream: ProfileWorkbenchStream, code: 12 | 50 | 51 | 54 | 55 | 58 | 59) {
  let payloadOffset = 240;
  const options: Array<{ code: number; length: number }> = [{ code: 53, length: 1 }];
  const parameterRequestLength = dhcpParameterRequestListLength(stream.dhcp_parameter_request_list);
  if (parameterRequestLength > 0) {
    options.push({ code: 55, length: parameterRequestLength });
  }
  if (stream.dhcp_hostname) {
    options.push({ code: 12, length: stream.dhcp_hostname.length });
  }
  if (stream.dhcp_requested_ip !== "0.0.0.0") {
    options.push({ code: 50, length: 4 });
  }
  if (stream.dhcp_server_id !== "0.0.0.0") {
    options.push({ code: 54, length: 4 });
  }
  for (const [timerCode, value] of [
    [51, stream.dhcp_lease_time],
    [58, stream.dhcp_renewal_time],
    [59, stream.dhcp_rebinding_time]
  ] as const) {
    if (value > 0) {
      options.push({ code: timerCode, length: 4 });
    }
  }
  for (const option of options) {
    if (option.code === code) {
      return outerUdpPayloadOffset(stream) + payloadOffset + 2;
    }
    payloadOffset += 2 + option.length;
  }
  return null;
}

type DhcpNumberField = "operation" | "hops" | "seconds" | "message_type" | "xid" | "flags";
type DhcpFlagMaskedField = "broadcast" | "reserved";
type DhcpBootpIpv4Field = "client_ip" | "your_ip" | "server_ip" | "relay_ip";
type DhcpOptionIpv4Field = "requested_ip" | "server_id";
type DhcpTimerField = "lease_time" | "renewal_time" | "rebinding_time";

export function buildDhcpNumberIncVmBody(stream: ProfileWorkbenchStream, field: DhcpNumberField): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const payloadOffset = rawTarget?.payloadOffset ?? outerUdpPayloadOffset(stream);
  const checksumInstruction = rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream);
  const messageTypeOffset = rawTarget?.messageTypeOption?.offset ?? payloadOffset + 242;
  const spec = {
    operation: {
      count: stream.dhcp_operation_count,
      initValue: rawTarget ? rawTarget.operation : stream.dhcp_operation,
      maxLimit: 255,
      name: "dhcp_operation",
      pktOffset: rawTarget?.operationOffset ?? payloadOffset,
      size: 1 as const,
      step: stream.dhcp_operation_step
    },
    hops: {
      count: stream.dhcp_hops_count,
      initValue: rawTarget ? rawTarget.hops : stream.dhcp_hops,
      maxLimit: 255,
      name: "dhcp_hops",
      pktOffset: rawTarget?.hopsOffset ?? payloadOffset + 3,
      size: 1 as const,
      step: stream.dhcp_hops_step
    },
    seconds: {
      count: stream.dhcp_seconds_count,
      initValue: rawTarget ? rawTarget.seconds : stream.dhcp_seconds,
      maxLimit: 65_535,
      name: "dhcp_seconds",
      pktOffset: rawTarget?.secondsOffset ?? payloadOffset + 8,
      size: 2 as const,
      step: stream.dhcp_seconds_step
    },
    message_type: {
      count: stream.dhcp_message_type_count,
      initValue: rawTarget?.messageTypeOption ? rawTarget.bytes[rawTarget.messageTypeOption.offset] ?? 0 : stream.dhcp_message_type,
      maxLimit: 255,
      name: "dhcp_message_type",
      pktOffset: messageTypeOffset,
      size: 1 as const,
      step: stream.dhcp_message_type_step
    },
    xid: {
      count: stream.dhcp_xid_count,
      initValue: rawTarget ? rawTarget.xid : stream.dhcp_xid,
      maxLimit: 4_294_967_295,
      name: "dhcp_xid",
      pktOffset: rawTarget?.xidOffset ?? payloadOffset + 4,
      size: 4 as const,
      step: stream.dhcp_xid_step
    },
    flags: {
      count: stream.dhcp_flags_count,
      initValue: rawTarget ? rawTarget.flags : parseHexWord(stream.dhcp_flags),
      maxLimit: 65_535,
      name: "dhcp_flags",
      pktOffset: rawTarget?.flagsOffset ?? payloadOffset + 10,
      size: 2 as const,
      step: stream.dhcp_flags_step
    }
  }[field];
  return buildAdvancedNumberWriteVmBody({ ...spec, checksumInstruction });
}

export function buildDhcpFlagMaskedVmBody(stream: ProfileWorkbenchStream, field: DhcpFlagMaskedField): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const payloadOffset = rawTarget?.payloadOffset ?? outerUdpPayloadOffset(stream);
  const checksumInstruction = rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream);
  const flags = rawTarget ? rawTarget.flags : parseHexWord(stream.dhcp_flags);
  const target = {
    broadcast: { mask: 0x8000, name: "dhcp_broadcast", shift: 15 },
    reserved: { mask: 0x7fff, name: "dhcp_reserved_flags", shift: 0 }
  }[field];
  const initValue = ((flags & target.mask) >>> target.shift) >>> 0;
  const maxValue = target.mask >>> target.shift;
  return {
    instructions: [
      {
        init_value: initValue,
        max_value: maxValue === 1 ? 1 : Math.min(maxValue, initValue + 3),
        min_value: maxValue === 1 ? 0 : initValue,
        name: target.name,
        op: maxValue === 1 && initValue === 1 ? "dec" : "inc",
        size: maxValue > 255 ? 2 : 1,
        step: 1,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        mask: target.mask,
        name: target.name,
        pkt_cast_size: 2,
        pkt_offset: rawTarget?.flagsOffset ?? payloadOffset + 10,
        shift: target.shift,
        type: "write_mask_flow_var"
      },
      checksumInstruction
    ],
    split_by_var: target.name
  };
}

export function buildDhcpBootpIpv4IncVmBody(stream: ProfileWorkbenchStream, field: DhcpBootpIpv4Field): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const payloadOffset = rawTarget?.payloadOffset ?? outerUdpPayloadOffset(stream);
  const source = {
    client_ip: {
      address: rawTarget ? rawTarget.clientIp : stream.dhcp_client_ip,
      count: stream.dhcp_client_ip_count,
      name: "dhcp_client_ip",
      offset: rawTarget ? rawTarget.clientIpOffset - payloadOffset : 12,
      step: stream.dhcp_client_ip_step
    },
    your_ip: {
      address: rawTarget ? rawTarget.yourIp : stream.dhcp_your_ip,
      count: stream.dhcp_your_ip_count,
      name: "dhcp_your_ip",
      offset: rawTarget ? rawTarget.yourIpOffset - payloadOffset : 16,
      step: stream.dhcp_your_ip_step
    },
    server_ip: {
      address: rawTarget ? rawTarget.serverIp : stream.dhcp_server_ip,
      count: stream.dhcp_server_ip_count,
      name: "dhcp_server_ip",
      offset: rawTarget ? rawTarget.serverIpOffset - payloadOffset : 20,
      step: stream.dhcp_server_ip_step
    },
    relay_ip: {
      address: rawTarget ? rawTarget.relayIp : stream.dhcp_relay_ip,
      count: stream.dhcp_relay_ip_count,
      name: "dhcp_relay_ip",
      offset: rawTarget ? rawTarget.relayIpOffset - payloadOffset : 24,
      step: stream.dhcp_relay_ip_step
    }
  }[field];
  const suffix = ipv4FieldEngineSuffix(source.address, source.count);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: source.count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: source.name,
    pktOffset: payloadOffset + source.offset + 4 - suffix.size,
    size: suffix.size,
    step: source.step
  });
}

export function buildDhcpClientMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const baseOffset = rawTarget?.clientMacOffset ?? outerUdpPayloadOffset(stream) + 28;
  const suffix = macFieldEngineSuffix(rawTarget ? rawTarget.clientMac : stream.dhcp_client_mac, stream.dhcp_client_mac_count);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: stream.dhcp_client_mac_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "dhcp_client_mac",
    pktOffset: baseOffset + 6 - suffix.size,
    size: suffix.size,
    step: stream.dhcp_client_mac_step
  });
}

export function buildDhcpOptionIpv4IncVmBody(stream: ProfileWorkbenchStream, field: DhcpOptionIpv4Field): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const rawOption = field === "requested_ip" ? rawTarget?.requestedIpOption : rawTarget?.serverIdOption;
  const optionOffset = rawOption?.offset ?? dhcpOptionValueOffset(stream, field === "requested_ip" ? 50 : 54);
  const address = rawTarget && rawOption ? formatPacketIpv4(rawTarget.bytes, rawOption.offset) : field === "requested_ip" ? stream.dhcp_requested_ip : stream.dhcp_server_id;
  const count = field === "requested_ip" ? stream.dhcp_requested_ip_count : stream.dhcp_server_id_count;
  const step = field === "requested_ip" ? stream.dhcp_requested_ip_step : stream.dhcp_server_id_step;
  const name = field === "requested_ip" ? "dhcp_requested_ip" : "dhcp_server_id";
  const suffix = ipv4FieldEngineSuffix(address, count);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name,
    pktOffset: (optionOffset ?? outerUdpPayloadOffset(stream)) + 4 - suffix.size,
    size: suffix.size,
    step
  });
}

export function buildDhcpParameterRequestFirstOptionIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const rawOption = rawTarget?.parameterRequestOption;
  const optionOffset = rawOption?.offset ?? dhcpOptionValueOffset(stream, 55) ?? outerUdpPayloadOffset(stream) + 245;
  const initValue = rawTarget && rawOption
    ? rawTarget.bytes[rawOption.offset] ?? 0
    : dhcpParameterRequestFirstValue(stream.dhcp_parameter_request_list);
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: 4,
    initValue,
    maxLimit: 255,
    name: "dhcp_parameter_request",
    pktOffset: optionOffset,
    size: 1,
    step: 1
  });
}

export function buildDhcpHostnameFirstByteIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const rawOption = rawTarget?.hostnameOption;
  const optionOffset = rawOption?.offset ?? dhcpOptionValueOffset(stream, 12) ?? outerUdpPayloadOffset(stream) + 245;
  const initValue = rawTarget && rawOption
    ? rawTarget.bytes[rawOption.offset] ?? 0
    : stream.dhcp_hostname.charCodeAt(0) & 0xff;
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: 4,
    initValue,
    maxLimit: 255,
    name: "dhcp_hostname_byte",
    pktOffset: optionOffset,
    size: 1,
    step: 1
  });
}

export function buildDhcpClientIdentifierFirstByteIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawDhcpTarget(stream);
  const rawOption = rawTarget?.clientIdentifierOption;
  const optionOffset = rawOption?.offset ?? outerUdpPayloadOffset(stream);
  const initValue = rawTarget && rawOption ? rawTarget.bytes[rawOption.offset] ?? 0 : 0;
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: 4,
    initValue,
    maxLimit: 255,
    name: "dhcp_client_identifier",
    pktOffset: optionOffset,
    size: 1,
    step: 1
  });
}

export function buildDhcpTimerIncVmBody(stream: ProfileWorkbenchStream, field: DhcpTimerField): AdvancedVmBody {
  const optionCode = field === "lease_time" ? 51 : field === "renewal_time" ? 58 : 59;
  const rawTarget = rawDhcpTarget(stream);
  const rawOption = field === "lease_time"
    ? rawTarget?.leaseTimeOption
    : field === "renewal_time"
      ? rawTarget?.renewalTimeOption
      : rawTarget?.rebindingTimeOption;
  const optionOffset = rawOption?.offset ?? dhcpOptionValueOffset(stream, optionCode);
  const source = {
    lease_time: {
      count: stream.dhcp_lease_time_count,
      initValue: rawTarget && rawOption ? rawPacketNumberValue(rawTarget.bytes, rawOption.offset, 4) : stream.dhcp_lease_time,
      name: "dhcp_lease_time",
      step: stream.dhcp_lease_time_step
    },
    renewal_time: {
      count: stream.dhcp_renewal_time_count,
      initValue: rawTarget && rawOption ? rawPacketNumberValue(rawTarget.bytes, rawOption.offset, 4) : stream.dhcp_renewal_time,
      name: "dhcp_renewal_time",
      step: stream.dhcp_renewal_time_step
    },
    rebinding_time: {
      count: stream.dhcp_rebinding_time_count,
      initValue: rawTarget && rawOption ? rawPacketNumberValue(rawTarget.bytes, rawOption.offset, 4) : stream.dhcp_rebinding_time,
      name: "dhcp_rebinding_time",
      step: stream.dhcp_rebinding_time_step
    }
  }[field];
  return buildAdvancedNumberWriteVmBody({
    checksumInstruction: rawTarget?.checksumInstruction ?? outerUdpChecksumInstruction(stream),
    count: source.count,
    initValue: source.initValue,
    maxLimit: 4_294_967_295,
    name: source.name,
    pktOffset: optionOffset ?? outerUdpPayloadOffset(stream),
    size: 4,
    step: source.step
  });
}
