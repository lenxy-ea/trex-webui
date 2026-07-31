import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { ApiLogEntry } from "../../api";
import type { LogRow } from "./types";

type LogDockProps = {
  apiLogs: ApiLogEntry[];
  rows: LogRow[];
  onCopyLogs: (content: string) => void;
};

function formatApiLogBody(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function indentConsoleBlock(value: string): string {
  return value.split("\n").map((line) => `  ${line}`).join("\n");
}

function runtimeTimestamp(value: string | undefined): { dateTime: string; label: string } | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    dateTime: value,
    label: date.toLocaleTimeString([], { hour12: false })
  };
}

export function formatApiLogConsole(entries: ApiLogEntry[]): string {
  return entries.map((entry, index) => {
    const status = entry.status === null ? "ERR" : String(entry.status);
    const result = entry.ok ? "OK" : "FAIL";
    const lines = [
      `${String(index + 1).padStart(4, "0")} ${entry.started_at} ${entry.method} ${entry.path} ${status} ${entry.duration_ms}ms ${result}`
    ];
    if (entry.request_body !== undefined) {
      lines.push(`> request${entry.request_truncated ? " [truncated]" : ""}`);
      lines.push(indentConsoleBlock(formatApiLogBody(entry.request_body)));
    }
    if (entry.response_body !== undefined) {
      lines.push(`< response${entry.response_truncated ? " [truncated]" : ""}`);
      lines.push(indentConsoleBlock(formatApiLogBody(entry.response_body)));
    }
    if (entry.error) {
      lines.push(`! ${entry.error}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}

export function LogDock({ apiLogs, rows, onCopyLogs }: LogDockProps) {
  const [activeTab, setActiveTab] = useState<"log" | "console">("log");
  const tabRefs = useRef<Partial<Record<"log" | "console", HTMLButtonElement | null>>>({});
  const logText = useMemo(
    () => rows.map((row) => `${row.level} ${row.message}`).join("\n"),
    [rows]
  );
  const consoleText = useMemo(
    () => formatApiLogConsole(apiLogs),
    [apiLogs]
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: "log" | "console") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const nextTab = event.key === "Home"
      ? "log"
      : event.key === "End"
        ? "console"
        : tab === "log" ? "console" : "log";
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <section className="log-dock" aria-label="Runtime logs">
      <div className="log-tabs">
        <div className="log-tab-list sub-tabs" role="tablist" aria-label="Runtime log views">
          <button
            aria-controls="runtime-log-panel"
            aria-selected={activeTab === "log"}
            className={`log-tab ${activeTab === "log" ? "log-tab--active" : ""}`}
            id="runtime-log-tab"
            onClick={() => setActiveTab("log")}
            onKeyDown={(event) => handleTabKeyDown(event, "log")}
            ref={(element) => {
              tabRefs.current.log = element;
            }}
            role="tab"
            tabIndex={activeTab === "log" ? 0 : -1}
            type="button"
          >
            Log View
          </button>
          <button
            aria-controls="runtime-console-panel"
            aria-selected={activeTab === "console"}
            className={`log-tab ${activeTab === "console" ? "log-tab--active" : ""}`}
            id="runtime-console-tab"
            onClick={() => setActiveTab("console")}
            onKeyDown={(event) => handleTabKeyDown(event, "console")}
            ref={(element) => {
              tabRefs.current.console = element;
            }}
            role="tab"
            tabIndex={activeTab === "console" ? 0 : -1}
            type="button"
          >
            Console Log View
          </button>
        </div>
        <button
          className="copy-log-button"
          onClick={() => onCopyLogs(activeTab === "log" ? logText : consoleText)}
          title="Copy logs"
          type="button"
        >
          Copy to clipboard
        </button>
      </div>
      {activeTab === "console" ? (
        <div aria-labelledby="runtime-log-tab" hidden id="runtime-log-panel" role="tabpanel" />
      ) : null}
      {activeTab === "log" ? (
        <div aria-labelledby="runtime-console-tab" hidden id="runtime-console-panel" role="tabpanel" />
      ) : null}
      {activeTab === "log" ? (
        <div
          aria-labelledby="runtime-log-tab"
          className="log-lines"
          id="runtime-log-panel"
          role="tabpanel"
          tabIndex={0}
        >
          {rows.map((row, index) => {
            const timestamp = runtimeTimestamp(row.timestamp);
            return (
              <div className={`log-line log-line--${row.level.toLowerCase()}`} key={`${row.level}:${row.message}:${index}`}>
                <span>{row.level}</span>
                {timestamp
                  ? <time dateTime={timestamp.dateTime}>{timestamp.label}</time>
                  : <span aria-hidden="true" />}
                <strong>{row.message}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <pre
          aria-labelledby="runtime-console-tab"
          className="console-log-lines"
          id="runtime-console-panel"
          role="tabpanel"
          tabIndex={0}
        >
          {consoleText || "No console log entries"}
        </pre>
      )}
    </section>
  );
}
