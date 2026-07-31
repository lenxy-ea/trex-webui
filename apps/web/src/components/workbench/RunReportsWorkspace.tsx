import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Download, FileJson, FileSpreadsheet, FileText, GitCompareArrows, RefreshCw, Save, Search } from "lucide-react";

import type {
  RunReportDownloadResult,
  RunReportFile,
  RunReportMetricTrend,
  RunReportSaveResult,
  TrexResult,
  TrexRunReportTrends,
  TrexRunReports
} from "../../api";
import {
  displayBitRate,
  displayBytes,
  displayCount,
  displayLatencyUs,
  displayNumber,
  displayPacketRate,
  displayPercent
} from "./format";
import {
  runReportTemplates,
  type RunReportCheck,
  type RunReportConclusion,
  type RunReportMetric,
  type RunReportSnapshot,
  type RunReportTemplateId
} from "./runReport";

type RunReportsWorkspaceProps = {
  isBusy: boolean;
  isReportsLoading: boolean;
  isSnapshotLoading: boolean;
  isTrendsLoading: boolean;
  reportResult: TrexResult<RunReportSaveResult | RunReportDownloadResult> | null;
  reportTemplateId: RunReportTemplateId;
  reportsResult: TrexResult<TrexRunReports> | null;
  trendsResult: TrexResult<TrexRunReportTrends> | null;
  snapshot: RunReportSnapshot;
  onDownloadArchive: (fileName: string) => Promise<TrexResult<RunReportDownloadResult>>;
  onDownloadArchiveCsv: (fileName: string) => Promise<TrexResult<RunReportDownloadResult>>;
  onDownloadArchivePdf: (fileName: string) => Promise<TrexResult<RunReportDownloadResult>>;
  onDownloadCurrentCsv: () => void;
  onDownloadCurrentJson: () => void;
  onDownloadCurrentPdf: () => void;
  onDownloadMarkdown: () => void;
  onLoadArchive: (fileName: string) => Promise<TrexResult<RunReportDownloadResult>>;
  onRefreshReports: () => Promise<TrexResult<TrexRunReports>>;
  onRefreshTrends: () => Promise<TrexResult<TrexRunReportTrends>>;
  onRefreshSnapshot: () => Promise<void>;
  onReportTemplateChange: (templateId: RunReportTemplateId) => void;
  onSaveReport: () => Promise<TrexResult<RunReportSaveResult>>;
};

type CompareArchive = {
  fileName: string;
  generatedAt: string | null;
  conclusion: RunReportConclusion | null;
  title: string;
  metrics: RunReportMetric[];
  payload: Record<string, unknown>;
};

type SnapshotProfileStream = {
  index: string;
  name: string;
  packetType: string;
  rate: string;
  pgId: string;
  rxStats: string;
  latency: string;
  fieldEngines: string;
  expectedLayerChain: string;
};

type SnapshotFieldMatch = {
  stream: string;
  field: string;
  status: string;
  expected: string;
  observed: string;
  missing: string;
};

type StandardE2eSummary = {
  source: string;
  daemonConfig: string;
  daemonCommand: string;
  latencyProfile: string;
  latencyPgIds: string;
  latencyAverage: string;
  latencyPackets: string;
  captureProfile: string;
  capturePackets: string;
  captureLayerChain: string;
  pcap: string;
  postConditions: string;
  constraint: string;
};

type RunReportTab = "overview" | "evidence" | "trends" | "archives" | "raw";

const runReportTabs: Array<{ id: RunReportTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "trends", label: "Trends" },
  { id: "archives", label: "Archives" },
  { id: "raw", label: "Raw" }
];
const RUN_REPORT_ARCHIVE_PAGE_SIZE = 50;

function reportTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function resultMessage(result: TrexResult<RunReportSaveResult | RunReportDownloadResult> | null) {
  if (!result) {
    return "";
  }
  if (!result.ok) {
    return result.error ?? result.blocker ?? "Report command failed";
  }
  const file = result.data?.file;
  if (!file) {
    return "Report command accepted";
  }
  if (file.download_error) {
    return `${file.name}: ${file.download_error}`;
  }
  return `Report ready ${file.name}`;
}

function fileTitle(file: RunReportFile) {
  return file.title || file.name;
}

function metricMap(metrics: RunReportMetric[]) {
  return new Map(metrics.map((metric) => [metric.label, metric.value]));
}

function metricValue(metrics: Map<string, string>, label: string) {
  return metrics.get(label) ?? "-";
}

function runStatusTiles(snapshot: RunReportSnapshot) {
  const metrics = metricMap(snapshot.metrics);
  return [
    { label: "Verdict", value: snapshot.conclusion.title, status: snapshot.conclusion.verdict },
    { label: "Profile", value: metricValue(metrics, "Profile") },
    { label: "Ports", value: metricValue(metrics, "Run ports") },
    { label: "Duration", value: metricValue(metrics, "Run duration") },
    { label: "Tx/Rx L2", value: `${metricValue(metrics, "Tx L2")} / ${metricValue(metrics, "Rx L2")}` },
    { label: "Tx/Rx PPS", value: `${metricValue(metrics, "Tx PPS")} / ${metricValue(metrics, "Rx PPS")}` },
    { label: "Drop", value: metricValue(metrics, "Drop rate") },
    { label: "Latency", value: metricValue(metrics, "Latency avg") },
    { label: "Capture", value: `${metricValue(metrics, "Monitor packets")} / ${metricValue(metrics, "Saved captures")}` },
    { label: "Field Match", value: metricValue(metrics, "Field matches") }
  ];
}

function checkCounts(checks: RunReportCheck[]) {
  return checks.reduce<Record<RunReportCheck["status"], number>>((counts, check) => {
    counts[check.status] += 1;
    return counts;
  }, { fail: 0, pass: 0, unknown: 0, warn: 0 });
}

function payloadText(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadObjectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function payloadPath(source: unknown, path: string) {
  let cursor = source;
  for (const key of path.split(".")) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function snapshotProfileStreams(payload: Record<string, unknown>): SnapshotProfileStream[] {
  return payloadObjectList(payload.profile_streams).map((stream) => ({
    index: payloadText(stream.index) || "-",
    name: payloadText(stream.name) || "-",
    packetType: payloadText(stream.packet_type) || "-",
    rate: payloadText(stream.rate) || "-",
    pgId: payloadText(stream.pg_id) || "-",
    rxStats: payloadText(stream.rx_stats) || "-",
    latency: payloadText(stream.latency) || "-",
    fieldEngines: Array.isArray(stream.field_engines)
      ? stream.field_engines.map(payloadText).filter(Boolean).slice(0, 5).join("; ") || "-"
      : "-",
    expectedLayerChain: payloadText(stream.expected_layer_chain) || "-"
  }));
}

function payloadTextList(value: unknown) {
  return Array.isArray(value)
    ? value.map(payloadText).filter(Boolean).join(", ") || "-"
    : "-";
}

function snapshotFieldMatches(payload: Record<string, unknown>): SnapshotFieldMatch[] {
  const match = payload.capture_field_match && typeof payload.capture_field_match === "object" && !Array.isArray(payload.capture_field_match)
    ? payload.capture_field_match as Record<string, unknown>
    : {};
  const matched = payloadObjectList(match.matched).map((row) => ({
    stream: payloadText(row.stream) || "-",
    field: payloadText(row.field) || "-",
    status: "pass",
    expected: payloadTextList(row.expected_values),
    observed: payloadTextList(row.observed_values),
    missing: "-"
  }));
  const missing = payloadObjectList(match.missing).map((row) => ({
    stream: payloadText(row.stream) || "-",
    field: payloadText(row.field) || "-",
    status: "fail",
    expected: payloadTextList(row.expected_values),
    observed: payloadTextList(row.observed_values),
    missing: payloadTextList(row.missing_values)
  }));
  return [...matched, ...missing].slice(0, 16);
}

function explicitMetricsFromPayload(payload: Record<string, unknown>): RunReportMetric[] {
  return Array.isArray(payload.metrics)
    ? payload.metrics.flatMap((metric) => {
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
        return [];
      }
      const record = metric as Record<string, unknown>;
      return typeof record.label === "string" && typeof record.value === "string"
        ? [{ label: record.label, value: record.value }]
        : [];
    })
    : [];
}

function metricsFromPayload(payload: Record<string, unknown>): RunReportMetric[] {
  const explicit = explicitMetricsFromPayload(payload);
  if (explicit.length > 0) {
    return explicit;
  }

  const standard = standardE2eSummary(payload, "Archive");
  if (!standard) {
    return [];
  }
  return [
    { label: "Profile", value: `${standard.latencyProfile} + ${standard.captureProfile}` },
    { label: "Run ports", value: "-" },
    { label: "Run duration", value: "-" },
    { label: "Tx L2", value: "-" },
    { label: "Rx L2", value: "-" },
    { label: "Tx PPS", value: "-" },
    { label: "Rx PPS", value: "-" },
    { label: "Drop rate", value: "0 b/s" },
    { label: "Latency avg", value: standard.latencyAverage },
    { label: "Monitor packets", value: standard.capturePackets },
    { label: "Saved captures", value: standard.pcap === "-" ? "0" : "1" },
    { label: "Field matches", value: standard.captureLayerChain }
  ];
}

function firstDaemonCommand(payload: Record<string, unknown>) {
  const commandGroups = [
    payloadPath(payload, "daemon_status_after.commands"),
    payloadPath(payload, "daemon_status.commands"),
    payloadPath(payload, "daemon_custom_yaml_start.runtime_status.commands")
  ];
  for (const commandGroup of commandGroups) {
    if (!Array.isArray(commandGroup)) {
      continue;
    }
    for (const entry of commandGroup) {
      if (!Array.isArray(entry)) {
        continue;
      }
      const command = entry.find((item) => typeof item === "string" && item.includes("_t-rex"));
      if (typeof command === "string") {
        return command;
      }
    }
  }
  return "";
}

function standardE2eSummary(payload: Record<string, unknown>, source = "Current snapshot"): StandardE2eSummary | null {
  const latency = payloadRecord(payload.latency_phase);
  const capture = payloadRecord(payload.capture_phase);
  const daemon = payloadRecord(payload.daemon_custom_yaml_start);
  const isStandard = payload.standard_e2e === true
    || payload.workflow === "standard-e2e"
    || (Object.keys(latency).length > 0 && Object.keys(capture).length > 0 && Object.keys(daemon).length > 0);
  if (!isStandard) {
    return null;
  }

  const metrics = metricMap(explicitMetricsFromPayload(payload));
  const latencyAverage = metricValue(metrics, "Latency avg") !== "-"
    ? metricValue(metrics, "Latency avg")
    : payloadText(latency.latency_avg_us)
      ? `${payloadText(latency.latency_avg_us)} us`
      : "-";
  const latencyPgIds = Array.isArray(latency.latency_pg_ids)
    ? latency.latency_pg_ids.map(payloadText).filter(Boolean).join(", ") || "-"
    : "-";
  const layerChains = Array.isArray(capture.layer_chains)
    ? capture.layer_chains.map(payloadText).filter(Boolean)
    : [];
  const post = payloadRecord(payload.post_conditions);
  const idle = post.traffic_ports_idle === true ? "idle" : post.traffic_ports_idle === false ? "active" : "-";
  const recorders = payloadText(post.capture_recorders_after_stop);

  return {
    source,
    daemonConfig: payloadText(daemon.config_path) || payloadText(payloadPath(daemon, "trex_cmd_options.cfg")) || payloadText(daemon.reason) || "-",
    daemonCommand: payloadText(payload.trex_command) || firstDaemonCommand(payload) || "-",
    latencyProfile: payloadText(latency.profile) || payloadText(payload.latency_profile) || "-",
    latencyPgIds,
    latencyAverage,
    latencyPackets: `${payloadText(latency.tx_packets) || "-"} / ${payloadText(latency.rx_packets) || "-"}`,
    captureProfile: payloadText(capture.profile) || payloadText(payload.capture_profile) || "-",
    capturePackets: payloadText(capture.packet_count) || metricValue(metrics, "Monitor packets"),
    captureLayerChain: payloadText(capture.layer_chain) || layerChains[0] || metricValue(metrics, "Field matches"),
    pcap: payloadText(capture.pcap) || "-",
    postConditions: `traffic ${idle}${recorders ? `, capture recorders ${recorders}` : ""}`,
    constraint: payloadText(payload.known_constraint)
      || "Latency and capture evidence were collected in separate phases to avoid receiver service-mode conflict."
  };
}

function parseMetricValue(value: string | undefined) {
  if (!value || value === "-") {
    return null;
  }
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const number = Number(match[1]);
  return Number.isFinite(number) ? { number, unit: match[2].trim() } : null;
}

const bitRateUnitMultipliers: Record<string, number> = {
  "b/s": 1,
  "Kb/s": 1_000,
  "Mb/s": 1_000_000,
  "Gb/s": 1_000_000_000,
  "Tb/s": 1_000_000_000_000
};
const packetRateUnitMultipliers: Record<string, number> = {
  pps: 1,
  Kpps: 1_000,
  Mpps: 1_000_000,
  Gpps: 1_000_000_000,
  Tpps: 1_000_000_000_000
};

function formatTrendMetricValue(value: string | null | undefined) {
  const metric = parseMetricValue(value ?? undefined);
  if (!metric) {
    return value ?? "-";
  }
  const bitRateMultiplier = bitRateUnitMultipliers[metric.unit];
  if (bitRateMultiplier !== undefined) {
    return displayBitRate(metric.number * bitRateMultiplier);
  }
  const packetRateMultiplier = packetRateUnitMultipliers[metric.unit];
  if (packetRateMultiplier !== undefined) {
    return displayPacketRate(metric.number * packetRateMultiplier);
  }
  if (metric.unit === "us") {
    return displayLatencyUs(metric.number);
  }
  if (!metric.unit && Number.isInteger(metric.number)) {
    return displayCount(metric.number);
  }
  return `${displayNumber(metric.number)}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function deltaText(current: string | undefined, archive: string | undefined) {
  if (!current || !archive || current === "-" || archive === "-") {
    return "-";
  }
  if (current === archive) {
    return "0";
  }
  const currentMetric = parseMetricValue(current);
  const archiveMetric = parseMetricValue(archive);
  if (!currentMetric || !archiveMetric || currentMetric.unit !== archiveMetric.unit) {
    return "changed";
  }
  const delta = currentMetric.number - archiveMetric.number;
  if (Math.abs(delta) < 1e-9) {
    return "0";
  }
  const formatted = delta.toFixed(Math.abs(delta) < 1 ? 3 : Math.abs(delta) < 10 ? 2 : 1).replace(/\.?0+$/, "");
  return `${delta > 0 ? "+" : ""}${formatted}${currentMetric.unit ? ` ${currentMetric.unit}` : ""}`;
}

function trendDeltaText(trend: RunReportMetricTrend) {
  if (trend.delta === null || trend.direction === "unknown" || trend.direction === "changed") {
    return trend.direction === "changed" ? "changed" : "-";
  }
  if (Math.abs(trend.delta) < 1e-9) {
    return "0";
  }
  const formatted = formatTrendMetricValue(`${trend.delta}${trend.unit ? ` ${trend.unit}` : ""}`);
  return `${trend.delta > 0 ? "+" : ""}${formatted}`;
}

function trendDeltaPercent(trend: RunReportMetricTrend) {
  if (trend.delta === null || trend.direction === "unknown" || trend.direction === "changed") {
    return null;
  }
  const previous = parseMetricValue(trend.previous ?? undefined);
  if (!previous || Math.abs(previous.number) < 1e-9 || previous.unit !== trend.unit) {
    return null;
  }
  return displayPercent((trend.delta / Math.abs(previous.number)) * 100);
}

function trendDeltaTone(trend: RunReportMetricTrend): "good" | "bad" | "neutral" {
  if (trend.direction !== "up" && trend.direction !== "down") {
    return "neutral";
  }
  if (trend.label === "Drop rate" || trend.label === "Latency avg") {
    return trend.direction === "up" ? "bad" : "good";
  }
  if (["Rx PPS", "Rx L2", "Monitor packets"].includes(trend.label)) {
    return trend.direction === "down" ? "bad" : "good";
  }
  return "neutral";
}

function historyHealth(trends: TrexRunReportTrends) {
  const { fail, pass, unknown, warn } = trends.verdict_counts;
  if (trends.total === 0) {
    return {
      summary: "Save a run report after a real traffic run to build history",
      title: "No Report History",
      verdict: "unknown" as const
    };
  }
  if (fail > 0) {
    return {
      summary: `${fail} of ${trends.total} readable reports failed in the selected window`,
      title: "History Failing",
      verdict: "fail" as const
    };
  }
  if (warn > 0 || unknown > 0 || trends.skipped > 0) {
    const details = [
      warn > 0 ? `${warn} warning` : "",
      unknown > 0 ? `${unknown} unknown` : "",
      trends.skipped > 0 ? `${trends.skipped} skipped` : ""
    ].filter(Boolean).join(" · ");
    return {
      summary: `${details} in the selected window`,
      title: "History Needs Review",
      verdict: "warn" as const
    };
  }
  return {
    summary: `${pass} report${pass === 1 ? "" : "s"} passed in the selected window`,
    title: "History Clean",
    verdict: "pass" as const
  };
}

function archiveConclusion(value: unknown): RunReportConclusion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const verdict = typeof record.verdict === "string" && ["pass", "warn", "fail", "unknown"].includes(record.verdict)
    ? record.verdict as RunReportConclusion["verdict"]
    : null;
  if (!verdict) {
    return null;
  }
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.flatMap((metric) => {
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
        return [];
      }
      const metricRecord = metric as Record<string, unknown>;
      return typeof metricRecord.label === "string" && typeof metricRecord.value === "string"
        ? [{ label: metricRecord.label, value: metricRecord.value }]
        : [];
    })
    : [];
  const checks = Array.isArray(record.checks)
    ? record.checks.flatMap((check): RunReportCheck[] => {
      if (!check || typeof check !== "object" || Array.isArray(check)) {
        return [];
      }
      const checkRecord = check as Record<string, unknown>;
      const status = typeof checkRecord.status === "string" && ["pass", "warn", "fail", "unknown"].includes(checkRecord.status)
        ? checkRecord.status as RunReportCheck["status"]
        : null;
      return typeof checkRecord.label === "string" && status && typeof checkRecord.detail === "string"
        ? [{ label: checkRecord.label, status, detail: checkRecord.detail }]
        : [];
    })
    : [];
  return {
    verdict,
    title: typeof record.title === "string" ? record.title : verdict,
    summary: typeof record.summary === "string" ? record.summary : "-",
    reasons,
    evidence,
    checks
  };
}

function archiveFromContent(fileName: string, content: string): CompareArchive {
  const parsed = JSON.parse(content) as {
    title?: unknown;
    generated_at?: unknown;
    payload?: unknown;
  };
  const payload = parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
    ? parsed.payload as Record<string, unknown>
    : {};
  const metrics = metricsFromPayload(payload);
  if (metrics.length === 0) {
    throw new Error("Report archive has no metrics");
  }
  return {
    fileName,
    generatedAt: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
    conclusion: archiveConclusion(payload.conclusion),
    title: typeof parsed.title === "string" ? parsed.title : fileName,
    metrics,
    payload
  };
}

export function RunReportsWorkspace({
  isBusy,
  isReportsLoading,
  isSnapshotLoading,
  isTrendsLoading,
  reportResult,
  reportTemplateId,
  reportsResult,
  trendsResult,
  snapshot,
  onDownloadArchive,
  onDownloadArchiveCsv,
  onDownloadArchivePdf,
  onDownloadCurrentCsv,
  onDownloadCurrentJson,
  onDownloadCurrentPdf,
  onDownloadMarkdown,
  onLoadArchive,
  onRefreshReports,
  onRefreshTrends,
  onRefreshSnapshot,
  onReportTemplateChange,
  onSaveReport
}: RunReportsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<RunReportTab>("overview");
  const tabRefs = useRef<Partial<Record<RunReportTab, HTMLButtonElement | null>>>({});
  const [compareArchive, setCompareArchive] = useState<CompareArchive | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [archivePage, setArchivePage] = useState(0);
  const [archiveQuery, setArchiveQuery] = useState("");
  const files = useMemo(() => reportsResult?.data?.files ?? [], [reportsResult]);
  const recentFiles = files.slice(0, 5);
  const normalizedArchiveQuery = archiveQuery.trim().toLowerCase();
  const filteredFiles = useMemo(() => {
    const tokens = normalizedArchiveQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return files;
    }
    return files.filter((file) => {
      const searchable = [
        file.name,
        file.title,
        file.path,
        file.generated_at,
        file.modified_time
      ].filter(Boolean).join(" ").toLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
  }, [files, normalizedArchiveQuery]);
  const archivePageCount = Math.max(1, Math.ceil(filteredFiles.length / RUN_REPORT_ARCHIVE_PAGE_SIZE));
  const effectiveArchivePage = Math.min(archivePage, archivePageCount - 1);
  const archivePageStart = effectiveArchivePage * RUN_REPORT_ARCHIVE_PAGE_SIZE;
  const visibleArchiveFiles = filteredFiles.slice(archivePageStart, archivePageStart + RUN_REPORT_ARCHIVE_PAGE_SIZE);
  const archiveRangeStart = filteredFiles.length === 0 ? 0 : archivePageStart + 1;
  const archiveRangeEnd = Math.min(filteredFiles.length, archivePageStart + visibleArchiveFiles.length);
  const trendData = trendsResult?.ok ? trendsResult.data : null;
  const trendHistoryHealth = trendData ? historyHealth(trendData) : null;
  const trendReasons = trendData
    ? [...new Set(trendData.conclusion.reasons)].filter((reason) => reason !== trendData.conclusion.summary).slice(0, 3)
    : [];
  const currentProfileStreams = snapshotProfileStreams(snapshot.payload);
  const currentFieldMatches = snapshotFieldMatches(snapshot.payload);
  const currentStandardE2e = standardE2eSummary(snapshot.payload, "Current snapshot");
  const comparedStandardE2e = compareArchive ? standardE2eSummary(compareArchive.payload, "Compared archive") : null;
  const standardE2e = comparedStandardE2e ?? currentStandardE2e;
  const currentMetrics = metricMap(snapshot.metrics);
  const archiveMetrics = metricMap(compareArchive?.metrics ?? []);
  const statusTiles = runStatusTiles(snapshot);
  const allChecks = [...snapshot.template.criteria, ...snapshot.conclusion.checks];
  const evidenceCounts = checkCounts(allChecks);
  const overviewChecks = allChecks.slice(0, 8);
  const overviewMetricLabels = new Set([
    "TRex host",
    "Profile",
    "Run ports",
    "Run duration",
    "Runtime rate",
    "Streams",
    "Ports",
    "Active ports",
    "Tx L2",
    "Rx L2",
    "Tx PPS",
    "Rx PPS",
    "Drop rate",
    "Queue full",
    "Latency avg",
    "Capture recorders",
    "Monitor packets",
    "Saved captures"
  ]);
  const overviewMetrics = snapshot.metrics.filter((metric) => overviewMetricLabels.has(metric.label)).slice(0, 18);
  const overviewDiagnostics = snapshot.diagnostics.slice(0, 5);
  const archiveEmptyText = isReportsLoading
    ? "Loading report archives…"
    : reportsResult && !reportsResult.ok
      ? reportsResult.error ?? reportsResult.blocker ?? "Unable to load report archives"
      : normalizedArchiveQuery
        ? `No report archives match “${archiveQuery.trim()}”`
        : "No report archives";
  const archiveCountText = isReportsLoading && reportsResult === null ? "Loading…" : `${files.length} files`;
  const filteredArchiveCountText = isReportsLoading && reportsResult === null
    ? "Loading…"
    : normalizedArchiveQuery
      ? `${filteredFiles.length} of ${files.length} files`
      : `${files.length} files`;
  const archiveSummary = isReportsLoading && reportsResult === null
    ? "Loading archives…"
    : normalizedArchiveQuery
      ? `${filteredFiles.length} of ${files.length} archives · ${RUN_REPORT_ARCHIVE_PAGE_SIZE} per page`
      : `${files.length} archives · ${RUN_REPORT_ARCHIVE_PAGE_SIZE} per page`;
  const overviewArchiveSummary = isReportsLoading && reportsResult === null
    ? "archives loading"
    : `${files.length} archives`;
  const tabSummary = activeTab === "trends" && trendData
    ? [
      `${trendData.total} reports`,
      `${trendData.verdict_counts.pass} pass`,
      `${trendData.verdict_counts.warn} warn`,
      `${trendData.verdict_counts.fail} fail`,
      trendData.verdict_counts.unknown > 0 ? `${trendData.verdict_counts.unknown} unknown` : "",
      trendData.skipped > 0 ? `${trendData.skipped} skipped` : ""
    ].filter(Boolean).join(" · ")
    : activeTab === "archives"
      ? archiveSummary
      : `${evidenceCounts.pass} pass · ${evidenceCounts.warn} warn · ${evidenceCounts.fail} fail · ${overviewArchiveSummary}`;
  const compareRows = compareArchive
    ? [...new Set([...snapshot.metrics.map((metric) => metric.label), ...compareArchive.metrics.map((metric) => metric.label)])]
      .map((label) => ({
        label,
        current: currentMetrics.get(label) ?? "-",
        archive: archiveMetrics.get(label) ?? "-",
        delta: deltaText(currentMetrics.get(label), archiveMetrics.get(label))
      }))
    : [];
  const loadingLabels = [
    isSnapshotLoading ? "snapshot" : "",
    isReportsLoading ? "archives" : "",
    isTrendsLoading ? "trends" : ""
  ].filter(Boolean);
  const statusText = isBusy
    ? "Running command…"
    : loadingLabels.length > 0
      ? `Loading ${loadingLabels.join(", ")}…`
      : compareError
        || resultMessage(reportResult)
        || (reportsResult && !reportsResult.ok ? reportsResult.error ?? reportsResult.blocker ?? "" : "")
        || (trendsResult && !trendsResult.ok ? trendsResult.error ?? trendsResult.blocker ?? "" : "");

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: RunReportTab) => {
    const currentIndex = runReportTabs.findIndex((tab) => tab.id === tabId);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % runReportTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + runReportTabs.length) % runReportTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = runReportTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = runReportTabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handleCompareArchive = async (fileName: string) => {
    setCompareError(null);
    setActiveTab("evidence");
    const result = await onLoadArchive(fileName);
    const file = result.data?.file;
    const content = file?.content;
    if (!result.ok || !file || !content) {
      setCompareArchive(null);
      setCompareError(result.error ?? result.blocker ?? "Unable to load report archive");
      return;
    }
    try {
      setCompareArchive(archiveFromContent(file.name || fileName, content));
    } catch (caught) {
      setCompareArchive(null);
      setCompareError(caught instanceof Error ? caught.message : "Unable to parse report archive");
    }
  };

  const clearArchiveQuery = () => {
    setArchiveQuery("");
    setArchivePage(0);
  };

  const renderArchiveActions = (file: RunReportFile) => (
    <div className="run-report-actions">
      <button
        aria-label={`Download JSON ${file.name}`}
        className="icon-table-button"
        disabled={isBusy || !file.download_available}
        onClick={() => void onDownloadArchive(file.name)}
        title="Download JSON"
        type="button"
      >
        <Download aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={`Download CSV ${file.name}`}
        className="icon-table-button"
        disabled={isBusy || !file.download_available}
        onClick={() => void onDownloadArchiveCsv(file.name)}
        title="Download CSV"
        type="button"
      >
        <FileSpreadsheet aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={`Download PDF ${file.name}`}
        className="icon-table-button"
        disabled={isBusy || !file.download_available}
        onClick={() => void onDownloadArchivePdf(file.name)}
        title="Download PDF"
        type="button"
      >
        <FileText aria-hidden="true" size={14} />
      </button>
      <button
        aria-label={`Compare ${file.name}`}
        className="icon-table-button"
        disabled={isBusy || !file.download_available}
        onClick={() => void handleCompareArchive(file.name)}
        title="Compare"
        type="button"
      >
        <GitCompareArrows aria-hidden="true" size={14} />
      </button>
    </div>
  );

  const renderArchiveTable = (fileList: RunReportFile[], emptyText: string) => (
    <div className="run-report-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Generated</th>
            <th>Size</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {fileList.length === 0 ? (
            <tr>
              <td colSpan={4}>{emptyText}</td>
            </tr>
          ) : fileList.map((file) => (
            <tr key={file.name}>
              <td>{fileTitle(file)}</td>
              <td>{reportTime(file.generated_at ?? file.modified_time)}</td>
              <td>{displayBytes(file.size_bytes)}</td>
              <td>{renderArchiveActions(file)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="run-report-dialog" aria-label="Run Reports workspace">
      <div className="run-report-command-bar" aria-label="Run report command bar">
        <label className="run-report-template-select">
          Template
          <select
            aria-label="Run report template"
            disabled={isBusy}
            onChange={(event) => onReportTemplateChange(event.target.value as RunReportTemplateId)}
            value={reportTemplateId}
          >
            {runReportTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
        </label>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={() => void onRefreshSnapshot()} type="button">
          <RefreshCw aria-hidden="true" size={15} />
          Refresh Snapshot
        </button>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={() => void onSaveReport()} type="button">
          <Save aria-hidden="true" size={15} />
          Save Report
        </button>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={onDownloadMarkdown} type="button">
          <FileText aria-hidden="true" size={15} />
          Markdown
        </button>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={onDownloadCurrentPdf} type="button">
          <FileText aria-hidden="true" size={15} />
          PDF
        </button>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={onDownloadCurrentCsv} type="button">
          <FileSpreadsheet aria-hidden="true" size={15} />
          CSV
        </button>
        <button className="stream-command-button" disabled={isBusy || isSnapshotLoading} onClick={onDownloadCurrentJson} type="button">
          <FileJson aria-hidden="true" size={15} />
          JSON
        </button>
        <button
          className="stream-command-button"
          disabled={isBusy || isReportsLoading}
          onClick={() => {
            setActiveTab("archives");
            void onRefreshReports();
          }}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} />
          Archives
        </button>
        <button
          className="stream-command-button"
          disabled={isBusy || isTrendsLoading}
          onClick={() => {
            setActiveTab("trends");
            void onRefreshTrends();
          }}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} />
          Trends
        </button>
        <span aria-live="polite" className="run-report-status">{statusText}</span>
      </div>

      <section className={`run-report-status-strip run-report-status-strip--${snapshot.conclusion.verdict}`} aria-label="Run report status">
        {statusTiles.map((tile) => (
          <div className={tile.status ? `run-report-status-tile run-report-status-tile--${tile.status}` : "run-report-status-tile"} key={tile.label}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
          </div>
        ))}
      </section>

      <div className="run-report-tabs" role="tablist" aria-label="Run report views">
        {runReportTabs.map((tab) => (
          <button
            aria-controls={`run-report-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`run-report-tab ${activeTab === tab.id ? "run-report-tab--active" : ""}`}
            id={`run-report-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
        <span className="run-report-tab-summary">
          {tabSummary}
        </span>
      </div>

      <div className="run-report-workspace">
        {activeTab === "overview" ? (
            <div
              aria-labelledby="run-report-tab-overview"
              className="run-report-grid"
              id="run-report-panel-overview"
              role="tabpanel"
              tabIndex={0}
            >
              <section className="run-report-summary" aria-label="Current report summary">
                <div className="run-report-section-head">
                  <strong>Current Snapshot</strong>
                  <span>{snapshot.template.label} · {reportTime(snapshot.generatedAt)}</span>
                </div>
                <div className={`run-report-conclusion run-report-conclusion--${snapshot.conclusion.verdict}`} aria-label="Run report conclusion">
                  <strong>{snapshot.conclusion.title}</strong>
                  <span>{snapshot.conclusion.summary}</span>
                  <ul>
                    {snapshot.conclusion.reasons.slice(0, 3).map((reason, index) => (
                      <li key={`${index}-${reason}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="run-report-overview-body">
                  <section className="run-report-overview-panel" aria-label="Overview gates">
                    <div className="run-report-overview-panel-head">
                      <strong>Run Gates</strong>
                      <span>{overviewChecks.length} shown</span>
                    </div>
                    <div className="run-report-overview-checks">
                      {overviewChecks.map((check) => (
                        <div className={`run-report-overview-check run-report-overview-check--${check.status}`} key={`${check.label}-${check.detail}`}>
                          <strong>{check.label}</strong>
                          <span>{check.status}</span>
                          <em>{check.detail}</em>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="run-report-overview-panel" aria-label="Overview key metrics">
                    <div className="run-report-overview-panel-head">
                      <strong>Key Metrics</strong>
                      <span>{overviewMetrics.length} values</span>
                    </div>
                    <dl className="run-report-overview-metrics">
                      {overviewMetrics.map((metric) => (
                        <div key={metric.label}>
                          <dt title={metric.label}>{metric.label}</dt>
                          <dd title={metric.value}>{metric.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                  <section className="run-report-overview-panel run-report-overview-panel--diagnostics" aria-label="Overview diagnostics">
                    <div className="run-report-overview-panel-head">
                      <strong>Diagnostics</strong>
                      <span>{overviewDiagnostics.length} shown</span>
                    </div>
                    <div className="run-report-overview-diagnostics">
                      {overviewDiagnostics.map((diagnostic) => (
                        <div className={`run-report-overview-diagnostic run-report-overview-diagnostic--${diagnostic.status}`} key={diagnostic.label}>
                          <strong>{diagnostic.label}</strong>
                          <span>{diagnostic.status}</span>
                          <em>{diagnostic.summary}</em>
                          <small>{diagnostic.action}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </section>

              <section className="run-report-archives run-report-archives--recent" aria-label="Recent report archives">
                <div className="run-report-section-head">
                  <strong>Recent Archives</strong>
                  <span>{archiveCountText}</span>
                </div>
                {renderArchiveTable(recentFiles, archiveEmptyText)}
              </section>
            </div>
          ) : null}

        {activeTab === "evidence" ? (
          <section
            aria-labelledby="run-report-tab-evidence"
            className="run-report-preview run-report-preview--evidence"
            id="run-report-panel-evidence"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="run-report-section-head">
              <strong>Evidence</strong>
              <span>{snapshot.title} · {snapshot.fileName}</span>
            </div>
            <div className="run-report-preview-body run-report-preview-body--evidence">
              {standardE2e ? (
                <section className="run-report-standard-e2e run-report-evidence-panel--wide" aria-label="Standard E2E evidence">
                  <div className="run-report-section-head">
                    <strong>Standard E2E</strong>
                    <span>{standardE2e.source}</span>
                  </div>
                  <div className="run-report-standard-e2e-grid">
                    <div>
                      <span>Daemon config</span>
                      <strong title={standardE2e.daemonConfig}>{standardE2e.daemonConfig}</strong>
                    </div>
                    <div>
                      <span>TRex command</span>
                      <strong title={standardE2e.daemonCommand}>{standardE2e.daemonCommand}</strong>
                    </div>
                    <div>
                      <span>Latency profile</span>
                      <strong title={standardE2e.latencyProfile}>{standardE2e.latencyProfile}</strong>
                    </div>
                    <div>
                      <span>Latency PG / avg</span>
                      <strong>{standardE2e.latencyPgIds} · {standardE2e.latencyAverage}</strong>
                    </div>
                    <div>
                      <span>Latency TX/RX</span>
                      <strong>{standardE2e.latencyPackets}</strong>
                    </div>
                    <div>
                      <span>Capture profile</span>
                      <strong title={standardE2e.captureProfile}>{standardE2e.captureProfile}</strong>
                    </div>
                    <div>
                      <span>Capture packets</span>
                      <strong>{standardE2e.capturePackets}</strong>
                    </div>
                    <div>
                      <span>Layer chain</span>
                      <strong>{standardE2e.captureLayerChain}</strong>
                    </div>
                    <div>
                      <span>Saved PCAP</span>
                      <strong title={standardE2e.pcap}>{standardE2e.pcap}</strong>
                    </div>
                    <div>
                      <span>Postconditions</span>
                      <strong title={standardE2e.postConditions}>{standardE2e.postConditions}</strong>
                    </div>
                  </div>
                  <p>{standardE2e.constraint}</p>
                </section>
              ) : null}
              <section className="run-report-evidence-panel" aria-label="Template gates">
                <div className="run-report-section-head">
                  <strong>Template Gates</strong>
                  <span>{snapshot.template.label}</span>
                </div>
                <div className="run-report-template-criteria" aria-label="Run report template criteria">
                  {snapshot.template.criteria.map((criterion) => (
                    <div className={`run-report-check run-report-check--${criterion.status}`} key={criterion.label}>
                      <strong>{criterion.label}</strong>
                      <span>{criterion.status}</span>
                      <em>{criterion.detail}</em>
                    </div>
                  ))}
                </div>
              </section>
              <section className="run-report-evidence-panel" aria-label="Evidence checklist">
                <div className="run-report-section-head">
                  <strong>Evidence Checklist</strong>
                  <span>{snapshot.conclusion.checks.length} checks</span>
                </div>
                <div className="run-report-checklist" aria-label="Run report evidence checklist">
                  {snapshot.conclusion.checks.map((check) => (
                    <div className={`run-report-check run-report-check--${check.status}`} key={check.label}>
                      <strong>{check.label}</strong>
                      <span>{check.status}</span>
                      <em>{check.detail}</em>
                    </div>
                  ))}
                </div>
              </section>
              <section className="run-report-evidence-panel run-report-evidence-panel--wide" aria-label="Diagnostics">
                <div className="run-report-section-head">
                  <strong>Diagnostics</strong>
                  <span>{snapshot.diagnostics.length} items</span>
                </div>
                <div className="run-report-diagnostics" aria-label="Run report diagnostics">
                  {snapshot.diagnostics.map((diagnostic) => (
                    <div className={`run-report-diagnostic run-report-diagnostic--${diagnostic.status}`} key={diagnostic.label}>
                      <strong>{diagnostic.label}</strong>
                      <span>{diagnostic.status}</span>
                      <em>{diagnostic.summary}</em>
                      <small>{diagnostic.action}</small>
                    </div>
                  ))}
                </div>
              </section>
              {currentProfileStreams.length > 0 ? (
                <section className="run-report-profile-streams run-report-evidence-panel--wide" aria-label="Report profile streams">
                  <div className="run-report-section-head">
                    <strong>Profile Streams</strong>
                    <span>{currentProfileStreams.length} streams</span>
                  </div>
                  <div className="run-report-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Packet</th>
                          <th>Rate</th>
                          <th>PG</th>
                          <th>RX</th>
                          <th>Latency</th>
                          <th>Field Engines</th>
                          <th>Expected Capture</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentProfileStreams.slice(0, 16).map((stream) => (
                          <tr key={`${stream.index}-${stream.name}`}>
                            <td>{stream.index}</td>
                            <td>{stream.name}</td>
                            <td>{stream.packetType}</td>
                            <td>{stream.rate}</td>
                            <td>{stream.pgId}</td>
                            <td>{stream.rxStats}</td>
                            <td>{stream.latency}</td>
                            <td>{stream.fieldEngines}</td>
                            <td>{stream.expectedLayerChain}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
              {currentFieldMatches.length > 0 ? (
                <section className="run-report-profile-streams run-report-evidence-panel--wide" aria-label="Report profile capture fields">
                  <div className="run-report-section-head">
                    <strong>Profile/Capture Fields</strong>
                    <span>{currentFieldMatches.length} fields</span>
                  </div>
                  <div className="run-report-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Stream</th>
                          <th>Field</th>
                          <th>Status</th>
                          <th>Expected</th>
                          <th>Observed</th>
                          <th>Missing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentFieldMatches.map((row) => (
                          <tr key={`${row.stream}-${row.field}-${row.status}`}>
                            <td>{row.stream}</td>
                            <td>{row.field}</td>
                            <td>{row.status}</td>
                            <td>{row.expected}</td>
                            <td>{row.observed}</td>
                            <td>{row.missing}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
              {compareArchive ? (
                <section className="run-report-compare run-report-evidence-panel--wide" aria-label="Report comparison">
                  <div className="run-report-section-head">
                    <strong>Comparison</strong>
                    <span>
                      {compareArchive.title} · {reportTime(compareArchive.generatedAt)}
                      {compareArchive.conclusion ? ` · ${compareArchive.conclusion.title}` : ""}
                    </span>
                  </div>
                  <div className="run-report-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Current</th>
                          <th>Archive</th>
                          <th>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareRows.map((row) => (
                          <tr key={row.label}>
                            <td>{row.label}</td>
                            <td>{row.current}</td>
                            <td>{row.archive}</td>
                            <td>{row.delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === "trends" ? (
          <section
            aria-labelledby="run-report-tab-trends"
            className="run-report-trends"
            id="run-report-panel-trends"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="run-report-section-head">
              <strong>History Trends</strong>
              <span>
                {trendData
                  ? `${trendData.total} reports · ${trendData.skipped} skipped`
                  : isTrendsLoading
                    ? "Loading report trends…"
                    : "No trend data"}
              </span>
            </div>
            {trendData && trendHistoryHealth ? (
              <div className="run-report-trend-grid">
                <section className="run-report-trend-summary" aria-label="History assessment">
                  <div className="run-report-history-health">
                    <div className="run-report-trend-status-line">
                      <div>
                        <span>Archive Results</span>
                        <strong>{trendHistoryHealth.title}</strong>
                      </div>
                      <span className={`run-report-trend-badge run-report-trend-badge--${trendHistoryHealth.verdict}`}>
                        {trendHistoryHealth.verdict}
                      </span>
                    </div>
                    <p>{trendHistoryHealth.summary}</p>
                  </div>
                  <dl className="run-report-verdict-counts">
                    {(["pass", "warn", "fail", "unknown"] as const).map((verdict) => (
                      <div data-verdict={verdict} key={verdict}>
                        <dt>{verdict}</dt>
                        <dd>{trendData.verdict_counts[verdict]}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className={`run-report-trend-assessment run-report-trend-assessment--${trendData.conclusion.verdict}`}>
                    <div className="run-report-trend-status-line">
                      <div>
                        <span>Trend Assessment</span>
                        <strong>{trendData.conclusion.summary}</strong>
                      </div>
                      <span className={`run-report-trend-badge run-report-trend-badge--${trendData.conclusion.verdict}`}>
                        {trendData.conclusion.verdict === "pass" ? "stable" : trendData.conclusion.verdict}
                      </span>
                    </div>
                    <p>Latest-to-previous metric changes are shown separately from archived report verdicts.</p>
                    {trendReasons.length > 0 ? (
                      <ul>
                        {trendReasons.map((reason, index) => (
                          <li key={`${index}-${reason}`}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
                <div className="run-report-table-wrap run-report-trend-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Latest</th>
                        <th>Previous</th>
                        <th>Delta</th>
                        <th>Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trendData.metric_trends.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No metrics</td>
                        </tr>
                      ) : trendData.metric_trends.map((trend) => {
                        const deltaPercent = trendDeltaPercent(trend);
                        return (
                          <tr key={trend.label}>
                            <td>{trend.label}</td>
                            <td>{formatTrendMetricValue(trend.latest)}</td>
                            <td>{formatTrendMetricValue(trend.previous)}</td>
                            <td>
                              <span className={`run-report-trend-delta run-report-trend-delta--${trendDeltaTone(trend)}`}>
                                <strong>{trendDeltaText(trend)}</strong>
                                {deltaPercent ? <small>{deltaPercent}</small> : null}
                              </span>
                            </td>
                            <td>{displayCount(trend.samples)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="run-report-table-wrap run-report-history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Report</th>
                        <th>Generated</th>
                        <th>Verdict</th>
                        <th>Profile</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trendData.records.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No reports</td>
                        </tr>
                      ) : trendData.records.slice(0, 8).map((record) => (
                        <tr key={record.name}>
                          <td>{record.title || record.name}</td>
                          <td>{reportTime(record.generated_at ?? record.modified_time)}</td>
                          <td>
                            <span className={`run-report-history-verdict run-report-history-verdict--${record.verdict}`}>
                              {record.verdict}
                            </span>
                          </td>
                          <td>{record.profile ?? "-"}</td>
                          <td>{record.run_duration ?? record.metrics["Run duration"]?.value ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="run-report-empty">
                {isTrendsLoading
                  ? "Loading report trends…"
                  : trendsResult && !trendsResult.ok
                    ? trendsResult.error ?? trendsResult.blocker ?? "Unable to load trends"
                    : "No trend data"}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "archives" ? (
          <section
            aria-labelledby="run-report-tab-archives"
            className={`run-report-archives run-report-archives--full ${filteredFiles.length > RUN_REPORT_ARCHIVE_PAGE_SIZE ? "run-report-archives--paginated" : ""}`}
            id="run-report-panel-archives"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="run-report-section-head">
              <strong>Archives</strong>
              <span>{filteredArchiveCountText}</span>
            </div>
            <div className="run-report-archive-tools">
              <label className="run-report-archive-search">
                <Search aria-hidden="true" size={14} />
                <input
                  aria-label="Search report archives"
                  autoComplete="off"
                  onChange={(event) => {
                    setArchiveQuery(event.target.value);
                    setArchivePage(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && archiveQuery) {
                      event.preventDefault();
                      clearArchiveQuery();
                    }
                  }}
                  placeholder="Search name, title, path, or date…"
                  spellCheck={false}
                  type="search"
                  value={archiveQuery}
                />
              </label>
              {normalizedArchiveQuery ? (
                <button
                  aria-label="Clear report archive search"
                  className="run-report-archive-search-clear"
                  onClick={clearArchiveQuery}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {filteredFiles.length > RUN_REPORT_ARCHIVE_PAGE_SIZE ? (
              <div className="workbench-pagination" aria-label="Report archive pages">
                <span>
                  Showing {archiveRangeStart}–{archiveRangeEnd} of {filteredFiles.length}
                </span>
                <button
                  className="normal-button"
                  disabled={effectiveArchivePage === 0}
                  onClick={() => setArchivePage((page) => Math.max(0, page - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="normal-button"
                  disabled={effectiveArchivePage >= archivePageCount - 1}
                  onClick={() => setArchivePage((page) => Math.min(archivePageCount - 1, page + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            ) : null}
            {renderArchiveTable(visibleArchiveFiles, archiveEmptyText)}
          </section>
        ) : null}

        {activeTab === "raw" ? (
          <section
            aria-labelledby="run-report-tab-raw"
            className="run-report-preview run-report-preview--raw"
            id="run-report-panel-raw"
            role="tabpanel"
            tabIndex={0}
          >
            <div className="run-report-section-head">
              <strong>{snapshot.title}</strong>
              <span>{snapshot.fileName}</span>
            </div>
            <div className="run-report-preview-body run-report-preview-body--raw">
              <pre>{snapshot.markdown}</pre>
            </div>
          </section>
        ) : null}
        {runReportTabs.filter((tab) => tab.id !== activeTab).map((tab) => (
          <div
            aria-labelledby={`run-report-tab-${tab.id}`}
            hidden
            id={`run-report-panel-${tab.id}`}
            key={tab.id}
            role="tabpanel"
          />
        ))}
      </div>
    </section>
  );
}
