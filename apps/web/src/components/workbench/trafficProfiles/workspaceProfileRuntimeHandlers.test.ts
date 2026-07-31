import { describe, expect, it } from "vitest";

import type { ProfileTunablesDraft } from "../profileTunables";
import {
  profileTunablesBarRows,
  profileTunablesExtraRow,
  profileTunablesShortcutRows,
  profileTunablesViewModel,
  profileWorkbarViewModel
} from "./profileRuntimeModel";
import { workspaceProfileRuntimeHandlers } from "./workspaceProfileRuntimeHandlers";

const draft: ProfileTunablesDraft = {
  custom: {},
  extra: "",
  flow: "fs",
  pgId: "7",
  size: "64",
  vm: "cached"
};

describe("workspaceProfileRuntimeHandlers", () => {
  it("routes editable profile name changes and ignores read-only runtime names", () => {
    const names: string[] = [];
    const editable = workspaceProfileRuntimeHandlers({
      changeBuilderProfileName: (value) => names.push(value),
      changeProfileTunables: () => undefined,
      profileTunables: draft,
      profileWorkbarView: profileWorkbarViewModel({
        builderProfileName: "profile.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "Saved",
        streamBuilderEnabled: true
      }),
      startRuntimeHandlers: {
        startAll: () => undefined,
        startSelected: () => undefined
      }
    });
    const readonly = workspaceProfileRuntimeHandlers({
      changeBuilderProfileName: (value) => names.push(value),
      changeProfileTunables: () => undefined,
      profileTunables: draft,
      profileWorkbarView: profileWorkbarViewModel({
        builderProfileName: "profile.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "Ready",
        streamBuilderEnabled: false
      }),
      startRuntimeHandlers: {
        startAll: () => undefined,
        startSelected: () => undefined
      }
    });

    editable.changeProfileName("next.yaml");
    readonly.changeProfileName("ignored.py");

    expect(names).toEqual(["next.yaml"]);
  });

  it("routes runtime start actions to selected or all traffic handlers", () => {
    const calls: string[] = [];
    const handlers = workspaceProfileRuntimeHandlers({
      changeBuilderProfileName: () => undefined,
      changeProfileTunables: () => undefined,
      profileTunables: draft,
      profileWorkbarView: profileWorkbarViewModel({
        builderProfileName: "profile.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "Ready",
        streamBuilderEnabled: false
      }),
      startRuntimeHandlers: {
        startAll: () => calls.push("all"),
        startSelected: () => calls.push("selected")
      }
    });

    handlers.startRuntime("selected");
    handlers.startRuntime("all");

    expect(calls).toEqual(["selected", "all"]);
  });

  it("routes tunable row edits through the profile tunables draft patch", () => {
    const changes: ProfileTunablesDraft[] = [];
    const viewModel = profileTunablesViewModel(true, null);
    const [sizeRow] = profileTunablesBarRows({
      customRows: [],
      extraRow: profileTunablesExtraRow(viewModel, draft),
      shortcutRows: profileTunablesShortcutRows(viewModel, draft)
    });
    const handlers = workspaceProfileRuntimeHandlers({
      changeBuilderProfileName: () => undefined,
      changeProfileTunables: (nextDraft) => changes.push(nextDraft),
      profileTunables: draft,
      profileWorkbarView: profileWorkbarViewModel({
        builderProfileName: "profile.yaml",
        profilePath: "runtime.py",
        statusIsError: false,
        statusText: "Ready",
        streamBuilderEnabled: true
      }),
      startRuntimeHandlers: {
        startAll: () => undefined,
        startSelected: () => undefined
      }
    });

    handlers.changeTunable(sizeRow, "128");

    expect(changes).toEqual([
      {
        ...draft,
        size: "128"
      }
    ]);
  });
});
