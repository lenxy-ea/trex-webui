import type { LucideIcon } from "lucide-react";
import { ListStart, Play } from "lucide-react";
import type {
  ProfileExportResult,
  ProfileFileOperationResult,
  ProfilePcapExportResult,
  ProfilePcapImportOptions,
  ProfilePcapImportResult,
  ProfileRecord,
  ProfileTunableRecord,
  ProfileWorkbenchSaveResult,
  ProfileWorkbenchYamlExportResult,
  TrexResult
} from "../../../api";
import { displayBytes } from "../format";
import type { ProfileTunablesDraft } from "../profileTunables";
import type { TrafficMultiplierUnit } from "../trafficMultiplier";
import { shortcutTunableNames, tunableFlowTypes, tunableVmTypes } from "./model";
import { pcapImportSummaryItems, type PcapImportSummaryItem } from "./pcapImportModel";
import { profileFileName, profileKindLabel, profileModifiedTime } from "./profileCatalogModel";

export function profileCommandLabel(
  result: TrexResult<
    ProfileFileOperationResult | ProfileExportResult | ProfileWorkbenchYamlExportResult | ProfilePcapExportResult | ProfilePcapImportResult
  > | null
) {
  if (!result) {
    return "";
  }
  if (!result.ok) {
    return result.error ?? result.blocker ?? "";
  }
  const data = result.data;
  if (!data) {
    return "Profile command accepted";
  }
  if ("file_name" in data) {
    return `Profile command accepted ${data.file_name}`;
  }
  return `Profile command accepted ${data.profile.relative_path}`;
}

export type ProfileRuntimeFact = {
  key: string;
  label: string;
  value: string;
};

export function profileDeclaredTunables(selectedProfile: ProfileRecord | null | undefined) {
  return Array.isArray(selectedProfile?.tunables) ? selectedProfile.tunables : null;
}

export function profileRuntimeFacts(
  selectedProfile: ProfileRecord | null | undefined,
  profilePath: string,
  declaredProfileTunables: ProfileTunableRecord[] | null
): ProfileRuntimeFact[] {
  const selectedProfileName = selectedProfile?.relative_path ?? profilePath;
  return [
    { key: "type", label: "Type", value: profileKindLabel(selectedProfile?.kind) },
    { key: "file", label: "File", value: selectedProfileName ? profileFileName(selectedProfileName) : "-" },
    { key: "path", label: "Path", value: selectedProfileName || "-" },
    { key: "size", label: "Size", value: selectedProfile ? displayBytes(selectedProfile.size_bytes) : "-" },
    { key: "modified", label: "Modified", value: selectedProfile ? profileModifiedTime(selectedProfile.modified_time) : "-" },
    { key: "tunables", label: "Tunables", value: declaredProfileTunables ? String(declaredProfileTunables.length) : "auto" }
  ];
}

export type ProfileRuntimeTunablesViewModel = {
  status: string;
  description: string;
  code: string;
};

export type ProfileRuntimeReadinessViewModel = {
  duration: string;
  multiplier: string;
  startTarget: string;
  status: "No Profile" | "Ready";
};

export type ProfileRuntimeReadinessRow = {
  key: string;
  label: string;
  value: string;
};

export type ProfileRuntimeCommandStatusViewModel = {
  badge: "Attention" | "OK";
  code: string | null;
  message: string;
};

export type ProfileRuntimeCommandPanelViewModel = ProfileRuntimeCommandStatusViewModel & {
  className: string;
};

export type ProfileRuntimePanelKey = "readiness" | "tunables" | "command";

export type ProfileRuntimePanelViewModel = {
  badge: string;
  className: string;
  code: string | null;
  description: string | null;
  key: ProfileRuntimePanelKey;
  rows: ProfileRuntimeReadinessRow[];
  title: string;
};

export type ProfileRuntimeStartAction = "selected" | "all";
export type ProfileRuntimeStartIcon = "play" | "list-start";
export type ProfileRuntimeStartHandlers = {
  startAll: () => void;
  startSelected: () => void;
};

export type ProfileRuntimeStartButton = {
  action: ProfileRuntimeStartAction;
  className: string;
  disabled: boolean;
  icon: LucideIcon;
  iconName: ProfileRuntimeStartIcon;
  iconSize: number;
  label: string;
  title: string;
};

export type ProfileRuntimeBarViewModel = {
  ariaLabel: string;
  buttons: ProfileRuntimeStartButton[];
  controlAriaLabelPrefix: string;
  controlClassName: string;
  controlFieldLabel: string;
  controlVariant: "profile";
  show: boolean;
  title: string;
};

export type ProfileWorkbarViewModel = {
  inputAriaLabel: string;
  inputReadOnly: boolean;
  inputValue: string;
  label: string;
  statusClassName: string;
  statusIsError: boolean;
  statusText: string;
};

export type ProfileWorkbarNameChangeHandlers = {
  changeBuilderProfileName: (value: string) => void;
};

export type ProfileTunablesBarRowChangeHandlers = {
  changeProfileTunables: (draft: ProfileTunablesDraft) => void;
};

export type ProfileWorkspaceModeViewModel = {
  rightClassName: string;
  runtimeFactClassName: string;
  runtimePanelsClassName: string;
  runtimePanelTitleClassName: string;
  runtimeSummaryGridClassName: string;
  runtimeWorkspaceAriaLabel: string;
  runtimeWorkspaceClassName: string;
  showRuntimeWorkspace: boolean;
  showStreamBuilderWorkspace: boolean;
};

export function profileWorkbarViewModel({
  builderProfileName,
  profilePath,
  statusIsError,
  statusText,
  streamBuilderEnabled
}: {
  builderProfileName: string;
  profilePath: string;
  statusIsError: boolean;
  statusText: string;
  streamBuilderEnabled: boolean;
}): ProfileWorkbarViewModel {
  return {
    inputAriaLabel: "Profile name",
    inputReadOnly: !streamBuilderEnabled,
    inputValue: streamBuilderEnabled ? builderProfileName : profilePath,
    label: "Profile",
    statusClassName: statusIsError ? "profile-workbar-error" : "",
    statusIsError,
    statusText
  };
}

export function runProfileWorkbarNameChange(
  viewModel: ProfileWorkbarViewModel,
  value: string,
  handlers: ProfileWorkbarNameChangeHandlers
) {
  if (viewModel.inputReadOnly) {
    return;
  }
  handlers.changeBuilderProfileName(value);
}

export function profileWorkspaceModeViewModel(streamBuilderEnabled: boolean): ProfileWorkspaceModeViewModel {
  return {
    rightClassName: streamBuilderEnabled
      ? "traffic-profile-right"
      : "traffic-profile-right traffic-profile-right--runtime-only",
    runtimeFactClassName: "profile-runtime-fact",
    runtimePanelsClassName: "profile-runtime-panels",
    runtimePanelTitleClassName: "profile-runtime-panel-title",
    runtimeSummaryGridClassName: "profile-runtime-summary-grid",
    runtimeWorkspaceAriaLabel: "Profile runtime workspace",
    runtimeWorkspaceClassName: "profile-runtime-workspace",
    showRuntimeWorkspace: !streamBuilderEnabled,
    showStreamBuilderWorkspace: streamBuilderEnabled
  };
}

export function profileRuntimeReadinessViewModel({
  hasRunnableProfile,
  trafficDurationEnabled,
  trafficDurationValue,
  trafficMultiplierUnit,
  trafficMultiplierValue
}: {
  hasRunnableProfile: boolean;
  trafficDurationEnabled: boolean;
  trafficDurationValue: string;
  trafficMultiplierUnit: TrafficMultiplierUnit;
  trafficMultiplierValue: string;
}): ProfileRuntimeReadinessViewModel {
  return {
    duration: trafficDurationEnabled ? `${trafficDurationValue || "-"} s` : "continuous",
    multiplier: `${trafficMultiplierValue || "-"} ${trafficMultiplierUnit}`,
    startTarget: "Selected port or all ports",
    status: hasRunnableProfile ? "Ready" : "No Profile"
  };
}

export function profileRuntimeReadinessRows(
  viewModel: ProfileRuntimeReadinessViewModel
): ProfileRuntimeReadinessRow[] {
  return [
    { key: "multiplier", label: "Multiplier", value: viewModel.multiplier },
    { key: "duration", label: "Duration", value: viewModel.duration },
    { key: "start-target", label: "Start target", value: viewModel.startTarget }
  ];
}

export function profileRuntimeCommandStatusViewModel({
  profileTunablesError,
  statusIsError,
  statusText
}: {
  profileTunablesError: string | null;
  statusIsError: boolean;
  statusText: string;
}): ProfileRuntimeCommandStatusViewModel {
  return {
    badge: statusIsError ? "Attention" : "OK",
    code: profileTunablesError ? "validation blocked" : null,
    message: statusIsError
      ? "Resolve the profile status above before starting traffic."
      : statusText || "No command result yet."
  };
}

export function profileRuntimeCommandPanelViewModel(
  viewModel: ProfileRuntimeCommandStatusViewModel
): ProfileRuntimeCommandPanelViewModel {
  return {
    ...viewModel,
    className:
      viewModel.badge === "Attention"
        ? "profile-runtime-panel profile-runtime-panel--error"
        : "profile-runtime-panel"
  };
}

export function profileRuntimePanels({
  commandPanelView,
  readinessRows,
  readinessView,
  tunablesView
}: {
  commandPanelView: ProfileRuntimeCommandPanelViewModel;
  readinessRows: ProfileRuntimeReadinessRow[];
  readinessView: ProfileRuntimeReadinessViewModel;
  tunablesView: ProfileRuntimeTunablesViewModel;
}): ProfileRuntimePanelViewModel[] {
  return [
    {
      badge: readinessView.status,
      className: "profile-runtime-panel",
      code: null,
      description: null,
      key: "readiness",
      rows: readinessRows,
      title: "Run Readiness"
    },
    {
      badge: tunablesView.status,
      className: "profile-runtime-panel",
      code: tunablesView.code,
      description: tunablesView.description,
      key: "tunables",
      rows: [],
      title: "Tunable Input"
    },
    {
      badge: commandPanelView.badge,
      className: commandPanelView.className,
      code: commandPanelView.code,
      description: commandPanelView.message,
      key: "command",
      rows: [],
      title: "Command Status"
    }
  ];
}

export function profileRuntimeStartButtons(disabled: boolean): ProfileRuntimeStartButton[] {
  return [
    {
      action: "selected",
      className: "profile-runtime-button",
      disabled,
      icon: Play,
      iconName: "play",
      iconSize: 14,
      label: "Start Transit",
      title: "Start selected profile"
    },
    {
      action: "all",
      className: "profile-runtime-button",
      disabled,
      icon: ListStart,
      iconName: "list-start",
      iconSize: 14,
      label: "Start All",
      title: "Start selected profile on all ports"
    }
  ];
}

export function runProfileRuntimeStartAction(
  action: ProfileRuntimeStartAction,
  handlers: ProfileRuntimeStartHandlers
) {
  if (action === "selected") {
    handlers.startSelected();
    return;
  }
  handlers.startAll();
}

export function profileRuntimeBarViewModel({
  buttons,
  show
}: {
  buttons: ProfileRuntimeStartButton[];
  show: boolean;
}): ProfileRuntimeBarViewModel {
  return {
    ariaLabel: "Profile runtime",
    buttons,
    controlAriaLabelPrefix: "Profile traffic",
    controlClassName: "traffic-run-control--profile",
    controlFieldLabel: "Multiplier",
    controlVariant: "profile",
    show,
    title: "Runtime"
  };
}

export function profileRuntimeTunablesViewModel(
  declaredProfileTunables: ProfileTunableRecord[] | null,
  extraTunables: string
): ProfileRuntimeTunablesViewModel {
  if (declaredProfileTunables === null) {
    return {
      status: "manual extra",
      description: "No tunable schema was reported; use Extra for key=value parameters before starting traffic.",
      code: extraTunables.trim() || "extra: -"
    };
  }
  if (declaredProfileTunables.length > 0) {
    return {
      status: `${declaredProfileTunables.length} declared`,
      description: "Declared script parameters are shown above.",
      code: `declared: ${declaredProfileTunables.length}`
    };
  }
  return {
    status: "none declared",
    description: "This profile did not declare tunables; extra keys are blocked before start.",
    code: "declared: 0"
  };
}

export type ProfileTunablesViewModel = {
  barAriaLabel: string;
  barClassName: string;
  barTitle: string;
  declaredNames: Set<string> | null;
  showBar: boolean;
  showExtra: boolean;
  customTunables: ProfileTunableRecord[];
};

export type ProfileTunablesDraftField = Exclude<keyof ProfileTunablesDraft, "custom">;

export type ProfileTunablesShortcutOption = {
  key: string;
  label: string;
  value: string;
};

export type ProfileTunablesShortcutRow = {
  ariaLabel: string;
  field: ProfileTunablesDraftField;
  inputMode?: "numeric";
  kind: "input" | "select";
  label: string;
  options: ProfileTunablesShortcutOption[];
  value: string;
};

export type ProfileTunablesCustomRow = {
  ariaLabel: string;
  inputMode?: "numeric";
  kind: "input" | "select";
  label: string;
  name: string;
  options: ProfileTunablesShortcutOption[];
  placeholder: string;
  value: string;
};

export type ProfileTunablesExtraRow = {
  ariaLabel: string;
  field: "extra";
  label: string;
  placeholder: string;
  value: string;
} | null;

type ProfileTunablesBarBaseRow = {
  ariaLabel: string;
  className?: string;
  inputMode?: "numeric";
  key: string;
  kind: "input" | "select";
  label: string;
  labelPresentation: "text" | "inline";
  options: ProfileTunablesShortcutOption[];
  placeholder?: string;
  value: string;
};

export type ProfileTunablesShortcutBarRow = ProfileTunablesBarBaseRow & {
  field: ProfileTunablesDraftField;
  source: "shortcut";
};

export type ProfileTunablesCustomBarRow = ProfileTunablesBarBaseRow & {
  className: "profile-tunables-custom";
  name: string;
  placeholder: string;
  source: "custom";
};

export type ProfileTunablesExtraBarRow = ProfileTunablesBarBaseRow & {
  className: "profile-tunables-extra";
  field: "extra";
  kind: "input";
  placeholder: string;
  source: "extra";
};

export type ProfileTunablesBarRow =
  | ProfileTunablesShortcutBarRow
  | ProfileTunablesCustomBarRow
  | ProfileTunablesExtraBarRow;

export function profileTunablesViewModel(
  profileTunablesEnabled: boolean,
  declaredProfileTunables: ProfileTunableRecord[] | null
): ProfileTunablesViewModel {
  const declaredNames = declaredProfileTunables
    ? new Set(declaredProfileTunables.map((tunable) => tunable.name))
    : null;
  return {
    barAriaLabel: "Profile tunables",
    barClassName: "profile-tunables-bar",
    barTitle: "Tunables",
    declaredNames,
    showBar: profileTunablesEnabled && (declaredNames === null || declaredNames.size > 0),
    showExtra: declaredNames === null,
    customTunables: declaredProfileTunables?.filter((tunable) => !shortcutTunableNames.has(tunable.name)) ?? []
  };
}

export function profileTunablesShowsShortcut(viewModel: ProfileTunablesViewModel, name: string) {
  return viewModel.declaredNames === null || viewModel.declaredNames.has(name);
}

function profileTunablesSelectOptions(values: readonly string[]): ProfileTunablesShortcutOption[] {
  return values.map((value) => ({
    key: value || "default",
    label: value || "-",
    value
  }));
}

export function profileTunablesShortcutRows(
  viewModel: ProfileTunablesViewModel,
  draft: ProfileTunablesDraft
): ProfileTunablesShortcutRow[] {
  const rows: ProfileTunablesShortcutRow[] = [
    {
      ariaLabel: "Tunable size",
      field: "size",
      kind: "input",
      label: "Size",
      options: [],
      value: draft.size
    },
    {
      ariaLabel: "Tunable VM",
      field: "vm",
      kind: "select",
      label: "VM",
      options: profileTunablesSelectOptions(tunableVmTypes),
      value: draft.vm
    },
    {
      ariaLabel: "Tunable flow",
      field: "flow",
      kind: "select",
      label: "Flow",
      options: profileTunablesSelectOptions(tunableFlowTypes),
      value: draft.flow
    },
    {
      ariaLabel: "Tunable PG ID",
      field: "pgId",
      inputMode: "numeric",
      kind: "input",
      label: "PG ID",
      options: [],
      value: draft.pgId
    }
  ];
  return rows.filter((row) => {
    const tunableName = row.field === "pgId" ? "pg_id" : row.field;
    return profileTunablesShowsShortcut(viewModel, tunableName);
  });
}

function profileTunableChoiceOptions(choices: readonly unknown[]): ProfileTunablesShortcutOption[] {
  return choices.map((choice) => {
    const value = String(choice);
    return {
      key: value,
      label: value,
      value
    };
  });
}

export function profileTunablesCustomRows(
  viewModel: ProfileTunablesViewModel,
  draft: ProfileTunablesDraft
): ProfileTunablesCustomRow[] {
  return viewModel.customTunables.map((tunable) => {
    const choices = Array.isArray(tunable.choices) ? tunable.choices : [];
    return {
      ariaLabel: `Tunable ${tunable.name}`,
      inputMode: tunableInputMode(tunable),
      kind: choices.length > 0 ? "select" : "input",
      label: tunable.required ? `${tunable.name} *` : tunable.name,
      name: tunable.name,
      options: profileTunableChoiceOptions(choices),
      placeholder: tunablePlaceholder(tunable),
      value: draft.custom[tunable.name] ?? ""
    };
  });
}

export function profileTunablesExtraRow(
  viewModel: ProfileTunablesViewModel,
  draft: ProfileTunablesDraft
): ProfileTunablesExtraRow {
  if (!viewModel.showExtra) {
    return null;
  }
  return {
    ariaLabel: "Extra tunables",
    field: "extra",
    label: "Extra",
    placeholder: "key=value",
    value: draft.extra
  };
}

export function profileTunablesBarRows({
  customRows,
  extraRow,
  shortcutRows
}: {
  customRows: ProfileTunablesCustomRow[];
  extraRow: ProfileTunablesExtraRow;
  shortcutRows: ProfileTunablesShortcutRow[];
}): ProfileTunablesBarRow[] {
  return [
    ...shortcutRows.map((row): ProfileTunablesShortcutBarRow => ({
      ...row,
      key: `shortcut-${row.field}`,
      labelPresentation: "text",
      source: "shortcut"
    })),
    ...customRows.map((row): ProfileTunablesCustomBarRow => ({
      ...row,
      className: "profile-tunables-custom",
      key: `custom-${row.name}`,
      labelPresentation: "inline",
      options: row.kind === "select"
        ? [{ key: "custom-empty", label: "-", value: "" }, ...row.options]
        : row.options,
      source: "custom"
    })),
    ...(extraRow
      ? [
        {
          ...extraRow,
          className: "profile-tunables-extra" as const,
          key: "extra-extra",
          kind: "input" as const,
          labelPresentation: "text" as const,
          options: [],
          source: "extra" as const
        }
      ]
      : [])
  ];
}

export function profileTunablesDraftFieldPatch(
  draft: ProfileTunablesDraft,
  field: ProfileTunablesDraftField,
  value: string
): ProfileTunablesDraft {
  return {
    ...draft,
    [field]: value
  };
}

export function profileTunablesCustomDraftPatch(
  draft: ProfileTunablesDraft,
  name: string,
  value: string
): ProfileTunablesDraft {
  return {
    ...draft,
    custom: {
      ...draft.custom,
      [name]: value
    }
  };
}

export function profileTunablesBarRowDraftPatch(
  draft: ProfileTunablesDraft,
  row: ProfileTunablesBarRow,
  value: string
): ProfileTunablesDraft {
  if (row.source === "custom") {
    return profileTunablesCustomDraftPatch(draft, row.name, value);
  }
  return profileTunablesDraftFieldPatch(draft, row.field, value);
}

export function runProfileTunablesBarRowChange(
  draft: ProfileTunablesDraft,
  row: ProfileTunablesBarRow,
  value: string,
  handlers: ProfileTunablesBarRowChangeHandlers
) {
  handlers.changeProfileTunables(profileTunablesBarRowDraftPatch(draft, row, value));
}

export type ProfileWorkspaceStatusInput = {
  profileCommandResult: TrexResult<
    ProfileFileOperationResult | ProfileExportResult | ProfileWorkbenchYamlExportResult | ProfilePcapExportResult | ProfilePcapImportResult
  > | null;
  profilePath: string;
  profileTunablesError: string | null;
  profileWorkbenchResult: TrexResult<ProfileWorkbenchSaveResult> | null;
  selectedProfile: ProfileRecord | null | undefined;
  selectedStreamValidationError: string | null;
  streamBuilderEnabled: boolean;
  workbenchProfileValidationError: string | null;
  workbenchStreamValidationError: string | null;
};

export function profileWorkspaceStatus({
  profileCommandResult,
  profilePath,
  profileTunablesError,
  profileWorkbenchResult,
  selectedProfile,
  selectedStreamValidationError,
  streamBuilderEnabled,
  workbenchProfileValidationError,
  workbenchStreamValidationError
}: ProfileWorkspaceStatusInput) {
  const builderStatusText =
    workbenchProfileValidationError
    ?? workbenchStreamValidationError
    ?? selectedStreamValidationError
    ?? (profileWorkbenchResult?.ok
      ? `Saved ${profileWorkbenchResult.data?.profile.relative_path ?? ""}`
      : profileWorkbenchResult?.error ?? profileWorkbenchResult?.blocker ?? profileCommandLabel(profileCommandResult));
  const runtimeStatusText =
    profileTunablesError
    ?? profileCommandLabel(profileCommandResult)
    ?? (selectedProfile ? `${selectedProfile.kind} ${selectedProfile.relative_path}` : profilePath);
  return {
    statusText: streamBuilderEnabled ? builderStatusText : runtimeStatusText,
    statusIsError: streamBuilderEnabled
      ? Boolean(workbenchProfileValidationError || workbenchStreamValidationError || selectedStreamValidationError)
      : Boolean(profileTunablesError || (profileCommandResult && !profileCommandResult.ok))
  };
}

export type RuntimeProfilePanelViewModelInput = ProfileWorkspaceStatusInput & {
  builderProfileName: string;
  hasRunnableProfile: boolean;
  isStarting: boolean;
  pcapImportOptions: ProfilePcapImportOptions;
  profileTunables: ProfileTunablesDraft;
  profileTunablesEnabled: boolean;
  trafficDurationEnabled: boolean;
  trafficDurationValue: string;
  trafficMultiplierUnit: TrafficMultiplierUnit;
  trafficMultiplierValue: string;
};

export type RuntimeProfilePanelViewModel = {
  declaredProfileTunables: ProfileTunableRecord[] | null;
  pcapImportSummary: PcapImportSummaryItem[];
  profileWorkbarView: ProfileWorkbarViewModel;
  profileWorkspaceModeView: ProfileWorkspaceModeViewModel;
  profileTunablesBarRows: ProfileTunablesBarRow[];
  profileTunablesView: ProfileTunablesViewModel;
  runtimeBarView: ProfileRuntimeBarViewModel;
  runtimePanels: ProfileRuntimePanelViewModel[];
  runtimeProfileFacts: ProfileRuntimeFact[];
  runtimeStartDisabled: boolean;
  statusIsError: boolean;
  statusText: string;
};

export function runtimeProfilePanelViewModel({
  builderProfileName,
  hasRunnableProfile,
  isStarting,
  pcapImportOptions,
  profileTunables,
  profileTunablesEnabled,
  trafficDurationEnabled,
  trafficDurationValue,
  trafficMultiplierUnit,
  trafficMultiplierValue,
  ...statusInput
}: RuntimeProfilePanelViewModelInput): RuntimeProfilePanelViewModel {
  const declaredProfileTunables = profileDeclaredTunables(statusInput.selectedProfile);
  const profileTunablesView = profileTunablesViewModel(profileTunablesEnabled, declaredProfileTunables);
  const profileTunablesShortcutRowValues = profileTunablesShortcutRows(profileTunablesView, profileTunables);
  const profileTunablesCustomRowValues = profileTunablesCustomRows(profileTunablesView, profileTunables);
  const profileTunablesExtraRowValue = profileTunablesExtraRow(profileTunablesView, profileTunables);
  const workspaceStatus = profileWorkspaceStatus(statusInput);
  const runtimeStartDisabled = isStarting || Boolean(statusInput.profileTunablesError);
  const runtimeStartButtons = profileRuntimeStartButtons(runtimeStartDisabled);
  const runtimeCommandStatusView = profileRuntimeCommandStatusViewModel({
    profileTunablesError: statusInput.profileTunablesError,
    statusIsError: workspaceStatus.statusIsError,
    statusText: workspaceStatus.statusText
  });
  const runtimeReadinessView = profileRuntimeReadinessViewModel({
    hasRunnableProfile,
    trafficDurationEnabled,
    trafficDurationValue,
    trafficMultiplierUnit,
    trafficMultiplierValue
  });
  const runtimeReadinessRows = profileRuntimeReadinessRows(runtimeReadinessView);
  const runtimeCommandPanelView = profileRuntimeCommandPanelViewModel(runtimeCommandStatusView);
  const runtimeTunablesView = profileRuntimeTunablesViewModel(declaredProfileTunables, profileTunables.extra);
  return {
    declaredProfileTunables,
    pcapImportSummary: pcapImportSummaryItems(pcapImportOptions),
    profileWorkbarView: profileWorkbarViewModel({
      builderProfileName,
      profilePath: statusInput.profilePath,
      statusIsError: workspaceStatus.statusIsError,
      statusText: workspaceStatus.statusText,
      streamBuilderEnabled: statusInput.streamBuilderEnabled
    }),
    profileWorkspaceModeView: profileWorkspaceModeViewModel(statusInput.streamBuilderEnabled),
    profileTunablesBarRows: profileTunablesBarRows({
      customRows: profileTunablesCustomRowValues,
      extraRow: profileTunablesExtraRowValue,
      shortcutRows: profileTunablesShortcutRowValues
    }),
    profileTunablesView,
    runtimeBarView: profileRuntimeBarViewModel({
      buttons: runtimeStartButtons,
      show: hasRunnableProfile
    }),
    runtimePanels: profileRuntimePanels({
      commandPanelView: runtimeCommandPanelView,
      readinessRows: runtimeReadinessRows,
      readinessView: runtimeReadinessView,
      tunablesView: runtimeTunablesView
    }),
    runtimeProfileFacts: profileRuntimeFacts(
      statusInput.selectedProfile,
      statusInput.profilePath,
      declaredProfileTunables
    ),
    runtimeStartDisabled,
    ...workspaceStatus
  };
}

export function tunableInputMode(tunable: ProfileTunableRecord) {
  return tunable.type === "int" || tunable.type === "float" ? "numeric" : undefined;
}

export function tunablePlaceholder(tunable: ProfileTunableRecord) {
  if (tunable.required) {
    return "required";
  }
  if (tunable.default !== undefined && tunable.default !== null) {
    return String(tunable.default);
  }
  return "";
}
