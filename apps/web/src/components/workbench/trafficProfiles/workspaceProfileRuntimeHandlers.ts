import type { ProfileTunablesDraft } from "../profileTunables";
import {
  runProfileRuntimeStartAction,
  runProfileTunablesBarRowChange,
  runProfileWorkbarNameChange,
  type ProfileRuntimeStartAction,
  type ProfileRuntimeStartHandlers,
  type ProfileTunablesBarRow,
  type ProfileWorkbarViewModel
} from "./profileRuntimeModel";

export type WorkspaceProfileRuntimeHandlers = {
  changeProfileName: (value: string) => void;
  changeTunable: (row: ProfileTunablesBarRow, value: string) => void;
  startRuntime: (action: ProfileRuntimeStartAction) => void;
};

export type WorkspaceProfileRuntimeHandlerInput = {
  changeBuilderProfileName: (value: string) => void;
  changeProfileTunables: (draft: ProfileTunablesDraft) => void;
  profileTunables: ProfileTunablesDraft;
  profileWorkbarView: ProfileWorkbarViewModel;
  startRuntimeHandlers: ProfileRuntimeStartHandlers;
};

export function workspaceProfileRuntimeHandlers({
  changeBuilderProfileName,
  changeProfileTunables,
  profileTunables,
  profileWorkbarView,
  startRuntimeHandlers
}: WorkspaceProfileRuntimeHandlerInput): WorkspaceProfileRuntimeHandlers {
  return {
    changeProfileName: (value) =>
      runProfileWorkbarNameChange(profileWorkbarView, value, {
        changeBuilderProfileName
      }),
    changeTunable: (row, value) =>
      runProfileTunablesBarRowChange(profileTunables, row, value, {
        changeProfileTunables
      }),
    startRuntime: (action) =>
      runProfileRuntimeStartAction(action, startRuntimeHandlers)
  };
}
