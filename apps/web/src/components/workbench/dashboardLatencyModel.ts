import type { TrexStatsSnapshot } from "../../api";
import {
  objectEntries,
  readOptionalNumber,
  readPath,
  selectedScopedEntries,
  statScopeIds
} from "./dashboardStatsModel";
import {
  displayBitRate,
  displayCount,
  displayLatencyUs,
  displayPacketRate,
  displayPercent
} from "./format";

export const latencyWindowSize = 10;
const latencyHistogramSize = 11;
const flowIssueLimit = 3;

export type LatencyWindowRow = {
  pgId: string;
  txPackets: number | null;
  rxPackets: number | null;
  maxLatency: number | null;
  avgLatency: number | null;
  lastValues: Array<number | null>;
  jitter: number | null;
  errors: number | null;
};

export type LatencyHistogramRow = {
  pgId: string;
  buckets: Record<string, number>;
  dropped: number;
  dup: number;
  outOfOrder: number;
  seqToHigh: number;
  seqToLow: number;
};

export type StreamHealthLevel = "critical" | "warning" | "ok" | "idle";

export type StreamHealthRow = {
  pgId: string;
  level: StreamHealthLevel;
  status: string;
  txPackets: number | null;
  rxPackets: number | null;
  deficit: number;
  deficitRatio: number | null;
  deficitIssue: boolean;
  txPps: number | null;
  rxPps: number | null;
  avgLatency: number | null;
  maxLatency: number | null;
  latencyErrors: number;
  latencyBreakdown: string;
  latencyAction: string;
  hasTraffic: boolean;
  note: string;
};

export type StreamDiagnosticRow = {
  key: string;
  pgId: string;
  level: StreamHealthLevel;
  symptom: string;
  evidence: string;
  action: string;
};

export type DashboardPortErrorRow = {
  errors: number;
};

export function readHistogramBuckets(source: unknown) {
  const histogram = readPath(source, ["lat.histogram", "latency.histogram", "histogram"]);
  const buckets: Record<string, number> = {};
  for (const [bucket, value] of objectEntries(histogram)) {
    const parsed = readOptionalNumber({ value }, ["value"]);
    if (parsed !== null) {
      buckets[bucket] = parsed;
    }
  }
  return buckets;
}

export function latencyErrorCounts(source: unknown) {
  const dropped = readOptionalNumber(source, [
    "err.drp",
    "err.dropped",
    "err_cntrs.drp",
    "err_cntrs.dropped",
    "errors.dropped",
    "dropped"
  ]) ?? 0;
  const dup = readOptionalNumber(source, [
    "err.dup",
    "err_cntrs.dup",
    "errors.dup",
    "dup"
  ]) ?? 0;
  const outOfOrder = readOptionalNumber(source, [
    "err.ooo",
    "err.out_of_order",
    "err_cntrs.ooo",
    "err_cntrs.out_of_order",
    "errors.ooo",
    "ooo"
  ]) ?? 0;
  const seqToHigh = readOptionalNumber(source, [
    "err.sth",
    "err.seq_too_high",
    "err_cntrs.sth",
    "err_cntrs.seq_too_high",
    "errors.sth",
    "sth"
  ]) ?? 0;
  const seqToLow = readOptionalNumber(source, [
    "err.stl",
    "err.seq_too_low",
    "err_cntrs.stl",
    "err_cntrs.seq_too_low",
    "errors.stl",
    "stl"
  ]) ?? 0;
  return { dropped, dup, outOfOrder, seqToHigh, seqToLow };
}

export function latencyErrorTotal(source: unknown) {
  const explicit = readOptionalNumber(source, [
    "err.total",
    "err_cntrs.total",
    "errors.total",
    "total_err",
    "total_errors"
  ]);
  if (explicit !== null) {
    return explicit;
  }
  const errors = latencyErrorCounts(source);
  return errors.dropped + errors.dup + errors.outOfOrder + errors.seqToHigh + errors.seqToLow;
}

export function latencyErrorBreakdown(source: unknown) {
  const errors = latencyErrorCounts(source);
  return [
    errors.dropped > 0 ? `dropped ${displayCount(errors.dropped)}` : "",
    errors.dup > 0 ? `dup ${displayCount(errors.dup)}` : "",
    errors.outOfOrder > 0 ? `out-of-order ${displayCount(errors.outOfOrder)}` : "",
    errors.seqToHigh > 0 ? `seq-high ${displayCount(errors.seqToHigh)}` : "",
    errors.seqToLow > 0 ? `seq-low ${displayCount(errors.seqToLow)}` : ""
  ].filter(Boolean).join("; ");
}

export function latencyErrorAction(source: unknown) {
  const errors = latencyErrorCounts(source);
  if (errors.dropped > 0) {
    return "Inspect capture for loss, RX deficit, peer drops, or queue pressure on this PG ID.";
  }
  if (errors.dup > 0) {
    return "Inspect capture for duplicate packets and verify the peer generator or replay path.";
  }
  if (errors.outOfOrder > 0 || errors.seqToHigh > 0 || errors.seqToLow > 0) {
    return "Inspect capture for packet reordering, path asymmetry, or PG ID sequence mismatch.";
  }
  return "Inspect capture for loss, reorder, or duplicate packets on this PG ID.";
}

export function latencyErrorTotalAll(source: unknown) {
  return objectEntries(source)
    .filter(([scope]) => scope !== "global" && scope !== "total")
    .reduce((total, [, value]) => total + latencyErrorTotal(value), 0);
}

export function streamPacketCount(source: unknown, direction: "tx" | "rx") {
  return readOptionalNumber(source, direction === "tx"
    ? ["tx_pkts.total", "tx_pkts", "tx_packets", "tp", "opackets"]
    : ["rx_pkts.total", "rx_pkts", "rx_packets", "rp", "ipackets"]);
}

export function isMeaningfulPacketDeficit(txPackets: number | null, deficit: number) {
  if (deficit <= 0) {
    return false;
  }
  if (txPackets === null || txPackets <= 0) {
    return deficit >= 2;
  }
  return deficit >= Math.max(2, Math.ceil(txPackets * 0.001));
}

export function packetDeficitRatio(txPackets: number | null, deficit: number) {
  if (txPackets === null || txPackets <= 0 || deficit <= 0) {
    return null;
  }
  return (deficit / txPackets) * 100;
}

export function displayLoss(value: number | null) {
  return value === null ? "0%" : displayPercent(value);
}

export function isMeaningfulRateImbalance(txPps: number | null, rxPps: number | null) {
  if (txPps === null || rxPps === null || txPps <= 0 || rxPps < 0) {
    return false;
  }
  return Math.abs(txPps - rxPps) >= Math.max(1, txPps * 0.05);
}

export function streamHealthRows(
  statsData: TrexStatsSnapshot | null | undefined,
  selectedPgIds: string[]
): StreamHealthRow[] {
  const flowStats = statsData?.flow_stats;
  const latencyStats = statsData?.latency;
  return selectedPgIds.map((pgId) => {
    const flow = readPath(flowStats, [pgId]);
    const latency = readPath(latencyStats, [pgId]);
    const txPackets = streamPacketCount(flow, "tx");
    const rxPackets = streamPacketCount(flow, "rx");
    const deficit = txPackets !== null && rxPackets !== null ? Math.max(0, txPackets - rxPackets) : 0;
    const deficitRatio = packetDeficitRatio(txPackets, deficit);
    const deficitIssue = isMeaningfulPacketDeficit(txPackets, deficit);
    const latencyErrors = latencyErrorTotal(latency);
    const latencyBreakdown = latencyErrorBreakdown(latency);
    const latencyAction = latencyErrorAction(latency);
    const txPps = readOptionalNumber(flow, [
      "tx_pps.total",
      "tx_pps",
      "tx_pps_l1.total",
      "tx_pps_l1",
      "tx_rate_pps.total",
      "tx_rate_pps",
      "tx_rate"
    ]);
    const rxPps = readOptionalNumber(flow, [
      "rx_pps.total",
      "rx_pps",
      "rx_pps_l1.total",
      "rx_pps_l1",
      "rx_rate_pps.total",
      "rx_rate_pps",
      "rx_rate"
    ]);
    const avgLatency = readOptionalNumber(latency, [
      "lat.average",
      "lat.avg",
      "latency.average",
      "latency.avg",
      "average",
      "avg"
    ]);
    const maxLatency = readOptionalNumber(latency, [
      "lat.total_max",
      "lat.totalMax",
      "latency.total_max",
      "latency.totalMax",
      "total_max",
      "totalMax",
      "max_latency",
      "max"
    ]);
    const hasTraffic = [txPackets, rxPackets, txPps, rxPps].some((value) => (value ?? 0) > 0.001);
    const noteParts = [
      deficitIssue ? `RX deficit ${displayCount(deficit)}` : "",
      latencyErrors > 0 ? `Latency errors ${displayCount(latencyErrors)}` : "",
      maxLatency !== null ? `Max ${displayLatencyUs(maxLatency)}` : ""
    ].filter(Boolean);
    const level: StreamHealthLevel = latencyErrors > 0
      ? "critical"
      : deficitIssue
        ? "warning"
        : hasTraffic
          ? "ok"
          : "idle";
    const status = level === "critical"
      ? "Critical"
      : level === "warning"
        ? "Warning"
        : level === "ok"
          ? "OK"
          : "Idle";
    return {
      pgId,
      level,
      status,
      txPackets,
      rxPackets,
      deficit,
      deficitRatio,
      deficitIssue,
      txPps,
      rxPps,
      avgLatency,
      maxLatency,
      latencyErrors,
      latencyBreakdown,
      latencyAction,
      hasTraffic,
      note: noteParts.join("; ") || (hasTraffic ? "Balanced" : "No samples")
    };
  });
}

export function flowStatsIssues(statsData: TrexStatsSnapshot | null | undefined) {
  const issues: string[] = [];
  for (const row of streamHealthRows(statsData, statScopeIds(statsData?.flow_stats))) {
    if (row.deficitIssue) {
      issues.push(`PG ${row.pgId} rx deficit ${displayCount(row.deficit)}`);
    }
    if (issues.length >= flowIssueLimit) {
      break;
    }
  }
  return issues;
}

export function streamDiagnosticRows(
  streamRows: StreamHealthRow[],
  portRows: DashboardPortErrorRow[],
  statsData: TrexStatsSnapshot | null | undefined
): StreamDiagnosticRow[] {
  const rows: StreamDiagnosticRow[] = [];
  const dropBps = readOptionalNumber(statsData, ["global.rx_drop_bps", "global.drop_bps", "total.rx_drop_bps", "total.drop_bps"]) ?? 0;
  const queueFull = readOptionalNumber(statsData, ["global.queue_full", "global.queue_full_rate", "total.queue_full"]) ?? 0;
  const portErrors = portRows.reduce((total, row) => total + row.errors, 0);

  if (dropBps > 0) {
    rows.push({
      key: "global:drop",
      pgId: "Global",
      level: "critical",
      symptom: "Drop rate",
      evidence: displayBitRate(dropBps),
      action: "Reduce offered load or inspect NIC queue pressure before trusting latency results."
    });
  }
  if (queueFull > 0) {
    rows.push({
      key: "global:queue",
      pgId: "Global",
      level: "critical",
      symptom: "Queue full",
      evidence: displayCount(queueFull),
      action: "Lower multiplier, check port speed mapping, or move capture off the active datapath."
    });
  }
  if (portErrors > 0) {
    rows.push({
      key: "global:port-errors",
      pgId: "Global",
      level: "critical",
      symptom: "Port errors",
      evidence: displayCount(portErrors),
      action: "Open Hardware counters and check link/FCS/rx error counters on the affected port."
    });
  }

  for (const row of streamRows) {
    if (row.latencyErrors > 0) {
      rows.push({
        key: `${row.pgId}:latency-errors`,
        pgId: row.pgId,
        level: "critical",
        symptom: "Latency errors",
        evidence: [
          `${displayCount(row.latencyErrors)} errors`,
          row.latencyBreakdown,
          `avg ${displayLatencyUs(row.avgLatency)}`,
          `max ${displayLatencyUs(row.maxLatency)}`
        ].filter(Boolean).join("; "),
        action: row.latencyAction
      });
    }
    if (row.deficitIssue) {
      rows.push({
        key: `${row.pgId}:rx-deficit`,
        pgId: row.pgId,
        level: "warning",
        symptom: "RX deficit",
        evidence: `${displayCount(row.deficit)} missing; loss ${displayLoss(row.deficitRatio)}; Tx ${displayCount(row.txPackets)} / Rx ${displayCount(row.rxPackets)}`,
        action: "Check peer port RX, link direction, service-mode capture conflicts, and expected flow symmetry."
      });
    } else if (isMeaningfulRateImbalance(row.txPps, row.rxPps)) {
      rows.push({
        key: `${row.pgId}:rate-imbalance`,
        pgId: row.pgId,
        level: "warning",
        symptom: "Rate imbalance",
        evidence: `Tx ${displayPacketRate(row.txPps)} / Rx ${displayPacketRate(row.rxPps)}`,
        action: "Let counters settle, then verify RX path, filters, and port pairing for this PG ID."
      });
    } else if (row.hasTraffic) {
      rows.push({
        key: `${row.pgId}:balanced`,
        pgId: row.pgId,
        level: "ok",
        symptom: "Balanced",
        evidence: `Tx ${displayPacketRate(row.txPps)} / Rx ${displayPacketRate(row.rxPps)}; loss ${displayLoss(row.deficitRatio)}`,
        action: "No action required for this PG ID."
      });
    } else {
      rows.push({
        key: `${row.pgId}:idle`,
        pgId: row.pgId,
        level: "idle",
        symptom: "No samples",
        evidence: "No packet or rate counters",
        action: "Start a profile with RX Stats or latency enabled, or select an active PG ID."
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      key: "global:no-streams",
      pgId: "Global",
      level: "idle",
      symptom: "No stream stats",
      evidence: "No PG ID counters",
      action: "Enable RX Stats or latency in the stream before starting traffic."
    });
  }

  return rows.slice(0, 16);
}

export function latencyWindowValues(source: unknown) {
  const explicitWindow = readPath(source, [
    "lat.window",
    "lat.last_max_window",
    "latency.window",
    "latency.last_max_window",
    "window",
    "last_max_window"
  ]);
  const values = Array.isArray(explicitWindow)
    ? explicitWindow.map((value) => readOptionalNumber({ value }, ["value"]))
    : [
      readOptionalNumber(source, [
        "lat.last_max",
        "lat.lastMax",
        "latency.last_max",
        "latency.lastMax",
        "last_max",
        "lastMax"
      ])
    ];
  return Array.from({ length: latencyWindowSize }, (_, index) => values[index] ?? null);
}

export function latencyWindowRows(
  statsData: TrexStatsSnapshot | null | undefined,
  selectedPgIds: string[]
): LatencyWindowRow[] {
  const flowStats = statsData?.flow_stats;
  return selectedScopedEntries(statsData?.latency, selectedPgIds).map(([pgId, latency]) => {
    const flow = readPath(flowStats, [pgId]);
    return {
      pgId,
      txPackets: readOptionalNumber(flow, ["tx_pkts.total", "tx_pkts", "tx_packets", "tp", "opackets"]),
      rxPackets: readOptionalNumber(flow, ["rx_pkts.total", "rx_pkts", "rx_packets", "rp", "ipackets"]),
      maxLatency: readOptionalNumber(latency, [
        "lat.total_max",
        "lat.totalMax",
        "latency.total_max",
        "latency.totalMax",
        "total_max",
        "totalMax",
        "max_latency",
        "max"
      ]),
      avgLatency: readOptionalNumber(latency, [
        "lat.average",
        "lat.avg",
        "latency.average",
        "latency.avg",
        "average",
        "avg"
      ]),
      lastValues: latencyWindowValues(latency),
      jitter: readOptionalNumber(latency, [
        "lat.jit",
        "lat.jitter",
        "latency.jit",
        "latency.jitter",
        "jit",
        "jitter"
      ]),
      errors: latencyErrorTotal(latency)
    };
  });
}

export function latencyHistogramRows(statsData: TrexStatsSnapshot | null | undefined, selectedPgIds: string[]) {
  return selectedScopedEntries(statsData?.latency, selectedPgIds)
    .map(([pgId, latency]) => ({
      pgId,
      buckets: readHistogramBuckets(latency),
      ...latencyErrorCounts(latency)
    }))
    .filter((row) => Object.keys(row.buckets).length > 0 || row.dropped || row.dup || row.outOfOrder || row.seqToHigh || row.seqToLow);
}

export function histogramBucketNumber(bucket: string) {
  const matched = bucket.match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : Number.NaN;
}

export function latencyHistogramColumns(rows: LatencyHistogramRow[]) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row.buckets)))];
  return columns
    .sort((left, right) => {
      const leftNumber = histogramBucketNumber(left);
      const rightNumber = histogramBucketNumber(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right, undefined, { numeric: true });
    })
    .slice(0, latencyHistogramSize);
}
