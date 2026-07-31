import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceStreamPropertiesHandlers } from "./workspaceStreamPropertiesHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceStreamPropertiesHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceStreamPropertiesHandlers", () => {
  it("binds basic Stream Properties edits to selected-stream patches", () => {
    const { handlers, patches } = collectHandlers({ action_count: 0, next_stream_id: null } as ProfileWorkbenchStream);

    expect(handlers.changeStreamEnabled(false)).toBe(true);
    expect(handlers.changeSelfStart(false)).toBe(true);
    expect(handlers.changeTotalPackets(10)).toBe(true);
    expect(handlers.changeBurstCount(3)).toBe(true);
    expect(handlers.changePacketsPerBurst(7)).toBe(true);
    expect(handlers.changeRateType("pps")).toBe(true);
    expect(handlers.changeRateValue(2500)).toBe(true);
    expect(handlers.changeIsg(0.1)).toBe(true);
    expect(handlers.changeIbg(0.2)).toBe(true);
    expect(handlers.changeFlowStatsEnabled(true)).toBe(true);
    expect(handlers.changePgId(9)).toBe(true);
    expect(handlers.changeLatencyEnabled(true)).toBe(true);
    expect(handlers.changeStreamName("stream-a")).toBe(true);
    expect(handlers.changeFrameLength(128)).toBe(true);
    expect(handlers.changeFrameLengthMin(64)).toBe(true);
    expect(handlers.changeFrameLengthMax(512)).toBe(true);

    expect(patches).toEqual([
      { enabled: false },
      { self_start: false },
      { total_pkts: 10 },
      { count: 3 },
      { pkts_per_burst: 7 },
      { rate_type: "pps" },
      { rate_value: 2500 },
      { isg: 0.1 },
      { ibg: 0.2 },
      { flow_stats_enabled: true },
      { pg_id: 9 },
      { latency_enabled: true },
      { name: "stream-a" },
      { frame_length: 128 },
      { frame_length_min: 64 },
      { frame_length: 512, frame_length_max: 512 }
    ]);
  });

  it("preserves stream-dependent after-stream and loop semantics", () => {
    const { handlers, patches } = collectHandlers({ action_count: 0, next_stream_id: null } as ProfileWorkbenchStream);

    expect(handlers.changeAfterStreamGoto()).toBe(true);
    expect(handlers.changeLoopActionCountEnabled(true)).toBe(true);
    expect(handlers.changeNextStream(4)).toBe(true);
    expect(handlers.changeLoopActionCount(6)).toBe(true);
    expect(handlers.changeAfterStreamStop()).toBe(true);

    expect(patches).toEqual([
      { action_count: 0, next_stream_id: 1 },
      { action_count: 1 },
      { next_stream_id: 4 },
      { action_count: 6 },
      { action_count: 0, next_stream_id: null }
    ]);
  });

  it("does not synthesize patches for stream-dependent actions without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeAfterStreamGoto()).toBe(false);
    expect(handlers.changeLoopActionCountEnabled(true)).toBe(false);

    expect(patches).toEqual([]);
  });
});
