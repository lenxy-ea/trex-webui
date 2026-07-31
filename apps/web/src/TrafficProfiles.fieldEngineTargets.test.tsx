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
  profileCatalog,
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

describe("Traffic Profiles / Field Engine Targets", () => {
  installAppTestHooks();

  it("builds MPLS Field Engine targets from raw Packet Editor bytes", async () => {
    const mplsWord = (label: number, trafficClass: number, bottomOfStack: boolean, ttl: number) => {
      const word = ((label & 0xfffff) << 12) | ((trafficClass & 0x07) << 9) | (bottomOfStack ? 0x100 : 0) | (ttl & 0xff);
      return [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff];
    };
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x88, 0x47,
      ...mplsWord(100, 1, false, 40),
      ...mplsWord(200, 2, false, 50),
      ...mplsWord(300, 3, true, 60),
      0x45, 0x00, 0x00, 0x1c, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawMplsStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary
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
            streams: [rawMplsStream],
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
                packet_type: "Ethernet/MPLS",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 88 47", ascii: "...........U.G" }],
                layers: [{ name: "Ethernet", fields: { type: "0x8847" } }]
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
    const targetNames = [
      "MPLS label inc",
      "MPLS TC inc",
      "MPLS TTL inc",
      "Second MPLS label inc",
      "Second MPLS TC inc",
      "Second MPLS TTL inc",
      "Third MPLS label inc",
      "Third MPLS TC inc",
      "Third MPLS TTL inc"
    ];
    for (const name of targetNames) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    let vm = useFieldEngineTarget("MPLS label inc");
    expect(vm.split_by_var).toBe("mpls_label");
    expect(vm.instructions).toEqual([
      { init_value: 100, max_value: 115, min_value: 100, name: "mpls_label", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xfffff000,
        name: "mpls_label",
        pkt_cast_size: 4,
        pkt_offset: 14,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("MPLS TC inc");
    expect(vm.instructions).toEqual([
      { init_value: 1, max_value: 4, min_value: 1, name: "mpls_tc", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x00000e00,
        name: "mpls_tc",
        pkt_cast_size: 4,
        pkt_offset: 14,
        shift: 9,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("Second MPLS TTL inc");
    expect(vm.instructions).toEqual([
      { init_value: 50, max_value: 65, min_value: 50, name: "mpls_label2_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
      { add_value: 0, is_big_endian: true, name: "mpls_label2_ttl", pkt_offset: 21, type: "write_flow_var" }
    ]);

    vm = useFieldEngineTarget("Third MPLS label inc");
    expect(vm.instructions).toEqual([
      { init_value: 300, max_value: 315, min_value: 300, name: "mpls_label3", op: "inc", size: 2, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xfffff000,
        name: "mpls_label3",
        pkt_cast_size: 4,
        pkt_offset: 22,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("Third MPLS TC inc");
    expect(vm.instructions[0]).toEqual({
      init_value: 3,
      max_value: 6,
      min_value: 3,
      name: "mpls_label3_tc",
      op: "inc",
      size: 1,
      step: 1,
      type: "flow_var"
    });
    expect(vm.instructions[1]).toMatchObject({ mask: 0x00000e00, pkt_offset: 22, shift: 9 });

    vm = useFieldEngineTarget("Third MPLS TTL inc");
    expect(vm.instructions).toEqual([
      { init_value: 60, max_value: 75, min_value: 60, name: "mpls_label3_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
      { add_value: 0, is_big_endian: true, name: "mpls_label3_ttl", pkt_offset: 25, type: "write_flow_var" }
    ]);
  }, 40_000);

  it("uses third-label MPLS Packet Editor rows as Field Engine targets", async () => {
    const mplsWord = (label: number, trafficClass: number, bottomOfStack: boolean, ttl: number) => {
      const word = ((label & 0xfffff) << 12) | ((trafficClass & 0x07) << 9) | (bottomOfStack ? 0x100 : 0) | (ttl & 0xff);
      return [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff];
    };
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x88, 0x47,
      ...mplsWord(100, 1, false, 40),
      ...mplsWord(200, 2, false, 50),
      ...mplsWord(300, 3, true, 60),
      0x45, 0x00, 0x00, 0x1c, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02
    ];

    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet"
      }),
      "Ethernet/MPLS",
      [{ name: "Ethernet", fields: { type: "0x8847" } }]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field MPLS 3 Label")).toHaveValue("300");
    expect(screen.getByLabelText("Raw field MPLS 3 Traffic class")).toHaveValue("3");
    expect(screen.getByLabelText("Raw field MPLS 3 Bottom of stack")).toHaveValue("1");
    expect(screen.getByLabelText("Raw field MPLS 3 TTL")).toHaveValue("60");

    for (const rawField of ["MPLS 3 Header", "MPLS 3 Bottom of stack"]) {
      expect(screen.queryByRole("button", { name: `Use Field Engine target for raw field ${rawField}` })).not.toBeInTheDocument();
    }

    const thirdLabelVm = await selectRawPacketFieldEngineTarget("MPLS 3 Label", "Third MPLS label inc");
    expect(thirdLabelVm.split_by_var).toBe("mpls_label3");
    expect(thirdLabelVm.instructions).toEqual([
      { init_value: 300, max_value: 315, min_value: 300, name: "mpls_label3", op: "inc", size: 2, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xfffff000,
        name: "mpls_label3",
        pkt_cast_size: 4,
        pkt_offset: 22,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ]);

    const thirdTrafficClassVm = await selectRawPacketFieldEngineTarget("MPLS 3 Traffic class", "Third MPLS TC inc");
    expect(thirdTrafficClassVm.split_by_var).toBe("mpls_label3_tc");
    expect(thirdTrafficClassVm.instructions).toEqual([
      { init_value: 3, max_value: 6, min_value: 3, name: "mpls_label3_tc", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x00000e00,
        name: "mpls_label3_tc",
        pkt_cast_size: 4,
        pkt_offset: 22,
        shift: 9,
        type: "write_mask_flow_var"
      }
    ]);

    const thirdTtlVm = await selectRawPacketFieldEngineTarget("MPLS 3 TTL", "Third MPLS TTL inc");
    expect(thirdTtlVm.split_by_var).toBe("mpls_label3_ttl");
    expect(thirdTtlVm.instructions).toEqual([
      { init_value: 60, max_value: 75, min_value: 60, name: "mpls_label3_ttl", op: "inc", size: 1, step: 1, type: "flow_var" },
      { add_value: 0, is_big_endian: true, name: "mpls_label3_ttl", pkt_offset: 25, type: "write_flow_var" }
    ]);
  }, 40_000);

  it("builds VLAN Field Engine targets from raw QinQ Packet Editor bytes", async () => {
    const outerTci = (5 << 13) | 100;
    const innerTci = (3 << 13) | (1 << 12) | 200;
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x88, 0xa8,
      (outerTci >>> 8) & 0xff, outerTci & 0xff,
      0x81, 0x00,
      (innerTci >>> 8) & 0xff, innerTci & 0xff,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c, 0x12, 0x34, 0x00, 0x00, 0x40, 0x11,
      0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x02
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawQinqStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary
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
            streams: [rawQinqStream],
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
                packet_type: "Ethernet/QinQ",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 88 a8", ascii: "...........U.." }],
                layers: [{ name: "Ethernet", fields: { type: "0x88a8" } }]
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
    expect(within(targetMap).getByRole("button", { name: "Use EtherType inc Field Engine target" })).toBeDisabled();
    for (const name of [
      "VLAN ID inc",
      "VLAN priority inc",
      "VLAN CFI/DEI vary",
      "VLAN inner ID inc",
      "VLAN inner priority inc",
      "VLAN inner CFI/DEI vary"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    let vm = useFieldEngineTarget("VLAN ID inc");
    expect(vm.instructions).toEqual([
      { init_value: 100, max_value: 115, min_value: 100, name: "vlan_id", op: "inc", size: 2, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0fff,
        name: "vlan_id",
        pkt_cast_size: 2,
        pkt_offset: 14,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("VLAN priority inc");
    expect(vm.instructions).toEqual([
      { init_value: 5, max_value: 7, min_value: 5, name: "vlan_priority", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xe000,
        name: "vlan_priority",
        pkt_cast_size: 2,
        pkt_offset: 14,
        shift: 13,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("VLAN CFI/DEI vary");
    expect(vm.instructions).toEqual([
      { init_value: 0, max_value: 1, min_value: 0, name: "vlan_cfi", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1000,
        name: "vlan_cfi",
        pkt_cast_size: 2,
        pkt_offset: 14,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("VLAN inner ID inc");
    expect(vm.instructions).toEqual([
      { init_value: 200, max_value: 215, min_value: 200, name: "vlan2_id", op: "inc", size: 2, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x0fff,
        name: "vlan2_id",
        pkt_cast_size: 2,
        pkt_offset: 18,
        shift: 0,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("VLAN inner priority inc");
    expect(vm.instructions).toEqual([
      { init_value: 3, max_value: 6, min_value: 3, name: "vlan2_priority", op: "inc", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0xe000,
        name: "vlan2_priority",
        pkt_cast_size: 2,
        pkt_offset: 18,
        shift: 13,
        type: "write_mask_flow_var"
      }
    ]);

    vm = useFieldEngineTarget("VLAN inner CFI/DEI vary");
    expect(vm.instructions).toEqual([
      { init_value: 1, max_value: 1, min_value: 0, name: "vlan2_cfi", op: "dec", size: 1, step: 1, type: "flow_var" },
      {
        add_value: 0,
        is_big_endian: true,
        mask: 0x1000,
        name: "vlan2_cfi",
        pkt_cast_size: 2,
        pkt_offset: 18,
        shift: 12,
        type: "write_mask_flow_var"
      }
    ]);
  }, 40_000);

  it("builds ARP Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x06,
      0x00, 0x01,
      0x08, 0x00,
      0x06,
      0x04,
      0x00, 0x02,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x50,
      0x0a, 0x00, 0x00, 0x0a,
      0x66, 0x55, 0x44, 0x33, 0x22, 0x10,
      0x0a, 0x00, 0x00, 0x14
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawArpStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary
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
            streams: [rawArpStream],
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
                packet_type: "Ethernet/VLAN/ARP",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 81 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "ARP", fields: { operation: 2, sender_ip: "10.0.0.10", target_ip: "10.0.0.20" } }
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
      "ARP operation inc",
      "ARP sender IP inc",
      "ARP target IP inc",
      "ARP sender MAC inc",
      "ARP target MAC inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    expect(useFieldEngineTarget("ARP operation inc")).toEqual({
      instructions: [
        { init_value: 2, max_value: 5, min_value: 2, name: "arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_operation", pkt_offset: 24, type: "write_flow_var" }
      ],
      split_by_var: "arp_operation"
    });

    expect(useFieldEngineTarget("ARP sender IP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 25, min_value: 10, name: "arp_sender_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_ip", pkt_offset: 35, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_ip"
    });

    expect(useFieldEngineTarget("ARP target IP inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 35, min_value: 20, name: "arp_target_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_ip", pkt_offset: 45, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_ip"
    });

    expect(useFieldEngineTarget("ARP sender MAC inc")).toEqual({
      instructions: [
        { init_value: 80, max_value: 95, min_value: 80, name: "arp_sender_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_sender_mac", pkt_offset: 31, type: "write_flow_var" }
      ],
      split_by_var: "arp_sender_mac"
    });

    expect(useFieldEngineTarget("ARP target MAC inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 31, min_value: 16, name: "arp_target_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_target_mac", pkt_offset: 41, type: "write_flow_var" }
      ],
      split_by_var: "arp_target_mac"
    });
  }, 40_000);

  it("builds ICMPv6 Echo Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x86, 0xdd,
      0x60, 0x00, 0x00, 0x00,
      0x00, 0x08,
      0x3a,
      0x40,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
      0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
      0x80,
      0x00,
      0xbe, 0xef,
      0x12, 0x34,
      0x00, 0x07
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawIcmpv6Stream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      icmp_type_count: 2,
      icmp_type_step: 1,
      icmp_code_count: 4,
      icmp_code_step: 1,
      icmp_identifier_count: 4,
      icmp_identifier_step: 1,
      icmp_sequence_count: 4,
      icmp_sequence_step: 1
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
            streams: [rawIcmpv6Stream],
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
                packet_type: "Ethernet/VLAN/IPv6/ICMPv6",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 81 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "IPv6", fields: { next_header: 58, source: "2001:db8::1", destination: "2001:db8::2" } },
                  { name: "ICMPv6", fields: { type: 128, code: 0, identifier: 4660, sequence: 7 } }
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
    for (const name of ["ICMPv6 type inc", "ICMPv6 code inc", "ICMPv6 identifier inc", "ICMPv6 sequence inc"]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    expect(useFieldEngineTarget("ICMPv6 type inc")).toEqual({
      instructions: [
        { init_value: 128, max_value: 129, min_value: 128, name: "icmp_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_type", pkt_offset: 58, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_type"
    });

    expect(useFieldEngineTarget("ICMPv6 code inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 3, min_value: 0, name: "icmp_code", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_code", pkt_offset: 59, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_code"
    });

    expect(useFieldEngineTarget("ICMPv6 identifier inc")).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "icmp_identifier", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier", pkt_offset: 62, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_identifier"
    });

    expect(useFieldEngineTarget("ICMPv6 sequence inc")).toEqual({
      instructions: [
        { init_value: 7, max_value: 10, min_value: 7, name: "icmp_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_sequence", pkt_offset: 64, type: "write_flow_var" },
        { l2_len: 18, l3_len: 40, type: "fix_checksum_icmpv6" }
      ],
      split_by_var: "icmp_sequence"
    });
  }, 30_000);

  it("disables IPv4 ICMP Echo Field Engine targets when raw checksum is invalid", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c,
      0x12, 0x34, 0x00, 0x00,
      0x40, 0x01, 0x00, 0x00,
      0xc0, 0x00, 0x02, 0x01,
      0xc0, 0x00, 0x02, 0x02,
      0x08, 0x00, 0xbe, 0xef,
      0x12, 0x34,
      0x00, 0x07
    ];
    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet",
        icmp_identifier_count: 4,
        icmp_identifier_step: 1,
        icmp_sequence_count: 4,
        icmp_sequence_step: 1
      }),
      "Ethernet/VLAN/IPv4/ICMP",
      [
        { name: "Ethernet", fields: { type: "0x8100" } },
        { name: "802.1Q VLAN", fields: { vlan: 100 } },
        { name: "IPv4", fields: { protocol: 1, source: "192.0.2.1", destination: "192.0.2.2" } },
        { name: "ICMP", fields: { type: 8, code: 0, identifier: 4660, sequence: 7 } }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use ICMP type inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP code inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP identifier inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP sequence inc Field Engine target" })).toBeDisabled();
  }, 10_000);

  it("builds IPv4 ICMP Echo Field Engine targets from valid raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c,
      0x12, 0x34, 0x00, 0x00,
      0x40, 0x01, 0x00, 0x00,
      0xc0, 0x00, 0x02, 0x01,
      0xc0, 0x00, 0x02, 0x02,
      0x08, 0x00, 0xe5, 0xc4,
      0x12, 0x34,
      0x00, 0x07
    ];
    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet",
        icmp_identifier_count: 4,
        icmp_identifier_step: 1,
        icmp_sequence_count: 4,
        icmp_sequence_step: 1
      }),
      "Ethernet/VLAN/IPv4/ICMP",
      [
        { name: "Ethernet", fields: { type: "0x8100" } },
        { name: "802.1Q VLAN", fields: { vlan: 100 } },
        { name: "IPv4", fields: { protocol: 1, source: "192.0.2.1", destination: "192.0.2.2" } },
        { name: "ICMP", fields: { type: 8, code: 0, checksum: "e5c4", identifier: 4660, sequence: 7 } }
      ]
    );

    const targetMap = screen.getByLabelText("Field Engine target map");
    expect(within(targetMap).getByRole("button", { name: "Use ICMP type inc Field Engine target" }))
      .not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP code inc Field Engine target" }))
      .not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP identifier inc Field Engine target" }))
      .not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use ICMP sequence inc Field Engine target" }))
      .not.toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field ICMP Checksum")).toHaveValue("e5c4");
    expect(screen.queryByRole("button", {
      name: "Use Field Engine target for raw field ICMP Checksum"
    })).not.toBeInTheDocument();

    const typeVm = await selectRawPacketFieldEngineTarget("ICMP Type", "ICMP type inc");
    expect(typeVm).toEqual({
      instructions: [
        { init_value: 8, max_value: 23, min_value: 8, name: "icmp_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_type", pkt_offset: 38, type: "write_flow_var" },
        { init_value: 58820, max_value: 58820, min_value: 54980, name: "icmp_type_csum", op: "dec", size: 2, step: 256, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_type_csum", pkt_offset: 40, type: "write_flow_var" }
      ],
      split_by_var: "icmp_type"
    });

    const codeVm = await selectRawPacketFieldEngineTarget("ICMP Code", "ICMP code inc");
    expect(codeVm).toEqual({
      instructions: [
        { init_value: 0, max_value: 15, min_value: 0, name: "icmp_code", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_code", pkt_offset: 39, type: "write_flow_var" },
        { init_value: 58820, max_value: 58820, min_value: 58805, name: "icmp_code_csum", op: "dec", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_code_csum", pkt_offset: 40, type: "write_flow_var" }
      ],
      split_by_var: "icmp_code"
    });

    const identifierVm = await selectRawPacketFieldEngineTarget("ICMP Identifier", "ICMP identifier inc");
    expect(identifierVm).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "icmp_identifier", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier", pkt_offset: 42, type: "write_flow_var" },
        { init_value: 58820, max_value: 58820, min_value: 58817, name: "icmp_identifier_csum", op: "dec", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier_csum", pkt_offset: 40, type: "write_flow_var" }
      ],
      split_by_var: "icmp_identifier"
    });

    const sequenceVm = await selectRawPacketFieldEngineTarget("ICMP Sequence", "ICMP sequence inc");
    expect(sequenceVm).toEqual({
      instructions: [
        { init_value: 7, max_value: 10, min_value: 7, name: "icmp_sequence", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_sequence", pkt_offset: 44, type: "write_flow_var" },
        { init_value: 58820, max_value: 58820, min_value: 58817, name: "icmp_sequence_csum", op: "dec", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_sequence_csum", pkt_offset: 40, type: "write_flow_var" }
      ],
      split_by_var: "icmp_sequence"
    });
  }, 30_000);

  it("builds IPv4 ICMP Echo Field Engine targets from GRE inner raw bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x08, 0x00,
      0x45, 0x00, 0x00, 0x34,
      0x11, 0x11, 0x00, 0x00,
      0x40, 0x2f, 0x00, 0x00,
      0xc0, 0x00, 0x02, 0x01,
      0xc0, 0x00, 0x02, 0x02,
      0x00, 0x00, 0x08, 0x00,
      0x45, 0x00, 0x00, 0x1c,
      0x22, 0x22, 0x00, 0x00,
      0x40, 0x01, 0x00, 0x00,
      0x0a, 0x00, 0x00, 0x01,
      0x0a, 0x00, 0x00, 0x02,
      0x08, 0x00, 0xe5, 0xc4,
      0x12, 0x34,
      0x00, 0x07
    ];
    await openRawStreamFieldEngine(
      rawPacket,
      workbenchStream({
        advanced_mode: true,
        packet_type: "Ethernet",
        icmp_identifier_count: 4,
        icmp_identifier_step: 1
      }),
      "Ethernet/IPv4/GRE/IPv4/ICMP",
      [
        { name: "Ethernet", fields: { type: "0x0800" } },
        { name: "IPv4", fields: { protocol: 47, source: "192.0.2.1", destination: "192.0.2.2" } },
        { name: "GRE", fields: { protocol_type: "0x0800" } },
        { name: "Inner IPv4", fields: { protocol: 1, source: "10.0.0.1", destination: "10.0.0.2" } },
        { name: "Inner ICMP", fields: { type: 8, code: 0, checksum: "e5c4", identifier: 4660, sequence: 7 } }
      ]
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
    expect(await screen.findByLabelText("Raw field Inner ICMP Checksum")).toHaveValue("e5c4");

    const identifierVm = await selectRawPacketFieldEngineTarget("Inner ICMP Identifier", "ICMP identifier inc");
    expect(identifierVm).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "icmp_identifier", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier", pkt_offset: 62, type: "write_flow_var" },
        { init_value: 58820, max_value: 58820, min_value: 58817, name: "icmp_identifier_csum", op: "dec", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "icmp_identifier_csum", pkt_offset: 60, type: "write_flow_var" }
      ],
      split_by_var: "icmp_identifier"
    });
  }, 30_000);

  it("builds DNS Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x00,
      0x45, 0x00,
      0x00, 0x39,
      0x12, 0x34,
      0x00, 0x00,
      0x40,
      0x11,
      0x00, 0x00,
      0x10, 0x00, 0x00, 0x01,
      0x30, 0x00, 0x00, 0x01,
      0x30, 0x39,
      0x00, 0x35,
      0x00, 0x25,
      0xbe, 0xef,
      0x12, 0x34,
      0x01, 0x00,
      0x00, 0x01,
      0x00, 0x00,
      0x00, 0x00,
      0x00, 0x00,
      0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
      0x03, 0x63, 0x6f, 0x6d,
      0x00,
      0x00, 0x01,
      0x00, 0x01
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawDnsStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      dns_transaction_id_count: 4,
      dns_flags_count: 4,
      dns_query_type_count: 4,
      dns_query_class_count: 4
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
            streams: [rawDnsStream],
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
                packet_type: "Ethernet/VLAN/IPv4/UDP/DNS",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 81 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "Internet Protocol v4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 12345, destination_port: 53, length: 37, checksum: "0xbeef" } },
                  {
                    name: "Domain Name System",
                    fields: {
                      transaction_id: 4660,
                      flags: "0x0100",
                      questions: 1,
                      answers: 0,
                      query_name: "example.com",
                      query_type: 1,
                      query_class: 1
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
    for (const name of [
      "DNS transaction ID inc",
      "DNS flags inc",
      "DNS response flag vary",
      "DNS opcode inc",
      "DNS authoritative answer flag vary",
      "DNS truncated flag vary",
      "DNS recursion desired flag vary",
      "DNS recursion available flag vary",
      "DNS reserved flags inc",
      "DNS response code inc",
      "DNS query type inc",
      "DNS query class inc",
      "DNS query name first byte inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer TTL inc Field Engine target" })).toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer IPv4 inc Field Engine target" })).toBeDisabled();

    expect(useFieldEngineTarget("DNS transaction ID inc")).toEqual({
      instructions: [
        { init_value: 4660, max_value: 4663, min_value: 4660, name: "dns_transaction_id", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_transaction_id", pkt_offset: 46, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_transaction_id"
    });

    expect(useFieldEngineTarget("DNS flags inc")).toEqual({
      instructions: [
        { init_value: 256, max_value: 259, min_value: 256, name: "dns_flags", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_flags", pkt_offset: 48, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_flags"
    });

    expect(useFieldEngineTarget("DNS response flag vary")).toEqual({
      instructions: [
        { init_value: 0, max_value: 1, min_value: 0, name: "dns_response", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 32768, name: "dns_response", pkt_cast_size: 2, pkt_offset: 48, shift: 15, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_response"
    });

    expect(useFieldEngineTarget("DNS opcode inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 3, min_value: 0, name: "dns_opcode", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 30720, name: "dns_opcode", pkt_cast_size: 2, pkt_offset: 48, shift: 11, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_opcode"
    });

    expect(useFieldEngineTarget("DNS recursion desired flag vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "dns_rd", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 256, name: "dns_rd", pkt_cast_size: 2, pkt_offset: 48, shift: 8, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_rd"
    });

    expect(useFieldEngineTarget("DNS response code inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 3, min_value: 0, name: "dns_rcode", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 15, name: "dns_rcode", pkt_cast_size: 2, pkt_offset: 48, shift: 0, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_rcode"
    });

    expect(useFieldEngineTarget("DNS query type inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dns_query_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_query_type", pkt_offset: 71, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_query_type"
    });

    expect(useFieldEngineTarget("DNS query class inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dns_query_class", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_query_class", pkt_offset: 73, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_query_class"
    });

    expect(useFieldEngineTarget("DNS query name first byte inc")).toEqual({
      instructions: [
        { init_value: 101, max_value: 104, min_value: 101, name: "dns_query_name_byte", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_query_name_byte", pkt_offset: 59, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_query_name_byte"
    });
  }, 40_000);

  it("builds DNS answer Field Engine targets from raw Packet Editor bytes", async () => {
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x00,
      0x45, 0x00,
      0x00, 0x49,
      0x12, 0x34,
      0x00, 0x00,
      0x40,
      0x11,
      0x00, 0x00,
      0x30, 0x00, 0x00, 0x01,
      0x10, 0x00, 0x00, 0x01,
      0x00, 0x35,
      0x30, 0x39,
      0x00, 0x35,
      0xbe, 0xef,
      0x12, 0x34,
      0x81, 0x80,
      0x00, 0x01,
      0x00, 0x01,
      0x00, 0x00,
      0x00, 0x00,
      0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
      0x03, 0x63, 0x6f, 0x6d,
      0x00,
      0x00, 0x01,
      0x00, 0x01,
      0xc0, 0x0c,
      0x00, 0x01,
      0x00, 0x01,
      0x00, 0x00, 0x00, 0x3c,
      0x00, 0x04,
      0xc0, 0x00, 0x02, 0x0a
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawDnsStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      dns_answer_ttl_count: 4,
      dns_answer_ipv4_count: 4
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
            streams: [rawDnsStream],
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
                packet_type: "Ethernet/VLAN/IPv4/UDP/DNS",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 81 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "Internet Protocol v4", fields: { source: "48.0.0.1", destination: "16.0.0.1", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 53, destination_port: 12345, length: 53, checksum: "0xbeef" } },
                  {
                    name: "Domain Name System",
                    fields: {
                      transaction_id: 4660,
                      flags: "0x8180",
                      questions: 1,
                      answers: 1,
                      query_name: "example.com",
                      query_type: 1,
                      query_class: 1,
                      answer_ttl: 60,
                      answer_ipv4: "192.0.2.10"
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
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer TTL inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer type inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer class inc Field Engine target" })).not.toBeDisabled();
    expect(within(targetMap).getByRole("button", { name: "Use DNS answer IPv4 inc Field Engine target" })).not.toBeDisabled();

    expect(useFieldEngineTarget("DNS answer type inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dns_answer_type", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_answer_type", pkt_offset: 77, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_answer_type"
    });

    expect(useFieldEngineTarget("DNS answer class inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dns_answer_class", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_answer_class", pkt_offset: 79, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_answer_class"
    });

    expect(useFieldEngineTarget("DNS answer TTL inc")).toEqual({
      instructions: [
        { init_value: 60, max_value: 63, min_value: 60, name: "dns_answer_ttl", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_answer_ttl", pkt_offset: 81, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_answer_ttl"
    });

    expect(useFieldEngineTarget("DNS answer IPv4 inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "dns_answer_ipv4", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dns_answer_ipv4", pkt_offset: 90, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dns_answer_ipv4"
    });
  }, 40_000);

  it("builds DHCP Field Engine targets from raw Packet Editor bytes", async () => {
    const writeBytes = (target: number[], offset: number, values: number[]) => {
      values.forEach((value, index) => {
        target[offset + index] = value;
      });
    };
    const bootp = new Array<number>(240).fill(0);
    bootp[0] = 1;
    bootp[1] = 1;
    bootp[2] = 6;
    bootp[3] = 1;
    writeBytes(bootp, 4, [0x39, 0x03, 0xf3, 0x26]);
    writeBytes(bootp, 8, [0x00, 0x0a]);
    writeBytes(bootp, 10, [0x80, 0x00]);
    writeBytes(bootp, 12, [10, 10, 0, 10]);
    writeBytes(bootp, 16, [10, 10, 0, 20]);
    writeBytes(bootp, 20, [10, 10, 0, 30]);
    writeBytes(bootp, 24, [10, 10, 0, 40]);
    writeBytes(bootp, 28, [0x00, 0x11, 0x22, 0x33, 0x44, 0x10]);
    writeBytes(bootp, 236, [0x63, 0x82, 0x53, 0x63]);
    const options = [
      53, 1, 1,
      55, 4, 1, 3, 6, 15,
      12, 4, 0x74, 0x72, 0x65, 0x78,
      61, 7, 1, 0x00, 0x11, 0x22, 0x33, 0x44, 0x10,
      50, 4, 10, 0, 0, 10,
      54, 4, 10, 0, 0, 1,
      51, 4, 0, 0, 0x0e, 0x10,
      58, 4, 0, 0, 0x07, 0x08,
      59, 4, 0, 0, 0x0c, 0x4e,
      255
    ];
    const rawPacket = [
      0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x81, 0x00,
      0x00, 0x64,
      0x08, 0x00,
      0x45, 0x00,
      0x01, 0x43,
      0x12, 0x34,
      0x00, 0x00,
      0x40,
      0x11,
      0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xff, 0xff, 0xff,
      0x00, 0x44,
      0x00, 0x43,
      0x01, 0x2f,
      0xbe, 0xef,
      ...bootp,
      ...options
    ];
    const packetBinary = btoa(String.fromCharCode(...rawPacket));
    const rawDhcpStream = workbenchStream({
      advanced_mode: true,
      packet_type: "Ethernet",
      packet_binary_base64: packetBinary,
      dhcp_client_ip_count: 4,
      dhcp_client_mac_count: 4,
      dhcp_flags_count: 4,
      dhcp_hops_count: 4,
      dhcp_lease_time_count: 4,
      dhcp_lease_time_step: 60,
      dhcp_message_type_count: 4,
      dhcp_operation_count: 2,
      dhcp_rebinding_time_count: 4,
      dhcp_rebinding_time_step: 45,
      dhcp_relay_ip_count: 4,
      dhcp_renewal_time_count: 4,
      dhcp_renewal_time_step: 30,
      dhcp_requested_ip_count: 4,
      dhcp_seconds_count: 4,
      dhcp_seconds_step: 10,
      dhcp_server_id_count: 4,
      dhcp_server_ip_count: 4,
      dhcp_xid_count: 4,
      dhcp_your_ip_count: 4
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
            streams: [rawDhcpStream],
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
                packet_type: "Ethernet/VLAN/IPv4/UDP/DHCP",
                frame_length: rawPacket.length,
                wire_length: rawPacket.length,
                binary_base64: packetBinary,
                hex: "",
                hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 81 00", ascii: "........3DU..." }],
                layers: [
                  { name: "Ethernet", fields: { type: "0x8100" } },
                  { name: "802.1Q VLAN", fields: { vlan: 100 } },
                  { name: "Internet Protocol v4", fields: { source: "0.0.0.0", destination: "255.255.255.255", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 68, destination_port: 67, length: 303, checksum: "0xbeef" } },
                  {
                    name: "Dynamic Host Configuration Protocol",
                    fields: {
                      client_ip: "10.10.0.10",
                      client_mac: "00:11:22:33:44:10",
                      flags: "0x8000",
                      hops: 1,
                      message_type: 1,
                      operation: 1,
                      relay_ip: "10.10.0.40",
                      requested_ip: "10.0.0.10",
                      seconds: 10,
                      server_id: "10.0.0.1",
                      server_ip: "10.10.0.30",
                      xid: 956560166,
                      your_ip: "10.10.0.20"
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
    for (const name of [
      "DHCP operation inc",
      "DHCP hops inc",
      "DHCP seconds inc",
      "DHCP XID inc",
      "DHCP message type inc",
      "DHCP flags inc",
      "DHCP broadcast flag vary",
      "DHCP reserved flags inc",
      "DHCP client IP inc",
      "DHCP your IP inc",
      "DHCP server IP inc",
      "DHCP relay IP inc",
      "DHCP client MAC inc",
      "DHCP requested IP inc",
      "DHCP server ID inc",
      "DHCP parameter request option inc",
      "DHCP hostname first byte inc",
      "DHCP client identifier first byte inc",
      "DHCP lease time inc",
      "DHCP renewal time inc",
      "DHCP rebinding time inc"
    ]) {
      expect(within(targetMap).getByRole("button", { name: `Use ${name} Field Engine target` })).not.toBeDisabled();
    }

    expect(useFieldEngineTarget("DHCP operation inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 2, min_value: 1, name: "dhcp_operation", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_operation", pkt_offset: 46, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_operation"
    });
    expect(useFieldEngineTarget("DHCP hops inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dhcp_hops", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_hops", pkt_offset: 49, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_hops"
    });
    expect(useFieldEngineTarget("DHCP seconds inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 40, min_value: 10, name: "dhcp_seconds", op: "inc", size: 2, step: 10, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_seconds", pkt_offset: 54, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_seconds"
    });
    expect(useFieldEngineTarget("DHCP XID inc")).toEqual({
      instructions: [
        { init_value: 956560166, max_value: 956560169, min_value: 956560166, name: "dhcp_xid", op: "inc", size: 4, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_xid", pkt_offset: 50, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_xid"
    });
    expect(useFieldEngineTarget("DHCP message type inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dhcp_message_type", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_message_type", pkt_offset: 288, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_message_type"
    });
    expect(useFieldEngineTarget("DHCP flags inc")).toEqual({
      instructions: [
        { init_value: 32768, max_value: 32771, min_value: 32768, name: "dhcp_flags", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_flags", pkt_offset: 56, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_flags"
    });
    expect(useFieldEngineTarget("DHCP broadcast flag vary")).toEqual({
      instructions: [
        { init_value: 1, max_value: 1, min_value: 0, name: "dhcp_broadcast", op: "dec", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 32768, name: "dhcp_broadcast", pkt_cast_size: 2, pkt_offset: 56, shift: 15, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_broadcast"
    });
    expect(useFieldEngineTarget("DHCP reserved flags inc")).toEqual({
      instructions: [
        { init_value: 0, max_value: 3, min_value: 0, name: "dhcp_reserved_flags", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, mask: 32767, name: "dhcp_reserved_flags", pkt_cast_size: 2, pkt_offset: 56, shift: 0, type: "write_mask_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_reserved_flags"
    });
    expect(useFieldEngineTarget("DHCP client IP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "dhcp_client_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_client_ip", pkt_offset: 61, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_client_ip"
    });
    expect(useFieldEngineTarget("DHCP your IP inc")).toEqual({
      instructions: [
        { init_value: 20, max_value: 23, min_value: 20, name: "dhcp_your_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_your_ip", pkt_offset: 65, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_your_ip"
    });
    expect(useFieldEngineTarget("DHCP server IP inc")).toEqual({
      instructions: [
        { init_value: 30, max_value: 33, min_value: 30, name: "dhcp_server_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_server_ip", pkt_offset: 69, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_server_ip"
    });
    expect(useFieldEngineTarget("DHCP relay IP inc")).toEqual({
      instructions: [
        { init_value: 40, max_value: 43, min_value: 40, name: "dhcp_relay_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_relay_ip", pkt_offset: 73, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_relay_ip"
    });
    expect(useFieldEngineTarget("DHCP client MAC inc")).toEqual({
      instructions: [
        { init_value: 16, max_value: 19, min_value: 16, name: "dhcp_client_mac", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_client_mac", pkt_offset: 79, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_client_mac"
    });
    expect(useFieldEngineTarget("DHCP requested IP inc")).toEqual({
      instructions: [
        { init_value: 10, max_value: 13, min_value: 10, name: "dhcp_requested_ip", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_requested_ip", pkt_offset: 315, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_requested_ip"
    });
    expect(useFieldEngineTarget("DHCP server ID inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dhcp_server_id", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_server_id", pkt_offset: 321, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_server_id"
    });
    expect(useFieldEngineTarget("DHCP parameter request option inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dhcp_parameter_request", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_parameter_request", pkt_offset: 291, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_parameter_request"
    });
    expect(useFieldEngineTarget("DHCP hostname first byte inc")).toEqual({
      instructions: [
        { init_value: 116, max_value: 119, min_value: 116, name: "dhcp_hostname_byte", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_hostname_byte", pkt_offset: 297, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_hostname_byte"
    });
    expect(useFieldEngineTarget("DHCP client identifier first byte inc")).toEqual({
      instructions: [
        { init_value: 1, max_value: 4, min_value: 1, name: "dhcp_client_identifier", op: "inc", size: 1, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_client_identifier", pkt_offset: 303, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_client_identifier"
    });
    expect(useFieldEngineTarget("DHCP lease time inc")).toEqual({
      instructions: [
        { init_value: 3600, max_value: 3780, min_value: 3600, name: "dhcp_lease_time", op: "inc", size: 4, step: 60, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_lease_time", pkt_offset: 324, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_lease_time"
    });
    expect(useFieldEngineTarget("DHCP renewal time inc")).toEqual({
      instructions: [
        { init_value: 1800, max_value: 1890, min_value: 1800, name: "dhcp_renewal_time", op: "inc", size: 4, step: 30, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_renewal_time", pkt_offset: 330, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_renewal_time"
    });
    expect(useFieldEngineTarget("DHCP rebinding time inc")).toEqual({
      instructions: [
        { init_value: 3150, max_value: 3285, min_value: 3150, name: "dhcp_rebinding_time", op: "inc", size: 4, step: 45, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "dhcp_rebinding_time", pkt_offset: 336, type: "write_flow_var" },
        { l2_len: 18, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" }
      ],
      split_by_var: "dhcp_rebinding_time"
    });
  }, 60_000);
});
