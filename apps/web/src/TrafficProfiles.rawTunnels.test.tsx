import {
  App,
  describe,
  expect,
  expectRawGreChecksumValid,
  expectRawIpv4ChecksumValid,
  expectRawTransportChecksumValid,
  fireEvent,
  formatTestRawHex,
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
  useFieldEngineTarget,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Raw Tunnels", () => {
  installAppTestHooks();

  it("edits Packet Editor QinQ and MPLS decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RViKigZIEAAMiIRwAGQkAADIU/RQAAHBI0AABAEQAAEAAAATAAAAEEAQAMAAgAAA==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 88 a8 a0 64 81 00 00 c8 88 47 00 06 42 40 00 0c 85 3f 45 00 00 1c 12 34 00 00 40 11 00 00 10 00 00 01 30 00 00 01 04 01 00 0c 00 08 00 00";
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
                name: "qinq-mpls-stream",
                packet_type: "Ethernet/QinQ/MPLS/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x88a8" } },
                  { name: "802.1Q", fields: { vlan: 100 } },
                  { name: "802.1Q Inner", fields: { vlan: 200 } },
                  { name: "MPLS", fields: { label: 100, tc: 1, bos: 0, ttl: 64 } },
                  { name: "MPLS 2", fields: { label: 200, tc: 2, bos: 1, ttl: 63 } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 8 } }
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

    expect(await screen.findByLabelText("Raw field 802.1Q Priority")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field 802.1Q VLAN ID")).toHaveValue("100");
    expect(screen.getByLabelText("Raw field 802.1Q Inner VLAN ID")).toHaveValue("200");
    expect(screen.getByLabelText("Raw field 802.1Q CFI")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field 802.1Q Inner Priority")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field 802.1Q Inner CFI")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field MPLS Label")).toHaveValue("100");
    expect(screen.getByLabelText("Raw field MPLS Traffic class")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field MPLS Bottom of stack")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field MPLS TTL")).toHaveValue("64");
    expect(screen.getByLabelText("Raw field MPLS 2 Label")).toHaveValue("200");
    expect(screen.getByLabelText("Raw field MPLS 2 Traffic class")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field MPLS 2 Bottom of stack")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field MPLS 2 TTL")).toHaveValue("63");
    expect(screen.getByLabelText("Raw field IPv4 Source")).toHaveValue("16.0.0.1");
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("12");

    for (const rawField of [
      "802.1Q TCI",
      "802.1Q Inner TCI",
      "MPLS Header",
      "MPLS Bottom of stack",
      "MPLS 2 Header",
      "MPLS 2 Bottom of stack"
    ]) {
      expect(screen.queryByRole("button", { name: `Use Field Engine target for raw field ${rawField}` })).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText("Raw field 802.1Q Inner VLAN ID"), { target: { value: "201" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field 802.1Q Inner VLAN ID" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("81 00 00 c9 88 47");

    fireEvent.change(screen.getByLabelText("Raw field MPLS 2 Label"), { target: { value: "201" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field MPLS 2 Label" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain(
      "00 06 42 40 00 0c 95 3f"
    );

    fireEvent.change(screen.getByLabelText("Raw field UDP Destination port"), { target: { value: "53" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field UDP Destination port" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("04 01 00 35 00 08");

    const useRawQinqMplsFieldEngineTarget = async (rawField: string, targetName: string, splitBy: string) => {
      const targetButtonName = `Use Field Engine target for raw field ${rawField}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(`Raw field ${rawField}`)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      const body = readAdvancedVmBody();
      expect(body.split_by_var).toBe(splitBy);
      expect(body.instructions).toEqual(expect.arrayContaining([expect.objectContaining({ name: splitBy })]));
      return body;
    };

    await useRawQinqMplsFieldEngineTarget("802.1Q Priority", "VLAN priority inc", "vlan_priority");
    await useRawQinqMplsFieldEngineTarget("802.1Q CFI", "VLAN CFI/DEI vary", "vlan_cfi");
    await useRawQinqMplsFieldEngineTarget("802.1Q VLAN ID", "VLAN ID inc", "vlan_id");
    await useRawQinqMplsFieldEngineTarget("802.1Q Inner Priority", "VLAN inner priority inc", "vlan2_priority");
    await useRawQinqMplsFieldEngineTarget("802.1Q Inner CFI", "VLAN inner CFI/DEI vary", "vlan2_cfi");
    await useRawQinqMplsFieldEngineTarget("802.1Q Inner VLAN ID", "VLAN inner ID inc", "vlan2_id");
    await useRawQinqMplsFieldEngineTarget("MPLS Label", "MPLS label inc", "mpls_label");
    await useRawQinqMplsFieldEngineTarget("MPLS Traffic class", "MPLS TC inc", "mpls_tc");
    await useRawQinqMplsFieldEngineTarget("MPLS TTL", "MPLS TTL inc", "mpls_ttl");
    await useRawQinqMplsFieldEngineTarget("MPLS 2 Label", "Second MPLS label inc", "mpls_label2");
    await useRawQinqMplsFieldEngineTarget("MPLS 2 Traffic class", "Second MPLS TC inc", "mpls_label2_tc");
    await useRawQinqMplsFieldEngineTarget("MPLS 2 TTL", "Second MPLS TTL inc", "mpls_label2_ttl");
  }, 45_000);

  it("edits Packet Editor GRE and inner IPv4 UDP decoded fields into the raw packet draft", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 40 12 34 40 00 40 2f 00 00 0a 00 00 01 0a 00 00 02 30 00 08 00 12 34 56 78 00 00 00 07 45 2b 00 20 12 34 40 04 40 11 00 00 0a 02 00 0a 0a 02 00 14 7d 00 7d 64 00 0c 00 00 de ad be ef";
    const packetBinary = btoa(String.fromCharCode(...packetBytesFromRawHex(packetHex)));
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
                name: "gre-stream",
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 82,
                wire_length: 82,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
                  { name: "GRE", fields: { flags: "0x3000", protocol_type: "0x0800", key: 305419896, sequence: 7 } },
                  {
                    name: "Inner IPv4",
                    fields: {
                      dst: "10.2.0.20",
                      dscp: 10,
                      ecn: 3,
                      fragment_offset: 4,
                      identification: "0x1234",
                      protocol: 17,
                      src: "10.2.0.10"
                    }
                  },
                  { name: "Inner UDP", fields: { src: 32000, dst: 32100, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field GRE Flags/version")).toHaveValue("3000");
    expect(screen.getByLabelText("Raw field GRE Checksum present")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Routing present")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Key present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GRE Sequence present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GRE Strict source route")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Recursion control")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Reserved flags")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Version")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GRE Protocol type")).toHaveValue("0800");
    expect(screen.getByLabelText("Raw field GRE Key")).toHaveValue("305419896");
    expect(screen.getByLabelText("Raw field GRE Sequence")).toHaveValue("7");
    expect(screen.getByLabelText("Raw field Inner IPv4 DSCP")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field Inner IPv4 ECN")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field Inner IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field Inner IPv4 Reserved flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field Inner IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field Inner IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field Inner IPv4 Fragment offset")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field Inner IPv4 Source")).toHaveValue("10.2.0.10");
    expect(screen.getByLabelText("Raw field Inner IPv4 Destination")).toHaveValue("10.2.0.20");
    expect(screen.getByLabelText("Raw field Inner UDP Source port")).toHaveValue("32000");
    expect(screen.getByLabelText("Raw field Inner UDP Destination port")).toHaveValue("32100");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const greTargetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE protocol type inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE sequence inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 ID inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 DSCP inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 ECN inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 fragment offset inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 reserved flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 Don't fragment flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 More fragments flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    let selectedTarget = useFieldEngineTarget("GRE protocol type inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 2048, max_value: 2063, name: "gre_protocol_type", size: 2 }),
      expect.objectContaining({ name: "gre_protocol_type", pkt_offset: 36, type: "write_flow_var" })
    ]));
    expect(selectedTarget.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    selectedTarget = useFieldEngineTarget("GRE key inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 305419896, max_value: 305419911, name: "gre_key", size: 4 }),
      expect.objectContaining({ name: "gre_key", pkt_offset: 38, type: "write_flow_var" })
    ]));
    expect(selectedTarget.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    selectedTarget = useFieldEngineTarget("GRE sequence inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 7, max_value: 22, name: "gre_sequence", size: 4 }),
      expect.objectContaining({ name: "gre_sequence", pkt_offset: 42, type: "write_flow_var" })
    ]));

    const expectGreInnerChecksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({ l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
      ]));
    };
    selectedTarget = useFieldEngineTarget("GRE inner IPv4 src inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 10, max_value: 25, name: "gre_inner_ipv4_src", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv4_src", pkt_offset: 61, type: "write_flow_var" })
    ]));
    expectGreInnerChecksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner IPv4 dst inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 20, max_value: 35, name: "gre_inner_ipv4_dst", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv4_dst", pkt_offset: 65, type: "write_flow_var" })
    ]));
    expectGreInnerChecksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner IPv4 TTL inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 64, max_value: 79, name: "gre_inner_ipv4_ttl", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv4_ttl", pkt_offset: 54, type: "write_flow_var" })
    ]));
    expectGreInnerChecksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner UDP src port inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32000, max_value: 32015, name: "gre_inner_udp_src", size: 2 }),
      expect.objectContaining({ name: "gre_inner_udp_src", pkt_offset: 66, type: "write_flow_var" })
    ]));
    expectGreInnerChecksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner UDP dst port inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32100, max_value: 32115, name: "gre_inner_udp_dst", size: 2 }),
      expect.objectContaining({ name: "gre_inner_udp_dst", pkt_offset: 68, type: "write_flow_var" })
    ]));
    expectGreInnerChecksum(selectedTarget);

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));

    const expectNoRawGreFieldEngineTarget = (field: string) => {
      expect(screen.queryByRole("button", {
        name: `Use Field Engine target for raw field ${field}`
      })).not.toBeInTheDocument();
    };
    for (const aggregateField of [
      "GRE Flags/version",
      "GRE Checksum present",
      "GRE Routing present",
      "GRE Key present",
      "GRE Sequence present",
      "GRE Strict source route",
      "GRE Recursion control",
      "GRE Reserved flags",
      "GRE Version"
    ]) {
      expectNoRawGreFieldEngineTarget(aggregateField);
    }

    const useRawGreFieldEngineTarget = async (
      field: string,
      targetLabel: string,
      splitBy: string
    ) => {
      fireEvent.click(await screen.findByRole("button", {
        name: `Use Field Engine target for raw field ${field}`
      }));
      await screen.findByLabelText("Advanced VM JSON");
      expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
        name: `Use ${targetLabel} Field Engine target`
      }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
      const body = readAdvancedVmBody();
      expect(body.split_by_var).toBe(splitBy);
      fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      return body;
    };

    expect(await useRawGreFieldEngineTarget("GRE Protocol type", "GRE protocol type inc", "gre_protocol_type")).toEqual({
      instructions: [
        { init_value: 2048, max_value: 2063, min_value: 2048, name: "gre_protocol_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_protocol_type", pkt_offset: 36, type: "write_flow_var" }
      ],
      split_by_var: "gre_protocol_type"
    });

    expect(await useRawGreFieldEngineTarget("GRE Key", "GRE key inc", "gre_key")).toEqual({
      instructions: [
        { init_value: 305419896, max_value: 305419911, min_value: 305419896, name: "gre_key", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_key", pkt_offset: 38, type: "write_flow_var" }
      ],
      split_by_var: "gre_key"
    });

    expect(await useRawGreFieldEngineTarget("GRE Sequence", "GRE sequence inc", "gre_sequence")).toEqual({
      instructions: [
        { init_value: 7, max_value: 22, min_value: 7, name: "gre_sequence", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_sequence", pkt_offset: 42, type: "write_flow_var" }
      ],
      split_by_var: "gre_sequence"
    });

    expect(await useRawGreFieldEngineTarget("Inner IPv4 Source", "GRE inner IPv4 src inc", "gre_inner_ipv4_src")).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "gre_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_src", pkt_offset: 61, type: "write_flow_var" },
        { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv4_src"
    });

    expect(await useRawGreFieldEngineTarget("Inner IPv4 Destination", "GRE inner IPv4 dst inc", "gre_inner_ipv4_dst")).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "gre_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_dst", pkt_offset: 65, type: "write_flow_var" },
        { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv4_dst"
    });

    expect(await useRawGreFieldEngineTarget("Inner UDP Source port", "GRE inner UDP src port inc", "gre_inner_udp_src")).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32015, min_value: 32000, name: "gre_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_udp_src", pkt_offset: 66, type: "write_flow_var" },
        { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_udp_src"
    });

    expect(await useRawGreFieldEngineTarget("Inner UDP Destination port", "GRE inner UDP dst port inc", "gre_inner_udp_dst")).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32115, min_value: 32100, name: "gre_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_udp_dst", pkt_offset: 68, type: "write_flow_var" },
        { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_udp_dst"
    });

    const applyRawField = async (label: string, value: string) => {
      const field = await screen.findByLabelText(`Raw field ${label}`);
      const apply = screen.getByRole("button", { name: `Apply raw field ${label}` });
      await waitFor(() => expect(apply).not.toBeDisabled());
      fireEvent.change(field, { target: { value } });
      await waitFor(() => expect(apply).not.toBeDisabled());
      fireEvent.click(apply);
    };

    await applyRawField("GRE Checksum present", "1");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("b0 00 08 00");

    await applyRawField("GRE Checksum present", "0");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("30 00 08 00");

    await applyRawField("GRE Sequence present", "0");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("20 00 08 00");

    await applyRawField("GRE Sequence present", "1");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("30 00 08 00");

    await applyRawField("GRE Key", "305419897");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("30 00 08 00 12 34 56 79");

    await applyRawField("GRE Sequence", "8");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value).toContain("12 34 56 79 00 00 00 08");

    await applyRawField("Inner IPv4 Source", "10.2.0.11");
    const rawHexAfterGreInnerIpv4 = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterGreInnerIpv4.replace(/\s+/g, " ")).toContain(
      "0a 02 00 0b 0a 02 00 14"
    );
    expectRawIpv4ChecksumValid(rawHexAfterGreInnerIpv4, 14);
    expectRawIpv4ChecksumValid(rawHexAfterGreInnerIpv4, 46);

    await applyRawField("Inner UDP Destination port", "32101");
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "7d 00 7d 65 00 0c"
    );
  }, 60_000);

  it("repairs Packet Editor GRE checksum-present decoded field edits", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x44, 0x12, 0x34, 0x40, 0x00, 0x40, 0x2f,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02,
      0xb0, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x12, 0x34, 0x56, 0x78, 0x00, 0x00, 0x00, 0x07,
      0x45, 0x00, 0x00, 0x20, 0x43, 0x21, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x0a, 0x02, 0x00, 0x0a, 0x0a, 0x02, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x0c, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const packetHex = formatTestRawHex(rawPacket);
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
                name: "gre-checksum-stream",
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 82,
                wire_length: 82,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
                  {
                    name: "GRE",
                    fields: {
                      checksum: "0x0000",
                      checksum_present: true,
                      flags: "0xb000",
                      key: 305419896,
                      protocol_type: "0x0800",
                      sequence: 7
                    }
                  },
                  { name: "Inner IPv4", fields: { src: "10.2.0.10", dst: "10.2.0.20", protocol: 17 } },
                  { name: "Inner UDP", fields: { src: 32000, dst: 32100, length: 12, checksum: "0xbeef" } }
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

    expect(await screen.findByLabelText("Raw field GRE Checksum present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GRE Checksum")).toHaveValue("0000");
    expect(screen.getByLabelText("Raw field GRE Key")).toHaveValue("305419896");
    expect(screen.getByLabelText("Raw field GRE Sequence")).toHaveValue("7");
    expect(screen.getByLabelText("Raw field Inner IPv4 Source")).toHaveValue("10.2.0.10");
    expect(screen.getByLabelText("Raw field Inner UDP Destination port")).toHaveValue("32100");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const greTargetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE protocol type inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE sequence inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyRawField = async (label: string, value: string) => {
      const field = await screen.findByLabelText(`Raw field ${label}`);
      const apply = screen.getByRole("button", { name: `Apply raw field ${label}` });
      await waitFor(() => expect(apply).not.toBeDisabled());
      fireEvent.change(field, { target: { value } });
      await waitFor(() => expect(apply).not.toBeDisabled());
      fireEvent.click(apply);
    };

    await applyRawField("Inner IPv4 Source", "10.2.0.11");
    const rawHexAfterInnerIpv4 = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterInnerIpv4.replace(/\s+/g, " ")).toContain("0a 02 00 0b 0a 02 00 14");
    expectRawIpv4ChecksumValid(rawHexAfterInnerIpv4, 14);
    expectRawIpv4ChecksumValid(rawHexAfterInnerIpv4, 50);
    expectRawTransportChecksumValid(rawHexAfterInnerIpv4, { ipOffset: 50, ipVersion: 4, l4Offset: 70, protocol: 17 });
    expectRawGreChecksumValid(rawHexAfterInnerIpv4, { greOffset: 34, length: 48 });

    await applyRawField("Inner UDP Destination port", "32101");
    const rawHexAfterInnerUdp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterInnerUdp.replace(/\s+/g, " ")).toContain("7d 00 7d 65 00 0c");
    expectRawIpv4ChecksumValid(rawHexAfterInnerUdp, 14);
    expectRawIpv4ChecksumValid(rawHexAfterInnerUdp, 50);
    expectRawTransportChecksumValid(rawHexAfterInnerUdp, { ipOffset: 50, ipVersion: 4, l4Offset: 70, protocol: 17 });
    expectRawGreChecksumValid(rawHexAfterInnerUdp, { greOffset: 34, length: 48 });
  }, 20_000);

  it("builds GRE inner IPv6 Field Engine targets from raw Packet Editor bytes", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 2f 00 00 0a 00 00 01 0a 00 00 02 00 00 86 dd 6a b1 23 45 00 0c 11 2a 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 10 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 20 80 e8 81 4c 00 0c 00 00 de ad be ef";
    const packetBinary = btoa(String.fromCharCode(...packetBytesFromRawHex(packetHex)));
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
                name: "gre-ipv6-stream",
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
                  { name: "GRE", fields: { flags: "0x0000", protocol_type: "0x86DD" } },
                  {
                    name: "Inner IPv6",
                    fields: {
                      source: "2001:0db8:0040:0000:0000:0000:0000:0010",
                      destination: "2001:0db8:0040:0000:0000:0000:0000:0020",
                      hop_limit: 42,
                      next_header: 17
                    }
                  },
                  { name: "Inner UDP", fields: { src: 33000, dst: 33100, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field GRE Protocol type")).toHaveValue("86dd");
    expect(screen.getByLabelText("Raw field Inner IPv6 Traffic class")).toHaveValue("171");
    expect(screen.getByLabelText("Raw field Inner IPv6 Flow label")).toHaveValue("74565");
    expect(screen.getByLabelText("Raw field Inner IPv6 Source")).toHaveValue("2001:0db8:0040:0000:0000:0000:0000:0010");
    expect(screen.getByLabelText("Raw field Inner IPv6 Destination")).toHaveValue("2001:0db8:0040:0000:0000:0000:0000:0020");
    expect(screen.getByLabelText("Raw field Inner IPv6 Hop limit")).toHaveValue("42");
    expect(screen.getByLabelText("Raw field Inner UDP Source port")).toHaveValue("33000");
    expect(screen.getByLabelText("Raw field Inner UDP Destination port")).toHaveValue("33100");

    const useRawGreFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const greInnerIpv6TrafficClassRawFieldVm = await useRawGreFieldEngineTarget("Inner IPv6 Traffic class");
    expect(greInnerIpv6TrafficClassRawFieldVm).toEqual({
      instructions: [
        { init_value: 171, max_value: 186, min_value: 171, name: "gre_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gre_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 38, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_traffic_class"
    });

    const greInnerIpv6FlowLabelRawFieldVm = await useRawGreFieldEngineTarget("Inner IPv6 Flow label");
    expect(greInnerIpv6FlowLabelRawFieldVm).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12354, min_value: 0x12345, name: "gre_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gre_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 38, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_flow_label"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const greTargetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 traffic class inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 flow label inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const expectGreInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({ l2_len: 38, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" })
      ]));
    };

    let selectedTarget = useFieldEngineTarget("GRE inner IPv6 src inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 16, max_value: 31, min_value: 16, name: "gre_inner_ipv6_src", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv6_src", pkt_offset: 61, type: "write_flow_var" })
    ]));
    expectGreInnerIpv6Checksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner IPv6 dst inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32, max_value: 47, min_value: 32, name: "gre_inner_ipv6_dst", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv6_dst", pkt_offset: 77, type: "write_flow_var" })
    ]));
    expectGreInnerIpv6Checksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner IPv6 hop limit inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 42, max_value: 57, min_value: 42, name: "gre_inner_ipv6_hop_limit", size: 1 }),
      expect.objectContaining({ name: "gre_inner_ipv6_hop_limit", pkt_offset: 45, type: "write_flow_var" })
    ]));
    expect(selectedTarget.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    selectedTarget = useFieldEngineTarget("GRE inner IPv6 traffic class inc");
    expect(selectedTarget).toEqual({
      instructions: [
        { init_value: 171, max_value: 186, min_value: 171, name: "gre_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gre_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 38, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_traffic_class"
    });

    selectedTarget = useFieldEngineTarget("GRE inner IPv6 flow label inc");
    expect(selectedTarget).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12354, min_value: 0x12345, name: "gre_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gre_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 38, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_flow_label"
    });

    selectedTarget = useFieldEngineTarget("GRE inner UDP src port inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 33000, max_value: 33015, min_value: 33000, name: "gre_inner_udp_src", size: 2 }),
      expect.objectContaining({ name: "gre_inner_udp_src", pkt_offset: 78, type: "write_flow_var" })
    ]));
    expectGreInnerIpv6Checksum(selectedTarget);

    selectedTarget = useFieldEngineTarget("GRE inner UDP dst port inc");
    expect(selectedTarget.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 33100, max_value: 33115, min_value: 33100, name: "gre_inner_udp_dst", size: 2 }),
      expect.objectContaining({ name: "gre_inner_udp_dst", pkt_offset: 80, type: "write_flow_var" })
    ]));
    expectGreInnerIpv6Checksum(selectedTarget);
  }, 40_000);

  it("edits Packet Editor IPv6 extension headers and UDP decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAABwAQCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACLAAFAgAAAAARAAABEjRWeAQBBAIADAAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 1c 00 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 2c 00 05 02 00 00 00 00 11 00 00 01 12 34 56 78 04 01 04 02 00 0c 00 00 de ad be ef";
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
                name: "ipv6-extension-stream",
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 82,
                wire_length: 82,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 0 } },
                  { name: "IPv6 Hop-by-Hop", fields: { next_header: 44, hdr_ext_len: 0 } },
                  { name: "IPv6 Fragment", fields: { next_header: 17, offset: 0, more_fragments: 1, identification: "0x12345678" } },
                  { name: "UDP", fields: { src: 1025, dst: 1026, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field IPv6 Hop-by-Hop Next header")).toHaveValue("44");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Header extension length")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Options")).toHaveValue("050200000000");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Type")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Action")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Change en route")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Option number")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Length")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Router alert value")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Fragment Next header")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv6 Fragment Fragment offset")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Fragment Reserved bits")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Fragment More fragments")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field IPv6 Fragment Identification")).toHaveValue("12345678");
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("1026");
    expect(screen.queryByRole("button", {
      name: "Use Field Engine target for raw field IPv6 Hop-by-Hop Options"
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const routerAlertTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 Router Alert inc Field Engine target"
    });
    expect(routerAlertTarget).not.toBeDisabled();
    fireEvent.click(routerAlertTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_router_alert",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_router_alert",
          pkt_offset: 58,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_router_alert"
    });

    const optionActionTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 option action inc Field Engine target"
    });
    expect(optionActionTarget).not.toBeDisabled();
    fireEvent.click(optionActionTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_option_action",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 192,
          name: "ipv6_option_action",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 6,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_action"
    });

    const optionChangeTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 option change-en-route vary Field Engine target"
    });
    expect(optionChangeTarget).not.toBeDisabled();
    fireEvent.click(optionChangeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "ipv6_option_change_en_route",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 32,
          name: "ipv6_option_change_en_route",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 5,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_change_en_route"
    });

    const optionNumberTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 option number inc Field Engine target"
    });
    expect(optionNumberTarget).not.toBeDisabled();
    fireEvent.click(optionNumberTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 5,
          max_value: 8,
          min_value: 5,
          name: "ipv6_option_number",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 31,
          name: "ipv6_option_number",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_number"
    });

    const fragmentIdTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 fragment ID inc Field Engine target"
    });
    expect(fragmentIdTarget).not.toBeDisabled();
    fireEvent.click(fragmentIdTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 305419896,
          max_value: 305419899,
          min_value: 305419896,
          name: "ipv6_fragment_identification",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_fragment_identification",
          pkt_offset: 66,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_identification"
    });

    const fragmentOffsetTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 fragment offset inc Field Engine target"
    });
    expect(fragmentOffsetTarget).not.toBeDisabled();
    fireEvent.click(fragmentOffsetTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_fragment_offset",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xfff8,
          name: "ipv6_fragment_offset",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 3,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_offset"
    });

    const fragmentReservedBitsTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 fragment reserved bits inc Field Engine target"
    });
    expect(fragmentReservedBitsTarget).not.toBeDisabled();
    fireEvent.click(fragmentReservedBitsTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_fragment_reserved_bits",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 6,
          name: "ipv6_fragment_reserved_bits",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 1,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_reserved_bits"
    });

    const fragmentMoreFragmentsTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 fragment more fragments vary Field Engine target"
    });
    expect(fragmentMoreFragmentsTarget).not.toBeDisabled();
    fireEvent.click(fragmentMoreFragmentsTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "ipv6_fragment_more_fragments",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 1,
          name: "ipv6_fragment_more_fragments",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_more_fragments"
    });

    const useRawIpv6ExtensionFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const selectedTargetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(selectedTargetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    expect((await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Hop-by-Hop Option 1 Router alert value",
      "IPv6 Router Alert inc"
    )).split_by_var).toBe("ipv6_router_alert");
    expect((await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Hop-by-Hop Option 1 Action",
      "IPv6 option action inc"
    )).split_by_var).toBe("ipv6_option_action");
    expect((await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Hop-by-Hop Option 1 Change en route",
      "IPv6 option change-en-route vary"
    )).split_by_var).toBe("ipv6_option_change_en_route");
    expect((await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Hop-by-Hop Option 1 Option number",
      "IPv6 option number inc"
    )).split_by_var).toBe("ipv6_option_number");
    expect(await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Fragment Identification",
      "IPv6 fragment ID inc"
    )).toEqual({
      instructions: [
        {
          init_value: 305419896,
          max_value: 305419899,
          min_value: 305419896,
          name: "ipv6_fragment_identification",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_fragment_identification",
          pkt_offset: 66,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_identification"
    });
    expect(await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Fragment Fragment offset",
      "IPv6 fragment offset inc"
    )).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_fragment_offset",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xfff8,
          name: "ipv6_fragment_offset",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 3,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_offset"
    });
    expect(await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Fragment Reserved bits",
      "IPv6 fragment reserved bits inc"
    )).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_fragment_reserved_bits",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x0006,
          name: "ipv6_fragment_reserved_bits",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 1,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_reserved_bits"
    });
    expect(await useRawIpv6ExtensionFieldEngineTarget(
      "IPv6 Fragment More fragments",
      "IPv6 fragment more fragments vary"
    )).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "ipv6_fragment_more_fragments",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x0001,
          name: "ipv6_fragment_more_fragments",
          pkt_cast_size: 2,
          pkt_offset: 64,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_fragment_more_fragments"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyRouterAlertValue = screen.getByRole("button", {
      name: "Apply raw field IPv6 Hop-by-Hop Option 1 Router alert value"
    });
    await waitFor(() => expect(applyRouterAlertValue).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Router alert value"), {
      target: { value: "1" }
    });
    fireEvent.click(applyRouterAlertValue);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "2c 00 05 02 00 01 00 00 11 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv6 Fragment More fragments"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv6 Fragment More fragments" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 00 00 00 12 34 56 78"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv6 Fragment Identification"), { target: { value: "12345679" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv6 Fragment Identification" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 00 00 00 12 34 56 79"
    );

    fireEvent.change(screen.getByLabelText("Raw field UDP Destination port"), { target: { value: "1027" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field UDP Destination port" }));
    const rawHexAfterIpv6Udp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterIpv6Udp.replace(/\s+/g, " ")).toContain(
      "04 01 04 03 00 0c"
    );
    expectRawTransportChecksumValid(rawHexAfterIpv6Udp, { ipOffset: 14, ipVersion: 6, l4Offset: 70, protocol: 17 });
  }, 90_000);

  it("exposes Packet Editor IPv6 Jumbo Payload option as a Field Engine target", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAAAAAQCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACLADCBAAABdwRAAABEjRWeAQBBAIADAAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 00 00 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 2c 00 c2 04 00 00 05 dc 11 00 00 01 12 34 56 78 04 01 04 02 00 0c 00 00 de ad be ef";
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
                name: "ipv6-jumbo-stream",
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 82,
                wire_length: 82,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 0 } },
                  { name: "IPv6 Hop-by-Hop", fields: { next_header: 44, hdr_ext_len: 0 } },
                  { name: "IPv6 Fragment", fields: { next_header: 17, offset: 0, more_fragments: 1, identification: "0x12345678" } },
                  { name: "UDP", fields: { src: 1025, dst: 1026, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field IPv6 Payload length")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Type")).toHaveValue("194");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Action")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Change en route")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Option number")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Length")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Jumbo payload length")).toHaveValue("1500");

    const jumboPayloadRawFieldVm = await selectRawPacketFieldEngineTarget(
      "IPv6 Hop-by-Hop Option 1 Jumbo payload length",
      "IPv6 Jumbo Payload inc"
    );
    expect(jumboPayloadRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 1500,
          max_value: 1503,
          min_value: 1500,
          name: "ipv6_jumbo_payload_length",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_jumbo_payload_length",
          pkt_offset: 58,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_jumbo_payload_length"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const jumboPayloadTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 Jumbo Payload inc Field Engine target"
    });
    expect(jumboPayloadTarget).not.toBeDisabled();
    fireEvent.click(jumboPayloadTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1500,
          max_value: 1503,
          min_value: 1500,
          name: "ipv6_jumbo_payload_length",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_jumbo_payload_length",
          pkt_offset: 58,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_jumbo_payload_length"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyJumboPayloadLength = screen.getByRole("button", {
      name: "Apply raw field IPv6 Hop-by-Hop Option 1 Jumbo payload length"
    });
    await waitFor(() => expect(applyJumboPayloadLength).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Raw field IPv6 Hop-by-Hop Option 1 Jumbo payload length"), {
      target: { value: "1501" }
    });
    fireEvent.click(applyJumboPayloadLength);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "2c 00 c2 04 00 00 05 dd 11 00"
    );
  }, 20_000);

  it("uses IPv6 Destination Options packet editor rows as Field Engine targets", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd " +
      "60 00 00 00 00 14 3c 40 " +
      "20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 " +
      "20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 " +
      "11 00 22 02 be ef 00 00 " +
      "04 01 04 02 00 0c 00 00 de ad be ef";
    const rawPacket = packetBytesFromRawHex(packetHex);
    const rawIpv6DestinationOptionsStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet"
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawIpv6DestinationOptionsStream,
      "Ethernet/IPv6/UDP",
      [
        { name: "Ethernet", fields: { type: "0x86dd" } },
        { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 60 } },
        { name: "IPv6 Destination Options", fields: { next_header: 17, hdr_ext_len: 0 } },
        { name: "UDP", fields: { src: 1025, dst: 1026, length: 12 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));

    expect(await screen.findByLabelText("Raw field IPv6 Destination Options Next header")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Header extension length")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Options")).toHaveValue("2202beef0000");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Type")).toHaveValue("34");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Action")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Change en route")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Option number")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Length")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 Destination Options Option 1 Data")).toHaveValue("beef");
    expect(screen.getByLabelText("Raw field UDP Source port")).toHaveValue("1025");
    expect(screen.queryByRole("button", {
      name: "Use Field Engine target for raw field IPv6 Destination Options Options"
    })).not.toBeInTheDocument();

    const actionRawFieldVm = await selectRawPacketFieldEngineTarget(
      "IPv6 Destination Options Option 1 Action",
      "IPv6 option action inc"
    );
    expect(actionRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_option_action",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0xc0,
          name: "ipv6_option_action",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 6,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_action"
    });
    expect(actionRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/checksum/) })
    ]));

    const changeRawFieldVm = await selectRawPacketFieldEngineTarget(
      "IPv6 Destination Options Option 1 Change en route",
      "IPv6 option change-en-route vary"
    );
    expect(changeRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "ipv6_option_change_en_route",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x20,
          name: "ipv6_option_change_en_route",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 5,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_change_en_route"
    });
    expect(changeRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/checksum/) })
    ]));

    const numberRawFieldVm = await selectRawPacketFieldEngineTarget(
      "IPv6 Destination Options Option 1 Option number",
      "IPv6 option number inc"
    );
    expect(numberRawFieldVm).toEqual({
      instructions: [
        {
          init_value: 2,
          max_value: 5,
          min_value: 2,
          name: "ipv6_option_number",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x1f,
          name: "ipv6_option_number",
          pkt_cast_size: 1,
          pkt_offset: 56,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_option_number"
    });
    expect(numberRawFieldVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/checksum/) })
    ]));
  }, 20_000);

  it("exposes Packet Editor IPv6 AH fields as Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAABwzQCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACEQIAAAECAwQAAAAHqrvM3QQBBAIADAAA3q2+7w==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 1c 33 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 11 02 00 00 01 02 03 04 00 00 00 07 aa bb cc dd 04 01 04 02 00 0c 00 00 de ad be ef";
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
                name: "ipv6-ah-stream",
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 82,
                wire_length: 82,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 51 } },
                  { name: "IPv6 AH", fields: { next_header: 17, payload_length: 2, spi: "0x01020304", sequence: 7 } },
                  { name: "UDP", fields: { src: 1025, dst: 1026, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field IPv6 AH Next header")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv6 AH Payload length")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 AH SPI")).toHaveValue("01020304");
    expect(screen.getByLabelText("Raw field IPv6 AH Sequence")).toHaveValue("7");
    expect(screen.getByLabelText("Raw field UDP Source port")).toHaveValue("1025");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const ahSpiTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 AH SPI inc Field Engine target"
    });
    expect(ahSpiTarget).not.toBeDisabled();
    fireEvent.click(ahSpiTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 16909060,
          max_value: 16909063,
          min_value: 16909060,
          name: "ipv6_ah_spi",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_ah_spi",
          pkt_offset: 58,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_ah_spi"
    });

    const ahSequenceTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 AH sequence inc Field Engine target"
    });
    expect(ahSequenceTarget).not.toBeDisabled();
    fireEvent.click(ahSequenceTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 7,
          max_value: 10,
          min_value: 7,
          name: "ipv6_ah_sequence",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_ah_sequence",
          pkt_offset: 62,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_ah_sequence"
    });

    const useRawIpv6AhFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field IPv6 AH ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const selectedTargetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(selectedTargetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    expect((await useRawIpv6AhFieldEngineTarget("SPI", "IPv6 AH SPI inc")).split_by_var).toBe("ipv6_ah_spi");
    expect((await useRawIpv6AhFieldEngineTarget("Sequence", "IPv6 AH sequence inc")).split_by_var)
      .toBe("ipv6_ah_sequence");

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyAhSpi = screen.getByRole("button", { name: "Apply raw field IPv6 AH SPI" });
    fireEvent.change(screen.getByLabelText("Raw field IPv6 AH SPI"), { target: { value: "01020305" } });
    await waitFor(() => expect(applyAhSpi).not.toBeDisabled());
    fireEvent.click(applyAhSpi);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 02 00 00 01 02 03 05 00 00 00 07 aa bb cc dd"
    );

    const applyAhSequence = screen.getByRole("button", { name: "Apply raw field IPv6 AH Sequence" });
    fireEvent.change(screen.getByLabelText("Raw field IPv6 AH Sequence"), { target: { value: "8" } });
    await waitFor(() => expect(applyAhSequence).not.toBeDisabled());
    fireEvent.click(applyAhSequence);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 02 00 00 01 02 03 05 00 00 00 08 aa bb cc dd"
    );
  }, 30_000);

  it("exposes Packet Editor IPv6 Routing fields as Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAACQrQCABDbgAAAAAAAAAAAAAAAEgAQ24AAAAAAAAAAAAAAACEQIAAQAAAAAgAQ24AAAAAAAAAAAAAAADBAEEAgAMAADerb7v";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 24 2b 40 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 01 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 02 11 02 00 01 00 00 00 00 20 01 0d b8 00 00 00 00 00 00 00 00 00 00 00 03 04 01 04 02 00 0c 00 00 de ad be ef";
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
                name: "ipv6-routing-stream",
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..`." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  { name: "IPv6", fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: 43 } },
                  { name: "IPv6 Routing", fields: { next_header: 17, routing_type: 0, segments_left: 1 } },
                  { name: "UDP", fields: { src: 1025, dst: 1026, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field IPv6 Routing Next header")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv6 Routing Header extension length")).toHaveValue("2");
    expect(screen.getByLabelText("Raw field IPv6 Routing Routing type")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv6 Routing Segments left")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field IPv6 Routing Data")).toHaveValue(
      "0000000020010db8000000000000000000000003"
    );
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("1026");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const routingTypeTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 routing type inc Field Engine target"
    });
    expect(routingTypeTarget).not.toBeDisabled();
    fireEvent.click(routingTypeTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv6_routing_type",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_routing_type",
          pkt_offset: 56,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_routing_type"
    });

    const segmentsLeftTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 routing segments left inc Field Engine target"
    });
    expect(segmentsLeftTarget).not.toBeDisabled();
    fireEvent.click(segmentsLeftTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 4,
          min_value: 1,
          name: "ipv6_routing_segments_left",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_routing_segments_left",
          pkt_offset: 57,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_routing_segments_left"
    });

    const useRawIpv6RoutingFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field IPv6 Routing ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      const selectedTargetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(selectedTargetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    expect((await useRawIpv6RoutingFieldEngineTarget("Routing type", "IPv6 routing type inc")).split_by_var)
      .toBe("ipv6_routing_type");
    expect((await useRawIpv6RoutingFieldEngineTarget("Segments left", "IPv6 routing segments left inc")).split_by_var)
      .toBe("ipv6_routing_segments_left");

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyRoutingType = screen.getByRole("button", { name: "Apply raw field IPv6 Routing Routing type" });
    fireEvent.change(screen.getByLabelText("Raw field IPv6 Routing Routing type"), { target: { value: "1" } });
    await waitFor(() => expect(applyRoutingType).not.toBeDisabled());
    fireEvent.click(applyRoutingType);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 02 01 01 00 00 00 00 20 01"
    );

    const applySegmentsLeft = screen.getByRole("button", { name: "Apply raw field IPv6 Routing Segments left" });
    fireEvent.change(screen.getByLabelText("Raw field IPv6 Routing Segments left"), { target: { value: "2" } });
    await waitFor(() => expect(applySegmentsLeft).not.toBeDisabled());
    fireEvent.click(applySegmentsLeft);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "11 02 01 02 00 00 00 00 20 01"
    );
  }, 30_000);

  it("edits Packet Editor VXLAN decoded fields into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAABSEjRAAEARAACsEAABrBAAAgTSErUAPgAACAAAAAAQAACqu8zd7v8AESIzRFUIAEUAACBDIQAAKBEAAAoBAAoKAQAUfQB9ZAAMAADerb7v";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 52 12 34 40 00 40 11 00 00 ac 10 00 01 ac 10 00 02 04 d2 12 b5 00 3e 00 00 08 00 00 00 00 10 00 00 aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 20 43 21 00 00 28 11 00 00 0a 01 00 0a 0a 01 00 14 7d 00 7d 64 00 0c 00 00 de ad be ef";
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
                name: "vxlan-stream",
                packet_type: "Ethernet/IPv4/UDP/VXLAN",
                frame_length: 96,
                wire_length: 96,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "172.16.0.1", dst: "172.16.0.2", protocol: 17 } },
                  { name: "UDP", fields: { src: 1234, dst: 4789, length: 62 } },
                  { name: "VXLAN", fields: { vni: 4096 } },
                  { name: "Inner Ethernet", fields: { src: "00:11:22:33:44:55", dst: "aa:bb:cc:dd:ee:ff" } },
                  { name: "Inner IPv4", fields: { src: "10.1.0.10", dst: "10.1.0.20", protocol: 17 } },
                  { name: "Inner UDP", fields: { src: 32000, dst: 32100, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field UDP Destination port")).toHaveValue("4789");
    expect(screen.getByLabelText("Raw field VXLAN Flags")).toHaveValue("08");
    expect(screen.getByLabelText("Raw field VXLAN I flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field VXLAN Reserved")).toHaveValue("000000");
    expect(screen.getByLabelText("Raw field VXLAN VNI")).toHaveValue("4096");
    expect(screen.getByLabelText("Raw field VXLAN Reserved 2")).toHaveValue("00");
    expect(screen.getByLabelText("Raw field VXLAN Inner Ethernet Destination")).toHaveValue("aa:bb:cc:dd:ee:ff");
    expect(screen.getByLabelText("Raw field VXLAN Inner Ethernet Source")).toHaveValue("00:11:22:33:44:55");
    expect(screen.getByLabelText("Raw field VXLAN Inner Ethernet EtherType")).toHaveValue("0800");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 Source")).toHaveValue("10.1.0.10");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 Destination")).toHaveValue("10.1.0.20");
    expect(screen.getByLabelText("Raw field VXLAN Inner UDP Source port")).toHaveValue("32000");
    expect(screen.getByLabelText("Raw field VXLAN Inner UDP Destination port")).toHaveValue("32100");

    fireEvent.change(screen.getByLabelText("Raw field VXLAN I flag"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN I flag" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "00 00 00 00 00 10 00 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field VXLAN I flag"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN I flag" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 00 00 00 00 10 00 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field VXLAN VNI"), { target: { value: "4097" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN VNI" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 00 00 00 00 10 01 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field VXLAN Reserved"), { target: { value: "010203" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN Reserved" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 01 02 03 00 10 01 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field VXLAN Reserved 2"), { target: { value: "7f" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN Reserved 2" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 01 02 03 00 10 01 7f"
    );

    fireEvent.change(screen.getByLabelText("Raw field VXLAN Inner IPv4 Source"), { target: { value: "10.1.0.11" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN Inner IPv4 Source" }));
    const rawHexAfterVxlanInnerIpv4 = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterVxlanInnerIpv4.replace(/\s+/g, " ")).toContain(
      "0a 01 00 0b 0a 01 00 14"
    );
    expectRawIpv4ChecksumValid(rawHexAfterVxlanInnerIpv4, 14);
    expectRawIpv4ChecksumValid(rawHexAfterVxlanInnerIpv4, 64);

    const vxlanChecksumSeed = packetBytesFromRawHex(rawHexAfterVxlanInnerIpv4);
    vxlanChecksumSeed[90] = 0xbe;
    vxlanChecksumSeed[91] = 0xef;
    fireEvent.change(screen.getByLabelText("Raw packet hex"), { target: { value: formatTestRawHex(vxlanChecksumSeed) } });
    await waitFor(() => expect(screen.getByLabelText("Raw field VXLAN Inner UDP Destination port")).toHaveValue("32100"));
    fireEvent.change(screen.getByLabelText("Raw field VXLAN Inner UDP Destination port"), { target: { value: "32101" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field VXLAN Inner UDP Destination port" }));
    const rawHexAfterVxlanInnerUdp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterVxlanInnerUdp.replace(/\s+/g, " ")).toContain(
      "7d 00 7d 65 00 0c"
    );
    expectRawTransportChecksumValid(rawHexAfterVxlanInnerUdp, { ipOffset: 64, ipVersion: 4, l4Offset: 84, protocol: 17 });

    const useRawVxlanFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field VXLAN ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    for (const staticOnlyField of ["Flags", "Reserved", "Reserved 2"]) {
      expect(screen.queryByRole("button", {
        name: `Use Field Engine target for raw field VXLAN ${staticOnlyField}`
      })).not.toBeInTheDocument();
    }

    const vxlanIFlagRawFieldVm = await useRawVxlanFieldEngineTarget("I flag");
    expect(vxlanIFlagRawFieldVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_i_flag", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x08, name: "vxlan_i_flag", pkt_cast_size: 1, pkt_offset: 42, shift: 3, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_i_flag"
    });

    const vxlanVniRawFieldVm = await useRawVxlanFieldEngineTarget("VNI");
    expect(vxlanVniRawFieldVm).toEqual({
      instructions: [
        { init_value: 4097, max_value: 4112, min_value: 4097, name: "vxlan_vni", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xFFFFFF00, name: "vxlan_vni", pkt_cast_size: 4, pkt_offset: 46, shift: 8, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_vni"
    });

    const vxlanInnerMacDestinationRawFieldVm = await useRawVxlanFieldEngineTarget("Inner Ethernet Destination");
    expect(vxlanInnerMacDestinationRawFieldVm).toEqual({
      instructions: [
        { init_value: 61183, max_value: 61198, min_value: 61183, name: "vxlan_inner_mac_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_mac_dst", pkt_offset: 54, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_mac_dst"
    });

    const vxlanInnerMacSourceRawFieldVm = await useRawVxlanFieldEngineTarget("Inner Ethernet Source");
    expect(vxlanInnerMacSourceRawFieldVm).toEqual({
      instructions: [
        { init_value: 85, max_value: 100, min_value: 85, name: "vxlan_inner_mac_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_mac_src", pkt_offset: 61, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_mac_src"
    });

    const vxlanInnerEtherTypeRawFieldVm = await useRawVxlanFieldEngineTarget("Inner Ethernet EtherType");
    expect(vxlanInnerEtherTypeRawFieldVm).toEqual({
      instructions: [
        { init_value: 2048, max_value: 2063, min_value: 2048, name: "vxlan_inner_ether_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ether_type", pkt_offset: 62, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_ether_type"
    });

    const vxlanInnerIpv4SourceRawFieldVm = await useRawVxlanFieldEngineTarget("Inner IPv4 Source");
    expect(vxlanInnerIpv4SourceRawFieldVm).toEqual({
      instructions: [
        { init_value: 11, max_value: 26, min_value: 11, name: "vxlan_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_src", pkt_offset: 79, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_src"
    });

    const vxlanInnerIpv4DestinationRawFieldVm = await useRawVxlanFieldEngineTarget("Inner IPv4 Destination");
    expect(vxlanInnerIpv4DestinationRawFieldVm).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "vxlan_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_dst", pkt_offset: 83, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_dst"
    });

    const vxlanInnerUdpSourceRawFieldVm = await useRawVxlanFieldEngineTarget("Inner UDP Source port");
    expect(vxlanInnerUdpSourceRawFieldVm).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32015, min_value: 32000, name: "vxlan_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_src", pkt_offset: 84, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_src"
    });

    const vxlanInnerUdpDestinationRawFieldVm = await useRawVxlanFieldEngineTarget("Inner UDP Destination port");
    expect(vxlanInnerUdpDestinationRawFieldVm).toEqual({
      instructions: [
        { init_value: 32101, max_value: 32116, min_value: 32101, name: "vxlan_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_dst", pkt_offset: 86, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_dst"
    });
  }, 60_000);

  it("uses VXLAN inner IPv6 Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x66, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x52, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x86, 0xdd,
      0x6a, 0xb1, 0x23, 0x45, 0x00, 0x0c, 0x11, 0x28,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x50, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x60, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x0c, 0x00, 0x00,
      0xde, 0xad, 0xbe, 0xef
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const packetHex = formatTestRawHex(rawPacket);
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
                name: "vxlan-ipv6-stream",
                packet_type: "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv6/UDP",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 82, checksum: "0xbeef" } },
                  { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
                  { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x86dd" } },
                  {
                    name: "Inner Internet Protocol v6",
                    fields: {
                      source: "2001:db8:50::10",
                      destination: "2001:db8:60::20",
                      hop_limit: 40,
                      next_header: "UDP"
                    }
                  },
                  { name: "Inner UDP", fields: { source_port: 32000, destination_port: 32100, length: 12, checksum: "0x0000" } }
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

    expect(await screen.findByLabelText("Raw field VXLAN Inner IPv6 Traffic class")).toHaveValue("171");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv6 Flow label")).toHaveValue("74565");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv6 Hop limit")).toHaveValue("40");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv6 Source")).toHaveValue("2001:0db8:0050:0000:0000:0000:0000:0010");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv6 Destination")).toHaveValue("2001:0db8:0060:0000:0000:0000:0000:0020");
    expect(screen.getByLabelText("Raw field VXLAN Inner UDP Source port")).toHaveValue("32000");
    expect(screen.getByLabelText("Raw field VXLAN Inner UDP Destination port")).toHaveValue("32100");

    const useRawVxlanFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field VXLAN ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const trafficClassVm = await useRawVxlanFieldEngineTarget("Inner IPv6 Traffic class");
    expect(trafficClassVm).toEqual({
      instructions: [
        { init_value: 171, max_value: 186, min_value: 171, name: "vxlan_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "vxlan_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 64, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_traffic_class"
    });

    const flowLabelVm = await useRawVxlanFieldEngineTarget("Inner IPv6 Flow label");
    expect(flowLabelVm).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12354, min_value: 0x12345, name: "vxlan_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "vxlan_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 64, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_flow_label"
    });

    const expectVxlanInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({ l2_len: 64, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" })
      ]));
    };

    const sourceVm = await useRawVxlanFieldEngineTarget("Inner IPv6 Source");
    expect(sourceVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 16, max_value: 31, min_value: 16, name: "vxlan_inner_ipv6_src", size: 1 }),
      expect.objectContaining({ name: "vxlan_inner_ipv6_src", pkt_offset: 87, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(sourceVm);
    expect(sourceVm.split_by_var).toBe("vxlan_inner_ipv6_src");

    const destinationVm = await useRawVxlanFieldEngineTarget("Inner IPv6 Destination");
    expect(destinationVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32, max_value: 47, min_value: 32, name: "vxlan_inner_ipv6_dst", size: 1 }),
      expect.objectContaining({ name: "vxlan_inner_ipv6_dst", pkt_offset: 103, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(destinationVm);
    expect(destinationVm.split_by_var).toBe("vxlan_inner_ipv6_dst");

    const hopLimitVm = await useRawVxlanFieldEngineTarget("Inner IPv6 Hop limit");
    expect(hopLimitVm).toEqual({
      instructions: [
        { init_value: 40, max_value: 55, min_value: 40, name: "vxlan_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_hop_limit", pkt_offset: 71, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_hop_limit"
    });

    const udpSourceVm = await useRawVxlanFieldEngineTarget("Inner UDP Source port");
    expect(udpSourceVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32000, max_value: 32015, min_value: 32000, name: "vxlan_inner_udp_src", size: 2 }),
      expect.objectContaining({ name: "vxlan_inner_udp_src", pkt_offset: 104, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(udpSourceVm);
    expect(udpSourceVm.split_by_var).toBe("vxlan_inner_udp_src");

    const udpDestinationVm = await useRawVxlanFieldEngineTarget("Inner UDP Destination port");
    expect(udpDestinationVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32100, max_value: 32115, min_value: 32100, name: "vxlan_inner_udp_dst", size: 2 }),
      expect.objectContaining({ name: "vxlan_inner_udp_dst", pkt_offset: 106, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(udpDestinationVm);
    expect(udpDestinationVm.split_by_var).toBe("vxlan_inner_udp_dst");
  }, 60_000);

  it("edits Packet Editor GTP-U decoded fields into the raw packet draft", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 08 68 08 68 00 38 00 00 37 ff 00 28 12 34 56 78 00 07 03 40 01 fd e8 00 45 2b 00 20 12 34 40 00 3f 11 00 00 0a 09 00 01 0a 09 00 02 13 88 17 70 00 0c 00 00 de ad be ef";
    const packetBinary = btoa(String.fromCharCode(...packetBytesFromRawHex(packetHex)));
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
                name: "gtpu-stream",
                packet_type: "Ethernet/IPv4/UDP/GTP-U",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 2152, dst: 2152, length: 56 } },
                  {
                    name: "GTP-U",
                    fields: { flags: "0x37", message_type: 255, teid: "0x12345678", sequence: 7, n_pdu: 3 }
                  },
                  { name: "GTP-U Extension", fields: { udp_port: 65000 } },
                  {
                    name: "Inner IPv4",
                    fields: {
                      dst: "10.9.0.2",
                      dscp: 10,
                      ecn: 3,
                      fragment_offset: 0,
                      identification: "0x1234",
                      protocol: 17,
                      src: "10.9.0.1"
                    }
                  },
                  { name: "Inner UDP", fields: { src: 5000, dst: 6000, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field GTP-U Flags")).toHaveValue("37");
    expect(screen.getByLabelText("Raw field GTP-U Version")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Protocol type")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Reserved flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Extension header present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Sequence present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U N-PDU present")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Message type")).toHaveValue("255");
    expect(screen.getByLabelText("Raw field GTP-U Message length")).toHaveValue("40");
    expect(screen.getByLabelText("Raw field GTP-U TEID")).toHaveValue("12345678");
    expect(screen.getByLabelText("Raw field GTP-U Sequence")).toHaveValue("7");
    expect(screen.getByLabelText("Raw field GTP-U N-PDU")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field GTP-U Next extension header")).toHaveValue("40");
    expect(screen.getByLabelText("Raw field GTP-U UDP Port Extension UDP port")).toHaveValue("65000");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 DSCP")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 ECN")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Reserved flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Fragment offset")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Source")).toHaveValue("10.9.0.1");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Destination")).toHaveValue("10.9.0.2");
    expect(screen.getByLabelText("Raw field GTP-U Inner UDP Source port")).toHaveValue("5000");
    expect(screen.getByLabelText("Raw field GTP-U Inner UDP Destination port")).toHaveValue("6000");

    fireEvent.change(screen.getByLabelText("Raw field GTP-U Message length"), { target: { value: "41" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U Message length" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "37 ff 00 29 12 34 56 78"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U Message length"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U Message length" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "37 ff 00 28 12 34 56 78"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U N-PDU present"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U N-PDU present" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "36 ff 00 28 12 34 56 78"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U N-PDU present"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U N-PDU present" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "37 ff 00 28 12 34 56 78"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U TEID"), { target: { value: "12345679" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U TEID" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "37 ff 00 28 12 34 56 79"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U UDP Port Extension UDP port"), { target: { value: "65001" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U UDP Port Extension UDP port" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "01 fd e9 00"
    );

    fireEvent.change(screen.getByLabelText("Raw field GTP-U Inner IPv4 Source"), { target: { value: "10.9.0.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U Inner IPv4 Source" }));
    const rawHexAfterGtpuInnerIpv4 = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterGtpuInnerIpv4.replace(/\s+/g, " ")).toContain(
      "0a 09 00 03 0a 09 00 02"
    );
    expectRawIpv4ChecksumValid(rawHexAfterGtpuInnerIpv4, 14);
    expectRawIpv4ChecksumValid(rawHexAfterGtpuInnerIpv4, 58);

    const gtpuChecksumSeed = packetBytesFromRawHex(rawHexAfterGtpuInnerIpv4);
    gtpuChecksumSeed[84] = 0xbe;
    gtpuChecksumSeed[85] = 0xef;
    fireEvent.change(screen.getByLabelText("Raw packet hex"), { target: { value: formatTestRawHex(gtpuChecksumSeed) } });
    await waitFor(() => expect(screen.getByLabelText("Raw field GTP-U Inner UDP Destination port")).toHaveValue("6000"));

    fireEvent.change(screen.getByLabelText("Raw field GTP-U Inner UDP Destination port"), { target: { value: "6001" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field GTP-U Inner UDP Destination port" }));
    const rawHexAfterGtpuInnerUdp = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterGtpuInnerUdp.replace(/\s+/g, " ")).toContain(
      "13 88 17 71 00 0c"
    );
    expectRawTransportChecksumValid(rawHexAfterGtpuInnerUdp, { ipOffset: 58, ipVersion: 4, l4Offset: 78, protocol: 17 });

    const useRawGtpuFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field GTP-U ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    for (const aggregateField of [
      "Flags",
      "Version",
      "Protocol type",
      "Reserved flag",
      "Extension header present",
      "Sequence present",
      "N-PDU present",
      "Message length",
      "Next extension header"
    ]) {
      expect(screen.queryByRole("button", {
        name: `Use Field Engine target for raw field GTP-U ${aggregateField}`
      })).not.toBeInTheDocument();
    }

    const gtpuMessageTypeRawFieldVm = await useRawGtpuFieldEngineTarget("Message type");
    expect(gtpuMessageTypeRawFieldVm).toEqual({
      instructions: [
        { init_value: 255, max_value: 255, min_value: 255, name: "gtpu_message_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_message_type", pkt_offset: 43, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_message_type"
    });

    const gtpuTeidRawFieldVm = await useRawGtpuFieldEngineTarget("TEID");
    expect(gtpuTeidRawFieldVm).toEqual({
      instructions: [
        { init_value: 305419897, max_value: 305419912, min_value: 305419897, name: "gtpu_teid", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_teid", pkt_offset: 46, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_teid"
    });

    const gtpuSequenceRawFieldVm = await useRawGtpuFieldEngineTarget("Sequence");
    expect(gtpuSequenceRawFieldVm).toEqual({
      instructions: [
        { init_value: 7, max_value: 22, min_value: 7, name: "gtpu_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_sequence", pkt_offset: 50, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_sequence"
    });

    const gtpuNpduRawFieldVm = await useRawGtpuFieldEngineTarget("N-PDU");
    expect(gtpuNpduRawFieldVm).toEqual({
      instructions: [
        { init_value: 3, max_value: 18, min_value: 3, name: "gtpu_npdu", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_npdu", pkt_offset: 52, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_npdu"
    });

    const gtpuExtensionUdpPortRawFieldVm = await useRawGtpuFieldEngineTarget("UDP Port Extension UDP port");
    expect(gtpuExtensionUdpPortRawFieldVm).toEqual({
      instructions: [
        { init_value: 65001, max_value: 65016, min_value: 65001, name: "gtpu_extension_udp_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_extension_udp_port", pkt_offset: 55, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_extension_udp_port"
    });

    const gtpuInnerIpv4SourceRawFieldVm = await useRawGtpuFieldEngineTarget("Inner IPv4 Source");
    expect(gtpuInnerIpv4SourceRawFieldVm).toEqual({
      instructions: [
        { init_value: 3, max_value: 18, min_value: 3, name: "gtpu_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_src", pkt_offset: 73, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_src"
    });

    const gtpuInnerIpv4DestinationRawFieldVm = await useRawGtpuFieldEngineTarget("Inner IPv4 Destination");
    expect(gtpuInnerIpv4DestinationRawFieldVm).toEqual({
      instructions: [
        { init_value: 2, max_value: 17, min_value: 2, name: "gtpu_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_dst", pkt_offset: 77, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_dst"
    });

    const gtpuInnerUdpSourceRawFieldVm = await useRawGtpuFieldEngineTarget("Inner UDP Source port");
    expect(gtpuInnerUdpSourceRawFieldVm).toEqual({
      instructions: [
        { init_value: 5000, max_value: 5015, min_value: 5000, name: "gtpu_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_src", pkt_offset: 78, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_src"
    });

    const gtpuInnerUdpDestinationRawFieldVm = await useRawGtpuFieldEngineTarget("Inner UDP Destination port");
    expect(gtpuInnerUdpDestinationRawFieldVm).toEqual({
      instructions: [
        { init_value: 6001, max_value: 6016, min_value: 6001, name: "gtpu_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_dst", pkt_offset: 80, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_dst"
    });
  }, 60_000);

  it("uses GTP-U inner IPv6 Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 60 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 08 68 08 68 00 4c 00 00 37 ff 00 3c 12 34 56 78 00 07 03 40 01 fd e8 00 6a b1 23 45 00 0c 11 2a 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 10 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 20 80 e8 81 4c 00 0c 00 00 de ad be ef"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/IPv4/UDP/GTP-U/IPv6/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
        { name: "UDP", fields: { src: 2152, dst: 2152, length: 76 } },
        { name: "GTP-U", fields: { flags: "0x37", message_type: 255, teid: "0x12345678", sequence: 7, n_pdu: 3 } },
        { name: "GTP-U Extension", fields: { udp_port: 65000 } },
        {
          name: "GTP-U Inner IPv6",
          fields: {
            src: "2001:db8:40::10",
            dst: "2001:db8:40::20",
            hop_limit: 42,
            next_header: 17
          }
        },
        { name: "GTP-U Inner UDP", fields: { src: 33000, dst: 33100, length: 12 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field GTP-U Inner IPv6 Traffic class")).toHaveValue("171");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv6 Flow label")).toHaveValue("74565");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv6 Hop limit")).toHaveValue("42");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv6 Source")).toHaveValue("2001:0db8:0040:0000:0000:0000:0000:0010");
    expect(screen.getByLabelText("Raw field GTP-U Inner UDP Source port")).toHaveValue("33000");
    expect(screen.getByLabelText("Raw field GTP-U Inner UDP Destination port")).toHaveValue("33100");

    const useRawGtpuFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field GTP-U ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const trafficClassVm = await useRawGtpuFieldEngineTarget("Inner IPv6 Traffic class");
    expect(trafficClassVm).toEqual({
      instructions: [
        { init_value: 171, max_value: 186, min_value: 171, name: "gtpu_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gtpu_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 58, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_traffic_class"
    });

    const flowLabelVm = await useRawGtpuFieldEngineTarget("Inner IPv6 Flow label");
    expect(flowLabelVm).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12354, min_value: 0x12345, name: "gtpu_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gtpu_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 58, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_flow_label"
    });

    const hopLimitVm = await useRawGtpuFieldEngineTarget("Inner IPv6 Hop limit");
    expect(hopLimitVm).toEqual({
      instructions: [
        { init_value: 42, max_value: 57, min_value: 42, name: "gtpu_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_hop_limit", pkt_offset: 65, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_hop_limit"
    });

    const sourceVm = await useRawGtpuFieldEngineTarget("Inner IPv6 Source");
    expect(sourceVm).toEqual({
      instructions: [
        { init_value: 16, max_value: 31, min_value: 16, name: "gtpu_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_src", pkt_offset: 81, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_src"
    });

    const destinationVm = await useRawGtpuFieldEngineTarget("Inner IPv6 Destination");
    expect(destinationVm).toEqual({
      instructions: [
        { init_value: 32, max_value: 47, min_value: 32, name: "gtpu_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_dst", pkt_offset: 97, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_dst"
    });

    const udpSourceVm = await useRawGtpuFieldEngineTarget("Inner UDP Source port");
    expect(udpSourceVm).toEqual({
      instructions: [
        { init_value: 33000, max_value: 33015, min_value: 33000, name: "gtpu_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_src", pkt_offset: 98, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_src"
    });

    const udpDestinationVm = await useRawGtpuFieldEngineTarget("Inner UDP Destination port");
    expect(udpDestinationVm).toEqual({
      instructions: [
        { init_value: 33100, max_value: 33115, min_value: 33100, name: "gtpu_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_dst", pkt_offset: 100, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_dst"
    });
  }, 40_000);
});
