import type { ProfileWorkbenchStream } from "../../../api";
import {
  runEtherDestinationChange,
  runEtherDestinationCountChange,
  runEtherDestinationModeChange,
  runEtherDestinationStepChange,
  runEtherSourceChange,
  runEtherSourceCountChange,
  runEtherSourceModeChange,
  runEtherSourceStepChange,
  runEtherTypeChange,
  runEtherTypeOverrideChange,
  runVlanCfiChange,
  runVlanIdChange,
  runVlanIdCountChange,
  runVlanIdModeChange,
  runVlanIdStepChange,
  runVlanInnerCfiChange,
  runVlanInnerIdChange,
  runVlanInnerIdCountChange,
  runVlanInnerIdModeChange,
  runVlanInnerIdStepChange,
  runVlanInnerPriorityChange,
  runVlanInnerPriorityCountChange,
  runVlanInnerPriorityModeChange,
  runVlanInnerPriorityStepChange,
  runVlanInnerSelectionChange,
  runVlanInnerTpidChange,
  runVlanInnerTpidOverrideChange,
  runVlanPriorityChange,
  runVlanPriorityCountChange,
  runVlanPriorityModeChange,
  runVlanPriorityStepChange,
  runVlanTpidChange,
  runVlanTpidOverrideChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataLinkHandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataLinkHandlers = {
  changeEtherDestination: (value: string) => boolean;
  changeEtherDestinationCount: (value: number) => boolean;
  changeEtherDestinationMode: (value: ProfileWorkbenchStream["ether_dst_mode"]) => boolean;
  changeEtherDestinationStep: (value: number) => boolean;
  changeEtherSource: (value: string) => boolean;
  changeEtherSourceCount: (value: number) => boolean;
  changeEtherSourceMode: (value: ProfileWorkbenchStream["ether_src_mode"]) => boolean;
  changeEtherSourceStep: (value: number) => boolean;
  changeEtherType: (value: string) => boolean;
  changeEtherTypeOverride: (value: boolean) => boolean;
  changeVlanCfi: (value: number) => boolean;
  changeVlanId: (value: number) => boolean;
  changeVlanIdCount: (value: number) => boolean;
  changeVlanIdMode: (value: ProfileWorkbenchStream["vlan_id_mode"]) => boolean;
  changeVlanIdStep: (value: number) => boolean;
  changeVlanInnerCfi: (value: number) => boolean;
  changeVlanInnerId: (value: number) => boolean;
  changeVlanInnerIdCount: (value: number) => boolean;
  changeVlanInnerIdMode: (value: ProfileWorkbenchStream["vlan2_id_mode"]) => boolean;
  changeVlanInnerIdStep: (value: number) => boolean;
  changeVlanInnerPriority: (value: number) => boolean;
  changeVlanInnerPriorityCount: (value: number) => boolean;
  changeVlanInnerPriorityMode: (value: ProfileWorkbenchStream["vlan2_priority_mode"]) => boolean;
  changeVlanInnerPriorityStep: (value: number) => boolean;
  changeVlanInnerSelection: (value: boolean) => boolean;
  changeVlanInnerTpid: (value: string) => boolean;
  changeVlanInnerTpidOverride: (value: boolean) => boolean;
  changeVlanPriority: (value: number) => boolean;
  changeVlanPriorityCount: (value: number) => boolean;
  changeVlanPriorityMode: (value: ProfileWorkbenchStream["vlan_priority_mode"]) => boolean;
  changeVlanPriorityStep: (value: number) => boolean;
  changeVlanTpid: (value: string) => boolean;
  changeVlanTpidOverride: (value: boolean) => boolean;
};

export function workspaceProtocolDataLinkHandlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataLinkHandlerOptions): WorkspaceProtocolDataLinkHandlers {
  return {
    changeEtherDestination: (value) => runEtherDestinationChange(value, selectedStream, streamPatchHandlers),
    changeEtherDestinationCount: (value) => runEtherDestinationCountChange(value, selectedStream, streamPatchHandlers),
    changeEtherDestinationMode: (value) => runEtherDestinationModeChange(value, selectedStream, streamPatchHandlers),
    changeEtherDestinationStep: (value) => runEtherDestinationStepChange(value, selectedStream, streamPatchHandlers),
    changeEtherSource: (value) => runEtherSourceChange(value, selectedStream, streamPatchHandlers),
    changeEtherSourceCount: (value) => runEtherSourceCountChange(value, selectedStream, streamPatchHandlers),
    changeEtherSourceMode: (value) => runEtherSourceModeChange(value, selectedStream, streamPatchHandlers),
    changeEtherSourceStep: (value) => runEtherSourceStepChange(value, selectedStream, streamPatchHandlers),
    changeEtherType: (value) => runEtherTypeChange(value, selectedStream, streamPatchHandlers),
    changeEtherTypeOverride: (value) => runEtherTypeOverrideChange(value, selectedStream, streamPatchHandlers),
    changeVlanCfi: (value) => runVlanCfiChange(value, selectedStream, streamPatchHandlers),
    changeVlanId: (value) => runVlanIdChange(value, selectedStream, streamPatchHandlers),
    changeVlanIdCount: (value) => runVlanIdCountChange(value, selectedStream, streamPatchHandlers),
    changeVlanIdMode: (value) => runVlanIdModeChange(value, selectedStream, streamPatchHandlers),
    changeVlanIdStep: (value) => runVlanIdStepChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerCfi: (value) => runVlanInnerCfiChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerId: (value) => runVlanInnerIdChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerIdCount: (value) => runVlanInnerIdCountChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerIdMode: (value) => runVlanInnerIdModeChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerIdStep: (value) => runVlanInnerIdStepChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerPriority: (value) => runVlanInnerPriorityChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerPriorityCount: (value) => runVlanInnerPriorityCountChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerPriorityMode: (value) => runVlanInnerPriorityModeChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerPriorityStep: (value) => runVlanInnerPriorityStepChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerSelection: (value) => runVlanInnerSelectionChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerTpid: (value) => runVlanInnerTpidChange(value, selectedStream, streamPatchHandlers),
    changeVlanInnerTpidOverride: (value) => runVlanInnerTpidOverrideChange(value, selectedStream, streamPatchHandlers),
    changeVlanPriority: (value) => runVlanPriorityChange(value, selectedStream, streamPatchHandlers),
    changeVlanPriorityCount: (value) => runVlanPriorityCountChange(value, selectedStream, streamPatchHandlers),
    changeVlanPriorityMode: (value) => runVlanPriorityModeChange(value, selectedStream, streamPatchHandlers),
    changeVlanPriorityStep: (value) => runVlanPriorityStepChange(value, selectedStream, streamPatchHandlers),
    changeVlanTpid: (value) => runVlanTpidChange(value, selectedStream, streamPatchHandlers),
    changeVlanTpidOverride: (value) => runVlanTpidOverrideChange(value, selectedStream, streamPatchHandlers)
  };
}
