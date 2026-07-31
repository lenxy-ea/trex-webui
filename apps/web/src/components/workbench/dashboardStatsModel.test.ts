import { describe, expect, it } from "vitest";

import {
  displayMetricValue,
  filterScopedStats,
  flattenScopedStats,
  metricText,
  readNumber,
  readOptionalNumber,
  readPath,
  statScopeIds
} from "./dashboardStatsModel";
import { displayPacketRate } from "./format";

describe("dashboard stats model", () => {
  it("reads nested TRex paths with ordered fallbacks", () => {
    const stats = {
      global: {
        tx_pps: "",
        tx_rate: "1500"
      },
      total: {
        tx_pps: 2500
      }
    };

    expect(readPath(stats, ["global.tx_pps", "global.tx_rate", "total.tx_pps"])).toBe("1500");
    expect(readOptionalNumber(stats, ["global.tx_rate"])).toBe(1500);
    expect(readOptionalNumber(stats, ["missing.path"])).toBeNull();
    expect(readNumber(stats, ["missing.path"])).toBe(0);
  });

  it("formats metrics by operational counter names", () => {
    expect(displayMetricValue("tx_pps", 1500)).toBe("1.5 Kpps");
    expect(displayMetricValue("tx_bps_L2", 1_000_000)).toBe("1 Mb/s");
    expect(displayMetricValue("rx_bytes", 2048)).toBe("2.0 KiB");
    expect(displayMetricValue("lat.average", 7)).toBe("7 us");
    expect(displayMetricValue("tx_util", 12.345)).toBe("12.3%");
    expect(displayMetricValue("queue_full", 1240)).toBe("1,240");
    expect(displayMetricValue("state", "IDLE")).toBe("IDLE");
  });

  it("derives top-level dashboard metric text through formatters", () => {
    expect(metricText({ global: { tx_pps: "2500" } }, ["global.tx_pps"], displayPacketRate)).toBe("2.5 Kpps");
    expect(metricText({ global: { tx_pps: "bad" } }, ["global.tx_pps"], displayPacketRate)).toBe("-");
  });

  it("flattens scoped flow stats with display-ready values", () => {
    expect(flattenScopedStats({
      "12": {
        tx_pps: 1500,
        tx_pkts: { total: 1240 },
        nested: { deeper: { value: "ready" } }
      },
      "13": {
        rx_bps: 2_500_000
      }
    }, "flow_stats", 8)).toEqual([
      { scope: "12", metric: "tx_pps", value: "1.5 Kpps" },
      { scope: "12", metric: "tx_pkts.total", value: "1,240" },
      { scope: "12", metric: "nested.deeper.value", value: "ready" },
      { scope: "13", metric: "rx_bps", value: "2.5 Mb/s" }
    ]);
  });

  it("filters and orders PG ID scopes without global counters", () => {
    const flowStats = {
      "10": { tx_pps: 10 },
      "2": { tx_pps: 2 },
      global: { tx_pps: 99 },
      total: { tx_pps: 100 },
      "1": { tx_pps: 1 }
    };

    expect(statScopeIds(flowStats)).toEqual(["1", "2", "10"]);
    expect(filterScopedStats(flowStats, ["2"], true)).toEqual({
      "2": { tx_pps: 2 },
      global: { tx_pps: 99 }
    });
  });
});
