import type { ProfilePacketPreview, ProfileWorkbenchStream } from "../../../api";
import { advancedVmTemplates } from "./advancedVmTemplates";
import {
  runAdvancedVmNamedTargetTemplate,
  runAdvancedVmTemplateAppend,
  runAdvancedVmTemplateSeed
} from "./advancedVmTemplateDraftModel";
import type {
  AdvancedVmFlowVarField,
  AdvancedVmTemplateParameterDraft,
  RawPacketFieldDraft
} from "./model";
import type { RawPacketFieldRow } from "./rawPacketModel";
import type { StreamPatchHandlers } from "./streamPatchModel";
import type { StreamEditorTab } from "./streamEditorTabsModel";
import {
  type AdvancedVmDraftViewModel,
  type AdvancedVmEditorDraftState,
  type RawPacketEditorDraftState,
  runAdvancedEditorMode,
  runAdvancedVmDraftApply,
  runAdvancedVmDraftTextChange,
  runAdvancedVmTemplateParameterChange,
  runAdvancedVmTemplateParametersReset,
  runRawPacketDraftApply,
  runRawPacketDraftSeedFromPreview,
  runRawPacketDraftTextChange,
  runRawPacketFieldDraftApply,
  runRawPacketFieldDraftTextChange,
  runRawPacketOverrideClear,
  type AdvancedVmEditorStateViewModel
} from "./workspaceSelectionModel";

export type WorkspaceEditorActionHandlers = {
  appendAdvancedVmDraftFromTemplate: () => void;
  applyAdvancedVmDraft: () => void;
  applyAdvancedVmTargetTemplate: (templateName: string) => void;
  applyRawPacketDraft: () => void;
  applyRawPacketFieldDraft: (row: RawPacketFieldRow) => void;
  clearRawPacketOverride: () => boolean;
  resetAdvancedVmDraft: () => void;
  resetAdvancedVmTemplateParameters: () => void;
  seedAdvancedVmDraftFromTemplate: () => void;
  seedRawPacketDraftFromPreview: () => void;
  switchAdvancedEditorMode: () => void;
  updateAdvancedVmDraftText: (nextDraft: string) => void;
  updateAdvancedVmTemplateParameter: (variableName: string, field: AdvancedVmFlowVarField | "op", value: string) => void;
  updateRawPacketDraftText: (nextDraft: string) => void;
  updateRawPacketFieldDraft: (rowId: string, value: string) => void;
};

export type WorkspaceEditorActionHandlerInput = {
  advancedVmDraftView: AdvancedVmDraftViewModel;
  advancedVmSourceJson: string;
  advancedVmSourceKey: string;
  advancedVmStream: ProfileWorkbenchStream | null;
  advancedVmTemplateName: string;
  advancedVmTemplateParameterDraft: AdvancedVmTemplateParameterDraft;
  advancedVmTemplateParameterDraftKey: string;
  advancedVmTemplateView: AdvancedVmEditorStateViewModel["templateView"];
  canRenderPreview: boolean;
  confirmRawPacketOverrideClear: () => boolean;
  packetEditorContextKey: string;
  rawPacketDraft: string;
  rawPacketDraftBytes: number;
  rawPacketDraftError: string | null;
  rawPacketFieldDraft: RawPacketFieldDraft;
  rawPacketFieldScopeKey: string;
  renderPreview: () => void;
  selectTab: (tab: StreamEditorTab) => void;
  selectedPreview: ProfilePacketPreview | null;
  selectedStream: ProfileWorkbenchStream | null;
  streamPatchHandlers: StreamPatchHandlers;
  setAdvancedVmDraftState: (updater: (current: AdvancedVmEditorDraftState) => AdvancedVmEditorDraftState) => void;
  setAdvancedVmTemplateName: (templateName: string) => void;
  setRawPacketDraftState: (updater: (current: RawPacketEditorDraftState) => RawPacketEditorDraftState) => void;
};

export function workspaceEditorActionHandlers({
  advancedVmDraftView,
  advancedVmSourceJson,
  advancedVmSourceKey,
  advancedVmStream,
  advancedVmTemplateName,
  advancedVmTemplateParameterDraft,
  advancedVmTemplateParameterDraftKey,
  advancedVmTemplateView,
  canRenderPreview,
  confirmRawPacketOverrideClear,
  packetEditorContextKey,
  rawPacketDraft,
  rawPacketDraftBytes,
  rawPacketDraftError,
  rawPacketFieldDraft,
  rawPacketFieldScopeKey,
  renderPreview,
  selectTab,
  selectedPreview,
  selectedStream,
  streamPatchHandlers,
  setAdvancedVmDraftState,
  setAdvancedVmTemplateName,
  setRawPacketDraftState
}: WorkspaceEditorActionHandlerInput): WorkspaceEditorActionHandlers {
  const updateRawPacketDraftText = (nextDraft: string) => {
    runRawPacketDraftTextChange(packetEditorContextKey, rawPacketFieldScopeKey, nextDraft, {
      updateState: setRawPacketDraftState
    });
  };

  const updateAdvancedVmDraftText = (nextDraft: string) => {
    runAdvancedVmDraftTextChange(advancedVmSourceKey, nextDraft, {
      updateState: setAdvancedVmDraftState
    });
  };

  const advancedVmTemplateDraftHandlers = {
    setTemplateName: setAdvancedVmTemplateName,
    updateDraft: updateAdvancedVmDraftText
  };

  const clearRawPacketOverride = () => (
    runRawPacketOverrideClear(selectedStream, selectedPreview, {
      applyPatch: streamPatchHandlers.applyPatch,
      confirmClear: confirmRawPacketOverrideClear,
      updateDraft: updateRawPacketDraftText
    })
  );

  return {
    appendAdvancedVmDraftFromTemplate: () => {
      runAdvancedVmTemplateAppend(
        advancedVmDraftView.error ? null : advancedVmDraftView.body,
        advancedVmTemplateView,
        advancedVmTemplateDraftHandlers
      );
    },
    applyAdvancedVmDraft: () => {
      runAdvancedVmDraftApply(selectedStream, advancedVmDraftView, selectedPreview?.frame_length, {
        applyPatch: streamPatchHandlers.applyPatch,
        updateDraft: updateAdvancedVmDraftText
      });
    },
    applyAdvancedVmTargetTemplate: (templateName: string) => {
      runAdvancedVmNamedTargetTemplate(
        advancedVmTemplates,
        templateName,
        advancedVmStream,
        advancedVmTemplateParameterDraft,
        advancedVmTemplateDraftHandlers
      );
    },
    applyRawPacketDraft: () => {
      runRawPacketDraftApply(selectedStream, rawPacketDraftError, rawPacketDraft, rawPacketDraftBytes, {
        applyPatch: streamPatchHandlers.applyPatch,
        updateDraft: updateRawPacketDraftText
      });
    },
    applyRawPacketFieldDraft: (row: RawPacketFieldRow) => {
      runRawPacketFieldDraftApply(rawPacketDraft, row, rawPacketFieldDraft, {
        draftScopeKey: packetEditorContextKey,
        fieldScopeKey: rawPacketFieldScopeKey,
        updateState: setRawPacketDraftState
      });
    },
    clearRawPacketOverride,
    resetAdvancedVmDraft: () => {
      updateAdvancedVmDraftText(advancedVmSourceJson);
    },
    resetAdvancedVmTemplateParameters: () => {
      runAdvancedVmTemplateParametersReset({
        scopeKey: advancedVmTemplateParameterDraftKey,
        templateName: advancedVmTemplateName
      }, {
        updateState: setAdvancedVmDraftState
      });
    },
    seedAdvancedVmDraftFromTemplate: () => {
      runAdvancedVmTemplateSeed(advancedVmTemplateView, advancedVmTemplateDraftHandlers);
    },
    seedRawPacketDraftFromPreview: () => {
      runRawPacketDraftSeedFromPreview(packetEditorContextKey, rawPacketFieldScopeKey, selectedPreview, {
        updateState: setRawPacketDraftState
      });
    },
    switchAdvancedEditorMode: () => {
      runAdvancedEditorMode(selectedStream, selectedPreview, {
        applyPatch: streamPatchHandlers.applyPatch,
        canRenderPreview,
        clearRawPacketOverride,
        renderPreview,
        selectTab
      });
    },
    updateAdvancedVmDraftText,
    updateAdvancedVmTemplateParameter: (variableName: string, field: AdvancedVmFlowVarField | "op", value: string) => {
      runAdvancedVmTemplateParameterChange({
        field,
        scopeKey: advancedVmTemplateParameterDraftKey,
        templateName: advancedVmTemplateName,
        value,
        variableName
      }, {
        updateState: setAdvancedVmDraftState
      });
    },
    updateRawPacketDraftText,
    updateRawPacketFieldDraft: (rowId: string, value: string) => {
      runRawPacketFieldDraftTextChange(rawPacketFieldScopeKey, rowId, value, {
        updateState: setRawPacketDraftState
      });
    }
  };
}
