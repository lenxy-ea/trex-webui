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
  screen,
  stubFetch,
  switchPacketPreviewToFieldEngine,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

describe("Traffic Profiles / Protocol Data", () => {
  installAppTestHooks();

  it("renders Stream Builder protocol data through the backend packet preview", async () => {
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
                packet_type: "Ethernet/IPv4/TCP",
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
                      type: "0x8100"
                    }
                  },
                  {
                    name: "802.1Q VLAN",
                    fields: {
                      priority: 5,
                      priority_mode: "Increment",
                      priority_count: 4,
                      priority_step: 1,
                      cfi_dei: 1,
                      vlan: 123,
                      vlan_mode: "Increment",
                      vlan_count: 4,
                      vlan_step: 1,
                      type: "0x0800"
                    }
                  },
                  {
                    name: "Internet Protocol v4",
                    fields: {
                      source: "10.10.10.1",
                      destination: "10.10.10.2",
                      dscp: 10,
                      ecn: 3,
                      ecn_mode: "Increment",
                      ecn_count: 4,
                      ecn_step: 1,
                      tos: 43,
                      identification: 3210,
                      identification_mode: "Increment",
                      identification_count: 4,
                      identification_step: 1,
                      flags: "DF,MF",
                      fragment_offset: 9,
                      fragment_offset_mode: "Increment",
                      fragment_offset_count: 4,
                      fragment_offset_step: 1,
                      ttl: 42,
                      checksum: "1A2B",
                      checksum_override: true,
                      protocol: "TCP"
                    }
                  },
                  {
                    name: "TCP",
                    fields: {
                      source_port: 12345,
                      destination_port: 443,
                      sequence_number: 129018,
                      sequence_mode: "Increment",
                      sequence_count: 4,
                      sequence_step: 1,
                      acknowledge_number: 42,
                      acknowledge_mode: "Increment",
                      acknowledge_count: 4,
                      acknowledge_step: 1,
                      window: 2048,
                      window_mode: "Increment",
                      window_count: 4,
                      window_step: 1,
                      checksum: "B3E3",
                      checksum_override: true,
                      checksum_mode: "Increment",
                      checksum_count: 4,
                      checksum_step: 1,
                      header_length: 44,
                      options: "MSS=1460, SACK permitted, TS=123456/654321, WS=7",
                      urgent_pointer: 7,
                      urgent_pointer_mode: "Increment",
                      urgent_pointer_count: 4,
                      urgent_pointer_step: 1,
                      flags: "ACK,SYN",
                      flags_mode: "Increment",
                      flags_count: 4,
                      flags_step: 1
                    }
                  },
                  {
                    name: "TCP Options",
                    fields: {
                      mss_enabled: true,
                      mss: 1460,
                      mss_mode: "Increment",
                      mss_count: 4,
                      mss_step: 1,
                      window_scale_enabled: true,
                      window_scale: 7,
                      sack_permitted: true,
                      timestamp_enabled: true,
                      timestamp_value: 123456,
                      timestamp_echo: 654321
                    }
                  },
                  {
                    name: "Payload",
                    fields: {
                      bytes: 38,
                      pattern: "A1B2"
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
    fireEvent.click(screen.getByLabelText("Tagged"));
    fireEvent.click(screen.getByLabelText("TCP"));
    fireEvent.change(screen.getByLabelText("Frame length"), { target: { value: "96" } });
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("VLAN priority"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("VLAN priority mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VLAN priority count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VLAN priority step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VLAN CFI DEI"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VLAN ID"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("VLAN ID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VLAN ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VLAN ID step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Enable VLAN inner tag"));
    fireEvent.change(screen.getByLabelText("VLAN inner priority"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("VLAN inner priority mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VLAN inner priority count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VLAN inner priority step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("VLAN inner ID step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Ethernet destination"), { target: { value: "66:55:44:33:22:11" } });
    fireEvent.change(screen.getByLabelText("Ethernet source"), { target: { value: "10:20:30:40:50:60" } });
    fireEvent.change(screen.getByLabelText("IPv4 source"), { target: { value: "10.10.10.1" } });
    fireEvent.change(screen.getByLabelText("IPv4 destination"), { target: { value: "10.10.10.2" } });
    fireEvent.change(screen.getByLabelText("IPv4 DSCP"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("IPv4 ECN"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("IPv4 ECN mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv4 ECN count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv4 ECN step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv4 DSCP mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv4 DSCP count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv4 DSCP step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv4 identification"), { target: { value: "3210" } });
    fireEvent.change(screen.getByLabelText("IPv4 identification mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv4 identification count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv4 identification step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("IPv4 don't fragment"));
    fireEvent.click(screen.getByLabelText("IPv4 more fragments"));
    fireEvent.change(screen.getByLabelText("IPv4 fragment offset"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("IPv4 fragment offset mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv4 fragment offset count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv4 fragment offset step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv4 TTL"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("IPv4 TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv4 TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv4 TTL step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Override IPv4 checksum"));
    fireEvent.change(screen.getByLabelText("IPv4 checksum"), { target: { value: "1A2B" } });
    fireEvent.click(screen.getByLabelText("Override source port"));
    fireEvent.change(screen.getByLabelText("L4 source port"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("L4 source port mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("L4 source port count"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("L4 source port step"), { target: { value: "2" } });
    fireEvent.click(screen.getByLabelText("Override destination port"));
    fireEvent.change(screen.getByLabelText("L4 destination port"), { target: { value: "443" } });
    fireEvent.change(screen.getByLabelText("L4 destination port mode"), { target: { value: "Random" } });
    fireEvent.change(screen.getByLabelText("L4 destination port count"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("L4 destination port step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP sequence number"), { target: { value: "129018" } });
    fireEvent.change(screen.getByLabelText("TCP sequence mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP sequence count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP sequence step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP acknowledge number"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("TCP acknowledge mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP acknowledge count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP acknowledge step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP window"), { target: { value: "2048" } });
    fireEvent.change(screen.getByLabelText("TCP window mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP window count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP window step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Override TCP checksum"));
    fireEvent.change(screen.getByLabelText("TCP checksum"), { target: { value: "B3E3" } });
    fireEvent.change(screen.getByLabelText("TCP checksum mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP checksum count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP checksum step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Enable TCP MSS option"));
    fireEvent.change(screen.getByLabelText("TCP option MSS"), { target: { value: "1460" } });
    fireEvent.change(screen.getByLabelText("TCP option MSS mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option MSS count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option MSS step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Enable TCP Window Scale option"));
    fireEvent.change(screen.getByLabelText("TCP option Window Scale"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("TCP option Window Scale mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option Window Scale count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option Window Scale step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Enable TCP SACK Permitted option"));
    fireEvent.click(screen.getByLabelText("Enable TCP SACK block option"));
    fireEvent.change(screen.getByLabelText("TCP option SACK left edge"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK left edge mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK left edge count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK left edge step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK right edge"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK right edge mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK right edge count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option SACK right edge step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Enable TCP Timestamp option"));
    fireEvent.change(screen.getByLabelText("TCP option timestamp value"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp value mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp value count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp value step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp echo"), { target: { value: "654321" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp echo mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp echo count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP option timestamp echo step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("TCP urgent pointer"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("TCP urgent pointer mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP urgent pointer count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP urgent pointer step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("ACK"));
    fireEvent.click(screen.getByLabelText("SYN"));
    fireEvent.change(screen.getByLabelText("TCP flags mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("TCP flags count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("TCP flags step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Payload pattern"), { target: { value: "a1 b2" } });
    fireEvent.click(screen.getByRole("tab", { name: "Advanced Settings" }));
    fireEvent.change(screen.getByLabelText("Cache size type"), { target: { value: "Enable" } });
    fireEvent.change(screen.getByLabelText("Cache size value"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"ipv4_dst":"10.10.10.2"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port":443')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_src_port_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_src_port_count":8')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port_mode":"Random"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port_count":16')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"advanced_cache_size_type":"Enable"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"advanced_cache_value":42')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"payload_pattern":"a1 b2"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_id":123')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_priority_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_priority_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan_id_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan2_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan2_priority":3')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan2_priority_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan2_id":200')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"vlan2_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dscp":10')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dscp_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dscp_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_dscp_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ecn":3')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ecn_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ecn_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_id":3210')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_id_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_flag_df":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_flag_mf":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_fragment_offset":9')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_fragment_offset_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_fragment_offset_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_fragment_offset_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ttl":42')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ttl_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_ttl_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_checksum_override":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv4_checksum":"1A2B"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_sequence_number":129018')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_sequence_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_sequence_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_ack_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_ack_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_window_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_window_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_window_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_checksum_override":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_checksum":"B3E3"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_checksum_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_checksum_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_checksum_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_mss_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_mss":1460')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_mss_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_mss_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_window_scale_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_window_scale":7')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_window_scale_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_window_scale_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_window_scale_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_permitted_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_blocks_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_left_edge":1000')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_left_edge_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_right_edge":2000')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_sack_right_edge_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_value":123456')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_value_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_value_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_echo":654321')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_echo_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_option_timestamp_echo_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_urgent_pointer_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_urgent_pointer_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_urgent_pointer_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_flag_syn":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_flags_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_flags_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"tcp_flags_step":1')
      })
    );
    expect(screen.getByText("802.1Q VLAN")).toBeInTheDocument();
    expect(screen.getByText("priority_mode")).toBeInTheDocument();
    expect(screen.getByText("vlan_mode")).toBeInTheDocument();
    expect(screen.getAllByText("Increment").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Internet Protocol v4")).toBeInTheDocument();
    expect(screen.getByText("10.10.10.2")).toBeInTheDocument();
    expect(screen.getByText("dscp")).toBeInTheDocument();
    expect(screen.getByText("ecn")).toBeInTheDocument();
    expect(screen.getByText("ecn_mode")).toBeInTheDocument();
    expect(screen.getByText("identification")).toBeInTheDocument();
    expect(screen.getByText("fragment_offset")).toBeInTheDocument();
    expect(screen.getByText("fragment_offset_mode")).toBeInTheDocument();
    expect(screen.getByText("ttl")).toBeInTheDocument();
    expect(screen.getByText("1A2B")).toBeInTheDocument();
    expect(screen.getByText("destination_port")).toBeInTheDocument();
    expect(screen.getByText("sequence_mode")).toBeInTheDocument();
    expect(screen.getByText("acknowledge_mode")).toBeInTheDocument();
    expect(screen.getByText("window_mode")).toBeInTheDocument();
    expect(screen.getByText("checksum_mode")).toBeInTheDocument();
    expect(screen.getByText("TCP Options")).toBeInTheDocument();
    expect(screen.getByText("mss_mode")).toBeInTheDocument();
    expect(screen.getByText("window_scale")).toBeInTheDocument();
    expect(screen.getByText("timestamp_value")).toBeInTheDocument();
    expect(screen.getByText("urgent_pointer_mode")).toBeInTheDocument();
    expect(screen.getByText("flags_mode")).toBeInTheDocument();
    expect(screen.getByText("ACK,SYN")).toBeInTheDocument();
    expect(screen.getByText("A1B2")).toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const targetMap = screen.getByLabelText("Field Engine target map");
    const idTarget = within(targetMap).getByRole("button", { name: "Use IPv4 ID inc Field Engine target" });
    const dscpTarget = within(targetMap).getByRole("button", { name: "Use IPv4 DSCP inc Field Engine target" });
    const ecnTarget = within(targetMap).getByRole("button", { name: "Use IPv4 ECN inc Field Engine target" });
    const fragmentTarget = within(targetMap).getByRole("button", { name: "Use IPv4 fragment offset inc Field Engine target" });
    const reservedFlagTarget = within(targetMap).getByRole("button", { name: "Use IPv4 reserved flag vary Field Engine target" });
    const dfTarget = within(targetMap).getByRole("button", { name: "Use IPv4 DF flag vary Field Engine target" });
    const mfTarget = within(targetMap).getByRole("button", { name: "Use IPv4 MF flag vary Field Engine target" });
    const ttlTarget = within(targetMap).getByRole("button", { name: "Use IPv4 TTL inc Field Engine target" });
    const tcpSequenceTarget = within(targetMap).getByRole("button", { name: "Use TCP sequence inc Field Engine target" });
    const tcpAckTarget = within(targetMap).getByRole("button", { name: "Use TCP acknowledge inc Field Engine target" });
    const tcpWindowTarget = within(targetMap).getByRole("button", { name: "Use TCP window inc Field Engine target" });
    const tcpUrgentTarget = within(targetMap).getByRole("button", { name: "Use TCP urgent pointer inc Field Engine target" });
    const tcpFlagsTarget = within(targetMap).getByRole("button", { name: "Use TCP flags inc Field Engine target" });
    const tcpReservedBitsTarget = within(targetMap).getByRole("button", { name: "Use TCP reserved bits inc Field Engine target" });
    const tcpUrgFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP URG flag vary Field Engine target" });
    const tcpAckFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP ACK flag vary Field Engine target" });
    const tcpPshFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP PSH flag vary Field Engine target" });
    const tcpRstFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP RST flag vary Field Engine target" });
    const tcpSynFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP SYN flag vary Field Engine target" });
    const tcpFinFlagTarget = within(targetMap).getByRole("button", { name: "Use TCP FIN flag vary Field Engine target" });
    const tcpChecksumTarget = within(targetMap).getByRole("button", { name: "Use TCP checksum inc Field Engine target" });
    const tcpMssTarget = within(targetMap).getByRole("button", { name: "Use TCP MSS option inc Field Engine target" });
    const tcpWindowScaleTarget = within(targetMap).getByRole("button", { name: "Use TCP window scale option inc Field Engine target" });
    const tcpTimestampValueTarget = within(targetMap).getByRole("button", { name: "Use TCP timestamp value inc Field Engine target" });
    const tcpTimestampEchoTarget = within(targetMap).getByRole("button", { name: "Use TCP timestamp echo inc Field Engine target" });
    const tcpSackLeftTarget = within(targetMap).getByRole("button", { name: "Use TCP SACK left edge inc Field Engine target" });
    const tcpSackRightTarget = within(targetMap).getByRole("button", { name: "Use TCP SACK right edge inc Field Engine target" });
    expect(idTarget).not.toBeDisabled();
    expect(dscpTarget).not.toBeDisabled();
    expect(ecnTarget).not.toBeDisabled();
    expect(fragmentTarget).not.toBeDisabled();
    expect(reservedFlagTarget).not.toBeDisabled();
    expect(dfTarget).not.toBeDisabled();
    expect(mfTarget).not.toBeDisabled();
    expect(ttlTarget).not.toBeDisabled();
    expect(tcpSequenceTarget).not.toBeDisabled();
    expect(tcpAckTarget).not.toBeDisabled();
    expect(tcpWindowTarget).not.toBeDisabled();
    expect(tcpUrgentTarget).not.toBeDisabled();
    expect(tcpFlagsTarget).not.toBeDisabled();
    expect(tcpReservedBitsTarget).not.toBeDisabled();
    expect(tcpUrgFlagTarget).not.toBeDisabled();
    expect(tcpAckFlagTarget).not.toBeDisabled();
    expect(tcpPshFlagTarget).not.toBeDisabled();
    expect(tcpRstFlagTarget).not.toBeDisabled();
    expect(tcpSynFlagTarget).not.toBeDisabled();
    expect(tcpFinFlagTarget).not.toBeDisabled();
    expect(tcpChecksumTarget).not.toBeDisabled();
    expect(tcpMssTarget).not.toBeDisabled();
    expect(tcpWindowScaleTarget).not.toBeDisabled();
    expect(tcpTimestampValueTarget).not.toBeDisabled();
    expect(tcpTimestampEchoTarget).not.toBeDisabled();
    expect(tcpSackLeftTarget).not.toBeDisabled();
    expect(tcpSackRightTarget).not.toBeDisabled();

    const advancedVmInput = () => screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement;

    fireEvent.click(idTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_id"');
    expect(advancedVmInput().value).toContain('"init_value": 3210');
    expect(advancedVmInput().value).toContain('"pkt_offset": 26');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');
    expect(advancedVmInput().value).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(dscpTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_dscp"');
    expect(advancedVmInput().value).toContain('"init_value": 10');
    expect(advancedVmInput().value).toContain('"mask": 252');
    expect(advancedVmInput().value).toContain('"pkt_offset": 23');
    expect(advancedVmInput().value).toContain('"shift": 2');

    fireEvent.click(ecnTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_ecn"');
    expect(advancedVmInput().value).toContain('"init_value": 3');
    expect(advancedVmInput().value).toContain('"mask": 3');
    expect(advancedVmInput().value).toContain('"pkt_offset": 23');
    expect(advancedVmInput().value).toContain('"shift": 0');

    fireEvent.click(fragmentTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_fragment_offset"');
    expect(advancedVmInput().value).toContain('"init_value": 9');
    expect(advancedVmInput().value).toContain('"mask": 8191');
    expect(advancedVmInput().value).toContain('"pkt_offset": 28');

    fireEvent.click(reservedFlagTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_reserved"');
    expect(advancedVmInput().value).toContain('"init_value": 0');
    expect(advancedVmInput().value).toContain('"op": "inc"');
    expect(advancedVmInput().value).toContain('"mask": 32768');
    expect(advancedVmInput().value).toContain('"pkt_offset": 28');
    expect(advancedVmInput().value).toContain('"shift": 15');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(dfTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_df"');
    expect(advancedVmInput().value).toContain('"init_value": 1');
    expect(advancedVmInput().value).toContain('"op": "dec"');
    expect(advancedVmInput().value).toContain('"mask": 16384');
    expect(advancedVmInput().value).toContain('"pkt_offset": 28');
    expect(advancedVmInput().value).toContain('"shift": 14');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(mfTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_mf"');
    expect(advancedVmInput().value).toContain('"init_value": 1');
    expect(advancedVmInput().value).toContain('"op": "dec"');
    expect(advancedVmInput().value).toContain('"mask": 8192');
    expect(advancedVmInput().value).toContain('"pkt_offset": 28');
    expect(advancedVmInput().value).toContain('"shift": 13');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(ttlTarget);
    expect(advancedVmInput().value).toContain('"name": "ip_ttl"');
    expect(advancedVmInput().value).toContain('"init_value": 42');
    expect(advancedVmInput().value).toContain('"pkt_offset": 30');
    expect(advancedVmInput().value).toContain('"type": "write_flow_var"');

    fireEvent.click(tcpSequenceTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_sequence"');
    expect(advancedVmInput().value).toContain('"init_value": 129018');
    expect(advancedVmInput().value).toContain('"pkt_offset": 46');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(tcpAckTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_ack"');
    expect(advancedVmInput().value).toContain('"init_value": 42');
    expect(advancedVmInput().value).toContain('"pkt_offset": 50');
    expect(advancedVmInput().value).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(tcpWindowTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_window"');
    expect(advancedVmInput().value).toContain('"init_value": 2048');
    expect(advancedVmInput().value).toContain('"pkt_offset": 56');

    fireEvent.click(tcpUrgentTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_urgent_pointer"');
    expect(advancedVmInput().value).toContain('"init_value": 7');
    expect(advancedVmInput().value).toContain('"pkt_offset": 60');

    fireEvent.click(tcpFlagsTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_flags"');
    expect(advancedVmInput().value).toContain('"init_value": 18');
    expect(advancedVmInput().value).toContain('"mask": 63');
    expect(advancedVmInput().value).toContain('"pkt_offset": 55');

    fireEvent.click(tcpReservedBitsTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_reserved_bits"');
    expect(advancedVmInput().value).toContain('"init_value": 0');
    expect(advancedVmInput().value).toContain('"mask": 15');
    expect(advancedVmInput().value).toContain('"pkt_offset": 54');
    expect(advancedVmInput().value).toContain('"shift": 0');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(tcpSynFlagTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_flag_syn"');
    expect(advancedVmInput().value).toContain('"init_value": 1');
    expect(advancedVmInput().value).toContain('"op": "dec"');
    expect(advancedVmInput().value).toContain('"mask": 2');
    expect(advancedVmInput().value).toContain('"pkt_offset": 55');
    expect(advancedVmInput().value).toContain('"shift": 1');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(tcpFinFlagTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_flag_fin"');
    expect(advancedVmInput().value).toContain('"init_value": 0');
    expect(advancedVmInput().value).toContain('"op": "inc"');
    expect(advancedVmInput().value).toContain('"mask": 1');
    expect(advancedVmInput().value).toContain('"pkt_offset": 55');
    expect(advancedVmInput().value).toContain('"shift": 0');
    expect(advancedVmInput().value).toContain('"l2_len": 22');
    expect(advancedVmInput().value).toContain('"l4_type": 13');

    fireEvent.click(tcpChecksumTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_checksum"');
    expect(advancedVmInput().value).toContain('"init_value": 46051');
    expect(advancedVmInput().value).toContain('"pkt_offset": 58');
    expect(advancedVmInput().value).not.toContain('"type": "fix_checksum_hw"');

    fireEvent.click(tcpMssTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_mss"');
    expect(advancedVmInput().value).toContain('"init_value": 1460');
    expect(advancedVmInput().value).toContain('"pkt_offset": 64');
    expect(advancedVmInput().value).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(tcpSackLeftTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_sack_left_edge"');
    expect(advancedVmInput().value).toContain('"init_value": 1000');
    expect(advancedVmInput().value).toContain('"pkt_offset": 70');

    fireEvent.click(tcpSackRightTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_sack_right_edge"');
    expect(advancedVmInput().value).toContain('"init_value": 2000');
    expect(advancedVmInput().value).toContain('"pkt_offset": 74');

    fireEvent.click(tcpTimestampValueTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_timestamp_value"');
    expect(advancedVmInput().value).toContain('"init_value": 123456');
    expect(advancedVmInput().value).toContain('"pkt_offset": 82');

    fireEvent.click(tcpTimestampEchoTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_timestamp_echo"');
    expect(advancedVmInput().value).toContain('"init_value": 654321');
    expect(advancedVmInput().value).toContain('"pkt_offset": 86');

    fireEvent.click(tcpWindowScaleTarget);
    expect(advancedVmInput().value).toContain('"name": "tcp_option_window_scale"');
    expect(advancedVmInput().value).toContain('"init_value": 7');
    expect(advancedVmInput().value).toContain('"pkt_offset": 93');
  }, 75_000);

  it("renders IPv6 stream protocol data through the backend packet preview", async () => {
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
                packet_type: "Ethernet/IPv6/UDP",
                frame_length: 128,
                wire_length: 128,
                binary_base64: "Zg==",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  {
                    name: "Ethernet",
                    fields: {
                      destination: "66:55:44:33:22:11",
                      source: "10:20:30:40:50:60",
                      type: "0x86dd"
                    }
                  },
                  {
                    name: "Internet Protocol v6",
                    fields: {
                      source: "2001:db8:1::12f8",
                      destination: "2001:db8:2::ffff",
                      traffic_class: 171,
                      traffic_class_mode: "Increment",
                      traffic_class_count: 4,
                      traffic_class_step: 1,
                      flow_label: 703710,
                      flow_label_mode: "Increment",
                      flow_label_count: 4,
                      flow_label_step: 1,
                      hop_limit: 42,
                      hop_limit_mode: "Increment",
                      hop_limit_count: 4,
                      hop_limit_step: 1,
                      protocol: "UDP"
                    }
                  },
                  {
                    name: "UDP",
                    fields: {
                      source_port: 12345,
                      destination_port: 5000,
                      length: 64,
                      length_mode: "Increment",
                      length_count: 4,
                      length_step: 1,
                      checksum: "BEEF",
                      checksum_override: true,
                      checksum_mode: "Increment",
                      checksum_count: 4,
                      checksum_step: 1
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
    fireEvent.click(screen.getByLabelText("IPv6"));
    fireEvent.change(screen.getByLabelText("Frame length"), { target: { value: "128" } });
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("Ethernet destination"), { target: { value: "66:55:44:33:22:11" } });
    fireEvent.change(screen.getByLabelText("Ethernet source"), { target: { value: "10:20:30:40:50:60" } });
    fireEvent.change(screen.getByLabelText("IPv6 source"), { target: { value: "2001:db8:1::12f8" } });
    fireEvent.change(screen.getByLabelText("IPv6 destination"), { target: { value: "2001:db8:2::ffff" } });
    fireEvent.change(screen.getByLabelText("IPv6 traffic class"), { target: { value: "171" } });
    fireEvent.change(screen.getByLabelText("IPv6 traffic class mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv6 traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv6 traffic class step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv6 flow label"), { target: { value: "703710" } });
    fireEvent.change(screen.getByLabelText("IPv6 flow label mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv6 flow label count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv6 flow label step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv6 hop limit"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("IPv6 hop limit mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("IPv6 hop limit count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("IPv6 hop limit step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Override source port"));
    fireEvent.change(screen.getByLabelText("L4 source port"), { target: { value: "12345" } });
    fireEvent.click(screen.getByLabelText("Override destination port"));
    fireEvent.change(screen.getByLabelText("L4 destination port"), { target: { value: "5000" } });
    fireEvent.click(screen.getByLabelText("Override UDP length"));
    fireEvent.change(screen.getByLabelText("UDP length"), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText("UDP length mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("UDP length count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("UDP length step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Override UDP checksum"));
    fireEvent.change(screen.getByLabelText("UDP checksum"), { target: { value: "BEEF" } });
    fireEvent.change(screen.getByLabelText("UDP checksum mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("UDP checksum count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("UDP checksum step"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv6/UDP"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_src":"2001:db8:1::12f8"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_dst":"2001:db8:2::ffff"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_traffic_class":171')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_traffic_class_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_traffic_class_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_traffic_class_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_flow_label":703710')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_flow_label_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_flow_label_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_hop_limit":42')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_hop_limit_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_hop_limit_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"ipv6_hop_limit_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_length_override":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_length":64')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_length_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_length_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_length_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_checksum_override":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_checksum":"BEEF"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_checksum_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_checksum_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"udp_checksum_step":1')
      })
    );
    expect(screen.getByText("Internet Protocol v6")).toBeInTheDocument();
    expect(screen.getByText("traffic_class")).toBeInTheDocument();
    expect(screen.getByText("flow_label")).toBeInTheDocument();
    expect(screen.getByText("hop_limit")).toBeInTheDocument();
    expect(screen.getByText("length_mode")).toBeInTheDocument();
    expect(screen.getByText("checksum_mode")).toBeInTheDocument();
    expect(screen.getAllByText("Increment").length).toBeGreaterThan(0);
    expect(screen.getByText("BEEF")).toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const targetMap = screen.getByLabelText("Field Engine target map");
    const ipv6SrcTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 src inc Field Engine target"
    });
    const ipv6DstTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 dst inc Field Engine target"
    });
    const trafficClassTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 traffic class inc Field Engine target"
    });
    const flowLabelTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 flow label inc Field Engine target"
    });
    const hopLimitTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 hop limit inc Field Engine target"
    });
    const udpSrcTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 UDP src port inc Field Engine target"
    });
    const udpDstTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 UDP dst port inc Field Engine target"
    });
    const udpLengthTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 UDP length inc Field Engine target"
    });
    const udpChecksumTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 UDP checksum inc Field Engine target"
    });
    const udpFiveTupleTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 UDP 5-tuple inc Field Engine target"
    });
    const tcpSrcTarget = within(targetMap).getByRole("button", {
      name: "Use IPv6 TCP src port inc Field Engine target"
    });
    expect(ipv6SrcTarget).not.toBeDisabled();
    expect(ipv6DstTarget).not.toBeDisabled();
    expect(trafficClassTarget).not.toBeDisabled();
    expect(flowLabelTarget).not.toBeDisabled();
    expect(hopLimitTarget).not.toBeDisabled();
    expect(udpSrcTarget).not.toBeDisabled();
    expect(udpDstTarget).not.toBeDisabled();
    expect(udpLengthTarget).not.toBeDisabled();
    expect(udpChecksumTarget).not.toBeDisabled();
    expect(udpFiveTupleTarget).not.toBeDisabled();
    expect(tcpSrcTarget).toBeDisabled();

    fireEvent.click(ipv6SrcTarget);
    let advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_src"');
    expect(advancedVmJson).toContain('"init_value": 4856');
    expect(advancedVmJson).toContain('"max_value": 4871');
    expect(advancedVmJson).toContain('"size": 2');
    expect(advancedVmJson).toContain('"pkt_offset": 36');
    expect(advancedVmJson).toContain('"type": "write_flow_var"');

    fireEvent.click(ipv6DstTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_dest"');
    expect(advancedVmJson).toContain('"init_value": 65535');
    expect(advancedVmJson).toContain('"max_value": 65550');
    expect(advancedVmJson).toContain('"size": 4');
    expect(advancedVmJson).toContain('"pkt_offset": 50');
    expect(advancedVmJson).toContain('"type": "write_flow_var"');

    fireEvent.click(trafficClassTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_traffic_class"');
    expect(advancedVmJson).toContain('"init_value": 171');
    expect(advancedVmJson).toContain('"mask": 267386880');
    expect(advancedVmJson).toContain('"pkt_offset": 14');
    expect(advancedVmJson).toContain('"shift": 20');

    fireEvent.click(flowLabelTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_flow_label"');
    expect(advancedVmJson).toContain('"init_value": 703710');
    expect(advancedVmJson).toContain('"mask": 1048575');
    expect(advancedVmJson).toContain('"pkt_offset": 14');
    expect(advancedVmJson).toContain('"shift": 0');

    fireEvent.click(hopLimitTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_hop_limit"');
    expect(advancedVmJson).toContain('"init_value": 42');
    expect(advancedVmJson).toContain('"pkt_offset": 21');
    expect(advancedVmJson).toContain('"type": "write_flow_var"');

    fireEvent.click(udpSrcTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "l4_src_port"');
    expect(advancedVmJson).toContain('"init_value": 12345');
    expect(advancedVmJson).toContain('"pkt_offset": 54');
    expect(advancedVmJson).toContain('"l2_len": 14');
    expect(advancedVmJson).toContain('"l3_len": 40');
    expect(advancedVmJson).toContain('"l4_type": 11');
    expect(advancedVmJson).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(udpLengthTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "udp_length"');
    expect(advancedVmJson).toContain('"init_value": 64');
    expect(advancedVmJson).toContain('"pkt_offset": 58');
    expect(advancedVmJson).toContain('"l2_len": 14');
    expect(advancedVmJson).toContain('"l3_len": 40');
    expect(advancedVmJson).toContain('"l4_type": 11');
    expect(advancedVmJson).toContain('"type": "fix_checksum_hw"');

    fireEvent.click(udpChecksumTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "udp_checksum"');
    expect(advancedVmJson).toContain('"init_value": 48879');
    expect(advancedVmJson).toContain('"pkt_offset": 60');
    expect(advancedVmJson).not.toContain('"type": "fix_checksum_hw"');

    fireEvent.click(udpFiveTupleTarget);
    advancedVmJson = (screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value;
    expect(advancedVmJson).toContain('"name": "ipv6_src"');
    expect(advancedVmJson).toContain('"name": "ipv6_dest"');
    expect(advancedVmJson).toContain('"name": "l4_src_port"');
    expect(advancedVmJson).toContain('"name": "l4_dest_port"');
    expect(advancedVmJson).toContain('"init_value": 5000');
    expect(advancedVmJson).toContain('"pkt_offset": 36');
    expect(advancedVmJson).toContain('"pkt_offset": 50');
    expect(advancedVmJson).toContain('"pkt_offset": 54');
    expect(advancedVmJson).toContain('"pkt_offset": 56');
    expect(advancedVmJson).toContain('"l4_type": 11');
  }, 30000);

  it("renders SCTP protocol data and TSN Field Engine controls in the Stream Builder", async () => {
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
                binary_base64: "qrvM3e7/ABEiM0RV//8=",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  {
                    name: "Ethernet",
                    fields: { destination: "66:55:44:33:22:11", source: "10:20:30:40:50:60", type: "0x0800" }
                  },
                  {
                    name: "Internet Protocol v4",
                    fields: { source: "10.10.10.1", destination: "10.10.10.2", protocol: "SCTP" }
                  },
                  {
                    name: "SCTP",
                    fields: {
                      source_port: 2905,
                      destination_port: 2906,
                      verification_tag: 270544960,
                      verification_tag_mode: "Increment",
                      verification_tag_count: 4,
                      verification_tag_step: 1,
                      checksum: "00000000",
                      checksum_override: true,
                      data_flags: 3,
                      data_flags_mode: "Increment",
                      data_flags_count: 4,
                      data_flags_step: 1,
                      tsn: 100,
                      tsn_mode: "Increment",
                      tsn_count: 4,
                      tsn_step: 1,
                      stream_id: 7,
                      stream_id_mode: "Increment",
                      stream_id_count: 4,
                      stream_id_step: 1,
                      stream_sequence: 9,
                      stream_sequence_mode: "Increment",
                      stream_sequence_count: 4,
                      stream_sequence_step: 1,
                      payload_protocol_id: 287454020,
                      payload_protocol_id_mode: "Increment",
                      payload_protocol_id_count: 4,
                      payload_protocol_id_step: 1
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
    fireEvent.click(screen.getByLabelText("SCTP"));
    fireEvent.change(screen.getByLabelText("Frame length"), { target: { value: "96" } });
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    expect(screen.getByText("Stream Control Transmission Protocol")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Override source port"));
    fireEvent.change(screen.getByLabelText("L4 source port"), { target: { value: "2905" } });
    fireEvent.click(screen.getByLabelText("Override destination port"));
    fireEvent.change(screen.getByLabelText("L4 destination port"), { target: { value: "2906" } });
    fireEvent.change(screen.getByLabelText("SCTP verification tag"), { target: { value: "270544960" } });
    fireEvent.change(screen.getByLabelText("SCTP verification tag mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP verification tag count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP verification tag step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("SCTP data flags"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("SCTP data flags mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP data flags count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP data flags step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("SCTP TSN"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("SCTP TSN mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP TSN count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP TSN step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("SCTP stream ID"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("SCTP stream ID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP stream ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP stream ID step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("SCTP stream sequence"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("SCTP stream sequence mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP stream sequence count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP stream sequence step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("SCTP payload protocol ID"), { target: { value: "287454020" } });
    fireEvent.change(screen.getByLabelText("SCTP payload protocol ID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("SCTP payload protocol ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("SCTP payload protocol ID step"), { target: { value: "1" } });
    expect(screen.getByLabelText("Override SCTP checksum")).toBeChecked();
    expect(screen.getByLabelText("SCTP checksum")).toHaveValue("00000000");
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv4/SCTP"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_verification_tag_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_data_flags_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_tsn_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_stream_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_stream_sequence_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_payload_protocol_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"sctp_checksum_override":true')
      })
    );
    expect(screen.getAllByText("SCTP").length).toBeGreaterThan(0);
    expect(screen.getByText("verification_tag_mode")).toBeInTheDocument();
    expect(screen.getByText("data_flags_mode")).toBeInTheDocument();
    expect(screen.getByText("tsn_mode")).toBeInTheDocument();
    expect(screen.getByText("stream_id_mode")).toBeInTheDocument();
    expect(screen.getByText("stream_sequence_mode")).toBeInTheDocument();
    expect(screen.getByText("payload_protocol_id_mode")).toBeInTheDocument();
    expect(screen.getAllByText("Increment").length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const sctpTargetMap = screen.getByLabelText("Field Engine target map");
    const selectSctpTarget = (name: string) => {
      fireEvent.click(within(sctpTargetMap).getByRole("button", { name }));
      return JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value);
    };

    let selectedTarget = selectSctpTarget("Use SCTP src port inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_source_port", init_value: 2905, size: 2 }),
        expect.objectContaining({ name: "sctp_source_port", type: "write_flow_var", pkt_offset: 34 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_ipv4" })])
    );

    selectedTarget = selectSctpTarget("Use SCTP dst port inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_destination_port", init_value: 2906, size: 2 }),
        expect.objectContaining({ name: "sctp_destination_port", type: "write_flow_var", pkt_offset: 36 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );

    selectedTarget = selectSctpTarget("Use SCTP verification tag inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_verification_tag", init_value: 270544960, max_value: 270544963, size: 4 }),
        expect.objectContaining({ name: "sctp_verification_tag", type: "write_flow_var", pkt_offset: 38 })
      ])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_hw" })])
    );
    expect(selectedTarget.instructions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "fix_checksum_ipv4" })])
    );

    selectedTarget = selectSctpTarget("Use SCTP DATA flags inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_flags", init_value: 3, max_value: 6, size: 1 }),
        expect.objectContaining({ name: "sctp_data_flags", type: "write_flow_var", pkt_offset: 47 })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP DATA reserved flags inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_reserved_flags", init_value: 0, max_value: 3, size: 1 }),
        expect.objectContaining({
          mask: 0xf0,
          name: "sctp_data_reserved_flags",
          pkt_offset: 47,
          shift: 4,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP DATA Unordered flag vary Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_data_unordered", init_value: 0, max_value: 1, op: "inc" }),
        expect.objectContaining({
          mask: 0x04,
          name: "sctp_data_unordered",
          pkt_offset: 47,
          shift: 2,
          type: "write_mask_flow_var"
        })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP TSN inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_tsn", init_value: 100, max_value: 103, size: 4 }),
        expect.objectContaining({ name: "sctp_tsn", type: "write_flow_var", pkt_offset: 50 })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP stream ID inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_stream_id", init_value: 7, max_value: 10, size: 2 }),
        expect.objectContaining({ name: "sctp_stream_id", type: "write_flow_var", pkt_offset: 54 })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP stream sequence inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_stream_sequence", init_value: 9, max_value: 12, size: 2 }),
        expect.objectContaining({ name: "sctp_stream_sequence", type: "write_flow_var", pkt_offset: 56 })
      ])
    );

    selectedTarget = selectSctpTarget("Use SCTP payload protocol ID inc Field Engine target");
    expect(selectedTarget.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sctp_payload_protocol_id", init_value: 287454020, max_value: 287454023, size: 4 }),
        expect.objectContaining({ name: "sctp_payload_protocol_id", type: "write_flow_var", pkt_offset: 58 })
      ])
    );
  }, 30_000);

  it("keeps SCTP selectable on IPv6 streams and renders through the backend preview", async () => {
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
                packet_type: "Ethernet/IPv6/SCTP",
                frame_length: 128,
                wire_length: 128,
                binary_base64: "",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  {
                    name: "Ethernet",
                    fields: { destination: "66:55:44:33:22:11", source: "10:20:30:40:50:60", type: "0x86dd" }
                  },
                  {
                    name: "Internet Protocol v6",
                    fields: { source: "2001:db8::1", destination: "2001:db8::2", next_header: "SCTP" }
                  },
                  {
                    name: "SCTP",
                    fields: {
                      source_port: 1025,
                      destination_port: 1025,
                      verification_tag: 305419896,
                      checksum: "auto",
                      checksum_override: false,
                      tsn: 1,
                      tsn_mode: "Fixed"
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
    fireEvent.click(screen.getByLabelText("IPv6"));
    fireEvent.click(screen.getByLabelText("SCTP"));
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv6/SCTP"')
        })
      )
    );
    expect(screen.getByText("Internet Protocol v6")).toBeInTheDocument();
    expect(screen.getAllByText("SCTP").length).toBeGreaterThan(0);
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();
  });

  it("renders IPv6 streams without an L4 protocol through the backend packet preview", async () => {
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
                packet_type: "Ethernet/IPv6",
                frame_length: 96,
                wire_length: 96,
                binary_base64: "",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "66 55 44 33 22 11", ascii: "fUD3.." }],
                layers: [
                  {
                    name: "Ethernet",
                    fields: {
                      destination: "66:55:44:33:22:11",
                      source: "10:20:30:40:50:60",
                      type: "0x86dd"
                    }
                  },
                  {
                    name: "Internet Protocol v6",
                    fields: {
                      source: "2001:db8:1::10",
                      destination: "2001:db8:2::20",
                      hop_limit: 127,
                      protocol: "None"
                    }
                  },
                  {
                    name: "Payload",
                    fields: {
                      bytes: 38,
                      pattern: "A1B2"
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
    fireEvent.click(screen.getByLabelText("IPv6"));
    fireEvent.click(within(screen.getByRole("group", { name: "L4" })).getByLabelText("None"));
    fireEvent.change(screen.getByLabelText("Frame length"), { target: { value: "96" } });
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("Ethernet destination"), { target: { value: "66:55:44:33:22:11" } });
    fireEvent.change(screen.getByLabelText("Ethernet source"), { target: { value: "10:20:30:40:50:60" } });
    fireEvent.change(screen.getByLabelText("IPv6 source"), { target: { value: "2001:db8:1::10" } });
    fireEvent.change(screen.getByLabelText("IPv6 destination"), { target: { value: "2001:db8:2::20" } });
    expect(screen.queryByLabelText("Override source port")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"packet_type":"Ethernet/IPv6"')
        })
      )
    );
    expect(screen.getByText("Internet Protocol v6")).toBeInTheDocument();
    expect(screen.getAllByText("Payload").length).toBeGreaterThan(0);
    expect(screen.queryByText("UDP")).not.toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();
  });

  it("renders MPLS stream protocol data through the backend packet preview", async () => {
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
                      type: "0x8847"
                    }
                  },
                  {
                    name: "MPLS",
                    fields: {
                      label: 1024,
                      traffic_class: 5,
                      traffic_class_mode: "Increment",
                      traffic_class_count: 4,
                      traffic_class_step: 1,
                      bottom_of_stack: 0,
                      ttl: 42,
                      ttl_mode: "Increment",
                      ttl_count: 4,
                      ttl_step: 1,
                      payload: "MPLS"
                    }
                  },
                  {
                    name: "MPLS",
                    fields: {
                      label: 2048,
                      traffic_class: 4,
                      bottom_of_stack: 0,
                      ttl: 41,
                      payload: "MPLS"
                    }
                  },
                  {
                    name: "MPLS",
                    fields: {
                      label: 4096,
                      traffic_class: 3,
                      bottom_of_stack: 1,
                      ttl: 40,
                      payload: "IPv4"
                    }
                  },
                  {
                    name: "Internet Protocol v4",
                    fields: {
                      source: "10.10.10.1",
                      destination: "10.10.10.2",
                      ttl: 127,
                      protocol: "UDP"
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
    fireEvent.click(screen.getByLabelText("MPLS"));
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.change(screen.getByLabelText("MPLS label"), { target: { value: "1024" } });
    fireEvent.change(screen.getByLabelText("MPLS label mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("MPLS label count"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("MPLS label step"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("MPLS traffic class step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("MPLS TTL step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Second MPLS label enabled"));
    fireEvent.change(screen.getByLabelText("Second MPLS label"), { target: { value: "2048" } });
    fireEvent.change(screen.getByLabelText("Second MPLS label mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Second MPLS label count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS label step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS traffic class step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Second MPLS TTL step"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Third MPLS label enabled"));
    fireEvent.change(screen.getByLabelText("Third MPLS label"), { target: { value: "4096" } });
    fireEvent.change(screen.getByLabelText("Third MPLS label mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Third MPLS label count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Third MPLS label step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Third MPLS traffic class step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Third MPLS TTL step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("IPv4 source"), { target: { value: "10.10.10.1" } });
    fireEvent.change(screen.getByLabelText("IPv4 destination"), { target: { value: "10.10.10.2" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"mpls_enabled":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label":1024')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label_count":2000')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label_step":2')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_tc":5')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_tc_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_tc_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_tc_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_ttl":42')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_ttl_count":4')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_ttl_step":1')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label2_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label2":2048')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label2_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label2_tc_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label2_ttl_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label3_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label3":4096')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label3_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label3_tc_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"mpls_label3_ttl_mode":"Increment"')
      })
    );
    expect(screen.getAllByText("MPLS").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("traffic_class").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("1024")).toBeInTheDocument();
    expect(screen.getByText("2048")).toBeInTheDocument();
    expect(screen.getByText("4096")).toBeInTheDocument();
    expect(screen.queryByText(/binary_base64/)).not.toBeInTheDocument();
  }, 60_000);
});
