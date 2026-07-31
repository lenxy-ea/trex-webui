import {
  App,
  describe,
  expect,
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
  switchPacketPreviewToFieldEngine,
  useFieldEngineTarget,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Tunnels / GTP-U", () => {
  installAppTestHooks();

  it("uses GTP-U inner IPv4 Packet Editor bitfield rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 "
      + "45 00 00 4c 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 "
      + "08 68 08 68 00 38 00 00 37 ff 00 28 12 34 56 78 00 07 03 40 01 fd e8 00 "
      + "45 2b 00 20 12 34 40 04 3f 11 00 00 0a 09 00 01 0a 09 00 02 "
      + "13 88 17 70 00 0c 00 00 de ad be ef"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({ advanced_mode: true, packet_type: "Ethernet" }),
      "Ethernet/IPv4/UDP/GTP-U/IPv4/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 2152, destination_port: 2152, length: 56 } },
        { name: "GTP-U", fields: { flags: "0x37", message_type: 255, teid: "0x12345678", sequence: 7, n_pdu: 3 } },
        { name: "GTP-U Extension", fields: { udp_port: 65000 } },
        { name: "Inner IPv4", fields: { source: "10.9.0.1", destination: "10.9.0.2", dscp: 10, ecn: 3, identification: "0x1234", fragment_offset: 4, protocol: "UDP" } },
        { name: "Inner UDP", fields: { source_port: 5000, destination_port: 6000, length: 12 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field GTP-U Inner IPv4 DSCP")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 ECN")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Reserved flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field GTP-U Inner IPv4 Fragment offset")).toHaveValue("4");

    const applyRawGtpuFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field GTP-U ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };
    const expectSelectedGtpuTarget = (label: string) => {
      expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
        name: `Use ${label} Field Engine target`
      }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    };

    const cases = [
      {
        body: {
          instructions: [
            { init_value: 0x1234, max_value: 0x1243, min_value: 0x1234, name: "gtpu_inner_ipv4_id", op: "inc", size: 2, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_id", pkt_offset: 62, type: "write_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_id"
        },
        field: "Inner IPv4 Identification",
        target: "GTP-U inner IPv4 ID inc"
      },
      {
        body: {
          instructions: [
            { init_value: 10, max_value: 25, min_value: 10, name: "gtpu_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0xfc, name: "gtpu_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 59, shift: 2, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_dscp"
        },
        field: "Inner IPv4 DSCP",
        target: "GTP-U inner IPv4 DSCP inc"
      },
      {
        body: {
          instructions: [
            { init_value: 3, max_value: 3, min_value: 3, name: "gtpu_inner_ipv4_ecn", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x03, name: "gtpu_inner_ipv4_ecn", pkt_cast_size: 1, pkt_offset: 59, shift: 0, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_ecn"
        },
        field: "Inner IPv4 ECN",
        target: "GTP-U inner IPv4 ECN inc"
      },
      {
        body: {
          instructions: [
            { init_value: 0, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_reserved", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x8000, name: "gtpu_inner_ipv4_reserved", pkt_cast_size: 2, pkt_offset: 64, shift: 15, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_reserved"
        },
        field: "Inner IPv4 Reserved flag",
        target: "GTP-U inner IPv4 reserved flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 1, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x4000, name: "gtpu_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 64, shift: 14, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_df"
        },
        field: "Inner IPv4 Don't fragment",
        target: "GTP-U inner IPv4 Don't fragment flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 0, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_mf", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x2000, name: "gtpu_inner_ipv4_mf", pkt_cast_size: 2, pkt_offset: 64, shift: 13, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_mf"
        },
        field: "Inner IPv4 More fragments",
        target: "GTP-U inner IPv4 More fragments flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 4, max_value: 19, min_value: 4, name: "gtpu_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "gtpu_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 64, shift: 0, type: "write_mask_flow_var" },
            { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gtpu_inner_ipv4_fragment_offset"
        },
        field: "Inner IPv4 Fragment offset",
        target: "GTP-U inner IPv4 fragment offset inc"
      }
    ];

    for (const item of cases) {
      const vm = await applyRawGtpuFieldEngineTarget(item.field);
      expectSelectedGtpuTarget(item.target);
      expect(vm).toEqual(item.body);
    }
  }, 40_000);

  it("builds GTP-U Field Engine targets from raw Packet Editor bytes", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAABMEjRAAEARAAAQAAABMAAAAQhoCGgAOAAAN/8AKBI0VngABwNAAf3oAEUAACBDIQAAPxEAAAoJAAEKCQACE4gXcAAMAADerb7v";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 08 68 08 68 00 38 00 00 37 ff 00 28 12 34 56 78 00 07 03 40 01 fd e8 00 45 00 00 20 43 21 00 00 3f 11 00 00 0a 09 00 01 0a 09 00 02 13 88 17 70 00 0c 00 00 de ad be ef";
    const rawGtpuStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      gtpu_extension_udp_port_count: 4,
      gtpu_extension_udp_port_step: 1,
      gtpu_inner_ipv4_dst_count: 4,
      gtpu_inner_ipv4_dst_step: 1,
      gtpu_inner_ipv4_src_count: 4,
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_ipv4_ttl_count: 4,
      gtpu_inner_ipv4_ttl_step: 1,
      gtpu_inner_l4_dst_port_count: 4,
      gtpu_inner_l4_dst_port_step: 1,
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_npdu_count: 4,
      gtpu_npdu_step: 1,
      gtpu_sequence_count: 4,
      gtpu_sequence_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1
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
            streams: [rawGtpuStream],
            stream_summaries: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet",
                length: 90,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP/GTP-U/IPv4/UDP",
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
                  { name: "Inner IPv4", fields: { src: "10.9.0.1", dst: "10.9.0.2", ttl: 63, protocol: 17 } },
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
    await screen.findByText("Packet Editor / Field Engine editable");
    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    await screen.findByLabelText("Advanced VM JSON");

    const targetMap = screen.getByLabelText("Field Engine target map");
    for (const name of [
      "GTP-U message type inc",
      "GTP-U TEID inc",
      "GTP-U sequence inc",
      "GTP-U N-PDU inc",
      "GTP-U extension UDP port inc",
      "GTP-U inner IPv4 src inc",
      "GTP-U inner IPv4 dst inc",
      "GTP-U inner IPv4 TTL inc",
      "GTP-U inner UDP src port inc",
      "GTP-U inner UDP dst port inc",
      "GTP-U inner 5-tuple inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 dst inc Field Engine target" })).toBeDisabled();

    const expectRawGtpuInnerChecksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 58,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const gtpuMessageTypeVm = useFieldEngineTarget("GTP-U message type inc");
    expect(gtpuMessageTypeVm).toEqual({
      instructions: [
        { init_value: 255, max_value: 255, min_value: 255, name: "gtpu_message_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_message_type", pkt_offset: 43, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_message_type"
    });

    const gtpuTeidVm = useFieldEngineTarget("GTP-U TEID inc");
    expect(gtpuTeidVm).toEqual({
      instructions: [
        { init_value: 305419896, max_value: 305419899, min_value: 305419896, name: "gtpu_teid", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_teid", pkt_offset: 46, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_teid"
    });

    expect(useFieldEngineTarget("GTP-U sequence inc")).toEqual({
      instructions: [
        { init_value: 7, max_value: 10, min_value: 7, name: "gtpu_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_sequence", pkt_offset: 50, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_sequence"
    });

    expect(useFieldEngineTarget("GTP-U N-PDU inc")).toEqual({
      instructions: [
        { init_value: 3, max_value: 6, min_value: 3, name: "gtpu_npdu", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_npdu", pkt_offset: 52, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_npdu"
    });

    expect(useFieldEngineTarget("GTP-U extension UDP port inc")).toEqual({
      instructions: [
        { init_value: 65000, max_value: 65003, min_value: 65000, name: "gtpu_extension_udp_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_extension_udp_port", pkt_offset: 55, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_extension_udp_port"
    });

    const gtpuInnerSrcVm = useFieldEngineTarget("GTP-U inner IPv4 src inc");
    expect(gtpuInnerSrcVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "gtpu_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_src", pkt_offset: 73, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_src"
    });

    const gtpuInnerDstVm = useFieldEngineTarget("GTP-U inner IPv4 dst inc");
    expect(gtpuInnerDstVm).toEqual({
      instructions: [
        { init_value: 2, max_value: 5, min_value: 2, name: "gtpu_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_dst", pkt_offset: 77, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_dst"
    });

    const gtpuInnerTtlVm = useFieldEngineTarget("GTP-U inner IPv4 TTL inc");
    expect(gtpuInnerTtlVm).toEqual({
      instructions: [
        { init_value: 63, max_value: 66, min_value: 63, name: "gtpu_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_ttl", pkt_offset: 66, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_ttl"
    });

    const gtpuInnerUdpSrcVm = useFieldEngineTarget("GTP-U inner UDP src port inc");
    expect(gtpuInnerUdpSrcVm).toEqual({
      instructions: [
        { init_value: 5000, max_value: 5003, min_value: 5000, name: "gtpu_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_src", pkt_offset: 78, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_src"
    });

    const gtpuInnerUdpDstVm = useFieldEngineTarget("GTP-U inner UDP dst port inc");
    expect(gtpuInnerUdpDstVm).toEqual({
      instructions: [
        { init_value: 6000, max_value: 6003, min_value: 6000, name: "gtpu_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_dst", pkt_offset: 80, type: "write_flow_var" },
        { l2_len: 58, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_dst"
    });

    const gtpuInnerFiveTupleVm = useFieldEngineTarget("GTP-U inner 5-tuple inc");
    expect(gtpuInnerFiveTupleVm.split_by_var).toBe("gtpu_inner_ipv4_src");
    expect(gtpuInnerFiveTupleVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 168361985, max_value: 168361988, min_value: 168361985, name: "gtpu_inner_ipv4_src", type: "flow_var" }),
      expect.objectContaining({ name: "gtpu_inner_ipv4_src", pkt_offset: 70, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 168361986, max_value: 168361989, min_value: 168361986, name: "gtpu_inner_ipv4_dst" }),
      expect.objectContaining({ name: "gtpu_inner_ipv4_dst", pkt_offset: 74, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 5000, max_value: 5003, min_value: 5000, name: "gtpu_inner_udp_src" }),
      expect.objectContaining({ name: "gtpu_inner_udp_src", pkt_offset: 78, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 6000, max_value: 6003, min_value: 6000, name: "gtpu_inner_udp_dst" }),
      expect.objectContaining({ name: "gtpu_inner_udp_dst", pkt_offset: 80, type: "write_flow_var" })
    ]));
    expectRawGtpuInnerChecksum(gtpuInnerFiveTupleVm);
  }, 40_000);

  it("keeps GTP-U raw inner IPv4 TTL target available without inner UDP", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x38, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x10, 0x00, 0x00, 0x01, 0x30, 0x00, 0x00, 0x01,
      0x08, 0x68, 0x08, 0x68, 0x00, 0x24, 0x00, 0x00,
      0x30, 0xff, 0x00, 0x14, 0x12, 0x34, 0x56, 0x78,
      0x45, 0x2b, 0x00, 0x14, 0x12, 0x34, 0x40, 0x04, 0x28, 0x00,
      0x00, 0x00, 0x0a, 0x09, 0x00, 0x01, 0x0a, 0x09, 0x00, 0x02
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawGtpuStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      gtpu_inner_ipv4_dst_count: 4,
      gtpu_inner_ipv4_dst_step: 1,
      gtpu_inner_ipv4_src_count: 4,
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_ipv4_ttl_count: 4,
      gtpu_inner_ipv4_ttl_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1,
      ipv4_dscp_count: 4,
      ipv4_dscp_step: 1,
      ipv4_ecn_count: 4,
      ipv4_ecn_step: 1,
      ipv4_fragment_offset_count: 4,
      ipv4_fragment_offset_step: 1,
      ipv4_id_count: 4,
      ipv4_id_step: 1
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
            streams: [rawGtpuStream],
            stream_summaries: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet",
                length: rawPacket.length,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP/GTP-U/IPv4",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 2152, dst: 2152, length: 36 } },
                  { name: "GTP-U", fields: { flags: "0x30", message_type: 255, teid: "0x12345678" } },
                  { name: "Inner IPv4", fields: { src: "10.9.0.1", dst: "10.9.0.2", ttl: 40, protocol: 0 } }
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
    await screen.findByText("Packet Editor / Field Engine editable");
    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    await screen.findByLabelText("Advanced VM JSON");

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U TEID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U sequence inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U N-PDU inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U extension UDP port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 ID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 DSCP inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 ECN inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 fragment offset inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 reserved flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 Don't fragment flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 More fragments flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GTP-U inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "gtpu_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_src", pkt_offset: 65, type: "write_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 2, max_value: 5, min_value: 2, name: "gtpu_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_dst", pkt_offset: 69, type: "write_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 TTL inc")).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "gtpu_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_ttl", pkt_offset: 58, type: "write_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_ttl"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 ID inc")).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "gtpu_inner_ipv4_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_id", pkt_offset: 54, type: "write_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_id"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 DSCP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "gtpu_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xfc, name: "gtpu_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 51, shift: 2, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_dscp"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 ECN inc")).toEqual({
      instructions: [
        { init_value: 3, max_value: 3, min_value: 3, name: "gtpu_inner_ipv4_ecn", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x03, name: "gtpu_inner_ipv4_ecn", pkt_cast_size: 1, pkt_offset: 51, shift: 0, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_ecn"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 fragment offset inc")).toEqual({
      instructions: [
        { init_value: 4, max_value: 7, min_value: 4, name: "gtpu_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "gtpu_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 56, shift: 0, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_fragment_offset"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 reserved flag vary")).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_reserved", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x8000, name: "gtpu_inner_ipv4_reserved", pkt_cast_size: 2, pkt_offset: 56, shift: 15, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_reserved"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 Don't fragment flag vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x4000, name: "gtpu_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 56, shift: 14, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_df"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 More fragments flag vary")).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "gtpu_inner_ipv4_mf", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x2000, name: "gtpu_inner_ipv4_mf", pkt_cast_size: 2, pkt_offset: 56, shift: 13, type: "write_mask_flow_var" },
        { pkt_offset: 50, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gtpu_inner_ipv4_mf"
    });
  }, 40_000);

  it("builds GTP-U raw inner IPv4/TCP address Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x4c, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x10, 0x00, 0x00, 0x01, 0x30, 0x00, 0x00, 0x01,
      0x08, 0x68, 0x08, 0x68, 0x00, 0x38, 0x00, 0x00,
      0x30, 0xff, 0x00, 0x28, 0x12, 0x34, 0x56, 0x78,
      0x45, 0x00, 0x00, 0x28, 0x43, 0x21, 0x00, 0x00, 0x28, 0x06,
      0x00, 0x00, 0x0a, 0x09, 0x00, 0x01, 0x0a, 0x09, 0x00, 0x02,
      0x13, 0x88, 0x17, 0x70, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawGtpuStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      gtpu_inner_ipv4_dst_count: 4,
      gtpu_inner_ipv4_dst_step: 1,
      gtpu_inner_ipv4_src_count: 4,
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_l4_dst_port_count: 4,
      gtpu_inner_l4_dst_port_step: 1,
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1,
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawGtpuStream,
      "Ethernet/IPv4/UDP/GTP-U/IPv4/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
        { name: "UDP", fields: { src: 2152, dst: 2152, length: 56 } },
        { name: "GTP-U", fields: { flags: "0x30", message_type: 255, teid: "0x12345678" } },
        { name: "Inner IPv4", fields: { src: "10.9.0.1", dst: "10.9.0.2", ttl: 40, protocol: 6 } },
        { name: "Inner TCP", fields: { src: 5000, dst: 6000 } }
      ]
    );

    expect(await selectRawPacketFieldEngineTarget("GTP-U Inner TCP Source port", "GTP-U inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 5000, max_value: 5003, min_value: 5000, name: "gtpu_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_src", pkt_offset: 70, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_src"
    });

    expect(await selectRawPacketFieldEngineTarget("GTP-U Inner TCP Destination port", "GTP-U inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 6000, max_value: 6003, min_value: 6000, name: "gtpu_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_dst", pkt_offset: 72, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_dst"
    });

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U TEID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GTP-U inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "gtpu_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_src", pkt_offset: 65, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 2, max_value: 5, min_value: 2, name: "gtpu_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv4_dst", pkt_offset: 69, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("GTP-U inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 5000, max_value: 5003, min_value: 5000, name: "gtpu_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_src", pkt_offset: 70, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_src"
    });

    expect(useFieldEngineTarget("GTP-U inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 6000, max_value: 6003, min_value: 6000, name: "gtpu_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_dst", pkt_offset: 72, type: "write_flow_var" },
        { l2_len: 50, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_dst"
    });
  }, 20_000);

  it("builds GTP-U raw inner IPv6/TCP address and port Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x60, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x10, 0x00, 0x00, 0x01, 0x30, 0x00, 0x00, 0x01,
      0x08, 0x68, 0x08, 0x68, 0x00, 0x4c, 0x00, 0x00,
      0x30, 0xff, 0x00, 0x3c, 0x12, 0x34, 0x56, 0x78,
      0x6a, 0xb1, 0x23, 0x45, 0x00, 0x14, 0x06, 0x28,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x40, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x40, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
      0x80, 0xe8, 0x81, 0x4c, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawGtpuStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      gtpu_inner_ipv6_dst_count: 4,
      gtpu_inner_ipv6_dst_step: 1,
      gtpu_inner_ipv6_src_count: 4,
      gtpu_inner_ipv6_src_step: 1,
      gtpu_inner_l4_dst_port_count: 4,
      gtpu_inner_l4_dst_port_step: 1,
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1,
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawGtpuStream,
      "Ethernet/IPv4/UDP/GTP-U/IPv6/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
        { name: "UDP", fields: { src: 2152, dst: 2152, length: 76 } },
        { name: "GTP-U", fields: { flags: "0x30", message_type: 255, teid: "0x12345678" } },
        { name: "Inner IPv6", fields: { src: "2001:db8:40::10", dst: "2001:db8:40::20", hop_limit: 40, next_header: 6 } },
        { name: "Inner TCP", fields: { src: 33000, dst: 33100 } }
      ]
    );

    expect(await selectRawPacketFieldEngineTarget("GTP-U Inner TCP Source port", "GTP-U inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 33000, max_value: 33003, min_value: 33000, name: "gtpu_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_src", pkt_offset: 90, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_src"
    });

    expect(await selectRawPacketFieldEngineTarget("GTP-U Inner TCP Destination port", "GTP-U inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 33100, max_value: 33103, min_value: 33100, name: "gtpu_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_dst", pkt_offset: 92, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_dst"
    });

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U TEID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 traffic class inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 flow label inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GTP-U inner IPv6 src inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "gtpu_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_src", pkt_offset: 73, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_src"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv6 dst inc")).toEqual({
      instructions: [
        { init_value: 32, max_value: 35, min_value: 32, name: "gtpu_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_dst", pkt_offset: 89, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_dst"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv6 traffic class inc")).toEqual({
      instructions: [
        { init_value: 171, max_value: 174, min_value: 171, name: "gtpu_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gtpu_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 50, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_traffic_class"
    });

    expect(useFieldEngineTarget("GTP-U inner IPv6 flow label inc")).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12348, min_value: 0x12345, name: "gtpu_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gtpu_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 50, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_flow_label"
    });

    expect(useFieldEngineTarget("GTP-U inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 33000, max_value: 33003, min_value: 33000, name: "gtpu_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_src", pkt_offset: 90, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_src"
    });

    expect(useFieldEngineTarget("GTP-U inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 33100, max_value: 33103, min_value: 33100, name: "gtpu_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_tcp_dst", pkt_offset: 92, type: "write_flow_var" },
        { l2_len: 50, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_tcp_dst"
    });
  }, 40_000);

  it("builds GTP-U inner IPv6 Field Engine targets from raw Packet Editor bytes", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 60 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 08 68 08 68 00 4c 00 00 37 ff 00 3c 12 34 56 78 00 07 03 40 01 fd e8 00 6a b1 23 45 00 0c 11 2a 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 10 20 01 0d b8 00 40 00 00 00 00 00 00 00 00 00 20 80 e8 81 4c 00 0c 00 00 de ad be ef";
    const packetBinary = btoa(String.fromCharCode(...packetBytesFromRawHex(packetHex)));
    const rawGtpuIpv6Stream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      gtpu_extension_udp_port_count: 4,
      gtpu_extension_udp_port_step: 1,
      gtpu_inner_ipv6_dst_count: 4,
      gtpu_inner_ipv6_dst_step: 1,
      gtpu_inner_ipv6_hop_limit_count: 4,
      gtpu_inner_ipv6_hop_limit_step: 1,
      gtpu_inner_ipv6_src_count: 4,
      gtpu_inner_ipv6_src_step: 1,
      gtpu_inner_l4_dst_port_count: 4,
      gtpu_inner_l4_dst_port_step: 1,
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_npdu_count: 4,
      gtpu_npdu_step: 1,
      gtpu_sequence_count: 4,
      gtpu_sequence_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1,
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1
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
            streams: [rawGtpuIpv6Stream],
            stream_summaries: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet",
                length: 110,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP/GTP-U/IPv6/UDP",
                frame_length: 110,
                wire_length: 110,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17 } },
                  { name: "UDP", fields: { src: 2152, dst: 2152, length: 76 } },
                  {
                    name: "GTP-U",
                    fields: { flags: "0x37", message_type: 255, teid: "0x12345678", sequence: 7, n_pdu: 3 }
                  },
                  { name: "GTP-U Extension", fields: { udp_port: 65000 } },
                  {
                    name: "Inner IPv6",
                    fields: {
                      src: "2001:db8:40::10",
                      dst: "2001:db8:40::20",
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
    await screen.findByText("Packet Editor / Field Engine editable");
    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    await screen.findByLabelText("Advanced VM JSON");

    const targetMap = screen.getByLabelText("Field Engine target map");
    for (const name of [
      "GTP-U TEID inc",
      "GTP-U sequence inc",
      "GTP-U N-PDU inc",
      "GTP-U extension UDP port inc",
      "GTP-U inner IPv6 src inc",
      "GTP-U inner IPv6 dst inc",
      "GTP-U inner IPv6 hop limit inc",
      "GTP-U inner IPv6 traffic class inc",
      "GTP-U inner IPv6 flow label inc",
      "GTP-U inner UDP src port inc",
      "GTP-U inner UDP dst port inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();

    const expectRawGtpuInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 58,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    expect(useFieldEngineTarget("GTP-U TEID inc")).toEqual({
      instructions: [
        { init_value: 305419896, max_value: 305419899, min_value: 305419896, name: "gtpu_teid", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_teid", pkt_offset: 46, type: "write_flow_var" },
        { l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_teid"
    });

    expect(useFieldEngineTarget("GTP-U sequence inc")).toEqual({
      instructions: [
        { init_value: 7, max_value: 10, min_value: 7, name: "gtpu_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_sequence", pkt_offset: 50, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_sequence"
    });

    expect(useFieldEngineTarget("GTP-U N-PDU inc")).toEqual({
      instructions: [
        { init_value: 3, max_value: 6, min_value: 3, name: "gtpu_npdu", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_npdu", pkt_offset: 52, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_npdu"
    });

    expect(useFieldEngineTarget("GTP-U extension UDP port inc")).toEqual({
      instructions: [
        { init_value: 65000, max_value: 65003, min_value: 65000, name: "gtpu_extension_udp_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_extension_udp_port", pkt_offset: 55, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_extension_udp_port"
    });

    const gtpuInnerIpv6SrcVm = useFieldEngineTarget("GTP-U inner IPv6 src inc");
    expect(gtpuInnerIpv6SrcVm).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "gtpu_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_src", pkt_offset: 81, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_src"
    });

    const gtpuInnerIpv6DstVm = useFieldEngineTarget("GTP-U inner IPv6 dst inc");
    expect(gtpuInnerIpv6DstVm).toEqual({
      instructions: [
        { init_value: 32, max_value: 35, min_value: 32, name: "gtpu_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_dst", pkt_offset: 97, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_ipv6_dst"
    });

    const gtpuInnerIpv6HopLimitVm = useFieldEngineTarget("GTP-U inner IPv6 hop limit inc");
    expect(gtpuInnerIpv6HopLimitVm).toEqual({
      instructions: [
        { init_value: 42, max_value: 45, min_value: 42, name: "gtpu_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_hop_limit", pkt_offset: 65, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_hop_limit"
    });
    expect(gtpuInnerIpv6HopLimitVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuInnerIpv6TrafficClassVm = useFieldEngineTarget("GTP-U inner IPv6 traffic class inc");
    expect(gtpuInnerIpv6TrafficClassVm).toEqual({
      instructions: [
        { init_value: 171, max_value: 174, min_value: 171, name: "gtpu_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gtpu_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 58, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_traffic_class"
    });
    expect(gtpuInnerIpv6TrafficClassVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuInnerIpv6FlowLabelVm = useFieldEngineTarget("GTP-U inner IPv6 flow label inc");
    expect(gtpuInnerIpv6FlowLabelVm).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12348, min_value: 0x12345, name: "gtpu_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gtpu_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 58, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_flow_label"
    });
    expect(gtpuInnerIpv6FlowLabelVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuInnerUdpSrcVm = useFieldEngineTarget("GTP-U inner UDP src port inc");
    expect(gtpuInnerUdpSrcVm).toEqual({
      instructions: [
        { init_value: 33000, max_value: 33003, min_value: 33000, name: "gtpu_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_src", pkt_offset: 98, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_src"
    });
    expectRawGtpuInnerIpv6Checksum(gtpuInnerUdpSrcVm);

    const gtpuInnerUdpDstVm = useFieldEngineTarget("GTP-U inner UDP dst port inc");
    expect(gtpuInnerUdpDstVm).toEqual({
      instructions: [
        { init_value: 33100, max_value: 33103, min_value: 33100, name: "gtpu_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_udp_dst", pkt_offset: 100, type: "write_flow_var" },
        { l2_len: 58, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "gtpu_inner_udp_dst"
    });
    expectRawGtpuInnerIpv6Checksum(gtpuInnerUdpDstVm);
  }, 40_000);

  it("keeps GTP-U raw inner IPv6 hop-limit target available without inner UDP", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABFAABMEjRAAEARAAAQAAABMAAAAQhoCGgAOAAAMP8AKBI0VnhgAAAAAAA7KiABDbgAUAAAAAAAAAAAABAgAQ24AFAAAAAAAAAAAAAg";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 08 68 08 68 00 38 00 00 30 ff 00 28 12 34 56 78 60 00 00 00 00 00 3b 2a 20 01 0d b8 00 50 00 00 00 00 00 00 00 00 00 10 20 01 0d b8 00 50 00 00 00 00 00 00 00 00 00 20";
    const rawGtpuIpv6Stream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      gtpu_inner_ipv6_hop_limit_count: 4,
      gtpu_inner_ipv6_hop_limit_step: 1,
      gtpu_teid_count: 4,
      gtpu_teid_step: 1
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
            streams: [rawGtpuIpv6Stream],
            stream_summaries: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet",
                length: 90,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP/GTP-U/IPv6",
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
                    fields: { flags: "0x30", message_type: 255, teid: "0x12345678" }
                  },
                  {
                    name: "Inner IPv6",
                    fields: {
                      src: "2001:db8:50::10",
                      dst: "2001:db8:50::20",
                      hop_limit: 42,
                      next_header: 59
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
    await screen.findByText("Packet Editor / Field Engine editable");
    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    await screen.findByLabelText("Advanced VM JSON");

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U TEID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U sequence inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U N-PDU inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U extension UDP port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 dst inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GTP-U inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();

    const gtpuInnerIpv6HopLimitVm = useFieldEngineTarget("GTP-U inner IPv6 hop limit inc");
    expect(gtpuInnerIpv6HopLimitVm).toEqual({
      instructions: [
        { init_value: 42, max_value: 45, min_value: 42, name: "gtpu_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gtpu_inner_ipv6_hop_limit", pkt_offset: 57, type: "write_flow_var" }
      ],
      split_by_var: "gtpu_inner_ipv6_hop_limit"
    });
  }, 20_000);

  it("renders GTP-U tunnel protocol data through the structured Stream Builder editor", async () => {
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
                frame_length: 96,
                wire_length: 96,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  {
                    name: "Ethernet",
                    fields: {
                      destination: "66:55:44:33:22:11",
                      source: "10:20:30:40:50:60",
                      type: "0x0800"
                    }
                  },
                  {
                    name: "Internet Protocol v4",
                    fields: {
                      source: "16.0.0.1",
                      destination: "48.0.0.1",
                      ttl: 127,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "UDP",
                    fields: {
                      source_port: 2152,
                      destination_port: 2152,
                      length: 58,
                      checksum: "0x0000"
                    }
                  },
                  {
                    name: "GPRS Tunneling Protocol User Plane",
                    fields: {
                      flags: "0x33",
                      message_type: 255,
                      message_type_name: "G-PDU",
                      teid: 2882400001,
                      teid_mode: "Increment",
                      teid_count: 8,
                      teid_step: 2,
                      sequence_enabled: true,
                      sequence: 7,
                      sequence_mode: "Increment",
                      sequence_count: 4,
                      sequence_step: 1,
                      n_pdu_enabled: true,
                      n_pdu_number: 3,
                      n_pdu_mode: "Increment",
                      n_pdu_count: 4,
                      n_pdu_step: 1,
                      next_extension_header: "0x00"
                    }
                  },
                  {
                    name: "Inner Internet Protocol v4",
                    fields: {
                      source: "10.9.0.1",
                      source_mode: "Increment Host",
                      source_count: 4,
                      source_step: 1,
                      destination: "10.9.0.2",
                      destination_mode: "Increment Host",
                      destination_count: 4,
                      destination_step: 1,
                      ttl: 63,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "Inner UDP",
                    fields: {
                      source_port: 5000,
                      source_port_mode: "Increment",
                      source_port_count: 4,
                      source_port_step: 1,
                      destination_port: 6000,
                      destination_port_mode: "Increment",
                      destination_port_count: 4,
                      destination_port_step: 1,
                      length: 18,
                      checksum: "0x0000"
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
    fireEvent.click(screen.getByLabelText("GTP-U"));
    expect(screen.getByLabelText("Frame length type")).toBeDisabled();
    expect(screen.getByLabelText("IPv6")).toBeDisabled();
    expect(screen.getByLabelText("TCP")).toBeDisabled();
    expect(screen.getByText("Ethernet/IPv4/UDP/GTP-U")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    expect(screen.getByLabelText("L4 destination port")).toBeDisabled();
    expect(screen.getByLabelText("Override UDP checksum")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("GTP-U TEID"), { target: { value: "2882400001" } });
    fireEvent.change(screen.getByLabelText("GTP-U TEID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U TEID count"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("GTP-U TEID step"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText("GTP-U sequence present"));
    fireEvent.change(screen.getByLabelText("GTP-U sequence"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("GTP-U sequence mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U sequence count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U sequence step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("GTP-U N-PDU present"));
    fireEvent.change(screen.getByLabelText("GTP-U N-PDU number"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("GTP-U N-PDU mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U N-PDU count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U N-PDU step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("GTP-U UDP Port extension"));
    fireEvent.change(screen.getByLabelText("GTP-U extension UDP port"), { target: { value: "65000" } });
    fireEvent.change(screen.getByLabelText("GTP-U extension UDP port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U extension UDP port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U extension UDP port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 source"), { target: { value: "10.9.0.1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 destination"), { target: { value: "10.9.0.2" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 TTL"), { target: { value: "63" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv4 TTL step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port"), { target: { value: "6000" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port step"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"gtpu_enabled":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port":2152')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_teid_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_sequence_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_npdu_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_extension_udp_port":65000')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_extension_udp_port_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv4_dst":"10.9.0.2"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv4_dst_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv4_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_l4_dst_port":6000')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_l4_dst_port_mode":"Increment"')
      })
    );
    expect(screen.getByText("GPRS Tunneling Protocol User Plane")).toBeInTheDocument();
    expect(screen.getByText("teid_mode")).toBeInTheDocument();
    expect(screen.getAllByText("Increment").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("Inner Internet Protocol v4")).toBeInTheDocument();
    expect(screen.getByText("10.9.0.2")).toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const gtpuTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U sequence inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U N-PDU inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U extension UDP port inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const gtpuSequenceVm = useFieldEngineTarget("GTP-U sequence inc");
    expect(gtpuSequenceVm.split_by_var).toBe("gtpu_sequence");
    expect(gtpuSequenceVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 7,
        max_value: 10,
        min_value: 7,
        name: "gtpu_sequence",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_sequence",
        pkt_offset: 50,
        type: "write_flow_var"
      })
    ]));
    expect(gtpuSequenceVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuNpduVm = useFieldEngineTarget("GTP-U N-PDU inc");
    expect(gtpuNpduVm.split_by_var).toBe("gtpu_npdu");
    expect(gtpuNpduVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 3,
        max_value: 6,
        min_value: 3,
        name: "gtpu_npdu",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_npdu",
        pkt_offset: 52,
        type: "write_flow_var"
      })
    ]));
    expect(gtpuNpduVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuExtensionUdpPortVm = useFieldEngineTarget("GTP-U extension UDP port inc");
    expect(gtpuExtensionUdpPortVm.split_by_var).toBe("gtpu_extension_udp_port");
    expect(gtpuExtensionUdpPortVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 65000,
        max_value: 65003,
        min_value: 65000,
        name: "gtpu_extension_udp_port",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_extension_udp_port",
        pkt_offset: 55,
        type: "write_flow_var"
      })
    ]));
    expect(gtpuExtensionUdpPortVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const expectGtpuInnerIpv4Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 58,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const gtpuInnerSrcVm = useFieldEngineTarget("GTP-U inner IPv4 src inc");
    expect(gtpuInnerSrcVm.split_by_var).toBe("gtpu_inner_ipv4_src");
    expect(gtpuInnerSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 4,
        min_value: 1,
        name: "gtpu_inner_ipv4_src",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv4_src",
        pkt_offset: 73,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv4Checksum(gtpuInnerSrcVm);

    const gtpuInnerDstVm = useFieldEngineTarget("GTP-U inner IPv4 dst inc");
    expect(gtpuInnerDstVm.split_by_var).toBe("gtpu_inner_ipv4_dst");
    expect(gtpuInnerDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 2,
        max_value: 5,
        min_value: 2,
        name: "gtpu_inner_ipv4_dst",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv4_dst",
        pkt_offset: 77,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv4Checksum(gtpuInnerDstVm);

    const gtpuInnerTtlVm = useFieldEngineTarget("GTP-U inner IPv4 TTL inc");
    expect(gtpuInnerTtlVm.split_by_var).toBe("gtpu_inner_ipv4_ttl");
    expect(gtpuInnerTtlVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 63,
        max_value: 66,
        min_value: 63,
        name: "gtpu_inner_ipv4_ttl",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv4_ttl",
        pkt_offset: 66,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv4Checksum(gtpuInnerTtlVm);

    const gtpuInnerUdpSrcVm = useFieldEngineTarget("GTP-U inner UDP src port inc");
    expect(gtpuInnerUdpSrcVm.split_by_var).toBe("gtpu_inner_udp_src");
    expect(gtpuInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 5000,
        max_value: 5003,
        min_value: 5000,
        name: "gtpu_inner_udp_src",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_udp_src",
        pkt_offset: 78,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv4Checksum(gtpuInnerUdpSrcVm);

    const gtpuInnerUdpDstVm = useFieldEngineTarget("GTP-U inner UDP dst port inc");
    expect(gtpuInnerUdpDstVm.split_by_var).toBe("gtpu_inner_udp_dst");
    expect(gtpuInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 6000,
        max_value: 6003,
        min_value: 6000,
        name: "gtpu_inner_udp_dst",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_udp_dst",
        pkt_offset: 80,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv4Checksum(gtpuInnerUdpDstVm);

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gtpu-inner-5tuple-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const gtpuInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    const gtpuInnerVm = JSON.parse(gtpuInnerVmJson);
    expect(gtpuInnerVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 1, max_value: 4, min_value: 1, name: "gtpu_inner_ipv4_src" }),
      expect.objectContaining({ init_value: 2, max_value: 5, min_value: 2, name: "gtpu_inner_ipv4_dst" }),
      expect.objectContaining({ init_value: 5000, max_value: 5003, min_value: 5000, name: "gtpu_inner_udp_src" }),
      expect.objectContaining({ init_value: 6000, max_value: 6003, min_value: 6000, name: "gtpu_inner_udp_dst" })
    ]));
    expect(gtpuInnerVmJson).toContain('"name": "gtpu_inner_ipv4_src"');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 73');
    expect(gtpuInnerVmJson).toContain('"name": "gtpu_inner_ipv4_dst"');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 77');
    expect(gtpuInnerVmJson).toContain('"name": "gtpu_inner_udp_src"');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 78');
    expect(gtpuInnerVmJson).toContain('"name": "gtpu_inner_udp_dst"');
    expect(gtpuInnerVmJson).toContain('"pkt_offset": 80');
    expect(gtpuInnerVmJson).toContain('"l2_len": 58');
    expect(gtpuInnerVmJson).toContain('"l4_type": 11');
  }, 30_000);

  it("renders GTP-U inner IPv6 hop-limit Field Engine controls through the structured Stream Builder editor", async () => {
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
                frame_length: 128,
                wire_length: 128,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  { name: "Ethernet", fields: { destination: "66:55:44:33:22:11", source: "10:20:30:40:50:60" } },
                  { name: "Internet Protocol v4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 2152, destination_port: 2152 } },
                  {
                    name: "GPRS Tunneling Protocol User Plane",
                    fields: { inner_ip_version: "IPv6", teid: 305419896 }
                  },
                  {
                    name: "Inner Internet Protocol v6",
                    fields: {
                      source: "2001:db8:10::1",
                      source_mode: "Increment Host",
                      source_count: 4,
                      source_step: 1,
                      destination: "2001:db8:20::2",
                      destination_mode: "Increment Host",
                      destination_count: 4,
                      destination_step: 1,
                      hop_limit: 40,
                      hop_limit_mode: "Increment",
                      hop_limit_count: 4,
                      hop_limit_step: 1,
                      next_header: "UDP"
                    }
                  },
                  {
                    name: "Inner UDP",
                    fields: {
                      source_port: 33000,
                      source_port_mode: "Increment",
                      source_port_count: 4,
                      source_port_step: 1,
                      destination_port: 33100,
                      destination_port_mode: "Increment",
                      destination_port_count: 4,
                      destination_port_step: 1
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
    fireEvent.click(screen.getByLabelText("GTP-U"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("GTP-U inner IP version"), { target: { value: "IPv6" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 source"), { target: { value: "2001:db8:10::1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 destination"), { target: { value: "2001:db8:20::2" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 hop limit"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 hop limit mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 hop limit count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner IPv6 hop limit step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port"), { target: { value: "33000" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port"), { target: { value: "33100" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GTP-U inner UDP destination port step"), { target: { value: "1" } });

    expect(screen.getByLabelText("GTP-U inner IPv6 source mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GTP-U inner IPv6 destination mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GTP-U inner UDP source port mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GTP-U inner UDP destination port mode")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"gtpu_inner_ip_version":"IPv6"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv6_src_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv6_dst_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv6_hop_limit_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_ipv6_hop_limit_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_l4_src_port_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gtpu_inner_l4_dst_port_count":4')
      })
    );
    expect(screen.getByText("Inner Internet Protocol v6")).toBeInTheDocument();
    expect(screen.getByText("source_mode")).toBeInTheDocument();
    expect(screen.getByText("hop_limit_mode")).toBeInTheDocument();
    expect(screen.getByText("source_port_mode")).toBeInTheDocument();
    expect(screen.getByText("2001:db8:20::2")).toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const gtpuTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U sequence inc Field Engine target" })).toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U N-PDU inc Field Engine target" })).toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U extension UDP port inc Field Engine target" })).toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(gtpuTargetMap).getByRole("button", { name: "Use GTP-U inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const expectGtpuInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 50,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const gtpuInnerIpv6SrcVm = useFieldEngineTarget("GTP-U inner IPv6 src inc");
    expect(gtpuInnerIpv6SrcVm.split_by_var).toBe("gtpu_inner_ipv6_src");
    expect(gtpuInnerIpv6SrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 4,
        min_value: 1,
        name: "gtpu_inner_ipv6_src",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv6_src",
        pkt_offset: 73,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv6Checksum(gtpuInnerIpv6SrcVm);

    const gtpuInnerIpv6DstVm = useFieldEngineTarget("GTP-U inner IPv6 dst inc");
    expect(gtpuInnerIpv6DstVm.split_by_var).toBe("gtpu_inner_ipv6_dst");
    expect(gtpuInnerIpv6DstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 2,
        max_value: 5,
        min_value: 2,
        name: "gtpu_inner_ipv6_dst",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv6_dst",
        pkt_offset: 89,
        type: "write_flow_var"
      })
    ]));
    expectGtpuInnerIpv6Checksum(gtpuInnerIpv6DstVm);

    const gtpuInnerIpv6HopLimitVm = useFieldEngineTarget("GTP-U inner IPv6 hop limit inc");
    expect(gtpuInnerIpv6HopLimitVm.split_by_var).toBe("gtpu_inner_ipv6_hop_limit");
    expect(gtpuInnerIpv6HopLimitVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 40,
        max_value: 43,
        min_value: 40,
        name: "gtpu_inner_ipv6_hop_limit",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gtpu_inner_ipv6_hop_limit",
        pkt_offset: 57,
        type: "write_flow_var"
      })
    ]));
    expect(gtpuInnerIpv6HopLimitVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const gtpuInnerUdpSrcVm = useFieldEngineTarget("GTP-U inner UDP src port inc");
    expect(gtpuInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gtpu_inner_udp_src", pkt_offset: 90, type: "write_flow_var" })
    ]));
    expectGtpuInnerIpv6Checksum(gtpuInnerUdpSrcVm);

    const gtpuInnerUdpDstVm = useFieldEngineTarget("GTP-U inner UDP dst port inc");
    expect(gtpuInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gtpu_inner_udp_dst", pkt_offset: 92, type: "write_flow_var" })
    ]));
    expectGtpuInnerIpv6Checksum(gtpuInnerUdpDstVm);
  }, 40_000);
});
