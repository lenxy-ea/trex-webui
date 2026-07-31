import {
  App,
  describe,
  expect,
  fireEvent,
  formatTestRawHex,
  installAppTestHooks,
  it,
  openProfilesForBuilder,
  openRawStreamFieldEngine,
  overview,
  profileCatalog,
  readAdvancedVmBody,
  render,
  screen,
  stubFetch,
  switchPacketPreviewToFieldEngine,
  useFieldEngineTarget,
  vi,
  waitFor,
  within,
  workbenchStream
} from "./test/appTestHarness";

describe("Traffic Profiles / Tunnels / VXLAN", () => {
  installAppTestHooks();

  it("renders VXLAN tunnel protocol data through the backend packet preview", async () => {
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
                      source: "172.16.0.1",
                      destination: "172.16.0.2",
                      ttl: 127,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "UDP",
                    fields: {
                      source_port: 1337,
                      destination_port: 4789,
                      length: 90,
                      checksum: "auto"
                    }
                  },
                  {
                    name: "VXLAN",
                    fields: {
                      flags: "0x08",
                      vni: 4096,
                      vni_mode: "Increment",
                      vni_count: 4,
                      vni_step: 1
                    }
                  },
                  {
                    name: "Inner Ethernet",
                    fields: {
                      destination: "aa:bb:cc:dd:ee:ff",
                      source: "00:11:22:33:44:55",
                      type: "0x0800"
                    }
                  },
                  {
                    name: "Inner Internet Protocol v4",
                    fields: {
                      source: "10.1.0.10",
                      destination: "10.1.0.20",
                      ttl: 127,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "Inner UDP",
                    fields: {
                      source_port: 32000,
                      destination_port: 32100,
                      length: 40,
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
    fireEvent.click(screen.getByLabelText("VXLAN"));
    expect(screen.getByLabelText("Frame length type")).toBeDisabled();
    expect(screen.getByLabelText("IPv6")).toBeDisabled();
    expect(screen.getByLabelText("TCP")).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    expect(screen.getByLabelText("L4 destination port")).toBeDisabled();
    expect(screen.getByLabelText("VXLAN inner Ethernet type")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("VXLAN inner Ethernet protocol")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("VXLAN VNI"), { target: { value: "4096" } });
    fireEvent.change(screen.getByLabelText("VXLAN VNI mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN VNI count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN VNI step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner Ethernet destination"), { target: { value: "aa:bb:cc:dd:ee:ff" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner Ethernet source"), { target: { value: "00:11:22:33:44:55" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 source"), { target: { value: "10.1.0.10" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 destination"), { target: { value: "10.1.0.20" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 TTL"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv4 TTL step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port"), { target: { value: "32000" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port"), { target: { value: "32100" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv4 source"), { target: { value: "172.16.0.1" } });
    fireEvent.change(screen.getByLabelText("IPv4 destination"), { target: { value: "172.16.0.2" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"vxlan_enabled":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"packet_type":"Ethernet/IPv4/UDP"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port":4789')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_vni":4096')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_vni_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_vni_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_ipv4_dst":"10.1.0.20"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_ipv4_dst_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_ipv4_ttl":40')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_ipv4_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_l4_dst_port":32100')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vxlan_inner_l4_dst_port_mode":"Increment"')
      })
    );
    expect(screen.getByText("VXLAN")).toBeInTheDocument();
    expect(screen.getByText("vni_mode")).toBeInTheDocument();
    expect(screen.getByText("Increment")).toBeInTheDocument();
    expect(screen.getByText("Inner Ethernet")).toBeInTheDocument();
    expect(screen.getByText("Inner UDP")).toBeInTheDocument();
    expect(screen.getByText("4096")).toBeInTheDocument();
    expect(screen.getByText("10.1.0.20")).toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const vxlanTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN I flag vary Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN VNI inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner UDP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner UDP dst port inc Field Engine target" })).not.toBeDisabled();

    const expectVxlanInnerChecksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 64,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const vxlanIFlagVm = useFieldEngineTarget("VXLAN I flag vary");
    expect(vxlanIFlagVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_i_flag", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x08, name: "vxlan_i_flag", pkt_cast_size: 1, pkt_offset: 42, shift: 3, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_i_flag"
    });

    const vxlanVniVm = useFieldEngineTarget("VXLAN VNI inc");
    expect(vxlanVniVm.split_by_var).toBe("vxlan_vni");
    expect(vxlanVniVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 4096,
        max_value: 4099,
        min_value: 4096,
        name: "vxlan_vni",
        op: "inc",
        size: 4,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        mask: 0xFFFFFF00,
        name: "vxlan_vni",
        pkt_cast_size: 4,
        pkt_offset: 46,
        shift: 8,
        type: "write_mask_flow_var"
      })
    ]));
    expect(vxlanVniVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const vxlanInnerSrcVm = useFieldEngineTarget("VXLAN inner IPv4 src inc");
    expect(vxlanInnerSrcVm.split_by_var).toBe("vxlan_inner_ipv4_src");
    expect(vxlanInnerSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 10,
        max_value: 13,
        min_value: 10,
        name: "vxlan_inner_ipv4_src",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "vxlan_inner_ipv4_src",
        pkt_offset: 79,
        type: "write_flow_var"
      })
    ]));
    expectVxlanInnerChecksum(vxlanInnerSrcVm);

    const vxlanInnerDstVm = useFieldEngineTarget("VXLAN inner IPv4 dst inc");
    expect(vxlanInnerDstVm.split_by_var).toBe("vxlan_inner_ipv4_dst");
    expect(vxlanInnerDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 20,
        max_value: 23,
        min_value: 20,
        name: "vxlan_inner_ipv4_dst",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "vxlan_inner_ipv4_dst",
        pkt_offset: 83,
        type: "write_flow_var"
      })
    ]));
    expectVxlanInnerChecksum(vxlanInnerDstVm);

    const vxlanInnerTtlVm = useFieldEngineTarget("VXLAN inner IPv4 TTL inc");
    expect(vxlanInnerTtlVm.split_by_var).toBe("vxlan_inner_ipv4_ttl");
    expect(vxlanInnerTtlVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 40,
        max_value: 43,
        min_value: 40,
        name: "vxlan_inner_ipv4_ttl",
        size: 1,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "vxlan_inner_ipv4_ttl",
        pkt_offset: 72,
        type: "write_flow_var"
      })
    ]));
    expectVxlanInnerChecksum(vxlanInnerTtlVm);

    const vxlanInnerUdpSrcVm = useFieldEngineTarget("VXLAN inner UDP src port inc");
    expect(vxlanInnerUdpSrcVm.split_by_var).toBe("vxlan_inner_udp_src");
    expect(vxlanInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 32000,
        max_value: 32003,
        min_value: 32000,
        name: "vxlan_inner_udp_src",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "vxlan_inner_udp_src",
        pkt_offset: 84,
        type: "write_flow_var"
      })
    ]));
    expectVxlanInnerChecksum(vxlanInnerUdpSrcVm);

    const vxlanInnerUdpDstVm = useFieldEngineTarget("VXLAN inner UDP dst port inc");
    expect(vxlanInnerUdpDstVm.split_by_var).toBe("vxlan_inner_udp_dst");
    expect(vxlanInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        init_value: 32100,
        max_value: 32103,
        min_value: 32100,
        name: "vxlan_inner_udp_dst",
        size: 2,
        step: 1,
        type: "flow_var"
      }),
      expect.objectContaining({
        name: "vxlan_inner_udp_dst",
        pkt_offset: 86,
        type: "write_flow_var"
      })
    ]));
    expectVxlanInnerChecksum(vxlanInnerUdpDstVm);

    fireEvent.change(screen.getByLabelText("Advanced VM template"), { target: { value: "vxlan-inner-5tuple-inc" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert VM" }));
    const vxlanInnerVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    const vxlanInnerVm = JSON.parse(vxlanInnerVmJson);
    expect(vxlanInnerVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 10, max_value: 13, min_value: 10, name: "vxlan_inner_ipv4_src" }),
      expect.objectContaining({ init_value: 20, max_value: 23, min_value: 20, name: "vxlan_inner_ipv4_dst" }),
      expect.objectContaining({ init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_udp_src" }),
      expect.objectContaining({ init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_udp_dst" })
    ]));
    expect(vxlanInnerVmJson).toContain('"name": "vxlan_inner_ipv4_src"');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 79');
    expect(vxlanInnerVmJson).toContain('"name": "vxlan_inner_ipv4_dst"');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 83');
    expect(vxlanInnerVmJson).toContain('"name": "vxlan_inner_udp_src"');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 84');
    expect(vxlanInnerVmJson).toContain('"name": "vxlan_inner_udp_dst"');
    expect(vxlanInnerVmJson).toContain('"pkt_offset": 86');
    expect(vxlanInnerVmJson).toContain('"l2_len": 64');
    expect(vxlanInnerVmJson).toContain('"l4_type": 11');
  }, 40_000);

  it("builds VXLAN Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x4e, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x3a, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x2b, 0x00, 0x1c, 0x12, 0x34, 0x40, 0x04, 0x28, 0x11,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x08, 0x00, 0x00
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawVxlanStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      ipv4_dscp_count: 4,
      ipv4_dscp_step: 1,
      ipv4_ecn_count: 4,
      ipv4_ecn_step: 1,
      ipv4_fragment_offset_count: 4,
      ipv4_fragment_offset_step: 1,
      ipv4_id_count: 4,
      ipv4_id_step: 1,
      vxlan_inner_ipv4_dst_count: 4,
      vxlan_inner_ipv4_dst_step: 1,
      vxlan_inner_ipv4_src_count: 4,
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_ipv4_ttl_count: 4,
      vxlan_inner_ipv4_ttl_step: 1,
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1,
      vxlan_vni_count: 4,
      vxlan_vni_step: 1
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
            streams: [rawVxlanStream],
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
                packet_type: "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv4/UDP",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 58, checksum: "0xbeef" } },
                  { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
                  { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x0800" } },
                  {
                    name: "Inner Internet Protocol v4",
                    fields: {
                      destination: "10.1.0.20",
                      dscp: 10,
                      ecn: 3,
                      fragment_offset: 4,
                      identification: "0x1234",
                      source: "10.1.0.10",
                      ttl: 40,
                      protocol: "UDP"
                    }
                  },
                  { name: "Inner UDP", fields: { source_port: 32000, destination_port: 32100, length: 8, checksum: "0x0000" } }
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
      "VXLAN I flag vary",
      "VXLAN VNI inc",
      "VXLAN inner IPv4 src inc",
      "VXLAN inner IPv4 dst inc",
      "VXLAN inner IPv4 TTL inc",
      "VXLAN inner IPv4 ID inc",
      "VXLAN inner IPv4 DSCP inc",
      "VXLAN inner IPv4 ECN inc",
      "VXLAN inner IPv4 fragment offset inc",
      "VXLAN inner IPv4 reserved flag vary",
      "VXLAN inner IPv4 Don't fragment flag vary",
      "VXLAN inner IPv4 More fragments flag vary",
      "VXLAN inner MAC dst inc",
      "VXLAN inner MAC src inc",
      "VXLAN inner EtherType inc",
      "VXLAN inner UDP src port inc",
      "VXLAN inner UDP dst port inc",
      "VXLAN inner 5-tuple inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 dst inc Field Engine target" })).toBeDisabled();

    const expectRawVxlanInnerChecksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 64,
          l3_len: 20,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const vxlanIFlagVm = useFieldEngineTarget("VXLAN I flag vary");
    expect(vxlanIFlagVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_i_flag", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x08, name: "vxlan_i_flag", pkt_cast_size: 1, pkt_offset: 42, shift: 3, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_i_flag"
    });

    const vxlanVniVm = useFieldEngineTarget("VXLAN VNI inc");
    expect(vxlanVniVm).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "vxlan_vni", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xFFFFFF00, name: "vxlan_vni", pkt_cast_size: 4, pkt_offset: 46, shift: 8, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_vni"
    });

    const vxlanInnerMacDstVm = useFieldEngineTarget("VXLAN inner MAC dst inc");
    expect(vxlanInnerMacDstVm).toEqual({
      instructions: [
        { init_value: 61183, max_value: 61198, min_value: 61183, name: "vxlan_inner_mac_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_mac_dst", pkt_offset: 54, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_mac_dst"
    });

    const vxlanInnerMacSrcVm = useFieldEngineTarget("VXLAN inner MAC src inc");
    expect(vxlanInnerMacSrcVm).toEqual({
      instructions: [
        { init_value: 85, max_value: 100, min_value: 85, name: "vxlan_inner_mac_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_mac_src", pkt_offset: 61, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_mac_src"
    });

    const vxlanInnerEtherTypeVm = useFieldEngineTarget("VXLAN inner EtherType inc");
    expect(vxlanInnerEtherTypeVm).toEqual({
      instructions: [
        { init_value: 2048, max_value: 2063, min_value: 2048, name: "vxlan_inner_ether_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ether_type", pkt_offset: 62, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_ether_type"
    });

    const vxlanInnerSrcVm = useFieldEngineTarget("VXLAN inner IPv4 src inc");
    expect(vxlanInnerSrcVm).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "vxlan_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_src", pkt_offset: 79, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_src"
    });

    const vxlanInnerDstVm = useFieldEngineTarget("VXLAN inner IPv4 dst inc");
    expect(vxlanInnerDstVm).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "vxlan_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_dst", pkt_offset: 83, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_dst"
    });

    const vxlanInnerTtlVm = useFieldEngineTarget("VXLAN inner IPv4 TTL inc");
    expect(vxlanInnerTtlVm).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "vxlan_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_ttl", pkt_offset: 72, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_ttl"
    });

    const vxlanInnerIdVm = useFieldEngineTarget("VXLAN inner IPv4 ID inc");
    expect(vxlanInnerIdVm).toEqual({
      instructions: [
        { init_value: 0x1234, max_value: 0x1237, min_value: 0x1234, name: "vxlan_inner_ipv4_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_id", pkt_offset: 68, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_id"
    });

    const vxlanInnerDscpVm = useFieldEngineTarget("VXLAN inner IPv4 DSCP inc");
    expect(vxlanInnerDscpVm).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "vxlan_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xfc, name: "vxlan_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 65, shift: 2, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_dscp"
    });

    const vxlanInnerEcnVm = useFieldEngineTarget("VXLAN inner IPv4 ECN inc");
    expect(vxlanInnerEcnVm).toEqual({
      instructions: [
        { init_value: 3, max_value: 3, min_value: 3, name: "vxlan_inner_ipv4_ecn", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x03, name: "vxlan_inner_ipv4_ecn", pkt_cast_size: 1, pkt_offset: 65, shift: 0, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_ecn"
    });

    const vxlanInnerFragmentOffsetVm = useFieldEngineTarget("VXLAN inner IPv4 fragment offset inc");
    expect(vxlanInnerFragmentOffsetVm).toEqual({
      instructions: [
        { init_value: 4, max_value: 7, min_value: 4, name: "vxlan_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "vxlan_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 70, shift: 0, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_fragment_offset"
    });

    const vxlanInnerReservedFlagVm = useFieldEngineTarget("VXLAN inner IPv4 reserved flag vary");
    expect(vxlanInnerReservedFlagVm).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "vxlan_inner_ipv4_reserved", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x8000, name: "vxlan_inner_ipv4_reserved", pkt_cast_size: 2, pkt_offset: 70, shift: 15, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_reserved"
    });

    const vxlanInnerDfFlagVm = useFieldEngineTarget("VXLAN inner IPv4 Don't fragment flag vary");
    expect(vxlanInnerDfFlagVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x4000, name: "vxlan_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 70, shift: 14, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_df"
    });

    const vxlanInnerMfFlagVm = useFieldEngineTarget("VXLAN inner IPv4 More fragments flag vary");
    expect(vxlanInnerMfFlagVm).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "vxlan_inner_ipv4_mf", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x2000, name: "vxlan_inner_ipv4_mf", pkt_cast_size: 2, pkt_offset: 70, shift: 13, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_mf"
    });

    const vxlanInnerUdpSrcVm = useFieldEngineTarget("VXLAN inner UDP src port inc");
    expect(vxlanInnerUdpSrcVm).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_src", pkt_offset: 84, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_src"
    });

    const vxlanInnerUdpDstVm = useFieldEngineTarget("VXLAN inner UDP dst port inc");
    expect(vxlanInnerUdpDstVm).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_dst", pkt_offset: 86, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_dst"
    });

    const vxlanInnerFiveTupleVm = useFieldEngineTarget("VXLAN inner 5-tuple inc");
    expect(vxlanInnerFiveTupleVm.split_by_var).toBe("vxlan_inner_ipv4_src");
    expect(vxlanInnerFiveTupleVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 167837706, max_value: 167837709, min_value: 167837706, name: "vxlan_inner_ipv4_src", type: "flow_var" }),
      expect.objectContaining({ name: "vxlan_inner_ipv4_src", pkt_offset: 76, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 167837716, max_value: 167837719, min_value: 167837716, name: "vxlan_inner_ipv4_dst" }),
      expect.objectContaining({ name: "vxlan_inner_ipv4_dst", pkt_offset: 80, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_udp_src" }),
      expect.objectContaining({ name: "vxlan_inner_udp_src", pkt_offset: 84, type: "write_flow_var" }),
      expect.objectContaining({ init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_udp_dst" }),
      expect.objectContaining({ name: "vxlan_inner_udp_dst", pkt_offset: 86, type: "write_flow_var" })
    ]));
    expectRawVxlanInnerChecksum(vxlanInnerFiveTupleVm);
  }, 40_000);

  it("uses VXLAN inner IPv4 Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x4e, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x3a, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x2b, 0x00, 0x1c, 0x12, 0x34, 0x40, 0x04, 0x28, 0x11,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x08, 0x00, 0x00
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
                name: "vxlan-inner-ipv4-stream",
                packet_type: "Ethernet/IPv4/UDP/VXLAN",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "172.16.0.1", dst: "172.16.0.2", protocol: 17 } },
                  { name: "UDP", fields: { src: 1337, dst: 4789, length: 58 } },
                  { name: "VXLAN", fields: { vni: 4660 } },
                  { name: "Inner Ethernet", fields: { src: "00:11:22:33:44:55", dst: "aa:bb:cc:dd:ee:ff", type: "0x0800" } },
                  {
                    name: "Inner IPv4",
                    fields: {
                      dst: "10.1.0.20",
                      dscp: 10,
                      ecn: 3,
                      fragment_offset: 4,
                      identification: "0x1234",
                      protocol: 17,
                      src: "10.1.0.10"
                    }
                  },
                  { name: "Inner UDP", fields: { src: 32000, dst: 32100, length: 8 } }
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

    expect(await screen.findByLabelText("Raw field VXLAN Inner IPv4 DSCP")).toHaveValue("10");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 ECN")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 Identification")).toHaveValue("1234");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 Don't fragment")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 More fragments")).toHaveValue("0");
    expect(screen.getByLabelText("Raw field VXLAN Inner IPv4 Fragment offset")).toHaveValue("4");

    const useRawVxlanInnerIpv4FieldEngineTarget = async (field: string) => {
      const targetButtonName = `Use Field Engine target for raw field VXLAN Inner IPv4 ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      fireEvent.click(await screen.findByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      return readAdvancedVmBody();
    };

    const dscpVm = await useRawVxlanInnerIpv4FieldEngineTarget("DSCP");
    expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
      name: "Use VXLAN inner IPv4 DSCP inc Field Engine target"
    }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    expect(dscpVm).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "vxlan_inner_ipv4_dscp", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xfc, name: "vxlan_inner_ipv4_dscp", pkt_cast_size: 1, pkt_offset: 65, shift: 2, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_dscp"
    });

    const dfVm = await useRawVxlanInnerIpv4FieldEngineTarget("Don't fragment");
    expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
      name: "Use VXLAN inner IPv4 Don't fragment flag vary Field Engine target"
    }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    expect(dfVm).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_inner_ipv4_df", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x4000, name: "vxlan_inner_ipv4_df", pkt_cast_size: 2, pkt_offset: 70, shift: 14, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_df"
    });

    const fragmentOffsetVm = await useRawVxlanInnerIpv4FieldEngineTarget("Fragment offset");
    expect(within(screen.getByLabelText("Field Engine target map")).getByRole("button", {
      name: "Use VXLAN inner IPv4 fragment offset inc Field Engine target"
    }).closest("tr")).toHaveClass("packet-vm-target-row--selected");
    expect(fragmentOffsetVm).toEqual({
      instructions: [
        { init_value: 4, max_value: 19, min_value: 4, name: "vxlan_inner_ipv4_fragment_offset", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1fff, name: "vxlan_inner_ipv4_fragment_offset", pkt_cast_size: 2, pkt_offset: 70, shift: 0, type: "write_mask_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_fragment_offset"
    });
  }, 40_000);

  it("builds VXLAN inner VLAN Field Engine targets from raw Packet Editor bytes", async () => {
    const outerTci = (5 << 13) | (1 << 12) | 100;
    const innerTci = (3 << 13) | (1 << 12) | 200;
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x56, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x04, 0xd2, 0x12, 0xb5, 0x00, 0x42, 0x00, 0x00,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x88, 0xa8, (outerTci >>> 8) & 0xff, outerTci & 0xff,
      0x81, 0x00, (innerTci >>> 8) & 0xff, innerTci & 0xff,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x28, 0x11,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x08, 0x00, 0x00
    ];
    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/IPv4/UDP/VXLAN/Ethernet/QinQ/IPv4/UDP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 1234, destination_port: 4789, length: 66 } },
        { name: "VXLAN", fields: { flags: "0x08", vni: 4096 } },
        { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x88a8" } },
        { name: "Inner 802.1Q", fields: { priority: 5, cfi: 1, vlan: 100, type: "0x8100" } },
        { name: "Inner 802.1Q Inner", fields: { priority: 3, cfi: 1, vlan: 200, type: "0x0800" } },
        { name: "Inner Internet Protocol v4", fields: { source: "10.1.0.10", destination: "10.1.0.20", ttl: 40, protocol: "UDP" } },
        { name: "Inner UDP", fields: { source_port: 32000, destination_port: 32100, length: 8 } }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    for (const name of [
      "VXLAN inner VLAN ID inc",
      "VXLAN inner VLAN priority inc",
      "VXLAN inner VLAN CFI/DEI vary",
      "VXLAN inner VLAN second ID inc",
      "VXLAN inner VLAN second priority inc",
      "VXLAN inner VLAN second CFI/DEI vary"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    expect(useFieldEngineTarget("VXLAN inner VLAN ID inc")).toEqual({
      instructions: [
        { init_value: 100, max_value: 115, min_value: 100, name: "vxlan_inner_vlan_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0fff, name: "vxlan_inner_vlan_id", pkt_cast_size: 2, pkt_offset: 64, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan_id"
    });

    expect(useFieldEngineTarget("VXLAN inner VLAN priority inc")).toEqual({
      instructions: [
        { init_value: 5, max_value: 7, min_value: 5, name: "vxlan_inner_vlan_priority", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xe000, name: "vxlan_inner_vlan_priority", pkt_cast_size: 2, pkt_offset: 64, shift: 13, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan_priority"
    });

    expect(useFieldEngineTarget("VXLAN inner VLAN CFI/DEI vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_inner_vlan_cfi", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1000, name: "vxlan_inner_vlan_cfi", pkt_cast_size: 2, pkt_offset: 64, shift: 12, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan_cfi"
    });

    expect(useFieldEngineTarget("VXLAN inner VLAN second ID inc")).toEqual({
      instructions: [
        { init_value: 200, max_value: 215, min_value: 200, name: "vxlan_inner_vlan2_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0fff, name: "vxlan_inner_vlan2_id", pkt_cast_size: 2, pkt_offset: 68, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan2_id"
    });

    expect(useFieldEngineTarget("VXLAN inner VLAN second priority inc")).toEqual({
      instructions: [
        { init_value: 3, max_value: 6, min_value: 3, name: "vxlan_inner_vlan2_priority", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xe000, name: "vxlan_inner_vlan2_priority", pkt_cast_size: 2, pkt_offset: 68, shift: 13, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan2_priority"
    });

    expect(useFieldEngineTarget("VXLAN inner VLAN second CFI/DEI vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "vxlan_inner_vlan2_cfi", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x1000, name: "vxlan_inner_vlan2_cfi", pkt_cast_size: 2, pkt_offset: 68, shift: 12, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan2_cfi"
    });

  }, 40_000);

  it("uses VXLAN inner VLAN Packet Editor rows as Field Engine targets", async () => {
    const outerTci = (5 << 13) | (1 << 12) | 100;
    const innerTci = (3 << 13) | (1 << 12) | 200;
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x56, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x04, 0xd2, 0x12, 0xb5, 0x00, 0x42, 0x00, 0x00,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x88, 0xa8, (outerTci >>> 8) & 0xff, outerTci & 0xff,
      0x81, 0x00, (innerTci >>> 8) & 0xff, innerTci & 0xff,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x28, 0x11,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x08, 0x00, 0x00
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
                name: "vxlan-inner-vlan-stream",
                packet_type: "Ethernet/IPv4/UDP/VXLAN",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "172.16.0.1", dst: "172.16.0.2", protocol: 17 } },
                  { name: "UDP", fields: { src: 1234, dst: 4789, length: 66 } },
                  { name: "VXLAN", fields: { vni: 4096 } },
                  { name: "Inner Ethernet", fields: { src: "00:11:22:33:44:55", dst: "aa:bb:cc:dd:ee:ff", type: "0x88a8" } },
                  { name: "Inner 802.1Q", fields: { priority: 5, cfi: 1, vlan: 100 } },
                  { name: "Inner 802.1Q Inner", fields: { priority: 3, cfi: 1, vlan: 200 } },
                  { name: "Inner IPv4", fields: { src: "10.1.0.10", dst: "10.1.0.20", protocol: 17 } },
                  { name: "Inner UDP", fields: { src: 32000, dst: 32100, length: 8 } }
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

    expect(await screen.findByLabelText("Raw field VXLAN Inner 802.1Q Priority")).toHaveValue("5");
    expect(screen.getByLabelText("Raw field VXLAN Inner 802.1Q CFI")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field VXLAN Inner 802.1Q VLAN ID")).toHaveValue("100");
    expect(screen.getByLabelText("Raw field VXLAN Inner 802.1Q Inner Priority")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field VXLAN Inner 802.1Q Inner CFI")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field VXLAN Inner 802.1Q Inner VLAN ID")).toHaveValue("200");

    fireEvent.click(screen.getByRole("button", {
      name: "Use Field Engine target for raw field VXLAN Inner 802.1Q Inner VLAN ID"
    }));
    await screen.findByLabelText("Advanced VM JSON");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        { init_value: 200, max_value: 215, min_value: 200, name: "vxlan_inner_vlan2_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0fff, name: "vxlan_inner_vlan2_id", pkt_cast_size: 2, pkt_offset: 68, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_vlan2_id"
    });
  }, 40_000);

  it("builds VXLAN inner ARP Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x4e, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x04, 0xd2, 0x12, 0xb5, 0x00, 0x3a, 0x00, 0x00,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x06,
      0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x50,
      0x0a, 0x01, 0x00, 0x0a,
      0x66, 0x55, 0x44, 0x33, 0x22, 0x10,
      0x0a, 0x01, 0x00, 0x14
    ];
    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/IPv4/UDP/VXLAN/Ethernet/ARP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 1234, destination_port: 4789, length: 58 } },
        { name: "VXLAN", fields: { flags: "0x08", vni: 4096 } },
        { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x0806" } },
        {
          name: "Inner ARP",
          fields: {
            operation: 1,
            sender_ip: "10.1.0.10",
            sender_mac: "00:11:22:33:44:50",
            target_ip: "10.1.0.20",
            target_mac: "66:55:44:33:22:10"
          }
        }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    for (const name of [
      "VXLAN inner ARP operation inc",
      "VXLAN inner ARP sender IP inc",
      "VXLAN inner ARP target IP inc",
      "VXLAN inner ARP sender MAC inc",
      "VXLAN inner ARP target MAC inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    expect(useFieldEngineTarget("VXLAN inner ARP operation inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "vxlan_inner_arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_operation", pkt_offset: 70, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_operation"
    });

    expect(useFieldEngineTarget("VXLAN inner ARP sender IP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "vxlan_inner_arp_sender_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_sender_ip", pkt_offset: 81, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_sender_ip"
    });

    expect(useFieldEngineTarget("VXLAN inner ARP target IP inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "vxlan_inner_arp_target_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_target_ip", pkt_offset: 91, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_target_ip"
    });

    expect(useFieldEngineTarget("VXLAN inner ARP sender MAC inc")).toEqual({
      instructions: [
        { init_value: 80, max_value: 95, min_value: 80, name: "vxlan_inner_arp_sender_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_sender_mac", pkt_offset: 77, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_sender_mac"
    });

    expect(useFieldEngineTarget("VXLAN inner ARP target MAC inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 31, min_value: 16, name: "vxlan_inner_arp_target_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_target_mac", pkt_offset: 87, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_target_mac"
    });
  }, 40_000);

  it("uses VXLAN inner ARP Packet Editor rows as Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x4e, 0x12, 0x34, 0x40, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x04, 0xd2, 0x12, 0xb5, 0x00, 0x3a, 0x00, 0x00,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x06,
      0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x50,
      0x0a, 0x01, 0x00, 0x0a,
      0x66, 0x55, 0x44, 0x33, 0x22, 0x10,
      0x0a, 0x01, 0x00, 0x14
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
                name: "vxlan-inner-arp-stream",
                packet_type: "Ethernet/IPv4/UDP/VXLAN",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: packetHex.replace(/ /g, ""),
                hex_lines: [{ offset: "0000", hex: packetHex, ascii: "........3DU..E." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "IPv4", fields: { src: "172.16.0.1", dst: "172.16.0.2", protocol: 17 } },
                  { name: "UDP", fields: { src: 1234, dst: 4789, length: 58 } },
                  { name: "VXLAN", fields: { vni: 4096 } },
                  { name: "Inner Ethernet", fields: { src: "00:11:22:33:44:55", dst: "aa:bb:cc:dd:ee:ff", type: "0x0806" } },
                  { name: "Inner ARP", fields: { operation: 1, sender_ip: "10.1.0.10", target_ip: "10.1.0.20" } }
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

    expect(await screen.findByLabelText("Raw field VXLAN Inner ARP Operation")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field VXLAN Inner ARP Sender IP")).toHaveValue("10.1.0.10");
    expect(screen.getByLabelText("Raw field VXLAN Inner ARP Target IP")).toHaveValue("10.1.0.20");

    fireEvent.click(screen.getByRole("button", {
      name: "Use Field Engine target for raw field VXLAN Inner ARP Target IP"
    }));
    await screen.findByLabelText("Advanced VM JSON");
    expect(readAdvancedVmBody()).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "vxlan_inner_arp_target_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_arp_target_ip", pkt_offset: 91, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_arp_target_ip"
    });
  }, 40_000);

  it("keeps VXLAN raw inner IPv4 TTL target available without inner UDP", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x46, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x32, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x28, 0x00,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawVxlanStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      vxlan_inner_ipv4_dst_count: 4,
      vxlan_inner_ipv4_dst_step: 1,
      vxlan_inner_ipv4_src_count: 4,
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_ipv4_ttl_count: 4,
      vxlan_inner_ipv4_ttl_step: 1,
      vxlan_vni_count: 4,
      vxlan_vni_step: 1
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
            streams: [rawVxlanStream],
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
                packet_type: "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv4",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 50, checksum: "0xbeef" } },
                  { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
                  { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x0800" } },
                  { name: "Inner Internet Protocol v4", fields: { source: "10.1.0.10", destination: "10.1.0.20", ttl: 40, protocol: "IPv4" } }
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
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN VNI inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("VXLAN inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "vxlan_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_src", pkt_offset: 79, type: "write_flow_var" },
        { pkt_offset: 64, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "vxlan_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "vxlan_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_dst", pkt_offset: 83, type: "write_flow_var" },
        { pkt_offset: 64, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "vxlan_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv4 TTL inc")).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "vxlan_inner_ipv4_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_ttl", pkt_offset: 72, type: "write_flow_var" },
        { pkt_offset: 64, type: "fix_checksum_ipv4" }
      ],
      split_by_var: "vxlan_inner_ipv4_ttl"
    });
  }, 40_000);

  it("builds VXLAN raw inner IPv4/TCP address Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x5a, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x46, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x28, 0x00, 0x01, 0x00, 0x00, 0x28, 0x06,
      0x00, 0x00, 0x0a, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x00, 0x14,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawVxlanStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      vxlan_inner_ipv4_dst_count: 4,
      vxlan_inner_ipv4_dst_step: 1,
      vxlan_inner_ipv4_src_count: 4,
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawVxlanStream,
      "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv4/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 70, checksum: "0xbeef" } },
        { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
        { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x0800" } },
        { name: "Inner Internet Protocol v4", fields: { source: "10.1.0.10", destination: "10.1.0.20", ttl: 40, protocol: "TCP" } },
        { name: "Inner TCP", fields: { source_port: 32000, destination_port: 32100 } }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("VXLAN inner IPv4 src inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "vxlan_inner_ipv4_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_src", pkt_offset: 79, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_src"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv4 dst inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "vxlan_inner_ipv4_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv4_dst", pkt_offset: 83, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv4_dst"
    });

    expect(useFieldEngineTarget("VXLAN inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_src", pkt_offset: 84, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_src"
    });

    expect(useFieldEngineTarget("VXLAN inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_dst", pkt_offset: 86, type: "write_flow_var" },
        { l2_len: 64, l3_len: 20, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_dst"
    });
  }, 45_000);

  it("builds VXLAN raw inner IPv6/TCP address and port Field Engine targets", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x6e, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x5a, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x86, 0xdd,
      0x6a, 0xb1, 0x23, 0x45, 0x00, 0x14, 0x06, 0x28,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x50, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x60, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
      0x7d, 0x00, 0x7d, 0x64, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x50, 0x02, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    const rawVxlanStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      vxlan_inner_ipv6_dst_count: 4,
      vxlan_inner_ipv6_dst_step: 1,
      vxlan_inner_ipv6_src_count: 4,
      vxlan_inner_ipv6_src_step: 1,
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1
    });

    await openRawStreamFieldEngine(
      rawPacket,
      rawVxlanStream,
      "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv6/TCP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
        { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 90, checksum: "0xbeef" } },
        { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
        { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x86dd" } },
        { name: "Inner Internet Protocol v6", fields: { source: "2001:db8:50::10", destination: "2001:db8:60::20", hop_limit: 40, next_header: "TCP" } },
        { name: "Inner TCP", fields: { source_port: 32000, destination_port: 32100 } }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner TCP src port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner TCP dst port inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();

    const useRawVxlanFieldEngineTarget = async (field: string, targetName: string) => {
      const targetButtonName = `Use Field Engine target for raw field VXLAN ${field}`;
      if (!screen.queryByRole("button", { name: targetButtonName })) {
        fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
      }
      const row = (await screen.findByLabelText(`Raw field VXLAN ${field}`)).closest("tr");
      expect(row).not.toBeNull();
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
      await screen.findByLabelText("Advanced VM JSON");
      const refreshedTargetMap = await screen.findByLabelText("Field Engine target map");
      expect(within(refreshedTargetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
        .toHaveClass("packet-vm-target-row--selected");
      return readAdvancedVmBody();
    };

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field VXLAN Inner TCP Source port")).toHaveValue("32000");
    expect(screen.getByLabelText("Raw field VXLAN Inner TCP Destination port")).toHaveValue("32100");

    expect(await useRawVxlanFieldEngineTarget("Inner TCP Source port", "VXLAN inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_src", pkt_offset: 104, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_src"
    });

    expect(await useRawVxlanFieldEngineTarget("Inner TCP Destination port", "VXLAN inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_dst", pkt_offset: 106, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_dst"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv6 src inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "vxlan_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_src", pkt_offset: 87, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv6_src"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv6 dst inc")).toEqual({
      instructions: [
        { init_value: 32, max_value: 35, min_value: 32, name: "vxlan_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_dst", pkt_offset: 103, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv6_dst"
    });

    expect(useFieldEngineTarget("VXLAN inner TCP src port inc")).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_tcp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_src", pkt_offset: 104, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_src"
    });

    expect(useFieldEngineTarget("VXLAN inner TCP dst port inc")).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_tcp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_tcp_dst", pkt_offset: 106, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 13, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_tcp_dst"
    });
  }, 40_000);

  it("builds VXLAN inner IPv6 Field Engine targets from raw Packet Editor bytes", async () => {
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
    const rawVxlanIpv6Stream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1,
      packet_binary_base64: packetBinary,
      vxlan_inner_ipv6_dst_count: 4,
      vxlan_inner_ipv6_dst_step: 1,
      vxlan_inner_ipv6_hop_limit_count: 4,
      vxlan_inner_ipv6_hop_limit_step: 1,
      vxlan_inner_ipv6_src_count: 4,
      vxlan_inner_ipv6_src_step: 1,
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1,
      vxlan_vni_count: 4,
      vxlan_vni_step: 1
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
            streams: [rawVxlanIpv6Stream],
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
                packet_type: "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv6/UDP",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
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
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
    await screen.findByText("Packet Editor / Field Engine editable");
    fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
    await screen.findByLabelText("Advanced VM JSON");

    const targetMap = screen.getByLabelText("Field Engine target map");
    for (const name of [
      "VXLAN VNI inc",
      "VXLAN inner IPv6 traffic class inc",
      "VXLAN inner IPv6 flow label inc",
      "VXLAN inner IPv6 src inc",
      "VXLAN inner IPv6 dst inc",
      "VXLAN inner IPv6 hop limit inc",
      "VXLAN inner UDP src port inc",
      "VXLAN inner UDP dst port inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();

    const expectRawVxlanInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 64,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    expect(useFieldEngineTarget("VXLAN VNI inc")).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "vxlan_vni", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0xFFFFFF00, name: "vxlan_vni", pkt_cast_size: 4, pkt_offset: 46, shift: 8, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_vni"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv6 traffic class inc")).toEqual({
      instructions: [
        { init_value: 171, max_value: 174, min_value: 171, name: "vxlan_inner_ipv6_traffic_class", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x0FF00000, name: "vxlan_inner_ipv6_traffic_class", pkt_cast_size: 4, pkt_offset: 64, shift: 20, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_traffic_class"
    });

    expect(useFieldEngineTarget("VXLAN inner IPv6 flow label inc")).toEqual({
      instructions: [
        { init_value: 0x12345, max_value: 0x12348, min_value: 0x12345, name: "vxlan_inner_ipv6_flow_label", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 0x000FFFFF, name: "vxlan_inner_ipv6_flow_label", pkt_cast_size: 4, pkt_offset: 64, shift: 0, type: "write_mask_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_flow_label"
    });

    const vxlanInnerIpv6SrcVm = useFieldEngineTarget("VXLAN inner IPv6 src inc");
    expect(vxlanInnerIpv6SrcVm).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "vxlan_inner_ipv6_src", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_src", pkt_offset: 87, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv6_src"
    });

    const vxlanInnerIpv6DstVm = useFieldEngineTarget("VXLAN inner IPv6 dst inc");
    expect(vxlanInnerIpv6DstVm).toEqual({
      instructions: [
        { init_value: 32, max_value: 35, min_value: 32, name: "vxlan_inner_ipv6_dst", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_dst", pkt_offset: 103, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_ipv6_dst"
    });

    const vxlanInnerIpv6HopLimitVm = useFieldEngineTarget("VXLAN inner IPv6 hop limit inc");
    expect(vxlanInnerIpv6HopLimitVm).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "vxlan_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_hop_limit", pkt_offset: 71, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_hop_limit"
    });

    const vxlanInnerUdpSrcVm = useFieldEngineTarget("VXLAN inner UDP src port inc");
    expect(vxlanInnerUdpSrcVm).toEqual({
      instructions: [
        { init_value: 32000, max_value: 32003, min_value: 32000, name: "vxlan_inner_udp_src", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_src", pkt_offset: 104, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_src"
    });
    expectRawVxlanInnerIpv6Checksum(vxlanInnerUdpSrcVm);

    const vxlanInnerUdpDstVm = useFieldEngineTarget("VXLAN inner UDP dst port inc");
    expect(vxlanInnerUdpDstVm).toEqual({
      instructions: [
        { init_value: 32100, max_value: 32103, min_value: 32100, name: "vxlan_inner_udp_dst", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_udp_dst", pkt_offset: 106, type: "write_flow_var" },
        { l2_len: 64, l3_len: 40, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "vxlan_inner_udp_dst"
    });
    expectRawVxlanInnerIpv6Checksum(vxlanInnerUdpDstVm);
  }, 40_000);

  it("keeps VXLAN raw inner IPv6 hop-limit target available without inner UDP", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x5a, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0xac, 0x10, 0x00, 0x01, 0xac, 0x10, 0x00, 0x02,
      0x05, 0x39, 0x12, 0xb5, 0x00, 0x46, 0xbe, 0xef,
      0x08, 0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x00,
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x86, 0xdd,
      0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3b, 0x2a,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x70, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x70, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawVxlanIpv6Stream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      vxlan_inner_ipv6_hop_limit_count: 4,
      vxlan_inner_ipv6_hop_limit_step: 1,
      vxlan_vni_count: 4,
      vxlan_vni_step: 1
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
            streams: [rawVxlanIpv6Stream],
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
                packet_type: "Ethernet/IPv4/UDP/VXLAN/Ethernet/IPv6",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 70, checksum: "0xbeef" } },
                  { name: "VXLAN", fields: { flags: "0x08", vni: 4660 } },
                  { name: "Inner Ethernet", fields: { destination: "aa:bb:cc:dd:ee:ff", source: "00:11:22:33:44:55", type: "0x86dd" } },
                  {
                    name: "Inner Internet Protocol v6",
                    fields: {
                      source: "2001:db8:70::10",
                      destination: "2001:db8:70::20",
                      hop_limit: 42,
                      next_header: "No Next Header"
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
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN VNI inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 src inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 dst inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP src port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner UDP dst port inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use VXLAN inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();

    expect(useFieldEngineTarget("VXLAN inner IPv6 hop limit inc")).toEqual({
      instructions: [
        { init_value: 42, max_value: 45, min_value: 42, name: "vxlan_inner_ipv6_hop_limit", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "vxlan_inner_ipv6_hop_limit", pkt_offset: 71, type: "write_flow_var" }
      ],
      split_by_var: "vxlan_inner_ipv6_hop_limit"
    });
  }, 40_000);

  it("exposes VXLAN inner IPv6 Field Engine targets with backend-aligned offsets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValue({
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
                frame_length: 148,
                wire_length: 148,
                binary_base64: "AAAA",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  { name: "Ethernet", fields: { destination: "66:55:44:33:22:11", source: "10:20:30:40:50:60", type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "172.16.0.1", destination: "172.16.0.2", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1337, destination_port: 4789, length: 110, checksum: "auto" } },
                  { name: "VXLAN", fields: { flags: "0x08", vni: 4096 } },
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
                  { name: "Inner UDP", fields: { source_port: 32000, destination_port: 32100, length: 40, checksum: "0x0000" } }
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
    fireEvent.click(screen.getByLabelText("VXLAN"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("VXLAN inner IP version"), { target: { value: "IPv6" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 source"), { target: { value: "2001:db8:50::10" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 source mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 source count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 source step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 destination"), { target: { value: "2001:db8:60::20" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 destination mode"), { target: { value: "Increment Host" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 destination count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 destination step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 hop limit"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 hop limit mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 hop limit count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner IPv6 hop limit step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port"), { target: { value: "32000" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP source port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port"), { target: { value: "32100" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VXLAN inner UDP destination port step"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          body: expect.stringContaining('"vxlan_inner_ip_version":"IPv6"')
        })
      )
    );

    await switchPacketPreviewToFieldEngine();
    const vxlanTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv4 src inc Field Engine target" })).toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner 5-tuple inc Field Engine target" })).toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv6 src inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv6 dst inc Field Engine target" })).not.toBeDisabled();
    expect(within(vxlanTargetMap).getByRole("button", { name: "Use VXLAN inner IPv6 hop limit inc Field Engine target" })).not.toBeDisabled();

    const expectVxlanInnerIpv6Checksum = (body: ReturnType<typeof readAdvancedVmBody>) => {
      expect(body.instructions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          l2_len: 64,
          l3_len: 40,
          l4_type: 11,
          type: "fix_checksum_hw"
        })
      ]));
    };

    const vxlanInnerIpv6SrcVm = useFieldEngineTarget("VXLAN inner IPv6 src inc");
    expect(vxlanInnerIpv6SrcVm.split_by_var).toBe("vxlan_inner_ipv6_src");
    expect(vxlanInnerIpv6SrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 16, max_value: 19, min_value: 16, name: "vxlan_inner_ipv6_src", size: 1, step: 1 }),
      expect.objectContaining({ name: "vxlan_inner_ipv6_src", pkt_offset: 87, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(vxlanInnerIpv6SrcVm);

    const vxlanInnerIpv6DstVm = useFieldEngineTarget("VXLAN inner IPv6 dst inc");
    expect(vxlanInnerIpv6DstVm.split_by_var).toBe("vxlan_inner_ipv6_dst");
    expect(vxlanInnerIpv6DstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 32, max_value: 35, min_value: 32, name: "vxlan_inner_ipv6_dst", size: 1, step: 1 }),
      expect.objectContaining({ name: "vxlan_inner_ipv6_dst", pkt_offset: 103, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(vxlanInnerIpv6DstVm);

    const vxlanInnerIpv6HopLimitVm = useFieldEngineTarget("VXLAN inner IPv6 hop limit inc");
    expect(vxlanInnerIpv6HopLimitVm.split_by_var).toBe("vxlan_inner_ipv6_hop_limit");
    expect(vxlanInnerIpv6HopLimitVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ init_value: 40, max_value: 43, min_value: 40, name: "vxlan_inner_ipv6_hop_limit", size: 1, step: 1 }),
      expect.objectContaining({ name: "vxlan_inner_ipv6_hop_limit", pkt_offset: 71, type: "write_flow_var" })
    ]));
    expect(vxlanInnerIpv6HopLimitVm.instructions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "fix_checksum_hw" })
    ]));

    const vxlanInnerUdpSrcVm = useFieldEngineTarget("VXLAN inner UDP src port inc");
    expect(vxlanInnerUdpSrcVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "vxlan_inner_udp_src", pkt_offset: 104, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(vxlanInnerUdpSrcVm);

    const vxlanInnerUdpDstVm = useFieldEngineTarget("VXLAN inner UDP dst port inc");
    expect(vxlanInnerUdpDstVm.instructions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "vxlan_inner_udp_dst", pkt_offset: 106, type: "write_flow_var" })
    ]));
    expectVxlanInnerIpv6Checksum(vxlanInnerUdpDstVm);
  }, 40_000);
});
