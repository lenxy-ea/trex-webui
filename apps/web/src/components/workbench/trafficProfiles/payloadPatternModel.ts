import type { ProfileWorkbenchStream } from "../../../api";

export const PAYLOAD_PATTERN_MAX_HEX_CHARS = 1024;

export function compactPayloadPattern(value: string) {
  return value.replace(/0x/gi, "").replace(/[\s,:;|_-]/g, "");
}

export function payloadPatternImportError(value: string) {
  if (value.length > PAYLOAD_PATTERN_MAX_HEX_CHARS) {
    return `Payload pattern cannot exceed ${PAYLOAD_PATTERN_MAX_HEX_CHARS} hex characters.`;
  }
  if (/[^0-9a-fA-F]/.test(value)) {
    return "Payload pattern must contain only hex bytes.";
  }
  if (value.length % 2 !== 0) {
    return "Payload pattern must contain whole hex bytes.";
  }
  return null;
}

export type PayloadPatternImportStatus = {
  kind: "ok" | "error";
  text: string;
};

export type PayloadPatternPanelViewModel = {
  pattern: {
    ariaLabel: string;
    label: string;
  };
  summary: string;
  type: {
    ariaLabel: string;
    label: string;
  };
};

const PAYLOAD_PATTERN_PANEL_VIEW_MODEL: PayloadPatternPanelViewModel = {
  pattern: {
    ariaLabel: "Payload pattern",
    label: "Pattern"
  },
  summary: "Payload Data",
  type: {
    ariaLabel: "Payload type",
    label: "Type"
  }
};

export function payloadPatternPanelViewModel(): PayloadPatternPanelViewModel {
  return PAYLOAD_PATTERN_PANEL_VIEW_MODEL;
}

export type PayloadPatternFileControlViewModel = {
  button: {
    className: string;
    iconSize: number;
    label: string;
    title: string;
  };
  className: string;
  fileInput: {
    accept: string;
    ariaLabel: string;
    className: string;
  };
  separator: {
    className: string;
    text: string;
  };
  status: {
    className: string;
    errorClassName: string;
  };
};

const PAYLOAD_PATTERN_FILE_CONTROL_VIEW_MODEL: PayloadPatternFileControlViewModel = {
  button: {
    className: "stream-command-button packet-raw-button payload-pattern-file-button",
    iconSize: 14,
    label: "Select from file",
    title: "Select from file"
  },
  className: "payload-pattern-file-control",
  fileInput: {
    accept: ".txt,text/plain",
    ariaLabel: "Payload pattern file",
    className: "visually-hidden"
  },
  separator: {
    className: "payload-pattern-or",
    text: "OR"
  },
  status: {
    className: "payload-pattern-import-status",
    errorClassName: "payload-pattern-import-status payload-pattern-import-status--error"
  }
};

export function payloadPatternFileControlViewModel(): PayloadPatternFileControlViewModel {
  return PAYLOAD_PATTERN_FILE_CONTROL_VIEW_MODEL;
}

export function payloadPatternImportStatusClassName(status: PayloadPatternImportStatus) {
  return status.kind === "error"
    ? PAYLOAD_PATTERN_FILE_CONTROL_VIEW_MODEL.status.errorClassName
    : PAYLOAD_PATTERN_FILE_CONTROL_VIEW_MODEL.status.className;
}

export type PayloadPatternImportResult =
  | {
      ok: true;
      pattern: string;
      status: PayloadPatternImportStatus;
    }
  | {
      ok: false;
      status: PayloadPatternImportStatus;
    };
export type PayloadPatternFileImportAction = {
  result: PayloadPatternImportResult;
};
export type PayloadPatternFileImportActionHandlers = {
  applyPattern: (pattern: string) => void;
  setStatus: (status: PayloadPatternImportStatus) => void;
};
export type PayloadPatternFileSelectionAction =
  | {
      kind: "ignore";
    }
  | {
      file: File;
      kind: "read";
    };
export type PayloadPatternFileSelectionHandlers = PayloadPatternFileImportActionHandlers & {
  readFile: (file: File) => Promise<string>;
  resetInput: () => void;
};

export function payloadPatternFileImportResult(content: string, fileName: string): PayloadPatternImportResult {
  const pattern = compactPayloadPattern(content);
  const error = payloadPatternImportError(pattern);
  if (error) {
    return {
      ok: false,
      status: { kind: "error", text: error }
    };
  }
  return {
    ok: true,
    pattern,
    status: { kind: "ok", text: `Loaded ${fileName}` }
  };
}

export function payloadPatternFileImportAction(content: string, fileName: string): PayloadPatternFileImportAction {
  return {
    result: payloadPatternFileImportResult(content, fileName)
  };
}

export function payloadPatternFileReadErrorAction(): PayloadPatternFileImportAction {
  return {
    result: {
      ok: false,
      status: { kind: "error", text: "Payload pattern file could not be read." }
    }
  };
}

export function runPayloadPatternFileImportAction(
  action: PayloadPatternFileImportAction,
  handlers: PayloadPatternFileImportActionHandlers
) {
  if (!action.result.ok) {
    handlers.setStatus(action.result.status);
    return false;
  }
  handlers.applyPattern(action.result.pattern);
  handlers.setStatus(action.result.status);
  return true;
}

export function payloadPatternFileSelectionAction(
  file: File | null,
  canApplyPattern: boolean
): PayloadPatternFileSelectionAction {
  if (!file || !canApplyPattern) {
    return { kind: "ignore" };
  }
  return { file, kind: "read" };
}

export async function runPayloadPatternFileSelectionAction(
  action: PayloadPatternFileSelectionAction,
  handlers: PayloadPatternFileSelectionHandlers
) {
  if (action.kind === "ignore") {
    handlers.resetInput();
    return false;
  }
  try {
    const content = await handlers.readFile(action.file);
    return runPayloadPatternFileImportAction(
      payloadPatternFileImportAction(content, action.file.name),
      handlers
    );
  } catch {
    return runPayloadPatternFileImportAction(payloadPatternFileReadErrorAction(), handlers);
  } finally {
    handlers.resetInput();
  }
}

export function runPayloadPatternFileSelection(
  file: File | null,
  canApplyPattern: boolean,
  handlers: PayloadPatternFileSelectionHandlers
) {
  return runPayloadPatternFileSelectionAction(
    payloadPatternFileSelectionAction(file, canApplyPattern),
    handlers
  );
}

export type PayloadPatternEditHandlers = {
  changePattern: (pattern: string) => boolean;
  changeType: (payloadType: ProfileWorkbenchStream["payload_type"]) => boolean;
  clearStatus: () => void;
};

export function runPayloadPatternTypeInputChange(
  payloadType: ProfileWorkbenchStream["payload_type"],
  handlers: PayloadPatternEditHandlers
) {
  handlers.clearStatus();
  return handlers.changeType(payloadType);
}

export function runPayloadPatternTextInputChange(
  pattern: string,
  handlers: PayloadPatternEditHandlers
) {
  handlers.clearStatus();
  return handlers.changePattern(pattern);
}
