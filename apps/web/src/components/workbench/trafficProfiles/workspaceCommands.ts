import type { LucideIcon } from "lucide-react";
import {
  Copy,
  Download,
  FileInput,
  FilePlus,
  PenLine,
  Plus,
  Trash2,
  Upload
} from "lucide-react";

export type CommandSpec<TAction extends string> = {
  label: string;
  icon: LucideIcon;
  action: TAction;
  disabled?: boolean;
};
export type CommandButtonView<TAction extends string> = CommandSpec<TAction> & {
  buttonClassName: string;
  disabled: boolean;
  iconSize: number;
};
export type CommandToolbarView = {
  ariaLabel: string;
  className: string;
};

export type ProfileCommandAction = "create" | "duplicate" | "load" | "delete" | "json" | "yaml";
export type StreamCommandAction = "build" | "edit" | "duplicate" | "delete" | "import" | "pcap" | "yaml";
export type ProfileCommandPlan = {
  kind: ProfileCommandAction;
};
export type StreamCommandPlan =
  | {
      kind: "build";
      nextTab: "Stream Properties";
    }
  | {
      kind: "edit";
      nextTab: "Stream Properties";
      scrollToBuilder: true;
    }
  | {
      kind: "duplicate" | "delete" | "import" | "pcap" | "yaml";
    }
  | {
      kind: "ignored";
    };
export type ProfileCommandHandlers = {
  create: () => void;
  duplicate: () => void;
  load: () => void;
  delete: () => void;
  exportJson: () => void;
  exportYaml: () => void;
};
export type StreamCommandHandlers = {
  build: () => void;
  edit: () => void;
  duplicate: () => void;
  delete: () => void;
  importPcap: () => void;
  exportPcap: () => void;
  exportYaml: () => void;
  scrollToBuilder: () => void;
  selectTab: (tab: "Stream Properties") => void;
};

export const profileButtons: CommandSpec<ProfileCommandAction>[] = [
  { label: "Create Profile", icon: FilePlus, action: "create" },
  { label: "Duplicate Profile", icon: Copy, action: "duplicate" },
  { label: "Load Profile", icon: FileInput, action: "load" },
  { label: "Delete Profile", icon: Trash2, action: "delete" },
  { label: "Export to JSON", icon: Download, action: "json" },
  { label: "Export to Yaml", icon: Download, action: "yaml" }
] as const;

export const streamButtons: CommandSpec<StreamCommandAction>[] = [
  { label: "Build Stream", icon: Plus, action: "build" },
  { label: "Edit Stream", icon: PenLine, action: "edit" },
  { label: "Duplicate Stream", icon: Copy, action: "duplicate" },
  { label: "Delete Stream", icon: Trash2, action: "delete" },
  { label: "Import Pcap", icon: Upload, action: "import" },
  { label: "Export Pcap", icon: Download, action: "pcap" },
  { label: "Export To Yaml", icon: Download, action: "yaml" }
] as const;

export const profileBuilderActions = new Set<ProfileCommandAction>(["create", "load", "json", "yaml"]);
export const selectedProfileActions = new Set<ProfileCommandAction>(["duplicate", "load", "delete", "json"]);
const streamActionsAvailableWithoutStreams = new Set<StreamCommandAction>(["build", "import"]);

export type ProfileCommandAvailability = {
  commandDisabled?: boolean;
  hasSelectedProfile: boolean;
  hasWorkbenchProfileValidationError: boolean;
  isProfileWorkbenchBusy: boolean;
  streamBuilderEnabled: boolean;
  streamCount: number;
};

export type StreamCommandAvailability = {
  commandDisabled?: boolean;
  hasSelectedStreamValidationError: boolean;
  hasWorkbenchProfileValidationError: boolean;
  isProfileWorkbenchBusy: boolean;
  streamCount: number;
};
export type ProfileCommandBaseAvailability = Omit<ProfileCommandAvailability, "commandDisabled">;
export type StreamCommandBaseAvailability = Omit<StreamCommandAvailability, "commandDisabled">;
export type ProfileCommandAvailabilityInput = {
  hasSelectedProfile: boolean;
  hasWorkbenchProfileValidationError: boolean;
  isProfileWorkbenchBusy: boolean;
  streamBuilderEnabled: boolean;
  streamCount: number;
};
export type StreamCommandAvailabilityInput = {
  hasSelectedStreamValidationError: boolean;
  hasWorkbenchProfileValidationError: boolean;
  isProfileWorkbenchBusy: boolean;
  streamCount: number;
};
export type WorkspaceCommandButtonViewModelInput = {
  isProfileWorkbenchBusy: boolean;
  selectedProfile: unknown;
  selectedStreamValidationError: unknown;
  streamBuilderEnabled: boolean;
  streamCount: number;
  workbenchProfileValidationError: unknown;
};
export type WorkspaceCommandButtonViewModel = {
  profileCommandButtons: CommandButtonView<ProfileCommandAction>[];
  profileCommandToolbarView: CommandToolbarView;
  streamCommandButtons: CommandButtonView<StreamCommandAction>[];
  streamCommandToolbarView: CommandToolbarView;
};
export type WorkspaceCommandActionHandlers = {
  runProfileCommand: (action: ProfileCommandAction) => void;
  runStreamCommand: (action: StreamCommandAction) => void;
};
export type WorkspaceCommandActionHandlerInput = {
  hasSelectedStream: boolean;
  profileCommandHandlers: ProfileCommandHandlers;
  streamCommandHandlers: StreamCommandHandlers;
};

export const profileCommandToolbarView: CommandToolbarView = {
  ariaLabel: "Profile commands",
  className: "profile-button-grid"
};

export const streamCommandToolbarView: CommandToolbarView = {
  ariaLabel: "Stream commands",
  className: "stream-toolbar"
};

const profileCommandButtonPresentation = {
  buttonClassName: "profile-command-button",
  iconSize: 14
};

const streamCommandButtonPresentation = {
  buttonClassName: "stream-command-button",
  iconSize: 14
};

export function profileCommandBaseAvailability(
  input: ProfileCommandAvailabilityInput
): ProfileCommandBaseAvailability {
  return {
    hasSelectedProfile: input.hasSelectedProfile,
    hasWorkbenchProfileValidationError: input.hasWorkbenchProfileValidationError,
    isProfileWorkbenchBusy: input.isProfileWorkbenchBusy,
    streamBuilderEnabled: input.streamBuilderEnabled,
    streamCount: input.streamCount
  };
}

export function streamCommandBaseAvailability(
  input: StreamCommandAvailabilityInput
): StreamCommandBaseAvailability {
  return {
    hasSelectedStreamValidationError: input.hasSelectedStreamValidationError,
    hasWorkbenchProfileValidationError: input.hasWorkbenchProfileValidationError,
    isProfileWorkbenchBusy: input.isProfileWorkbenchBusy,
    streamCount: input.streamCount
  };
}

export function profileCommandDisabled(action: ProfileCommandAction, availability: ProfileCommandAvailability) {
  return (
    Boolean(availability.commandDisabled)
    || availability.isProfileWorkbenchBusy
    || (profileBuilderActions.has(action) && !availability.streamBuilderEnabled)
    || (selectedProfileActions.has(action) && !availability.hasSelectedProfile)
    || (action === "create" && availability.streamCount === 0)
    || (action === "yaml" && availability.streamCount === 0)
    || (["create", "yaml"].includes(action) && availability.hasWorkbenchProfileValidationError)
  );
}

export function profileCommandButtonDisabled(
  action: ProfileCommandAction,
  availability: ProfileCommandBaseAvailability,
  commandDisabled?: boolean
) {
  return profileCommandDisabled(action, { ...availability, commandDisabled });
}

export function profileCommandButtonViewModels(
  availability: ProfileCommandBaseAvailability
): CommandButtonView<ProfileCommandAction>[] {
  return profileButtons.map((button) => ({
    ...button,
    ...profileCommandButtonPresentation,
    disabled: profileCommandButtonDisabled(button.action, availability, button.disabled)
  }));
}

export function streamCommandDisabled(action: StreamCommandAction, availability: StreamCommandAvailability) {
  return (
    Boolean(availability.commandDisabled)
    || availability.isProfileWorkbenchBusy
    || (availability.streamCount === 0 && !streamActionsAvailableWithoutStreams.has(action))
    || (action === "yaml" && availability.hasWorkbenchProfileValidationError)
    || (action === "pcap" && availability.hasSelectedStreamValidationError)
  );
}

export function streamCommandButtonDisabled(
  action: StreamCommandAction,
  availability: StreamCommandBaseAvailability,
  commandDisabled?: boolean
) {
  return streamCommandDisabled(action, { ...availability, commandDisabled });
}

export function streamCommandButtonViewModels(
  availability: StreamCommandBaseAvailability
): CommandButtonView<StreamCommandAction>[] {
  return streamButtons.map((button) => ({
    ...button,
    ...streamCommandButtonPresentation,
    disabled: streamCommandButtonDisabled(button.action, availability, button.disabled)
  }));
}

export function workspaceCommandButtonViewModel({
  isProfileWorkbenchBusy,
  selectedProfile,
  selectedStreamValidationError,
  streamBuilderEnabled,
  streamCount,
  workbenchProfileValidationError
}: WorkspaceCommandButtonViewModelInput): WorkspaceCommandButtonViewModel {
  const profileCommandAvailability = profileCommandBaseAvailability({
    hasSelectedProfile: Boolean(selectedProfile),
    hasWorkbenchProfileValidationError: Boolean(workbenchProfileValidationError),
    isProfileWorkbenchBusy,
    streamBuilderEnabled,
    streamCount
  });
  const streamCommandAvailability = streamCommandBaseAvailability({
    hasSelectedStreamValidationError: Boolean(selectedStreamValidationError),
    hasWorkbenchProfileValidationError: Boolean(workbenchProfileValidationError),
    isProfileWorkbenchBusy,
    streamCount
  });
  return {
    profileCommandButtons: profileCommandButtonViewModels(profileCommandAvailability),
    profileCommandToolbarView,
    streamCommandButtons: streamCommandButtonViewModels(streamCommandAvailability),
    streamCommandToolbarView
  };
}

export function profileCommandPlan(action: ProfileCommandAction): ProfileCommandPlan {
  return { kind: action };
}

export function streamCommandPlan(action: StreamCommandAction, hasSelectedStream: boolean): StreamCommandPlan {
  if (action === "build") {
    return { kind: "build", nextTab: "Stream Properties" };
  }
  if (action === "edit") {
    return hasSelectedStream
      ? { kind: "edit", nextTab: "Stream Properties", scrollToBuilder: true }
      : { kind: "ignored" };
  }
  return { kind: action };
}

export function runProfileCommandPlan(plan: ProfileCommandPlan, handlers: ProfileCommandHandlers) {
  if (plan.kind === "create") {
    handlers.create();
    return;
  }
  if (plan.kind === "duplicate") {
    handlers.duplicate();
    return;
  }
  if (plan.kind === "load") {
    handlers.load();
    return;
  }
  if (plan.kind === "delete") {
    handlers.delete();
    return;
  }
  if (plan.kind === "json") {
    handlers.exportJson();
    return;
  }
  handlers.exportYaml();
}

export function runProfileCommandAction(action: ProfileCommandAction, handlers: ProfileCommandHandlers) {
  runProfileCommandPlan(profileCommandPlan(action), handlers);
}

export function runStreamCommandPlan(plan: StreamCommandPlan, handlers: StreamCommandHandlers) {
  if (plan.kind === "ignored") {
    return;
  }
  if (plan.kind === "build") {
    handlers.selectTab(plan.nextTab);
    handlers.build();
    return;
  }
  if (plan.kind === "edit") {
    handlers.selectTab(plan.nextTab);
    handlers.edit();
    if (plan.scrollToBuilder) {
      handlers.scrollToBuilder();
    }
    return;
  }
  if (plan.kind === "duplicate") {
    handlers.duplicate();
    return;
  }
  if (plan.kind === "delete") {
    handlers.delete();
    return;
  }
  if (plan.kind === "import") {
    handlers.importPcap();
    return;
  }
  if (plan.kind === "pcap") {
    handlers.exportPcap();
    return;
  }
  handlers.exportYaml();
}

export function runStreamCommandAction(
  action: StreamCommandAction,
  hasSelectedStream: boolean,
  handlers: StreamCommandHandlers
) {
  runStreamCommandPlan(streamCommandPlan(action, hasSelectedStream), handlers);
}

export function workspaceCommandActionHandlers({
  hasSelectedStream,
  profileCommandHandlers,
  streamCommandHandlers
}: WorkspaceCommandActionHandlerInput): WorkspaceCommandActionHandlers {
  return {
    runProfileCommand: (action) =>
      runProfileCommandAction(action, profileCommandHandlers),
    runStreamCommand: (action) =>
      runStreamCommandAction(action, hasSelectedStream, streamCommandHandlers)
  };
}
