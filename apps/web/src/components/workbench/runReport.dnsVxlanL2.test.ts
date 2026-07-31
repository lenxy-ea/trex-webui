import {
  buildRunReportCsv,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  ipv6EnvelopeFields,
  it,
  runReportTrafficSession,
  type ProfileWorkbenchStream
} from "./runReportTestHarness";

describe("run report builder / DNS VXLAN L2", () => {
  it("matches DNS and DHCP transaction id fields", () => {
    const dnsStream = {
      name: "dns-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 64,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      l4_src_port_override: true,
      l4_src_port: 53000,
      l4_dst_port_override: true,
      l4_dst_port: 53,
      dns_enabled: true,
      dns_transaction_id: 0x1234,
      dns_transaction_id_mode: "Increment",
      dns_transaction_id_count: 4,
      dns_transaction_id_step: 1,
      dns_flags: "0100",
      dns_flags_mode: "Increment" as const,
      dns_flags_count: 2,
      dns_flags_step: 32768,
      dns_query_name: "service.example",
      dns_query_type: 1,
      dns_query_type_mode: "Increment" as const,
      dns_query_type_count: 2,
      dns_query_type_step: 27,
      dns_query_class: 1,
      dns_query_class_mode: "Increment" as const,
      dns_query_class_count: 2,
      dns_query_class_step: 2,
      dns_answer_enabled: true,
      dns_answer_ttl: 60,
      dns_answer_ttl_mode: "Increment" as const,
      dns_answer_ttl_count: 4,
      dns_answer_ttl_step: 5,
      dns_answer_ipv4: "192.0.2.10",
      dns_answer_ipv4_mode: "Increment Host" as const,
      dns_answer_ipv4_count: 4,
      dns_answer_ipv4_step: 1,
      dhcp_enabled: false,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const dhcpStream = {
      name: "dhcp-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 320,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      l4_src_port_override: true,
      l4_src_port: 68,
      l4_dst_port_override: true,
      l4_dst_port: 67,
      dns_enabled: false,
      dhcp_enabled: true,
      dhcp_operation: 1,
      dhcp_operation_mode: "Increment" as const,
      dhcp_operation_count: 2,
      dhcp_operation_step: 1,
      dhcp_hops: 1,
      dhcp_hops_mode: "Increment" as const,
      dhcp_hops_count: 4,
      dhcp_hops_step: 1,
      dhcp_seconds: 10,
      dhcp_seconds_mode: "Increment" as const,
      dhcp_seconds_count: 4,
      dhcp_seconds_step: 10,
      dhcp_message_type: 1,
      dhcp_message_type_mode: "Increment" as const,
      dhcp_message_type_count: 4,
      dhcp_message_type_step: 1,
      dhcp_xid: 0x3903f326,
      dhcp_xid_mode: "Increment",
      dhcp_xid_count: 4,
      dhcp_xid_step: 1,
      dhcp_flags: "0000",
      dhcp_flags_mode: "Increment" as const,
      dhcp_flags_count: 4,
      dhcp_flags_step: 1,
      dhcp_client_ip: "192.0.2.20",
      dhcp_client_ip_mode: "Increment Host" as const,
      dhcp_client_ip_count: 4,
      dhcp_client_ip_step: 1,
      dhcp_your_ip: "192.0.2.30",
      dhcp_your_ip_mode: "Increment Host" as const,
      dhcp_your_ip_count: 4,
      dhcp_your_ip_step: 1,
      dhcp_server_ip: "192.0.2.40",
      dhcp_server_ip_mode: "Increment Host" as const,
      dhcp_server_ip_count: 4,
      dhcp_server_ip_step: 1,
      dhcp_relay_ip: "192.0.2.50",
      dhcp_relay_ip_mode: "Increment Host" as const,
      dhcp_relay_ip_count: 4,
      dhcp_relay_ip_step: 1,
      dhcp_client_mac: "66:55:44:33:22:10",
      dhcp_client_mac_mode: "Increment" as const,
      dhcp_client_mac_count: 4,
      dhcp_client_mac_step: 1,
      dhcp_hostname: "trex-lab",
      dhcp_requested_ip: "192.0.2.10",
      dhcp_requested_ip_mode: "Increment Host",
      dhcp_requested_ip_count: 4,
      dhcp_requested_ip_step: 1,
      dhcp_server_id: "192.0.2.1",
      dhcp_server_id_mode: "Increment Host",
      dhcp_server_id_count: 4,
      dhcp_server_id_step: 1,
      dhcp_parameter_request_list: "1,3,6,15",
      dhcp_lease_time: 3600,
      dhcp_lease_time_mode: "Increment" as const,
      dhcp_lease_time_count: 4,
      dhcp_lease_time_step: 60,
      dhcp_renewal_time: 1800,
      dhcp_renewal_time_mode: "Increment" as const,
      dhcp_renewal_time_count: 4,
      dhcp_renewal_time_step: 30,
      dhcp_rebinding_time: 3150,
      dhcp_rebinding_time_mode: "Increment" as const,
      dhcp_rebinding_time_count: 4,
      dhcp_rebinding_time_step: 45,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const dnsPackets = [0, 1, 2, 3].map((offset) => ({
      index: offset + 1,
      time: 1 + offset / 1000,
      port: 1,
      mode: "RX",
      destination: "48.0.0.1",
      source: "16.0.0.1",
      type: "IPv4/UDP",
      length: 95,
      wirelen: 95,
      info: `16.0.0.1:53000 -> 48.0.0.1:53 DNS id=0x${(0x1234 + offset).toString(16)}`,
      binary_base64: "",
      hex_preview: "4500003d000040004011",
      decoded_layers: [
        { name: "Ethernet", fields: [] },
        {
          name: "IPv4",
          fields: [
            { name: "Source", value: "16.0.0.1" },
            { name: "Destination", value: "48.0.0.1" },
            ...ipv4EnvelopeFields("UDP", "77"),
            { name: "TTL", value: "64" }
          ]
        },
        {
          name: "UDP",
          fields: [
            { name: "Source Port", value: "53000" },
            { name: "Destination Port", value: "53" },
            { name: "Length", value: "57" },
            { name: "Payload Length", value: "49" }
          ]
        },
        {
          name: "DNS",
          fields: [
            { name: "Transaction ID", value: `0x${(0x1234 + offset).toString(16)}` },
            { name: "Flags", value: offset % 2 === 0 ? "0x0100" : "0x8100" },
            { name: "QR", value: offset % 2 === 0 ? "query" : "response" },
            { name: "Opcode", value: "0" },
            { name: "Response Code", value: "0" },
            { name: "Questions", value: "1" },
            { name: "Answers", value: "1" },
            { name: "Authority RRs", value: "0" },
            { name: "Additional RRs", value: "0" },
            { name: "Query Name", value: "service.example" },
            { name: "Query Type", value: offset % 2 === 0 ? "A" : "AAAA" },
            { name: "Query Class", value: offset % 2 === 0 ? "IN" : "CH" },
            { name: "Answer Type", value: "A" },
            { name: "Answer Class", value: offset % 2 === 0 ? "IN" : "CH" },
            { name: "Answer TTL", value: String(60 + offset * 5) },
            { name: "Answer IPv4", value: `192.0.2.${10 + offset}` }
          ]
        }
      ]
    }));
    const dhcpMessageTypes = ["Discover", "Offer", "Request", "Decline"];
    const dhcpPackets = [0, 1, 2, 3].map((offset) => ({
      index: offset + 5,
      time: 2 + offset / 1000,
      port: 1,
      mode: "RX",
      destination: "48.0.0.1",
      source: "16.0.0.1",
      type: "IPv4/UDP",
      length: 320,
      wirelen: 320,
      info: `16.0.0.1:68 -> 48.0.0.1:67 DHCP xid=0x${(0x3903f326 + offset).toString(16)}`,
      binary_base64: "",
      hex_preview: "45000140000040004011",
      decoded_layers: [
        { name: "Ethernet", fields: [] },
        {
          name: "IPv4",
          fields: [
            { name: "Source", value: "16.0.0.1" },
            { name: "Destination", value: "48.0.0.1" },
            ...ipv4EnvelopeFields("UDP", "328"),
            { name: "TTL", value: "64" }
          ]
        },
        {
          name: "UDP",
          fields: [
            { name: "Source Port", value: "68" },
            { name: "Destination Port", value: "67" },
            { name: "Length", value: "308" },
            { name: "Payload Length", value: "300" }
          ]
        },
        {
          name: "DHCP",
          fields: [
            { name: "Operation", value: offset % 2 === 0 ? "request" : "reply" },
            { name: "Hardware Type", value: "1" },
            { name: "Hardware Size", value: "6" },
            { name: "Hops", value: String(1 + offset) },
            { name: "Transaction ID", value: `0x${(0x3903f326 + offset).toString(16)}` },
            { name: "Seconds", value: String(10 + (offset * 10)) },
            { name: "Flags", value: `0x000${offset}` },
            { name: "Client IP", value: `192.0.2.${20 + offset}` },
            { name: "Your IP", value: `192.0.2.${30 + offset}` },
            { name: "Server IP", value: `192.0.2.${40 + offset}` },
            { name: "Relay IP", value: `192.0.2.${50 + offset}` },
            { name: "Client MAC", value: `66:55:44:33:22:1${offset}` },
            { name: "Magic Cookie", value: "63825363" },
            { name: "Message Type", value: dhcpMessageTypes[offset] },
            { name: "Hostname", value: "trex-lab" },
            { name: "Parameter Request List", value: "1,3,6,15" },
            { name: "Requested IP", value: `192.0.2.${10 + offset}` },
            { name: "Server ID", value: `192.0.2.${1 + offset}` },
            { name: "Lease Time", value: String(3600 + offset * 60) },
            { name: "Renewal Time", value: String(1800 + offset * 30) },
            { name: "Rebinding Time", value: String(3150 + offset * 45) }
          ]
        }
      ]
    }));
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [...dnsPackets, ...dhcpPackets],
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:07:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "dns-dhcp-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-09T00:07:00.000Z",
        endedAt: "2026-06-09T00:07:02.000Z",
        profilePath: "dns-dhcp-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1, 2] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [dnsStream, dhcpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP > DNS", "Ethernet > IPv4 > UDP > DHCP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Transaction ID",
            expected_values: ["0x1234", "0x1235", "0x1236", "0x1237"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Flags",
            expected_values: ["0x0100", "0x8100"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.QR",
            expected_values: ["query", "response"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["49"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["77"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["57"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Type",
            expected_values: ["A", "AAAA"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Class",
            expected_values: ["IN", "CH"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Name",
            expected_values: ["service.example"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Answers",
            expected_values: ["1"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Answer TTL",
            expected_values: ["60", "65", "70", "75"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Answer IPv4",
            expected_values: ["192.0.2.10", "192.0.2.11", "192.0.2.12", "192.0.2.13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Transaction ID",
            expected_values: ["0x3903f326", "0x3903f327", "0x3903f328", "0x3903f329"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Operation",
            expected_values: ["request", "reply"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Hops",
            expected_values: ["1", "2", "3", "4"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Seconds",
            expected_values: ["10", "20", "30", "40"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Flags",
            expected_values: ["0x0000", "0x0001", "0x0002", "0x0003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Client IP",
            expected_values: ["192.0.2.20", "192.0.2.21", "192.0.2.22", "192.0.2.23"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Your IP",
            expected_values: ["192.0.2.30", "192.0.2.31", "192.0.2.32", "192.0.2.33"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Server IP",
            expected_values: ["192.0.2.40", "192.0.2.41", "192.0.2.42", "192.0.2.43"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Relay IP",
            expected_values: ["192.0.2.50", "192.0.2.51", "192.0.2.52", "192.0.2.53"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Client MAC",
            expected_values: ["66:55:44:33:22:10", "66:55:44:33:22:11", "66:55:44:33:22:12", "66:55:44:33:22:13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["328"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["308"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["300"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Message Type",
            expected_values: ["Discover", "Offer", "Request", "Decline"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Parameter Request List",
            expected_values: ["1,3,6,15"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Requested IP",
            expected_values: ["192.0.2.10", "192.0.2.11", "192.0.2.12", "192.0.2.13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Server ID",
            expected_values: ["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.4"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Lease Time",
            expected_values: ["3600", "3660", "3720", "3780"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Renewal Time",
            expected_values: ["1800", "1830", "1860", "1890"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DHCP.Rebinding Time",
            expected_values: ["3150", "3195", "3240", "3285"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("57/57");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,dns-fe,DNS.Transaction ID");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,dhcp-fe,DHCP.Transaction ID");
  });

  it("matches IPv6 DNS fields against decoded capture fields", () => {
    const dnsStream = {
      name: "ipv6-dns-fe",
      packet_type: "Ethernet/IPv6/UDP",
      frame_length_type: "Fixed",
      frame_length: 128,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      ipv6_src: "2001:db8::10",
      ipv6_dst: "2001:db8::20",
      ipv6_traffic_class: 171,
      ipv6_flow_label: 9029,
      ipv6_hop_limit: 42,
      l4_src_port_override: true,
      l4_src_port: 53000,
      l4_dst_port_override: true,
      l4_dst_port: 53,
      dns_enabled: true,
      dns_transaction_id: 0x1234,
      dns_transaction_id_mode: "Increment",
      dns_transaction_id_count: 4,
      dns_transaction_id_step: 1,
      dns_flags: "0100",
      dns_flags_mode: "Increment" as const,
      dns_flags_count: 2,
      dns_flags_step: 32768,
      dns_query_name: "service.example",
      dns_query_type: 1,
      dns_query_type_mode: "Increment" as const,
      dns_query_type_count: 2,
      dns_query_type_step: 27,
      dns_query_class: 1,
      dns_query_class_mode: "Increment" as const,
      dns_query_class_count: 2,
      dns_query_class_step: 2,
      dhcp_enabled: false,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [0, 1, 2, 3].map((offset) => ({
        index: offset + 1,
        time: 1 + offset / 1000,
        port: 1,
        mode: "RX",
        destination: "2001:db8::20",
        source: "2001:db8::10",
        type: "IPv6/UDP",
        length: 128,
        wirelen: 128,
        info: `2001:db8::10:53000 -> 2001:db8::20:53 DNS id=0x${(0x1234 + offset).toString(16)}`,
        binary_base64: "",
        hex_preview: "600000000046112a",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::10" },
              { name: "Destination", value: "2001:db8::20" },
              ...ipv6EnvelopeFields("UDP", "70"),
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" },
              { name: "Hop Limit", value: "42" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "53000" },
              { name: "Destination Port", value: "53" },
              { name: "Length", value: "70" },
              { name: "Payload Length", value: "62" }
            ]
          },
          {
            name: "DNS",
            fields: [
              { name: "Transaction ID", value: `0x${(0x1234 + offset).toString(16)}` },
              { name: "Flags", value: offset % 2 === 0 ? "0x0100" : "0x8100" },
              { name: "QR", value: offset % 2 === 0 ? "query" : "response" },
              { name: "Opcode", value: "0" },
              { name: "Response Code", value: "0" },
              { name: "Questions", value: "1" },
              { name: "Answers", value: "0" },
              { name: "Authority RRs", value: "0" },
              { name: "Additional RRs", value: "0" },
              { name: "Query Name", value: "service.example" },
              { name: "Query Type", value: offset % 2 === 0 ? "A" : "AAAA" },
              { name: "Query Class", value: offset % 2 === 0 ? "IN" : "CH" }
            ]
          }
        ]
      })),
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-10T00:08:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-dns-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-10T00:08:00.000Z",
        endedAt: "2026-06-10T00:08:02.000Z",
        profilePath: "ipv6-dns-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [dnsStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6 > UDP > DNS"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["62"],
            observed_values: ["62"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Transaction ID",
            expected_values: ["0x1234", "0x1235", "0x1236", "0x1237"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Flags",
            expected_values: ["0x0100", "0x8100"],
            observed_values: ["0x0100", "0x8100"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.QR",
            expected_values: ["query", "response"],
            observed_values: ["query", "response"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Type",
            expected_values: ["A", "AAAA"],
            observed_values: ["A", "AAAA"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Class",
            expected_values: ["IN", "CH"],
            observed_values: ["IN", "CH"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "DNS.Query Name",
            expected_values: ["service.example"],
            observed_values: ["service.example"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("23/23");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-dns-fe,DNS.Transaction ID");
  });

  it("matches VXLAN VNI and inner fields against decoded capture fields", () => {
    const vxlanStream = {
      name: "vxlan-vni-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 64,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      vxlan_enabled: true,
      vxlan_vni: 4096,
      vxlan_vni_mode: "Increment",
      vxlan_vni_count: 4,
      vxlan_vni_step: 1,
      vxlan_inner_ether_dst: "66:55:44:33:22:11",
      vxlan_inner_ether_src: "10:20:30:40:50:60",
      vxlan_inner_ipv4_src: "10.1.0.10",
      vxlan_inner_ipv4_src_mode: "Increment Host",
      vxlan_inner_ipv4_src_count: 4,
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_ipv4_dst: "10.1.0.20",
      vxlan_inner_ipv4_dst_mode: "Increment Host",
      vxlan_inner_ipv4_dst_count: 4,
      vxlan_inner_ipv4_dst_step: 1,
      vxlan_inner_ipv4_ttl: 40,
      vxlan_inner_ipv4_ttl_mode: "Increment",
      vxlan_inner_ipv4_ttl_count: 4,
      vxlan_inner_ipv4_ttl_step: 1,
      vxlan_inner_l4_src_port: 32000,
      vxlan_inner_l4_src_port_mode: "Increment",
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1,
      vxlan_inner_l4_dst_port: 32100,
      vxlan_inner_l4_dst_port_mode: "Increment",
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      gtpu_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [0, 1, 2, 3].map((offset) => ({
        index: offset + 1,
        time: 1 + offset / 1000,
        port: 1,
        mode: "RX",
        destination: "48.0.0.1",
        source: "16.0.0.1",
        type: "IPv4/UDP",
        length: 96,
        wirelen: 96,
        info: `VXLAN vni=${4096 + offset} inner 10.1.0.${10 + offset} -> 10.1.0.${20 + offset}`,
        binary_base64: "",
        hex_preview: "450000a0000040004011",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "78"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1337" },
              { name: "Destination Port", value: "4789" },
              { name: "Length", value: "58" },
              { name: "Payload Length", value: "50" }
            ]
          },
          {
            name: "VXLAN",
            fields: [
              { name: "Flags", value: "0x08" },
              { name: "Reserved", value: "0x000000" },
              { name: "VNI", value: String(4096 + offset) },
              { name: "VNI Reserved", value: "0x00" }
            ]
          },
          {
            name: "Inner Ethernet",
            fields: [
              { name: "Destination", value: "66:55:44:33:22:11" },
              { name: "Source", value: "10:20:30:40:50:60" },
              { name: "EtherType", value: "0x0800" }
            ]
          },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: `10.1.0.${10 + offset}` },
              { name: "Destination", value: `10.1.0.${20 + offset}` },
              ...ipv4EnvelopeFields("UDP", "28"),
              { name: "TTL", value: String(40 + offset) }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: String(32000 + offset) },
              { name: "Destination Port", value: String(32100 + offset) },
              { name: "Length", value: "8" },
              { name: "Payload Length", value: "0" }
            ]
          }
        ]
      })),
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:08:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "vxlan-vni-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-09T00:08:00.000Z",
        endedAt: "2026-06-09T00:08:02.000Z",
        profilePath: "vxlan-vni-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [vxlanStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packet_type: "Ethernet/IPv4/UDP/VXLAN IPv4",
          expected_layer_chain: "Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv4 > UDP",
          field_expectation_count: 27
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv4 > UDP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Source",
            expected_values: ["16.0.0.1"],
            observed_values: ["16.0.0.1"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["78"],
            observed_values: ["78"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Source Port",
            expected_values: ["1337"],
            observed_values: ["1337"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Destination Port",
            expected_values: ["4789"],
            observed_values: ["4789"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["58"],
            observed_values: ["58"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["50"],
            observed_values: ["50"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "VXLAN.Flags",
            expected_values: ["0x08"],
            observed_values: ["0x08"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "VXLAN.Reserved",
            expected_values: ["0x000000"],
            observed_values: ["0x000000"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "VXLAN.VNI",
            expected_values: ["4096", "4097", "4098", "4099"],
            observed_values: ["4096", "4097", "4098", "4099"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "VXLAN.VNI Reserved",
            expected_values: ["0x00"],
            observed_values: ["0x00"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "Inner Ethernet.Destination",
            expected_values: ["66:55:44:33:22:11"],
            observed_values: ["66:55:44:33:22:11"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "Inner Ethernet.Source",
            expected_values: ["10:20:30:40:50:60"],
            observed_values: ["10:20:30:40:50:60"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "Inner Ethernet.EtherType",
            expected_values: ["0x0800"],
            observed_values: ["0x0800"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4[2].TTL",
            expected_values: ["40", "41", "42", "43"],
            observed_values: ["40", "41", "42", "43"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4[2].Protocol",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4[2].Total Length",
            expected_values: ["28"],
            observed_values: ["28"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP[2].Length",
            expected_values: ["8"],
            observed_values: ["8"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP[2].Payload Length",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("27/27");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,vxlan-vni-fe,VXLAN.VNI");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,vxlan-vni-fe,Inner Ethernet.Source");
  });

  it("matches VXLAN inner IPv6 fields against decoded capture fields", () => {
    const vxlanStream = {
      name: "vxlan-inner-ipv6-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 64,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      vxlan_enabled: true,
      vxlan_vni: 4096,
      vxlan_vni_mode: "Increment",
      vxlan_vni_count: 4,
      vxlan_vni_step: 1,
      vxlan_inner_ether_dst: "66:55:44:33:22:11",
      vxlan_inner_ether_src: "10:20:30:40:50:60",
      vxlan_inner_ip_version: "IPv6",
      vxlan_inner_ipv6_src: "2001:db8:50::10",
      vxlan_inner_ipv6_src_mode: "Increment Host",
      vxlan_inner_ipv6_src_count: 4,
      vxlan_inner_ipv6_src_step: 1,
      vxlan_inner_ipv6_dst: "2001:db8:50::20",
      vxlan_inner_ipv6_dst_mode: "Increment Host",
      vxlan_inner_ipv6_dst_count: 4,
      vxlan_inner_ipv6_dst_step: 1,
      vxlan_inner_ipv6_hop_limit: 40,
      vxlan_inner_ipv6_hop_limit_mode: "Increment",
      vxlan_inner_ipv6_hop_limit_count: 4,
      vxlan_inner_ipv6_hop_limit_step: 1,
      vxlan_inner_l4_src_port: 32000,
      vxlan_inner_l4_src_port_mode: "Increment",
      vxlan_inner_l4_src_port_count: 4,
      vxlan_inner_l4_src_port_step: 1,
      vxlan_inner_l4_dst_port: 32100,
      vxlan_inner_l4_dst_port_mode: "Increment",
      vxlan_inner_l4_dst_port_count: 4,
      vxlan_inner_l4_dst_port_step: 1,
      gtpu_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [0, 1, 2, 3].map((offset) => ({
        index: offset + 1,
        time: 1 + offset / 1000,
        port: 1,
        mode: "RX",
        destination: "48.0.0.1",
        source: "16.0.0.1",
        type: "IPv4/UDP",
        length: 112,
        wirelen: 112,
        info: "VXLAN inner IPv6",
        binary_base64: "",
        hex_preview: "45000062000040004011",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "98"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1337" },
              { name: "Destination Port", value: "4789" },
              { name: "Length", value: "78" },
              { name: "Payload Length", value: "70" }
            ]
          },
          {
            name: "VXLAN",
            fields: [
              { name: "Flags", value: "0x08" },
              { name: "Reserved", value: "0x000000" },
              { name: "VNI", value: String(4096 + offset) },
              { name: "VNI Reserved", value: "0x00" }
            ]
          },
          {
            name: "Inner Ethernet",
            fields: [
              { name: "Destination", value: "66:55:44:33:22:11" },
              { name: "Source", value: "10:20:30:40:50:60" },
              { name: "EtherType", value: "0x86dd" }
            ]
          },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: `2001:db8:50::${(0x10 + offset).toString(16)}` },
              { name: "Destination", value: `2001:db8:50::${(0x20 + offset).toString(16)}` },
              ...ipv6EnvelopeFields("UDP", "8"),
              { name: "Hop Limit", value: String(40 + offset) }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: String(32000 + offset) },
              { name: "Destination Port", value: String(32100 + offset) },
              { name: "Length", value: "8" },
              { name: "Payload Length", value: "0" }
            ]
          }
        ]
      })),
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:09:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "vxlan-inner-ipv6-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-09T00:09:00.000Z",
        endedAt: "2026-06-09T00:09:02.000Z",
        profilePath: "vxlan-inner-ipv6-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [vxlanStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packet_type: "Ethernet/IPv4/UDP/VXLAN IPv6",
          expected_layer_chain: "Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv6 > UDP",
          field_expectation_count: 26
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP > VXLAN > Inner Ethernet > IPv6 > UDP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Source",
            expected_values: ["2001:db8:50::10", "2001:db8:50::11", "2001:db8:50::12", "2001:db8:50::13"],
            observed_values: ["2001:db8:50::10", "2001:db8:50::11", "2001:db8:50::12", "2001:db8:50::13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Hop Limit",
            expected_values: ["40", "41", "42", "43"],
            observed_values: ["40", "41", "42", "43"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["8"],
            observed_values: ["8"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP[2].Source Port",
            expected_values: ["32000", "32001", "32002", "32003"],
            observed_values: ["32000", "32001", "32002", "32003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "Inner Ethernet.EtherType",
            expected_values: ["0x86dd"],
            observed_values: ["0x86dd"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("26/26");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,vxlan-inner-ipv6-fe,IPv6.Source");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,vxlan-inner-ipv6-fe,Inner Ethernet.EtherType");
  });

  it("matches QinQ VLAN tag fields against decoded capture fields", () => {
    const qinqStream = {
      name: "qinq-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 128,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      vlan_enabled: true,
      vlan_tpid_override: true,
      vlan_tpid: "88a8",
      vlan_priority: 1,
      vlan_priority_mode: "Fixed",
      vlan_priority_count: 4,
      vlan_priority_step: 1,
      vlan_cfi: 0,
      vlan_id: 100,
      vlan_id_mode: "Fixed",
      vlan_id_count: 16,
      vlan_id_step: 1,
      vlan2_enabled: true,
      vlan2_tpid_override: false,
      vlan2_tpid: "8100",
      vlan2_priority: 2,
      vlan2_priority_mode: "Increment",
      vlan2_priority_count: 4,
      vlan2_priority_step: 1,
      vlan2_cfi: 0,
      vlan2_id: 200,
      vlan2_id_mode: "Increment",
      vlan2_id_count: 4,
      vlan2_id_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [0, 1, 2, 3].map((offset) => ({
        index: offset + 1,
        time: 1 + offset / 1000,
        port: 1,
        mode: "RX",
        destination: "48.0.0.1",
        source: "16.0.0.1",
        type: "802.1Q/IPv4/UDP",
        length: 128,
        wirelen: 128,
        info: `QinQ outer=100 inner=${200 + offset}`,
        binary_base64: "",
        hex_preview: "88a8",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "802.1Q VLAN",
            fields: [
              { name: "TPID", value: "0x88a8" },
              { name: "Priority", value: "1" },
              { name: "DEI", value: "0" },
              { name: "VLAN ID", value: "100" }
            ]
          },
          {
            name: "802.1Q VLAN",
            fields: [
              { name: "TPID", value: "0x8100" },
              { name: "Priority", value: String(2 + offset) },
              { name: "DEI", value: "0" },
              { name: "VLAN ID", value: String(200 + offset) }
            ]
          },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "102"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "82" },
              { name: "Payload Length", value: "74" }
            ]
          }
        ]
      })),
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:09:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "qinq-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-09T00:09:00.000Z",
        endedAt: "2026-06-09T00:09:02.000Z",
        profilePath: "qinq-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [qinqStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
          field_expectation_count: 18
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["102"],
            observed_values: ["102"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "802.1Q VLAN.TPID",
            expected_values: ["0x88a8"],
            observed_values: ["0x88a8"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "802.1Q VLAN[2].Priority",
            expected_values: ["2", "3", "4", "5"],
            observed_values: ["2", "3", "4", "5"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "802.1Q VLAN[2].VLAN ID",
            expected_values: ["200", "201", "202", "203"],
            observed_values: ["200", "201", "202", "203"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["74"],
            observed_values: ["74"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("18/18");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,qinq-fe,802.1Q VLAN[2].VLAN ID");
  });

  it("matches MPLS label stack fields against decoded capture fields", () => {
    const mplsStream = {
      name: "mpls-stack-fe",
      packet_type: "Ethernet/IPv4/UDP",
      frame_length_type: "Fixed",
      frame_length: 128,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 1,
      flow_stats_enabled: false,
      latency_enabled: false,
      vlan_enabled: false,
      mpls_enabled: true,
      mpls_label: 100,
      mpls_label_mode: "Fixed",
      mpls_label_count: 4,
      mpls_label_step: 1,
      mpls_tc: 1,
      mpls_tc_mode: "Fixed",
      mpls_tc_count: 4,
      mpls_tc_step: 1,
      mpls_ttl: 40,
      mpls_ttl_mode: "Fixed",
      mpls_ttl_count: 4,
      mpls_ttl_step: 1,
      mpls_label2_enabled: true,
      mpls_label2: 200,
      mpls_label2_mode: "Increment",
      mpls_label2_count: 4,
      mpls_label2_step: 1,
      mpls_label2_tc: 2,
      mpls_label2_tc_mode: "Increment",
      mpls_label2_tc_count: 4,
      mpls_label2_tc_step: 1,
      mpls_label2_ttl: 50,
      mpls_label2_ttl_mode: "Increment",
      mpls_label2_ttl_count: 4,
      mpls_label2_ttl_step: 1,
      mpls_label3_enabled: true,
      mpls_label3: 300,
      mpls_label3_mode: "Increment",
      mpls_label3_count: 4,
      mpls_label3_step: 1,
      mpls_label3_tc: 3,
      mpls_label3_tc_mode: "Increment",
      mpls_label3_tc_count: 4,
      mpls_label3_tc_step: 1,
      mpls_label3_ttl: 60,
      mpls_label3_ttl_mode: "Increment",
      mpls_label3_ttl_count: 4,
      mpls_label3_ttl_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: {
        ok: true,
        data: { root: "/tmp/captures", files: [] },
        blocker: null,
        error: null
      },
      capturePackets: [0, 1, 2, 3].map((offset) => ({
        index: offset + 1,
        time: 1 + offset / 1000,
        port: 1,
        mode: "RX",
        destination: "48.0.0.1",
        source: "16.0.0.1",
        type: "MPLS/IPv4/UDP",
        length: 128,
        wirelen: 128,
        info: `MPLS stack label3=${300 + offset}`,
        binary_base64: "",
        hex_preview: "8847",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "MPLS",
            fields: [
              { name: "Label", value: "100" },
              { name: "Traffic Class", value: "1" },
              { name: "Bottom Of Stack", value: "0" },
              { name: "TTL", value: "40" }
            ]
          },
          {
            name: "MPLS",
            fields: [
              { name: "Label", value: String(200 + offset) },
              { name: "Traffic Class", value: String(2 + offset) },
              { name: "Bottom Of Stack", value: "0" },
              { name: "TTL", value: String(50 + offset) }
            ]
          },
          {
            name: "MPLS",
            fields: [
              { name: "Label", value: String(300 + offset) },
              { name: "Traffic Class", value: String(3 + offset) },
              { name: "Bottom Of Stack", value: "1" },
              { name: "TTL", value: String(60 + offset) }
            ]
          },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "98"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "78" },
              { name: "Payload Length", value: "70" }
            ]
          }
        ]
      })),
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:10:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "mpls-stack-fe.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 }
        },
        blocker: null,
        error: null
      },
      trafficSession: runReportTrafficSession({
        startedAt: "2026-06-09T00:10:00.000Z",
        endedAt: "2026-06-09T00:10:02.000Z",
        profilePath: "mpls-stack-fe.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true, stream_ids: [1] },
          blocker: null,
          error: null
        },
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      }),
      trafficMultiplier: "1kpps",
      workbenchStreams: [mplsStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
          field_expectation_count: 22
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["UDP"],
            observed_values: ["UDP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["98"],
            observed_values: ["98"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "MPLS.Label",
            expected_values: ["100"],
            observed_values: ["100"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "MPLS[2].Label",
            expected_values: ["200", "201", "202", "203"],
            observed_values: ["200", "201", "202", "203"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "MPLS[3].Bottom Of Stack",
            expected_values: ["1"],
            observed_values: ["1"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "MPLS[3].TTL",
            expected_values: ["60", "61", "62", "63"],
            observed_values: ["60", "61", "62", "63"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("22/22");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,mpls-stack-fe,MPLS[3].TTL");
  });
});
