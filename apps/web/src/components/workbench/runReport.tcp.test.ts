import {
  buildRunReportCsv,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  ipv6EnvelopeFields,
  it,
  type ProfileWorkbenchStream
} from "./runReportTestHarness";

describe("run report builder / TCP", () => {
  it("matches edited TCP header fields against decoded capture fields", () => {
    const tcpStream = {
      name: "tcp-header-fe",
      packet_type: "Ethernet/IPv4/TCP",
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
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 127,
      l4_src_port: 12345,
      l4_dst_port: 443,
      tcp_sequence_number: 1000,
      tcp_sequence_mode: "Increment",
      tcp_sequence_count: 4,
      tcp_sequence_step: 1,
      tcp_ack_number: 2000,
      tcp_ack_mode: "Increment",
      tcp_ack_count: 4,
      tcp_ack_step: 1,
      tcp_window: 1024,
      tcp_window_mode: "Increment",
      tcp_window_count: 4,
      tcp_window_step: 1,
      tcp_checksum_override: true,
      tcp_checksum: "BEEF",
      tcp_checksum_mode: "Increment",
      tcp_checksum_count: 4,
      tcp_checksum_step: 1,
      tcp_urgent_pointer: 20,
      tcp_urgent_pointer_mode: "Increment",
      tcp_urgent_pointer_count: 4,
      tcp_urgent_pointer_step: 1,
      tcp_flag_syn: true,
      tcp_flags_mode: "Increment",
      tcp_flags_count: 4,
      tcp_flags_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const flagValues = ["SYN", "SYN, FIN", "RST", "RST, FIN"];
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
        type: "IPv4/TCP",
        length: 128,
        wirelen: 128,
        info: `TCP header seq=${1000 + offset}`,
        binary_base64: "",
        hex_preview: "45000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("TCP", "110"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "TCP",
            fields: [
              { name: "Source Port", value: "12345" },
              { name: "Destination Port", value: "443" },
              { name: "Sequence", value: String(1000 + offset) },
              { name: "Acknowledge", value: String(2000 + offset) },
              { name: "Header Length", value: "20" },
              { name: "Flags", value: flagValues[offset] },
              { name: "Window", value: String(1024 + offset) },
              { name: "Checksum", value: `0x${(0xbeef + offset).toString(16)}` },
              { name: "Urgent Pointer", value: String(20 + offset) },
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
      generatedAt: "2026-06-09T00:09:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "tcp-header-fe.yaml",
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
      trafficSession: {
        startedAt: "2026-06-09T00:09:00.000Z",
        endedAt: "2026-06-09T00:09:02.000Z",
        profilePath: "tcp-header-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > TCP",
          field_expectation_count: 15
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["TCP"],
            observed_values: ["TCP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Sequence",
            expected_values: ["1000", "1001", "1002", "1003"],
            observed_values: ["1000", "1001", "1002", "1003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Acknowledge",
            expected_values: ["2000", "2001", "2002", "2003"],
            observed_values: ["2000", "2001", "2002", "2003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Flags",
            expected_values: ["SYN", "SYN, FIN", "RST", "RST, FIN"],
            observed_values: ["SYN", "SYN, FIN", "RST", "RST, FIN"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("15/15");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,tcp-header-fe,TCP.Flags");
  });

  it("matches fixed TCP checksum override fields", () => {
    const tcpStream = {
      name: "tcp-checksum",
      packet_type: "Ethernet/IPv4/TCP",
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
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      l4_src_port: 1025,
      l4_dst_port: 12,
      tcp_sequence_number: 1_234_567,
      tcp_ack_number: 7_654_321,
      tcp_window: 9999,
      tcp_urgent_pointer: 1111,
      tcp_checksum_override: true,
      tcp_checksum: "BEEF",
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
      capturePackets: [
        {
          index: 1,
          time: 1,
          port: 1,
          mode: "RX",
          destination: "48.0.0.1",
          source: "16.0.0.1",
          type: "IPv4/TCP",
          length: 128,
          wirelen: 128,
          info: "TCP checksum override",
          binary_base64: "",
          hex_preview: "45000000",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("TCP", "110"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "TCP",
              fields: [
                { name: "Source Port", value: "1025" },
                { name: "Destination Port", value: "12" },
                { name: "Sequence", value: "1234567" },
                { name: "Acknowledge", value: "7654321" },
                { name: "Header Length", value: "20" },
                { name: "Window", value: "9999" },
                { name: "Checksum", value: "0xbeef" },
                { name: "Urgent Pointer", value: "1111" },
                { name: "Payload Length", value: "70" }
              ]
            }
          ]
        }
      ],
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-09T00:09:15.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "tcp-checksum.yaml",
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
      trafficSession: {
        startedAt: "2026-06-09T00:09:15.000Z",
        endedAt: "2026-06-09T00:09:17.000Z",
        profilePath: "tcp-checksum.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > TCP",
          field_expectation_count: 15
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "TCP.Checksum",
            expected_values: ["0xbeef"],
            observed_values: ["0xbeef"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("15/15");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,tcp-checksum,TCP.Checksum");
  });

  it("matches IPv6 TCP checksum field engine against decoded capture fields", () => {
    const tcpStream = {
      name: "ipv6-tcp-checksum-fe",
      packet_type: "Ethernet/IPv6/TCP",
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
      l4_src_port: 1025,
      l4_dst_port: 12,
      tcp_sequence_number: 1_234_567,
      tcp_ack_number: 7_654_321,
      tcp_window: 9999,
      tcp_flag_syn: true,
      tcp_urgent_pointer: 1111,
      tcp_checksum_override: true,
      tcp_checksum: "BEEF",
      tcp_checksum_mode: "Increment",
      tcp_checksum_count: 4,
      tcp_checksum_step: 1,
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
        type: "IPv6/TCP",
        length: 128,
        wirelen: 128,
        info: `IPv6 TCP checksum=0x${(0xbeef + offset).toString(16)}`,
        binary_base64: "",
        hex_preview: "600000000046062a",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::10" },
              { name: "Destination", value: "2001:db8::20" },
              ...ipv6EnvelopeFields("TCP", "70"),
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" },
              { name: "Hop Limit", value: "42" }
            ]
          },
          {
            name: "TCP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Sequence", value: "1234567" },
              { name: "Acknowledge", value: "7654321" },
              { name: "Header Length", value: "20" },
              { name: "Flags", value: "SYN" },
              { name: "Window", value: "9999" },
              { name: "Checksum", value: `0x${(0xbeef + offset).toString(16)}` },
              { name: "Urgent Pointer", value: "1111" },
              { name: "Payload Length", value: "50" }
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
      generatedAt: "2026-06-10T00:11:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-tcp-checksum-fe.yaml",
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
      trafficSession: {
        startedAt: "2026-06-10T00:11:00.000Z",
        endedAt: "2026-06-10T00:11:02.000Z",
        profilePath: "ipv6-tcp-checksum-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > TCP",
          field_expectation_count: 17
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["TCP"],
            observed_values: ["TCP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Checksum",
            expected_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            observed_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["50"],
            observed_values: ["50"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("17/17");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-tcp-checksum-fe,TCP.Checksum");
  });

  it("matches IPv6 TCP header field engines against decoded capture fields", () => {
    const tcpStream = {
      name: "ipv6-tcp-header-fe",
      packet_type: "Ethernet/IPv6/TCP",
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
      l4_src_port: 12345,
      l4_dst_port: 443,
      tcp_sequence_number: 1000,
      tcp_sequence_mode: "Increment",
      tcp_sequence_count: 4,
      tcp_sequence_step: 1,
      tcp_ack_number: 2000,
      tcp_ack_mode: "Increment",
      tcp_ack_count: 4,
      tcp_ack_step: 1,
      tcp_window: 1024,
      tcp_window_mode: "Increment",
      tcp_window_count: 4,
      tcp_window_step: 1,
      tcp_flag_syn: true,
      tcp_flags_mode: "Increment",
      tcp_flags_count: 4,
      tcp_flags_step: 1,
      tcp_urgent_pointer: 20,
      tcp_urgent_pointer_mode: "Increment",
      tcp_urgent_pointer_count: 4,
      tcp_urgent_pointer_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const flagValues = ["SYN", "SYN, FIN", "RST", "RST, FIN"];
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
        type: "IPv6/TCP",
        length: 128,
        wirelen: 128,
        info: `IPv6 TCP header seq=${1000 + offset}`,
        binary_base64: "",
        hex_preview: "600000000046062a",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::10" },
              { name: "Destination", value: "2001:db8::20" },
              ...ipv6EnvelopeFields("TCP", "70"),
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" },
              { name: "Hop Limit", value: "42" }
            ]
          },
          {
            name: "TCP",
            fields: [
              { name: "Source Port", value: "12345" },
              { name: "Destination Port", value: "443" },
              { name: "Sequence", value: String(1000 + offset) },
              { name: "Acknowledge", value: String(2000 + offset) },
              { name: "Header Length", value: "20" },
              { name: "Flags", value: flagValues[offset] },
              { name: "Window", value: String(1024 + offset) },
              { name: "Urgent Pointer", value: String(20 + offset) },
              { name: "Payload Length", value: "50" }
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
      generatedAt: "2026-06-10T00:12:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-tcp-header-fe.yaml",
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
      trafficSession: {
        startedAt: "2026-06-10T00:12:00.000Z",
        endedAt: "2026-06-10T00:12:02.000Z",
        profilePath: "ipv6-tcp-header-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > TCP",
          field_expectation_count: 16
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["TCP"],
            observed_values: ["TCP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Sequence",
            expected_values: ["1000", "1001", "1002", "1003"],
            observed_values: ["1000", "1001", "1002", "1003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Acknowledge",
            expected_values: ["2000", "2001", "2002", "2003"],
            observed_values: ["2000", "2001", "2002", "2003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Flags",
            expected_values: ["SYN", "SYN, FIN", "RST", "RST, FIN"],
            observed_values: ["SYN", "SYN, FIN", "RST", "RST, FIN"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Urgent Pointer",
            expected_values: ["20", "21", "22", "23"],
            observed_values: ["20", "21", "22", "23"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["50"],
            observed_values: ["50"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("16/16");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-tcp-header-fe,TCP.Flags");
  });

  it("matches TCP option fields against decoded capture fields", () => {
    const tcpStream = {
      name: "tcp-options-fe",
      packet_type: "Ethernet/IPv4/TCP",
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
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 127,
      l4_src_port: 1025,
      l4_dst_port: 12,
      tcp_sequence_number: 1_234_567,
      tcp_ack_number: 7_654_321,
      tcp_window: 9999,
      tcp_flag_syn: true,
      tcp_urgent_pointer: 1111,
      tcp_option_mss_enabled: true,
      tcp_option_mss: 1460,
      tcp_option_mss_mode: "Increment",
      tcp_option_mss_count: 4,
      tcp_option_mss_step: 1,
      tcp_option_window_scale_enabled: true,
      tcp_option_window_scale: 7,
      tcp_option_window_scale_mode: "Increment",
      tcp_option_window_scale_count: 4,
      tcp_option_window_scale_step: 1,
      tcp_option_sack_permitted_enabled: true,
      tcp_option_sack_blocks_enabled: true,
      tcp_option_sack_left_edge: 1000,
      tcp_option_sack_left_edge_mode: "Increment",
      tcp_option_sack_left_edge_count: 4,
      tcp_option_sack_left_edge_step: 1,
      tcp_option_sack_right_edge: 2000,
      tcp_option_sack_right_edge_mode: "Increment",
      tcp_option_sack_right_edge_count: 4,
      tcp_option_sack_right_edge_step: 1,
      tcp_option_timestamp_enabled: true,
      tcp_option_timestamp_value: 123456,
      tcp_option_timestamp_value_mode: "Increment",
      tcp_option_timestamp_value_count: 4,
      tcp_option_timestamp_value_step: 1,
      tcp_option_timestamp_echo: 654321,
      tcp_option_timestamp_echo_mode: "Increment",
      tcp_option_timestamp_echo_count: 4,
      tcp_option_timestamp_echo_step: 1,
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
        type: "IPv4/TCP",
        length: 128,
        wirelen: 128,
        info: `TCP options mss=${1460 + offset}`,
        binary_base64: "",
        hex_preview: "45000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("TCP", "110"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "TCP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Sequence", value: "1234567" },
              { name: "Acknowledge", value: "7654321" },
              { name: "Header Length", value: "52" },
              { name: "Flags", value: "SYN" },
              { name: "Window", value: "9999" },
              { name: "Checksum", value: `0x${(0xabcd + offset).toString(16)}` },
              { name: "Urgent Pointer", value: "1111" },
              { name: "Payload Length", value: "38" },
              { name: "Option MSS", value: String(1460 + offset) },
              { name: "Option SACK Permitted", value: "yes" },
              { name: "Option SACK Left Edge", value: String(1000 + offset) },
              { name: "Option SACK Right Edge", value: String(2000 + offset) },
              { name: "Option Timestamp Value", value: String(123456 + offset) },
              { name: "Option Timestamp Echo", value: String(654321 + offset) },
              { name: "Option Window Scale", value: String(7 + offset) }
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
      generatedAt: "2026-06-09T00:09:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "tcp-options-fe.yaml",
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
      trafficSession: {
        startedAt: "2026-06-09T00:09:30.000Z",
        endedAt: "2026-06-09T00:09:32.000Z",
        profilePath: "tcp-options-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > TCP",
          field_expectation_count: 22
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["TCP"],
            observed_values: ["TCP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option MSS",
            expected_values: ["1460", "1461", "1462", "1463"],
            observed_values: ["1460", "1461", "1462", "1463"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["38"],
            observed_values: ["38"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Permitted",
            expected_values: ["yes"],
            observed_values: ["yes"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Left Edge",
            expected_values: ["1000", "1001", "1002", "1003"],
            observed_values: ["1000", "1001", "1002", "1003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Right Edge",
            expected_values: ["2000", "2001", "2002", "2003"],
            observed_values: ["2000", "2001", "2002", "2003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Timestamp Value",
            expected_values: ["123456", "123457", "123458", "123459"],
            observed_values: ["123456", "123457", "123458", "123459"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Timestamp Echo",
            expected_values: ["654321", "654322", "654323", "654324"],
            observed_values: ["654321", "654322", "654323", "654324"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Window Scale",
            expected_values: ["7", "8", "9", "10"],
            observed_values: ["7", "8", "9", "10"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("22/22");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,tcp-options-fe,TCP.Option MSS");
  });

  it("matches IPv6 TCP option fields against decoded capture fields", () => {
    const tcpStream = {
      name: "ipv6-tcp-options-fe",
      packet_type: "Ethernet/IPv6/TCP",
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
      l4_src_port: 1025,
      l4_dst_port: 12,
      tcp_sequence_number: 1_234_567,
      tcp_ack_number: 7_654_321,
      tcp_window: 9999,
      tcp_flag_syn: true,
      tcp_urgent_pointer: 1111,
      tcp_option_mss_enabled: true,
      tcp_option_mss: 1460,
      tcp_option_mss_mode: "Increment",
      tcp_option_mss_count: 4,
      tcp_option_mss_step: 1,
      tcp_option_window_scale_enabled: true,
      tcp_option_window_scale: 7,
      tcp_option_window_scale_mode: "Increment",
      tcp_option_window_scale_count: 4,
      tcp_option_window_scale_step: 1,
      tcp_option_sack_permitted_enabled: true,
      tcp_option_sack_blocks_enabled: true,
      tcp_option_sack_left_edge: 1000,
      tcp_option_sack_left_edge_mode: "Increment",
      tcp_option_sack_left_edge_count: 4,
      tcp_option_sack_left_edge_step: 1,
      tcp_option_sack_right_edge: 2000,
      tcp_option_sack_right_edge_mode: "Increment",
      tcp_option_sack_right_edge_count: 4,
      tcp_option_sack_right_edge_step: 1,
      tcp_option_timestamp_enabled: true,
      tcp_option_timestamp_value: 123456,
      tcp_option_timestamp_value_mode: "Increment",
      tcp_option_timestamp_value_count: 4,
      tcp_option_timestamp_value_step: 1,
      tcp_option_timestamp_echo: 654321,
      tcp_option_timestamp_echo_mode: "Increment",
      tcp_option_timestamp_echo_count: 4,
      tcp_option_timestamp_echo_step: 1,
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
        type: "IPv6/TCP",
        length: 128,
        wirelen: 128,
        info: `IPv6 TCP options mss=${1460 + offset}`,
        binary_base64: "",
        hex_preview: "600000000046062a",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::10" },
              { name: "Destination", value: "2001:db8::20" },
              ...ipv6EnvelopeFields("TCP", "70"),
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" },
              { name: "Hop Limit", value: "42" }
            ]
          },
          {
            name: "TCP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Sequence", value: "1234567" },
              { name: "Acknowledge", value: "7654321" },
              { name: "Header Length", value: "52" },
              { name: "Flags", value: "SYN" },
              { name: "Window", value: "9999" },
              { name: "Checksum", value: `0x${(0xabcd + offset).toString(16)}` },
              { name: "Urgent Pointer", value: "1111" },
              { name: "Payload Length", value: "18" },
              { name: "Option MSS", value: String(1460 + offset) },
              { name: "Option SACK Permitted", value: "yes" },
              { name: "Option SACK Left Edge", value: String(1000 + offset) },
              { name: "Option SACK Right Edge", value: String(2000 + offset) },
              { name: "Option Timestamp Value", value: String(123456 + offset) },
              { name: "Option Timestamp Echo", value: String(654321 + offset) },
              { name: "Option Window Scale", value: String(7 + offset) }
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
      generatedAt: "2026-06-10T00:09:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-tcp-options-fe.yaml",
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
      trafficSession: {
        startedAt: "2026-06-10T00:09:30.000Z",
        endedAt: "2026-06-10T00:09:32.000Z",
        profilePath: "ipv6-tcp-options-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [tcpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > TCP",
          field_expectation_count: 23
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6 > TCP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["TCP"],
            observed_values: ["TCP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Header Length",
            expected_values: ["52"],
            observed_values: ["52"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option MSS",
            expected_values: ["1460", "1461", "1462", "1463"],
            observed_values: ["1460", "1461", "1462", "1463"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Payload Length",
            expected_values: ["18"],
            observed_values: ["18"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Permitted",
            expected_values: ["yes"],
            observed_values: ["yes"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Left Edge",
            expected_values: ["1000", "1001", "1002", "1003"],
            observed_values: ["1000", "1001", "1002", "1003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option SACK Right Edge",
            expected_values: ["2000", "2001", "2002", "2003"],
            observed_values: ["2000", "2001", "2002", "2003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Timestamp Value",
            expected_values: ["123456", "123457", "123458", "123459"],
            observed_values: ["123456", "123457", "123458", "123459"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Timestamp Echo",
            expected_values: ["654321", "654322", "654323", "654324"],
            observed_values: ["654321", "654322", "654323", "654324"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "TCP.Option Window Scale",
            expected_values: ["7", "8", "9", "10"],
            observed_values: ["7", "8", "9", "10"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("23/23");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-tcp-options-fe,TCP.Option MSS");
  });
});
