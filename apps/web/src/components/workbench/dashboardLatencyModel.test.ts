import { describe, expect, it } from "vitest";

import type { TrexStatsSnapshot } from "../../api";
import {
  displayLoss,
  flowStatsIssues,
  latencyErrorAction,
  latencyErrorBreakdown,
  latencyErrorCounts,
  latencyErrorTotal,
  latencyHistogramColumns,
  latencyHistogramRows,
  latencyWindowRows,
  streamDiagnosticRows,
  streamHealthRows
} from "./dashboardLatencyModel";

describe("dashboard latency model", () => {
  it("normalizes latency error counters from TRex aliases", () => {
    const latency = {
      err: {
        drp: 2,
        dup: "3",
        ooo: 4,
        sth: 5,
        stl: 6
      }
    };

    expect(latencyErrorCounts(latency)).toEqual({
      dropped: 2,
      dup: 3,
      outOfOrder: 4,
      seqToHigh: 5,
      seqToLow: 6
    });
    expect(latencyErrorTotal(latency)).toBe(20);
    expect(latencyErrorBreakdown(latency)).toBe("dropped 2; dup 3; out-of-order 4; seq-high 5; seq-low 6");
    expect(latencyErrorAction(latency)).toContain("loss");
  });

  it("derives stream health rows from flow and latency stats", () => {
    const stats = {
      flow_stats: {
        "12": {
          tx_pkts: { total: 1000 },
          rx_pkts: { total: 990 },
          tx_pps: 1500,
          rx_pps: 1490
        },
        "13": {
          tx_pkts: 10,
          rx_pkts: 10,
          tx_pps: 10,
          rx_pps: 10
        }
      },
      latency: {
        "12": {
          lat: {
            average: 5,
            total_max: 9
          }
        },
        "13": {
          err: {
            dup: 1
          },
          lat: {
            average: 7,
            total_max: 12
          }
        }
      }
    } as unknown as TrexStatsSnapshot;

    expect(streamHealthRows(stats, ["12", "13"])).toMatchObject([
      {
        pgId: "12",
        level: "warning",
        deficit: 10,
        deficitIssue: true,
        deficitRatio: 1,
        note: "RX deficit 10; Max 9 us"
      },
      {
        pgId: "13",
        level: "critical",
        latencyErrors: 1,
        latencyBreakdown: "dup 1",
        note: "Latency errors 1; Max 12 us"
      }
    ]);
    expect(flowStatsIssues(stats)).toEqual(["PG 12 rx deficit 10"]);
  });

  it("turns stream health into operator diagnostics", () => {
    const stats = {
      global: {
        queue_full: 2,
        rx_drop_bps: 1000
      }
    } as unknown as TrexStatsSnapshot;
    const rows = streamHealthRows({
      flow_stats: {
        "7": {
          tx_pkts: 1000,
          rx_pkts: 900,
          tx_pps: 200,
          rx_pps: 180
        }
      },
      latency: {
        "7": {
          err: {
            drp: 3
          }
        }
      }
    } as unknown as TrexStatsSnapshot, ["7"]);

    expect(streamDiagnosticRows(rows, [{ errors: 4 }], stats).map((row) => row.key)).toEqual([
      "global:drop",
      "global:queue",
      "global:port-errors",
      "7:latency-errors",
      "7:rx-deficit"
    ]);
  });

  it("builds original-style latency window and histogram rows", () => {
    const stats = {
      flow_stats: {
        "5": {
          tx_pkts: 100,
          rx_pkts: 99
        }
      },
      latency: {
        "5": {
          lat: {
            average: 4,
            jit: 1,
            last_max_window: [9, "8", null],
            total_max: 12
          },
          histogram: {
            "10": 2,
            "2": 1,
            "30": 3
          },
          errors: {
            dropped: 1
          }
        }
      }
    } as unknown as TrexStatsSnapshot;

    expect(latencyWindowRows(stats, ["5"])).toMatchObject([
      {
        pgId: "5",
        txPackets: 100,
        rxPackets: 99,
        maxLatency: 12,
        avgLatency: 4,
        jitter: 1,
        errors: 1
      }
    ]);
    expect(latencyWindowRows(stats, ["5"])[0].lastValues.slice(0, 4)).toEqual([9, 8, null, null]);

    const histogramRows = latencyHistogramRows(stats, ["5"]);
    expect(histogramRows).toMatchObject([
      {
        pgId: "5",
        buckets: {
          "2": 1,
          "10": 2,
          "30": 3
        },
        dropped: 1
      }
    ]);
    expect(latencyHistogramColumns(histogramRows)).toEqual(["2", "10", "30"]);
    expect(displayLoss(1.5)).toBe("1.5%");
    expect(displayLoss(null)).toBe("0%");
  });
});
