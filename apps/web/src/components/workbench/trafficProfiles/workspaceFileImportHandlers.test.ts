import { describe, expect, it, vi } from "vitest";

import { defaultPcapImportOptions } from "./pcapImportModel";
import type { PayloadPatternImportStatus } from "./payloadPatternModel";
import {
  runWorkspacePayloadPatternFileListImport,
  runWorkspacePcapFileListImport,
  workspaceFileImportActionHandlers,
  type WorkspaceFileImportHandlerOptions
} from "./workspaceFileImportHandlers";

function fileListWith(file: File): FileList {
  return {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null)
  } as unknown as FileList;
}

function collectHandlers(
  overrides: Partial<WorkspaceFileImportHandlerOptions> = {}
) {
  const statuses: PayloadPatternImportStatus[] = [];
  const options = {
    applyPayloadPattern: vi.fn(),
    importPcap: vi.fn(),
    readPayloadPatternFile: vi.fn().mockResolvedValue("aa bb"),
    resetPcapInput: vi.fn(),
    resetPayloadPatternInput: vi.fn(),
    setPayloadPatternStatus: (status: PayloadPatternImportStatus) => statuses.push(status),
    ...overrides
  } satisfies WorkspaceFileImportHandlerOptions;

  return {
    options,
    statuses
  };
}

describe("workspaceFileImportHandlers", () => {
  it("binds PCAP FileList selection to the existing import workflow", () => {
    const file = new File(["pcap"], "sample.pcap", { type: "application/vnd.tcpdump.pcap" });
    const pcapImportOptions = {
      ...defaultPcapImportOptions,
      name_prefix: "capture-",
      loop_count: 3
    };
    const { options } = collectHandlers();

    expect(runWorkspacePcapFileListImport(fileListWith(file), pcapImportOptions, {
      importPcap: options.importPcap,
      resetPcapInput: options.resetPcapInput
    })).toBe(true);

    expect(options.importPcap).toHaveBeenCalledWith(file, pcapImportOptions);
    expect(options.resetPcapInput).toHaveBeenCalledTimes(1);
  });

  it("resets the PCAP file input when no file is selected", () => {
    const { options } = collectHandlers();

    expect(runWorkspacePcapFileListImport(null, defaultPcapImportOptions, {
      importPcap: options.importPcap,
      resetPcapInput: options.resetPcapInput
    })).toBe(false);

    expect(options.importPcap).not.toHaveBeenCalled();
    expect(options.resetPcapInput).toHaveBeenCalledTimes(1);
  });

  it("reads and applies payload pattern FileList selections", async () => {
    const file = new File(["aa bb"], "payload.hex", { type: "text/plain" });
    const { options, statuses } = collectHandlers();

    await expect(runWorkspacePayloadPatternFileListImport(fileListWith(file), true, {
      applyPayloadPattern: options.applyPayloadPattern,
      readPayloadPatternFile: options.readPayloadPatternFile,
      resetPayloadPatternInput: options.resetPayloadPatternInput,
      setPayloadPatternStatus: options.setPayloadPatternStatus
    })).resolves.toBe(true);

    expect(options.readPayloadPatternFile).toHaveBeenCalledWith(file);
    expect(options.applyPayloadPattern).toHaveBeenCalledWith("aabb");
    expect(statuses).toEqual([{ kind: "ok", text: "Loaded payload.hex" }]);
    expect(options.resetPayloadPatternInput).toHaveBeenCalledTimes(1);
  });

  it("binds workspace file import actions", async () => {
    const pcapFile = new File(["pcap"], "sample.pcap", { type: "application/vnd.tcpdump.pcap" });
    const payloadFile = new File(["aa bb"], "payload.hex", { type: "text/plain" });
    const { options, statuses } = collectHandlers();
    const handlers = workspaceFileImportActionHandlers({
      ...options,
      canApplyPayloadPattern: true,
      pcapImportOptions: defaultPcapImportOptions
    });

    expect(handlers.importPcapFileList(fileListWith(pcapFile))).toBe(true);
    await expect(handlers.importPayloadPatternFileList(fileListWith(payloadFile))).resolves.toBe(true);

    expect(options.importPcap).toHaveBeenCalledWith(pcapFile, defaultPcapImportOptions);
    expect(options.applyPayloadPattern).toHaveBeenCalledWith("aabb");
    expect(statuses).toEqual([{ kind: "ok", text: "Loaded payload.hex" }]);
  });

  it("ignores payload files when no selected stream can accept the pattern", async () => {
    const file = new File(["aa bb"], "payload.hex", { type: "text/plain" });
    const { options, statuses } = collectHandlers();

    await expect(runWorkspacePayloadPatternFileListImport(fileListWith(file), false, {
      applyPayloadPattern: options.applyPayloadPattern,
      readPayloadPatternFile: options.readPayloadPatternFile,
      resetPayloadPatternInput: options.resetPayloadPatternInput,
      setPayloadPatternStatus: options.setPayloadPatternStatus
    })).resolves.toBe(false);

    expect(options.readPayloadPatternFile).not.toHaveBeenCalled();
    expect(options.applyPayloadPattern).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
    expect(options.resetPayloadPatternInput).toHaveBeenCalledTimes(1);
  });
});
