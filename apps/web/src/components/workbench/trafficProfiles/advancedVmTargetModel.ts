import type { ProfileWorkbenchStream } from "../../../api";
import {
  type AdvancedVmBody,
  type AdvancedVmTargetRow,
  type AdvancedVmTemplate,
  type AdvancedVmTemplateParameterDraft,
  isRawPacketAdvancedStream
} from "./model";
import {
  advancedVmFlowVarRows,
  advancedVmParameterizedTemplateBody,
  advancedVmTemplateBody,
  advancedVmTemplateParameterValidationError
} from "./advancedVmParameterModel";

export function advancedVmInstructionObjects(body: AdvancedVmBody) {
  return Array.isArray(body.instructions)
    ? body.instructions.filter((instruction): instruction is Record<string, unknown> =>
        Boolean(instruction) && typeof instruction === "object" && !Array.isArray(instruction)
      )
    : [];
}

export function advancedVmTargetWriteOffsets(body: AdvancedVmBody) {
  const offsets = new Set<string>();
  for (const offset of advancedVmTargetWriteOffsetValues(body)) {
    offsets.add(String(offset));
  }
  return offsets.size > 0 ? Array.from(offsets).join(", ") : "-";
}

export function advancedVmTargetWriteOffsetValues(body: AdvancedVmBody) {
  const offsets = new Set<number>();
  for (const instruction of advancedVmInstructionObjects(body)) {
    const type = typeof instruction.type === "string" ? instruction.type : "";
    if (!type.startsWith("write") || instruction.pkt_offset === undefined || instruction.pkt_offset === null) {
      continue;
    }
    const offset = Number(instruction.pkt_offset);
    if (Number.isFinite(offset)) {
      offsets.add(Math.trunc(offset));
    }
  }
  return Array.from(offsets);
}

export function advancedVmTargetChecksumRepair(body: AdvancedVmBody) {
  const repairs = new Set<string>();
  for (const instruction of advancedVmInstructionObjects(body)) {
    const type = typeof instruction.type === "string" ? instruction.type : "";
    if (type.startsWith("fix_") || type.includes("checksum")) {
      repairs.add(type);
    }
  }
  return repairs.size > 0 ? Array.from(repairs).join(", ") : "-";
}

export function advancedVmTemplateTargetRowsForStream(
  templates: AdvancedVmTemplate[],
  stream: ProfileWorkbenchStream,
  draft: AdvancedVmTemplateParameterDraft,
  rawPacketSupported: (stream: ProfileWorkbenchStream) => boolean
): AdvancedVmTargetRow[] {
  return templates
    .filter((template) => template.name !== "empty")
    .flatMap((template) => {
      const compatible = template.supports ? template.supports(stream) : true;
      if (!compatible && template.hideWhenUnsupportedWithoutRaw && !rawPacketSupported(stream)) {
        return [];
      }
      const body = compatible
        ? advancedVmParameterizedTemplateBody(template, stream, draft)
        : advancedVmTemplateBody(template, stream);
      const parameterError = compatible ? advancedVmTemplateParameterValidationError(template, body, draft) : null;
      return [{
        template,
        compatible,
        ready: compatible && !parameterError,
        blockedReason: compatible ? parameterError ?? "" : template.requires,
        variables: advancedVmFlowVarRows(body).map((row) => row.name).join(", ") || "-",
        writeOffsets: advancedVmTargetWriteOffsets(body),
        writeOffsetValues: advancedVmTargetWriteOffsetValues(body),
        checksumRepair: advancedVmTargetChecksumRepair(body),
        splitBy: typeof body.split_by_var === "string" && body.split_by_var ? body.split_by_var : "-"
      }];
    });
}

export type AdvancedVmTargetChoiceSource = "structured" | "raw";
export type AdvancedVmTemplateOption = {
  disabled: boolean;
  label: string;
  name: string;
};
export type AdvancedVmTargetChoiceView = {
  rawTargetRows: AdvancedVmTargetRow[];
  readyTargetCount: number;
  selectedTargetRows: AdvancedVmTargetRow[];
  structuredTargetRows: AdvancedVmTargetRow[];
  templateOptions: AdvancedVmTemplateOption[];
};

export function advancedVmTargetChoiceViewModel({
  activeSource,
  activeStream,
  draft,
  rawStream,
  structuredStream,
  templates
}: {
  activeSource: AdvancedVmTargetChoiceSource;
  activeStream: ProfileWorkbenchStream | null;
  draft: AdvancedVmTemplateParameterDraft;
  rawStream: ProfileWorkbenchStream | null;
  structuredStream: ProfileWorkbenchStream | null;
  templates: AdvancedVmTemplate[];
}): AdvancedVmTargetChoiceView {
  const structuredTargetRows = structuredStream
    ? advancedVmTemplateTargetRowsForStream(templates, structuredStream, draft, isRawPacketAdvancedStream)
    : [];
  const rawTargetRows = rawStream
    ? advancedVmTemplateTargetRowsForStream(templates, rawStream, draft, isRawPacketAdvancedStream)
    : [];
  const selectedTargetRows = activeSource === "raw" ? rawTargetRows : structuredTargetRows;
  return {
    rawTargetRows,
    readyTargetCount: selectedTargetRows.filter((row) => row.ready).length,
    selectedTargetRows,
    structuredTargetRows,
    templateOptions: templates.map((template) => ({
      disabled: Boolean(activeStream && template.supports && !template.supports(activeStream)),
      label: template.label,
      name: template.name
    }))
  };
}
