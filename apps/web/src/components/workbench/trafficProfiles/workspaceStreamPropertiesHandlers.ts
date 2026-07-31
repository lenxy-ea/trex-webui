import type { ProfileWorkbenchStream } from "../../../api";
import {
  runAfterStreamGotoChange,
  runAfterStreamStopChange,
  runBurstCountChange,
  runFlowStatsEnabledChange,
  runFrameLengthMaxChange,
  runFrameLengthMinChange,
  runIbgChange,
  runIsgChange,
  runLatencyEnabledChange,
  runLoopActionCountChange,
  runLoopActionCountEnabledChange,
  runNextStreamChange,
  runPacketFrameLengthChange,
  runPacketsPerBurstChange,
  runPgIdChange,
  runRateTypeChange,
  runRateValueChange,
  runSelfStartChange,
  runStreamEnabledChange,
  runStreamNameChange,
  runTotalPacketsChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceStreamPropertiesHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceStreamPropertiesHandlers = {
  changeAfterStreamGoto: () => boolean;
  changeAfterStreamStop: () => boolean;
  changeBurstCount: (value: number) => boolean;
  changeFlowStatsEnabled: (value: boolean) => boolean;
  changeFrameLength: (value: number) => boolean;
  changeFrameLengthMax: (value: number) => boolean;
  changeFrameLengthMin: (value: number) => boolean;
  changeIbg: (value: number) => boolean;
  changeIsg: (value: number) => boolean;
  changeLatencyEnabled: (value: boolean) => boolean;
  changeLoopActionCount: (value: number) => boolean;
  changeLoopActionCountEnabled: (value: boolean) => boolean;
  changeNextStream: (value: number) => boolean;
  changePacketsPerBurst: (value: number) => boolean;
  changePgId: (value: number) => boolean;
  changeRateType: (value: ProfileWorkbenchStream["rate_type"]) => boolean;
  changeRateValue: (value: number) => boolean;
  changeSelfStart: (value: boolean) => boolean;
  changeStreamEnabled: (value: boolean) => boolean;
  changeStreamName: (value: string) => boolean;
  changeTotalPackets: (value: number) => boolean;
};

export function workspaceStreamPropertiesHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceStreamPropertiesHandlerOptions): WorkspaceStreamPropertiesHandlers {
  return {
    changeAfterStreamGoto: () => runAfterStreamGotoChange(selectedStream, streamPatchHandlers),
    changeAfterStreamStop: () => runAfterStreamStopChange(selectedStream, streamPatchHandlers),
    changeBurstCount: (value) => runBurstCountChange(value, selectedStream, streamPatchHandlers),
    changeFlowStatsEnabled: (value) => runFlowStatsEnabledChange(value, selectedStream, streamPatchHandlers),
    changeFrameLength: (value) => runPacketFrameLengthChange(value, selectedStream, streamPatchHandlers),
    changeFrameLengthMax: (value) => runFrameLengthMaxChange(value, selectedStream, streamPatchHandlers),
    changeFrameLengthMin: (value) => runFrameLengthMinChange(value, selectedStream, streamPatchHandlers),
    changeIbg: (value) => runIbgChange(value, selectedStream, streamPatchHandlers),
    changeIsg: (value) => runIsgChange(value, selectedStream, streamPatchHandlers),
    changeLatencyEnabled: (value) => runLatencyEnabledChange(value, selectedStream, streamPatchHandlers),
    changeLoopActionCount: (value) => runLoopActionCountChange(value, selectedStream, streamPatchHandlers),
    changeLoopActionCountEnabled: (value) => runLoopActionCountEnabledChange(value, selectedStream, streamPatchHandlers),
    changeNextStream: (value) => runNextStreamChange(value, selectedStream, streamPatchHandlers),
    changePacketsPerBurst: (value) => runPacketsPerBurstChange(value, selectedStream, streamPatchHandlers),
    changePgId: (value) => runPgIdChange(value, selectedStream, streamPatchHandlers),
    changeRateType: (value) => runRateTypeChange(value, selectedStream, streamPatchHandlers),
    changeRateValue: (value) => runRateValueChange(value, selectedStream, streamPatchHandlers),
    changeSelfStart: (value) => runSelfStartChange(value, selectedStream, streamPatchHandlers),
    changeStreamEnabled: (value) => runStreamEnabledChange(value, selectedStream, streamPatchHandlers),
    changeStreamName: (value) => runStreamNameChange(value, selectedStream, streamPatchHandlers),
    changeTotalPackets: (value) => runTotalPacketsChange(value, selectedStream, streamPatchHandlers)
  };
}
