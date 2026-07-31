import type { ProfileWorkbenchStream } from "../../../api";
import {
  runL4DestinationPortChange,
  runL4DestinationPortCountChange,
  runL4DestinationPortModeChange,
  runL4DestinationPortOverrideSelectionChange,
  runL4DestinationPortStepChange,
  runL4SourcePortChange,
  runL4SourcePortCountChange,
  runL4SourcePortModeChange,
  runL4SourcePortOverrideSelectionChange,
  runL4SourcePortStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataTransportHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataTransportHandlers = {
  changeL4DestinationPort: (value: number) => boolean;
  changeL4DestinationPortCount: (value: number) => boolean;
  changeL4DestinationPortMode: (value: ProfileWorkbenchStream["l4_dst_port_mode"]) => boolean;
  changeL4DestinationPortOverrideSelection: (value: boolean) => boolean;
  changeL4DestinationPortStep: (value: number) => boolean;
  changeL4SourcePort: (value: number) => boolean;
  changeL4SourcePortCount: (value: number) => boolean;
  changeL4SourcePortMode: (value: ProfileWorkbenchStream["l4_src_port_mode"]) => boolean;
  changeL4SourcePortOverrideSelection: (value: boolean) => boolean;
  changeL4SourcePortStep: (value: number) => boolean;
};

export function workspaceProtocolDataTransportHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataTransportHandlerOptions): WorkspaceProtocolDataTransportHandlers {
  return {
    changeL4DestinationPort: (value) => runL4DestinationPortChange(value, selectedStream, streamPatchHandlers),
    changeL4DestinationPortCount: (value) =>
      runL4DestinationPortCountChange(value, selectedStream, streamPatchHandlers),
    changeL4DestinationPortMode: (value) =>
      runL4DestinationPortModeChange(value, selectedStream, streamPatchHandlers),
    changeL4DestinationPortOverrideSelection: (value) =>
      runL4DestinationPortOverrideSelectionChange(value, selectedStream, streamPatchHandlers),
    changeL4DestinationPortStep: (value) =>
      runL4DestinationPortStepChange(value, selectedStream, streamPatchHandlers),
    changeL4SourcePort: (value) => runL4SourcePortChange(value, selectedStream, streamPatchHandlers),
    changeL4SourcePortCount: (value) => runL4SourcePortCountChange(value, selectedStream, streamPatchHandlers),
    changeL4SourcePortMode: (value) => runL4SourcePortModeChange(value, selectedStream, streamPatchHandlers),
    changeL4SourcePortOverrideSelection: (value) =>
      runL4SourcePortOverrideSelectionChange(value, selectedStream, streamPatchHandlers),
    changeL4SourcePortStep: (value) => runL4SourcePortStepChange(value, selectedStream, streamPatchHandlers)
  };
}
