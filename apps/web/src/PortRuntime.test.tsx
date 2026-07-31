import {
  activeTrafficRuntimeResult,
  App,
  daemonOverview,
  deferredResponse,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openDaemon,
  openDashboard,
  openProfiles,
  overview,
  overviewWithPort0Acquired,
  overviewWithWritablePort0Attributes,
  profileCatalog,
  profileCatalogWithCopy,
  profileCatalogWithImixWlc,
  profileCatalogWithSynAttack,
  render,
  screen,
  statsResponse,
  stubFetch,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

describe("Port Runtime", () => {
  installAppTestHooks();

  it("applies port L3 configuration from the original configuration tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { accepted: true }, blocker: null, error: null })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    expect(within(screen.getByRole("tabpanel", { name: "Configuration" })).getByText("Editable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("L3"));
    fireEvent.change(screen.getByLabelText("L3 source"), { target: { value: "1.1.1.1" } });
    fireEvent.change(screen.getByLabelText("L3 destination"), { target: { value: "2.2.2.2" } });
    fireEvent.change(screen.getByLabelText("VLAN"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/ports/configuration/apply",
        expect.objectContaining({
          body: JSON.stringify({
            port: 0,
            mode: "L3",
            l2_destination: null,
            l3_source: "1.1.1.1",
            l3_destination: "2.2.2.2",
            vlan: [100]
          }),
          method: "POST"
        })
      )
    );
    expect(await screen.findByText("Port configuration applied.")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps port configuration drafts mounted while switching detail tabs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    const tabList = screen.getByRole("tablist", { name: "Port detail tabs" });
    for (const tab of within(tabList).getAllByRole("tab")) {
      expect(document.getElementById(tab.getAttribute("aria-controls") ?? "missing-panel")).toBeInTheDocument();
    }

    const configurationTab = within(tabList).getByRole("tab", { name: "Configuration" });
    fireEvent.click(configurationTab);
    fireEvent.click(screen.getByLabelText("L3"));
    fireEvent.change(screen.getByLabelText("L3 source"), { target: { value: "198.51.100.10" } });
    fireEvent.change(screen.getByLabelText("L3 destination"), { target: { value: "198.51.100.20" } });

    fireEvent.click(within(tabList).getByRole("tab", { name: "Control" }));
    const configurationPanel = document.getElementById(configurationTab.getAttribute("aria-controls") ?? "");
    expect(configurationPanel).toHaveAttribute("hidden");
    expect(within(configurationPanel as HTMLElement).getByLabelText("L3 source")).toHaveValue("198.51.100.10");

    fireEvent.click(configurationTab);
    expect(configurationPanel).not.toHaveAttribute("hidden");
    expect(screen.getByLabelText("L3 destination")).toHaveValue("198.51.100.20");
  });

  it("resolves ARP from the original configuration tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { accepted: true, ports: [0], arp_resolution: "local_port" }, blocker: null, error: null })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    fireEvent.click(screen.getByLabelText("L3"));
    fireEvent.change(screen.getByLabelText("VLAN"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve ARP" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/ports/arp/resolve",
        expect.objectContaining({
          body: JSON.stringify({
            ports: [0],
            confirmation: null,
            retries: 1,
            vlan: [100]
          }),
          method: "POST"
        })
      )
    );
    expect(await screen.findByText("ARP resolution accepted.")).toBeInTheDocument();
    expect(screen.getByText("Port ARP resolve accepted ports 0 (local_port)")).toBeInTheDocument();
    expect(screen.queryByText(/port_info/)).not.toBeInTheDocument();
  });

  it("summarizes port ping results from the original configuration tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            port: 0,
            destination: "2.2.2.2",
            record_count: 5,
            reply_count: 0,
            timeout_count: 5,
            unreachable_count: 0,
            summary: "Ping complete: 0/5 replies, 5 timed out.",
            records: [
              {
                sequence: 1,
                status: "timeout",
                formatted_string: "Request timed out."
              }
            ]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    fireEvent.change(screen.getByPlaceholderText("Destination address"), { target: { value: "2.2.2.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Ping" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/ports/ping",
        expect.objectContaining({
          body: JSON.stringify({
            port: 0,
            destination: "2.2.2.2",
            pkt_size: 64,
            count: 5,
            interval_sec: 1,
            vlan: null
          }),
          method: "POST"
        })
      )
    );
    expect(await screen.findByText("Ping complete: 0/5 replies, 5 timed out.")).toBeInTheDocument();
    expect(screen.getByText("Port ping accepted port 0 -> 2.2.2.2: 0/5 replies, 5 timed out")).toBeInTheDocument();
    expect(screen.queryByText(/"records"/)).not.toBeInTheDocument();
  });

  it("announces IPv6 scan results and exposes a keyboard-operable neighbor action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            hosts: [{ mac: "00:11:22:33:44:55", ip: "2001:db8::10" }]
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    const scanStatus = await screen.findByText("IPv6 scan complete: 1 hosts.");
    expect(scanStatus).toHaveAttribute("aria-live", "polite");
    const useNeighborButton = screen.getByRole("button", {
      name: "Use 2001:db8::10 as L2 destination"
    });
    useNeighborButton.focus();
    fireEvent.click(useNeighborButton);

    expect(screen.getByLabelText("L2")).toBeChecked();
    expect(screen.getByLabelText("L2 destination")).toHaveValue("00:11:22:33:44:55");
  });

  it("locks the original configuration tab until the port is acquired", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));

    expect(within(screen.getByRole("tabpanel", { name: "Configuration" })).getByText("Locked")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Configuration" })).getByText("Port attributes require an acquired port")).toBeInTheDocument();
    expect(screen.getByLabelText("L2")).toBeDisabled();
    expect(screen.getByLabelText("L3")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ping" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Scan" })).toBeDisabled();
  });

  it("locks the original configuration tab while the selected port is transmitting", async () => {
    const overviewWithPort0Tx = {
      ...overviewWithPort0Acquired,
      trex_ports: {
        ...overviewWithPort0Acquired.trex_ports,
        data: {
          ...overviewWithPort0Acquired.trex_ports.data,
          ports: overviewWithPort0Acquired.trex_ports.data.ports.map((port) =>
            port.id === 0
              ? {
                  ...port,
                  info: {
                    ...port.info,
                    status: "TX"
                  }
                }
              : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Tx })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));

    expect(within(screen.getByRole("tabpanel", { name: "Configuration" })).getByText("Locked")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Configuration" })).getByText("Port is in TX mode. Please stop traffic first.")).toBeInTheDocument();
    expect(screen.getByLabelText("L2")).toBeDisabled();
    expect(screen.getByLabelText("L3")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resolve ARP" })).toBeDisabled();
  });

  it("keeps the original daemon disconnect event in Log view", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => daemonOverview });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    openDaemon();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/system/daemon"));
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    await waitFor(() => expect(screen.getByText("Connection to http://10.0.0.10:8090 established")).toBeInTheDocument());
    expect(screen.getByText("Log view")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: "Log view" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(screen.getByText("Disconnected from http://10.0.0.10:8090")).toBeInTheDocument();
  });

  it("clears daemon connection state when the original daemon window is closed", async () => {
    const reopenedDaemon = deferredResponse(daemonOverview);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => daemonOverview })
      .mockReturnValueOnce(reopenedDaemon.promise);
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    openDaemon();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/system/daemon"));
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    await waitFor(() => expect(screen.getByText("Connection to http://10.0.0.10:8090 established")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Close TRex Daemon"));
    expect(screen.queryByRole("dialog", { name: "TRex Daemon" })).not.toBeInTheDocument();

    openDaemon();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/system/daemon"));
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
    expect(screen.queryByText("Connection to http://10.0.0.10:8090 established")).not.toBeInTheDocument();

    reopenedDaemon.resolve();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Log" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Log" }));
    await waitFor(() => expect(screen.getByText("Connection to http://10.0.0.10:8090 established")).toBeInTheDocument());
  });

  it("shows backend blocker instead of fake data when fetch fails", async () => {
    stubFetch(vi.fn().mockRejectedValue(new Error("network down")));

    render(<App />);

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
    expect(screen.getByText("TRex-unconfigured")).toBeInTheDocument();
  });

  it("posts traffic start request from the original toolbar command", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith("Start traffic on port 0 with profile udp_1pkt_simple.py?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {},
          expected_session_id: null
        })
      })
    );
  });

  it("starts a new session after a finite bound session has stopped", async () => {
    const stoppedRuntime = {
      ...activeTrafficRuntimeResult,
      data: {
        ...activeTrafficRuntimeResult.data,
        session: {
          ...activeTrafficRuntimeResult.data.session,
          state: "stopped",
          ended_at: "2026-07-30T00:01:00Z",
          groups: activeTrafficRuntimeResult.data.session.groups.map((group) => ({
            ...group,
            state: "stopped",
            port_states: { 0: "stopped", 1: "stopped" }
          }))
        },
        port_states: [
          { port: 0, state: "stopped", ownership: "none" },
          { port: 1, state: "stopped", ownership: "none" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            ports: [0],
            multiplier: "1",
            duration: -1,
            session: { ...activeTrafficRuntimeResult.data.session, id: "session-456" }
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock, [activeTrafficRuntimeResult, stoppedRuntime]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/start",
        expect.objectContaining({
          body: expect.stringContaining('"expected_session_id":null')
        })
      )
    );
  });

  it("starts again after stopping the last port in the bound session", async () => {
    const stoppedRuntime = {
      ...activeTrafficRuntimeResult,
      data: {
        ...activeTrafficRuntimeResult.data,
        session: {
          ...activeTrafficRuntimeResult.data.session,
          state: "stopped",
          ended_at: "2026-07-30T00:02:00Z",
          groups: activeTrafficRuntimeResult.data.session.groups.map((group) => ({
            ...group,
            state: "stopped",
            port_states: { 0: "stopped", 1: "stopped" }
          }))
        },
        port_states: [
          { port: 0, state: "stopped", ownership: "none" },
          { port: 1, state: "stopped", ownership: "none" }
        ]
      }
    };
    const fetchMock = vi.fn(async (request: string | URL | Request) => {
      const url = String(request);
      if (url === "/api/system/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/stats") {
        return { ok: true, json: async () => statsResponse };
      }
      if (url === "/api/trex/traffic/stop") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              accepted: true,
              ports: [0],
              session: stoppedRuntime.data.session
            },
            blocker: null,
            error: null
          })
        };
      }
      if (url === "/api/trex/traffic/start") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              accepted: true,
              ports: [0],
              multiplier: "1",
              duration: -1,
              session: { ...activeTrafficRuntimeResult.data.session, id: "session-789" }
            },
            blocker: null,
            error: null
          })
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    stubFetch(fetchMock, [activeTrafficRuntimeResult, activeTrafficRuntimeResult, stoppedRuntime]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop selected port" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/stop",
        expect.objectContaining({ method: "POST" })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/start",
        expect.objectContaining({
          body: expect.stringContaining('"expected_session_id":null')
        })
      )
    );
  });

  it("does not adopt a replacement active session when starting from a stale page", async () => {
    const replacementRuntime = {
      ...activeTrafficRuntimeResult,
      data: {
        ...activeTrafficRuntimeResult.data,
        session: {
          ...activeTrafficRuntimeResult.data.session,
          id: "session-456"
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock, [activeTrafficRuntimeResult, replacementRuntime]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() =>
      expect(screen.getByText(/traffic_session_id_conflict/)).toBeInTheDocument()
    );
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/trex/traffic/start")
    ).toHaveLength(0);
  });

  it("marks the selected topology port active immediately after traffic start", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    const port0Branch = screen.getByRole("treeitem", { name: /Port 0/ });
    expect(port0Branch.querySelector(".ownership-dot")).toHaveClass("ownership-dot--active");
    expect(fetchMock).toHaveBeenCalledWith("/api/system/overview");
    expect(fetchMock).toHaveBeenCalledWith("/api/trex/stats");
  });

  it("posts the selected traffic multiplier when starting from the toolbar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "100%", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Traffic rate unit"), { target: { value: "percentage" } });
    fireEvent.change(screen.getByLabelText("Traffic rate value"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (100%)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "100%",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {},
          expected_session_id: null
        })
      })
    );
  });

  it("posts the selected traffic multiplier when updating rate from the toolbar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "100%", update_result: null },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock, activeTrafficRuntimeResult);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Traffic rate unit"), { target: { value: "percentage" } });
    fireEvent.change(screen.getByLabelText("Traffic rate value"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Rate" }));

    await waitFor(() => expect(screen.getByText("Traffic rate update accepted ports 0 (100%)")).toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          multiplier: "100%",
          force: false,
          total: false,
          expected_session_id: "session-123"
        })
      })
    );
  });

  it("posts the selected traffic duration when enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: 45 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Enable traffic duration"));
    fireEvent.change(screen.getByLabelText("Traffic duration seconds"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1) duration 45s")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "1",
          duration: 45,
          force: false,
          confirmation: "start-traffic",
          tunables: {},
          expected_session_id: null
        })
      })
    );
  });

  it("explains capture service-mode flow-stats start failures in logs and Dashboard health", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          data: null,
          blocker: "trex_command_failed",
          error: "\u001b[1mPort 0 : *** Port 1 is under service mode, can't use flow_stats.\u001b[22m"
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText(/Capture service mode blocks flow stats/)).toBeInTheDocument());
    expect(screen.getByText(/disable RX Stats\/Latency/)).toBeInTheDocument();

    await openDashboard();

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/trex/stats"));
    const health = within(screen.getByLabelText("Run health"));
    expect(health.getByText("Blocked")).toBeInTheDocument();
    expect(health.getByText("TRex cannot start a flow-stats stream while a capture has the peer port in service mode")).toBeInTheDocument();
    expect(health.getByText("Stop the active capture recorder or disable RX Stats/Latency on the stream before starting traffic")).toBeInTheDocument();
  });

  it("posts Python profile tunables when starting a Python profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.change(screen.getByLabelText("Tunable size"), { target: { value: "1514" } });
    fireEvent.change(screen.getByLabelText("Tunable VM"), { target: { value: "cached" } });
    fireEvent.change(screen.getByLabelText("Tunable flow"), { target: { value: "fsl" } });
    fireEvent.change(screen.getByLabelText("Tunable PG ID"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {
            size: "1514",
            vm: "cached",
            flow: "fsl",
            pg_id: 9
          },
          expected_session_id: null
        })
      })
    );
  });

  it("clears Python tunables when selecting another profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.change(screen.getByLabelText("Tunable size"), { target: { value: "1514" } });
    fireEvent.change(screen.getByLabelText("Tunable VM"), { target: { value: "cached" } });
    fireEvent.click(screen.getByRole("option", { name: "http_simple.yaml" }));
    fireEvent.click(screen.getByRole("option", { name: "udp_1pkt_simple.py" }));
    expect(screen.getByLabelText("Tunable size")).toHaveValue("");
    expect(screen.getByLabelText("Tunable VM")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {},
          expected_session_id: null
        })
      })
    );
  });

  it("does not send shortcut tunables to a Python profile that declares none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithSynAttack })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: null, multiplier: "100%", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.change(screen.getByLabelText("Tunable size"), { target: { value: "1500" } });
    fireEvent.change(screen.getByLabelText("Tunable VM"), { target: { value: "cached" } });
    fireEvent.click(screen.getByRole("option", { name: "syn_attack.py" }));

    expect(screen.queryByLabelText("Tunable size")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tunable VM")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Profile traffic multiplier unit"), { target: { value: "percentage" } });
    fireEvent.change(screen.getByLabelText("Profile traffic multiplier value"), { target: { value: "100" } });
    fireEvent.click(screen.getByTitle("Start selected profile on all ports"));

    await waitFor(() => expect(screen.getByText("Traffic start accepted all ports (100%)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "syn_attack.py",
          ports: null,
          multiplier: "100%",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {},
          expected_session_id: null
        })
      })
    );
  });

  it("renders declared Python profile tunables and requires mandatory values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithImixWlc })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.click(screen.getByRole("option", { name: "imix_wlc.py" }));

    expect(screen.queryByLabelText("Tunable size")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Extra tunables")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tunable src")).toHaveAttribute("placeholder", "required");
    expect(screen.getByLabelText("Tunable dst")).toHaveAttribute("placeholder", "required");
    expect(screen.getByLabelText("Tunable src_count")).toHaveAttribute("placeholder", "1");

    expect(screen.getByText("Tunable src is required")).toBeInTheDocument();
    expect(screen.getByTitle("Start selected profile")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText("Tunable src"), { target: { value: "16.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Tunable dst"), { target: { value: "48.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Tunable src_count"), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByTitle("Start selected profile")).not.toBeDisabled());
    fireEvent.click(screen.getByTitle("Start selected profile"));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "imix_wlc.py",
          ports: [0],
          multiplier: "1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {
            src: "16.0.0.1",
            dst: "48.0.0.1",
            src_count: "2"
          },
          expected_session_id: null
        })
      })
    );
  });

  it("posts Python profile runtime multiplier from the profile window", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "25gbpsl1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getByLabelText("Profile traffic multiplier unit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L1 bps" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build Stream" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "L1 bps" }));
    fireEvent.change(screen.getByLabelText("Profile traffic multiplier value"), { target: { value: "25G" } });
    expect(screen.getByText("TRex mult 25gbpsl1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tunable size"), { target: { value: "1514" } });
    fireEvent.change(screen.getByLabelText("Tunable flow"), { target: { value: "fsl" } });
    fireEvent.click(screen.getByTitle("Start selected profile"));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (25gbpsl1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "25gbpsl1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {
            size: "1514",
            flow: "fsl"
          },
          expected_session_id: null
        })
      })
    );
  });

  it("keeps runtime multiplier available for a Python profile path outside the catalog", async () => {
    const emptyProfileCatalog = {
      ...profileCatalog,
      data: {
        ...profileCatalog.data,
        roots: profileCatalog.data.roots.map((root) => ({ ...root, profile_count: 0 })),
        profiles: []
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => emptyProfileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], multiplier: "100gbpsl1", duration: -1 },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    expect(screen.getByLabelText("Profile traffic multiplier unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Tunable size")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Profile traffic multiplier unit"), { target: { value: "bps_L1" } });
    fireEvent.change(screen.getByLabelText("Profile traffic multiplier value"), { target: { value: "100G" } });
    fireEvent.change(screen.getByLabelText("Tunable size"), { target: { value: "1514" } });
    fireEvent.click(screen.getByTitle("Start selected profile"));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (100gbpsl1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "udp_1pkt_simple.py",
          ports: [0],
          multiplier: "100gbpsl1",
          duration: -1,
          force: false,
          confirmation: "start-traffic",
          tunables: {
            size: "1514"
          },
          expected_session_id: null
        })
      })
    );
  });

  it("does not post traffic start when Python profile tunables are invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await openProfiles();
    fireEvent.change(screen.getByLabelText("Tunable PG ID"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByText(/invalid_tunables PG ID tunable must be a non-negative integer/)).toBeInTheDocument()
    );
  });

  it("does not post traffic start when the selected multiplier is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Traffic rate value"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText(/invalid_multiplier Traffic multiplier must be greater than 0/)).toBeInTheDocument());
  });

  it("does not post traffic update when the selected multiplier is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Traffic rate value"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Rate" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText(/invalid_multiplier Traffic multiplier must be greater than 0/)).toBeInTheDocument());
  });

  it("does not post traffic start when the selected duration is invalid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText("Enable traffic duration"));
    fireEvent.change(screen.getByLabelText("Traffic duration seconds"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText(/invalid_duration Traffic duration must be greater than 0 seconds/)).toBeInTheDocument());
  });

  it("does not post traffic start when confirmation is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    expect(window.confirm).toHaveBeenCalledWith("Start traffic on port 0 with profile udp_1pkt_simple.py?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the selected traffic profile when starting from the toolbar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.click(screen.getByRole("option", { name: "http_simple.yaml" }));
    fireEvent.click(screen.getByRole("button", { name: "Start selected port" }));

    await waitFor(() => expect(screen.getByText("Traffic start accepted {\"accepted\":true}")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        body: expect.stringContaining('"profile_path":"http_simple.yaml"')
      })
    );
  });

  it("runs original profile duplicate export and delete commands", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:profile-json")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            profile: profileCatalogWithCopy.data.profiles[2],
            source: profileCatalog.data.profiles[1]
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithCopy })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            accepted: true,
            file_name: "http_simple-copy.json",
            content: "{\"streams\":[]}",
            bytes: 14
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
            profile: profileCatalogWithCopy.data.profiles[2]
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.click(screen.getByRole("option", { name: "http_simple.yaml" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Profile" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/duplicate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ profile_path: "http_simple.yaml", target_name: null })
        })
      )
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "http_simple-copy.yaml" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Export to JSON" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/export-json",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ profile_path: "http_simple-copy.yaml" })
        })
      )
    );
    expect(window.URL.createObjectURL).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Profile" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete profile http_simple-copy.yaml?");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/delete",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ profile_path: "http_simple-copy.yaml", confirmation: "delete-profile" })
        })
      )
    );
  });

  it("posts a port acquire command to the backend", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Acquire ports"));

    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/acquire",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          force: false,
          sync_streams: true,
          confirmation: null
        })
      })
    );
  });

  it("refreshes port ownership after manual acquire without locking the top toolbar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            "0": { tx_pps: 0, rx_pps: 0, tx_bps: 0, rx_bps: 0, tx_bps_L1: 0, rx_bps_L1: 0 },
            "1": { tx_pps: 0, rx_pps: 0, tx_bps: 0, rx_bps: 0, tx_bps_L1: 0, rx_bps_L1: 0 }
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Acquire ports"));

    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/stats"));
    expect(screen.getByRole("button", { name: "Start selected port" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop selected port" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Acquire selected port" })).not.toBeDisabled();
    expect(screen.getByRole("treeitem", { name: /Port 0/ }).querySelector(".ownership-dot")).toHaveClass("ownership-dot--owned");
  });

  it("posts service mode changes from the acquired port control switch", async () => {
    const overviewWithServiceEnabled = {
      ...overviewWithPort0Acquired,
      trex_ports: {
        ...overviewWithPort0Acquired.trex_ports,
        data: {
          ...overviewWithPort0Acquired.trex_ports.data,
          ports: overviewWithPort0Acquired.trex_ports.data.ports.map((port) =>
            port.id === 0
              ? {
                  ...port,
                  info: {
                    ...port.info,
                    service_mode: true
                  }
                }
              : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], enabled: true },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithServiceEnabled })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    const serviceSwitch = screen.getByRole("switch", { name: "Service mode" });
    expect(serviceSwitch).not.toBeDisabled();
    expect(serviceSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(serviceSwitch);

    await waitFor(() => expect(screen.getByText(/Port command accepted ports 0/)).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith("Enable service mode on port 0?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/service-mode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          enabled: true,
          filtered: false,
          mask: null,
          confirmation: "service-mode"
        })
      })
    );
  });

  it("keeps acquired port attributes writable when support fields are absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPort0Acquired })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    expect(within(screen.getByRole("tabpanel", { name: "Control" })).getByText("Editable")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Multicast" })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Promiscuous" })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Service mode" })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Link" })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "LED" })).not.toBeDisabled();
    expect(screen.getByLabelText("Flow control")).not.toBeDisabled();
  });

  it("keeps port attributes locked when owner text says acquired but this WebUI session does not own the port", async () => {
    const ownerAcquiredFromAnotherSession = {
      ...overview,
      trex_ports: {
        ...overview.trex_ports,
        data: {
          ...overview.trex_ports.data,
          acquired_ports: [],
          ports: overview.trex_ports.data.ports.map((port) =>
            port.id === 0
              ? {
                  ...port,
                  acquired: false,
                  info: {
                    ...port.info,
                    owner: "acquired",
                    service_mode: false
                  }
                }
              : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ownerAcquiredFromAnotherSession })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    expect(screen.getByRole("treeitem", { name: /Port 0/ }).querySelector(".ownership-dot")).toHaveClass("ownership-dot--idle");
    expect(screen.getByRole("button", { name: /^Acquire$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^Force Acquire$/ })).not.toBeDisabled();
    expect(within(screen.getByRole("tabpanel", { name: "Control" })).getByText("Locked")).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Control" })).getByText("Port attributes require an acquired port")).toBeInTheDocument();
    const serviceSwitch = screen.getByRole("switch", { name: "Service mode" });
    expect(serviceSwitch).toBeDisabled();
    fireEvent.click(serviceSwitch);

    expect(fetchMock).not.toHaveBeenCalledWith("/api/trex/ports/service-mode", expect.anything());
  });

  it("keeps multicast and promiscuous writable when support fields are conservative", async () => {
    const overviewWithConservativeSupport = {
      ...overviewWithWritablePort0Attributes,
      trex_ports: {
        ...overviewWithWritablePort0Attributes.trex_ports,
        data: {
          ...overviewWithWritablePort0Attributes.trex_ports.data,
          ports: overviewWithWritablePort0Attributes.trex_ports.data.ports.map((port) =>
            port.id === 0
              ? {
                  ...port,
                  info: {
                    ...port.info,
                    multicast_supported: "no",
                    prom_supported: "no"
                  }
                }
              : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithConservativeSupport })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    expect(within(screen.getByRole("tabpanel", { name: "Control" })).getByText("Editable")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Multicast" })).not.toBeDisabled();
    expect(screen.getByRole("switch", { name: "Promiscuous" })).not.toBeDisabled();
  });

  it("posts writable port attributes from the control switches", async () => {
    const overviewWithMulticastEnabled = {
      ...overviewWithWritablePort0Attributes,
      trex_ports: {
        ...overviewWithWritablePort0Attributes.trex_ports,
        data: {
          ...overviewWithWritablePort0Attributes.trex_ports.data,
          ports: overviewWithWritablePort0Attributes.trex_ports.data.ports.map((port) =>
            port.id === 0 ? { ...port, info: { ...port.info, mult: "on" } } : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithWritablePort0Attributes })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], attribute: "multicast", value: true },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithMulticastEnabled })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    const multicastSwitch = screen.getByRole("switch", { name: "Multicast" });
    expect(multicastSwitch).not.toBeDisabled();
    expect(multicastSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(multicastSwitch);

    await waitFor(() => expect(screen.getByText(/Port attribute accepted ports 0 multicast=true/)).toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/attribute",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          attribute: "multicast",
          value: true,
          confirmation: null
        })
      })
    );
  });

  it("posts flow control changes from the control choice", async () => {
    const overviewWithFullFlowControl = {
      ...overviewWithWritablePort0Attributes,
      trex_ports: {
        ...overviewWithWritablePort0Attributes.trex_ports,
        data: {
          ...overviewWithWritablePort0Attributes.trex_ports.data,
          ports: overviewWithWritablePort0Attributes.trex_ports.data.ports.map((port) =>
            port.id === 0 ? { ...port, info: { ...port.info, fc: "FULL" } } : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithWritablePort0Attributes })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], attribute: "flow_control", value: "FULL" },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithFullFlowControl })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Flow control"), { target: { value: "FULL" } });

    await waitFor(() => expect(screen.getByText(/Port attribute accepted ports 0 flow_control=FULL/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/attribute",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          attribute: "flow_control",
          value: "FULL",
          confirmation: null
        })
      })
    );
  });

  it("requires confirmation before disabling link from the control switch", async () => {
    const overviewWithLinkDown = {
      ...overviewWithWritablePort0Attributes,
      trex_ports: {
        ...overviewWithWritablePort0Attributes.trex_ports,
        data: {
          ...overviewWithWritablePort0Attributes.trex_ports.data,
          ports: overviewWithWritablePort0Attributes.trex_ports.data.ports.map((port) =>
            port.id === 0 ? { ...port, info: { ...port.info, link: "DOWN" } } : port
          )
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithWritablePort0Attributes })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0], attribute: "link", value: false },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithLinkDown })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("switch", { name: "Link" }));

    await waitFor(() => expect(screen.getByText(/Port attribute accepted ports 0 link=false/)).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith("Disable link on port 0?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/attribute",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          attribute: "link",
          value: false,
          confirmation: "port-attribute"
        })
      })
    );
  });

  it("posts a force acquire command with the required confirmation token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Force acquire ports"));

    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith("Force acquire port 0 from another TRex client?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/acquire",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          force: true,
          sync_streams: true,
          confirmation: "force-acquire"
        })
      })
    );
  });

  it("uses the selected topology port for port commands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("treeitem", { name: /Port 1/ }));
    fireEvent.click(screen.getByTitle("Release ports"));

    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/ports/release",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [1],
          confirmation: null
        })
      })
    );
  });

  it("does not post reset when confirmation is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTitle("Reset ports"));

    expect(window.confirm).toHaveBeenCalledWith("Reset port 0 and remove loaded traffic state?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("posts stop traffic from the original toolbar command", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock, activeTrafficRuntimeResult);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop selected port" }));

    await waitFor(() => expect(screen.getByText(/Port command accepted/)).toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith("Stop traffic on port 0?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/stop",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ports: [0],
          confirmation: "stop",
          expected_session_id: "session-123"
        })
      })
    );
  });

  it("stops only the explicit ports owned by the bound traffic session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { accepted: true, ports: [0, 1], session: null },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock, activeTrafficRuntimeResult);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop all ports" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/stop",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ports: [0, 1],
            confirmation: "stop",
            expected_session_id: "session-123"
          })
        })
      )
    );
    expect(window.confirm).toHaveBeenCalledWith("Stop traffic on all ports?");
  });

  it("rejects a stale page before it can control a replacement traffic session", async () => {
    const replacementRuntime = {
      ...activeTrafficRuntimeResult,
      data: {
        ...activeTrafficRuntimeResult.data,
        session: {
          ...activeTrafficRuntimeResult.data.session,
          id: "session-456"
        }
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock, [activeTrafficRuntimeResult, replacementRuntime]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop selected port" }));

    await waitFor(() =>
      expect(screen.getByText(/traffic_session_id_conflict/)).toBeInTheDocument()
    );
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/trex/traffic/stop")
    ).toHaveLength(0);
  });

  it("posts pause and resume traffic for the selected port", async () => {
    const fetchMock = vi.fn(async (request: string | URL | Request) => {
      const url = String(request);
      if (url === "/api/system/overview" || url === "/api/trex/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/stats") {
        return { ok: true, json: async () => statsResponse };
      }
      if (url === "/api/trex/traffic/pause" || url === "/api/trex/traffic/resume") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: { accepted: true },
            blocker: null,
            error: null
          })
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    stubFetch(fetchMock, activeTrafficRuntimeResult);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Pause selected port" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/pause",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ports: [0],
            confirmation: null,
            expected_session_id: "session-123"
          })
        })
      )
    );

    const resumeButton = screen.getByRole("button", { name: "Resume selected port" });
    await waitFor(() => expect(resumeButton).not.toBeDisabled());
    fireEvent.click(resumeButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/traffic/resume",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            ports: [0],
            confirmation: null,
            expected_session_id: "session-123"
          })
        })
      )
    );
  });
});
