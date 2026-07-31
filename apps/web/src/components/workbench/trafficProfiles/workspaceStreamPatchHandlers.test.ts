import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceStreamPatchHandlers } from "./workspaceStreamPatchHandlers";

const stream = {
  count: 1,
  mode: "continuous",
  packet_type: "Ethernet/IPv4/UDP"
} as unknown as ProfileWorkbenchStream;

function collectHandlers(selectedStream: ProfileWorkbenchStream | null = stream) {
  const patches: StreamPatch[] = [];
  let cleared = 0;
  const handlers = workspaceStreamPatchHandlers({
    clearPayloadPatternStatus: () => {
      cleared += 1;
    },
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });
  return {
    getCleared: () => cleared,
    handlers,
    patches
  };
}

describe("workspaceStreamPatchHandlers", () => {
  it("binds top-level stream changes to the selected stream patch handlers", () => {
    const { handlers, patches } = collectHandlers();

    handlers.changeStreamMode("multi_burst");

    expect(patches).toEqual([
      {
        count: 2,
        mode: "multi_burst"
      }
    ]);
  });

  it("binds payload pattern edits and import actions", () => {
    const { getCleared, handlers, patches } = collectHandlers();

    expect(handlers.changePayloadPatternTextInput("ff")).toBe(true);
    expect(handlers.applyPayloadPatternImport("aa bb")).toBe(true);

    expect(getCleared()).toBe(1);
    expect(patches).toEqual([
      {
        payload_pattern: "ff"
      },
      {
        payload_enabled: true,
        payload_pattern: "AA BB",
        payload_type: "Fixed Word"
      }
    ]);
  });

  it("binds advanced cache edits to the selected stream patch handlers", () => {
    const { handlers, patches } = collectHandlers();

    expect(handlers.changeAdvancedCacheSizeType("Enable")).toBe(true);
    expect(handlers.changeAdvancedCacheValue(2048)).toBe(true);

    expect(patches).toEqual([
      { advanced_cache_size_type: "Enable" },
      { advanced_cache_value: 2048 }
    ]);
  });

  it("keeps payload input clearing separate from patch application", () => {
    const { getCleared, handlers, patches } = collectHandlers();

    expect(handlers.changePayloadPatternTypeInput("Random")).toBe(true);

    expect(getCleared()).toBe(1);
    expect(patches).toEqual([
      {
        payload_type: "Random"
      }
    ]);
  });

  it("preserves context-free stream patch behavior when no stream is selected", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeStreamMode("burst")).toBe(true);
    expect(handlers.applyPayloadPatternImport("aa")).toBe(true);

    expect(patches).toEqual([
      {
        count: 1,
        mode: "burst"
      },
      {
        payload_enabled: true,
        payload_pattern: "AA",
        payload_type: "Fixed Word"
      }
    ]);
  });
});
