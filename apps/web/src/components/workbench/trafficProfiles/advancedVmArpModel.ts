import type { ProfileWorkbenchStream } from "../../../api";
import type { AdvancedVmBody } from "./model";
import {
  workbenchOuterL2HeaderLength
} from "./packetLayoutModel";
import {
  rawArpTarget
} from "./rawPacketModel";
import {
  buildAdvancedNumberWriteVmBody
} from "./advancedVmNumberWriteModel";
import {
  fieldEngineMaxForSize,
  ipv4FieldEngineSuffix,
  macFieldEngineSuffix
} from "./advancedVmValueModel";

export function isArpStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(stream && (stream.packet_type === "Ethernet/ARP" || rawArpTarget(stream)));
}

export function buildArpSenderIpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawArpTarget(stream);
  const arpOffset = rawTarget ? rawTarget.senderIpOffset : workbenchOuterL2HeaderLength(stream) + 14;
  const suffix = ipv4FieldEngineSuffix(rawTarget ? rawTarget.senderIp : stream.arp_sender_ip, stream.arp_sender_ip_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_sender_ip_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "arp_sender_ip",
    pktOffset: arpOffset + 4 - suffix.size,
    size: suffix.size,
    step: stream.arp_sender_ip_step
  });
}

export function buildArpTargetIpIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawArpTarget(stream);
  const arpOffset = rawTarget ? rawTarget.targetIpOffset : workbenchOuterL2HeaderLength(stream) + 24;
  const suffix = ipv4FieldEngineSuffix(rawTarget ? rawTarget.targetIp : stream.arp_target_ip, stream.arp_target_ip_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_target_ip_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "arp_target_ip",
    pktOffset: arpOffset + 4 - suffix.size,
    size: suffix.size,
    step: stream.arp_target_ip_step
  });
}

export function buildArpSenderMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawArpTarget(stream);
  const arpOffset = rawTarget ? rawTarget.senderMacOffset : workbenchOuterL2HeaderLength(stream) + 8;
  const suffix = macFieldEngineSuffix(rawTarget ? rawTarget.senderMac : stream.arp_sender_mac, stream.arp_sender_mac_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_sender_mac_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "arp_sender_mac",
    pktOffset: arpOffset + 6 - suffix.size,
    size: suffix.size,
    step: stream.arp_sender_mac_step
  });
}

export function buildArpTargetMacIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawArpTarget(stream);
  const arpOffset = rawTarget ? rawTarget.targetMacOffset : workbenchOuterL2HeaderLength(stream) + 18;
  const suffix = macFieldEngineSuffix(rawTarget ? rawTarget.targetMac : stream.arp_target_mac, stream.arp_target_mac_count);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_target_mac_count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: "arp_target_mac",
    pktOffset: arpOffset + 6 - suffix.size,
    size: suffix.size,
    step: stream.arp_target_mac_step
  });
}

export function buildArpOperationIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawArpTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: stream.arp_operation_count,
    initValue: rawTarget ? rawTarget.operation : stream.arp_operation,
    maxLimit: 65_535,
    name: "arp_operation",
    pktOffset: rawTarget ? rawTarget.operationOffset : workbenchOuterL2HeaderLength(stream) + 6,
    size: 2,
    step: stream.arp_operation_step
  });
}
