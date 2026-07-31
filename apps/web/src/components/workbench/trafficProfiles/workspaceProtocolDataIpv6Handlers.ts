import type { ProfileWorkbenchStream } from "../../../api";
import {
  runIpv6DestinationChange,
  runIpv6DestinationCountChange,
  runIpv6DestinationModeChange,
  runIpv6DestinationStepChange,
  runIpv6FlowLabelChange,
  runIpv6FlowLabelCountChange,
  runIpv6FlowLabelModeChange,
  runIpv6FlowLabelStepChange,
  runIpv6HopLimitChange,
  runIpv6HopLimitCountChange,
  runIpv6HopLimitModeChange,
  runIpv6HopLimitStepChange,
  runIpv6SourceChange,
  runIpv6SourceCountChange,
  runIpv6SourceModeChange,
  runIpv6SourceStepChange,
  runIpv6TrafficClassChange,
  runIpv6TrafficClassCountChange,
  runIpv6TrafficClassModeChange,
  runIpv6TrafficClassStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataIpv6HandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataIpv6Handlers = {
  changeIpv6Destination: (value: string) => boolean;
  changeIpv6DestinationCount: (value: number) => boolean;
  changeIpv6DestinationMode: (value: ProfileWorkbenchStream["ipv6_dst_mode"]) => boolean;
  changeIpv6DestinationStep: (value: number) => boolean;
  changeIpv6FlowLabel: (value: number) => boolean;
  changeIpv6FlowLabelCount: (value: number) => boolean;
  changeIpv6FlowLabelMode: (value: ProfileWorkbenchStream["ipv6_flow_label_mode"]) => boolean;
  changeIpv6FlowLabelStep: (value: number) => boolean;
  changeIpv6HopLimit: (value: number) => boolean;
  changeIpv6HopLimitCount: (value: number) => boolean;
  changeIpv6HopLimitMode: (value: ProfileWorkbenchStream["ipv6_hop_limit_mode"]) => boolean;
  changeIpv6HopLimitStep: (value: number) => boolean;
  changeIpv6Source: (value: string) => boolean;
  changeIpv6SourceCount: (value: number) => boolean;
  changeIpv6SourceMode: (value: ProfileWorkbenchStream["ipv6_src_mode"]) => boolean;
  changeIpv6SourceStep: (value: number) => boolean;
  changeIpv6TrafficClass: (value: number) => boolean;
  changeIpv6TrafficClassCount: (value: number) => boolean;
  changeIpv6TrafficClassMode: (value: ProfileWorkbenchStream["ipv6_traffic_class_mode"]) => boolean;
  changeIpv6TrafficClassStep: (value: number) => boolean;
};

export function workspaceProtocolDataIpv6Handlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataIpv6HandlerOptions): WorkspaceProtocolDataIpv6Handlers {
  return {
    changeIpv6Destination: (value) => runIpv6DestinationChange(value, selectedStream, streamPatchHandlers),
    changeIpv6DestinationCount: (value) =>
      runIpv6DestinationCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv6DestinationMode: (value) =>
      runIpv6DestinationModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv6DestinationStep: (value) =>
      runIpv6DestinationStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv6FlowLabel: (value) => runIpv6FlowLabelChange(value, selectedStream, streamPatchHandlers),
    changeIpv6FlowLabelCount: (value) =>
      runIpv6FlowLabelCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv6FlowLabelMode: (value) =>
      runIpv6FlowLabelModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv6FlowLabelStep: (value) => runIpv6FlowLabelStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv6HopLimit: (value) => runIpv6HopLimitChange(value, selectedStream, streamPatchHandlers),
    changeIpv6HopLimitCount: (value) =>
      runIpv6HopLimitCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv6HopLimitMode: (value) => runIpv6HopLimitModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv6HopLimitStep: (value) => runIpv6HopLimitStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv6Source: (value) => runIpv6SourceChange(value, selectedStream, streamPatchHandlers),
    changeIpv6SourceCount: (value) => runIpv6SourceCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv6SourceMode: (value) => runIpv6SourceModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv6SourceStep: (value) => runIpv6SourceStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv6TrafficClass: (value) => runIpv6TrafficClassChange(value, selectedStream, streamPatchHandlers),
    changeIpv6TrafficClassCount: (value) =>
      runIpv6TrafficClassCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv6TrafficClassMode: (value) =>
      runIpv6TrafficClassModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv6TrafficClassStep: (value) =>
      runIpv6TrafficClassStepChange(value, selectedStream, streamPatchHandlers)
  };
}
