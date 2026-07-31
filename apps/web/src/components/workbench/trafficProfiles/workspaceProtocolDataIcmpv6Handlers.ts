import type { ProfileWorkbenchStream } from "../../../api";
import {
  runIcmpv6NdNaOverrideFlagChange,
  runIcmpv6NdNaRouterFlagChange,
  runIcmpv6NdNaSolicitedFlagChange,
  runIcmpv6NdOptionMacChange,
  runIcmpv6NdOptionSelectionChange,
  runIcmpv6NdTargetChange,
  runIcmpv6RaCurrentHopLimitChange,
  runIcmpv6RaManagedFlagChange,
  runIcmpv6RaOtherFlagChange,
  runIcmpv6RaPrefixAutonomousFlagChange,
  runIcmpv6RaPrefixChange,
  runIcmpv6RaPrefixLengthChange,
  runIcmpv6RaPrefixOnLinkFlagChange,
  runIcmpv6RaPrefixPreferredLifetimeChange,
  runIcmpv6RaPrefixSelectionChange,
  runIcmpv6RaPrefixValidLifetimeChange,
  runIcmpv6RaReachableTimeChange,
  runIcmpv6RaRetransTimerChange,
  runIcmpv6RaRouterLifetimeChange,
  runIcmpv6RaSllaMacChange,
  runIcmpv6RaSllaSelectionChange,
  runIcmpv6RsSllaMacChange,
  runIcmpv6RsSllaSelectionChange,
  type StreamPatchHandlers
} from "./streamPatchModel";

export type WorkspaceProtocolDataIcmpv6HandlerOptions = {
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
};

export type WorkspaceProtocolDataIcmpv6Handlers = {
  changeIcmpv6NdNaOverrideFlag: (value: boolean) => boolean;
  changeIcmpv6NdNaRouterFlag: (value: boolean) => boolean;
  changeIcmpv6NdNaSolicitedFlag: (value: boolean) => boolean;
  changeIcmpv6NdOptionMac: (value: string) => boolean;
  changeIcmpv6NdOptionSelection: (value: boolean) => boolean;
  changeIcmpv6NdTarget: (value: string) => boolean;
  changeIcmpv6RaCurrentHopLimit: (value: number) => boolean;
  changeIcmpv6RaManagedFlag: (value: boolean) => boolean;
  changeIcmpv6RaOtherFlag: (value: boolean) => boolean;
  changeIcmpv6RaPrefix: (value: string) => boolean;
  changeIcmpv6RaPrefixAutonomousFlag: (value: boolean) => boolean;
  changeIcmpv6RaPrefixLength: (value: number) => boolean;
  changeIcmpv6RaPrefixOnLinkFlag: (value: boolean) => boolean;
  changeIcmpv6RaPrefixPreferredLifetime: (value: number) => boolean;
  changeIcmpv6RaPrefixSelection: (value: boolean) => boolean;
  changeIcmpv6RaPrefixValidLifetime: (value: number) => boolean;
  changeIcmpv6RaReachableTime: (value: number) => boolean;
  changeIcmpv6RaRetransTimer: (value: number) => boolean;
  changeIcmpv6RaRouterLifetime: (value: number) => boolean;
  changeIcmpv6RaSllaMac: (value: string) => boolean;
  changeIcmpv6RaSllaSelection: (value: boolean) => boolean;
  changeIcmpv6RsSllaMac: (value: string) => boolean;
  changeIcmpv6RsSllaSelection: (value: boolean) => boolean;
};

export function workspaceProtocolDataIcmpv6Handlers({
  selectedStream,
  streamPatchHandlers
}: WorkspaceProtocolDataIcmpv6HandlerOptions): WorkspaceProtocolDataIcmpv6Handlers {
  return {
    changeIcmpv6NdNaOverrideFlag: (value) =>
      runIcmpv6NdNaOverrideFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6NdNaRouterFlag: (value) =>
      runIcmpv6NdNaRouterFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6NdNaSolicitedFlag: (value) =>
      runIcmpv6NdNaSolicitedFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6NdOptionMac: (value) => runIcmpv6NdOptionMacChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6NdOptionSelection: (value) =>
      runIcmpv6NdOptionSelectionChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6NdTarget: (value) => runIcmpv6NdTargetChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaCurrentHopLimit: (value) =>
      runIcmpv6RaCurrentHopLimitChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaManagedFlag: (value) =>
      runIcmpv6RaManagedFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaOtherFlag: (value) =>
      runIcmpv6RaOtherFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefix: (value) => runIcmpv6RaPrefixChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixAutonomousFlag: (value) =>
      runIcmpv6RaPrefixAutonomousFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixLength: (value) =>
      runIcmpv6RaPrefixLengthChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixOnLinkFlag: (value) =>
      runIcmpv6RaPrefixOnLinkFlagChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixPreferredLifetime: (value) =>
      runIcmpv6RaPrefixPreferredLifetimeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixSelection: (value) =>
      runIcmpv6RaPrefixSelectionChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaPrefixValidLifetime: (value) =>
      runIcmpv6RaPrefixValidLifetimeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaReachableTime: (value) =>
      runIcmpv6RaReachableTimeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaRetransTimer: (value) =>
      runIcmpv6RaRetransTimerChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaRouterLifetime: (value) =>
      runIcmpv6RaRouterLifetimeChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaSllaMac: (value) => runIcmpv6RaSllaMacChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RaSllaSelection: (value) =>
      runIcmpv6RaSllaSelectionChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RsSllaMac: (value) => runIcmpv6RsSllaMacChange(value, selectedStream, streamPatchHandlers),
    changeIcmpv6RsSllaSelection: (value) =>
      runIcmpv6RsSllaSelectionChange(value, selectedStream, streamPatchHandlers)
  };
}
