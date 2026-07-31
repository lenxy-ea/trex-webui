import type { ProfileWorkbenchStream } from "../../../api";
import {
  runPayloadPatternTextInputChange,
  runPayloadPatternTypeInputChange,
  type PayloadPatternEditHandlers
} from "./payloadPatternModel";
import {
  runAdvancedCacheSizeTypeChange,
  runAdvancedCacheValueChange,
  runFrameLengthTypeChange,
  runGreInnerIpVersionChange,
  runGtpuInnerIpVersionChange,
  runPacketTypeChange,
  runPayloadPatternChange,
  runPayloadPatternImportChange,
  runPayloadTypeChange,
  runStreamModeChange,
  runVxlanInnerIpVersionChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceStreamPatchHandlers = {
  applyPayloadPatternImport: (pattern: string) => boolean;
  changeAdvancedCacheSizeType: (cacheSizeType: ProfileWorkbenchStream["advanced_cache_size_type"]) => boolean;
  changeAdvancedCacheValue: (cacheValue: number) => boolean;
  changeFrameLengthType: (frameLengthType: ProfileWorkbenchStream["frame_length_type"]) => boolean;
  changeGreInnerIpVersion: (version: ProfileWorkbenchStream["gre_inner_ip_version"]) => boolean;
  changeGtpuInnerIpVersion: (version: ProfileWorkbenchStream["gtpu_inner_ip_version"]) => boolean;
  changePacketType: (packetType: ProfileWorkbenchStream["packet_type"]) => boolean;
  changePayloadPatternTextInput: (pattern: string) => boolean;
  changePayloadPatternTypeInput: (payloadType: ProfileWorkbenchStream["payload_type"]) => boolean;
  changeStreamMode: (mode: ProfileWorkbenchStream["mode"]) => boolean;
  changeVxlanInnerIpVersion: (version: ProfileWorkbenchStream["vxlan_inner_ip_version"]) => boolean;
};

export type WorkspaceStreamPatchHandlerInput = {
  clearPayloadPatternStatus: () => void;
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export function workspaceStreamPatchHandlers({
  clearPayloadPatternStatus,
  selectedStream,
  streamPatchHandlers
}: WorkspaceStreamPatchHandlerInput): WorkspaceStreamPatchHandlers {
  const applyPayloadPatternImport = (pattern: string) =>
    runPayloadPatternImportChange(pattern, selectedStream, streamPatchHandlers);
  const payloadPatternEditHandlers: PayloadPatternEditHandlers = {
    changePattern: (pattern) => runPayloadPatternChange(pattern, selectedStream, streamPatchHandlers),
    changeType: (payloadType) => runPayloadTypeChange(payloadType, selectedStream, streamPatchHandlers),
    clearStatus: clearPayloadPatternStatus
  };

  return {
    applyPayloadPatternImport,
    changeAdvancedCacheSizeType: (cacheSizeType) =>
      runAdvancedCacheSizeTypeChange(cacheSizeType, selectedStream, streamPatchHandlers),
    changeAdvancedCacheValue: (cacheValue) =>
      runAdvancedCacheValueChange(cacheValue, selectedStream, streamPatchHandlers),
    changeFrameLengthType: (frameLengthType) =>
      runFrameLengthTypeChange(frameLengthType, selectedStream, streamPatchHandlers),
    changeGreInnerIpVersion: (version) =>
      runGreInnerIpVersionChange(version, selectedStream, streamPatchHandlers),
    changeGtpuInnerIpVersion: (version) =>
      runGtpuInnerIpVersionChange(version, selectedStream, streamPatchHandlers),
    changePacketType: (packetType) =>
      runPacketTypeChange(packetType, selectedStream, streamPatchHandlers),
    changePayloadPatternTextInput: (pattern) =>
      runPayloadPatternTextInputChange(pattern, payloadPatternEditHandlers),
    changePayloadPatternTypeInput: (payloadType) =>
      runPayloadPatternTypeInputChange(payloadType, payloadPatternEditHandlers),
    changeStreamMode: (mode) =>
      runStreamModeChange(mode, selectedStream, streamPatchHandlers),
    changeVxlanInnerIpVersion: (version) =>
      runVxlanInnerIpVersionChange(version, selectedStream, streamPatchHandlers)
  };
}
