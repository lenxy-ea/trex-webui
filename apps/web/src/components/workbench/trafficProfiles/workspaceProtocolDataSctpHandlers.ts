import type { ProfileWorkbenchStream } from "../../../api";
import {
  runSctpChecksumChange,
  runSctpChecksumOverrideChange,
  runSctpCountChange,
  runSctpModeChange,
  runSctpNumberChange,
  runSctpStepChange,
  type SctpModePatchAction,
  type SctpNumericPatchField,
  type SctpVariablePatchField,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataSctpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataSctpHandlers = {
  changeSctpChecksum: (value: string) => boolean;
  changeSctpChecksumOverride: (value: boolean) => boolean;
  changeSctpCount: (field: SctpVariablePatchField, value: number) => boolean;
  changeSctpMode: (field: SctpModePatchAction["field"], value: SctpModePatchAction["mode"]) => boolean;
  changeSctpNumber: (field: SctpNumericPatchField, value: number) => boolean;
  changeSctpStep: (field: SctpVariablePatchField, value: number) => boolean;
};

export function workspaceProtocolDataSctpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataSctpHandlerOptions): WorkspaceProtocolDataSctpHandlers {
  return {
    changeSctpChecksum: (value) => runSctpChecksumChange(value, selectedStream, streamPatchHandlers),
    changeSctpChecksumOverride: (value) =>
      runSctpChecksumOverrideChange(value, selectedStream, streamPatchHandlers),
    changeSctpCount: (field, value) => runSctpCountChange(field, value, selectedStream, streamPatchHandlers),
    changeSctpMode: (field, value) => runSctpModeChange(field, value, selectedStream, streamPatchHandlers),
    changeSctpNumber: (field, value) => runSctpNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeSctpStep: (field, value) => runSctpStepChange(field, value, selectedStream, streamPatchHandlers)
  };
}
