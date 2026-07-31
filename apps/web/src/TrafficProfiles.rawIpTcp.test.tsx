import {
  App,
  describe,
  expect,
  expectRawIpv4ChecksumValid,
  expectRawTransportChecksumValid,
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

describe("Traffic Profiles / Raw IPv4 IPv6 TCP", () => {
  installAppTestHooks();

  it("edits Packet Editor IPv4 DSCP, ECN, and fragment bitfields into the raw packet draft", async () => {
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
                name: "ipv4-bitfields-stream",
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

    expect(await screen.findByLabelText("Raw field IPv4 Version")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field IPv4 Header length")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field IPv4 DSCP")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv4 ECN")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv4 Total length")).toHaveValue("46");
    expect(screen.getByLabelText("Raw field IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv4 Fragment offset")).toHaveValue("0");

    fireEvent.change(screen.getByLabelText("Raw field IPv4 DSCP"), { target: { value: "46" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 DSCP" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 00 45 b8 00 2e"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv4 ECN"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 ECN" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "08 00 45 bb 00 2e"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv4 Fragment offset"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 Fragment offset" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "12 34 40 64 40 11"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv4 More fragments"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 More fragments" }));
    const rawHexAfterFragmentFields = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expect(rawHexAfterFragmentFields.replace(/\s+/g, " ")).toContain(
      "12 34 60 64 40 11"
    );
    expectRawIpv4ChecksumValid(rawHexAfterFragmentFields, 14);
  }, 10_000);

  it("uses raw IPv4 packet bytes for core Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVgQAAZAgARasAHL7vIGQqEQAACgEC+sAAAgkE0hYuAAgAAA==";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 81 00 00 64 08 00 45 ab 00 1c be ef 20 64 2a 11 00 00 0a 01 02 fa c0 00 02 09 04 d2 16 2e 00 08 00 00";
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
                name: "raw-ipv4-fe-stream",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "IPv4", fields: { src: "10.1.2.250", dst: "192.0.2.9", protocol: 17 } },
                  { name: "UDP", fields: { src: 1234, dst: 5678, length: 8 } }
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
    await switchPacketPreviewToFieldEngine();

    const targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 ID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 DSCP inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 ECN inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 fragment offset inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 DF flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 MF flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use UDP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use UDP length inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use UDP checksum inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use UDP 5-tuple inc Field Engine target" })).not.toBeDisabled();

    expect(useFieldEngineTarget("IPv4 src inc")).toEqual({
      instructions: [
        {
          init_value: 762,
          max_value: 777,
          min_value: 762,
          name: "ipv4_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_src",
          pkt_offset: 32,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_src"
    });

    expect(useFieldEngineTarget("IPv4 dst inc")).toEqual({
      instructions: [
        {
          init_value: 9,
          max_value: 24,
          min_value: 9,
          name: "ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_dst",
          pkt_offset: 37,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_dst"
    });

    expect(useFieldEngineTarget("IPv4 ID inc")).toEqual({
      instructions: [
        {
          init_value: 48879,
          max_value: 48894,
          min_value: 48879,
          name: "ip_id",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ip_id",
          pkt_offset: 22,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_id"
    });

    expect(useFieldEngineTarget("IPv4 DSCP inc")).toEqual({
      instructions: [
        {
          init_value: 42,
          max_value: 57,
          min_value: 42,
          name: "ip_dscp",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 252,
          name: "ip_dscp",
          pkt_cast_size: 1,
          pkt_offset: 19,
          shift: 2,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_dscp"
    });

    expect(useFieldEngineTarget("IPv4 ECN inc")).toEqual({
      instructions: [
        {
          init_value: 3,
          max_value: 3,
          min_value: 3,
          name: "ip_ecn",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 3,
          name: "ip_ecn",
          pkt_cast_size: 1,
          pkt_offset: 19,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_ecn"
    });

    expect(useFieldEngineTarget("IPv4 fragment offset inc")).toEqual({
      instructions: [
        {
          init_value: 100,
          max_value: 115,
          min_value: 100,
          name: "ip_fragment_offset",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 8191,
          name: "ip_fragment_offset",
          pkt_cast_size: 2,
          pkt_offset: 24,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_fragment_offset"
    });

    expect(useFieldEngineTarget("IPv4 DF flag vary")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "ip_df",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 16384,
          name: "ip_df",
          pkt_cast_size: 2,
          pkt_offset: 24,
          shift: 14,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_df"
    });

    expect(useFieldEngineTarget("IPv4 MF flag vary")).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "ip_mf",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 8192,
          name: "ip_mf",
          pkt_cast_size: 2,
          pkt_offset: 24,
          shift: 13,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_mf"
    });

    expect(useFieldEngineTarget("IPv4 TTL inc")).toEqual({
      instructions: [
        {
          init_value: 42,
          max_value: 57,
          min_value: 42,
          name: "ip_ttl",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ip_ttl",
          pkt_offset: 26,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_ttl"
    });

    expect(useFieldEngineTarget("UDP src port inc")).toEqual({
      instructions: [
        {
          init_value: 1234,
          max_value: 1249,
          min_value: 1234,
          name: "udp_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_src",
          pkt_offset: 38,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_src"
    });

    expect(useFieldEngineTarget("UDP dst port inc")).toEqual({
      instructions: [
        {
          init_value: 5678,
          max_value: 5693,
          min_value: 5678,
          name: "udp_dst",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_dst",
          pkt_offset: 40,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_dst"
    });

    expect(useFieldEngineTarget("UDP length inc")).toEqual({
      instructions: [
        {
          init_value: 8,
          max_value: 23,
          min_value: 8,
          name: "udp_length",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_length",
          pkt_offset: 42,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_length"
    });

    expect(useFieldEngineTarget("UDP checksum inc")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "udp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_checksum",
          pkt_offset: 44,
          type: "write_flow_var"
        }
      ],
      split_by_var: "udp_checksum"
    });

    expect(useFieldEngineTarget("UDP 5-tuple inc")).toEqual({
      instructions: [
        {
          init_value: 762,
          max_value: 777,
          min_value: 762,
          name: "ipv4_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_src",
          pkt_offset: 32,
          type: "write_flow_var"
        },
        {
          init_value: 9,
          max_value: 24,
          min_value: 9,
          name: "ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_dst",
          pkt_offset: 37,
          type: "write_flow_var"
        },
        {
          init_value: 1234,
          max_value: 1249,
          min_value: 1234,
          name: "udp_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_src",
          pkt_offset: 38,
          type: "write_flow_var"
        },
        {
          init_value: 5678,
          max_value: 5693,
          min_value: 5678,
          name: "udp_dst",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_dst",
          pkt_offset: 40,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_src"
    });
  }, 50_000);

  it("uses raw IPv6 packet bytes for core Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVgQAAZIbdarEjRQAIESogAQ24AAEAAAAAAAAAABL4IAENuAACAAAAAAAAAAD//zA5E4gACL7v";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 81 00 00 64 86 dd 6a b1 23 45 00 08 11 2a 20 01 0d b8 00 01 00 00 00 00 00 00 00 00 12 f8 20 01 0d b8 00 02 00 00 00 00 00 00 00 00 ff ff 30 39 13 88 00 08 be ef";
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
                name: "raw-ipv6-fe-stream",
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 66,
                wire_length: 66,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  {
                    name: "IPv6",
                    fields: {
                      destination: "2001:db8:2::ffff",
                      flow_label: 74565,
                      hop_limit: 42,
                      next_header: 17,
                      source: "2001:db8:1::12f8",
                      traffic_class: 171
                    }
                  },
                  { name: "UDP", fields: { source: 12345, destination: 5000, length: 8, checksum: "BEEF" } }
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
    await switchPacketPreviewToFieldEngine();

    const targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 traffic class inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 flow label inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 UDP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 UDP length inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 UDP checksum inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 UDP 5-tuple inc Field Engine target" })).not.toBeDisabled();

    expect(useFieldEngineTarget("IPv6 src inc")).toEqual({
      instructions: [
        {
          init_value: 4856,
          max_value: 4871,
          min_value: 4856,
          name: "ipv6_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_src",
          pkt_offset: 40,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv6_src"
    });

    expect(useFieldEngineTarget("IPv6 dst inc")).toEqual({
      instructions: [
        {
          init_value: 65535,
          max_value: 65550,
          min_value: 65535,
          name: "ipv6_dest",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_dest",
          pkt_offset: 54,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv6_dest"
    });

    expect(useFieldEngineTarget("IPv6 traffic class inc")).toEqual({
      instructions: [
        {
          init_value: 171,
          max_value: 186,
          min_value: 171,
          name: "ipv6_traffic_class",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 267386880,
          name: "ipv6_traffic_class",
          pkt_cast_size: 4,
          pkt_offset: 18,
          shift: 20,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_traffic_class"
    });

    expect(useFieldEngineTarget("IPv6 flow label inc")).toEqual({
      instructions: [
        {
          init_value: 74565,
          max_value: 74580,
          min_value: 74565,
          name: "ipv6_flow_label",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 1048575,
          name: "ipv6_flow_label",
          pkt_cast_size: 4,
          pkt_offset: 18,
          shift: 0,
          type: "write_mask_flow_var"
        }
      ],
      split_by_var: "ipv6_flow_label"
    });

    expect(useFieldEngineTarget("IPv6 hop limit inc")).toEqual({
      instructions: [
        {
          init_value: 42,
          max_value: 57,
          min_value: 42,
          name: "ipv6_hop_limit",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_hop_limit",
          pkt_offset: 25,
          type: "write_flow_var"
        }
      ],
      split_by_var: "ipv6_hop_limit"
    });

    expect(useFieldEngineTarget("IPv6 UDP src port inc")).toEqual({
      instructions: [
        {
          init_value: 12345,
          max_value: 12360,
          min_value: 12345,
          name: "l4_src_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_src_port",
          pkt_offset: 58,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "l4_src_port"
    });

    expect(useFieldEngineTarget("IPv6 UDP dst port inc")).toEqual({
      instructions: [
        {
          init_value: 5000,
          max_value: 5015,
          min_value: 5000,
          name: "l4_dest_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_dest_port",
          pkt_offset: 60,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "l4_dest_port"
    });

    expect(useFieldEngineTarget("IPv6 UDP length inc")).toEqual({
      instructions: [
        {
          init_value: 8,
          max_value: 23,
          min_value: 8,
          name: "udp_length",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_length",
          pkt_offset: 62,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "udp_length"
    });

    expect(useFieldEngineTarget("IPv6 UDP checksum inc")).toEqual({
      instructions: [
        {
          init_value: 48879,
          max_value: 48894,
          min_value: 48879,
          name: "udp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "udp_checksum",
          pkt_offset: 64,
          type: "write_flow_var"
        }
      ],
      split_by_var: "udp_checksum"
    });

    expect(useFieldEngineTarget("IPv6 UDP 5-tuple inc")).toEqual({
      instructions: [
        {
          init_value: 4856,
          max_value: 4871,
          min_value: 4856,
          name: "ipv6_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_src",
          pkt_offset: 40,
          type: "write_flow_var"
        },
        {
          init_value: 65535,
          max_value: 65550,
          min_value: 65535,
          name: "ipv6_dest",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_dest",
          pkt_offset: 54,
          type: "write_flow_var"
        },
        {
          init_value: 12345,
          max_value: 12360,
          min_value: 12345,
          name: "l4_src_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_src_port",
          pkt_offset: 58,
          type: "write_flow_var"
        },
        {
          init_value: 5000,
          max_value: 5015,
          min_value: 5000,
          name: "l4_dest_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_dest_port",
          pkt_offset: 60,
          type: "write_flow_var"
        },
        {
          l2_len: 18,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv6_src"
    });
  }, 50_000);

  it("uses outer IPv6 Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 81 00 00 64 86 dd 6a b1 23 45 00 08 11 2a 20 01 0d b8 00 01 00 00 00 00 00 00 00 00 12 f8 20 01 0d b8 00 02 00 00 00 00 00 00 00 00 ff ff 30 39 13 88 00 08 be ef"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/802.1Q/IPv6/UDP",
      [
        { name: "Ethernet", fields: { type: "0x8100" } },
        { name: "802.1Q VLAN", fields: { vlan: 100 } },
        {
          name: "IPv6",
          fields: {
            destination: "2001:db8:2::ffff",
            flow_label: 74565,
            hop_limit: 42,
            next_header: 17,
            source: "2001:db8:1::12f8",
            traffic_class: 171
          }
        },
        { name: "UDP", fields: { source: 12345, destination: 5000, length: 8, checksum: "BEEF" } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field IPv6 Version")).toHaveValue("6");
    expect(await screen.findByLabelText("Raw field IPv6 Traffic class")).toHaveValue("171");
    expect(screen.getByLabelText("Raw field IPv6 Flow label")).toHaveValue("74565");
    expect(screen.getByLabelText("Raw field IPv6 Payload length")).toHaveValue("8");
    expect(screen.getByLabelText("Raw field IPv6 Next header")).toHaveValue("17");
    expect(screen.getByLabelText("Raw field IPv6 Hop limit")).toHaveValue("42");
    expect(screen.getByLabelText("Raw field IPv6 Source")).toHaveValue("2001:0db8:0001:0000:0000:0000:0000:12f8");
    expect(screen.getByLabelText("Raw field IPv6 Destination")).toHaveValue("2001:0db8:0002:0000:0000:0000:0000:ffff");
    expect(screen.getByLabelText("Raw field UDP Source port")).toHaveValue("12345");
    expect(screen.getByLabelText("Raw field UDP Destination port")).toHaveValue("5000");
    expect(screen.getByLabelText("Raw field UDP Length")).toHaveValue("8");
    expect(screen.getByLabelText("Raw field UDP Checksum")).toHaveValue("beef");

    for (const staticOnlyField of ["Version", "Payload length", "Next header"]) {
      expect(screen.queryByRole("button", {
        name: `Use Field Engine target for raw field IPv6 ${staticOnlyField}`
      })).not.toBeInTheDocument();
    }

    const trafficClassVm = await selectRawPacketFieldEngineTarget("IPv6 Traffic class", "IPv6 traffic class inc");
    expect(trafficClassVm).toEqual({
      instructions: [
        { init_value: 171, max_value: 186, min_value: 171, name: "ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 18, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "ipv6_traffic_class"
    });
    expect(trafficClassVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ipv6_flow_label" })
    ]));

    const flowLabelVm = await selectRawPacketFieldEngineTarget("IPv6 Flow label", "IPv6 flow label inc");
    expect(flowLabelVm).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12354, min_value: 0x12345, name: "ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 18, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "ipv6_flow_label"
    });
    expect(flowLabelVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ipv6_traffic_class" })
    ]));

    const hopLimitVm = await selectRawPacketFieldEngineTarget("IPv6 Hop limit", "IPv6 hop limit inc");
    expect(hopLimitVm).toEqual({
      instructions: [
        { init_value: 42, max_value: 57, min_value: 42, name: "ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "ipv6_hop_limit", pkt_offset: 25, type: "write_flow_var" }
      ],
      split_by_var: "ipv6_hop_limit"
    });

    const sourceVm = await selectRawPacketFieldEngineTarget("IPv6 Source", "IPv6 src inc");
    expect(sourceVm).toEqual({
      instructions: [
        { init_value: 4856, max_value: 4871, min_value: 4856, name: "ipv6_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "ipv6_src", pkt_offset: 40, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "ipv6_src"
    });

    const destinationVm = await selectRawPacketFieldEngineTarget("IPv6 Destination", "IPv6 dst inc");
    expect(destinationVm).toEqual({
      instructions: [
        { init_value: 65535, max_value: 65550, min_value: 65535, name: "ipv6_dest", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "ipv6_dest", pkt_offset: 54, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "ipv6_dest"
    });

    const udpSourceVm = await selectRawPacketFieldEngineTarget("UDP Source port", "IPv6 UDP src port inc");
    expect(udpSourceVm).toEqual({
      instructions: [
        { init_value: 12345, max_value: 12360, min_value: 12345, name: "l4_src_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "l4_src_port", pkt_offset: 58, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "l4_src_port"
    });

    const udpDestinationVm = await selectRawPacketFieldEngineTarget("UDP Destination port", "IPv6 UDP dst port inc");
    expect(udpDestinationVm).toEqual({
      instructions: [
        { init_value: 5000, max_value: 5015, min_value: 5000, name: "l4_dest_port", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "l4_dest_port", pkt_offset: 60, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "l4_dest_port"
    });

    const udpLengthVm = await selectRawPacketFieldEngineTarget("UDP Length", "IPv6 UDP length inc");
    expect(udpLengthVm).toEqual({
      instructions: [
        { init_value: 8, max_value: 23, min_value: 8, name: "udp_length", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_length", pkt_offset: 62, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "udp_length"
    });

    const udpChecksumVm = await selectRawPacketFieldEngineTarget("UDP Checksum", "IPv6 UDP checksum inc");
    expect(udpChecksumVm).toEqual({
      instructions: [
        { init_value: 48879, max_value: 48894, min_value: 48879, name: "udp_checksum", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "udp_checksum", pkt_offset: 64, type: "write_flow_var" }
      ],
      split_by_var: "udp_checksum"
    });
  }, 40_000);

  it("uses raw IPv6 TCP packet bytes for 5-tuple Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAABQGKiABDbgAEAAAAAAAAAAAEvggAQ24ACAAAAAAAAAAAP//C7kAUAAAAAEAAAAAUAIEAAAAAAA=";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 14 06 2a 20 01 0d b8 00 10 00 00 00 00 00 00 00 00 12 f8 20 01 0d b8 00 20 00 00 00 00 00 00 00 00 ff ff 0b b9 00 50 00 00 00 01 00 00 00 00 50 02 04 00 00 00 00 00";
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
                name: "raw-ipv6-tcp-fe-stream",
                packet_type: "Ethernet/IPv6/TCP",
                frame_length: 74,
                wire_length: 74,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  {
                    name: "IPv6",
                    fields: {
                      destination: "2001:db8:20::ffff",
                      hop_limit: 42,
                      next_header: 6,
                      source: "2001:db8:10::12f8"
                    }
                  },
                  { name: "TCP", fields: { destination: 80, flags: "SYN", source: 3001 } }
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
    await switchPacketPreviewToFieldEngine();

    const targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 TCP 5-tuple inc Field Engine target" })).not.toBeDisabled();
    expect(useFieldEngineTarget("IPv6 TCP 5-tuple inc")).toEqual({
      instructions: [
        {
          init_value: 4856,
          max_value: 4871,
          min_value: 4856,
          name: "ipv6_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_src",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          init_value: 65535,
          max_value: 65550,
          min_value: 65535,
          name: "ipv6_dest",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv6_dest",
          pkt_offset: 50,
          type: "write_flow_var"
        },
        {
          init_value: 3001,
          max_value: 3016,
          min_value: 3001,
          name: "l4_src_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_src_port",
          pkt_offset: 54,
          type: "write_flow_var"
        },
        {
          init_value: 80,
          max_value: 95,
          min_value: 80,
          name: "l4_dest_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_dest_port",
          pkt_offset: 56,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv6_src"
    });
  }, 20_000);

  it("uses the raw IPv6 TCP fixed-header Packet Editor rows as Field Engine targets", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVht1gAAAAABQGKiABDbgAEAAAAAAAAAAAEvggAQ24ACAAAAAAAAAAAP//C7kAUAAAAAEAAAAAUAIEAAAAAAA=";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 86 dd 60 00 00 00 00 14 06 2a 20 01 0d b8 00 10 00 00 00 00 00 00 00 00 12 f8 20 01 0d b8 00 20 00 00 00 00 00 00 00 00 ff ff 0b b9 00 50 00 00 00 01 00 00 00 00 50 02 04 00 00 00 00 00";
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
                name: "raw-ipv6-tcp-port-fe-stream",
                packet_type: "Ethernet/IPv6/TCP",
                frame_length: 74,
                wire_length: 74,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x86dd" } },
                  {
                    name: "IPv6",
                    fields: {
                      destination: "2001:db8:20::ffff",
                      hop_limit: 42,
                      next_header: 6,
                      source: "2001:db8:10::12f8"
                    }
                  },
                  { name: "TCP", fields: { destination: 80, flags: "SYN", source: 3001 } }
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

    const sourcePort = await screen.findByLabelText("Raw field TCP Source port");
    expect(sourcePort).toHaveValue("3001");
    const sourceRow = sourcePort.closest("tr");
    expect(sourceRow).not.toBeNull();
    fireEvent.click(within(sourceRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Source port"
    }));

    let targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 TCP src port inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 3001,
          max_value: 3016,
          min_value: 3001,
          name: "l4_src_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_src_port",
          pkt_offset: 54,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "l4_src_port"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const destinationPort = await screen.findByLabelText("Raw field TCP Destination port");
    expect(destinationPort).toHaveValue("80");
    const row = destinationPort.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Destination port"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use IPv6 TCP dst port inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 80,
          max_value: 95,
          min_value: 80,
          name: "l4_dest_port",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "l4_dest_port",
          pkt_offset: 56,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "l4_dest_port"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const sequence = await screen.findByLabelText("Raw field TCP Sequence");
    expect(sequence).toHaveValue("1");
    const sequenceRow = sequence.closest("tr");
    expect(sequenceRow).not.toBeNull();
    fireEvent.click(within(sequenceRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Sequence"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP sequence inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 16,
          min_value: 1,
          name: "tcp_sequence",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_sequence",
          pkt_offset: 58,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_sequence"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const acknowledge = await screen.findByLabelText("Raw field TCP Acknowledge");
    expect(acknowledge).toHaveValue("0");
    const acknowledgeRow = acknowledge.closest("tr");
    expect(acknowledgeRow).not.toBeNull();
    fireEvent.click(within(acknowledgeRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Acknowledge"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP acknowledge inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_ack",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_ack",
          pkt_offset: 62,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_ack"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const reserved = await screen.findByLabelText("Raw field TCP Reserved");
    expect(reserved).toHaveValue("0");
    const reservedRow = reserved.closest("tr");
    expect(reservedRow).not.toBeNull();
    fireEvent.click(within(reservedRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Reserved"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP reserved bits inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_reserved_bits",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x0F,
          name: "tcp_reserved_bits",
          pkt_cast_size: 1,
          pkt_offset: 66,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_reserved_bits"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const flags = await screen.findByLabelText("Raw field TCP Flags");
    expect(flags).toHaveValue("02");
    const flagsRow = flags.closest("tr");
    expect(flagsRow).not.toBeNull();
    fireEvent.click(within(flagsRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Flags"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP flags inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 2,
          max_value: 17,
          min_value: 2,
          name: "tcp_flags",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x3F,
          name: "tcp_flags",
          pkt_cast_size: 1,
          pkt_offset: 67,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_flags"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const window = await screen.findByLabelText("Raw field TCP Window");
    expect(window).toHaveValue("1024");
    const windowRow = window.closest("tr");
    expect(windowRow).not.toBeNull();
    fireEvent.click(within(windowRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Window"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP window inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1024,
          max_value: 1039,
          min_value: 1024,
          name: "tcp_window",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_window",
          pkt_offset: 68,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_window"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const urgentPointer = await screen.findByLabelText("Raw field TCP Urgent pointer");
    expect(urgentPointer).toHaveValue("0");
    const urgentPointerRow = urgentPointer.closest("tr");
    expect(urgentPointerRow).not.toBeNull();
    fireEvent.click(within(urgentPointerRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Urgent pointer"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP urgent pointer inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_urgent_pointer",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_urgent_pointer",
          pkt_offset: 72,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_urgent_pointer"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const checksum = await screen.findByLabelText("Raw field TCP Checksum");
    expect(checksum).toHaveValue("0000");
    const checksumRow = checksum.closest("tr");
    expect(checksumRow).not.toBeNull();
    fireEvent.click(within(checksumRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP Checksum"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP checksum inc Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_checksum",
          pkt_offset: 70,
          type: "write_flow_var"
        }
      ],
      split_by_var: "tcp_checksum"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const synFlag = await screen.findByLabelText("Raw field TCP SYN flag");
    expect(synFlag).toHaveValue("1");
    const synFlagRow = synFlag.closest("tr");
    expect(synFlagRow).not.toBeNull();
    fireEvent.click(within(synFlagRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP SYN flag"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP SYN flag vary Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "tcp_flag_syn",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x02,
          name: "tcp_flag_syn",
          pkt_cast_size: 1,
          pkt_offset: 67,
          shift: 1,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_flag_syn"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const ackFlag = await screen.findByLabelText("Raw field TCP ACK flag");
    expect(ackFlag).toHaveValue("0");
    const ackFlagRow = ackFlag.closest("tr");
    expect(ackFlagRow).not.toBeNull();
    fireEvent.click(within(ackFlagRow as HTMLElement).getByRole("button", {
      name: "Use Field Engine target for raw field TCP ACK flag"
    }));

    targetMap = await screen.findByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use TCP ACK flag vary Field Engine target" }).closest("tr"))
      .toHaveClass("packet-vm-target-row--selected");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "tcp_flag_ack",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x10,
          name: "tcp_flag_ack",
          pkt_cast_size: 1,
          pkt_offset: 67,
          shift: 4,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 40,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_flag_ack"
    });

    const expectTcpFlagRawFieldTarget = async ({
      fieldLabel,
      mask,
      shift,
      targetLabel,
      variableName
    }: {
      fieldLabel: string;
      mask: number;
      shift: number;
      targetLabel: string;
      variableName: string;
    }) => {
      fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      const field = await screen.findByLabelText(`Raw field TCP ${fieldLabel} flag`);
      expect(field).toHaveValue("0");
      const fieldRow = field.closest("tr");
      expect(fieldRow).not.toBeNull();
      fireEvent.click(within(fieldRow as HTMLElement).getByRole("button", {
        name: `Use Field Engine target for raw field TCP ${fieldLabel} flag`
      }));

      targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetLabel} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      expect(readAdvancedVmBody()).toEqual({
        instructions: [
          {
            init_value: 0,
            max_value: 1,
            min_value: 0,
            name: variableName,
            op: "inc",
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
            pkt_offset: 67,
            shift,
            type: "write_mask_flow_var"
          },
          {
            l2_len: 14,
            l3_len: 40,
            l4_type: 13,
            type: "fix_checksum_hw"
          }
        ],
        split_by_var: variableName
      });
    };

    await expectTcpFlagRawFieldTarget({
      fieldLabel: "URG",
      mask: 0x20,
      shift: 5,
      targetLabel: "TCP URG flag vary",
      variableName: "tcp_flag_urg"
    });
    await expectTcpFlagRawFieldTarget({
      fieldLabel: "PSH",
      mask: 0x08,
      shift: 3,
      targetLabel: "TCP PSH flag vary",
      variableName: "tcp_flag_psh"
    });
    await expectTcpFlagRawFieldTarget({
      fieldLabel: "RST",
      mask: 0x04,
      shift: 2,
      targetLabel: "TCP RST flag vary",
      variableName: "tcp_flag_rst"
    });
    await expectTcpFlagRawFieldTarget({
      fieldLabel: "FIN",
      mask: 0x01,
      shift: 0,
      targetLabel: "TCP FIN flag vary",
      variableName: "tcp_flag_fin"
    });
  }, 90_000);

  it("edits Packet Editor IPv4 options into the raw packet draft", async () => {
    const packetBinary = "qrvM3e7/ABEiM0RVCABGAAAkEjRAAEARAAAQAAABMAAAAZQEAAAEAQAMAAwAAN6tvu8=";
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 46 00 00 24 12 34 40 00 40 11 00 00 10 00 00 01 30 00 00 01 94 04 00 00 04 01 00 0c 00 0c 00 00 de ad be ef";
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
                name: "ipv4-options-stream",
                packet_type: "Ethernet/IPv4/UDP",
                frame_length: 64,
                wire_length: 64,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..F." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "16.0.0.1", dst: "48.0.0.1", protocol: 17, header_length: 24 } },
                  { name: "UDP", fields: { src: 1025, dst: 12, length: 12 } }
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

    expect(await screen.findByLabelText("Raw field IPv4 Header length")).toHaveValue("6");
    expect(screen.getByLabelText("Raw field IPv4 Options Options")).toHaveValue("94040000");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Type")).toHaveValue("148");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Copied flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Class")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Option number")).toHaveValue("20");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Length")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field IPv4 Option 1 Router alert value")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field UDP Source port")).toHaveValue("1025");
    expect(screen.queryByRole("button", {
      name: "Use Field Engine target for raw field IPv4 Options Options"
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const routerAlertTarget = within(targetMap).getByRole("button", {
      name: "Use IPv4 Router Alert inc Field Engine target"
    });
    expect(routerAlertTarget).not.toBeDisabled();
    fireEvent.click(routerAlertTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv4_router_alert",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_router_alert",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          pkt_offset: 14,
          type: "fix_checksum_ipv4"
        }
      ],
      split_by_var: "ipv4_router_alert"
    });

    const optionCopiedFlagTarget = within(targetMap).getByRole("button", {
      name: "Use IPv4 option copied flag vary Field Engine target"
    });
    expect(optionCopiedFlagTarget).not.toBeDisabled();
    fireEvent.click(optionCopiedFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "ipv4_option_copied",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 128,
          name: "ipv4_option_copied",
          pkt_cast_size: 1,
          pkt_offset: 34,
          shift: 7,
          type: "write_mask_flow_var"
        },
        {
          pkt_offset: 14,
          type: "fix_checksum_ipv4"
        }
      ],
      split_by_var: "ipv4_option_copied"
    });

    const optionClassTarget = within(targetMap).getByRole("button", {
      name: "Use IPv4 option class inc Field Engine target"
    });
    expect(optionClassTarget).not.toBeDisabled();
    fireEvent.click(optionClassTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 3,
          min_value: 0,
          name: "ipv4_option_class",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 96,
          name: "ipv4_option_class",
          pkt_cast_size: 1,
          pkt_offset: 34,
          shift: 5,
          type: "write_mask_flow_var"
        },
        {
          pkt_offset: 14,
          type: "fix_checksum_ipv4"
        }
      ],
      split_by_var: "ipv4_option_class"
    });

    const optionNumberTarget = within(targetMap).getByRole("button", {
      name: "Use IPv4 option number inc Field Engine target"
    });
    expect(optionNumberTarget).not.toBeDisabled();
    fireEvent.click(optionNumberTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 20,
          max_value: 23,
          min_value: 20,
          name: "ipv4_option_number",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 31,
          name: "ipv4_option_number",
          pkt_cast_size: 1,
          pkt_offset: 34,
          shift: 0,
          type: "write_mask_flow_var"
        },
        {
          pkt_offset: 14,
          type: "fix_checksum_ipv4"
        }
      ],
      split_by_var: "ipv4_option_number"
    });

    const useRawIpv4OptionFieldEngineTarget = async (field: string, targetLabel: string) => {
      const targetButtonName = `Use Field Engine target for raw field IPv4 Option 1 ${field}`;
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

    expect((await useRawIpv4OptionFieldEngineTarget(
      "Router alert value",
      "IPv4 Router Alert inc"
    )).split_by_var).toBe("ipv4_router_alert");
    expect((await useRawIpv4OptionFieldEngineTarget(
      "Copied flag",
      "IPv4 option copied flag vary"
    )).split_by_var).toBe("ipv4_option_copied");
    expect((await useRawIpv4OptionFieldEngineTarget(
      "Class",
      "IPv4 option class inc"
    )).split_by_var).toBe("ipv4_option_class");
    expect((await useRawIpv4OptionFieldEngineTarget(
      "Option number",
      "IPv4 option number inc"
    )).split_by_var).toBe("ipv4_option_number");

    const refreshedTargetMap = await screen.findByLabelText("Field Engine target map");
    const reservedFlagTarget = within(refreshedTargetMap).getByRole("button", {
      name: "Use IPv4 reserved flag vary Field Engine target"
    });
    expect(reservedFlagTarget).not.toBeDisabled();
    fireEvent.click(reservedFlagTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "ip_reserved",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 32768,
          name: "ip_reserved",
          pkt_cast_size: 2,
          pkt_offset: 20,
          shift: 15,
          type: "write_mask_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 24,
          l4_type: 11,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ip_reserved"
    });

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    const applyRouterAlertValue = screen.getByRole("button", {
      name: "Apply raw field IPv4 Option 1 Router alert value"
    });
    await waitFor(() => expect(applyRouterAlertValue).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Raw field IPv4 Option 1 Router alert value"), { target: { value: "1" } });
    fireEvent.click(applyRouterAlertValue);
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "94 04 00 01 04 01 00 0c"
    );

    fireEvent.change(screen.getByLabelText("Raw field IPv4 Option 1 Copied flag"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply raw field IPv4 Option 1 Copied flag" }));
    expect((screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")).toContain(
      "14 04 00 01 04 01 00 0c"
    );
  }, 60_000);

  it("edits Packet Editor TCP option decoded fields into the raw packet draft", async () => {
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
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "SYN" } },
                  {
                    name: "TCP Options",
                    fields: { mss: 1460, sack_permitted: true, timestamp_value: 123456, timestamp_echo: 654321, window_scale: 7 }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field TCP Data offset")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field TCP Reserved")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field TCP SYN flag")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field TCP ACK flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field TCP FIN flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field TCP Options MSS")).toHaveValue("1460");
    expect(screen.getByLabelText("Raw field TCP Options 2 SACK Permitted")).toHaveValue("0402");
    expect(screen.getByLabelText("Raw field TCP Options 3 Timestamp value")).toHaveValue("123456");
    expect(screen.getByLabelText("Raw field TCP Options 3 Timestamp echo")).toHaveValue("654321");
    expect(screen.getByLabelText("Raw field TCP Options 5 Window Scale")).toHaveValue("7");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const tcpSrcTarget = within(targetMap).getByRole("button", {
      name: "Use TCP src port inc Field Engine target"
    });
    expect(tcpSrcTarget).not.toBeDisabled();
    fireEvent.click(tcpSrcTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 3001,
          max_value: 3016,
          min_value: 3001,
          name: "tcp_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_src"
    });

    const tcpDstTarget = within(targetMap).getByRole("button", {
      name: "Use TCP dst port inc Field Engine target"
    });
    expect(tcpDstTarget).not.toBeDisabled();
    fireEvent.click(tcpDstTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 80,
          max_value: 95,
          min_value: 80,
          name: "tcp_dst",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_dst"
    });

    const tcpFiveTupleTarget = within(targetMap).getByRole("button", {
      name: "Use TCP 5-tuple inc Field Engine target"
    });
    expect(tcpFiveTupleTarget).not.toBeDisabled();
    fireEvent.click(tcpFiveTupleTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 16,
          min_value: 1,
          name: "ipv4_src",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_src",
          pkt_offset: 29,
          type: "write_flow_var"
        },
        {
          init_value: 2,
          max_value: 17,
          min_value: 2,
          name: "ipv4_dst",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "ipv4_dst",
          pkt_offset: 33,
          type: "write_flow_var"
        },
        {
          init_value: 3001,
          max_value: 3016,
          min_value: 3001,
          name: "tcp_src",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_src",
          pkt_offset: 34,
          type: "write_flow_var"
        },
        {
          init_value: 80,
          max_value: 95,
          min_value: 80,
          name: "tcp_dst",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_dst",
          pkt_offset: 36,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "ipv4_src"
    });

    const useTcpFixedHeaderTarget = (name: string) => {
      const button = within(targetMap).getByRole("button", {
        name: `Use ${name} Field Engine target`
      });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      return readAdvancedVmBody();
    };
    const rawTcpChecksumRepair = {
      l2_len: 14,
      l3_len: 20,
      l4_type: 13,
      type: "fix_checksum_hw"
    };

    expect(useTcpFixedHeaderTarget("TCP sequence inc")).toEqual({
      instructions: [
        {
          init_value: 287454020,
          max_value: 287454035,
          min_value: 287454020,
          name: "tcp_sequence",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_sequence",
          pkt_offset: 38,
          type: "write_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_sequence"
    });

    expect(useTcpFixedHeaderTarget("TCP acknowledge inc")).toEqual({
      instructions: [
        {
          init_value: 1432778632,
          max_value: 1432778647,
          min_value: 1432778632,
          name: "tcp_ack",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_ack",
          pkt_offset: 42,
          type: "write_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_ack"
    });

    expect(useTcpFixedHeaderTarget("TCP window inc")).toEqual({
      instructions: [
        {
          init_value: 1024,
          max_value: 1039,
          min_value: 1024,
          name: "tcp_window",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_window",
          pkt_offset: 48,
          type: "write_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_window"
    });

    expect(useTcpFixedHeaderTarget("TCP urgent pointer inc")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_urgent_pointer",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_urgent_pointer",
          pkt_offset: 52,
          type: "write_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_urgent_pointer"
    });

    expect(useTcpFixedHeaderTarget("TCP flags inc")).toEqual({
      instructions: [
        {
          init_value: 2,
          max_value: 17,
          min_value: 2,
          name: "tcp_flags",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x3F,
          name: "tcp_flags",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 0,
          type: "write_mask_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_flags"
    });

    expect(useTcpFixedHeaderTarget("TCP reserved bits inc")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_reserved_bits",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x0F,
          name: "tcp_reserved_bits",
          pkt_cast_size: 1,
          pkt_offset: 46,
          shift: 0,
          type: "write_mask_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_reserved_bits"
    });

    expect(useTcpFixedHeaderTarget("TCP SYN flag vary")).toEqual({
      instructions: [
        {
          init_value: 1,
          max_value: 1,
          min_value: 0,
          name: "tcp_flag_syn",
          op: "dec",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x02,
          name: "tcp_flag_syn",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 1,
          type: "write_mask_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_flag_syn"
    });

    expect(useTcpFixedHeaderTarget("TCP ACK flag vary")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 1,
          min_value: 0,
          name: "tcp_flag_ack",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          mask: 0x10,
          name: "tcp_flag_ack",
          pkt_cast_size: 1,
          pkt_offset: 47,
          shift: 4,
          type: "write_mask_flow_var"
        },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_flag_ack"
    });

    expect(useTcpFixedHeaderTarget("TCP checksum inc")).toEqual({
      instructions: [
        {
          init_value: 0,
          max_value: 15,
          min_value: 0,
          name: "tcp_checksum",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_checksum",
          pkt_offset: 50,
          type: "write_flow_var"
        }
      ],
      split_by_var: "tcp_checksum"
    });

    const tcpMssTarget = within(targetMap).getByRole("button", {
      name: "Use TCP MSS option inc Field Engine target"
    });
    expect(tcpMssTarget).not.toBeDisabled();
    fireEvent.click(tcpMssTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1460,
          max_value: 1463,
          min_value: 1460,
          name: "tcp_option_mss",
          op: "inc",
          size: 2,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_mss",
          pkt_offset: 56,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_mss"
    });

    const tcpTimestampValueTarget = within(targetMap).getByRole("button", {
      name: "Use TCP timestamp value inc Field Engine target"
    });
    expect(tcpTimestampValueTarget).not.toBeDisabled();
    fireEvent.click(tcpTimestampValueTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 123456,
          max_value: 123459,
          min_value: 123456,
          name: "tcp_option_timestamp_value",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_timestamp_value",
          pkt_offset: 62,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_timestamp_value"
    });

    const tcpTimestampEchoTarget = within(targetMap).getByRole("button", {
      name: "Use TCP timestamp echo inc Field Engine target"
    });
    expect(tcpTimestampEchoTarget).not.toBeDisabled();
    fireEvent.click(tcpTimestampEchoTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 654321,
          max_value: 654324,
          min_value: 654321,
          name: "tcp_option_timestamp_echo",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_timestamp_echo",
          pkt_offset: 66,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_timestamp_echo"
    });

    const tcpWindowScaleTarget = within(targetMap).getByRole("button", {
      name: "Use TCP window scale option inc Field Engine target"
    });
    expect(tcpWindowScaleTarget).not.toBeDisabled();
    fireEvent.click(tcpWindowScaleTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 7,
          max_value: 10,
          min_value: 7,
          name: "tcp_option_window_scale",
          op: "inc",
          size: 1,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_window_scale",
          pkt_offset: 73,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_window_scale"
    });

    expect(within(targetMap).getByRole("button", {
      name: "Use TCP SACK left edge inc Field Engine target"
    })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    await waitFor(() => expect(screen.getByLabelText("Raw field TCP ACK flag")).toHaveValue("0"));

    const applyRawField = async (label: string, value: string, expectedHex: string) => {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      await waitFor(() => expect(input).toHaveValue(value));
      fireEvent.click(screen.getByRole("button", { name: label.replace("Raw field ", "Apply raw field ") }));
      await waitFor(() => expect(
        (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value.replace(/\s+/g, " ")
      ).toContain(expectedHex));
    };

    await applyRawField("Raw field TCP ACK flag", "1", "a0 12 04 00");
    await applyRawField("Raw field TCP SYN flag", "0", "a0 10 04 00");
    await applyRawField("Raw field TCP FIN flag", "1", "a0 11 04 00");
    await applyRawField("Raw field TCP Options MSS", "1461", "02 04 05 b5 04 02");
    await applyRawField(
      "Raw field TCP Options 3 Timestamp value",
      "123457",
      "08 0a 00 01 e2 41 00 09 fb f1"
    );
    await applyRawField("Raw field TCP Options 5 Window Scale", "8", "01 03 03 08");
    const rawHexAfterTcpOptions = (screen.getByLabelText("Raw packet hex") as HTMLTextAreaElement).value;
    expectRawIpv4ChecksumValid(rawHexAfterTcpOptions, 14);
    expectRawTransportChecksumValid(rawHexAfterTcpOptions, { ipOffset: 14, ipVersion: 4, l4Offset: 34, protocol: 6 });
  }, 45_000);

  it("uses TCP option Packet Editor rows as Field Engine targets", async () => {
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
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "SYN" } },
                  {
                    name: "TCP Options",
                    fields: { mss: 1460, sack_permitted: true, timestamp_value: 123456, timestamp_echo: 654321, window_scale: 7 }
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field TCP Options MSS")).toHaveValue("1460");
    expect(screen.getByLabelText("Raw field TCP Options 3 Timestamp value")).toHaveValue("123456");
    expect(screen.getByLabelText("Raw field TCP Options 3 Timestamp echo")).toHaveValue("654321");
    expect(screen.getByLabelText("Raw field TCP Options 5 Window Scale")).toHaveValue("7");

    const rawTcpChecksumRepair = { l2_len: 14, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" };
    const useRawTcpOptionFieldEngineTarget = async (field: string, targetName: string) => {
      const fieldLabel = `Raw field TCP Options ${field}`;
      const targetButtonName = `Use Field Engine target for raw field TCP Options ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(fieldLabel)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      return readAdvancedVmBody();
    };

    expect(await useRawTcpOptionFieldEngineTarget("MSS", "TCP MSS option inc")).toEqual({
      instructions: [
        { init_value: 1460, max_value: 1463, min_value: 1460, name: "tcp_option_mss", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_option_mss", pkt_offset: 56, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_option_mss"
    });

    expect(await useRawTcpOptionFieldEngineTarget("3 Timestamp value", "TCP timestamp value inc")).toEqual({
      instructions: [
        { init_value: 123456, max_value: 123459, min_value: 123456, name: "tcp_option_timestamp_value", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_option_timestamp_value", pkt_offset: 62, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_option_timestamp_value"
    });

    expect(await useRawTcpOptionFieldEngineTarget("3 Timestamp echo", "TCP timestamp echo inc")).toEqual({
      instructions: [
        { init_value: 654321, max_value: 654324, min_value: 654321, name: "tcp_option_timestamp_echo", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_option_timestamp_echo", pkt_offset: 66, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_option_timestamp_echo"
    });

    expect(await useRawTcpOptionFieldEngineTarget("5 Window Scale", "TCP window scale option inc")).toEqual({
      instructions: [
        { init_value: 7, max_value: 10, min_value: 7, name: "tcp_option_window_scale", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "tcp_option_window_scale", pkt_offset: 73, type: "write_flow_var" },
        rawTcpChecksumRepair
      ],
      split_by_var: "tcp_option_window_scale"
    });
  }, 30_000);

  it("uses TCP SACK Packet Editor rows as Field Engine targets", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 06 00 00 0a 0a 0a 01 0a 0a 0a 02 0b b9 00 50 11 22 33 44 55 66 77 88 e0 10 04 00 00 00 00 00 05 22 00 00 03 e8 00 00 07 d0 00 00 0b b8 00 00 0f a0 00 00 13 88 00 00 17 70 00 00 1b 58 00 00 1f 40 01 01";
    const packetBinary = btoa(String.fromCharCode(...packetHex.split(/\s+/).map((part) => Number.parseInt(part, 16))));
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
                name: "tcp-sack-stream",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.10.10.1", dst: "10.10.10.2", protocol: 6 } },
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "ACK" } },
                  { name: "TCP Options", fields: { sack_left: 1000, sack_right: 2000, sack4_left: 7000, sack4_right: 8000 } }
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

    expect(await screen.findByLabelText("Raw field TCP Options SACK 1 left edge")).toHaveValue("1000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 4 right edge")).toHaveValue("8000");

    const useRawSackFieldEngineTarget = async (
      field: string,
      targetName: string,
      variableName: string,
      initValue: number,
      pktOffset: number
    ) => {
      const fieldLabel = `Raw field TCP Options ${field}`;
      const targetButtonName = `Use Field Engine target for raw field TCP Options ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(fieldLabel)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      const targetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(targetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      expect(readAdvancedVmBody()).toEqual({
        instructions: [
          { init_value: initValue, max_value: initValue + 3, min_value: initValue, name: variableName, op: "inc", size: 4, step: 1, type: "flow_var" },
          { add_value: 0, is_big_endian: true, name: variableName, pkt_offset: pktOffset, type: "write_flow_var" },
          { l2_len: 14, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
        ],
        split_by_var: variableName
      });
    };

    await useRawSackFieldEngineTarget("SACK 1 left edge", "TCP SACK left edge inc", "tcp_option_sack_left_edge", 1000, 56);
    await useRawSackFieldEngineTarget("SACK 2 right edge", "TCP SACK 2 right edge inc", "tcp_option_sack2_right_edge", 4000, 68);
    await useRawSackFieldEngineTarget("SACK 3 left edge", "TCP SACK 3 left edge inc", "tcp_option_sack3_left_edge", 5000, 72);
    await useRawSackFieldEngineTarget("SACK 4 right edge", "TCP SACK 4 right edge inc", "tcp_option_sack4_right_edge", 8000, 84);
  }, 30_000);

  it("exposes Packet Editor TCP SACK option edges as raw Field Engine targets", async () => {
    const packetHex =
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 45 00 00 4c 12 34 40 00 40 06 00 00 0a 0a 0a 01 0a 0a 0a 02 0b b9 00 50 11 22 33 44 55 66 77 88 e0 10 04 00 00 00 00 00 05 22 00 00 03 e8 00 00 07 d0 00 00 0b b8 00 00 0f a0 00 00 13 88 00 00 17 70 00 00 1b 58 00 00 1f 40 01 01";
    const packetBinary = btoa(String.fromCharCode(...packetHex.split(/\s+/).map((part) => Number.parseInt(part, 16))));
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
                name: "tcp-sack-stream",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 90,
                wire_length: 90,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.10.10.1", dst: "10.10.10.2", protocol: 6 } },
                  { name: "TCP", fields: { src: 3001, dst: 80, flags: "ACK" } },
                  {
                    name: "TCP Options",
                    fields: {
                      sack_left: 1000,
                      sack_right: 2000,
                      sack2_left: 3000,
                      sack2_right: 4000,
                      sack3_left: 5000,
                      sack3_right: 6000,
                      sack4_left: 7000,
                      sack4_right: 8000
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
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText(packetHex);
    fireEvent.click(screen.getByRole("button", { name: "Advanced mode" }));

    expect(await screen.findByLabelText("Raw field TCP Options SACK 1 left edge")).toHaveValue("1000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 1 right edge")).toHaveValue("2000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 2 left edge")).toHaveValue("3000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 2 right edge")).toHaveValue("4000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 3 left edge")).toHaveValue("5000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 3 right edge")).toHaveValue("6000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 4 left edge")).toHaveValue("7000");
    expect(screen.getByLabelText("Raw field TCP Options SACK 4 right edge")).toHaveValue("8000");

    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    const targetMap = await screen.findByLabelText("Field Engine target map");
    const sackLeftTarget = within(targetMap).getByRole("button", {
      name: "Use TCP SACK left edge inc Field Engine target"
    });
    expect(sackLeftTarget).not.toBeDisabled();
    fireEvent.click(sackLeftTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 1000,
          max_value: 1003,
          min_value: 1000,
          name: "tcp_option_sack_left_edge",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_sack_left_edge",
          pkt_offset: 56,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_sack_left_edge"
    });

    const sackRightTarget = within(targetMap).getByRole("button", {
      name: "Use TCP SACK right edge inc Field Engine target"
    });
    expect(sackRightTarget).not.toBeDisabled();
    fireEvent.click(sackRightTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 2000,
          max_value: 2003,
          min_value: 2000,
          name: "tcp_option_sack_right_edge",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_sack_right_edge",
          pkt_offset: 60,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_sack_right_edge"
    });

    const sack2LeftTarget = within(targetMap).getByRole("button", {
      name: "Use TCP SACK 2 left edge inc Field Engine target"
    });
    expect(sack2LeftTarget).not.toBeDisabled();
    fireEvent.click(sack2LeftTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 3000,
          max_value: 3003,
          min_value: 3000,
          name: "tcp_option_sack2_left_edge",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_sack2_left_edge",
          pkt_offset: 64,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_sack2_left_edge"
    });

    const sack2RightTarget = within(targetMap).getByRole("button", {
      name: "Use TCP SACK 2 right edge inc Field Engine target"
    });
    expect(sack2RightTarget).not.toBeDisabled();
    fireEvent.click(sack2RightTarget);
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        {
          init_value: 4000,
          max_value: 4003,
          min_value: 4000,
          name: "tcp_option_sack2_right_edge",
          op: "inc",
          size: 4,
          step: 1,
          type: "flow_var"
        },
        {
          add_value: 0,
          is_big_endian: true,
          name: "tcp_option_sack2_right_edge",
          pkt_offset: 68,
          type: "write_flow_var"
        },
        {
          l2_len: 14,
          l3_len: 20,
          l4_type: 13,
          type: "fix_checksum_hw"
        }
      ],
      split_by_var: "tcp_option_sack2_right_edge"
    });

    const expectSackRawTarget = (label: string, variableName: string, initValue: number, pktOffset: number) => {
      const target = within(targetMap).getByRole("button", {
        name: `Use ${label} Field Engine target`
      });
      expect(target).not.toBeDisabled();
      fireEvent.click(target);
      expect(readAdvancedVmBody()).toEqual({
        instructions: [
          {
            init_value: initValue,
            max_value: initValue + 3,
            min_value: initValue,
            name: variableName,
            op: "inc",
            size: 4,
            step: 1,
            type: "flow_var"
          },
          {
            add_value: 0,
            is_big_endian: true,
            name: variableName,
            pkt_offset: pktOffset,
            type: "write_flow_var"
          },
          {
            l2_len: 14,
            l3_len: 20,
            l4_type: 13,
            type: "fix_checksum_hw"
          }
        ],
        split_by_var: variableName
      });
    };

    expectSackRawTarget("TCP SACK 3 left edge inc", "tcp_option_sack3_left_edge", 5000, 72);
    expectSackRawTarget("TCP SACK 3 right edge inc", "tcp_option_sack3_right_edge", 6000, 76);
    expectSackRawTarget("TCP SACK 4 left edge inc", "tcp_option_sack4_left_edge", 7000, 80);
    expectSackRawTarget("TCP SACK 4 right edge inc", "tcp_option_sack4_right_edge", 8000, 84);
  }, 45_000);
});
