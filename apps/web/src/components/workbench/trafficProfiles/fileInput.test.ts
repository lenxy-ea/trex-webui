import { afterEach, describe, expect, it, vi } from "vitest";

import { firstFileFromList, readTextFile, resetFileInput } from "./fileInput";

const originalFileReader = globalThis.FileReader;

afterEach(() => {
  globalThis.FileReader = originalFileReader;
});

describe("traffic profile file input helpers", () => {
  it("selects the first file from browser file lists", () => {
    const itemFile = { name: "item.pcap" } as File;
    const indexFile = { name: "index.pcap" } as File;
    const listWithItem = {
      0: indexFile,
      item: vi.fn(() => itemFile)
    } as unknown as FileList;
    const listWithIndexFallback = {
      0: indexFile,
      item: vi.fn(() => null)
    } as unknown as FileList;

    expect(firstFileFromList(listWithItem)).toBe(itemFile);
    expect(firstFileFromList(listWithIndexFallback)).toBe(indexFile);
    expect(firstFileFromList(null)).toBeNull();
  });

  it("uses File.text when available", async () => {
    const text = vi.fn().mockResolvedValue("payload text");
    const file = { text } as unknown as File;

    await expect(readTextFile(file)).resolves.toBe("payload text");
    expect(text).toHaveBeenCalledTimes(1);
  });

  it("resets reusable hidden file inputs", () => {
    const input = document.createElement("input");
    input.value = "C:\\fakepath\\profile.pcap";

    resetFileInput(input);
    resetFileInput(null);
    resetFileInput(undefined);

    expect(input.value).toBe("");
  });

  it("falls back to FileReader when File.text is unavailable", async () => {
    globalThis.FileReader = class {
      result: string | ArrayBuffer | null = null;
      onerror: (() => void) | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsText() {
        this.result = "reader text";
        this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
      }
    } as unknown as typeof FileReader;

    await expect(readTextFile({} as File)).resolves.toBe("reader text");
  });
});
