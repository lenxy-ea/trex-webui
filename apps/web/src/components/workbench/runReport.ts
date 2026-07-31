import type {
  ProfileRecord,
  ProfileWorkbenchStream,
  SystemOverview,
  TrafficMutationEvidence,
  TrafficSession,
  TrafficSessionGroup,
  TrexCaptureFiles,
  TrexCapturePacket,
  TrexCaptureStatus,
  TrexPortRecord,
  TrexResult,
  TrexStatsSnapshot
} from "../../api";
import { displayBitRate, displayBytes, displayCount, displayLatencyUs, displayPacketRate, displayValue } from "./format";
import {
  trafficSessionDurationLabel,
  trafficSessionPorts,
  trafficSessionProfiles,
  trafficSessionRateLabel,
  trafficSessionRunGroups,
  type RunReportTrafficSession
} from "./trafficRunAuthority";
import { trexResultDiagnostic } from "./trexDiagnostics";
import type { LogRow, StatsHistorySample } from "./types";

export type { RunReportTrafficSession } from "./trafficRunAuthority";

const DHCP_MIN_PAYLOAD_BYTES = 300;
const DNS_DEFAULT_QUERY_NAME = "example.com";

export type RunReportMetric = {
  label: string;
  value: string;
};

export type RunReportVerdict = "pass" | "warn" | "fail" | "unknown";

export type RunReportCheck = {
  label: string;
  status: RunReportVerdict;
  detail: string;
};

export type RunReportDiagnostic = {
  label: string;
  status: RunReportVerdict;
  summary: string;
  action: string;
  evidence: RunReportMetric[];
};

export type RunReportTemplateId = "standard" | "throughput" | "latency" | "capture";

export type RunReportTemplate = {
  id: RunReportTemplateId;
  label: string;
  summary: string;
};

export type RunReportTemplateAssessment = {
  id: RunReportTemplateId;
  label: string;
  summary: string;
  verdict: RunReportVerdict;
  reasons: string[];
  criteria: RunReportCheck[];
};

export type RunReportConclusion = {
  verdict: RunReportVerdict;
  title: string;
  summary: string;
  reasons: string[];
  evidence: RunReportMetric[];
  checks: RunReportCheck[];
};

type CaptureLayerMatch = {
  applicable: boolean;
  status: RunReportVerdict;
  summary: string;
  action: string;
  expected: string[];
  observed: string[];
  matched: string[];
  missing: string[];
  unexpected: string[];
};

type CaptureFieldExpectation = {
  label: string;
  field: string;
  expected_values: string[];
  mode: string;
};

type CaptureFieldMatchRow = CaptureFieldExpectation & {
  stream: string;
  observed_values: string[];
  missing_values: string[];
};

type CaptureFieldMatch = {
  applicable: boolean;
  status: RunReportVerdict;
  summary: string;
  action: string;
  expected: Array<CaptureFieldExpectation & { stream: string }>;
  observed: Record<string, string[]>;
  matched: CaptureFieldMatchRow[];
  missing: CaptureFieldMatchRow[];
};

export type RunReportSnapshot = {
  title: string;
  fileName: string;
  generatedAt: string;
  template: RunReportTemplateAssessment;
  conclusion: RunReportConclusion;
  diagnostics: RunReportDiagnostic[];
  markdown: string;
  payload: Record<string, unknown>;
  metrics: RunReportMetric[];
  recentLogs: LogRow[];
};

export type RunReportCaptureFile = TrexCaptureFiles["files"][number] & {
  generated_at?: string | null;
};

type RunReportCaptureFiles = Omit<TrexCaptureFiles, "files"> & {
  files: RunReportCaptureFile[];
};

export type BuildRunReportInput = {
  captureFilesResult: TrexResult<RunReportCaptureFiles> | null;
  capturePackets: TrexCapturePacket[];
  captureStatusResult: TrexResult<TrexCaptureStatus> | null;
  generatedAt: string;
  logRows: LogRow[];
  overview: SystemOverview | null;
  portRecords: TrexPortRecord[];
  profilePath: string;
  selectedProfile: ProfileRecord | null;
  startResult: TrexResult<unknown> | null;
  statsHistory: StatsHistorySample[];
  statsResult: TrexResult<TrexStatsSnapshot> | null;
  templateId?: RunReportTemplateId;
  trafficSession?: RunReportTrafficSession | null;
  trafficMultiplier: string | null;
  workbenchStreams?: ProfileWorkbenchStream[] | null;
};

type RunReportArchive = {
  title?: unknown;
  generated_at?: unknown;
  markdown?: unknown;
  payload?: unknown;
};

export const runReportTemplates: RunReportTemplate[] = [
  {
    id: "standard",
    label: "Operational Snapshot",
    summary: "Balanced run evidence for start/stop, counters, latency, capture, and logs."
  },
  {
    id: "throughput",
    label: "Throughput Validation",
    summary: "Treat rate balance, packet delta, drops, queue pressure, and port errors as acceptance gates."
  },
  {
    id: "latency",
    label: "Latency Validation",
    summary: "Require latency evidence and correlate latency errors with drops and queue pressure."
  },
  {
    id: "capture",
    label: "Capture Troubleshooting",
    summary: "Require packet or PCAP evidence and highlight recorder/decode coverage."
  }
];

export const defaultRunReportTemplateId: RunReportTemplateId = "standard";

function runReportTemplateById(id: RunReportTemplateId | undefined) {
  return runReportTemplates.find((template) => template.id === id) ?? runReportTemplates[0];
}

function readPath(source: unknown, path: string) {
  let cursor = source;
  for (const key of path.split(".")) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function readNumber(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function objectEntries(source: unknown) {
  return source && typeof source === "object" && !Array.isArray(source)
    ? Object.entries(source as Record<string, unknown>)
    : [];
}

function cleanFileTimestamp(value: string) {
  const date = new Date(value);
  const iso = Number.isNaN(date.getTime()) ? value : date.toISOString();
  const compact = iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return compact.replace(/[^0-9TZ]/g, "") || "snapshot";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function runDurationText(startedAt: string | null | undefined, endedAt: string | null | undefined) {
  if (!startedAt || !endedAt) {
    return "-";
  }
  const started = new Date(startedAt).getTime();
  const ended = new Date(endedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return "-";
  }
  const seconds = (ended - started) / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes} min ${remainder} s`;
}

type RunCaptureFileEvidence = {
  files: RunReportCaptureFile[];
  inventoryCount: number;
  scope: "active_run_window" | "closed_run_window" | "invalid_run_window" | "no_run_session";
  windowEnd: string | null;
  windowStart: string | null;
};

function timestampMilliseconds(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function captureFileTimestamp(file: RunReportCaptureFile) {
  return timestampMilliseconds(file.generated_at) ?? timestampMilliseconds(file.modified_time);
}

function runCaptureFileEvidence(
  files: RunReportCaptureFile[],
  trafficSession: RunReportTrafficSession | null,
  generatedAt: string
): RunCaptureFileEvidence {
  if (!trafficSession) {
    return {
      files: [],
      inventoryCount: files.length,
      scope: "no_run_session",
      windowEnd: null,
      windowStart: null
    };
  }

  const windowStart = trafficSession.session.started_at;
  const primaryWindowEnd = trafficSession.session.ended_at ?? generatedAt;
  const primaryEndTimestamp = timestampMilliseconds(primaryWindowEnd);
  const captureCompletedTimestamp = timestampMilliseconds(trafficSession.captureCompletedAt);
  const windowEnd = primaryEndTimestamp !== null
    && captureCompletedTimestamp !== null
    && captureCompletedTimestamp > primaryEndTimestamp
      ? trafficSession.captureCompletedAt ?? primaryWindowEnd
      : primaryWindowEnd;
  const startTimestamp = timestampMilliseconds(windowStart);
  const endTimestamp = timestampMilliseconds(windowEnd);
  if (startTimestamp === null || endTimestamp === null || endTimestamp < startTimestamp) {
    return {
      files: [],
      inventoryCount: files.length,
      scope: "invalid_run_window",
      windowEnd,
      windowStart
    };
  }

  return {
    files: files.filter((file) => {
      const fileTimestamp = captureFileTimestamp(file);
      return fileTimestamp !== null && fileTimestamp >= startTimestamp && fileTimestamp <= endTimestamp;
    }),
    inventoryCount: files.length,
    scope: trafficSession.session.ended_at ? "closed_run_window" : "active_run_window",
    windowEnd,
    windowStart
  };
}

function runPortsText(ports: number[] | null | undefined) {
  if (ports === null) {
    return "All";
  }
  if (!ports || ports.length === 0) {
    return "-";
  }
  return ports.join(", ");
}

function profilePathLabel(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

type RunReportStopEvidence = {
  result: TrexResult<unknown> | null;
  verdict: RunReportVerdict;
  detail: string;
};

type RunReportTrafficEvidence = {
  startResult: TrexResult<unknown> | null;
  stopEvidence: RunReportStopEvidence;
};

type ValidatedStartEvidence = {
  completionByGroup: Map<TrafficSessionGroup, number>;
  result: TrexResult<unknown>;
};

function failedStartEvidence(detail: string): TrexResult<unknown> {
  return {
    ok: false,
    data: null,
    blocker: `Persisted start evidence failed verification: ${detail}`,
    error: null
  };
}

function failedStopEvidence(detail: string): RunReportStopEvidence {
  const message = `Persisted stop evidence failed verification: ${detail}`;
  return {
    result: {
      ok: false,
      data: null,
      blocker: message,
      error: null
    },
    verdict: "fail",
    detail: message
  };
}

function incompleteStopEvidence(detail: string): RunReportStopEvidence {
  return {
    result: null,
    verdict: "warn",
    detail
  };
}

function exactNumberSequence(left: number[], right: number[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function exactTextSet(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function hasUniquePorts(ports: number[]) {
  return new Set(ports).size === ports.length;
}

function exactPortSet(left: number[], right: number[]) {
  const normalizedLeft = [...new Set(left)].sort((a, b) => a - b);
  const normalizedRight = [...new Set(right)].sort((a, b) => a - b);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((port, index) => port === normalizedRight[index]);
}

function exactStoppedPortStates(
  portStates: Record<number, string>,
  ports: number[]
) {
  const statePorts = Object.keys(portStates).map(Number);
  return statePorts.every(Number.isFinite)
    && exactPortSet(statePorts, ports)
    && ports.every((port) => portStates[port] === "stopped");
}

function exactRunningPortStates(
  portStates: Record<number, string>,
  ports: number[]
) {
  const statePorts = Object.keys(portStates).map(Number);
  return statePorts.every(Number.isFinite)
    && exactPortSet(statePorts, ports)
    && ports.every((port) => portStates[port] === "running");
}

function exactPortStateRecord(
  left: Record<number, string>,
  right: Record<number, string>
) {
  const leftPorts = Object.keys(left).map(Number);
  const rightPorts = Object.keys(right).map(Number);
  return leftPorts.every(Number.isFinite)
    && rightPorts.every(Number.isFinite)
    && exactPortSet(leftPorts, rightPorts)
    && leftPorts.every((port) => left[port] === right[port]);
}

function exactMutationEvidence(
  left: TrafficMutationEvidence,
  right: TrafficMutationEvidence
) {
  return left.intent_nonce === right.intent_nonce
    && left.operation === right.operation
    && left.completion_mode === right.completion_mode
    && exactNumberSequence(left.ports, right.ports)
    && exactPortStateRecord(left.baseline_port_states, right.baseline_port_states)
    && exactPortStateRecord(left.desired_port_states, right.desired_port_states)
    && exactNumberSequence(left.baseline_acquired_ports, right.baseline_acquired_ports)
    && left.prepared_at === right.prepared_at
    && left.completed_at === right.completed_at
    && left.acquisition_restored === right.acquisition_restored
    && left.wal_cleared === right.wal_cleared;
}

function mutationLedgerError(session: TrafficSession) {
  const nonces = session.mutation_evidence.map((mutation) => mutation.intent_nonce);
  if (nonces.some((nonce) => nonce.trim() === "")) {
    return "mutation intent nonces must be non-empty";
  }
  if (new Set(nonces).size !== nonces.length) {
    return "mutation intent nonces must be globally unique";
  }
  for (const mutation of session.mutation_evidence) {
    const preparedAt = timestampMilliseconds(mutation.prepared_at);
    const completedAt = timestampMilliseconds(mutation.completed_at);
    if (preparedAt === null || completedAt === null) {
      return `intent ${mutation.intent_nonce} has an invalid timestamp`;
    }
    if (preparedAt > completedAt) {
      return `intent ${mutation.intent_nonce} completes before it is prepared`;
    }
  }
  return null;
}

function exactStopMutation(
  mutation: TrafficMutationEvidence,
  groups: TrafficSessionGroup[]
) {
  const targetPorts = groups.flatMap((group) => group.ports);
  return mutation.operation === "stop"
    && mutation.completion_mode !== "hard_stop"
    && hasUniquePorts(mutation.ports)
    && hasUniquePorts(targetPorts)
    && exactPortSet(mutation.ports, targetPorts)
    && exactStoppedPortStates(mutation.desired_port_states, mutation.ports)
    && mutation.acquisition_restored === true
    && mutation.wal_cleared === true;
}

function validateStartEvidence(
  session: TrafficSession,
  groups: TrafficSessionGroup[],
  mutationByNonce: Map<string, TrafficMutationEvidence>
): ValidatedStartEvidence | string {
  if (groups.length === 0) {
    return "canonical traffic session has no run groups";
  }
  const sessionStartedAt = timestampMilliseconds(session.started_at);
  const sessionUpdatedAt = timestampMilliseconds(session.updated_at);
  if (sessionStartedAt === null || sessionUpdatedAt === null) {
    return "session start/update timestamps must be valid";
  }
  if (sessionUpdatedAt < sessionStartedAt) {
    return "session updated_at precedes session started_at";
  }
  if (session.ended_at !== null) {
    const sessionEndedAt = timestampMilliseconds(session.ended_at);
    if (sessionEndedAt === null) {
      return "session ended_at must be a valid timestamp";
    }
    if (sessionEndedAt < sessionStartedAt || sessionUpdatedAt < sessionEndedAt) {
      return "session end/update timestamps are not monotonic";
    }
  }

  const completionByGroup = new Map<TrafficSessionGroup, number>();
  const groupStartNonces: string[] = [];
  const completedStarts: Array<{ at: string; timestamp: number }> = [];
  for (const group of groups) {
    const startEvidence = group.start_evidence;
    if (
      startEvidence === null
      || group.run_id === null
      || group.run_id.trim() === ""
      || startEvidence.intent_nonce !== group.run_id
    ) {
      return `group ${group.group_id ?? "-"} has no exact start nonce`;
    }
    const mutation = mutationByNonce.get(group.run_id);
    if (!mutation || !exactMutationEvidence(startEvidence, mutation)) {
      return `group ${group.group_id ?? "-"} start evidence does not match one exact mutation`;
    }
    if (
      mutation.operation !== "start"
      || mutation.completion_mode === "hard_stop"
      || !hasUniquePorts(group.ports)
      || !hasUniquePorts(mutation.ports)
      || !exactPortSet(mutation.ports, group.ports)
      || !exactRunningPortStates(mutation.desired_port_states, mutation.ports)
      || mutation.acquisition_restored !== true
      || mutation.wal_cleared !== true
    ) {
      return `intent ${mutation.intent_nonce} is not an exact completed start mutation`;
    }
    const completedAt = timestampMilliseconds(mutation.completed_at);
    const groupStartedAt = timestampMilliseconds(group.started_at);
    const groupUpdatedAt = timestampMilliseconds(group.updated_at);
    if (
      completedAt === null
      || groupStartedAt === null
      || groupUpdatedAt === null
      || group.started_at !== mutation.completed_at
    ) {
      return `group ${group.group_id ?? "-"} has inconsistent start timestamps`;
    }
    if (groupUpdatedAt < groupStartedAt) {
      return `group ${group.group_id ?? "-"} updated_at precedes started_at`;
    }
    if (group.ended_at !== null) {
      const groupEndedAt = timestampMilliseconds(group.ended_at);
      if (groupEndedAt === null || groupEndedAt < groupStartedAt) {
        return `group ${group.group_id ?? "-"} has an invalid ended_at timestamp`;
      }
      if (groupUpdatedAt < groupEndedAt) {
        return `group ${group.group_id ?? "-"} updated_at precedes ended_at`;
      }
    }
    if (group.hard_stop_at !== null) {
      const hardStopAt = timestampMilliseconds(group.hard_stop_at);
      if (hardStopAt === null || hardStopAt < groupStartedAt) {
        return `group ${group.group_id ?? "-"} has an invalid hard_stop_at timestamp`;
      }
    }
    groupStartNonces.push(group.run_id);
    completedStarts.push({ at: mutation.completed_at, timestamp: completedAt });
    completionByGroup.set(group, completedAt);
  }

  const startMutationNonces = session.mutation_evidence
    .filter((mutation) => mutation.operation === "start")
    .map((mutation) => mutation.intent_nonce);
  if (new Set(groupStartNonces).size !== groupStartNonces.length) {
    return "run-group start intent nonces must be unique";
  }
  if (!exactTextSet(groupStartNonces, startMutationNonces)) {
    return "start mutation nonce set does not exactly match the run-group start nonce set";
  }
  const firstCompletion = completedStarts.reduce((earliest, candidate) =>
    candidate.timestamp < earliest.timestamp ? candidate : earliest);
  if (session.started_at !== firstCompletion.at) {
    return "session started_at does not match the earliest start completion";
  }

  return {
    completionByGroup,
    result: {
      ok: true,
      data: groups.map((group) => group.start_evidence)
    }
  };
}

function validateStopEvidence(
  session: TrafficSession,
  groups: TrafficSessionGroup[],
  mutationByNonce: Map<string, TrafficMutationEvidence>,
  startCompletionByGroup: Map<TrafficSessionGroup, number>
): RunReportStopEvidence {
  if (
    groups.some((group) => group.cleanup_evidence?.completion === "hard_stop")
    || session.mutation_evidence.some((mutation) =>
      mutation.operation === "stop" && mutation.completion_mode === "hard_stop")
  ) {
    return failedStopEvidence("hard_stop cleanup is not an operator stop");
  }
  for (const group of groups) {
    const cleanup = group.cleanup_evidence;
    if (cleanup === null) {
      continue;
    }
    const cleanupCompletedAt = timestampMilliseconds(cleanup.completed_at);
    const startCompletedAt = startCompletionByGroup.get(group);
    if (
      cleanupCompletedAt === null
      || startCompletedAt === undefined
      || cleanupCompletedAt < startCompletedAt
      || group.ended_at !== cleanup.completed_at
    ) {
      return failedStopEvidence(`group ${group.group_id ?? "-"} has a non-monotonic cleanup timeline`);
    }
  }
  const operatorStopNonces: string[] = [];
  for (const group of groups) {
    const cleanup = group.cleanup_evidence;
    if (cleanup?.completion !== "operator_stop") {
      continue;
    }
    if (cleanup.intent_nonce === null || cleanup.intent_nonce.trim() === "") {
      return failedStopEvidence(`group ${group.group_id ?? "-"} has no operator-stop intent nonce`);
    }
    operatorStopNonces.push(cleanup.intent_nonce);
  }
  const stopMutationNonces = session.mutation_evidence
    .filter((mutation) => mutation.operation === "stop")
    .map((mutation) => mutation.intent_nonce);
  if (!exactTextSet(operatorStopNonces, stopMutationNonces)) {
    return failedStopEvidence(
      "stop mutation nonce set does not exactly match the operator-stop cleanup nonce set"
    );
  }
  if (session.state !== "stopped") {
    return incompleteStopEvidence(
      `Canonical traffic session is ${session.state}; exact operator-stop evidence is not available`
    );
  }
  if (session.ended_at === null || timestampMilliseconds(session.ended_at) === null) {
    return failedStopEvidence("the stopped session has no valid ended_at timestamp");
  }
  const inconsistentGroup = groups.find((group) =>
    group.ports.length === 0
    || group.state !== "stopped"
    || group.hard_stop_at !== null
    || !exactStoppedPortStates(group.port_states, group.ports));
  if (inconsistentGroup) {
    return failedStopEvidence(`group ${inconsistentGroup.group_id ?? "-"} is not fully stopped`);
  }
  const incompleteGroup = groups.find((group) =>
    group.cleanup_evidence?.completion !== "operator_stop");
  if (incompleteGroup) {
    const completion = incompleteGroup.cleanup_evidence?.completion ?? "missing";
    return incompleteStopEvidence(
      `Group ${incompleteGroup.group_id ?? "-"} cleanup evidence is ${completion}, not operator_stop`
    );
  }

  const groupsByIntent = new Map<string, TrafficSessionGroup[]>();
  const completionTimes: Array<{ at: string; timestamp: number }> = [];
  for (const group of groups) {
    const cleanup = group.cleanup_evidence;
    if (cleanup === null || cleanup.intent_nonce === null || cleanup.intent_nonce.trim() === "") {
      return failedStopEvidence(`group ${group.group_id ?? "-"} has no operator-stop intent nonce`);
    }
    if (
      cleanup.acquisition_restored !== true
      || cleanup.wal_cleared !== true
      || !exactStoppedPortStates(cleanup.final_port_states, group.ports)
    ) {
      return failedStopEvidence(`group ${group.group_id ?? "-"} has incomplete cleanup evidence`);
    }
    const completionTimestamp = timestampMilliseconds(cleanup.completed_at);
    if (
      completionTimestamp === null
      || group.ended_at === null
      || group.ended_at !== cleanup.completed_at
    ) {
      return failedStopEvidence(`group ${group.group_id ?? "-"} has inconsistent cleanup timestamps`);
    }
    completionTimes.push({ at: cleanup.completed_at, timestamp: completionTimestamp });
    const mutation = mutationByNonce.get(cleanup.intent_nonce);
    if (!mutation || mutation.operation !== "stop") {
      return failedStopEvidence(`intent ${cleanup.intent_nonce} does not reference one stop mutation`);
    }
    if (cleanup.completed_at !== mutation.completed_at) {
      return failedStopEvidence(`intent ${cleanup.intent_nonce} has mismatched completion timestamps`);
    }
    const preparedAt = timestampMilliseconds(mutation.prepared_at);
    const startCompletedAt = startCompletionByGroup.get(group);
    if (
      preparedAt === null
      || startCompletedAt === undefined
      || preparedAt < startCompletedAt
    ) {
      return failedStopEvidence(
        `intent ${cleanup.intent_nonce} is prepared before its corresponding start completes`
      );
    }
    groupsByIntent.set(
      cleanup.intent_nonce,
      [...(groupsByIntent.get(cleanup.intent_nonce) ?? []), group]
    );
  }

  for (const [intentNonce, intentGroups] of groupsByIntent) {
    const mutation = mutationByNonce.get(intentNonce);
    if (!mutation || !exactStopMutation(mutation, intentGroups)) {
      return failedStopEvidence(`intent ${intentNonce} is not an exact completed stop mutation`);
    }
  }

  const finalCompletion = completionTimes.reduce((latest, candidate) =>
    candidate.timestamp > latest.timestamp ? candidate : latest);
  if (session.ended_at !== finalCompletion.at) {
    return failedStopEvidence("session ended_at does not match the final operator-stop completion");
  }

  return {
    result: {
      ok: true,
      data: groups.map((group) => group.cleanup_evidence)
    },
    verdict: "pass",
    detail: "Exact operator-stop evidence verified"
  };
}

function persistedTrafficEvidence(
  trafficSession: RunReportTrafficSession | null,
  fallbackStartResult: TrexResult<unknown> | null
): RunReportTrafficEvidence {
  if (trafficSession === null) {
    return {
      startResult: fallbackStartResult,
      stopEvidence: {
        result: null,
        verdict: "unknown",
        detail: "No canonical traffic session is attached"
      }
    };
  }
  const session = trafficSession.session;
  if (session.evidence_version !== 1) {
    return {
      startResult: null,
      stopEvidence: incompleteStopEvidence(
        "Canonical traffic session has no versioned stop evidence or authenticated start chain"
      )
    };
  }
  const groups = trafficSessionRunGroups(session);
  const ledgerError = mutationLedgerError(session);
  if (ledgerError) {
    return {
      startResult: failedStartEvidence(ledgerError),
      stopEvidence: failedStopEvidence(ledgerError)
    };
  }
  const mutationByNonce = new Map(
    session.mutation_evidence.map((mutation) => [mutation.intent_nonce, mutation])
  );
  const startEvidence = validateStartEvidence(session, groups, mutationByNonce);
  if (typeof startEvidence === "string") {
    return {
      startResult: failedStartEvidence(startEvidence),
      stopEvidence: failedStopEvidence(`start evidence chain is invalid: ${startEvidence}`)
    };
  }
  return {
    startResult: startEvidence.result,
    stopEvidence: validateStopEvidence(
      session,
      groups,
      mutationByNonce,
      startEvidence.completionByGroup
    )
  };
}

function portStatus(port: TrexPortRecord) {
  const status = port.info.status ?? port.info.state ?? "-";
  const link = port.info.link ?? port.info.link_status ?? "-";
  return `${displayValue(status)} / ${displayValue(link)}`;
}

function activePortCount(portRecords: TrexPortRecord[], stats: TrexStatsSnapshot | null) {
  return portRecords.filter((port) => {
    const state = String(port.info.status ?? port.info.state ?? "").toLowerCase();
    if (state && !["idle", "down"].includes(state)) {
      return true;
    }
    const portStats = stats ? readPath(stats, String(port.id)) : null;
    return ["tx_pps", "rx_pps", "tx_bps", "rx_bps"].some((path) => {
      const activity = readNumber(portStats, [path]);
      return activity !== null && Math.abs(activity) > 0.001;
    });
  }).length;
}

function latencyErrorCounts(source: unknown) {
  return {
    dropped: readNumber(source, ["err.dropped", "err_cntrs.dropped", "errors.dropped", "dropped"]) ?? 0,
    dup: readNumber(source, ["err.dup", "err_cntrs.dup", "errors.dup", "dup"]) ?? 0,
    outOfOrder: readNumber(source, ["err.out_of_order", "err_cntrs.out_of_order", "errors.out_of_order", "out_of_order"]) ?? 0,
    seqToHigh: readNumber(source, ["err.seq_too_high", "err_cntrs.seq_too_high", "errors.seq_too_high", "seq_too_high"]) ?? 0,
    seqToLow: readNumber(source, ["err.seq_too_low", "err_cntrs.seq_too_low", "errors.seq_too_low", "seq_too_low"]) ?? 0
  };
}

function latencyErrorTotal(source: unknown) {
  const explicit = readNumber(source, [
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

function latencyErrorTotalAll(source: unknown) {
  return objectEntries(source)
    .filter(([scope]) => scope !== "global" && scope !== "total")
    .reduce((total, [, value]) => total + latencyErrorTotal(value), 0);
}

function streamPacketCount(source: unknown, direction: "tx" | "rx") {
  return readNumber(source, direction === "tx"
    ? ["tx_pkts.total", "tx_pkts", "tx_packets", "tp", "opackets"]
    : ["rx_pkts.total", "rx_pkts", "rx_packets", "rp", "ipackets"]);
}

function flowStatsIssues(stats: TrexStatsSnapshot | null) {
  const issues: string[] = [];
  for (const [scope, value] of objectEntries(stats?.flow_stats)) {
    if (scope === "global" || scope === "total") {
      continue;
    }
    const txPackets = streamPacketCount(value, "tx");
    const rxPackets = streamPacketCount(value, "rx");
    if (txPackets !== null && rxPackets !== null && txPackets > rxPackets) {
      issues.push(`PG ${scope} rx deficit ${displayCount(txPackets - rxPackets)}`);
    }
    if (issues.length >= 3) {
      break;
    }
  }
  return issues;
}

function packetMismatchIssue(stats: TrexStatsSnapshot | null) {
  const total = readPath(stats, "total");
  const txPackets = readNumber(total, ["opackets"]);
  const rxPackets = readNumber(total, ["ipackets"]);
  if (txPackets === null || rxPackets === null || txPackets === 0 || rxPackets === 0 || txPackets === rxPackets) {
    return null;
  }
  return `Total packet delta ${displayCount(Math.abs(txPackets - rxPackets))}`;
}

function totalPacketCount(stats: TrexStatsSnapshot | null, direction: "tx" | "rx") {
  const total = readPath(stats, "total");
  const global = readPath(stats, "global");
  return readNumber(total, direction === "tx" ? ["opackets", "tx_pkts", "tx_packets"] : ["ipackets", "rx_pkts", "rx_packets"])
    ?? readNumber(global, direction === "tx" ? ["opackets", "tx_pkts", "tx_packets"] : ["ipackets", "rx_pkts", "rx_packets"])
    ?? 0;
}

function portErrorTotal(stats: TrexStatsSnapshot | null, portRecords: TrexPortRecord[]) {
  const portScopes: unknown[] = portRecords.length
    ? portRecords.map((port) => readPath(stats, String(port.id)))
    : objectEntries(stats).filter(([scope]) => /^\d+$/.test(scope)).map(([, value]) => value);
  return portScopes.reduce<number>((total, value) => total + (
    readNumber(value, ["oerrors"]) ?? 0
  ) + (
    readNumber(value, ["ierrors"]) ?? 0
  ) + (
    readNumber(value, ["tx_errors"]) ?? 0
  ) + (
    readNumber(value, ["rx_errors"]) ?? 0
  ) + (
    readNumber(value, ["errors"]) ?? 0
  ), 0);
}

function latestStatsFallback(statsHistory: StatsHistorySample[]) {
  return statsHistory[statsHistory.length - 1] ?? null;
}

function markdownTable(rows: Array<[string, string]>) {
  return [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([field, value]) => `| ${markdownCell(field)} | ${markdownCell(value)} |`)
  ].join("\n");
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const escaped = text.replace(/"/g, "\"\"");
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function csvRows(rows: unknown[][]) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function objectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function csvFileName(fileName: string) {
  if (/\.json$/i.test(fileName)) {
    return fileName.replace(/\.json$/i, ".csv");
  }
  if (/\.md$/i.test(fileName)) {
    return fileName.replace(/\.md$/i, ".csv");
  }
  return `${fileName || "trex-run-report"}.csv`;
}

function pdfFileName(fileName: string) {
  if (/\.json$/i.test(fileName)) {
    return fileName.replace(/\.json$/i, ".pdf");
  }
  if (/\.md$/i.test(fileName)) {
    return fileName.replace(/\.md$/i, ".pdf");
  }
  if (/\.csv$/i.test(fileName)) {
    return fileName.replace(/\.csv$/i, ".pdf");
  }
  return `${fileName || "trex-run-report"}.pdf`;
}

function percentGapText(a: number | null, b: number | null) {
  if (a === null || b === null || (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9)) {
    return null;
  }
  const gap = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) * 100;
  return `${gap.toFixed(gap < 10 ? 1 : 0).replace(/\.0$/, "")}%`;
}

function percentGapValue(a: number | null, b: number | null) {
  if (a === null || b === null || (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9)) {
    return null;
  }
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) * 100;
}

function verdictWeight(verdict: RunReportVerdict) {
  if (verdict === "fail") {
    return 3;
  }
  if (verdict === "warn") {
    return 2;
  }
  if (verdict === "unknown") {
    return 1;
  }
  return 0;
}

function highestVerdict(verdicts: RunReportVerdict[]): RunReportVerdict {
  return verdicts.reduce<RunReportVerdict>((highest, verdict) =>
    verdictWeight(verdict) > verdictWeight(highest) ? verdict : highest
  , "pass");
}

function templateVerdictTitle(template: RunReportTemplate, verdict: RunReportVerdict) {
  if (verdict === "pass") {
    return `${template.label} Pass`;
  }
  if (verdict === "fail") {
    return `${template.label} Fail`;
  }
  if (verdict === "warn") {
    return `${template.label} Warning`;
  }
  return `${template.label} Missing Evidence`;
}

function runReportEvidence(metrics: Array<[string, string]>) {
  return metrics.map(([label, value]) => ({ label, value }));
}

function capturePacketLayerChain(packet: TrexCapturePacket): string {
  const layers = packet.decoded_layers?.map((layer) => layer.name).filter(Boolean) ?? [];
  return layers.length ? layers.join(" > ") : "-";
}

function capturePacketFieldMap(packet: TrexCapturePacket) {
  const fields: Record<string, string[]> = {};
  const layerCounts = new Map<string, number>();
  const addFieldValue = (key: string, value: string) => {
    const values = fields[key] ?? [];
    if (!values.includes(value)) {
      values.push(value);
    }
    fields[key] = values;
  };
  for (const layer of packet.decoded_layers ?? []) {
    const layerName = layer.name.trim();
    if (!layerName) {
      continue;
    }
    const layerIndex = (layerCounts.get(layerName) ?? 0) + 1;
    layerCounts.set(layerName, layerIndex);
    for (const field of layer.fields ?? []) {
      const fieldName = field.name.trim();
      const value = field.value.trim();
      if (!fieldName || !value) {
        continue;
      }
      const plainKey = `${layerName}.${fieldName}`;
      addFieldValue(`${layerName}[${layerIndex}].${fieldName}`, value);
      if (layerIndex === 1) {
        addFieldValue(plainKey, value);
      }
    }
  }
  return fields;
}

function captureFieldSummary(capturePackets: TrexCapturePacket[]) {
  const fields = new Map<string, string[]>();
  let decodedPackets = 0;
  for (const packet of capturePackets) {
    const packetFields = capturePacketFieldMap(packet);
    if (Object.keys(packetFields).length === 0) {
      continue;
    }
    decodedPackets += 1;
    for (const [key, packetValues] of Object.entries(packetFields)) {
      const values = fields.get(key) ?? [];
      for (const value of packetValues) {
        if (!values.includes(value)) {
          values.push(value);
        }
      }
      fields.set(key, values);
    }
  }
  return {
    packet_count: capturePackets.length,
    decoded_packets: decodedPackets,
    fields: Object.fromEntries([...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, values.slice(0, 32)]))
  };
}

function textStreamValue(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const value = (stream as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function intStreamValue(stream: ProfileWorkbenchStream, key: string, fallback: number) {
  const value = (stream as unknown as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return fallback;
}

function streamFieldMode(stream: ProfileWorkbenchStream, key: string) {
  const value = (stream as unknown as Record<string, unknown>)[`${key}_mode`];
  return typeof value === "string" && value.trim() ? value.trim() : "Fixed";
}

function resolveStreamKey(stream: ProfileWorkbenchStream, primary: string, aliases: string[] = []) {
  const record = stream as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, primary)) {
    return primary;
  }
  return aliases.find((alias) => Object.prototype.hasOwnProperty.call(record, alias)) ?? primary;
}

function streamFieldCount(stream: ProfileWorkbenchStream, key: string) {
  return Math.max(1, Math.min(intStreamValue(stream, `${key}_count`, 1), 16));
}

function streamFieldStep(stream: ProfileWorkbenchStream, key: string) {
  return intStreamValue(stream, `${key}_step`, 1);
}

function deterministicIntValues(stream: ProfileWorkbenchStream, key: string, fallback: number) {
  const mode = streamFieldMode(stream, key);
  const start = intStreamValue(stream, key, fallback);
  return deterministicIntValuesFrom(start, mode, streamFieldCount(stream, key), streamFieldStep(stream, key));
}

function deterministicIntValuesFor(
  stream: ProfileWorkbenchStream,
  valueKey: string,
  fieldKey: string,
  fallback: number
) {
  const mode = streamFieldMode(stream, fieldKey);
  const start = intStreamValue(stream, valueKey, fallback);
  return deterministicIntValuesFrom(start, mode, streamFieldCount(stream, fieldKey), streamFieldStep(stream, fieldKey));
}

function deterministicIntValuesFrom(start: number, mode: string, count: number, step: number) {
  if (mode === "Fixed") {
    return [String(start)];
  }
  if (mode === "Increment") {
    return Array.from({ length: count }, (_, index) => String(start + index * step));
  }
  if (mode === "Decrement") {
    return Array.from({ length: count }, (_, index) => String(start - index * step));
  }
  return [];
}

function hexIntText(value: number, width: number) {
  return `0x${(Math.trunc(value) >>> 0).toString(16).padStart(width, "0")}`;
}

function deterministicHexIntValues(stream: ProfileWorkbenchStream, key: string, fallback: number, width = 8) {
  return deterministicIntValues(stream, key, fallback).map((value) => hexIntText(Number(value), width));
}

function isStreamIntFieldCustomized(stream: ProfileWorkbenchStream, key: string, fallback: number) {
  return streamFieldMode(stream, key) !== "Fixed" || intStreamValue(stream, key, fallback) !== fallback;
}

function ipv4ToBigInt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let result = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    result = (result << 8n) + BigInt(octet);
  }
  return result;
}

function bigIntToIpv4(value: bigint) {
  if (value < 0n || value > 0xffffffffn) {
    return null;
  }
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join(".");
}

function expandIpv6(value: string) {
  const lower = value.toLowerCase();
  const parts = lower.split("::");
  if (parts.length > 2) {
    return null;
  }
  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : [];
  if (parts.length === 1 && left.length !== 8) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (parts.length === 1 && missing !== 0)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: parts.length === 2 ? missing : 0 }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

function ipv6ToBigInt(value: string) {
  const groups = expandIpv6(value);
  if (!groups) {
    return null;
  }
  return groups.reduce((total, group) => (total << 16n) + BigInt(group), 0n);
}

function bigIntToIpv6(value: bigint) {
  if (value < 0n || value > ((1n << 128n) - 1n)) {
    return null;
  }
  const groups = Array.from({ length: 8 }, (_, index) => {
    const shift = BigInt((7 - index) * 16);
    return Number((value >> shift) & 0xffffn).toString(16);
  });
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== "0") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === "0") {
      end += 1;
    }
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }
  if (bestLength < 2) {
    return groups.join(":");
  }
  const left = groups.slice(0, bestStart).join(":");
  const right = groups.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`.replace(/^:/, "::").replace(/:$/, "::");
}

function ipToBigInt(value: string) {
  return value.includes(":") ? ipv6ToBigInt(value) : ipv4ToBigInt(value);
}

function bigIntToIp(value: bigint, family: "ipv4" | "ipv6") {
  return family === "ipv6" ? bigIntToIpv6(value) : bigIntToIpv4(value);
}

function deterministicIpValues(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const mode = streamFieldMode(stream, key);
  const startText = textStreamValue(stream, key, fallback);
  const family = startText.includes(":") ? "ipv6" : "ipv4";
  const start = ipToBigInt(startText);
  if (mode === "Fixed" || start === null) {
    return mode === "Fixed" ? [startText] : [];
  }
  if (mode === "Increment Host" || mode === "Decrement Host") {
    const sign = mode === "Increment Host" ? 1n : -1n;
    const step = BigInt(streamFieldStep(stream, key));
    return Array.from({ length: streamFieldCount(stream, key) }, (_, index) => bigIntToIp(start + sign * BigInt(index) * step, family))
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

function macToBigInt(value: string) {
  const parts = value.split(":");
  if (parts.length !== 6) {
    return null;
  }
  let result = 0n;
  for (const part of parts) {
    if (!/^[0-9a-fA-F]{2}$/.test(part)) {
      return null;
    }
    result = (result << 8n) + BigInt(Number.parseInt(part, 16));
  }
  return result;
}

function bigIntToMac(value: bigint) {
  if (value < 0n || value > 0xffffffffffffn) {
    return null;
  }
  return [40n, 32n, 24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 0xffn).toString(16).padStart(2, "0"))
    .join(":");
}

function deterministicMacValues(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const mode = streamFieldMode(stream, key);
  const startText = textStreamValue(stream, key, fallback);
  const start = macToBigInt(startText);
  if (mode === "Fixed" || start === null) {
    return mode === "Fixed" ? [start !== null ? bigIntToMac(start) ?? startText.toLowerCase() : startText.toLowerCase()] : [];
  }
  if (mode === "Increment" || mode === "Decrement") {
    const sign = mode === "Increment" ? 1n : -1n;
    const step = BigInt(streamFieldStep(stream, key));
    return Array.from({ length: streamFieldCount(stream, key) }, (_, index) => bigIntToMac(start + sign * BigInt(index) * step))
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

function hexWordValue(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const rawValue = textStreamValue(stream, key, fallback).trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,4}$/.test(rawValue)) {
    return `0x${fallback.toLowerCase().replace(/^0x/i, "").padStart(4, "0").slice(-4)}`;
  }
  return `0x${Number.parseInt(rawValue, 16).toString(16).padStart(4, "0")}`;
}

function hexDwordValue(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const rawValue = textStreamValue(stream, key, fallback).trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,8}$/.test(rawValue)) {
    return `0x${fallback.toLowerCase().replace(/^0x/i, "").padStart(8, "0").slice(-8)}`;
  }
  return `0x${Number.parseInt(rawValue, 16).toString(16).padStart(8, "0")}`;
}

function deterministicHexWordValues(stream: ProfileWorkbenchStream, key: string, fallback: string) {
  const mode = streamFieldMode(stream, key);
  const start = Number.parseInt(hexWordValue(stream, key, fallback).slice(2), 16);
  if (mode === "Fixed") {
    return [hexWordValue(stream, key, fallback)];
  }
  if (mode === "Increment") {
    const step = streamFieldStep(stream, key);
    return Array.from({ length: streamFieldCount(stream, key) }, (_, index) => hexIntText((start + index * step) & 0xffff, 4));
  }
  if (mode === "Decrement") {
    const step = streamFieldStep(stream, key);
    return Array.from({ length: streamFieldCount(stream, key) }, (_, index) => hexIntText((start - index * step) & 0xffff, 4));
  }
  return [];
}

function captureFieldExpectation(
  label: string,
  field: string,
  values: string[],
  mode: string
): CaptureFieldExpectation | null {
  const expectedValues = uniqueText(values);
  if (!expectedValues.length) {
    return null;
  }
  return {
    label,
    field,
    expected_values: expectedValues,
    mode
  };
}

function addEthernetExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const record = stream as unknown as Record<string, unknown>;
  const destinationMode = typeof record.ether_dst_mode === "string" ? record.ether_dst_mode.trim() : "";
  const sourceMode = typeof record.ether_src_mode === "string" ? record.ether_src_mode.trim() : "";
  const rows = [
    destinationMode && destinationMode !== "TRex Config"
      ? captureFieldExpectation(
        "Ethernet Destination",
        "Ethernet.Destination",
        deterministicMacValues(stream, "ether_dst", "00:00:00:00:00:00"),
        streamFieldMode(stream, "ether_dst")
      )
      : null,
    sourceMode && sourceMode !== "TRex Config"
      ? captureFieldExpectation(
        "Ethernet Source",
        "Ethernet.Source",
        deterministicMacValues(stream, "ether_src", "00:00:00:00:00:00"),
        streamFieldMode(stream, "ether_src")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function fieldEngineCountText(stream: ProfileWorkbenchStream, base: string) {
  const record = stream as unknown as Record<string, unknown>;
  const count = record[`${base}_count`];
  const step = record[`${base}_step`];
  const details: string[] = [];
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    details.push(`x${count}`);
  }
  if (typeof step === "number" && Number.isFinite(step)) {
    details.push(`step ${step}`);
  }
  return details.length ? ` ${details.join(" ")}` : "";
}

function fieldEngineLabel(base: string) {
  const labels: Record<string, string> = {
    arp: "ARP",
    cfi: "CFI",
    checksum: "checksum",
    dhcp: "DHCP",
    dns: "DNS",
    dscp: "DSCP",
    dst: "dst",
    ecn: "ECN",
    gre: "GRE",
    gtpu: "GTP-U",
    icmp: "ICMP",
    icmpv6: "ICMPv6",
    id: "ID",
    inner: "inner",
    ip: "IP",
    ipv4: "IPv4",
    ipv6: "IPv6",
    l4: "L4",
    mpls: "MPLS",
    mss: "MSS",
    npdu: "N-PDU",
    port: "port",
    ra: "RA",
    sctp: "SCTP",
    src: "src",
    tcp: "TCP",
    tc: "TC",
    teid: "TEID",
    ttl: "TTL",
    udp: "UDP",
    vlan: "VLAN",
    vxlan: "VXLAN",
    xid: "XID"
  };
  return base
    .split("_")
    .map((token) => labels[token] ?? token.replace(/^\w/, (value) => value.toUpperCase()))
    .join(" ");
}

function workbenchFieldEngines(stream: ProfileWorkbenchStream) {
  const record = stream as unknown as Record<string, unknown>;
  const engines: string[] = [];
  if (stream.frame_length_type !== "Fixed") {
    engines.push(`Frame length: ${stream.frame_length_type} ${stream.frame_length_min}-${stream.frame_length_max}`);
  }
  for (const [key, value] of Object.entries(record)) {
    if (!key.endsWith("_mode") || typeof value !== "string" || value === "Fixed" || value === "TRex Config") {
      continue;
    }
    const base = key.replace(/_mode$/, "");
    engines.push(`${fieldEngineLabel(base)}: ${value}${fieldEngineCountText(stream, base)}`);
  }
  const advancedVm = stream.advanced_vm;
  const instructions = advancedVm && typeof advancedVm === "object" && Array.isArray((advancedVm as { instructions?: unknown }).instructions)
    ? (advancedVm as { instructions: unknown[] }).instructions.length
    : 0;
  if (stream.advanced_mode && instructions > 0) {
    engines.push(`Advanced VM: ${displayCount(instructions)} instruction(s)`);
  }
  return engines;
}

function workbenchPacketType(stream: ProfileWorkbenchStream) {
  if (stream.gtpu_enabled) {
    return `Ethernet/IPv4/UDP/GTP-U ${stream.gtpu_inner_ip_version}`;
  }
  if (stream.vxlan_enabled) {
    const inner = stream.vxlan_inner_ip_version === "IPv6" ? "IPv6" : "IPv4";
    return `Ethernet/IPv4/UDP/VXLAN ${inner}`;
  }
  return stream.packet_type;
}

function workbenchExpectedLayerChain(stream: ProfileWorkbenchStream) {
  if (stream.gtpu_enabled) {
    return [
      "Ethernet",
      "IPv4",
      "UDP",
      "GTP-U",
      stream.gtpu_extension_enabled ? "GTP-U Extension" : "",
      stream.gtpu_inner_ip_version,
      "UDP"
    ].filter(Boolean).join(" > ");
  }
  if (stream.vxlan_enabled) {
    const inner = stream.vxlan_inner_ip_version === "IPv6" ? "IPv6" : "IPv4";
    return `Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > ${inner} > UDP`;
  }
  if (stream.packet_type.endsWith("/GRE")) {
    const inner = greInnerIpVersion(stream);
    return stream.packet_type.startsWith("Ethernet/IPv6")
      ? `Ethernet > IPv6 > GRE > ${inner} > UDP`
      : `Ethernet > IPv4 > GRE > ${inner} > UDP`;
  }
  if (stream.dns_enabled && stream.packet_type.endsWith("/UDP")) {
    return `${stream.packet_type.split("/").join(" > ")} > DNS`;
  }
  if (stream.dhcp_enabled && stream.packet_type === "Ethernet/IPv4/UDP") {
    return "Ethernet > IPv4 > UDP > DHCP";
  }
  return stream.packet_type.split("/").join(" > ");
}

function addIpExpectations(
  expectations: CaptureFieldExpectation[],
  stream: ProfileWorkbenchStream,
  options: {
    layerPrefix: string;
    sourceKey: string;
    sourceDefault: string;
    destinationKey: string;
    destinationDefault: string;
    ttlKey: string;
    ttlDefault: number;
    ttlLabel: string;
    sourceAliases?: string[];
    destinationAliases?: string[];
  }
) {
  const sourceKey = resolveStreamKey(stream, options.sourceKey, options.sourceAliases);
  const destinationKey = resolveStreamKey(stream, options.destinationKey, options.destinationAliases);
  const rows = [
    captureFieldExpectation(
      `${options.layerPrefix} Source`,
      `${options.layerPrefix}.Source`,
      deterministicIpValues(stream, sourceKey, options.sourceDefault),
      streamFieldMode(stream, sourceKey)
    ),
    captureFieldExpectation(
      `${options.layerPrefix} Destination`,
      `${options.layerPrefix}.Destination`,
      deterministicIpValues(stream, destinationKey, options.destinationDefault),
      streamFieldMode(stream, destinationKey)
    ),
    captureFieldExpectation(
      `${options.layerPrefix} ${options.ttlLabel}`,
      `${options.layerPrefix}.${options.ttlLabel}`,
      deterministicIntValues(stream, options.ttlKey, options.ttlDefault),
      streamFieldMode(stream, options.ttlKey)
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function ipv4FlagsText(stream: ProfileWorkbenchStream) {
  const flags: string[] = [];
  if (stream.ipv4_flag_df) {
    flags.push("DF");
  }
  if (stream.ipv4_flag_mf) {
    flags.push("MF");
  }
  return flags.length ? flags.join(", ") : "-";
}

function addIpv4HeaderExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream, layerPrefix = "IPv4") {
  const envelope = ipv4FixedEnvelope(stream);
  const protocol = ipv4ProtocolName(stream);
  const rows = [
    envelope && protocol
      ? captureFieldExpectation(
        `${layerPrefix} Protocol`,
        `${layerPrefix}.Protocol`,
        [protocol],
        "Fixed"
      )
      : null,
    envelope
      ? captureFieldExpectation(
        `${layerPrefix} Header Length`,
        `${layerPrefix}.Header Length`,
        [String(envelope.headerLength)],
        "Fixed"
      )
      : null,
    envelope
      ? captureFieldExpectation(
        `${layerPrefix} Total Length`,
        `${layerPrefix}.Total Length`,
        [String(envelope.totalLength)],
        "Fixed"
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv4_dscp", 0)
      ? captureFieldExpectation(
        `${layerPrefix} DSCP`,
        `${layerPrefix}.DSCP`,
        deterministicIntValues(stream, "ipv4_dscp", 0),
        streamFieldMode(stream, "ipv4_dscp")
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv4_ecn", 0)
      ? captureFieldExpectation(
        `${layerPrefix} ECN`,
        `${layerPrefix}.ECN`,
        deterministicIntValues(stream, "ipv4_ecn", 0),
        streamFieldMode(stream, "ipv4_ecn")
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv4_id", 1234)
      ? captureFieldExpectation(
        `${layerPrefix} Identification`,
        `${layerPrefix}.Identification`,
        deterministicIntValues(stream, "ipv4_id", 1234),
        streamFieldMode(stream, "ipv4_id")
      )
      : null,
    stream.ipv4_flag_df || stream.ipv4_flag_mf
      ? captureFieldExpectation(
        `${layerPrefix} Flags`,
        `${layerPrefix}.Flags`,
        [ipv4FlagsText(stream)],
        "Fixed"
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv4_fragment_offset", 0)
      ? captureFieldExpectation(
        `${layerPrefix} Fragment Offset`,
        `${layerPrefix}.Fragment Offset`,
        deterministicIntValues(stream, "ipv4_fragment_offset", 0),
        streamFieldMode(stream, "ipv4_fragment_offset")
      )
      : null,
    canExpectIpv4Checksum(stream)
      ? captureFieldExpectation(
        `${layerPrefix} Checksum`,
        `${layerPrefix}.Checksum`,
        deterministicHexWordValues(stream, "ipv4_checksum", "0000"),
        "Fixed"
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function ipv4ProtocolName(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.startsWith("Ethernet/IPv4")) {
    return null;
  }
  if (stream.packet_type.endsWith("/UDP")) {
    return "UDP";
  }
  if (stream.packet_type.endsWith("/TCP")) {
    return "TCP";
  }
  if (stream.packet_type.endsWith("/ICMP")) {
    return "ICMP";
  }
  if (stream.packet_type.endsWith("/GRE")) {
    return "GRE";
  }
  if (stream.packet_type.endsWith("/SCTP")) {
    return "SCTP";
  }
  return null;
}

function ipv4FixedEnvelope(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.startsWith("Ethernet/IPv4")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  return {
    headerLength: 20,
    totalLength: Math.max(20, packetLengthWithoutFcs - workbenchL2HeaderLength(stream))
  };
}

function addIpv6HeaderExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream, layerPrefix = "IPv6") {
  const nextHeader = ipv6NextHeaderName(stream);
  const payloadLength = ipv6FixedPayloadLength(stream);
  const rows = [
    nextHeader
      ? captureFieldExpectation(
        `${layerPrefix} Next Header`,
        `${layerPrefix}.Next Header`,
        [nextHeader],
        "Fixed"
      )
      : null,
    payloadLength !== null
      ? captureFieldExpectation(
        `${layerPrefix} Payload Length`,
        `${layerPrefix}.Payload Length`,
        [String(payloadLength)],
        "Fixed"
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv6_traffic_class", 0)
      ? captureFieldExpectation(
        `${layerPrefix} Traffic Class`,
        `${layerPrefix}.Traffic Class`,
        deterministicIntValues(stream, "ipv6_traffic_class", 0),
        streamFieldMode(stream, "ipv6_traffic_class")
      )
      : null,
    isStreamIntFieldCustomized(stream, "ipv6_flow_label", 0)
      ? captureFieldExpectation(
        `${layerPrefix} Flow Label`,
        `${layerPrefix}.Flow Label`,
        deterministicIntValues(stream, "ipv6_flow_label", 0),
        streamFieldMode(stream, "ipv6_flow_label")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function ipv6NextHeaderName(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.startsWith("Ethernet/IPv6")) {
    return null;
  }
  if (stream.packet_type.endsWith("/UDP")) {
    return "UDP";
  }
  if (stream.packet_type.endsWith("/TCP")) {
    return "TCP";
  }
  if (stream.packet_type.endsWith("/ICMPv6")) {
    return "ICMPv6";
  }
  if (stream.packet_type.endsWith("/GRE")) {
    return "GRE";
  }
  if (stream.packet_type.endsWith("/SCTP")) {
    return "SCTP";
  }
  return null;
}

function fixedWorkbenchPacketLengthWithoutFcs(stream: ProfileWorkbenchStream) {
  if (!Object.prototype.hasOwnProperty.call(stream, "frame_length") || stream.frame_length_type !== "Fixed") {
    return null;
  }
  const frameLength = intStreamValue(stream, "frame_length", 0);
  return frameLength > 0 ? Math.max(60, frameLength - 4, workbenchMinimumPacketLengthWithoutFcs(stream)) : null;
}

function workbenchHasDhcp(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv4/UDP" && stream.dhcp_enabled && !stream.vxlan_enabled && !stream.gtpu_enabled;
}

function workbenchHasDns(stream: ProfileWorkbenchStream) {
  return stream.packet_type.endsWith("/UDP") && stream.dns_enabled && !stream.vxlan_enabled && !stream.gtpu_enabled;
}

function workbenchHasGre(stream: ProfileWorkbenchStream) {
  return stream.packet_type.endsWith("/GRE");
}

function workbenchHasVxlan(stream: ProfileWorkbenchStream) {
  return Boolean(stream.vxlan_enabled);
}

function workbenchHasGtpu(stream: ProfileWorkbenchStream) {
  return Boolean(stream.gtpu_enabled);
}

function workbenchHasSctp(stream: ProfileWorkbenchStream) {
  return stream.packet_type.endsWith("/SCTP");
}

function workbenchIsIcmpv6RouterSolicitation(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && intStreamValue(stream, "icmp_type", 0) === 133;
}

function workbenchIsIcmpv6RouterAdvertisement(stream: ProfileWorkbenchStream) {
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && intStreamValue(stream, "icmp_type", 0) === 134;
}

function workbenchIsIcmpv6NeighborDiscovery(stream: ProfileWorkbenchStream) {
  const icmpType = intStreamValue(stream, "icmp_type", 0);
  return stream.packet_type === "Ethernet/IPv6/ICMPv6" && (icmpType === 135 || icmpType === 136);
}

function workbenchIsIcmpv6Control(stream: ProfileWorkbenchStream) {
  return workbenchIsIcmpv6RouterSolicitation(stream)
    || workbenchIsIcmpv6RouterAdvertisement(stream)
    || workbenchIsIcmpv6NeighborDiscovery(stream);
}

function icmpHeaderLength(stream: ProfileWorkbenchStream) {
  if (workbenchIsIcmpv6RouterSolicitation(stream)) {
    return 8 + (stream.icmpv6_rs_include_slla !== false ? 8 : 0);
  }
  if (workbenchIsIcmpv6RouterAdvertisement(stream)) {
    return 16
      + (stream.icmpv6_ra_include_slla !== false ? 8 : 0)
      + (stream.icmpv6_ra_include_prefix !== false ? 32 : 0);
  }
  if (workbenchIsIcmpv6NeighborDiscovery(stream)) {
    return 24 + (stream.icmpv6_nd_include_option !== false ? 8 : 0);
  }
  return 8;
}

function workbenchMinimumPacketLengthWithoutFcs(stream: ProfileWorkbenchStream) {
  if (workbenchHasDhcp(stream)) {
    return workbenchL2HeaderLength(stream) + workbenchL3HeaderLength(stream) + 8 + DHCP_MIN_PAYLOAD_BYTES;
  }
  if (workbenchHasDns(stream)) {
    return workbenchL2HeaderLength(stream) + workbenchL3HeaderLength(stream) + 8 + dnsQueryPayloadLength(stream);
  }
  if (workbenchIsIcmpv6Control(stream)) {
    return workbenchL2HeaderLength(stream) + 40 + icmpHeaderLength(stream);
  }
  if (workbenchHasGre(stream)) {
    const innerL3Length = greInnerIpVersion(stream) === "IPv6" ? 40 : 20;
    return workbenchL2HeaderLength(stream) + workbenchL3HeaderLength(stream) + greHeaderLength(stream) + innerL3Length + 8;
  }
  if (workbenchHasSctp(stream)) {
    return workbenchL2HeaderLength(stream) + workbenchL3HeaderLength(stream) + 28;
  }
  if (workbenchHasGtpu(stream)) {
    const innerL3Length = stream.gtpu_inner_ip_version === "IPv6" ? 40 : 20;
    return workbenchL2HeaderLength(stream) + 20 + 8 + 8 + gtpuOptionalHeaderLength(stream) + gtpuExtensionHeaderLength(stream) + innerL3Length + 8;
  }
  if (workbenchHasVxlan(stream)) {
    const innerL3Length = stream.vxlan_inner_ip_version === "IPv6" ? 40 : 20;
    return workbenchL2HeaderLength(stream) + 20 + 8 + 8 + 14 + innerL3Length + 8;
  }
  return 60;
}

function dnsQueryPayloadLength(stream: ProfileWorkbenchStream) {
  const queryName = textStreamValue(stream, "dns_query_name", DNS_DEFAULT_QUERY_NAME).replace(/\.$/, "");
  const labels = queryName ? queryName.split(".") : [""];
  const qnameLength = labels.reduce((total, label) => total + 1 + label.length, 1);
  return 12 + qnameLength + 4 + (stream.dns_answer_enabled ? 16 : 0);
}

function ipv6FixedPayloadLength(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.startsWith("Ethernet/IPv6")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  return Math.max(0, packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - 40);
}

function addL4PortExpectations(
  expectations: CaptureFieldExpectation[],
  stream: ProfileWorkbenchStream,
  options: {
    layerPrefix: string;
    sourceKey: string;
    destinationKey: string;
    sourceDefault: number;
    destinationDefault: number;
  }
) {
  const rows = [
    captureFieldExpectation(
      `${options.layerPrefix} Source Port`,
      `${options.layerPrefix}.Source Port`,
      deterministicIntValues(stream, options.sourceKey, options.sourceDefault),
      streamFieldMode(stream, options.sourceKey)
    ),
    captureFieldExpectation(
      `${options.layerPrefix} Destination Port`,
      `${options.layerPrefix}.Destination Port`,
      deterministicIntValues(stream, options.destinationKey, options.destinationDefault),
      streamFieldMode(stream, options.destinationKey)
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addUdpHeaderExpectations(
  expectations: CaptureFieldExpectation[],
  stream: ProfileWorkbenchStream,
  options: {
    layerPrefix?: string;
    udpLengths?: { values: string[]; mode: string } | null;
    includeChecksum?: boolean;
  } = {}
) {
  const layerPrefix = options.layerPrefix ?? "UDP";
  const udpLengths = options.udpLengths === undefined ? deterministicUdpLengths(stream) : options.udpLengths;
  const udpPayloadLengths = deterministicUdpPayloadLengths(udpLengths);
  const rows = [
    udpLengths
      ? captureFieldExpectation(
        `${layerPrefix} Length`,
        `${layerPrefix}.Length`,
        udpLengths.values,
        udpLengths.mode
      )
      : null,
    udpPayloadLengths
      ? captureFieldExpectation(
        `${layerPrefix} Payload Length`,
        `${layerPrefix}.Payload Length`,
        udpPayloadLengths.values,
        udpPayloadLengths.mode
      )
      : null,
    options.includeChecksum !== false
      && stream.udp_checksum_override
      && canExpectUdpChecksum(stream)
      ? captureFieldExpectation(
        `${layerPrefix} Checksum`,
        `${layerPrefix}.Checksum`,
        deterministicHexWordValues(stream, "udp_checksum", "0000"),
        streamFieldMode(stream, "udp_checksum")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function deterministicUdpLengths(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.endsWith("/UDP")) {
    return null;
  }
  if (stream.udp_length_override) {
    return {
      values: deterministicIntValues(stream, "udp_length", 26),
      mode: streamFieldMode(stream, "udp_length")
    };
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  const udpLength = Math.max(
    8,
    packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream)
  );
  return {
    values: [String(udpLength)],
    mode: "Fixed"
  };
}

function deterministicUdpPayloadLengths(udpLengths: { values: string[]; mode: string } | null) {
  if (!udpLengths) {
    return null;
  }
  const values = udpLengths.values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => String(Math.max(0, Math.trunc(value) - 8)));
  return {
    values,
    mode: udpLengths.mode
  };
}

function greHeaderLength(stream: ProfileWorkbenchStream) {
  return (
    4
    + (stream.gre_checksum_present ? 4 : 0)
    + (stream.gre_key_present ? 4 : 0)
    + (stream.gre_sequence_present ? 4 : 0)
  );
}

function greInnerIpv4Envelope(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.endsWith("/GRE")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  return {
    headerLength: 20,
    totalLength: Math.max(
      28,
      packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream) - greHeaderLength(stream)
    )
  };
}

function greInnerIpVersion(stream: ProfileWorkbenchStream) {
  return stream.gre_inner_ip_version === "IPv6" || textStreamValue(stream, "gre_protocol_type", "0800").toUpperCase() === "86DD" ? "IPv6" : "IPv4";
}

function greProtocolTypeExpectation(stream: ProfileWorkbenchStream) {
  return greInnerIpVersion(stream) === "IPv6" ? "0x86dd" : "0x0800";
}

function greInnerEnvelope(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.endsWith("/GRE")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  const innerVersion = greInnerIpVersion(stream);
  const headerLength = innerVersion === "IPv6" ? 40 : 20;
  const payloadLength = Math.max(
    0,
    packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream) - greHeaderLength(stream) - headerLength - 8
  );
  return {
    innerVersion,
    headerLength,
    payloadLength,
    udpLength: 8 + payloadLength,
    ipv4TotalLength: headerLength + 8 + payloadLength,
    ipv6PayloadLength: 8 + payloadLength
  };
}

function addGreInnerIpv4HeaderExpectations(
  expectations: CaptureFieldExpectation[],
  stream: ProfileWorkbenchStream,
  layerPrefix: string
) {
  const envelope = greInnerIpv4Envelope(stream);
  const rows = [
    envelope
      ? captureFieldExpectation(`${layerPrefix} Protocol`, `${layerPrefix}.Protocol`, ["UDP"], "Fixed")
      : null,
    envelope
      ? captureFieldExpectation(
        `${layerPrefix} Header Length`,
        `${layerPrefix}.Header Length`,
        [String(envelope.headerLength)],
        "Fixed"
      )
      : null,
    envelope
      ? captureFieldExpectation(
        `${layerPrefix} Total Length`,
        `${layerPrefix}.Total Length`,
        [String(envelope.totalLength)],
        "Fixed"
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addGreInnerIpv6HeaderExpectations(
  expectations: CaptureFieldExpectation[],
  stream: ProfileWorkbenchStream,
  layerPrefix: string
) {
  const envelope = greInnerEnvelope(stream);
  if (!envelope || envelope.innerVersion !== "IPv6") {
    return;
  }
  const rows = [
    captureFieldExpectation(`${layerPrefix} Next Header`, `${layerPrefix}.Next Header`, ["UDP"], "Fixed"),
    captureFieldExpectation(
      `${layerPrefix} Payload Length`,
      `${layerPrefix}.Payload Length`,
      [String(envelope.ipv6PayloadLength)],
      "Fixed"
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function deterministicGreInnerUdpLengths(stream: ProfileWorkbenchStream) {
  const envelope = greInnerEnvelope(stream);
  if (!envelope) {
    return null;
  }
  return {
    values: [String(envelope.udpLength)],
    mode: "Fixed"
  };
}

function vxlanInnerEnvelope(stream: ProfileWorkbenchStream) {
  if (!stream.vxlan_enabled) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  const innerVersion = stream.vxlan_inner_ip_version === "IPv6" ? "IPv6" : "IPv4";
  const headerLength = innerVersion === "IPv6" ? 40 : 20;
  const payloadLength = Math.max(
    0,
    packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream) - 8 - 8 - 14 - headerLength - 8
  );
  return {
    headerLength,
    innerVersion,
    payloadLength,
    totalLength: headerLength + 8 + payloadLength,
    udpLength: 8 + payloadLength
  };
}

function addVxlanInnerIpv4HeaderExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const envelope = vxlanInnerEnvelope(stream);
  const rows = [
    envelope && envelope.innerVersion === "IPv4" ? captureFieldExpectation("IPv4[2] Protocol", "IPv4[2].Protocol", ["UDP"], "Fixed") : null,
    envelope
      ? captureFieldExpectation("IPv4[2] Header Length", "IPv4[2].Header Length", [String(envelope.headerLength)], "Fixed")
      : null,
    envelope
      ? captureFieldExpectation("IPv4[2] Total Length", "IPv4[2].Total Length", [String(envelope.totalLength)], "Fixed")
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addVxlanInnerIpv6HeaderExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const envelope = vxlanInnerEnvelope(stream);
  const rows = [
    envelope && envelope.innerVersion === "IPv6" ? captureFieldExpectation("IPv6 Next Header", "IPv6.Next Header", ["UDP"], "Fixed") : null,
    envelope && envelope.innerVersion === "IPv6"
      ? captureFieldExpectation("IPv6 Payload Length", "IPv6.Payload Length", [String(envelope.udpLength)], "Fixed")
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function deterministicVxlanInnerUdpLengths(stream: ProfileWorkbenchStream) {
  const envelope = vxlanInnerEnvelope(stream);
  if (!envelope) {
    return null;
  }
  return {
    values: [String(envelope.udpLength)],
    mode: "Fixed"
  };
}

function gtpuOptionalHeaderLength(stream: ProfileWorkbenchStream) {
  return stream.gtpu_sequence_enabled || stream.gtpu_npdu_enabled || stream.gtpu_extension_enabled ? 4 : 0;
}

function gtpuExtensionHeaderLength(stream: ProfileWorkbenchStream) {
  return stream.gtpu_extension_enabled ? 4 : 0;
}

function gtpuOuterPayloadLength(stream: ProfileWorkbenchStream) {
  if (!stream.gtpu_enabled) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  return Math.max(0, packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - 20 - 8);
}

function gtpuLengthEnvelope(stream: ProfileWorkbenchStream) {
  const outerPayloadLength = gtpuOuterPayloadLength(stream);
  if (outerPayloadLength === null) {
    return null;
  }
  return {
    length: Math.max(0, outerPayloadLength - 8),
    payloadLength: Math.max(0, outerPayloadLength - 8 - gtpuOptionalHeaderLength(stream))
  };
}

function gtpuInnerEnvelope(stream: ProfileWorkbenchStream) {
  const outerPayloadLength = gtpuOuterPayloadLength(stream);
  if (outerPayloadLength === null) {
    return null;
  }
  const innerVersion = stream.gtpu_inner_ip_version === "IPv6" ? "IPv6" : "IPv4";
  const headerLength = innerVersion === "IPv6" ? 40 : 20;
  const payloadLength = Math.max(
    0,
    outerPayloadLength - 8 - gtpuOptionalHeaderLength(stream) - gtpuExtensionHeaderLength(stream) - headerLength - 8
  );
  return {
    innerVersion,
    headerLength,
    payloadLength,
    udpLength: 8 + payloadLength,
    ipv4TotalLength: headerLength + 8 + payloadLength,
    ipv6PayloadLength: 8 + payloadLength
  };
}

function addGtpuInnerIpHeaderExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const envelope = gtpuInnerEnvelope(stream);
  if (!envelope) {
    return;
  }
  if (envelope.innerVersion === "IPv6") {
    const rows = [
      captureFieldExpectation("IPv6 Next Header", "IPv6.Next Header", ["UDP"], "Fixed"),
      captureFieldExpectation("IPv6 Payload Length", "IPv6.Payload Length", [String(envelope.ipv6PayloadLength)], "Fixed")
    ];
    expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
    return;
  }
  const rows = [
    captureFieldExpectation("IPv4[2] Protocol", "IPv4[2].Protocol", ["UDP"], "Fixed"),
    captureFieldExpectation("IPv4[2] Header Length", "IPv4[2].Header Length", [String(envelope.headerLength)], "Fixed"),
    captureFieldExpectation("IPv4[2] Total Length", "IPv4[2].Total Length", [String(envelope.ipv4TotalLength)], "Fixed")
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function deterministicGtpuInnerUdpLengths(stream: ProfileWorkbenchStream) {
  const envelope = gtpuInnerEnvelope(stream);
  if (!envelope) {
    return null;
  }
  return {
    values: [String(envelope.udpLength)],
    mode: "Fixed"
  };
}

function arpOperationValues(stream: ProfileWorkbenchStream) {
  const operationNames: Record<number, string> = { 1: "request", 2: "reply" };
  return deterministicIntValues(stream, "arp_operation", 1).map((value) => {
    const operation = Number(value);
    return operationNames[operation] ?? value;
  });
}

function addArpExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const rows = [
    captureFieldExpectation(
      "ARP Hardware Type",
      "ARP.Hardware Type",
      deterministicIntValues(stream, "arp_hardware_type", 1),
      "Fixed"
    ),
    captureFieldExpectation(
      "ARP Protocol Type",
      "ARP.Protocol Type",
      [hexWordValue(stream, "arp_protocol_type", "0800")],
      "Fixed"
    ),
    captureFieldExpectation(
      "ARP Hardware Size",
      "ARP.Hardware Size",
      deterministicIntValues(stream, "arp_hardware_size", 6),
      "Fixed"
    ),
    captureFieldExpectation(
      "ARP Protocol Size",
      "ARP.Protocol Size",
      deterministicIntValues(stream, "arp_protocol_size", 4),
      "Fixed"
    ),
    captureFieldExpectation(
      "ARP Operation",
      "ARP.Operation",
      arpOperationValues(stream),
      streamFieldMode(stream, "arp_operation")
    ),
    captureFieldExpectation(
      "ARP Sender MAC",
      "ARP.Sender MAC",
      deterministicMacValues(stream, "arp_sender_mac", "00:00:00:00:00:00"),
      streamFieldMode(stream, "arp_sender_mac")
    ),
    captureFieldExpectation(
      "ARP Sender IP",
      "ARP.Sender IP",
      deterministicIpValues(stream, "arp_sender_ip", "16.0.0.1"),
      streamFieldMode(stream, "arp_sender_ip")
    ),
    captureFieldExpectation(
      "ARP Target MAC",
      "ARP.Target MAC",
      deterministicMacValues(stream, "arp_target_mac", "00:00:00:00:00:00"),
      streamFieldMode(stream, "arp_target_mac")
    ),
    captureFieldExpectation(
      "ARP Target IP",
      "ARP.Target IP",
      deterministicIpValues(stream, "arp_target_ip", "48.0.0.1"),
      streamFieldMode(stream, "arp_target_ip")
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function icmpEchoLayerPrefix(stream: ProfileWorkbenchStream) {
  if (stream.packet_type === "Ethernet/IPv4/ICMP") {
    const type = intStreamValue(stream, "icmp_type", 8);
    return type === 0 || type === 8 ? "ICMP" : null;
  }
  if (stream.packet_type === "Ethernet/IPv6/ICMPv6") {
    const type = intStreamValue(stream, "icmp_type", 128);
    return type === 128 || type === 129 ? "ICMPv6" : null;
  }
  return null;
}

function icmpEchoTypeName(layerPrefix: string, icmpType: number) {
  const names: Record<string, Record<number, string>> = {
    ICMP: {
      0: "Echo Reply",
      8: "Echo Request"
    },
    ICMPv6: {
      128: "Echo Request",
      129: "Echo Reply"
    }
  };
  return names[layerPrefix]?.[icmpType] ?? String(icmpType);
}

function canExpectIcmpChecksum(stream: ProfileWorkbenchStream) {
  const layerPrefix = icmpEchoLayerPrefix(stream);
  if (!layerPrefix || !stream.icmp_checksum_override || stream.frame_length_type !== "Fixed") {
    return false;
  }
  const checksumCoveredKeys = [
    "icmp_type",
    "icmp_code",
    "icmp_identifier",
    "icmp_sequence",
    ...(layerPrefix === "ICMPv6" ? ["ipv6_src", "ipv6_dst"] : [])
  ];
  return areFieldModesFixed(stream, checksumCoveredKeys);
}

function addIcmpEchoExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const layerPrefix = icmpEchoLayerPrefix(stream);
  if (!layerPrefix) {
    return;
  }
  const icmpType = intStreamValue(stream, "icmp_type", layerPrefix === "ICMPv6" ? 128 : 8);
  const icmpTypeValues = deterministicIntValues(stream, "icmp_type", layerPrefix === "ICMPv6" ? 128 : 8);
  const rows = [
    captureFieldExpectation(
      `${layerPrefix} Type`,
      `${layerPrefix}.Type`,
      icmpTypeValues,
      streamFieldMode(stream, "icmp_type")
    ),
    captureFieldExpectation(
      `${layerPrefix} Type Name`,
      `${layerPrefix}.Type Name`,
      Array.from(new Set(icmpTypeValues.map((value) => icmpEchoTypeName(layerPrefix, Number(value) || icmpType)))),
      streamFieldMode(stream, "icmp_type")
    ),
    captureFieldExpectation(
      `${layerPrefix} Code`,
      `${layerPrefix}.Code`,
      deterministicIntValues(stream, "icmp_code", 0),
      streamFieldMode(stream, "icmp_code")
    ),
    canExpectIcmpChecksum(stream)
      ? captureFieldExpectation(
        `${layerPrefix} Checksum`,
        `${layerPrefix}.Checksum`,
        deterministicHexWordValues(stream, "icmp_checksum", "0000"),
        "Fixed"
      )
      : null,
    captureFieldExpectation(
      `${layerPrefix} Identifier`,
      `${layerPrefix}.Identifier`,
      deterministicIntValues(stream, "icmp_identifier", 1),
      streamFieldMode(stream, "icmp_identifier")
    ),
    captureFieldExpectation(
      `${layerPrefix} Sequence`,
      `${layerPrefix}.Sequence`,
      deterministicIntValues(stream, "icmp_sequence", 1),
      streamFieldMode(stream, "icmp_sequence")
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function icmpv6TypeName(icmpType: number) {
  const names: Record<number, string> = {
    128: "Echo Request",
    129: "Echo Reply",
    133: "Router Solicitation",
    134: "Router Advertisement",
    135: "Neighbor Solicitation",
    136: "Neighbor Advertisement"
  };
  return names[icmpType] ?? String(icmpType);
}

function icmpv6NaFlagsValue(stream: ProfileWorkbenchStream) {
  return ((stream.icmpv6_nd_na_router ? 0x80 : 0)
    | (stream.icmpv6_nd_na_solicited ? 0x40 : 0)
    | (stream.icmpv6_nd_na_override ? 0x20 : 0)) << 24;
}

function icmpv6RaFlagsValue(stream: ProfileWorkbenchStream) {
  return (stream.icmpv6_ra_managed ? 0x80 : 0) | (stream.icmpv6_ra_other ? 0x40 : 0);
}

function icmpv6RaPrefixFlagsValue(stream: ProfileWorkbenchStream) {
  return (stream.icmpv6_ra_prefix_on_link ? 0x80 : 0) | (stream.icmpv6_ra_prefix_autonomous ? 0x40 : 0);
}

function addIcmpv6OptionExpectations(
  expectations: CaptureFieldExpectation[],
  optionTypes: string[],
  optionLengths: string[]
) {
  const rows = [
    optionTypes.length
      ? captureFieldExpectation("ICMPv6 Option Type", "ICMPv6.Option Type", optionTypes, "Fixed")
      : null,
    optionLengths.length
      ? captureFieldExpectation("ICMPv6 Option Length", "ICMPv6.Option Length", optionLengths, "Fixed")
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addIcmpv6DiscoveryExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  if (stream.packet_type !== "Ethernet/IPv6/ICMPv6") {
    return;
  }
  const icmpType = intStreamValue(stream, "icmp_type", 128);
  if (![133, 134, 135, 136].includes(icmpType)) {
    return;
  }

  const rows = [
    captureFieldExpectation("ICMPv6 Type", "ICMPv6.Type", deterministicIntValues(stream, "icmp_type", 128), "Fixed"),
    captureFieldExpectation("ICMPv6 Type Name", "ICMPv6.Type Name", [icmpv6TypeName(icmpType)], "Fixed"),
    captureFieldExpectation("ICMPv6 Code", "ICMPv6.Code", deterministicIntValues(stream, "icmp_code", 0), "Fixed")
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));

  if (icmpType === 135 || icmpType === 136) {
    const optionTypes: string[] = [];
    const optionLengths: string[] = [];
    const ndRows = [
      captureFieldExpectation(
        "ICMPv6 ND Flags",
        "ICMPv6.Flags",
        [hexIntText(icmpType === 136 ? icmpv6NaFlagsValue(stream) : 0, 8)],
        "Fixed"
      ),
      captureFieldExpectation(
        "ICMPv6 ND Target",
        "ICMPv6.Target",
        deterministicIpValues(stream, "icmpv6_nd_target", "2001:db8::2"),
        "Fixed"
      )
    ];
    if (stream.icmpv6_nd_include_option !== false) {
      optionTypes.push(icmpType === 136 ? "Target Link-Layer Address" : "Source Link-Layer Address");
      optionLengths.push("8");
      ndRows.push(
        captureFieldExpectation(
          "ICMPv6 ND Option MAC",
          "ICMPv6.Option MAC",
          deterministicMacValues(stream, "icmpv6_nd_option_mac", "00:00:00:00:00:00"),
          "Fixed"
        )
      );
    }
    expectations.push(...ndRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
    addIcmpv6OptionExpectations(expectations, optionTypes, optionLengths);
    return;
  }

  if (icmpType === 133) {
    const optionTypes: string[] = [];
    const optionLengths: string[] = [];
    const rsRows = [
      captureFieldExpectation("ICMPv6 RS Reserved", "ICMPv6.Reserved", ["0x00000000"], "Fixed")
    ];
    if (stream.icmpv6_rs_include_slla !== false) {
      optionTypes.push("Source Link-Layer Address");
      optionLengths.push("8");
      rsRows.push(
        captureFieldExpectation(
          "ICMPv6 RS Source MAC",
          "ICMPv6.Option MAC",
          deterministicMacValues(stream, "icmpv6_rs_slla_mac", "00:00:00:00:00:00"),
          "Fixed"
        )
      );
    }
    expectations.push(...rsRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
    addIcmpv6OptionExpectations(expectations, optionTypes, optionLengths);
    return;
  }

  if (icmpType === 134) {
    const optionTypes: string[] = [];
    const optionLengths: string[] = [];
    const raRows = [
      captureFieldExpectation(
        "ICMPv6 RA Current Hop Limit",
        "ICMPv6.Current Hop Limit",
        deterministicIntValues(stream, "icmpv6_ra_cur_hop_limit", 64),
        "Fixed"
      ),
      captureFieldExpectation("ICMPv6 RA Flags", "ICMPv6.Flags", [hexIntText(icmpv6RaFlagsValue(stream), 2)], "Fixed"),
      captureFieldExpectation(
        "ICMPv6 RA Router Lifetime",
        "ICMPv6.Router Lifetime",
        deterministicIntValues(stream, "icmpv6_ra_router_lifetime", 1800),
        "Fixed"
      ),
      captureFieldExpectation(
        "ICMPv6 RA Reachable Time",
        "ICMPv6.Reachable Time",
        deterministicIntValues(stream, "icmpv6_ra_reachable_time", 0),
        "Fixed"
      ),
      captureFieldExpectation(
        "ICMPv6 RA Retrans Timer",
        "ICMPv6.Retrans Timer",
        deterministicIntValues(stream, "icmpv6_ra_retrans_timer", 0),
        "Fixed"
      )
    ];
    if (stream.icmpv6_ra_include_slla !== false) {
      optionTypes.push("Source Link-Layer Address");
      optionLengths.push("8");
      raRows.push(
        captureFieldExpectation(
          "ICMPv6 RA Source MAC",
          "ICMPv6.Option MAC",
          deterministicMacValues(stream, "icmpv6_ra_slla_mac", "00:00:00:00:00:00"),
          "Fixed"
        )
      );
    }
    if (stream.icmpv6_ra_include_prefix !== false) {
      optionTypes.push("Prefix Information");
      optionLengths.push("32");
      raRows.push(
        captureFieldExpectation(
          "ICMPv6 RA Prefix Length",
          "ICMPv6.Prefix Length",
          deterministicIntValues(stream, "icmpv6_ra_prefix_length", 64),
          "Fixed"
        ),
        captureFieldExpectation(
          "ICMPv6 RA Prefix Flags",
          "ICMPv6.Prefix Flags",
          [hexIntText(icmpv6RaPrefixFlagsValue(stream), 2)],
          "Fixed"
        ),
        captureFieldExpectation(
          "ICMPv6 RA Prefix Valid Lifetime",
          "ICMPv6.Prefix Valid Lifetime",
          deterministicIntValues(stream, "icmpv6_ra_prefix_valid_lifetime", 2592000),
          "Fixed"
        ),
        captureFieldExpectation(
          "ICMPv6 RA Prefix Preferred Lifetime",
          "ICMPv6.Prefix Preferred Lifetime",
          deterministicIntValues(stream, "icmpv6_ra_prefix_preferred_lifetime", 604800),
          "Fixed"
        ),
        captureFieldExpectation(
          "ICMPv6 RA Prefix",
          "ICMPv6.Prefix",
          deterministicIpValues(stream, "icmpv6_ra_prefix", "2001:db8:100::"),
          "Fixed"
        )
      );
    }
    expectations.push(...raRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
    addIcmpv6OptionExpectations(expectations, optionTypes, optionLengths);
  }
}

function tcpFlagsValue(stream: ProfileWorkbenchStream) {
  return (stream.tcp_flag_urg ? 0x20 : 0)
    | (stream.tcp_flag_ack ? 0x10 : 0)
    | (stream.tcp_flag_psh ? 0x08 : 0)
    | (stream.tcp_flag_rst ? 0x04 : 0)
    | (stream.tcp_flag_syn ? 0x02 : 0)
    | (stream.tcp_flag_fin ? 0x01 : 0);
}

function tcpFlagsText(value: number) {
  const flags = [
    ["URG", 0x20],
    ["ACK", 0x10],
    ["PSH", 0x08],
    ["RST", 0x04],
    ["SYN", 0x02],
    ["FIN", 0x01]
  ] as const;
  const enabled = flags.filter(([, mask]) => value & mask).map(([label]) => label);
  return enabled.length ? enabled.join(", ") : "-";
}

function deterministicTcpFlagsValues(stream: ProfileWorkbenchStream) {
  return deterministicIntValuesFrom(
    tcpFlagsValue(stream),
    streamFieldMode(stream, "tcp_flags"),
    streamFieldCount(stream, "tcp_flags"),
    streamFieldStep(stream, "tcp_flags")
  ).map((value) => tcpFlagsText(Number(value) & 0x3f));
}

function hasTcpOptions(stream: ProfileWorkbenchStream) {
  return Boolean(
    stream.tcp_option_mss_enabled
    || stream.tcp_option_window_scale_enabled
    || stream.tcp_option_sack_permitted_enabled
    || stream.tcp_option_sack_blocks_enabled
    || stream.tcp_option_timestamp_enabled
  );
}

function tcpOptionsLength(stream: ProfileWorkbenchStream) {
  let length = 0;
  if (stream.tcp_option_mss_enabled) {
    length += 4;
  }
  if (stream.tcp_option_sack_permitted_enabled) {
    length += 2;
  }
  if (stream.tcp_option_sack_blocks_enabled) {
    length += 10;
  }
  if (stream.tcp_option_timestamp_enabled) {
    length += 12;
  }
  if (stream.tcp_option_window_scale_enabled) {
    length += 4;
  }
  return length + ((4 - (length % 4)) % 4);
}

function areFieldModesFixed(stream: ProfileWorkbenchStream, keys: string[]) {
  return keys.every((key) => streamFieldMode(stream, key) === "Fixed");
}

function canExpectUdpChecksum(stream: ProfileWorkbenchStream) {
  if (!stream.udp_checksum_override || stream.frame_length_type !== "Fixed") {
    return false;
  }
  const checksumFixupKeys = [
    "src_ipv4",
    "dst_ipv4",
    "ipv4_src",
    "ipv4_dst",
    "ipv4_dscp",
    "ipv4_ecn",
    "ipv4_id",
    "ipv4_fragment_offset",
    "ipv4_ttl",
    "src_ipv6",
    "dst_ipv6",
    "ipv6_src",
    "ipv6_dst",
    "ipv6_traffic_class",
    "ipv6_flow_label",
    "ipv6_hop_limit",
    "l4_src_port",
    "l4_dst_port",
    "udp_length",
    "dns_transaction_id",
    "dns_flags",
    "dns_query_type",
    "dns_query_class",
    "dns_answer_ttl",
    "dns_answer_ipv4",
    "dhcp_operation",
    "dhcp_hops",
    "dhcp_seconds",
    "dhcp_message_type",
    "dhcp_flags",
    "dhcp_client_ip",
    "dhcp_your_ip",
    "dhcp_server_ip",
    "dhcp_relay_ip",
    "dhcp_client_mac",
    "dhcp_requested_ip",
    "dhcp_server_id",
    "dhcp_xid"
  ];
  return areFieldModesFixed(stream, checksumFixupKeys);
}

function canExpectIpv4Checksum(stream: ProfileWorkbenchStream) {
  const advancedVm = stream.advanced_vm;
  const advancedInstructionCount = advancedVm
    && typeof advancedVm === "object"
    && Array.isArray((advancedVm as { instructions?: unknown }).instructions)
    ? (advancedVm as { instructions: unknown[] }).instructions.length
    : 0;
  if (!stream.ipv4_checksum_override || stream.frame_length_type !== "Fixed" || (stream.advanced_mode && advancedInstructionCount > 0)) {
    return false;
  }
  const checksumFixupKeys = [
    "src_ipv4",
    "dst_ipv4",
    "ipv4_src",
    "ipv4_dst",
    "ipv4_dscp",
    "ipv4_ecn",
    "ipv4_id",
    "ipv4_fragment_offset",
    "ipv4_ttl",
    "l4_src_port",
    "l4_dst_port",
    "udp_length",
    "dns_transaction_id",
    "dns_flags",
    "dns_query_type",
    "dns_query_class",
    "dns_answer_ttl",
    "dns_answer_ipv4",
    "dhcp_operation",
    "dhcp_hops",
    "dhcp_seconds",
    "dhcp_message_type",
    "dhcp_flags",
    "dhcp_client_ip",
    "dhcp_your_ip",
    "dhcp_server_ip",
    "dhcp_relay_ip",
    "dhcp_client_mac",
    "dhcp_requested_ip",
    "dhcp_server_id",
    "dhcp_xid",
    "tcp_sequence",
    "tcp_ack",
    "tcp_window",
    "tcp_urgent_pointer",
    "tcp_flags",
    "tcp_option_mss",
    "tcp_option_window_scale",
    "tcp_option_sack_left_edge",
    "tcp_option_sack_right_edge",
    "tcp_option_timestamp_value",
    "tcp_option_timestamp_echo",
    "icmp_identifier",
    "icmp_sequence",
    "sctp_verification_tag",
    "sctp_data_flags",
    "sctp_tsn",
    "sctp_stream_id",
    "sctp_stream_sequence",
    "sctp_payload_protocol_id"
  ];
  return areFieldModesFixed(stream, checksumFixupKeys);
}

function canExpectTcpChecksum(stream: ProfileWorkbenchStream) {
  if (!stream.tcp_checksum_override || stream.frame_length_type !== "Fixed") {
    return false;
  }
  const checksumFixupKeys = [
    "src_ipv4",
    "dst_ipv4",
    "ipv4_src",
    "ipv4_dst",
    "ipv4_dscp",
    "ipv4_ecn",
    "ipv4_id",
    "ipv4_fragment_offset",
    "ipv4_ttl",
    "src_ipv6",
    "dst_ipv6",
    "ipv6_src",
    "ipv6_dst",
    "l4_src_port",
    "l4_dst_port",
    "tcp_sequence",
    "tcp_ack",
    "tcp_window",
    "tcp_urgent_pointer",
    "tcp_flags",
    "tcp_option_mss",
    "tcp_option_window_scale",
    "tcp_option_sack_left_edge",
    "tcp_option_sack_right_edge",
    "tcp_option_timestamp_value",
    "tcp_option_timestamp_echo"
  ];
  return areFieldModesFixed(stream, checksumFixupKeys);
}

function canExpectSctpChecksum(stream: ProfileWorkbenchStream) {
  if (
    !stream.sctp_checksum_override
    || stream.frame_length_type !== "Fixed"
    || !Object.prototype.hasOwnProperty.call(stream, "frame_length")
  ) {
    return false;
  }
  const checksumCoveredKeys = [
    "src_ipv4",
    "dst_ipv4",
    "ipv4_src",
    "ipv4_dst",
    "ipv4_dscp",
    "ipv4_ecn",
    "ipv4_id",
    "ipv4_fragment_offset",
    "ipv4_ttl",
    "src_ipv6",
    "dst_ipv6",
    "ipv6_src",
    "ipv6_dst",
    "ipv6_traffic_class",
    "ipv6_flow_label",
    "ipv6_hop_limit",
    "l4_src_port",
    "l4_dst_port",
    "sctp_verification_tag",
    "sctp_data_flags",
    "sctp_tsn",
    "sctp_stream_id",
    "sctp_stream_sequence",
    "sctp_payload_protocol_id"
  ];
  return areFieldModesFixed(stream, checksumCoveredKeys);
}

function workbenchVlanTagCount(stream: ProfileWorkbenchStream) {
  if (!stream.vlan_enabled) {
    return 0;
  }
  return stream.vlan2_enabled ? 2 : 1;
}

function workbenchMplsLabelCount(stream: ProfileWorkbenchStream) {
  if (!stream.mpls_enabled) {
    return 0;
  }
  return 1 + (stream.mpls_label2_enabled ? 1 : 0) + (stream.mpls_label2_enabled && stream.mpls_label3_enabled ? 1 : 0);
}

function workbenchL2HeaderLength(stream: ProfileWorkbenchStream) {
  return 14 + (workbenchVlanTagCount(stream) * 4) + (workbenchMplsLabelCount(stream) * 4);
}

function workbenchL3HeaderLength(stream: ProfileWorkbenchStream) {
  if (stream.packet_type.startsWith("Ethernet/IPv6")) {
    return 40;
  }
  if (stream.packet_type.startsWith("Ethernet/IPv4")) {
    return 20;
  }
  return 0;
}

function sctpFixedLengths(stream: ProfileWorkbenchStream) {
  const hasExplicitFrameLength = Object.prototype.hasOwnProperty.call(stream, "frame_length");
  if (!hasExplicitFrameLength || stream.frame_length_type !== "Fixed" || !stream.packet_type.endsWith("/SCTP")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  const payloadLength = Math.max(0, packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream) - 28);
  return {
    chunkLength: 16 + payloadLength,
    payloadLength
  };
}

function tcpFixedLengths(stream: ProfileWorkbenchStream) {
  if (!stream.packet_type.endsWith("/TCP")) {
    return null;
  }
  const packetLengthWithoutFcs = fixedWorkbenchPacketLengthWithoutFcs(stream);
  if (packetLengthWithoutFcs === null) {
    return null;
  }
  const headerLength = 20 + tcpOptionsLength(stream);
  const payloadLength = Math.max(
    0,
    packetLengthWithoutFcs - workbenchL2HeaderLength(stream) - workbenchL3HeaderLength(stream) - headerLength
  );
  return {
    headerLength,
    payloadLength
  };
}

function addTcpOptionExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  if (!hasTcpOptions(stream)) {
    return;
  }
  const lengths = tcpFixedLengths(stream);
  const rows = [
    lengths
      ? null
      : captureFieldExpectation(
        "TCP Header Length",
        "TCP.Header Length",
        [String(20 + tcpOptionsLength(stream))],
        "Fixed"
      ),
    stream.tcp_option_mss_enabled
      ? captureFieldExpectation(
        "TCP Option MSS",
        "TCP.Option MSS",
        deterministicIntValues(stream, "tcp_option_mss", 1460),
        streamFieldMode(stream, "tcp_option_mss")
      )
      : null,
    stream.tcp_option_sack_permitted_enabled
      ? captureFieldExpectation(
        "TCP Option SACK Permitted",
        "TCP.Option SACK Permitted",
        ["yes"],
        "Fixed"
      )
      : null,
    stream.tcp_option_sack_blocks_enabled
      ? captureFieldExpectation(
        "TCP Option SACK Left Edge",
        "TCP.Option SACK Left Edge",
        deterministicIntValues(stream, "tcp_option_sack_left_edge", 1000),
        streamFieldMode(stream, "tcp_option_sack_left_edge")
      )
      : null,
    stream.tcp_option_sack_blocks_enabled
      ? captureFieldExpectation(
        "TCP Option SACK Right Edge",
        "TCP.Option SACK Right Edge",
        deterministicIntValues(stream, "tcp_option_sack_right_edge", 2000),
        streamFieldMode(stream, "tcp_option_sack_right_edge")
      )
      : null,
    stream.tcp_option_timestamp_enabled
      ? captureFieldExpectation(
        "TCP Option Timestamp Value",
        "TCP.Option Timestamp Value",
        deterministicIntValues(stream, "tcp_option_timestamp_value", 1),
        streamFieldMode(stream, "tcp_option_timestamp_value")
      )
      : null,
    stream.tcp_option_timestamp_enabled
      ? captureFieldExpectation(
        "TCP Option Timestamp Echo",
        "TCP.Option Timestamp Echo",
        deterministicIntValues(stream, "tcp_option_timestamp_echo", 0),
        streamFieldMode(stream, "tcp_option_timestamp_echo")
      )
      : null,
    stream.tcp_option_window_scale_enabled
      ? captureFieldExpectation(
        "TCP Option Window Scale",
        "TCP.Option Window Scale",
        deterministicIntValues(stream, "tcp_option_window_scale", 7),
        streamFieldMode(stream, "tcp_option_window_scale")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addTcpExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const lengths = tcpFixedLengths(stream);
  const rows = [
    lengths
      ? captureFieldExpectation("TCP Header Length", "TCP.Header Length", [String(lengths.headerLength)], "Fixed")
      : null,
    lengths
      ? captureFieldExpectation("TCP Payload Length", "TCP.Payload Length", [String(lengths.payloadLength)], "Fixed")
      : null,
    captureFieldExpectation(
      "TCP Sequence",
      "TCP.Sequence",
      deterministicIntValuesFor(stream, "tcp_sequence_number", "tcp_sequence", 1_234_567),
      streamFieldMode(stream, "tcp_sequence")
    ),
    captureFieldExpectation(
      "TCP Acknowledge",
      "TCP.Acknowledge",
      deterministicIntValuesFor(stream, "tcp_ack_number", "tcp_ack", 7_654_321),
      streamFieldMode(stream, "tcp_ack")
    ),
    captureFieldExpectation(
      "TCP Window",
      "TCP.Window",
      deterministicIntValues(stream, "tcp_window", 9999),
      streamFieldMode(stream, "tcp_window")
    ),
    captureFieldExpectation(
      "TCP Flags",
      "TCP.Flags",
      deterministicTcpFlagsValues(stream),
      streamFieldMode(stream, "tcp_flags")
    ),
    captureFieldExpectation(
      "TCP Urgent Pointer",
      "TCP.Urgent Pointer",
      deterministicIntValues(stream, "tcp_urgent_pointer", 1111),
      streamFieldMode(stream, "tcp_urgent_pointer")
    ),
    canExpectTcpChecksum(stream)
      ? captureFieldExpectation(
        "TCP Checksum",
        "TCP.Checksum",
        deterministicHexWordValues(stream, "tcp_checksum", "ABCD"),
        streamFieldMode(stream, "tcp_checksum")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
  addTcpOptionExpectations(expectations, stream);
}

function addSctpExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const lengths = sctpFixedLengths(stream);
  const rows = [
    captureFieldExpectation(
      "SCTP Verification Tag",
      "SCTP.Verification Tag",
      deterministicHexIntValues(stream, "sctp_verification_tag", 0x12345678),
      streamFieldMode(stream, "sctp_verification_tag")
    ),
    canExpectSctpChecksum(stream)
      ? captureFieldExpectation(
        "SCTP Checksum",
        "SCTP.Checksum",
        [hexDwordValue(stream, "sctp_checksum", "00000000")],
        "Fixed"
      )
      : null,
    captureFieldExpectation("SCTP Chunk Type", "SCTP.Chunk Type", ["DATA"], "Fixed"),
    captureFieldExpectation(
      "SCTP Chunk Flags",
      "SCTP.Chunk Flags",
      deterministicHexIntValues(stream, "sctp_data_flags", 3, 2),
      streamFieldMode(stream, "sctp_data_flags")
    ),
    lengths
      ? captureFieldExpectation("SCTP Chunk Length", "SCTP.Chunk Length", [String(lengths.chunkLength)], "Fixed")
      : null,
    captureFieldExpectation(
      "SCTP TSN",
      "SCTP.TSN",
      deterministicIntValues(stream, "sctp_tsn", 1),
      streamFieldMode(stream, "sctp_tsn")
    ),
    captureFieldExpectation(
      "SCTP Stream ID",
      "SCTP.Stream ID",
      deterministicIntValues(stream, "sctp_stream_id", 0),
      streamFieldMode(stream, "sctp_stream_id")
    ),
    captureFieldExpectation(
      "SCTP Stream Sequence",
      "SCTP.Stream Sequence",
      deterministicIntValues(stream, "sctp_stream_sequence", 0),
      streamFieldMode(stream, "sctp_stream_sequence")
    ),
    captureFieldExpectation(
      "SCTP Payload Protocol ID",
      "SCTP.Payload Protocol ID",
      deterministicIntValues(stream, "sctp_payload_protocol_id", 0),
      streamFieldMode(stream, "sctp_payload_protocol_id")
    ),
    lengths
      ? captureFieldExpectation("SCTP Payload Length", "SCTP.Payload Length", [String(lengths.payloadLength)], "Fixed")
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function dnsQueryTypeName(value: number) {
  const names: Record<number, string> = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    12: "PTR",
    15: "MX",
    28: "AAAA",
    33: "SRV",
    255: "ANY"
  };
  return names[value] ?? String(value);
}

function dnsQueryClassName(value: number) {
  const names: Record<number, string> = {
    1: "IN",
    3: "CH",
    4: "HS",
    255: "ANY"
  };
  return names[value] ?? String(value);
}

function dnsFlagsNumber(stream: ProfileWorkbenchStream) {
  return Number.parseInt(hexWordValue(stream, "dns_flags", "0100").slice(2), 16);
}

function deterministicDnsFlagsNumbers(stream: ProfileWorkbenchStream) {
  const start = dnsFlagsNumber(stream);
  return deterministicIntValuesFrom(start, streamFieldMode(stream, "dns_flags"), streamFieldCount(stream, "dns_flags"), streamFieldStep(stream, "dns_flags"))
    .map((value) => Number(value) & 0xffff);
}

function deterministicDnsFlagsValues(stream: ProfileWorkbenchStream) {
  const mode = streamFieldMode(stream, "dns_flags");
  if (mode === "Fixed") {
    return [hexWordValue(stream, "dns_flags", "0100")];
  }
  return deterministicDnsFlagsNumbers(stream).map((value) => hexIntText(value, 4));
}

function deterministicDnsQrValues(stream: ProfileWorkbenchStream) {
  return uniqueText(deterministicDnsFlagsNumbers(stream).map((flags) => (flags & 0x8000 ? "response" : "query")));
}

function deterministicDnsOpcodeValues(stream: ProfileWorkbenchStream) {
  return uniqueText(deterministicDnsFlagsNumbers(stream).map((flags) => String((flags >> 11) & 0x0f)));
}

function deterministicDnsResponseCodeValues(stream: ProfileWorkbenchStream) {
  return uniqueText(deterministicDnsFlagsNumbers(stream).map((flags) => String(flags & 0x0f)));
}

function deterministicDnsQueryTypeValues(stream: ProfileWorkbenchStream) {
  return deterministicIntValues(stream, "dns_query_type", 1).map((value) => dnsQueryTypeName(Number(value)));
}

function deterministicDnsQueryClassValues(stream: ProfileWorkbenchStream) {
  return deterministicIntValues(stream, "dns_query_class", 1).map((value) => dnsQueryClassName(Number(value)));
}

function addDnsExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const rows = [
    captureFieldExpectation(
      "DNS Transaction ID",
      "DNS.Transaction ID",
      deterministicHexIntValues(stream, "dns_transaction_id", 0x1234, 4),
      streamFieldMode(stream, "dns_transaction_id")
    ),
    captureFieldExpectation("DNS Flags", "DNS.Flags", deterministicDnsFlagsValues(stream), streamFieldMode(stream, "dns_flags")),
    captureFieldExpectation("DNS QR", "DNS.QR", deterministicDnsQrValues(stream), streamFieldMode(stream, "dns_flags")),
    captureFieldExpectation("DNS Opcode", "DNS.Opcode", deterministicDnsOpcodeValues(stream), streamFieldMode(stream, "dns_flags")),
    captureFieldExpectation(
      "DNS Response Code",
      "DNS.Response Code",
      deterministicDnsResponseCodeValues(stream),
      streamFieldMode(stream, "dns_flags")
    ),
    captureFieldExpectation("DNS Questions", "DNS.Questions", ["1"], "Fixed"),
    captureFieldExpectation("DNS Answers", "DNS.Answers", [stream.dns_answer_enabled ? "1" : "0"], "Fixed"),
    captureFieldExpectation("DNS Authority RRs", "DNS.Authority RRs", ["0"], "Fixed"),
    captureFieldExpectation("DNS Additional RRs", "DNS.Additional RRs", ["0"], "Fixed"),
    captureFieldExpectation(
      "DNS Query Name",
      "DNS.Query Name",
      [textStreamValue(stream, "dns_query_name", "example.com").replace(/\.$/, "")],
      "Fixed"
    ),
    captureFieldExpectation(
      "DNS Query Type",
      "DNS.Query Type",
      deterministicDnsQueryTypeValues(stream),
      streamFieldMode(stream, "dns_query_type")
    ),
    captureFieldExpectation(
      "DNS Query Class",
      "DNS.Query Class",
      deterministicDnsQueryClassValues(stream),
      streamFieldMode(stream, "dns_query_class")
    ),
    stream.dns_answer_enabled
      ? captureFieldExpectation("DNS Answer Type", "DNS.Answer Type", ["A"], "Fixed")
      : null,
    stream.dns_answer_enabled
      ? captureFieldExpectation(
          "DNS Answer Class",
          "DNS.Answer Class",
          [dnsQueryClassName(intStreamValue(stream, "dns_query_class", 1))],
          "Fixed"
        )
      : null,
    stream.dns_answer_enabled
      ? captureFieldExpectation(
          "DNS Answer TTL",
          "DNS.Answer TTL",
          deterministicIntValues(stream, "dns_answer_ttl", 60),
          streamFieldMode(stream, "dns_answer_ttl")
        )
      : null,
    stream.dns_answer_enabled
      ? captureFieldExpectation(
          "DNS Answer IPv4",
          "DNS.Answer IPv4",
          deterministicIpValues(stream, "dns_answer_ipv4", "192.0.2.1"),
          streamFieldMode(stream, "dns_answer_ipv4")
        )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function dhcpMessageTypeName(value: number) {
  const names: Record<number, string> = {
    1: "Discover",
    2: "Offer",
    3: "Request",
    4: "Decline",
    5: "Ack",
    6: "Nak",
    7: "Release",
    8: "Inform"
  };
  return names[value] ?? String(value);
}

function deterministicDhcpMessageTypeValues(stream: ProfileWorkbenchStream) {
  return deterministicIntValues(stream, "dhcp_message_type", 1).map((value) => dhcpMessageTypeName(Number(value)));
}

function dhcpOperationName(value: number) {
  const names: Record<number, string> = {
    1: "request",
    2: "reply"
  };
  return names[value] ?? String(value);
}

function deterministicDhcpOperationValues(stream: ProfileWorkbenchStream) {
  return deterministicIntValues(stream, "dhcp_operation", 1).map((value) => dhcpOperationName(Number(value)));
}

function dhcpParameterRequestListText(value: string) {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  const normalized = tokens
    .filter((token) => /^\d{1,3}$/.test(token))
    .map((token) => Number(token))
    .filter((option) => option >= 0 && option <= 255)
    .map((option) => String(option));
  return normalized.length === tokens.length ? normalized.join(",") : "";
}

function addDhcpExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const hostname = textStreamValue(stream, "dhcp_hostname", "trex-webui");
  const parameterRequestList = dhcpParameterRequestListText(
    textStreamValue(stream, "dhcp_parameter_request_list", "1,3,6,15,28,51,58,59")
  );
  const requestedIp = textStreamValue(stream, "dhcp_requested_ip", "0.0.0.0");
  const serverId = textStreamValue(stream, "dhcp_server_id", "0.0.0.0");
  const leaseTime = intStreamValue(stream, "dhcp_lease_time", 0);
  const renewalTime = intStreamValue(stream, "dhcp_renewal_time", 0);
  const rebindingTime = intStreamValue(stream, "dhcp_rebinding_time", 0);
  const rows = [
    captureFieldExpectation(
      "DHCP Operation",
      "DHCP.Operation",
      deterministicDhcpOperationValues(stream),
      streamFieldMode(stream, "dhcp_operation")
    ),
    captureFieldExpectation("DHCP Hardware Type", "DHCP.Hardware Type", ["1"], "Fixed"),
    captureFieldExpectation("DHCP Hardware Size", "DHCP.Hardware Size", ["6"], "Fixed"),
    captureFieldExpectation(
      "DHCP Hops",
      "DHCP.Hops",
      deterministicIntValues(stream, "dhcp_hops", 0),
      streamFieldMode(stream, "dhcp_hops")
    ),
    captureFieldExpectation(
      "DHCP Transaction ID",
      "DHCP.Transaction ID",
      deterministicHexIntValues(stream, "dhcp_xid", 0x3903f326),
      streamFieldMode(stream, "dhcp_xid")
    ),
    captureFieldExpectation(
      "DHCP Seconds",
      "DHCP.Seconds",
      deterministicIntValues(stream, "dhcp_seconds", 0),
      streamFieldMode(stream, "dhcp_seconds")
    ),
    captureFieldExpectation(
      "DHCP Flags",
      "DHCP.Flags",
      deterministicHexWordValues(stream, "dhcp_flags", "8000"),
      streamFieldMode(stream, "dhcp_flags")
    ),
    captureFieldExpectation(
      "DHCP Client IP",
      "DHCP.Client IP",
      deterministicIpValues(stream, "dhcp_client_ip", "0.0.0.0"),
      streamFieldMode(stream, "dhcp_client_ip")
    ),
    captureFieldExpectation(
      "DHCP Your IP",
      "DHCP.Your IP",
      deterministicIpValues(stream, "dhcp_your_ip", "0.0.0.0"),
      streamFieldMode(stream, "dhcp_your_ip")
    ),
    captureFieldExpectation(
      "DHCP Server IP",
      "DHCP.Server IP",
      deterministicIpValues(stream, "dhcp_server_ip", "0.0.0.0"),
      streamFieldMode(stream, "dhcp_server_ip")
    ),
    captureFieldExpectation(
      "DHCP Relay IP",
      "DHCP.Relay IP",
      deterministicIpValues(stream, "dhcp_relay_ip", "0.0.0.0"),
      streamFieldMode(stream, "dhcp_relay_ip")
    ),
    captureFieldExpectation(
      "DHCP Client MAC",
      "DHCP.Client MAC",
      deterministicMacValues(stream, "dhcp_client_mac", "00:11:22:33:44:55"),
      streamFieldMode(stream, "dhcp_client_mac")
    ),
    captureFieldExpectation("DHCP Magic Cookie", "DHCP.Magic Cookie", ["63825363"], "Fixed"),
    captureFieldExpectation(
      "DHCP Message Type",
      "DHCP.Message Type",
      deterministicDhcpMessageTypeValues(stream),
      streamFieldMode(stream, "dhcp_message_type")
    ),
    hostname ? captureFieldExpectation("DHCP Hostname", "DHCP.Hostname", [hostname], "Fixed") : null,
    parameterRequestList
      ? captureFieldExpectation("DHCP Parameter Request List", "DHCP.Parameter Request List", [parameterRequestList], "Fixed")
      : null,
    requestedIp !== "0.0.0.0"
      ? captureFieldExpectation(
        "DHCP Requested IP",
        "DHCP.Requested IP",
        deterministicIpValues(stream, "dhcp_requested_ip", "0.0.0.0"),
        streamFieldMode(stream, "dhcp_requested_ip")
      )
      : null,
    serverId !== "0.0.0.0"
      ? captureFieldExpectation(
        "DHCP Server ID",
        "DHCP.Server ID",
        deterministicIpValues(stream, "dhcp_server_id", "0.0.0.0"),
        streamFieldMode(stream, "dhcp_server_id")
      )
      : null,
    leaseTime > 0
      ? captureFieldExpectation(
        "DHCP Lease Time",
        "DHCP.Lease Time",
        deterministicIntValues(stream, "dhcp_lease_time", 0),
        streamFieldMode(stream, "dhcp_lease_time")
      )
      : null,
    renewalTime > 0
      ? captureFieldExpectation(
        "DHCP Renewal Time",
        "DHCP.Renewal Time",
        deterministicIntValues(stream, "dhcp_renewal_time", 0),
        streamFieldMode(stream, "dhcp_renewal_time")
      )
      : null,
    rebindingTime > 0
      ? captureFieldExpectation(
        "DHCP Rebinding Time",
        "DHCP.Rebinding Time",
        deterministicIntValues(stream, "dhcp_rebinding_time", 0),
        streamFieldMode(stream, "dhcp_rebinding_time")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addVlanTagExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream, tagIndex: 1 | 2) {
  if (tagIndex === 1 && !stream.vlan_enabled) {
    return;
  }
  if (tagIndex === 2 && !(stream.vlan_enabled && stream.vlan2_enabled)) {
    return;
  }
  const prefix = tagIndex === 1 ? "vlan" : "vlan2";
  const layerPrefix = tagIndex === 1 ? "802.1Q VLAN" : "802.1Q VLAN[2]";
  const labelPrefix = tagIndex === 1 ? "VLAN" : "VLAN[2]";
  const defaultVlanId = tagIndex === 1 ? 0 : 1;
  const rows = [
    captureFieldExpectation(
      `${labelPrefix} TPID`,
      `${layerPrefix}.TPID`,
      [hexWordValue(stream, `${prefix}_tpid`, "8100")],
      "Fixed"
    ),
    captureFieldExpectation(
      `${labelPrefix} Priority`,
      `${layerPrefix}.Priority`,
      deterministicIntValues(stream, `${prefix}_priority`, 0),
      streamFieldMode(stream, `${prefix}_priority`)
    ),
    captureFieldExpectation(
      `${labelPrefix} DEI`,
      `${layerPrefix}.DEI`,
      deterministicIntValues(stream, `${prefix}_cfi`, 0),
      "Fixed"
    ),
    captureFieldExpectation(
      `${labelPrefix} ID`,
      `${layerPrefix}.VLAN ID`,
      deterministicIntValues(stream, `${prefix}_id`, defaultVlanId),
      streamFieldMode(stream, `${prefix}_id`)
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addVlanExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  addVlanTagExpectations(expectations, stream, 1);
  addVlanTagExpectations(expectations, stream, 2);
}

function addMplsLabelExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream, labelIndex: 1 | 2 | 3) {
  if (labelIndex === 1 && !stream.mpls_enabled) {
    return;
  }
  if (labelIndex === 2 && !(stream.mpls_enabled && stream.mpls_label2_enabled)) {
    return;
  }
  if (labelIndex === 3 && !(stream.mpls_enabled && stream.mpls_label2_enabled && stream.mpls_label3_enabled)) {
    return;
  }
  const labelKey = labelIndex === 1 ? "mpls_label" : `mpls_label${labelIndex}`;
  const tcKey = labelIndex === 1 ? "mpls_tc" : `mpls_label${labelIndex}_tc`;
  const ttlKey = labelIndex === 1 ? "mpls_ttl" : `mpls_label${labelIndex}_ttl`;
  const layerPrefix = labelIndex === 1 ? "MPLS" : `MPLS[${labelIndex}]`;
  const labelPrefix = labelIndex === 1 ? "MPLS" : `MPLS[${labelIndex}]`;
  const labelDefault = labelIndex === 1 ? 17 : labelIndex === 2 ? 18 : 19;
  const bottomOfStack = labelIndex === 1
    ? !stream.mpls_label2_enabled
    : labelIndex === 2
      ? !stream.mpls_label3_enabled
      : true;
  const rows = [
    captureFieldExpectation(
      `${labelPrefix} Label`,
      `${layerPrefix}.Label`,
      deterministicIntValues(stream, labelKey, labelDefault),
      streamFieldMode(stream, labelKey)
    ),
    captureFieldExpectation(
      `${labelPrefix} Traffic Class`,
      `${layerPrefix}.Traffic Class`,
      deterministicIntValues(stream, tcKey, 0),
      streamFieldMode(stream, tcKey)
    ),
    captureFieldExpectation(
      `${labelPrefix} Bottom Of Stack`,
      `${layerPrefix}.Bottom Of Stack`,
      [bottomOfStack ? "1" : "0"],
      "Fixed"
    ),
    captureFieldExpectation(
      `${labelPrefix} TTL`,
      `${layerPrefix}.TTL`,
      deterministicIntValues(stream, ttlKey, 255),
      streamFieldMode(stream, ttlKey)
    )
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addMplsExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  addMplsLabelExpectations(expectations, stream, 1);
  addMplsLabelExpectations(expectations, stream, 2);
  addMplsLabelExpectations(expectations, stream, 3);
}

function gtpuFlagsValue(stream: ProfileWorkbenchStream) {
  return 0x30
    | (stream.gtpu_extension_enabled ? 0x04 : 0)
    | (stream.gtpu_sequence_enabled ? 0x02 : 0)
    | (stream.gtpu_npdu_enabled ? 0x01 : 0);
}

function gtpuMessageTypeName(value: number) {
  const names: Record<number, string> = {
    1: "Echo Request",
    2: "Echo Response",
    26: "Error Indication",
    31: "Supported Extension Headers Notification",
    254: "End Marker",
    255: "G-PDU"
  };
  const label = names[value] ?? "Message";
  return `${label} (${value})`;
}

function addGtpuExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const hasOptionalHeader = Boolean(
    stream.gtpu_sequence_enabled || stream.gtpu_npdu_enabled || stream.gtpu_extension_enabled
  );
  const lengthEnvelope = gtpuLengthEnvelope(stream);
  const baseRows = [
    captureFieldExpectation("GTP-U Flags", "GTP-U.Flags", [hexIntText(gtpuFlagsValue(stream), 2)], "Fixed"),
    captureFieldExpectation("GTP-U Version", "GTP-U.Version", ["1"], "Fixed"),
    captureFieldExpectation("GTP-U Protocol Type", "GTP-U.Protocol Type", ["GTP"], "Fixed"),
    captureFieldExpectation(
      "GTP-U Message Type",
      "GTP-U.Message Type",
      [gtpuMessageTypeName(intStreamValue(stream, "gtpu_message_type", 255))],
      "Fixed"
    ),
    lengthEnvelope
      ? captureFieldExpectation("GTP-U Length", "GTP-U.Length", [String(lengthEnvelope.length)], "Fixed")
      : null,
    lengthEnvelope
      ? captureFieldExpectation(
        "GTP-U Payload Length",
        "GTP-U.Payload Length",
        [String(lengthEnvelope.payloadLength)],
        "Fixed"
      )
      : null,
    captureFieldExpectation(
      "GTP-U TEID",
      "GTP-U.TEID",
      deterministicHexIntValues(stream, "gtpu_teid", 0x12345678),
      streamFieldMode(stream, "gtpu_teid")
    ),
    captureFieldExpectation("GTP-U Extension Header", "GTP-U.Extension Header", [stream.gtpu_extension_enabled ? "yes" : "no"], "Fixed"),
    captureFieldExpectation("GTP-U Sequence Number Present", "GTP-U.Sequence Number Present", [stream.gtpu_sequence_enabled ? "yes" : "no"], "Fixed"),
    captureFieldExpectation("GTP-U N-PDU Present", "GTP-U.N-PDU Present", [stream.gtpu_npdu_enabled ? "yes" : "no"], "Fixed")
  ];
  expectations.push(...baseRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));

  if (!hasOptionalHeader) {
    return;
  }

  const optionalRows = [
    captureFieldExpectation(
      "GTP-U Sequence",
      "GTP-U.Sequence",
      deterministicIntValues(stream, "gtpu_sequence", 0),
      streamFieldMode(stream, "gtpu_sequence")
    ),
    captureFieldExpectation(
      "GTP-U N-PDU Number",
      "GTP-U.N-PDU Number",
      deterministicIntValues(stream, "gtpu_npdu", 0),
      streamFieldMode(stream, "gtpu_npdu")
    ),
    captureFieldExpectation(
      "GTP-U Next Extension Header",
      "GTP-U.Next Extension Header",
      [stream.gtpu_extension_enabled ? "0x40" : "0x00"],
      "Fixed"
    )
  ];
  expectations.push(...optionalRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));

  if (!stream.gtpu_extension_enabled) {
    return;
  }

  const extensionRows = [
    captureFieldExpectation("GTP-U Extension Type", "GTP-U Extension.Type", ["UDP Port (0x40)"], "Fixed"),
    captureFieldExpectation("GTP-U Extension Length Units", "GTP-U Extension.Length Units", ["1"], "Fixed"),
    captureFieldExpectation("GTP-U Extension Length", "GTP-U Extension.Length", ["4"], "Fixed"),
    captureFieldExpectation(
      "GTP-U Extension UDP Port",
      "GTP-U Extension.UDP Port",
      deterministicIntValues(stream, "gtpu_extension_udp_port", 2152),
      streamFieldMode(stream, "gtpu_extension_udp_port")
    ),
    captureFieldExpectation(
      "GTP-U Extension Next Header",
      "GTP-U Extension.Next Extension Header",
      ["0x00"],
      "Fixed"
    )
  ];
  expectations.push(...extensionRows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function addVxlanExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const rows = [
    captureFieldExpectation(
      "VXLAN Inner Ethernet Destination",
      "Inner Ethernet.Destination",
      [textStreamValue(stream, "vxlan_inner_ether_dst", "00:00:00:00:00:00").toLowerCase()],
      "Fixed"
    ),
    captureFieldExpectation(
      "VXLAN Inner Ethernet Source",
      "Inner Ethernet.Source",
      [textStreamValue(stream, "vxlan_inner_ether_src", "00:00:00:00:00:00").toLowerCase()],
      "Fixed"
    ),
    captureFieldExpectation(
      "VXLAN Inner Ethernet EtherType",
      "Inner Ethernet.EtherType",
      [stream.vxlan_inner_ip_version === "IPv6" ? "0x86dd" : "0x0800"],
      "Fixed"
    ),
    captureFieldExpectation("VXLAN Flags", "VXLAN.Flags", ["0x08"], "Fixed"),
    captureFieldExpectation("VXLAN Reserved", "VXLAN.Reserved", ["0x000000"], "Fixed"),
    captureFieldExpectation(
      "VXLAN VNI",
      "VXLAN.VNI",
      deterministicIntValues(stream, "vxlan_vni", 42),
      streamFieldMode(stream, "vxlan_vni")
    ),
    captureFieldExpectation("VXLAN VNI Reserved", "VXLAN.VNI Reserved", ["0x00"], "Fixed")
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function greFlagsValue(stream: ProfileWorkbenchStream) {
  let flags = 0;
  if (stream.gre_checksum_present) {
    flags |= 0x8000;
  }
  if (stream.gre_key_present) {
    flags |= 0x2000;
  }
  if (stream.gre_sequence_present) {
    flags |= 0x1000;
  }
  return flags;
}

function canExpectGreChecksum(stream: ProfileWorkbenchStream) {
  if (!stream.gre_checksum_present || !stream.gre_checksum_override) {
    return false;
  }
  if (stream.frame_length_type !== "Fixed") {
    return false;
  }
  const checksumCoveredKeys = [
    "gre_key",
    "gre_sequence",
    "gre_inner_ipv4_src",
    "gre_inner_ipv4_dst",
    "gre_inner_ipv4_ttl",
    "gre_inner_ipv6_src",
    "gre_inner_ipv6_dst",
    "gre_inner_ipv6_hop_limit",
    "gre_inner_l4_src_port",
    "gre_inner_l4_dst_port"
  ];
  return checksumCoveredKeys.every((key) => streamFieldMode(stream, key) === "Fixed");
}

function addGreExpectations(expectations: CaptureFieldExpectation[], stream: ProfileWorkbenchStream) {
  const rows = [
    captureFieldExpectation(
      "GRE Flags",
      "GRE.Flags",
      [hexIntText(greFlagsValue(stream), 4)],
      "Fixed"
    ),
    captureFieldExpectation(
      "GRE Protocol Type",
      "GRE.Protocol Type",
      [greProtocolTypeExpectation(stream)],
      "Fixed"
    ),
    canExpectGreChecksum(stream)
      ? captureFieldExpectation(
        "GRE Checksum",
        "GRE.Checksum",
        deterministicHexWordValues(stream, "gre_checksum", "0000"),
        streamFieldMode(stream, "gre_checksum")
      )
      : null,
    stream.gre_key_present
      ? captureFieldExpectation(
        "GRE Key",
        "GRE.Key",
        deterministicHexIntValues(stream, "gre_key", 0),
        streamFieldMode(stream, "gre_key")
      )
      : null,
    stream.gre_sequence_present
      ? captureFieldExpectation(
        "GRE Sequence",
        "GRE.Sequence",
        deterministicIntValues(stream, "gre_sequence", 0),
        streamFieldMode(stream, "gre_sequence")
      )
      : null
  ];
  expectations.push(...rows.filter((row): row is CaptureFieldExpectation => Boolean(row)));
}

function workbenchFieldExpectations(stream: ProfileWorkbenchStream) {
  const expectations: CaptureFieldExpectation[] = [];
  addEthernetExpectations(expectations, stream);
  addVlanExpectations(expectations, stream);
  addMplsExpectations(expectations, stream);
  if (stream.packet_type === "Ethernet/ARP") {
    addArpExpectations(expectations, stream);
    return expectations;
  }
  if (stream.gtpu_enabled) {
    addIpExpectations(expectations, stream, {
      layerPrefix: "IPv4",
      sourceKey: "ipv4_src",
      sourceDefault: "16.0.0.1",
      destinationKey: "ipv4_dst",
      destinationDefault: "48.0.0.1",
      ttlKey: "ipv4_ttl",
      ttlDefault: 127,
      ttlLabel: "TTL",
      sourceAliases: ["src_ipv4"],
      destinationAliases: ["dst_ipv4"]
    });
    addIpv4HeaderExpectations(expectations, stream);
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP",
      sourceKey: "l4_src_port",
      destinationKey: "l4_dst_port",
      sourceDefault: 2152,
      destinationDefault: 2152
    });
    addUdpHeaderExpectations(expectations, stream, { includeChecksum: false });
    if (stream.gtpu_inner_ip_version === "IPv6") {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv6",
        sourceKey: "gtpu_inner_ipv6_src",
        sourceDefault: "2001:db8:30::1",
        destinationKey: "gtpu_inner_ipv6_dst",
        destinationDefault: "2001:db8:30::2",
        ttlKey: "gtpu_inner_ipv6_hop_limit",
        ttlDefault: 64,
        ttlLabel: "Hop Limit"
      });
    } else {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv4[2]",
        sourceKey: "gtpu_inner_ipv4_src",
        sourceDefault: "10.3.0.1",
        destinationKey: "gtpu_inner_ipv4_dst",
        destinationDefault: "10.3.0.2",
        ttlKey: "gtpu_inner_ipv4_ttl",
        ttlDefault: 64,
        ttlLabel: "TTL"
      });
    }
    addGtpuInnerIpHeaderExpectations(expectations, stream);
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP[2]",
      sourceKey: "gtpu_inner_l4_src_port",
      destinationKey: "gtpu_inner_l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addUdpHeaderExpectations(expectations, stream, {
      layerPrefix: "UDP[2]",
      udpLengths: deterministicGtpuInnerUdpLengths(stream),
      includeChecksum: false
    });
    addGtpuExpectations(expectations, stream);
    return expectations;
  }
  if (stream.vxlan_enabled) {
    addIpExpectations(expectations, stream, {
      layerPrefix: "IPv4",
      sourceKey: "ipv4_src",
      sourceDefault: "16.0.0.1",
      destinationKey: "ipv4_dst",
      destinationDefault: "48.0.0.1",
      ttlKey: "ipv4_ttl",
      ttlDefault: 127,
      ttlLabel: "TTL",
      sourceAliases: ["src_ipv4"],
      destinationAliases: ["dst_ipv4"]
    });
    addIpv4HeaderExpectations(expectations, stream);
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP",
      sourceKey: "l4_src_port",
      destinationKey: "l4_dst_port",
      sourceDefault: 1337,
      destinationDefault: 4789
    });
    addUdpHeaderExpectations(expectations, stream, { includeChecksum: false });
    if (stream.vxlan_inner_ip_version === "IPv6") {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv6",
        sourceKey: "vxlan_inner_ipv6_src",
        sourceDefault: "2001:db8:50::1",
        destinationKey: "vxlan_inner_ipv6_dst",
        destinationDefault: "2001:db8:50::2",
        ttlKey: "vxlan_inner_ipv6_hop_limit",
        ttlDefault: 64,
        ttlLabel: "Hop Limit"
      });
      addVxlanInnerIpv6HeaderExpectations(expectations, stream);
    } else {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv4[2]",
        sourceKey: "vxlan_inner_ipv4_src",
        sourceDefault: "10.0.0.1",
        destinationKey: "vxlan_inner_ipv4_dst",
        destinationDefault: "10.0.0.2",
        ttlKey: "vxlan_inner_ipv4_ttl",
        ttlDefault: 127,
        ttlLabel: "TTL"
      });
      addVxlanInnerIpv4HeaderExpectations(expectations, stream);
    }
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP[2]",
      sourceKey: "vxlan_inner_l4_src_port",
      destinationKey: "vxlan_inner_l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addUdpHeaderExpectations(expectations, stream, {
      layerPrefix: "UDP[2]",
      udpLengths: deterministicVxlanInnerUdpLengths(stream),
      includeChecksum: false
    });
    addVxlanExpectations(expectations, stream);
    return expectations;
  }
  if (stream.packet_type.endsWith("/GRE")) {
    if (stream.packet_type.startsWith("Ethernet/IPv4")) {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv4",
        sourceKey: "ipv4_src",
        sourceDefault: "16.0.0.1",
        destinationKey: "ipv4_dst",
        destinationDefault: "48.0.0.1",
        ttlKey: "ipv4_ttl",
        ttlDefault: 127,
        ttlLabel: "TTL",
        sourceAliases: ["src_ipv4"],
        destinationAliases: ["dst_ipv4"]
      });
      addIpv4HeaderExpectations(expectations, stream);
    } else if (stream.packet_type.startsWith("Ethernet/IPv6")) {
      addIpExpectations(expectations, stream, {
        layerPrefix: "IPv6",
        sourceKey: "ipv6_src",
        sourceDefault: "2001:db8::1",
        destinationKey: "ipv6_dst",
        destinationDefault: "2001:db8::2",
        ttlKey: "ipv6_hop_limit",
        ttlDefault: 127,
        ttlLabel: "Hop Limit"
      });
      addIpv6HeaderExpectations(expectations, stream);
    }
    addGreExpectations(expectations, stream);
    const greInnerVersion = greInnerIpVersion(stream);
    const innerIpv4Prefix = stream.packet_type.startsWith("Ethernet/IPv4") ? "IPv4[2]" : "IPv4";
    const innerIpv6Prefix = stream.packet_type.startsWith("Ethernet/IPv6") ? "IPv6[2]" : "IPv6";
    if (greInnerVersion === "IPv6") {
      addIpExpectations(expectations, stream, {
        layerPrefix: innerIpv6Prefix,
        sourceKey: "gre_inner_ipv6_src",
        sourceDefault: "2001:db8:40::1",
        destinationKey: "gre_inner_ipv6_dst",
        destinationDefault: "2001:db8:40::2",
        ttlKey: "gre_inner_ipv6_hop_limit",
        ttlDefault: 64,
        ttlLabel: "Hop Limit"
      });
      addGreInnerIpv6HeaderExpectations(expectations, stream, innerIpv6Prefix);
    } else {
      addIpExpectations(expectations, stream, {
        layerPrefix: innerIpv4Prefix,
        sourceKey: "gre_inner_ipv4_src",
        sourceDefault: "10.2.0.1",
        destinationKey: "gre_inner_ipv4_dst",
        destinationDefault: "10.2.0.2",
        ttlKey: "gre_inner_ipv4_ttl",
        ttlDefault: 64,
        ttlLabel: "TTL"
      });
      addGreInnerIpv4HeaderExpectations(expectations, stream, innerIpv4Prefix);
    }
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP",
      sourceKey: "gre_inner_l4_src_port",
      destinationKey: "gre_inner_l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addUdpHeaderExpectations(expectations, stream, {
      udpLengths: deterministicGreInnerUdpLengths(stream),
      includeChecksum: false
    });
    return expectations;
  }
  if (stream.packet_type.startsWith("Ethernet/IPv4")) {
    addIpExpectations(expectations, stream, {
      layerPrefix: "IPv4",
      sourceKey: "ipv4_src",
      sourceDefault: "16.0.0.1",
      destinationKey: "ipv4_dst",
      destinationDefault: "48.0.0.1",
      ttlKey: "ipv4_ttl",
      ttlDefault: 127,
      ttlLabel: "TTL",
      sourceAliases: ["src_ipv4"],
      destinationAliases: ["dst_ipv4"]
    });
    addIpv4HeaderExpectations(expectations, stream);
  }
  if (stream.packet_type.startsWith("Ethernet/IPv6")) {
    addIpExpectations(expectations, stream, {
      layerPrefix: "IPv6",
      sourceKey: "ipv6_src",
      sourceDefault: "2001:db8::1",
      destinationKey: "ipv6_dst",
      destinationDefault: "2001:db8::2",
      ttlKey: "ipv6_hop_limit",
      ttlDefault: 127,
      ttlLabel: "Hop Limit"
    });
    addIpv6HeaderExpectations(expectations, stream);
  }
  if (stream.packet_type.endsWith("/UDP")) {
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "UDP",
      sourceKey: "l4_src_port",
      destinationKey: "l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addUdpHeaderExpectations(expectations, stream);
    if (stream.dns_enabled) {
      addDnsExpectations(expectations, stream);
    }
    if (stream.dhcp_enabled) {
      addDhcpExpectations(expectations, stream);
    }
  }
  if (stream.packet_type.endsWith("/TCP")) {
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "TCP",
      sourceKey: "l4_src_port",
      destinationKey: "l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addTcpExpectations(expectations, stream);
  }
  if (stream.packet_type.endsWith("/SCTP")) {
    addL4PortExpectations(expectations, stream, {
      layerPrefix: "SCTP",
      sourceKey: "l4_src_port",
      destinationKey: "l4_dst_port",
      sourceDefault: 1025,
      destinationDefault: 12
    });
    addSctpExpectations(expectations, stream);
  }
  addIcmpv6DiscoveryExpectations(expectations, stream);
  addIcmpEchoExpectations(expectations, stream);
  return expectations;
}

function workbenchStreamIntentRows(streams: ProfileWorkbenchStream[] | null | undefined) {
  return (streams ?? []).slice(0, 64).map((stream, index) => {
    const fieldEngines = workbenchFieldEngines(stream);
    const fieldExpectations = workbenchFieldExpectations(stream);
    return {
      index: index + 1,
      name: stream.name,
      enabled: Boolean(stream.enabled),
      self_start: Boolean(stream.self_start),
      packet_type: workbenchPacketType(stream),
      length: stream.frame_length_type === "Fixed"
        ? String(stream.frame_length)
        : `${stream.frame_length_type} ${stream.frame_length_min}-${stream.frame_length_max}`,
      mode: stream.mode,
      rate: `${stream.rate_value} ${stream.rate_type}`,
      pg_id: stream.flow_stats_enabled || stream.latency_enabled ? stream.pg_id : null,
      rx_stats: Boolean(stream.flow_stats_enabled),
      latency: Boolean(stream.latency_enabled),
      next_stream: stream.next_stream_id === null ? "-" : String(stream.next_stream_id),
      expected_layer_chain: workbenchExpectedLayerChain(stream),
      field_engines: fieldEngines,
      field_engine_count: fieldEngines.length,
      field_expectations: fieldExpectations,
      field_expectation_count: fieldExpectations.length
    };
  });
}

type ProfileStreamIntentRow = ReturnType<typeof workbenchStreamIntentRows>[number];

function uniqueText(values: string[]) {
  return values.filter((value, index, all) => value !== "-" && all.indexOf(value) === index);
}

function layerChainParts(value: string) {
  return value.split(">").map((part) => part.trim()).filter(Boolean);
}

function comparableLayerChain(value: string) {
  const transparentLayers = new Set(["802.1Q VLAN", "MPLS"]);
  return layerChainParts(value).filter((layer) => !transparentLayers.has(layer)).join(" > ");
}

function layerChainMatches(expected: string, observed: string) {
  const normalizedExpected = comparableLayerChain(expected);
  const normalizedObserved = comparableLayerChain(observed);
  if (!normalizedExpected || !normalizedObserved) {
    return false;
  }
  if (normalizedObserved === normalizedExpected) {
    return true;
  }
  if (!normalizedObserved.startsWith(`${normalizedExpected} > `)) {
    return false;
  }
  const suffix = layerChainParts(normalizedObserved.slice(normalizedExpected.length + 3));
  const firstExtraLayer = suffix[0] ?? "";
  return ["DNS", "DHCP", "Payload", "Data", "Raw"].includes(firstExtraLayer)
    || normalizedExpected.endsWith(" > IPv4")
    || normalizedExpected.endsWith(" > IPv6");
}

function buildCaptureLayerMatch(profileStreams: ProfileStreamIntentRow[], capturePackets: TrexCapturePacket[]): CaptureLayerMatch {
  const expected = uniqueText(
    profileStreams
      .filter((stream) => stream.enabled)
      .map((stream) => stream.expected_layer_chain)
  );
  const observed = uniqueText(capturePackets.map(capturePacketLayerChain));
  if (!expected.length) {
    return {
      applicable: false,
      status: "unknown",
      summary: "No editable stream intent is attached for capture matching",
      action: "Load or save an editable YAML profile before archiving if packet intent matching is required",
      expected,
      observed,
      matched: [],
      missing: [],
      unexpected: observed
    };
  }
  if (!observed.length) {
    return {
      applicable: true,
      status: "unknown",
      summary: "No decoded capture layer chains are available to compare with the profile intent",
      action: "Fetch or stop capture after traffic is running, then refresh the report snapshot",
      expected,
      observed,
      matched: [],
      missing: expected,
      unexpected: []
    };
  }
  const matched = expected.filter((expectedChain) => observed.some((observedChain) => layerChainMatches(expectedChain, observedChain)));
  const missing = expected.filter((expectedChain) => !matched.includes(expectedChain));
  const unexpected = observed.filter((observedChain) => !expected.some((expectedChain) => layerChainMatches(expectedChain, observedChain)));
  if (!missing.length) {
    return {
      applicable: true,
      status: "pass",
      summary: `Capture decode matched ${displayCount(matched.length)} expected stream layer chain(s)`,
      action: "No operator action required",
      expected,
      observed,
      matched,
      missing,
      unexpected
    };
  }
  const status: RunReportVerdict = matched.length > 0 ? "warn" : "fail";
  return {
    applicable: true,
    status,
    summary: matched.length > 0
      ? `Capture decode matched ${displayCount(matched.length)} chain(s) but missed ${displayCount(missing.length)} expected chain(s)`
      : "Captured layer chains did not match the loaded stream intent",
    action: "Compare Stream Builder protocol selection with the captured packet decode and confirm the selected profile is the one that was started",
    expected,
    observed,
    matched,
    missing,
    unexpected
  };
}

function profileFieldExpectationRows(profileStreams: ProfileStreamIntentRow[]) {
  return profileStreams.flatMap((stream) => {
    if (!stream.enabled) {
      return [];
    }
    return stream.field_expectations.map((expectation) => ({
      ...expectation,
      stream: stream.name
    }));
  });
}

function buildCaptureFieldMatch(profileStreams: ProfileStreamIntentRow[], fieldSummary: ReturnType<typeof captureFieldSummary>): CaptureFieldMatch {
  const expected = profileFieldExpectationRows(profileStreams);
  const observed = fieldSummary.fields;
  if (!expected.length) {
    return {
      applicable: false,
      status: "unknown",
      summary: "No deterministic profile fields are attached for capture matching",
      action: "Use fixed or deterministic increment/decrement Stream Builder fields to validate capture field values",
      expected: [],
      observed,
      matched: [],
      missing: []
    };
  }
  if (Object.keys(observed).length === 0) {
    return {
      applicable: true,
      status: "unknown",
      summary: "No decoded capture fields are available to compare with the profile intent",
      action: "Fetch or stop capture after traffic is running, then refresh the report snapshot",
      expected,
      observed,
      matched: [],
      missing: expected.map((row) => ({
        ...row,
        observed_values: [],
        missing_values: row.expected_values
      }))
    };
  }

  const matched: CaptureFieldMatchRow[] = [];
  const missing: CaptureFieldMatchRow[] = [];
  for (const row of expected) {
    const observedValues = uniqueText(observed[row.field] ?? []);
    const missingValues = row.expected_values.filter((value) => !observedValues.includes(value));
    const record = {
      ...row,
      observed_values: observedValues,
      missing_values: missingValues
    };
    if (missingValues.length > 0) {
      missing.push(record);
    } else {
      matched.push(record);
    }
  }
  if (missing.length === 0) {
    return {
      applicable: true,
      status: "pass",
      summary: `Capture decode matched ${displayCount(matched.length)} expected profile field(s)`,
      action: "No operator action required",
      expected,
      observed,
      matched,
      missing
    };
  }
  return {
    applicable: true,
    status: "fail",
    summary: `Capture decode missed ${displayCount(missing.length)} expected profile field(s)`,
    action: "Compare Stream Builder field values with the captured packet decode and confirm enough packets were captured for Field Engine cycles",
    expected,
    observed,
    matched,
    missing
  };
}

function buildDiagnostics(input: {
  activeRecorders: number;
  availableCaptures: number;
  captureFieldMatch: CaptureFieldMatch;
  captureLayerMatch: CaptureLayerMatch;
  capturePackets: TrexCapturePacket[];
  dropBps: number;
  latencyAvg: number | null;
  latencyErrors: number;
  portErrors: number;
  queueFull: number;
  savedCaptures: number;
  startResult: TrexResult<unknown> | null;
  stats: TrexStatsSnapshot | null;
  statsResult: TrexResult<TrexStatsSnapshot> | null;
  stopEvidence: RunReportStopEvidence;
  txBps: number | null;
  rxBps: number | null;
  txPps: number | null;
  rxPps: number | null;
  txPackets: number;
  rxPackets: number;
}): RunReportDiagnostic[] {
  const diagnostics: RunReportDiagnostic[] = [];
  const startDiagnostic = trexResultDiagnostic(input.startResult);
  const packetDelta = Math.abs(input.txPackets - input.rxPackets);
  const rateGap = percentGapText(input.txPps, input.rxPps) ?? percentGapText(input.txBps, input.rxBps);
  const flowIssues = flowStatsIssues(input.stats);
  const lossIssues = [
    input.dropBps > 0 ? `drop ${displayBitRate(input.dropBps)}` : "",
    input.queueFull > 0 ? `queue full ${displayCount(input.queueFull)}` : "",
    input.portErrors > 0 ? `port errors ${displayCount(input.portErrors)}` : "",
    input.latencyErrors > 0 ? `latency errors ${displayCount(input.latencyErrors)}` : "",
    packetDelta > 0 ? `packet delta ${displayCount(packetDelta)}` : "",
    ...flowIssues
  ].filter(Boolean);
  const hasRate = [input.txBps, input.rxBps, input.txPps, input.rxPps].some((value) => (value ?? 0) > 0);

  diagnostics.push({
    label: "Run control",
    status: input.startResult && !input.startResult.ok || input.stopEvidence.verdict === "fail"
      ? "fail"
      : input.startResult?.ok && input.stopEvidence.verdict === "pass"
        ? "pass"
        : input.stopEvidence.verdict === "warn" || input.startResult?.ok
          ? "warn"
          : "unknown",
    summary: input.startResult && !input.startResult.ok
      ? `Start blocked: ${startDiagnostic?.summary ?? input.startResult.error ?? input.startResult.blocker ?? "traffic start failed"}`
      : input.stopEvidence.verdict === "fail"
        ? `Stop blocked: ${input.stopEvidence.detail}`
        : input.startResult?.ok && input.stopEvidence.verdict === "pass"
          ? "Start and stop commands were both accepted"
          : input.stopEvidence.verdict === "warn"
            ? input.stopEvidence.detail
            : input.startResult?.ok
            ? "Traffic start was accepted; stop result is not in this report"
            : "No start command result was captured",
    action: input.startResult && !input.startResult.ok
      ? startDiagnostic?.action ?? "Resolve the TRex start blocker and rerun the profile"
      : input.stopEvidence.verdict === "fail"
        ? "Confirm the selected ports are reachable, then stop traffic again before archiving"
        : input.stopEvidence.verdict === "warn" || input.startResult?.ok && !input.stopEvidence.result
          ? "Stop traffic and refresh the report snapshot for a closed run window"
          : "No operator action required",
    evidence: runReportEvidence([
      ["Start", input.startResult ? input.startResult.ok ? "accepted" : "blocked" : "-"],
      ["Stop", input.stopEvidence.verdict]
    ])
  });

  diagnostics.push({
    label: "Throughput balance",
    status: !input.stats && !input.statsResult
      ? "unknown"
      : !hasRate
        ? "unknown"
        : input.txPps !== null && input.txPps > 0 && (input.rxPps ?? 0) <= 0
          ? "warn"
          : rateGap && Number(rateGap.replace("%", "")) > 5
            ? "warn"
            : "pass",
    summary: !input.stats && !input.statsResult
      ? "No stats snapshot is available for rate analysis"
      : !hasRate
        ? "No non-zero rate counters were observed"
        : input.txPps !== null && input.txPps > 0 && (input.rxPps ?? 0) <= 0
          ? "TX is active while RX counters are zero"
          : rateGap
            ? `TX/RX rate gap is ${rateGap}`
            : "Rate counters are present",
    action: !input.stats
      ? "Refresh stats after traffic has been running for at least one sampler interval"
      : input.txPps !== null && input.txPps > 0 && (input.rxPps ?? 0) <= 0
        ? "Verify cabling, port pair direction, or whether this profile is intentionally one-way"
        : rateGap && Number(rateGap.replace("%", "")) > 5
          ? "Check asymmetric profile direction, RX filters, and port pair topology"
          : "No operator action required",
    evidence: runReportEvidence([
      ["Tx L2", displayBitRate(input.txBps)],
      ["Rx L2", displayBitRate(input.rxBps)],
      ["Tx PPS", displayPacketRate(input.txPps)],
      ["Rx PPS", displayPacketRate(input.rxPps)]
    ])
  });

  diagnostics.push({
    label: "Loss and errors",
    status: !input.stats && !input.statsResult ? "unknown" : lossIssues.length > 0 ? "fail" : "pass",
    summary: !input.stats && !input.statsResult
      ? "No stats snapshot is available for loss analysis"
      : lossIssues.length > 0
        ? lossIssues.slice(0, 4).join("; ")
        : "No drops, queue pressure, port errors, latency errors, packet delta, or flow-stat deficits were detected",
    action: lossIssues.length > 0
      ? "Inspect queue pressure, port counters, latency PG IDs, and RX filters before treating the run as clean"
      : input.stats ? "No operator action required" : "Capture a stats snapshot before archiving",
    evidence: runReportEvidence([
      ["Drop rate", displayBitRate(input.dropBps)],
      ["Queue full", displayCount(input.queueFull)],
      ["Port errors", displayCount(input.portErrors)],
      ["Latency errors", displayCount(input.latencyErrors)],
      ["Packet delta", displayCount(packetDelta)]
    ])
  });

  diagnostics.push({
    label: "Latency",
    status: input.latencyErrors > 0
      ? "fail"
      : input.latencyAvg === null
        ? "unknown"
        : input.latencyAvg >= 1000
          ? "warn"
          : "pass",
    summary: input.latencyErrors > 0
      ? `Latency error counters are non-zero (${displayCount(input.latencyErrors)})`
      : input.latencyAvg === null
        ? "No latency average was available in the stats snapshot"
        : input.latencyAvg >= 1000
          ? `Average latency is elevated at ${displayLatencyUs(input.latencyAvg)}`
          : `Average latency is ${displayLatencyUs(input.latencyAvg)}`,
    action: input.latencyErrors > 0
      ? "Open Dashboard latency details and map failing PG IDs back to streams"
      : input.latencyAvg === null
        ? "Enable latency/RX stats on the stream if latency is part of this test"
        : input.latencyAvg >= 1000
          ? "Correlate latency with queue-full, drops, and downstream device counters"
          : "No operator action required",
    evidence: runReportEvidence([
      ["Latency avg", displayLatencyUs(input.latencyAvg)],
      ["Latency errors", displayCount(input.latencyErrors)]
    ])
  });

  diagnostics.push({
    label: "Capture coverage",
    status: input.capturePackets.length > 0 || input.savedCaptures > 0
      ? "pass"
      : input.activeRecorders > 0
        ? "warn"
        : "unknown",
    summary: input.capturePackets.length > 0 || input.savedCaptures > 0
      ? `${displayCount(input.capturePackets.length)} monitor packets and ${displayCount(input.savedCaptures)} saved capture file(s) are linked to the report`
      : input.activeRecorders > 0
        ? `${displayCount(input.activeRecorders)} recorder(s) are active, but no packet evidence is included yet`
        : input.availableCaptures > 0
          ? `No current-run packet evidence is attached; ${displayCount(input.availableCaptures)} global capture file(s) are inventory context only`
          : "No monitor packets or saved captures are attached to this report",
    action: input.capturePackets.length > 0 || input.savedCaptures > 0
      ? "No operator action required"
      : input.activeRecorders > 0
        ? "Fetch or stop the recorder before saving the final report"
        : "Start capture before the run if packet evidence is required",
    evidence: runReportEvidence([
      ["Active recorders", displayCount(input.activeRecorders)],
      ["Monitor packets", displayCount(input.capturePackets.length)],
      ["Saved captures", displayCount(input.savedCaptures)],
      ["Global capture inventory", displayCount(input.availableCaptures)]
    ])
  });

  if (input.captureLayerMatch.applicable) {
    diagnostics.push({
      label: "Profile/capture match",
      status: input.captureLayerMatch.status,
      summary: input.captureLayerMatch.summary,
      action: input.captureLayerMatch.action,
      evidence: runReportEvidence([
        ["Expected chains", input.captureLayerMatch.expected.join(" | ") || "-"],
        ["Observed chains", input.captureLayerMatch.observed.join(" | ") || "-"],
        ["Matched", input.captureLayerMatch.matched.join(" | ") || "-"],
        ["Missing", input.captureLayerMatch.missing.join(" | ") || "-"],
        ["Unexpected", input.captureLayerMatch.unexpected.join(" | ") || "-"]
      ])
    });
  }

  if (input.captureFieldMatch.applicable) {
    diagnostics.push({
      label: "Profile/capture fields",
      status: input.captureFieldMatch.status,
      summary: input.captureFieldMatch.summary,
      action: input.captureFieldMatch.action,
      evidence: runReportEvidence([
        ["Expected fields", displayCount(input.captureFieldMatch.expected.length)],
        ["Matched", displayCount(input.captureFieldMatch.matched.length)],
        ["Missing", input.captureFieldMatch.missing.map((row) => `${row.field}: ${row.missing_values.join("/")}`).join(" | ") || "-"]
      ])
    });
  }

  return diagnostics;
}

function buildTemplateAssessment(input: {
  activeRecorders: number;
  availableCaptures: number;
  captureFieldMatch: CaptureFieldMatch;
  captureLayerMatch: CaptureLayerMatch;
  capturePackets: TrexCapturePacket[];
  diagnostics: RunReportDiagnostic[];
  dropBps: number;
  latencyAvg: number | null;
  latencyErrors: number;
  portErrors: number;
  queueFull: number;
  savedCaptures: number;
  startResult: TrexResult<unknown> | null;
  stats: TrexStatsSnapshot | null;
  statsResult: TrexResult<TrexStatsSnapshot> | null;
  stopEvidence: RunReportStopEvidence;
  template: RunReportTemplate;
  txBps: number | null;
  rxBps: number | null;
  txPps: number | null;
  rxPps: number | null;
  txPackets: number;
  rxPackets: number;
}): RunReportTemplateAssessment {
  const rateGap = percentGapValue(input.txPps, input.rxPps) ?? percentGapValue(input.txBps, input.rxBps);
  const packetDelta = Math.abs(input.txPackets - input.rxPackets);
  const flowIssues = flowStatsIssues(input.stats);
  const lossIssues = [
    input.dropBps > 0 ? `drop ${displayBitRate(input.dropBps)}` : "",
    input.queueFull > 0 ? `queue full ${displayCount(input.queueFull)}` : "",
    input.portErrors > 0 ? `port errors ${displayCount(input.portErrors)}` : "",
    input.latencyErrors > 0 ? `latency errors ${displayCount(input.latencyErrors)}` : "",
    packetDelta > 0 ? `packet delta ${displayCount(packetDelta)}` : "",
    ...flowIssues
  ].filter(Boolean);
  const hasTrafficEvidence = [
    input.txBps,
    input.rxBps,
    input.txPps,
    input.rxPps,
    input.txPackets,
    input.rxPackets,
    input.capturePackets.length
  ].some((value) => (value ?? 0) > 0);
  const runControlCheck: RunReportCheck = input.startResult && !input.startResult.ok
    ? {
        label: "Closed run window",
        status: "fail",
        detail: input.startResult.error ?? input.startResult.blocker ?? "Start command failed"
      }
    : input.stopEvidence.verdict === "fail"
      ? {
          label: "Closed run window",
          status: "fail",
          detail: input.stopEvidence.detail
        }
      : input.startResult?.ok && input.stopEvidence.verdict === "pass"
        ? {
            label: "Closed run window",
            status: "pass",
            detail: "Start and stop commands were both accepted"
          }
        : input.stopEvidence.verdict === "warn" || input.startResult?.ok
          ? {
              label: "Closed run window",
              status: "warn",
              detail: input.stopEvidence.verdict === "warn"
                ? input.stopEvidence.detail
                : "Start was accepted, but no stop result is attached"
            }
          : {
              label: "Closed run window",
              status: "unknown",
              detail: "No start/stop command window is attached"
            };
  const statsEvidenceCheck: RunReportCheck = !input.stats && !input.statsResult
    ? {
        label: "Stats evidence",
        status: "unknown",
        detail: "No stats snapshot was attached"
      }
    : input.statsResult && !input.statsResult.ok
      ? {
          label: "Stats evidence",
          status: "fail",
          detail: input.statsResult.error ?? input.statsResult.blocker ?? "Stats snapshot failed"
        }
      : hasTrafficEvidence
        ? {
            label: "Stats evidence",
            status: "pass",
            detail: "Traffic counters or packet evidence are present"
          }
        : {
            label: "Stats evidence",
            status: "unknown",
            detail: "Stats snapshot has no non-zero traffic counters"
          };
  const lossCheck: RunReportCheck = !input.stats && !input.statsResult
    ? {
        label: "Loss-free counters",
        status: "unknown",
        detail: "No stats snapshot was attached"
      }
    : lossIssues.length > 0
      ? {
          label: "Loss-free counters",
          status: "fail",
          detail: lossIssues.slice(0, 5).join("; ")
        }
      : {
          label: "Loss-free counters",
          status: "pass",
          detail: "No drops, queue pressure, port errors, latency errors, packet delta, or flow-stat deficits"
        };

  let criteria: RunReportCheck[];
  if (input.template.id === "throughput") {
    const balanceCheck: RunReportCheck = rateGap === null
      ? {
          label: "TX/RX rate balance",
          status: "unknown",
          detail: "No comparable TX/RX rate counters were attached"
        }
      : input.txPps !== null && input.txPps > 0 && (input.rxPps ?? 0) <= 0
        ? {
            label: "TX/RX rate balance",
            status: "fail",
            detail: "TX is active while RX counters are zero"
          }
        : rateGap > 5
          ? {
              label: "TX/RX rate balance",
              status: "fail",
              detail: `TX/RX rate gap is ${rateGap.toFixed(rateGap < 10 ? 1 : 0).replace(/\.0$/, "")}%`
            }
          : {
              label: "TX/RX rate balance",
              status: "pass",
              detail: `TX/RX rate gap is ${rateGap.toFixed(rateGap < 10 ? 1 : 0).replace(/\.0$/, "")}%`
            };
    criteria = [runControlCheck, statsEvidenceCheck, balanceCheck, lossCheck];
  } else if (input.template.id === "latency") {
    const latencyEvidenceCheck: RunReportCheck = input.latencyAvg === null
      ? {
          label: "Latency sample",
          status: "unknown",
          detail: "No latency average was attached"
        }
      : {
          label: "Latency sample",
          status: "pass",
          detail: `Average latency ${displayLatencyUs(input.latencyAvg)}`
        };
    const latencyErrorCheck: RunReportCheck = input.latencyErrors > 0
      ? {
          label: "Latency error counters",
          status: "fail",
          detail: `Latency errors ${displayCount(input.latencyErrors)}`
        }
      : input.latencyAvg === null
        ? {
            label: "Latency error counters",
            status: "unknown",
            detail: "No latency counter scope was attached"
          }
        : {
            label: "Latency error counters",
            status: "pass",
            detail: "Latency error counters are clean"
          };
    const latencyThresholdCheck: RunReportCheck = input.latencyAvg === null
      ? {
          label: "Latency threshold",
          status: "unknown",
          detail: "No average latency to compare"
        }
      : input.latencyAvg >= 1000
        ? {
            label: "Latency threshold",
            status: "warn",
            detail: `Average latency is elevated at ${displayLatencyUs(input.latencyAvg)}`
          }
        : {
            label: "Latency threshold",
            status: "pass",
            detail: `Average latency is below 1 ms (${displayLatencyUs(input.latencyAvg)})`
          };
    criteria = [runControlCheck, statsEvidenceCheck, latencyEvidenceCheck, latencyErrorCheck, latencyThresholdCheck, lossCheck];
  } else if (input.template.id === "capture") {
    const captureEvidenceCheck: RunReportCheck = input.capturePackets.length > 0 || input.savedCaptures > 0
      ? {
          label: "Packet evidence",
          status: "pass",
          detail: `${displayCount(input.capturePackets.length)} monitor packets and ${displayCount(input.savedCaptures)} saved capture file(s)`
        }
      : input.activeRecorders > 0
        ? {
            label: "Packet evidence",
            status: "warn",
            detail: `${displayCount(input.activeRecorders)} recorder(s) are still active without fetched or saved packets`
          }
        : {
            label: "Packet evidence",
            status: "unknown",
            detail: input.availableCaptures > 0
              ? `No current-run packet evidence is attached; ${displayCount(input.availableCaptures)} global capture file(s) are inventory context only`
              : "No monitor packets or saved PCAP files are attached"
          };
    const recorderClosureCheck: RunReportCheck = input.activeRecorders > 0
      ? {
          label: "Recorder closure",
          status: "warn",
          detail: `${displayCount(input.activeRecorders)} recorder(s) remain active`
        }
      : {
          label: "Recorder closure",
          status: "pass",
          detail: "No active capture recorders remain"
        };
    const decodeCheck: RunReportCheck = input.capturePackets.length > 0
      ? input.capturePackets.some((packet) => (packet.decoded_layers?.length ?? 0) > 0)
        ? {
            label: "Decode coverage",
            status: "pass",
            detail: "At least one monitor packet includes backend decoded layers"
          }
        : {
            label: "Decode coverage",
            status: "warn",
            detail: "Monitor packets are present but decoded layers are missing"
          }
      : input.savedCaptures > 0
        ? {
            label: "Decode coverage",
            status: "pass",
            detail: "Saved PCAP evidence is available for external decode"
          }
        : {
            label: "Decode coverage",
            status: "unknown",
            detail: "No packet bytes are attached for decode"
          };
    const matchCheck: RunReportCheck | null = input.captureLayerMatch.applicable
      ? {
          label: "Profile/capture match",
          status: input.captureLayerMatch.status,
          detail: input.captureLayerMatch.summary
        }
      : null;
    const fieldMatchCheck: RunReportCheck | null = input.captureFieldMatch.applicable
      ? {
          label: "Profile/capture fields",
          status: input.captureFieldMatch.status,
          detail: input.captureFieldMatch.summary
        }
      : null;
    criteria = [captureEvidenceCheck, recorderClosureCheck, decodeCheck, matchCheck, fieldMatchCheck, lossCheck].filter((criterion): criterion is RunReportCheck => Boolean(criterion));
  } else {
    const diagnosticVerdict = highestVerdict(input.diagnostics.map((diagnostic) =>
      diagnostic.status === "unknown" ? "pass" : diagnostic.status));
    criteria = [
      {
        label: "Operational evidence",
        status: diagnosticVerdict,
        detail: input.diagnostics.map((diagnostic) => `${diagnostic.label}: ${diagnostic.status}`).join("; ")
      }
    ];
  }

  const verdict = highestVerdict(criteria.map((criterion) => criterion.status));
  const reasons = criteria
    .filter((criterion) => criterion.status !== "pass")
    .map((criterion) => `${criterion.label}: ${criterion.detail}`);
  return {
    id: input.template.id,
    label: input.template.label,
    summary: verdict === "pass"
      ? `${input.template.label} criteria passed`
      : reasons[0] ?? input.template.summary,
    verdict,
    reasons,
    criteria
  };
}

function conclusionWithTemplate(
  conclusion: RunReportConclusion,
  template: RunReportTemplate,
  assessment: RunReportTemplateAssessment
): RunReportConclusion {
  const templateCheck: RunReportCheck = {
    label: "Report template",
    status: assessment.verdict,
    detail: `${assessment.label}: ${assessment.summary}`
  };
  const verdict = highestVerdict([conclusion.verdict, assessment.verdict]);
  const title = verdictWeight(assessment.verdict) > verdictWeight(conclusion.verdict)
    ? templateVerdictTitle(template, assessment.verdict)
    : conclusion.title;
  const summary = verdictWeight(assessment.verdict) > verdictWeight(conclusion.verdict)
    ? assessment.summary
    : conclusion.summary;
  const assessmentRaisesVerdict = verdictWeight(assessment.verdict) > verdictWeight(conclusion.verdict);
  const reasons = (template.id === "standard" && !assessmentRaisesVerdict
    ? [...conclusion.reasons, ...assessment.reasons]
    : [...assessment.reasons, ...conclusion.reasons])
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 10);
  return {
    ...conclusion,
    verdict,
    title,
    summary,
    reasons: reasons.length > 0 ? reasons : conclusion.reasons,
    checks: [...conclusion.checks, templateCheck]
  };
}

function buildConclusion(input: {
  activePorts: number;
  activeRecorders: number;
  availableCaptures: number;
  captureFieldMatch: CaptureFieldMatch;
  captureLayerMatch: CaptureLayerMatch;
  capturePackets: TrexCapturePacket[];
  dropBps: number;
  latencyErrors: number;
  portErrors: number;
  queueFull: number;
  savedCaptures: number;
  startResult: TrexResult<unknown> | null;
  stats: TrexStatsSnapshot | null;
  statsResult: TrexResult<TrexStatsSnapshot> | null;
  stopEvidence: RunReportStopEvidence;
  txBps: number | null;
  rxBps: number | null;
  txPps: number | null;
  rxPps: number | null;
}) {
  const txPackets = totalPacketCount(input.stats, "tx");
  const rxPackets = totalPacketCount(input.stats, "rx");
  const startDiagnostic = trexResultDiagnostic(input.startResult);
  const startFailure = input.startResult && !input.startResult.ok
    ? `Start blocked: ${startDiagnostic?.summary ?? input.startResult.error ?? input.startResult.blocker ?? "traffic start failed"}`
    : "";
  const stopFailure = input.stopEvidence.verdict === "fail"
    ? `Stop blocked: ${input.stopEvidence.detail}`
    : "";
  const trafficEvidence = [
    input.txBps,
    input.rxBps,
    input.txPps,
    input.rxPps,
    txPackets,
    rxPackets,
    input.capturePackets.length,
    input.activePorts
  ].some((value) => (value ?? 0) > 0);
  const failures = [
    startFailure,
    stopFailure,
    input.statsResult && !input.statsResult.ok
      ? `Stats blocked: ${input.statsResult.error ?? input.statsResult.blocker ?? "stats unavailable"}`
      : "",
    input.captureLayerMatch.applicable && input.captureLayerMatch.status === "fail"
      ? `Profile/capture mismatch: ${input.captureLayerMatch.summary}`
      : "",
    input.captureFieldMatch.applicable && input.captureFieldMatch.status === "fail"
      ? `Profile/capture field mismatch: ${input.captureFieldMatch.summary}`
      : "",
    input.dropBps > 0 ? `Drop rate ${displayBitRate(input.dropBps)}` : "",
    input.queueFull > 0 ? `Queue full ${displayCount(input.queueFull)}` : "",
    input.portErrors > 0 ? `Port errors ${displayCount(input.portErrors)}` : "",
    input.latencyErrors > 0 ? `Latency errors ${displayCount(input.latencyErrors)}` : ""
  ].filter(Boolean);
  const packetMismatch = packetMismatchIssue(input.stats);
  const flowIssues = flowStatsIssues(input.stats);
  const warnings = [
    startDiagnostic?.action ?? "",
    input.stopEvidence.verdict === "warn"
      ? input.stopEvidence.detail
      : input.startResult?.ok && input.stopEvidence.verdict === "unknown"
        ? "Traffic start is persisted, but exact operator-stop evidence is missing"
      : "",
    input.captureLayerMatch.applicable && input.captureLayerMatch.status === "warn"
      ? input.captureLayerMatch.summary
      : "",
    input.captureFieldMatch.applicable && input.captureFieldMatch.status === "unknown"
      ? input.captureFieldMatch.summary
      : "",
    packetMismatch ?? "",
    ...flowIssues,
    !trafficEvidence && input.stats ? "No traffic counters or capture packets observed" : ""
  ].filter(Boolean);
  const healthIssues = [
    input.dropBps > 0 ? `drop ${displayBitRate(input.dropBps)}` : "",
    input.queueFull > 0 ? `queue full ${displayCount(input.queueFull)}` : "",
    input.portErrors > 0 ? `port errors ${displayCount(input.portErrors)}` : "",
    input.latencyErrors > 0 ? `latency errors ${displayCount(input.latencyErrors)}` : "",
    packetMismatch ?? "",
    ...flowIssues
  ].filter(Boolean);
  const evidence: RunReportMetric[] = [
    { label: "Tx PPS", value: displayPacketRate(input.txPps) },
    { label: "Rx PPS", value: displayPacketRate(input.rxPps) },
    { label: "Tx packets", value: displayCount(txPackets) },
    { label: "Rx packets", value: displayCount(rxPackets) },
    { label: "Drop rate", value: displayBitRate(input.dropBps) },
    { label: "Queue full", value: displayCount(input.queueFull) },
    { label: "Port errors", value: displayCount(input.portErrors) },
    { label: "Latency errors", value: displayCount(input.latencyErrors) },
    { label: "Layer matches", value: input.captureLayerMatch.applicable ? `${displayCount(input.captureLayerMatch.matched.length)}/${displayCount(input.captureLayerMatch.expected.length)}` : "-" },
    { label: "Field matches", value: input.captureFieldMatch.applicable ? `${displayCount(input.captureFieldMatch.matched.length)}/${displayCount(input.captureFieldMatch.expected.length)}` : "-" },
    { label: "Capture packets", value: displayCount(input.capturePackets.length) },
    { label: "Saved captures", value: displayCount(input.savedCaptures) }
  ];
  const checks: RunReportCheck[] = [
    input.startResult
      ? {
          label: "Traffic start",
          status: input.startResult.ok ? "pass" : "fail",
          detail: input.startResult.ok ? "Start command accepted" : startFailure || "Start command failed"
        }
      : {
          label: "Traffic start",
          status: "unknown",
          detail: "No start command result captured"
        },
    {
      label: "Traffic stop",
      status: input.stopEvidence.verdict,
      detail: input.stopEvidence.verdict === "pass"
        ? "Stop command accepted"
        : input.stopEvidence.detail
    },
    input.statsResult
      ? {
          label: "Stats snapshot",
          status: input.statsResult.ok && input.stats ? "pass" : "fail",
          detail: input.statsResult.ok && input.stats ? "TRex stats snapshot captured" : input.statsResult.error ?? input.statsResult.blocker ?? "Stats unavailable"
        }
      : {
          label: "Stats snapshot",
          status: "unknown",
          detail: "No stats request was captured"
        },
    {
      label: "Traffic evidence",
      status: trafficEvidence ? "pass" : "unknown",
      detail: trafficEvidence
        ? `tx ${displayPacketRate(input.txPps)}, rx ${displayPacketRate(input.rxPps)}, packets ${displayCount(txPackets)}/${displayCount(rxPackets)}`
        : "No non-zero traffic counters or monitor packets"
    },
    {
      label: "Loss and errors",
      status: healthIssues.length > 0 ? "fail" : input.stats ? "pass" : "unknown",
      detail: healthIssues.length > 0 ? healthIssues.slice(0, 4).join("; ") : input.stats ? "No drops, queue pressure, port errors, latency errors, or packet delta" : "No stats to evaluate loss and errors"
    },
    {
      label: "Capture evidence",
      status: input.capturePackets.length > 0 || input.savedCaptures > 0 ? "pass" : "unknown",
      detail: input.capturePackets.length > 0 || input.savedCaptures > 0
        ? `${displayCount(input.capturePackets.length)} monitor packets, ${displayCount(input.savedCaptures)} saved files`
        : input.activeRecorders > 0
          ? `${displayCount(input.activeRecorders)} active recorder(s), but no packets or saved files in this snapshot`
          : input.availableCaptures > 0
            ? `No current-run packet evidence; ${displayCount(input.availableCaptures)} global capture file(s) are inventory context only`
            : "No monitor packets or saved capture files included"
    }
  ];

  if (input.captureLayerMatch.applicable) {
    checks.push({
      label: "Profile/capture match",
      status: input.captureLayerMatch.status,
      detail: input.captureLayerMatch.summary
    });
  }
  if (input.captureFieldMatch.applicable) {
    checks.push({
      label: "Profile/capture fields",
      status: input.captureFieldMatch.status,
      detail: input.captureFieldMatch.summary
    });
  }

  if (failures.length > 0) {
    return {
      verdict: "fail",
      title: "Fail",
      summary: failures[0],
      reasons: [...failures, ...warnings].slice(0, 8),
      evidence,
      checks
    } satisfies RunReportConclusion;
  }
  if (!input.stats && !input.statsResult) {
    return {
      verdict: "unknown",
      title: "No Stats",
      summary: "No TRex stats snapshot was available for this report",
      reasons: ["Refresh Snapshot before saving a run report"],
      evidence,
      checks
    } satisfies RunReportConclusion;
  }
  if (!trafficEvidence) {
    return {
      verdict: "unknown",
      title: "No Traffic",
      summary: "No traffic counters or capture packets were observed",
      reasons: ["Start traffic or fetch capture packets before saving the report"],
      evidence,
      checks
    } satisfies RunReportConclusion;
  }
  if (warnings.length > 0) {
    return {
      verdict: "warn",
      title: "Warning",
      summary: warnings[0],
      reasons: warnings.slice(0, 8),
      evidence,
      checks
    } satisfies RunReportConclusion;
  }
  return {
    verdict: "pass",
    title: "Pass",
    summary: "Clean run window",
    reasons: ["Counters are clean for the sampled run window"],
    evidence,
    checks
  } satisfies RunReportConclusion;
}

export function buildRunReportSnapshot(input: BuildRunReportInput): RunReportSnapshot {
  const stats = input.statsResult?.ok ? input.statsResult.data : null;
  const latest = latestStatsFallback(input.statsHistory);
  const trafficSession = input.trafficSession ?? null;
  const txBps = readNumber(stats, ["global.tx_bps", "total.tx_bps"]) ?? latest?.txBps ?? null;
  const rxBps = readNumber(stats, ["global.rx_bps", "total.rx_bps"]) ?? latest?.rxBps ?? null;
  const txPps = readNumber(stats, ["global.tx_pps", "total.tx_pps"]) ?? latest?.txPps ?? null;
  const rxPps = readNumber(stats, ["global.rx_pps", "total.rx_pps"]) ?? latest?.rxPps ?? null;
  const dropBps = readNumber(stats, ["global.rx_drop_bps", "global.drop_bps", "total.rx_drop_bps", "total.drop_bps"]);
  const queueFull = readNumber(stats, ["global.queue_full", "global.queue_full_rate", "total.queue_full"]) ?? latest?.queueFull ?? null;
  const latencyAvg = readNumber(stats, [
    "latency.total.latency.average",
    "latency.total.average",
    "latency.global.latency.average",
    "latency.global.average"
  ]) ?? latest?.latencyAvg ?? null;
  const sessionProfiles = trafficSession
    ? trafficSessionProfiles(trafficSession.session)
    : [];
  const profileLabel = sessionProfiles.length > 0
    ? sessionProfiles.map(profilePathLabel).join(", ")
    : input.selectedProfile?.relative_path ?? input.profilePath;
  const activeRecorders = input.captureStatusResult?.ok ? input.captureStatusResult.data?.captures.length ?? 0 : 0;
  const availableCaptureFiles = input.captureFilesResult?.ok ? input.captureFilesResult.data?.files ?? [] : [];
  const captureFileEvidence = runCaptureFileEvidence(availableCaptureFiles, trafficSession, input.generatedAt);
  const savedCaptures = captureFileEvidence.files.length;
  const activePorts = trafficSession?.session.state === "stopped"
    ? 0
    : activePortCount(input.portRecords, stats);
  const trafficEvidence = persistedTrafficEvidence(
    trafficSession,
    input.startResult
  );
  const sessionStartResult = trafficEvidence.startResult;
  const sessionStopEvidence = trafficEvidence.stopEvidence;
  const portErrors = portErrorTotal(stats, input.portRecords);
  const latencyErrors = latencyErrorTotalAll(stats?.latency);
  const txPackets = totalPacketCount(stats, "tx");
  const rxPackets = totalPacketCount(stats, "rx");
  const selectedTemplate = runReportTemplateById(input.templateId);
  const profileStreams = workbenchStreamIntentRows(input.workbenchStreams);
  const captureLayerMatch = buildCaptureLayerMatch(profileStreams, input.capturePackets);
  const captureFields = captureFieldSummary(input.capturePackets);
  const captureFieldMatch = buildCaptureFieldMatch(profileStreams, captureFields);
  const packetSummaries = input.capturePackets.slice(-20).map((packet) => ({
    index: packet.index,
    port: packet.port,
    mode: packet.mode,
    source: packet.source,
    destination: packet.destination,
    type: packet.type,
    length: packet.length,
    layer_chain: capturePacketLayerChain(packet),
    info: packet.info
  }));
  const diagnostics = buildDiagnostics({
    activeRecorders,
    availableCaptures: captureFileEvidence.inventoryCount,
    captureFieldMatch,
    captureLayerMatch,
    capturePackets: input.capturePackets,
    dropBps: dropBps ?? 0,
    latencyAvg,
    latencyErrors,
    portErrors,
    queueFull: queueFull ?? 0,
    savedCaptures,
    startResult: sessionStartResult,
    stats,
    statsResult: input.statsResult,
    stopEvidence: sessionStopEvidence,
    txBps,
    rxBps,
    txPps,
    rxPps,
    txPackets,
    rxPackets
  });
  const baseConclusion = buildConclusion({
    activePorts,
    activeRecorders,
    availableCaptures: captureFileEvidence.inventoryCount,
    captureFieldMatch,
    captureLayerMatch,
    capturePackets: input.capturePackets,
    dropBps: dropBps ?? 0,
    latencyErrors,
    portErrors,
    queueFull: queueFull ?? 0,
    savedCaptures,
    startResult: sessionStartResult,
    stats,
    statsResult: input.statsResult,
    stopEvidence: sessionStopEvidence,
    txBps,
    rxBps,
    txPps,
    rxPps
  });
  const template = buildTemplateAssessment({
    activeRecorders,
    availableCaptures: captureFileEvidence.inventoryCount,
    captureFieldMatch,
    captureLayerMatch,
    capturePackets: input.capturePackets,
    diagnostics,
    dropBps: dropBps ?? 0,
    latencyAvg,
    latencyErrors,
    portErrors,
    queueFull: queueFull ?? 0,
    savedCaptures,
    startResult: sessionStartResult,
    stats,
    statsResult: input.statsResult,
    stopEvidence: sessionStopEvidence,
    template: selectedTemplate,
    txBps,
    rxBps,
    txPps,
    rxPps,
    txPackets,
    rxPackets
  });
  const conclusion = conclusionWithTemplate(baseConclusion, selectedTemplate, template);
  const ports = input.portRecords.map((port) => ({
    id: port.id,
    acquired: port.acquired,
    status: portStatus(port)
  }));
  const profileFieldEngineCount = profileStreams.reduce((total, stream) => total + stream.field_engine_count, 0);
  const generatedLabel = formatDateTime(input.generatedAt);
  const runStartedLabel = trafficSession ? formatDateTime(trafficSession.session.started_at) : "-";
  const runEndedLabel = trafficSession?.session.ended_at ? formatDateTime(trafficSession.session.ended_at) : "-";
  const runDurationLabel = runDurationText(
    trafficSession?.session.started_at,
    trafficSession?.session.ended_at
  );
  const title = `TRex Run Report ${generatedLabel}`;
  const fileName = `trex-run-report-${cleanFileTimestamp(input.generatedAt)}.json`;
  const metrics: RunReportMetric[] = [
    { label: "TRex host", value: input.overview ? `${input.overview.environment?.host ?? "unconfigured"}:${input.overview.environment?.sync_port ?? 4501}` : "-" },
    { label: "Profile", value: profileLabel },
    { label: "Run ports", value: runPortsText(trafficSession ? trafficSessionPorts(trafficSession.session) : null) },
    { label: "Run duration", value: runDurationLabel },
    { label: "Runtime rate", value: trafficSession ? trafficSessionRateLabel(trafficSession.session) : input.trafficMultiplier ?? "-" },
    { label: "Streams", value: profileStreams.length ? displayCount(profileStreams.length) : "-" },
    { label: "Field engines", value: profileStreams.length ? displayCount(profileFieldEngineCount) : "-" },
    { label: "Layer matches", value: captureLayerMatch.applicable ? `${displayCount(captureLayerMatch.matched.length)}/${displayCount(captureLayerMatch.expected.length)}` : "-" },
    { label: "Field matches", value: captureFieldMatch.applicable ? `${displayCount(captureFieldMatch.matched.length)}/${displayCount(captureFieldMatch.expected.length)}` : "-" },
    { label: "Ports", value: displayCount(input.portRecords.length) },
    { label: "Active ports", value: displayCount(activePorts) },
    { label: "Tx L2", value: displayBitRate(txBps) },
    { label: "Rx L2", value: displayBitRate(rxBps) },
    { label: "Tx PPS", value: displayPacketRate(txPps) },
    { label: "Rx PPS", value: displayPacketRate(rxPps) },
    { label: "Drop rate", value: displayBitRate(dropBps) },
    { label: "Queue full", value: displayCount(queueFull) },
    { label: "Latency avg", value: displayLatencyUs(latencyAvg) },
    { label: "Capture recorders", value: displayCount(activeRecorders) },
    { label: "Monitor packets", value: displayCount(input.capturePackets.length) },
    { label: "Saved captures", value: displayCount(savedCaptures) },
    { label: "Capture inventory", value: displayCount(captureFileEvidence.inventoryCount) }
  ];
  const captureFiles = captureFileEvidence.files.map((file) => ({
    name: file.name,
    size: displayBytes(file.size_bytes),
    generated_at: file.generated_at ?? null,
    modified_time: file.modified_time ?? null,
    download_available: Boolean(file.download_available)
  }));
  const recentLogs = input.logRows.slice(-12);
  const portRows = ports.length
    ? ports.map((port) => `| ${port.id} | ${port.acquired ? "yes" : "no"} | ${port.status.replace(/\|/g, "\\|")} |`).join("\n")
    : "| - | - | - |";
  const logRows = recentLogs.length
    ? recentLogs.map((row) => `- ${row.level}: ${row.message}`).join("\n")
    : "- -";
  const packetRows = packetSummaries.length
    ? packetSummaries.slice(-8).map((packet) => (
      `| ${displayValue(packet.index)} | ${displayValue(packet.port)} | ${markdownCell(packet.type)} | ${markdownCell(packet.layer_chain)} | ${markdownCell(packet.info)} |`
    )).join("\n")
    : "| - | - | - | - | - |";
  const profileStreamRows = profileStreams.length
    ? profileStreams.slice(0, 16).map((stream) => (
      `| ${stream.index} | ${markdownCell(stream.name)} | ${stream.enabled ? "yes" : "no"} | ${markdownCell(stream.packet_type)} | ${markdownCell(stream.rate)} | ${displayValue(stream.pg_id)} | ${stream.rx_stats ? "yes" : "no"} | ${stream.latency ? "yes" : "no"} | ${markdownCell(stream.field_engines.slice(0, 4).join("; ") || "-")} | ${displayCount(stream.field_expectation_count)} | ${markdownCell(stream.expected_layer_chain)} |`
    )).join("\n")
    : "| - | - | - | - | - | - | - | - | - | - | - |";
  const fieldMatchRows = captureFieldMatch.applicable
    ? [...captureFieldMatch.matched.slice(0, 8), ...captureFieldMatch.missing.slice(0, 8)].slice(0, 12).map((row) => (
      `| ${markdownCell(row.stream)} | ${markdownCell(row.field)} | ${row.missing_values.length ? "fail" : "pass"} | ${markdownCell(row.expected_values.join(", "))} | ${markdownCell(row.observed_values.join(", ") || "-")} | ${markdownCell(row.missing_values.join(", ") || "-")} |`
    )).join("\n") || "| - | - | - | - | - |"
    : "| - | - | - | - | - |";
  const checkRows = conclusion.checks.length
    ? conclusion.checks.map((check) => `| ${check.label.replace(/\|/g, "\\|")} | ${check.status} | ${check.detail.replace(/\|/g, "\\|")} |`).join("\n")
    : "| - | - | - |";
  const diagnosticRows = diagnostics.length
    ? diagnostics.map((diagnostic) => (
      `| ${markdownCell(diagnostic.label)} | ${diagnostic.status} | ${markdownCell(diagnostic.summary)} | ${markdownCell(diagnostic.action)} | ${markdownCell(diagnostic.evidence.map((metric) => `${metric.label}: ${metric.value}`).join("; "))} |`
    )).join("\n")
    : "| - | - | - | - | - |";
  const markdown = [
    `# ${title}`,
    "",
    markdownTable([
      ["Generated", generatedLabel],
      ["TRex host", input.overview ? `${input.overview.environment?.host ?? "unconfigured"}:${input.overview.environment?.sync_port ?? 4501}` : "-"],
      ["Profile", profileLabel],
      ["Runtime rate", input.trafficMultiplier ?? "-"],
      ["Last start", input.startResult ? (input.startResult.ok ? "accepted" : input.startResult.error ?? input.startResult.blocker ?? "blocked") : "-"]
    ]),
    "",
    "## Run Window",
    markdownTable([
      ["Started", runStartedLabel],
      ["Ended", runEndedLabel],
      ["Duration", runDurationLabel],
      ["Ports", runPortsText(trafficSession ? trafficSessionPorts(trafficSession.session) : null)],
      ["Requested rate", trafficSession ? trafficSessionRateLabel(trafficSession.session) : input.trafficMultiplier ?? "-"],
      ["Requested duration", trafficSession ? trafficSessionDurationLabel(trafficSession.session) : "-"],
      ["Start result", sessionStartResult
        ? sessionStartResult.ok
          ? trafficSession ? "persisted" : "accepted (non-canonical)"
          : sessionStartResult.error ?? sessionStartResult.blocker ?? "blocked"
        : "-"],
      ["Stop result", sessionStopEvidence.verdict === "pass"
        ? "persisted"
        : sessionStopEvidence.detail]
    ]),
    "",
    "## Profile Streams",
    "| # | Name | Enabled | Packet type | Rate | PG | RX Stats | Latency | Field Engines | Field Expectations | Expected Capture |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    profileStreamRows,
    "",
    "## Test Conclusion",
    markdownTable([
      ["Template", template.label],
      ["Template summary", template.summary],
      ["Verdict", conclusion.title],
      ["Summary", conclusion.summary],
      ["Evidence", conclusion.evidence.map((metric) => `${metric.label}: ${metric.value}`).join("; ")]
    ]),
    "",
    conclusion.reasons.map((reason) => `- ${reason.replace(/\n/g, " ")}`).join("\n") || "- -",
    "",
    "### Evidence Checklist",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    checkRows,
    "",
    "### Template Criteria",
    "| Criterion | Status | Detail |",
    "| --- | --- | --- |",
    template.criteria.map((criterion) => `| ${markdownCell(criterion.label)} | ${criterion.status} | ${markdownCell(criterion.detail)} |`).join("\n") || "| - | - | - |",
    "",
    "## Diagnostics",
    "| Area | Status | Finding | Operator action | Evidence |",
    "| --- | --- | --- | --- | --- |",
    diagnosticRows,
    "",
    "## Summary",
    markdownTable(metrics.map((metric) => [metric.label, metric.value])),
    "",
    "## Ports",
    "| Port | Acquired | Status / Link |",
    "| --- | --- | --- |",
    portRows,
    "",
    "## Captures",
    markdownTable([
      ["Active recorders", displayCount(activeRecorders)],
      ["Monitor packets", displayCount(input.capturePackets.length)],
      ["Saved capture files", displayCount(savedCaptures)],
      ["Global capture inventory", displayCount(captureFileEvidence.inventoryCount)],
      ["Profile/capture match", captureLayerMatch.applicable ? `${captureLayerMatch.status}: ${captureLayerMatch.summary}` : "-"],
      ["Profile/capture fields", captureFieldMatch.applicable ? `${captureFieldMatch.status}: ${captureFieldMatch.summary}` : "-"]
    ]),
    "",
    "### Profile/Capture Field Match",
    "| Stream | Field | Status | Expected | Observed | Missing |",
    "| --- | --- | --- | --- | --- | --- |",
    fieldMatchRows,
    "",
    "### Capture Packet Samples",
    "| Index | Port | Type | Layer chain | Info |",
    "| --- | --- | --- | --- | --- |",
    packetRows,
    "",
    "## Recent Logs",
    logRows
  ].join("\n");

  return {
    title,
    fileName,
    generatedAt: input.generatedAt,
    template,
    conclusion,
    diagnostics,
    markdown,
    metrics,
    recentLogs,
    payload: {
      generated_at: input.generatedAt,
      host: input.overview?.environment?.host ?? null,
      sync_port: input.overview?.environment?.sync_port ?? null,
      profile: profileLabel,
      traffic_multiplier: input.trafficMultiplier,
      report_template: template,
      conclusion,
      diagnostics,
      metrics,
      profile_streams: profileStreams,
      capture_layer_match: captureLayerMatch,
      capture_field_summary: captureFields,
      capture_field_match: captureFieldMatch,
      ports,
      capture_recorders: input.captureStatusResult?.data?.captures ?? [],
      capture_files: captureFiles,
      capture_file_inventory: {
        total: captureFileEvidence.inventoryCount,
        linked: savedCaptures,
        unlinked: captureFileEvidence.inventoryCount - savedCaptures,
        scope: captureFileEvidence.scope,
        window_start: captureFileEvidence.windowStart,
        window_end: captureFileEvidence.windowEnd
      },
      capture_packets: packetSummaries,
      ...(trafficSession
        ? {
            traffic_session: trafficSession.session,
            traffic_run_summary: {
              ...(trafficSession.captureCompletedAt
                ? { capture_completed_at: trafficSession.captureCompletedAt }
                : {}),
              duration: runDurationLabel,
              profile: profileLabel,
              profiles: sessionProfiles,
              ports: trafficSessionPorts(trafficSession.session),
              multiplier: trafficSessionRateLabel(trafficSession.session),
              requested_duration: trafficSessionDurationLabel(trafficSession.session)
            }
          }
        : {}),
      stats_ok: input.statsResult?.ok ?? false,
      stats_blocker: input.statsResult?.blocker ?? null,
      stats_error: input.statsResult?.error ?? null,
      recent_logs: recentLogs
    }
  };
}

export function runReportCsvFileName(fileName: string) {
  return csvFileName(fileName);
}

export function runReportPdfFileName(fileName: string) {
  return pdfFileName(fileName);
}

export function buildRunReportCsv(snapshot: RunReportSnapshot) {
  return buildRunReportCsvFromArchive({
    title: snapshot.title,
    generated_at: snapshot.generatedAt,
    markdown: snapshot.markdown,
    payload: snapshot.payload
  });
}

export function buildRunReportCsvFromArchiveContent(content: string) {
  const archive = JSON.parse(content) as RunReportArchive;
  return buildRunReportCsvFromArchive(archive);
}

export function buildRunReportPdf(snapshot: RunReportSnapshot) {
  return buildRunReportPdfFromArchive({
    title: snapshot.title,
    generated_at: snapshot.generatedAt,
    markdown: snapshot.markdown,
    payload: snapshot.payload
  });
}

export function buildRunReportPdfFromArchiveContent(content: string) {
  const archive = JSON.parse(content) as RunReportArchive;
  return buildRunReportPdfFromArchive(archive);
}

function buildRunReportCsvFromArchive(archive: RunReportArchive) {
  const payload = archive.payload && typeof archive.payload === "object" && !Array.isArray(archive.payload)
    ? archive.payload as Record<string, unknown>
    : {};
  const metrics = objectList(payload.metrics);
  const profileStreams = objectList(payload.profile_streams);
  const ports = objectList(payload.ports);
  const captureFiles = objectList(payload.capture_files);
  const capturePackets = objectList(payload.capture_packets);
  const captureLayerMatch = payload.capture_layer_match && typeof payload.capture_layer_match === "object" && !Array.isArray(payload.capture_layer_match)
    ? payload.capture_layer_match as Record<string, unknown>
    : {};
  const captureFieldMatch = payload.capture_field_match && typeof payload.capture_field_match === "object" && !Array.isArray(payload.capture_field_match)
    ? payload.capture_field_match as Record<string, unknown>
    : {};
  const logs = objectList(payload.recent_logs);
  const trafficSession = payload.traffic_session && typeof payload.traffic_session === "object" && !Array.isArray(payload.traffic_session)
    ? payload.traffic_session as Record<string, unknown>
    : {};
  const trafficRunSummary = payload.traffic_run_summary && typeof payload.traffic_run_summary === "object" && !Array.isArray(payload.traffic_run_summary)
    ? payload.traffic_run_summary as Record<string, unknown>
    : {};
  const conclusion = payload.conclusion && typeof payload.conclusion === "object" && !Array.isArray(payload.conclusion)
    ? payload.conclusion as Record<string, unknown>
    : {};
  const reportTemplate = payload.report_template && typeof payload.report_template === "object" && !Array.isArray(payload.report_template)
    ? payload.report_template as Record<string, unknown>
    : {};
  const templateCriteria = objectList(reportTemplate.criteria);
  const diagnostics = objectList(payload.diagnostics);
  const conclusionReasons = Array.isArray(conclusion.reasons) ? conclusion.reasons : [];
  const conclusionEvidence = objectList(conclusion.evidence);
  const conclusionChecks = objectList(conclusion.checks);
  const rows: unknown[][] = [
    ["section", "item", "field", "value", "extra_1", "extra_2", "extra_3", "extra_4", "extra_5"],
    ["metadata", "report", "title", textValue(archive.title)],
    ["metadata", "report", "generated_at", textValue(archive.generated_at)],
    ["metadata", "report", "template", textValue(reportTemplate.label)],
    ["metadata", "report", "template_verdict", textValue(reportTemplate.verdict)],
    ["metadata", "traffic", "host", textValue(payload.host)],
    ["metadata", "traffic", "sync_port", textValue(payload.sync_port)],
    ["metadata", "traffic", "profile", textValue(payload.profile)],
    ["metadata", "traffic", "multiplier", textValue(payload.traffic_multiplier)],
    ["metadata", "run", "started_at", textValue(trafficSession.started_at)],
    ["metadata", "run", "ended_at", textValue(trafficSession.ended_at)],
    ["metadata", "run", "duration", textValue(trafficRunSummary.duration)],
    ["metadata", "run", "ports", Array.isArray(trafficRunSummary.ports) ? trafficRunSummary.ports.join(" ") : textValue(trafficRunSummary.ports)],
    ["metadata", "run", "requested_duration", textValue(trafficRunSummary.requested_duration)]
  ];

  if (Object.keys(conclusion).length > 0) {
    rows.push(["conclusion", "verdict", "value", textValue(conclusion.verdict)]);
    rows.push(["conclusion", "title", "value", textValue(conclusion.title)]);
    rows.push(["conclusion", "summary", "value", textValue(conclusion.summary)]);
    for (const [index, reason] of conclusionReasons.entries()) {
      rows.push(["conclusion", "reason", index + 1, textValue(reason)]);
    }
    for (const evidence of conclusionEvidence) {
      rows.push(["conclusion", "evidence", textValue(evidence.label), textValue(evidence.value)]);
    }
    for (const check of conclusionChecks) {
      rows.push(["conclusion", "check", textValue(check.label), textValue(check.status), textValue(check.detail)]);
    }
  }
  if (Object.keys(reportTemplate).length > 0) {
    rows.push(["template", "label", "value", textValue(reportTemplate.label)]);
    rows.push(["template", "verdict", "value", textValue(reportTemplate.verdict)]);
    rows.push(["template", "summary", "value", textValue(reportTemplate.summary)]);
    for (const [index, reason] of (Array.isArray(reportTemplate.reasons) ? reportTemplate.reasons : []).entries()) {
      rows.push(["template", "reason", index + 1, textValue(reason)]);
    }
    for (const criterion of templateCriteria) {
      rows.push(["template", "criterion", textValue(criterion.label), textValue(criterion.status), textValue(criterion.detail)]);
    }
  }
  for (const diagnostic of diagnostics) {
    const evidence = objectList(diagnostic.evidence)
      .map((metric) => `${textValue(metric.label)}: ${textValue(metric.value)}`)
      .filter(Boolean)
      .join("; ");
    rows.push([
      "diagnostics",
      textValue(diagnostic.label),
      "status",
      textValue(diagnostic.status),
      "finding",
      textValue(diagnostic.summary),
      "action",
      textValue(diagnostic.action),
      evidence
    ]);
  }
  if (Object.keys(captureLayerMatch).length > 0) {
    rows.push(["capture_layer_match", "summary", "status", textValue(captureLayerMatch.status), textValue(captureLayerMatch.summary)]);
    rows.push(["capture_layer_match", "action", "value", textValue(captureLayerMatch.action)]);
    for (const field of ["expected", "observed", "matched", "missing", "unexpected"]) {
      const values = Array.isArray(captureLayerMatch[field])
        ? captureLayerMatch[field].map(textValue).filter(Boolean).join(" | ")
        : textValue(captureLayerMatch[field]);
      rows.push(["capture_layer_match", field, "value", values]);
    }
  }
  if (Object.keys(captureFieldMatch).length > 0) {
    rows.push(["capture_field_match", "summary", "status", textValue(captureFieldMatch.status), textValue(captureFieldMatch.summary)]);
    rows.push(["capture_field_match", "action", "value", textValue(captureFieldMatch.action)]);
    for (const row of objectList(captureFieldMatch.matched)) {
      rows.push([
        "capture_field_match",
        "matched",
        textValue(row.stream),
        textValue(row.field),
        Array.isArray(row.expected_values) ? row.expected_values.map(textValue).filter(Boolean).join(" | ") : "",
        Array.isArray(row.observed_values) ? row.observed_values.map(textValue).filter(Boolean).join(" | ") : "",
        ""
      ]);
    }
    for (const row of objectList(captureFieldMatch.missing)) {
      rows.push([
        "capture_field_match",
        "missing",
        textValue(row.stream),
        textValue(row.field),
        Array.isArray(row.expected_values) ? row.expected_values.map(textValue).filter(Boolean).join(" | ") : "",
        Array.isArray(row.observed_values) ? row.observed_values.map(textValue).filter(Boolean).join(" | ") : "",
        Array.isArray(row.missing_values) ? row.missing_values.map(textValue).filter(Boolean).join(" | ") : ""
      ]);
    }
  }
  for (const metric of metrics) {
    rows.push(["summary", "metric", textValue(metric.label), textValue(metric.value)]);
  }
  for (const stream of profileStreams) {
    const fieldEngines = Array.isArray(stream.field_engines)
      ? stream.field_engines.map(textValue).filter(Boolean).join("; ")
      : "";
    rows.push([
      "profile_streams",
      textValue(stream.index),
      "name",
      textValue(stream.name),
      "packet_type",
      textValue(stream.packet_type),
      "rate",
      textValue(stream.rate),
      textValue(stream.expected_layer_chain)
    ]);
    rows.push([
      "profile_streams",
      textValue(stream.index),
      "pg_id",
      textValue(stream.pg_id),
      "rx_stats",
      textValue(stream.rx_stats),
      "latency",
      textValue(stream.latency),
      fieldEngines
    ]);
  }
  for (const port of ports) {
    rows.push([
      "ports",
      textValue(port.id),
      "acquired",
      textValue(port.acquired),
      "status",
      textValue(port.status)
    ]);
  }
  for (const file of captureFiles) {
    rows.push([
      "capture_files",
      textValue(file.name),
      "size",
      textValue(file.size),
      "modified_time",
      textValue(file.modified_time),
      "download_available",
      textValue(file.download_available)
    ]);
  }
  for (const packet of capturePackets) {
    rows.push([
      "capture_packets",
      textValue(packet.index),
      "port",
      textValue(packet.port),
      textValue(packet.mode),
      `${textValue(packet.source)} -> ${textValue(packet.destination)}`,
      textValue(packet.type),
      textValue(packet.length),
      "layer_chain",
      textValue(packet.layer_chain),
      textValue(packet.info)
    ]);
  }
  for (const row of logs) {
    rows.push(["logs", textValue(row.level), "message", textValue(row.message)]);
  }
  return csvRows(rows);
}

function buildRunReportPdfFromArchive(archive: RunReportArchive) {
  const payload = archive.payload && typeof archive.payload === "object" && !Array.isArray(archive.payload)
    ? archive.payload as Record<string, unknown>
    : {};
  const metrics = objectList(payload.metrics);
  const profileStreams = objectList(payload.profile_streams);
  const captureLayerMatch = payload.capture_layer_match && typeof payload.capture_layer_match === "object" && !Array.isArray(payload.capture_layer_match)
    ? payload.capture_layer_match as Record<string, unknown>
    : {};
  const captureFieldMatch = payload.capture_field_match && typeof payload.capture_field_match === "object" && !Array.isArray(payload.capture_field_match)
    ? payload.capture_field_match as Record<string, unknown>
    : {};
  const conclusion = payload.conclusion && typeof payload.conclusion === "object" && !Array.isArray(payload.conclusion)
    ? payload.conclusion as Record<string, unknown>
    : {};
  const reportTemplate = payload.report_template && typeof payload.report_template === "object" && !Array.isArray(payload.report_template)
    ? payload.report_template as Record<string, unknown>
    : {};
  const diagnostics = objectList(payload.diagnostics);
  const conclusionChecks = objectList(conclusion.checks);
  const templateCriteria = objectList(reportTemplate.criteria);
  const trafficSession = payload.traffic_session && typeof payload.traffic_session === "object" && !Array.isArray(payload.traffic_session)
    ? payload.traffic_session as Record<string, unknown>
    : {};
  const trafficRunSummary = payload.traffic_run_summary && typeof payload.traffic_run_summary === "object" && !Array.isArray(payload.traffic_run_summary)
    ? payload.traffic_run_summary as Record<string, unknown>
    : {};
  const markdown = typeof archive.markdown === "string" ? archive.markdown : "";
  const title = textValue(archive.title) || "TRex Run Report";
  const lines = [
    title,
    `Generated: ${textValue(archive.generated_at) || "-"}`,
    "",
    "Test Conclusion",
    `Template: ${textValue(reportTemplate.label) || "-"}`,
    `Template verdict: ${textValue(reportTemplate.verdict) || "-"}`,
    `Verdict: ${textValue(conclusion.title) || textValue(conclusion.verdict) || "-"}`,
    `Summary: ${textValue(conclusion.summary) || "-"}`,
    "",
    "Template Criteria",
    ...(
      templateCriteria.length > 0
        ? templateCriteria.map((criterion) => `${textValue(criterion.label)}: ${textValue(criterion.status)} - ${textValue(criterion.detail)}`)
        : ["-"]
    ),
    "",
    "Evidence Checklist",
    ...(
      conclusionChecks.length > 0
        ? conclusionChecks.map((check) => `${textValue(check.label)}: ${textValue(check.status)} - ${textValue(check.detail)}`)
        : ["-"]
    ),
    "",
    "Diagnostics",
    ...(
      diagnostics.length > 0
        ? diagnostics.map((diagnostic) => `${textValue(diagnostic.label)}: ${textValue(diagnostic.status)} - ${textValue(diagnostic.summary)} | Action: ${textValue(diagnostic.action)}`)
        : ["-"]
    ),
    "",
    "Capture Layer Match",
    `Status: ${textValue(captureLayerMatch.status) || "-"}`,
    `Summary: ${textValue(captureLayerMatch.summary) || "-"}`,
    `Expected: ${Array.isArray(captureLayerMatch.expected) ? captureLayerMatch.expected.map(textValue).filter(Boolean).join(" | ") || "-" : "-"}`,
    `Observed: ${Array.isArray(captureLayerMatch.observed) ? captureLayerMatch.observed.map(textValue).filter(Boolean).join(" | ") || "-" : "-"}`,
    "",
    "Capture Field Match",
    `Status: ${textValue(captureFieldMatch.status) || "-"}`,
    `Summary: ${textValue(captureFieldMatch.summary) || "-"}`,
    ...(
      objectList(captureFieldMatch.matched).length > 0 || objectList(captureFieldMatch.missing).length > 0
        ? [...objectList(captureFieldMatch.matched).slice(0, 8), ...objectList(captureFieldMatch.missing).slice(0, 8)].slice(0, 12).map((row) => {
            const expected = Array.isArray(row.expected_values) ? row.expected_values.map(textValue).filter(Boolean).join(" ") : "-";
            const observed = Array.isArray(row.observed_values) ? row.observed_values.map(textValue).filter(Boolean).join(" ") : "-";
            const missing = Array.isArray(row.missing_values) ? row.missing_values.map(textValue).filter(Boolean).join(" ") : "";
            return `${textValue(row.stream)} ${textValue(row.field)} expected ${expected || "-"} observed ${observed || "-"}${missing ? ` missing ${missing}` : ""}`;
          })
        : ["-"]
    ),
    "",
    "Run Window",
    `Started: ${textValue(trafficSession.started_at) || "-"}`,
    `Ended: ${textValue(trafficSession.ended_at) || "-"}`,
    `Duration: ${textValue(trafficRunSummary.duration) || "-"}`,
    `Ports: ${Array.isArray(trafficRunSummary.ports) ? trafficRunSummary.ports.join(", ") : textValue(trafficRunSummary.ports) || "-"}`,
    "",
    "Profile Streams",
    ...(
      profileStreams.length > 0
        ? profileStreams.slice(0, 16).map((stream) => {
            const fieldEngines = Array.isArray(stream.field_engines)
              ? stream.field_engines.map(textValue).filter(Boolean).slice(0, 4).join("; ")
              : "";
            return `${textValue(stream.index)} ${textValue(stream.name)} ${textValue(stream.packet_type)} ${textValue(stream.rate)} PG ${textValue(stream.pg_id) || "-"} FE ${fieldEngines || "-"} Expected ${textValue(stream.expected_layer_chain) || "-"}`;
          })
        : ["-"]
    ),
    "",
    "Summary Metrics",
    ...metrics.map((metric) => `${textValue(metric.label)}: ${textValue(metric.value)}`),
    "",
    "Report Detail",
    ...markdown.split(/\r?\n/)
  ];
  return renderPdfLines(lines, {
    subject: `TRex run report ${textValue(archive.generated_at) || ""}`.trim(),
    title
  });
}

function renderPdfLines(lines: string[], metadata: { subject: string; title: string }) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const marginY = 46;
  const fontSize = 10;
  const leading = 13;
  const maxColumns = 96;
  const maxLinesPerPage = Math.floor((pageHeight - marginY * 2) / leading);
  const wrappedLines = lines.flatMap((line) => wrapPdfLine(line, maxColumns));
  const pages: string[][] = [];
  for (let index = 0; index < wrappedLines.length; index += maxLinesPerPage) {
    pages.push(wrappedLines.slice(index, index + maxLinesPerPage));
  }
  if (pages.length === 0) {
    pages.push(["TRex Run Report"]);
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const fontObjectNumber = 3;
  const firstPageObjectNumber = 4;
  const pageRefs = pages.map((_, index) => `${firstPageObjectNumber + index * 2} 0 R`);
  objects.push(`<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const [pageIndex, pageLines] of pages.entries()) {
    const pageObjectNumber = firstPageObjectNumber + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      "BT",
      `/F1 ${fontSize} Tf`,
      `${marginX} ${pageHeight - marginY} Td`,
      `${leading} TL`,
      ...pageLines.map((line, index) => `${index === 0 ? "" : "T* "}${pdfText(line)} Tj`),
      "ET"
    ].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${pdfByteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  const infoObjectNumber = firstPageObjectNumber + pages.length * 2;
  objects.push(`<< /Title ${pdfText(metadata.title)} /Subject ${pdfText(metadata.subject)} /Producer ${pdfText("TRex WebUI")} >>`);

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdfByteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdfByteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjectNumber} 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return asciiBytes(body);
}

function wrapPdfLine(line: string, maxColumns: number) {
  const normalized = normalizePdfText(line);
  if (normalized.length <= maxColumns) {
    return [normalized];
  }
  const words = normalized.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) {
      continue;
    }
    if (word.length > maxColumns) {
      if (current) {
        wrapped.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxColumns) {
        wrapped.push(word.slice(index, index + maxColumns));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxColumns) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current || wrapped.length === 0) {
    wrapped.push(current);
  }
  return wrapped;
}

function pdfText(value: string) {
  return `(${normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function normalizePdfText(value: string) {
  return value
    .replace(/\u00b5/g, "u")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function pdfByteLength(value: string) {
  return value.length;
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0x7F;
  }
  return bytes;
}
