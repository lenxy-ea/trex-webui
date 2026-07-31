import type {
  TrafficPlanGroup,
  TrafficRunState,
  TrafficRuntimeSnapshot,
  TrexPortRecord
} from "../../../api";
import {
  buildTrafficMultiplier,
  type TrafficMultiplierUnit
} from "../trafficMultiplier";

export type PortLinkState = "up" | "down" | "unknown";

export type TrafficGroupRuntimeView = {
  ownership: "managed" | "external" | "none";
  sessionId: string | null;
  state: TrafficRunState;
};

export type TrafficPlanMultiplier = {
  error: string | null;
  value: string | null;
};

const LINK_UP_VALUES = new Set(["1", "ACTIVE", "ON", "TRUE", "UP", "YES"]);
const LINK_DOWN_VALUES = new Set(["0", "DOWN", "FALSE", "INACTIVE", "NO", "OFF"]);
const TRAFFIC_MULTIPLIER_SUFFIXES: Array<{
  suffix: string;
  unit: TrafficMultiplierUnit;
}> = [
  { suffix: "bpsl1", unit: "bps_L1" },
  { suffix: "bps", unit: "bps_L2" },
  { suffix: "pps", unit: "pps" },
  { suffix: "%", unit: "percentage" }
];

export function portLinkState(portRecords: TrexPortRecord[], portId: number): PortLinkState {
  const record = portRecords.find((candidate) => candidate.id === portId);
  if (!record) {
    return "unknown";
  }
  const value = record.info.link ?? record.info.link_status;
  if (typeof value === "boolean") {
    return value ? "up" : "down";
  }
  if (typeof value === "number") {
    return value === 1 ? "up" : value === 0 ? "down" : "unknown";
  }
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toUpperCase();
  if (LINK_UP_VALUES.has(normalized)) {
    return "up";
  }
  if (LINK_DOWN_VALUES.has(normalized)) {
    return "down";
  }
  return "unknown";
}

export function trafficGroupLinkBlocker(
  portRecords: TrexPortRecord[],
  ports: number[]
): string | null {
  const blocked = ports
    .map((port) => ({ port, state: portLinkState(portRecords, port) }))
    .filter(({ state }) => state !== "up");
  if (blocked.length === 0) {
    return null;
  }
  return `Traffic start requires every group link UP; ${blocked
    .map(({ port, state }) => `P${port} ${state.toUpperCase()}`)
    .join(", ")}.`;
}

function samePorts(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }
  const rightPorts = new Set(right);
  return left.every((port) => rightPorts.has(port));
}

function aggregatePortState(states: TrafficRunState[]): TrafficRunState {
  if (states.length === 0 || states.includes("unknown")) {
    return "unknown";
  }
  const uniqueStates = new Set(states);
  return uniqueStates.size === 1 ? states[0] : "mixed";
}

export function trafficGroupRuntimeView(
  runtime: TrafficRuntimeSnapshot,
  group: TrafficPlanGroup
): TrafficGroupRuntimeView {
  const portStateById = new Map(runtime.port_states.map((row) => [row.port, row]));
  const runtimePorts = group.ports
    .map((port) => portStateById.get(port))
    .filter((row) => row !== undefined);
  const ownership = runtimePorts.some((row) => row.ownership === "external")
    ? "external"
    : runtimePorts.some((row) => row.ownership === "managed")
      ? "managed"
      : "none";
  const sessionGroup = runtime.session?.groups.find(
    (candidate) =>
      candidate.group_id === group.id
      || (candidate.group_id === null && samePorts(candidate.ports, group.ports))
  );

  return {
    ownership,
    sessionId: sessionGroup ? runtime.session?.id ?? null : null,
    state: sessionGroup?.state
      ?? aggregatePortState(runtimePorts.map((row) => row.state))
  };
}

export function normalizeTrafficPlanMultiplier(value: string): TrafficPlanMultiplier {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { error: "multiplier / rate is required", value: null };
  }
  const normalized = trimmed.toLowerCase();
  const suffix = TRAFFIC_MULTIPLIER_SUFFIXES.find((candidate) =>
    normalized.endsWith(candidate.suffix)
  );
  const unit = suffix?.unit ?? "raw";
  const numberText = suffix ? trimmed.slice(0, -suffix.suffix.length) : trimmed;
  const parsed = buildTrafficMultiplier(unit, numberText);
  return parsed.ok
    ? { error: null, value: parsed.value }
    : { error: parsed.error, value: null };
}

export function trafficPlanGroupError(group: TrafficPlanGroup): string | null {
  if (group.profile_path.trim() === "") {
    return `${group.name}: select a traffic profile`;
  }
  const multiplier = normalizeTrafficPlanMultiplier(group.multiplier);
  if (multiplier.error) {
    return `${group.name}: ${multiplier.error}`;
  }
  if (
    !Number.isFinite(group.duration)
    || (group.duration !== -1 && group.duration <= 0)
    || group.duration > 1_000_000
  ) {
    return `${group.name}: duration must be -1 (continuous) or greater than 0 and at most 1000000 seconds`;
  }
  return null;
}
