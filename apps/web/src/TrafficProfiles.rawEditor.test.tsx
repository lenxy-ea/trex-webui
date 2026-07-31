import {
  App,
  describe,
  expect,
  expectRawIpv4ChecksumValid,
  fireEvent,
  installAppTestHooks,
  it,
  openProfilesForBuilder,
  openRawStreamFieldEngine,
  overview,
  packetBytesFromRawHex,
  profileCatalog,
  readAdvancedVmBody,
  render,
  screen,
  selectRawPacketFieldEngineTarget,
  stubFetch,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Raw Editor", () => {
  installAppTestHooks();

  it("shows original advanced GUI streams as read-only preserved streams", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RV//8AAQIDBAUGBwgJ";
    const packetModel = "{\"protocols\":[],\"field_engine\":{\"instructions\":[]}}";
    const advancedVm = {
      cache_size: 128,
      split_by_var: "mac_src",
      instructions: [{ type: "flow_var", name: "mac_src" }]
    };
    const advancedStream = workbenchStream({
      name: "advanced-stream",
      packet_type: "Ethernet",
      rate_value: 42,
      pg_id: 7,
      packet_binary_base64: packetBinary,
      advanced_mode: true,
      packet_model: packetModel,
      packet_meta_base64: "bWV0YQ==",
      advanced_vm: advancedVm
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            profile: profileCatalog.data.profiles[1],
            content: "---\n[]\n",
            streams: [advancedStream],
            stream_summaries: [
              {
                index: 1,
                name: "advanced-stream",
                packet_type: "Ethernet",
                length: 64,
                mode: "continuous",
                rate: "42 pps",
                next_stream: "-"
              }
            ],
            packet_previews: []
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
            content: "---\n[]\n",
            streams: [],
            packet_previews: [
              {
                index: 1,
                name: "advanced-stream",
                packet_type: "Ethernet",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: "aabbccddeeff001122334455ffff",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff", ascii: "......" }],
                layers: [{ name: "Ethernet", fields: { type: "0xffff" } }]
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench?profile_path=http_simple.yaml"
      )
    );
    expect(screen.getByText("Advanced/Scapy stream")).toBeInTheDocument();
    expect(screen.getByText("Packet Editor / Field Engine editable")).toBeInTheDocument();
    expect(screen.getAllByText("advanced").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "Protocol Selection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Protocol Data" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Advanced Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Packet Editor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Field Engine" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Stream rate value")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export To Yaml" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"advanced_mode":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining(`"packet_model":${JSON.stringify(packetModel)}`)
      })
    );
    expect(screen.getByRole("region", { name: "Packet Editor" })).toBeInTheDocument();
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("aa bb cc dd ee ff");

    fireEvent.click(screen.getByRole("button", { name: "Structured" }));
    expect(screen.getByRole("tab", { name: "Protocol Selection" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    expect(screen.getByLabelText("Frame length type")).not.toBeDisabled();
  });

  it("applies Packet Editor raw hex as an advanced stream", async () => {
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: "qrvM3e7/ABEiM0RV//8=",
                hex: "aabbccddeeff001122334455ffff",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 ff ff", ascii: "........3DU..." }],
                layers: [{ name: "Ethernet", fields: { type: "0xffff" } }]
              }
            ]
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
            file_name: "profile.yaml",
            content: "streams: []",
            bytes: 11,
            streams: [],
            packet_previews: []
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText("aa bb cc dd ee ff 00 11 22 33 44 55 ff ff");
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const rawPacketHex = await screen.findByLabelText("Raw packet hex");
    expect(rawPacketHex).toHaveValue("aa bb cc dd ee ff 00 11 22 33 44 55 ff ff");

    fireEvent.change(rawPacketHex, { target: { value: "aa zz" } });
    expect(screen.getAllByText("Raw packet hex must contain only hex bytes.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Apply raw" })).toBeDisabled();

    fireEvent.change(rawPacketHex, { target: { value: "aa bb cc dd ee ff" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw" }));

    expect(screen.getAllByText("advanced").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "Protocol Selection" })).not.toBeInTheDocument();
    expect(screen.getByText("Raw override active")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export To Yaml" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/export-yaml",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_binary_base64":"qrvM3e7/"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/export-yaml",
      expect.objectContaining({
        body: expect.stringContaining('"advanced_mode":true')
      })
    );
  });

  it("edits Packet Editor decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const fieldEditor = await screen.findByLabelText("Packet field editor");
    expect(within(fieldEditor).getByText("Packet fields")).toBeInTheDocument();
    expect(screen.getByLabelText("Raw field Ethernet Destination")).toHaveValue("aa:bb:cc:dd:ee:ff");
    expect(screen.getByLabelText("Raw field Ethernet Source")).toHaveValue("00:11:22:33:44:55");
    expect(screen.getByLabelText("Raw field Ethernet EtherType")).toHaveValue("0800");
    expect(screen.getByLabelText("Raw field IPv4 Version")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field IPv4 Header length")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field IPv4 Total length")).toHaveValue("46");
    expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.1");
    expect(screen.getByLabelText("Raw field IPv4 Protocol")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv4 Checksum")).toHaveValue("0000");
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("12");

    for (const staticOnlyField of ["Version", "Header length", "Total length", "Protocol", "Checksum"]) {
      expect(screen.queryByRole("button", {
        name: `Use Field Engine target for raw field IPv4 ${staticOnlyField}`
      })).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    fireEvent.click(within(targetMap).getByRole("button", { name: "Use EtherType inc Field Engine target" }));
    const etherTypeVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(etherTypeVmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 2048, max_value: 2063, name: "ether_type", size: 2 }),
      expect.objectContaining({ name: "ether_type", pkt_offset: 12, type: "write_flow_var" })
    ]));
    expect(etherTypeVmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MAC dst inc Field Engine target" }));
    const macDstVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(macDstVmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 61183, max_value: 61198, name: "mac_dest", size: 2 }),
      expect.objectContaining({ name: "mac_dest", pkt_offset: 4, type: "write_flow_var" })
    ]));
    expect(macDstVmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MAC src inc Field Engine target" }));
    const macSrcVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(macSrcVmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 85, max_value: 100, name: "mac_src", size: 1 }),
      expect.objectContaining({ name: "mac_src", pkt_offset: 11, type: "write_flow_var" })
    ]));
    expect(macSrcVmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const rawEthernetDestinationVm = await selectRawPacketFieldEngineTarget("Ethernet Destination", "MAC dst inc");
    expect(rawEthernetDestinationVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 61183, max_value: 61198, min_value: 61183, name: "mac_dest", size: 2 }),
      expect.objectContaining({ name: "mac_dest", pkt_offset: 4, type: "write_flow_var" })
    ]));
    expect(rawEthernetDestinationVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/checksum/) })
    ]));
    expect(rawEthernetDestinationVm.split_by_var).toBe("mac_dest");

    const rawEthernetSourceVm = await selectRawPacketFieldEngineTarget("Ethernet Source", "MAC src inc");
    expect(rawEthernetSourceVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 85, max_value: 100, min_value: 85, name: "mac_src", size: 1 }),
      expect.objectContaining({ name: "mac_src", pkt_offset: 11, type: "write_flow_var" })
    ]));
    expect(rawEthernetSourceVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/checksum/) })
    ]));
    expect(rawEthernetSourceVm.split_by_var).toBe("mac_src");

    const rawEthernetEtherTypeVm = await selectRawPacketFieldEngineTarget("Ethernet EtherType", "EtherType inc");
    expect(rawEthernetEtherTypeVm).toEqual({
      instructions: [
        { init_value: 2048, max_value: 2063, min_value: 2048, name: "ether_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "ether_type", pkt_offset: 12, type: "write_flow_var" }
      ],
      split_by_var: "ether_type"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    await waitFor(() => expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.1"));

    fireEvent.change(screen.getByLabelText("Raw field IPv4 Source"), { target: { value: "16.0.0.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 Source" }));
    const rawHexAfterIpv4Source = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterIpv4Source).toContain("10 00 00 09");
    expectRawIpv4ChecksumValid(rawHexAfterIpv4Source, 14);
    expect(screen.getByText("IPv4 Source updated at byte 26. Apply raw to save this packet.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Raw field UDP Destination port"), { target: { value: "53" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field UDP Destination port" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("04 01 00 35 00 1a");

    fireEvent.change(screen.getByLabelText("Raw field Ethernet Destination"), { target: { value: "aa:bb:cc:dd:ee:10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field Ethernet Destination" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("aa bb cc dd ee 10");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const draftTargetMap = await screen.findByLabelText("Field Engine target map");
    fireEvent.click(within(draftTargetMap).getByRole("button", { name: "Use MAC dst inc Field Engine target" }));
    const draftMacDstVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(draftMacDstVmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 16, max_value: 31, name: "mac_dest", size: 1 }),
      expect.objectContaining({ name: "mac_dest", pkt_offset: 5, type: "write_flow_var" })
    ]));

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    fireEvent.change(screen.getByLabelText("Raw field Ethernet Destination"), { target: { value: "not-a-mac" } });
    expect(screen.getByRole("button", { name: "Apply raw field Ethernet Destination" })).toBeDisabled();
  }, 40_000);

  it("locates Packet Editor decoded fields in the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const rawPacketHex = await screen.findByLabelText("Raw packet hex") as HTMLTextAreaElement;
    const ipv4SourceField = screen.getByLabelText("Raw field IPv4 Source");
    fireEvent.click(screen.getByRole("button", { name: "Locate raw field IPv4 Source" }));

    await waitFor(() =>
      expect(rawPacketHex.value.slice(rawPacketHex.selectionStart, rawPacketHex.selectionEnd)).toBe("10 00 00 01")
    );
    expect(ipv4SourceField.closest("tr")).toHaveClass("packet-field-row--selected");

    const udpDestinationField = screen.getByLabelText("Raw field UDP Destination port");
    fireEvent.click(screen.getByRole("button", { name: "Locate raw field UDP Destination port" }));
    await waitFor(() =>
      expect(rawPacketHex.value.slice(rawPacketHex.selectionStart, rawPacketHex.selectionEnd)).toBe("00 0c")
    );
    expect(udpDestinationField.closest("tr")).toHaveClass("packet-field-row--selected");
  }, 20_000);

  it("uses a Packet Editor decoded field to seed the matching Field Engine target", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const ipv4SourceRow = (await screen.findByLabelText("Raw field IPv4 Source")).closest("tr");
    expect(ipv4SourceRow).not.toBeNull();
    fireEvent.click(within(ipv4SourceRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field IPv4 Source"
    }));

    const advancedVmJson = await screen.findByLabelText("Advanced VM JSON") as HTMLTextAreaElement;
    const targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 src inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");

    const vmBody = JSON.parse(advancedVmJson.value);
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 1, max_value: 16, name: "ipv4_src", size: 1 }),
      expect.objectContaining({ name: "ipv4_src", pkt_offset: 29, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
  }, 20_000);

  it("uses IPv4 destination, identification, and TTL Packet Editor rows as Field Engine targets", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";

    await openRawStreamFieldEngine(
      packetBytesFromRawHex(packetHex),
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/IPv4/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
        { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field IPv4 Destination")).toHaveValue("48.0.0.1");
    expect(screen.getByLabelText("Raw field IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field IPv4 TTL")).toHaveValue("64");

    let vmBody = await selectRawPacketFieldEngineTarget("IPv4 Destination", "IPv4 dst inc");
    expect(vmBody.split_by_var).toBe("ipv4_dst");
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 1, max_value: 16, name: "ipv4_dst", size: 1, type: "flow_var" }),
      expect.objectContaining({ name: "ipv4_dst", pkt_offset: 33, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));

    vmBody = await selectRawPacketFieldEngineTarget("IPv4 Identification", "IPv4 ID inc");
    expect(vmBody.split_by_var).toBe("ip_id");
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 4660, max_value: 4675, name: "ip_id", size: 2, type: "flow_var" }),
      expect.objectContaining({ name: "ip_id", pkt_offset: 18, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));

    vmBody = await selectRawPacketFieldEngineTarget("IPv4 TTL", "IPv4 TTL inc");
    expect(vmBody.split_by_var).toBe("ip_ttl");
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 64, max_value: 79, name: "ip_ttl", size: 1, type: "flow_var" }),
      expect.objectContaining({ name: "ip_ttl", pkt_offset: 22, type: "write_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
  }, 20_000);

  it("uses UDP Packet Editor rows as Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26, checksum: "0000" } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field UDP Source port")).toHaveValue("1025");
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("12");
    expect(screen.getByLabelText("Raw field UDP Length")).toHaveValue("26");
    expect(screen.getByLabelText("Raw field UDP Checksum")).toHaveValue("0000");

    const useRawUdpFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field UDP ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(`Raw field UDP ${field}`)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return {
        targetMap: await screen.findByLabelText("Field Engine target map"),
        vmBody: JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value) as {
          instructions: Array<Record<string, unknown>>;
          split_by_var?: string;
        }
      };
    };

    let selected = await useRawUdpFieldEngineTarget("Source port");
    expect(within(selected.targetMap).getByRole("button", { name: "Use UDP src port inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(selected.vmBody).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1040, min_value: 1025, name: "udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_src", pkt_offset: 34, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "udp_src"
    });

    selected = await useRawUdpFieldEngineTarget("Destination port");
    expect(within(selected.targetMap).getByRole("button", { name: "Use UDP dst port inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(selected.vmBody).toEqual({
      instructions: [
        { init_value: 12, max_value: 27, min_value: 12, name: "udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_dst", pkt_offset: 36, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "udp_dst"
    });

    selected = await useRawUdpFieldEngineTarget("Length");
    expect(within(selected.targetMap).getByRole("button", { name: "Use UDP length inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(selected.vmBody).toEqual({
      instructions: [
        { init_value: 26, max_value: 41, min_value: 26, name: "udp_length", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_length", pkt_offset: 38, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "udp_length"
    });

    selected = await useRawUdpFieldEngineTarget("Checksum");
    expect(within(selected.targetMap).getByRole("button", { name: "Use UDP checksum inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(selected.vmBody).toEqual({
      instructions: [
        { init_value: 0, max_value: 15, min_value: 0, name: "udp_checksum", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_checksum", pkt_offset: 40, type: "write_flow_var" }
      ],
      split_by_var: "udp_checksum"
    });
  }, 30_000);

  it("uses semantic Field Engine targets for Packet Editor bitfields that share raw offsets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    let vmBody = await selectRawPacketFieldEngineTarget("IPv4 DSCP", "IPv4 DSCP inc");
    expect(vmBody).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "ip_dscp",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xFC,
          name: "ip_dscp",
          pkt_cast_size: 1,
          pkt_offset: 15,
          shift: 2,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_dscp"
    });
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_ecn" })
    ]));

    vmBody = await selectRawPacketFieldEngineTarget("IPv4 ECN", "IPv4 ECN inc");
    expect(vmBody).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ip_ecn",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x03,
          name: "ip_ecn",
          pkt_cast_size: 1,
          pkt_offset: 15,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_ecn"
    });
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_dscp" })
    ]));
  }, 20_000);

  it("uses the IPv4 reserved flag Packet Editor row as a Field Engine target", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";

    await openRawStreamFieldEngine(
      packetBytesFromRawHex(packetHex),
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/IPv4/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
        { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field IPv4 Reserved flag")).toHaveValue("0");

    const vmBody = await selectRawPacketFieldEngineTarget("IPv4 Reserved flag", "IPv4 reserved flag vary");
    expect(vmBody.split_by_var).toBe("ip_reserved");
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 0, name: "ip_reserved", op: "inc", type: "flow_var" }),
      expect.objectContaining({ mask: 0x8000, name: "ip_reserved", pkt_offset: 20, shift: 15, type: "write_mask_flow_var" }),
      expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_fragment_offset" })
    ]));
  }, 20_000);

  it("uses precise Field Engine targets for Packet Editor IPv4 fragment bitfields", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field IPv4 Fragment offset")).toHaveValue("0");
    const fragmentOffsetRow = (screen.getByLabelText("Raw field IPv4 Fragment offset")).closest("tr");
    expect(fragmentOffsetRow).not.toBeNull();
    fireEvent.click(within(fragmentOffsetRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field IPv4 Fragment offset"
    }));

    let targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 fragment offset inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    let vmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ mask: 0x1fff, name: "ip_fragment_offset", pkt_offset: 20, shift: 0, type: "write_mask_flow_var" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_df" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_mf" })
    ]));

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const dontFragmentRow = (await screen.findByLabelText("Raw field IPv4 Don't fragment")).closest("tr");
    expect(dontFragmentRow).not.toBeNull();
    fireEvent.click(within(dontFragmentRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field IPv4 Don't fragment"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 DF flag vary Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    vmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ mask: 0x4000, name: "ip_df", pkt_offset: 20, shift: 14, type: "write_mask_flow_var" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_fragment_offset" })
    ]));

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const moreFragmentsRow = (await screen.findByLabelText("Raw field IPv4 More fragments")).closest("tr");
    expect(moreFragmentsRow).not.toBeNull();
    fireEvent.click(within(moreFragmentsRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field IPv4 More fragments"
    }));

    expect(await screen.findByLabelText("Advanced VM JSON")).toBeInTheDocument();
    expect(within(await screen.findByLabelText("Field Engine target map")).getByRole("button", {
      name: "Use IPv4 MF flag vary Field Engine target"
    }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    vmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(vmBody.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ mask: 0x2000, name: "ip_mf", pkt_offset: 20, shift: 13, type: "write_mask_flow_var" })
    ]));
    expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ip_fragment_offset" })
    ]));
  }, 20_000);

  it("uses precise Field Engine targets for Packet Editor TCP flag bitfields", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAA8EjRAAEAGAAAKCgoBCgoKAgu5AFARIjNEVWZ3iKACBAAAAAAAAgQFtAQCCAoAAeJAAAn78QEDAwc=";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 3c 12 34 40 00 40 06 00 00 0a 0a 0a 01 0a 0a 0a 02 0b b9 00 50 11 22 33 44 55 66 77 88 a0 02 04 00 00 00 00 00 02 04 05 b4 04 02 08 0a 00 01 e2 40 00 09 fb f1 01 03 03 07";
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
                name: "tcp-options-stream",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 74,
                wire_length: 74,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.10.10.1", dst: "10.10.10.2", protocol: 6 } },
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "SYN" } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const rawTcpChecksumRepair = { l2_len: 14, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" };
    const expectTcpFlagRawFieldTarget = async ({
      expectedValue,
      fieldLabel,
      mask,
      op,
      shift,
      targetLabel,
      variableName
    }: {
      expectedValue: string;
      fieldLabel: string;
      mask: number;
      op: "dec" | "inc";
      shift: number;
      targetLabel: string;
      variableName: string;
    }) => {
      fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      expect(await screen.findByLabelText(`Raw field TCP ${fieldLabel} flag`)).toHaveValue(expectedValue);

      const vmBody = await selectRawPacketFieldEngineTarget(`TCP ${fieldLabel} flag`, targetLabel);
      expect(vmBody).toEqual({
        instructions: [
          {
            init_value: expectedValue === "1" ? 1 : 0,
            max_value: 1,
            min_value: 0,
            name: variableName,
            op,
            size: 1,
            step: 1,
            type: "flow_var"
          },
          {
            add_value: 0,
            is_big_endian: true,
            mask,
            name: variableName,
            pkt_cast_size: 1,
            pkt_offset: 47,
            shift,
            type: "write_mask_flow_var"
          },
          rawTcpChecksumRepair
        ],
        split_by_var: variableName
      });
      expect(vmBody.instructions).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "tcp_flags" })
      ]));
    };

    await expectTcpFlagRawFieldTarget({
      expectedValue: "0",
      fieldLabel: "URG",
      mask: 0x20,
      op: "inc",
      shift: 5,
      targetLabel: "TCP URG flag vary",
      variableName: "tcp_flag_urg"
    });
    await expectTcpFlagRawFieldTarget({
      expectedValue: "0",
      fieldLabel: "ACK",
      mask: 0x10,
      op: "inc",
      shift: 4,
      targetLabel: "TCP ACK flag vary",
      variableName: "tcp_flag_ack"
    });
    await expectTcpFlagRawFieldTarget({
      expectedValue: "0",
      fieldLabel: "PSH",
      mask: 0x08,
      op: "inc",
      shift: 3,
      targetLabel: "TCP PSH flag vary",
      variableName: "tcp_flag_psh"
    });
    await expectTcpFlagRawFieldTarget({
      expectedValue: "0",
      fieldLabel: "RST",
      mask: 0x04,
      op: "inc",
      shift: 2,
      targetLabel: "TCP RST flag vary",
      variableName: "tcp_flag_rst"
    });
    await expectTcpFlagRawFieldTarget({
      expectedValue: "1",
      fieldLabel: "SYN",
      mask: 0x02,
      op: "dec",
      shift: 1,
      targetLabel: "TCP SYN flag vary",
      variableName: "tcp_flag_syn"
    });
    await expectTcpFlagRawFieldTarget({
      expectedValue: "0",
      fieldLabel: "FIN",
      mask: 0x01,
      op: "inc",
      shift: 0,
      targetLabel: "TCP FIN flag vary",
      variableName: "tcp_flag_fin"
    });
  }, 40_000);

  it("uses TCP fixed-header Packet Editor rows as Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAA8EjRAAEAGAAAKCgoBCgoKAgu5AFARIjNEVWZ3iKACBAAAAAAAAgQFtAQCCAoAAeJAAAn78QEDAwc=";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 3c 12 34 40 00 40 06 00 00 0a 0a 0a 01 0a 0a 0a 02 0b b9 00 50 11 22 33 44 55 66 77 88 a0 02 04 00 00 00 00 00 02 04 05 b4 04 02 08 0a 00 01 e2 40 00 09 fb f1 01 03 03 07";
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
                name: "tcp-options-stream",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 74,
                wire_length: 74,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.10.10.1", dst: "10.10.10.2", protocol: 6 } },
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "SYN" } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field TCP Source port")).toHaveValue("3001");
    expect(screen.getByLabelText("Raw field TCP Destination port")).toHaveValue("80");
    expect(screen.getByLabelText("Raw field TCP Sequence")).toHaveValue("287454020");
    expect(screen.getByLabelText("Raw field TCP Acknowledge")).toHaveValue("1432778632");
    expect(screen.getByLabelText("Raw field TCP Window")).toHaveValue("1024");
    expect(screen.getByLabelText("Raw field TCP Checksum")).toHaveValue("0000");
    expect(screen.getByLabelText("Raw field TCP Urgent pointer")).toHaveValue("0");

    const rawTcpChecksumRepair = { l2_len: 14, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" };
    const useRawTcpFieldEngineTarget = async (field: string, targetName: string) => {
      const targetButtonName = `Use Field Engine target for raw field TCP ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(`Raw field TCP ${field}`)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      return readAdvancedVmBody();
    };

    expect(await useRawTcpFieldEngineTarget("Source port", "TCP src port inc")).toEqual({
      instructions: [
        { init_value: 3001, max_value: 3016, min_value: 3001, name: "tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_src", pkt_offset: 34, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_src"
    });

    expect(await useRawTcpFieldEngineTarget("Destination port", "TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 80, max_value: 95, min_value: 80, name: "tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_dst", pkt_offset: 36, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_dst"
    });

    expect(await useRawTcpFieldEngineTarget("Sequence", "TCP sequence inc")).toEqual({
      instructions: [
        { init_value: 287454020, max_value: 287454035, min_value: 287454020, name: "tcp_sequence", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_sequence", pkt_offset: 38, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_sequence"
    });

    expect(await useRawTcpFieldEngineTarget("Acknowledge", "TCP acknowledge inc")).toEqual({
      instructions: [
        { init_value: 1432778632, max_value: 1432778647, min_value: 1432778632, name: "tcp_ack", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_ack", pkt_offset: 42, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_ack"
    });

    expect(await useRawTcpFieldEngineTarget("Window", "TCP window inc")).toEqual({
      instructions: [
        { init_value: 1024, max_value: 1039, min_value: 1024, name: "tcp_window", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_window", pkt_offset: 48, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_window"
    });

    expect(await useRawTcpFieldEngineTarget("Urgent pointer", "TCP urgent pointer inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 15, min_value: 0, name: "tcp_urgent_pointer", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_urgent_pointer", pkt_offset: 52, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_urgent_pointer"
    });

    expect(await useRawTcpFieldEngineTarget("Checksum", "TCP checksum inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 15, min_value: 0, name: "tcp_checksum", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_checksum", pkt_offset: 50, type: "write_flow_var" }
      ],
      split_by_var: "tcp_checksum"
    });
  }, 30_000);

  it("keeps Packet Editor raw field drafts scoped to the selected stream", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    await waitFor(() => expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.1"));
    fireEvent.change(screen.getByLabelText("Raw field IPv4 Source"), { target: { value: "16.0.0.9" } });
    expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.9");

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Stream" }));
    await waitFor(() => expect(screen.getAllByText("stream-1-copy").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.1");

    const originalStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1"));
    expect(originalStreamRow).toBeDefined();
    fireEvent.click(originalStreamRow as HTMLElement);
    expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.9");
  }, 20_000);

  it("keeps Packet Editor raw packet drafts scoped to the selected stream", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAAAuEjRAAEARAAAQAAABMAAAAQQBAAwAGgAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 2e 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 1a 00 00 de ad be ef";
    const streamOneDraft = packetHex.replace("de ad be ef", "aa aa aa aa");
    const streamTwoDraft = packetHex.replace("de ad be ef", "bb bb bb bb");
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
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 26 } }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    const rawPacketHex = await screen.findByLabelText("Raw packet hex");
    fireEvent.change(rawPacketHex, { target: { value: streamOneDraft } });
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("aa aa aa aa");

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Stream" }));
    await waitFor(() => expect(screen.getAllByText("stream-1-copy").length).toBeGreaterThan(0));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("de ad be ef");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).not.toContain("aa aa aa aa");

    fireEvent.change(screen.getByLabelText("Raw packet hex"), { target: { value: streamTwoDraft } });
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("bb bb bb bb");

    const originalStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1"));
    expect(originalStreamRow).toBeDefined();
    fireEvent.click(originalStreamRow as HTMLElement);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("aa aa aa aa");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).not.toContain("bb bb bb bb");

    const copiedStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1-copy"));
    expect(copiedStreamRow).toBeDefined();
    fireEvent.click(copiedStreamRow as HTMLElement);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("bb bb bb bb");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).not.toContain("aa aa aa aa");
  }, 20_000);
});
