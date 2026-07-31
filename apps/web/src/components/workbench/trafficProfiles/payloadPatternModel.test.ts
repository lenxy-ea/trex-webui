import { describe, expect, it, vi } from "vitest";

import {
  payloadPatternFileControlViewModel,
  payloadPatternFileSelectionAction,
  payloadPatternImportStatusClassName,
  payloadPatternPanelViewModel,
  runPayloadPatternFileSelection,
  runPayloadPatternFileSelectionAction,
  runPayloadPatternTextInputChange,
  runPayloadPatternTypeInputChange,
  type PayloadPatternImportStatus
} from "./payloadPatternModel";

function file(name: string) {
  return { name } as File;
}

describe("payload pattern file control model", () => {
  it("owns the Payload Data panel presentation contract consumed by the workspace", () => {
    expect(payloadPatternPanelViewModel()).toEqual({
      pattern: {
        ariaLabel: "Payload pattern",
        label: "Pattern"
      },
      summary: "Payload Data",
      type: {
        ariaLabel: "Payload type",
        label: "Type"
      }
    });
  });

  it("owns the static presentation contract consumed by the workspace", () => {
    expect(payloadPatternFileControlViewModel()).toEqual({
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
    });
  });

  it("derives payload pattern import status class names", () => {
    expect(payloadPatternImportStatusClassName({ kind: "ok", text: "Loaded payload.hex" }))
      .toBe("payload-pattern-import-status");
    expect(payloadPatternImportStatusClassName({ kind: "error", text: "Invalid hex" }))
      .toBe("payload-pattern-import-status payload-pattern-import-status--error");
  });
});

describe("payload pattern file selection model", () => {
  it("ignores empty or unavailable selections while resetting the file input", async () => {
    const readFile = vi.fn();
    const resetInput = vi.fn();
    const setStatus = vi.fn();
    const applyPattern = vi.fn();

    await expect(runPayloadPatternFileSelectionAction(
      payloadPatternFileSelectionAction(null, true),
      { applyPattern, readFile, resetInput, setStatus }
    )).resolves.toBe(false);
    await expect(runPayloadPatternFileSelectionAction(
      payloadPatternFileSelectionAction(file("payload.hex"), false),
      { applyPattern, readFile, resetInput, setStatus }
    )).resolves.toBe(false);

    expect(readFile).not.toHaveBeenCalled();
    expect(applyPattern).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(resetInput).toHaveBeenCalledTimes(2);
  });

  it("reads and applies valid payload pattern files", async () => {
    const statuses: PayloadPatternImportStatus[] = [];
    const applyPattern = vi.fn();

    await expect(runPayloadPatternFileSelectionAction(
      payloadPatternFileSelectionAction(file("payload.hex"), true),
      {
        applyPattern,
        readFile: vi.fn().mockResolvedValue("0xA1, b2:c3"),
        resetInput: vi.fn(),
        setStatus: (status) => statuses.push(status)
      }
    )).resolves.toBe(true);

    expect(applyPattern).toHaveBeenCalledWith("A1b2c3");
    expect(statuses).toEqual([{ kind: "ok", text: "Loaded payload.hex" }]);
  });

  it("runs payload pattern file workflow from a nullable file input", async () => {
    const statuses: PayloadPatternImportStatus[] = [];
    const applyPattern = vi.fn();
    const resetInput = vi.fn();

    await expect(runPayloadPatternFileSelection(file("payload.hex"), true, {
      applyPattern,
      readFile: vi.fn().mockResolvedValue("aa bb"),
      resetInput,
      setStatus: (status) => statuses.push(status)
    })).resolves.toBe(true);

    expect(applyPattern).toHaveBeenCalledWith("aabb");
    expect(statuses).toEqual([{ kind: "ok", text: "Loaded payload.hex" }]);
    expect(resetInput).toHaveBeenCalledTimes(1);
  });

  it("reports file-read failures without applying a pattern", async () => {
    const statuses: PayloadPatternImportStatus[] = [];
    const applyPattern = vi.fn();
    const resetInput = vi.fn();

    await expect(runPayloadPatternFileSelectionAction(
      payloadPatternFileSelectionAction(file("bad.hex"), true),
      {
        applyPattern,
        readFile: vi.fn().mockRejectedValue(new Error("read failed")),
        resetInput,
        setStatus: (status) => statuses.push(status)
      }
    )).resolves.toBe(false);

    expect(applyPattern).not.toHaveBeenCalled();
    expect(statuses).toEqual([
      { kind: "error", text: "Payload pattern file could not be read." }
    ]);
    expect(resetInput).toHaveBeenCalledTimes(1);
  });
});

describe("payload pattern edit model", () => {
  it("clears import status before dispatching payload type changes", () => {
    const events: string[] = [];

    expect(runPayloadPatternTypeInputChange("Increment Byte", {
      changePattern: () => {
        events.push("change-pattern");
        return true;
      },
      changeType: (payloadType) => {
        events.push(`change-type:${payloadType}`);
        return true;
      },
      clearStatus: () => events.push("clear-status")
    })).toBe(true);

    expect(events).toEqual([
      "clear-status",
      "change-type:Increment Byte"
    ]);
  });

  it("clears import status before dispatching payload pattern text changes", () => {
    const events: string[] = [];

    expect(runPayloadPatternTextInputChange("AABB", {
      changePattern: (pattern) => {
        events.push(`change-pattern:${pattern}`);
        return true;
      },
      changeType: () => {
        events.push("change-type");
        return true;
      },
      clearStatus: () => events.push("clear-status")
    })).toBe(true);

    expect(events).toEqual([
      "clear-status",
      "change-pattern:AABB"
    ]);
  });
});
