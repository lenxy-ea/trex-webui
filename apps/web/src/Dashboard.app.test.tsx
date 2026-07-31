import {
  App,
  captureFilesResponse,
  captureStatusResponse,
  describe,
  expect,
  fetchCallCount,
  fireEvent,
  installAppTestHooks,
  it,
  openCapture,
  openDashboard,
  overview,
  profileCatalog,
  render,
  screen,
  statsResponse,
  stubFetch,
  vi,
  waitFor,
  within,
  xstatsResponse
} from "./test/appTestHarness";

describe("Dashboard", () => {
  installAppTestHooks();

  it("loads real backend stats when the Dashboard window opens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/trex/stats"));
    expect(screen.getByText("Total Tx L2")).toBeInTheDocument();
    const health = within(screen.getByLabelText("Run health"));
    expect(health.getByText("Critical")).toBeInTheDocument();
    expect(health.getAllByText("Latency errors 15").length).toBeGreaterThan(0);
    expect(health.getByText("PG 7 rx deficit 2")).toBeInTheDocument();
    expect(screen.getAllByText("9.99 Mb/s").length).toBeGreaterThan(0);
    expect(screen.getAllByText("19.51 Kpps").length).toBeGreaterThan(0);
    expect(screen.getByText("10.24 Mb/s")).toBeInTheDocument();
    expect(screen.getAllByText("0 b/s").length).toBeGreaterThan(0);
    expect(screen.getByText("124,960,248")).toBeInTheDocument();
    const activePortsPanel = screen.getByText("Active Ports").closest(".global-stat-panel");
    expect(activePortsPanel).not.toBeNull();
    expect(within(activePortsPanel as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Tx packets")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));
    expect(screen.getAllByText("0.052%").length).toBeGreaterThan(0);
  });

  it("uses the backend stats stream when Dashboard opens and EventSource is available", async () => {
    class MockStatsEventSource {
      static instances: MockStatsEventSource[] = [];
      url: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();

      constructor(url: string) {
        this.url = url;
        MockStatsEventSource.instances.push(this);
      }

      emit(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
      }
    }

    vi.stubGlobal("EventSource", MockStatsEventSource);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      throw new Error(`Unexpected request ${url}`);
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();
    await waitFor(() => expect(MockStatsEventSource.instances).toHaveLength(1));
    MockStatsEventSource.instances[0].emit(statsResponse);

    await waitFor(() => expect(screen.getAllByText("9.99 Mb/s").length).toBeGreaterThan(0));
    expect(MockStatsEventSource.instances[0].url).toBe("/api/trex/stats/stream");
    expect(fetchCallCount(fetchMock, "/api/trex/stats")).toBe(0);
  });

  it("surfaces Dashboard trend diagnostics from stats history", async () => {
    class MockStatsEventSource {
      static instances: MockStatsEventSource[] = [];
      url: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();

      constructor(url: string) {
        this.url = url;
        MockStatsEventSource.instances.push(this);
      }

      emit(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
      }
    }

    vi.stubGlobal("EventSource", MockStatsEventSource);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      throw new Error(`Unexpected request ${url}`);
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();
    await waitFor(() => expect(MockStatsEventSource.instances).toHaveLength(1));

    MockStatsEventSource.instances[0].emit({
      ...statsResponse,
      data: {
        ...statsResponse.data,
        global: {
          ...statsResponse.data.global,
          tx_pps: 1000,
          rx_pps: 995,
          rx_drop_bps: 0,
          queue_full: 0
        },
        latency: {
          ...statsResponse.data.latency,
          total: { average: 10 }
        }
      }
    });
    MockStatsEventSource.instances[0].emit({
      ...statsResponse,
      data: {
        ...statsResponse.data,
        global: {
          ...statsResponse.data.global,
          tx_pps: 1000,
          rx_pps: 850,
          rx_drop_bps: 1000,
          queue_full: 4
        },
        latency: {
          ...statsResponse.data.latency,
          total: { average: 60 }
        }
      }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));
    const trendTable = within(await screen.findByRole("table", { name: "Trend diagnostics" }));
    expect(trendTable.getByRole("cell", { name: "Drop trend" })).toBeInTheDocument();
    expect(trendTable.getByRole("cell", { name: "Queue pressure rising" })).toBeInTheDocument();
    expect(trendTable.getByRole("cell", { name: "Latency avg rising" })).toBeInTheDocument();
    expect(trendTable.getByRole("cell", { name: "RX rate gap widening" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Charts" }));
    expect(screen.getAllByText("Drop Rate").length).toBeGreaterThan(1);
  });

  it("polls Dashboard stats once per second without overlapping cycles", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/stats") {
        return { ok: true, json: async () => statsResponse };
      }
      throw new Error(`Unexpected request ${url}`);
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();

    await waitFor(() => expect(fetchCallCount(fetchMock, "/api/trex/stats")).toBe(1));
    const initialStatsCalls = fetchCallCount(fetchMock, "/api/trex/stats");

    await waitFor(
      () => expect(fetchCallCount(fetchMock, "/api/trex/stats")).toBeGreaterThan(initialStatsCalls),
      { interval: 25, timeout: 1400 }
    );

    expect(fetchCallCount(fetchMock, "/api/trex/stats")).toBe(initialStatsCalls + 1);
  });

  it("renders the original Dashboard Latency window and histogram modes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/trex/stats"));
    fireEvent.click(screen.getByRole("tab", { name: "Latency" }));

    const latencyWindow = within(screen.getByRole("table", { name: "Latency window" }));
    expect(screen.getByRole("button", { name: "Window" })).toHaveAttribute("aria-pressed", "true");
    expect(latencyWindow.getByRole("columnheader", { name: "Tx pkt" })).toBeInTheDocument();
    expect(latencyWindow.getByRole("columnheader", { name: "Last-9" })).toBeInTheDocument();
    expect(latencyWindow.getByRole("columnheader", { name: "Errors" })).toBeInTheDocument();
    expect(latencyWindow.getByRole("cell", { name: "15 us" })).toBeInTheDocument();
    expect(latencyWindow.getByRole("cell", { name: "8 us" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Histogram" }));

    const latencyHistogram = within(screen.getByRole("table", { name: "Latency histogram" }));
    expect(screen.getByRole("button", { name: "Histogram" })).toHaveAttribute("aria-pressed", "true");
    expect(latencyHistogram.getByRole("columnheader", { name: "10" })).toBeInTheDocument();
    expect(latencyHistogram.getByRole("columnheader", { name: "20" })).toBeInTheDocument();
    expect(latencyHistogram.getByRole("columnheader", { name: "Dropped" })).toBeInTheDocument();
    expect(latencyHistogram.getByRole("columnheader", { name: "Out Of Order" })).toBeInTheDocument();
    expect(latencyHistogram.getByRole("columnheader", { name: "Seq To High" })).toBeInTheDocument();
  });

  it("keeps original Dashboard selectors stateful", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openDashboard();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/trex/stats"));
    expect(screen.getByLabelText("Port 0")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Ports filter"), { target: { value: "My" } });
    expect(screen.queryByLabelText("Port 0")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Port 1")).toBeChecked();

    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove PG ID 7" })).toBeInTheDocument());
    expect(screen.getByText("Selected PG IDs (Max 8)")).toBeInTheDocument();
    const streamHealthTable = within(screen.getByRole("table", { name: "Stream health" }));
    expect(streamHealthTable.getByRole("cell", { name: "Critical" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "Warning" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "21 pps" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "20 pps" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "1.8%" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "0.948%" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "RX deficit 2; Latency errors 15; Max 15 us" })).toBeInTheDocument();
    expect(streamHealthTable.getByRole("cell", { name: "RX deficit 2; Max 21 us" })).toBeInTheDocument();
    const diagnosticsTable = within(screen.getByRole("table", { name: "Stream diagnostics" }));
    expect(diagnosticsTable.getByRole("cell", { name: "Latency errors" })).toBeInTheDocument();
    expect(diagnosticsTable.getByRole("cell", {
      name: "15 errors; dropped 1; dup 2; out-of-order 3; seq-high 4; seq-low 5; avg 8 us; max 15 us"
    })).toBeInTheDocument();
    expect(diagnosticsTable.getByRole("cell", { name: /Inspect capture for loss/ })).toBeInTheDocument();
    expect(diagnosticsTable.getAllByRole("cell", { name: "RX deficit" }).length).toBeGreaterThan(0);
    expect(diagnosticsTable.getByRole("cell", { name: "2 missing; loss 1.8%; Tx 111 / Rx 109" })).toBeInTheDocument();
    expect(screen.getAllByText("tx_pkts.total").length).toBeGreaterThan(0);
    const streamsTable = within(screen.getByRole("table", { name: "Stream raw metrics" }));
    expect(streamsTable.getByRole("cell", { name: "11 pps" })).toBeInTheDocument();
    expect(streamsTable.getByRole("cell", { name: "9.99 Mb/s" })).toBeInTheDocument();
    expect(streamsTable.getByRole("cell", { name: "2.0 KiB" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove PG ID 7" }));
    expect(screen.getByRole("button", { name: "Add PG ID 7" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Charts" }));
    fireEvent.change(screen.getByLabelText("Chart interval"), { target: { value: "120" } });
    expect(screen.getByLabelText("Chart interval")).toHaveValue("120");
    expect(screen.queryByRole("tab", { name: "Report" })).not.toBeInTheDocument();
  });

  it("posts Clear All Stats from the original toolbar command", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { accepted: true }, blocker: null, error: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => xstatsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Clear all stats" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/stats/clear",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ports: null,
            confirmation: null,
            clear_global: true,
            clear_flow_stats: true,
            clear_latency_stats: true,
            clear_xstats: true
          })
        })
      )
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/stats"));
    expect(fetchMock).toHaveBeenCalledWith("/api/trex/ports/xstats?port=0");
  });

  it("refreshes and resets hardware counters through real backend routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => xstatsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { accepted: true }, blocker: null, error: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => xstatsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Hardware counters" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/ports/xstats?port=0"));
    expect(screen.getByText("tx_good_packets")).toBeInTheDocument();
    expect(screen.queryByText("rx_errors")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter hardware counters"), { target: { value: "rx_good" } });
    expect(screen.getByText("rx_good_packets")).toBeInTheDocument();
    expect(screen.queryByText("tx_good_packets")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset Counters" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/stats/clear",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ports: [0],
            confirmation: null,
            clear_global: false,
            clear_flow_stats: true,
            clear_latency_stats: true,
            clear_xstats: true
          })
        })
      )
    );
    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/trex/ports/xstats?port=0")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/trex/stats?ports=0");
  });

  it("surfaces active capture recorders on the selected port control and configuration tabs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => captureStatusResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => captureFilesResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    expect(screen.getByText("Capturing:")).toBeInTheDocument();
    expect(screen.getAllByText("None").length).toBeGreaterThan(0);

    await openCapture();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/capture/status"));
    fireEvent.click(screen.getByTitle("Close Packet Capture"));

    expect(within(screen.getByRole("tabpanel", { name: "Control" })).getByText("Rx #3 / Tx #3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    expect(screen.getByText("Active capture")).toBeInTheDocument();
    expect(screen.getAllByText("Rx #3 / Tx #3").length).toBeGreaterThan(0);
    expect(screen.getByText("Service mode may remain enabled until the recorder stops.")).toBeInTheDocument();
  });
});
