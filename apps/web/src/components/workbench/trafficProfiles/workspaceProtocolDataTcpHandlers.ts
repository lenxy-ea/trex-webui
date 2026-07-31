import type { ProfileWorkbenchStream } from "../../../api";
import type { TcpFlagKey } from "./model";
import {
  runTcpChecksumChange,
  runTcpChecksumOverrideChange,
  runTcpCoreCountChange,
  runTcpCoreModeChange,
  runTcpCoreNumberChange,
  runTcpCoreStepChange,
  runTcpFlagChange,
  runTcpOptionCountChange,
  runTcpOptionModeChange,
  runTcpOptionNumberChange,
  runTcpOptionSelectionChange,
  runTcpOptionStepChange,
  type StreamPatchHandlers,
  type TcpCoreModePatchAction,
  type TcpCoreNumericPatchField,
  type TcpCoreVariablePatchField,
  type TcpOptionModePatchAction,
  type TcpOptionNumericPatchField,
  type TcpOptionSelection,
  type TcpOptionVariablePatchField
} from "./streamPatchModel";

export type WorkspaceProtocolDataTcpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataTcpHandlers = {
  changeTcpChecksum: (value: string) => boolean;
  changeTcpChecksumOverride: (value: boolean) => boolean;
  changeTcpCoreCount: (field: TcpCoreVariablePatchField, value: number) => boolean;
  changeTcpCoreMode: (field: TcpCoreModePatchAction["field"], value: TcpCoreModePatchAction["mode"]) => boolean;
  changeTcpCoreNumber: (field: TcpCoreNumericPatchField, value: number) => boolean;
  changeTcpCoreStep: (field: TcpCoreVariablePatchField, value: number) => boolean;
  changeTcpFlag: (flag: TcpFlagKey, checked: boolean) => boolean;
  changeTcpOptionCount: (field: TcpOptionVariablePatchField, value: number) => boolean;
  changeTcpOptionMode: (
    field: TcpOptionModePatchAction["field"],
    value: TcpOptionModePatchAction["mode"]
  ) => boolean;
  changeTcpOptionNumber: (field: TcpOptionNumericPatchField, value: number) => boolean;
  changeTcpOptionSelection: (option: TcpOptionSelection, enabled: boolean) => boolean;
  changeTcpOptionStep: (field: TcpOptionVariablePatchField, value: number) => boolean;
};

export function workspaceProtocolDataTcpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataTcpHandlerOptions): WorkspaceProtocolDataTcpHandlers {
  return {
    changeTcpChecksum: (value) => runTcpChecksumChange(value, selectedStream, streamPatchHandlers),
    changeTcpChecksumOverride: (value) => runTcpChecksumOverrideChange(value, selectedStream, streamPatchHandlers),
    changeTcpCoreCount: (field, value) => runTcpCoreCountChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpCoreMode: (field, value) => runTcpCoreModeChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpCoreNumber: (field, value) => runTcpCoreNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpCoreStep: (field, value) => runTcpCoreStepChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpFlag: (flag, checked) => runTcpFlagChange(flag, checked, selectedStream, streamPatchHandlers),
    changeTcpOptionCount: (field, value) =>
      runTcpOptionCountChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpOptionMode: (field, value) => runTcpOptionModeChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpOptionNumber: (field, value) =>
      runTcpOptionNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeTcpOptionSelection: (option, enabled) =>
      runTcpOptionSelectionChange(option, enabled, selectedStream, streamPatchHandlers),
    changeTcpOptionStep: (field, value) => runTcpOptionStepChange(field, value, selectedStream, streamPatchHandlers)
  };
}
