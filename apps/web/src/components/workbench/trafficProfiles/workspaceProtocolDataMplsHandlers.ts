import type { ProfileWorkbenchStream } from "../../../api";
import {
  runMplsLabelChange,
  runMplsLabelCountChange,
  runMplsLabelModeChange,
  runMplsLabelStepChange,
  runMplsSecondLabelChange,
  runMplsSecondLabelCountChange,
  runMplsSecondLabelModeChange,
  runMplsSecondLabelSelectionChange,
  runMplsSecondLabelStepChange,
  runMplsSecondTrafficClassChange,
  runMplsSecondTrafficClassCountChange,
  runMplsSecondTrafficClassModeChange,
  runMplsSecondTrafficClassStepChange,
  runMplsSecondTtlChange,
  runMplsSecondTtlCountChange,
  runMplsSecondTtlModeChange,
  runMplsSecondTtlStepChange,
  runMplsThirdLabelChange,
  runMplsThirdLabelCountChange,
  runMplsThirdLabelModeChange,
  runMplsThirdLabelSelectionChange,
  runMplsThirdLabelStepChange,
  runMplsThirdTrafficClassChange,
  runMplsThirdTrafficClassCountChange,
  runMplsThirdTrafficClassModeChange,
  runMplsThirdTrafficClassStepChange,
  runMplsThirdTtlChange,
  runMplsThirdTtlCountChange,
  runMplsThirdTtlModeChange,
  runMplsThirdTtlStepChange,
  runMplsTrafficClassChange,
  runMplsTrafficClassCountChange,
  runMplsTrafficClassModeChange,
  runMplsTrafficClassStepChange,
  runMplsTtlChange,
  runMplsTtlCountChange,
  runMplsTtlModeChange,
  runMplsTtlStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataMplsHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataMplsHandlers = {
  changeMplsLabel: (value: number) => boolean;
  changeMplsLabelCount: (value: number) => boolean;
  changeMplsLabelMode: (value: ProfileWorkbenchStream["mpls_label_mode"]) => boolean;
  changeMplsLabelStep: (value: number) => boolean;
  changeMplsSecondLabel: (value: number) => boolean;
  changeMplsSecondLabelCount: (value: number) => boolean;
  changeMplsSecondLabelMode: (value: ProfileWorkbenchStream["mpls_label2_mode"]) => boolean;
  changeMplsSecondLabelSelection: (value: boolean) => boolean;
  changeMplsSecondLabelStep: (value: number) => boolean;
  changeMplsSecondTrafficClass: (value: number) => boolean;
  changeMplsSecondTrafficClassCount: (value: number) => boolean;
  changeMplsSecondTrafficClassMode: (value: ProfileWorkbenchStream["mpls_label2_tc_mode"]) => boolean;
  changeMplsSecondTrafficClassStep: (value: number) => boolean;
  changeMplsSecondTtl: (value: number) => boolean;
  changeMplsSecondTtlCount: (value: number) => boolean;
  changeMplsSecondTtlMode: (value: ProfileWorkbenchStream["mpls_label2_ttl_mode"]) => boolean;
  changeMplsSecondTtlStep: (value: number) => boolean;
  changeMplsThirdLabel: (value: number) => boolean;
  changeMplsThirdLabelCount: (value: number) => boolean;
  changeMplsThirdLabelMode: (value: ProfileWorkbenchStream["mpls_label3_mode"]) => boolean;
  changeMplsThirdLabelSelection: (value: boolean) => boolean;
  changeMplsThirdLabelStep: (value: number) => boolean;
  changeMplsThirdTrafficClass: (value: number) => boolean;
  changeMplsThirdTrafficClassCount: (value: number) => boolean;
  changeMplsThirdTrafficClassMode: (value: ProfileWorkbenchStream["mpls_label3_tc_mode"]) => boolean;
  changeMplsThirdTrafficClassStep: (value: number) => boolean;
  changeMplsThirdTtl: (value: number) => boolean;
  changeMplsThirdTtlCount: (value: number) => boolean;
  changeMplsThirdTtlMode: (value: ProfileWorkbenchStream["mpls_label3_ttl_mode"]) => boolean;
  changeMplsThirdTtlStep: (value: number) => boolean;
  changeMplsTrafficClass: (value: number) => boolean;
  changeMplsTrafficClassCount: (value: number) => boolean;
  changeMplsTrafficClassMode: (value: ProfileWorkbenchStream["mpls_tc_mode"]) => boolean;
  changeMplsTrafficClassStep: (value: number) => boolean;
  changeMplsTtl: (value: number) => boolean;
  changeMplsTtlCount: (value: number) => boolean;
  changeMplsTtlMode: (value: ProfileWorkbenchStream["mpls_ttl_mode"]) => boolean;
  changeMplsTtlStep: (value: number) => boolean;
};

export function workspaceProtocolDataMplsHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataMplsHandlerOptions): WorkspaceProtocolDataMplsHandlers {
  return {
    changeMplsLabel: (value) => runMplsLabelChange(value, selectedStream, streamPatchHandlers),
    changeMplsLabelCount: (value) => runMplsLabelCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsLabelMode: (value) => runMplsLabelModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsLabelStep: (value) => runMplsLabelStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondLabel: (value) => runMplsSecondLabelChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondLabelCount: (value) => runMplsSecondLabelCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondLabelMode: (value) => runMplsSecondLabelModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondLabelSelection: (value) =>
      runMplsSecondLabelSelectionChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondLabelStep: (value) => runMplsSecondLabelStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTrafficClass: (value) =>
      runMplsSecondTrafficClassChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTrafficClassCount: (value) =>
      runMplsSecondTrafficClassCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTrafficClassMode: (value) =>
      runMplsSecondTrafficClassModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTrafficClassStep: (value) =>
      runMplsSecondTrafficClassStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTtl: (value) => runMplsSecondTtlChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTtlCount: (value) => runMplsSecondTtlCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTtlMode: (value) => runMplsSecondTtlModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsSecondTtlStep: (value) => runMplsSecondTtlStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdLabel: (value) => runMplsThirdLabelChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdLabelCount: (value) => runMplsThirdLabelCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdLabelMode: (value) => runMplsThirdLabelModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdLabelSelection: (value) =>
      runMplsThirdLabelSelectionChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdLabelStep: (value) => runMplsThirdLabelStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTrafficClass: (value) =>
      runMplsThirdTrafficClassChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTrafficClassCount: (value) =>
      runMplsThirdTrafficClassCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTrafficClassMode: (value) =>
      runMplsThirdTrafficClassModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTrafficClassStep: (value) =>
      runMplsThirdTrafficClassStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTtl: (value) => runMplsThirdTtlChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTtlCount: (value) => runMplsThirdTtlCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTtlMode: (value) => runMplsThirdTtlModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsThirdTtlStep: (value) => runMplsThirdTtlStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsTrafficClass: (value) => runMplsTrafficClassChange(value, selectedStream, streamPatchHandlers),
    changeMplsTrafficClassCount: (value) =>
      runMplsTrafficClassCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsTrafficClassMode: (value) =>
      runMplsTrafficClassModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsTrafficClassStep: (value) =>
      runMplsTrafficClassStepChange(value, selectedStream, streamPatchHandlers),
    changeMplsTtl: (value) => runMplsTtlChange(value, selectedStream, streamPatchHandlers),
    changeMplsTtlCount: (value) => runMplsTtlCountChange(value, selectedStream, streamPatchHandlers),
    changeMplsTtlMode: (value) => runMplsTtlModeChange(value, selectedStream, streamPatchHandlers),
    changeMplsTtlStep: (value) => runMplsTtlStepChange(value, selectedStream, streamPatchHandlers)
  };
}
