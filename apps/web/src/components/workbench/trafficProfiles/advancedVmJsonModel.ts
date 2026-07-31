import {
  ADVANCED_VM_MAX_BYTES,
  advancedVmDefaultBody,
  type AdvancedVmBody
} from "./model";

export function cloneAdvancedVmBody(body: AdvancedVmBody) {
  return JSON.parse(JSON.stringify(body)) as AdvancedVmBody;
}

export function mergeAdvancedVmBodies(current: AdvancedVmBody, template: AdvancedVmBody) {
  const currentBody = cloneAdvancedVmBody(current);
  const templateBody = cloneAdvancedVmBody(template);
  const currentInstructions = Array.isArray(currentBody.instructions) ? currentBody.instructions : [];
  const templateInstructions = Array.isArray(templateBody.instructions) ? templateBody.instructions : [];
  const merged: AdvancedVmBody = {
    ...templateBody,
    ...currentBody,
    instructions: [...currentInstructions, ...templateInstructions]
  };
  if (!currentBody.split_by_var && templateBody.split_by_var) {
    merged.split_by_var = templateBody.split_by_var;
  }
  if (!("cache_size" in currentBody) && "cache_size" in templateBody) {
    merged.cache_size = templateBody.cache_size;
  }
  return merged;
}

export function formatAdvancedVmJson(value: Record<string, unknown> | null | undefined) {
  const body = value && Object.keys(value).length > 0 ? value : advancedVmDefaultBody;
  try {
    return `${JSON.stringify(body, null, 2)}\n`;
  } catch {
    return `${JSON.stringify(advancedVmDefaultBody, null, 2)}\n`;
  }
}

export function parseAdvancedVmJson(value: string): { body: Record<string, unknown> | null; bytes: number; error: string | null } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { body: null, bytes: 0, error: "Advanced VM JSON is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      body: null,
      bytes: 0,
      error: error instanceof Error ? error.message : "Advanced VM JSON is invalid."
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { body: null, bytes: 0, error: "Advanced VM JSON must be an object." };
  }
  const encoded = new TextEncoder().encode(JSON.stringify(parsed)).length;
  if (encoded > ADVANCED_VM_MAX_BYTES) {
    return { body: null, bytes: encoded, error: `Advanced VM exceeds ${ADVANCED_VM_MAX_BYTES} bytes.` };
  }
  return { body: parsed as Record<string, unknown>, bytes: encoded, error: null };
}
