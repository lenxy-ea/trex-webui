import type { ProfileWorkbenchStream } from "../../../api";
import type { L3Selection, L4Selection } from "./protocolSelectionModel";
import {
  runL3SelectionChange,
  runL4SelectionChange,
  runMplsSelectionChange,
  runPayloadSelectionChange,
  runTunnelSelectionChange,
  runVlanSelectionChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolSelectionHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolSelectionHandlers = {
  changeL3Selection: (value: L3Selection) => boolean;
  changeL4Selection: (value: L4Selection) => boolean;
  changeMplsSelection: (value: boolean) => boolean;
  changePayloadSelection: (value: boolean) => boolean;
  changeTunnelSelection: (value: "none" | "vxlan" | "gtpu") => boolean;
  changeVlanSelection: (value: boolean) => boolean;
};

export function workspaceProtocolSelectionHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolSelectionHandlerOptions): WorkspaceProtocolSelectionHandlers {
  return {
    changeL3Selection: (value) => runL3SelectionChange(value, selectedStream, streamPatchHandlers),
    changeL4Selection: (value) => runL4SelectionChange(value, selectedStream, streamPatchHandlers),
    changeMplsSelection: (value) => runMplsSelectionChange(value, selectedStream, streamPatchHandlers),
    changePayloadSelection: (value) => runPayloadSelectionChange(value, selectedStream, streamPatchHandlers),
    changeTunnelSelection: (value) => runTunnelSelectionChange(value, selectedStream, streamPatchHandlers),
    changeVlanSelection: (value) => runVlanSelectionChange(value, selectedStream, streamPatchHandlers)
  };
}
