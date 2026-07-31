import type { ProfileWorkbenchStream } from "../../../api";
import {
  runIcmpChecksumChange,
  runIcmpChecksumOverrideChange,
  runIcmpCodeChange,
  runIcmpCodeCountChange,
  runIcmpCodeModeChange,
  runIcmpCodeStepChange,
  runIcmpIdentifierChange,
  runIcmpIdentifierCountChange,
  runIcmpIdentifierModeChange,
  runIcmpIdentifierStepChange,
  runIcmpSequenceChange,
  runIcmpSequenceCountChange,
  runIcmpSequenceModeChange,
  runIcmpSequenceStepChange,
  runIcmpTypeChange,
  runIcmpTypeCountChange,
  runIcmpTypeModeChange,
  runIcmpTypeStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataIcmpHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataIcmpHandlers = {
  changeIcmpChecksum: (value: string) => boolean;
  changeIcmpChecksumOverride: (value: boolean) => boolean;
  changeIcmpCode: (value: number) => boolean;
  changeIcmpCodeCount: (value: number) => boolean;
  changeIcmpCodeMode: (value: ProfileWorkbenchStream["icmp_code_mode"]) => boolean;
  changeIcmpCodeStep: (value: number) => boolean;
  changeIcmpIdentifier: (value: number) => boolean;
  changeIcmpIdentifierCount: (value: number) => boolean;
  changeIcmpIdentifierMode: (value: ProfileWorkbenchStream["icmp_identifier_mode"]) => boolean;
  changeIcmpIdentifierStep: (value: number) => boolean;
  changeIcmpSequence: (value: number) => boolean;
  changeIcmpSequenceCount: (value: number) => boolean;
  changeIcmpSequenceMode: (value: ProfileWorkbenchStream["icmp_sequence_mode"]) => boolean;
  changeIcmpSequenceStep: (value: number) => boolean;
  changeIcmpType: (value: number) => boolean;
  changeIcmpTypeCount: (value: number) => boolean;
  changeIcmpTypeMode: (value: ProfileWorkbenchStream["icmp_type_mode"]) => boolean;
  changeIcmpTypeStep: (value: number) => boolean;
};

export function workspaceProtocolDataIcmpHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataIcmpHandlerOptions): WorkspaceProtocolDataIcmpHandlers {
  return {
    changeIcmpChecksum: (value) => runIcmpChecksumChange(value, selectedStream, streamPatchHandlers),
    changeIcmpChecksumOverride: (value) =>
      runIcmpChecksumOverrideChange(value, selectedStream, streamPatchHandlers),
    changeIcmpCode: (value) => runIcmpCodeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpCodeCount: (value) => runIcmpCodeCountChange(value, selectedStream, streamPatchHandlers),
    changeIcmpCodeMode: (value) => runIcmpCodeModeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpCodeStep: (value) => runIcmpCodeStepChange(value, selectedStream, streamPatchHandlers),
    changeIcmpIdentifier: (value) => runIcmpIdentifierChange(value, selectedStream, streamPatchHandlers),
    changeIcmpIdentifierCount: (value) =>
      runIcmpIdentifierCountChange(value, selectedStream, streamPatchHandlers),
    changeIcmpIdentifierMode: (value) =>
      runIcmpIdentifierModeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpIdentifierStep: (value) => runIcmpIdentifierStepChange(value, selectedStream, streamPatchHandlers),
    changeIcmpSequence: (value) => runIcmpSequenceChange(value, selectedStream, streamPatchHandlers),
    changeIcmpSequenceCount: (value) => runIcmpSequenceCountChange(value, selectedStream, streamPatchHandlers),
    changeIcmpSequenceMode: (value) => runIcmpSequenceModeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpSequenceStep: (value) => runIcmpSequenceStepChange(value, selectedStream, streamPatchHandlers),
    changeIcmpType: (value) => runIcmpTypeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpTypeCount: (value) => runIcmpTypeCountChange(value, selectedStream, streamPatchHandlers),
    changeIcmpTypeMode: (value) => runIcmpTypeModeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpTypeStep: (value) => runIcmpTypeStepChange(value, selectedStream, streamPatchHandlers)
  };
}
