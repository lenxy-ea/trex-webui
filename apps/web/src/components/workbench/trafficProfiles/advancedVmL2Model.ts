import type { ProfileWorkbenchStream } from "../../../api";
import {
  mediaAccessTypeText,
  type AdvancedVmBody
} from "./model";
import {
  rawOuterEtherTypeTarget,
  rawOuterMacAddressTarget
} from "./rawPacketModel";
import {
  fieldEngineMaxForSize,
  macFieldEngineSuffix,
  parseHexWord
} from "./advancedVmValueModel";
import { buildAdvancedNumberWriteVmBody } from "./advancedVmNumberWriteModel";

function buildOuterMacAddressIncVmBody(stream: ProfileWorkbenchStream, field: "dst" | "src"): AdvancedVmBody {
  const rawTarget = rawOuterMacAddressTarget(stream, field);
  const address = rawTarget?.address ?? (field === "dst" ? stream.ether_dst : stream.ether_src);
  const count = field === "dst" ? stream.ether_dst_count : stream.ether_src_count;
  const step = field === "dst" ? stream.ether_dst_step : stream.ether_src_step;
  const suffix = macFieldEngineSuffix(address, count);
  const variableName = field === "dst" ? "mac_dest" : "mac_src";
  const baseOffset = rawTarget?.offset ?? (field === "dst" ? 0 : 6);
  return buildAdvancedNumberWriteVmBody({
    count,
    initValue: suffix.initValue,
    maxLimit: fieldEngineMaxForSize(suffix.size),
    name: variableName,
    pktOffset: baseOffset + 6 - suffix.size,
    size: suffix.size,
    step
  });
}

export function isOuterEtherTypeStream(stream: ProfileWorkbenchStream | null | undefined) {
  if (stream?.packet_binary_base64) {
    return Boolean(rawOuterEtherTypeTarget(stream));
  }
  return Boolean(stream && !stream.vlan_enabled && !stream.mpls_enabled);
}

export function buildOuterEtherTypeIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  const rawTarget = rawOuterEtherTypeTarget(stream);
  return buildAdvancedNumberWriteVmBody({
    count: 16,
    initValue: rawTarget ? rawTarget.etherType : parseHexWord(mediaAccessTypeText(stream)),
    maxLimit: 65_535,
    name: "ether_type",
    pktOffset: rawTarget?.offset ?? 12,
    size: 2,
    step: 1
  });
}

export function buildOuterMacDstIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterMacAddressIncVmBody(stream, "dst");
}

export function buildOuterMacSrcIncVmBody(stream: ProfileWorkbenchStream): AdvancedVmBody {
  return buildOuterMacAddressIncVmBody(stream, "src");
}
