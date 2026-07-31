import {
  displayBitRate,
  displayBytes,
  displayCount,
  displayLatencyUs,
  displayNumber,
  displayPacketRate,
  displayPercent,
  displayValue
} from "./format";
import type { StatsRow } from "./types";

export function readPath(source: unknown, paths: string[]) {
  for (const path of paths) {
    let cursor = source;
    for (const key of path.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") {
      return cursor;
    }
  }
  return null;
}

export function readNumber(source: unknown, paths: string[]) {
  const value = readPath(source, paths);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function readOptionalNumber(source: unknown, paths: string[]) {
  const value = readPath(source, paths);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function metricNumber(source: unknown, paths: string[]) {
  return readOptionalNumber(source, paths);
}

export function metricText(
  source: unknown,
  paths: string[],
  formatter: (value: number | null | undefined) => string
) {
  return formatter(metricNumber(source, paths));
}

export function objectEntries(source: unknown) {
  return source && typeof source === "object" && !Array.isArray(source)
    ? Object.entries(source as Record<string, unknown>)
    : [];
}

export function displayMetricValue(metric: string, value: unknown) {
  const numericValue = readOptionalNumber({ value }, ["value"]);
  if (numericValue === null) {
    return displayValue(value);
  }

  const normalized = metric.toLowerCase();
  if (normalized.includes("pps")) {
    return displayPacketRate(numericValue);
  }
  if (normalized.includes("bps")) {
    return displayBitRate(numericValue);
  }
  if (normalized.includes("bytes")) {
    return displayBytes(numericValue);
  }
  if (normalized.includes("latency") || normalized.includes("jitter") || normalized.includes("lat.")) {
    return displayLatencyUs(numericValue);
  }
  if (normalized.includes("util") || normalized.includes("cpu") || normalized.includes("percent")) {
    return displayPercent(numericValue);
  }
  if (
    normalized.includes("pkt")
    || normalized.includes("packet")
    || normalized.includes("error")
    || normalized.includes("drop")
    || normalized.includes("queue")
    || normalized.includes("total")
    || normalized.includes("dup")
    || normalized.includes("seq")
  ) {
    return displayCount(numericValue);
  }
  return displayNumber(numericValue);
}

export function flattenStats(scope: string, source: unknown, limit = 128) {
  const rows: StatsRow[] = [];
  const visit = (prefix: string, value: unknown, depth: number) => {
    if (rows.length >= limit) {
      return;
    }
    if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value) || depth >= 3) {
      rows.push({ scope, metric: prefix || "-", value: displayMetricValue(prefix, value) });
      return;
    }
    for (const [key, child] of objectEntries(value)) {
      visit(prefix ? `${prefix}.${key}` : key, child, depth + 1);
    }
  };
  visit("", source, 0);
  return rows;
}

export function flattenScopedStats(source: unknown, fallbackScope: string, limit = 128) {
  const entries = objectEntries(source);
  if (entries.length === 0) {
    return flattenStats(fallbackScope, source, limit).filter((row) => row.value !== "-");
  }

  const rows: StatsRow[] = [];
  for (const [scope, value] of entries) {
    if (rows.length >= limit) {
      break;
    }
    rows.push(...flattenStats(scope || fallbackScope, value, limit - rows.length));
  }
  return rows;
}

export function statScopeIds(source: unknown) {
  return objectEntries(source)
    .map(([scope]) => scope)
    .filter((scope) => scope !== "global" && scope !== "total")
    .sort((left, right) => Number(left) - Number(right));
}

export function filterScopedStats(source: unknown, selectedScopes: string[], includeGlobal = false) {
  const entries = objectEntries(source);
  if (entries.length === 0) {
    return {};
  }
  const selected = new Set(selectedScopes);
  return Object.fromEntries(
    entries.filter(([scope]) => (includeGlobal && scope === "global") || selected.has(scope))
  );
}

export function selectedScopedEntries(source: unknown, selectedScopes: string[]) {
  const selected = new Set(selectedScopes);
  return objectEntries(source).filter(([scope]) => selected.has(scope));
}
