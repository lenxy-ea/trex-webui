import type { ProfileWorkbenchStream } from "../../../api";
import { cloneAdvancedVmBody } from "./advancedVmJsonModel";
import {
  advancedVmDefaultBody,
  advancedVmFlowVarFields,
  advancedVmFlowVarOperations,
  type AdvancedVmBody,
  type AdvancedVmFlowVarField,
  type AdvancedVmFlowVarOperation,
  type AdvancedVmFlowVarRow,
  type AdvancedVmTemplate,
  type AdvancedVmTemplateParameterDraft
} from "./model";

export function advancedVmTemplateBody(template: AdvancedVmTemplate, stream: ProfileWorkbenchStream | null | undefined) {
  if (template.buildBody && stream) {
    return template.buildBody(stream);
  }
  return template.body ?? advancedVmDefaultBody;
}

export function advancedVmTemplateParameterKey(
  templateName: string,
  variableName: string,
  field: AdvancedVmFlowVarField | "op"
) {
  return `${templateName}:${variableName}:${field}`;
}

export function advancedVmFlowVarRows(body: AdvancedVmBody): AdvancedVmFlowVarRow[] {
  const rows: AdvancedVmFlowVarRow[] = [];
  const seen = new Set<string>();
  const instructions = Array.isArray(body.instructions) ? body.instructions : [];
  for (const instruction of instructions) {
    if (
      !instruction
      || typeof instruction !== "object"
      || Array.isArray(instruction)
      || (instruction as Record<string, unknown>).type !== "flow_var"
      || typeof (instruction as Record<string, unknown>).name !== "string"
    ) {
      continue;
    }
    const flowVar = instruction as Record<string, unknown>;
    const name = flowVar.name as string;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    rows.push({
      name,
      op: typeof flowVar.op === "string" ? flowVar.op : "inc",
      init_value: typeof flowVar.init_value === "number" || typeof flowVar.init_value === "string" ? flowVar.init_value : "",
      min_value: typeof flowVar.min_value === "number" || typeof flowVar.min_value === "string" ? flowVar.min_value : "",
      max_value: typeof flowVar.max_value === "number" || typeof flowVar.max_value === "string" ? flowVar.max_value : "",
      step: typeof flowVar.step === "number" || typeof flowVar.step === "string" ? flowVar.step : ""
    });
  }
  return rows;
}

export function advancedVmTemplateParameterValue(
  draft: AdvancedVmTemplateParameterDraft,
  templateName: string,
  variableName: string,
  field: AdvancedVmFlowVarField | "op",
  fallback: number | string
) {
  return draft[advancedVmTemplateParameterKey(templateName, variableName, field)] ?? String(fallback);
}

export function parseAdvancedVmTemplateNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function advancedVmTemplateDraftHas(
  draft: AdvancedVmTemplateParameterDraft,
  templateName: string,
  variableName: string,
  field: AdvancedVmFlowVarField | "op"
) {
  return Object.prototype.hasOwnProperty.call(
    draft,
    advancedVmTemplateParameterKey(templateName, variableName, field)
  );
}

export function advancedVmFlowVarOperation(value: unknown): AdvancedVmFlowVarOperation {
  return advancedVmFlowVarOperations.includes(value as AdvancedVmFlowVarOperation)
    ? value as AdvancedVmFlowVarOperation
    : "inc";
}

export function advancedVmFlowVarNumber(flowVar: Record<string, unknown>, field: string) {
  const value = flowVar[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    return parseAdvancedVmTemplateNumber(value);
  }
  return null;
}

export function advancedVmFlowVarRangeCount(flowVar: Record<string, unknown>) {
  const initValue = advancedVmFlowVarNumber(flowVar, "init_value");
  const minValue = advancedVmFlowVarNumber(flowVar, "min_value");
  const maxValue = advancedVmFlowVarNumber(flowVar, "max_value");
  const stepValue = advancedVmFlowVarNumber(flowVar, "step");
  if (initValue === null || minValue === null || maxValue === null || stepValue === null || stepValue <= 0) {
    return 1;
  }
  const operation = advancedVmFlowVarOperation(flowVar.op);
  const distance = operation === "dec"
    ? initValue - minValue
    : operation === "random"
      ? maxValue - minValue
      : maxValue - initValue;
  if (!Number.isFinite(distance) || distance <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(distance / stepValue) + 1);
}

export function advancedVmFlowVarMaskLimit(instructions: unknown[], variableName: string) {
  for (const instruction of instructions) {
    if (
      !instruction
      || typeof instruction !== "object"
      || Array.isArray(instruction)
      || (instruction as Record<string, unknown>).type !== "write_mask_flow_var"
      || (instruction as Record<string, unknown>).name !== variableName
    ) {
      continue;
    }
    const maskedWrite = instruction as Record<string, unknown>;
    const mask = advancedVmFlowVarNumber(maskedWrite, "mask");
    const shift = advancedVmFlowVarNumber(maskedWrite, "shift") ?? 0;
    if (mask === null || shift < 0) {
      continue;
    }
    const limit = Math.floor(mask / (2 ** shift));
    if (Number.isFinite(limit) && limit >= 0) {
      return limit;
    }
  }
  return null;
}

export function advancedVmFlowVarMaxLimit(
  flowVar: Record<string, unknown>,
  fallback: Record<string, unknown>,
  maskLimit: number | null
) {
  if (maskLimit !== null) {
    return maskLimit;
  }
  const size = advancedVmFlowVarNumber(flowVar, "size") ?? advancedVmFlowVarNumber(fallback, "size");
  if (size === 1) {
    return 255;
  }
  if (size === 2) {
    return 65_535;
  }
  if (size === 4) {
    return 4_294_967_295;
  }
  return (
    advancedVmFlowVarNumber(fallback, "max_value")
    ?? advancedVmFlowVarNumber(flowVar, "max_value")
    ?? Number.MAX_SAFE_INTEGER
  );
}

export function advancedVmFlowVarInputAttributes(
  body: AdvancedVmBody,
  variableName: string,
  field: AdvancedVmFlowVarField
) {
  const instructions = Array.isArray(body.instructions) ? body.instructions : [];
  const flowVar = instructions.find((instruction): instruction is Record<string, unknown> =>
    Boolean(instruction)
    && typeof instruction === "object"
    && !Array.isArray(instruction)
    && instruction.type === "flow_var"
    && instruction.name === variableName
  );
  if (field === "step") {
    return {
      min: 1,
      step: 1,
      title: `VM ${variableName} step must be greater than 0.`
    };
  }
  const maskLimit = advancedVmFlowVarMaskLimit(instructions, variableName);
  const maxLimit = flowVar ? advancedVmFlowVarMaxLimit(flowVar, flowVar, maskLimit) : maskLimit;
  const max = maxLimit !== null && Number.isFinite(maxLimit) ? maxLimit : undefined;
  return {
    max,
    min: 0,
    step: 1,
    title: max === undefined
      ? `VM ${variableName} ${advancedVmFlowVarFieldLabel(field)} must be 0 or greater.`
      : `VM ${variableName} ${advancedVmFlowVarFieldLabel(field)} range: 0..${max}.`
  };
}

export function advancedVmParameterizedTemplateBody(
  template: AdvancedVmTemplate,
  stream: ProfileWorkbenchStream | null | undefined,
  draft: AdvancedVmTemplateParameterDraft
) {
  const body = cloneAdvancedVmBody(advancedVmTemplateBody(template, stream));
  const instructions = body.instructions;
  if (!Array.isArray(instructions)) {
    return body;
  }
  body.instructions = instructions.map((instruction) => {
    if (
      !instruction
      || typeof instruction !== "object"
      || Array.isArray(instruction)
      || (instruction as Record<string, unknown>).type !== "flow_var"
      || typeof (instruction as Record<string, unknown>).name !== "string"
    ) {
      return instruction;
    }
    const sourceFlowVar = instruction as Record<string, unknown>;
    const flowVar = { ...sourceFlowVar };
    const variableName = flowVar.name as string;
    const sourceOperation = advancedVmFlowVarOperation(sourceFlowVar.op);
    const operation = draft[advancedVmTemplateParameterKey(template.name, variableName, "op")];
    const nextOperation = advancedVmFlowVarOperations.includes(operation as AdvancedVmFlowVarOperation)
      ? operation as AdvancedVmFlowVarOperation
      : sourceOperation;
    flowVar.op = nextOperation;
    const sourceCount = advancedVmFlowVarRangeCount(sourceFlowVar);
    const maskLimit = advancedVmFlowVarMaskLimit(instructions, variableName);
    const operationChanged = operation !== undefined && nextOperation !== sourceOperation;
    const autoBoundsNeeded =
      (!advancedVmTemplateDraftHas(draft, template.name, variableName, "min_value")
        || !advancedVmTemplateDraftHas(draft, template.name, variableName, "max_value"))
      && (operationChanged
        || advancedVmTemplateDraftHas(draft, template.name, variableName, "init_value")
        || advancedVmTemplateDraftHas(draft, template.name, variableName, "step"));
    for (const field of advancedVmFlowVarFields) {
      const value = draft[advancedVmTemplateParameterKey(template.name, variableName, field)];
      if (value === undefined) {
        continue;
      }
      const parsed = parseAdvancedVmTemplateNumber(value);
      if (parsed !== null) {
        flowVar[field] = parsed;
      }
    }
    if (autoBoundsNeeded) {
      const initValue = advancedVmFlowVarNumber(flowVar, "init_value");
      const stepValue = advancedVmFlowVarNumber(flowVar, "step");
      if (initValue !== null && stepValue !== null && stepValue > 0) {
        const bounds = advancedNumberBounds(
          initValue,
          sourceCount,
          stepValue,
          advancedVmFlowVarMaxLimit(flowVar, sourceFlowVar, maskLimit),
          nextOperation
        );
        if (!advancedVmTemplateDraftHas(draft, template.name, variableName, "min_value")) {
          flowVar.min_value = bounds.min;
        }
        if (!advancedVmTemplateDraftHas(draft, template.name, variableName, "max_value")) {
          flowVar.max_value = bounds.max;
        }
      }
    }
    return flowVar;
  });
  return body;
}

export function advancedVmFlowVarFieldLabel(field: AdvancedVmFlowVarField) {
  return field.replace("_", " ");
}

export function advancedVmTemplateParameterValidationError(
  template: AdvancedVmTemplate,
  body: AdvancedVmBody,
  draft: AdvancedVmTemplateParameterDraft
) {
  const instructions = Array.isArray(body.instructions) ? body.instructions : [];
  for (const instruction of instructions) {
    if (
      !instruction
      || typeof instruction !== "object"
      || Array.isArray(instruction)
      || (instruction as Record<string, unknown>).type !== "flow_var"
      || typeof (instruction as Record<string, unknown>).name !== "string"
    ) {
      continue;
    }
    const flowVar = instruction as Record<string, unknown>;
    const variableName = flowVar.name as string;
    for (const field of advancedVmFlowVarFields) {
      const key = advancedVmTemplateParameterKey(template.name, variableName, field);
      if (Object.prototype.hasOwnProperty.call(draft, key) && parseAdvancedVmTemplateNumber(draft[key]) === null) {
        return `VM ${variableName} ${advancedVmFlowVarFieldLabel(field)} must be a number.`;
      }
    }
    const initValue = advancedVmFlowVarNumber(flowVar, "init_value");
    const minValue = advancedVmFlowVarNumber(flowVar, "min_value");
    const maxValue = advancedVmFlowVarNumber(flowVar, "max_value");
    const stepValue = advancedVmFlowVarNumber(flowVar, "step");
    if (stepValue !== null && stepValue <= 0) {
      return `VM ${variableName} step must be greater than 0.`;
    }
    const maskLimit = advancedVmFlowVarMaskLimit(instructions, variableName);
    if (maskLimit !== null) {
      const limitedFields: Array<[AdvancedVmFlowVarField, number | null]> = [
        ["init_value", initValue],
        ["min_value", minValue],
        ["max_value", maxValue]
      ];
      for (const [field, value] of limitedFields) {
        if (value !== null && (value < 0 || value > maskLimit)) {
          return `VM ${variableName} ${advancedVmFlowVarFieldLabel(field)} must be between 0 and ${maskLimit}.`;
        }
      }
    }
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      return `VM ${variableName} min value must not exceed max value.`;
    }
    if (initValue !== null && minValue !== null && initValue < minValue) {
      return `VM ${variableName} init value must be at least ${minValue}.`;
    }
    if (initValue !== null && maxValue !== null && initValue > maxValue) {
      return `VM ${variableName} init value must be at most ${maxValue}.`;
    }
  }
  return null;
}

export function advancedNumberBounds(
  initValue: number,
  count: number,
  step: number,
  maxLimit: number,
  operation: "inc" | "dec" | "random" = "inc"
) {
  if (operation === "dec") {
    return { min: Math.max(0, initValue - ((count - 1) * step)), max: Math.min(maxLimit, initValue) };
  }
  if (operation === "random") {
    return { min: 0, max: maxLimit };
  }
  return { min: initValue, max: Math.min(maxLimit, initValue + ((count - 1) * step)) };
}
