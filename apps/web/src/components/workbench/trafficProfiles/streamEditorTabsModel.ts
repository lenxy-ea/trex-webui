export const simpleStreamEditorTabs = ["Stream Properties", "Protocol Selection", "Protocol Data", "Advanced Settings", "Packet viewer"] as const;
export const advancedStreamEditorTabs = ["Stream Properties", "Packet Editor", "Field Engine"] as const;
export type StreamEditorTab = (typeof simpleStreamEditorTabs)[number] | (typeof advancedStreamEditorTabs)[number];
export const packetRenderTabs = new Set<StreamEditorTab>(["Packet viewer", "Packet Editor", "Field Engine"]);

export type StreamEditorTabState = {
  active: boolean;
  disabled: boolean;
  tab: StreamEditorTab;
};

export type StreamEditorTabButtonView = StreamEditorTabState & {
  ariaSelected: boolean;
  className: string;
  key: StreamEditorTab;
  label: StreamEditorTab;
  role: "tab";
};

export type StreamEditorModeButtonView = {
  className: string;
  disabled: boolean;
  label: string;
  title: string;
};

export type StreamEditorTabsViewModel = {
  modeButton: StreamEditorModeButtonView;
  paneAriaLabel: StreamEditorTab;
  paneClassName: string;
  rowClassName: string;
  tabListAriaLabel: string;
  tabListClassName: string;
  tabListRole: "tablist";
  tabs: StreamEditorTabButtonView[];
};

export function streamEditorTabsViewModel({
  effectiveEditorTab,
  isAdvanced,
  modeSwitchDisabled,
  rows
}: {
  effectiveEditorTab: StreamEditorTab;
  isAdvanced: boolean;
  modeSwitchDisabled: boolean;
  rows: readonly StreamEditorTabState[];
}): StreamEditorTabsViewModel {
  return {
    modeButton: {
      className: "stream-editor-mode-button",
      disabled: modeSwitchDisabled,
      label: isAdvanced ? "Simple mode" : "Advanced mode",
      title: isAdvanced
        ? "Return to structured stream editing"
        : "Switch to advanced Packet Editor and Field Engine"
    },
    paneAriaLabel: effectiveEditorTab,
    paneClassName: "stream-builder-pane",
    rowClassName: "stream-editor-tabs-row",
    tabListAriaLabel: "Stream editor tabs",
    tabListClassName: "stream-editor-tabs",
    tabListRole: "tablist",
    tabs: rows.map<StreamEditorTabButtonView>((row) => ({
      ...row,
      ariaSelected: row.active,
      className: `stream-editor-tab${row.active ? " stream-editor-tab--active" : ""}`,
      key: row.tab,
      label: row.tab,
      role: "tab"
    }))
  };
}
