import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FileInput } from "lucide-react";

import type {
  ProfilePcapImportOptions,
  ProfileWorkbenchStream,
} from "../../api";
import { FieldEnginePanel } from "./trafficProfiles/FieldEnginePanel";
import {
  advancedVmFlowVarFields,
  advancedVmFlowVarOperations,
  ipv4AddressModes,
  isIcmpv6ControlStream,
  isIcmpv6NdStream,
  isIcmpv6RaStream,
  isIcmpv6RsStream,
  type AdvancedVmFlowVarField,
  type AdvancedVmTargetRow
} from "./trafficProfiles/model";
import {
  ipVersionName,
  l4ProtocolTitle,
  protocolName
} from "./trafficProfiles/protocolSelectionModel";
import {
  inputNumberValue,
  numberValue,
} from "./trafficProfiles/scalarValueModel";
import {
  packetViewerHexViewModel,
  packetViewerTreeViewModel
} from "./trafficProfiles/packetViewerModel";
import {
  streamEditorTabsViewModel,
  type StreamEditorTab
} from "./trafficProfiles/streamEditorTabsModel";
import { advancedSettingsPanelViewModel } from "./trafficProfiles/streamSettingsModel";
import {
  payloadPatternFileControlViewModel,
  payloadPatternImportStatusClassName,
  payloadPatternPanelViewModel,
  type PayloadPatternImportStatus
} from "./trafficProfiles/payloadPatternModel";
import {
  profileBrowserActionHandlers,
  profileBrowserEmptyMessage,
  type ProfileBrowserRow
} from "./trafficProfiles/profileCatalogModel";
import { ProfileCatalogPane } from "./trafficProfiles/ProfileCatalogPane";
import {
  defaultPcapImportOptions,
  pcapImportEditorViewModel,
  pcapImportPanelViewModel
} from "./trafficProfiles/pcapImportModel";
import {
  runtimeProfilePanelViewModel
} from "./trafficProfiles/profileRuntimeModel";
import {
  advancedStreamReadOnlyPanelViewModel,
  streamTableViewModel
} from "./trafficProfiles/streamSummaryModel";
import { advancedVmTemplates } from "./trafficProfiles/advancedVmTemplates";
import {
  advancedVmFlowVarInputAttributes,
  advancedVmTemplateParameterValue
} from "./trafficProfiles/advancedVmParameterModel";
import { PacketEditorPanel } from "./trafficProfiles/PacketEditorPanel";
import { PortPairPlan } from "./trafficProfiles/PortPairPlan";
import {
  rawPacketFieldAdvancedVmTarget,
  rawPacketFieldError,
  type RawPacketFieldRow
} from "./trafficProfiles/rawPacketModel";
import { resetFileInput } from "./trafficProfiles/fileInput";
import { selectedStreamPatchHandlersForIndex } from "./trafficProfiles/streamPatchModel";
import {
  advancedVmEditorStateViewModel,
  initialAdvancedVmEditorDraftState,
  initialRawPacketEditorDraftState,
  rawPacketEditorStateViewModel,
  selectableEditorTab,
  selectedStreamEditorStateViewModel,
  workspaceEditorTabActionHandlers,
  workspaceRawPacketFieldActionHandlers,
  workspaceSelectionViewModel
} from "./trafficProfiles/workspaceSelectionModel";
import { workspaceEditorActionHandlers } from "./trafficProfiles/workspaceEditorHandlers";
import {
  workspaceFileImportActionHandlers
} from "./trafficProfiles/workspaceFileImportHandlers";
import { workspacePcapImportHandlers } from "./trafficProfiles/workspacePcapImportHandlers";
import { workspaceProtocolDataArpHandlers } from "./trafficProfiles/workspaceProtocolDataArpHandlers";
import { workspaceProtocolDataDhcpHandlers } from "./trafficProfiles/workspaceProtocolDataDhcpHandlers";
import { workspaceProtocolDataDnsHandlers } from "./trafficProfiles/workspaceProtocolDataDnsHandlers";
import { workspaceProtocolDataIcmpHandlers } from "./trafficProfiles/workspaceProtocolDataIcmpHandlers";
import { workspaceProtocolDataIcmpv6Handlers } from "./trafficProfiles/workspaceProtocolDataIcmpv6Handlers";
import { workspaceProtocolDataIpv4Handlers } from "./trafficProfiles/workspaceProtocolDataIpv4Handlers";
import { workspaceProtocolDataIpv6Handlers } from "./trafficProfiles/workspaceProtocolDataIpv6Handlers";
import { workspaceProtocolDataLinkHandlers } from "./trafficProfiles/workspaceProtocolDataLinkHandlers";
import { workspaceProtocolDataMplsHandlers } from "./trafficProfiles/workspaceProtocolDataMplsHandlers";
import { workspaceProtocolDataSctpHandlers } from "./trafficProfiles/workspaceProtocolDataSctpHandlers";
import { workspaceProtocolDataTcpHandlers } from "./trafficProfiles/workspaceProtocolDataTcpHandlers";
import { workspaceProtocolDataTransportHandlers } from "./trafficProfiles/workspaceProtocolDataTransportHandlers";
import { workspaceProtocolDataTunnelHandlers } from "./trafficProfiles/workspaceProtocolDataTunnelHandlers";
import { workspaceProtocolDataUdpHandlers } from "./trafficProfiles/workspaceProtocolDataUdpHandlers";
import { workspaceProtocolSelectionHandlers } from "./trafficProfiles/workspaceProtocolSelectionHandlers";
import { workspaceProfileRuntimeHandlers } from "./trafficProfiles/workspaceProfileRuntimeHandlers";
import { workspaceStreamPatchHandlers } from "./trafficProfiles/workspaceStreamPatchHandlers";
import { workspaceStreamPropertiesHandlers } from "./trafficProfiles/workspaceStreamPropertiesHandlers";
import { TrafficRunControl } from "./TrafficRunControl";
import {
  workspaceCommandActionHandlers,
  workspaceCommandButtonViewModel,
  type ProfileCommandAction,
  type StreamCommandAction
} from "./trafficProfiles/workspaceCommands";
import type { TrafficProfilesWorkspaceProps } from "./trafficProfiles/workspaceTypes";
import {
  scrollEditorSurfaceIntoView,
  selectTextAreaRange,
  type EditorSurfaceTarget
} from "./trafficProfiles/workspaceViewport";

const pcapImportPanelView = pcapImportPanelViewModel();

function streamEditorTabId(tab: StreamEditorTab) {
  return `stream-editor-tab-${tab.toLowerCase().replace(/ /g, "-")}`;
}

function streamEditorPanelId(tab: StreamEditorTab) {
  return `stream-editor-panel-${tab.toLowerCase().replace(/ /g, "-")}`;
}

function AdvancedStreamReadOnlyPanel({ stream }: { stream: ProfileWorkbenchStream }) {
  const view = advancedStreamReadOnlyPanelViewModel(stream);
  return (
    <div className={view.className} role={view.role} aria-label={view.ariaLabel}>
      <div className={view.banner.className} role={view.banner.role}>
        <strong>{view.banner.title}</strong>
        <span>{view.banner.description}</span>
      </div>
      <dl className={view.gridClassName}>
        {view.facts.map((fact) => (
          <div key={fact.key}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TrafficProfilesWorkspace({
  profileCatalog,
  profileOptions,
  profileError,
  isProfilesLoading,
  portRecords,
  profilePath,
  selectedProfile,
  builderProfileName,
  streamBuilderEnabled,
  profileTunables,
  profileTunablesEnabled,
  profileTunablesError,
  activeCommand,
  isStarting,
  requireConfirmation,
  runtimeControlDisabledReason,
  trafficMultiplierUnit,
  trafficMultiplierValue,
  trafficMultiplierError,
  trafficMultiplierPreview,
  trafficDurationEnabled,
  trafficDurationValue,
  trafficDurationError,
  streams,
  selectedStreamIndex,
  profilePacketPreviews,
  isProfileWorkbenchBusy,
  workbenchProfileValidationError,
  workbenchStreamValidationError,
  selectedStreamValidationError,
  profileWorkbenchResult,
  profileCommandResult,
  onProfilePathChange,
  onBuilderProfileNameChange,
  onProfileTunablesChange,
  onTrafficMultiplierUnitChange,
  onTrafficMultiplierValueChange,
  onTrafficDurationEnabledChange,
  onTrafficDurationValueChange,
  onTrafficPlanDirtyChange,
  onTrafficSessionAuthorityChange,
  onStartTraffic,
  onStartAllTraffic,
  onUpdateTraffic,
  onCreateProfile,
  onDuplicateProfile,
  onDeleteProfile,
  onExportProfileJson,
  onExportProfileYaml,
  onExportPcap,
  onImportPcap,
  onLoadProfile,
  onBuildStream,
  onDuplicateStream,
  onDeleteStream,
  onRenderProfilePreview,
  onSelectedStreamIndexChange,
  onStreamChange
}: TrafficProfilesWorkspaceProps) {
  const [activeEditorTab, setActiveEditorTab] = useState<StreamEditorTab>("Stream Properties");
  const [pcapImportOptions, setPcapImportOptions] = useState<ProfilePcapImportOptions>(defaultPcapImportOptions);
  const [pcapImportExpanded, setPcapImportExpanded] = useState(false);
  const importPcapInputRef = useRef<HTMLInputElement | null>(null);
  const importPayloadPatternInputRef = useRef<HTMLInputElement | null>(null);
  const editorTabRefs = useRef<Partial<Record<StreamEditorTab, HTMLButtonElement | null>>>({});
  const profileEditorRef = useRef<HTMLElement | null>(null);
  const rawPacketTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamBuilderRef = useRef<HTMLElement | null>(null);
  const [payloadPatternImportStatus, setPayloadPatternImportStatus] = useState<PayloadPatternImportStatus | null>(null);
  const advancedSettingsPanelView = advancedSettingsPanelViewModel();
  const payloadPatternFileControlView = payloadPatternFileControlViewModel();
  const payloadPatternPanelView = payloadPatternPanelViewModel();
  const profileListEmptyMessage = profileBrowserEmptyMessage({
    catalogBlocker: profileCatalog?.blocker,
    catalogError: profileCatalog?.error,
    profileError
  });
  const selectionView = useMemo(
    () => workspaceSelectionViewModel({
      activeEditorTab,
      profilePacketPreviews,
      profilePath,
      selectedProfile,
      selectedStreamIndex,
      streams
    }),
    [
      activeEditorTab,
      profilePacketPreviews,
      profilePath,
      selectedProfile,
      selectedStreamIndex,
      streams
    ]
  );
  const {
    advancedVmSourceJson,
    advancedVmSourceKey,
    advancedVmTemplateParameterDraftKey,
    effectiveEditorTab: requestedEditorTab,
    hasRunnableProfile,
    packetEditorContextKey,
    rawPacketDefaultHex,
    selectedPreview,
    selectedStream,
    selectedStreamAdvanced,
    streamCount,
    visibleEditorTabs
  } = selectionView;
  const effectiveEditorTab = selectableEditorTab(
    visibleEditorTabs,
    requestedEditorTab,
    Boolean(workbenchStreamValidationError)
  );
  const packetViewerTreeView = packetViewerTreeViewModel(selectedPreview, isProfileWorkbenchBusy);
  const packetViewerHexView = packetViewerHexViewModel(selectedPreview, isProfileWorkbenchBusy);
  const [rawPacketDraftState, setRawPacketDraftState] = useState(initialRawPacketEditorDraftState);
  const rawPacketEditorState = useMemo(
    () => rawPacketEditorStateViewModel({
      contextKey: packetEditorContextKey,
      defaultHex: rawPacketDefaultHex,
      drafts: rawPacketDraftState.drafts,
      fieldDrafts: rawPacketDraftState.fieldDrafts,
      fieldStatuses: rawPacketDraftState.fieldStatuses,
      selectedStream
    }),
    [
      packetEditorContextKey,
      rawPacketDefaultHex,
      rawPacketDraftState,
      selectedStream
    ]
  );
  const {
    draft: rawPacketDraft,
    draftView: rawPacketDraftView,
    fieldDraft: rawPacketFieldDraft,
    fieldScopeKey: rawPacketFieldScopeKey,
    fieldStatus: rawPacketFieldStatus
  } = rawPacketEditorState;
  const {
    byteCount: rawPacketDraftBytes,
    error: rawPacketDraftError,
    fieldRows: rawPacketFieldRows,
    overrideActive: rawPacketOverrideActive,
    parsedBytes: rawPacketParsedBytes,
    statusText: rawPacketStatusText,
    wireLength: rawPacketWireLength
  } = rawPacketDraftView;
  const [advancedVmDraftState, setAdvancedVmDraftState] = useState(initialAdvancedVmEditorDraftState);
  const [advancedVmTemplateName, setAdvancedVmTemplateName] = useState(advancedVmTemplates[0].name);
  const advancedVmEditorState = useMemo(
    () => advancedVmEditorStateViewModel({
      defaultDraft: advancedVmSourceJson,
      draftKey: advancedVmSourceKey,
      drafts: advancedVmDraftState.drafts,
      rawPacketDraft,
      rawPacketDraftBytes,
      rawPacketDraftError,
      rawPacketWireLength,
      selectedPreview,
      selectedStream,
      sourceKey: advancedVmTemplateParameterDraftKey,
      sources: advancedVmDraftState.targetSources,
      templateName: advancedVmTemplateName,
      templateParameterDrafts: advancedVmDraftState.templateParameterDrafts,
      templates: advancedVmTemplates
    }),
    [
      advancedVmDraftState,
      advancedVmSourceJson,
      advancedVmSourceKey,
      advancedVmTemplateName,
      advancedVmTemplateParameterDraftKey,
      rawPacketDraft,
      rawPacketDraftBytes,
      rawPacketDraftError,
      rawPacketWireLength,
      selectedPreview,
      selectedStream
    ]
  );
  const {
    draft: advancedVmDraft,
    draftView: advancedVmDraftView,
    editorStream: advancedVmStream,
    rawDraftStream: rawDraftAdvancedVmStream,
    rawTargetRows: rawAdvancedVmTargetChoices,
    readyTargetCount: advancedVmReadyTargetCount,
    selectedTargetRows: advancedVmTargetChoices,
    selectedTemplate: selectedAdvancedVmTemplate,
    selectedTemplateBody: selectedAdvancedVmTemplateBody,
    selectedTemplateFlowVars: selectedAdvancedVmTemplateFlowVars,
    targetChoiceView: advancedVmTargetChoiceView,
    templateCompatible: advancedVmTemplateCompatible,
    templateHint: advancedVmTemplateHint,
    templateParameterDirty: advancedVmTemplateParameterDirty,
    templateParameterDraft: advancedVmTemplateParameterDraft,
    templateReady: advancedVmTemplateReady,
    templateView: advancedVmTemplateView
  } = advancedVmEditorState;
  const streamTable = useMemo(
    () => streamTableViewModel({ selectedStreamIndex, streams }),
    [selectedStreamIndex, streams]
  );
  const selectedStreamEditorState = useMemo(
    () => selectedStreamEditorStateViewModel({
      effectiveEditorTab,
      hasWorkbenchStreamValidationError: Boolean(workbenchStreamValidationError),
      selectedStream,
      streams,
      visibleEditorTabs
    }),
    [
      effectiveEditorTab,
      selectedStream,
      streams,
      visibleEditorTabs,
      workbenchStreamValidationError
    ]
  );
  const {
    advancedSettingsView,
    arpView,
    dhcpView,
    dnsView,
    editorTabRows,
    ethernetView,
    frameLengthView,
    greView,
    gtpuView,
    icmpView,
    icmpv6NdView,
    icmpv6RaView,
    icmpv6RsView,
    ipv4AddressView,
    ipv4FlagsChecksumView,
    ipv4ScalarView,
    ipv6AddressView,
    ipv6ScalarView,
    l4PortView,
    mediaAccessView,
    mplsSecondLabelView,
    mplsThirdLabelView,
    mplsView,
    payloadSettingsView,
    protocolSelectionView,
    sctpView,
    streamPropertiesView,
    tcpChecksumView,
    tcpCoreView,
    tcpMssOptionView,
    tcpSackOptionView,
    tcpTimestampOptionView,
    tcpUrgentFlagsView,
    tcpWindowScaleOptionView,
    udpView,
    vlanInnerTagView,
    vlanView,
    vxlanView
  } = selectedStreamEditorState;
  const streamEditorTabsView = useMemo(
    () => streamEditorTabsViewModel({
      effectiveEditorTab,
      isAdvanced: selectedStreamAdvanced,
      modeSwitchDisabled: isProfileWorkbenchBusy,
      rows: editorTabRows
    }),
    [
      editorTabRows,
      effectiveEditorTab,
      isProfileWorkbenchBusy,
      selectedStreamAdvanced
    ]
  );
  const runtimeProfilePanel = runtimeProfilePanelViewModel({
    builderProfileName,
    hasRunnableProfile,
    isStarting,
    pcapImportOptions,
    profileCommandResult,
    profilePath,
    profileTunables,
    profileTunablesEnabled,
    profileTunablesError,
    profileWorkbenchResult,
    selectedProfile,
    selectedStreamValidationError,
    streamBuilderEnabled,
    trafficDurationEnabled,
    trafficDurationValue,
    trafficMultiplierUnit,
    trafficMultiplierValue,
    workbenchProfileValidationError,
    workbenchStreamValidationError
  });
  const pcapImportEditor = pcapImportEditorViewModel(pcapImportOptions);
  const {
    pcapImportSummary,
    profileWorkbarView,
    profileWorkspaceModeView,
    profileTunablesBarRows,
    profileTunablesView,
    runtimeBarView,
    runtimePanels,
    runtimeProfileFacts
  } = runtimeProfilePanel;
  const profileRuntimeHandlers = workspaceProfileRuntimeHandlers({
    changeBuilderProfileName: onBuilderProfileNameChange,
    changeProfileTunables: onProfileTunablesChange,
    profileTunables,
    profileWorkbarView,
    startRuntimeHandlers: {
      startAll: onStartAllTraffic,
      startSelected: onStartTraffic
    }
  });
  const {
    profileCommandButtons,
    profileCommandToolbarView,
    streamCommandButtons,
    streamCommandToolbarView
  } = workspaceCommandButtonViewModel({
    isProfileWorkbenchBusy,
    selectedProfile,
    selectedStreamValidationError,
    streamBuilderEnabled,
    streamCount,
    workbenchProfileValidationError
  });
  const pcapImportOptionHandlers = {
    changePcapImportOptions: setPcapImportOptions
  };
  const pcapImportHandlers = workspacePcapImportHandlers(pcapImportOptionHandlers);

  const scrollWorkspaceEditorSurfaceIntoView = (target: EditorSurfaceTarget) => {
    scrollEditorSurfaceIntoView(target, {
      builder: streamBuilderRef.current,
      profile: profileEditorRef.current
    });
  };

  const selectEditorTab = (tab: StreamEditorTab) => {
    workspaceEditorTabActionHandlers({
      hasWorkbenchStreamValidationError: Boolean(workbenchStreamValidationError),
      renderPreview: () => {
        void onRenderProfilePreview();
      },
      scrollToBuilder: () => scrollWorkspaceEditorSurfaceIntoView("builder"),
      selectTab: setActiveEditorTab,
      visibleEditorTabs
    }).selectEditorTab(tab);
  };

  const handleEditorTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: StreamEditorTab) => {
    const enabledTabs = streamEditorTabsView.tabs.filter((row) => !row.disabled).map((row) => row.tab);
    if (enabledTabs.length === 0) {
      return;
    }
    const currentIndex = Math.max(enabledTabs.indexOf(tab), 0);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    selectEditorTab(nextTab);
    editorTabRefs.current[nextTab]?.focus();
  };

  const selectRawPacketTextRange = (selection: { end: number; start: number }) => {
    selectTextAreaRange(rawPacketTextareaRef.current, selection);
  };

  const selectedStreamPatchHandlers = selectedStreamPatchHandlersForIndex(selectedStreamIndex, onStreamChange);
  const streamPropertiesHandlers = workspaceStreamPropertiesHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolSelectionHandlers = workspaceProtocolSelectionHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataArpHandlers = workspaceProtocolDataArpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataIcmpHandlers = workspaceProtocolDataIcmpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataIcmpv6Handlers = workspaceProtocolDataIcmpv6Handlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataIpv4Handlers = workspaceProtocolDataIpv4Handlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataIpv6Handlers = workspaceProtocolDataIpv6Handlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataLinkHandlers = workspaceProtocolDataLinkHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataMplsHandlers = workspaceProtocolDataMplsHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataTransportHandlers = workspaceProtocolDataTransportHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataTunnelHandlers = workspaceProtocolDataTunnelHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataUdpHandlers = workspaceProtocolDataUdpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataDnsHandlers = workspaceProtocolDataDnsHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataDhcpHandlers = workspaceProtocolDataDhcpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataSctpHandlers = workspaceProtocolDataSctpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });
  const protocolDataTcpHandlers = workspaceProtocolDataTcpHandlers({
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });

  const locateRawPacketField = (row: RawPacketFieldRow) => {
    workspaceRawPacketFieldActionHandlers({
      advancedVmDraftKey: advancedVmSourceKey,
      advancedVmSourceKey: advancedVmTemplateParameterDraftKey,
      advancedVmTemplateParameterDraft,
      fieldScopeKey: rawPacketFieldScopeKey,
      rawDraftAdvancedVmStream,
      rawPacketDraft,
      scrollToBuilder: () => scrollWorkspaceEditorSurfaceIntoView("builder"),
      selectTab: setActiveEditorTab,
      selectTextRange: selectRawPacketTextRange,
      setTemplateName: setAdvancedVmTemplateName,
      updateAdvancedVmState: setAdvancedVmDraftState,
      updateRawPacketState: setRawPacketDraftState
    }).locateField(row);
  };

  const applyRawPacketFieldAdvancedVmTarget = (row: RawPacketFieldRow, target: AdvancedVmTargetRow) => {
    workspaceRawPacketFieldActionHandlers({
      advancedVmDraftKey: advancedVmSourceKey,
      advancedVmSourceKey: advancedVmTemplateParameterDraftKey,
      advancedVmTemplateParameterDraft,
      fieldScopeKey: rawPacketFieldScopeKey,
      rawDraftAdvancedVmStream,
      rawPacketDraft,
      scrollToBuilder: () => scrollWorkspaceEditorSurfaceIntoView("builder"),
      selectTab: setActiveEditorTab,
      selectTextRange: selectRawPacketTextRange,
      setTemplateName: setAdvancedVmTemplateName,
      updateAdvancedVmState: setAdvancedVmDraftState,
      updateRawPacketState: setRawPacketDraftState
    }).applyAdvancedVmTarget(row, target);
  };

  const {
    appendAdvancedVmDraftFromTemplate,
    applyAdvancedVmDraft,
    applyAdvancedVmTargetTemplate,
    applyRawPacketDraft,
    applyRawPacketFieldDraft,
    clearRawPacketOverride,
    resetAdvancedVmDraft,
    resetAdvancedVmTemplateParameters,
    seedAdvancedVmDraftFromTemplate,
    seedRawPacketDraftFromPreview,
    switchAdvancedEditorMode,
    updateAdvancedVmDraftText,
    updateAdvancedVmTemplateParameter,
    updateRawPacketDraftText,
    updateRawPacketFieldDraft
  } = workspaceEditorActionHandlers({
    advancedVmDraftView,
    advancedVmSourceJson,
    advancedVmSourceKey,
    advancedVmStream,
    advancedVmTemplateName,
    advancedVmTemplateParameterDraft,
    advancedVmTemplateParameterDraftKey,
    advancedVmTemplateView,
    canRenderPreview: !workbenchStreamValidationError,
    confirmRawPacketOverrideClear: () =>
      !rawPacketOverrideActive
      || window.confirm("Clear raw packet override and return this stream to structured editing?"),
    packetEditorContextKey,
    rawPacketDraft,
    rawPacketDraftBytes,
    rawPacketDraftError,
    rawPacketFieldDraft,
    rawPacketFieldScopeKey,
    renderPreview: () => {
      void onRenderProfilePreview();
    },
    selectTab: setActiveEditorTab,
    selectedPreview,
    selectedStream,
    setAdvancedVmDraftState,
    setAdvancedVmTemplateName,
    setRawPacketDraftState,
    streamPatchHandlers: selectedStreamPatchHandlers
  });

  const {
    applyPayloadPatternImport,
    changeAdvancedCacheSizeType: handleAdvancedCacheSizeTypeChange,
    changeAdvancedCacheValue: handleAdvancedCacheValueChange,
    changeFrameLengthType: handleFrameLengthTypeChange,
    changeGreInnerIpVersion: handleGreInnerIpVersionChange,
    changeGtpuInnerIpVersion: handleGtpuInnerIpVersionChange,
    changePacketType: handlePacketTypeChange,
    changePayloadPatternTextInput: handlePayloadPatternTextInputChange,
    changePayloadPatternTypeInput: handlePayloadPatternTypeInputChange,
    changeStreamMode: handleStreamModeChange,
    changeVxlanInnerIpVersion: handleVxlanInnerIpVersionChange
  } = workspaceStreamPatchHandlers({
    clearPayloadPatternStatus: () => setPayloadPatternImportStatus(null),
    selectedStream,
    streamPatchHandlers: selectedStreamPatchHandlers
  });

  const profileCommandHandlers = {
    create: onCreateProfile,
    delete: onDeleteProfile,
    duplicate: onDuplicateProfile,
    exportJson: onExportProfileJson,
    exportYaml: onExportProfileYaml,
    load: onLoadProfile
  };

  const streamCommandHandlers = {
    build: onBuildStream,
    delete: onDeleteStream,
    duplicate: onDuplicateStream,
    edit: () => onSelectedStreamIndexChange(selectedStreamIndex),
    exportPcap: onExportPcap,
    exportYaml: onExportProfileYaml,
    importPcap: () => importPcapInputRef.current?.click(),
    scrollToBuilder: () => scrollWorkspaceEditorSurfaceIntoView("builder"),
    selectTab: setActiveEditorTab
  };
  const runProfileCommand = (action: ProfileCommandAction) => {
    workspaceCommandActionHandlers({
      hasSelectedStream: Boolean(selectedStream),
      profileCommandHandlers,
      streamCommandHandlers
    }).runProfileCommand(action);
  };
  const runStreamCommand = (action: StreamCommandAction) => {
    workspaceCommandActionHandlers({
      hasSelectedStream: Boolean(selectedStream),
      profileCommandHandlers,
      streamCommandHandlers
    }).runStreamCommand(action);
  };
  const selectProfileBrowserRow = (profile: ProfileBrowserRow) => {
    profileBrowserActionHandlers({
      scrollToProfile: () => scrollWorkspaceEditorSurfaceIntoView("profile"),
      selectProfilePath: onProfilePathChange
    }).selectProfile(profile);
  };

  const handleImportPcapFileChange = (fileList: FileList | null) =>
    workspaceFileImportActionHandlers({
      applyPayloadPattern: applyPayloadPatternImport,
      canApplyPayloadPattern: Boolean(selectedStream),
      importPcap: onImportPcap,
      pcapImportOptions,
      resetPayloadPatternInput: () => resetFileInput(importPayloadPatternInputRef.current),
      resetPcapInput: () => resetFileInput(importPcapInputRef.current),
      setPayloadPatternStatus: setPayloadPatternImportStatus
    }).importPcapFileList(fileList);

  const handleImportPayloadPatternFileChange = (fileList: FileList | null) =>
    void workspaceFileImportActionHandlers({
      applyPayloadPattern: applyPayloadPatternImport,
      canApplyPayloadPattern: Boolean(selectedStream),
      importPcap: onImportPcap,
      pcapImportOptions,
      resetPayloadPatternInput: () => resetFileInput(importPayloadPatternInputRef.current),
      resetPcapInput: () => resetFileInput(importPcapInputRef.current),
      setPayloadPatternStatus: setPayloadPatternImportStatus
    }).importPayloadPatternFileList(fileList);

  return (
    <section className="traffic-profile-dialog" aria-label="Traffic Profiles workspace">
      <aside className="traffic-profile-left">
        <div className={profileCommandToolbarView.className} aria-label={profileCommandToolbarView.ariaLabel}>
          {profileCommandButtons.map(({ label, icon: Icon, action, buttonClassName, disabled, iconSize }) => (
            <button
              className={buttonClassName}
              disabled={disabled}
              key={label}
              onClick={() => runProfileCommand(action)}
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={iconSize} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <ProfileCatalogPane
          emptyMessage={profileListEmptyMessage}
          isLoading={isProfilesLoading}
          onSelectProfile={selectProfileBrowserRow}
          profilePath={profilePath}
          profiles={profileOptions}
          selectedProfile={selectedProfile}
        />
      </aside>

      <section
        className={profileWorkspaceModeView.rightClassName}
        ref={profileEditorRef}
      >
        <PortPairPlan
          activeCommand={activeCommand}
          isStarting={isStarting}
          portRecords={portRecords}
          profileOptions={profileOptions}
          requireConfirmation={requireConfirmation}
          runtimeControlDisabledReason={runtimeControlDisabledReason}
          onDirtyChange={onTrafficPlanDirtyChange}
          onSessionAuthorityChange={onTrafficSessionAuthorityChange}
        />

        <div className="profile-workbar">
          <label>
            {profileWorkbarView.label}
            <input
              aria-label={profileWorkbarView.inputAriaLabel}
              onChange={(event) =>
                profileRuntimeHandlers.changeProfileName(event.target.value)}
              readOnly={profileWorkbarView.inputReadOnly}
              value={profileWorkbarView.inputValue}
            />
          </label>
          <span className={profileWorkbarView.statusClassName}>
            {profileWorkbarView.statusText}
          </span>
        </div>

        {runtimeBarView.show ? (
          <div className="profile-runtime-bar" aria-label={runtimeBarView.ariaLabel}>
            <strong>{runtimeBarView.title}</strong>
            <TrafficRunControl
              activeCommand={activeCommand}
              disabledReason={runtimeControlDisabledReason}
              ariaLabelPrefix={runtimeBarView.controlAriaLabelPrefix}
              className={runtimeBarView.controlClassName}
              fieldLabel={runtimeBarView.controlFieldLabel}
              onTrafficDurationEnabledChange={onTrafficDurationEnabledChange}
              onTrafficDurationValueChange={onTrafficDurationValueChange}
              onTrafficMultiplierUnitChange={onTrafficMultiplierUnitChange}
              onTrafficMultiplierValueChange={onTrafficMultiplierValueChange}
              onUpdateTraffic={onUpdateTraffic}
              trafficDurationEnabled={trafficDurationEnabled}
              trafficDurationError={trafficDurationError}
              trafficDurationValue={trafficDurationValue}
              trafficMultiplierError={trafficMultiplierError}
              trafficMultiplierPreview={trafficMultiplierPreview}
              trafficMultiplierUnit={trafficMultiplierUnit}
              trafficMultiplierValue={trafficMultiplierValue}
              variant={runtimeBarView.controlVariant}
            />
            {runtimeBarView.buttons.map((button) => {
              const Icon = button.icon;
              return (
                <button
                  className={button.className}
                  disabled={button.disabled || runtimeControlDisabledReason !== null}
                  key={button.action}
                  onClick={() =>
                    profileRuntimeHandlers.startRuntime(button.action)}
                  title={runtimeControlDisabledReason ?? button.title}
                  type="button"
                >
                  <Icon aria-hidden="true" size={button.iconSize} />
                  <span>{button.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {profileTunablesView.showBar ? (
          <div className={profileTunablesView.barClassName} aria-label={profileTunablesView.barAriaLabel}>
            <strong>{profileTunablesView.barTitle}</strong>
            {profileTunablesBarRows.map((tunable) => (
              <label
                className={tunable.className}
                key={tunable.key}
              >
                {tunable.labelPresentation === "inline" ? <span>{tunable.label}</span> : tunable.label}
                {tunable.kind === "select" ? (
                  <select
                    aria-label={tunable.ariaLabel}
                    onChange={(event) =>
                      profileRuntimeHandlers.changeTunable(tunable, event.target.value)}
                    value={tunable.value}
                  >
                    {tunable.options.map((option) => (
                      <option key={option.key} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={tunable.ariaLabel}
                    inputMode={tunable.inputMode}
                    onChange={(event) =>
                      profileRuntimeHandlers.changeTunable(tunable, event.target.value)}
                    placeholder={tunable.placeholder}
                    value={tunable.value}
                  />
                )}
              </label>
            ))}
          </div>
        ) : null}

        {profileWorkspaceModeView.showRuntimeWorkspace ? (
          <section
            className={profileWorkspaceModeView.runtimeWorkspaceClassName}
            aria-label={profileWorkspaceModeView.runtimeWorkspaceAriaLabel}
          >
            <div className={profileWorkspaceModeView.runtimeSummaryGridClassName}>
              {runtimeProfileFacts.map((fact) => (
                <div className={profileWorkspaceModeView.runtimeFactClassName} key={fact.key}>
                  <span>{fact.label}</span>
                  <strong title={fact.value}>{fact.value}</strong>
                </div>
              ))}
            </div>
            <div className={profileWorkspaceModeView.runtimePanelsClassName}>
              {runtimePanels.map((panel) => (
                <section className={panel.className} key={panel.key}>
                  <div className={profileWorkspaceModeView.runtimePanelTitleClassName}>
                    <strong title={panel.title}>{panel.title}</strong>
                    <span>{panel.badge}</span>
                  </div>
                  {panel.rows.length > 0 ? (
                    <dl>
                      {panel.rows.map((row) => (
                        <div key={row.key}>
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {panel.description ? <p>{panel.description}</p> : null}
                  {panel.code ? <code>{panel.code}</code> : null}
                </section>
              ))}
            </div>
          </section>
        ) : null}

        {profileWorkspaceModeView.showStreamBuilderWorkspace ? (
          <>
            <details
              className={pcapImportPanelView.detailsClassName}
              aria-label={pcapImportPanelView.detailsAriaLabel}
              open={pcapImportExpanded}
              onToggle={(event) => setPcapImportExpanded(event.currentTarget.open)}
            >
              <summary className={pcapImportPanelView.summaryClassName}>
                <strong>{pcapImportPanelView.summaryTitle}</strong>
                {pcapImportSummary.map((item) => (
                  <span key={item.key}>{item.label}</span>
                ))}
              </summary>
              <div className={pcapImportPanelView.bodyClassName}>
                <label>
                  {pcapImportPanelView.namePrefix.label}
                  <input
                    aria-label={pcapImportPanelView.namePrefix.inputAriaLabel}
                    onChange={(event) => pcapImportHandlers.changeNamePrefix(event.target.value)}
                    value={pcapImportEditor.namePrefix}
                  />
                </label>
                <div
                  className={pcapImportPanelView.ipv4Rewrite.className}
                  aria-label={pcapImportPanelView.ipv4Rewrite.ariaLabel}
                >
                  <strong>{pcapImportPanelView.ipv4Rewrite.title}</strong>
                  <label className={pcapImportPanelView.ipv4Rewrite.checkClassName}>
                    <input
                      aria-label={pcapImportPanelView.ipv4Rewrite.source.checkboxAriaLabel}
                      checked={pcapImportEditor.source.checked}
                      onChange={(event) => pcapImportHandlers.changeSourceRewrite(event.target.checked)}
                      type="checkbox"
                    />
                    {pcapImportPanelView.ipv4Rewrite.source.label}
                  </label>
                  <input
                    aria-label={pcapImportPanelView.ipv4Rewrite.source.addressAriaLabel}
                    disabled={pcapImportEditor.source.controlsDisabled}
                    onChange={(event) => pcapImportHandlers.changeSourceAddress(event.target.value)}
                    value={pcapImportEditor.source.address}
                  />
                  <select
                    aria-label={pcapImportPanelView.ipv4Rewrite.source.modeAriaLabel}
                    disabled={pcapImportEditor.source.controlsDisabled}
                    onChange={(event) =>
                      pcapImportHandlers.changeSourceMode(event.target.value as ProfilePcapImportOptions["src_mode"])
                    }
                    value={pcapImportEditor.source.mode}
                  >
                    {ipv4AddressModes.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                  <input
                    aria-label={pcapImportPanelView.ipv4Rewrite.source.countAriaLabel}
                    disabled={pcapImportEditor.source.controlsDisabled}
                    inputMode="numeric"
                    onChange={(event) => pcapImportHandlers.changeSourceCount(event.target.value)}
                    value={pcapImportEditor.source.countValue}
                  />
                  <span aria-hidden="true" className={pcapImportPanelView.ipv4Rewrite.spacerClassName} />
                  <label className={pcapImportPanelView.ipv4Rewrite.checkClassName}>
                    <input
                      aria-label={pcapImportPanelView.ipv4Rewrite.destination.checkboxAriaLabel}
                      checked={pcapImportEditor.destination.checked}
                      onChange={(event) => pcapImportHandlers.changeDestinationRewrite(event.target.checked)}
                      type="checkbox"
                    />
                    {pcapImportPanelView.ipv4Rewrite.destination.label}
                  </label>
                  <input
                    aria-label={pcapImportPanelView.ipv4Rewrite.destination.addressAriaLabel}
                    disabled={pcapImportEditor.destination.controlsDisabled}
                    onChange={(event) => pcapImportHandlers.changeDestinationAddress(event.target.value)}
                    value={pcapImportEditor.destination.address}
                  />
                  <select
                    aria-label={pcapImportPanelView.ipv4Rewrite.destination.modeAriaLabel}
                    disabled={pcapImportEditor.destination.controlsDisabled}
                    onChange={(event) =>
                      pcapImportHandlers.changeDestinationMode(event.target.value as ProfilePcapImportOptions["dst_mode"])
                    }
                    value={pcapImportEditor.destination.mode}
                  >
                    {ipv4AddressModes.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                  <input
                    aria-label={pcapImportPanelView.ipv4Rewrite.destination.countAriaLabel}
                    disabled={pcapImportEditor.destination.controlsDisabled}
                    inputMode="numeric"
                    onChange={(event) => pcapImportHandlers.changeDestinationCount(event.target.value)}
                    value={pcapImportEditor.destination.countValue}
                  />
                </div>
                <div
                  className={pcapImportPanelView.rateMode.className}
                  role="radiogroup"
                  aria-label={pcapImportPanelView.rateMode.ariaLabel}
                >
                  <span className={pcapImportPanelView.rateMode.radioClassName}>
                    <input
                      aria-label={pcapImportPanelView.rateMode.speedup.modeAriaLabel}
                      checked={pcapImportEditor.rate.speedupChecked}
                      onChange={() => pcapImportHandlers.changeRateMode("speedup")}
                      type="radio"
                    />
                    {pcapImportPanelView.rateMode.speedup.label}
                  </span>
                  <input
                    aria-label={pcapImportPanelView.rateMode.speedup.inputAriaLabel}
                    disabled={pcapImportEditor.rate.speedupDisabled}
                    inputMode="decimal"
                    onChange={(event) => pcapImportHandlers.changeSpeedup(event.target.value)}
                    value={pcapImportEditor.rate.speedupValue}
                  />
                  <span className={pcapImportPanelView.rateMode.radioClassName}>
                    <input
                      aria-label={pcapImportPanelView.rateMode.ipg.modeAriaLabel}
                      checked={pcapImportEditor.rate.ipgChecked}
                      onChange={() => pcapImportHandlers.changeRateMode("ipg")}
                      type="radio"
                    />
                    {pcapImportPanelView.rateMode.ipg.label}
                  </span>
                  <input
                    aria-label={pcapImportPanelView.rateMode.ipg.inputAriaLabel}
                    disabled={pcapImportEditor.rate.ipgDisabled}
                    inputMode="decimal"
                    onChange={(event) => pcapImportHandlers.changeIpg(event.target.value)}
                    value={pcapImportEditor.rate.ipgValue}
                  />
                </div>
                <label className={pcapImportPanelView.loop.className}>
                  {pcapImportPanelView.loop.label}
                  <input
                    aria-label={pcapImportPanelView.loop.inputAriaLabel}
                    inputMode="numeric"
                    onChange={(event) => pcapImportHandlers.changeLoopCount(event.target.value)}
                    value={pcapImportEditor.loopCountValue}
                  />
                </label>
              </div>
            </details>
            <div className={streamCommandToolbarView.className} aria-label={streamCommandToolbarView.ariaLabel}>
              <input
                accept={pcapImportPanelView.fileInput.accept}
                aria-label={pcapImportPanelView.fileInput.ariaLabel}
                className={pcapImportPanelView.fileInput.className}
                onChange={(event) => handleImportPcapFileChange(event.target.files)}
                ref={importPcapInputRef}
                type="file"
              />
              {streamCommandButtons.map(({ label, icon: Icon, action, buttonClassName, disabled, iconSize }) => (
                <button
                  className={buttonClassName}
                  disabled={disabled}
                  key={label}
                  onClick={() => runStreamCommand(action)}
                  title={label}
                  type="button"
                >
                  <Icon aria-hidden="true" size={iconSize} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className={streamTable.wrapperClassName}>
              <table aria-label="Profile streams" className={streamTable.tableClassName}>
                <thead>
                  <tr>
                    {streamTable.columns.map((column) => (
                      <th aria-label={column.ariaLabel} key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {streamTable.rows.map((streamRow) => (
                    <tr
                      className={streamRow.className}
                      key={streamRow.key}
                      onClick={() => onSelectedStreamIndexChange(streamRow.index)}
                    >
                      <td>
                        <label className="stream-row-selector">
                          <input
                            aria-label={`Select stream ${streamRow.displayIndex}: ${streamRow.name}`}
                            checked={streamRow.selected}
                            name="profile-stream-selection"
                            onChange={() => onSelectedStreamIndexChange(streamRow.index)}
                            type="radio"
                          />
                        </label>
                      </td>
                      <td>{streamRow.displayIndex}</td>
                      <td>{streamRow.name}</td>
                      <td>
                        <span>{streamRow.packetType}</span>
                        {streamRow.advancedBadge ? (
                          <span className={streamRow.advancedBadge.className}>
                            {streamRow.advancedBadge.label}
                          </span>
                        ) : null}
                      </td>
                      <td>{streamRow.length}</td>
                      <td>{streamRow.mode}</td>
                      <td>{streamRow.rate}</td>
                      <td>{streamRow.nextStream}</td>
                    </tr>
                  ))}
                  {streamTable.rows.length === 0 ? (
                    <tr>
                      <td colSpan={streamTable.emptyRow.colSpan}>{streamTable.emptyRow.label}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {profileWorkspaceModeView.showStreamBuilderWorkspace && selectedStream ? (
          <section className={streamEditorTabsView.paneClassName} aria-label={streamEditorTabsView.paneAriaLabel} ref={streamBuilderRef}>
            <div className={streamEditorTabsView.rowClassName}>
              <div
                className={streamEditorTabsView.tabListClassName}
                role={streamEditorTabsView.tabListRole}
                aria-label={streamEditorTabsView.tabListAriaLabel}
              >
                {streamEditorTabsView.tabs.map((tabRow) => (
                  <button
                    aria-controls={streamEditorPanelId(tabRow.tab)}
                    aria-selected={tabRow.ariaSelected}
                    className={tabRow.className}
                    disabled={tabRow.disabled}
                    id={streamEditorTabId(tabRow.tab)}
                    key={tabRow.key}
                    onClick={() => selectEditorTab(tabRow.tab)}
                    onKeyDown={(event) => handleEditorTabKeyDown(event, tabRow.tab)}
                    ref={(element) => {
                      editorTabRefs.current[tabRow.tab] = element;
                    }}
                    role={tabRow.role}
                    tabIndex={tabRow.ariaSelected && !tabRow.disabled ? 0 : -1}
                    type="button"
                  >
                    {tabRow.label}
                  </button>
                ))}
              </div>
              <button
                className={streamEditorTabsView.modeButton.className}
                disabled={streamEditorTabsView.modeButton.disabled}
                onClick={switchAdvancedEditorMode}
                title={streamEditorTabsView.modeButton.title}
                type="button"
              >
                {streamEditorTabsView.modeButton.label}
              </button>
            </div>

            {streamEditorTabsView.tabs.filter((tabRow) => !tabRow.ariaSelected).map((tabRow) => (
              <div
                aria-labelledby={streamEditorTabId(tabRow.tab)}
                hidden
                id={streamEditorPanelId(tabRow.tab)}
                key={tabRow.key}
                role="tabpanel"
              />
            ))}
            <div
              aria-labelledby={streamEditorTabId(effectiveEditorTab)}
              className="stream-editor-tab-panel"
              id={streamEditorPanelId(effectiveEditorTab)}
              role="tabpanel"
              tabIndex={0}
            >

            {selectedStreamAdvanced && effectiveEditorTab === "Stream Properties" ? (
              <AdvancedStreamReadOnlyPanel stream={selectedStream} />
            ) : null}

            {!selectedStreamAdvanced && streamPropertiesView && effectiveEditorTab === "Stream Properties" ? (
              <>
                <div className="stream-properties-grid">
                  <fieldset>
                    <legend>Mode</legend>
                    {streamPropertiesView.modeOptions.map((modeOption) => (
                      <label key={modeOption.mode}>
                        <input
                          checked={modeOption.checked}
                          name="stream-mode"
                          onChange={() => handleStreamModeChange(modeOption.mode)}
                          type="radio"
                        />
                        {modeOption.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>Misc</legend>
                    <label>
                      <input
                        checked={streamPropertiesView.enabledChecked}
                        onChange={(event) => streamPropertiesHandlers.changeStreamEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      Enabled
                    </label>
                    <label>
                      <input
                        checked={streamPropertiesView.selfStartChecked}
                        onChange={(event) => streamPropertiesHandlers.changeSelfStart(event.target.checked)}
                        type="checkbox"
                      />
                      Self start
                    </label>
                  </fieldset>

                  <fieldset disabled={streamPropertiesView.numbersDisabled}>
                    <legend>Numbers</legend>
                    <label>
                      Number of Packets
                      <input
                        disabled={streamPropertiesView.totalPacketsDisabled}
                        min={1}
                        onChange={(event) => streamPropertiesHandlers.changeTotalPackets(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.totalPacketsValue}
                      />
                    </label>
                    <label>
                      Number of Burst
                      <input
                        disabled={streamPropertiesView.burstCountDisabled}
                        min={1}
                        onChange={(event) => streamPropertiesHandlers.changeBurstCount(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.burstCountValue}
                      />
                    </label>
                    <label>
                      Packets per Burst
                      <input
                        disabled={streamPropertiesView.packetsPerBurstDisabled}
                        min={1}
                        onChange={(event) => streamPropertiesHandlers.changePacketsPerBurst(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.packetsPerBurstValue}
                      />
                    </label>
                  </fieldset>

                  <fieldset>
                    <legend>Rate</legend>
                    <label>
                      <select
                        aria-label="Stream rate type"
                        onChange={(event) =>
                          streamPropertiesHandlers.changeRateType(event.target.value as ProfileWorkbenchStream["rate_type"])
                        }
                        value={streamPropertiesView.rateType}
                      >
                        {streamPropertiesView.rateOptions.map((rateOption) => (
                          <option key={rateOption.value} value={rateOption.value}>{rateOption.label}</option>
                        ))}
                      </select>
                      <input
                        aria-label="Stream rate value"
                        min={0}
                        onChange={(event) => streamPropertiesHandlers.changeRateValue(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.rateValue}
                      />
                    </label>
                  </fieldset>

                  <fieldset className="after-stream-fieldset" disabled={streamPropertiesView.afterStream.disabled}>
                    <legend>After this stream</legend>
                    <label>
                      <input
                        checked={streamPropertiesView.afterStream.stopChecked}
                        name="next-stream-mode"
                        onChange={streamPropertiesHandlers.changeAfterStreamStop}
                        type="radio"
                      />
                      Stop
                    </label>
                    <label>
                      <input
                        checked={streamPropertiesView.afterStream.gotoChecked}
                        name="next-stream-mode"
                        onChange={streamPropertiesHandlers.changeAfterStreamGoto}
                        type="radio"
                      />
                      Goto Stream
                    </label>
                    <select
                      aria-label="Next Stream"
                      disabled={streamPropertiesView.afterStream.selectDisabled}
                      onChange={(event) => streamPropertiesHandlers.changeNextStream(Number(event.target.value))}
                      value={streamPropertiesView.afterStream.selectValue}
                    >
                      {streamPropertiesView.afterStream.options.map((option) => (
                        <option key={option.key} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label>
                      <input
                        checked={streamPropertiesView.afterStream.loopChecked}
                        disabled={streamPropertiesView.afterStream.loopControlDisabled}
                        onChange={(event) =>
                          streamPropertiesHandlers.changeLoopActionCountEnabled(event.target.checked)
                        }
                        type="checkbox"
                      />
                      Time in loop
                    </label>
                    <input
                      aria-label="Time in loop"
                      disabled={streamPropertiesView.afterStream.loopInputDisabled}
                      min={0}
                      onChange={(event) => streamPropertiesHandlers.changeLoopActionCount(inputNumberValue(event))}
                      type="number"
                      value={numberValue(selectedStream.action_count)}
                    />
                  </fieldset>
                </div>

                <div className="stream-detail-grid">
                  <fieldset>
                    <legend>Gaps(in seconds)</legend>
                    <div className="stream-gap-strip">
                      <span>ISG</span>
                      <span>PKT1</span>
                      <span>IPG</span>
                      <span>PKT2</span>
                    </div>
                    <label>
                      ISG
                      <input
                        min={0}
                        onChange={(event) => streamPropertiesHandlers.changeIsg(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.timing.isgValue}
                      />
                    </label>
                    <label>
                      IBG
                      <input
                        min={0}
                        disabled={streamPropertiesView.timing.ibgDisabled}
                        onChange={(event) => streamPropertiesHandlers.changeIbg(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.timing.ibgValue}
                      />
                    </label>
                    {streamPropertiesView.timing.showIpg ? (
                      <label>
                        IPG
                        <input aria-label="IPG" readOnly value={streamPropertiesView.timing.ipgValue} />
                      </label>
                    ) : null}
                  </fieldset>

                  <fieldset>
                    <legend>RX Stats</legend>
                    <label>
                      <input
                        checked={streamPropertiesView.rxStats.flowStatsChecked}
                        disabled={streamPropertiesView.rxStats.disabled}
                        onChange={(event) => streamPropertiesHandlers.changeFlowStatsEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      Enabled
                    </label>
                    <label>
                      PG ID
                      <input
                        disabled={streamPropertiesView.rxStats.disabled}
                        min={0}
                        onChange={(event) => streamPropertiesHandlers.changePgId(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.rxStats.pgIdValue}
                      />
                    </label>
                    <label>
                      <input
                        checked={streamPropertiesView.rxStats.latencyChecked}
                        disabled={streamPropertiesView.rxStats.disabled}
                        onChange={(event) => streamPropertiesHandlers.changeLatencyEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      Latency enabled
                    </label>
                  </fieldset>

                  <fieldset>
                    <legend>Packet</legend>
                    <label>
                      Name
                      <input
                        onChange={(event) => streamPropertiesHandlers.changeStreamName(event.target.value)}
                        value={streamPropertiesView.packet.name}
                      />
                    </label>
                    <label>
                      Packet Type
                      <select
                        disabled={streamPropertiesView.packet.packetTypeDisabled}
                        onChange={(event) => handlePacketTypeChange(event.target.value as ProfileWorkbenchStream["packet_type"])}
                        value={streamPropertiesView.packet.packetType}
                      >
                        {streamPropertiesView.packet.packetTypeOptions.map((packetTypeOption) => (
                          <option key={packetTypeOption.value} value={packetTypeOption.value}>{packetTypeOption.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Length
                      <input
                        disabled={streamPropertiesView.packet.frameLengthDisabled}
                        max={9216}
                        min={64}
                        onChange={(event) => streamPropertiesHandlers.changeFrameLength(inputNumberValue(event))}
                        type="number"
                        value={streamPropertiesView.packet.frameLengthValue}
                      />
                    </label>
                  </fieldset>
                </div>
              </>
            ) : null}

            {!selectedStreamAdvanced && frameLengthView && protocolSelectionView && effectiveEditorTab === "Protocol Selection" ? (
              <div className="protocol-selection-pane">
                <div className="frame-length-row" role="group" aria-label="Frame length (including FCS)">
                  <span className="frame-length-heading">Frame length (including FCS)</span>
                  <label className="frame-length-control frame-length-control--mode">
                    <span className="visually-hidden">Type</span>
                    <select
                      aria-label="Frame length type"
                      disabled={frameLengthView.typeDisabled}
                      onChange={(event) =>
                        handleFrameLengthTypeChange(event.target.value as ProfileWorkbenchStream["frame_length_type"])
                      }
                      value={frameLengthView.frameLengthType}
                    >
                      {frameLengthView.typeOptions.map((frameLengthTypeOption) => (
                        <option key={frameLengthTypeOption.value} value={frameLengthTypeOption.value}>{frameLengthTypeOption.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="frame-length-control frame-length-control--length">
                    <span className="visually-hidden">Length</span>
                    <input
                      aria-label="Frame length"
                      disabled={frameLengthView.lengthDisabled}
                      max={9216}
                      min={64}
                      onChange={(event) => streamPropertiesHandlers.changeFrameLength(inputNumberValue(event))}
                      type="number"
                      value={frameLengthView.lengthValue}
                    />
                  </label>
                  <label className="frame-length-control frame-length-control--bounded frame-length-control--min">
                    <span>Min</span>
                    <input
                      aria-label="Minimum frame length"
                      disabled={frameLengthView.minDisabled}
                      max={9216}
                      min={64}
                      onChange={(event) => streamPropertiesHandlers.changeFrameLengthMin(inputNumberValue(event))}
                      type="number"
                      value={frameLengthView.minValue}
                    />
                  </label>
                  <label className="frame-length-control frame-length-control--bounded frame-length-control--max">
                    <span>Max</span>
                    <input
                      aria-label="Maximum frame length"
                      disabled={frameLengthView.maxDisabled}
                      max={9216}
                      min={64}
                      onChange={(event) => streamPropertiesHandlers.changeFrameLengthMax(inputNumberValue(event))}
                      type="number"
                      value={frameLengthView.maxValue}
                    />
                  </label>
                </div>

                <div className="protocol-choice-grid">
                  <fieldset>
                    <legend>VLAN</legend>
                    {protocolSelectionView.vlanOptions.map((option) => (
                      <label key={option.label}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="vlan-selection"
                          onChange={() => protocolSelectionHandlers.changeVlanSelection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>MPLS</legend>
                    {protocolSelectionView.mplsOptions.map((option) => (
                      <label key={option.label}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="mpls-selection"
                          onChange={() => protocolSelectionHandlers.changeMplsSelection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>Tunnel</legend>
                    {protocolSelectionView.tunnelOptions.map((option) => (
                      <label key={option.value}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="tunnel-selection"
                          onChange={() => protocolSelectionHandlers.changeTunnelSelection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>L3</legend>
                    {protocolSelectionView.l3Options.map((option) => (
                      <label key={option.value}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="l3-selection"
                          onChange={() => protocolSelectionHandlers.changeL3Selection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>L4</legend>
                    {protocolSelectionView.l4Options.map((option) => (
                      <label key={option.value}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="l4-selection"
                          onChange={() => protocolSelectionHandlers.changeL4Selection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>

                  <fieldset>
                    <legend>Payload</legend>
                    {protocolSelectionView.payloadOptions.map((option) => (
                      <label key={option.label}>
                        <input
                          checked={option.checked}
                          disabled={option.disabled}
                          name="payload-selection"
                          onChange={() => protocolSelectionHandlers.changePayloadSelection(option.value)}
                          type="radio"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                </div>
              </div>
            ) : null}

            {!selectedStreamAdvanced && effectiveEditorTab === "Protocol Data" && mediaAccessView ? (
              <div className="protocol-data-pane">
                <details open>
                  <summary>Media Access Protocol</summary>
                  <div className="protocol-data-form protocol-data-form--compact">
                    <label>
                      <input
                        checked={mediaAccessView.etherTypeOverrideChecked}
                        onChange={(event) => protocolDataLinkHandlers.changeEtherTypeOverride(event.target.checked)}
                        type="checkbox"
                      />
                      Ethernet Type
                    </label>
                    <label>
                      Type
                      <input
                        aria-label="Ethernet Type value"
                        disabled={mediaAccessView.typeValueDisabled}
                        maxLength={4}
                        onChange={(event) => protocolDataLinkHandlers.changeEtherType(event.target.value)}
                        value={mediaAccessView.etherTypeValue}
                      />
                    </label>
                  </div>
                </details>
                {vlanView?.enabled ? (
                  <details open>
                    <summary>802.1Q VLAN</summary>
                    <div className="protocol-data-form">
                      <label>
                        <input
                          checked={vlanView.tpidOverrideChecked}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanTpidOverride(event.target.checked)}
                          type="checkbox"
                        />
                        Override TPID
                      </label>
                      <label>
                        TPID
                        <input
                          aria-label="VLAN TPID"
                          disabled={vlanView.tpidDisabled}
                          maxLength={4}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanTpid(event.target.value)}
                          value={vlanView.tpidValue}
                        />
                      </label>
                      <label>
                        Priority
                        <select
                          aria-label="VLAN priority"
                          onChange={(event) => protocolDataLinkHandlers.changeVlanPriority(inputNumberValue(event))}
                          value={vlanView.priorityValue}
                        >
                          {vlanView.priorityOptions.map((priority) => (
                            <option key={priority} value={priority}>{priority}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Priority Mode
                        <select
                          aria-label="VLAN priority mode"
                          onChange={(event) =>
                            protocolDataLinkHandlers.changeVlanPriorityMode(
                              event.target.value as ProfileWorkbenchStream["vlan_priority_mode"]
                            )
                          }
                          value={vlanView.priorityMode}
                        >
                          {vlanView.priorityModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Priority Count
                        <input
                          aria-label="VLAN priority count"
                          disabled={vlanView.priorityCountDisabled}
                          max={8}
                          min={2}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanPriorityCount(inputNumberValue(event))}
                          type="number"
                          value={vlanView.priorityCountValue}
                        />
                      </label>
                      <label>
                        Priority Step
                        <input
                          aria-label="VLAN priority step"
                          disabled={vlanView.priorityStepDisabled}
                          max={7}
                          min={1}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanPriorityStep(inputNumberValue(event))}
                          type="number"
                          value={vlanView.priorityStepValue}
                        />
                      </label>
                      <label>
                        CFI/DEI
                        <select
                          aria-label="VLAN CFI DEI"
                          onChange={(event) => protocolDataLinkHandlers.changeVlanCfi(inputNumberValue(event))}
                          value={vlanView.cfiValue}
                        >
                          {vlanView.cfiOptions.map((cfi) => (
                            <option key={cfi} value={cfi}>{cfi}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        VLAN
                        <input
                          aria-label="VLAN ID"
                          max={4094}
                          min={0}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanId(inputNumberValue(event))}
                          type="number"
                          value={vlanView.vlanIdValue}
                        />
                      </label>
                      <label>
                        Mode
                        <select
                          aria-label="VLAN ID mode"
                          onChange={(event) =>
                            protocolDataLinkHandlers.changeVlanIdMode(
                              event.target.value as ProfileWorkbenchStream["vlan_id_mode"]
                            )
                          }
                          value={vlanView.idMode}
                        >
                          {vlanView.idModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Count
                        <input
                          aria-label="VLAN ID count"
                          disabled={vlanView.idCountDisabled}
                          max={4095}
                          min={2}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanIdCount(inputNumberValue(event))}
                          type="number"
                          value={vlanView.idCountValue}
                        />
                      </label>
                      <label>
                        Step
                        <input
                          aria-label="VLAN ID step"
                          disabled={vlanView.idStepDisabled}
                          max={4094}
                          min={1}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanIdStep(inputNumberValue(event))}
                          type="number"
                          value={vlanView.idStepValue}
                        />
                      </label>
                      <label>
                        Type
                        <input readOnly value={vlanView.payloadTypeValue} />
                      </label>
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="Enable VLAN inner tag"
                          checked={vlanView.innerTagChecked}
                          onChange={(event) => protocolDataLinkHandlers.changeVlanInnerSelection(event.target.checked)}
                          type="checkbox"
                        />
                        Second tag
                      </label>
                      {vlanInnerTagView?.enabled ? (
                        <>
                          <label>
                            <input
                              checked={vlanInnerTagView.tpidOverrideChecked}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerTpidOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override Inner TPID
                          </label>
                          <label>
                            Inner TPID
                            <input
                              aria-label="VLAN inner TPID"
                              disabled={vlanInnerTagView.tpidDisabled}
                              maxLength={4}
                              onChange={(event) => protocolDataLinkHandlers.changeVlanInnerTpid(event.target.value)}
                              value={vlanInnerTagView.tpidValue}
                            />
                          </label>
                          <label>
                            Inner Priority
                            <select
                              aria-label="VLAN inner priority"
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerPriority(inputNumberValue(event))
                              }
                              value={vlanInnerTagView.priorityValue}
                            >
                              {vlanInnerTagView.priorityOptions.map((priority) => (
                                <option key={priority} value={priority}>{priority}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inner Priority Mode
                            <select
                              aria-label="VLAN inner priority mode"
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerPriorityMode(
                                  event.target.value as ProfileWorkbenchStream["vlan2_priority_mode"]
                                )
                              }
                              value={vlanInnerTagView.priorityMode}
                            >
                              {vlanInnerTagView.priorityModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inner Priority Count
                            <input
                              aria-label="VLAN inner priority count"
                              disabled={vlanInnerTagView.priorityCountDisabled}
                              max={8}
                              min={2}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerPriorityCount(inputNumberValue(event))
                              }
                              type="number"
                              value={vlanInnerTagView.priorityCountValue}
                            />
                          </label>
                          <label>
                            Inner Priority Step
                            <input
                              aria-label="VLAN inner priority step"
                              disabled={vlanInnerTagView.priorityStepDisabled}
                              max={7}
                              min={1}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerPriorityStep(inputNumberValue(event))
                              }
                              type="number"
                              value={vlanInnerTagView.priorityStepValue}
                            />
                          </label>
                          <label>
                            Inner CFI/DEI
                            <select
                              aria-label="VLAN inner CFI DEI"
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerCfi(inputNumberValue(event))
                              }
                              value={vlanInnerTagView.cfiValue}
                            >
                              {vlanInnerTagView.cfiOptions.map((cfi) => (
                                <option key={cfi} value={cfi}>{cfi}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inner VLAN
                            <input
                              aria-label="VLAN inner ID"
                              max={4094}
                              min={0}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerId(inputNumberValue(event))
                              }
                              type="number"
                              value={vlanInnerTagView.vlanIdValue}
                            />
                          </label>
                          <label>
                            Inner Mode
                            <select
                              aria-label="VLAN inner ID mode"
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerIdMode(
                                  event.target.value as ProfileWorkbenchStream["vlan2_id_mode"]
                                )
                              }
                              value={vlanInnerTagView.idMode}
                            >
                              {vlanInnerTagView.idModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inner Count
                            <input
                              aria-label="VLAN inner ID count"
                              disabled={vlanInnerTagView.idCountDisabled}
                              max={4095}
                              min={2}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerIdCount(inputNumberValue(event))
                              }
                              type="number"
                              value={vlanInnerTagView.idCountValue}
                            />
                          </label>
                          <label>
                            Inner Step
                            <input
                              aria-label="VLAN inner ID step"
                              disabled={vlanInnerTagView.idStepDisabled}
                              max={4094}
                              min={1}
                              onChange={(event) =>
                                protocolDataLinkHandlers.changeVlanInnerIdStep(inputNumberValue(event))
                              }
                              type="number"
                              value={vlanInnerTagView.idStepValue}
                            />
                          </label>
                          <label>
                            Inner Type
                            <input readOnly value={vlanInnerTagView.payloadTypeValue} />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </details>
                ) : null}
                {mplsView?.enabled ? (
                  <details open>
                    <summary>Multiprotocol Label Switching</summary>
                    <div className="address-field-grid">
                      <span />
                      <span>Value</span>
                      <span>Mode</span>
                      <span>Count</span>
                      <span>Step</span>
                      <strong>Label</strong>
                      <input
                        aria-label="MPLS label"
                        max={1048575}
                        min={0}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsLabel(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.labelValue}
                      />
                      <select
                        aria-label="MPLS label mode"
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsLabelMode(event.target.value as ProfileWorkbenchStream["mpls_label_mode"])
                        }
                        value={mplsView.labelMode}
                      >
                        {mplsView.labelModeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="MPLS label count"
                        disabled={mplsView.labelCountDisabled}
                        max={1048576}
                        min={2}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsLabelCount(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.labelCountValue}
                      />
                      <input
                        aria-label="MPLS label step"
                        disabled={mplsView.labelStepDisabled}
                        max={1048575}
                        min={1}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsLabelStep(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.labelStepValue}
                      />
                      <strong>Traffic class</strong>
                      <select
                        aria-label="MPLS traffic class"
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTrafficClass(inputNumberValue(event))
                        }
                        value={mplsView.trafficClassValue}
                      >
                        {mplsView.trafficClassOptions.map((trafficClass) => (
                          <option key={trafficClass} value={trafficClass}>{trafficClass}</option>
                        ))}
                      </select>
                      <select
                        aria-label="MPLS traffic class mode"
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTrafficClassMode(event.target.value as ProfileWorkbenchStream["mpls_tc_mode"])
                        }
                        value={mplsView.trafficClassMode}
                      >
                        {mplsView.trafficClassModeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="MPLS traffic class count"
                        disabled={mplsView.trafficClassCountDisabled}
                        max={8}
                        min={2}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTrafficClassCount(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.trafficClassCountValue}
                      />
                      <input
                        aria-label="MPLS traffic class step"
                        disabled={mplsView.trafficClassStepDisabled}
                        max={7}
                        min={1}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTrafficClassStep(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.trafficClassStepValue}
                      />
                      <strong>TTL</strong>
                      <input
                        aria-label="MPLS TTL"
                        max={255}
                        min={0}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTtl(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.ttlValue}
                      />
                      <select
                        aria-label="MPLS TTL mode"
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTtlMode(event.target.value as ProfileWorkbenchStream["mpls_ttl_mode"])
                        }
                        value={mplsView.ttlMode}
                      >
                        {mplsView.ttlModeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="MPLS TTL count"
                        disabled={mplsView.ttlCountDisabled}
                        max={256}
                        min={2}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTtlCount(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.ttlCountValue}
                      />
                      <input
                        aria-label="MPLS TTL step"
                        disabled={mplsView.ttlStepDisabled}
                        max={255}
                        min={1}
                        onChange={(event) =>
                          protocolDataMplsHandlers.changeMplsTtlStep(inputNumberValue(event))
                        }
                        type="number"
                        value={mplsView.ttlStepValue}
                      />
                    </div>
                    <div className="protocol-data-form">
                      <label>
                        Bottom of stack
                        <input aria-label="MPLS bottom of stack" readOnly value={mplsView.bottomOfStackValue} />
                      </label>
                    </div>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="Second MPLS label enabled"
                          checked={mplsView.secondLabelChecked}
                          onChange={(event) =>
                            protocolDataMplsHandlers.changeMplsSecondLabelSelection(event.target.checked)
                          }
                          type="checkbox"
                        />
                        Second label
                      </label>
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="Third MPLS label enabled"
                          checked={mplsView.thirdLabelChecked}
                          disabled={mplsView.thirdLabelDisabled}
                          onChange={(event) =>
                            protocolDataMplsHandlers.changeMplsThirdLabelSelection(event.target.checked)
                          }
                          type="checkbox"
                        />
                        Third label
                      </label>
                    </div>
                    {mplsSecondLabelView?.enabled ? (
                      <>
                        <div className="address-field-grid">
                          <span />
                          <span>Value</span>
                          <span>Mode</span>
                          <span>Count</span>
                          <span>Step</span>
                          <strong>Label 2</strong>
                          <input
                            aria-label="Second MPLS label"
                            max={1048575}
                            min={0}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondLabel(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.labelValue}
                          />
                          <select
                            aria-label="Second MPLS label mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondLabelMode(event.target.value as ProfileWorkbenchStream["mpls_label2_mode"])
                            }
                            value={mplsSecondLabelView.labelMode}
                          >
                            {mplsSecondLabelView.labelModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Second MPLS label count"
                            disabled={mplsSecondLabelView.labelCountDisabled}
                            max={1048576}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondLabelCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.labelCountValue}
                          />
                          <input
                            aria-label="Second MPLS label step"
                            disabled={mplsSecondLabelView.labelStepDisabled}
                            max={1048575}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondLabelStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.labelStepValue}
                          />
                          <strong>TC 2</strong>
                          <select
                            aria-label="Second MPLS traffic class"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTrafficClass(inputNumberValue(event))
                            }
                            value={mplsSecondLabelView.trafficClassValue}
                          >
                            {mplsSecondLabelView.trafficClassOptions.map((trafficClass) => (
                              <option key={trafficClass} value={trafficClass}>{trafficClass}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Second MPLS traffic class mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTrafficClassMode(event.target.value as ProfileWorkbenchStream["mpls_label2_tc_mode"])
                            }
                            value={mplsSecondLabelView.trafficClassMode}
                          >
                            {mplsSecondLabelView.trafficClassModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Second MPLS traffic class count"
                            disabled={mplsSecondLabelView.trafficClassCountDisabled}
                            max={8}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTrafficClassCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.trafficClassCountValue}
                          />
                          <input
                            aria-label="Second MPLS traffic class step"
                            disabled={mplsSecondLabelView.trafficClassStepDisabled}
                            max={7}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTrafficClassStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.trafficClassStepValue}
                          />
                          <strong>TTL 2</strong>
                          <input
                            aria-label="Second MPLS TTL"
                            max={255}
                            min={0}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTtl(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.ttlValue}
                          />
                          <select
                            aria-label="Second MPLS TTL mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTtlMode(event.target.value as ProfileWorkbenchStream["mpls_label2_ttl_mode"])
                            }
                            value={mplsSecondLabelView.ttlMode}
                          >
                            {mplsSecondLabelView.ttlModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Second MPLS TTL count"
                            disabled={mplsSecondLabelView.ttlCountDisabled}
                            max={256}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTtlCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.ttlCountValue}
                          />
                          <input
                            aria-label="Second MPLS TTL step"
                            disabled={mplsSecondLabelView.ttlStepDisabled}
                            max={255}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsSecondTtlStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsSecondLabelView.ttlStepValue}
                          />
                        </div>
                        <div className="protocol-data-form">
                          <label>
                            Bottom of stack 2
                            <input aria-label="Second MPLS bottom of stack" readOnly value={mplsSecondLabelView.bottomOfStackValue} />
                          </label>
                        </div>
                      </>
                    ) : null}
                    {mplsThirdLabelView?.enabled ? (
                      <>
                        <div className="address-field-grid">
                          <span />
                          <span>Value</span>
                          <span>Mode</span>
                          <span>Count</span>
                          <span>Step</span>
                          <strong>Label 3</strong>
                          <input
                            aria-label="Third MPLS label"
                            max={1048575}
                            min={0}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdLabel(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.labelValue}
                          />
                          <select
                            aria-label="Third MPLS label mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdLabelMode(event.target.value as ProfileWorkbenchStream["mpls_label3_mode"])
                            }
                            value={mplsThirdLabelView.labelMode}
                          >
                            {mplsThirdLabelView.labelModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Third MPLS label count"
                            disabled={mplsThirdLabelView.labelCountDisabled}
                            max={1048576}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdLabelCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.labelCountValue}
                          />
                          <input
                            aria-label="Third MPLS label step"
                            disabled={mplsThirdLabelView.labelStepDisabled}
                            max={1048575}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdLabelStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.labelStepValue}
                          />
                          <strong>TC 3</strong>
                          <select
                            aria-label="Third MPLS traffic class"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTrafficClass(inputNumberValue(event))
                            }
                            value={mplsThirdLabelView.trafficClassValue}
                          >
                            {mplsThirdLabelView.trafficClassOptions.map((trafficClass) => (
                              <option key={trafficClass} value={trafficClass}>{trafficClass}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Third MPLS traffic class mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTrafficClassMode(event.target.value as ProfileWorkbenchStream["mpls_label3_tc_mode"])
                            }
                            value={mplsThirdLabelView.trafficClassMode}
                          >
                            {mplsThirdLabelView.trafficClassModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Third MPLS traffic class count"
                            disabled={mplsThirdLabelView.trafficClassCountDisabled}
                            max={8}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTrafficClassCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.trafficClassCountValue}
                          />
                          <input
                            aria-label="Third MPLS traffic class step"
                            disabled={mplsThirdLabelView.trafficClassStepDisabled}
                            max={7}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTrafficClassStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.trafficClassStepValue}
                          />
                          <strong>TTL 3</strong>
                          <input
                            aria-label="Third MPLS TTL"
                            max={255}
                            min={0}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTtl(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.ttlValue}
                          />
                          <select
                            aria-label="Third MPLS TTL mode"
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTtlMode(event.target.value as ProfileWorkbenchStream["mpls_label3_ttl_mode"])
                            }
                            value={mplsThirdLabelView.ttlMode}
                          >
                            {mplsThirdLabelView.ttlModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Third MPLS TTL count"
                            disabled={mplsThirdLabelView.ttlCountDisabled}
                            max={256}
                            min={2}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTtlCount(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.ttlCountValue}
                          />
                          <input
                            aria-label="Third MPLS TTL step"
                            disabled={mplsThirdLabelView.ttlStepDisabled}
                            max={255}
                            min={1}
                            onChange={(event) =>
                              protocolDataMplsHandlers.changeMplsThirdTtlStep(inputNumberValue(event))
                            }
                            type="number"
                            value={mplsThirdLabelView.ttlStepValue}
                          />
                        </div>
                        <div className="protocol-data-form">
                          <label>
                            Bottom of stack 3
                            <input aria-label="Third MPLS bottom of stack" readOnly value={mplsThirdLabelView.bottomOfStackValue} />
                          </label>
                        </div>
                      </>
                    ) : null}
                  </details>
                ) : null}
                {vxlanView?.enabled ? (
                  <details open>
                    <summary>Virtual Extensible LAN</summary>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label>
                        UDP port
                        <input aria-label="VXLAN UDP port" readOnly value={vxlanView.udpPortValue} />
                      </label>
                      <label>
                        Inner IP
                        <select
                          aria-label="VXLAN inner IP version"
                          onChange={(event) =>
                            handleVxlanInnerIpVersionChange(event.target.value as ProfileWorkbenchStream["vxlan_inner_ip_version"])
                          }
                          value={vxlanView.innerIpVersion}
                        >
                          {vxlanView.innerIpVersionOptions.map((version) => (
                            <option key={version} value={version}>{version}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="address-field-grid">
                      <span />
                      <span>Value</span>
                      <span>Mode</span>
                      <span>Count</span>
                      <span>Step</span>
                      <strong>VNI</strong>
                      <input
                        aria-label="VXLAN VNI"
                        max={16777215}
                        min={0}
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanVni(inputNumberValue(event))
                        }
                        type="number"
                        value={vxlanView.vniValue}
                      />
                      <select
                        aria-label="VXLAN VNI mode"
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanVniMode(event.target.value as ProfileWorkbenchStream["vxlan_vni_mode"])
                        }
                        value={vxlanView.vniMode}
                      >
                        {vxlanView.vniModeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="VXLAN VNI count"
                        disabled={vxlanView.vniCountDisabled}
                        max={16777216}
                        min={2}
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanVniCount(inputNumberValue(event))
                        }
                        type="number"
                        value={vxlanView.vniCountValue}
                      />
                      <input
                        aria-label="VXLAN VNI step"
                        disabled={vxlanView.vniStepDisabled}
                        max={16777215}
                        min={1}
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanVniStep(inputNumberValue(event))
                        }
                        type="number"
                        value={vxlanView.vniStepValue}
                      />
                      {vxlanView.usesIpv6 ? (
                        <>
                          <strong>Inner IPv6 hop limit</strong>
                          <input
                            aria-label="VXLAN inner IPv6 hop limit"
                            max={255}
                            min={0}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv6HopLimit(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv6HopLimitValue}
                          />
                          <select
                            aria-label="VXLAN inner IPv6 hop limit mode"
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv6HopLimitMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv6_hop_limit_mode"])
                            }
                            value={vxlanView.innerIpv6HopLimitMode}
                          >
                            {vxlanView.innerIpv6HopLimitModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="VXLAN inner IPv6 hop limit count"
                            disabled={vxlanView.innerIpv6HopLimitCountDisabled}
                            max={256}
                            min={2}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv6HopLimitCount(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv6HopLimitCountValue}
                          />
                          <input
                            aria-label="VXLAN inner IPv6 hop limit step"
                            disabled={vxlanView.innerIpv6HopLimitStepDisabled}
                            max={255}
                            min={1}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv6HopLimitStep(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv6HopLimitStepValue}
                          />
                        </>
                      ) : (
                        <>
                          <strong>Inner IPv4 TTL</strong>
                          <input
                            aria-label="VXLAN inner IPv4 TTL"
                            max={255}
                            min={0}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv4Ttl(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv4TtlValue}
                          />
                          <select
                            aria-label="VXLAN inner IPv4 TTL mode"
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv4TtlMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv4_ttl_mode"])
                            }
                            value={vxlanView.innerIpv4TtlMode}
                          >
                            {vxlanView.innerIpv4TtlModeOptions.map((mode) => (
                              <option key={mode} value={mode}>{mode}</option>
                            ))}
                          </select>
                          <input
                            aria-label="VXLAN inner IPv4 TTL count"
                            disabled={vxlanView.innerIpv4TtlCountDisabled}
                            max={256}
                            min={2}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv4TtlCount(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv4TtlCountValue}
                          />
                          <input
                            aria-label="VXLAN inner IPv4 TTL step"
                            disabled={vxlanView.innerIpv4TtlStepDisabled}
                            max={255}
                            min={1}
                            onChange={(event) =>
                              protocolDataTunnelHandlers.changeVxlanInnerIpv4TtlStep(inputNumberValue(event))
                            }
                            type="number"
                            value={vxlanView.innerIpv4TtlStepValue}
                          />
                        </>
                      )}
                    </div>
                    <div className="address-field-grid">
                      <span />
                      <span>Address</span>
                      <span>Type</span>
                      <span />
                      <span />
                      <strong>Inner destination</strong>
                      <input
                        aria-label="VXLAN inner Ethernet destination"
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanInnerEtherDestination(event.target.value)
                        }
                        value={vxlanView.innerEtherDstValue}
                      />
                      <input
                        aria-label="VXLAN inner Ethernet type"
                        readOnly
                        value={vxlanView.innerEtherTypeValue}
                      />
                      <span />
                      <span />
                      <strong>Inner source</strong>
                      <input
                        aria-label="VXLAN inner Ethernet source"
                        onChange={(event) =>
                          protocolDataTunnelHandlers.changeVxlanInnerEtherSource(event.target.value)
                        }
                        value={vxlanView.innerEtherSrcValue}
                      />
                      <input
                        aria-label="VXLAN inner Ethernet protocol"
                        readOnly
                        value={vxlanView.innerEtherProtocolValue}
                      />
                      <span />
                      <span />
                    </div>
                    {vxlanView.usesIpv6 ? (
                      <div className="address-field-grid">
                        <span />
                        <span>Address</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner IPv6 source</strong>
                        <input
                          aria-label="VXLAN inner IPv6 source"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6Source(event.target.value)
                          }
                          value={vxlanView.innerIpv6SrcValue}
                        />
                        <select
                          aria-label="VXLAN inner IPv6 source mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6SourceMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv6_src_mode"])
                          }
                          value={vxlanView.innerIpv6SrcMode}
                        >
                          {vxlanView.innerIpv6AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner IPv6 source count"
                          disabled={vxlanView.innerIpv6SrcCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6SourceCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv6SrcCountValue}
                        />
                        <input
                          aria-label="VXLAN inner IPv6 source step"
                          disabled={vxlanView.innerIpv6SrcStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6SourceStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv6SrcStepValue}
                        />
                        <strong>Inner IPv6 destination</strong>
                        <input
                          aria-label="VXLAN inner IPv6 destination"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6Destination(event.target.value)
                          }
                          value={vxlanView.innerIpv6DstValue}
                        />
                        <select
                          aria-label="VXLAN inner IPv6 destination mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6DestinationMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv6_dst_mode"])
                          }
                          value={vxlanView.innerIpv6DstMode}
                        >
                          {vxlanView.innerIpv6AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner IPv6 destination count"
                          disabled={vxlanView.innerIpv6DstCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6DestinationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv6DstCountValue}
                        />
                        <input
                          aria-label="VXLAN inner IPv6 destination step"
                          disabled={vxlanView.innerIpv6DstStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv6DestinationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv6DstStepValue}
                        />
                      </div>
                    ) : (
                      <div className="address-field-grid">
                        <span />
                        <span>Address</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner IPv4 source</strong>
                        <input
                          aria-label="VXLAN inner IPv4 source"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4Source(event.target.value)
                          }
                          value={vxlanView.innerIpv4SrcValue}
                        />
                        <select
                          aria-label="VXLAN inner IPv4 source mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4SourceMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv4_src_mode"])
                          }
                          value={vxlanView.innerIpv4SrcMode}
                        >
                          {vxlanView.innerIpv4AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner IPv4 source count"
                          disabled={vxlanView.innerIpv4SrcCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4SourceCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv4SrcCountValue}
                        />
                        <input
                          aria-label="VXLAN inner IPv4 source step"
                          disabled={vxlanView.innerIpv4SrcStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4SourceStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv4SrcStepValue}
                        />
                        <strong>Inner IPv4 destination</strong>
                        <input
                          aria-label="VXLAN inner IPv4 destination"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4Destination(event.target.value)
                          }
                          value={vxlanView.innerIpv4DstValue}
                        />
                        <select
                          aria-label="VXLAN inner IPv4 destination mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4DestinationMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_ipv4_dst_mode"])
                          }
                          value={vxlanView.innerIpv4DstMode}
                        >
                          {vxlanView.innerIpv4AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner IPv4 destination count"
                          disabled={vxlanView.innerIpv4DstCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4DestinationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv4DstCountValue}
                        />
                        <input
                          aria-label="VXLAN inner IPv4 destination step"
                          disabled={vxlanView.innerIpv4DstStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerIpv4DestinationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerIpv4DstStepValue}
                        />
                      </div>
                    )}
                    <div className="protocol-data-form">
                      <div className="l4-port-grid">
                        <span />
                        <span>Port</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner UDP source</strong>
                        <input
                          aria-label="VXLAN inner UDP source port"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4SourcePort(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4SrcPortValue}
                        />
                        <select
                          aria-label="VXLAN inner UDP source port mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4SourcePortMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_l4_src_port_mode"])
                          }
                          value={vxlanView.innerL4SrcPortMode}
                        >
                          {vxlanView.innerL4PortModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner UDP source port count"
                          disabled={vxlanView.innerL4SrcPortCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4SourcePortCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4SrcPortCountValue}
                        />
                        <input
                          aria-label="VXLAN inner UDP source port step"
                          disabled={vxlanView.innerL4SrcPortStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4SourcePortStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4SrcPortStepValue}
                        />
                        <strong>Inner UDP destination</strong>
                        <input
                          aria-label="VXLAN inner UDP destination port"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4DestinationPort(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4DstPortValue}
                        />
                        <select
                          aria-label="VXLAN inner UDP destination port mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4DestinationPortMode(event.target.value as ProfileWorkbenchStream["vxlan_inner_l4_dst_port_mode"])
                          }
                          value={vxlanView.innerL4DstPortMode}
                        >
                          {vxlanView.innerL4PortModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="VXLAN inner UDP destination port count"
                          disabled={vxlanView.innerL4DstPortCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4DestinationPortCount(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4DstPortCountValue}
                        />
                        <input
                          aria-label="VXLAN inner UDP destination port step"
                          disabled={vxlanView.innerL4DstPortStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeVxlanInnerL4DestinationPortStep(inputNumberValue(event))
                          }
                          type="number"
                          value={vxlanView.innerL4DstPortStepValue}
                        />
                      </div>
                    </div>
                  </details>
                ) : null}
                {gtpuView?.enabled ? (
                  <details open>
                    <summary>GPRS Tunneling Protocol User Plane</summary>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label>
                        Message type
                        <input
                          aria-label="GTP-U message type"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuMessageType(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.messageTypeValue}
                        />
                      </label>
                      <label>
                        UDP port
                        <input aria-label="GTP-U UDP port" readOnly value={gtpuView.udpPortValue} />
                      </label>
                      <label>
                        TEID
                        <input
                          aria-label="GTP-U TEID"
                          max={4_294_967_295}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuTeid(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.teidValue}
                        />
                      </label>
                      <label>
                        TEID mode
                        <select
                          aria-label="GTP-U TEID mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuTeidMode(event.target.value as ProfileWorkbenchStream["gtpu_teid_mode"])
                          }
                          value={gtpuView.teidMode}
                        >
                          {gtpuView.teidModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        TEID count
                        <input
                          aria-label="GTP-U TEID count"
                          disabled={gtpuView.teidCountDisabled}
                          max={4_294_967_296}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuTeidCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.teidCountValue}
                        />
                      </label>
                      <label>
                        TEID step
                        <input
                          aria-label="GTP-U TEID step"
                          disabled={gtpuView.teidStepDisabled}
                          max={4_294_967_295}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuTeidStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.teidStepValue}
                        />
                      </label>
                      <label className="protocol-inline-checkbox">
                        Sequence present
                        <input
                          aria-label="GTP-U sequence present"
                          checked={gtpuView.sequenceEnabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuSequenceSelection(event.target.checked)
                          }
                          type="checkbox"
                        />
                      </label>
                      <label>
                        Sequence
                        <input
                          aria-label="GTP-U sequence"
                          disabled={gtpuView.sequenceValueDisabled}
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuSequence(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.sequenceValue}
                        />
                      </label>
                      <label>
                        Sequence mode
                        <select
                          aria-label="GTP-U sequence mode"
                          disabled={gtpuView.sequenceModeDisabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuSequenceMode(event.target.value as ProfileWorkbenchStream["gtpu_sequence_mode"])
                          }
                          value={gtpuView.sequenceMode}
                        >
                          {gtpuView.sequenceModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Sequence count
                        <input
                          aria-label="GTP-U sequence count"
                          disabled={gtpuView.sequenceCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuSequenceCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.sequenceCountValue}
                        />
                      </label>
                      <label>
                        Sequence step
                        <input
                          aria-label="GTP-U sequence step"
                          disabled={gtpuView.sequenceStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuSequenceStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.sequenceStepValue}
                        />
                      </label>
                      <label className="protocol-inline-checkbox">
                        N-PDU present
                        <input
                          aria-label="GTP-U N-PDU present"
                          checked={gtpuView.npduEnabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuNpduSelection(event.target.checked)
                          }
                          type="checkbox"
                        />
                      </label>
                      <label>
                        N-PDU number
                        <input
                          aria-label="GTP-U N-PDU number"
                          disabled={gtpuView.npduValueDisabled}
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuNpdu(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.npduValue}
                        />
                      </label>
                      <label>
                        N-PDU mode
                        <select
                          aria-label="GTP-U N-PDU mode"
                          disabled={gtpuView.npduModeDisabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuNpduMode(event.target.value as ProfileWorkbenchStream["gtpu_npdu_mode"])
                          }
                          value={gtpuView.npduMode}
                        >
                          {gtpuView.npduModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        N-PDU count
                        <input
                          aria-label="GTP-U N-PDU count"
                          disabled={gtpuView.npduCountDisabled}
                          max={256}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuNpduCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.npduCountValue}
                        />
                      </label>
                      <label>
                        N-PDU step
                        <input
                          aria-label="GTP-U N-PDU step"
                          disabled={gtpuView.npduStepDisabled}
                          max={255}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuNpduStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.npduStepValue}
                        />
                      </label>
                      <label className="protocol-inline-checkbox">
                        UDP Port extension
                        <input
                          aria-label="GTP-U UDP Port extension"
                          checked={gtpuView.extensionEnabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuExtensionSelection(event.target.checked)
                          }
                          type="checkbox"
                        />
                      </label>
                      <label>
                        Extension type
                        <input aria-label="GTP-U extension type" readOnly value={gtpuView.extensionTypeValue} />
                      </label>
                      <label>
                        Extension UDP port
                        <input
                          aria-label="GTP-U extension UDP port"
                          disabled={gtpuView.extensionUdpPortDisabled}
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuExtensionUdpPort(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.extensionUdpPortValue}
                        />
                      </label>
                      <label>
                        Extension UDP port mode
                        <select
                          aria-label="GTP-U extension UDP port mode"
                          disabled={gtpuView.extensionUdpPortModeDisabled}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuExtensionUdpPortMode(event.target.value as ProfileWorkbenchStream["gtpu_extension_udp_port_mode"])
                          }
                          value={gtpuView.extensionUdpPortMode}
                        >
                          {gtpuView.extensionUdpPortModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Extension UDP port count
                        <input
                          aria-label="GTP-U extension UDP port count"
                          disabled={gtpuView.extensionUdpPortCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuExtensionUdpPortCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.extensionUdpPortCountValue}
                        />
                      </label>
                      <label>
                        Extension UDP port step
                        <input
                          aria-label="GTP-U extension UDP port step"
                          disabled={gtpuView.extensionUdpPortStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuExtensionUdpPortStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.extensionUdpPortStepValue}
                        />
                      </label>
                      <label>
                        Inner IP
                        <select
                          aria-label="GTP-U inner IP version"
                          onChange={(event) =>
                            handleGtpuInnerIpVersionChange(event.target.value as ProfileWorkbenchStream["gtpu_inner_ip_version"])
                          }
                          value={gtpuView.innerIpVersion}
                        >
                          {gtpuView.innerIpVersionOptions.map((version) => (
                            <option key={version} value={version}>{version}</option>
                          ))}
                        </select>
                      </label>
                      {!gtpuView.usesIpv6 ? (
                        <>
                          <label>
                            Inner TTL
                            <input
                              aria-label="GTP-U inner IPv4 TTL"
                              max={255}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv4Ttl(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv4TtlValue}
                            />
                          </label>
                          <label>
                            TTL mode
                            <select
                              aria-label="GTP-U inner IPv4 TTL mode"
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv4TtlMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv4_ttl_mode"])
                              }
                              value={gtpuView.innerIpv4TtlMode}
                            >
                              {gtpuView.innerIpv4TtlModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            TTL count
                            <input
                              aria-label="GTP-U inner IPv4 TTL count"
                              disabled={gtpuView.innerIpv4TtlCountDisabled}
                              max={256}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv4TtlCount(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv4TtlCountValue}
                            />
                          </label>
                          <label>
                            TTL step
                            <input
                              aria-label="GTP-U inner IPv4 TTL step"
                              disabled={gtpuView.innerIpv4TtlStepDisabled}
                              max={255}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv4TtlStep(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv4TtlStepValue}
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label>
                            Hop Limit
                            <input
                              aria-label="GTP-U inner IPv6 hop limit"
                              max={255}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv6HopLimit(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv6HopLimitValue}
                            />
                          </label>
                          <label>
                            Hop mode
                            <select
                              aria-label="GTP-U inner IPv6 hop limit mode"
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv6HopLimitMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv6_hop_limit_mode"])
                              }
                              value={gtpuView.innerIpv6HopLimitMode}
                            >
                              {gtpuView.innerIpv6HopLimitModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Hop count
                            <input
                              aria-label="GTP-U inner IPv6 hop limit count"
                              disabled={gtpuView.innerIpv6HopLimitCountDisabled}
                              max={256}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv6HopLimitCount(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv6HopLimitCountValue}
                            />
                          </label>
                          <label>
                            Hop step
                            <input
                              aria-label="GTP-U inner IPv6 hop limit step"
                              disabled={gtpuView.innerIpv6HopLimitStepDisabled}
                              max={255}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGtpuInnerIpv6HopLimitStep(inputNumberValue(event))
                              }
                              type="number"
                              value={gtpuView.innerIpv6HopLimitStepValue}
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {!gtpuView.usesIpv6 ? (
                      <div className="address-field-grid">
                        <span />
                        <span>Address</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner IPv4 source</strong>
                        <input
                          aria-label="GTP-U inner IPv4 source"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4Source(event.target.value)
                          }
                          value={gtpuView.innerIpv4SrcValue}
                        />
                        <select
                          aria-label="GTP-U inner IPv4 source mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4SourceMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv4_src_mode"])
                          }
                          value={gtpuView.innerIpv4SrcMode}
                        >
                          {gtpuView.innerIpv4AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner IPv4 source count"
                          disabled={gtpuView.innerIpv4SrcCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4SourceCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv4SrcCountValue}
                        />
                        <input
                          aria-label="GTP-U inner IPv4 source step"
                          disabled={gtpuView.innerIpv4SrcStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4SourceStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv4SrcStepValue}
                        />
                        <strong>Inner IPv4 destination</strong>
                        <input
                          aria-label="GTP-U inner IPv4 destination"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4Destination(event.target.value)
                          }
                          value={gtpuView.innerIpv4DstValue}
                        />
                        <select
                          aria-label="GTP-U inner IPv4 destination mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4DestinationMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv4_dst_mode"])
                          }
                          value={gtpuView.innerIpv4DstMode}
                        >
                          {gtpuView.innerIpv4AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner IPv4 destination count"
                          disabled={gtpuView.innerIpv4DstCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4DestinationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv4DstCountValue}
                        />
                        <input
                          aria-label="GTP-U inner IPv4 destination step"
                          disabled={gtpuView.innerIpv4DstStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv4DestinationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv4DstStepValue}
                        />
                      </div>
                    ) : (
                      <div className="address-field-grid">
                        <span />
                        <span>Address</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner IPv6 source</strong>
                        <input
                          aria-label="GTP-U inner IPv6 source"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6Source(event.target.value)
                          }
                          value={gtpuView.innerIpv6SrcValue}
                        />
                        <select
                          aria-label="GTP-U inner IPv6 source mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6SourceMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv6_src_mode"])
                          }
                          value={gtpuView.innerIpv6SrcMode}
                        >
                          {gtpuView.innerIpv6AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner IPv6 source count"
                          disabled={gtpuView.innerIpv6SrcCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6SourceCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv6SrcCountValue}
                        />
                        <input
                          aria-label="GTP-U inner IPv6 source step"
                          disabled={gtpuView.innerIpv6SrcStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6SourceStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv6SrcStepValue}
                        />
                        <strong>Inner IPv6 destination</strong>
                        <input
                          aria-label="GTP-U inner IPv6 destination"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6Destination(event.target.value)
                          }
                          value={gtpuView.innerIpv6DstValue}
                        />
                        <select
                          aria-label="GTP-U inner IPv6 destination mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6DestinationMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_ipv6_dst_mode"])
                          }
                          value={gtpuView.innerIpv6DstMode}
                        >
                          {gtpuView.innerIpv6AddressModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner IPv6 destination count"
                          disabled={gtpuView.innerIpv6DstCountDisabled}
                          max={100_000_000}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6DestinationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv6DstCountValue}
                        />
                        <input
                          aria-label="GTP-U inner IPv6 destination step"
                          disabled={gtpuView.innerIpv6DstStepDisabled}
                          max={100_000_000}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerIpv6DestinationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerIpv6DstStepValue}
                        />
                      </div>
                    )}
                    <div className="protocol-data-form">
                      <div className="l4-port-grid">
                        <span />
                        <span>Port</span>
                        <span>Mode</span>
                        <span>Count</span>
                        <span>Step</span>
                        <strong>Inner UDP source</strong>
                        <input
                          aria-label="GTP-U inner UDP source port"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4SourcePort(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4SrcPortValue}
                        />
                        <select
                          aria-label="GTP-U inner UDP source port mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4SourcePortMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_l4_src_port_mode"])
                          }
                          value={gtpuView.innerL4SrcPortMode}
                        >
                          {gtpuView.innerL4PortModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner UDP source port count"
                          disabled={gtpuView.innerL4SrcPortCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4SourcePortCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4SrcPortCountValue}
                        />
                        <input
                          aria-label="GTP-U inner UDP source port step"
                          disabled={gtpuView.innerL4SrcPortStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4SourcePortStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4SrcPortStepValue}
                        />
                        <strong>Inner UDP destination</strong>
                        <input
                          aria-label="GTP-U inner UDP destination port"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4DestinationPort(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4DstPortValue}
                        />
                        <select
                          aria-label="GTP-U inner UDP destination port mode"
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4DestinationPortMode(event.target.value as ProfileWorkbenchStream["gtpu_inner_l4_dst_port_mode"])
                          }
                          value={gtpuView.innerL4DstPortMode}
                        >
                          {gtpuView.innerL4PortModeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          aria-label="GTP-U inner UDP destination port count"
                          disabled={gtpuView.innerL4DstPortCountDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4DestinationPortCount(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4DstPortCountValue}
                        />
                        <input
                          aria-label="GTP-U inner UDP destination port step"
                          disabled={gtpuView.innerL4DstPortStepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataTunnelHandlers.changeGtpuInnerL4DestinationPortStep(inputNumberValue(event))
                          }
                          type="number"
                          value={gtpuView.innerL4DstPortStepValue}
                        />
                      </div>
                    </div>
                  </details>
                ) : null}
                {ethernetView ? (
                <details open>
                  <summary>Ethernet</summary>
                  <div className="address-field-grid">
                    <span />
                    <span>Address</span>
                    <span>Mode</span>
                    <span>Count</span>
                    <span>Step</span>
                    <strong>Destination</strong>
                    <input
                      aria-label="Ethernet destination"
                      onChange={(event) => protocolDataLinkHandlers.changeEtherDestination(event.target.value)}
                      value={ethernetView.destination.value}
                    />
                    <select
                      aria-label="Ethernet destination mode"
                      onChange={(event) =>
                        protocolDataLinkHandlers.changeEtherDestinationMode(
                          event.target.value as ProfileWorkbenchStream["ether_dst_mode"]
                        )
                      }
                      value={ethernetView.destination.mode}
                    >
                      {ethernetView.destination.modeOptions.map((mode) => (
                        <option key={mode} value={mode}>{mode}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Ethernet destination count"
                      disabled={ethernetView.destination.countDisabled}
                      max={9999}
                      min={1}
                      onChange={(event) => protocolDataLinkHandlers.changeEtherDestinationCount(inputNumberValue(event))}
                      type="number"
                      value={ethernetView.destination.countValue}
                    />
                    <input
                      aria-label="Ethernet destination step"
                      disabled={ethernetView.destination.stepDisabled}
                      max={999}
                      min={1}
                      onChange={(event) => protocolDataLinkHandlers.changeEtherDestinationStep(inputNumberValue(event))}
                      type="number"
                      value={ethernetView.destination.stepValue}
                    />
                    <strong>Source</strong>
                    <input
                      aria-label="Ethernet source"
                      onChange={(event) => protocolDataLinkHandlers.changeEtherSource(event.target.value)}
                      value={ethernetView.source.value}
                    />
                    <select
                      aria-label="Ethernet source mode"
                      onChange={(event) =>
                        protocolDataLinkHandlers.changeEtherSourceMode(
                          event.target.value as ProfileWorkbenchStream["ether_src_mode"]
                        )
                      }
                      value={ethernetView.source.mode}
                    >
                      {ethernetView.source.modeOptions.map((mode) => (
                        <option key={mode} value={mode}>{mode}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Ethernet source count"
                      disabled={ethernetView.source.countDisabled}
                      max={9999}
                      min={1}
                      onChange={(event) => protocolDataLinkHandlers.changeEtherSourceCount(inputNumberValue(event))}
                      type="number"
                      value={ethernetView.source.countValue}
                    />
                    <input
                      aria-label="Ethernet source step"
                      disabled={ethernetView.source.stepDisabled}
                      max={999}
                      min={1}
                      onChange={(event) => protocolDataLinkHandlers.changeEtherSourceStep(inputNumberValue(event))}
                      type="number"
                      value={ethernetView.source.stepValue}
                    />
                  </div>
                </details>
                ) : null}
                {selectedStream.packet_type === "Ethernet/ARP" && arpView ? (
                  <details open>
                    <summary>Address Resolution Protocol</summary>
                    <div className="protocol-data-form">
                      <label>
                        Hardware type
                        <input
                          aria-label="ARP hardware type"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpHardwareType(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.hardwareTypeValue}
                        />
                      </label>
                      <label>
                        Protocol type
                        <input
                          aria-label="ARP protocol type"
                          maxLength={4}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpProtocolType(event.target.value)
                          }
                          value={arpView.protocolTypeValue}
                        />
                      </label>
                      <label>
                        Hardware size
                        <input
                          aria-label="ARP hardware size"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpHardwareSize(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.hardwareSizeValue}
                        />
                      </label>
                      <label>
                        Protocol size
                        <input
                          aria-label="ARP protocol size"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpProtocolSize(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.protocolSizeValue}
                        />
                      </label>
                      <label>
                        Operation
                        <input
                          aria-label="ARP operation"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpOperation(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.operation.value}
                        />
                      </label>
                      <label>
                        Operation mode
                        <select
                          aria-label="ARP operation mode"
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpOperationMode(event.target.value as ProfileWorkbenchStream["arp_operation_mode"])
                          }
                          value={arpView.operation.mode}
                        >
                          {arpView.operation.modeOptions.map((mode) => (
                            <option key={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Operation count
                        <input
                          aria-label="ARP operation count"
                          disabled={arpView.operation.countDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpOperationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.operation.countValue}
                        />
                      </label>
                      <label>
                        Operation step
                        <input
                          aria-label="ARP operation step"
                          disabled={arpView.operation.stepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataArpHandlers.changeArpOperationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={arpView.operation.stepValue}
                        />
                      </label>
                    </div>
                    <div className="address-field-grid address-field-grid--arp-fe">
                      <span />
                      <span>Address</span>
                      <span>Mode</span>
                      <span>Count</span>
                      <span>Step</span>
                      <strong>Sender MAC</strong>
                      <input
                        aria-label="ARP sender MAC"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderMac(event.target.value)
                        }
                        value={arpView.senderMac.value}
                      />
                      <select
                        aria-label="ARP sender MAC mode"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderMacMode(event.target.value as ProfileWorkbenchStream["arp_sender_mac_mode"])
                        }
                        value={arpView.senderMac.mode}
                      >
                        {arpView.senderMac.modeOptions.map((mode) => (
                          <option key={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="ARP sender MAC count"
                        disabled={arpView.senderMac.countDisabled}
                        max={100000000}
                        min={2}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderMacCount(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.senderMac.countValue}
                      />
                      <input
                        aria-label="ARP sender MAC step"
                        disabled={arpView.senderMac.stepDisabled}
                        max={100000000}
                        min={1}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderMacStep(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.senderMac.stepValue}
                      />
                      <strong>Sender IP</strong>
                      <input
                        aria-label="ARP sender IP"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderIp(event.target.value)
                        }
                        value={arpView.senderIp.value}
                      />
                      <select
                        aria-label="ARP sender IP mode"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderIpMode(event.target.value as ProfileWorkbenchStream["arp_sender_ip_mode"])
                        }
                        value={arpView.senderIp.mode}
                      >
                        {arpView.senderIp.modeOptions.map((mode) => (
                          <option key={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="ARP sender IP count"
                        disabled={arpView.senderIp.countDisabled}
                        max={100000000}
                        min={2}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderIpCount(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.senderIp.countValue}
                      />
                      <input
                        aria-label="ARP sender IP step"
                        disabled={arpView.senderIp.stepDisabled}
                        max={100000000}
                        min={1}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpSenderIpStep(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.senderIp.stepValue}
                      />
                      <strong>Target MAC</strong>
                      <input
                        aria-label="ARP target MAC"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetMac(event.target.value)
                        }
                        value={arpView.targetMac.value}
                      />
                      <select
                        aria-label="ARP target MAC mode"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetMacMode(event.target.value as ProfileWorkbenchStream["arp_target_mac_mode"])
                        }
                        value={arpView.targetMac.mode}
                      >
                        {arpView.targetMac.modeOptions.map((mode) => (
                          <option key={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="ARP target MAC count"
                        disabled={arpView.targetMac.countDisabled}
                        max={100000000}
                        min={2}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetMacCount(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.targetMac.countValue}
                      />
                      <input
                        aria-label="ARP target MAC step"
                        disabled={arpView.targetMac.stepDisabled}
                        max={100000000}
                        min={1}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetMacStep(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.targetMac.stepValue}
                      />
                      <strong>Target IP</strong>
                      <input
                        aria-label="ARP target IP"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetIp(event.target.value)
                        }
                        value={arpView.targetIp.value}
                      />
                      <select
                        aria-label="ARP target IP mode"
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetIpMode(event.target.value as ProfileWorkbenchStream["arp_target_ip_mode"])
                        }
                        value={arpView.targetIp.mode}
                      >
                        {arpView.targetIp.modeOptions.map((mode) => (
                          <option key={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="ARP target IP count"
                        disabled={arpView.targetIp.countDisabled}
                        max={100000000}
                        min={2}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetIpCount(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.targetIp.countValue}
                      />
                      <input
                        aria-label="ARP target IP step"
                        disabled={arpView.targetIp.stepDisabled}
                        max={100000000}
                        min={1}
                        onChange={(event) =>
                          protocolDataArpHandlers.changeArpTargetIpStep(inputNumberValue(event))
                        }
                        type="number"
                        value={arpView.targetIp.stepValue}
                      />
                    </div>
                  </details>
                ) : null}
                {ipVersionName(selectedStream.packet_type) === "IPv4"
                  && ipv4AddressView
                  && ipv4ScalarView
                  && ipv4FlagsChecksumView ? (
                  <details open>
                    <summary>Internet Protocol v4</summary>
                    <div className="address-field-grid">
                      <span />
                      <span>Address</span>
                      <span>Mode</span>
                      <span>Count</span>
                      <span>Step</span>
                      <strong>Destination</strong>
                      <input
                        aria-label="IPv4 destination"
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4Destination(event.target.value)
                        }
                        value={ipv4AddressView.destination.value}
                      />
                      <select
                        aria-label="IPv4 destination mode"
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4DestinationMode(
                            event.target.value as ProfileWorkbenchStream["ipv4_dst_mode"]
                          )
                        }
                        value={ipv4AddressView.destination.mode}
                      >
                        {ipv4AddressView.destination.modeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="IPv4 destination count"
                        disabled={ipv4AddressView.destination.countDisabled}
                        maxLength={14}
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4DestinationCount(event.target.value)
                        }
                        type="text"
                        value={ipv4AddressView.destination.countValue}
                      />
                      <input
                        aria-label="IPv4 destination step"
                        disabled={ipv4AddressView.destination.stepDisabled}
                        max={100_000_000}
                        min={1}
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4DestinationStep(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv4AddressView.destination.stepValue}
                      />
                      <strong>Source</strong>
                      <input
                        aria-label="IPv4 source"
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4Source(event.target.value)
                        }
                        value={ipv4AddressView.source.value}
                      />
                      <select
                        aria-label="IPv4 source mode"
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4SourceMode(
                            event.target.value as ProfileWorkbenchStream["ipv4_src_mode"]
                          )
                        }
                        value={ipv4AddressView.source.mode}
                      >
                        {ipv4AddressView.source.modeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="IPv4 source count"
                        disabled={ipv4AddressView.source.countDisabled}
                        maxLength={14}
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4SourceCount(event.target.value)
                        }
                        type="text"
                        value={ipv4AddressView.source.countValue}
                      />
                      <input
                        aria-label="IPv4 source step"
                        disabled={ipv4AddressView.source.stepDisabled}
                        max={100_000_000}
                        min={1}
                        onChange={(event) =>
                          protocolDataIpv4Handlers.changeIpv4SourceStep(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv4AddressView.source.stepValue}
                      />
                    </div>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label>
                        DSCP
                        <input
                          aria-label="IPv4 DSCP"
                          max={63}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4Dscp(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.dscp.value}
                        />
                      </label>
                      <label>
                        ECN
                        <input
                          aria-label="IPv4 ECN"
                          max={3}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4Ecn(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ecn.value}
                        />
                      </label>
                      <label>
                        ECN mode
                        <select
                          aria-label="IPv4 ECN mode"
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4EcnMode(
                              event.target.value as ProfileWorkbenchStream["ipv4_ecn_mode"]
                            )
                          }
                          value={ipv4ScalarView.ecn.mode}
                        >
                          {ipv4ScalarView.ecn.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        ECN count
                        <input
                          aria-label="IPv4 ECN count"
                          disabled={ipv4ScalarView.ecn.countDisabled}
                          max={4}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4EcnCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ecn.countValue}
                        />
                      </label>
                      <label>
                        ECN step
                        <input
                          aria-label="IPv4 ECN step"
                          disabled={ipv4ScalarView.ecn.stepDisabled}
                          max={3}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4EcnStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ecn.stepValue}
                        />
                      </label>
                      <label>
                        DSCP mode
                        <select
                          aria-label="IPv4 DSCP mode"
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4DscpMode(
                              event.target.value as ProfileWorkbenchStream["ipv4_dscp_mode"]
                            )
                          }
                          value={ipv4ScalarView.dscp.mode}
                        >
                          {ipv4ScalarView.dscp.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        DSCP count
                        <input
                          aria-label="IPv4 DSCP count"
                          disabled={ipv4ScalarView.dscp.countDisabled}
                          max={64}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4DscpCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.dscp.countValue}
                        />
                      </label>
                      <label>
                        DSCP step
                        <input
                          aria-label="IPv4 DSCP step"
                          disabled={ipv4ScalarView.dscp.stepDisabled}
                          max={63}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4DscpStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.dscp.stepValue}
                        />
                      </label>
                      <label>
                        Identification
                        <input
                          aria-label="IPv4 identification"
                          max={65535}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4Identification(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.identification.value}
                        />
                      </label>
                      <label>
                        ID mode
                        <select
                          aria-label="IPv4 identification mode"
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4IdentificationMode(
                              event.target.value as ProfileWorkbenchStream["ipv4_id_mode"]
                            )
                          }
                          value={ipv4ScalarView.identification.mode}
                        >
                          {ipv4ScalarView.identification.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        ID count
                        <input
                          aria-label="IPv4 identification count"
                          disabled={ipv4ScalarView.identification.countDisabled}
                          max={65536}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4IdentificationCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.identification.countValue}
                        />
                      </label>
                      <label>
                        ID step
                        <input
                          aria-label="IPv4 identification step"
                          disabled={ipv4ScalarView.identification.stepDisabled}
                          max={65535}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4IdentificationStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.identification.stepValue}
                        />
                      </label>
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="IPv4 don't fragment"
                          checked={ipv4FlagsChecksumView.dontFragmentChecked}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4DfFlag(event.target.checked)
                          }
                          type="checkbox"
                        />
                        DF
                      </label>
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="IPv4 more fragments"
                          checked={ipv4FlagsChecksumView.moreFragmentsChecked}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4MfFlag(event.target.checked)
                          }
                          type="checkbox"
                        />
                        MF
                      </label>
                      <label>
                        Fragment Offset
                        <input
                          aria-label="IPv4 fragment offset"
                          max={8191}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4FragmentOffset(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.fragmentOffset.value}
                        />
                      </label>
                      <label>
                        Fragment mode
                        <select
                          aria-label="IPv4 fragment offset mode"
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4FragmentOffsetMode(
                              event.target.value as ProfileWorkbenchStream["ipv4_fragment_offset_mode"]
                            )
                          }
                          value={ipv4ScalarView.fragmentOffset.mode}
                        >
                          {ipv4ScalarView.fragmentOffset.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Fragment count
                        <input
                          aria-label="IPv4 fragment offset count"
                          disabled={ipv4ScalarView.fragmentOffset.countDisabled}
                          max={8192}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4FragmentOffsetCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.fragmentOffset.countValue}
                        />
                      </label>
                      <label>
                        Fragment step
                        <input
                          aria-label="IPv4 fragment offset step"
                          disabled={ipv4ScalarView.fragmentOffset.stepDisabled}
                          max={8191}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4FragmentOffsetStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.fragmentOffset.stepValue}
                        />
                      </label>
                      <label>
                        TTL
                        <input
                          aria-label="IPv4 TTL"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4Ttl(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ttl.value}
                        />
                      </label>
                      <label>
                        TTL mode
                        <select
                          aria-label="IPv4 TTL mode"
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4TtlMode(
                              event.target.value as ProfileWorkbenchStream["ipv4_ttl_mode"]
                            )
                          }
                          value={ipv4ScalarView.ttl.mode}
                        >
                          {ipv4ScalarView.ttl.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        TTL count
                        <input
                          aria-label="IPv4 TTL count"
                          disabled={ipv4ScalarView.ttl.countDisabled}
                          max={256}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4TtlCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ttl.countValue}
                        />
                      </label>
                      <label>
                        TTL step
                        <input
                          aria-label="IPv4 TTL step"
                          disabled={ipv4ScalarView.ttl.stepDisabled}
                          max={255}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4TtlStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv4ScalarView.ttl.stepValue}
                        />
                      </label>
                      <label className="protocol-inline-checkbox">
                        <input
                          aria-label="Override IPv4 checksum"
                          checked={ipv4FlagsChecksumView.checksumOverrideChecked}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4ChecksumOverride(event.target.checked)
                          }
                          type="checkbox"
                        />
                        Override checksum
                      </label>
                      <label>
                        Checksum
                        <input
                          aria-label="IPv4 checksum"
                          disabled={ipv4FlagsChecksumView.checksumDisabled}
                          maxLength={4}
                          onChange={(event) =>
                            protocolDataIpv4Handlers.changeIpv4Checksum(event.target.value)
                          }
                          value={ipv4FlagsChecksumView.checksumValue}
                        />
                      </label>
                    </div>
                  </details>
                ) : ipVersionName(selectedStream.packet_type) === "IPv6" && ipv6AddressView && ipv6ScalarView ? (
                  <details open>
                    <summary>Internet Protocol v6</summary>
                    <div className="address-field-grid">
                      <span />
                      <span>Address</span>
                      <span>Mode</span>
                      <span>Count</span>
                      <span>Step</span>
                      <strong>Destination</strong>
                      <input
                        aria-label="IPv6 destination"
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6Destination(event.target.value)
                        }
                        value={ipv6AddressView.destination.value}
                      />
                      <select
                        aria-label="IPv6 destination mode"
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6DestinationMode(
                            event.target.value as ProfileWorkbenchStream["ipv6_dst_mode"]
                          )
                        }
                        value={ipv6AddressView.destination.mode}
                      >
                        {ipv6AddressView.destination.modeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="IPv6 destination count"
                        disabled={ipv6AddressView.destination.countDisabled}
                        max={100_000_000}
                        min={2}
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6DestinationCount(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv6AddressView.destination.countValue}
                      />
                      <input
                        aria-label="IPv6 destination step"
                        disabled={ipv6AddressView.destination.stepDisabled}
                        max={100_000_000}
                        min={1}
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6DestinationStep(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv6AddressView.destination.stepValue}
                      />
                      <strong>Source</strong>
                      <input
                        aria-label="IPv6 source"
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6Source(event.target.value)
                        }
                        value={ipv6AddressView.source.value}
                      />
                      <select
                        aria-label="IPv6 source mode"
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6SourceMode(
                            event.target.value as ProfileWorkbenchStream["ipv6_src_mode"]
                          )
                        }
                        value={ipv6AddressView.source.mode}
                      >
                        {ipv6AddressView.source.modeOptions.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                      <input
                        aria-label="IPv6 source count"
                        disabled={ipv6AddressView.source.countDisabled}
                        max={100_000_000}
                        min={2}
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6SourceCount(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv6AddressView.source.countValue}
                      />
                      <input
                        aria-label="IPv6 source step"
                        disabled={ipv6AddressView.source.stepDisabled}
                        max={100_000_000}
                        min={1}
                        onChange={(event) =>
                          protocolDataIpv6Handlers.changeIpv6SourceStep(inputNumberValue(event))
                        }
                        type="number"
                        value={ipv6AddressView.source.stepValue}
                      />
                    </div>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label>
                        Traffic Class
                        <input
                          aria-label="IPv6 traffic class"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6TrafficClass(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.trafficClass.value}
                        />
                      </label>
                      <label>
                        Traffic Class mode
                        <select
                          aria-label="IPv6 traffic class mode"
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6TrafficClassMode(
                              event.target.value as ProfileWorkbenchStream["ipv6_traffic_class_mode"]
                            )
                          }
                          value={ipv6ScalarView.trafficClass.mode}
                        >
                          {ipv6ScalarView.trafficClass.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Traffic Class count
                        <input
                          aria-label="IPv6 traffic class count"
                          disabled={ipv6ScalarView.trafficClass.countDisabled}
                          max={256}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6TrafficClassCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.trafficClass.countValue}
                        />
                      </label>
                      <label>
                        Traffic Class step
                        <input
                          aria-label="IPv6 traffic class step"
                          disabled={ipv6ScalarView.trafficClass.stepDisabled}
                          max={255}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6TrafficClassStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.trafficClass.stepValue}
                        />
                      </label>
                      <label>
                        Flow Label
                        <input
                          aria-label="IPv6 flow label"
                          max={1_048_575}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6FlowLabel(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.flowLabel.value}
                        />
                      </label>
                      <label>
                        Flow Label mode
                        <select
                          aria-label="IPv6 flow label mode"
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6FlowLabelMode(
                              event.target.value as ProfileWorkbenchStream["ipv6_flow_label_mode"]
                            )
                          }
                          value={ipv6ScalarView.flowLabel.mode}
                        >
                          {ipv6ScalarView.flowLabel.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Flow Label count
                        <input
                          aria-label="IPv6 flow label count"
                          disabled={ipv6ScalarView.flowLabel.countDisabled}
                          max={1_048_576}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6FlowLabelCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.flowLabel.countValue}
                        />
                      </label>
                      <label>
                        Flow Label step
                        <input
                          aria-label="IPv6 flow label step"
                          disabled={ipv6ScalarView.flowLabel.stepDisabled}
                          max={1_048_575}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6FlowLabelStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.flowLabel.stepValue}
                        />
                      </label>
                      <label>
                        Hop Limit
                        <input
                          aria-label="IPv6 hop limit"
                          max={255}
                          min={0}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6HopLimit(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.hopLimit.value}
                        />
                      </label>
                      <label>
                        Hop Limit mode
                        <select
                          aria-label="IPv6 hop limit mode"
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6HopLimitMode(
                              event.target.value as ProfileWorkbenchStream["ipv6_hop_limit_mode"]
                            )
                          }
                          value={ipv6ScalarView.hopLimit.mode}
                        >
                          {ipv6ScalarView.hopLimit.modeOptions.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Hop Limit count
                        <input
                          aria-label="IPv6 hop limit count"
                          disabled={ipv6ScalarView.hopLimit.countDisabled}
                          max={256}
                          min={2}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6HopLimitCount(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.hopLimit.countValue}
                        />
                      </label>
                      <label>
                        Hop Limit step
                        <input
                          aria-label="IPv6 hop limit step"
                          disabled={ipv6ScalarView.hopLimit.stepDisabled}
                          max={255}
                          min={1}
                          onChange={(event) =>
                            protocolDataIpv6Handlers.changeIpv6HopLimitStep(inputNumberValue(event))
                          }
                          type="number"
                          value={ipv6ScalarView.hopLimit.stepValue}
                        />
                      </label>
                    </div>
                  </details>
                ) : null}
                {protocolName(selectedStream.packet_type) !== "None" ? (
                  <details open>
                    <summary>{l4ProtocolTitle(protocolName(selectedStream.packet_type), selectedStream.packet_type)}</summary>
                    <div className="protocol-data-form">
                      {(protocolName(selectedStream.packet_type) === "TCP"
                        || protocolName(selectedStream.packet_type) === "UDP"
                        || protocolName(selectedStream.packet_type) === "SCTP")
                        && l4PortView ? (
                        <>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override source port"
                              checked={l4PortView.source.overrideChecked}
                              disabled={l4PortView.source.overrideDisabled}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4SourcePortOverrideSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override source port
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override destination port"
                              checked={l4PortView.destination.overrideChecked}
                              disabled={l4PortView.destination.overrideDisabled}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4DestinationPortOverrideSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override destination port
                          </label>
                          <div className="l4-port-grid">
                            <span />
                            <span>Port</span>
                            <span>Mode</span>
                            <span>Count</span>
                            <span>Step</span>
                            <strong>Source</strong>
                            <input
                              aria-label="L4 source port"
                              disabled={l4PortView.source.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4SourcePort(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.source.value}
                            />
                            <select
                              aria-label="L4 source port mode"
                              disabled={l4PortView.source.modeDisabled}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4SourcePortMode(event.target.value as ProfileWorkbenchStream["l4_src_port_mode"])
                              }
                              value={l4PortView.source.mode}
                            >
                              {l4PortView.source.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                            <input
                              aria-label="L4 source port count"
                              disabled={l4PortView.source.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4SourcePortCount(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.source.countValue}
                            />
                            <input
                              aria-label="L4 source port step"
                              disabled={l4PortView.source.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4SourcePortStep(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.source.stepValue}
                            />
                            <strong>Destination</strong>
                            <input
                              aria-label="L4 destination port"
                              disabled={l4PortView.destination.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4DestinationPort(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.destination.value}
                            />
                            <select
                              aria-label="L4 destination port mode"
                              disabled={l4PortView.destination.modeDisabled}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4DestinationPortMode(event.target.value as ProfileWorkbenchStream["l4_dst_port_mode"])
                              }
                              value={l4PortView.destination.mode}
                            >
                              {l4PortView.destination.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                            <input
                              aria-label="L4 destination port count"
                              disabled={l4PortView.destination.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4DestinationPortCount(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.destination.countValue}
                            />
                            <input
                              aria-label="L4 destination port step"
                              disabled={l4PortView.destination.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTransportHandlers.changeL4DestinationPortStep(inputNumberValue(event))
                              }
                              type="number"
                              value={l4PortView.destination.stepValue}
                            />
                          </div>
                        </>
                      ) : null}
                      {protocolName(selectedStream.packet_type) === "GRE" && greView ? (
                        <>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Include GRE checksum"
                              checked={greView.checksumPresent}
                              disabled={greView.checksumPresentDisabled}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreChecksumSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Checksum present
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override GRE checksum"
                              checked={greView.checksumOverride}
                              disabled={greView.checksumOverrideDisabled}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreChecksumOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override checksum
                          </label>
                          <label>
                            Checksum
                            <input
                              aria-label="GRE checksum"
                              disabled={greView.checksumValueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreChecksum(event.target.value)
                              }
                              value={greView.checksumValue}
                            />
                          </label>
                          <label>
                            Inner IP
                            <select
                              aria-label="GRE inner IP version"
                              onChange={(event) =>
                                handleGreInnerIpVersionChange(event.target.value as ProfileWorkbenchStream["gre_inner_ip_version"])
                              }
                              value={greView.innerIpVersion}
                            >
                              {greView.innerIpVersionOptions.map((version) => (
                                <option key={version} value={version}>{version}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Protocol type
                            <input
                              aria-label="GRE protocol type"
                              disabled
                              maxLength={4}
                              value={greView.protocolTypeValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Include GRE key"
                              checked={greView.keyPresent}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreKeySelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Key present
                          </label>
                          <label>
                            Key
                            <input
                              aria-label="GRE key"
                              disabled={greView.keyValueDisabled}
                              max={4294967295}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreKey(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.keyValue}
                            />
                          </label>
                          <div className="protocol-field-row">
                            <label>
                              Key mode
                              <select
                                aria-label="GRE key mode"
                                disabled={greView.keyModeDisabled}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreKeyMode(event.target.value as ProfileWorkbenchStream["gre_key_mode"])
                                }
                                value={greView.keyMode}
                              >
                                {greView.keyModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <input
                              aria-label="GRE key count"
                              disabled={greView.keyCountDisabled}
                              max={4294967296}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreKeyCount(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.keyCountValue}
                            />
                            <input
                              aria-label="GRE key step"
                              disabled={greView.keyStepDisabled}
                              max={4294967295}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreKeyStep(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.keyStepValue}
                            />
                          </div>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Include GRE sequence"
                              checked={greView.sequencePresent}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreSequenceSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Sequence present
                          </label>
                          <label>
                            Sequence
                            <input
                              aria-label="GRE sequence"
                              disabled={greView.sequenceValueDisabled}
                              max={4294967295}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreSequence(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.sequenceValue}
                            />
                          </label>
                          <div className="protocol-field-row">
                            <label>
                              Sequence mode
                              <select
                                aria-label="GRE sequence mode"
                                disabled={greView.sequenceModeDisabled}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreSequenceMode(event.target.value as ProfileWorkbenchStream["gre_sequence_mode"])
                                }
                                value={greView.sequenceMode}
                              >
                                {greView.sequenceModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <input
                              aria-label="GRE sequence count"
                              disabled={greView.sequenceCountDisabled}
                              max={4294967296}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreSequenceCount(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.sequenceCountValue}
                            />
                            <input
                              aria-label="GRE sequence step"
                              disabled={greView.sequenceStepDisabled}
                              max={4294967295}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreSequenceStep(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.sequenceStepValue}
                            />
                          </div>
                          {greView.usesIpv6 ? (
                            <div className="address-field-grid">
                              <span />
                              <span>Value</span>
                              <span>Mode</span>
                              <span>Count</span>
                              <span>Step</span>
                              <strong>Inner IPv6 source</strong>
                              <input
                                aria-label="GRE inner IPv6 source"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6Source(event.target.value)
                                }
                                value={greView.innerIpv6SrcValue}
                              />
                              <select
                                aria-label="GRE inner IPv6 source mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6SourceMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv6_src_mode"])
                                }
                                value={greView.innerIpv6SrcMode}
                              >
                                {greView.innerIpv6AddressModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv6 source count"
                                disabled={greView.innerIpv6SrcCountDisabled}
                                max={100_000_000}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6SourceCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6SrcCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv6 source step"
                                disabled={greView.innerIpv6SrcStepDisabled}
                                max={100_000_000}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6SourceStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6SrcStepValue}
                              />
                              <strong>Inner IPv6 destination</strong>
                              <input
                                aria-label="GRE inner IPv6 destination"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6Destination(event.target.value)
                                }
                                value={greView.innerIpv6DstValue}
                              />
                              <select
                                aria-label="GRE inner IPv6 destination mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6DestinationMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv6_dst_mode"])
                                }
                                value={greView.innerIpv6DstMode}
                              >
                                {greView.innerIpv6AddressModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv6 destination count"
                                disabled={greView.innerIpv6DstCountDisabled}
                                max={100_000_000}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6DestinationCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6DstCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv6 destination step"
                                disabled={greView.innerIpv6DstStepDisabled}
                                max={100_000_000}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6DestinationStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6DstStepValue}
                              />
                              <strong>Inner IPv6 hop limit</strong>
                              <input
                                aria-label="GRE inner IPv6 hop limit"
                                max={255}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6HopLimit(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6HopLimitValue}
                              />
                              <select
                                aria-label="GRE inner IPv6 hop limit mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6HopLimitMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv6_hop_limit_mode"])
                                }
                                value={greView.innerIpv6HopLimitMode}
                              >
                                {greView.innerIpv6HopLimitModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv6 hop limit count"
                                disabled={greView.innerIpv6HopLimitCountDisabled}
                                max={256}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6HopLimitCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6HopLimitCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv6 hop limit step"
                                disabled={greView.innerIpv6HopLimitStepDisabled}
                                max={255}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv6HopLimitStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv6HopLimitStepValue}
                              />
                            </div>
                          ) : (
                            <div className="address-field-grid">
                              <span />
                              <span>Value</span>
                              <span>Mode</span>
                              <span>Count</span>
                              <span>Step</span>
                              <strong>Inner IPv4 source</strong>
                              <input
                                aria-label="GRE inner IPv4 source"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4Source(event.target.value)
                                }
                                value={greView.innerIpv4SrcValue}
                              />
                              <select
                                aria-label="GRE inner IPv4 source mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4SourceMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv4_src_mode"])
                                }
                                value={greView.innerIpv4SrcMode}
                              >
                                {greView.innerIpv4AddressModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv4 source count"
                                disabled={greView.innerIpv4SrcCountDisabled}
                                max={100_000_000}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4SourceCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4SrcCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv4 source step"
                                disabled={greView.innerIpv4SrcStepDisabled}
                                max={100_000_000}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4SourceStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4SrcStepValue}
                              />
                              <strong>Inner IPv4 destination</strong>
                              <input
                                aria-label="GRE inner IPv4 destination"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4Destination(event.target.value)
                                }
                                value={greView.innerIpv4DstValue}
                              />
                              <select
                                aria-label="GRE inner IPv4 destination mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4DestinationMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv4_dst_mode"])
                                }
                                value={greView.innerIpv4DstMode}
                              >
                                {greView.innerIpv4AddressModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv4 destination count"
                                disabled={greView.innerIpv4DstCountDisabled}
                                max={100_000_000}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4DestinationCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4DstCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv4 destination step"
                                disabled={greView.innerIpv4DstStepDisabled}
                                max={100_000_000}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4DestinationStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4DstStepValue}
                              />
                              <strong>Inner IPv4 TTL</strong>
                              <input
                                aria-label="GRE inner IPv4 TTL"
                                max={255}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4Ttl(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4TtlValue}
                              />
                              <select
                                aria-label="GRE inner IPv4 TTL mode"
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4TtlMode(event.target.value as ProfileWorkbenchStream["gre_inner_ipv4_ttl_mode"])
                                }
                                value={greView.innerIpv4TtlMode}
                              >
                                {greView.innerIpv4TtlModeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                              <input
                                aria-label="GRE inner IPv4 TTL count"
                                disabled={greView.innerIpv4TtlCountDisabled}
                                max={256}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4TtlCount(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4TtlCountValue}
                              />
                              <input
                                aria-label="GRE inner IPv4 TTL step"
                                disabled={greView.innerIpv4TtlStepDisabled}
                                max={255}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTunnelHandlers.changeGreInnerIpv4TtlStep(inputNumberValue(event))
                                }
                                type="number"
                                value={greView.innerIpv4TtlStepValue}
                              />
                            </div>
                          )}
                          <div className="l4-port-grid">
                            <span />
                            <span>Port</span>
                            <span>Mode</span>
                            <span>Count</span>
                            <span>Step</span>
                            <strong>Inner UDP source</strong>
                            <input
                              aria-label="GRE inner UDP source port"
                              max={65535}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4SourcePort(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4SrcPortValue}
                            />
                            <select
                              aria-label="GRE inner UDP source port mode"
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4SourcePortMode(event.target.value as ProfileWorkbenchStream["gre_inner_l4_src_port_mode"])
                              }
                              value={greView.innerL4SrcPortMode}
                            >
                              {greView.innerL4PortModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                            <input
                              aria-label="GRE inner UDP source port count"
                              disabled={greView.innerL4SrcPortCountDisabled}
                              max={65536}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4SourcePortCount(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4SrcPortCountValue}
                            />
                            <input
                              aria-label="GRE inner UDP source port step"
                              disabled={greView.innerL4SrcPortStepDisabled}
                              max={65535}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4SourcePortStep(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4SrcPortStepValue}
                            />
                            <strong>Inner UDP destination</strong>
                            <input
                              aria-label="GRE inner UDP destination port"
                              max={65535}
                              min={0}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4DestinationPort(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4DstPortValue}
                            />
                            <select
                              aria-label="GRE inner UDP destination port mode"
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4DestinationPortMode(event.target.value as ProfileWorkbenchStream["gre_inner_l4_dst_port_mode"])
                              }
                              value={greView.innerL4DstPortMode}
                            >
                              {greView.innerL4PortModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                            <input
                              aria-label="GRE inner UDP destination port count"
                              disabled={greView.innerL4DstPortCountDisabled}
                              max={65536}
                              min={2}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4DestinationPortCount(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4DstPortCountValue}
                            />
                            <input
                              aria-label="GRE inner UDP destination port step"
                              disabled={greView.innerL4DstPortStepDisabled}
                              max={65535}
                              min={1}
                              onChange={(event) =>
                                protocolDataTunnelHandlers.changeGreInnerL4DestinationPortStep(inputNumberValue(event))
                              }
                              type="number"
                              value={greView.innerL4DstPortStepValue}
                            />
                          </div>
                        </>
                      ) : null}
                      {protocolName(selectedStream.packet_type) === "ICMP" && icmpView ? (
                        <>
                          <label>
                            Type
                            <input
                              aria-label="ICMP type"
                              min={0}
                              max={255}
                              onChange={(event) => protocolDataIcmpHandlers.changeIcmpType(inputNumberValue(event))}
                              type="number"
                              value={icmpView.type.value}
                            />
                          </label>
                          <label>
                            Type mode
                            <select
                              aria-label="ICMP type mode"
                              disabled={icmpView.type.modeDisabled}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpTypeMode(
                                  event.target.value as ProfileWorkbenchStream["icmp_type_mode"]
                                )
                              }
                              value={icmpView.type.mode}
                            >
                              {icmpView.type.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Type count
                            <input
                              aria-label="ICMP type count"
                              disabled={icmpView.type.countDisabled}
                              max={256}
                              min={2}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpTypeCount(inputNumberValue(event))
                              }
                              type="number"
                              value={icmpView.type.countValue}
                            />
                          </label>
                          <label>
                            Type step
                            <input
                              aria-label="ICMP type step"
                              disabled={icmpView.type.stepDisabled}
                              max={255}
                              min={1}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpTypeStep(inputNumberValue(event))
                              }
                              type="number"
                              value={icmpView.type.stepValue}
                            />
                          </label>
                          <label>
                            Code
                            <input
                              aria-label="ICMP code"
                              min={0}
                              max={255}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpCode(inputNumberValue(event))
                              }
                              type="number"
                              value={icmpView.code.value}
                            />
                          </label>
                          <label>
                            Code mode
                            <select
                              aria-label="ICMP code mode"
                              disabled={icmpView.code.modeDisabled}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpCodeMode(
                                  event.target.value as ProfileWorkbenchStream["icmp_code_mode"]
                                )
                              }
                              value={icmpView.code.mode}
                            >
                              {icmpView.code.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Code count
                            <input
                              aria-label="ICMP code count"
                              disabled={icmpView.code.countDisabled}
                              max={256}
                              min={2}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpCodeCount(inputNumberValue(event))
                              }
                              type="number"
                              value={icmpView.code.countValue}
                            />
                          </label>
                          <label>
                            Code step
                            <input
                              aria-label="ICMP code step"
                              disabled={icmpView.code.stepDisabled}
                              max={255}
                              min={1}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpCodeStep(inputNumberValue(event))
                              }
                              type="number"
                              value={icmpView.code.stepValue}
                            />
                          </label>
                          {!isIcmpv6ControlStream(selectedStream) ? (
                            <>
                              <label>
                                Identifier
                                <input
                                  aria-label="ICMP identifier"
                                  min={0}
                                  max={65535}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpIdentifier(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.identifier.value}
                                />
                              </label>
                              <label>
                                Identifier mode
                                <select
                                  aria-label="ICMP identifier mode"
                                  disabled={icmpView.identifier.modeDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpIdentifierMode(
                                      event.target.value as ProfileWorkbenchStream["icmp_identifier_mode"]
                                    )
                                  }
                                  value={icmpView.identifier.mode}
                                >
                                  {icmpView.identifier.modeOptions.map((mode) => (
                                    <option key={mode} value={mode}>{mode}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Identifier count
                                <input
                                  aria-label="ICMP identifier count"
                                  disabled={icmpView.identifier.countDisabled}
                                  max={65536}
                                  min={2}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpIdentifierCount(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.identifier.countValue}
                                />
                              </label>
                              <label>
                                Identifier step
                                <input
                                  aria-label="ICMP identifier step"
                                  disabled={icmpView.identifier.stepDisabled}
                                  max={65535}
                                  min={1}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpIdentifierStep(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.identifier.stepValue}
                                />
                              </label>
                              <label>
                                Sequence
                                <input
                                  aria-label="ICMP sequence"
                                  min={0}
                                  max={65535}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpSequence(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.sequence.value}
                                />
                              </label>
                              <label>
                                Sequence mode
                                <select
                                  aria-label="ICMP sequence mode"
                                  disabled={icmpView.sequence.modeDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpSequenceMode(
                                      event.target.value as ProfileWorkbenchStream["icmp_sequence_mode"]
                                    )
                                  }
                                  value={icmpView.sequence.mode}
                                >
                                  {icmpView.sequence.modeOptions.map((mode) => (
                                    <option key={mode} value={mode}>{mode}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Sequence count
                                <input
                                  aria-label="ICMP sequence count"
                                  disabled={icmpView.sequence.countDisabled}
                                  max={65536}
                                  min={2}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpSequenceCount(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.sequence.countValue}
                                />
                              </label>
                              <label>
                                Sequence step
                                <input
                                  aria-label="ICMP sequence step"
                                  disabled={icmpView.sequence.stepDisabled}
                                  max={65535}
                                  min={1}
                                  onChange={(event) =>
                                    protocolDataIcmpHandlers.changeIcmpSequenceStep(inputNumberValue(event))
                                  }
                                  type="number"
                                  value={icmpView.sequence.stepValue}
                                />
                              </label>
                            </>
                          ) : null}
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override ICMP checksum"
                              checked={icmpView.checksumOverrideChecked}
                              disabled={icmpView.checksumOverrideDisabled}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpChecksumOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override checksum
                          </label>
                          <label>
                            Checksum
                            <input
                              aria-label="ICMP checksum"
                              disabled={icmpView.checksumValueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataIcmpHandlers.changeIcmpChecksum(event.target.value)
                              }
                              value={icmpView.checksumValue}
                            />
                          </label>
                          {isIcmpv6RsStream(selectedStream) && icmpv6RsView ? (
                            <>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="Include ICMPv6 RS source link-layer option"
                                  checked={icmpv6RsView.includeSllaChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RsSllaSelection(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Source link-layer option
                              </label>
                              <label>
                                Source MAC
                                <input
                                  aria-label="ICMPv6 RS source link-layer MAC"
                                  disabled={icmpv6RsView.sllaMacDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RsSllaMac(event.target.value)
                                  }
                                  value={icmpv6RsView.sllaMacValue}
                                />
                              </label>
                            </>
                          ) : null}
                          {isIcmpv6RaStream(selectedStream) && icmpv6RaView ? (
                            <>
                              <label>
                                Current hop limit
                                <input
                                  aria-label="ICMPv6 RA current hop limit"
                                  min={0}
                                  max={255}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaCurrentHopLimit(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.currentHopLimitValue}
                                />
                              </label>
                              <label>
                                Router lifetime
                                <input
                                  aria-label="ICMPv6 RA router lifetime"
                                  min={0}
                                  max={65535}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaRouterLifetime(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.routerLifetimeValue}
                                />
                              </label>
                              <label>
                                Reachable time
                                <input
                                  aria-label="ICMPv6 RA reachable time"
                                  min={0}
                                  max={4294967295}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaReachableTime(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.reachableTimeValue}
                                />
                              </label>
                              <label>
                                Retrans timer
                                <input
                                  aria-label="ICMPv6 RA retrans timer"
                                  min={0}
                                  max={4294967295}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaRetransTimer(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.retransTimerValue}
                                />
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="ICMPv6 RA managed flag"
                                  checked={icmpv6RaView.managedChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaManagedFlag(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Managed flag
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="ICMPv6 RA other flag"
                                  checked={icmpv6RaView.otherChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaOtherFlag(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Other flag
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="Include ICMPv6 RA source link-layer option"
                                  checked={icmpv6RaView.includeSllaChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaSllaSelection(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Source link-layer option
                              </label>
                              <label>
                                Source MAC
                                <input
                                  aria-label="ICMPv6 RA source link-layer MAC"
                                  disabled={icmpv6RaView.sllaMacDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaSllaMac(event.target.value)
                                  }
                                  value={icmpv6RaView.sllaMacValue}
                                />
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="Include ICMPv6 RA prefix information"
                                  checked={icmpv6RaView.includePrefixChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixSelection(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Prefix information
                              </label>
                              <label>
                                Prefix
                                <input
                                  aria-label="ICMPv6 RA prefix"
                                  disabled={icmpv6RaView.prefixDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefix(event.target.value)
                                  }
                                  value={icmpv6RaView.prefixValue}
                                />
                              </label>
                              <label>
                                Prefix length
                                <input
                                  aria-label="ICMPv6 RA prefix length"
                                  disabled={icmpv6RaView.prefixLengthDisabled}
                                  min={0}
                                  max={128}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixLength(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.prefixLengthValue}
                                />
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="ICMPv6 RA prefix on-link flag"
                                  checked={icmpv6RaView.prefixOnLinkChecked}
                                  disabled={icmpv6RaView.prefixOnLinkDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixOnLinkFlag(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                On-link flag
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="ICMPv6 RA prefix autonomous flag"
                                  checked={icmpv6RaView.prefixAutonomousChecked}
                                  disabled={icmpv6RaView.prefixAutonomousDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixAutonomousFlag(
                                      event.target.checked
                                    )
                                  }
                                  type="checkbox"
                                />
                                Autonomous flag
                              </label>
                              <label>
                                Valid lifetime
                                <input
                                  aria-label="ICMPv6 RA prefix valid lifetime"
                                  disabled={icmpv6RaView.prefixValidLifetimeDisabled}
                                  min={0}
                                  max={4294967295}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixValidLifetime(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.prefixValidLifetimeValue}
                                />
                              </label>
                              <label>
                                Preferred lifetime
                                <input
                                  aria-label="ICMPv6 RA prefix preferred lifetime"
                                  disabled={icmpv6RaView.prefixPreferredLifetimeDisabled}
                                  min={0}
                                  max={4294967295}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6RaPrefixPreferredLifetime(
                                      inputNumberValue(event)
                                    )
                                  }
                                  type="number"
                                  value={icmpv6RaView.prefixPreferredLifetimeValue}
                                />
                              </label>
                            </>
                          ) : null}
                          {isIcmpv6NdStream(selectedStream) && icmpv6NdView ? (
                            <>
                              <label>
                                ND target
                                <input
                                  aria-label="ICMPv6 ND target"
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6NdTarget(event.target.value)
                                  }
                                  value={icmpv6NdView.targetValue}
                                />
                              </label>
                              <label className="protocol-inline-checkbox">
                                <input
                                  aria-label="Include ICMPv6 ND option"
                                  checked={icmpv6NdView.includeOptionChecked}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6NdOptionSelection(event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                Include link-layer option
                              </label>
                              <label>
                                Option MAC
                                <input
                                  aria-label="ICMPv6 ND option MAC"
                                  disabled={icmpv6NdView.optionMacDisabled}
                                  onChange={(event) =>
                                    protocolDataIcmpv6Handlers.changeIcmpv6NdOptionMac(event.target.value)
                                  }
                                  value={icmpv6NdView.optionMacValue}
                                />
                              </label>
                              {icmpv6NdView.naFlagsVisible ? (
                                <>
                                  <label className="protocol-inline-checkbox">
                                    <input
                                      aria-label="ICMPv6 NA router flag"
                                      checked={icmpv6NdView.naRouterChecked}
                                      onChange={(event) =>
                                        protocolDataIcmpv6Handlers.changeIcmpv6NdNaRouterFlag(event.target.checked)
                                      }
                                      type="checkbox"
                                    />
                                    Router flag
                                  </label>
                                  <label className="protocol-inline-checkbox">
                                    <input
                                      aria-label="ICMPv6 NA solicited flag"
                                      checked={icmpv6NdView.naSolicitedChecked}
                                      onChange={(event) =>
                                        protocolDataIcmpv6Handlers.changeIcmpv6NdNaSolicitedFlag(
                                          event.target.checked
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    Solicited flag
                                  </label>
                                  <label className="protocol-inline-checkbox">
                                    <input
                                      aria-label="ICMPv6 NA override flag"
                                      checked={icmpv6NdView.naOverrideChecked}
                                      onChange={(event) =>
                                        protocolDataIcmpv6Handlers.changeIcmpv6NdNaOverrideFlag(
                                          event.target.checked
                                        )
                                      }
                                      type="checkbox"
                                    />
                                    Override flag
                                  </label>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      ) : protocolName(selectedStream.packet_type) === "UDP" && udpView && dnsView && dhcpView ? (
                        <>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override UDP length"
                              checked={udpView.lengthOverrideChecked}
                              disabled={udpView.lengthOverrideDisabled}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpLengthOverrideSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override length
                          </label>
                          <label>
                            Length
                            <input
                              aria-label="UDP length"
                              disabled={udpView.lengthValueDisabled}
                              min={8}
                              max={65535}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpLength(inputNumberValue(event))
                              }
                              type="number"
                              value={udpView.lengthValue}
                            />
                          </label>
                          <label>
                            Length mode
                            <select
                              aria-label="UDP length mode"
                              disabled={udpView.lengthModeDisabled}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpLengthMode(
                                  event.target.value as ProfileWorkbenchStream["udp_length_mode"]
                                )
                              }
                              value={udpView.lengthMode}
                            >
                              {udpView.lengthModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Length count
                            <input
                              aria-label="UDP length count"
                              disabled={udpView.lengthCountDisabled}
                              min={2}
                              max={65528}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpLengthCount(inputNumberValue(event))
                              }
                              type="number"
                              value={udpView.lengthCountValue}
                            />
                          </label>
                          <label>
                            Length step
                            <input
                              aria-label="UDP length step"
                              disabled={udpView.lengthStepDisabled}
                              min={1}
                              max={65527}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpLengthStep(inputNumberValue(event))
                              }
                              type="number"
                              value={udpView.lengthStepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override UDP checksum"
                              checked={udpView.checksumOverrideChecked}
                              disabled={udpView.checksumOverrideDisabled}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpChecksumOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override checksum
                          </label>
                          <label>
                            Checksum
                            <input
                              aria-label="UDP checksum"
                              disabled={udpView.checksumValueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpChecksum(event.target.value)
                              }
                              value={udpView.checksumValue}
                            />
                          </label>
                          <label>
                            Checksum mode
                            <select
                              aria-label="UDP checksum mode"
                              disabled={udpView.checksumModeDisabled}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpChecksumMode(
                                  event.target.value as ProfileWorkbenchStream["udp_checksum_mode"]
                                )
                              }
                              value={udpView.checksumMode}
                            >
                              {udpView.checksumModeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Checksum count
                            <input
                              aria-label="UDP checksum count"
                              disabled={udpView.checksumCountDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpChecksumCount(inputNumberValue(event))
                              }
                              type="number"
                              value={udpView.checksumCountValue}
                            />
                          </label>
                          <label>
                            Checksum step
                            <input
                              aria-label="UDP checksum step"
                              disabled={udpView.checksumStepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataUdpHandlers.changeUdpChecksumStep(inputNumberValue(event))
                              }
                              type="number"
                              value={udpView.checksumStepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Enable DNS query"
                              checked={dnsView.queryEnabledChecked}
                              disabled={dnsView.queryEnabledDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            DNS query
                          </label>
                          <label>
                            Transaction ID
                            <input
                              aria-label="DNS transaction ID"
                              disabled={dnsView.transactionId.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsNumber("transaction-id", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.transactionId.value}
                            />
                          </label>
                          <label>
                            ID mode
                            <select
                              aria-label="DNS transaction ID mode"
                              disabled={dnsView.transactionId.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("transaction-id", event.target.value as ProfileWorkbenchStream["dns_transaction_id_mode"])
                              }
                              value={dnsView.transactionId.mode}
                            >
                              {dnsView.transactionId.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            ID count
                            <input
                              aria-label="DNS transaction ID count"
                              disabled={dnsView.transactionId.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("transaction-id", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.transactionId.countValue}
                            />
                          </label>
                          <label>
                            ID step
                            <input
                              aria-label="DNS transaction ID step"
                              disabled={dnsView.transactionId.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("transaction-id", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.transactionId.stepValue}
                            />
                          </label>
                          <label>
                            Flags
                            <input
                              aria-label="DNS flags"
                              disabled={dnsView.flags.valueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsText("flags", event.target.value)
                              }
                              value={dnsView.flags.value}
                            />
                          </label>
                          <label>
                            Flags mode
                            <select
                              aria-label="DNS flags mode"
                              disabled={dnsView.flags.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("flags", event.target.value as ProfileWorkbenchStream["dns_flags_mode"])
                              }
                              value={dnsView.flags.mode}
                            >
                              {dnsView.flags.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Flags count
                            <input
                              aria-label="DNS flags count"
                              disabled={dnsView.flags.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.flags.countValue}
                            />
                          </label>
                          <label>
                            Flags step
                            <input
                              aria-label="DNS flags step"
                              disabled={dnsView.flags.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.flags.stepValue}
                            />
                          </label>
                          <label>
                            Query name
                            <input
                              aria-label="DNS query name"
                              disabled={dnsView.queryNameDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsText("query-name", event.target.value)
                              }
                              value={dnsView.queryNameValue}
                            />
                          </label>
                          <label>
                            Query type
                            <input
                              aria-label="DNS query type"
                              disabled={dnsView.queryType.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsNumber("query-type", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryType.value}
                            />
                          </label>
                          <label>
                            Type mode
                            <select
                              aria-label="DNS query type mode"
                              disabled={dnsView.queryType.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("query-type", event.target.value as ProfileWorkbenchStream["dns_query_type_mode"])
                              }
                              value={dnsView.queryType.mode}
                            >
                              {dnsView.queryType.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Type count
                            <input
                              aria-label="DNS query type count"
                              disabled={dnsView.queryType.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("query-type", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryType.countValue}
                            />
                          </label>
                          <label>
                            Type step
                            <input
                              aria-label="DNS query type step"
                              disabled={dnsView.queryType.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("query-type", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryType.stepValue}
                            />
                          </label>
                          <label>
                            Query class
                            <input
                              aria-label="DNS query class"
                              disabled={dnsView.queryClass.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsNumber("query-class", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryClass.value}
                            />
                          </label>
                          <label>
                            Class mode
                            <select
                              aria-label="DNS query class mode"
                              disabled={dnsView.queryClass.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("query-class", event.target.value as ProfileWorkbenchStream["dns_query_class_mode"])
                              }
                              value={dnsView.queryClass.mode}
                            >
                              {dnsView.queryClass.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Class count
                            <input
                              aria-label="DNS query class count"
                              disabled={dnsView.queryClass.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("query-class", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryClass.countValue}
                            />
                          </label>
                          <label>
                            Class step
                            <input
                              aria-label="DNS query class step"
                              disabled={dnsView.queryClass.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("query-class", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.queryClass.stepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Enable DNS answer"
                              checked={dnsView.answerEnabledChecked}
                              disabled={dnsView.answerEnabledDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsAnswerSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            DNS answer
                          </label>
                          <label>
                            Answer TTL
                            <input
                              aria-label="DNS answer TTL"
                              disabled={dnsView.answerTtl.valueDisabled}
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsNumber("answer-ttl", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.answerTtl.value}
                            />
                          </label>
                          <label>
                            TTL mode
                            <select
                              aria-label="DNS answer TTL mode"
                              disabled={dnsView.answerTtl.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("answer-ttl", event.target.value as ProfileWorkbenchStream["dns_answer_ttl_mode"])
                              }
                              value={dnsView.answerTtl.mode}
                            >
                              {dnsView.answerTtl.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            TTL count
                            <input
                              aria-label="DNS answer TTL count"
                              disabled={dnsView.answerTtl.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("answer-ttl", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.answerTtl.countValue}
                            />
                          </label>
                          <label>
                            TTL step
                            <input
                              aria-label="DNS answer TTL step"
                              disabled={dnsView.answerTtl.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("answer-ttl", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.answerTtl.stepValue}
                            />
                          </label>
                          <label>
                            Answer IPv4
                            <input
                              aria-label="DNS answer IPv4"
                              disabled={dnsView.answerIpv4.valueDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsText("answer-ipv4", event.target.value)
                              }
                              value={dnsView.answerIpv4.value}
                            />
                          </label>
                          <label>
                            IPv4 mode
                            <select
                              aria-label="DNS answer IPv4 mode"
                              disabled={dnsView.answerIpv4.modeDisabled}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsMode("answer-ipv4", event.target.value as ProfileWorkbenchStream["dns_answer_ipv4_mode"])
                              }
                              value={dnsView.answerIpv4.mode}
                            >
                              {dnsView.answerIpv4.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            IPv4 count
                            <input
                              aria-label="DNS answer IPv4 count"
                              disabled={dnsView.answerIpv4.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsCount("answer-ipv4", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.answerIpv4.countValue}
                            />
                          </label>
                          <label>
                            IPv4 step
                            <input
                              aria-label="DNS answer IPv4 step"
                              disabled={dnsView.answerIpv4.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDnsHandlers.changeDnsStep("answer-ipv4", inputNumberValue(event))
                              }
                              type="number"
                              value={dnsView.answerIpv4.stepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Enable DHCP message"
                              checked={dhcpView.messageEnabledChecked}
                              disabled={dhcpView.messageEnabledDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpSelection(event.target.checked)
                              }
                              type="checkbox"
                            />
                            DHCP message
                          </label>
                          <label>
                            Operation
                            <select
                              aria-label="DHCP operation"
                              disabled={dhcpView.operation.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpNumber("operation", inputNumberValue(event))
                              }
                              value={dhcpView.operation.value}
                            >
                              <option value={1}>Request</option>
                              <option value={2}>Reply</option>
                            </select>
                          </label>
                          <label>
                            Operation mode
                            <select
                              aria-label="DHCP operation mode"
                              disabled={dhcpView.operation.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("operation", event.target.value as ProfileWorkbenchStream["dhcp_operation_mode"])
                              }
                              value={dhcpView.operation.mode}
                            >
                              {dhcpView.operation.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Operation count
                            <input
                              aria-label="DHCP operation count"
                              disabled={dhcpView.operation.countDisabled}
                              min={2}
                              max={256}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("operation", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.operation.countValue}
                            />
                          </label>
                          <label>
                            Operation step
                            <input
                              aria-label="DHCP operation step"
                              disabled={dhcpView.operation.stepDisabled}
                              min={1}
                              max={255}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("operation", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.operation.stepValue}
                            />
                          </label>
                          <label>
                            Hops
                            <input
                              aria-label="DHCP hops"
                              disabled={dhcpView.hops.valueDisabled}
                              min={0}
                              max={255}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpNumber("hops", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.hops.value}
                            />
                          </label>
                          <label>
                            Hops mode
                            <select
                              aria-label="DHCP hops mode"
                              disabled={dhcpView.hops.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("hops", event.target.value as ProfileWorkbenchStream["dhcp_hops_mode"])
                              }
                              value={dhcpView.hops.mode}
                            >
                              {dhcpView.hops.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Hops count
                            <input
                              aria-label="DHCP hops count"
                              disabled={dhcpView.hops.countDisabled}
                              min={2}
                              max={256}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("hops", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.hops.countValue}
                            />
                          </label>
                          <label>
                            Hops step
                            <input
                              aria-label="DHCP hops step"
                              disabled={dhcpView.hops.stepDisabled}
                              min={1}
                              max={255}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("hops", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.hops.stepValue}
                            />
                          </label>
                          <label>
                            Seconds
                            <input
                              aria-label="DHCP seconds"
                              disabled={dhcpView.seconds.valueDisabled}
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpNumber("seconds", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.seconds.value}
                            />
                          </label>
                          <label>
                            Seconds mode
                            <select
                              aria-label="DHCP seconds mode"
                              disabled={dhcpView.seconds.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("seconds", event.target.value as ProfileWorkbenchStream["dhcp_seconds_mode"])
                              }
                              value={dhcpView.seconds.mode}
                            >
                              {dhcpView.seconds.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Seconds count
                            <input
                              aria-label="DHCP seconds count"
                              disabled={dhcpView.seconds.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("seconds", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.seconds.countValue}
                            />
                          </label>
                          <label>
                            Seconds step
                            <input
                              aria-label="DHCP seconds step"
                              disabled={dhcpView.seconds.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("seconds", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.seconds.stepValue}
                            />
                          </label>
                          <label>
                            Message type
                            <select
                              aria-label="DHCP message type"
                              disabled={dhcpView.messageType.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpNumber("message-type", inputNumberValue(event))
                              }
                              value={dhcpView.messageType.value}
                            >
                              <option value={1}>Discover</option>
                              <option value={2}>Offer</option>
                              <option value={3}>Request</option>
                              <option value={4}>Decline</option>
                              <option value={5}>Ack</option>
                              <option value={6}>Nak</option>
                              <option value={7}>Release</option>
                              <option value={8}>Inform</option>
                            </select>
                          </label>
                          <label>
                            Message type mode
                            <select
                              aria-label="DHCP message type mode"
                              disabled={dhcpView.messageType.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("message-type", event.target.value as ProfileWorkbenchStream["dhcp_message_type_mode"])
                              }
                              value={dhcpView.messageType.mode}
                            >
                              {dhcpView.messageType.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Message type count
                            <input
                              aria-label="DHCP message type count"
                              disabled={dhcpView.messageType.countDisabled}
                              min={2}
                              max={255}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("message-type", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.messageType.countValue}
                            />
                          </label>
                          <label>
                            Message type step
                            <input
                              aria-label="DHCP message type step"
                              disabled={dhcpView.messageType.stepDisabled}
                              min={1}
                              max={254}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("message-type", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.messageType.stepValue}
                            />
                          </label>
                          <label>
                            XID
                            <input
                              aria-label="DHCP XID"
                              disabled={dhcpView.xid.valueDisabled}
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpNumber("xid", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.xid.value}
                            />
                          </label>
                          <label>
                            XID mode
                            <select
                              aria-label="DHCP XID mode"
                              disabled={dhcpView.xid.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("xid", event.target.value as ProfileWorkbenchStream["dhcp_xid_mode"])
                              }
                              value={dhcpView.xid.mode}
                            >
                              {dhcpView.xid.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            XID count
                            <input
                              aria-label="DHCP XID count"
                              disabled={dhcpView.xid.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("xid", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.xid.countValue}
                            />
                          </label>
                          <label>
                            XID step
                            <input
                              aria-label="DHCP XID step"
                              disabled={dhcpView.xid.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("xid", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.xid.stepValue}
                            />
                          </label>
                          <label>
                            Flags
                            <input
                              aria-label="DHCP flags"
                              disabled={dhcpView.flags.valueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpText("flags", event.target.value)
                              }
                              value={dhcpView.flags.value}
                            />
                          </label>
                          <label>
                            Flags mode
                            <select
                              aria-label="DHCP flags mode"
                              disabled={dhcpView.flags.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpMode("flags", event.target.value as ProfileWorkbenchStream["dhcp_flags_mode"])
                              }
                              value={dhcpView.flags.mode}
                            >
                              {dhcpView.flags.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Flags count
                            <input
                              aria-label="DHCP flags count"
                              disabled={dhcpView.flags.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpCount("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.flags.countValue}
                            />
                          </label>
                          <label>
                            Flags step
                            <input
                              aria-label="DHCP flags step"
                              disabled={dhcpView.flags.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpStep("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.flags.stepValue}
                            />
                          </label>
                          <label>
                            Client IP
                            <input
                              aria-label="DHCP client IP"
                              disabled={dhcpView.clientIp.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressText("client-ip", event.target.value)
                              }
                              value={dhcpView.clientIp.value}
                            />
                          </label>
                          <label>
                            Client IP mode
                            <select
                              aria-label="DHCP client IP mode"
                              disabled={dhcpView.clientIp.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressMode("client-ip", event.target.value as ProfileWorkbenchStream["dhcp_client_ip_mode"])
                              }
                              value={dhcpView.clientIp.mode}
                            >
                              {dhcpView.clientIp.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Client IP count
                            <input
                              aria-label="DHCP client IP count"
                              disabled={dhcpView.clientIp.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressCount("client-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.clientIp.countValue}
                            />
                          </label>
                          <label>
                            Client IP step
                            <input
                              aria-label="DHCP client IP step"
                              disabled={dhcpView.clientIp.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressStep("client-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.clientIp.stepValue}
                            />
                          </label>
                          <label>
                            Your IP
                            <input
                              aria-label="DHCP your IP"
                              disabled={dhcpView.yourIp.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressText("your-ip", event.target.value)
                              }
                              value={dhcpView.yourIp.value}
                            />
                          </label>
                          <label>
                            Your IP mode
                            <select
                              aria-label="DHCP your IP mode"
                              disabled={dhcpView.yourIp.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressMode("your-ip", event.target.value as ProfileWorkbenchStream["dhcp_your_ip_mode"])
                              }
                              value={dhcpView.yourIp.mode}
                            >
                              {dhcpView.yourIp.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Your IP count
                            <input
                              aria-label="DHCP your IP count"
                              disabled={dhcpView.yourIp.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressCount("your-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.yourIp.countValue}
                            />
                          </label>
                          <label>
                            Your IP step
                            <input
                              aria-label="DHCP your IP step"
                              disabled={dhcpView.yourIp.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressStep("your-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.yourIp.stepValue}
                            />
                          </label>
                          <label>
                            Server IP
                            <input
                              aria-label="DHCP server IP"
                              disabled={dhcpView.serverIp.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressText("server-ip", event.target.value)
                              }
                              value={dhcpView.serverIp.value}
                            />
                          </label>
                          <label>
                            Server IP mode
                            <select
                              aria-label="DHCP server IP mode"
                              disabled={dhcpView.serverIp.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressMode("server-ip", event.target.value as ProfileWorkbenchStream["dhcp_server_ip_mode"])
                              }
                              value={dhcpView.serverIp.mode}
                            >
                              {dhcpView.serverIp.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Server IP count
                            <input
                              aria-label="DHCP server IP count"
                              disabled={dhcpView.serverIp.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressCount("server-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.serverIp.countValue}
                            />
                          </label>
                          <label>
                            Server IP step
                            <input
                              aria-label="DHCP server IP step"
                              disabled={dhcpView.serverIp.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressStep("server-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.serverIp.stepValue}
                            />
                          </label>
                          <label>
                            Relay IP
                            <input
                              aria-label="DHCP relay IP"
                              disabled={dhcpView.relayIp.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressText("relay-ip", event.target.value)
                              }
                              value={dhcpView.relayIp.value}
                            />
                          </label>
                          <label>
                            Relay IP mode
                            <select
                              aria-label="DHCP relay IP mode"
                              disabled={dhcpView.relayIp.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressMode("relay-ip", event.target.value as ProfileWorkbenchStream["dhcp_relay_ip_mode"])
                              }
                              value={dhcpView.relayIp.mode}
                            >
                              {dhcpView.relayIp.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Relay IP count
                            <input
                              aria-label="DHCP relay IP count"
                              disabled={dhcpView.relayIp.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressCount("relay-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.relayIp.countValue}
                            />
                          </label>
                          <label>
                            Relay IP step
                            <input
                              aria-label="DHCP relay IP step"
                              disabled={dhcpView.relayIp.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressStep("relay-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.relayIp.stepValue}
                            />
                          </label>
                          <label>
                            Client MAC
                            <input
                              aria-label="DHCP client MAC"
                              disabled={dhcpView.clientMac.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressText("client-mac", event.target.value)
                              }
                              value={dhcpView.clientMac.value}
                            />
                          </label>
                          <label>
                            Client MAC mode
                            <select
                              aria-label="DHCP client MAC mode"
                              disabled={dhcpView.clientMac.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressMode("client-mac", event.target.value as ProfileWorkbenchStream["dhcp_client_mac_mode"])
                              }
                              value={dhcpView.clientMac.mode}
                            >
                              {dhcpView.clientMac.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Client MAC count
                            <input
                              aria-label="DHCP client MAC count"
                              disabled={dhcpView.clientMac.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressCount("client-mac", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.clientMac.countValue}
                            />
                          </label>
                          <label>
                            Client MAC step
                            <input
                              aria-label="DHCP client MAC step"
                              disabled={dhcpView.clientMac.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpBootpAddressStep("client-mac", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.clientMac.stepValue}
                            />
                          </label>
                          <label>
                            Hostname
                            <input
                              aria-label="DHCP hostname"
                              disabled={dhcpView.hostnameDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionText("hostname", event.target.value)
                              }
                              value={dhcpView.hostnameValue}
                            />
                          </label>
                          <label>
                            Parameter request list
                            <input
                              aria-label="DHCP parameter request list"
                              disabled={dhcpView.parameterRequestListDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionText("parameter-request-list", event.target.value)
                              }
                              value={dhcpView.parameterRequestListValue}
                            />
                          </label>
                          <label>
                            Lease time
                            <input
                              aria-label="DHCP lease time"
                              disabled={dhcpView.leaseTime.valueDisabled}
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerNumber("lease-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.leaseTime.value}
                            />
                          </label>
                          <label>
                            Lease time mode
                            <select
                              aria-label="DHCP lease time mode"
                              disabled={dhcpView.leaseTime.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerMode("lease-time", event.target.value as ProfileWorkbenchStream["dhcp_lease_time_mode"])
                              }
                              value={dhcpView.leaseTime.mode}
                            >
                              {dhcpView.leaseTime.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Lease time count
                            <input
                              aria-label="DHCP lease time count"
                              disabled={dhcpView.leaseTime.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerCount("lease-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.leaseTime.countValue}
                            />
                          </label>
                          <label>
                            Lease time step
                            <input
                              aria-label="DHCP lease time step"
                              disabled={dhcpView.leaseTime.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerStep("lease-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.leaseTime.stepValue}
                            />
                          </label>
                          <label>
                            Renewal time
                            <input
                              aria-label="DHCP renewal time"
                              disabled={dhcpView.renewalTime.valueDisabled}
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerNumber("renewal-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.renewalTime.value}
                            />
                          </label>
                          <label>
                            Renewal time mode
                            <select
                              aria-label="DHCP renewal time mode"
                              disabled={dhcpView.renewalTime.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerMode("renewal-time", event.target.value as ProfileWorkbenchStream["dhcp_renewal_time_mode"])
                              }
                              value={dhcpView.renewalTime.mode}
                            >
                              {dhcpView.renewalTime.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Renewal time count
                            <input
                              aria-label="DHCP renewal time count"
                              disabled={dhcpView.renewalTime.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerCount("renewal-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.renewalTime.countValue}
                            />
                          </label>
                          <label>
                            Renewal time step
                            <input
                              aria-label="DHCP renewal time step"
                              disabled={dhcpView.renewalTime.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerStep("renewal-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.renewalTime.stepValue}
                            />
                          </label>
                          <label>
                            Rebinding time
                            <input
                              aria-label="DHCP rebinding time"
                              disabled={dhcpView.rebindingTime.valueDisabled}
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerNumber("rebinding-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.rebindingTime.value}
                            />
                          </label>
                          <label>
                            Rebinding time mode
                            <select
                              aria-label="DHCP rebinding time mode"
                              disabled={dhcpView.rebindingTime.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerMode("rebinding-time", event.target.value as ProfileWorkbenchStream["dhcp_rebinding_time_mode"])
                              }
                              value={dhcpView.rebindingTime.mode}
                            >
                              {dhcpView.rebindingTime.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Rebinding time count
                            <input
                              aria-label="DHCP rebinding time count"
                              disabled={dhcpView.rebindingTime.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerCount("rebinding-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.rebindingTime.countValue}
                            />
                          </label>
                          <label>
                            Rebinding time step
                            <input
                              aria-label="DHCP rebinding time step"
                              disabled={dhcpView.rebindingTime.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionTimerStep("rebinding-time", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.rebindingTime.stepValue}
                            />
                          </label>
                          <label>
                            Requested IP
                            <input
                              aria-label="DHCP requested IP"
                              disabled={dhcpView.requestedIp.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressText("requested-ip", event.target.value)
                              }
                              value={dhcpView.requestedIp.value}
                            />
                          </label>
                          <label>
                            Requested IP mode
                            <select
                              aria-label="DHCP requested IP mode"
                              disabled={dhcpView.requestedIp.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressMode("requested-ip", event.target.value as ProfileWorkbenchStream["dhcp_requested_ip_mode"])
                              }
                              value={dhcpView.requestedIp.mode}
                            >
                              {dhcpView.requestedIp.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Requested IP count
                            <input
                              aria-label="DHCP requested IP count"
                              disabled={dhcpView.requestedIp.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressCount("requested-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.requestedIp.countValue}
                            />
                          </label>
                          <label>
                            Requested IP step
                            <input
                              aria-label="DHCP requested IP step"
                              disabled={dhcpView.requestedIp.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressStep("requested-ip", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.requestedIp.stepValue}
                            />
                          </label>
                          <label>
                            Server ID
                            <input
                              aria-label="DHCP server ID"
                              disabled={dhcpView.serverId.valueDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressText("server-id", event.target.value)
                              }
                              value={dhcpView.serverId.value}
                            />
                          </label>
                          <label>
                            Server ID mode
                            <select
                              aria-label="DHCP server ID mode"
                              disabled={dhcpView.serverId.modeDisabled}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressMode("server-id", event.target.value as ProfileWorkbenchStream["dhcp_server_id_mode"])
                              }
                              value={dhcpView.serverId.mode}
                            >
                              {dhcpView.serverId.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Server ID count
                            <input
                              aria-label="DHCP server ID count"
                              disabled={dhcpView.serverId.countDisabled}
                              min={2}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressCount("server-id", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.serverId.countValue}
                            />
                          </label>
                          <label>
                            Server ID step
                            <input
                              aria-label="DHCP server ID step"
                              disabled={dhcpView.serverId.stepDisabled}
                              min={1}
                              max={100000000}
                              onChange={(event) =>
                                protocolDataDhcpHandlers.changeDhcpOptionAddressStep("server-id", inputNumberValue(event))
                              }
                              type="number"
                              value={dhcpView.serverId.stepValue}
                            />
                          </label>
                        </>
                      ) : protocolName(selectedStream.packet_type) === "SCTP" && sctpView ? (
                        <>
                          <label>
                            Verification tag
                            <input
                              aria-label="SCTP verification tag"
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("verification-tag", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.verificationTag.value}
                            />
                          </label>
                          <label>
                            Verification tag mode
                            <select
                              aria-label="SCTP verification tag mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("verification-tag", event.target.value as ProfileWorkbenchStream["sctp_verification_tag_mode"])
                              }
                              value={sctpView.verificationTag.mode}
                            >
                              {sctpView.verificationTag.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Verification tag count
                            <input
                              aria-label="SCTP verification tag count"
                              disabled={sctpView.verificationTag.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("verification-tag", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.verificationTag.countValue}
                            />
                          </label>
                          <label>
                            Verification tag step
                            <input
                              aria-label="SCTP verification tag step"
                              disabled={sctpView.verificationTag.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("verification-tag", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.verificationTag.stepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override SCTP checksum"
                              checked={sctpView.checksumOverrideChecked}
                              disabled={sctpView.checksumOverrideDisabled}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpChecksumOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override checksum
                          </label>
                          <label>
                            Checksum
                            <input
                              aria-label="SCTP checksum"
                              disabled={sctpView.checksumValueDisabled}
                              maxLength={8}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpChecksum(event.target.value)
                              }
                              value={sctpView.checksumValue}
                            />
                          </label>
                          <label>
                            Data flags
                            <input
                              aria-label="SCTP data flags"
                              min={0}
                              max={255}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("data-flags", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.dataFlags.value}
                            />
                          </label>
                          <label>
                            Data flags mode
                            <select
                              aria-label="SCTP data flags mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("data-flags", event.target.value as ProfileWorkbenchStream["sctp_data_flags_mode"])
                              }
                              value={sctpView.dataFlags.mode}
                            >
                              {sctpView.dataFlags.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Data flags count
                            <input
                              aria-label="SCTP data flags count"
                              disabled={sctpView.dataFlags.countDisabled}
                              min={2}
                              max={256}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("data-flags", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.dataFlags.countValue}
                            />
                          </label>
                          <label>
                            Data flags step
                            <input
                              aria-label="SCTP data flags step"
                              disabled={sctpView.dataFlags.stepDisabled}
                              min={1}
                              max={255}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("data-flags", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.dataFlags.stepValue}
                            />
                          </label>
                          <label>
                            TSN
                            <input
                              aria-label="SCTP TSN"
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("tsn", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.tsn.value}
                            />
                          </label>
                          <label>
                            TSN mode
                            <select
                              aria-label="SCTP TSN mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("tsn", event.target.value as ProfileWorkbenchStream["sctp_tsn_mode"])
                              }
                              value={sctpView.tsn.mode}
                            >
                              {sctpView.tsn.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            TSN count
                            <input
                              aria-label="SCTP TSN count"
                              disabled={sctpView.tsn.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("tsn", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.tsn.countValue}
                            />
                          </label>
                          <label>
                            TSN step
                            <input
                              aria-label="SCTP TSN step"
                              disabled={sctpView.tsn.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("tsn", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.tsn.stepValue}
                            />
                          </label>
                          <label>
                            Stream ID
                            <input
                              aria-label="SCTP stream ID"
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("stream-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamId.value}
                            />
                          </label>
                          <label>
                            Stream ID mode
                            <select
                              aria-label="SCTP stream ID mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("stream-id", event.target.value as ProfileWorkbenchStream["sctp_stream_id_mode"])
                              }
                              value={sctpView.streamId.mode}
                            >
                              {sctpView.streamId.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Stream ID count
                            <input
                              aria-label="SCTP stream ID count"
                              disabled={sctpView.streamId.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("stream-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamId.countValue}
                            />
                          </label>
                          <label>
                            Stream ID step
                            <input
                              aria-label="SCTP stream ID step"
                              disabled={sctpView.streamId.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("stream-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamId.stepValue}
                            />
                          </label>
                          <label>
                            Stream sequence
                            <input
                              aria-label="SCTP stream sequence"
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("stream-sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamSequence.value}
                            />
                          </label>
                          <label>
                            Stream sequence mode
                            <select
                              aria-label="SCTP stream sequence mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("stream-sequence", event.target.value as ProfileWorkbenchStream["sctp_stream_sequence_mode"])
                              }
                              value={sctpView.streamSequence.mode}
                            >
                              {sctpView.streamSequence.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Stream sequence count
                            <input
                              aria-label="SCTP stream sequence count"
                              disabled={sctpView.streamSequence.countDisabled}
                              min={2}
                              max={65536}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("stream-sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamSequence.countValue}
                            />
                          </label>
                          <label>
                            Stream sequence step
                            <input
                              aria-label="SCTP stream sequence step"
                              disabled={sctpView.streamSequence.stepDisabled}
                              min={1}
                              max={65535}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("stream-sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.streamSequence.stepValue}
                            />
                          </label>
                          <label>
                            Payload protocol ID
                            <input
                              aria-label="SCTP payload protocol ID"
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpNumber("payload-protocol-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.payloadProtocolId.value}
                            />
                          </label>
                          <label>
                            Payload protocol ID mode
                            <select
                              aria-label="SCTP payload protocol ID mode"
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpMode("payload-protocol-id", event.target.value as ProfileWorkbenchStream["sctp_payload_protocol_id_mode"])
                              }
                              value={sctpView.payloadProtocolId.mode}
                            >
                              {sctpView.payloadProtocolId.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Payload protocol ID count
                            <input
                              aria-label="SCTP payload protocol ID count"
                              disabled={sctpView.payloadProtocolId.countDisabled}
                              min={2}
                              max={4294967296}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpCount("payload-protocol-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.payloadProtocolId.countValue}
                            />
                          </label>
                          <label>
                            Payload protocol ID step
                            <input
                              aria-label="SCTP payload protocol ID step"
                              disabled={sctpView.payloadProtocolId.stepDisabled}
                              min={1}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataSctpHandlers.changeSctpStep("payload-protocol-id", inputNumberValue(event))
                              }
                              type="number"
                              value={sctpView.payloadProtocolId.stepValue}
                            />
                          </label>
                        </>
                      ) : protocolName(selectedStream.packet_type) === "TCP" && tcpCoreView && tcpChecksumView && tcpUrgentFlagsView && tcpMssOptionView && tcpWindowScaleOptionView && tcpSackOptionView && tcpTimestampOptionView ? (
                        <>
                          <label>
                            Sequence number
                            <input
                              aria-label="TCP sequence number"
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreNumber("sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.sequence.value}
                            />
                          </label>
                          <label>
                            Sequence mode
                            <select
                              aria-label="TCP sequence mode"
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("sequence", event.target.value as ProfileWorkbenchStream["tcp_sequence_mode"])
                              }
                              value={tcpCoreView.sequence.mode}
                            >
                              {tcpCoreView.sequence.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Sequence count
                            <input
                              aria-label="TCP sequence count"
                              disabled={tcpCoreView.sequence.countDisabled}
                              max={4294967296}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.sequence.countValue}
                            />
                          </label>
                          <label>
                            Sequence step
                            <input
                              aria-label="TCP sequence step"
                              disabled={tcpCoreView.sequence.stepDisabled}
                              max={4294967295}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("sequence", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.sequence.stepValue}
                            />
                          </label>
                          <label>
                            Acknowledge number
                            <input
                              aria-label="TCP acknowledge number"
                              min={0}
                              max={4294967295}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreNumber("acknowledge", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.acknowledge.value}
                            />
                          </label>
                          <label>
                            Acknowledge mode
                            <select
                              aria-label="TCP acknowledge mode"
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("acknowledge", event.target.value as ProfileWorkbenchStream["tcp_ack_mode"])
                              }
                              value={tcpCoreView.acknowledge.mode}
                            >
                              {tcpCoreView.acknowledge.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Acknowledge count
                            <input
                              aria-label="TCP acknowledge count"
                              disabled={tcpCoreView.acknowledge.countDisabled}
                              max={4294967296}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("acknowledge", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.acknowledge.countValue}
                            />
                          </label>
                          <label>
                            Acknowledge step
                            <input
                              aria-label="TCP acknowledge step"
                              disabled={tcpCoreView.acknowledge.stepDisabled}
                              max={4294967295}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("acknowledge", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.acknowledge.stepValue}
                            />
                          </label>
                          <label>
                            Window
                            <input
                              aria-label="TCP window"
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreNumber("window", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.window.value}
                            />
                          </label>
                          <label>
                            Window mode
                            <select
                              aria-label="TCP window mode"
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("window", event.target.value as ProfileWorkbenchStream["tcp_window_mode"])
                              }
                              value={tcpCoreView.window.mode}
                            >
                              {tcpCoreView.window.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Window count
                            <input
                              aria-label="TCP window count"
                              disabled={tcpCoreView.window.countDisabled}
                              max={65536}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("window", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.window.countValue}
                            />
                          </label>
                          <label>
                            Window step
                            <input
                              aria-label="TCP window step"
                              disabled={tcpCoreView.window.stepDisabled}
                              max={65535}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("window", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpCoreView.window.stepValue}
                            />
                          </label>
                          <label className="protocol-inline-checkbox">
                            <input
                              aria-label="Override TCP checksum"
                              checked={tcpChecksumView.overrideChecked}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpChecksumOverride(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Override checksum
                          </label>
                          <label>
                            Checksum
                            <input
                              aria-label="TCP checksum"
                              disabled={tcpChecksumView.valueDisabled}
                              maxLength={4}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpChecksum(event.target.value)
                              }
                              value={tcpChecksumView.value}
                            />
                          </label>
                          <label>
                            Checksum mode
                            <select
                              aria-label="TCP checksum mode"
                              disabled={tcpChecksumView.modeDisabled}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("checksum", event.target.value as ProfileWorkbenchStream["tcp_checksum_mode"])
                              }
                              value={tcpChecksumView.mode}
                            >
                              {tcpChecksumView.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Checksum count
                            <input
                              aria-label="TCP checksum count"
                              disabled={tcpChecksumView.countDisabled}
                              max={65536}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("checksum", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpChecksumView.countValue}
                            />
                          </label>
                          <label>
                            Checksum step
                            <input
                              aria-label="TCP checksum step"
                              disabled={tcpChecksumView.stepDisabled}
                              max={65535}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("checksum", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpChecksumView.stepValue}
                            />
                          </label>
                          <div className="tcp-options-grid" aria-label="TCP options">
                            <span>TCP Options</span>
                            <label className="protocol-inline-checkbox">
                              <input
                                aria-label="Enable TCP MSS option"
                                checked={tcpMssOptionView.enabledChecked}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionSelection("mss", event.target.checked)
                                }
                                type="checkbox"
                              />
                              MSS
                            </label>
                            <label>
                              MSS value
                              <input
                                aria-label="TCP option MSS"
                                disabled={tcpMssOptionView.valueDisabled}
                                max={65535}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("mss", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpMssOptionView.value}
                              />
                            </label>
                            <label>
                              MSS mode
                              <select
                                aria-label="TCP option MSS mode"
                                disabled={tcpMssOptionView.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("mss", event.target.value as ProfileWorkbenchStream["tcp_option_mss_mode"])
                                }
                                value={tcpMssOptionView.mode}
                              >
                                {tcpMssOptionView.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              MSS count
                              <input
                                aria-label="TCP option MSS count"
                                disabled={tcpMssOptionView.countDisabled}
                                max={65536}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("mss", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpMssOptionView.countValue}
                              />
                            </label>
                            <label>
                              MSS step
                              <input
                                aria-label="TCP option MSS step"
                                disabled={tcpMssOptionView.stepDisabled}
                                max={65535}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("mss", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpMssOptionView.stepValue}
                              />
                            </label>
                            <label className="protocol-inline-checkbox">
                              <input
                                aria-label="Enable TCP Window Scale option"
                                checked={tcpWindowScaleOptionView.enabledChecked}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionSelection("window-scale", event.target.checked)
                                }
                                type="checkbox"
                              />
                              Window Scale
                            </label>
                            <label>
                              Scale
                              <input
                                aria-label="TCP option Window Scale"
                                disabled={tcpWindowScaleOptionView.valueDisabled}
                                max={14}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("window-scale", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpWindowScaleOptionView.value}
                              />
                            </label>
                            <label>
                              WS mode
                              <select
                                aria-label="TCP option Window Scale mode"
                                disabled={tcpWindowScaleOptionView.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("window-scale", event.target.value as ProfileWorkbenchStream["tcp_option_window_scale_mode"])
                                }
                                value={tcpWindowScaleOptionView.mode}
                              >
                                {tcpWindowScaleOptionView.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              WS count
                              <input
                                aria-label="TCP option Window Scale count"
                                disabled={tcpWindowScaleOptionView.countDisabled}
                                max={256}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("window-scale", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpWindowScaleOptionView.countValue}
                              />
                            </label>
                            <label>
                              WS step
                              <input
                                aria-label="TCP option Window Scale step"
                                disabled={tcpWindowScaleOptionView.stepDisabled}
                                max={255}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("window-scale", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpWindowScaleOptionView.stepValue}
                              />
                            </label>
                            <label className="protocol-inline-checkbox">
                              <input
                                aria-label="Enable TCP SACK Permitted option"
                                checked={tcpSackOptionView.permittedChecked}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionSelection("sack-permitted", event.target.checked)
                                }
                                type="checkbox"
                              />
                              SACK permitted
                            </label>
                            <label className="protocol-inline-checkbox">
                              <input
                                aria-label="Enable TCP SACK block option"
                                checked={tcpSackOptionView.blocksChecked}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionSelection("sack-block", event.target.checked)
                                }
                                type="checkbox"
                              />
                              SACK block
                            </label>
                            <label>
                              SACK left
                              <input
                                aria-label="TCP option SACK left edge"
                                disabled={tcpSackOptionView.left.valueDisabled}
                                max={4294967295}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("sack-left-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.left.value}
                              />
                            </label>
                            <label>
                              SACK left mode
                              <select
                                aria-label="TCP option SACK left edge mode"
                                disabled={tcpSackOptionView.left.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("sack-left-edge", event.target.value as ProfileWorkbenchStream["tcp_option_sack_left_edge_mode"])
                                }
                                value={tcpSackOptionView.left.mode}
                              >
                                {tcpSackOptionView.left.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              SACK left count
                              <input
                                aria-label="TCP option SACK left edge count"
                                disabled={tcpSackOptionView.left.countDisabled}
                                max={4294967296}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("sack-left-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.left.countValue}
                              />
                            </label>
                            <label>
                              SACK left step
                              <input
                                aria-label="TCP option SACK left edge step"
                                disabled={tcpSackOptionView.left.stepDisabled}
                                max={4294967295}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("sack-left-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.left.stepValue}
                              />
                            </label>
                            <label>
                              SACK right
                              <input
                                aria-label="TCP option SACK right edge"
                                disabled={tcpSackOptionView.right.valueDisabled}
                                max={4294967295}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("sack-right-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.right.value}
                              />
                            </label>
                            <label>
                              SACK right mode
                              <select
                                aria-label="TCP option SACK right edge mode"
                                disabled={tcpSackOptionView.right.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("sack-right-edge", event.target.value as ProfileWorkbenchStream["tcp_option_sack_right_edge_mode"])
                                }
                                value={tcpSackOptionView.right.mode}
                              >
                                {tcpSackOptionView.right.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              SACK right count
                              <input
                                aria-label="TCP option SACK right edge count"
                                disabled={tcpSackOptionView.right.countDisabled}
                                max={4294967296}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("sack-right-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.right.countValue}
                              />
                            </label>
                            <label>
                              SACK right step
                              <input
                                aria-label="TCP option SACK right edge step"
                                disabled={tcpSackOptionView.right.stepDisabled}
                                max={4294967295}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("sack-right-edge", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpSackOptionView.right.stepValue}
                              />
                            </label>
                            <label className="protocol-inline-checkbox">
                              <input
                                aria-label="Enable TCP Timestamp option"
                                checked={tcpTimestampOptionView.enabledChecked}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionSelection("timestamp", event.target.checked)
                                }
                                type="checkbox"
                              />
                              Timestamp
                            </label>
                            <label>
                              TS value
                              <input
                                aria-label="TCP option timestamp value"
                                disabled={tcpTimestampOptionView.value.valueDisabled}
                                max={4294967295}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("timestamp-value", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.value.value}
                              />
                            </label>
                            <label>
                              TS value mode
                              <select
                                aria-label="TCP option timestamp value mode"
                                disabled={tcpTimestampOptionView.value.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("timestamp-value", event.target.value as ProfileWorkbenchStream["tcp_option_timestamp_value_mode"])
                                }
                                value={tcpTimestampOptionView.value.mode}
                              >
                                {tcpTimestampOptionView.value.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              TS value count
                              <input
                                aria-label="TCP option timestamp value count"
                                disabled={tcpTimestampOptionView.value.countDisabled}
                                max={4294967296}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("timestamp-value", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.value.countValue}
                              />
                            </label>
                            <label>
                              TS value step
                              <input
                                aria-label="TCP option timestamp value step"
                                disabled={tcpTimestampOptionView.value.stepDisabled}
                                max={4294967295}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("timestamp-value", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.value.stepValue}
                              />
                            </label>
                            <label>
                              TS echo
                              <input
                                aria-label="TCP option timestamp echo"
                                disabled={tcpTimestampOptionView.echo.valueDisabled}
                                max={4294967295}
                                min={0}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionNumber("timestamp-echo", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.echo.value}
                              />
                            </label>
                            <label>
                              TS echo mode
                              <select
                                aria-label="TCP option timestamp echo mode"
                                disabled={tcpTimestampOptionView.echo.modeDisabled}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionMode("timestamp-echo", event.target.value as ProfileWorkbenchStream["tcp_option_timestamp_echo_mode"])
                                }
                                value={tcpTimestampOptionView.echo.mode}
                              >
                                {tcpTimestampOptionView.echo.modeOptions.map((mode) => (
                                  <option key={mode} value={mode}>{mode}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              TS echo count
                              <input
                                aria-label="TCP option timestamp echo count"
                                disabled={tcpTimestampOptionView.echo.countDisabled}
                                max={4294967296}
                                min={2}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionCount("timestamp-echo", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.echo.countValue}
                              />
                            </label>
                            <label>
                              TS echo step
                              <input
                                aria-label="TCP option timestamp echo step"
                                disabled={tcpTimestampOptionView.echo.stepDisabled}
                                max={4294967295}
                                min={1}
                                onChange={(event) =>
                                  protocolDataTcpHandlers.changeTcpOptionStep("timestamp-echo", inputNumberValue(event))
                                }
                                type="number"
                                value={tcpTimestampOptionView.echo.stepValue}
                              />
                            </label>
                          </div>
                          <label>
                            Urgent pointer
                            <input
                              aria-label="TCP urgent pointer"
                              min={0}
                              max={65535}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreNumber("urgent-pointer", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpUrgentFlagsView.urgentPointer.value}
                            />
                          </label>
                          <label>
                            Urgent pointer mode
                            <select
                              aria-label="TCP urgent pointer mode"
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("urgent-pointer", event.target.value as ProfileWorkbenchStream["tcp_urgent_pointer_mode"])
                              }
                              value={tcpUrgentFlagsView.urgentPointer.mode}
                            >
                              {tcpUrgentFlagsView.urgentPointer.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Urgent pointer count
                            <input
                              aria-label="TCP urgent pointer count"
                              disabled={tcpUrgentFlagsView.urgentPointer.countDisabled}
                              max={65536}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("urgent-pointer", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpUrgentFlagsView.urgentPointer.countValue}
                            />
                          </label>
                          <label>
                            Urgent pointer step
                            <input
                              aria-label="TCP urgent pointer step"
                              disabled={tcpUrgentFlagsView.urgentPointer.stepDisabled}
                              max={65535}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("urgent-pointer", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpUrgentFlagsView.urgentPointer.stepValue}
                            />
                          </label>
                          <div className="tcp-flags-row" aria-label="TCP flags">
                            <span>Flags</span>
                            {tcpUrgentFlagsView.flags.rows.map((flag) => (
                              <label key={flag.key}>
                                <input
                                  checked={flag.checked}
                                  onChange={(event) =>
                                    protocolDataTcpHandlers.changeTcpFlag(flag.key, event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                {flag.label}
                              </label>
                            ))}
                          </div>
                          <label>
                            Flags mode
                            <select
                              aria-label="TCP flags mode"
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreMode("flags", event.target.value as ProfileWorkbenchStream["tcp_flags_mode"])
                              }
                              value={tcpUrgentFlagsView.flags.mode}
                            >
                              {tcpUrgentFlagsView.flags.modeOptions.map((mode) => (
                                <option key={mode} value={mode}>{mode}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Flags count
                            <input
                              aria-label="TCP flags count"
                              disabled={tcpUrgentFlagsView.flags.countDisabled}
                              max={64}
                              min={2}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreCount("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpUrgentFlagsView.flags.countValue}
                            />
                          </label>
                          <label>
                            Flags step
                            <input
                              aria-label="TCP flags step"
                              disabled={tcpUrgentFlagsView.flags.stepDisabled}
                              max={63}
                              min={1}
                              onChange={(event) =>
                                protocolDataTcpHandlers.changeTcpCoreStep("flags", inputNumberValue(event))
                              }
                              type="number"
                              value={tcpUrgentFlagsView.flags.stepValue}
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </details>
                ) : null}
                {payloadSettingsView?.enabled ? (
                  <details>
                    <summary>{payloadPatternPanelView.summary}</summary>
                    <div className="protocol-data-form protocol-data-form--compact">
                      <label>
                        {payloadPatternPanelView.type.label}
                        <select
                          aria-label={payloadPatternPanelView.type.ariaLabel}
                          onChange={(event) =>
                            handlePayloadPatternTypeInputChange(
                              event.target.value as ProfileWorkbenchStream["payload_type"]
                            )
                          }
                          value={payloadSettingsView.type}
                        >
                          {payloadSettingsView.typeOptions.map((payloadType) => (
                            <option key={payloadType} value={payloadType}>{payloadType}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {payloadPatternPanelView.pattern.label}
                        <input
                          aria-label={payloadPatternPanelView.pattern.ariaLabel}
                          disabled={payloadSettingsView.patternDisabled}
                          onChange={(event) =>
                            handlePayloadPatternTextInputChange(event.target.value)
                          }
                          value={payloadSettingsView.patternValue}
                        />
                      </label>
                      <div className={payloadPatternFileControlView.className}>
                        <input
                          accept={payloadPatternFileControlView.fileInput.accept}
                          aria-label={payloadPatternFileControlView.fileInput.ariaLabel}
                          className={payloadPatternFileControlView.fileInput.className}
                          onChange={(event) => void handleImportPayloadPatternFileChange(event.target.files)}
                          ref={importPayloadPatternInputRef}
                          type="file"
                        />
                        <span aria-hidden="true" className={payloadPatternFileControlView.separator.className}>
                          {payloadPatternFileControlView.separator.text}
                        </span>
                        <button
                          className={payloadPatternFileControlView.button.className}
                          disabled={payloadSettingsView.patternDisabled || isProfileWorkbenchBusy}
                          onClick={() => importPayloadPatternInputRef.current?.click()}
                          title={payloadPatternFileControlView.button.title}
                          type="button"
                        >
                          <FileInput aria-hidden="true" size={payloadPatternFileControlView.button.iconSize} />
                          <span>{payloadPatternFileControlView.button.label}</span>
                        </button>
                        {payloadPatternImportStatus ? (
                          <span
                            className={payloadPatternImportStatusClassName(payloadPatternImportStatus)}
                            role={payloadPatternImportStatus.kind === "error" ? "alert" : "status"}
                          >
                            {payloadPatternImportStatus.text}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            {!selectedStreamAdvanced && effectiveEditorTab === "Advanced Settings" && advancedSettingsView ? (
              <div className={advancedSettingsPanelView.className}>
                <label>
                  {advancedSettingsPanelView.cacheSize.label}
                  <select
                    aria-label={advancedSettingsPanelView.cacheSize.ariaLabel}
                    onChange={(event) =>
                      handleAdvancedCacheSizeTypeChange(
                        event.target.value as ProfileWorkbenchStream["advanced_cache_size_type"]
                      )
                    }
                    value={advancedSettingsView.cacheSizeType}
                  >
                    {advancedSettingsView.cacheSizeTypeOptions.map((cacheSizeType) => (
                      <option key={cacheSizeType} value={cacheSizeType}>{cacheSizeType}</option>
                    ))}
                  </select>
                </label>
                <input
                  aria-label={advancedSettingsPanelView.cacheValue.ariaLabel}
                  disabled={advancedSettingsView.cacheValueDisabled}
                  max={advancedSettingsPanelView.cacheValue.max}
                  min={advancedSettingsPanelView.cacheValue.min}
                  onChange={(event) => handleAdvancedCacheValueChange(inputNumberValue(event))}
                  type={advancedSettingsPanelView.cacheValue.type}
                  value={advancedSettingsView.cacheValue}
                />
              </div>
            ) : null}

            {effectiveEditorTab === "Packet viewer" ? (
              <div className="packet-viewer-pane">
                <div className="packet-viewer-tree">
                  <table>
                    <thead>
                      <tr>
                        <th>Layer</th>
                        <th>Field</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packetViewerTreeView.rows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.layer}</td>
                          <td>{row.field}</td>
                          <td>{row.value}</td>
                        </tr>
                      ))}
                      {packetViewerTreeView.showEmptyRow ? (
                        <tr>
                          <td colSpan={packetViewerTreeView.emptyRow.colSpan}>{packetViewerTreeView.emptyRow.text}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="packet-hex-view">
                  <table>
                    <thead>
                      <tr>
                        <th>Offset</th>
                        <th>Payload</th>
                        <th>ASCII</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packetViewerHexView.rows.map((line) => (
                        <tr key={line.offset}>
                          <td>{line.offset}</td>
                          <td>{line.hex}</td>
                          <td>{line.ascii}</td>
                        </tr>
                      ))}
                      {packetViewerHexView.showEmptyRow ? (
                        <tr>
                          <td colSpan={packetViewerHexView.emptyRow.colSpan}>{packetViewerHexView.emptyRow.text}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {effectiveEditorTab === "Packet Editor" ? (
              <PacketEditorPanel
                canLoadPreview={Boolean(selectedPreview)}
                fieldDraft={rawPacketFieldDraft}
                fieldRows={rawPacketFieldRows}
                fieldStatus={rawPacketFieldStatus}
                findFieldEngineTarget={(row) =>
                  rawPacketFieldAdvancedVmTarget(row as RawPacketFieldRow, rawAdvancedVmTargetChoices)}
                isBusy={isProfileWorkbenchBusy}
                onApplyFieldDraft={(row) => applyRawPacketFieldDraft(row as RawPacketFieldRow)}
                onApplyFieldEngineTarget={(row, target) =>
                  applyRawPacketFieldAdvancedVmTarget(row as RawPacketFieldRow, target as AdvancedVmTargetRow)}
                onApplyRawDraft={applyRawPacketDraft}
                onClearRawOverride={clearRawPacketOverride}
                onLocateField={(row) => locateRawPacketField(row as RawPacketFieldRow)}
                onSeedRawDraftFromPreview={seedRawPacketDraftFromPreview}
                onUpdateFieldDraft={updateRawPacketFieldDraft}
                onUpdateRawDraft={updateRawPacketDraftText}
                rawDraft={rawPacketDraft}
                rawDraftError={rawPacketDraftError}
                rawOverrideActive={rawPacketOverrideActive}
                rawParsedBytes={rawPacketParsedBytes}
                rawStatusText={rawPacketStatusText}
                rawTextareaRef={rawPacketTextareaRef}
                selectedFieldId={rawPacketDraftState.selectedFieldId}
                validateField={(row, value, currentBytes) =>
                  rawPacketFieldError(row as RawPacketFieldRow, value, currentBytes)}
              />
            ) : null}

            {effectiveEditorTab === "Field Engine" ? (
              <FieldEnginePanel
                applyError={advancedVmDraftView.applyError}
                draft={advancedVmDraft}
                flowVarFields={advancedVmFlowVarFields}
                flowVarOperations={advancedVmFlowVarOperations}
                flowVars={selectedAdvancedVmTemplateFlowVars}
                getInputAttributes={(variableName, field) =>
                  advancedVmFlowVarInputAttributes(
                    selectedAdvancedVmTemplateBody,
                    variableName,
                    field as AdvancedVmFlowVarField
                  )}
                getParameterValue={(variableName, field, fallback) =>
                  advancedVmTemplateParameterValue(
                    advancedVmTemplateParameterDraft,
                    selectedAdvancedVmTemplate.name,
                    variableName,
                    field as AdvancedVmFlowVarField | "op",
                    fallback
                  )}
                isBusy={isProfileWorkbenchBusy}
                onAppendTemplate={appendAdvancedVmDraftFromTemplate}
                onApplyDraft={applyAdvancedVmDraft}
                onApplyTargetTemplate={applyAdvancedVmTargetTemplate}
                onResetDraft={resetAdvancedVmDraft}
                onResetTemplateParameters={resetAdvancedVmTemplateParameters}
                onSeedTemplate={seedAdvancedVmDraftFromTemplate}
                onTemplateChange={setAdvancedVmTemplateName}
                onUpdateDraft={updateAdvancedVmDraftText}
                onUpdateTemplateParameter={(variableName, field, value) =>
                  updateAdvancedVmTemplateParameter(variableName, field as AdvancedVmFlowVarField | "op", value)}
                readyTargetCount={advancedVmReadyTargetCount}
                selectedTemplateCompatible={Boolean(advancedVmTemplateCompatible)}
                selectedTemplateHint={advancedVmTemplateHint}
                selectedTemplateName={advancedVmTemplateName}
                statusText={advancedVmDraftView.statusText}
                targetRows={advancedVmTargetChoices}
                templateOptions={advancedVmTargetChoiceView.templateOptions}
                templateParameterDirty={advancedVmTemplateParameterDirty}
                templateReady={Boolean(advancedVmTemplateReady)}
              />
            ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
