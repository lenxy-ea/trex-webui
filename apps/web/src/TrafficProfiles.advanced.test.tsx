import {
  App,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  openProfilesForBuilder,
  overview,
  profileCatalog,
  render,
  returnAdvancedStreamToStructured,
  screen,
  stubFetch,
  switchPacketPreviewToFieldEngine,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

describe("Traffic Profiles / Advanced", () => {
  installAppTestHooks();

  it("applies Field Engine advanced VM JSON as an expert stream", async () => {
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
                binary_base64: "qrvM3e7wABEiM0QB//8=",
                hex: "aabbccddeef0001122334401ffff",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee f0 00 11 22 33 44 01 ff ff", ascii: "........3.D..." }],
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
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("Ethernet destination"), { target: { value: "aa:bb:cc:dd:ee:f0" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination count"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination step"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Ethernet source"), { target: { value: "00:11:22:33:44:01" } });
    fireEvent.change(screen.getByLabelText("Ethernet source mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Ethernet source count"), { target: { value: "4" } });
    fireEvent.click(screen.getByLabelText("Override destination port"));
    fireEvent.change(screen.getByLabelText("L4 destination port"), { target: { value: "2152" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText("aa bb cc dd ee f0 00 11 22 33 44 01 ff ff");
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Field Engine" }));

    const vmJson = await screen.findByLabelText("Advanced VM JSON");
    expect((vmJson as HTMLTextAreaElement).value).toContain('"instructions": [');
    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(targetMap).toBeInTheDocument();
    expect(within(targetMap).getByText("Field targets")).toBeInTheDocument();
    expect(within(targetMap).getByText("MAC dst inc")).toBeInTheDocument();
    expect(within(targetMap).getAllByText("ipv4_src").length).toBeGreaterThan(0);
    expect(within(targetMap).getAllByText("29").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Use VLAN ID inc Field Engine target" })).toBeDisabled();

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MAC dst inc Field Engine target" }));
    let selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "mac_dest"');
    expect(selectedTargetVmJson).toContain('"init_value": 61168');
    expect(selectedTargetVmJson).toContain('"max_value": 61198');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 4');
    expect(selectedTargetVmJson).not.toContain("fix_checksum");

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MAC src inc Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "mac_src"');
    expect(selectedTargetVmJson).toContain('"init_value": 1');
    expect(selectedTargetVmJson).toContain('"max_value": 4');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 11');

    fireEvent.click(screen.getByRole("button", { name: "Use IPv4 src inc Field Engine target" }));
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"name": "ipv4_src"');
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"op": "inc"');
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"pkt_offset": 29');

    fireEvent.click(screen.getByRole("button", { name: "Use IPv4 src random Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "ipv4_src"');
    expect(selectedTargetVmJson).toContain('"op": "random"');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 29');

    fireEvent.click(screen.getByRole("button", { name: "Use IPv4 dst inc Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "ipv4_dst"');
    expect(selectedTargetVmJson).toContain('"op": "inc"');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 33');

    fireEvent.click(screen.getByRole("button", { name: "Use IPv4 dst random Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "ipv4_dst"');
    expect(selectedTargetVmJson).toContain('"op": "random"');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 33');

    fireEvent.click(screen.getByRole("button", { name: "Use UDP length inc Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "udp_length"');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 38');
    expect(selectedTargetVmJson).toContain('"l2_len": 14');
    expect(selectedTargetVmJson).toContain('"l3_len": 20');
    expect(selectedTargetVmJson).toContain('"l4_type": 11');
    expect(selectedTargetVmJson).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(screen.getByRole("button", { name: "Use UDP checksum inc Field Engine target" }));
    selectedTargetVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(selectedTargetVmJson).toContain('"name": "udp_checksum"');
    expect(selectedTargetVmJson).toContain('"pkt_offset": 40');
    expect(selectedTargetVmJson).not.toContain('"type": "fix_checksum_hw"');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "ipv4-src-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"name": "ipv4_src"');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "udp-src-port-inc" } });
    expect(screen.getByLabelText("VM udp_src operation")).toHaveValue("inc");
    expect((screen.getByLabelText("VM udp_src init value") as HTMLInputElement).value).toBe("1025");
    expect((screen.getByLabelText("VM udp_src min value") as HTMLInputElement).value).toBe("1025");
    expect((screen.getByLabelText("VM udp_src max value") as HTMLInputElement).value).toBe("1040");
    fireEvent.change(screen.getByLabelText("VM udp_src operation"), { target: { value: "dec" } });
    expect((screen.getByLabelText("VM udp_src min value") as HTMLInputElement).value).toBe("1010");
    expect((screen.getByLabelText("VM udp_src max value") as HTMLInputElement).value).toBe("1025");
    fireEvent.click(screen.getByRole("button", { name: "Append VM" }));
    const autoDecVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    const autoDecUdpSrcFlowVar = autoDecVmBody.instructions.find(
      (instruction: Record<string, unknown>) => instruction.type === "flow_var" && instruction.name === "udp_src"
    );
    expect(autoDecUdpSrcFlowVar).toEqual(
      expect.objectContaining({ op: "dec", init_value: 1025, min_value: 1010, max_value: 1025, step: 1 })
    );
    fireEvent.change(screen.getByLabelText("VM udp_src operation"), { target: { value: "random" } });
    expect((screen.getByLabelText("VM udp_src min value") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("VM udp_src max value") as HTMLInputElement).value).toBe("65535");
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const autoRandomVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    const autoRandomUdpSrcFlowVar = autoRandomVmBody.instructions.find(
      (instruction: Record<string, unknown>) => instruction.type === "flow_var" && instruction.name === "udp_src"
    );
    expect(autoRandomUdpSrcFlowVar).toEqual(
      expect.objectContaining({ op: "random", init_value: 1025, min_value: 0, max_value: 65535, step: 1 })
    );
    fireEvent.change(screen.getByLabelText("VM udp_src operation"), { target: { value: "inc" } });

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "ipv4-src-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "udp-src-port-inc" } });
    expect(screen.getByLabelText("VM udp_src operation")).toHaveValue("inc");
    fireEvent.change(screen.getByLabelText("VM udp_src operation"), { target: { value: "dec" } });
    fireEvent.change(screen.getByLabelText("VM udp_src init value"), { target: { value: "4096" } });
    fireEvent.change(screen.getByLabelText("VM udp_src min value"), { target: { value: "1024" } });
    fireEvent.change(screen.getByLabelText("VM udp_src max value"), { target: { value: "8192" } });
    fireEvent.change(screen.getByLabelText("VM udp_src step"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Append VM" }));
    const appendedVmBody = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    const udpSrcFlowVar = appendedVmBody.instructions.find(
      (instruction: Record<string, unknown>) => instruction.type === "flow_var" && instruction.name === "udp_src"
    );
    expect(appendedVmBody.instructions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "ipv4_src" })])
    );
    expect(udpSrcFlowVar).toEqual(
      expect.objectContaining({ op: "dec", init_value: 4096, min_value: 1024, max_value: 8192, step: 4 })
    );

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "udp-5tuple-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const fiveTupleVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(fiveTupleVmJson).toContain('"name": "ipv4_src"');
    expect(fiveTupleVmJson).toContain('"name": "ipv4_dst"');
    expect(fiveTupleVmJson).toContain('"name": "udp_src"');
    expect(fiveTupleVmJson).toContain('"name": "udp_dst"');
    expect(fiveTupleVmJson).toContain('"pkt_offset": 36');
    expect(fiveTupleVmJson).toContain('"type": "fix_checksum_hw"');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-teid-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Append VM" }));
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"name": "gtpu_teid"');
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain('"pkt_offset": 46');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "vlan-id-inc" } });
    expect(screen.getByText("Template requires Tagged VLAN stream.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert VM" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Append VM" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Advanced VM JSON"), { target: { value: "[" } });
    expect(screen.getByRole("button", { name: "Apply VM" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Advanced VM JSON"), {
      target: {
        value: JSON.stringify(
          {
            cache_size: 128,
            split_by_var: "mac_src",
            instructions: [{ type: "flow_var", name: "mac_src" }]
          },
          null,
          2
        )
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply VM" }));

    expect(screen.getAllByText("advanced").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "Protocol Selection" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export To Yaml" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/export-yaml",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"advanced_mode":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/export-yaml",
      expect.objectContaining({
        body: expect.stringContaining('"advanced_vm":{"cache_size":128,"split_by_var":"mac_src"')
      })
    );
  }, 90_000);

  it("keeps Field Engine template parameter drafts scoped to the selected stream", async () => {
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
                binary_base64: "qrvM3e7wABEiM0QB//8=",
                hex: "aabbccddeef0001122334401ffff",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee f0 00 11 22 33 44 01 ff ff", ascii: "........3.D..." }],
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "udp-src-port-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("udp-src-port-inc"));
    fireEvent.change(screen.getByLabelText("VM udp_src operation"), { target: { value: "dec" } });
    fireEvent.change(screen.getByLabelText("VM udp_src init value"), { target: { value: "4096" } });
    fireEvent.change(screen.getByLabelText("VM udp_src min value"), { target: { value: "1024" } });
    fireEvent.change(screen.getByLabelText("VM udp_src max value"), { target: { value: "8192" } });
    fireEvent.change(screen.getByLabelText("VM udp_src step"), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Reset Params" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Stream" }));
    await waitFor(() => expect(screen.getAllByText("stream-1-copy").length).toBeGreaterThan(0));

    expect(screen.getByLabelText("VM udp_src operation")).toHaveValue("inc");
    expect((screen.getByLabelText("VM udp_src init value") as HTMLInputElement).value).toBe("1025");
    expect((screen.getByLabelText("VM udp_src min value") as HTMLInputElement).value).toBe("1025");
    expect((screen.getByLabelText("VM udp_src max value") as HTMLInputElement).value).toBe("1040");
    expect((screen.getByLabelText("VM udp_src step") as HTMLInputElement).value).toBe("1");
    expect(screen.getByRole("button", { name: "Reset Params" })).toBeDisabled();

    const originalStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1"));
    expect(originalStreamRow).toBeDefined();
    fireEvent.click(originalStreamRow as HTMLElement);

    expect(screen.getByLabelText("VM udp_src operation")).toHaveValue("dec");
    expect((screen.getByLabelText("VM udp_src init value") as HTMLInputElement).value).toBe("4096");
    expect((screen.getByLabelText("VM udp_src min value") as HTMLInputElement).value).toBe("1024");
    expect((screen.getByLabelText("VM udp_src max value") as HTMLInputElement).value).toBe("8192");
    expect((screen.getByLabelText("VM udp_src step") as HTMLInputElement).value).toBe("4");
    expect(screen.getByRole("button", { name: "Reset Params" })).not.toBeDisabled();
  }, 30_000);

  it("keeps Advanced VM JSON drafts scoped to the selected stream", async () => {
    const streamOneVmJson = JSON.stringify(
      {
        instructions: [{ type: "flow_var", name: "stream_one", size: 1, op: "inc" }],
        split_by_var: "stream_one"
      },
      null,
      2
    );
    const streamTwoVmJson = JSON.stringify(
      {
        instructions: [{ type: "flow_var", name: "stream_two", size: 1, op: "dec" }],
        split_by_var: "stream_two"
      },
      null,
      2
    );
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
                binary_base64: "qrvM3e7wABEiM0QB//8=",
                hex: "aabbccddeef0001122334401ffff",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee f0 00 11 22 33 44 01 ff ff", ascii: "........3.D..." }],
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();

    fireEvent.change(screen.getByLabelText("Advanced VM JSON"), { target: { value: streamOneVmJson } });
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain("stream_one");

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Stream" }));
    await waitFor(() => expect(screen.getAllByText("stream-1-copy").length).toBeGreaterThan(0));
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).not.toContain("stream_one");

    fireEvent.change(screen.getByLabelText("Advanced VM JSON"), { target: { value: streamTwoVmJson } });
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain("stream_two");

    const originalStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1"));
    expect(originalStreamRow).toBeDefined();
    fireEvent.click(originalStreamRow as HTMLElement);
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain("stream_one");
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).not.toContain("stream_two");

    const copiedStreamRow = screen.getAllByRole("row").find((row) => within(row).queryByText("stream-1-copy"));
    expect(copiedStreamRow).toBeDefined();
    fireEvent.click(copiedStreamRow as HTMLElement);
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).toContain("stream_two");
    expect((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value).not.toContain("stream_one");
  }, 30_000);

  it("adjusts outer IPv4 advanced VM templates for VLAN and MPLS headers", async () => {
    const previewResponse = {
      ok: true,
      data: {
        content: "---\n[]\n",
        streams: [],
        packet_previews: [
          {
            index: 1,
            name: "stream-1",
            packet_type: "Ethernet/IPv4/UDP",
            frame_length: 96,
            wire_length: 96,
            binary_base64: "AAAA",
            hex: "000000",
            hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
            layers: []
          }
        ]
      },
      blocker: null,
      error: null
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview" || url === "/api/trex/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/profiles/workbench/render") {
        return { ok: true, json: async () => previewResponse };
      }
      return { ok: true, json: async () => ({ ok: true, data: null, blocker: null, error: null }) };
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("Tagged"));
    fireEvent.click(screen.getByLabelText("MPLS"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Second MPLS label enabled"));
    fireEvent.click(screen.getByLabelText("Third MPLS label enabled"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "udp-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("udp-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const udpVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(udpVmJson).toContain('"pkt_offset": 45');
    expect(udpVmJson).toContain('"pkt_offset": 49');
    expect(udpVmJson).toContain('"pkt_offset": 50');
    expect(udpVmJson).toContain('"pkt_offset": 52');
    expect(udpVmJson).toContain('"l2_len": 30');
    expect(udpVmJson).toContain('"l4_type": 11');

    await returnAdvancedStreamToStructured();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("TCP"));
    await waitFor(() => expect(screen.getByLabelText("TCP")).toBeChecked());
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "tcp-src-port-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("tcp-src-port-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const tcpVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(tcpVmJson).toContain('"name": "tcp_src"');
    expect(tcpVmJson).toContain('"pkt_offset": 50');
    expect(tcpVmJson).toContain('"l2_len": 30');
    expect(tcpVmJson).toContain('"l4_type": 13');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "tcp-dst-port-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("tcp-dst-port-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const tcpDstVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(tcpDstVmJson).toContain('"name": "tcp_dst"');
    expect(tcpDstVmJson).toContain('"pkt_offset": 52');
    expect(tcpDstVmJson).toContain('"l4_type": 13');

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "tcp-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("tcp-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const tcpFiveTupleVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(tcpFiveTupleVmJson).toContain('"name": "ipv4_src"');
    expect(tcpFiveTupleVmJson).toContain('"name": "ipv4_dst"');
    expect(tcpFiveTupleVmJson).toContain('"name": "tcp_src"');
    expect(tcpFiveTupleVmJson).toContain('"name": "tcp_dst"');
    expect(tcpFiveTupleVmJson).toContain('"pkt_offset": 45');
    expect(tcpFiveTupleVmJson).toContain('"pkt_offset": 49');
    expect(tcpFiveTupleVmJson).toContain('"pkt_offset": 50');
    expect(tcpFiveTupleVmJson).toContain('"pkt_offset": 52');
    expect(tcpFiveTupleVmJson).toContain('"l2_len": 30');
    expect(tcpFiveTupleVmJson).toContain('"l4_type": 13');
  }, 30_000);

  it("adds VLAN and MPLS L2 advanced VM targets from the Field Engine target map", async () => {
    const previewResponse = {
      ok: true,
      data: {
        content: "---\n[]\n",
        streams: [],
        packet_previews: [
          {
            index: 1,
            name: "stream-1",
            packet_type: "Ethernet/QinQ/MPLS/IPv4/UDP",
            frame_length: 96,
            wire_length: 96,
            binary_base64: "AAAA",
            hex: "000000",
            hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
            layers: []
          }
        ]
      },
      blocker: null,
      error: null
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/system/overview" || url === "/api/trex/overview") {
        return { ok: true, json: async () => overview };
      }
      if (url === "/api/trex/profiles") {
        return { ok: true, json: async () => profileCatalog };
      }
      if (url === "/api/trex/profiles/workbench/render") {
        return { ok: true, json: async () => previewResponse };
      }
      return { ok: true, json: async () => ({ ok: true, data: null, blocker: null, error: null }) };
    });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("Tagged"));
    fireEvent.click(screen.getByLabelText("MPLS"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Enable VLAN inner tag"));
    fireEvent.change(screen.getByLabelText("VLAN priority"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("VLAN priority count"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("VLAN CFI DEI"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VLAN inner priority"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("VLAN inner priority count"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("VLAN inner CFI DEI"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("MPLS label"), { target: { value: "1024" } });
    fireEvent.change(screen.getByLabelText("MPLS label count"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class count"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL count"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Second MPLS label enabled"));
    fireEvent.change(screen.getByLabelText("Second MPLS label"), { target: { value: "2048" } });
    fireEvent.change(screen.getByLabelText("Second MPLS label count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL count"), { target: { value: "4" } });
    fireEvent.click(screen.getByLabelText("Third MPLS label enabled"));
    fireEvent.change(screen.getByLabelText("Third MPLS label"), { target: { value: "4096" } });
    fireEvent.change(screen.getByLabelText("Third MPLS label count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL count"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    const targetMap = screen.getByLabelText("Field Engine target map");

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use VLAN priority inc Field Engine target" }));
    let selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vlan_priority", op: "inc", init_value: 5, max_value: 7, size: 1, step: 1 }),
        expect.objectContaining({
          name: "vlan_priority",
          type: "write_mask_flow_var",
          mask: 57344,
          pkt_cast_size: 2,
          pkt_offset: 14,
          shift: 13
        })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use VLAN CFI/DEI vary Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vlan_cfi", op: "dec", init_value: 1, min_value: 0, max_value: 1 }),
        expect.objectContaining({
          name: "vlan_cfi",
          type: "write_mask_flow_var",
          mask: 4096,
          pkt_cast_size: 2,
          pkt_offset: 14,
          shift: 12
        })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use VLAN inner ID inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vlan2_id", op: "inc", init_value: 200, max_value: 203, size: 2, step: 1 }),
        expect.objectContaining({
          name: "vlan2_id",
          type: "write_mask_flow_var",
          mask: 4095,
          pkt_cast_size: 2,
          pkt_offset: 18,
          shift: 0
        })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use VLAN inner priority inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vlan2_priority", op: "inc", init_value: 3, max_value: 5 }),
        expect.objectContaining({ name: "vlan2_priority", mask: 57344, pkt_offset: 18, shift: 13 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use VLAN inner CFI/DEI vary Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vlan2_cfi", op: "dec", init_value: 1, min_value: 0, max_value: 1 }),
        expect.objectContaining({ name: "vlan2_cfi", mask: 4096, pkt_offset: 18, shift: 12 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MPLS label inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label", op: "inc", init_value: 1024, max_value: 1031, size: 2 }),
        expect.objectContaining({
          name: "mpls_label",
          type: "write_mask_flow_var",
          mask: 4294963200,
          pkt_cast_size: 4,
          pkt_offset: 22,
          shift: 12
        })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MPLS TC inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_tc", op: "inc", init_value: 5, max_value: 7, size: 1 }),
        expect.objectContaining({ name: "mpls_tc", mask: 3584, pkt_cast_size: 4, pkt_offset: 22, shift: 9 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use MPLS TTL inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_ttl", op: "inc", init_value: 42, max_value: 44, size: 1 }),
        expect.objectContaining({ name: "mpls_ttl", type: "write_flow_var", pkt_offset: 25 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Second MPLS label inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label2", op: "inc", init_value: 2048, max_value: 2051, size: 2 }),
        expect.objectContaining({ name: "mpls_label2", mask: 4294963200, pkt_cast_size: 4, pkt_offset: 26, shift: 12 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Second MPLS TC inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label2_tc", op: "inc", init_value: 4, max_value: 7, size: 1 }),
        expect.objectContaining({ name: "mpls_label2_tc", mask: 3584, pkt_cast_size: 4, pkt_offset: 26, shift: 9 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Second MPLS TTL inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label2_ttl", op: "inc", init_value: 41, max_value: 44, size: 1 }),
        expect.objectContaining({ name: "mpls_label2_ttl", type: "write_flow_var", pkt_offset: 29 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Third MPLS label inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label3", op: "inc", init_value: 4096, max_value: 4099, size: 2 }),
        expect.objectContaining({ name: "mpls_label3", mask: 4294963200, pkt_cast_size: 4, pkt_offset: 30, shift: 12 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Third MPLS TC inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label3_tc", op: "inc", init_value: 3, max_value: 6, size: 1 }),
        expect.objectContaining({ name: "mpls_label3_tc", mask: 3584, pkt_cast_size: 4, pkt_offset: 30, shift: 9 })
      ])
    );

    fireEvent.click(within(targetMap).getByRole("button", { name: "Use Third MPLS TTL inc Field Engine target" }));
    selectedTarget = JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "mpls_label3_ttl", op: "inc", init_value: 40, max_value: 43, size: 1 }),
        expect.objectContaining({ name: "mpls_label3_ttl", type: "write_flow_var", pkt_offset: 33 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );
  }, 60_000);

  it("validates Stream Builder fields before profile generation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();

    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "" } });
    expect(screen.getByText("Stream 1: Length must be an integer between 64 and 9216.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Pcap" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Packet viewer" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/profiles/workbench/save")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/profiles/workbench/render")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/trex/profiles/workbench/export-pcap")).toBe(false);

    fireEvent.change(screen.getByLabelText("Length"), { target: { value: "128" } });
    expect(screen.queryByText("Stream 1: Length must be an integer between 64 and 9216.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Profile" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Pcap" })).not.toBeDisabled();
    expect(screen.getByRole("tab", { name: "Packet viewer" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("Payload pattern"), { target: { value: "abc" } });
    expect(screen.getByText("Stream 1: Payload pattern must contain whole hex bytes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Pcap" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Packet viewer" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Payload pattern"), { target: { value: "ab cd" } });
    expect(screen.queryByText("Stream 1: Payload pattern must contain whole hex bytes.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Profile" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Pcap" })).not.toBeDisabled();
  });

  it("mirrors original Payload selection and type controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue({
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

    const payloadGroup = screen.getByRole("group", { name: "Payload" });
    expect(within(payloadGroup).getByLabelText("Pattern")).toBeChecked();
    fireEvent.click(within(payloadGroup).getByLabelText("None"));
    expect(within(payloadGroup).getByLabelText("None")).toBeChecked();

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    expect(screen.queryByLabelText("Payload type")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"payload_enabled":false')
        })
      )
    );

    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Payload" })).getByLabelText("Pattern"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("Payload type"), { target: { value: "Increment Byte" } });
    expect(screen.getByLabelText("Payload pattern")).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"payload_type":"Increment Byte"')
        })
      )
    );
  });

  it("loads Fixed Word payload pattern from a text file like the original GUI", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue({
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

    const fileInput = screen.getByLabelText("Payload pattern file");
    const file = new File(["a1 b2\nc3"], "pattern.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText("Payload pattern")).toHaveValue("A1B2C3"));
    expect(screen.getByText("Loaded pattern.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"payload_pattern":"A1B2C3"')
        })
      )
    );
  });

  it("imports a pcap into the Stream Builder table through the backend", async () => {
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
            file_name: "import.pcap",
            packet_count: 1,
            unsupported_count: 0,
            content: "---\n[]\n",
            streams: [
              {
                name: "packet_1",
                enabled: true,
                self_start: true,
                packet_type: "Ethernet/IPv4/TCP",
                frame_length_type: "Fixed",
                frame_length: 96,
                frame_length_min: 64,
                frame_length_max: 1518,
                mode: "continuous",
                rate_type: "pps",
                rate_value: 1000,
                total_pkts: 1,
                count: 1,
                pkts_per_burst: 1,
                isg: 0,
                ibg: 0,
                flow_stats_enabled: false,
                latency_enabled: false,
                pg_id: 1,
                next_stream_id: null,
                action_count: 0,
                ether_dst: "66:55:44:33:22:11",
                ether_src: "10:20:30:40:50:60",
                ether_type_override: false,
                ether_type: "0800",
                ether_dst_mode: "Fixed",
                ether_dst_count: 16,
                ether_dst_step: 1,
                ether_src_mode: "Fixed",
                ether_src_count: 16,
                ether_src_step: 1,
                arp_hardware_type: 1,
                arp_protocol_type: "0800",
                arp_hardware_size: 6,
                arp_protocol_size: 4,
                arp_operation: 1,
                arp_operation_mode: "Fixed",
                arp_operation_count: 4,
                arp_operation_step: 1,
                arp_sender_mac: "00:00:00:00:00:00",
                arp_sender_mac_mode: "Fixed",
                arp_sender_mac_count: 16,
                arp_sender_mac_step: 1,
                arp_sender_ip: "16.0.0.1",
                arp_sender_ip_mode: "Fixed",
                arp_sender_ip_count: 16,
                arp_sender_ip_step: 1,
                arp_target_mac: "00:00:00:00:00:00",
                arp_target_mac_mode: "Fixed",
                arp_target_mac_count: 16,
                arp_target_mac_step: 1,
                arp_target_ip: "48.0.0.1",
                arp_target_ip_mode: "Fixed",
                arp_target_ip_count: 16,
                arp_target_ip_step: 1,
                vlan_enabled: false,
                vlan_tpid_override: false,
                vlan_tpid: "8100",
                vlan_priority: 0,
                vlan_priority_mode: "Fixed",
                vlan_priority_count: 4,
                vlan_priority_step: 1,
                vlan_cfi: 0,
                vlan_id: 0,
                vlan_id_mode: "Fixed",
                vlan_id_count: 16,
                vlan_id_step: 1,
                vlan2_enabled: false,
                vlan2_tpid_override: false,
                vlan2_tpid: "8100",
                vlan2_priority: 0,
                vlan2_priority_mode: "Fixed",
                vlan2_priority_count: 4,
                vlan2_priority_step: 1,
                vlan2_cfi: 0,
                vlan2_id: 1,
                vlan2_id_mode: "Fixed",
                vlan2_id_count: 16,
                vlan2_id_step: 1,
                mpls_enabled: false,
                mpls_label: 17,
                mpls_label_mode: "Fixed",
                mpls_label_count: 16,
                mpls_label_step: 1,
                mpls_tc: 0,
                mpls_tc_mode: "Fixed",
                mpls_tc_count: 4,
                mpls_tc_step: 1,
                mpls_ttl: 255,
                mpls_ttl_mode: "Fixed",
                mpls_ttl_count: 16,
                mpls_ttl_step: 1,
                mpls_label2_enabled: false,
                mpls_label2: 18,
                mpls_label2_mode: "Fixed",
                mpls_label2_count: 16,
                mpls_label2_step: 1,
                mpls_label2_tc: 0,
                mpls_label2_tc_mode: "Fixed",
                mpls_label2_tc_count: 4,
                mpls_label2_tc_step: 1,
                mpls_label2_ttl: 255,
                mpls_label2_ttl_mode: "Fixed",
                mpls_label2_ttl_count: 16,
                mpls_label2_ttl_step: 1,
                mpls_label3_enabled: false,
                mpls_label3: 19,
                mpls_label3_mode: "Fixed",
                mpls_label3_count: 16,
                mpls_label3_step: 1,
                mpls_label3_tc: 0,
                mpls_label3_tc_mode: "Fixed",
                mpls_label3_tc_count: 4,
                mpls_label3_tc_step: 1,
                mpls_label3_ttl: 255,
                mpls_label3_ttl_mode: "Fixed",
                mpls_label3_ttl_count: 16,
                mpls_label3_ttl_step: 1,
                vxlan_enabled: false,
                vxlan_vni: 42,
                vxlan_vni_mode: "Fixed",
                vxlan_vni_count: 16,
                vxlan_vni_step: 1,
                vxlan_inner_ether_dst: "00:00:00:00:00:00",
                vxlan_inner_ether_src: "00:00:00:00:00:00",
                vxlan_inner_ip_version: "IPv4",
                vxlan_inner_ipv4_src: "10.0.0.1",
                vxlan_inner_ipv4_src_mode: "Fixed",
                vxlan_inner_ipv4_src_count: 16,
                vxlan_inner_ipv4_src_step: 1,
                vxlan_inner_ipv4_dst: "10.0.0.2",
                vxlan_inner_ipv4_dst_mode: "Fixed",
                vxlan_inner_ipv4_dst_count: 16,
                vxlan_inner_ipv4_dst_step: 1,
                vxlan_inner_ipv4_ttl: 127,
                vxlan_inner_ipv4_ttl_mode: "Fixed",
                vxlan_inner_ipv4_ttl_count: 16,
                vxlan_inner_ipv4_ttl_step: 1,
                vxlan_inner_ipv6_src: "2001:db8:50::1",
                vxlan_inner_ipv6_src_mode: "Fixed",
                vxlan_inner_ipv6_src_count: 16,
                vxlan_inner_ipv6_src_step: 1,
                vxlan_inner_ipv6_dst: "2001:db8:50::2",
                vxlan_inner_ipv6_dst_mode: "Fixed",
                vxlan_inner_ipv6_dst_count: 16,
                vxlan_inner_ipv6_dst_step: 1,
                vxlan_inner_ipv6_hop_limit: 64,
                vxlan_inner_ipv6_hop_limit_mode: "Fixed",
                vxlan_inner_ipv6_hop_limit_count: 16,
                vxlan_inner_ipv6_hop_limit_step: 1,
                vxlan_inner_l4_src_port: 1025,
                vxlan_inner_l4_src_port_mode: "Fixed",
                vxlan_inner_l4_src_port_count: 16,
                vxlan_inner_l4_src_port_step: 1,
                vxlan_inner_l4_dst_port: 12,
                vxlan_inner_l4_dst_port_mode: "Fixed",
                vxlan_inner_l4_dst_port_count: 16,
                vxlan_inner_l4_dst_port_step: 1,
                gtpu_enabled: false,
                gtpu_message_type: 255,
                gtpu_teid: 0x12345678,
                gtpu_teid_mode: "Fixed",
                gtpu_teid_count: 16,
                gtpu_teid_step: 1,
                gtpu_sequence_enabled: false,
                gtpu_sequence: 0,
                gtpu_sequence_mode: "Fixed",
                gtpu_sequence_count: 16,
                gtpu_sequence_step: 1,
                gtpu_npdu_enabled: false,
                gtpu_npdu: 0,
                gtpu_npdu_mode: "Fixed",
                gtpu_npdu_count: 16,
                gtpu_npdu_step: 1,
                gtpu_extension_enabled: false,
                gtpu_extension_udp_port: 2152,
                gtpu_extension_udp_port_mode: "Fixed",
                gtpu_extension_udp_port_count: 16,
                gtpu_extension_udp_port_step: 1,
                gtpu_inner_ip_version: "IPv4",
                gtpu_inner_ipv4_src: "10.3.0.1",
                gtpu_inner_ipv4_src_mode: "Fixed",
                gtpu_inner_ipv4_src_count: 16,
                gtpu_inner_ipv4_src_step: 1,
                gtpu_inner_ipv4_dst: "10.3.0.2",
                gtpu_inner_ipv4_dst_mode: "Fixed",
                gtpu_inner_ipv4_dst_count: 16,
                gtpu_inner_ipv4_dst_step: 1,
                gtpu_inner_ipv4_ttl: 64,
                gtpu_inner_ipv4_ttl_mode: "Fixed",
                gtpu_inner_ipv4_ttl_count: 16,
                gtpu_inner_ipv4_ttl_step: 1,
                gtpu_inner_ipv6_src: "2001:db8:30::1",
                gtpu_inner_ipv6_src_mode: "Fixed",
                gtpu_inner_ipv6_src_count: 16,
                gtpu_inner_ipv6_src_step: 1,
                gtpu_inner_ipv6_dst: "2001:db8:30::2",
                gtpu_inner_ipv6_dst_mode: "Fixed",
                gtpu_inner_ipv6_dst_count: 16,
                gtpu_inner_ipv6_dst_step: 1,
                gtpu_inner_ipv6_hop_limit: 64,
                gtpu_inner_ipv6_hop_limit_mode: "Fixed",
                gtpu_inner_ipv6_hop_limit_count: 16,
                gtpu_inner_ipv6_hop_limit_step: 1,
                gtpu_inner_l4_src_port: 1025,
                gtpu_inner_l4_src_port_mode: "Fixed",
                gtpu_inner_l4_src_port_count: 16,
                gtpu_inner_l4_src_port_step: 1,
                gtpu_inner_l4_dst_port: 12,
                gtpu_inner_l4_dst_port_mode: "Fixed",
                gtpu_inner_l4_dst_port_count: 16,
                gtpu_inner_l4_dst_port_step: 1,
                gre_checksum_present: false,
                gre_checksum_override: false,
                gre_checksum: "0000",
                gre_key_present: false,
                gre_key: 0,
                gre_key_mode: "Fixed",
                gre_key_count: 16,
                gre_key_step: 1,
                gre_sequence_present: false,
                gre_sequence: 0,
                gre_sequence_mode: "Fixed",
                gre_sequence_count: 16,
                gre_sequence_step: 1,
                gre_protocol_type: "0800",
                gre_inner_ip_version: "IPv4",
                gre_inner_ipv4_src: "10.2.0.1",
                gre_inner_ipv4_src_mode: "Fixed",
                gre_inner_ipv4_src_count: 16,
                gre_inner_ipv4_src_step: 1,
                gre_inner_ipv4_dst: "10.2.0.2",
                gre_inner_ipv4_dst_mode: "Fixed",
                gre_inner_ipv4_dst_count: 16,
                gre_inner_ipv4_dst_step: 1,
                gre_inner_ipv4_ttl: 64,
                gre_inner_ipv4_ttl_mode: "Fixed",
                gre_inner_ipv4_ttl_count: 16,
                gre_inner_ipv4_ttl_step: 1,
                gre_inner_ipv6_src: "2001:db8:40::1",
                gre_inner_ipv6_src_mode: "Fixed",
                gre_inner_ipv6_src_count: 16,
                gre_inner_ipv6_src_step: 1,
                gre_inner_ipv6_dst: "2001:db8:40::2",
                gre_inner_ipv6_dst_mode: "Fixed",
                gre_inner_ipv6_dst_count: 16,
                gre_inner_ipv6_dst_step: 1,
                gre_inner_ipv6_hop_limit: 64,
                gre_inner_ipv6_hop_limit_mode: "Fixed",
                gre_inner_ipv6_hop_limit_count: 16,
                gre_inner_ipv6_hop_limit_step: 1,
                gre_inner_l4_src_port: 1025,
                gre_inner_l4_src_port_mode: "Fixed",
                gre_inner_l4_src_port_count: 16,
                gre_inner_l4_src_port_step: 1,
                gre_inner_l4_dst_port: 12,
                gre_inner_l4_dst_port_mode: "Fixed",
                gre_inner_l4_dst_port_count: 16,
                gre_inner_l4_dst_port_step: 1,
                ipv4_src: "10.10.10.1",
                ipv4_dst: "10.10.10.2",
                ipv4_src_mode: "Fixed",
                ipv4_src_count: 16,
                ipv4_src_step: 1,
                ipv4_dst_mode: "Fixed",
                ipv4_dst_count: 16,
                ipv4_dst_step: 1,
                ipv4_dscp: 0,
                ipv4_dscp_mode: "Fixed",
                ipv4_dscp_count: 16,
                ipv4_dscp_step: 1,
                ipv4_ecn: 0,
                ipv4_ecn_mode: "Fixed",
                ipv4_ecn_count: 4,
                ipv4_ecn_step: 1,
                ipv4_id: 1234,
                ipv4_id_mode: "Fixed",
                ipv4_id_count: 16,
                ipv4_id_step: 1,
                ipv4_flag_df: false,
                ipv4_flag_mf: false,
                ipv4_fragment_offset: 0,
                ipv4_fragment_offset_mode: "Fixed",
                ipv4_fragment_offset_count: 16,
                ipv4_fragment_offset_step: 1,
                ipv4_ttl: 127,
                ipv4_ttl_mode: "Fixed",
                ipv4_ttl_count: 16,
                ipv4_ttl_step: 1,
                ipv4_checksum_override: false,
                ipv4_checksum: "0000",
                ipv6_src: "2001:db8::1",
                ipv6_dst: "2001:db8::2",
                ipv6_src_mode: "Fixed",
                ipv6_src_count: 16,
                ipv6_src_step: 1,
                ipv6_dst_mode: "Fixed",
                ipv6_dst_count: 16,
                ipv6_dst_step: 1,
                ipv6_traffic_class: 0,
                ipv6_traffic_class_mode: "Fixed",
                ipv6_traffic_class_count: 16,
                ipv6_traffic_class_step: 1,
                ipv6_flow_label: 0,
                ipv6_flow_label_mode: "Fixed",
                ipv6_flow_label_count: 16,
                ipv6_flow_label_step: 1,
                ipv6_hop_limit: 127,
                ipv6_hop_limit_mode: "Fixed",
                ipv6_hop_limit_count: 16,
                ipv6_hop_limit_step: 1,
                l4_src_port_override: true,
                l4_src_port: 12345,
                l4_src_port_mode: "Fixed",
                l4_src_port_count: 16,
                l4_src_port_step: 1,
                l4_dst_port_override: true,
                l4_dst_port: 443,
                l4_dst_port_mode: "Fixed",
                l4_dst_port_count: 16,
                l4_dst_port_step: 1,
                udp_length_override: false,
                udp_length: 26,
                udp_length_mode: "Fixed",
                udp_length_count: 16,
                udp_length_step: 1,
                udp_checksum_override: false,
                udp_checksum: "0000",
                udp_checksum_mode: "Fixed",
                udp_checksum_count: 16,
                udp_checksum_step: 1,
                dns_enabled: false,
                dns_transaction_id: 0x1234,
                dns_transaction_id_mode: "Fixed",
                dns_transaction_id_count: 16,
                dns_transaction_id_step: 1,
                dns_flags: "0100",
                dns_flags_mode: "Fixed" as const,
                dns_flags_count: 16,
                dns_flags_step: 1,
                dns_query_name: "example.com",
                dns_query_type: 1,
                dns_query_type_mode: "Fixed" as const,
                dns_query_type_count: 16,
                dns_query_type_step: 1,
                dns_query_class: 1,
                dns_query_class_mode: "Fixed" as const,
                dns_query_class_count: 16,
                dns_query_class_step: 1,
                dns_answer_enabled: false,
                dns_answer_ttl: 60,
                dns_answer_ttl_mode: "Fixed" as const,
                dns_answer_ttl_count: 16,
                dns_answer_ttl_step: 1,
                dns_answer_ipv4: "192.0.2.1",
                dns_answer_ipv4_mode: "Fixed" as const,
                dns_answer_ipv4_count: 16,
                dns_answer_ipv4_step: 1,
                dhcp_enabled: false,
                dhcp_message_type: 1,
                dhcp_message_type_mode: "Fixed",
                dhcp_message_type_count: 16,
                dhcp_message_type_step: 1,
                dhcp_xid: 0x3903f326,
                dhcp_xid_mode: "Fixed",
                dhcp_xid_count: 16,
                dhcp_xid_step: 1,
                dhcp_flags: "8000",
                dhcp_flags_mode: "Fixed" as const,
                dhcp_flags_count: 16,
                dhcp_flags_step: 1,
                dhcp_client_mac: "00:11:22:33:44:55",
                dhcp_client_mac_mode: "Fixed" as const,
                dhcp_client_mac_count: 16,
                dhcp_client_mac_step: 1,
                dhcp_hostname: "trex-webui",
                dhcp_requested_ip: "0.0.0.0",
                dhcp_requested_ip_mode: "Fixed",
                dhcp_requested_ip_count: 16,
                dhcp_requested_ip_step: 1,
                dhcp_server_id: "0.0.0.0",
                dhcp_server_id_mode: "Fixed",
                dhcp_server_id_count: 16,
                dhcp_server_id_step: 1,
                dhcp_parameter_request_list: "1,3,6,15,28,51,58,59",
                dhcp_lease_time: 0,
                dhcp_lease_time_mode: "Fixed",
                dhcp_lease_time_count: 16,
                dhcp_lease_time_step: 1,
                dhcp_renewal_time: 0,
                dhcp_renewal_time_mode: "Fixed",
                dhcp_renewal_time_count: 16,
                dhcp_renewal_time_step: 1,
                dhcp_rebinding_time: 0,
                dhcp_rebinding_time_mode: "Fixed",
                dhcp_rebinding_time_count: 16,
                dhcp_rebinding_time_step: 1,
                icmp_type: 8,
                icmp_code: 0,
                icmp_checksum_override: false,
                icmp_checksum: "0000",
                icmp_identifier: 1,
                icmp_identifier_mode: "Fixed",
                icmp_identifier_count: 16,
                icmp_identifier_step: 1,
                icmp_sequence: 1,
                icmp_sequence_mode: "Fixed",
                icmp_sequence_count: 16,
                icmp_sequence_step: 1,
                icmpv6_nd_target: "2001:db8::2",
                icmpv6_nd_include_option: true,
                icmpv6_nd_option_mac: "00:00:00:00:00:00",
                icmpv6_nd_na_router: false,
                icmpv6_nd_na_solicited: true,
                icmpv6_nd_na_override: true,
                icmpv6_rs_include_slla: true,
                icmpv6_rs_slla_mac: "00:00:00:00:00:00",
                icmpv6_ra_cur_hop_limit: 64,
                icmpv6_ra_managed: false,
                icmpv6_ra_other: false,
                icmpv6_ra_router_lifetime: 1800,
                icmpv6_ra_reachable_time: 0,
                icmpv6_ra_retrans_timer: 0,
                icmpv6_ra_include_slla: true,
                icmpv6_ra_slla_mac: "00:00:00:00:00:00",
                icmpv6_ra_include_prefix: true,
                icmpv6_ra_prefix: "2001:db8:1::",
                icmpv6_ra_prefix_length: 64,
                icmpv6_ra_prefix_on_link: true,
                icmpv6_ra_prefix_autonomous: true,
                icmpv6_ra_prefix_valid_lifetime: 2592000,
                icmpv6_ra_prefix_preferred_lifetime: 604800,
                tcp_sequence_number: 1234567,
                tcp_sequence_mode: "Fixed",
                tcp_sequence_count: 16,
                tcp_sequence_step: 1,
                tcp_ack_number: 7654321,
                tcp_ack_mode: "Fixed",
                tcp_ack_count: 16,
                tcp_ack_step: 1,
                tcp_window: 9999,
                tcp_window_mode: "Fixed",
                tcp_window_count: 16,
                tcp_window_step: 1,
                tcp_checksum_override: false,
                tcp_checksum: "ABCD",
                tcp_checksum_mode: "Fixed",
                tcp_checksum_count: 16,
                tcp_checksum_step: 1,
                tcp_option_mss_enabled: false,
                tcp_option_mss: 1460,
                tcp_option_mss_mode: "Fixed",
                tcp_option_mss_count: 16,
                tcp_option_mss_step: 1,
                tcp_option_window_scale_enabled: false,
                tcp_option_window_scale: 7,
                tcp_option_window_scale_mode: "Fixed",
                tcp_option_window_scale_count: 16,
                tcp_option_window_scale_step: 1,
                tcp_option_sack_permitted_enabled: false,
                tcp_option_sack_blocks_enabled: false,
                tcp_option_sack_left_edge: 1000,
                tcp_option_sack_left_edge_mode: "Fixed",
                tcp_option_sack_left_edge_count: 16,
                tcp_option_sack_left_edge_step: 1,
                tcp_option_sack_right_edge: 2000,
                tcp_option_sack_right_edge_mode: "Fixed",
                tcp_option_sack_right_edge_count: 16,
                tcp_option_sack_right_edge_step: 1,
                tcp_option_timestamp_enabled: false,
                tcp_option_timestamp_value: 1,
                tcp_option_timestamp_value_mode: "Fixed",
                tcp_option_timestamp_value_count: 16,
                tcp_option_timestamp_value_step: 1,
                tcp_option_timestamp_echo: 0,
                tcp_option_timestamp_echo_mode: "Fixed",
                tcp_option_timestamp_echo_count: 16,
                tcp_option_timestamp_echo_step: 1,
                tcp_urgent_pointer: 1111,
                tcp_urgent_pointer_mode: "Fixed",
                tcp_urgent_pointer_count: 16,
                tcp_urgent_pointer_step: 1,
                tcp_flags_mode: "Fixed",
                tcp_flags_count: 16,
                tcp_flags_step: 1,
                tcp_flag_urg: false,
                tcp_flag_ack: false,
                tcp_flag_psh: false,
                tcp_flag_rst: false,
                tcp_flag_syn: false,
                tcp_flag_fin: false,
                sctp_verification_tag: 0x12345678,
                sctp_verification_tag_mode: "Fixed",
                sctp_verification_tag_count: 16,
                sctp_verification_tag_step: 1,
                sctp_checksum_override: false,
                sctp_checksum: "00000000",
                sctp_data_flags: 3,
                sctp_data_flags_mode: "Fixed",
                sctp_data_flags_count: 16,
                sctp_data_flags_step: 1,
                sctp_tsn: 1,
                sctp_tsn_mode: "Fixed",
                sctp_tsn_count: 16,
                sctp_tsn_step: 1,
                sctp_stream_id: 0,
                sctp_stream_id_mode: "Fixed",
                sctp_stream_id_count: 16,
                sctp_stream_id_step: 1,
                sctp_stream_sequence: 0,
                sctp_stream_sequence_mode: "Fixed",
                sctp_stream_sequence_count: 16,
                sctp_stream_sequence_step: 1,
                sctp_payload_protocol_id: 0,
                sctp_payload_protocol_id_mode: "Fixed",
                sctp_payload_protocol_id_count: 16,
                sctp_payload_protocol_id_step: 1,
                payload_enabled: true,
                payload_type: "Fixed Word",
                payload_pattern: "00",
                advanced_cache_size_type: "Auto",
                advanced_cache_value: 5000,
                packet_binary_base64: "AAAA"
              }
            ],
            stream_summaries: [
              {
                index: 1,
                name: "packet_1",
                packet_type: "Ethernet/IPv4/TCP",
                length: 96,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: [
              {
                index: 1,
                name: "packet_1",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 96,
                wire_length: 96,
                binary_base64: "AAAA",
                hex: "00 00 00",
                hex_lines: [{ offset: "0000", hex: "00 00 00", ascii: "..." }],
                layers: [
                  {
                    name: "Internet Protocol v4",
                    fields: { source: "10.10.10.1", destination: "10.10.10.2", protocol: "TCP" }
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
    fireEvent.change(screen.getByLabelText("Pcap import name prefix"), { target: { value: "trace" } });
    fireEvent.click(screen.getByLabelText("Enable Pcap import source rewrite"));
    fireEvent.change(screen.getByLabelText("Pcap import source address"), { target: { value: "20.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Pcap import source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("Pcap import source count"), { target: { value: "32" } });
    fireEvent.click(screen.getByLabelText("Enable Pcap import destination rewrite"));
    fireEvent.change(screen.getByLabelText("Pcap import destination address"), { target: { value: "30.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Pcap import destination mode"), { target: { value: "Random Host" } });
    fireEvent.change(screen.getByLabelText("Pcap import destination count"), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText("Pcap import speedup"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Pcap import loop count"), { target: { value: "3" } });
    const input = screen.getByLabelText("Import Pcap file");
    const file = new File([new Uint8Array([0xd4, 0xc3, 0xb2, 0xa1])], "import.pcap", {
      type: "application/vnd.tcpdump.pcap"
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/import-pcap",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"file_name":"import.pcap"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/import-pcap",
      expect.objectContaining({
        body: expect.stringContaining('"content_base64":"1MOyoQ=="')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/import-pcap",
      expect.objectContaining({
        body: expect.stringContaining(
          '"options":{"name_prefix":"trace","rewrite_src_enabled":true,"src_address":"20.0.0.1","src_mode":"Increment Host","src_count":32,"rewrite_dst_enabled":true,"dst_address":"30.0.0.1","dst_mode":"Random Host","dst_count":64,"rate_mode":"speedup","speedup":2,"ipg":1,"loop_count":3}'
        )
      })
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("import.yaml")).toBeInTheDocument();
      expect(screen.getAllByText("packet_1").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Ethernet/IPv4/TCP").length).toBeGreaterThan(0);
      expect(screen.getByText("Profile command accepted import.pcap")).toBeInTheDocument();
    });
  });
});
