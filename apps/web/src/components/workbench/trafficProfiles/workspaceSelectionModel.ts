import type { ProfilePacketPreview, ProfileRecord, ProfileWorkbenchStream } from "../../../api";
import {
  advancedVmTemplateViewModel,
  type AdvancedVmTemplateView
} from "./advancedVmModel";
import {
  advancedVmTargetChoiceViewModel,
  type AdvancedVmTargetChoiceView
} from "./advancedVmTargetModel";
import {
  advancedVmParameterizedTemplateBody,
  advancedVmTemplateParameterKey,
  advancedVmTemplateParameterValidationError
} from "./advancedVmParameterModel";
import {
  formatAdvancedVmJson,
  parseAdvancedVmJson
} from "./advancedVmJsonModel";
import {
  emptyAdvancedVmTemplateParameterDraft,
  hasStructuredAdvancedTargetIntent,
  emptyRawPacketFieldDraft,
  isRawPacketAdvancedStream,
  isSctpChecksumLocked,
  type AdvancedVmFlowVarField,
  type AdvancedVmTargetRow,
  type AdvancedVmTemplate,
  type AdvancedVmTemplateParameterDraft,
  type RawPacketFieldDraft,
  type RawPacketFieldStatus
} from "./model";
import {
  advancedStreamEditorTabs,
  packetRenderTabs,
  simpleStreamEditorTabs,
  type StreamEditorTab
} from "./streamEditorTabsModel";
import {
  advancedVmInstructionCount,
  base64ByteCount
} from "./streamSummaryModel";
import {
  streamEditorSettingsViewModel,
  type StreamEditorSettingsViewModel
} from "./streamSettingsModel";
import {
  protocolDataViewModel,
  type ProtocolDataViewModel
} from "./protocolDataViewModel";
import {
  applyRawPacketFieldEdit,
  buildRawPacketFieldRows,
  formatRawPacketHex,
  previewRawPacketHex,
  rawPacketBytesFromHex,
  rawPacketBytesFromBase64,
  rawPacketHexByteCount,
  rawPacketHexError,
  rawPacketHexSelectionRange,
  rawPacketHexToBase64,
  streamRawPacketHex,
  type RawPacketFieldRow
} from "./rawPacketModel";

export type AdvancedVmTargetSource = "structured" | "raw";
export type ScopedValueMap<T> = Record<string, T>;
export type ScopedDraftMap<T> = Record<string, Record<string, T>>;
export type AdvancedVmEditorDraftState = {
  drafts: ScopedValueMap<string>;
  targetSources: ScopedValueMap<AdvancedVmTargetSource>;
  templateParameterDrafts: ScopedValueMap<AdvancedVmTemplateParameterDraft>;
};
export type RawPacketFieldAdvancedVmTargetDraftResult =
  | {
      ok: true;
      templateName: string;
      advancedVmDraft: string;
    }
  | {
      ok: false;
    };
export type RawPacketFieldAdvancedVmTargetAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "apply";
      advancedVmDraft: string;
      nextTab: StreamEditorTab;
      rowId: string;
      templateName: string;
    };
export type RawPacketFieldApplyDraftResult =
  | {
      ok: true;
      nextHex: string;
      rowId: string;
      status: RawPacketFieldStatus;
    }
  | {
      ok: false;
      status: RawPacketFieldStatus;
    };
export type RawPacketFieldDraftApplyAction = {
  kind: "apply";
  result: RawPacketFieldApplyDraftResult;
};
export type RawPacketFieldDraftApplyActionHandlers = {
  draftScopeKey: string;
  fieldScopeKey: string;
  updateState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};
export type RawPacketFieldLocateResult =
  | {
      ok: true;
      rowId: string;
      selection: {
        end: number;
        start: number;
      };
    }
  | {
      ok: false;
      rowId: string;
      status: RawPacketFieldStatus;
    };
export type RawPacketFieldLocateAction = {
  kind: "locate";
  result: RawPacketFieldLocateResult;
};
export type RawPacketFieldLocateActionHandlers = {
  fieldScopeKey: string;
  selectTextRange: (selection: { end: number; start: number }) => void;
  updateState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};

export type RawPacketDraftViewModel = {
  byteCount: number;
  error: string | null;
  fieldRows: RawPacketFieldRow[];
  overrideActive: boolean;
  parsedBytes: number[];
  statusText: string;
  wireLength: number;
};
export type RawPacketEditorStateViewModel = {
  draft: string;
  draftView: RawPacketDraftViewModel;
  fieldDraft: RawPacketFieldDraft;
  fieldScopeKey: string;
  fieldStatus: RawPacketFieldStatus | null;
};
export type RawPacketEditorDraftState = {
  drafts: ScopedValueMap<string>;
  fieldDrafts: ScopedDraftMap<string>;
  fieldStatuses: ScopedValueMap<RawPacketFieldStatus>;
  selectedFieldId: string | null;
};
export type RawPacketOverrideClearAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "clear";
      nextDraft: string;
      patch: Partial<ProfileWorkbenchStream>;
    };
export type RawPacketDraftApplyAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "apply";
      nextDraft: string;
      patch: Partial<ProfileWorkbenchStream>;
    };
export type RawPacketDraftApplyActionHandlers = {
  applyPatch: (patch: Partial<ProfileWorkbenchStream>) => void;
  updateDraft: (nextDraft: string) => void;
};
export type RawPacketDraftChangeAction = {
  kind: "change";
  draftScopeKey: string;
  fieldScopeKey: string;
  nextDraft: string;
};
export type RawPacketDraftChangeActionHandlers = {
  updateState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};
export type RawPacketFieldDraftChangeAction = {
  kind: "change";
  fieldScopeKey: string;
  rowId: string;
  value: string;
};
export type RawPacketFieldDraftChangeActionHandlers = {
  updateState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};

export type AdvancedVmDraftViewModel = {
  applyError: string | null;
  body: Record<string, unknown> | null;
  bytes: number;
  draft: string;
  error: string | null;
  packetSource: string | null;
  statusText: string;
};
export type AdvancedVmDraftApplyAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "apply";
      nextDraft: string;
      patch: Partial<ProfileWorkbenchStream>;
    };
export type AdvancedVmDraftApplyActionHandlers = {
  applyPatch: (patch: Partial<ProfileWorkbenchStream>) => void;
  updateDraft: (nextDraft: string) => void;
};
export type AdvancedVmDraftChangeAction = {
  kind: "change";
  draftKey: string;
  nextDraft: string;
};
export type AdvancedVmDraftChangeActionHandlers = {
  updateState: (updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => void;
};
export type AdvancedVmTemplateParameterChangeAction = {
  kind: "change";
  field: AdvancedVmFlowVarField | "op";
  scopeKey: string;
  templateName: string;
  value: string;
  variableName: string;
};
export type AdvancedVmTemplateParametersResetAction = {
  kind: "reset";
  scopeKey: string;
  templateName: string;
};
export type AdvancedVmTemplateParameterActionHandlers = {
  updateState: (updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => void;
};

export type AdvancedVmEditorSourceViewModel = {
  defaultSource: AdvancedVmTargetSource;
  effectiveSource: AdvancedVmTargetSource;
  selectedSource: AdvancedVmTargetSource;
  stream: ProfileWorkbenchStream | null;
};

export type AdvancedVmStreamCandidatesViewModel = {
  rawStream: ProfileWorkbenchStream | null;
  structuredStream: ProfileWorkbenchStream | null;
};
export type AdvancedVmEditorViewModel = {
  candidates: AdvancedVmStreamCandidatesViewModel;
  editorSource: AdvancedVmEditorSourceViewModel;
  targetChoice: AdvancedVmTargetChoiceView;
  template: AdvancedVmTemplateView;
};
export type AdvancedVmEditorStateViewModel = {
  draft: string;
  draftView: AdvancedVmDraftViewModel;
  editorStream: ProfileWorkbenchStream | null;
  editorView: AdvancedVmEditorViewModel;
  rawDraftStream: ProfileWorkbenchStream | null;
  rawTargetRows: AdvancedVmTargetChoiceView["rawTargetRows"];
  readyTargetCount: number;
  selectedTargetRows: AdvancedVmTargetChoiceView["selectedTargetRows"];
  selectedTemplate: AdvancedVmTemplateView["selectedTemplate"];
  selectedTemplateBody: AdvancedVmTemplateView["body"];
  selectedTemplateFlowVars: AdvancedVmTemplateView["flowVars"];
  targetChoiceView: AdvancedVmTargetChoiceView;
  templateParameterDraft: AdvancedVmTemplateParameterDraft;
  templateCompatible: boolean;
  templateHint: string;
  templateParameterDirty: boolean;
  templateReady: boolean;
  templateView: AdvancedVmTemplateView;
};
export type AdvancedEditorModeAction =
  | {
      kind: "none";
    }
  | {
      kind: "clear-raw-override";
      nextTab: StreamEditorTab;
    }
  | {
      kind: "render-preview";
      nextTab: StreamEditorTab;
    }
  | {
      kind: "apply-advanced-mode";
      nextTab: StreamEditorTab;
      patch: Partial<ProfileWorkbenchStream>;
    };
export type AdvancedEditorModeActionHandlers = {
  applyPatch: (patch: Partial<ProfileWorkbenchStream>) => void;
  canRenderPreview: boolean;
  clearRawPacketOverride: () => boolean;
  renderPreview: () => void;
  selectTab: (tab: StreamEditorTab) => void;
};
export type EditorTabSelectionAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "select";
      nextTab: StreamEditorTab;
      renderPreview: boolean;
    };
export type EditorTabSelectionActionHandlers = {
  renderPreview: () => void;
  scrollToBuilder: () => void;
  selectTab: (tab: StreamEditorTab) => void;
};
export type WorkspaceEditorTabActionHandlers = {
  selectEditorTab: (tab: StreamEditorTab) => void;
};
export type WorkspaceEditorTabHandlerInput = EditorTabSelectionActionHandlers & {
  hasWorkbenchStreamValidationError: boolean;
  visibleEditorTabs: readonly StreamEditorTab[];
};
export type RawPacketOverrideClearActionHandlers = {
  applyPatch: (patch: Partial<ProfileWorkbenchStream>) => void;
  confirmClear: () => boolean;
  updateDraft: (nextDraft: string) => void;
};
export type RawPacketFieldAdvancedVmTargetActionHandlers = {
  advancedVmDraftKey: string;
  advancedVmSourceKey: string;
  scrollToBuilder: () => void;
  selectTab: (tab: StreamEditorTab) => void;
  setTemplateName: (templateName: string) => void;
  updateAdvancedVmState: (updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => void;
  updateRawPacketState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};
export type WorkspaceRawPacketFieldActionHandlers = {
  applyAdvancedVmTarget: (row: RawPacketFieldRow, target: AdvancedVmTargetRow) => boolean;
  locateField: (row: RawPacketFieldRow) => boolean;
};
export type WorkspaceRawPacketFieldActionHandlerInput = RawPacketFieldAdvancedVmTargetActionHandlers & {
  advancedVmTemplateParameterDraft: AdvancedVmTemplateParameterDraft;
  fieldScopeKey: string;
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null;
  rawPacketDraft: string;
  selectTextRange: (selection: { end: number; start: number }) => void;
};
export type EditorTabViewModel = {
  active: boolean;
  disabled: boolean;
  tab: StreamEditorTab;
};

export type SelectedStreamEditorStateViewModel = {
  advancedSettingsView: StreamEditorSettingsViewModel["advancedSettings"] | null;
  arpView: ProtocolDataViewModel["arp"] | null;
  dhcpView: ProtocolDataViewModel["dhcp"] | null;
  dnsView: ProtocolDataViewModel["dns"] | null;
  editorTabRows: EditorTabViewModel[];
  ethernetView: ProtocolDataViewModel["ethernet"] | null;
  frameLengthView: StreamEditorSettingsViewModel["frameLength"] | null;
  greView: ProtocolDataViewModel["gre"] | null;
  gtpuView: ProtocolDataViewModel["gtpu"] | null;
  icmpView: ProtocolDataViewModel["icmp"] | null;
  icmpv6NdView: ProtocolDataViewModel["icmpv6Nd"] | null;
  icmpv6RaView: ProtocolDataViewModel["icmpv6Ra"] | null;
  icmpv6RsView: ProtocolDataViewModel["icmpv6Rs"] | null;
  ipv4AddressView: ProtocolDataViewModel["ipv4Address"] | null;
  ipv4FlagsChecksumView: ProtocolDataViewModel["ipv4FlagsChecksum"] | null;
  ipv4ScalarView: ProtocolDataViewModel["ipv4Scalar"] | null;
  ipv6AddressView: ProtocolDataViewModel["ipv6Address"] | null;
  ipv6ScalarView: ProtocolDataViewModel["ipv6Scalar"] | null;
  l4PortView: ProtocolDataViewModel["l4Port"] | null;
  mediaAccessView: ProtocolDataViewModel["mediaAccess"] | null;
  mplsSecondLabelView: ProtocolDataViewModel["mplsSecondLabel"] | null;
  mplsThirdLabelView: ProtocolDataViewModel["mplsThirdLabel"] | null;
  mplsView: ProtocolDataViewModel["mpls"] | null;
  payloadSettingsView: StreamEditorSettingsViewModel["payloadSettings"] | null;
  protocolDataView: ProtocolDataViewModel | null;
  protocolSelectionView: StreamEditorSettingsViewModel["protocolSelection"] | null;
  sctpView: ProtocolDataViewModel["sctp"] | null;
  streamEditorSettingsView: StreamEditorSettingsViewModel | null;
  streamPropertiesView: StreamEditorSettingsViewModel["properties"] | null;
  tcpChecksumView: ProtocolDataViewModel["tcpChecksum"] | null;
  tcpCoreView: ProtocolDataViewModel["tcpCore"] | null;
  tcpMssOptionView: ProtocolDataViewModel["tcpMssOption"] | null;
  tcpSackOptionView: ProtocolDataViewModel["tcpSackOption"] | null;
  tcpTimestampOptionView: ProtocolDataViewModel["tcpTimestampOption"] | null;
  tcpUrgentFlagsView: ProtocolDataViewModel["tcpUrgentFlags"] | null;
  tcpWindowScaleOptionView: ProtocolDataViewModel["tcpWindowScaleOption"] | null;
  udpView: ProtocolDataViewModel["udp"] | null;
  vlanInnerTagView: ProtocolDataViewModel["vlanInnerTag"] | null;
  vlanView: ProtocolDataViewModel["vlan"] | null;
  vxlanView: ProtocolDataViewModel["vxlan"] | null;
};

export type WorkspaceSelectionViewModelInput = {
  activeEditorTab: StreamEditorTab;
  profilePacketPreviews: ProfilePacketPreview[];
  profilePath: string;
  selectedProfile?: ProfileRecord | null;
  selectedStreamIndex: number;
  streams: ProfileWorkbenchStream[];
};

export type WorkspaceSelectionViewModel = {
  advancedVmSourceJson: string;
  advancedVmSourceKey: string;
  advancedVmTemplateParameterDraftKey: string;
  effectiveEditorTab: StreamEditorTab;
  hasRunnableProfile: boolean;
  packetEditorContextKey: string;
  rawPacketDefaultHex: string;
  rawPacketSource: string;
  sctpChecksumLocked: boolean;
  selectedPreview: ProfilePacketPreview | null;
  selectedStream: ProfileWorkbenchStream | null;
  selectedStreamAdvanced: boolean;
  streamCount: number;
  visibleEditorTabs: readonly StreamEditorTab[];
};

export type StreamEditorContextKeyInput = {
  profilePath: string;
  selectedStreamIndex: number;
  streamName?: string | null;
  packetType?: string | null;
  packetSource?: string | null;
};

export function streamEditorContextKey({
  profilePath,
  selectedStreamIndex,
  streamName,
  packetType,
  packetSource
}: StreamEditorContextKeyInput) {
  return [
    profilePath,
    selectedStreamIndex,
    streamName ?? "",
    packetType ?? "",
    packetSource ?? ""
  ].join("|");
}

export function workspaceSelectionViewModel({
  activeEditorTab,
  profilePacketPreviews,
  profilePath,
  selectedProfile,
  selectedStreamIndex,
  streams
}: WorkspaceSelectionViewModelInput): WorkspaceSelectionViewModel {
  const selectedStream = streams[selectedStreamIndex] ?? streams[0] ?? null;
  const selectedStreamAdvanced = selectedStream?.advanced_mode === true;
  const visibleEditorTabs = (selectedStreamAdvanced ? advancedStreamEditorTabs : simpleStreamEditorTabs) as readonly StreamEditorTab[];
  const effectiveEditorTab = visibleEditorTabs.includes(activeEditorTab) ? activeEditorTab : "Stream Properties";
  const selectedPreview =
    profilePacketPreviews.find((preview) => preview.index === selectedStreamIndex + 1) ?? profilePacketPreviews[0] ?? null;
  const rawPacketSource = selectedStream?.packet_binary_base64 ?? selectedPreview?.binary_base64 ?? "";
  const packetEditorContextKey = streamEditorContextKey({
    packetSource: rawPacketSource,
    packetType: selectedStream?.packet_type,
    profilePath: selectedProfile?.relative_path ?? profilePath,
    selectedStreamIndex,
    streamName: selectedStream?.name
  });
  const advancedVmSourceJson = formatAdvancedVmJson(selectedStream?.advanced_vm);
  return {
    advancedVmSourceJson,
    advancedVmSourceKey: [packetEditorContextKey, advancedVmSourceJson].join("|"),
    advancedVmTemplateParameterDraftKey: packetEditorContextKey,
    effectiveEditorTab,
    hasRunnableProfile: profilePath.trim().length > 0,
    packetEditorContextKey,
    rawPacketDefaultHex: streamRawPacketHex(selectedStream, selectedPreview),
    rawPacketSource,
    sctpChecksumLocked: isSctpChecksumLocked(selectedStream),
    selectedPreview,
    selectedStream,
    selectedStreamAdvanced,
    streamCount: streams.length,
    visibleEditorTabs
  };
}

export function editorTabSelectionAction(
  tab: StreamEditorTab,
  visibleEditorTabs: readonly StreamEditorTab[],
  hasWorkbenchStreamValidationError: boolean
): EditorTabSelectionAction {
  if (!visibleEditorTabs.includes(tab)) {
    return { kind: "ignored" };
  }
  return {
    kind: "select",
    nextTab: tab,
    renderPreview: packetRenderTabs.has(tab) && !hasWorkbenchStreamValidationError
  };
}

export function runEditorTabSelectionAction(
  action: EditorTabSelectionAction,
  handlers: EditorTabSelectionActionHandlers
) {
  if (action.kind === "ignored") {
    return;
  }
  handlers.selectTab(action.nextTab);
  handlers.scrollToBuilder();
  if (action.renderPreview) {
    handlers.renderPreview();
  }
}

export function runEditorTabSelection(
  tab: StreamEditorTab,
  visibleEditorTabs: readonly StreamEditorTab[],
  hasWorkbenchStreamValidationError: boolean,
  handlers: EditorTabSelectionActionHandlers
) {
  runEditorTabSelectionAction(
    editorTabSelectionAction(tab, visibleEditorTabs, hasWorkbenchStreamValidationError),
    handlers
  );
}

export function workspaceEditorTabActionHandlers({
  hasWorkbenchStreamValidationError,
  visibleEditorTabs,
  renderPreview,
  scrollToBuilder,
  selectTab
}: WorkspaceEditorTabHandlerInput): WorkspaceEditorTabActionHandlers {
  return {
    selectEditorTab: (tab) =>
      runEditorTabSelection(tab, visibleEditorTabs, hasWorkbenchStreamValidationError, {
        renderPreview,
        scrollToBuilder,
        selectTab
      })
  };
}

export function editorTabViewModels(
  visibleEditorTabs: readonly StreamEditorTab[],
  effectiveEditorTab: StreamEditorTab,
  hasWorkbenchStreamValidationError: boolean
): EditorTabViewModel[] {
  const selectedTab = selectableEditorTab(
    visibleEditorTabs,
    effectiveEditorTab,
    hasWorkbenchStreamValidationError
  );
  return visibleEditorTabs.map((tab) => ({
    active: selectedTab === tab,
    disabled: packetRenderTabs.has(tab) && hasWorkbenchStreamValidationError,
    tab
  }));
}

export function selectableEditorTab(
  visibleEditorTabs: readonly StreamEditorTab[],
  requestedTab: StreamEditorTab,
  hasWorkbenchStreamValidationError: boolean
): StreamEditorTab {
  const enabledTabs = visibleEditorTabs.filter(
    (tab) => !(hasWorkbenchStreamValidationError && packetRenderTabs.has(tab))
  );
  return enabledTabs.includes(requestedTab) ? requestedTab : enabledTabs[0] ?? "Stream Properties";
}

export function selectedStreamEditorStateViewModel({
  effectiveEditorTab,
  hasWorkbenchStreamValidationError,
  selectedStream,
  streams,
  visibleEditorTabs
}: {
  effectiveEditorTab: StreamEditorTab;
  hasWorkbenchStreamValidationError: boolean;
  selectedStream: ProfileWorkbenchStream | null;
  streams: ProfileWorkbenchStream[];
  visibleEditorTabs: readonly StreamEditorTab[];
}): SelectedStreamEditorStateViewModel {
  const streamEditorSettingsView = selectedStream ? streamEditorSettingsViewModel(selectedStream, streams) : null;
  const protocolDataView = selectedStream ? protocolDataViewModel(selectedStream) : null;
  return {
    advancedSettingsView: streamEditorSettingsView?.advancedSettings ?? null,
    arpView: protocolDataView?.arp ?? null,
    dhcpView: protocolDataView?.dhcp ?? null,
    dnsView: protocolDataView?.dns ?? null,
    editorTabRows: editorTabViewModels(visibleEditorTabs, effectiveEditorTab, hasWorkbenchStreamValidationError),
    ethernetView: protocolDataView?.ethernet ?? null,
    frameLengthView: streamEditorSettingsView?.frameLength ?? null,
    greView: protocolDataView?.gre ?? null,
    gtpuView: protocolDataView?.gtpu ?? null,
    icmpView: protocolDataView?.icmp ?? null,
    icmpv6NdView: protocolDataView?.icmpv6Nd ?? null,
    icmpv6RaView: protocolDataView?.icmpv6Ra ?? null,
    icmpv6RsView: protocolDataView?.icmpv6Rs ?? null,
    ipv4AddressView: protocolDataView?.ipv4Address ?? null,
    ipv4FlagsChecksumView: protocolDataView?.ipv4FlagsChecksum ?? null,
    ipv4ScalarView: protocolDataView?.ipv4Scalar ?? null,
    ipv6AddressView: protocolDataView?.ipv6Address ?? null,
    ipv6ScalarView: protocolDataView?.ipv6Scalar ?? null,
    l4PortView: protocolDataView?.l4Port ?? null,
    mediaAccessView: protocolDataView?.mediaAccess ?? null,
    mplsSecondLabelView: protocolDataView?.mplsSecondLabel ?? null,
    mplsThirdLabelView: protocolDataView?.mplsThirdLabel ?? null,
    mplsView: protocolDataView?.mpls ?? null,
    payloadSettingsView: streamEditorSettingsView?.payloadSettings ?? null,
    protocolDataView,
    protocolSelectionView: streamEditorSettingsView?.protocolSelection ?? null,
    sctpView: protocolDataView?.sctp ?? null,
    streamEditorSettingsView,
    streamPropertiesView: streamEditorSettingsView?.properties ?? null,
    tcpChecksumView: protocolDataView?.tcpChecksum ?? null,
    tcpCoreView: protocolDataView?.tcpCore ?? null,
    tcpMssOptionView: protocolDataView?.tcpMssOption ?? null,
    tcpSackOptionView: protocolDataView?.tcpSackOption ?? null,
    tcpTimestampOptionView: protocolDataView?.tcpTimestampOption ?? null,
    tcpUrgentFlagsView: protocolDataView?.tcpUrgentFlags ?? null,
    tcpWindowScaleOptionView: protocolDataView?.tcpWindowScaleOption ?? null,
    udpView: protocolDataView?.udp ?? null,
    vlanInnerTagView: protocolDataView?.vlanInnerTag ?? null,
    vlanView: protocolDataView?.vlan ?? null,
    vxlanView: protocolDataView?.vxlan ?? null
  };
}

export function rawPacketDraftWireLength(byteCount: number) {
  return byteCount > 0 ? Math.max(64, byteCount + 4) : 0;
}

export function rawPacketDraftStatusText(error: string | null, byteCount: number, wireLength: number) {
  return error ?? `${byteCount} bytes / ${wireLength} wire`;
}

export function rawPacketDraftViewModel(
  rawPacketDraft: string,
  selectedStream: ProfileWorkbenchStream | null
): RawPacketDraftViewModel {
  const error = rawPacketHexError(rawPacketDraft);
  const byteCount = rawPacketHexByteCount(rawPacketDraft);
  const wireLength = rawPacketDraftWireLength(byteCount);
  const parsedBytes = rawPacketBytesFromHex(rawPacketDraft) ?? [];
  return {
    byteCount,
    error,
    fieldRows: error ? [] : buildRawPacketFieldRows(parsedBytes),
    overrideActive: Boolean(selectedStream?.packet_binary_base64),
    parsedBytes,
    statusText: rawPacketDraftStatusText(error, byteCount, wireLength),
    wireLength
  };
}

export function rawPacketEditorStateViewModel({
  contextKey,
  defaultHex,
  drafts,
  fieldDrafts,
  fieldStatuses,
  selectedStream
}: {
  contextKey: string;
  defaultHex: string;
  drafts: ScopedValueMap<string>;
  fieldDrafts: ScopedDraftMap<string>;
  fieldStatuses: ScopedValueMap<RawPacketFieldStatus>;
  selectedStream: ProfileWorkbenchStream | null;
}): RawPacketEditorStateViewModel {
  const draft = drafts[contextKey] ?? defaultHex;
  return {
    draft,
    draftView: rawPacketDraftViewModel(draft, selectedStream),
    fieldDraft: fieldDrafts[contextKey] ?? emptyRawPacketFieldDraft,
    fieldScopeKey: contextKey,
    fieldStatus: fieldStatuses[contextKey] ?? null
  };
}

export function advancedVmDraftViewModel(
  advancedVmDraft: string,
  selectedStream: ProfileWorkbenchStream | null,
  selectedPreview: ProfilePacketPreview | null
): AdvancedVmDraftViewModel {
  const result = parseAdvancedVmJson(advancedVmDraft);
  const packetSource = selectedStream?.packet_binary_base64 ?? selectedPreview?.binary_base64 ?? null;
  return {
    applyError: result.error ?? (packetSource ? null : "Render packet preview before applying VM."),
    body: result.body,
    bytes: result.bytes,
    draft: advancedVmDraft,
    error: result.error,
    packetSource,
    statusText: result.error
      ? result.error
      : `${advancedVmInstructionCount(result.body)} instructions / ${result.bytes} bytes`
  };
}

export function advancedVmEditorSourceViewModel({
  rawDraftAdvancedVmStream,
  sourceKey,
  sources,
  structuredAdvancedVmStream,
  selectedStream
}: {
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null;
  selectedStream: ProfileWorkbenchStream | null;
  sourceKey: string;
  sources: ScopedValueMap<AdvancedVmTargetSource>;
  structuredAdvancedVmStream: ProfileWorkbenchStream | null;
}): AdvancedVmEditorSourceViewModel {
  const defaultSource = defaultAdvancedVmTargetSourceForEditor(selectedStream, rawDraftAdvancedVmStream);
  const selectedSource = sources[sourceKey] ?? defaultSource;
  const effectiveSource = effectiveAdvancedVmTargetSourceForEditor(selectedSource, rawDraftAdvancedVmStream);
  return {
    defaultSource,
    effectiveSource,
    selectedSource,
    stream: advancedVmStreamForEditor(effectiveSource, rawDraftAdvancedVmStream, structuredAdvancedVmStream)
  };
}

export function advancedVmStreamCandidatesViewModel({
  rawPacketDraft,
  rawPacketDraftBytes,
  rawPacketDraftError,
  rawPacketWireLength,
  selectedStream
}: {
  rawPacketDraft: string;
  rawPacketDraftBytes: number;
  rawPacketDraftError: string | null;
  rawPacketWireLength: number;
  selectedStream: ProfileWorkbenchStream | null;
}): AdvancedVmStreamCandidatesViewModel {
  return {
    rawStream: rawDraftAdvancedVmStreamForEditor(
      selectedStream,
      rawPacketDraft,
      rawPacketDraftError,
      rawPacketDraftBytes,
      rawPacketWireLength
    ),
    structuredStream: structuredAdvancedVmStreamForEditor(
      selectedStream,
      rawPacketDraft,
      rawPacketDraftError,
      rawPacketDraftBytes,
      rawPacketWireLength
    )
  };
}

export function advancedVmEditorViewModel({
  rawPacketDraft,
  rawPacketDraftBytes,
  rawPacketDraftError,
  rawPacketWireLength,
  selectedStream,
  sourceKey,
  sources,
  templateName,
  templateParameterDraft,
  templates
}: {
  rawPacketDraft: string;
  rawPacketDraftBytes: number;
  rawPacketDraftError: string | null;
  rawPacketWireLength: number;
  selectedStream: ProfileWorkbenchStream | null;
  sourceKey: string;
  sources: ScopedValueMap<AdvancedVmTargetSource>;
  templateName: string;
  templateParameterDraft: AdvancedVmTemplateParameterDraft;
  templates: AdvancedVmTemplate[];
}): AdvancedVmEditorViewModel {
  const candidates = advancedVmStreamCandidatesViewModel({
    rawPacketDraft,
    rawPacketDraftBytes,
    rawPacketDraftError,
    rawPacketWireLength,
    selectedStream
  });
  const editorSource = advancedVmEditorSourceViewModel({
    rawDraftAdvancedVmStream: candidates.rawStream,
    selectedStream,
    sourceKey,
    sources,
    structuredAdvancedVmStream: candidates.structuredStream
  });
  const template = advancedVmTemplateViewModel(
    templates,
    templateName,
    editorSource.stream,
    templateParameterDraft
  );
  const targetChoice = advancedVmTargetChoiceViewModel({
    activeSource: editorSource.effectiveSource,
    activeStream: editorSource.stream,
    draft: templateParameterDraft,
    rawStream: candidates.rawStream,
    structuredStream: candidates.structuredStream,
    templates
  });
  return {
    candidates,
    editorSource,
    targetChoice,
    template
  };
}

export function advancedVmEditorStateViewModel({
  defaultDraft,
  draftKey,
  drafts,
  rawPacketDraft,
  rawPacketDraftBytes,
  rawPacketDraftError,
  rawPacketWireLength,
  selectedPreview,
  selectedStream,
  sourceKey,
  sources,
  templateName,
  templateParameterDrafts,
  templates
}: {
  defaultDraft: string;
  draftKey: string;
  drafts: ScopedValueMap<string>;
  rawPacketDraft: string;
  rawPacketDraftBytes: number;
  rawPacketDraftError: string | null;
  rawPacketWireLength: number;
  selectedPreview: ProfilePacketPreview | null;
  selectedStream: ProfileWorkbenchStream | null;
  sourceKey: string;
  sources: ScopedValueMap<AdvancedVmTargetSource>;
  templateName: string;
  templateParameterDrafts: ScopedValueMap<AdvancedVmTemplateParameterDraft>;
  templates: AdvancedVmTemplate[];
}): AdvancedVmEditorStateViewModel {
  const templateParameterDraft =
    templateParameterDrafts[sourceKey] ?? emptyAdvancedVmTemplateParameterDraft;
  const editorView = advancedVmEditorViewModel({
    rawPacketDraft,
    rawPacketDraftBytes,
    rawPacketDraftError,
    rawPacketWireLength,
    selectedStream,
    sourceKey,
    sources,
    templateName,
    templateParameterDraft,
    templates
  });
  const draft = drafts[draftKey] ?? defaultDraft;
  const templateView = editorView.template;
  const targetChoiceView = editorView.targetChoice;
  return {
    draft,
    draftView: advancedVmDraftViewModel(draft, selectedStream, selectedPreview),
    editorStream: editorView.editorSource.stream,
    editorView,
    rawDraftStream: editorView.candidates.rawStream,
    rawTargetRows: targetChoiceView.rawTargetRows,
    readyTargetCount: targetChoiceView.readyTargetCount,
    selectedTargetRows: targetChoiceView.selectedTargetRows,
    selectedTemplate: templateView.selectedTemplate,
    selectedTemplateBody: templateView.body,
    selectedTemplateFlowVars: templateView.flowVars,
    targetChoiceView,
    templateParameterDraft,
    templateCompatible: templateView.compatible,
    templateHint: templateView.hint,
    templateParameterDirty: templateView.parameterDirty,
    templateReady: templateView.ready,
    templateView
  };
}

export function advancedEditorModePatch(
  selectedStream: ProfileWorkbenchStream,
  packetBinaryBase64: string,
  previewFrameLength: number | null | undefined
): Partial<ProfileWorkbenchStream> {
  const packetBytes = base64ByteCount(packetBinaryBase64);
  const frameLength = previewFrameLength ?? Math.max(64, packetBytes + 4);
  const variableFrameLength = selectedStream.frame_length_type !== "Fixed";
  return {
    advanced_mode: true,
    packet_binary_base64: packetBinaryBase64,
    packet_model: selectedStream.packet_model ?? null,
    packet_meta_base64: selectedStream.packet_meta_base64 ?? null,
    advanced_vm: selectedStream.advanced_vm ?? { instructions: [], split_by_var: "" },
    frame_length_type: variableFrameLength ? selectedStream.frame_length_type : "Fixed",
    frame_length: variableFrameLength ? selectedStream.frame_length : frameLength,
    frame_length_min: variableFrameLength ? selectedStream.frame_length_min : 64,
    frame_length_max: variableFrameLength ? selectedStream.frame_length_max : Math.max(1518, frameLength)
  };
}

export function advancedEditorModeAction(
  selectedStream: ProfileWorkbenchStream | null,
  selectedPreview: ProfilePacketPreview | null
): AdvancedEditorModeAction {
  if (!selectedStream) {
    return { kind: "none" };
  }
  if (selectedStream.advanced_mode === true) {
    return {
      kind: "clear-raw-override",
      nextTab: "Stream Properties"
    };
  }
  const packetBinaryBase64 = selectedStream.packet_binary_base64 ?? selectedPreview?.binary_base64;
  if (!packetBinaryBase64) {
    return {
      kind: "render-preview",
      nextTab: "Packet viewer"
    };
  }
  return {
    kind: "apply-advanced-mode",
    nextTab: "Packet Editor",
    patch: advancedEditorModePatch(selectedStream, packetBinaryBase64, selectedPreview?.frame_length)
  };
}

export function runAdvancedEditorModeAction(
  action: AdvancedEditorModeAction,
  handlers: AdvancedEditorModeActionHandlers
) {
  if (action.kind === "none") {
    return;
  }
  if (action.kind === "clear-raw-override") {
    if (handlers.clearRawPacketOverride()) {
      handlers.selectTab(action.nextTab);
    }
    return;
  }
  if (action.kind === "render-preview") {
    handlers.selectTab(action.nextTab);
    if (handlers.canRenderPreview) {
      handlers.renderPreview();
    }
    return;
  }
  handlers.applyPatch(action.patch);
  handlers.selectTab(action.nextTab);
}

export function runAdvancedEditorMode(
  selectedStream: ProfileWorkbenchStream | null,
  selectedPreview: ProfilePacketPreview | null,
  handlers: AdvancedEditorModeActionHandlers
) {
  runAdvancedEditorModeAction(advancedEditorModeAction(selectedStream, selectedPreview), handlers);
}

export function rawPacketDraftApplyPatch(
  selectedStream: ProfileWorkbenchStream,
  rawPacketDraft: string,
  rawPacketDraftBytes: number
): Partial<ProfileWorkbenchStream> {
  const packetBinaryBase64 = rawPacketHexToBase64(rawPacketDraft);
  const frameLength = Math.max(64, rawPacketDraftBytes + 4);
  return {
    advanced_mode: true,
    packet_binary_base64: packetBinaryBase64,
    packet_model: null,
    packet_meta_base64: null,
    advanced_vm: selectedStream.advanced_vm ?? { instructions: [], split_by_var: "" },
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_min: 64,
    frame_length_max: Math.max(1518, frameLength)
  };
}

export function rawPacketAppliedDraftHex(packetBinaryBase64: string | null | undefined) {
  return formatRawPacketHex(rawPacketBytesFromBase64(packetBinaryBase64));
}

export function rawPacketDraftApplyAction(
  selectedStream: ProfileWorkbenchStream | null,
  rawPacketDraftError: string | null,
  rawPacketDraft: string,
  rawPacketDraftBytes: number
): RawPacketDraftApplyAction {
  if (!selectedStream || rawPacketDraftError) {
    return { kind: "ignored" };
  }
  const patch = rawPacketDraftApplyPatch(selectedStream, rawPacketDraft, rawPacketDraftBytes);
  return {
    kind: "apply",
    nextDraft: rawPacketAppliedDraftHex(patch.packet_binary_base64),
    patch
  };
}

export function runRawPacketDraftApplyAction(
  action: RawPacketDraftApplyAction,
  handlers: RawPacketDraftApplyActionHandlers
) {
  if (action.kind === "ignored") {
    return;
  }
  handlers.applyPatch(action.patch);
  handlers.updateDraft(action.nextDraft);
}

export function runRawPacketDraftApply(
  selectedStream: ProfileWorkbenchStream | null,
  rawPacketDraftError: string | null,
  rawPacketDraft: string,
  rawPacketDraftBytes: number,
  handlers: RawPacketDraftApplyActionHandlers
) {
  runRawPacketDraftApplyAction(
    rawPacketDraftApplyAction(selectedStream, rawPacketDraftError, rawPacketDraft, rawPacketDraftBytes),
    handlers
  );
}

export function rawPacketDraftChangeAction(
  draftScopeKey: string,
  fieldScopeKey: string,
  nextDraft: string
): RawPacketDraftChangeAction {
  return {
    draftScopeKey,
    fieldScopeKey,
    kind: "change",
    nextDraft
  };
}

export function rawPacketDraftSeedFromPreviewAction(
  draftScopeKey: string,
  fieldScopeKey: string,
  selectedPreview: ProfilePacketPreview | null
): RawPacketDraftChangeAction {
  return rawPacketDraftChangeAction(draftScopeKey, fieldScopeKey, previewRawPacketHex(selectedPreview));
}

export function runRawPacketDraftChangeAction(
  action: RawPacketDraftChangeAction,
  handlers: RawPacketDraftChangeActionHandlers
) {
  handlers.updateState((current) =>
    rawPacketDraftChangedState(current, {
      draftScopeKey: action.draftScopeKey,
      fieldScopeKey: action.fieldScopeKey,
      nextDraft: action.nextDraft
    })
  );
}

export function runRawPacketDraftTextChange(
  draftScopeKey: string,
  fieldScopeKey: string,
  nextDraft: string,
  handlers: RawPacketDraftChangeActionHandlers
) {
  runRawPacketDraftChangeAction(rawPacketDraftChangeAction(draftScopeKey, fieldScopeKey, nextDraft), handlers);
}

export function runRawPacketDraftSeedFromPreview(
  draftScopeKey: string,
  fieldScopeKey: string,
  selectedPreview: ProfilePacketPreview | null,
  handlers: RawPacketDraftChangeActionHandlers
) {
  runRawPacketDraftChangeAction(
    rawPacketDraftSeedFromPreviewAction(draftScopeKey, fieldScopeKey, selectedPreview),
    handlers
  );
}

export function rawPacketFieldDraftChangeAction(
  fieldScopeKey: string,
  rowId: string,
  value: string
): RawPacketFieldDraftChangeAction {
  return {
    fieldScopeKey,
    kind: "change",
    rowId,
    value
  };
}

export function runRawPacketFieldDraftChangeAction(
  action: RawPacketFieldDraftChangeAction,
  handlers: RawPacketFieldDraftChangeActionHandlers
) {
  handlers.updateState((current) =>
    rawPacketFieldDraftChangedState(current, {
      fieldScopeKey: action.fieldScopeKey,
      rowId: action.rowId,
      value: action.value
    })
  );
}

export function runRawPacketFieldDraftTextChange(
  fieldScopeKey: string,
  rowId: string,
  value: string,
  handlers: RawPacketFieldDraftChangeActionHandlers
) {
  runRawPacketFieldDraftChangeAction(rawPacketFieldDraftChangeAction(fieldScopeKey, rowId, value), handlers);
}

export function rawPacketFieldOutOfBoundsStatus(row: RawPacketFieldRow): RawPacketFieldStatus {
  return {
    kind: "error",
    text: `${row.layer} ${row.field} bytes are outside the raw hex draft.`
  };
}

export function rawPacketFieldLocateResult(rawPacketDraft: string, row: RawPacketFieldRow): RawPacketFieldLocateResult {
  const selection = rawPacketHexSelectionRange(rawPacketDraft, row.offset, row.length);
  if (!selection) {
    return {
      ok: false,
      rowId: row.id,
      status: rawPacketFieldOutOfBoundsStatus(row)
    };
  }
  return {
    ok: true,
    rowId: row.id,
    selection
  };
}

export function rawPacketFieldLocateAction(
  rawPacketDraft: string,
  row: RawPacketFieldRow
): RawPacketFieldLocateAction {
  return {
    kind: "locate",
    result: rawPacketFieldLocateResult(rawPacketDraft, row)
  };
}

export function runRawPacketFieldLocateAction(
  action: RawPacketFieldLocateAction,
  handlers: RawPacketFieldLocateActionHandlers
) {
  handlers.updateState((current) => rawPacketFieldLocateState(current, handlers.fieldScopeKey, action.result));
  if (!action.result.ok) {
    return false;
  }
  handlers.selectTextRange(action.result.selection);
  return true;
}

export function runRawPacketFieldLocate(
  rawPacketDraft: string,
  row: RawPacketFieldRow,
  handlers: RawPacketFieldLocateActionHandlers
) {
  return runRawPacketFieldLocateAction(rawPacketFieldLocateAction(rawPacketDraft, row), handlers);
}

export function rawPacketFieldApplyDraftResult(
  rawPacketDraft: string,
  row: RawPacketFieldRow,
  draft: RawPacketFieldDraft
): RawPacketFieldApplyDraftResult {
  const value = draft[row.id] ?? row.value;
  const result = applyRawPacketFieldEdit(rawPacketDraft, row, value);
  if (!result.ok) {
    return {
      ok: false,
      status: {
        kind: "error",
        text: result.errorText
      }
    };
  }
  return {
    nextHex: result.nextHex,
    ok: true,
    rowId: row.id,
    status: {
      kind: "ok",
      text: result.statusText
    }
  };
}

export function rawPacketFieldDraftApplyAction(
  rawPacketDraft: string,
  row: RawPacketFieldRow,
  draft: RawPacketFieldDraft
): RawPacketFieldDraftApplyAction {
  return {
    kind: "apply",
    result: rawPacketFieldApplyDraftResult(rawPacketDraft, row, draft)
  };
}

export function runRawPacketFieldDraftApplyAction(
  action: RawPacketFieldDraftApplyAction,
  handlers: RawPacketFieldDraftApplyActionHandlers
) {
  handlers.updateState((current) =>
    rawPacketFieldApplyDraftState(current, {
      draftScopeKey: handlers.draftScopeKey,
      fieldScopeKey: handlers.fieldScopeKey,
      result: action.result
    })
  );
}

export function runRawPacketFieldDraftApply(
  rawPacketDraft: string,
  row: RawPacketFieldRow,
  draft: RawPacketFieldDraft,
  handlers: RawPacketFieldDraftApplyActionHandlers
) {
  runRawPacketFieldDraftApplyAction(rawPacketFieldDraftApplyAction(rawPacketDraft, row, draft), handlers);
}

export function initialRawPacketEditorDraftState(): RawPacketEditorDraftState {
  return {
    drafts: {},
    fieldDrafts: {},
    fieldStatuses: {},
    selectedFieldId: null
  };
}

export function clearRawPacketFieldScopeState(
  state: RawPacketEditorDraftState,
  fieldScopeKey: string
): RawPacketEditorDraftState {
  return {
    ...state,
    fieldDrafts: clearScopedValue(state.fieldDrafts, fieldScopeKey),
    fieldStatuses: clearScopedValue(state.fieldStatuses, fieldScopeKey),
    selectedFieldId: null
  };
}

export function rawPacketDraftChangedState(
  state: RawPacketEditorDraftState,
  {
    draftScopeKey,
    fieldScopeKey,
    nextDraft
  }: {
    draftScopeKey: string;
    fieldScopeKey: string;
    nextDraft: string;
  }
): RawPacketEditorDraftState {
  return clearRawPacketFieldScopeState(
    {
      ...state,
      drafts: setScopedValue(state.drafts, draftScopeKey, nextDraft)
    },
    fieldScopeKey
  );
}

export function rawPacketFieldLocateState(
  state: RawPacketEditorDraftState,
  fieldScopeKey: string,
  result: RawPacketFieldLocateResult
): RawPacketEditorDraftState {
  return {
    ...state,
    fieldStatuses: result.ok
      ? clearScopedValue(state.fieldStatuses, fieldScopeKey)
      : setScopedValue(state.fieldStatuses, fieldScopeKey, result.status),
    selectedFieldId: result.rowId
  };
}

export function rawPacketSelectedFieldState(
  state: RawPacketEditorDraftState,
  rowId: string
): RawPacketEditorDraftState {
  return {
    ...state,
    selectedFieldId: rowId
  };
}

export function rawPacketFieldDraftChangedState(
  state: RawPacketEditorDraftState,
  {
    fieldScopeKey,
    rowId,
    value
  }: {
    fieldScopeKey: string;
    rowId: string;
    value: string;
  }
): RawPacketEditorDraftState {
  return {
    ...state,
    fieldDrafts: setScopedDraftField(state.fieldDrafts, fieldScopeKey, rowId, value),
    fieldStatuses: clearScopedValue(state.fieldStatuses, fieldScopeKey)
  };
}

export function rawPacketFieldApplyDraftState(
  state: RawPacketEditorDraftState,
  {
    draftScopeKey,
    fieldScopeKey,
    result
  }: {
    draftScopeKey: string;
    fieldScopeKey: string;
    result: RawPacketFieldApplyDraftResult;
  }
): RawPacketEditorDraftState {
  if (!result.ok) {
    return {
      ...state,
      fieldStatuses: setScopedValue(state.fieldStatuses, fieldScopeKey, result.status)
    };
  }
  return {
    ...state,
    drafts: setScopedValue(state.drafts, draftScopeKey, result.nextHex),
    fieldDrafts: clearScopedDraftField(state.fieldDrafts, fieldScopeKey, result.rowId),
    fieldStatuses: setScopedValue(state.fieldStatuses, fieldScopeKey, result.status)
  };
}

export function advancedVmDraftApplyPatch(
  selectedStream: ProfileWorkbenchStream,
  packetBinaryBase64: string,
  advancedVmBody: NonNullable<ProfileWorkbenchStream["advanced_vm"]>,
  previewFrameLength: number | null | undefined
): Partial<ProfileWorkbenchStream> {
  const frameLength = previewFrameLength ?? Math.max(64, base64ByteCount(packetBinaryBase64) + 4);
  return {
    advanced_mode: true,
    packet_binary_base64: packetBinaryBase64,
    packet_model: selectedStream.packet_binary_base64 ? selectedStream.packet_model ?? null : null,
    packet_meta_base64: selectedStream.packet_binary_base64 ? selectedStream.packet_meta_base64 ?? null : null,
    advanced_vm: advancedVmBody,
    frame_length_type: "Fixed",
    frame_length: frameLength,
    frame_length_min: 64,
    frame_length_max: Math.max(1518, frameLength)
  };
}

export function advancedVmDraftApplyAction(
  selectedStream: ProfileWorkbenchStream | null,
  draftView: AdvancedVmDraftViewModel,
  previewFrameLength: number | null | undefined
): AdvancedVmDraftApplyAction {
  if (!selectedStream || draftView.applyError || !draftView.body || !draftView.packetSource) {
    return { kind: "ignored" };
  }
  return {
    kind: "apply",
    nextDraft: formatAdvancedVmJson(draftView.body),
    patch: advancedVmDraftApplyPatch(selectedStream, draftView.packetSource, draftView.body, previewFrameLength)
  };
}

export function runAdvancedVmDraftApplyAction(
  action: AdvancedVmDraftApplyAction,
  handlers: AdvancedVmDraftApplyActionHandlers
) {
  if (action.kind === "ignored") {
    return;
  }
  handlers.applyPatch(action.patch);
  handlers.updateDraft(action.nextDraft);
}

export function runAdvancedVmDraftApply(
  selectedStream: ProfileWorkbenchStream | null,
  draftView: AdvancedVmDraftViewModel,
  previewFrameLength: number | null | undefined,
  handlers: AdvancedVmDraftApplyActionHandlers
) {
  runAdvancedVmDraftApplyAction(advancedVmDraftApplyAction(selectedStream, draftView, previewFrameLength), handlers);
}

export function clearRawPacketOverridePatch(): Partial<ProfileWorkbenchStream> {
  return {
    advanced_mode: false,
    packet_binary_base64: null,
    packet_model: null,
    packet_meta_base64: null,
    advanced_vm: null
  };
}

export function rawPacketOverrideClearAction(
  selectedStream: ProfileWorkbenchStream | null,
  selectedPreview: ProfilePacketPreview | null
): RawPacketOverrideClearAction {
  if (!selectedStream) {
    return { kind: "ignored" };
  }
  return {
    kind: "clear",
    nextDraft: previewRawPacketHex(selectedPreview),
    patch: clearRawPacketOverridePatch()
  };
}

export function runRawPacketOverrideClearAction(
  action: RawPacketOverrideClearAction,
  handlers: RawPacketOverrideClearActionHandlers
) {
  if (action.kind === "ignored" || !handlers.confirmClear()) {
    return false;
  }
  handlers.applyPatch(action.patch);
  handlers.updateDraft(action.nextDraft);
  return true;
}

export function runRawPacketOverrideClear(
  selectedStream: ProfileWorkbenchStream | null,
  selectedPreview: ProfilePacketPreview | null,
  handlers: RawPacketOverrideClearActionHandlers
) {
  return runRawPacketOverrideClearAction(rawPacketOverrideClearAction(selectedStream, selectedPreview), handlers);
}

export function setScopedValue<T>(current: ScopedValueMap<T>, scopeKey: string, value: T): ScopedValueMap<T> {
  return {
    ...current,
    [scopeKey]: value
  };
}

export function clearScopedValue<T>(current: ScopedValueMap<T>, scopeKey: string): ScopedValueMap<T> {
  if (!(scopeKey in current)) {
    return current;
  }
  const next = { ...current };
  delete next[scopeKey];
  return next;
}

export function setScopedDraftField<T>(
  current: ScopedDraftMap<T>,
  scopeKey: string,
  fieldKey: string,
  value: T
): ScopedDraftMap<T> {
  return {
    ...current,
    [scopeKey]: {
      ...(current[scopeKey] ?? {}),
      [fieldKey]: value
    }
  };
}

export function clearScopedDraftField<T>(
  current: ScopedDraftMap<T>,
  scopeKey: string,
  fieldKey: string
): ScopedDraftMap<T> {
  const currentDraft = current[scopeKey] ?? {};
  const nextDraft = { ...currentDraft };
  delete nextDraft[fieldKey];
  const next = { ...current };
  if (Object.keys(nextDraft).length > 0) {
    next[scopeKey] = nextDraft;
  } else {
    delete next[scopeKey];
  }
  return next;
}

export function clearScopedDraftPrefix<T>(
  current: ScopedDraftMap<T>,
  scopeKey: string,
  prefix: string
): ScopedDraftMap<T> {
  const currentDraft = current[scopeKey] ?? {};
  if (!Object.keys(currentDraft).some((key) => key.startsWith(prefix))) {
    return current;
  }
  const nextDraft: Record<string, T> = {};
  for (const [key, value] of Object.entries(currentDraft)) {
    if (!key.startsWith(prefix)) {
      nextDraft[key] = value;
    }
  }
  const next = { ...current };
  if (Object.keys(nextDraft).length > 0) {
    next[scopeKey] = nextDraft;
  } else {
    delete next[scopeKey];
  }
  return next;
}

export function setAdvancedVmTemplateParameterDraft(
  current: ScopedDraftMap<string>,
  scopeKey: string,
  templateName: string,
  variableName: string,
  field: AdvancedVmFlowVarField | "op",
  value: string
): ScopedDraftMap<string> {
  return setScopedDraftField(
    current,
    scopeKey,
    advancedVmTemplateParameterKey(templateName, variableName, field),
    value
  );
}

export function clearAdvancedVmTemplateParameterDrafts(
  current: ScopedDraftMap<string>,
  scopeKey: string,
  templateName: string
): ScopedDraftMap<string> {
  return clearScopedDraftPrefix(current, scopeKey, `${templateName}:`);
}

export function initialAdvancedVmEditorDraftState(): AdvancedVmEditorDraftState {
  return {
    drafts: {},
    targetSources: {},
    templateParameterDrafts: {}
  };
}

export function advancedVmDraftChangedState(
  state: AdvancedVmEditorDraftState,
  {
    draftKey,
    nextDraft
  }: {
    draftKey: string;
    nextDraft: string;
  }
): AdvancedVmEditorDraftState {
  return {
    ...state,
    drafts: setScopedValue(state.drafts, draftKey, nextDraft)
  };
}

export function advancedVmDraftChangeAction(
  draftKey: string,
  nextDraft: string
): AdvancedVmDraftChangeAction {
  return {
    draftKey,
    kind: "change",
    nextDraft
  };
}

export function runAdvancedVmDraftChangeAction(
  action: AdvancedVmDraftChangeAction,
  handlers: AdvancedVmDraftChangeActionHandlers
) {
  handlers.updateState((current) => advancedVmDraftChangedState(current, {
    draftKey: action.draftKey,
    nextDraft: action.nextDraft
  }));
}

export function runAdvancedVmDraftTextChange(
  draftKey: string,
  nextDraft: string,
  handlers: AdvancedVmDraftChangeActionHandlers
) {
  runAdvancedVmDraftChangeAction(advancedVmDraftChangeAction(draftKey, nextDraft), handlers);
}

export function advancedVmTemplateParameterChangeAction({
  field,
  scopeKey,
  templateName,
  value,
  variableName
}: {
  field: AdvancedVmFlowVarField | "op";
  scopeKey: string;
  templateName: string;
  value: string;
  variableName: string;
}): AdvancedVmTemplateParameterChangeAction {
  return {
    field,
    kind: "change",
    scopeKey,
    templateName,
    value,
    variableName
  };
}

export function advancedVmTemplateParametersResetAction({
  scopeKey,
  templateName
}: {
  scopeKey: string;
  templateName: string;
}): AdvancedVmTemplateParametersResetAction {
  return {
    kind: "reset",
    scopeKey,
    templateName
  };
}

export function runAdvancedVmTemplateParameterChangeAction(
  action: AdvancedVmTemplateParameterChangeAction,
  handlers: AdvancedVmTemplateParameterActionHandlers
) {
  handlers.updateState((current) => advancedVmTemplateParameterChangedState(current, {
    field: action.field,
    scopeKey: action.scopeKey,
    templateName: action.templateName,
    value: action.value,
    variableName: action.variableName
  }));
}

export function runAdvancedVmTemplateParameterChange(
  {
    field,
    scopeKey,
    templateName,
    value,
    variableName
  }: {
    field: AdvancedVmFlowVarField | "op";
    scopeKey: string;
    templateName: string;
    value: string;
    variableName: string;
  },
  handlers: AdvancedVmTemplateParameterActionHandlers
) {
  runAdvancedVmTemplateParameterChangeAction(
    advancedVmTemplateParameterChangeAction({
      field,
      scopeKey,
      templateName,
      value,
      variableName
    }),
    handlers
  );
}

export function runAdvancedVmTemplateParametersResetAction(
  action: AdvancedVmTemplateParametersResetAction,
  handlers: AdvancedVmTemplateParameterActionHandlers
) {
  handlers.updateState((current) => advancedVmTemplateParametersResetState(current, {
    scopeKey: action.scopeKey,
    templateName: action.templateName
  }));
}

export function runAdvancedVmTemplateParametersReset(
  {
    scopeKey,
    templateName
  }: {
    scopeKey: string;
    templateName: string;
  },
  handlers: AdvancedVmTemplateParameterActionHandlers
) {
  runAdvancedVmTemplateParametersResetAction(
    advancedVmTemplateParametersResetAction({
      scopeKey,
      templateName
    }),
    handlers
  );
}

export function advancedVmTemplateParameterChangedState(
  state: AdvancedVmEditorDraftState,
  {
    field,
    scopeKey,
    templateName,
    value,
    variableName
  }: {
    field: AdvancedVmFlowVarField | "op";
    scopeKey: string;
    templateName: string;
    value: string;
    variableName: string;
  }
): AdvancedVmEditorDraftState {
  return {
    ...state,
    templateParameterDrafts: setAdvancedVmTemplateParameterDraft(
      state.templateParameterDrafts,
      scopeKey,
      templateName,
      variableName,
      field,
      value
    )
  };
}

export function advancedVmTemplateParametersResetState(
  state: AdvancedVmEditorDraftState,
  {
    scopeKey,
    templateName
  }: {
    scopeKey: string;
    templateName: string;
  }
): AdvancedVmEditorDraftState {
  return {
    ...state,
    templateParameterDrafts: clearAdvancedVmTemplateParameterDrafts(
      state.templateParameterDrafts,
      scopeKey,
      templateName
    )
  };
}

export function advancedVmTargetSourceChangedState(
  state: AdvancedVmEditorDraftState,
  {
    source,
    sourceKey
  }: {
    source: AdvancedVmTargetSource;
    sourceKey: string;
  }
): AdvancedVmEditorDraftState {
  return {
    ...state,
    targetSources: setScopedValue(state.targetSources, sourceKey, source)
  };
}

export function advancedVmTargetDraftAppliedState(
  state: AdvancedVmEditorDraftState,
  {
    draftKey,
    nextDraft,
    source,
    sourceKey
  }: {
    draftKey: string;
    nextDraft: string;
    source: AdvancedVmTargetSource;
    sourceKey: string;
  }
): AdvancedVmEditorDraftState {
  return advancedVmDraftChangedState(
    advancedVmTargetSourceChangedState(state, { source, sourceKey }),
    { draftKey, nextDraft }
  );
}

export function structuredAdvancedVmStreamForEditor(
  selectedStream: ProfileWorkbenchStream | null,
  rawPacketDraft: string,
  rawPacketDraftError: string | null,
  rawPacketDraftBytes: number,
  rawPacketWireLength: number
) {
  if (!selectedStream) {
    return null;
  }
  if (selectedStream.packet_binary_base64 && !isRawPacketAdvancedStream(selectedStream)) {
    return {
      ...selectedStream,
      packet_binary_base64: null
    };
  }
  if (!isRawPacketAdvancedStream(selectedStream) || rawPacketDraftError || rawPacketDraftBytes === 0) {
    return selectedStream;
  }
  return {
    ...selectedStream,
    frame_length: rawPacketWireLength,
    packet_binary_base64: rawPacketHexToBase64(rawPacketDraft)
  };
}

export function rawDraftAdvancedVmStreamForEditor(
  selectedStream: ProfileWorkbenchStream | null,
  rawPacketDraft: string,
  rawPacketDraftError: string | null,
  rawPacketDraftBytes: number,
  rawPacketWireLength: number
) {
  if (!selectedStream || rawPacketDraftError || rawPacketDraftBytes === 0) {
    return null;
  }
  return {
    ...selectedStream,
    packet_type: "Ethernet" as const,
    frame_length: rawPacketWireLength,
    packet_binary_base64: rawPacketHexToBase64(rawPacketDraft)
  };
}

export function defaultAdvancedVmTargetSourceForEditor(
  selectedStream: ProfileWorkbenchStream | null,
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null
): AdvancedVmTargetSource {
  return rawDraftAdvancedVmStream && !hasStructuredAdvancedTargetIntent(selectedStream) ? "raw" : "structured";
}

export function effectiveAdvancedVmTargetSourceForEditor(
  targetSource: AdvancedVmTargetSource,
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null
): AdvancedVmTargetSource {
  return targetSource === "raw" && rawDraftAdvancedVmStream ? "raw" : "structured";
}

export function advancedVmStreamForEditor(
  targetSource: AdvancedVmTargetSource,
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null,
  structuredAdvancedVmStream: ProfileWorkbenchStream | null
) {
  return targetSource === "raw" && rawDraftAdvancedVmStream
    ? rawDraftAdvancedVmStream
    : structuredAdvancedVmStream;
}

export function rawPacketFieldAdvancedVmTargetDraft(
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null,
  target: AdvancedVmTargetRow,
  draft: AdvancedVmTemplateParameterDraft
): RawPacketFieldAdvancedVmTargetDraftResult {
  if (!rawDraftAdvancedVmStream) {
    return { ok: false };
  }
  const template = target.template;
  if (template.supports && !template.supports(rawDraftAdvancedVmStream)) {
    return { ok: false };
  }
  const templateBody = advancedVmParameterizedTemplateBody(template, rawDraftAdvancedVmStream, draft);
  if (advancedVmTemplateParameterValidationError(template, templateBody, draft)) {
    return { ok: false };
  }
  return {
    advancedVmDraft: formatAdvancedVmJson(templateBody),
    ok: true,
    templateName: template.name
  };
}

export function rawPacketFieldAdvancedVmTargetAction(
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null,
  target: AdvancedVmTargetRow,
  draft: AdvancedVmTemplateParameterDraft,
  rowId: string
): RawPacketFieldAdvancedVmTargetAction {
  const targetDraft = rawPacketFieldAdvancedVmTargetDraft(rawDraftAdvancedVmStream, target, draft);
  if (!targetDraft.ok) {
    return { kind: "ignored" };
  }
  return {
    advancedVmDraft: targetDraft.advancedVmDraft,
    kind: "apply",
    nextTab: "Field Engine",
    rowId,
    templateName: targetDraft.templateName
  };
}

export function runRawPacketFieldAdvancedVmTargetAction(
  action: RawPacketFieldAdvancedVmTargetAction,
  handlers: RawPacketFieldAdvancedVmTargetActionHandlers
) {
  if (action.kind === "ignored") {
    return false;
  }
  handlers.updateRawPacketState((current) => rawPacketSelectedFieldState(current, action.rowId));
  handlers.selectTab(action.nextTab);
  handlers.setTemplateName(action.templateName);
  handlers.updateAdvancedVmState((current) =>
    advancedVmTargetDraftAppliedState(current, {
      draftKey: handlers.advancedVmDraftKey,
      nextDraft: action.advancedVmDraft,
      source: "raw",
      sourceKey: handlers.advancedVmSourceKey
    })
  );
  handlers.scrollToBuilder();
  return true;
}

export function runRawPacketFieldAdvancedVmTarget(
  rawDraftAdvancedVmStream: ProfileWorkbenchStream | null,
  target: AdvancedVmTargetRow,
  draft: AdvancedVmTemplateParameterDraft,
  rowId: string,
  handlers: RawPacketFieldAdvancedVmTargetActionHandlers
) {
  return runRawPacketFieldAdvancedVmTargetAction(
    rawPacketFieldAdvancedVmTargetAction(rawDraftAdvancedVmStream, target, draft, rowId),
    handlers
  );
}

export function workspaceRawPacketFieldActionHandlers({
  advancedVmTemplateParameterDraft,
  fieldScopeKey,
  rawDraftAdvancedVmStream,
  rawPacketDraft,
  selectTextRange,
  updateRawPacketState,
  ...targetHandlers
}: WorkspaceRawPacketFieldActionHandlerInput): WorkspaceRawPacketFieldActionHandlers {
  return {
    applyAdvancedVmTarget: (row, target) =>
      runRawPacketFieldAdvancedVmTarget(
        rawDraftAdvancedVmStream,
        target,
        advancedVmTemplateParameterDraft,
        row.id,
        {
          ...targetHandlers,
          updateRawPacketState
        }
      ),
    locateField: (row) =>
      runRawPacketFieldLocate(rawPacketDraft, row, {
        fieldScopeKey,
        selectTextRange,
        updateState: updateRawPacketState
      })
  };
}
