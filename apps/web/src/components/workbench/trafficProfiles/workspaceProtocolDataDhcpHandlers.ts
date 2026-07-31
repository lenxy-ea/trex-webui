import type { ProfileWorkbenchStream } from "../../../api";
import {
  runDhcpBootpAddressCountChange,
  runDhcpBootpAddressModeChange,
  runDhcpBootpAddressStepChange,
  runDhcpBootpAddressTextChange,
  runDhcpBootpCountChange,
  runDhcpBootpModeChange,
  runDhcpBootpNumberChange,
  runDhcpBootpStepChange,
  runDhcpBootpTextChange,
  runDhcpOptionAddressCountChange,
  runDhcpOptionAddressModeChange,
  runDhcpOptionAddressStepChange,
  runDhcpOptionAddressTextChange,
  runDhcpOptionTextChange,
  runDhcpOptionTimerCountChange,
  runDhcpOptionTimerModeChange,
  runDhcpOptionTimerNumberChange,
  runDhcpOptionTimerStepChange,
  runDhcpSelectionChange,
  type DhcpBootpAddressModePatchAction,
  type DhcpBootpAddressPatchField,
  type DhcpBootpModePatchAction,
  type DhcpBootpNumericPatchField,
  type DhcpBootpTextPatchField,
  type DhcpBootpVariablePatchField,
  type DhcpOptionAddressModePatchAction,
  type DhcpOptionAddressPatchField,
  type DhcpOptionTextPatchField,
  type DhcpOptionTimerModePatchAction,
  type DhcpOptionTimerPatchField,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataDhcpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataDhcpHandlers = {
  changeDhcpBootpAddressCount: (field: DhcpBootpAddressPatchField, value: number) => boolean;
  changeDhcpBootpAddressMode: (
    field: DhcpBootpAddressModePatchAction["field"],
    value: DhcpBootpAddressModePatchAction["mode"]
  ) => boolean;
  changeDhcpBootpAddressStep: (field: DhcpBootpAddressPatchField, value: number) => boolean;
  changeDhcpBootpAddressText: (field: DhcpBootpAddressPatchField, value: string) => boolean;
  changeDhcpBootpCount: (field: DhcpBootpVariablePatchField, value: number) => boolean;
  changeDhcpBootpMode: (
    field: DhcpBootpModePatchAction["field"],
    value: DhcpBootpModePatchAction["mode"]
  ) => boolean;
  changeDhcpBootpNumber: (field: DhcpBootpNumericPatchField, value: number) => boolean;
  changeDhcpBootpStep: (field: DhcpBootpVariablePatchField, value: number) => boolean;
  changeDhcpBootpText: (field: DhcpBootpTextPatchField, value: string) => boolean;
  changeDhcpOptionAddressCount: (field: DhcpOptionAddressPatchField, value: number) => boolean;
  changeDhcpOptionAddressMode: (
    field: DhcpOptionAddressModePatchAction["field"],
    value: DhcpOptionAddressModePatchAction["mode"]
  ) => boolean;
  changeDhcpOptionAddressStep: (field: DhcpOptionAddressPatchField, value: number) => boolean;
  changeDhcpOptionAddressText: (field: DhcpOptionAddressPatchField, value: string) => boolean;
  changeDhcpOptionText: (field: DhcpOptionTextPatchField, value: string) => boolean;
  changeDhcpOptionTimerCount: (field: DhcpOptionTimerPatchField, value: number) => boolean;
  changeDhcpOptionTimerMode: (
    field: DhcpOptionTimerModePatchAction["field"],
    value: DhcpOptionTimerModePatchAction["mode"]
  ) => boolean;
  changeDhcpOptionTimerNumber: (field: DhcpOptionTimerPatchField, value: number) => boolean;
  changeDhcpOptionTimerStep: (field: DhcpOptionTimerPatchField, value: number) => boolean;
  changeDhcpSelection: (value: boolean) => boolean;
};

export function workspaceProtocolDataDhcpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataDhcpHandlerOptions): WorkspaceProtocolDataDhcpHandlers {
  return {
    changeDhcpBootpAddressCount: (field, value) =>
      runDhcpBootpAddressCountChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpAddressMode: (field, value) =>
      runDhcpBootpAddressModeChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpAddressStep: (field, value) =>
      runDhcpBootpAddressStepChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpAddressText: (field, value) =>
      runDhcpBootpAddressTextChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpCount: (field, value) =>
      runDhcpBootpCountChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpMode: (field, value) =>
      runDhcpBootpModeChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpNumber: (field, value) =>
      runDhcpBootpNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpStep: (field, value) =>
      runDhcpBootpStepChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpBootpText: (field, value) =>
      runDhcpBootpTextChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionAddressCount: (field, value) =>
      runDhcpOptionAddressCountChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionAddressMode: (field, value) =>
      runDhcpOptionAddressModeChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionAddressStep: (field, value) =>
      runDhcpOptionAddressStepChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionAddressText: (field, value) =>
      runDhcpOptionAddressTextChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionText: (field, value) =>
      runDhcpOptionTextChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionTimerCount: (field, value) =>
      runDhcpOptionTimerCountChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionTimerMode: (field, value) =>
      runDhcpOptionTimerModeChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionTimerNumber: (field, value) =>
      runDhcpOptionTimerNumberChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpOptionTimerStep: (field, value) =>
      runDhcpOptionTimerStepChange(field, value, selectedStream, streamPatchHandlers),
    changeDhcpSelection: (value) => runDhcpSelectionChange(value, selectedStream, streamPatchHandlers)
  };
}
