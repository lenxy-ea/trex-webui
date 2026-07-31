import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataTcpHandlers } from "./workspaceProtocolDataTcpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataTcpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataTcpHandlers", () => {
  it("binds TCP core sequence, acknowledge, window, checksum, and urgent pointer edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeTcpCoreNumber("sequence", 100)).toBe(true);
    expect(handlers.changeTcpCoreMode("sequence", "Increment")).toBe(true);
    expect(handlers.changeTcpCoreCount("sequence", 4)).toBe(true);
    expect(handlers.changeTcpCoreStep("sequence", 1)).toBe(true);
    expect(handlers.changeTcpCoreNumber("acknowledge", 200)).toBe(true);
    expect(handlers.changeTcpCoreMode("acknowledge", "Decrement")).toBe(true);
    expect(handlers.changeTcpCoreNumber("window", 4096)).toBe(true);
    expect(handlers.changeTcpCoreMode("window", "Random")).toBe(true);
    expect(handlers.changeTcpChecksumOverride(true)).toBe(true);
    expect(handlers.changeTcpChecksum("B3E3")).toBe(true);
    expect(handlers.changeTcpCoreMode("checksum", "Increment")).toBe(true);
    expect(handlers.changeTcpCoreCount("checksum", 8)).toBe(true);
    expect(handlers.changeTcpCoreStep("checksum", 2)).toBe(true);
    expect(handlers.changeTcpCoreNumber("urgent-pointer", 7)).toBe(true);
    expect(handlers.changeTcpCoreMode("urgent-pointer", "Fixed")).toBe(true);

    expect(patches).toEqual([
      { tcp_sequence_number: 100 },
      { tcp_sequence_mode: "Increment" },
      { tcp_sequence_count: 4 },
      { tcp_sequence_step: 1 },
      { tcp_ack_number: 200 },
      { tcp_ack_mode: "Decrement" },
      { tcp_window: 4096 },
      { tcp_window_mode: "Random" },
      { tcp_checksum_override: true },
      { tcp_checksum: "B3E3" },
      { tcp_checksum_mode: "Increment" },
      { tcp_checksum_count: 8 },
      { tcp_checksum_step: 2 },
      { tcp_urgent_pointer: 7 },
      { tcp_urgent_pointer_mode: "Fixed" }
    ]);
  });

  it("binds TCP flag edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeTcpFlag("tcp_flag_syn", true)).toBe(true);
    expect(handlers.changeTcpFlag("tcp_flag_ack", false)).toBe(true);
    expect(handlers.changeTcpCoreMode("flags", "Increment")).toBe(true);
    expect(handlers.changeTcpCoreCount("flags", 3)).toBe(true);
    expect(handlers.changeTcpCoreStep("flags", 1)).toBe(true);

    expect(patches).toEqual([
      { tcp_flag_syn: true },
      { tcp_flag_ack: false },
      { tcp_flags_mode: "Increment" },
      { tcp_flags_count: 3 },
      { tcp_flags_step: 1 }
    ]);
  });

  it("binds TCP option selections and variable fields", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeTcpOptionSelection("mss", true)).toBe(true);
    expect(handlers.changeTcpOptionNumber("mss", 1460)).toBe(true);
    expect(handlers.changeTcpOptionMode("mss", "Increment")).toBe(true);
    expect(handlers.changeTcpOptionCount("mss", 4)).toBe(true);
    expect(handlers.changeTcpOptionStep("mss", 2)).toBe(true);
    expect(handlers.changeTcpOptionSelection("window-scale", true)).toBe(true);
    expect(handlers.changeTcpOptionNumber("window-scale", 7)).toBe(true);
    expect(handlers.changeTcpOptionMode("window-scale", "Random")).toBe(true);
    expect(handlers.changeTcpOptionSelection("sack-permitted", true)).toBe(true);
    expect(handlers.changeTcpOptionSelection("sack-block", true)).toBe(true);
    expect(handlers.changeTcpOptionNumber("sack-left-edge", 1000)).toBe(true);
    expect(handlers.changeTcpOptionMode("sack-left-edge", "Decrement")).toBe(true);
    expect(handlers.changeTcpOptionNumber("sack-right-edge", 2000)).toBe(true);
    expect(handlers.changeTcpOptionMode("sack-right-edge", "Fixed")).toBe(true);
    expect(handlers.changeTcpOptionSelection("timestamp", true)).toBe(true);
    expect(handlers.changeTcpOptionNumber("timestamp-value", 3000)).toBe(true);
    expect(handlers.changeTcpOptionMode("timestamp-value", "Increment")).toBe(true);
    expect(handlers.changeTcpOptionNumber("timestamp-echo", 4000)).toBe(true);
    expect(handlers.changeTcpOptionMode("timestamp-echo", "Random")).toBe(true);

    expect(patches).toEqual([
      { tcp_option_mss_enabled: true },
      { tcp_option_mss: 1460 },
      { tcp_option_mss_mode: "Increment" },
      { tcp_option_mss_count: 4 },
      { tcp_option_mss_step: 2 },
      { tcp_option_window_scale_enabled: true },
      { tcp_option_window_scale: 7 },
      { tcp_option_window_scale_mode: "Random" },
      { tcp_option_sack_permitted_enabled: true },
      { tcp_option_sack_blocks_enabled: true },
      { tcp_option_sack_left_edge: 1000 },
      { tcp_option_sack_left_edge_mode: "Decrement" },
      { tcp_option_sack_right_edge: 2000 },
      { tcp_option_sack_right_edge_mode: "Fixed" },
      { tcp_option_timestamp_enabled: true },
      { tcp_option_timestamp_value: 3000 },
      { tcp_option_timestamp_value_mode: "Increment" },
      { tcp_option_timestamp_echo: 4000 },
      { tcp_option_timestamp_echo_mode: "Random" }
    ]);
  });

  it("binds TCP edits without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeTcpCoreNumber("sequence", 100)).toBe(true);
    expect(handlers.changeTcpCoreMode("sequence", "Increment")).toBe(true);
    expect(handlers.changeTcpFlag("tcp_flag_syn", true)).toBe(true);
    expect(handlers.changeTcpOptionSelection("timestamp", true)).toBe(true);
    expect(handlers.changeTcpOptionNumber("timestamp-value", 3000)).toBe(true);

    expect(patches).toEqual([
      { tcp_sequence_number: 100 },
      { tcp_sequence_mode: "Increment" },
      { tcp_flag_syn: true },
      { tcp_option_timestamp_enabled: true },
      { tcp_option_timestamp_value: 3000 }
    ]);
  });
});
