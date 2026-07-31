import { describe, expect, it } from "vitest";

import { trexResultDiagnostic, trexResultDiagnosticMessage } from "./trexDiagnostics";

describe("trex diagnostics", () => {
  it("explains the capture service-mode flow-stats TRex error", () => {
    const result = {
      ok: false,
      data: null,
      blocker: "trex_command_failed",
      error: "\u001b[1mPort 0 : *** Port 1 is under service mode, can't use flow_stats.\u001b[22m"
    };

    expect(trexResultDiagnostic(result)).toEqual({
      code: "capture_service_mode_flow_stats",
      title: "Capture service mode blocks flow stats",
      summary: "TRex cannot start a flow-stats stream while a capture has the peer port in service mode",
      action: "Stop the active capture recorder or disable RX Stats/Latency on the stream before starting traffic"
    });
    expect(trexResultDiagnosticMessage(result)).toBe(
      "Capture service mode blocks flow stats: Stop the active capture recorder or disable RX Stats/Latency on the stream before starting traffic"
    );
  });
});
