import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApiLogEntry } from "../../api";
import { formatApiLogConsole, LogDock } from "./LogDock";

const apiLogEntry: ApiLogEntry = {
  id: 1,
  method: "POST",
  path: "/api/trex/ports/acquire",
  started_at: "2026-06-05T01:02:03.000Z",
  status: 200,
  ok: true,
  duration_ms: 12,
  request_body: { ports: [0], force: false },
  response_body: { ok: true, data: { ports: [0] } },
  request_truncated: false,
  response_truncated: false,
  error: null
};

describe("LogDock", () => {
  it("formats API request and response records for Console Log View", () => {
    expect(formatApiLogConsole([apiLogEntry])).toContain("POST /api/trex/ports/acquire 200 12ms OK");
    expect(formatApiLogConsole([apiLogEntry])).toContain("> request");
    expect(formatApiLogConsole([apiLogEntry])).toContain("< response");
    expect(formatApiLogConsole([apiLogEntry])).toContain('"ports"');
  });

  it("shows API console records separately from runtime log rows", () => {
    const onCopyLogs = vi.fn();
    render(
      <LogDock
        apiLogs={[apiLogEntry]}
        rows={[{ level: "Info", message: "Connected to TRex RPC" }]}
        onCopyLogs={onCopyLogs}
      />
    );

    expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Console Log View" }));

    expect(screen.getByText(/POST \/api\/trex\/ports\/acquire/)).toBeInTheDocument();
    expect(screen.queryByText("Connected to TRex RPC")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    expect(onCopyLogs).toHaveBeenCalledWith(expect.stringContaining("/api/trex/ports/acquire"));
  });

  it("renders a runtime time only when the row carries a real timestamp", () => {
    const timestamp = "2026-06-05T01:02:03.000Z";
    const { container } = render(
      <LogDock
        apiLogs={[]}
        rows={[
          { level: "Info", message: "Timestamped event", timestamp },
          { level: "Event", message: "Untimestamped event" }
        ]}
        onCopyLogs={vi.fn()}
      />
    );

    const times = container.querySelectorAll("time");
    expect(times).toHaveLength(1);
    expect(times[0]).toHaveAttribute("datetime", timestamp);
    expect(times[0]).toHaveTextContent(new Date(timestamp).toLocaleTimeString([], { hour12: false }));
    expect(screen.getByText("Untimestamped event").closest(".log-line")?.querySelector("time")).toBeNull();
  });

  it("keeps the copy action outside the tablist and preserves inactive panel targets", () => {
    const { container } = render(
      <LogDock
        apiLogs={[apiLogEntry]}
        rows={[{ level: "Info", message: "Connected to TRex RPC" }]}
        onCopyLogs={vi.fn()}
      />
    );

    const renderedDock = within(container);
    const tablist = renderedDock.getByRole("tablist", { name: "Runtime log views" });
    const logTab = within(tablist).getByRole("tab", { name: "Log View" });
    const consoleTab = within(tablist).getByRole("tab", { name: "Console Log View" });
    expect(within(tablist).queryByRole("button", { name: "Copy to clipboard" })).not.toBeInTheDocument();
    expect(renderedDock.getByRole("button", { name: "Copy to clipboard" })).toBeInTheDocument();
    expect(logTab).toHaveAttribute("aria-controls", "runtime-log-panel");
    expect(consoleTab).toHaveAttribute("aria-controls", "runtime-console-panel");
    expect(container.querySelector('[id="runtime-log-panel"]')).not.toHaveAttribute("hidden");
    expect(container.querySelector('[id="runtime-console-panel"]')).toHaveAttribute("hidden");

    logTab.focus();
    fireEvent.keyDown(logTab, { key: "ArrowRight" });

    expect(consoleTab).toHaveFocus();
    expect(consoleTab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector('[id="runtime-log-panel"]')).toHaveAttribute("hidden");
    expect(container.querySelector('[id="runtime-console-panel"]')).not.toHaveAttribute("hidden");

    fireEvent.keyDown(consoleTab, { key: "Home" });
    expect(logTab).toHaveFocus();
    expect(logTab).toHaveAttribute("aria-selected", "true");
  });
});
