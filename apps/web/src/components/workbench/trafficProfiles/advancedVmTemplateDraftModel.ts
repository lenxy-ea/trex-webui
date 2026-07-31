import type { ProfileWorkbenchStream } from "../../../api";
import {
  type AdvancedVmBody,
  type AdvancedVmTemplate,
  type AdvancedVmTemplateParameterDraft
} from "./model";
import {
  formatAdvancedVmJson,
  mergeAdvancedVmBodies
} from "./advancedVmJsonModel";
import {
  advancedVmFlowVarRows,
  advancedVmParameterizedTemplateBody,
  advancedVmTemplateParameterValidationError
} from "./advancedVmParameterModel";

export function advancedVmTemplateViewModel(
  templates: AdvancedVmTemplate[],
  templateName: string,
  stream: ProfileWorkbenchStream | null,
  draft: AdvancedVmTemplateParameterDraft
) {
  const selectedTemplate = templates.find((template) => template.name === templateName) ?? templates[0];
  if (!selectedTemplate) {
    throw new Error("Advanced VM templates cannot be empty.");
  }
  const body = advancedVmParameterizedTemplateBody(selectedTemplate, stream, draft);
  const parameterError = advancedVmTemplateParameterValidationError(selectedTemplate, body, draft);
  const compatible = stream && selectedTemplate.supports ? selectedTemplate.supports(stream) : true;
  const parameterDirty = Object.keys(draft).some((key) => key.startsWith(`${selectedTemplate.name}:`));
  const ready = compatible && !parameterError;
  const hint = !compatible
    ? `Template requires ${selectedTemplate.requires}.`
    : parameterError ?? selectedTemplate.description;

  return {
    body,
    compatible,
    flowVars: advancedVmFlowVarRows(body),
    hint,
    parameterDirty,
    parameterError,
    ready,
    selectedTemplate
  };
}

export type AdvancedVmTemplateView = ReturnType<typeof advancedVmTemplateViewModel>;
export type AdvancedVmTemplateDraftResult =
  | {
      ok: true;
      advancedVmDraft: string;
      templateName: string;
    }
  | {
      ok: false;
    };
export type AdvancedVmTemplateDraftAction =
  | {
      kind: "ignored";
    }
  | {
      kind: "apply";
      advancedVmDraft: string;
      templateName: string | null;
    };
export type AdvancedVmTemplateDraftActionHandlers = {
  setTemplateName: (templateName: string) => void;
  updateDraft: (advancedVmDraft: string) => void;
};

export function advancedVmTemplateDraftText(view: AdvancedVmTemplateView): AdvancedVmTemplateDraftResult {
  if (!view.ready) {
    return { ok: false };
  }
  return {
    advancedVmDraft: formatAdvancedVmJson(view.body),
    ok: true,
    templateName: view.selectedTemplate.name
  };
}

export function appendedAdvancedVmTemplateDraftText(
  currentBody: AdvancedVmBody | null,
  view: AdvancedVmTemplateView
): AdvancedVmTemplateDraftResult {
  if (!currentBody || !view.ready) {
    return { ok: false };
  }
  return {
    advancedVmDraft: formatAdvancedVmJson(mergeAdvancedVmBodies(currentBody, view.body)),
    ok: true,
    templateName: view.selectedTemplate.name
  };
}

export function advancedVmTargetTemplateDraft(
  template: AdvancedVmTemplate | null | undefined,
  stream: ProfileWorkbenchStream | null,
  draft: AdvancedVmTemplateParameterDraft
): AdvancedVmTemplateDraftResult {
  if (!template || !stream) {
    return { ok: false };
  }
  return advancedVmTemplateDraftText(advancedVmTemplateViewModel([template], template.name, stream, draft));
}

export function advancedVmNamedTargetTemplateDraft(
  templates: AdvancedVmTemplate[],
  templateName: string,
  stream: ProfileWorkbenchStream | null,
  draft: AdvancedVmTemplateParameterDraft
): AdvancedVmTemplateDraftResult {
  return advancedVmTargetTemplateDraft(
    templates.find((template) => template.name === templateName),
    stream,
    draft
  );
}

export function advancedVmTemplateSeedAction(view: AdvancedVmTemplateView): AdvancedVmTemplateDraftAction {
  const templateDraft = advancedVmTemplateDraftText(view);
  if (!templateDraft.ok) {
    return { kind: "ignored" };
  }
  return {
    advancedVmDraft: templateDraft.advancedVmDraft,
    kind: "apply",
    templateName: null
  };
}

export function advancedVmTemplateAppendAction(
  currentBody: AdvancedVmBody | null,
  view: AdvancedVmTemplateView
): AdvancedVmTemplateDraftAction {
  const templateDraft = appendedAdvancedVmTemplateDraftText(currentBody, view);
  if (!templateDraft.ok) {
    return { kind: "ignored" };
  }
  return {
    advancedVmDraft: templateDraft.advancedVmDraft,
    kind: "apply",
    templateName: null
  };
}

export function advancedVmNamedTargetTemplateAction(
  templates: AdvancedVmTemplate[],
  templateName: string,
  stream: ProfileWorkbenchStream | null,
  draft: AdvancedVmTemplateParameterDraft
): AdvancedVmTemplateDraftAction {
  const templateDraft = advancedVmNamedTargetTemplateDraft(templates, templateName, stream, draft);
  if (!templateDraft.ok) {
    return { kind: "ignored" };
  }
  return {
    advancedVmDraft: templateDraft.advancedVmDraft,
    kind: "apply",
    templateName: templateDraft.templateName
  };
}

export function runAdvancedVmTemplateDraftAction(
  action: AdvancedVmTemplateDraftAction,
  handlers: AdvancedVmTemplateDraftActionHandlers
) {
  if (action.kind === "ignored") {
    return false;
  }
  if (action.templateName !== null) {
    handlers.setTemplateName(action.templateName);
  }
  handlers.updateDraft(action.advancedVmDraft);
  return true;
}

export function runAdvancedVmTemplateSeed(
  view: AdvancedVmTemplateView,
  handlers: AdvancedVmTemplateDraftActionHandlers
) {
  return runAdvancedVmTemplateDraftAction(advancedVmTemplateSeedAction(view), handlers);
}

export function runAdvancedVmTemplateAppend(
  currentBody: AdvancedVmBody | null,
  view: AdvancedVmTemplateView,
  handlers: AdvancedVmTemplateDraftActionHandlers
) {
  return runAdvancedVmTemplateDraftAction(advancedVmTemplateAppendAction(currentBody, view), handlers);
}

export function runAdvancedVmNamedTargetTemplate(
  templates: AdvancedVmTemplate[],
  templateName: string,
  stream: ProfileWorkbenchStream | null,
  draft: AdvancedVmTemplateParameterDraft,
  handlers: AdvancedVmTemplateDraftActionHandlers
) {
  return runAdvancedVmTemplateDraftAction(
    advancedVmNamedTargetTemplateAction(templates, templateName, stream, draft),
    handlers
  );
}
