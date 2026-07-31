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
  profileCatalogWithJson,
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

describe("Traffic Profiles / Profile Operations", () => {
  installAppTestHooks();

  it("renders DNS query protocol data through the backend packet preview", async () => {
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
                frame_length: 75,
                wire_length: 75,
                binary_base64: "qrvM3e7/ABEiM0RV//8=",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
                layers: [
                  { name: "Ethernet", fields: { destination: "00:00:00:00:00:00", source: "00:00:00:00:00:00", type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 1025, destination_port: 53, length: 37, checksum: "auto" } },
                  {
                    name: "Domain Name System",
                    fields: {
                      transaction_id: 4660,
                      transaction_id_mode: "Increment",
                      transaction_id_count: 4,
                      transaction_id_step: 1,
                      flags: "0x0100",
                      questions: 1,
                      answers: 1,
                      query_name: "example.com",
                      query_type: 1,
                      query_class: 1,
                      answer_ttl: 60,
                      answer_ttl_mode: "Increment",
                      answer_ipv4: "192.0.2.10",
                      answer_ipv4_mode: "Increment Host"
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
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    fireEvent.click(screen.getByLabelText("Enable DNS query"));
    fireEvent.change(screen.getByLabelText("DNS transaction ID mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("DNS transaction ID count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("DNS query name"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByLabelText("Enable DNS answer"));
    fireEvent.change(screen.getByLabelText("DNS answer TTL mode"), { target: { value: "Increment" } });
    fireEvent.change(screen.getByLabelText("DNS answer TTL count"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("DNS answer IPv4"), { target: { value: "192.0.2.10" } });
    fireEvent.change(screen.getByLabelText("DNS answer IPv4 mode"), { target: { value: "Increment Host" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"dns_enabled":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port":53')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dns_transaction_id_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dns_query_name":"example.com"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dns_answer_enabled":true')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dns_answer_ipv4":"192.0.2.10"')
      })
    );
    expect(screen.getByText("Domain Name System")).toBeInTheDocument();
    expect(screen.getByText("query_name")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("answer_ipv4")).toBeInTheDocument();
    expect(screen.getByText("192.0.2.10")).toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const dnsTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(dnsTargetMap).getByText("DNS transaction ID inc")).toBeInTheDocument();
    expect(within(dnsTargetMap).getByText("DNS answer IPv4 inc")).toBeInTheDocument();

    const dnsTransactionIdVm = useFieldEngineTarget("DNS transaction ID inc");
    expect(dnsTransactionIdVm).toMatchObject({ split_by_var: "dns_transaction_id" });
    expect(dnsTransactionIdVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          init_value: 4660,
          max_value: 4663,
          min_value: 4660,
          name: "dns_transaction_id",
          size: 2,
          step: 1,
          type: "flow_var"
        }),
        expect.objectContaining({ name: "dns_transaction_id", pkt_offset: 42, type: "write_flow_var" }),
        expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
      ])
    );

    const dnsFlagsVm = useFieldEngineTarget("DNS flags inc");
    expect(dnsFlagsVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 33152, name: "dns_flags", type: "flow_var" }),
        expect.objectContaining({ name: "dns_flags", pkt_offset: 44, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dnsQueryTypeVm = useFieldEngineTarget("DNS query type inc");
    expect(dnsQueryTypeVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "dns_query_type", pkt_offset: 67, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dnsQueryClassVm = useFieldEngineTarget("DNS query class inc");
    expect(dnsQueryClassVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "dns_query_class", pkt_offset: 69, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dnsAnswerTtlVm = useFieldEngineTarget("DNS answer TTL inc");
    expect(dnsAnswerTtlVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 60, max_value: 63, name: "dns_answer_ttl", size: 4, type: "flow_var" }),
        expect.objectContaining({ name: "dns_answer_ttl", pkt_offset: 77, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dnsAnswerIpv4Vm = useFieldEngineTarget("DNS answer IPv4 inc");
    expect(dnsAnswerIpv4Vm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 10, max_value: 25, name: "dns_answer_ipv4", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dns_answer_ipv4", pkt_offset: 86, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );
  }, 30_000);

  it("renders DHCP protocol data through the backend packet preview", async () => {
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
                frame_length: 346,
                wire_length: 346,
                binary_base64: "qrvM3e7/ABEiM0RV//8=",
                hex: "",
                hex_lines: [{ offset: "0000", hex: "00 00", ascii: ".." }],
                layers: [
                  { name: "Ethernet", fields: { destination: "00:00:00:00:00:00", source: "00:00:00:00:00:00", type: "0x0800" } },
                  { name: "Internet Protocol v4", fields: { source: "16.0.0.1", destination: "48.0.0.1", protocol: "UDP" } },
                  { name: "UDP", fields: { source_port: 68, destination_port: 67, length: 308, checksum: "auto" } },
                  {
                    name: "Dynamic Host Configuration Protocol",
                    fields: {
                      operation: 1,
                      operation_mode: "Increment",
                      operation_count: 2,
                      operation_step: 1,
                      hops: 1,
                      hops_mode: "Increment",
                      hops_count: 4,
                      hops_step: 1,
                      seconds: 10,
                      seconds_mode: "Increment",
                      seconds_count: 4,
                      seconds_step: 10,
                      message_type: 1,
                      xid: 956560166,
                      xid_mode: "Increment",
                      xid_count: 4,
                      xid_step: 1,
                      flags: "0x8000",
                      client_ip: "10.10.0.10",
                      client_ip_mode: "Increment Host",
                      client_ip_count: 4,
                      client_ip_step: 1,
                      your_ip: "10.10.0.20",
                      your_ip_mode: "Increment Host",
                      your_ip_count: 4,
                      your_ip_step: 1,
                      server_ip: "10.10.0.30",
                      server_ip_mode: "Increment Host",
                      server_ip_count: 4,
                      server_ip_step: 1,
                      relay_ip: "10.10.0.40",
                      relay_ip_mode: "Increment Host",
                      relay_ip_count: 4,
                      relay_ip_step: 1,
                      client_mac: "00:11:22:33:44:55",
                      hostname: "trex-webui",
                      requested_ip: "10.0.0.10",
                      requested_ip_mode: "Increment Host",
                      requested_ip_count: 4,
                      requested_ip_step: 1,
                      server_id: "10.0.0.1",
                      server_id_mode: "Increment Host",
                      server_id_count: 4,
                      server_id_step: 1,
                      parameter_request_list: "1,3,6,15",
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
    fireEvent.click(screen.getByRole("tab", { name: "Protocol Data" }));
    const protocolDataPanel = screen.getByRole("tabpanel", { name: "Protocol Data" });
    const dhcpMessageToggle = within(protocolDataPanel).getByLabelText("Enable DHCP message");
    const transportProtocolForm = dhcpMessageToggle.closest<HTMLElement>(".protocol-data-form");
    expect(transportProtocolForm).not.toBeNull();
    const dhcpControls = within(transportProtocolForm as HTMLElement);
    fireEvent.click(dhcpMessageToggle);
    fireEvent.change(dhcpControls.getByLabelText("DHCP operation mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP operation count"), { target: { value: "2" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP hops"), { target: { value: "1" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP hops mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP hops count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP seconds"), { target: { value: "10" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP seconds mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP seconds count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP seconds step"), { target: { value: "10" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP message type mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP message type count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP XID mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP XID count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP flags"), { target: { value: "0000" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP flags mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP flags count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client IP"), { target: { value: "10.10.0.10" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client IP count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP your IP"), { target: { value: "10.10.0.20" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP your IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP your IP count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server IP"), { target: { value: "10.10.0.30" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server IP count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP relay IP"), { target: { value: "10.10.0.40" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP relay IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP relay IP count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client MAC"), { target: { value: "00:11:22:33:44:10" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client MAC mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP client MAC count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP parameter request list"), { target: { value: "1,3,6,15" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP lease time"), { target: { value: "3600" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP lease time mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP lease time count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP lease time step"), { target: { value: "60" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP renewal time"), { target: { value: "1800" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP renewal time mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP renewal time count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP renewal time step"), { target: { value: "30" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP rebinding time"), { target: { value: "3150" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP rebinding time mode"), { target: { value: "Increment" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP rebinding time count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP rebinding time step"), { target: { value: "45" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP requested IP"), { target: { value: "10.0.0.10" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP requested IP mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP requested IP count"), { target: { value: "4" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server ID"), { target: { value: "10.0.0.1" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server ID mode"), { target: { value: "Increment Host" } });
    fireEvent.change(dhcpControls.getByLabelText("DHCP server ID count"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("tab", { name: "Packet viewer" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/render",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"dhcp_enabled":true')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_src_port":68')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"l4_dst_port":67')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_operation_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_hops_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_seconds_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_message_type_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_xid_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_flags_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_client_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_your_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_server_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_relay_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_client_mac_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_parameter_request_list":"1,3,6,15"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_lease_time_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_lease_time_step":60')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_renewal_time_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_rebinding_time_mode":"Increment"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_requested_ip_mode":"Increment Host"')
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        body: expect.stringContaining('"dhcp_server_id_mode":"Increment Host"')
      })
    );
    expect(screen.getByText("Dynamic Host Configuration Protocol")).toBeInTheDocument();
    expect(screen.getByText("operation")).toBeInTheDocument();
    expect(screen.getByText("hops")).toBeInTheDocument();
    expect(screen.getByText("seconds")).toBeInTheDocument();
    expect(screen.getByText("client_ip")).toBeInTheDocument();
    expect(screen.getByText("10.10.0.10")).toBeInTheDocument();
    expect(screen.getByText("client_mac")).toBeInTheDocument();
    expect(screen.getByText("00:11:22:33:44:55")).toBeInTheDocument();
    expect(screen.getByText("parameter_request_list")).toBeInTheDocument();
    expect(screen.getByText("1,3,6,15")).toBeInTheDocument();

    await switchPacketPreviewToFieldEngine();
    const dhcpTargetMap = screen.getByLabelText("Field Engine target map");
    expect(within(dhcpTargetMap).getByText("DHCP operation inc")).toBeInTheDocument();
    expect(within(dhcpTargetMap).getByText("DHCP requested IP inc")).toBeInTheDocument();
    expect(within(dhcpTargetMap).getByText("DHCP rebinding time inc")).toBeInTheDocument();

    const dhcpOperationVm = useFieldEngineTarget("DHCP operation inc");
    expect(dhcpOperationVm).toMatchObject({ split_by_var: "dhcp_operation" });
    expect(dhcpOperationVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 1, max_value: 2, name: "dhcp_operation", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_operation", pkt_offset: 42, type: "write_flow_var" }),
        expect.objectContaining({ l2_len: 14, l3_len: 20, l4_type: 11, type: "fix_checksum_hw" })
      ])
    );

    const dhcpHopsVm = useFieldEngineTarget("DHCP hops inc");
    expect(dhcpHopsVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 1, max_value: 4, name: "dhcp_hops", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_hops", pkt_offset: 45, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpSecondsVm = useFieldEngineTarget("DHCP seconds inc");
    expect(dhcpSecondsVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 10, max_value: 40, name: "dhcp_seconds", size: 2, step: 10, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_seconds", pkt_offset: 50, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpXidVm = useFieldEngineTarget("DHCP XID inc");
    expect(dhcpXidVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 956560166, max_value: 956560169, name: "dhcp_xid", size: 4, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_xid", pkt_offset: 46, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpMessageTypeVm = useFieldEngineTarget("DHCP message type inc");
    expect(dhcpMessageTypeVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 1, max_value: 4, name: "dhcp_message_type", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_message_type", pkt_offset: 284, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpFlagsVm = useFieldEngineTarget("DHCP flags inc");
    expect(dhcpFlagsVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 0, max_value: 3, name: "dhcp_flags", size: 2, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_flags", pkt_offset: 52, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpClientIpVm = useFieldEngineTarget("DHCP client IP inc");
    expect(dhcpClientIpVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 10, max_value: 13, name: "dhcp_client_ip", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_client_ip", pkt_offset: 57, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpYourIpVm = useFieldEngineTarget("DHCP your IP inc");
    expect(dhcpYourIpVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 20, max_value: 23, name: "dhcp_your_ip", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_your_ip", pkt_offset: 61, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpServerIpVm = useFieldEngineTarget("DHCP server IP inc");
    expect(dhcpServerIpVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 30, max_value: 33, name: "dhcp_server_ip", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_server_ip", pkt_offset: 65, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpRelayIpVm = useFieldEngineTarget("DHCP relay IP inc");
    expect(dhcpRelayIpVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 40, max_value: 43, name: "dhcp_relay_ip", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_relay_ip", pkt_offset: 69, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpClientMacVm = useFieldEngineTarget("DHCP client MAC inc");
    expect(dhcpClientMacVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 16, max_value: 19, name: "dhcp_client_mac", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_client_mac", pkt_offset: 75, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpRequestedIpVm = useFieldEngineTarget("DHCP requested IP inc");
    expect(dhcpRequestedIpVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 10, max_value: 13, name: "dhcp_requested_ip", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_requested_ip", pkt_offset: 308, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpServerIdVm = useFieldEngineTarget("DHCP server ID inc");
    expect(dhcpServerIdVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 1, max_value: 4, name: "dhcp_server_id", size: 1, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_server_id", pkt_offset: 314, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpLeaseTimeVm = useFieldEngineTarget("DHCP lease time inc");
    expect(dhcpLeaseTimeVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 3600, max_value: 3780, name: "dhcp_lease_time", size: 4, step: 60, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_lease_time", pkt_offset: 317, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpRenewalTimeVm = useFieldEngineTarget("DHCP renewal time inc");
    expect(dhcpRenewalTimeVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 1800, max_value: 1890, name: "dhcp_renewal_time", size: 4, step: 30, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_renewal_time", pkt_offset: 323, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );

    const dhcpRebindingTimeVm = useFieldEngineTarget("DHCP rebinding time inc");
    expect(dhcpRebindingTimeVm.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ init_value: 3150, max_value: 3285, name: "dhcp_rebinding_time", size: 4, step: 45, type: "flow_var" }),
        expect.objectContaining({ name: "dhcp_rebinding_time", pkt_offset: 329, type: "write_flow_var" }),
        expect.objectContaining({ type: "fix_checksum_hw" })
      ])
    );
  }, 40_000);

  it("exports the selected Stream Builder packet as pcap through the backend", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:stream-pcap")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
            file_name: "stream-1.pcap",
            content_base64: "1MOyoQ==",
            bytes: 4,
            stream: {
              index: 1,
              name: "stream-1",
              packet_type: "Ethernet/IPv4/UDP",
              length: 64,
              mode: "continuous",
              rate: "1000 pps",
              next_stream: "-"
            },
            packet_preview: {
              index: 1,
              name: "stream-1",
              packet_type: "Ethernet/IPv4/UDP",
              frame_length: 64,
              wire_length: 64,
              binary_base64: "AAAA",
              hex: "00 00 00",
              hex_lines: [{ offset: "0000", hex: "00 00 00", ascii: "..." }],
              layers: []
            }
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Export Pcap" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/export-pcap",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"stream-1"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/export-pcap",
      expect.objectContaining({
        body: expect.stringContaining('"file_name":null')
      })
    );
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByText("Profile command accepted stream-1.pcap")).toBeInTheDocument();
  });

  it("exports the current Stream Builder profile as yaml without saving it", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:profile-yaml")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
            file_name: "profile.yaml",
            content: "---\n- name: stream-1\n",
            bytes: 21,
            streams: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP",
                length: 64,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
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
    fireEvent.click(screen.getByRole("button", { name: "Export To Yaml" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/export-yaml",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"profile_name":"profile.yaml"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/export-yaml",
      expect.objectContaining({
        body: expect.stringContaining('"streams":[{"name":"stream-1"')
      })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/save",
      expect.anything()
    );
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByText("Profile command accepted profile.yaml")).toBeInTheDocument();
  });

  it("exports Stream Builder next stream and action count from the original After this stream controls", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:profile-yaml")
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
            file_name: "profile.yaml",
            content: "---\n- name: stream-1\n  next: stream-2\n",
            bytes: 40,
            streams: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP",
                length: 64,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "stream-2"
              }
            ],
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
    fireEvent.click(screen.getByRole("button", { name: "Build Stream" }));
    fireEvent.click(screen.getAllByText("stream-1")[0]);
    fireEvent.click(screen.getByLabelText("Goto Stream"));
    fireEvent.change(screen.getByLabelText("Next Stream"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Time in loop" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Time in loop" }), { target: { value: "3" } });
    expect(screen.getAllByText("stream-2").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Export To Yaml" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/export-yaml",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"next_stream_id":2')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/export-yaml",
      expect.objectContaining({
        body: expect.stringContaining('"action_count":3')
      })
    );
  });

  it("creates the current Stream Builder profile through the backend save route", async () => {
    const profileCatalogWithCreated = {
      ...profileCatalog,
      data: {
        ...profileCatalog.data,
        profiles: [
          ...profileCatalog.data.profiles,
          {
            name: "profile.yaml",
            path: "/opt/trex-webui/profiles/profile.yaml",
            relative_path: "profile.yaml",
            root: "/opt/trex-webui/profiles",
            suffix: ".yaml",
            kind: "yaml",
            size_bytes: 2048,
            modified_time: "2026-06-04T00:00:00+00:00",
            previewable: true
          }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            profile: profileCatalogWithCreated.data.profiles[2],
            content: "---\n- name: stream-1\n",
            streams: [
              {
                index: 1,
                name: "stream-1",
                packet_type: "Ethernet/IPv4/UDP",
                length: 64,
                mode: "continuous",
                rate: "1000 pps",
                next_stream: "-"
              }
            ],
            packet_previews: []
          },
          blocker: null,
          error: null
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithCreated });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Create Profile" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench/save",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"profile_name":"profile.yaml"')
        })
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/save",
      expect.objectContaining({
        body: expect.stringContaining('"streams":[{"name":"stream-1"')
      })
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "profile.yaml" })).toBeInTheDocument());
    expect(screen.getByText("Saved profile.yaml")).toBeInTheDocument();
  });

  it("keeps Stream Builder edit and delete buttons visibly stateful", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfilesForBuilder();

    fireEvent.click(screen.getByRole("tab", { name: "Advanced Settings" }));
    expect(screen.getByRole("tab", { name: "Advanced Settings" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Edit Stream" }));
    expect(screen.getByRole("tab", { name: "Stream Properties" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Delete Stream" }));
    expect(screen.queryByRole("tab", { name: "Stream Properties" })).not.toBeInTheDocument();
    expect(screen.getByText("Select a profile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit Stream" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Stream" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Pcap" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export To Yaml" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Build Stream" }));
    expect(screen.getAllByText("stream-1").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Stream Properties" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Create Profile" })).not.toBeDisabled();
  });

  it("loads exported JSON profiles into the Stream Builder", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => profileCatalogWithJson })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            profile: profileCatalogWithJson.data.profiles[2],
            content: "{\"streams\":[]}",
            streams: [
              workbenchStream({
                name: "json-stream",
                packet_type: "Ethernet/IPv4/TCP",
                frame_length: 96,
                rate_value: 2500,
                ipv4_src: "192.0.2.10",
                ipv4_dst: "198.51.100.20",
                tcp_flag_ack: true,
                tcp_flag_syn: true
              })
            ],
            stream_summaries: [
              {
                index: 1,
                name: "json-stream",
                packet_type: "Ethernet/IPv4/TCP",
                length: 96,
                mode: "continuous",
                rate: "2500 pps",
                next_stream: "-"
              }
            ],
            packet_previews: []
          },
          blocker: null,
          error: null
        })
      });
    stubFetch(fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await openProfiles();
    fireEvent.click(screen.getByRole("option", { name: "http_simple.json" }));
    expect(screen.queryByLabelText("Tunable size")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Profile" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trex/profiles/workbench?profile_path=http_simple.json"
      )
    );
    expect(screen.getAllByText("json-stream").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Length")).toHaveValue(96);
    expect(screen.getByLabelText("Stream rate value")).toHaveValue(2500);
  });
});
