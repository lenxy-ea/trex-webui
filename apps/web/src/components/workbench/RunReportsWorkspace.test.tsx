import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrexResult, TrexRunReportTrends } from "../../api";
import { RunReportsWorkspace } from "./RunReportsWorkspace";

function ok<T>(data: T): TrexResult<T> {
  return { blocker: null, data, error: null, ok: true };
}

function buildProps(): ComponentProps<typeof RunReportsWorkspace> {
  const files = Array.from({ length: 120 }, (_, index) => ({
    content: null,
    download_available: true,
    download_error: null,
    generated_at: "2026-07-22T00:00:00+00:00",
    modified_time: "2026-07-22T00:00:00+00:00",
    name: `report-${String(index).padStart(3, "0")}.json`,
    path: `/var/log/trex/reports/report-${String(index).padStart(3, "0")}.json`,
    size_bytes: index + 1,
    title: `Report ${String(index).padStart(3, "0")}`
  }));
  return {
    isBusy: false,
    isReportsLoading: false,
    isSnapshotLoading: false,
    isTrendsLoading: false,
    onDownloadArchive: vi.fn(async () => ok({ accepted: true, file: files[0] })),
    onDownloadArchiveCsv: vi.fn(async () => ok({ accepted: true, file: files[0] })),
    onDownloadArchivePdf: vi.fn(async () => ok({ accepted: true, file: files[0] })),
    onDownloadCurrentCsv: vi.fn(),
    onDownloadCurrentJson: vi.fn(),
    onDownloadCurrentPdf: vi.fn(),
    onDownloadMarkdown: vi.fn(),
    onLoadArchive: vi.fn(async () => ok({ accepted: true, file: files[0] })),
    onRefreshReports: vi.fn(async () => ok({ files, root: "/var/log/trex/reports" })),
    onRefreshSnapshot: vi.fn(async () => undefined),
    onRefreshTrends: vi.fn(async () => ok<TrexRunReportTrends>({
      conclusion: { reasons: [], summary: "", title: "Passing", verdict: "pass" },
      metric_trends: [],
      records: [],
      root: "/var/log/trex/reports",
      skipped: 0,
      total: 0,
      verdict_counts: { fail: 0, pass: 0, unknown: 0, warn: 0 }
    })),
    onReportTemplateChange: vi.fn(),
    onSaveReport: vi.fn(async () => ok({ accepted: true, file: files[0] })),
    reportResult: null,
    reportTemplateId: "standard",
    reportsResult: ok({ files, root: "/var/log/trex/reports" }),
    snapshot: {
      conclusion: {
        checks: [],
        evidence: [],
        reasons: [],
        summary: "All checks passed",
        title: "Passing",
        verdict: "pass"
      },
      diagnostics: [],
      fileName: "current.json",
      generatedAt: "2026-07-22T00:00:00+00:00",
      markdown: "# Current",
      metrics: [
        { label: "TRex host", value: "127.0.0.1:4501" },
        { label: "Capture recorders", value: "120" }
      ],
      payload: {},
      recentLogs: [],
      template: {
        criteria: [],
        id: "standard",
        label: "Operational Snapshot",
        reasons: [],
        summary: "Current state",
        verdict: "pass"
      },
      title: "Current Report"
    },
    trendsResult: null
  };
}

describe("RunReportsWorkspace", () => {
  afterEach(cleanup);

  it("keeps key metric values discoverable and paginates the full archive", () => {
    render(<RunReportsWorkspace {...buildProps()} />);

    expect(screen.getByTitle("127.0.0.1:4501")).toHaveTextContent("127.0.0.1:4501");
    fireEvent.click(screen.getByRole("tab", { name: "Archives" }));

    const pagination = screen.getByLabelText("Report archive pages");
    expect(within(pagination).getByText("Showing 1–50 of 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON report-000.json" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download JSON report-050.json" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("#run-report-panel-archives tbody tr")).toHaveLength(50);

    fireEvent.click(within(pagination).getByRole("button", { name: "Next" }));

    expect(within(pagination).getByText("Showing 51–100 of 120")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download JSON report-000.json" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON report-050.json" })).toBeInTheDocument();
    expect(document.querySelectorAll("#run-report-panel-archives tbody tr")).toHaveLength(50);
  });

  it("searches the full report archive and resets archive pagination", () => {
    render(<RunReportsWorkspace {...buildProps()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Archives" }));

    const pagination = screen.getByLabelText("Report archive pages");
    fireEvent.click(within(pagination).getByRole("button", { name: "Next" }));
    expect(within(pagination).getByText("Showing 51–100 of 120")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search report archives" });
    fireEvent.change(search, { target: { value: "report-075" } });

    expect(screen.getByText("1 of 120 files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON report-075.json" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download JSON report-050.json" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Report archive pages")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "missing archive" } });
    expect(screen.getByText("No report archives match “missing archive”")).toBeInTheDocument();
    expect(screen.queryByText("No report archives")).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(screen.getByLabelText("Report archive pages")).toHaveTextContent("Showing 1–50 of 120");
  });

  it("separates archive verdicts from metric drift and normalizes trend values", () => {
    const props = buildProps();
    props.trendsResult = ok<TrexRunReportTrends>({
      conclusion: {
        reasons: ["Rx PPS decreased by 230.12 pps", "Rx PPS decreased by 230.12 pps"],
        summary: "Rx PPS decreased by 230.12 pps",
        title: "History Warning",
        verdict: "warn"
      },
      metric_trends: [
        {
          delta: -117_690,
          direction: "down",
          label: "Rx L2",
          latest: "1.16645e+06 b/s",
          previous: "1.28414e+06 b/s",
          samples: 30,
          unit: "b/s"
        }
      ],
      records: [],
      root: "/var/log/trex/reports",
      skipped: 0,
      total: 30,
      verdict_counts: { fail: 0, pass: 30, unknown: 0, warn: 0 }
    });

    render(<RunReportsWorkspace {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trends" }));

    expect(screen.getByText("History Clean")).toBeInTheDocument();
    expect(screen.getByText("30 reports passed in the selected window")).toBeInTheDocument();
    expect(screen.getByText("30 reports · 30 pass · 0 warn · 0 fail")).toBeInTheDocument();
    expect(screen.getAllByText("Rx PPS decreased by 230.12 pps")).toHaveLength(1);
    expect(screen.getByRole("cell", { name: "1.17 Mb/s" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1.28 Mb/s" })).toBeInTheDocument();
    expect(screen.getByText("-9.16%")).toBeInTheDocument();
  });

  it("shows truthful independent loading states without blocking loaded archives", () => {
    const loadedProps = buildProps();
    loadedProps.isSnapshotLoading = true;
    render(<RunReportsWorkspace {...loadedProps} />);

    expect(screen.getByText("Loading snapshot…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Report" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archives" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download JSON report-000.json" })).toBeEnabled();

    cleanup();
    const loadingProps = buildProps();
    loadingProps.isReportsLoading = true;
    loadingProps.isSnapshotLoading = true;
    loadingProps.isTrendsLoading = true;
    loadingProps.reportsResult = null;
    loadingProps.trendsResult = null;
    render(<RunReportsWorkspace {...loadingProps} />);

    expect(screen.getByText("Loading snapshot, archives, trends…")).toBeInTheDocument();
    expect(screen.getAllByText("Loading report archives…").length).toBeGreaterThan(0);
    expect(screen.queryByText("No report archives")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Trends" }));
    expect(screen.getAllByText("Loading report trends…").length).toBeGreaterThan(0);
    expect(screen.queryByText("No trend data")).not.toBeInTheDocument();
  });
});
