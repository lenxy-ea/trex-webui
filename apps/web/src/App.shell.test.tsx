import {
  App,
  DaemonOverview,
  daemonMetadataStatusLog,
  daemonOverview,
  daemonOverviewRunning,
  daemonRuntimeStatusLog,
  describe,
  expect,
  fireEvent,
  formatHostForUrl,
  installAppTestHooks,
  it,
  openDaemon,
  openDashboard,
  openProfiles,
  overview,
  overviewWithPreferences,
  overviewWithTrexDisconnected,
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

describe("App / Shell", () => {
  installAppTestHooks();

  it("labels daemon devices-info errors without disabling metadata config editing", () => {
    expect(daemonMetadataStatusLog("devices unavailable", true)).toBe(
      "Unable to get TRex devices info from TRex Daemon: devices unavailable"
    );
    expect(daemonMetadataStatusLog("metadata unavailable", false)).toBe(
      "Unable to get TRex config Metadata, custom config usage will not be available: metadata unavailable"
    );
    expect(daemonMetadataStatusLog(null, true)).toBe("");
  });

  it("logs daemon TRex runtime status from the real status payload", () => {
    expect(daemonRuntimeStatusLog(daemonOverviewRunning as DaemonOverview)).toBe("TRex status: TRex is Running");
    expect(
      daemonRuntimeStatusLog({
        ...daemonOverview,
        trex: {
          ...daemonOverview.trex,
          ok: false,
          running: null,
          status: null,
          blocker: "daemon_rpc_failed",
          error: "status unavailable"
        }
      } as DaemonOverview)
    ).toBe("Unable to get TRex runtime status: status unavailable");
  });

  it("formats daemon IPv6 hosts for URL display", () => {
    expect(formatHostForUrl("2001:db8::1")).toBe("[2001:db8::1]");
    expect(formatHostForUrl("10.0.0.10")).toBe("10.0.0.10");
    expect(formatHostForUrl("trex.lab")).toBe("trex.lab");
  });

  it("renders the TRex GUI shell without non-reference frontend surfaces", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => xstatsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => statsResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => daemonOverview });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    expect(screen.getByText("TRex-10.0.0.10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start all ports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop all ports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acquire selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release selected port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect from TRex server" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Control" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Configuration" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Hardware counters" })).toBeInTheDocument();
    expect(screen.getByText("Driver:")).toBeInTheDocument();
    expect(screen.getAllByText("i40e").length).toBeGreaterThan(0);
    expect(screen.getByText("Console Log View")).toBeInTheDocument();
    expect(screen.queryByText("JSON RPC")).not.toBeInTheDocument();
    expect(screen.queryByText("Port Command Console")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "System" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Console Log View" }));
    expect(screen.queryByText(/GET \/api\/trex\/profiles/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Log View" }));

    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    expect(screen.getByText("Ping host:")).toBeInTheDocument();
    expect(screen.getByText("IPv6 hosts:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Hardware counters" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/trex/ports/xstats?port=0"));
    expect(screen.getByText("Not empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Counters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Control" }));

    await openProfiles();
    const profilesDialog = screen.getByRole("dialog", { name: "Traffic Profiles" });
    expect(profilesDialog).toBeInTheDocument();
    expect(profilesDialog).toHaveClass("floating-window--large");
    expect(screen.getByRole("button", { name: "Create Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("udp_1pkt_simple.py");
    expect(screen.queryByRole("button", { name: "Build Stream" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "http_simple.yaml" }));
    expect(screen.getByRole("button", { name: "Build Stream" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate Stream" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export To Yaml" })).toBeInTheDocument();
    expect(screen.getAllByText("Packet Type").length).toBeGreaterThan(0);
    expect(screen.queryByText("Profile Catalog")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Preview profile")).not.toBeInTheDocument();

    await openDashboard();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/trex/stats"));
    expect(screen.getByRole("dialog", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Total Tx L2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ports" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Charts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Utilization" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Report" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Refresh stats")).not.toBeInTheDocument();

    openDaemon();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/system/daemon"));
    expect(screen.getByRole("dialog", { name: "TRex Daemon" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("TRex config edit")).toBeInTheDocument());
    expect(screen.getByText("YAML preview:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load default config" })).toBeInTheDocument();
    expect(screen.getByText("Reservation: Free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reserve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Start timeout")).toBeInTheDocument();
    expect(screen.queryByText("Config path")).not.toBeInTheDocument();
    expect(screen.queryByText("Daemon bin")).not.toBeInTheDocument();
    expect(screen.queryByText("Show command")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog", { name: "TRex" })).toBeInTheDocument();
    expect(screen.getByText("TRex unit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: "TRex" })).not.toBeInTheDocument();
  });

  it("opens original-style Preferences from the File menu", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPreferences })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const fileMenu = screen.getByRole("menu", { name: "File" });
    expect(within(fileMenu).getByRole("menuitem", { name: "Disconnect" })).toBeInTheDocument();
    fireEvent.click(within(fileMenu).getByRole("menuitem", { name: "Preferences" }));

    const preferencesDialog = screen.getByRole("dialog", { name: "Preferences" });
    expect(preferencesDialog).toBeInTheDocument();
    expect(preferencesDialog).toHaveClass("floating-window--compact");
    expect(within(preferencesDialog).getByLabelText("Load files from")).toHaveValue("/opt/trex-core/scripts/stl");
    expect(within(preferencesDialog).getByLabelText("Save files to")).toHaveValue("/opt/trex-webui/profiles");
    expect(within(preferencesDialog).getByLabelText("Templates dir")).toHaveValue("/opt/trex-core/scripts/stl");
    expect(within(preferencesDialog).getByLabelText("Wireshark executable")).toHaveValue("wireshark -r");
    expect(within(preferencesDialog).getAllByRole("button", { name: /Select / })).toHaveLength(4);
    for (const button of within(preferencesDialog).getAllByRole("button", { name: /Select / })) {
      expect(button).toBeDisabled();
    }

    fireEvent.click(within(preferencesDialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: "Preferences" })).not.toBeInTheDocument();
  });

  it("does not discard unsaved port-pair assignments when closing Profiles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    const dialog = screen.getByRole("dialog", { name: "Traffic Profiles" });
    const pair0 = await within(dialog).findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    fireEvent.change(within(pair0).getByLabelText("Multiplier or rate for P0 ↔ P1"), {
      target: { value: "2kpps" }
    });

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close Traffic Profiles" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved traffic plan assignments and close Traffic Profiles?"
    );
    expect(screen.getByRole("dialog", { name: "Traffic Profiles" })).toBeInTheDocument();

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close Traffic Profiles" }));
    expect(screen.queryByRole("dialog", { name: "Traffic Profiles" })).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and focus restoration in the File menu", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithPreferences })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    const fileButton = screen.getByRole("button", { name: "File" });
    fireEvent.click(fileButton);
    const fileMenu = screen.getByRole("menu", { name: "File" });
    const disconnectItem = within(fileMenu).getByRole("menuitem", { name: "Disconnect" });
    const preferencesItem = within(fileMenu).getByRole("menuitem", { name: "Preferences" });

    expect(disconnectItem).toHaveFocus();
    fireEvent.keyDown(disconnectItem, { key: "ArrowDown" });
    expect(preferencesItem).toHaveFocus();
    fireEvent.keyDown(preferencesItem, { key: "ArrowDown" });
    expect(disconnectItem).toHaveFocus();
    fireEvent.keyDown(disconnectItem, { key: "ArrowUp" });
    expect(preferencesItem).toHaveFocus();
    fireEvent.keyDown(preferencesItem, { key: "Home" });
    expect(disconnectItem).toHaveFocus();
    fireEvent.keyDown(disconnectItem, { key: "End" });
    expect(preferencesItem).toHaveFocus();
    fireEvent.keyDown(preferencesItem, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "File" })).not.toBeInTheDocument();
    expect(fileButton).toHaveFocus();

    fireEvent.click(fileButton);
    expect(screen.getByRole("menu", { name: "File" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "File" })).not.toBeInTheDocument();
  });

  it("opens original-style Connect dialog when TRex RPC is disconnected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithTrexDisconnected })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({ ok: true, json: async () => overviewWithTrexDisconnected });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("rpc down")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const fileMenu = screen.getByRole("menu", { name: "File" });
    fireEvent.click(within(fileMenu).getByRole("menuitem", { name: "Connect" }));

    const connectDialog = screen.getByRole("dialog", { name: "Connect" });
    expect(connectDialog).toBeInTheDocument();
    expect(connectDialog).toHaveClass("floating-window--connect");
    expect(within(connectDialog).getByLabelText("TRex host")).toHaveValue("10.0.0.10");
    expect(within(connectDialog).getByRole("status")).toHaveTextContent("rpc down");

    fireEvent.click(within(connectDialog).getByText("Show advanced options..."));
    expect(within(connectDialog).getByLabelText("Sync Port")).toHaveValue("4501");
    expect(within(connectDialog).getByLabelText("Async Port")).toHaveValue("4500");
    expect(within(connectDialog).getByLabelText("Scapy Port")).toHaveValue("4507");
    expect(within(connectDialog).getByLabelText("Timeout (seconds)")).toHaveValue("3");
    expect(within(connectDialog).getByLabelText("Name")).toHaveValue("Client1");
    expect(within(connectDialog).getByRole("radio", { name: "Full Control" })).toBeChecked();
    expect(within(connectDialog).getByRole("radio", { name: "Read Only" })).toBeDisabled();

    fireEvent.change(within(connectDialog).getByLabelText("TRex host"), { target: { value: "trex.lab" } });
    fireEvent.change(within(connectDialog).getByLabelText("Sync Port"), { target: { value: "4511" } });
    fireEvent.change(within(connectDialog).getByLabelText("Async Port"), { target: { value: "4510" } });
    fireEvent.change(within(connectDialog).getByLabelText("Scapy Port"), { target: { value: "4517" } });
    fireEvent.change(within(connectDialog).getByLabelText("Timeout (seconds)"), { target: { value: "9" } });
    fireEvent.change(within(connectDialog).getByLabelText("Name"), { target: { value: "RuntimeClient" } });
    const connectForm = within(connectDialog).getByRole("form", { name: "Connect" });
    expect(within(connectDialog).getByRole("button", { name: "Connect" })).toHaveAttribute("type", "submit");
    fireEvent.submit(connectForm);
    fireEvent.submit(connectForm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/connect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          host: "trex.lab",
          sync_port: 4511,
          async_port: 4510,
          scapy_port: 4517,
          client_name: "RuntimeClient",
          timeout_seconds: 9
        })
      })
    );
    expect(screen.getByRole("dialog", { name: "Connect" })).toBeInTheDocument();

    fireEvent.click(within(connectDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("disconnects the backend TRex RPC session from the toolbar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            disconnected: true,
            client_cached: false,
            stats_sampler_closed: false
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Disconnect from TRex server" }));

    await waitFor(() => expect(screen.getByText("Disconnected from TRex server")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/trex/disconnect", {
      method: "POST"
    });
    expect(screen.getByRole("button", { name: "Connect to TRex server" })).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("keeps the live control state when backend disconnect cleanup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          data: {
            disconnected: false,
            client_cached: true,
            phase: "capture_remove",
            remaining_capture_ids: [7]
          },
          blocker: "trex_disconnect_cleanup_failed",
          error: "remove failed"
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Disconnect from TRex server" }));

    await waitFor(() => expect(screen.getByText("trex_disconnect_cleanup_failed remove failed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Disconnect from TRex server" })).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Disconnected from TRex server")).not.toBeInTheDocument();
  });
});
