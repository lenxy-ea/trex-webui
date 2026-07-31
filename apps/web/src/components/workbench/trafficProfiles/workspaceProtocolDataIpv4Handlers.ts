import type { ProfileWorkbenchStream } from "../../../api";
import {
  runIpv4ChecksumChange,
  runIpv4ChecksumOverrideChange,
  runIpv4DestinationChange,
  runIpv4DestinationCountChange,
  runIpv4DestinationModeChange,
  runIpv4DestinationStepChange,
  runIpv4DfFlagChange,
  runIpv4DscpChange,
  runIpv4DscpCountChange,
  runIpv4DscpModeChange,
  runIpv4DscpStepChange,
  runIpv4EcnChange,
  runIpv4EcnCountChange,
  runIpv4EcnModeChange,
  runIpv4EcnStepChange,
  runIpv4FragmentOffsetChange,
  runIpv4FragmentOffsetCountChange,
  runIpv4FragmentOffsetModeChange,
  runIpv4FragmentOffsetStepChange,
  runIpv4IdentificationChange,
  runIpv4IdentificationCountChange,
  runIpv4IdentificationModeChange,
  runIpv4IdentificationStepChange,
  runIpv4MfFlagChange,
  runIpv4SourceChange,
  runIpv4SourceCountChange,
  runIpv4SourceModeChange,
  runIpv4SourceStepChange,
  runIpv4TtlChange,
  runIpv4TtlCountChange,
  runIpv4TtlModeChange,
  runIpv4TtlStepChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataIpv4HandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataIpv4Handlers = {
  changeIpv4Checksum: (value: string) => boolean;
  changeIpv4ChecksumOverride: (value: boolean) => boolean;
  changeIpv4Destination: (value: string) => boolean;
  changeIpv4DestinationCount: (value: string) => boolean;
  changeIpv4DestinationMode: (value: ProfileWorkbenchStream["ipv4_dst_mode"]) => boolean;
  changeIpv4DestinationStep: (value: number) => boolean;
  changeIpv4DfFlag: (value: boolean) => boolean;
  changeIpv4Dscp: (value: number) => boolean;
  changeIpv4DscpCount: (value: number) => boolean;
  changeIpv4DscpMode: (value: ProfileWorkbenchStream["ipv4_dscp_mode"]) => boolean;
  changeIpv4DscpStep: (value: number) => boolean;
  changeIpv4Ecn: (value: number) => boolean;
  changeIpv4EcnCount: (value: number) => boolean;
  changeIpv4EcnMode: (value: ProfileWorkbenchStream["ipv4_ecn_mode"]) => boolean;
  changeIpv4EcnStep: (value: number) => boolean;
  changeIpv4FragmentOffset: (value: number) => boolean;
  changeIpv4FragmentOffsetCount: (value: number) => boolean;
  changeIpv4FragmentOffsetMode: (value: ProfileWorkbenchStream["ipv4_fragment_offset_mode"]) => boolean;
  changeIpv4FragmentOffsetStep: (value: number) => boolean;
  changeIpv4Identification: (value: number) => boolean;
  changeIpv4IdentificationCount: (value: number) => boolean;
  changeIpv4IdentificationMode: (value: ProfileWorkbenchStream["ipv4_id_mode"]) => boolean;
  changeIpv4IdentificationStep: (value: number) => boolean;
  changeIpv4MfFlag: (value: boolean) => boolean;
  changeIpv4Source: (value: string) => boolean;
  changeIpv4SourceCount: (value: string) => boolean;
  changeIpv4SourceMode: (value: ProfileWorkbenchStream["ipv4_src_mode"]) => boolean;
  changeIpv4SourceStep: (value: number) => boolean;
  changeIpv4Ttl: (value: number) => boolean;
  changeIpv4TtlCount: (value: number) => boolean;
  changeIpv4TtlMode: (value: ProfileWorkbenchStream["ipv4_ttl_mode"]) => boolean;
  changeIpv4TtlStep: (value: number) => boolean;
};

export function workspaceProtocolDataIpv4Handlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataIpv4HandlerOptions): WorkspaceProtocolDataIpv4Handlers {
  return {
    changeIpv4Checksum: (value) => runIpv4ChecksumChange(value, selectedStream, streamPatchHandlers),
    changeIpv4ChecksumOverride: (value) =>
      runIpv4ChecksumOverrideChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Destination: (value) => runIpv4DestinationChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DestinationCount: (value) =>
      runIpv4DestinationCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DestinationMode: (value) =>
      runIpv4DestinationModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DestinationStep: (value) =>
      runIpv4DestinationStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DfFlag: (value) => runIpv4DfFlagChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Dscp: (value) => runIpv4DscpChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DscpCount: (value) => runIpv4DscpCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DscpMode: (value) => runIpv4DscpModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4DscpStep: (value) => runIpv4DscpStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Ecn: (value) => runIpv4EcnChange(value, selectedStream, streamPatchHandlers),
    changeIpv4EcnCount: (value) => runIpv4EcnCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4EcnMode: (value) => runIpv4EcnModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4EcnStep: (value) => runIpv4EcnStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4FragmentOffset: (value) =>
      runIpv4FragmentOffsetChange(value, selectedStream, streamPatchHandlers),
    changeIpv4FragmentOffsetCount: (value) =>
      runIpv4FragmentOffsetCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4FragmentOffsetMode: (value) =>
      runIpv4FragmentOffsetModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4FragmentOffsetStep: (value) =>
      runIpv4FragmentOffsetStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Identification: (value) =>
      runIpv4IdentificationChange(value, selectedStream, streamPatchHandlers),
    changeIpv4IdentificationCount: (value) =>
      runIpv4IdentificationCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4IdentificationMode: (value) =>
      runIpv4IdentificationModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4IdentificationStep: (value) =>
      runIpv4IdentificationStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4MfFlag: (value) => runIpv4MfFlagChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Source: (value) => runIpv4SourceChange(value, selectedStream, streamPatchHandlers),
    changeIpv4SourceCount: (value) => runIpv4SourceCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4SourceMode: (value) => runIpv4SourceModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4SourceStep: (value) => runIpv4SourceStepChange(value, selectedStream, streamPatchHandlers),
    changeIpv4Ttl: (value) => runIpv4TtlChange(value, selectedStream, streamPatchHandlers),
    changeIpv4TtlCount: (value) => runIpv4TtlCountChange(value, selectedStream, streamPatchHandlers),
    changeIpv4TtlMode: (value) => runIpv4TtlModeChange(value, selectedStream, streamPatchHandlers),
    changeIpv4TtlStep: (value) => runIpv4TtlStepChange(value, selectedStream, streamPatchHandlers)
  };
}
