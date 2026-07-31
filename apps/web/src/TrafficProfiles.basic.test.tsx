import {
  App,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openProfiles,
  openProfilesForBuilder,
  overview,
  profileCatalog,
  profileCatalogWithNested,
  readAdvancedVmBody,
  render,
  screen,
  stubFetch,
  switchPacketPreviewToFieldEngine,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Builder Basics", () => {
  installAppTestHooks();

  it("keeps nested profile paths selectable from the original profile list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithNested })
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
    const dialog = screen.getByRole("dialog", { name: "Traffic Profiles" });
    expect(within(dialog).getByRole("region", { name: "Traffic Profiles workspace" })).toBeInTheDocument();
    expect(within(dialog).getByText("hlt")).toBeInTheDocument();
    expect(within(dialog).getByText("hlt_4vlans.py")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("option", { name: "hlt/hlt_4vlans.py" }));
    fireEvent.click(within(dialog).getByTitle("Start selected profile"));

    await waitFor(() => expect(screen.getByText("Traffic start accepted ports 0 (1)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          profile_path: "hlt/hlt_4vlans.py",
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

  it("supports roving keyboard navigation and skips disabled editor tabs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    const tabList = screen.getByRole("tablist", { name: "Stream editor tabs" });
    const propertiesTab = within(tabList).getByRole("tab", { name: "Stream Properties" });
    const protocolSelectionTab = within(tabList).getByRole("tab", { name: "Protocol Selection" });
    const protocolDataTab = within(tabList).getByRole("tab", { name: "Protocol Data" });

    propertiesTab.focus();
    fireEvent.keyDown(propertiesTab, { key: "ArrowRight" });
    expect(protocolSelectionTab).toHaveFocus();
    expect(protocolSelectionTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(protocolSelectionTab, { key: "ArrowRight" });
    expect(protocolDataTab).toHaveFocus();
    fireEvent.keyDown(protocolDataTab, { key: "Home" });
    expect(propertiesTab).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "" } });
    const packetViewerTab = within(tabList).getByRole("tab", { name: "Packet viewer" });
    expect(packetViewerTab).toBeDisabled();
    fireEvent.keyDown(propertiesTab, { key: "ArrowLeft" });
    const advancedSettingsTab = within(tabList).getByRole("tab", { name: "Advanced Settings" });
    expect(advancedSettingsTab).toHaveFocus();
    expect(advancedSettingsTab).toHaveAttribute("aria-selected", "true");

    const selectedTabs = within(tabList)
      .getAllByRole("tab")
      .filter((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selectedTabs).toHaveLength(1);
    expect(selectedTabs[0]).not.toBeDisabled();
    expect(selectedTabs[0]).toHaveAttribute("tabindex", "0");
  });

  it("selects profile streams through a native keyboard-focusable radio group", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Build Stream" }));

    const streamTable = screen.getByRole("table", { name: "Profile streams" });
    const streamOne = within(streamTable).getByRole("radio", { name: "Select stream 1: stream-1" });
    const streamTwo = within(streamTable).getByRole("radio", { name: "Select stream 2: stream-2" });

    expect(streamTwo).toBeChecked();
    streamOne.focus();
    expect(streamOne).toHaveFocus();
    fireEvent.click(streamOne);

    expect(streamOne).toBeChecked();
    expect(streamOne.closest("tr")).toHaveClass("stream-row--selected");
    expect(streamTwo.closest("tr")).not.toHaveClass("stream-row--selected");
  });

  it("shows the original Stream Properties IPG value derived from pps rate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();

    expect(screen.getByLabelText("IPG")).toHaveValue("0.001");
    fireEvent.change(screen.getByLabelText("Stream rate value"), { target: { value: "250" } });
    expect(screen.getByLabelText("IPG")).toHaveValue("0.004");
    fireEvent.change(screen.getByLabelText("Stream rate type"), { target: { value: "percentage" } });
    expect(screen.queryByLabelText("IPG")).not.toBeInTheDocument();
  });

  it("mirrors original Stream Properties mode field enablement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();

    expect(screen.getByLabelText("Continuous")).toBeChecked();
    expect(screen.getByLabelText("Number of Packets")).toBeDisabled();
    expect(screen.getByLabelText("Number of Burst")).toBeDisabled();
    expect(screen.getByLabelText("Packets per Burst")).toBeDisabled();
    expect(screen.getByLabelText("Goto Stream")).toBeDisabled();
    expect(screen.getByLabelText("IBG")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Burst"));
    expect(screen.getByLabelText("Number of Packets")).not.toBeDisabled();
    expect(screen.getByLabelText("Number of Burst")).toBeDisabled();
    expect(screen.getByLabelText("Number of Burst")).toHaveValue(1);
    expect(screen.getByLabelText("Packets per Burst")).toBeDisabled();
    expect(screen.getByLabelText("Goto Stream")).not.toBeDisabled();
    expect(screen.getByLabelText("IBG")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Multi-Burst"));
    expect(screen.getByLabelText("Number of Packets")).toBeDisabled();
    expect(screen.getByLabelText("Number of Burst")).not.toBeDisabled();
    expect(screen.getByLabelText("Number of Burst")).toHaveValue(2);
    expect(screen.getByLabelText("Packets per Burst")).not.toBeDisabled();
    expect(screen.getByLabelText("Goto Stream")).not.toBeDisabled();
    expect(screen.getByLabelText("IBG")).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText("Continuous"));
    expect(screen.getByLabelText("Stop")).toBeChecked();
    expect(screen.getByLabelText("Goto Stream")).toBeDisabled();
    expect(screen.getByLabelText("IBG")).toBeDisabled();
  });

  it("mirrors original Protocol Selection frame length controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    expect(screen.getByLabelText("Frame length type")).toHaveValue("Fixed");
    expect(screen.getByLabelText("Frame length")).not.toBeDisabled();
    expect(screen.getByLabelText("Minimum frame length")).toBeDisabled();
    expect(screen.getByLabelText("Maximum frame length")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Frame length type"), { target: { value: "Random" } });
    expect(screen.getByLabelText("Frame length")).toBeDisabled();
    expect(screen.getByLabelText("Minimum frame length")).not.toBeDisabled();
    expect(screen.getByLabelText("Maximum frame length")).not.toBeDisabled();
    expect(screen.getByLabelText("Maximum frame length")).toHaveValue(1518);

    fireEvent.change(screen.getByLabelText("Minimum frame length"), { target: { value: "128" } });
    fireEvent.change(screen.getByLabelText("Maximum frame length"), { target: { value: "512" } });
    expect(screen.getByLabelText("Frame length")).toHaveValue(512);

    fireEvent.click(screen.getByLabelText("IPv6"));
    expect(screen.getByLabelText("Frame length type")).toHaveValue("Random");
    expect(screen.getByLabelText("Frame length type")).not.toBeDisabled();
    expect(screen.getByLabelText("Minimum frame length")).not.toBeDisabled();
    expect(screen.getByLabelText("Maximum frame length")).not.toBeDisabled();
  });

  it("exposes packet length Field Engine target with backend-aligned length writes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [workbenchStream({ frame_length_type: "Increment", frame_length_min: 128, frame_length_max: 512 })],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 128,
                wire_length: 128,
                binary_base64: "AAAA",
                hex: "ff ff",
                hex_lines: [{ offset: "0000", hex: "ff ff", ascii: ".." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { source: "16.0.0.1", destination: "48.0.0.1" } },
                  { name: "UDP", fields: { source: 1025, destination: 12 } }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.change(screen.getByLabelText("Frame length type"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Minimum frame length"), { target: { value: "128" } });
    fireEvent.change(screen.getByLabelText("Maximum frame length"), { target: { value: "512" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText("ff ff");
    await switchPacketPreviewToFieldEngine();

    const targetMap = screen.getByLabelText("Field Engine target map");
    const packetLengthTarget = within(targetMap).getByRole("button", { name: "Use Packet length Field Engine target" });
    expect(packetLengthTarget).not.toBeDisabled();
    fireEvent.click(packetLengthTarget);
    const packetLengthVmBody = readAdvancedVmBody();

    expect(packetLengthVmBody.split_by_var).toBe("pkt_len");
    expect(packetLengthVmBody.instructions).toEqual([
      {
        init_value: 124,
        max_value: 508,
        min_value: 124,
        name: "pkt_len",
        op: "inc",
        size: 2,
        step: 1,
        type: "flow_var"
      },
      { name: "pkt_len", type: "trim_pkt_size" },
      {
        add_value: -14,
        is_big_endian: true,
        name: "pkt_len",
        pkt_offset: 16,
        type: "write_flow_var"
      },
      {
        add_value: -34,
        is_big_endian: true,
        name: "pkt_len",
        pkt_offset: 38,
        type: "write_flow_var"
      },
      {
        l2_len: 14,
        l3_len: 20,
        l4_type: 11,
        type: "fix_checksum_hw"
      }
    ]);
  });

  it("blocks packet length Field Engine target on protocols without safe length checksum repair", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/SCTP",
                frame_length: 96,
                wire_length: 96,
                binary_base64: "AAAA",
                hex: "ff ff",
                hex_lines: [{ offset: "0000", hex: "ff ff", ascii: ".." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { source: "10.10.10.1", destination: "10.10.10.2", protocol: "SCTP" } },
                  { name: "SCTP", fields: { source_port: 1025, destination_port: 1026 } }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.change(screen.getByLabelText("Frame length type"), { target: { value: "Random" } });
    expect(screen.getByLabelText("Frame length type")).toHaveValue("Random");

    fireEvent.click(screen.getByLabelText("SCTP"));

    expect(screen.getByLabelText("Frame length type")).toHaveValue("Fixed");
    expect(screen.getByLabelText("Frame length type")).toBeDisabled();
    expect(screen.getByLabelText("Frame length")).not.toBeDisabled();
    expect(screen.getByLabelText("Minimum frame length")).toBeDisabled();
    expect(screen.getByLabelText("Maximum frame length")).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText("ff ff");
    await switchPacketPreviewToFieldEngine();

    const targetMap = screen.getByLabelText("Field Engine target map");
    const packetLengthTarget = within(targetMap).getByRole("button", { name: "Use Packet length Field Engine target" });
    expect(packetLengthTarget).toBeDisabled();
    expect(within(targetMap).getByText("Frame length mode Increment, Decrement, or Random")).toBeInTheDocument();
  });

  it("mirrors original Protocol Selection L3 and L4 None controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [workbenchStream()],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet",
                frame_length: 64,
                wire_length: 64,
                binary_base64: "AAAA",
                hex: "ff ff",
                hex_lines: [{ offset: "0000", hex: "ff ff", ascii: ".." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0xffff" } },
                  { name: "Payload", fields: { bytes: 46, enabled: true, type: "Fixed Word", pattern: "00" } }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l3Group = screen.getByRole("group", { name: "L3" });
    const l4Group = screen.getByRole("group", { name: "L4" });
    fireEvent.click(within(l3Group).getByLabelText("None"));

    expect(within(l3Group).getByLabelText("None")).toBeChecked();
    expect(within(l4Group).getByLabelText("None")).toBeChecked();
    expect(within(l4Group).getByLabelText("TCP")).toBeDisabled();
    expect(within(l4Group).getByLabelText("UDP")).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    expect(screen.getByText("Media Access Protocol")).toBeInTheDocument();
    expect(screen.getAllByText("Ethernet").length).toBeGreaterThan(0);
    expect(screen.queryByText("Internet Protocol v4")).not.toBeInTheDocument();
    expect(screen.queryByText("Internet Protocol v6")).not.toBeInTheDocument();
    expect(screen.queryByText("Transmission Control Protocol")).not.toBeInTheDocument();
    expect(screen.queryByText("User Datagram Protocol")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IPv4 source")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("IPv6 source")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("L4 source port")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet"')
        })
      )
    );
    expect(screen.getAllByText("Payload").length).toBeGreaterThan(0);
  });

  it("renders IPv4 ICMP Echo controls in the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/ICMP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [],
                layers: [
                  { name: "ICMP", fields: { type: 8, code: 0, identifier: 4660, sequence: 7, checksum: "auto" } }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l4Group = screen.getByRole("group", { name: "L4" });
    fireEvent.click(within(l4Group).getByLabelText("ICMP"));

    expect(within(l4Group).getByLabelText("ICMP")).toBeChecked();
    expect(screen.getByLabelText("Frame length type")).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByText("Internet Control Message Protocol")).toBeInTheDocument();
    expect(screen.getByLabelText("ICMP type")).toHaveValue(8);
    expect(screen.getByLabelText("ICMP code")).toHaveValue(0);
    expect(screen.queryByLabelText("L4 source port")).not.toBeInTheDocument();
    expect(screen.getByLabelText("ICMP identifier mode")).toBeDisabled();
    expect(screen.getByLabelText("ICMP sequence mode")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("ICMP identifier"), { target: { value: "4660" } });
    fireEvent.change(screen.getByLabelText("ICMP sequence"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv4/ICMP"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_identifier":4660')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_sequence":7')
      })
    );

    await switchPacketPreviewToFieldEngine();
    const icmpTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(icmpTargetMap).queryByText("ICMP identifier inc")).not.toBeInTheDocument();
    expect(within(icmpTargetMap).queryByText("ICMP sequence inc")).not.toBeInTheDocument();
  }, 60_000);

  it("renders IPv6 ICMPv6 Echo controls in the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 64,
                wire_length: 64,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [],
                layers: [
                  { name: "ICMPv6", fields: { type: 128, code: 0, identifier: 4660, sequence: 7, checksum: "auto" } }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l3Group = screen.getByRole("group", { name: "L3" });
    fireEvent.click(within(l3Group).getByLabelText("IPv6"));
    const l4Group = screen.getByRole("group", { name: "L4" });
    fireEvent.click(within(l4Group).getByLabelText("ICMP"));

    expect(within(l3Group).getByLabelText("IPv6")).toBeChecked();
    expect(within(l4Group).getByLabelText("ICMP")).toBeChecked();
    expect(screen.getByLabelText("Frame length type")).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByText("Internet Control Message Protocol v6")).toBeInTheDocument();
    expect(screen.getByLabelText("ICMP type")).toHaveValue(128);
    expect(screen.getByLabelText("ICMP code")).toHaveValue(0);
    expect(screen.queryByLabelText("L4 source port")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("ICMP type mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ICMP type count"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("ICMP code mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ICMP code count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("ICMP identifier"), { target: { value: "4660" } });
    fireEvent.change(screen.getByLabelText("ICMP identifier mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ICMP identifier count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("ICMP sequence"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("ICMP sequence mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ICMP sequence count"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv6/ICMPv6"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_type":128')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_sequence":7')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_type_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_code_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_identifier_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmp_sequence_mode":"Increment"')
      })
    );

    await switchPacketPreviewToFieldEngine();
    const icmpv6TargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(icmpv6TargetMap).getByText("ICMPv6 type inc")).toBeInTheDocument();
    expect(within(icmpv6TargetMap).getByText("ICMPv6 code inc")).toBeInTheDocument();
    expect(within(icmpv6TargetMap).getByText("ICMPv6 identifier inc")).toBeInTheDocument();
    expect(within(icmpv6TargetMap).getByText("ICMPv6 sequence inc")).toBeInTheDocument();

    fireEvent.click(within(icmpv6TargetMap).getByRole("button", { name: "Use ICMPv6 type inc Field Engine target" }));
    const icmpv6TypeVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(icmpv6TypeVmJson).toContain('"name": "icmp_type"');
    expect(icmpv6TypeVmJson).toContain('"init_value": 128');
    expect(icmpv6TypeVmJson).toContain('"max_value": 129');
    expect(icmpv6TypeVmJson).toContain('"size": 1');
    expect(icmpv6TypeVmJson).toContain('"pkt_offset": 54');
    expect(icmpv6TypeVmJson).toContain('"type": "fix_checksum_icmpv6"');

    fireEvent.click(within(icmpv6TargetMap).getByRole("button", { name: "Use ICMPv6 code inc Field Engine target" }));
    const icmpv6CodeVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(icmpv6CodeVmJson).toContain('"name": "icmp_code"');
    expect(icmpv6CodeVmJson).toContain('"init_value": 0');
    expect(icmpv6CodeVmJson).toContain('"max_value": 3');
    expect(icmpv6CodeVmJson).toContain('"size": 1');
    expect(icmpv6CodeVmJson).toContain('"pkt_offset": 55');
    expect(icmpv6CodeVmJson).toContain('"type": "fix_checksum_icmpv6"');

    fireEvent.click(within(icmpv6TargetMap).getByRole("button", { name: "Use ICMPv6 identifier inc Field Engine target" }));
    const icmpv6IdentifierVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(icmpv6IdentifierVmJson).toContain('"name": "icmp_identifier"');
    expect(icmpv6IdentifierVmJson).toContain('"init_value": 4660');
    expect(icmpv6IdentifierVmJson).toContain('"max_value": 4663');
    expect(icmpv6IdentifierVmJson).toContain('"pkt_offset": 58');
    expect(icmpv6IdentifierVmJson).toContain('"l2_len": 14');
    expect(icmpv6IdentifierVmJson).toContain('"l3_len": 40');
    expect(icmpv6IdentifierVmJson).toContain('"type": "fix_checksum_icmpv6"');

    fireEvent.click(within(icmpv6TargetMap).getByRole("button", { name: "Use ICMPv6 sequence inc Field Engine target" }));
    const icmpv6SequenceVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(icmpv6SequenceVmJson).toContain('"name": "icmp_sequence"');
    expect(icmpv6SequenceVmJson).toContain('"init_value": 7');
    expect(icmpv6SequenceVmJson).toContain('"max_value": 10');
    expect(icmpv6SequenceVmJson).toContain('"pkt_offset": 60');
    expect(icmpv6SequenceVmJson).toContain('"type": "fix_checksum_icmpv6"');
  }, 45_000);

  it("renders IPv6 Neighbor Discovery controls in the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 90,
                wire_length: 90,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [],
                layers: [
                  {
                    name: "ICMPv6",
                    fields: {
                      type: 135,
                      code: 0,
                      message: "Neighbor Solicitation",
                      target: "2001:db8::99",
                      option_mac: "00:11:22:33:44:55",
                      checksum: "auto"
                    }
                  }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l3Group = screen.getByRole("group", { name: "L3" });
    fireEvent.click(within(l3Group).getByLabelText("IPv6"));
    const l4Group = screen.getByRole("group", { name: "L4" });
    fireEvent.click(within(l4Group).getByLabelText("ICMP"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    fireEvent.change(screen.getByLabelText("ICMP type"), { target: { value: "135" } });

    expect(screen.getByLabelText("ICMP code")).toHaveValue(0);
    expect(screen.getByLabelText("ICMPv6 ND target")).toBeInTheDocument();
    expect(screen.getByLabelText("Include ICMPv6 ND option")).toBeChecked();

    fireEvent.change(screen.getByLabelText("ICMPv6 ND target"), { target: { value: "2001:db8::99" } });
    fireEvent.change(screen.getByLabelText("ICMPv6 ND option MAC"), { target: { value: "00:11:22:33:44:55" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"icmp_type":135')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmpv6_nd_target":"2001:db8::99"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmpv6_nd_option_mac":"00:11:22:33:44:55"')
      })
    );
  });

  it("renders IPv6 Router Advertisement controls in the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv6/ICMPv6",
                frame_length: 114,
                wire_length: 114,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [],
                layers: [
                  {
                    name: "ICMPv6",
                    fields: {
                      type: 134,
                      code: 0,
                      message: "Router Advertisement",
                      current_hop_limit: 42,
                      prefix: "2001:db8:100::",
                      checksum: "auto"
                    }
                  }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l3Group = screen.getByRole("group", { name: "L3" });
    fireEvent.click(within(l3Group).getByLabelText("IPv6"));
    const l4Group = screen.getByRole("group", { name: "L4" });
    fireEvent.click(within(l4Group).getByLabelText("ICMP"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    fireEvent.change(screen.getByLabelText("ICMP type"), { target: { value: "134" } });

    expect(screen.getByLabelText("ICMP code")).toHaveValue(0);
    expect(screen.queryByLabelText("ICMP identifier")).not.toBeInTheDocument();
    expect(screen.getByLabelText("ICMPv6 RA current hop limit")).toBeInTheDocument();
    expect(screen.getByLabelText("Include ICMPv6 RA prefix information")).toBeChecked();

    fireEvent.change(screen.getByLabelText("ICMPv6 RA current hop limit"), { target: { value: "42" } });
    fireEvent.click(screen.getByLabelText("ICMPv6 RA managed flag"));
    fireEvent.change(screen.getByLabelText("ICMPv6 RA source link-layer MAC"), { target: { value: "66:55:44:33:22:11" } });
    fireEvent.change(screen.getByLabelText("ICMPv6 RA prefix"), { target: { value: "2001:db8:100::" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"icmp_type":134')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmpv6_ra_prefix":"2001:db8:100::"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"icmpv6_ra_slla_mac":"66:55:44:33:22:11"')
      })
    );
  });

  it("renders Ethernet ARP controls in the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/ARP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [],
                layers: [
                  {
                    name: "Address Resolution Protocol",
                    fields: {
                      operation: 1,
                      sender_mac: "00:11:22:33:44:55",
                      sender_ip: "10.0.0.1",
                      target_ip: "10.0.0.2"
                    }
                  }
                ]
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
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));

    const l3Group = screen.getByRole("group", { name: "L3" });
    fireEvent.click(within(l3Group).getByLabelText("ARP"));

    expect(within(l3Group).getByLabelText("ARP")).toBeChecked();

    const l4Group = screen.getByRole("group", { name: "L4" });
    expect(within(l4Group).getByLabelText("TCP")).toBeDisabled();
    expect(within(l4Group).getByLabelText("UDP")).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByText("Address Resolution Protocol")).toBeInTheDocument();
    expect(screen.getByLabelText("ARP operation")).toHaveValue(1);
    expect(screen.getByLabelText("ARP operation mode")).toHaveValue("Fixed");
    expect(screen.queryByLabelText("L4 source port")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("ARP operation mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ARP operation count"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("ARP operation step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("ARP sender MAC"), { target: { value: "00:11:22:33:44:55" } });
    fireEvent.change(screen.getByLabelText("ARP sender MAC mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("ARP sender MAC count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("ARP sender MAC step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("ARP sender IP"), { target: { value: "10.0.0.1" } });
    fireEvent.change(screen.getByLabelText("ARP sender IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("ARP sender IP count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("ARP sender IP step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("ARP target MAC mode"), { target: { value: "Random" } });
    fireEvent.change(screen.getByLabelText("ARP target MAC count"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("ARP target IP"), { target: { value: "10.0.0.2" } });
    fireEvent.change(screen.getByLabelText("ARP target IP mode"), { target: { value: "Random Host" } });
    fireEvent.change(screen.getByLabelText("ARP target IP count"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/ARP"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_sender_ip":"10.0.0.1"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_operation_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_operation_count":2')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_sender_mac_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_sender_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_target_ip":"10.0.0.2"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_target_mac_mode":"Random"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"arp_target_ip_mode":"Random Host"')
      })
    );

    await switchPacketPreviewToFieldEngine();
    const arpTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(arpTargetMap).getByText("ARP operation inc")).toBeInTheDocument();
    expect(within(arpTargetMap).getByText("ARP sender IP inc")).toBeInTheDocument();
    expect(within(arpTargetMap).getByText("ARP target MAC inc")).toBeInTheDocument();

    fireEvent.click(within(arpTargetMap).getByRole("button", { name: "Use ARP operation inc Field Engine target" }));
    const arpOperationVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(arpOperationVmJson).toContain('"name": "arp_operation"');
    expect(arpOperationVmJson).toContain('"init_value": 1');
    expect(arpOperationVmJson).toContain('"max_value": 2');
    expect(arpOperationVmJson).toContain('"pkt_offset": 20');
    expect(arpOperationVmJson).not.toContain("fix_checksum");

    fireEvent.click(within(arpTargetMap).getByRole("button", { name: "Use ARP sender IP inc Field Engine target" }));
    const arpSenderIpVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(arpSenderIpVmJson).toContain('"name": "arp_sender_ip"');
    expect(arpSenderIpVmJson).toContain('"init_value": 1');
    expect(arpSenderIpVmJson).toContain('"max_value": 4');
    expect(arpSenderIpVmJson).toContain('"size": 1');
    expect(arpSenderIpVmJson).toContain('"pkt_offset": 31');
    expect(arpSenderIpVmJson).not.toContain("fix_checksum");

    fireEvent.click(within(arpTargetMap).getByRole("button", { name: "Use ARP target IP inc Field Engine target" }));
    const arpTargetIpVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(arpTargetIpVmJson).toContain('"name": "arp_target_ip"');
    expect(arpTargetIpVmJson).toContain('"init_value": 2');
    expect(arpTargetIpVmJson).toContain('"max_value": 9');
    expect(arpTargetIpVmJson).toContain('"pkt_offset": 41');

    fireEvent.click(within(arpTargetMap).getByRole("button", { name: "Use ARP sender MAC inc Field Engine target" }));
    const arpSenderMacVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(arpSenderMacVmJson).toContain('"name": "arp_sender_mac"');
    expect(arpSenderMacVmJson).toContain('"init_value": 85');
    expect(arpSenderMacVmJson).toContain('"max_value": 88');
    expect(arpSenderMacVmJson).toContain('"pkt_offset": 27');

    fireEvent.click(within(arpTargetMap).getByRole("button", { name: "Use ARP target MAC inc Field Engine target" }));
    const arpTargetMacVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(arpTargetMacVmJson).toContain('"name": "arp_target_mac"');
    expect(arpTargetMacVmJson).toContain('"init_value": 0');
    expect(arpTargetMacVmJson).toContain('"max_value": 7');
    expect(arpTargetMacVmJson).toContain('"pkt_offset": 37');
  }, 45_000);

  it("mirrors original IPv4 Field Engine controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { content: "---\n[]\n", streams: [], packet_previews: [] },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByLabelText("IPv4 destination mode")).toHaveValue("Fixed");
    expect(screen.getByLabelText("IPv4 destination count")).toBeDisabled();
    expect(screen.getByLabelText("IPv4 destination step")).toBeDisabled();
    expect(screen.getByLabelText("IPv4 source count")).toBeDisabled();
    expect(screen.getByLabelText("IPv4 source step")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("IPv4 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("IPv4 destination count"), { target: { value: "1.5 K" } });
    fireEvent.change(screen.getByLabelText("IPv4 destination step"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("IPv4 source mode"), { target: { value: "Random Host" } });
    fireEvent.change(screen.getByLabelText("IPv4 source count"), { target: { value: "2K" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ipv4_dst_mode":"Increment Host"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_src_mode":"Random Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dst_count":"1.5 K"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_src_count":"2K"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dst_step":2')
      })
    );

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("IPv4 destination count"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    expect(screen.getByText("Stream 1: IPv4 destination count must be an integer or K/M/G count between 2 and 100000000.")).toBeInTheDocument();
  });

  it("mirrors original IPv6 Field Engine controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { content: "---\n[]\n", streams: [], packet_previews: [] },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("IPv6"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByLabelText("IPv6 destination mode")).toHaveValue("Fixed");
    expect(screen.getByLabelText("IPv6 destination count")).toBeDisabled();
    expect(screen.getByLabelText("IPv6 destination step")).toBeDisabled();
    expect(screen.getByLabelText("IPv6 source count")).toBeDisabled();
    expect(screen.getByLabelText("IPv6 source step")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("IPv6 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("IPv6 destination count"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("IPv6 destination step"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("IPv6 source mode"), { target: { value: "Random Host" } });
    fireEvent.change(screen.getByLabelText("IPv6 source count"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ipv6_dst_mode":"Increment Host"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_src_mode":"Random Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_dst_step":2')
      })
    );
  });

  it("mirrors original MAC Field Engine controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { content: "---\n[]\n", streams: [], packet_previews: [] },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    expect(screen.getByLabelText("Ethernet destination mode")).toHaveValue("TRex Config");
    expect(screen.getByLabelText("Ethernet destination count")).toBeDisabled();
    expect(screen.getByLabelText("Ethernet destination step")).toBeDisabled();
    expect(screen.getByLabelText("Ethernet source count")).toBeDisabled();
    expect(screen.getByLabelText("Ethernet source step")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Ethernet destination mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination count"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination step"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Ethernet source mode"), { target: { value: "Decrement" } });
    fireEvent.change(screen.getByLabelText("Ethernet source count"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ether_dst_mode":"Increment"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ether_src_mode":"Decrement"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ether_dst_step":2')
      })
    );
  });

  it("mirrors original Ethernet Type override control", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { content: "---\n[]\n", streams: [], packet_previews: [] },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));

    const ethernetType = screen.getByRole("checkbox", { name: "Ethernet Type" });
    const ethernetTypeValue = screen.getByLabelText("Ethernet Type value");
    expect(ethernetType).not.toBeChecked();
    expect(ethernetTypeValue).toBeDisabled();
    expect(ethernetTypeValue).toHaveValue("0800");

    fireEvent.click(ethernetType);
    expect(ethernetTypeValue).not.toBeDisabled();
    fireEvent.change(ethernetTypeValue, { target: { value: "88b5" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ether_type_override":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ether_type":"88b5"')
      })
    );
  });
});
