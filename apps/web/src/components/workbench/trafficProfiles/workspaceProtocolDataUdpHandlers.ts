import type { ProfileWorkbenchStream } from "../../../api";
import {
  runUdpChecksumChange,
  runUdpChecksumCountChange,
  runUdpChecksumModeChange,
  runUdpChecksumOverrideChange,
  runUdpChecksumStepChange,
  runUdpLengthChange,
  runUdpLengthCountChange,
  runUdpLengthModeChange,
  runUdpLengthOverrideSelectionChange,
  runUdpLengthStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataUdpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataUdpHandlers = {
  changeUdpChecksum: (value: string) => boolean;
  changeUdpChecksumCount: (value: number) => boolean;
  changeUdpChecksumMode: (value: ProfileWorkbenchStream["udp_checksum_mode"]) => boolean;
  changeUdpChecksumOverride: (value: boolean) => boolean;
  changeUdpChecksumStep: (value: number) => boolean;
  changeUdpLength: (value: number) => boolean;
  changeUdpLengthCount: (value: number) => boolean;
  changeUdpLengthMode: (value: ProfileWorkbenchStream["udp_length_mode"]) => boolean;
  changeUdpLengthOverrideSelection: (value: boolean) => boolean;
  changeUdpLengthStep: (value: number) => boolean;
};

export function workspaceProtocolDataUdpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataUdpHandlerOptions): WorkspaceProtocolDataUdpHandlers {
  return {
    changeUdpChecksum: (value) => runUdpChecksumChange(value, selectedStream, streamPatchHandlers),
    changeUdpChecksumCount: (value) => runUdpChecksumCountChange(value, selectedStream, streamPatchHandlers),
    changeUdpChecksumMode: (value) => runUdpChecksumModeChange(value, selectedStream, streamPatchHandlers),
    changeUdpChecksumOverride: (value) =>
      runUdpChecksumOverrideChange(value, selectedStream, streamPatchHandlers),
    changeUdpChecksumStep: (value) => runUdpChecksumStepChange(value, selectedStream, streamPatchHandlers),
    changeUdpLength: (value) => runUdpLengthChange(value, selectedStream, streamPatchHandlers),
    changeUdpLengthCount: (value) => runUdpLengthCountChange(value, selectedStream, streamPatchHandlers),
    changeUdpLengthMode: (value) => runUdpLengthModeChange(value, selectedStream, streamPatchHandlers),
    changeUdpLengthOverrideSelection: (value) =>
      runUdpLengthOverrideSelectionChange(value, selectedStream, streamPatchHandlers),
    changeUdpLengthStep: (value) => runUdpLengthStepChange(value, selectedStream, streamPatchHandlers)
  };
}
