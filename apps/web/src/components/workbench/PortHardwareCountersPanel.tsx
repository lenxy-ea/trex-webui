import { Pin, PinOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { TrexPortRecord, TrexPortXstatsSnapshot, TrexResult } from "../../api";
import { displayValue } from "./format";

type PortHardwareCountersPanelProps = {
  port: TrexPortRecord | null;
  countersResult: TrexResult<TrexPortXstatsSnapshot> | null;
  isLoading: boolean;
  onRefresh: () => Promise<TrexResult<TrexPortXstatsSnapshot>>;
  onResetCounters: () => Promise<TrexResult<Record<string, unknown>>>;
};

type CounterRow = {
  name: string;
  value: string;
  rawValue: unknown;
};

function counterRows(source: unknown): CounterRow[] {
  if (!source) {
    return [];
  }
  if (Array.isArray(source)) {
    return source
      .map((item, index) => {
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const value = record.value ?? record.val ?? "";
          return {
            name: displayValue(record.name ?? record.counter ?? index),
            value: displayValue(value),
            rawValue: value
          };
        }
        return { name: String(index), value: displayValue(item), rawValue: item };
      })
      .filter((row) => row.name !== "");
  }
  return Object.entries(source as Record<string, unknown>).map(([name, value]) => ({
    name,
    value: displayValue(value),
    rawValue: value
  }));
}

function isEmptyCounterValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  if (typeof value === "number") {
    return value === 0;
  }
  if (typeof value === "boolean") {
    return !value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "" || normalized === "-" || normalized === "0" || normalized === "0.0" || normalized === "false";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function xstatsSource(port: TrexPortRecord | null, result: TrexResult<TrexPortXstatsSnapshot> | null) {
  if (result?.ok && result.data && port && result.data.port === port.id) {
    return result.data.xstats;
  }
  return null;
}

export function PortHardwareCountersPanel({
  port,
  countersResult,
  isLoading,
  onRefresh,
  onResetCounters
}: PortHardwareCountersPanelProps) {
  const [notEmptyOnly, setNotEmptyOnly] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [pinnedCounters, setPinnedCounters] = useState<string[]>([]);

  useEffect(() => {
    if (port) {
      void onRefresh();
    }
  }, [onRefresh, port]);

  const rows = useMemo(() => {
    const source = xstatsSource(port, countersResult);
    const filter = filterText.trim().toLowerCase();
    const filtered = counterRows(source).filter((row) => {
      if (notEmptyOnly && isEmptyCounterValue(row.rawValue)) {
        return false;
      }
      return filter === "" || row.name.toLowerCase().includes(filter);
    });
    return [...filtered].sort((left, right) => {
      const leftPinned = pinnedCounters.includes(left.name);
      const rightPinned = pinnedCounters.includes(right.name);
      if (leftPinned === rightPinned) {
        return 0;
      }
      return leftPinned ? -1 : 1;
    });
  }, [countersResult, filterText, notEmptyOnly, pinnedCounters, port]);

  const togglePinnedCounter = (name: string) => {
    setPinnedCounters((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    );
  };

  const blockerText = countersResult && !countersResult.ok
    ? `${countersResult.blocker ?? "xstats_blocked"} ${countersResult.error ?? ""}`.trim()
    : null;

  return (
    <section className="port-tab-content port-hardware-panel" aria-label="Hardware counters">
      <div className="hardware-counter-toolbar">
        <label>
          <input checked={notEmptyOnly} onChange={(event) => setNotEmptyOnly(event.target.checked)} type="checkbox" />
          Not empty
        </label>
        <span>Filter:</span>
        <input
          aria-label="Filter hardware counters"
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Counter name"
          type="text"
          value={filterText}
        />
        <button className="normal-button" disabled={!port || isLoading} onClick={() => void onRefresh()} type="button">
          Refresh
        </button>
        <button className="normal-button" disabled={!port || isLoading} onClick={() => void onResetCounters()} type="button">
          Reset Counters
        </button>
      </div>
      <div className="inline-warning" aria-live="polite">{blockerText ?? ""}</div>
      <div className="hardware-counter-table">
        <table>
          <thead>
            <tr>
              <th aria-label="Pinned counter" />
              <th>Counter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => {
                const pinned = pinnedCounters.includes(row.name);
                const PinIcon = pinned ? PinOff : Pin;
                const label = pinned ? `Unpin ${row.name}` : `Pin ${row.name}`;
                return (
                  <tr key={row.name}>
                    <td>
                      <button
                        aria-label={label}
                        className={["counter-pin-button", pinned ? "counter-pin-button--pinned" : ""].filter(Boolean).join(" ")}
                        onClick={() => togglePinnedCounter(row.name)}
                        title={label}
                        type="button"
                      >
                        <PinIcon aria-hidden="true" size={14} strokeWidth={2.35} />
                      </button>
                    </td>
                    <td title={row.name}>{row.name}</td>
                    <td title={row.value}>{row.value}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3}>{isLoading ? "Loading hardware counters" : "No hardware counters loaded"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
