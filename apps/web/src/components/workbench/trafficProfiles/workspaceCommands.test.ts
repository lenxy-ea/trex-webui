import { describe, expect, it } from "vitest";

import {
  profileCommandBaseAvailability,
  profileCommandButtonDisabled,
  profileCommandButtonViewModels,
  profileCommandDisabled,
  profileCommandPlan,
  profileCommandToolbarView,
  runProfileCommandAction,
  runProfileCommandPlan,
  runStreamCommandAction,
  runStreamCommandPlan,
  streamCommandBaseAvailability,
  streamCommandButtonDisabled,
  streamCommandButtonViewModels,
  streamCommandDisabled,
  streamCommandPlan,
  streamCommandToolbarView,
  workspaceCommandActionHandlers,
  workspaceCommandButtonViewModel
} from "./workspaceCommands";

describe("trafficProfiles workspace command availability", () => {
  it("keeps profile commands gated by builder mode, selection, streams, and validation", () => {
    const base = {
      hasSelectedProfile: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamBuilderEnabled: true,
      streamCount: 1
    };

    expect(profileCommandDisabled("create", base)).toBe(false);
    expect(profileCommandDisabled("duplicate", { ...base, hasSelectedProfile: false })).toBe(true);
    expect(profileCommandDisabled("create", { ...base, streamCount: 0 })).toBe(true);
    expect(profileCommandDisabled("yaml", { ...base, streamCount: 0 })).toBe(true);
    expect(profileCommandDisabled("yaml", { ...base, hasWorkbenchProfileValidationError: true })).toBe(true);
    expect(profileCommandDisabled("json", { ...base, streamBuilderEnabled: false })).toBe(true);
    expect(profileCommandDisabled("load", { ...base, isProfileWorkbenchBusy: true })).toBe(true);
  });

  it("keeps stream commands gated by streams, busy state, and validation", () => {
    const base = {
      hasSelectedStreamValidationError: false,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 1
    };

    expect(streamCommandDisabled("build", { ...base, streamCount: 0 })).toBe(false);
    expect(streamCommandDisabled("import", { ...base, streamCount: 0 })).toBe(false);
    expect(streamCommandDisabled("edit", { ...base, streamCount: 0 })).toBe(true);
    expect(streamCommandDisabled("pcap", { ...base, hasSelectedStreamValidationError: true })).toBe(true);
    expect(streamCommandDisabled("yaml", { ...base, hasWorkbenchProfileValidationError: true })).toBe(true);
    expect(streamCommandDisabled("delete", { ...base, isProfileWorkbenchBusy: true })).toBe(true);
  });

  it("applies per-button disabled overrides on top of command availability", () => {
    const profileBase = {
      hasSelectedProfile: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamBuilderEnabled: true,
      streamCount: 1
    };
    const streamBase = {
      hasSelectedStreamValidationError: false,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 1
    };

    expect(profileCommandButtonDisabled("create", profileBase)).toBe(false);
    expect(profileCommandButtonDisabled("create", profileBase, true)).toBe(true);
    expect(streamCommandButtonDisabled("build", streamBase)).toBe(false);
    expect(streamCommandButtonDisabled("build", streamBase, true)).toBe(true);
  });

  it("derives command button view models with disabled state", () => {
    const profileRows = profileCommandButtonViewModels({
      hasSelectedProfile: false,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamBuilderEnabled: true,
      streamCount: 1
    });
    const streamRows = streamCommandButtonViewModels({
      hasSelectedStreamValidationError: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 1
    });

    expect(profileRows.map((row) => [row.action, row.disabled])).toEqual([
      ["create", false],
      ["duplicate", true],
      ["load", true],
      ["delete", true],
      ["json", true],
      ["yaml", false]
    ]);
    expect(streamRows.map((row) => [row.action, row.disabled])).toContainEqual(["pcap", true]);
    expect(streamRows.map((row) => [row.action, row.disabled])).toContainEqual(["build", false]);
  });

  it("owns command toolbar and button presentation metadata", () => {
    const profileRows = profileCommandButtonViewModels({
      hasSelectedProfile: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamBuilderEnabled: true,
      streamCount: 1
    });
    const streamRows = streamCommandButtonViewModels({
      hasSelectedStreamValidationError: false,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 1
    });

    expect(profileCommandToolbarView).toEqual({
      ariaLabel: "Profile commands",
      className: "profile-button-grid"
    });
    expect(streamCommandToolbarView).toEqual({
      ariaLabel: "Stream commands",
      className: "stream-toolbar"
    });
    expect(profileRows[0]).toMatchObject({
      buttonClassName: "profile-command-button",
      iconSize: 14
    });
    expect(streamRows[0]).toMatchObject({
      buttonClassName: "stream-command-button",
      iconSize: 14
    });
  });

  it("derives the workspace command toolbar view model from workspace state", () => {
    const view = workspaceCommandButtonViewModel({
      isProfileWorkbenchBusy: false,
      selectedProfile: null,
      selectedStreamValidationError: "bad stream",
      streamBuilderEnabled: true,
      streamCount: 1,
      workbenchProfileValidationError: null
    });

    expect(view.profileCommandButtons.map((row) => [row.action, row.disabled])).toContainEqual([
      "duplicate",
      true
    ]);
    expect(view.profileCommandButtons.map((row) => [row.action, row.disabled])).toContainEqual([
      "create",
      false
    ]);
    expect(view.streamCommandButtons.map((row) => [row.action, row.disabled])).toContainEqual([
      "pcap",
      true
    ]);
    expect(view.streamCommandButtons.map((row) => [row.action, row.disabled])).toContainEqual([
      "build",
      false
    ]);
    expect(view.profileCommandToolbarView).toEqual(profileCommandToolbarView);
    expect(view.streamCommandToolbarView).toEqual(streamCommandToolbarView);
  });

  it("derives base availability from workspace state", () => {
    expect(profileCommandBaseAvailability({
      hasSelectedProfile: false,
      hasWorkbenchProfileValidationError: true,
      isProfileWorkbenchBusy: true,
      streamBuilderEnabled: false,
      streamCount: 0
    })).toEqual({
      hasSelectedProfile: false,
      hasWorkbenchProfileValidationError: true,
      isProfileWorkbenchBusy: true,
      streamBuilderEnabled: false,
      streamCount: 0
    });

    expect(streamCommandBaseAvailability({
      hasSelectedStreamValidationError: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 2
    })).toEqual({
      hasSelectedStreamValidationError: true,
      hasWorkbenchProfileValidationError: false,
      isProfileWorkbenchBusy: false,
      streamCount: 2
    });
  });

  it("plans profile command callbacks for the workspace shell", () => {
    expect(profileCommandPlan("create")).toEqual({ kind: "create" });
    expect(profileCommandPlan("duplicate")).toEqual({ kind: "duplicate" });
    expect(profileCommandPlan("load")).toEqual({ kind: "load" });
    expect(profileCommandPlan("delete")).toEqual({ kind: "delete" });
    expect(profileCommandPlan("json")).toEqual({ kind: "json" });
    expect(profileCommandPlan("yaml")).toEqual({ kind: "yaml" });
  });

  it("plans stream command side effects for the workspace shell", () => {
    expect(streamCommandPlan("build", false)).toEqual({
      kind: "build",
      nextTab: "Stream Properties"
    });
    expect(streamCommandPlan("edit", true)).toEqual({
      kind: "edit",
      nextTab: "Stream Properties",
      scrollToBuilder: true
    });
    expect(streamCommandPlan("edit", false)).toEqual({ kind: "ignored" });
    expect(streamCommandPlan("import", false)).toEqual({ kind: "import" });
    expect(streamCommandPlan("yaml", true)).toEqual({ kind: "yaml" });
  });

  it("runs profile command plans through the provided workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      create: () => calls.push("create"),
      delete: () => calls.push("delete"),
      duplicate: () => calls.push("duplicate"),
      exportJson: () => calls.push("json"),
      exportYaml: () => calls.push("yaml"),
      load: () => calls.push("load")
    };

    runProfileCommandPlan({ kind: "create" }, handlers);
    runProfileCommandPlan({ kind: "duplicate" }, handlers);
    runProfileCommandPlan({ kind: "load" }, handlers);
    runProfileCommandPlan({ kind: "delete" }, handlers);
    runProfileCommandPlan({ kind: "json" }, handlers);
    runProfileCommandPlan({ kind: "yaml" }, handlers);

    expect(calls).toEqual(["create", "duplicate", "load", "delete", "json", "yaml"]);
  });

  it("runs profile command actions through the provided workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      create: () => calls.push("create"),
      delete: () => calls.push("delete"),
      duplicate: () => calls.push("duplicate"),
      exportJson: () => calls.push("json"),
      exportYaml: () => calls.push("yaml"),
      load: () => calls.push("load")
    };

    runProfileCommandAction("json", handlers);
    runProfileCommandAction("yaml", handlers);

    expect(calls).toEqual(["json", "yaml"]);
  });

  it("runs stream command plans through the provided workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      build: () => calls.push("build"),
      delete: () => calls.push("delete"),
      duplicate: () => calls.push("duplicate"),
      edit: () => calls.push("edit"),
      exportPcap: () => calls.push("pcap"),
      exportYaml: () => calls.push("yaml"),
      importPcap: () => calls.push("import"),
      scrollToBuilder: () => calls.push("scroll"),
      selectTab: (tab: string) => calls.push(`tab:${tab}`)
    };

    runStreamCommandPlan({ kind: "ignored" }, handlers);
    runStreamCommandPlan({ kind: "build", nextTab: "Stream Properties" }, handlers);
    runStreamCommandPlan({ kind: "edit", nextTab: "Stream Properties", scrollToBuilder: true }, handlers);
    runStreamCommandPlan({ kind: "duplicate" }, handlers);
    runStreamCommandPlan({ kind: "delete" }, handlers);
    runStreamCommandPlan({ kind: "import" }, handlers);
    runStreamCommandPlan({ kind: "pcap" }, handlers);
    runStreamCommandPlan({ kind: "yaml" }, handlers);

    expect(calls).toEqual([
      "tab:Stream Properties",
      "build",
      "tab:Stream Properties",
      "edit",
      "scroll",
      "duplicate",
      "delete",
      "import",
      "pcap",
      "yaml"
    ]);
  });

  it("runs stream command actions through the selected-stream aware plan", () => {
    const calls: string[] = [];
    const handlers = {
      build: () => calls.push("build"),
      delete: () => calls.push("delete"),
      duplicate: () => calls.push("duplicate"),
      edit: () => calls.push("edit"),
      exportPcap: () => calls.push("pcap"),
      exportYaml: () => calls.push("yaml"),
      importPcap: () => calls.push("import"),
      scrollToBuilder: () => calls.push("scroll"),
      selectTab: (tab: string) => calls.push(`tab:${tab}`)
    };

    runStreamCommandAction("edit", false, handlers);
    runStreamCommandAction("edit", true, handlers);

    expect(calls).toEqual([
      "tab:Stream Properties",
      "edit",
      "scroll"
    ]);
  });

  it("binds workspace command actions to the current selection state", () => {
    const calls: string[] = [];
    const commandHandlers = workspaceCommandActionHandlers({
      hasSelectedStream: false,
      profileCommandHandlers: {
        create: () => calls.push("profile:create"),
        delete: () => calls.push("profile:delete"),
        duplicate: () => calls.push("profile:duplicate"),
        exportJson: () => calls.push("profile:json"),
        exportYaml: () => calls.push("profile:yaml"),
        load: () => calls.push("profile:load")
      },
      streamCommandHandlers: {
        build: () => calls.push("stream:build"),
        delete: () => calls.push("stream:delete"),
        duplicate: () => calls.push("stream:duplicate"),
        edit: () => calls.push("stream:edit"),
        exportPcap: () => calls.push("stream:pcap"),
        exportYaml: () => calls.push("stream:yaml"),
        importPcap: () => calls.push("stream:import"),
        scrollToBuilder: () => calls.push("stream:scroll"),
        selectTab: (tab) => calls.push(`stream:tab:${tab}`)
      }
    });

    commandHandlers.runProfileCommand("yaml");
    commandHandlers.runStreamCommand("edit");
    commandHandlers.runStreamCommand("build");

    expect(calls).toEqual([
      "profile:yaml",
      "stream:tab:Stream Properties",
      "stream:build"
    ]);
  });
});
