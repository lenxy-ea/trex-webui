import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataUdpHandlers } from "./workspaceProtocolDataUdpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataUdpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataUdpHandlers", () => {
  it("binds UDP length edits and preserves override selection semantics", () => {
    const { handlers, patches } = collectHandlers({
      udp_length_mode: "Increment"
    } as ProfileWorkbenchStream);

    expect(handlers.changeUdpLengthOverrideSelection(true)).toBe(true);
    expect(handlers.changeUdpLength(128)).toBe(true);
    expect(handlers.changeUdpLengthMode("Decrement")).toBe(true);
    expect(handlers.changeUdpLengthCount(8)).toBe(true);
    expect(handlers.changeUdpLengthStep(2)).toBe(true);
    expect(handlers.changeUdpLengthOverrideSelection(false)).toBe(true);

    expect(patches).toEqual([
      {
        udp_length_override: true,
        udp_length_mode: "Increment"
      },
      { udp_length: 128 },
      { udp_length_mode: "Decrement" },
      { udp_length_count: 8 },
      { udp_length_step: 2 },
      {
        udp_length_override: false,
        udp_length_mode: "Fixed"
      }
    ]);
  });

  it("binds UDP checksum edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeUdpChecksumOverride(true)).toBe(true);
    expect(handlers.changeUdpChecksum("B3E3")).toBe(true);
    expect(handlers.changeUdpChecksumMode("Increment")).toBe(true);
    expect(handlers.changeUdpChecksumCount(16)).toBe(true);
    expect(handlers.changeUdpChecksumStep(4)).toBe(true);

    expect(patches).toEqual([
      { udp_checksum_override: true },
      { udp_checksum: "B3E3" },
      { udp_checksum_mode: "Increment" },
      { udp_checksum_count: 16 },
      { udp_checksum_step: 4 }
    ]);
  });

  it("does not synthesize UDP length override selection without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeUdpLengthOverrideSelection(true)).toBe(false);
    expect(handlers.changeUdpLength(128)).toBe(true);
    expect(handlers.changeUdpChecksum("B3E3")).toBe(true);

    expect(patches).toEqual([
      { udp_length: 128 },
      { udp_checksum: "B3E3" }
    ]);
  });
});
