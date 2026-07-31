import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { TrexPortRecord, TrexResult, TrexStatsSnapshot } from "../../api";
import {
  displayLoss,
  flowStatsIssues,
  latencyErrorTotalAll,
  latencyHistogramColumns,
  latencyHistogramRows,
  latencyWindowSize,
  latencyWindowRows,
  streamDiagnosticRows,
  streamHealthRows,
  type StreamHealthLevel
} from "./dashboardLatencyModel";
import {
  filterScopedStats,
  flattenScopedStats,
  metricNumber,
  metricText,
  objectEntries,
  readNumber,
  readOptionalNumber,
  readPath,
  statScopeIds
} from "./dashboardStatsModel";
import {
  displayBitRate,
  displayCount,
  displayLatencyUs,
  displayPacketRate,
  displayPercent
} from "./format";
import { trexResultDiagnostic } from "./trexDiagnostics";
import type { StatsHistorySample } from "./types";

type DashboardTab = "Ports" | "Streams" | "Latency" | "Charts" | "Utilization";
type PortFilterMode = "All" | "My";
type LatencyMode = "Window" | "Histogram";

type DashboardWorkspaceProps = {
  isStatsLoading: boolean;
  portRecords: TrexPortRecord[];
  startResult: TrexResult<unknown> | null;
  statsHistory: StatsHistorySample[];
  statsResult: TrexResult<TrexStatsSnapshot> | null;
  onClearStats: () => void;
};

type PortStatRow = {
  scope: string;
  txPps: number;
  rxPps: number;
  txBps: number;
  rxBps: number;
  txUtil: number;
  rxUtil: number;
  opackets: number;
  ipackets: number;
  errors: number;
};

type TrendDiagnosticRow = {
  key: string;
  level: StreamHealthLevel;
  metric: string;
  evidence: string;
  action: string;
};

type DashboardPanel = {
  metric: string;
  title: string;
  value: string;
};

type HealthLevel = "blocked" | "critical" | "warning" | "healthy" | "idle";

type DashboardHealth = {
  level: HealthLevel;
  title: string;
  summary: string;
  details: string[];
};

const tabs: DashboardTab[] = ["Ports", "Streams", "Latency", "Charts", "Utilization"];
const latencyModes: LatencyMode[] = ["Window", "Histogram"];
const chartFallbackSampleSeconds = 1;
const trendWindowSampleLimit = 60;

function dashboardTabId(tab: DashboardTab) {
  return `dashboard-tab-${tab.toLowerCase()}`;
}

function dashboardTabPanelId(tab: DashboardTab) {
  return `dashboard-panel-${tab.toLowerCase()}`;
}

function latencyModeId(mode: LatencyMode) {
  return `dashboard-latency-mode-${mode.toLowerCase()}`;
}

function rovingIndexForKey(key: string, currentIndex: number, itemCount: number) {
  if (key === "ArrowRight") {
    return (currentIndex + 1) % itemCount;
  }
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + itemCount) % itemCount;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return itemCount - 1;
  }
  return null;
}

function DashboardMetricGroup({
  label,
  panels,
  summary,
  variant
}: {
  label: string;
  panels: DashboardPanel[];
  summary: string | null;
  variant: "traffic" | "health";
}) {
  const headingId = `dashboard-kpi-heading-${variant}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`dashboard-kpi-group dashboard-kpi-group--${variant}`}
    >
      <header className="dashboard-kpi-group-header">
        <h2 id={headingId}>{label}</h2>
        {summary ? <span>{summary}</span> : null}
      </header>
      <div className={`global-stats-grid global-stats-grid--${variant}`}>
        {panels.map((panel) => (
          <div
            className={`global-stat-panel global-stat-panel--${panel.metric}`}
            key={panel.title}
          >
            <strong>{panel.value}</strong>
            <span>{panel.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function totalStatsCounter(statsData: TrexStatsSnapshot | null | undefined, name: string) {
  const explicit = readOptionalNumber(statsData?.total, [name]);
  if (explicit !== null) {
    return explicit;
  }
  const global = readOptionalNumber(statsData?.global, [name]);
  return global ?? 0;
}

function packetMismatchIssue(statsData: TrexStatsSnapshot | null | undefined) {
  const total = statsData?.total;
  if (!total || typeof total !== "object" || Array.isArray(total)) {
    return null;
  }
  const txPackets = readOptionalNumber(total, ["opackets"]);
  const rxPackets = readOptionalNumber(total, ["ipackets"]);
  if (txPackets === null || rxPackets === null || txPackets === 0 || rxPackets === 0 || txPackets === rxPackets) {
    return null;
  }
  return `Total packet delta ${displayCount(Math.abs(txPackets - rxPackets))}`;
}

function trendWindow(statsHistory: StatsHistorySample[]) {
  return statsHistory.slice(-trendWindowSampleLimit);
}

function trendDurationText(first: StatsHistorySample, last: StatsHistorySample) {
  const seconds = Math.max(0, Math.round((last.timestamp - first.timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function meaningfulIncrease(first: number, last: number, minimumDelta: number, ratio = 1.25) {
  if (last <= first) {
    return false;
  }
  return last - first >= minimumDelta && (first <= 0 || last >= first * ratio);
}

function historyTrendDiagnosticRows(statsHistory: StatsHistorySample[]): TrendDiagnosticRow[] {
  const samples = trendWindow(statsHistory);
  if (samples.length < 2) {
    return [
      {
        key: "history:warmup",
        level: "idle",
        metric: "History window",
        evidence: `${displayCount(samples.length)} samples`,
        action: "Keep Dashboard open while traffic runs to build trend evidence."
      }
    ];
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const duration = trendDurationText(first, last);
  const rows: TrendDiagnosticRow[] = [];
  const firstDropBps = first.dropBps ?? 0;
  const lastDropBps = last.dropBps ?? 0;
  if (lastDropBps > 0 && meaningfulIncrease(firstDropBps, lastDropBps, 1, 1.1)) {
    rows.push({
      key: "trend:drop",
      level: "critical",
      metric: "Drop trend",
      evidence: `${displayBitRate(firstDropBps)} -> ${displayBitRate(lastDropBps)} over ${duration}`,
      action: "Stop the run or lower multiplier; sustained drop trend invalidates latency and throughput conclusions."
    });
  } else if (lastDropBps > 0) {
    rows.push({
      key: "trend:drop-present",
      level: "critical",
      metric: "Drop present",
      evidence: `${displayBitRate(lastDropBps)} at latest sample`,
      action: "Investigate offered load, peer RX, or NIC queue pressure before accepting the run."
    });
  }

  if (last.queueFull > 0 && meaningfulIncrease(first.queueFull, last.queueFull, 1, 1.1)) {
    rows.push({
      key: "trend:queue",
      level: "critical",
      metric: "Queue pressure rising",
      evidence: `${displayCount(first.queueFull)} -> ${displayCount(last.queueFull)} over ${duration}`,
      action: "Reduce traffic rate, disable heavy capture, or inspect TX/RX queue sizing."
    });
  }

  if (
    last.latencyAvg > 0
    && first.latencyAvg > 0
    && meaningfulIncrease(first.latencyAvg, last.latencyAvg, Math.max(5, first.latencyAvg * 0.2), 1.2)
  ) {
    rows.push({
      key: "trend:latency",
      level: "warning",
      metric: "Latency avg rising",
      evidence: `${displayLatencyUs(first.latencyAvg)} -> ${displayLatencyUs(last.latencyAvg)} over ${duration}`,
      action: "Correlate with drops, queue-full, capture activity, and peer-port utilization."
    });
  }

  const firstRateGap = Math.max(0, first.txPps - first.rxPps);
  const lastRateGap = Math.max(0, last.txPps - last.rxPps);
  if (last.txPps > 0 && lastRateGap >= Math.max(1, last.txPps * 0.05) && meaningfulIncrease(firstRateGap, lastRateGap, 1, 1.2)) {
    rows.push({
      key: "trend:rx-rate-gap",
      level: "warning",
      metric: "RX rate gap widening",
      evidence: `${displayPacketRate(firstRateGap)} -> ${displayPacketRate(lastRateGap)} gap over ${duration}`,
      action: "Check port pairing, RX stats PG ID, filters, and expected unidirectional traffic shape."
    });
  }

  if (rows.length === 0) {
    rows.push({
      key: "history:stable",
      level: "ok",
      metric: "Trend stable",
      evidence: `${displayCount(samples.length)} samples over ${duration}`,
      action: "No trend anomaly detected in the current Dashboard history window."
    });
  }

  return rows.slice(0, 8);
}

function historyTrendIssues(statsHistory: StatsHistorySample[]) {
  return historyTrendDiagnosticRows(statsHistory)
    .filter((row) => row.level === "critical" || row.level === "warning")
    .map((row) => `${row.metric}: ${row.evidence}`)
    .slice(0, 3);
}

function dashboardHealth(
  startResult: TrexResult<unknown> | null,
  statsResult: TrexResult<TrexStatsSnapshot> | null,
  statsData: TrexStatsSnapshot | null | undefined,
  statsHistory: StatsHistorySample[],
  activePorts: number,
  availablePgIds: string[],
  rows: PortStatRow[]
): DashboardHealth {
  if (startResult && !startResult.ok) {
    const diagnostic = trexResultDiagnostic(startResult);
    return {
      level: "blocked",
      title: "Blocked",
      summary: diagnostic?.summary ?? startResult.error ?? startResult.blocker ?? "Traffic start blocked",
      details: [
        diagnostic?.summary ?? "",
        diagnostic?.action ?? "",
        startResult.blocker ?? "traffic start blocked"
      ].filter(Boolean)
    };
  }
  if (statsResult && !statsResult.ok) {
    const summary = statsResult.error ?? statsResult.blocker ?? "Stats unavailable";
    return {
      level: "blocked",
      title: "Blocked",
      summary,
      details: [summary, statsResult.blocker ?? "stats blocked"].filter(Boolean)
    };
  }
  if (!statsData) {
    return {
      level: "idle",
      title: "No samples",
      summary: "Waiting for TRex stats",
      details: ["No stats payload"]
    };
  }

  const txPps = totalStatsCounter(statsData, "tx_pps");
  const rxPps = totalStatsCounter(statsData, "rx_pps");
  const txBps = totalStatsCounter(statsData, "tx_bps");
  const rxBps = totalStatsCounter(statsData, "rx_bps");
  const dropBps = readOptionalNumber(statsData, ["global.rx_drop_bps", "global.drop_bps", "total.rx_drop_bps", "total.drop_bps"]) ?? 0;
  const queueFull = readOptionalNumber(statsData, ["global.queue_full", "global.queue_full_rate", "total.queue_full"]) ?? 0;
  const portErrors = rows.reduce((total, row) => total + row.errors, 0);
  const latencyErrors = latencyErrorTotalAll(statsData.latency);
  const flowIssues = flowStatsIssues(statsData);
  const mismatchIssue = packetMismatchIssue(statsData);
  const trendIssues = historyTrendIssues(statsHistory);
  const running = activePorts > 0 || txPps > 0.001 || rxPps > 0.001 || txBps > 0.001 || rxBps > 0.001;
  const details = [
    `Tx ${displayPacketRate(txPps)} / Rx ${displayPacketRate(rxPps)}`,
    `Ports ${displayCount(activePorts)} active`,
    `PG IDs ${displayCount(availablePgIds.length)}`,
    `Drops ${displayBitRate(dropBps)}`,
    `Queue ${displayCount(queueFull)}`
  ];
  const critical = [
    dropBps > 0 ? `Drop rate ${displayBitRate(dropBps)}` : "",
    queueFull > 0 ? `Queue full ${displayCount(queueFull)}` : "",
    portErrors > 0 ? `Port errors ${displayCount(portErrors)}` : "",
    latencyErrors > 0 ? `Latency errors ${displayCount(latencyErrors)}` : ""
  ].filter(Boolean);
  const warnings = [
    mismatchIssue ?? "",
    ...flowIssues,
    ...trendIssues
  ].filter(Boolean);

  if (critical.length > 0) {
    return {
      level: "critical",
      title: "Critical",
      summary: critical[0],
      details: [...critical, ...warnings, ...details].slice(0, 8)
    };
  }
  if (warnings.length > 0) {
    return {
      level: "warning",
      title: running ? "Warning" : "Idle warning",
      summary: warnings[0],
      details: [...warnings, ...details].slice(0, 8)
    };
  }
  if (!running) {
    return {
      level: "idle",
      title: "Idle",
      summary: "No active traffic",
      details
    };
  }
  return {
    level: "healthy",
    title: "Running",
    summary: txPps > 0.001 || rxPps > 0.001 || txBps > 0.001 || rxBps > 0.001 ? "Traffic is balanced" : "Port status active",
    details
  };
}

function displayMaybeNumber(value: number | null) {
  return displayCount(value);
}

function displayLatency(value: number | null) {
  return displayLatencyUs(value);
}

function portStatRows(statsData: TrexStatsSnapshot | null | undefined): PortStatRow[] {
  return objectEntries(statsData)
    .filter(([scope]) => /^\d+$/.test(scope))
    .map(([scope, value]) => {
      const oerrors = readNumber(value, ["oerrors"]);
      const ierrors = readNumber(value, ["ierrors"]);
      return {
        scope,
        txPps: readNumber(value, ["tx_pps"]),
        rxPps: readNumber(value, ["rx_pps"]),
        txBps: readNumber(value, ["tx_bps", "tx_bps_L1"]),
        rxBps: readNumber(value, ["rx_bps", "rx_bps_L1"]),
        txUtil: readNumber(value, ["tx_util"]),
        rxUtil: readNumber(value, ["rx_util"]),
        opackets: readNumber(value, ["opackets"]),
        ipackets: readNumber(value, ["ipackets"]),
        errors: oerrors + ierrors
      };
    });
}

function isTrafficPortRow(row: PortStatRow | undefined) {
  if (!row) {
    return false;
  }
  return row.txPps > 0.001 || row.rxPps > 0.001 || row.txBps > 0.001 || row.rxBps > 0.001;
}

function isActiveStatus(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toUpperCase();
  return normalized !== "" && normalized !== "IDLE" && normalized !== "DOWN";
}

function activePortCount(portRecords: TrexPortRecord[], rows: PortStatRow[]) {
  const rowsByPort = new Map(rows.map((row) => [Number(row.scope), row]));
  const activeIds = new Set<number>();
  for (const port of portRecords) {
    if (isActiveStatus(readPath(port.info, ["status"])) || isTrafficPortRow(rowsByPort.get(port.id))) {
      activeIds.add(port.id);
    }
  }
  for (const row of rows) {
    const portId = Number(row.scope);
    if (Number.isFinite(portId) && isTrafficPortRow(row)) {
      activeIds.add(portId);
    }
  }
  return activeIds.size;
}

function maxValue(values: number[]) {
  const max = Math.max(...values, 0);
  return max > 0 ? max : 1;
}

function sparklinePoints(values: number[], max = maxValue(values)) {
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 100 - (value / max) * 86 - 7;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({
  formatValue,
  label,
  metric,
  samples
}: {
  formatValue: (value: number) => string;
  label: string;
  metric: keyof StatsHistorySample;
  samples: StatsHistorySample[];
}) {
  const values = samples.map((sample) => Number(sample[metric]) || 0);
  const points = sparklinePoints(values);
  const latest = values.length > 0 ? values[values.length - 1] : 0;

  return (
    <div className="dashboard-chart-panel">
      <div>
        <strong>{formatValue(latest)}</strong>
        <span>{label}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline points={points || "0,93 100,93"} />
      </svg>
    </div>
  );
}

function L2RateSparkline({ samples }: { samples: StatsHistorySample[] }) {
  const txValues = samples.map((sample) => Number(sample.txBps) || 0);
  const rxValues = samples.map((sample) => Number(sample.rxBps) || 0);
  const scaleMax = maxValue([...txValues, ...rxValues]);
  const txLatest = txValues.length > 0 ? txValues[txValues.length - 1] : 0;
  const rxLatest = rxValues.length > 0 ? rxValues[rxValues.length - 1] : 0;
  const txLatestText = displayBitRate(txLatest);
  const rxLatestText = displayBitRate(rxLatest);

  return (
    <div className="dashboard-chart-panel dashboard-chart-panel--dual">
      <div>
        <strong>{txLatestText} / {rxLatestText}</strong>
        <span>Tx / Rx L2</span>
      </div>
      <div className="dashboard-dual-chart-plot">
        <svg
          aria-label={`Tx / Rx L2 trend; Tx latest ${txLatestText}; Rx latest ${rxLatestText}`}
          preserveAspectRatio="none"
          role="img"
          viewBox="0 0 100 100"
        >
          <polyline
            className="dashboard-chart-line dashboard-chart-line--tx"
            points={sparklinePoints(txValues, scaleMax) || "0,93 100,93"}
          />
          <polyline
            className="dashboard-chart-line dashboard-chart-line--rx"
            points={sparklinePoints(rxValues, scaleMax) || "0,93 100,93"}
          />
        </svg>
        <div aria-hidden="true" className="dashboard-chart-legend">
          <span><i className="dashboard-chart-key dashboard-chart-key--tx" />Tx</span>
          <span><i className="dashboard-chart-key dashboard-chart-key--rx" />Rx</span>
        </div>
      </div>
    </div>
  );
}

function PortBars({
  formatValue,
  rows,
  scaleMax,
  metric,
  title
}: {
  formatValue: (value: number) => string;
  rows: PortStatRow[];
  scaleMax?: number;
  metric: keyof PortStatRow;
  title: string;
}) {
  const values = rows.map((row) => Number(row[metric]) || 0);
  const max = scaleMax ?? maxValue(values);
  return (
    <div className="dashboard-chart-panel dashboard-bar-panel">
      <div>
        <strong>{title}</strong>
        <span>{rows.length} ports</span>
      </div>
      <div className="dashboard-bars">
        {rows.map((row) => {
          const value = Number(row[metric]) || 0;
          const width = Math.max(0, Math.min(100, (value / max) * 100));
          return (
            <div className="dashboard-bar-row" key={`${row.scope}:${String(metric)}`}>
              <span>{row.scope}</span>
              <div><i style={{ width: `${width}%` }} /></div>
              <strong>{formatValue(value)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardPortSelector({
  availablePorts,
  filterMode,
  selectedPortIds,
  onFilterModeChange,
  onSelectedPortIdsChange
}: {
  availablePorts: TrexPortRecord[];
  filterMode: PortFilterMode;
  selectedPortIds: number[];
  onFilterModeChange: (mode: PortFilterMode) => void;
  onSelectedPortIdsChange: (ports: number[]) => void;
}) {
  const selected = new Set(selectedPortIds);

  return (
    <aside className="dashboard-filter-panel" aria-label="Ports">
      <div className="dashboard-filter-head">
        <label>
          Ports:
          <select
            aria-label="Ports filter"
            onChange={(event) => onFilterModeChange(event.target.value as PortFilterMode)}
            value={filterMode}
          >
            <option value="All">All</option>
            <option value="My">My</option>
          </select>
        </label>
      </div>
      <div className="dashboard-filter-list">
        {availablePorts.length > 0 ? availablePorts.map((port) => (
          <label className="dashboard-check-row" key={port.id}>
            <input
              checked={selected.has(port.id)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selectedPortIds, port.id]
                  : selectedPortIds.filter((id) => id !== port.id);
                onSelectedPortIdsChange([...new Set(next)].sort((left, right) => left - right));
              }}
              type="checkbox"
            />
            <span>Port {port.id}</span>
          </label>
        )) : (
          <span className="dashboard-filter-empty">No ports</span>
        )}
      </div>
    </aside>
  );
}

function DashboardStreamsSelector({
  availablePgIds,
  selectedPgIds,
  onSelectedPgIdsChange
}: {
  availablePgIds: string[];
  selectedPgIds: string[];
  onSelectedPgIdsChange: (pgIds: string[]) => void;
}) {
  const selected = new Set(selectedPgIds);
  const unselectedPgIds = availablePgIds.filter((pgId) => !selected.has(pgId));

  if (availablePgIds.length === 0) {
    return (
      <aside className="dashboard-stream-selector dashboard-stream-selector--empty" aria-label="PG IDs">
        <div className="dashboard-filter-head">PG IDs</div>
        <div className="dashboard-filter-list">
          <span className="dashboard-filter-empty">No PG ID samples</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="dashboard-stream-selector" aria-label="PG IDs">
      <div className="dashboard-stream-box">
        <div className="dashboard-filter-head">Selected PG IDs (Max 8)</div>
        <div className="dashboard-filter-list">
          {selectedPgIds.length > 0 ? selectedPgIds.map((pgId) => (
            <div className="dashboard-pgid-row" key={pgId}>
              <span>PG ID {pgId}</span>
              <button
                aria-label={`Remove PG ID ${pgId}`}
                onClick={() => onSelectedPgIdsChange(selectedPgIds.filter((id) => id !== pgId))}
                type="button"
              >
                x
              </button>
            </div>
          )) : (
            <span className="dashboard-filter-empty">No selected PG IDs</span>
          )}
        </div>
      </div>
      <div className="dashboard-stream-box">
        <div className="dashboard-filter-head">Unselected PG IDs</div>
        <div className="dashboard-filter-list">
          {unselectedPgIds.length > 0 ? unselectedPgIds.map((pgId) => (
            <div className="dashboard-pgid-row" key={pgId}>
              <span>PG ID {pgId}</span>
              <button
                aria-label={`Add PG ID ${pgId}`}
                disabled={selectedPgIds.length >= 8}
                onClick={() => onSelectedPgIdsChange([...selectedPgIds, pgId].slice(0, 8))}
                type="button"
              >
                +
              </button>
            </div>
          )) : (
            <span className="dashboard-filter-empty">No PG IDs</span>
          )}
        </div>
      </div>
    </aside>
  );
}

export function DashboardWorkspace({
  isStatsLoading,
  portRecords,
  startResult,
  statsHistory,
  statsResult,
  onClearStats
}: DashboardWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("Ports");
  const [portFilterMode, setPortFilterMode] = useState<PortFilterMode>("All");
  const [selectedPortIdsOverride, setSelectedPortIdsOverride] = useState<number[] | null>(null);
  const [selectedPgIdsOverride, setSelectedPgIdsOverride] = useState<string[] | null>(null);
  const [chartInterval, setChartInterval] = useState(60);
  const [latencyMode, setLatencyMode] = useState<LatencyMode>("Window");
  const dashboardTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const latencyModeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const statsData = statsResult?.data;
  const portRows = useMemo(() => portStatRows(statsData), [statsData]);
  const activePorts = useMemo(() => activePortCount(portRecords, portRows), [portRecords, portRows]);
  const availablePorts = useMemo(
    () => portRecords.filter((port) => portFilterMode === "All" || port.acquired),
    [portFilterMode, portRecords]
  );
  const selectedPortIds = useMemo(() => {
    const availableIds = availablePorts.map((port) => port.id);
    if (selectedPortIdsOverride === null) {
      return availableIds;
    }
    return selectedPortIdsOverride.filter((portId) => availableIds.includes(portId));
  }, [availablePorts, selectedPortIdsOverride]);
  const visiblePortRows = useMemo(
    () => portRows.filter((row) => selectedPortIds.includes(Number(row.scope))),
    [portRows, selectedPortIds]
  );
  const availablePgIds = useMemo(
    () => [...new Set([...statScopeIds(statsData?.flow_stats), ...statScopeIds(statsData?.latency)])],
    [statsData]
  );
  const availableLatencyPgIds = useMemo(
    () => statScopeIds(statsData?.latency),
    [statsData]
  );
  const health = useMemo(
    () => dashboardHealth(startResult, statsResult, statsData, statsHistory, activePorts, availablePgIds, portRows),
    [activePorts, availablePgIds, portRows, startResult, statsData, statsHistory, statsResult]
  );
  const selectedPgIds = useMemo(() => {
    if (selectedPgIdsOverride === null) {
      return availablePgIds.slice(0, 8);
    }
    return selectedPgIdsOverride.filter((pgId) => availablePgIds.includes(pgId)).slice(0, 8);
  }, [availablePgIds, selectedPgIdsOverride]);
  const streamRows = useMemo(
    () => flattenScopedStats(filterScopedStats(statsData?.flow_stats, selectedPgIds), "flow_stats"),
    [selectedPgIds, statsData]
  );
  const streamHealthTableRows = useMemo(
    () => streamHealthRows(statsData, selectedPgIds),
    [selectedPgIds, statsData]
  );
  const streamDiagnosticTableRows = useMemo(
    () => streamDiagnosticRows(streamHealthTableRows, portRows, statsData),
    [portRows, statsData, streamHealthTableRows]
  );
  const trendDiagnosticTableRows = useMemo(
    () => historyTrendDiagnosticRows(statsHistory),
    [statsHistory]
  );
  const latencyWindowTableRows = useMemo(
    () => latencyWindowRows(statsData, selectedPgIds),
    [selectedPgIds, statsData]
  );
  const latencyHistogramTableRows = useMemo(
    () => latencyHistogramRows(statsData, selectedPgIds),
    [selectedPgIds, statsData]
  );
  const latencyHistogramTableColumns = useMemo(
    () => latencyHistogramColumns(latencyHistogramTableRows),
    [latencyHistogramTableRows]
  );
  const chartSamples = useMemo(() => {
    const latestTimestamp = statsHistory.length > 0 ? statsHistory[statsHistory.length - 1].timestamp : 0;
    const since = latestTimestamp - chartInterval * 1000;
    const samples = statsHistory.filter((sample) => sample.timestamp >= since);
    return samples.length > 0
      ? samples
      : statsHistory.slice(-Math.max(1, Math.ceil(chartInterval / chartFallbackSampleSeconds)));
  }, [chartInterval, statsHistory]);

  const handleDashboardTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = rovingIndexForKey(event.key, currentIndex, tabs.length);
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    setActiveTab(tabs[nextIndex]);
    dashboardTabRefs.current[nextIndex]?.focus();
  };

  const handleLatencyModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = rovingIndexForKey(event.key, currentIndex, latencyModes.length);
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    setLatencyMode(latencyModes[nextIndex]);
    latencyModeRefs.current[nextIndex]?.focus();
  };

  const portSelector = (
    <DashboardPortSelector
      availablePorts={availablePorts}
      filterMode={portFilterMode}
      onFilterModeChange={(mode) => {
        setPortFilterMode(mode);
        setSelectedPortIdsOverride(null);
      }}
      onSelectedPortIdsChange={setSelectedPortIdsOverride}
      selectedPortIds={selectedPortIds}
    />
  );
  const streamsSelector = (
    <DashboardStreamsSelector
      availablePgIds={availablePgIds}
      onSelectedPgIdsChange={setSelectedPgIdsOverride}
      selectedPgIds={selectedPgIds}
    />
  );
  const trafficPanels: DashboardPanel[] = [
    {
      metric: "tx-l2",
      title: "Total Tx L2",
      value: metricText(statsData, ["global.tx_bps_L2", "global.tx_bps_l2", "global.tx_bps", "total.tx_bps"], displayBitRate)
    },
    {
      metric: "rx-l2",
      title: "Total Rx L2",
      value: metricText(statsData, ["global.rx_bps_L2", "global.rx_bps_l2", "global.rx_bps", "total.rx_bps"], displayBitRate)
    },
    {
      metric: "tx-l1",
      title: "Total Tx L1",
      value: metricText(statsData, ["global.tx_bps_L1", "global.tx_bps_l1", "total.tx_bps_L1", "total.tx_bps_l1"], displayBitRate)
    },
    {
      metric: "total-pps",
      title: "Total PPS",
      value: metricText(statsData, ["global.tx_pps", "global.total_pps", "total.tx_pps"], displayPacketRate)
    },
    {
      metric: "streams",
      title: "Total Stream",
      value: metricNumber(statsData, ["global.total_streams", "global.active_streams"]) !== null
        ? metricText(statsData, ["global.total_streams", "global.active_streams"], displayCount)
        : statsData ? displayCount(availablePgIds.length) : "-"
    },
    {
      metric: "active-ports",
      title: "Active Ports",
      value: portRecords.length > 0 || portRows.length > 0 ? displayCount(activePorts) : "-"
    }
  ];
  const healthPanels: DashboardPanel[] = [
    {
      metric: "drop-rate",
      title: "Drop Rate",
      value: metricText(statsData, ["global.rx_drop_bps", "global.drop_bps", "global.drop_rate", "total.rx_drop_bps"], displayBitRate)
    },
    {
      metric: "queue-full",
      title: "Queue Full",
      value: metricText(statsData, ["global.queue_full", "global.queue_full_rate"], displayCount)
    },
    {
      metric: "cpu",
      title: "CPU",
      value: metricText(statsData, ["global.cpu_util", "global.cpu", "cpu"], displayPercent)
    },
    {
      metric: "rx-cpu",
      title: "Rx CPU",
      value: metricText(statsData, ["global.rx_cpu_util", "global.rx_cpu"], displayPercent)
    }
  ];
  const dashboardWarning = health.level === "blocked"
    ? ""
    : isStatsLoading
      ? "Loading…"
      : statsResult?.ok
        ? ""
        : `${statsResult?.blocker ?? ""} ${statsResult?.error ?? ""}`.trim();
  const blockedRows = [
    {
      item: "RPC response",
      state: "Blocked",
      evidence: statsResult?.error ?? health.summary
    },
    {
      item: "Backend blocker",
      state: statsResult?.blocker ?? "-",
      evidence: statsResult?.ok === false ? "Stats request did not return a sample" : "Stats sampler is not ready"
    },
    {
      item: "Samples loaded",
      state: `${statsHistory.length} history`,
      evidence: `${portRows.length} port rows, ${availablePgIds.length} PG IDs`
    },
    {
      item: "Recovery",
      state: "Waiting",
      evidence: "Stats sampling resumes when TRex RPC responds"
    }
  ];
  const dialogClassName = [
    "dashboard-dialog",
    `dashboard-dialog--${activeTab.toLowerCase()}`,
    health.level === "blocked" ? "dashboard-dialog--blocked" : ""
  ].filter(Boolean).join(" ");
  const visibleHealthDetails = health.level === "blocked"
    ? health.details
    : health.details.filter((detail) => detail !== health.summary);

  return (
    <section className={dialogClassName} aria-label="Dashboard workspace">
      <div
        aria-label="Run health"
        className={`dashboard-health-strip dashboard-health-strip--priority dashboard-health-strip--${health.level}`}
      >
        <div
          aria-atomic="true"
          aria-label={health.level === "blocked" ? `Blocked: ${health.summary}` : undefined}
          className="dashboard-health-verdict"
          role="status"
        >
          <strong>{health.title}</strong>
          {health.level !== "blocked" ? <span>{health.summary}</span> : null}
        </div>
        <div className="dashboard-health-details">
          {visibleHealthDetails.map((detail) => (
            <span key={detail} title={detail}>{detail}</span>
          ))}
        </div>
      </div>

      <div className="dashboard-kpi-overview" aria-label="Dashboard metrics">
        <DashboardMetricGroup
          label="Traffic"
          panels={trafficPanels}
          summary="Throughput & activity"
          variant="traffic"
        />
        <DashboardMetricGroup
          label="Health & Latency"
          panels={healthPanels}
          summary={statsData ? `${displayCount(latencyErrorTotalAll(statsData.latency))} latency errors` : null}
          variant="health"
        />
      </div>

      <div className="dashboard-tab-shell">
        <div className="dashboard-tabs" role="group" aria-label="Dashboard controls">
          <div className="dashboard-tab-list" role="tablist" aria-label="Dashboard tabs">
            {tabs.map((tab, index) => (
              <button
                aria-controls={dashboardTabPanelId(tab)}
                aria-selected={tab === activeTab}
                className={`dashboard-tab ${tab === activeTab ? "dashboard-tab--active" : ""}`}
                id={dashboardTabId(tab)}
                key={tab}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => handleDashboardTabKeyDown(event, index)}
                ref={(node) => {
                  dashboardTabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={tab === activeTab ? 0 : -1}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
          <span aria-live="polite" className="dashboard-warning" role="status">
            {dashboardWarning}
          </span>
          <button className="clear-button" disabled={isStatsLoading} onClick={onClearStats} type="button">
            Clear
          </button>
        </div>

        {tabs.filter((tab) => tab !== activeTab).map((tab) => (
          <div
            aria-labelledby={dashboardTabId(tab)}
            hidden
            id={dashboardTabPanelId(tab)}
            key={tab}
            role="tabpanel"
          />
        ))}
        <div
          aria-labelledby={dashboardTabId(activeTab)}
          className="dashboard-tab-panel"
          id={dashboardTabPanelId(activeTab)}
          role="tabpanel"
          tabIndex={0}
        >
        {health.level === "blocked" ? (
          <div className="dashboard-blocked-pane">
            <div className="dashboard-table-wrap dashboard-blocked-table-wrap">
              <table className="dashboard-blocked-table" aria-label="Dashboard blocked diagnostics">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>State</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedRows.map((row) => (
                    <tr key={row.item}>
                      <td>{row.item}</td>
                      <td>{row.state}</td>
                      <td title={row.evidence}>{row.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : !statsData ? (
          <div className="dashboard-empty-state" role="status">
            <strong>No stats sample</strong>
            <span>Waiting for TRex stats to populate the Dashboard.</span>
          </div>
        ) : activeTab === "Ports" ? (
          <div className="dashboard-split-pane">
            {portSelector}
            <div className="dashboard-table-wrap dashboard-port-table-wrap">
              <table className="dashboard-port-table">
                <thead>
                  <tr>
                    <th>Port</th>
                    <th>Tx PPS</th>
                    <th>Rx PPS</th>
                    <th>Tx bps</th>
                    <th>Rx bps</th>
                    <th>Tx util</th>
                    <th>Rx util</th>
                    <th>Tx packets</th>
                    <th>Rx packets</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePortRows.length > 0 ? visiblePortRows.map((row) => (
                    <tr key={row.scope}>
                      <td>{row.scope}</td>
                      <td>{displayPacketRate(row.txPps)}</td>
                      <td>{displayPacketRate(row.rxPps)}</td>
                      <td>{displayBitRate(row.txBps)}</td>
                      <td>{displayBitRate(row.rxBps)}</td>
                      <td>{displayPercent(row.txUtil)}</td>
                      <td>{displayPercent(row.rxUtil)}</td>
                      <td>{displayCount(row.opackets)}</td>
                      <td>{displayCount(row.ipackets)}</td>
                      <td>{displayCount(row.errors)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10}>No port samples loaded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "Streams" && availablePgIds.length === 0 ? (
          <div className="dashboard-empty-state" role="status">
            <strong>No stream samples</strong>
            <span>Run a profile with flow stats enabled to populate PG health and diagnostics.</span>
          </div>
        ) : activeTab === "Streams" ? (
          <div className="dashboard-split-pane">
            {streamsSelector}
            <div className="dashboard-stream-pane">
              <div className="dashboard-table-wrap">
                <table aria-label="Stream health">
                  <thead>
                    <tr>
                      <th>PG ID</th>
                      <th>Status</th>
                      <th>Tx pkt</th>
                      <th>Rx pkt</th>
                      <th>Deficit</th>
                      <th>Loss</th>
                      <th>Tx PPS</th>
                      <th>Rx PPS</th>
                      <th>Avg Latency</th>
                      <th>Errors</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamHealthTableRows.length > 0 ? streamHealthTableRows.map((row) => (
                      <tr key={row.pgId}>
                        <td>{row.pgId}</td>
                        <td>
                          <span className={`dashboard-stream-status dashboard-stream-status--${row.level}`}>{row.status}</span>
                        </td>
                        <td>{displayMaybeNumber(row.txPackets)}</td>
                        <td>{displayMaybeNumber(row.rxPackets)}</td>
                        <td>{displayMaybeNumber(row.deficit)}</td>
                        <td>{displayLoss(row.deficitRatio)}</td>
                        <td>{displayPacketRate(row.txPps)}</td>
                        <td>{displayPacketRate(row.rxPps)}</td>
                        <td>{displayLatency(row.avgLatency)}</td>
                        <td>{displayMaybeNumber(row.latencyErrors)}</td>
                        <td>{row.note}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={11}>No stream health samples loaded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-table-wrap dashboard-stream-diagnostics">
                <table aria-label="Stream diagnostics">
                  <thead>
                    <tr>
                      <th>PG ID</th>
                      <th>Level</th>
                      <th>Symptom</th>
                      <th>Evidence</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamDiagnosticTableRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.pgId}</td>
                        <td>
                          <span className={`dashboard-stream-status dashboard-stream-status--${row.level}`}>{row.level.toUpperCase()}</span>
                        </td>
                        <td>{row.symptom}</td>
                        <td>{row.evidence}</td>
                        <td>{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-table-wrap dashboard-trend-diagnostics">
                <table aria-label="Trend diagnostics">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Metric</th>
                      <th>Evidence</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendDiagnosticTableRows.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <span className={`dashboard-stream-status dashboard-stream-status--${row.level}`}>{row.level.toUpperCase()}</span>
                        </td>
                        <td>{row.metric}</td>
                        <td>{row.evidence}</td>
                        <td>{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-table-wrap dashboard-stream-raw-table">
                <table aria-label="Stream raw metrics">
                  <thead>
                    <tr>
                      <th>PG ID</th>
                      <th>Metric</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamRows.length > 0 ? streamRows.map((row) => (
                      <tr key={`${row.scope}:${row.metric}`}>
                        <td>{row.scope}</td>
                        <td>{row.metric}</td>
                        <td>{row.value}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3}>No stream samples loaded</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === "Latency" && availableLatencyPgIds.length === 0 ? (
          <div className="dashboard-empty-state" role="status">
            <strong>No latency samples</strong>
            <span>Run a latency-enabled stream to populate the latency window and histogram.</span>
          </div>
        ) : activeTab === "Latency" ? (
          <div className="dashboard-split-pane">
            {streamsSelector}
            <div className="dashboard-latency-pane">
              <div className="dashboard-latency-mode" role="group" aria-label="Latency mode">
                {latencyModes.map((mode, index) => (
                  <button
                    aria-controls="dashboard-latency-view"
                    aria-pressed={latencyMode === mode}
                    className={`dashboard-latency-toggle ${latencyMode === mode ? "dashboard-latency-toggle--active" : ""}`}
                    id={latencyModeId(mode)}
                    key={mode}
                    onClick={() => setLatencyMode(mode)}
                    onKeyDown={(event) => handleLatencyModeKeyDown(event, index)}
                    ref={(node) => {
                      latencyModeRefs.current[index] = node;
                    }}
                    tabIndex={latencyMode === mode ? 0 : -1}
                    type="button"
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div
                aria-labelledby={latencyModeId(latencyMode)}
                className="dashboard-table-wrap dashboard-latency-view"
                id="dashboard-latency-view"
                role="region"
              >
                {latencyMode === "Window" ? (
                  <table className="dashboard-latency-table" aria-label="Latency window">
                    <thead>
                      <tr>
                        <th>PG ID</th>
                        <th>Tx pkt</th>
                        <th>Rx pkt</th>
                        <th>Max Latency</th>
                        <th>Avg Latency</th>
                        <th>Last (max)</th>
                        {Array.from({ length: latencyWindowSize - 1 }, (_, index) => (
                          <th key={`last-${index + 1}`}>Last-{index + 1}</th>
                        ))}
                        <th>Jitter</th>
                        <th>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latencyWindowTableRows.length > 0 ? latencyWindowTableRows.map((row) => (
                        <tr key={row.pgId}>
                          <td>{row.pgId}</td>
                          <td>{displayMaybeNumber(row.txPackets)}</td>
                          <td>{displayMaybeNumber(row.rxPackets)}</td>
                          <td>{displayLatency(row.maxLatency)}</td>
                          <td>{displayLatency(row.avgLatency)}</td>
                          {row.lastValues.map((value, index) => (
                            <td key={`${row.pgId}:last:${index}`}>{displayMaybeNumber(value)}</td>
                          ))}
                          <td>{displayLatency(row.jitter)}</td>
                          <td>{displayMaybeNumber(row.errors)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={latencyWindowSize + 7}>No latency samples loaded</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="dashboard-latency-table" aria-label="Latency histogram">
                    <thead>
                      <tr>
                        <th>PG ID</th>
                        {latencyHistogramTableColumns.map((bucket) => (
                          <th key={bucket}>{bucket}</th>
                        ))}
                        <th>Dropped</th>
                        <th>Dup</th>
                        <th>Out Of Order</th>
                        <th>Seq To High</th>
                        <th>Seq To Low</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latencyHistogramTableRows.length > 0 ? latencyHistogramTableRows.map((row) => (
                        <tr key={row.pgId}>
                          <td>{row.pgId}</td>
                          {latencyHistogramTableColumns.map((bucket) => (
                            <td key={`${row.pgId}:${bucket}`}>{displayMaybeNumber(row.buckets[bucket] ?? 0)}</td>
                          ))}
                          <td>{displayMaybeNumber(row.dropped)}</td>
                          <td>{displayMaybeNumber(row.dup)}</td>
                          <td>{displayMaybeNumber(row.outOfOrder)}</td>
                          <td>{displayMaybeNumber(row.seqToHigh)}</td>
                          <td>{displayMaybeNumber(row.seqToLow)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={latencyHistogramTableColumns.length + 6}>No latency histogram samples loaded</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "Charts" ? (
          <div className="dashboard-split-pane">
            {streamsSelector}
            <div className="dashboard-chart-shell">
              <div className="dashboard-chart-toolbar">
                <label>
                  Interval:
                  <select
                    aria-label="Chart interval"
                    onChange={(event) => setChartInterval(Number(event.target.value))}
                    value={chartInterval}
                  >
                    <option value={60}>60</option>
                    <option value={90}>90</option>
                    <option value={120}>120</option>
                    <option value={300}>300</option>
                  </select>
                </label>
                <span>{chartSamples.length} samples</span>
              </div>
              <div className="dashboard-chart-grid dashboard-chart-grid--charts">
                <div
                  aria-label="Run trends"
                  className="dashboard-chart-group dashboard-chart-group--trends"
                  role="group"
                >
                  <Sparkline formatValue={displayPacketRate} label="Tx PPS" metric="txPps" samples={chartSamples} />
                  <Sparkline formatValue={displayPacketRate} label="Rx PPS" metric="rxPps" samples={chartSamples} />
                  <L2RateSparkline samples={chartSamples} />
                  <Sparkline formatValue={displayBitRate} label="Drop Rate" metric="dropBps" samples={chartSamples} />
                  <Sparkline formatValue={displayCount} label="Queue Full" metric="queueFull" samples={chartSamples} />
                  <Sparkline formatValue={displayLatencyUs} label="Latency Avg" metric="latencyAvg" samples={chartSamples} />
                </div>
                <div
                  aria-label="Port rate comparison"
                  className="dashboard-chart-group dashboard-chart-group--ports"
                  role="group"
                >
                  <PortBars formatValue={displayPacketRate} rows={visiblePortRows} metric="txPps" title="Port Tx PPS" />
                  <PortBars formatValue={displayPacketRate} rows={visiblePortRows} metric="rxPps" title="Port Rx PPS" />
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === "Utilization" ? (
          <div className="dashboard-split-pane">
            {portSelector}
            <div className="dashboard-chart-grid dashboard-chart-grid--util">
              <PortBars formatValue={displayPercent} rows={visiblePortRows} scaleMax={100} metric="txUtil" title="Port Tx Util" />
              <PortBars formatValue={displayPercent} rows={visiblePortRows} scaleMax={100} metric="rxUtil" title="Port Rx Util" />
              <Sparkline formatValue={displayBitRate} label="Tx bps" metric="txBps" samples={chartSamples} />
              <Sparkline formatValue={displayBitRate} label="Rx bps" metric="rxBps" samples={chartSamples} />
            </div>
          </div>
        ) : (
          <div className="dashboard-empty">
            {statsResult?.error ?? "No samples loaded"}
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
