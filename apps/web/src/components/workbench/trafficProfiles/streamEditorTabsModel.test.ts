import { describe, expect, it } from "vitest";

import { streamEditorTabsViewModel } from "./streamEditorTabsModel";

describe("streamEditorTabsModel", () => {
  it("derives stream editor tab presentation metadata", () => {
    const view = streamEditorTabsViewModel({
      effectiveEditorTab: "Packet Editor",
      isAdvanced: true,
      modeSwitchDisabled: false,
      rows: [
        { active: false, disabled: false, tab: "Stream Properties" },
        { active: true, disabled: false, tab: "Packet Editor" },
        { active: false, disabled: true, tab: "Field Engine" }
      ]
    });

    expect(view).toMatchObject({
      modeButton: {
        className: "stream-editor-mode-button",
        disabled: false,
        label: "Simple mode",
        title: "Return to structured stream editing"
      },
      paneAriaLabel: "Packet Editor",
      paneClassName: "stream-builder-pane",
      rowClassName: "stream-editor-tabs-row",
      tabListAriaLabel: "Stream editor tabs",
      tabListClassName: "stream-editor-tabs",
      tabListRole: "tablist"
    });
    expect(view.tabs).toEqual([
      {
        active: false,
        ariaSelected: false,
        className: "stream-editor-tab",
        disabled: false,
        key: "Stream Properties",
        label: "Stream Properties",
        role: "tab",
        tab: "Stream Properties"
      },
      {
        active: true,
        ariaSelected: true,
        className: "stream-editor-tab stream-editor-tab--active",
        disabled: false,
        key: "Packet Editor",
        label: "Packet Editor",
        role: "tab",
        tab: "Packet Editor"
      },
      {
        active: false,
        ariaSelected: false,
        className: "stream-editor-tab",
        disabled: true,
        key: "Field Engine",
        label: "Field Engine",
        role: "tab",
        tab: "Field Engine"
      }
    ]);
  });

  it("derives structured-mode switch text", () => {
    expect(streamEditorTabsViewModel({
      effectiveEditorTab: "Stream Properties",
      isAdvanced: false,
      modeSwitchDisabled: true,
      rows: [{ active: true, disabled: false, tab: "Stream Properties" }]
    }).modeButton).toEqual({
      className: "stream-editor-mode-button",
      disabled: true,
      label: "Advanced mode",
      title: "Switch to advanced Packet Editor and Field Engine"
    });
  });
});
