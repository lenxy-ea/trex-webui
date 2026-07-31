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
  returnAdvancedStreamToStructured,
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

describe("Traffic Profiles / Tunnels / GRE", () => {
  installAppTestHooks();

  it("uses GRE inner IPv4 Packet Editor fixed-header and bitfield rows as Field Engine targets", async () => {
    const rawPacket = packetBytesFromRawHex(
      "aa bb cc dd ee ff 00 11 22 33 44 55 08 00 "
      + "45 00 00 40 12 34 40 00 40 2f 00 00 0a 00 00 01 0a 00 00 02 "
      + "30 00 08 00 12 34 56 78 00 00 00 07 "
      + "45 2b 00 20 12 34 40 04 40 11 00 00 0a 02 00 0a 0a 02 00 14 "
      + "7d 00 7d 64 00 0c 00 00 de ad be ef"
    );

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({ advanced_mode: true, packet_type: "Ethernet" }),
      "Ethernet/IPv4/GRE/IPv4/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { source: "10.0.0.1", destination: "10.0.0.2", protocol: "GRE" } },
        { name: "GRE", fields: { flags: "0x3000", protocol_type: "0x0800", key: 305419896, sequence: 7 } },
        { name: "Inner IPv4", fields: { source: "10.2.0.10", destination: "10.2.0.20", dscp: 10, ecn: 3, identification: "0x1234", fragment_offset: 4, protocol: "UDP" } },
        { name: "Inner UDP", fields: { source_port: 32000, destination_port: 32100, length: 12 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field Inner IPv4 DSCP")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field Inner IPv4 ECN")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field Inner IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field Inner IPv4 Reserved flag")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field Inner IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field Inner IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field Inner IPv4 Fragment offset")).toHaveValue("4");
    expect(screen.getByLabelText("Raw field Inner IPv4 TTL")).toHaveValue("64");

    const applyRawGreFieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };
    const expectSelectedGreTarget = (label: string) => {
      expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
        name: `Use ${label} Field Engine target`
      }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    };

    const cases = [
      {
        body: {
          instructions: [
            { init_value: 0x1234, max_value: 0x1243, min_value: 0x1234, name: "gre_inner_ipv4_id", op: "inc", size: 2, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_id", pkt_offset: 50, type: "write_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_id"
        },
        field: "Inner IPv4 Identification",
        target: "GRE inner IPv4 ID inc"
      },
      {
        body: {
          instructions: [
            { init_value: 10, max_value: 25, min_value: 10, name: "gre_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0xfc, name: "gre_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 47, shift: 2, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_dscp"
        },
        field: "Inner IPv4 DSCP",
        target: "GRE inner IPv4 DSCP inc"
      },
      {
        body: {
          instructions: [
            { init_value: 3, max_value: 3, min_value: 3, name: "gre_inner_ipv4_ecn", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x03, name: "gre_inner_ipv4_ecn", pkt_cast_size: 1, pkt_offset: 47, shift: 0, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_ecn"
        },
        field: "Inner IPv4 ECN",
        target: "GRE inner IPv4 ECN inc"
      },
      {
        body: {
          instructions: [
            { init_value: 0, max_value: 1, min_value: 0, name: "gre_inner_ipv4_reserved", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x8000, name: "gre_inner_ipv4_reserved", pkt_cast_size: 2, pkt_offset: 52, shift: 15, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_reserved"
        },
        field: "Inner IPv4 Reserved flag",
        target: "GRE inner IPv4 reserved flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 1, max_value: 1, min_value: 0, name: "gre_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x4000, name: "gre_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 52, shift: 14, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_df"
        },
        field: "Inner IPv4 Don't fragment",
        target: "GRE inner IPv4 Don't fragment flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 0, max_value: 1, min_value: 0, name: "gre_inner_ipv4_mf", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x2000, name: "gre_inner_ipv4_mf", pkt_cast_size: 2, pkt_offset: 52, shift: 13, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_mf"
        },
        field: "Inner IPv4 More fragments",
        target: "GRE inner IPv4 More fragments flag vary"
      },
      {
        body: {
          instructions: [
            { init_value: 4, max_value: 19, min_value: 4, name: "gre_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "gre_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 52, shift: 0, type: "write_mask_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_fragment_offset"
        },
        field: "Inner IPv4 Fragment offset",
        target: "GRE inner IPv4 fragment offset inc"
      },
      {
        body: {
          instructions: [
            { init_value: 64, max_value: 79, min_value: 64, name: "gre_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
            { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_ttl", pkt_offset: 54, type: "write_flow_var" },
            { l2_len: 46, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
          ],
          split_by_var: "gre_inner_ipv4_ttl"
        },
        field: "Inner IPv4 TTL",
        target: "GRE inner IPv4 TTL inc"
      }
    ];

    for (const item of cases) {
      const vm = await applyRawGreFieldEngineTarget(item.field);
      expectSelectedGreTarget(item.target);
      expect(vm).toEqual(item.body);
    }
  }, 40_000);

  it("renders GRE inner Field Engine controls through the structured Stream Builder editor", async () => {
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
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 128,
                wire_length: 128,
                binary_base64: "",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { protocol: "GRE" } },
                  {
                    name: "GRE",
                    fields: {
                      checksum_present: false,
                      key_present: true,
                      key: 305419896,
                      key_mode: "Fixed",
                      sequence_present: true,
                      sequence: 7,
                      sequence_mode: "Fixed",
                      protocol_type: "0x0800"
                    }
                  },
                  {
                    name: "Inner Internet Protocol v4",
                    fields: {
                      source: "10.2.0.10",
                      source_mode: "Increment Host",
                      source_count: 4,
                      source_step: 1,
                      destination: "10.2.0.20",
                      destination_mode: "Increment Host",
                      destination_count: 4,
                      destination_step: 1,
                      ttl: 40,
                      ttl_mode: "Increment",
                      ttl_count: 4,
                      ttl_step: 1,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "Inner UDP",
                    fields: {
                      source_port: 32000,
                      source_port_mode: "Increment",
                      source_port_count: 4,
                      source_port_step: 1,
                      destination_port: 32100,
                      destination_port_mode: "Increment",
                      destination_port_count: 4,
                      destination_port_step: 1,
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
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE key"));
    fireEvent.change(screen.getByLabelText("GRE key"), { target: { value: "305419896" } });
    fireEvent.click(screen.getByLabelText("Include GRE sequence"));
    fireEvent.change(screen.getByLabelText("GRE sequence"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 source"), { target: { value: "10.2.0.10" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 destination"), { target: { value: "10.2.0.20" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 TTL"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv4 TTL step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port"), { target: { value: "32000" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port"), { target: { value: "32100" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port step"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv4/GRE"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_ipv4_src_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_ipv4_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_l4_dst_port_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_checksum_present":false')
      })
    );
    expect(screen.getAllByText("GRE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Inner Internet Protocol v4")).toBeInTheDocument();
    expect(screen.getByText("source_mode")).toBeInTheDocument();
    expect(screen.getAllByText("Increment").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("32100")).toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();
  }, 40_000);

  it("renders GRE inner IPv6 Field Engine controls through the structured Stream Builder editor", async () => {
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
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 128,
                wire_length: 128,
                binary_base64: "",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { protocol: "GRE" } },
                  {
                    name: "GRE",
                    fields: {
                      checksum_present: false,
                      key_present: true,
                      key: 305419896,
                      sequence_present: true,
                      sequence: 7,
                      protocol_type: "0x86DD"
                    }
                  },
                  {
                    name: "Inner Internet Protocol v6",
                    fields: {
                      source: "2001:db8:40::10",
                      source_mode: "Increment Host",
                      source_count: 4,
                      source_step: 1,
                      destination: "2001:db8:40::20",
                      destination_mode: "Increment Host",
                      destination_count: 4,
                      destination_step: 1,
                      hop_limit: 42,
                      hop_limit_mode: "Increment",
                      hop_limit_count: 4,
                      hop_limit_step: 1,
                      next_header: "UDP"
                    }
                  },
                  {
                    name: "Inner UDP",
                    fields: {
                      source_port: 32000,
                      source_port_mode: "Increment",
                      source_port_count: 4,
                      source_port_step: 1,
                      destination_port: 32100,
                      destination_port_mode: "Increment",
                      destination_port_count: 4,
                      destination_port_step: 1,
                      checksum: "calculated"
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
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE key"));
    fireEvent.change(screen.getByLabelText("GRE key"), { target: { value: "305419896" } });
    fireEvent.click(screen.getByLabelText("Include GRE sequence"));
    fireEvent.change(screen.getByLabelText("GRE sequence"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("GRE inner IP version"), { target: { value: "IPv6" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 source"), { target: { value: "2001:db8:40::10" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 destination"), { target: { value: "2001:db8:40::20" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 hop limit"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 hop limit mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 hop limit count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner IPv6 hop limit step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port"), { target: { value: "32000" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port"), { target: { value: "32100" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("GRE inner UDP destination port step"), { target: { value: "1" } });

    expect(screen.getByLabelText("GRE inner IPv6 source mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GRE inner IPv6 destination mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GRE inner IPv6 hop limit mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GRE inner UDP source port mode")).not.toBeDisabled();
    expect(screen.getByLabelText("GRE inner UDP destination port mode")).not.toBeDisabled();
    expect(screen.queryByLabelText("GRE inner IPv4 source")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"gre_inner_ip_version":"IPv6"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_protocol_type":"86DD"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_ipv6_src_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_ipv6_hop_limit_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"gre_inner_l4_src_port_mode":"Increment"')
      })
    );
    expect(screen.getByText("Inner Internet Protocol v6")).toBeInTheDocument();
    expect(screen.getByText("source_mode")).toBeInTheDocument();
    expect(screen.getByText("hop_limit_mode")).toBeInTheDocument();
    expect(screen.getByText("2001:db8:40::20")).toBeInTheDocument();
    expect(screen.getByText("calculated")).toBeInTheDocument();
  }, 40_000);

  it("inserts the GRE inner 5-tuple advanced VM template for basic GRE streams", async () => {
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
                packet_type: "Ethernet/IPv4/GRE",
                frame_length: 96,
                wire_length: 96,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { protocol: "GRE" } },
                  { name: "GRE", fields: { protocol_type: "0x0800" } },
                  { name: "Inner Internet Protocol v4", fields: { source: "10.2.0.1", destination: "10.2.0.2" } },
                  { name: "Inner UDP", fields: { source_port: 1025, destination_port: 12 } }
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
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gre-inner-5tuple-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const greInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    const greInnerVm = JSON.parse(greInnerVmJson);
    expect(greInnerVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 1, max_value: 16, min_value: 1, name: "gre_inner_ipv4_src" }),
      expect.objectContaining({ init_value: 2, max_value: 17, min_value: 2, name: "gre_inner_ipv4_dst" }),
      expect.objectContaining({ init_value: 1025, max_value: 1040, min_value: 1025, name: "gre_inner_udp_src" }),
      expect.objectContaining({ init_value: 12, max_value: 27, min_value: 12, name: "gre_inner_udp_dst" })
    ]));
    expect(greInnerVmJson).toContain('"name": "gre_inner_ipv4_src"');
    expect(greInnerVmJson).toContain('"pkt_offset": 53');
    expect(greInnerVmJson).toContain('"name": "gre_inner_ipv4_dst"');
    expect(greInnerVmJson).toContain('"pkt_offset": 57');
    expect(greInnerVmJson).toContain('"name": "gre_inner_udp_src"');
    expect(greInnerVmJson).toContain('"pkt_offset": 58');
    expect(greInnerVmJson).toContain('"name": "gre_inner_udp_dst"');
    expect(greInnerVmJson).toContain('"pkt_offset": 60');
    expect(greInnerVmJson).toContain('"l2_len": 38');
    expect(greInnerVmJson).toContain('"l4_type": 11');
  }, 20_000);

  it("adjusts GRE inner advanced VM offsets for key and sequence options", async () => {
    const greKeySequencePreviewResponse = {
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
              packet_type: "Ethernet/IPv4/GRE",
              frame_length: 104,
              wire_length: 104,
              binary_base64: "AAAA",
              hex: "",
              hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
              layers: [
                { name: "Ethernet", fields: { destination: "00:00:00:00:00:00", source: "00:00:00:00:00:00", type: "0x0800" } },
                { name: "Internet Protocol v4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "GRE" } },
                {
                  name: "GRE",
                  fields: {
                    checksum_present: false,
                    key_present: true,
                    key: 16909060,
                    sequence_present: true,
                    sequence: 7,
                    protocol_type: "0x0800"
                  }
                },
                { name: "Inner Internet Protocol v4", fields: { source: "10.2.0.1", destination: "10.2.0.2", protocol: "UDP" } },
                { name: "Inner UDP", fields: { source_port: 1025, destination_port: 12, checksum: "0x0000" } }
              ]
            }
          ]
        },
        blocker: null,
        error: null
      })
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue(greKeySequencePreviewResponse);
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE key"));
    fireEvent.click(screen.getByLabelText("Include GRE sequence"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "gre-inner-5tuple-inc" } });
    await waitFor(() => expect(screen.getByLabelText("Advanced VM template")).toHaveValue("gre-inner-5tuple-inc"));
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const greInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(greInnerVmJson).toContain('"name": "gre_inner_ipv4_src"');
    expect(greInnerVmJson).toContain('"pkt_offset": 61');
    expect(greInnerVmJson).toContain('"name": "gre_inner_ipv4_dst"');
    expect(greInnerVmJson).toContain('"pkt_offset": 65');
    expect(greInnerVmJson).toContain('"name": "gre_inner_udp_src"');
    expect(greInnerVmJson).toContain('"pkt_offset": 66');
    expect(greInnerVmJson).toContain('"name": "gre_inner_udp_dst"');
    expect(greInnerVmJson).toContain('"pkt_offset": 68');
    expect(greInnerVmJson).toContain('"l2_len": 46');
    expect(greInnerVmJson).toContain('"l4_type": 11');

    await returnAdvancedStreamToStructured();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE checksum"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await screen.findByText("checksum_present");
    await switchPacketPreviewToFieldEngine();
    expect(screen.getByText("Template requires Ethernet[/VLAN/MPLS]/IPv4/GRE stream without GRE checksum option.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert VM" })).toBeDisabled();
  }, 20_000);

  it("exposes GRE inner IPv4 Field Engine targets with backend-aligned offsets", async () => {
    const grePreviewResponse = {
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
              packet_type: "Ethernet/IPv4/GRE",
              frame_length: 104,
              wire_length: 104,
              binary_base64: "AAAA",
              hex: "",
              hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
              layers: [
                { name: "Ethernet", fields: { type: "0x0800" } },
                { name: "Internet Protocol v4", fields: { protocol: "GRE" } },
                {
                  name: "GRE",
                  fields: {
                    checksum_present: false,
                    key_present: true,
                    key: 16909060,
                    sequence_present: true,
                    sequence: 7,
                    protocol_type: "0x0800"
                  }
                },
                { name: "Inner Internet Protocol v4", fields: { source: "10.2.0.1", destination: "10.2.0.2", ttl: 64, protocol: "UDP" } },
                { name: "Inner UDP", fields: { source_port: 1025, destination_port: 12, checksum: "0x0000" } }
              ]
            }
          ]
        },
        blocker: null,
        error: null
      })
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue(grePreviewResponse);
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE key"));
    fireEvent.change(screen.getByLabelText("GRE key"), { target: { value: "16909060" } });
    fireEvent.click(screen.getByLabelText("Include GRE sequence"));
    fireEvent.change(screen.getByLabelText("GRE sequence"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    const greTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE protocol type inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE sequence inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const greProtocolTypeVm = useFieldEngineTarget("GRE protocol type inc");
    expect(greProtocolTypeVm.split_by_var).toBe("gre_protocol_type");
    expect(greProtocolTypeVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 2048,
        max_value: 2063,
        min_value: 2048,
        name: "gre_protocol_type",
        size: 2,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_protocol_type",
        pkt_offset: 36,
        type: "write_flow_var"
      })
    ]));
    expect(greProtocolTypeVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const greKeyVm = useFieldEngineTarget("GRE key inc");
    expect(greKeyVm.split_by_var).toBe("gre_key");
    expect(greKeyVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 16909060,
        max_value: 16909075,
        min_value: 16909060,
        name: "gre_key",
        size: 4,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_key",
        pkt_offset: 38,
        type: "write_flow_var"
      })
    ]));
    expect(greKeyVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const greSequenceVm = useFieldEngineTarget("GRE sequence inc");
    expect(greSequenceVm.split_by_var).toBe("gre_sequence");
    expect(greSequenceVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 7,
        max_value: 22,
        min_value: 7,
        name: "gre_sequence",
        size: 4,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_sequence",
        pkt_offset: 42,
        type: "write_flow_var"
      })
    ]));
    expect(greSequenceVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const expectGreInnerIpv4Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 46,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const greInnerSrcVm = useFieldEngineTarget("GRE inner IPv4 src inc");
    expect(greInnerSrcVm.split_by_var).toBe("gre_inner_ipv4_src");
    expect(greInnerSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 16,
        min_value: 1,
        name: "gre_inner_ipv4_src",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv4_src",
        pkt_offset: 61,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv4Checksum(greInnerSrcVm);

    const greInnerDstVm = useFieldEngineTarget("GRE inner IPv4 dst inc");
    expect(greInnerDstVm.split_by_var).toBe("gre_inner_ipv4_dst");
    expect(greInnerDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 2,
        max_value: 17,
        min_value: 2,
        name: "gre_inner_ipv4_dst",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv4_dst",
        pkt_offset: 65,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv4Checksum(greInnerDstVm);

    const greInnerTtlVm = useFieldEngineTarget("GRE inner IPv4 TTL inc");
    expect(greInnerTtlVm.split_by_var).toBe("gre_inner_ipv4_ttl");
    expect(greInnerTtlVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 64,
        max_value: 79,
        min_value: 64,
        name: "gre_inner_ipv4_ttl",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv4_ttl",
        pkt_offset: 54,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv4Checksum(greInnerTtlVm);

    const greInnerUdpSrcVm = useFieldEngineTarget("GRE inner UDP src port inc");
    expect(greInnerUdpSrcVm.split_by_var).toBe("gre_inner_udp_src");
    expect(greInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1025,
        max_value: 1040,
        min_value: 1025,
        name: "gre_inner_udp_src",
        size: 2,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_udp_src",
        pkt_offset: 66,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv4Checksum(greInnerUdpSrcVm);

    const greInnerUdpDstVm = useFieldEngineTarget("GRE inner UDP dst port inc");
    expect(greInnerUdpDstVm.split_by_var).toBe("gre_inner_udp_dst");
    expect(greInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 12,
        max_value: 27,
        min_value: 12,
        name: "gre_inner_udp_dst",
        size: 2,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_udp_dst",
        pkt_offset: 68,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv4Checksum(greInnerUdpDstVm);

    await returnAdvancedStreamToStructured();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE checksum"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));
    await switchPacketPreviewToFieldEngine();
    const checksumTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(checksumTargetMap).getByRole("button", { name: "Use GRE protocol type inc Field Engine target" })).toBeDisabled();
    expect(within(checksumTargetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).toBeDisabled();
    expect(within(checksumTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(checksumTargetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).toBeDisabled();
  }, 30_000);

  it("keeps GRE raw inner IPv4 TTL target available without inner UDP", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x2c, 0x12, 0x34, 0x00, 0x00, 0x40, 0x2f,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x08, 0x00,
      0x45, 0x2b, 0x00, 0x14, 0x12, 0x34, 0x40, 0x04, 0x28, 0x00,
      0x00, 0x00, 0x0a, 0x02, 0x00, 0x0a, 0x0a, 0x02, 0x00, 0x14
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawGreStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      gre_inner_ipv4_dst_count: 4,
      gre_inner_ipv4_dst_step: 1,
      gre_inner_ipv4_src_count: 4,
      gre_inner_ipv4_src_step: 1,
      gre_inner_ipv4_ttl_count: 4,
      gre_inner_ipv4_ttl_step: 1,
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
            streams: [rawGreStream],
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
                packet_type: "Ethernet/IPv4/GRE/IPv4",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
                  { name: "GRE", fields: { flags: "0x0000", protocol_type: "0x0800" } },
                  { name: "Inner IPv4", fields: { src: "10.2.0.10", dst: "10.2.0.20", ttl: 40, protocol: 0 } }
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
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 ID inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 DSCP inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 ECN inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 fragment offset inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 reserved flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 Don't fragment flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 More fragments flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE sequence inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GRE inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "gre_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_src", pkt_offset: 53, type: "write_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "gre_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_dst", pkt_offset: 57, type: "write_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 TTL inc")).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "gre_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_ttl", pkt_offset: 46, type: "write_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_ttl"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 ID inc")).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "gre_inner_ipv4_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_id", pkt_offset: 42, type: "write_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_id"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 DSCP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "gre_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xfc, name: "gre_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 39, shift: 2, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_dscp"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 ECN inc")).toEqual({
      instructions: [
        { init_value: 3, max_value: 3, min_value: 3, name: "gre_inner_ipv4_ecn", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x03, name: "gre_inner_ipv4_ecn", pkt_cast_size: 1, pkt_offset: 39, shift: 0, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_ecn"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 fragment offset inc")).toEqual({
      instructions: [
        { init_value: 4, max_value: 7, min_value: 4, name: "gre_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "gre_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 44, shift: 0, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_fragment_offset"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 reserved flag vary")).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "gre_inner_ipv4_reserved", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x8000, name: "gre_inner_ipv4_reserved", pkt_cast_size: 2, pkt_offset: 44, shift: 15, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_reserved"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 Don't fragment flag vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "gre_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x4000, name: "gre_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 44, shift: 14, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_df"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 More fragments flag vary")).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "gre_inner_ipv4_mf", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x2000, name: "gre_inner_ipv4_mf", pkt_cast_size: 2, pkt_offset: 44, shift: 13, type: "write_mask_flow_var" },
        { pkt_offset: 38, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "gre_inner_ipv4_mf"
    });
  }, 40_000);

  it("builds GRE raw inner IPv4/TCP address Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x40, 0x12, 0x34, 0x00, 0x00, 0x40, 0x2f,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x08, 0x00,
      0x45, 0x00, 0x00, 0x28, 0x00, 0x01, 0x00, 0x00, 0x28, 0x06,
      0x00, 0x00, 0x0a, 0x02, 0x00, 0x0a, 0x0a, 0x02, 0x00, 0x14,
      0x04, 0x01, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawGreStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      gre_inner_ipv4_dst_count: 4,
      gre_inner_ipv4_dst_step: 1,
      gre_inner_ipv4_src_count: 4,
      gre_inner_ipv4_src_step: 1,
      gre_inner_l4_dst_port_count: 4,
      gre_inner_l4_dst_port_step: 1,
      gre_inner_l4_src_port_count: 4,
      gre_inner_l4_src_port_step: 1,
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawGreStream,
      "Ethernet/IPv4/GRE/IPv4/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
        { name: "GRE", fields: { flags: "0x0000", protocol_type: "0x0800" } },
        { name: "Inner IPv4", fields: { src: "10.2.0.10", dst: "10.2.0.20", ttl: 40, protocol: 6 } },
        { name: "Inner TCP", fields: { src: 1025, dst: 12 } }
      ]
    );

    expect(await selectRawPacketFieldEngineTarget("Inner TCP Source port", "GRE inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1028, min_value: 1025, name: "gre_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_src", pkt_offset: 58, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_src"
    });

    expect(await selectRawPacketFieldEngineTarget("Inner TCP Destination port", "GRE inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 12, max_value: 15, min_value: 12, name: "gre_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_dst", pkt_offset: 60, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_dst"
    });

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE key inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE sequence inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GRE inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "gre_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_src", pkt_offset: 53, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("GRE inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "gre_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv4_dst", pkt_offset: 57, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("GRE inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1028, min_value: 1025, name: "gre_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_src", pkt_offset: 58, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_src"
    });

    expect(useFieldEngineTarget("GRE inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 12, max_value: 15, min_value: 12, name: "gre_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_dst", pkt_offset: 60, type: "write_flow_var" },
        { l2_len: 38, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_dst"
    });
  }, 20_000);

  it("builds GRE raw inner IPv6/TCP address and port Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x54, 0x12, 0x34, 0x00, 0x00, 0x40, 0x2f,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x86, 0xdd,
      0x6a, 0xb1, 0x23, 0x45, 0x00, 0x14, 0x06, 0x28,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x70, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x80, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
      0x04, 0x01, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawGreStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      gre_inner_ipv6_dst_count: 4,
      gre_inner_ipv6_dst_step: 1,
      gre_inner_ipv6_src_count: 4,
      gre_inner_ipv6_src_step: 1,
      gre_inner_l4_dst_port_count: 4,
      gre_inner_l4_dst_port_step: 1,
      gre_inner_l4_src_port_count: 4,
      gre_inner_l4_src_port_step: 1,
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawGreStream,
      "Ethernet/IPv4/GRE/IPv6/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { src: "10.0.0.1", dst: "10.0.0.2", protocol: 47 } },
        { name: "GRE", fields: { flags: "0x0000", protocol_type: "0x86dd" } },
        { name: "Inner IPv6", fields: { src: "2001:db8:70::10", dst: "2001:db8:80::20", hop_limit: 40, next_header: 6 } },
        { name: "Inner TCP", fields: { src: 1025, dst: 12 } }
      ]
    );

    expect(await selectRawPacketFieldEngineTarget("Inner TCP Source port", "GRE inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1028, min_value: 1025, name: "gre_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_src", pkt_offset: 78, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_src"
    });

    expect(await selectRawPacketFieldEngineTarget("Inner TCP Destination port", "GRE inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 12, max_value: 15, min_value: 12, name: "gre_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_dst", pkt_offset: 80, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_dst"
    });

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 traffic class inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv6 flow label inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use GRE inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("GRE inner IPv6 src inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "gre_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv6_src", pkt_offset: 61, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv6_src"
    });

    expect(useFieldEngineTarget("GRE inner IPv6 dst inc")).toEqual({
      instructions: [
        { init_value: 32, max_value: 35, min_value: 32, name: "gre_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_ipv6_dst", pkt_offset: 77, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_ipv6_dst"
    });

    expect(useFieldEngineTarget("GRE inner IPv6 traffic class inc")).toEqual({
      instructions: [
        { init_value: 171, max_value: 174, min_value: 171, name: "gre_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "gre_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 38, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_traffic_class"
    });

    expect(useFieldEngineTarget("GRE inner IPv6 flow label inc")).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12348, min_value: 0x12345, name: "gre_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "gre_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 38, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "gre_inner_ipv6_flow_label"
    });

    expect(useFieldEngineTarget("GRE inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 1025, max_value: 1028, min_value: 1025, name: "gre_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_src", pkt_offset: 78, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_src"
    });

    expect(useFieldEngineTarget("GRE inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 12, max_value: 15, min_value: 12, name: "gre_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "gre_inner_tcp_dst", pkt_offset: 80, type: "write_flow_var" },
        { l2_len: 38, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "gre_inner_tcp_dst"
    });
  }, 40_000);

  it("exposes GRE inner IPv6 Field Engine targets with backend-aligned offsets", async () => {
    const greIpv6PreviewResponse = {
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
              packet_type: "Ethernet/IPv4/GRE",
              frame_length: 124,
              wire_length: 124,
              binary_base64: "AAAA",
              hex: "",
              hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
              layers: [
                { name: "Ethernet", fields: { type: "0x0800" } },
                { name: "Internet Protocol v4", fields: { protocol: "GRE" } },
                {
                  name: "GRE",
                  fields: {
                    checksum_present: false,
                    key_present: true,
                    key: 16909060,
                    sequence_present: true,
                    sequence: 7,
                    protocol_type: "0x86DD"
                  }
                },
                { name: "Inner Internet Protocol v6", fields: { source: "2001:db8:40::1", destination: "2001:db8:40::2", hop_limit: 64, next_header: "UDP" } },
                { name: "Inner UDP", fields: { source_port: 1025, destination_port: 12, checksum: "calculated" } }
              ]
            }
          ]
        },
        blocker: null,
        error: null
      })
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue(greIpv6PreviewResponse);
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Selection" }));
    fireEvent.click(screen.getByLabelText("GRE"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Include GRE key"));
    fireEvent.click(screen.getByLabelText("Include GRE sequence"));
    fireEvent.change(screen.getByLabelText("GRE inner IP version"), { target: { value: "IPv6" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await switchPacketPreviewToFieldEngine();
    const greTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(greTargetMap).getByRole("button", { name: "Use GRE inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const expectGreInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 46,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const greInnerIpv6SrcVm = useFieldEngineTarget("GRE inner IPv6 src inc");
    expect(greInnerIpv6SrcVm.split_by_var).toBe("gre_inner_ipv6_src");
    expect(greInnerIpv6SrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1,
        max_value: 16,
        min_value: 1,
        name: "gre_inner_ipv6_src",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv6_src",
        pkt_offset: 69,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv6Checksum(greInnerIpv6SrcVm);

    const greInnerIpv6DstVm = useFieldEngineTarget("GRE inner IPv6 dst inc");
    expect(greInnerIpv6DstVm.split_by_var).toBe("gre_inner_ipv6_dst");
    expect(greInnerIpv6DstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 2,
        max_value: 17,
        min_value: 2,
        name: "gre_inner_ipv6_dst",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv6_dst",
        pkt_offset: 85,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv6Checksum(greInnerIpv6DstVm);

    const greInnerHopLimitVm = useFieldEngineTarget("GRE inner IPv6 hop limit inc");
    expect(greInnerHopLimitVm.split_by_var).toBe("gre_inner_ipv6_hop_limit");
    expect(greInnerHopLimitVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 64,
        max_value: 79,
        min_value: 64,
        name: "gre_inner_ipv6_hop_limit",
        size: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_ipv6_hop_limit",
        pkt_offset: 53,
        type: "write_flow_var"
      })
    ]));
    expect(greInnerHopLimitVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const greInnerUdpSrcVm = useFieldEngineTarget("GRE inner UDP src port inc");
    expect(greInnerUdpSrcVm.split_by_var).toBe("gre_inner_udp_src");
    expect(greInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 1025,
        max_value: 1040,
        min_value: 1025,
        name: "gre_inner_udp_src",
        size: 2,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_udp_src",
        pkt_offset: 86,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv6Checksum(greInnerUdpSrcVm);

    const greInnerUdpDstVm = useFieldEngineTarget("GRE inner UDP dst port inc");
    expect(greInnerUdpDstVm.split_by_var).toBe("gre_inner_udp_dst");
    expect(greInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 12,
        max_value: 27,
        min_value: 12,
        name: "gre_inner_udp_dst",
        size: 2,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "gre_inner_udp_dst",
        pkt_offset: 88,
        type: "write_flow_var"
      })
    ]));
    expectGreInnerIpv6Checksum(greInnerUdpDstVm);
  }, 20_000);
});
