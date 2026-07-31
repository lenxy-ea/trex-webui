import { act } from "@testing-library/react";

import {
  activeTrafficRuntimeResult,
  App,
  captureFilesResponse,
  captureStatusResponse,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openCapture,
  openReports,
  overview,
  profileCatalog,
  render,
  runReportsResponse,
  runReportTrendsResponse,
  screen,
  statsResponse,
  stubFetch,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

function deferredJsonResponse<T>() {
  type MockResponse = { json: () => Promise<T>; ok: boolean };
  let resolveResponse!: (response: MockResponse) => void;
  const promise = new Promise<MockResponse>((resolve) => {
    resolveResponse = resolve;
  });
  return {
    promise,
    resolve(data: T) {
      resolveResponse({ ok: true, json: async () => data });
    }
  };
}

describe("App / Run Reports", () => {
  installAppTestHooks();

  it("opens an independent run reports workflow backed by current TRex state", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:run-report")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const archivedReportContent = JSON.stringify({
      version: 1,
      title: "TRex Run Report",
      generated_at: "2026-06-05T00:00:00+00:00",
      markdown: "# TRex Run Report",
      payload: {
        profile: "udp_1pkt_simple.py",
        metrics: [{ label: "Tx L2", value: "8 Mb/s" }],
        ports: [{ id: 0, acquired: false, status: "IDLE / UP" }],
        capture_files: [],
        capture_packets: [],
        recent_logs: [{ level: "Info", message: "Connected to TRex RPC" }]
      }
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => runReportsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => runReportTrendsResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file: {
              path: "/var/log/trex/reports/saved.json",
              name: "saved.json",
              size_bytes: 512,
              modified_time: "2026-06-05T00:00:00+00:00",
              title: "Saved Report",
              generated_at: "2026-06-05T00:00:00+00:00",
              download_available: true,
              content: "{\"title\":\"Saved Report\"}",
              download_error: null
            }
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => runReportsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => runReportTrendsResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file: {
              path: "/var/log/trex/reports/run.json",
              name: "run.json",
              size_bytes: archivedReportContent.length,
              modified_time: "2026-06-05T00:00:00+00:00",
              title: "TRex Run Report",
              generated_at: "2026-06-05T00:00:00+00:00",
              download_available: true,
              content: archivedReportContent,
              download_error: null
            }
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file: {
              path: "/var/log/trex/reports/run.json",
              name: "run.json",
              size_bytes: archivedReportContent.length,
              modified_time: "2026-06-05T00:00:00+00:00",
              title: "TRex Run Report",
              generated_at: "2026-06-05T00:00:00+00:00",
              download_available: true,
              content: archivedReportContent,
              download_error: null
            }
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());

    await openReports();

    const dialog = await screen.findByRole("dialog", { name: "Run Reports" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/reports"));
    const overviewTab = within(dialog).getByRole("tab", { name: "Overview" });
    const evidenceTab = within(dialog).getByRole("tab", { name: "Evidence" });
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    expect(evidenceTab).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Trends" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Archives" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Raw" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Run report status")).toBeInTheDocument();
    expect(within(dialog).getByText("Current Snapshot")).toBeInTheDocument();
    expect(within(dialog).queryByText("History Trends")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("udp_1pkt_simple.py").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/TRex Run Report/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Capture recorders")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Overview gates")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Overview key metrics")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Overview diagnostics")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Run report evidence checklist")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("Traffic start").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Stats snapshot").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "Download JSON run.json" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download CSV run.json" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Compare run.json" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Report" })).not.toBeInTheDocument();

    for (const tabId of ["overview", "evidence", "trends", "archives", "raw"]) {
      expect(dialog.querySelector(`#run-report-panel-${tabId}`)).not.toBeNull();
    }
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(evidenceTab).toHaveFocus();
    expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    expect(dialog.querySelector("#run-report-panel-overview")).toHaveAttribute("hidden");
    fireEvent.keyDown(evidenceTab, { key: "Home" });
    expect(overviewTab).toHaveFocus();
    expect(overviewTab).toHaveAttribute("aria-selected", "true");

    const templateSelect = within(dialog).getByLabelText("Run report template");
    expect(templateSelect).toHaveValue("standard");
    fireEvent.change(templateSelect, { target: { value: "capture" } });
    expect(within(dialog).getAllByText("Capture Troubleshooting").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("tab", { name: "Evidence" }));
    expect(within(dialog).getByLabelText("Run report evidence checklist")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Run report template criteria")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Trends" }));
    expect(within(dialog).getByText("History Trends")).toBeInTheDocument();
    expect(within(dialog).getByText("History Failing")).toBeInTheDocument();
    expect(within(dialog).getByRole("cell", { name: "12 Kpps" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Archives" }));
    expect(within(dialog).getByRole("button", { name: "Download JSON run.json" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download CSV run.json" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Compare run.json" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save Report" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/reports/save", expect.any(Object)));
    const saveCall = fetchMock.mock.calls.find(([path]) => path === "/api/trex/reports/save");
    const saveBody = JSON.parse(String(saveCall?.[1]?.body ?? "{}"));
    expect(saveCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"markdown\"")
      })
    );
    expect(saveCall?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining("\"profile\":\"udp_1pkt_simple.py\"")
      })
    );
    expect(saveCall?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining("\"checks\"")
      })
    );
    expect(saveBody.markdown).toContain("| Template | Capture Troubleshooting |");
    expect(saveBody.payload.report_template).toEqual(
      expect.objectContaining({
        id: "capture",
        label: "Capture Troubleshooting"
      })
    );
    await waitFor(() => expect(screen.getByText("Run report ready saved.json")).toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole("button", { name: "Compare run.json" }));
    await waitFor(() => expect(within(dialog).getByText("Comparison")).toBeInTheDocument());
    expect(within(dialog).getByRole("cell", { name: "8 Mb/s" })).toBeInTheDocument();
    expect(within(dialog).getByRole("cell", { name: "+1.99 Mb/s" })).toBeInTheDocument();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Archives" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Download CSV run.json" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([path]) => path === "/api/trex/reports/download")).toHaveLength(2)
    );
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it("saves run reports with the latest traffic and capture-finalization window", async () => {
    let savedCaptureTimestamp: string | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/system/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/traffic/start") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
            blocker: null,
            error: null
          })
        };
      }
      if (url === "/api/trex/traffic/stop") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: { accepted: true, ports: [0], stopped: true },
            blocker: null,
            error: null
          })
        };
      }
      if (url === "/api/trex/stats") {
        return { ok: true, json: async () => statsResponse };
      }
      if (url === "/api/trex/capture/status") {
        return { ok: true, json: async () => captureStatusResponse };
      }
      if (url === "/api/trex/capture/files") {
        return {
          ok: true,
          json: async () => savedCaptureTimestamp
            ? {
                ...captureFilesResponse,
                data: {
                  ...captureFilesResponse.data,
                  files: captureFilesResponse.data.files.map((file) => ({
                    ...file,
                    modified_time: savedCaptureTimestamp
                  }))
                }
              }
            : captureFilesResponse
        };
      }
      if (url === "/api/trex/capture/stop") {
        savedCaptureTimestamp = new Date().toISOString();
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              accepted: true,
              id: 3,
              packets: [],
              packet_count: 0,
              fetch_budget: {
                requested_packet_count: 1000,
                target_packet_count: 0,
                max_packet_count: 1000,
                max_bytes: 0,
                fetched_bytes: 0,
                effective_snaplen: 0,
                truncated_by_byte_budget: false
              },
              captures: [],
              port_usage: [],
              service_mode: captureStatusResponse.data.service_mode,
              saved_file: {
                ...captureFilesResponse.data.files[0],
                modified_time: savedCaptureTimestamp
              },
              capture_stopped: true
            },
            blocker: null,
            error: null
          })
        };
      }
      if (url === "/api/trex/reports") {
        return { ok: true, json: async () => runReportsResponse };
      }
      if (url === "/api/trex/reports/trends?limit=30") {
        return { ok: true, json: async () => runReportTrendsResponse };
      }
      if (url === "/api/trex/reports/save") {
        const request = JSON.parse(String(init?.body ?? "{}"));
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              accepted: true,
              file: {
                path: "/var/log/trex/reports/session.json",
                name: "session.json",
                size_bytes: JSON.stringify(request).length,
                modified_time: "2026-06-05T00:00:00+00:00",
                title: request.title,
                generated_at: request.payload.generated_at,
                download_available: true,
                content: JSON.stringify(request),
                download_error: null
              }
            },
            blocker: null,
            error: null
          })
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    stubFetch(fetchMock, activeTrafficRuntimeResult);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));
    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Stop selected port" }));
    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());

    await openCapture();
    fireEvent.click(screen.getByRole("tab", { name: "Recorders" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop capture 3" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/stop", expect.any(Object)));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([path]) => path === "/api/trex/capture/files").length)
        .toBeGreaterThanOrEqual(2)
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Packet Capture" }));

    await openReports();
    const dialog = await screen.findByRole("dialog", { name: "Run Reports" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Report" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/reports/save", expect.any(Object)));
    const saveCall = fetchMock.mock.calls.find(([path]) => path === "/api/trex/reports/save");
    const saveBody = JSON.parse(String(saveCall?.[1]?.body ?? "{}"));
    expect(saveBody.markdown).toContain("## Run Window");
    expect(saveBody.payload.traffic_session).toEqual(
      expect.objectContaining({
        profile: "udp_1pkt_simple.py",
        ports: [0],
        multiplier: "1",
        requested_duration: -1,
        capture_completed_at: savedCaptureTimestamp,
        start_result: expect.objectContaining({ ok: true }),
        stop_result: expect.objectContaining({ ok: true })
      })
    );
    expect(saveBody.payload.capture_file_inventory).toEqual(
      expect.objectContaining({
        linked: 1,
        window_end: savedCaptureTimestamp
      })
    );
  });

  it("renders report archives before slower snapshot and trend requests settle", async () => {
    const pendingOverview = deferredJsonResponse<typeof overview>();
    const pendingStats = deferredJsonResponse<typeof statsResponse>();
    const pendingCaptureStatus = deferredJsonResponse<typeof captureStatusResponse>();
    const pendingCaptureFiles = deferredJsonResponse<typeof captureFilesResponse>();
    const pendingTrends = deferredJsonResponse<typeof runReportTrendsResponse>();
    let overviewRequestCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/system/overview") {
        overviewRequestCount += 1;
        return overviewRequestCount === 1
          ? Promise.resolve({ ok: true, json: async () => overview })
          : pendingOverview.promise;
      }
      if (url === "/api/trex/profiles") {
        return Promise.resolve({ ok: true, json: async () => profileCatalog });
      }
      if (url === "/api/trex/stats") {
        return pendingStats.promise;
      }
      if (url === "/api/trex/capture/status") {
        return pendingCaptureStatus.promise;
      }
      if (url === "/api/trex/capture/files") {
        return pendingCaptureFiles.promise;
      }
      if (url === "/api/trex/reports") {
        return Promise.resolve({ ok: true, json: async () => runReportsResponse });
      }
      if (url === "/api/trex/reports/trends?limit=30") {
        return pendingTrends.promise;
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openReports();

    const dialog = await screen.findByRole("dialog", { name: "Run Reports" });
    expect(await within(dialog).findByRole("button", { name: "Download JSON run.json" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Archives" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Save Report" })).toBeDisabled();
    expect(within(dialog).getByText(/Loading snapshot.*trends/)).toBeInTheDocument();
    expect(within(dialog).queryByText("No report archives")).not.toBeInTheDocument();

    pendingOverview.resolve(overview);
    pendingStats.resolve(statsResponse);
    pendingCaptureStatus.resolve(captureStatusResponse);
    pendingCaptureFiles.resolve(captureFilesResponse);
    pendingTrends.resolve(runReportTrendsResponse);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save Report" })).toBeEnabled());
  });

  it("keeps report snapshot, archives, trends, and loading owned by the latest request generation", async () => {
    const staleOverview = deferredJsonResponse<typeof overview>();
    const latestOverview = deferredJsonResponse<typeof overview>();
    const staleStats = deferredJsonResponse<typeof statsResponse>();
    const latestStats = deferredJsonResponse<typeof statsResponse>();
    const staleCaptureStatus = deferredJsonResponse<typeof captureStatusResponse>();
    const latestCaptureStatus = deferredJsonResponse<typeof captureStatusResponse>();
    const staleCaptureFiles = deferredJsonResponse<typeof captureFilesResponse>();
    const latestCaptureFiles = deferredJsonResponse<typeof captureFilesResponse>();
    const staleReports = deferredJsonResponse<typeof runReportsResponse>();
    const latestReports = deferredJsonResponse<typeof runReportsResponse>();
    const staleTrends = deferredJsonResponse<typeof runReportTrendsResponse>();
    const latestTrends = deferredJsonResponse<typeof runReportTrendsResponse>();
    const latestOverviewResponse = {
      ...overview,
      environment: {
        ...overview.environment,
        host: "10.0.0.99"
      }
    };
    const latestStatsResponse = {
      ...statsResponse,
      data: {
        ...statsResponse.data,
        global: {
          ...statsResponse.data.global,
          tx_pps: 777_777,
          rx_pps: 777_776
        }
      }
    };
    const latestReportsResponse = {
      ...runReportsResponse,
      data: {
        ...runReportsResponse.data,
        files: runReportsResponse.data.files.map((file) => ({
          ...file,
          name: "latest-run.json",
          path: "/var/log/trex/reports/latest-run.json"
        }))
      }
    };
    const latestTrendsResponse = {
      ...runReportTrendsResponse,
      data: {
        ...runReportTrendsResponse.data,
        total: 1,
        skipped: 0,
        verdict_counts: { pass: 1, warn: 0, fail: 0, unknown: 0 },
        conclusion: {
          ...runReportTrendsResponse.data.conclusion,
          verdict: "pass",
          title: "Latest History",
          summary: "Latest generation trend summary",
          reasons: ["Latest generation trend summary"]
        },
        metric_trends: runReportTrendsResponse.data.metric_trends.map((metric) => ({
          ...metric,
          latest: "77 Kpps"
        })),
        records: runReportTrendsResponse.data.records.map((record) => ({
          ...record,
          name: "latest-run.json",
          verdict: "pass",
          summary: "Latest generation record"
        }))
      }
    };
    let overviewRequestCount = 0;
    let statsRequestCount = 0;
    let captureStatusRequestCount = 0;
    let captureFilesRequestCount = 0;
    let reportsRequestCount = 0;
    let trendsRequestCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/system/overview") {
        overviewRequestCount += 1;
        if (overviewRequestCount === 1) {
          return Promise.resolve({ ok: true, json: async () => overview });
        }
        return overviewRequestCount === 2 ? staleOverview.promise : latestOverview.promise;
      }
      if (url === "/api/trex/profiles") {
        return Promise.resolve({ ok: true, json: async () => profileCatalog });
      }
      if (url === "/api/trex/stats") {
        statsRequestCount += 1;
        return statsRequestCount === 1 ? staleStats.promise : latestStats.promise;
      }
      if (url === "/api/trex/capture/status") {
        captureStatusRequestCount += 1;
        return captureStatusRequestCount === 1
          ? staleCaptureStatus.promise
          : latestCaptureStatus.promise;
      }
      if (url === "/api/trex/capture/files") {
        captureFilesRequestCount += 1;
        return captureFilesRequestCount === 1
          ? staleCaptureFiles.promise
          : latestCaptureFiles.promise;
      }
      if (url === "/api/trex/reports") {
        reportsRequestCount += 1;
        return reportsRequestCount === 1 ? staleReports.promise : latestReports.promise;
      }
      if (url === "/api/trex/reports/trends?limit=30") {
        trendsRequestCount += 1;
        return trendsRequestCount === 1 ? staleTrends.promise : latestTrends.promise;
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openReports();
    await waitFor(() => {
      expect(statsRequestCount).toBe(1);
      expect(captureStatusRequestCount).toBe(1);
      expect(captureFilesRequestCount).toBe(1);
      expect(reportsRequestCount).toBe(1);
      expect(trendsRequestCount).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Close Run Reports" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Run Reports" })).not.toBeInTheDocument()
    );
    await openReports();
    const dialog = await screen.findByRole("dialog", { name: "Run Reports" });
    await waitFor(() => {
      expect(statsRequestCount).toBe(2);
      expect(captureStatusRequestCount).toBe(2);
      expect(captureFilesRequestCount).toBe(2);
      expect(reportsRequestCount).toBe(2);
      expect(trendsRequestCount).toBe(2);
    });

    await act(async () => {
      staleOverview.resolve({
        ...overview,
        environment: { ...overview.environment, host: "10.0.0.20" }
      });
      staleStats.resolve(statsResponse);
      staleCaptureStatus.resolve(captureStatusResponse);
      staleCaptureFiles.resolve(captureFilesResponse);
      await Promise.all([
        staleOverview.promise,
        staleStats.promise,
        staleCaptureStatus.promise,
        staleCaptureFiles.promise
      ]);
    });
    expect(within(dialog).getByRole("button", { name: "Save Report" })).toBeDisabled();
    expect(within(dialog).getByText(/Loading snapshot/)).toBeInTheDocument();
    expect(within(dialog).queryByText("10.0.0.20:4501")).not.toBeInTheDocument();

    await act(async () => {
      latestReports.resolve(latestReportsResponse);
      latestTrends.resolve(latestTrendsResponse);
      await Promise.all([latestReports.promise, latestTrends.promise]);
    });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Archives" }));
    expect(
      await within(dialog).findByRole("button", { name: "Download JSON latest-run.json" })
    ).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Trends" }));
    expect(await within(dialog).findByText("History Clean")).toBeInTheDocument();
    expect(await within(dialog).findByRole("cell", { name: "77 Kpps" })).toBeInTheDocument();

    await act(async () => {
      staleReports.resolve(runReportsResponse);
      staleTrends.resolve(runReportTrendsResponse);
      await Promise.all([staleReports.promise, staleTrends.promise]);
    });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Archives" }));
    expect(
      within(dialog).getByRole("button", { name: "Download JSON latest-run.json" })
    ).toBeEnabled();
    expect(
      within(dialog).queryByRole("button", { name: "Download JSON run.json" })
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Trends" }));
    expect(await within(dialog).findByText("History Clean")).toBeInTheDocument();
    expect(within(dialog).queryByText("History Failing")).not.toBeInTheDocument();

    await act(async () => {
      latestOverview.resolve(latestOverviewResponse);
      latestStats.resolve(latestStatsResponse);
      latestCaptureStatus.resolve(captureStatusResponse);
      latestCaptureFiles.resolve(captureFilesResponse);
      await Promise.all([
        latestOverview.promise,
        latestStats.promise,
        latestCaptureStatus.promise,
        latestCaptureFiles.promise
      ]);
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Save Report" })).toBeEnabled()
    );
    fireEvent.click(within(dialog).getByRole("tab", { name: "Overview" }));
    expect(within(dialog).getByText("10.0.0.99:4501")).toBeInTheDocument();
    expect(within(dialog).getAllByText("777.8 Kpps").length).toBeGreaterThan(0);
  });
});
