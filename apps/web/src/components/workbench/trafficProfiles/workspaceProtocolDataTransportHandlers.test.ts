import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataTransportHandlers } from "./workspaceProtocolDataTransportHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataTransportHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataTransportHandlers", () => {
  it("binds L4 source port edits and preserves override selection semantics", () => {
    const { handlers, patches } = collectHandlers({
      l4_src_port_mode: "Increment"
    } as ProfileWorkbenchStream);

    expect(handlers.changeL4SourcePortOverrideSelection(true)).toBe(true);
    expect(handlers.changeL4SourcePort(1024)).toBe(true);
    expect(handlers.changeL4SourcePortMode("Decrement")).toBe(true);
    expect(handlers.changeL4SourcePortCount(8)).toBe(true);
    expect(handlers.changeL4SourcePortStep(2)).toBe(true);
    expect(handlers.changeL4SourcePortOverrideSelection(false)).toBe(true);

    expect(patches).toEqual([
      {
        l4_src_port_override: true,
        l4_src_port_mode: "Increment"
      },
      { l4_src_port: 1024 },
      { l4_src_port_mode: "Decrement" },
      { l4_src_port_count: 8 },
      { l4_src_port_step: 2 },
      {
        l4_src_port_override: false,
        l4_src_port_mode: "Fixed"
      }
    ]);
  });

  it("binds L4 destination port edits and preserves override selection semantics", () => {
    const { handlers, patches } = collectHandlers({
      l4_dst_port_mode: "Random"
    } as ProfileWorkbenchStream);

    expect(handlers.changeL4DestinationPortOverrideSelection(true)).toBe(true);
    expect(handlers.changeL4DestinationPort(2048)).toBe(true);
    expect(handlers.changeL4DestinationPortMode("Increment")).toBe(true);
    expect(handlers.changeL4DestinationPortCount(16)).toBe(true);
    expect(handlers.changeL4DestinationPortStep(4)).toBe(true);
    expect(handlers.changeL4DestinationPortOverrideSelection(false)).toBe(true);

    expect(patches).toEqual([
      {
        l4_dst_port_override: true,
        l4_dst_port_mode: "Random"
      },
      { l4_dst_port: 2048 },
      { l4_dst_port_mode: "Increment" },
      { l4_dst_port_count: 16 },
      { l4_dst_port_step: 4 },
      {
        l4_dst_port_override: false,
        l4_dst_port_mode: "Fixed"
      }
    ]);
  });

  it("does not synthesize L4 port override selections without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeL4SourcePortOverrideSelection(true)).toBe(false);
    expect(handlers.changeL4DestinationPortOverrideSelection(true)).toBe(false);

    expect(patches).toEqual([]);
  });
});
