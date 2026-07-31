import type { ProfilePcapImportOptions } from "../../../api";
import { firstFileFromList, readTextFile } from "./fileInput";
import { runPcapImportFileSelection } from "./pcapImportModel";
import {
  runPayloadPatternFileSelection,
  type PayloadPatternImportStatus
} from "./payloadPatternModel";

export type WorkspaceFileImportHandlerOptions = {
  applyPayloadPattern: (pattern: string) => void;
  importPcap: (file: File, options: ProfilePcapImportOptions) => void;
  readPayloadPatternFile?: (file: File) => Promise<string>;
  resetPcapInput: () => void;
  resetPayloadPatternInput: () => void;
  setPayloadPatternStatus: (status: PayloadPatternImportStatus) => void;
};
export type WorkspaceFileImportActionHandlers = {
  importPayloadPatternFileList: (fileList: FileList | null) => Promise<boolean>;
  importPcapFileList: (fileList: FileList | null) => boolean;
};
export type WorkspaceFileImportActionHandlerInput = WorkspaceFileImportHandlerOptions & {
  canApplyPayloadPattern: boolean;
  pcapImportOptions: ProfilePcapImportOptions;
};

export function runWorkspacePcapFileListImport(
  fileList: FileList | null,
  pcapImportOptions: ProfilePcapImportOptions,
  options: Pick<WorkspaceFileImportHandlerOptions, "importPcap" | "resetPcapInput">
) {
  return runPcapImportFileSelection(firstFileFromList(fileList), pcapImportOptions, {
    importPcap: options.importPcap,
    resetInput: options.resetPcapInput
  });
}

export function runWorkspacePayloadPatternFileListImport(
  fileList: FileList | null,
  canApplyPayloadPattern: boolean,
  options: Pick<
    WorkspaceFileImportHandlerOptions,
    "applyPayloadPattern" | "readPayloadPatternFile" | "resetPayloadPatternInput" | "setPayloadPatternStatus"
  >
) {
  const readPayloadPatternFile = options.readPayloadPatternFile ?? readTextFile;
  return runPayloadPatternFileSelection(
    firstFileFromList(fileList),
    canApplyPayloadPattern,
    {
      applyPattern: options.applyPayloadPattern,
      readFile: readPayloadPatternFile,
      resetInput: options.resetPayloadPatternInput,
      setStatus: options.setPayloadPatternStatus
    }
  );
}

export function workspaceFileImportActionHandlers({
  canApplyPayloadPattern,
  pcapImportOptions,
  ...options
}: WorkspaceFileImportActionHandlerInput): WorkspaceFileImportActionHandlers {
  return {
    importPayloadPatternFileList: (fileList) =>
      runWorkspacePayloadPatternFileListImport(fileList, canApplyPayloadPattern, options),
    importPcapFileList: (fileList) =>
      runWorkspacePcapFileListImport(fileList, pcapImportOptions, options)
  };
}
