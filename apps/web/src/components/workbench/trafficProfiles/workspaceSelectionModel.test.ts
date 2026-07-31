import { describe, expect, it, vi } from "vitest";

import type { ProfilePacketPreview, ProfileRecord, ProfileWorkbenchStream } from "../../../api";
import { workbenchStream } from "../../../test/appTestHarness";
import type { AdvancedVmTargetRow } from "./model";
import type { RawPacketFieldRow } from "./rawPacketModel";
import { advancedVmTemplates } from "./advancedVmTemplates";
import {
  advancedEditorModeAction,
  advancedVmDraftChangeAction,
  advancedEditorModePatch,
  advancedVmDraftChangedState,
  advancedVmDraftApplyAction,
  advancedVmDraftViewModel,
  advancedVmEditorSourceViewModel,
  advancedVmStreamForEditor,
  advancedVmDraftApplyPatch,
  advancedVmStreamCandidatesViewModel,
  advancedVmEditorStateViewModel,
  advancedVmTemplateParameterChangeAction,
  advancedVmTargetDraftAppliedState,
  advancedVmTargetSourceChangedState,
  advancedVmTemplateParameterChangedState,
  advancedVmTemplateParametersResetState,
  advancedVmTemplateParametersResetAction,
  clearAdvancedVmTemplateParameterDrafts,
  clearRawPacketFieldScopeState,
  clearScopedDraftField,
  clearScopedDraftPrefix,
  clearRawPacketOverridePatch,
  clearScopedValue,
  defaultAdvancedVmTargetSourceForEditor,
  editorTabSelectionAction,
  editorTabViewModels,
  effectiveAdvancedVmTargetSourceForEditor,
  initialAdvancedVmEditorDraftState,
  initialRawPacketEditorDraftState,
  rawPacketAppliedDraftHex,
  rawPacketDraftChangeAction,
  rawPacketDraftChangedState,
  rawPacketDraftApplyAction,
  rawPacketDraftApplyPatch,
  rawPacketDraftSeedFromPreviewAction,
  rawPacketFieldDraftApplyAction,
  rawPacketFieldApplyDraftResult,
  rawPacketFieldApplyDraftState,
  rawPacketFieldAdvancedVmTargetAction,
  rawPacketFieldDraftChangeAction,
  rawPacketFieldAdvancedVmTargetDraft,
  rawPacketFieldDraftChangedState,
  rawPacketFieldLocateAction,
  rawPacketFieldLocateResult,
  rawPacketFieldLocateState,
  rawPacketSelectedFieldState,
  rawPacketFieldOutOfBoundsStatus,
  rawPacketDraftViewModel,
  rawPacketEditorStateViewModel,
  rawPacketOverrideClearAction,
  runAdvancedEditorMode,
  runAdvancedVmDraftApply,
  runAdvancedVmDraftApplyAction,
  runAdvancedVmDraftChangeAction,
  runAdvancedVmDraftTextChange,
  runAdvancedEditorModeAction,
  runAdvancedVmTemplateParameterChange,
  runAdvancedVmTemplateParameterChangeAction,
  runAdvancedVmTemplateParametersReset,
  runAdvancedVmTemplateParametersResetAction,
  runEditorTabSelection,
  runEditorTabSelectionAction,
  runRawPacketDraftApply,
  runRawPacketDraftApplyAction,
  runRawPacketDraftChangeAction,
  runRawPacketDraftSeedFromPreview,
  runRawPacketDraftTextChange,
  runRawPacketFieldDraftApply,
  runRawPacketFieldDraftApplyAction,
  runRawPacketFieldDraftChangeAction,
  runRawPacketFieldDraftTextChange,
  runRawPacketFieldAdvancedVmTarget,
  runRawPacketFieldAdvancedVmTargetAction,
  runRawPacketFieldLocate,
  runRawPacketFieldLocateAction,
  runRawPacketOverrideClear,
  runRawPacketOverrideClearAction,
  rawDraftAdvancedVmStreamForEditor,
  rawPacketDraftStatusText,
  rawPacketDraftWireLength,
  selectableEditorTab,
  selectedStreamEditorStateViewModel,
  setAdvancedVmTemplateParameterDraft,
  setScopedDraftField,
  setScopedValue,
  streamEditorContextKey,
  structuredAdvancedVmStreamForEditor,
  workspaceEditorTabActionHandlers,
  workspaceRawPacketFieldActionHandlers,
  type AdvancedVmEditorDraftState,
  type RawPacketEditorDraftState,
  workspaceSelectionViewModel
} from "./workspaceSelectionModel";

const baseStream = {
  name: "stream-1",
  frame_length: 64,
  frame_length_type: "Fixed",
  packet_binary_base64: null,
  packet_type: "Ethernet/IPv4/UDP"
} as ProfileWorkbenchStream;

const preview = {
  binary_base64: "ABEi",
  frame_length: 64,
  hex: "00 11 22",
  hex_lines: [],
  index: 1,
  layers: [],
  name: "stream-1",
  packet_type: "Ethernet/IPv4/UDP",
  wire_length: 68
} satisfies ProfilePacketPreview;

const advancedBaseStream = workbenchStream() as ProfileWorkbenchStream;

const rawByteField = {
  field: "Destination",
  format: "hex",
  id: "Ethernet:Destination:1:1",
  layer: "Ethernet",
  length: 1,
  offset: 1,
  value: "11"
} satisfies RawPacketFieldRow;

describe("workspaceSelectionModel", () => {
  it("builds stable editor context keys", () => {
    expect(streamEditorContextKey({
      packetSource: "abc",
      packetType: "Ethernet/IPv4/UDP",
      profilePath: "profiles/gui.yaml",
      selectedStreamIndex: 1,
      streamName: "stream-2"
    })).toBe("profiles/gui.yaml|1|stream-2|Ethernet/IPv4/UDP|abc");
  });

  it("derives selected stream editor context from streams and previews", () => {
    const view = workspaceSelectionViewModel({
      activeEditorTab: "Packet Editor",
      profilePacketPreviews: [preview],
      profilePath: "profiles/gui.yaml",
      selectedProfile: {
        relative_path: "gui.yaml"
      } as ProfileRecord,
      selectedStreamIndex: 0,
      streams: [baseStream]
    });

    expect(view.selectedStream).toBe(baseStream);
    expect(view.selectedStreamAdvanced).toBe(false);
    expect(view.effectiveEditorTab).toBe("Stream Properties");
    expect(view.hasRunnableProfile).toBe(true);
    expect(view.rawPacketDefaultHex).toBe("00 11 22");
    expect(view.packetEditorContextKey).toBe("gui.yaml|0|stream-1|Ethernet/IPv4/UDP|ABEi");
    expect(view.advancedVmTemplateParameterDraftKey).toBe(view.packetEditorContextKey);
    expect(view.advancedVmSourceKey).toContain(`${view.packetEditorContextKey}|`);
    expect(view.advancedVmSourceJson).toContain('"instructions": []');
  });

  it("falls back to the first stream and keeps Advanced tabs for Advanced streams", () => {
    const advancedStream = {
      ...baseStream,
      advanced_mode: true,
      name: "advanced-stream",
      packet_binary_base64: "qrvM"
    } as ProfileWorkbenchStream;
    const view = workspaceSelectionViewModel({
      activeEditorTab: "Field Engine",
      profilePacketPreviews: [preview],
      profilePath: "profiles/advanced.yaml",
      selectedStreamIndex: 99,
      streams: [advancedStream]
    });

    expect(view.selectedStream).toBe(advancedStream);
    expect(view.selectedPreview).toBe(preview);
    expect(view.selectedStreamAdvanced).toBe(true);
    expect(view.effectiveEditorTab).toBe("Field Engine");
    expect(view.rawPacketSource).toBe("qrvM");
    expect(view.packetEditorContextKey).toBe("profiles/advanced.yaml|99|advanced-stream|Ethernet/IPv4/UDP|qrvM");
  });

  it("builds editor tab selection actions", () => {
    expect(editorTabSelectionAction("Packet Editor", ["Stream Properties"], false)).toEqual({
      kind: "ignored"
    });
    expect(editorTabSelectionAction("Stream Properties", ["Stream Properties"], false)).toEqual({
      kind: "select",
      nextTab: "Stream Properties",
      renderPreview: false
    });
    expect(editorTabSelectionAction("Packet viewer", ["Packet viewer"], false)).toEqual({
      kind: "select",
      nextTab: "Packet viewer",
      renderPreview: true
    });
    expect(editorTabSelectionAction("Packet viewer", ["Packet viewer"], true)).toEqual({
      kind: "select",
      nextTab: "Packet viewer",
      renderPreview: false
    });
  });

  it("runs editor tab selection actions through workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      renderPreview: () => calls.push("render"),
      scrollToBuilder: () => calls.push("scroll"),
      selectTab: (tab: string) => calls.push(`select:${tab}`)
    };

    runEditorTabSelectionAction({ kind: "ignored" }, handlers);
    expect(calls).toEqual([]);

    runEditorTabSelectionAction({
      kind: "select",
      nextTab: "Stream Properties",
      renderPreview: false
    }, handlers);
    expect(calls).toEqual(["select:Stream Properties", "scroll"]);

    runEditorTabSelectionAction({
      kind: "select",
      nextTab: "Packet viewer",
      renderPreview: true
    }, handlers);
    expect(calls).toEqual([
      "select:Stream Properties",
      "scroll",
      "select:Packet viewer",
      "scroll",
      "render"
    ]);

    runEditorTabSelection("Field Engine", ["Packet viewer"], false, handlers);
    expect(calls).toEqual([
      "select:Stream Properties",
      "scroll",
      "select:Packet viewer",
      "scroll",
      "render"
    ]);

    runEditorTabSelection("Packet viewer", ["Packet viewer"], false, handlers);
    expect(calls).toEqual([
      "select:Stream Properties",
      "scroll",
      "select:Packet viewer",
      "scroll",
      "render",
      "select:Packet viewer",
      "scroll",
      "render"
    ]);
  });

  it("binds editor tab selection handlers for the workspace", () => {
    const calls: string[] = [];
    const handlers = workspaceEditorTabActionHandlers({
      hasWorkbenchStreamValidationError: false,
      renderPreview: () => calls.push("render"),
      scrollToBuilder: () => calls.push("scroll"),
      selectTab: (tab) => calls.push(`select:${tab}`),
      visibleEditorTabs: ["Stream Properties", "Packet viewer"]
    });

    handlers.selectEditorTab("Protocol Data");
    expect(calls).toEqual([]);

    handlers.selectEditorTab("Packet viewer");
    expect(calls).toEqual(["select:Packet viewer", "scroll", "render"]);
  });

  it("builds editor tab render state", () => {
    expect(editorTabViewModels(
      ["Stream Properties", "Packet viewer", "Field Engine"],
      "Packet viewer",
      true
    )).toEqual([
      {
        active: true,
        disabled: false,
        tab: "Stream Properties"
      },
      {
        active: false,
        disabled: true,
        tab: "Packet viewer"
      },
      {
        active: false,
        disabled: true,
        tab: "Field Engine"
      }
    ]);

    expect(selectableEditorTab(
      ["Stream Properties", "Packet viewer", "Field Engine"],
      "Packet viewer",
      true
    )).toBe("Stream Properties");
    expect(selectableEditorTab(
      ["Stream Properties", "Protocol Data", "Packet viewer"],
      "Protocol Data",
      true
    )).toBe("Protocol Data");

    expect(editorTabViewModels(["Stream Properties", "Protocol Data"], "Protocol Data", false)).toEqual([
      {
        active: false,
        disabled: false,
        tab: "Stream Properties"
      },
      {
        active: true,
        disabled: false,
        tab: "Protocol Data"
      }
    ]);
  });

  it("derives selected stream editor settings, protocol data, and tabs", () => {
    const stream = workbenchStream({
      name: "tcp-stream",
      packet_type: "Ethernet/IPv4/TCP"
    }) as ProfileWorkbenchStream;
    const view = selectedStreamEditorStateViewModel({
      effectiveEditorTab: "Packet viewer",
      hasWorkbenchStreamValidationError: true,
      selectedStream: stream,
      streams: [stream],
      visibleEditorTabs: ["Stream Properties", "Packet viewer", "Protocol Data"]
    });

    expect(view.streamPropertiesView?.packet.name).toBe("tcp-stream");
    expect(view.frameLengthView?.frameLengthType).toBe("Fixed");
    expect(view.protocolSelectionView?.l4Options.some((option) => option.value === "TCP" && option.checked)).toBe(true);
    expect(view.protocolDataView?.tcpCore).toBe(view.tcpCoreView);
    expect(view.protocolDataView?.mediaAccess).toBe(view.mediaAccessView);
    expect(view.editorTabRows).toEqual([
      {
        active: true,
        disabled: false,
        tab: "Stream Properties"
      },
      {
        active: false,
        disabled: true,
        tab: "Packet viewer"
      },
      {
        active: false,
        disabled: false,
        tab: "Protocol Data"
      }
    ]);

    const emptyView = selectedStreamEditorStateViewModel({
      effectiveEditorTab: "Stream Properties",
      hasWorkbenchStreamValidationError: false,
      selectedStream: null,
      streams: [],
      visibleEditorTabs: ["Stream Properties"]
    });

    expect(emptyView.streamEditorSettingsView).toBeNull();
    expect(emptyView.protocolDataView).toBeNull();
    expect(emptyView.mediaAccessView).toBeNull();
    expect(emptyView.editorTabRows).toEqual([
      {
        active: true,
        disabled: false,
        tab: "Stream Properties"
      }
    ]);
  });

  it("describes raw packet draft size", () => {
    expect(rawPacketDraftWireLength(0)).toBe(0);
    expect(rawPacketDraftWireLength(30)).toBe(64);
    expect(rawPacketDraftWireLength(80)).toBe(84);
    expect(rawPacketDraftStatusText(null, 30, 64)).toBe("30 bytes / 64 wire");
    expect(rawPacketDraftStatusText("Invalid hex", 30, 64)).toBe("Invalid hex");
  });

  it("derives raw packet draft editor state", () => {
    const view = rawPacketDraftViewModel(
      "00 11 22 33 44 55 66 77 88 99 aa bb 08 00",
      {
        ...baseStream,
        packet_binary_base64: "ABEi"
      } as ProfileWorkbenchStream
    );

    expect(view.byteCount).toBe(14);
    expect(view.error).toBeNull();
    expect(view.overrideActive).toBe(true);
    expect(view.parsedBytes.slice(0, 3)).toEqual([0, 17, 34]);
    expect(view.statusText).toBe("14 bytes / 64 wire");
    expect(view.wireLength).toBe(64);
    expect(view.fieldRows.some((row) => row.layer === "Ethernet")).toBe(true);

    const invalidView = rawPacketDraftViewModel("00 zz", baseStream);
    expect(invalidView.error).toBe("Raw packet hex must contain only hex bytes.");
    expect(invalidView.fieldRows).toEqual([]);
    expect(invalidView.overrideActive).toBe(false);
  });

  it("derives scoped raw packet editor state", () => {
    const defaultView = rawPacketEditorStateViewModel({
      contextKey: "stream-a",
      defaultHex: "00 11 22",
      drafts: {},
      fieldDrafts: {},
      fieldStatuses: {},
      selectedStream: baseStream
    });

    expect(defaultView.draft).toBe("00 11 22");
    expect(defaultView.draftView.byteCount).toBe(3);
    expect(defaultView.fieldDraft).toEqual({});
    expect(defaultView.fieldScopeKey).toBe("stream-a");
    expect(defaultView.fieldStatus).toBeNull();

    const status = {
      kind: "ok" as const,
      text: "field updated"
    };
    const scopedView = rawPacketEditorStateViewModel({
      contextKey: "stream-b",
      defaultHex: "00 11 22",
      drafts: {
        "stream-b": "aa bb cc dd"
      },
      fieldDrafts: {
        "stream-b": {
          [rawByteField.id]: "ff"
        }
      },
      fieldStatuses: {
        "stream-b": status
      },
      selectedStream: {
        ...baseStream,
        packet_binary_base64: "ABEi"
      } as ProfileWorkbenchStream
    });

    expect(scopedView.draft).toBe("aa bb cc dd");
    expect(scopedView.draftView.byteCount).toBe(4);
    expect(scopedView.draftView.overrideActive).toBe(true);
    expect(scopedView.fieldDraft).toEqual({
      [rawByteField.id]: "ff"
    });
    expect(scopedView.fieldScopeKey).toBe("stream-b");
    expect(scopedView.fieldStatus).toBe(status);
  });

  it("derives Advanced VM draft editor state", () => {
    const draft = '{"instructions":[{"name":"fv"}],"split_by_var":"fv"}';
    const view = advancedVmDraftViewModel(draft, {
      ...baseStream,
      packet_binary_base64: "AAAA"
    } as ProfileWorkbenchStream, preview);

    expect(view.applyError).toBeNull();
    expect(view.body).toEqual({
      instructions: [{ name: "fv" }],
      split_by_var: "fv"
    });
    expect(view.bytes).toBeGreaterThan(0);
    expect(view.draft).toBe(draft);
    expect(view.error).toBeNull();
    expect(view.packetSource).toBe("AAAA");
    expect(view.statusText).toBe(`${1} instructions / ${view.bytes} bytes`);
  });

  it("uses preview bytes and reports Advanced VM draft apply blockers", () => {
    expect(advancedVmDraftViewModel('{"instructions":[]}', baseStream, preview).packetSource).toBe("ABEi");
    expect(advancedVmDraftViewModel('{"instructions":[]}', baseStream, null).applyError)
      .toBe("Render packet preview before applying VM.");

    const invalidView = advancedVmDraftViewModel("[", baseStream, preview);
    expect(invalidView.applyError).toBeTruthy();
    expect(invalidView.body).toBeNull();
    expect(invalidView.statusText).toBe(invalidView.error);
  });

  it("derives scoped Advanced VM editor state", () => {
    const defaultDraft = "{\n  \"instructions\": [],\n  \"split_by_var\": \"\"\n}\n";
    const defaultView = advancedVmEditorStateViewModel({
      defaultDraft,
      draftKey: "vm-source-a",
      drafts: {},
      rawPacketDraft: "00 11 22",
      rawPacketDraftBytes: 3,
      rawPacketDraftError: null,
      rawPacketWireLength: 64,
      selectedPreview: preview,
      selectedStream: advancedBaseStream,
      sourceKey: "stream-a",
      sources: {},
      templateName: advancedVmTemplates[0].name,
      templateParameterDrafts: {},
      templates: advancedVmTemplates
    });

    expect(defaultView.draft).toBe(defaultDraft);
    expect(defaultView.draftView.packetSource).toBe("ABEi");
    expect(defaultView.editorView.candidates.structuredStream).toMatchObject({
      packet_type: "Ethernet/IPv4/UDP"
    });
    expect(defaultView.editorView.editorSource.effectiveSource).toBe("raw");
    expect(defaultView.editorStream).toBe(defaultView.editorView.editorSource.stream);
    expect(defaultView.rawDraftStream).toBe(defaultView.editorView.candidates.rawStream);
    expect(defaultView.templateView).toBe(defaultView.editorView.template);
    expect(defaultView.selectedTemplate).toBe(defaultView.editorView.template.selectedTemplate);
    expect(defaultView.selectedTemplateBody).toBe(defaultView.editorView.template.body);
    expect(defaultView.selectedTemplateFlowVars).toBe(defaultView.editorView.template.flowVars);
    expect(defaultView.targetChoiceView).toBe(defaultView.editorView.targetChoice);
    expect(defaultView.rawTargetRows).toBe(defaultView.editorView.targetChoice.rawTargetRows);
    expect(defaultView.selectedTargetRows).toBe(defaultView.editorView.targetChoice.selectedTargetRows);
    expect(defaultView.readyTargetCount).toBe(defaultView.editorView.targetChoice.readyTargetCount);
    expect(defaultView.templateCompatible).toBe(defaultView.editorView.template.compatible);
    expect(defaultView.templateHint).toBe(defaultView.editorView.template.hint);
    expect(defaultView.templateParameterDirty).toBe(defaultView.editorView.template.parameterDirty);
    expect(defaultView.templateReady).toBe(defaultView.editorView.template.ready);
    expect(defaultView.templateParameterDraft).toEqual({});

    const scopedView = advancedVmEditorStateViewModel({
      defaultDraft,
      draftKey: "vm-source-b",
      drafts: {
        "vm-source-b": "{\"instructions\":[{\"name\":\"fv\"}],\"split_by_var\":\"fv\"}"
      },
      rawPacketDraft: "00 11 22",
      rawPacketDraftBytes: 3,
      rawPacketDraftError: null,
      rawPacketWireLength: 64,
      selectedPreview: null,
      selectedStream: {
        ...advancedBaseStream,
        packet_binary_base64: "AAAA"
      } as ProfileWorkbenchStream,
      sourceKey: "stream-b",
      sources: {
        "stream-b": "raw"
      },
      templateName: advancedVmTemplates[0].name,
      templateParameterDrafts: {
        "stream-b": {
          "template-a:flow:min_value": "1"
        }
      },
      templates: advancedVmTemplates
    });

    expect(scopedView.draftView.statusText).toContain("1 instructions");
    expect(scopedView.draftView.packetSource).toBe("AAAA");
    expect(scopedView.editorView.editorSource.selectedSource).toBe("raw");
    expect(scopedView.templateParameterDraft).toEqual({
      "template-a:flow:min_value": "1"
    });
  });

  it("builds Advanced editor mode patches", () => {
    expect(advancedEditorModePatch(baseStream, "ABEi", null)).toMatchObject({
      advanced_mode: true,
      frame_length: 64,
      frame_length_max: 1518,
      frame_length_min: 64,
      frame_length_type: "Fixed",
      packet_binary_base64: "ABEi"
    });
    expect(advancedEditorModePatch({
      ...baseStream,
      frame_length: 512,
      frame_length_max: 9000,
      frame_length_min: 128,
      frame_length_type: "Random"
    } as ProfileWorkbenchStream, "ABEi", 256)).toMatchObject({
      frame_length: 512,
      frame_length_max: 9000,
      frame_length_min: 128,
      frame_length_type: "Random"
    });
  });

  it("builds Advanced editor mode actions", () => {
    expect(advancedEditorModeAction(null, preview)).toEqual({ kind: "none" });
    expect(advancedEditorModeAction({
      ...baseStream,
      advanced_mode: true,
      packet_binary_base64: "ABEi"
    } as ProfileWorkbenchStream, preview)).toEqual({
      kind: "clear-raw-override",
      nextTab: "Stream Properties"
    });
    expect(advancedEditorModeAction(baseStream, null)).toEqual({
      kind: "render-preview",
      nextTab: "Packet viewer"
    });
    expect(advancedEditorModeAction(baseStream, preview)).toMatchObject({
      kind: "apply-advanced-mode",
      nextTab: "Packet Editor",
      patch: {
        advanced_mode: true,
        frame_length: 64,
        packet_binary_base64: "ABEi"
      }
    });
  });

  it("runs Advanced editor mode actions through workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      applyPatch: vi.fn((patch) => calls.push(`apply:${String(patch.advanced_mode)}`)),
      canRenderPreview: true,
      clearRawPacketOverride: vi.fn(() => {
        calls.push("clear");
        return true;
      }),
      renderPreview: vi.fn(() => calls.push("render")),
      selectTab: vi.fn((tab) => calls.push(`select:${tab}`))
    };

    runAdvancedEditorModeAction({ kind: "none" }, handlers);
    expect(calls).toEqual([]);

    runAdvancedEditorModeAction({
      kind: "clear-raw-override",
      nextTab: "Stream Properties"
    }, handlers);
    expect(calls).toEqual(["clear", "select:Stream Properties"]);

    runAdvancedEditorModeAction({
      kind: "render-preview",
      nextTab: "Packet viewer"
    }, {
      ...handlers,
      canRenderPreview: false
    });
    expect(calls).toEqual(["clear", "select:Stream Properties", "select:Packet viewer"]);

    runAdvancedEditorModeAction({
      kind: "render-preview",
      nextTab: "Packet viewer"
    }, handlers);
    expect(calls).toEqual([
      "clear",
      "select:Stream Properties",
      "select:Packet viewer",
      "select:Packet viewer",
      "render"
    ]);

    runAdvancedEditorModeAction({
      kind: "apply-advanced-mode",
      nextTab: "Packet Editor",
      patch: {
        advanced_mode: true
      }
    }, handlers);
    expect(calls).toEqual([
      "clear",
      "select:Stream Properties",
      "select:Packet viewer",
      "select:Packet viewer",
      "render",
      "apply:true",
      "select:Packet Editor"
    ]);

    runAdvancedEditorMode(baseStream, preview, handlers);
    expect(calls).toEqual([
      "clear",
      "select:Stream Properties",
      "select:Packet viewer",
      "select:Packet viewer",
      "render",
      "apply:true",
      "select:Packet Editor",
      "apply:true",
      "select:Packet Editor"
    ]);
  });

  it("does not switch tabs when clearing raw packet override is cancelled", () => {
    const selectTab = vi.fn();
    runAdvancedEditorModeAction({
      kind: "clear-raw-override",
      nextTab: "Stream Properties"
    }, {
      applyPatch: vi.fn(),
      canRenderPreview: true,
      clearRawPacketOverride: () => false,
      renderPreview: vi.fn(),
      selectTab
    });

    expect(selectTab).not.toHaveBeenCalled();
  });

  it("builds raw packet apply patches", () => {
    expect(rawPacketDraftApplyPatch(baseStream, "001122", 3)).toMatchObject({
      advanced_mode: true,
      frame_length: 64,
      packet_binary_base64: "ABEi",
      packet_meta_base64: null,
      packet_model: null
    });
    expect(rawPacketDraftApplyPatch(baseStream, "00".repeat(80), 80)).toMatchObject({
      frame_length: 84
    });
  });

  it("formats applied raw packet bytes back into the editor draft", () => {
    expect(rawPacketAppliedDraftHex("ABEi")).toBe("00 11 22");
    expect(rawPacketAppliedDraftHex(null)).toBe("");
  });

  it("builds raw packet draft apply actions", () => {
    expect(rawPacketDraftApplyAction(null, null, "001122", 3)).toEqual({ kind: "ignored" });
    expect(rawPacketDraftApplyAction(baseStream, "Invalid hex", "001122", 3)).toEqual({ kind: "ignored" });
    expect(rawPacketDraftApplyAction(baseStream, null, "001122", 3)).toMatchObject({
      kind: "apply",
      nextDraft: "00 11 22",
      patch: {
        advanced_mode: true,
        frame_length: 64,
        packet_binary_base64: "ABEi"
      }
    });
  });

  it("runs raw packet draft apply actions through workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      applyPatch: vi.fn((patch) => calls.push(`patch:${String(patch.advanced_mode)}`)),
      updateDraft: vi.fn((nextDraft) => calls.push(`draft:${nextDraft}`))
    };

    runRawPacketDraftApplyAction({ kind: "ignored" }, handlers);
    expect(calls).toEqual([]);

    runRawPacketDraftApplyAction({
      kind: "apply",
      nextDraft: "00 11 22",
      patch: {
        advanced_mode: true
      }
    }, handlers);

    expect(calls).toEqual(["patch:true", "draft:00 11 22"]);

    runRawPacketDraftApply(baseStream, null, "001122", 3, handlers);
    expect(calls).toEqual(["patch:true", "draft:00 11 22", "patch:true", "draft:00 11 22"]);
  });

  it("dispatches raw packet draft change actions through scoped state callbacks", () => {
    let state: RawPacketEditorDraftState = {
      ...initialRawPacketEditorDraftState(),
      fieldDrafts: {
        field: {
          [rawByteField.id]: "ff"
        }
      },
      fieldStatuses: {
        field: {
          kind: "ok" as const,
          text: "updated"
        }
      },
      selectedFieldId: rawByteField.id
    };
    const updateState = vi.fn((updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => {
      state = updater(state);
    });

    expect(rawPacketDraftChangeAction("stream", "field", "aa bb")).toEqual({
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      kind: "change",
      nextDraft: "aa bb"
    });
    runRawPacketDraftChangeAction(rawPacketDraftChangeAction("stream", "field", "aa bb"), { updateState });

    expect(updateState).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      drafts: {
        stream: "aa bb"
      },
      fieldDrafts: {},
      fieldStatuses: {},
      selectedFieldId: null
    });

    expect(rawPacketDraftSeedFromPreviewAction("stream", "field", preview)).toEqual({
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      kind: "change",
      nextDraft: "00 11 22"
    });
    runRawPacketDraftTextChange("stream-2", "field", "cc dd", { updateState });
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(state.drafts["stream-2"]).toBe("cc dd");

    runRawPacketDraftSeedFromPreview("stream-3", "field", preview, { updateState });
    expect(updateState).toHaveBeenCalledTimes(3);
    expect(state.drafts["stream-3"]).toBe("00 11 22");
  });

  it("dispatches raw packet field draft changes through scoped state callbacks", () => {
    let state: RawPacketEditorDraftState = {
      ...initialRawPacketEditorDraftState(),
      fieldStatuses: {
        field: {
          kind: "error" as const,
          text: "old error"
        }
      }
    };
    const updateState = vi.fn((updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => {
      state = updater(state);
    });

    expect(rawPacketFieldDraftChangeAction("field", rawByteField.id, "ff")).toEqual({
      fieldScopeKey: "field",
      kind: "change",
      rowId: rawByteField.id,
      value: "ff"
    });
    runRawPacketFieldDraftChangeAction(
      rawPacketFieldDraftChangeAction("field", rawByteField.id, "ff"),
      { updateState }
    );

    expect(updateState).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      drafts: {},
      fieldDrafts: {
        field: {
          [rawByteField.id]: "ff"
        }
      },
      fieldStatuses: {},
      selectedFieldId: null
    });

    runRawPacketFieldDraftTextChange("field", rawByteField.id, "aa", { updateState });
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(state.fieldDrafts.field?.[rawByteField.id]).toBe("aa");
  });

  it("builds raw packet field draft results", () => {
    expect(rawPacketFieldOutOfBoundsStatus(rawByteField)).toEqual({
      kind: "error",
      text: "Ethernet Destination bytes are outside the raw hex draft."
    });
    expect(rawPacketFieldApplyDraftResult("00 11 22 33", rawByteField, {
      [rawByteField.id]: "ff"
    })).toEqual({
      nextHex: "00 ff 22 33",
      ok: true,
      rowId: rawByteField.id,
      status: {
        kind: "ok",
        text: "Ethernet Destination updated at byte 1. Apply raw to save this packet."
      }
    });
    expect(rawPacketFieldApplyDraftResult("00 11 22 33", rawByteField, {
      [rawByteField.id]: "f"
    })).toEqual({
      ok: false,
      status: {
        kind: "error",
        text: "Expected 2 hex characters."
      }
    });
  });

  it("builds raw packet field locate results", () => {
    expect(rawPacketFieldLocateResult("00 11 22 33", rawByteField)).toEqual({
      ok: true,
      rowId: rawByteField.id,
      selection: {
        end: 5,
        start: 3
      }
    });
    expect(rawPacketFieldLocateResult("00", rawByteField)).toEqual({
      ok: false,
      rowId: rawByteField.id,
      status: {
        kind: "error",
        text: "Ethernet Destination bytes are outside the raw hex draft."
      }
    });
  });

  it("dispatches raw packet field locate actions", () => {
    let state: RawPacketEditorDraftState = {
      ...initialRawPacketEditorDraftState(),
      fieldStatuses: {
        field: {
          kind: "error",
          text: "old error"
        }
      }
    };
    const updateState = vi.fn((updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => {
      state = updater(state);
    });
    const selectTextRange = vi.fn();
    const handlers = {
      fieldScopeKey: "field",
      selectTextRange,
      updateState
    };

    expect(runRawPacketFieldLocateAction(rawPacketFieldLocateAction("00", rawByteField), handlers)).toBe(false);
    expect(updateState).toHaveBeenCalledTimes(1);
    expect(selectTextRange).not.toHaveBeenCalled();
    expect(state).toEqual({
      drafts: {},
      fieldDrafts: {},
      fieldStatuses: {
        field: {
          kind: "error",
          text: "Ethernet Destination bytes are outside the raw hex draft."
        }
      },
      selectedFieldId: rawByteField.id
    });

    expect(runRawPacketFieldLocateAction(rawPacketFieldLocateAction("00 11 22 33", rawByteField), handlers)).toBe(true);
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(selectTextRange).toHaveBeenCalledWith({ end: 5, start: 3 });
    expect(state).toEqual({
      drafts: {},
      fieldDrafts: {},
      fieldStatuses: {},
      selectedFieldId: rawByteField.id
    });

    expect(runRawPacketFieldLocate("00", rawByteField, handlers)).toBe(false);
    expect(updateState).toHaveBeenCalledTimes(3);
    expect(selectTextRange).toHaveBeenCalledTimes(1);
  });

  it("dispatches raw packet field draft apply actions", () => {
    let state: RawPacketEditorDraftState = {
      drafts: {
        stream: "00 11 22 33"
      },
      fieldDrafts: {
        field: {
          [rawByteField.id]: "aa"
        }
      },
      fieldStatuses: {},
      selectedFieldId: null
    };
    const updateState = vi.fn((updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => {
      state = updater(state);
    });
    const handlers = {
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      updateState
    };

    runRawPacketFieldDraftApplyAction(
      rawPacketFieldDraftApplyAction("00 11 22 33", rawByteField, { [rawByteField.id]: "f" }),
      handlers
    );
    expect(updateState).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      drafts: {
        stream: "00 11 22 33"
      },
      fieldDrafts: {
        field: {
          [rawByteField.id]: "aa"
        }
      },
      fieldStatuses: {
        field: {
          kind: "error",
          text: "Expected 2 hex characters."
        }
      },
      selectedFieldId: null
    });

    runRawPacketFieldDraftApplyAction(
      rawPacketFieldDraftApplyAction("00 11 22 33", rawByteField, { [rawByteField.id]: "aa" }),
      handlers
    );
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(state).toEqual({
      drafts: {
        stream: "00 aa 22 33"
      },
      fieldDrafts: {},
      fieldStatuses: {
        field: {
          kind: "ok",
          text: "Ethernet Destination updated at byte 1. Apply raw to save this packet."
        }
      },
      selectedFieldId: null
    });

    runRawPacketFieldDraftApply("00 11 22 33", rawByteField, { [rawByteField.id]: "bb" }, handlers);
    expect(updateState).toHaveBeenCalledTimes(3);
    expect(state.drafts.stream).toBe("00 bb 22 33");
  });

  it("builds Advanced VM apply and clear patches", () => {
    const body = { instructions: [{ name: "vm" }], split_by_var: "fv" };
    expect(advancedVmDraftApplyPatch(baseStream, "ABEi", body, null)).toMatchObject({
      advanced_mode: true,
      advanced_vm: body,
      frame_length: 64,
      packet_meta_base64: null,
      packet_model: null,
      packet_binary_base64: "ABEi"
    });
    const draftView = advancedVmDraftViewModel(JSON.stringify(body), baseStream, preview);
    expect(advancedVmDraftApplyAction(null, draftView, null)).toEqual({ kind: "ignored" });
    expect(advancedVmDraftApplyAction(baseStream, {
      ...draftView,
      applyError: "blocked"
    }, null)).toEqual({ kind: "ignored" });
    expect(advancedVmDraftApplyAction(baseStream, draftView, null)).toMatchObject({
      kind: "apply",
      nextDraft: "{\n  \"instructions\": [\n    {\n      \"name\": \"vm\"\n    }\n  ],\n  \"split_by_var\": \"fv\"\n}\n",
      patch: {
        advanced_mode: true,
        advanced_vm: body,
        packet_binary_base64: "ABEi"
      }
    });
    expect(advancedVmDraftApplyPatch({
      ...baseStream,
      packet_binary_base64: "AAAA",
      packet_meta_base64: "meta",
      packet_model: "packet-model"
    } as ProfileWorkbenchStream, "ABEi", body, 256)).toMatchObject({
      frame_length: 256,
      packet_meta_base64: "meta",
      packet_model: "packet-model"
    });
    expect(clearRawPacketOverridePatch()).toEqual({
      advanced_mode: false,
      advanced_vm: null,
      packet_binary_base64: null,
      packet_meta_base64: null,
      packet_model: null
    });
    expect(rawPacketOverrideClearAction(null, preview)).toEqual({ kind: "ignored" });
    expect(rawPacketOverrideClearAction(baseStream, preview)).toEqual({
      kind: "clear",
      nextDraft: "00 11 22",
      patch: clearRawPacketOverridePatch()
    });
  });

  it("runs Advanced VM draft apply actions through workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      applyPatch: vi.fn((patch) => calls.push(`patch:${String(patch.advanced_mode)}`)),
      updateDraft: vi.fn((nextDraft) => calls.push(`draft:${nextDraft}`))
    };

    runAdvancedVmDraftApplyAction({ kind: "ignored" }, handlers);
    expect(calls).toEqual([]);

    runAdvancedVmDraftApplyAction({
      kind: "apply",
      nextDraft: "{\n  \"instructions\": []\n}\n",
      patch: {
        advanced_mode: true
      }
    }, handlers);

    expect(calls).toEqual(["patch:true", "draft:{\n  \"instructions\": []\n}\n"]);

    runAdvancedVmDraftApply(
      baseStream,
      advancedVmDraftViewModel(JSON.stringify({ instructions: [], split_by_var: "" }), baseStream, preview),
      null,
      handlers
    );
    expect(calls).toEqual([
      "patch:true",
      "draft:{\n  \"instructions\": []\n}\n",
      "patch:true",
      "draft:{\n  \"instructions\": [],\n  \"split_by_var\": \"\"\n}\n"
    ]);
  });

  it("runs raw packet override clear actions through confirmation and workspace callbacks", () => {
    const calls: string[] = [];
    const handlers = {
      applyPatch: vi.fn((patch) => calls.push(`patch:${String(patch.advanced_mode)}`)),
      confirmClear: vi.fn(() => {
        calls.push("confirm");
        return true;
      }),
      updateDraft: vi.fn((nextDraft) => calls.push(`draft:${nextDraft}`))
    };

    expect(runRawPacketOverrideClearAction({ kind: "ignored" }, handlers)).toBe(false);
    expect(calls).toEqual([]);

    expect(runRawPacketOverrideClearAction({
      kind: "clear",
      nextDraft: "00 11 22",
      patch: {
        advanced_mode: false
      }
    }, {
      ...handlers,
      confirmClear: () => {
        calls.push("cancel");
        return false;
      }
    })).toBe(false);
    expect(calls).toEqual(["cancel"]);

    expect(runRawPacketOverrideClearAction({
      kind: "clear",
      nextDraft: "00 11 22",
      patch: {
        advanced_mode: false
      }
    }, handlers)).toBe(true);
    expect(calls).toEqual(["cancel", "confirm", "patch:false", "draft:00 11 22"]);

    expect(runRawPacketOverrideClear(baseStream, preview, handlers)).toBe(true);
    expect(calls).toEqual([
      "cancel",
      "confirm",
      "patch:false",
      "draft:00 11 22",
      "confirm",
      "patch:false",
      "draft:00 11 22"
    ]);
  });

  it("updates scoped value maps without mutating unchanged scopes", () => {
    const current = { one: "alpha" };

    expect(setScopedValue(current, "two", "bravo")).toEqual({ one: "alpha", two: "bravo" });
    expect(clearScopedValue(current, "missing")).toBe(current);
    expect(clearScopedValue({ one: "alpha", two: "bravo" }, "two")).toEqual({ one: "alpha" });
  });

  it("updates scoped nested draft maps", () => {
    const current = {
      scope: {
        keep: "yes",
        remove: "no"
      }
    };

    expect(setScopedDraftField(current, "scope", "next", "value")).toEqual({
      scope: {
        keep: "yes",
        next: "value",
        remove: "no"
      }
    });
    expect(clearScopedDraftField(current, "scope", "remove")).toEqual({
      scope: {
        keep: "yes"
      }
    });
    expect(clearScopedDraftField({ scope: { remove: "no" } }, "scope", "remove")).toEqual({});
  });

  it("updates scoped raw packet editor draft state", () => {
    const initialState = initialRawPacketEditorDraftState();

    expect(initialState).toEqual({
      drafts: {},
      fieldDrafts: {},
      fieldStatuses: {},
      selectedFieldId: null
    });

    const stateWithFieldState = {
      drafts: {
        stream: "00 11"
      },
      fieldDrafts: {
        field: {
          [rawByteField.id]: "ff"
        }
      },
      fieldStatuses: {
        field: {
          kind: "ok" as const,
          text: "updated"
        }
      },
      selectedFieldId: rawByteField.id
    };

    expect(clearRawPacketFieldScopeState(stateWithFieldState, "field")).toEqual({
      drafts: {
        stream: "00 11"
      },
      fieldDrafts: {},
      fieldStatuses: {},
      selectedFieldId: null
    });

    expect(rawPacketDraftChangedState(stateWithFieldState, {
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      nextDraft: "aa bb"
    })).toEqual({
      drafts: {
        stream: "aa bb"
      },
      fieldDrafts: {},
      fieldStatuses: {},
      selectedFieldId: null
    });

    const locatedState = rawPacketFieldLocateState(
      initialState,
      "field",
      rawPacketFieldLocateResult("00 11 22 33", rawByteField)
    );
    expect(locatedState).toMatchObject({
      fieldStatuses: {},
      selectedFieldId: rawByteField.id
    });

    expect(rawPacketSelectedFieldState(initialState, rawByteField.id)).toEqual({
      ...initialState,
      selectedFieldId: rawByteField.id
    });

    const locateErrorState = rawPacketFieldLocateState(
      initialState,
      "field",
      rawPacketFieldLocateResult("00", rawByteField)
    );
    expect(locateErrorState).toMatchObject({
      fieldStatuses: {
        field: {
          kind: "error",
          text: "Ethernet Destination bytes are outside the raw hex draft."
        }
      },
      selectedFieldId: rawByteField.id
    });

    expect(rawPacketFieldDraftChangedState(initialState, {
      fieldScopeKey: "field",
      rowId: rawByteField.id,
      value: "ff"
    })).toMatchObject({
      fieldDrafts: {
        field: {
          [rawByteField.id]: "ff"
        }
      },
      fieldStatuses: {}
    });

    const applyOk = rawPacketFieldApplyDraftState({
      ...initialState,
      fieldDrafts: {
        field: {
          [rawByteField.id]: "ff"
        }
      }
    }, {
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      result: rawPacketFieldApplyDraftResult("00 11 22 33", rawByteField, {
        [rawByteField.id]: "ff"
      })
    });
    expect(applyOk).toMatchObject({
      drafts: {
        stream: "00 ff 22 33"
      },
      fieldDrafts: {},
      fieldStatuses: {
        field: {
          kind: "ok"
        }
      }
    });

    const applyError = rawPacketFieldApplyDraftState(initialState, {
      draftScopeKey: "stream",
      fieldScopeKey: "field",
      result: rawPacketFieldApplyDraftResult("00 11 22 33", rawByteField, {
        [rawByteField.id]: "f"
      })
    });
    expect(applyError).toMatchObject({
      drafts: {},
      fieldStatuses: {
        field: {
          kind: "error",
          text: "Expected 2 hex characters."
        }
      }
    });
  });

  it("updates scoped Advanced VM editor draft state", () => {
    const initialState = initialAdvancedVmEditorDraftState();

    expect(initialState).toEqual({
      drafts: {},
      targetSources: {},
      templateParameterDrafts: {}
    });

    const draftState = advancedVmDraftChangedState(initialState, {
      draftKey: "vm-source",
      nextDraft: "{\"instructions\":[]}"
    });
    expect(draftState).toEqual({
      drafts: {
        "vm-source": "{\"instructions\":[]}"
      },
      targetSources: {},
      templateParameterDrafts: {}
    });

    const parameterState = advancedVmTemplateParameterChangedState(initialState, {
      field: "min_value",
      scopeKey: "scope",
      templateName: "template-a",
      value: "1",
      variableName: "flow"
    });
    expect(parameterState.templateParameterDrafts).toEqual({
      scope: {
        "template-a:flow:min_value": "1"
      }
    });

    expect(advancedVmTemplateParametersResetState({
      ...parameterState,
      templateParameterDrafts: {
        scope: {
          "template-a:flow:min_value": "1",
          "template-b:flow:min_value": "2"
        }
      }
    }, {
      scopeKey: "scope",
      templateName: "template-a"
    }).templateParameterDrafts).toEqual({
      scope: {
        "template-b:flow:min_value": "2"
      }
    });

    expect(advancedVmTargetSourceChangedState(initialState, {
      source: "raw",
      sourceKey: "scope"
    })).toEqual({
      drafts: {},
      targetSources: {
        scope: "raw"
      },
      templateParameterDrafts: {}
    });

    expect(advancedVmTargetDraftAppliedState(initialState, {
      draftKey: "vm-source",
      nextDraft: "{\"instructions\":[{\"name\":\"fv\"}]}",
      source: "raw",
      sourceKey: "scope"
    })).toEqual({
      drafts: {
        "vm-source": "{\"instructions\":[{\"name\":\"fv\"}]}"
      },
      targetSources: {
        scope: "raw"
      },
      templateParameterDrafts: {}
    });
  });

  it("dispatches Advanced VM draft changes through scoped state callbacks", () => {
    let state: AdvancedVmEditorDraftState = initialAdvancedVmEditorDraftState();
    const updateState = vi.fn((updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => {
      state = updater(state);
    });

    const action = advancedVmDraftChangeAction("vm-source", "{\"instructions\":[]}");
    expect(action).toEqual({
      draftKey: "vm-source",
      kind: "change",
      nextDraft: "{\"instructions\":[]}"
    });

    runAdvancedVmDraftChangeAction(action, { updateState });

    expect(updateState).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      drafts: {
        "vm-source": "{\"instructions\":[]}"
      },
      targetSources: {},
      templateParameterDrafts: {}
    });

    runAdvancedVmDraftTextChange("vm-inline", "{\"instructions\":[1]}", { updateState });
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(state.drafts["vm-inline"]).toBe("{\"instructions\":[1]}");
  });

  it("dispatches Advanced VM template parameter actions through scoped state callbacks", () => {
    let state: AdvancedVmEditorDraftState = initialAdvancedVmEditorDraftState();
    const updateState = vi.fn((updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => {
      state = updater(state);
    });

    const changeAction = advancedVmTemplateParameterChangeAction({
      field: "min_value",
      scopeKey: "scope",
      templateName: "template-a",
      value: "12",
      variableName: "flow"
    });
    expect(changeAction).toEqual({
      field: "min_value",
      kind: "change",
      scopeKey: "scope",
      templateName: "template-a",
      value: "12",
      variableName: "flow"
    });

    runAdvancedVmTemplateParameterChangeAction(changeAction, { updateState });
    expect(updateState).toHaveBeenCalledTimes(1);
    expect(state.templateParameterDrafts).toEqual({
      scope: {
        "template-a:flow:min_value": "12"
      }
    });

    runAdvancedVmTemplateParameterChange({
      field: "max_value",
      scopeKey: "scope",
      templateName: "template-a",
      value: "64",
      variableName: "flow"
    }, { updateState });
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(state.templateParameterDrafts.scope?.["template-a:flow:max_value"]).toBe("64");

    state = {
      ...state,
      templateParameterDrafts: {
        scope: {
          "template-a:flow:min_value": "12",
          "template-b:flow:min_value": "2"
        }
      }
    };
    const resetAction = advancedVmTemplateParametersResetAction({
      scopeKey: "scope",
      templateName: "template-a"
    });
    expect(resetAction).toEqual({
      kind: "reset",
      scopeKey: "scope",
      templateName: "template-a"
    });

    runAdvancedVmTemplateParametersResetAction(resetAction, { updateState });
    expect(updateState).toHaveBeenCalledTimes(3);
    expect(state.templateParameterDrafts).toEqual({
      scope: {
        "template-b:flow:min_value": "2"
      }
    });

    runAdvancedVmTemplateParametersReset({
      scopeKey: "scope",
      templateName: "template-b"
    }, { updateState });
    expect(updateState).toHaveBeenCalledTimes(4);
    expect(state.templateParameterDrafts).toEqual({});
  });

  it("clears scoped draft fields by prefix", () => {
    const current = {
      scope: {
        "template-a:size:max": "64",
        "template-b:size:max": "128"
      }
    };

    expect(clearScopedDraftPrefix(current, "scope", "template-a:")).toEqual({
      scope: {
        "template-b:size:max": "128"
      }
    });
    expect(clearScopedDraftPrefix(current, "scope", "missing:")).toBe(current);
    expect(clearScopedDraftPrefix({ scope: { "template-a:size:max": "64" } }, "scope", "template-a:")).toEqual({});
  });

  it("updates scoped Advanced VM template parameter drafts", () => {
    const current = {
      other: {
        "template-a:flow:min_value": "1"
      },
      scope: {
        "template-a:flow:min_value": "1",
        "template-b:flow:min_value": "2"
      }
    };

    expect(setAdvancedVmTemplateParameterDraft(
      current,
      "scope",
      "template-a",
      "flow",
      "max_value",
      "64"
    )).toEqual({
      other: {
        "template-a:flow:min_value": "1"
      },
      scope: {
        "template-a:flow:min_value": "1",
        "template-a:flow:max_value": "64",
        "template-b:flow:min_value": "2"
      }
    });

    expect(clearAdvancedVmTemplateParameterDrafts(current, "scope", "template-a")).toEqual({
      other: {
        "template-a:flow:min_value": "1"
      },
      scope: {
        "template-b:flow:min_value": "2"
      }
    });
  });

  it("removes generated packet bytes for structured Advanced VM editing", () => {
    const stream = {
      ...baseStream,
      packet_binary_base64: "AAAA"
    } as ProfileWorkbenchStream;

    expect(structuredAdvancedVmStreamForEditor(stream, "00", null, 1, 64)).toMatchObject({
      packet_binary_base64: null,
      packet_type: "Ethernet/IPv4/UDP"
    });
  });

  it("uses raw packet draft bytes for raw Advanced VM editing", () => {
    const stream = {
      ...baseStream,
      packet_binary_base64: "AAAA",
      packet_type: "Ethernet"
    } as ProfileWorkbenchStream;

    expect(structuredAdvancedVmStreamForEditor(stream, "001122", null, 3, 64)).toMatchObject({
      frame_length: 64,
      packet_binary_base64: "ABEi",
      packet_type: "Ethernet"
    });
    expect(rawDraftAdvancedVmStreamForEditor(baseStream, "001122", null, 3, 64)).toMatchObject({
      frame_length: 64,
      packet_binary_base64: "ABEi",
      packet_type: "Ethernet"
    });
  });

  it("derives Advanced VM stream candidates for structured and raw editor sources", () => {
    const rawIntentStream = {
      ...baseStream,
      packet_binary_base64: "AAAA",
      packet_type: "Ethernet"
    } as ProfileWorkbenchStream;

    const view = advancedVmStreamCandidatesViewModel({
      rawPacketDraft: "001122",
      rawPacketDraftBytes: 3,
      rawPacketDraftError: null,
      rawPacketWireLength: 64,
      selectedStream: rawIntentStream
    });

    expect(view.structuredStream).toMatchObject({
      frame_length: 64,
      packet_binary_base64: "ABEi",
      packet_type: "Ethernet"
    });
    expect(view.rawStream).toMatchObject({
      frame_length: 64,
      packet_binary_base64: "ABEi",
      packet_type: "Ethernet"
    });
    expect(advancedVmStreamCandidatesViewModel({
      rawPacketDraft: "001122",
      rawPacketDraftBytes: 3,
      rawPacketDraftError: "Raw packet hex must contain only hex bytes.",
      rawPacketWireLength: 64,
      selectedStream: rawIntentStream
    }).rawStream).toBeNull();
  });

  it("falls back to structured target source when raw draft is unavailable", () => {
    expect(defaultAdvancedVmTargetSourceForEditor(baseStream, null)).toBe("structured");
    expect(effectiveAdvancedVmTargetSourceForEditor("raw", null)).toBe("structured");

    const rawStream = rawDraftAdvancedVmStreamForEditor(baseStream, "001122", null, 3, 64);
    expect(defaultAdvancedVmTargetSourceForEditor({ ...baseStream, packet_type: "Ethernet" } as ProfileWorkbenchStream, rawStream))
      .toBe("raw");
    expect(effectiveAdvancedVmTargetSourceForEditor("raw", rawStream)).toBe("raw");
    expect(advancedVmStreamForEditor("raw", rawStream, baseStream)).toBe(rawStream);
  });

  it("derives Advanced VM editor source and stream state", () => {
    const rawStream = rawDraftAdvancedVmStreamForEditor(baseStream, "001122", null, 3, 64);
    const structuredView = advancedVmEditorSourceViewModel({
      rawDraftAdvancedVmStream: null,
      selectedStream: baseStream,
      sourceKey: "scope",
      sources: { scope: "raw" },
      structuredAdvancedVmStream: baseStream
    });

    expect(structuredView).toMatchObject({
      defaultSource: "structured",
      effectiveSource: "structured",
      selectedSource: "raw",
      stream: baseStream
    });

    const rawView = advancedVmEditorSourceViewModel({
      rawDraftAdvancedVmStream: rawStream,
      selectedStream: { ...baseStream, packet_type: "Ethernet" } as ProfileWorkbenchStream,
      sourceKey: "scope",
      sources: { scope: "raw" },
      structuredAdvancedVmStream: baseStream
    });

    expect(rawView).toMatchObject({
      defaultSource: "raw",
      effectiveSource: "raw",
      selectedSource: "raw",
      stream: rawStream
    });
  });

  it("builds raw packet Field Engine target drafts", () => {
    const target = {
      blockedReason: "",
      checksumRepair: "-",
      compatible: true,
      ready: true,
      splitBy: "fv",
      template: {
        description: "target test",
        label: "Target Test",
        name: "target-test",
        requires: "Ethernet",
        body: {
          instructions: [{ name: "fv", type: "flow_var" }],
          split_by_var: "fv"
        }
      },
      variables: "fv",
      writeOffsets: "12",
      writeOffsetValues: [12]
    } satisfies AdvancedVmTargetRow;

    expect(rawPacketFieldAdvancedVmTargetDraft(baseStream, target, {})).toEqual({
      advancedVmDraft: [
        "{",
        "  \"instructions\": [",
        "    {",
        "      \"name\": \"fv\",",
        "      \"type\": \"flow_var\",",
        "      \"op\": \"inc\"",
        "    }",
        "  ],",
        "  \"split_by_var\": \"fv\"",
        "}",
        ""
      ].join("\n"),
      ok: true,
      templateName: "target-test"
    });
    expect(rawPacketFieldAdvancedVmTargetDraft(null, target, {})).toEqual({ ok: false });
    expect(rawPacketFieldAdvancedVmTargetDraft(baseStream, {
      ...target,
      template: {
        ...target.template,
        supports: () => false
      }
    }, {})).toEqual({ ok: false });

    const action = rawPacketFieldAdvancedVmTargetAction(baseStream, target, {}, "raw-byte-12");
    expect(action).toMatchObject({
      kind: "apply",
      nextTab: "Field Engine",
      rowId: "raw-byte-12",
      templateName: "target-test"
    });
    expect(rawPacketFieldAdvancedVmTargetAction(null, target, {}, "raw-byte-12")).toEqual({ kind: "ignored" });

    const events: string[] = [];
    let advancedVmState: AdvancedVmEditorDraftState = initialAdvancedVmEditorDraftState();
    let rawPacketState: RawPacketEditorDraftState = initialRawPacketEditorDraftState();
    const handlers = {
      advancedVmDraftKey: "vm-source",
      advancedVmSourceKey: "raw-source",
      scrollToBuilder: () => events.push("scroll"),
      selectTab: (tab: string) => events.push(`tab:${tab}`),
      setTemplateName: (templateName: string) => events.push(`template:${templateName}`),
      updateAdvancedVmState: (updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => {
        advancedVmState = updater(advancedVmState);
        events.push("draft");
      },
      updateRawPacketState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => {
        rawPacketState = updater(rawPacketState);
        events.push("field");
      }
    };
    expect(runRawPacketFieldAdvancedVmTargetAction({ kind: "ignored" }, handlers)).toBe(false);
    expect(events).toEqual([]);
    expect(runRawPacketFieldAdvancedVmTargetAction(action, handlers)).toBe(true);
    expect(events).toEqual([
      "field",
      "tab:Field Engine",
      "template:target-test",
      "draft",
      "scroll"
    ]);
    expect(rawPacketState.selectedFieldId).toBe("raw-byte-12");
    expect(advancedVmState.drafts["vm-source"]).toBe(action.kind === "apply" ? action.advancedVmDraft : "");
    expect(advancedVmState.targetSources["raw-source"]).toBe("raw");

    expect(runRawPacketFieldAdvancedVmTarget(baseStream, target, {}, "raw-byte-13", handlers)).toBe(true);
    expect(events).toEqual([
      "field",
      "tab:Field Engine",
      "template:target-test",
      "draft",
      "scroll",
      "field",
      "tab:Field Engine",
      "template:target-test",
      "draft",
      "scroll"
    ]);
    expect(rawPacketState.selectedFieldId).toBe("raw-byte-13");
  });

  it("binds raw packet field actions for the workspace", () => {
    const target = {
      blockedReason: "",
      checksumRepair: "-",
      compatible: true,
      ready: true,
      splitBy: "fv",
      template: {
        body: {
          instructions: [{ name: "fv", type: "flow_var" }],
          split_by_var: "fv"
        },
        description: "target test",
        label: "Target Test",
        name: "target-test",
        requires: "Ethernet"
      },
      variables: "fv",
      writeOffsets: "12",
      writeOffsetValues: [12]
    } satisfies AdvancedVmTargetRow;
    const events: string[] = [];
    let rawPacketState: RawPacketEditorDraftState = initialRawPacketEditorDraftState();
    let advancedVmState: AdvancedVmEditorDraftState = initialAdvancedVmEditorDraftState();
    const handlers = workspaceRawPacketFieldActionHandlers({
      advancedVmDraftKey: "vm-source",
      advancedVmSourceKey: "raw-source",
      advancedVmTemplateParameterDraft: {},
      fieldScopeKey: "field",
      rawDraftAdvancedVmStream: baseStream,
      rawPacketDraft: "00 11 22 33",
      scrollToBuilder: () => events.push("scroll"),
      selectTab: (tab) => events.push(`tab:${tab}`),
      selectTextRange: ({ end, start }) => events.push(`select:${start}-${end}`),
      setTemplateName: (templateName) => events.push(`template:${templateName}`),
      updateAdvancedVmState: (updater) => {
        advancedVmState = updater(advancedVmState);
        events.push("draft");
      },
      updateRawPacketState: (updater) => {
        rawPacketState = updater(rawPacketState);
        events.push("field");
      }
    });

    expect(handlers.locateField(rawByteField)).toBe(true);
    expect(handlers.applyAdvancedVmTarget(rawByteField, target)).toBe(true);

    expect(events).toEqual([
      "field",
      "select:3-5",
      "field",
      "tab:Field Engine",
      "template:target-test",
      "draft",
      "scroll"
    ]);
    expect(rawPacketState.selectedFieldId).toBe(rawByteField.id);
    expect(advancedVmState.targetSources["raw-source"]).toBe("raw");
  });
});
