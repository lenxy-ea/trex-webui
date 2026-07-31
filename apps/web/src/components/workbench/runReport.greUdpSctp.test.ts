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

describe("run report builder / GRE UDP SCTP", () => {
  it("matches GRE header and inner FE fields against decoded capture fields", () => {
    const greStream = {
      name: "gre-header-inner-fe",
      packet_type: "Ethernet/IPv4/GRE",
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
      gre_key_present: true,
      gre_key: 0x12345678,
      gre_key_mode: "Increment",
      gre_key_count: 4,
      gre_key_step: 1,
      gre_sequence_present: true,
      gre_sequence: 7,
      gre_sequence_mode: "Increment",
      gre_sequence_count: 4,
      gre_sequence_step: 1,
      gre_inner_ipv4_src: "10.2.0.10",
      gre_inner_ipv4_src_mode: "Increment Host",
      gre_inner_ipv4_src_count: 4,
      gre_inner_ipv4_src_step: 1,
      gre_inner_ipv4_dst: "10.2.0.20",
      gre_inner_ipv4_dst_mode: "Increment Host",
      gre_inner_ipv4_dst_count: 4,
      gre_inner_ipv4_dst_step: 1,
      gre_inner_ipv4_ttl: 40,
      gre_inner_ipv4_ttl_mode: "Increment",
      gre_inner_ipv4_ttl_count: 4,
      gre_inner_ipv4_ttl_step: 1,
      gre_inner_l4_src_port: 32000,
      gre_inner_l4_src_port_mode: "Increment",
      gre_inner_l4_src_port_count: 4,
      gre_inner_l4_src_port_step: 1,
      gre_inner_l4_dst_port: 32100,
      gre_inner_l4_dst_port_mode: "Increment",
      gre_inner_l4_dst_port_count: 4,
      gre_inner_l4_dst_port_step: 1,
      vxlan_enabled: false,
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
        type: "IPv4/GRE",
        length: 78,
        wirelen: 78,
        info: `GRE 10.2.0.${10 + offset}:3200${offset}`,
        binary_base64: "AAAA",
        hex_preview: "00000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("GRE", "60"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "GRE",
            fields: [
              { name: "Flags", value: "0x3000" },
              { name: "Protocol Type", value: "0x0800" },
              { name: "Key", value: `0x${(0x12345678 + offset).toString(16)}` },
              { name: "Sequence", value: String(7 + offset) }
            ]
          },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: `10.2.0.${10 + offset}` },
              { name: "Destination", value: `10.2.0.${20 + offset}` },
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
      generatedAt: "2026-06-09T00:09:40.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "gre-header-inner-fe.yaml",
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
        startedAt: "2026-06-09T00:09:40.000Z",
        endedAt: "2026-06-09T00:09:42.000Z",
        profilePath: "gre-header-inner-fe.yaml",
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
      workbenchStreams: [greStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > GRE > IPv4 > UDP",
          field_expectation_count: 20
        })
      ])
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
            expected_values: ["GRE"],
            observed_values: ["GRE"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["60"],
            observed_values: ["60"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Flags",
            expected_values: ["0x3000"],
            observed_values: ["0x3000"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Key",
            expected_values: ["0x12345678", "0x12345679", "0x1234567a", "0x1234567b"],
            observed_values: ["0x12345678", "0x12345679", "0x1234567a", "0x1234567b"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Sequence",
            expected_values: ["7", "8", "9", "10"],
            observed_values: ["7", "8", "9", "10"],
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
            field: "UDP.Source Port",
            expected_values: ["32000", "32001", "32002", "32003"],
            observed_values: ["32000", "32001", "32002", "32003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["8"],
            observed_values: ["8"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("20/20");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,gre-header-inner-fe,GRE.Key");
  });

  it("matches GRE checksum override against decoded capture fields", () => {
    const greStream = {
      name: "gre-checksum-override",
      packet_type: "Ethernet/IPv4/GRE",
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
      gre_checksum_present: true,
      gre_checksum_override: true,
      gre_checksum: "BEEF",
      gre_key_present: true,
      gre_key: 0x12345678,
      gre_key_mode: "Fixed",
      gre_sequence_present: true,
      gre_sequence: 7,
      gre_sequence_mode: "Fixed",
      gre_inner_ipv4_src: "10.2.0.10",
      gre_inner_ipv4_dst: "10.2.0.20",
      gre_inner_ipv4_ttl: 42,
      gre_inner_l4_src_port: 32000,
      gre_inner_l4_dst_port: 32100,
      vxlan_enabled: false,
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
      capturePackets: [
        {
          index: 1,
          time: 1,
          port: 1,
          mode: "RX",
          destination: "48.0.0.1",
          source: "16.0.0.1",
          type: "IPv4/GRE",
          length: 128,
          wirelen: 128,
          info: "GRE checksum 0xbeef",
          binary_base64: "AAAA",
          hex_preview: "00000000",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("GRE", "110"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "GRE",
              fields: [
                { name: "Flags", value: "0xb000" },
                { name: "Protocol Type", value: "0x0800" },
                { name: "Checksum", value: "0xbeef" },
                { name: "Key", value: "0x12345678" },
                { name: "Sequence", value: "7" }
              ]
            },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "10.2.0.10" },
                { name: "Destination", value: "10.2.0.20" },
                ...ipv4EnvelopeFields("UDP", "74"),
                { name: "TTL", value: "42" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "32000" },
                { name: "Destination Port", value: "32100" },
                { name: "Length", value: "54" },
                { name: "Payload Length", value: "46" }
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
      generatedAt: "2026-06-09T00:10:40.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "gre-checksum-override.yaml",
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
        startedAt: "2026-06-09T00:10:40.000Z",
        endedAt: "2026-06-09T00:10:42.000Z",
        profilePath: "gre-checksum-override.yaml",
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
      workbenchStreams: [greStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > GRE > IPv4 > UDP",
          field_expectation_count: 21
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "GRE.Flags",
            expected_values: ["0xb000"],
            observed_values: ["0xb000"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Checksum",
            expected_values: ["0xbeef"],
            observed_values: ["0xbeef"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Key",
            expected_values: ["0x12345678"],
            observed_values: ["0x12345678"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("21/21");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,gre-checksum-override,GRE.Checksum");
  });

  it("matches IPv6 GRE outer fields against decoded capture fields", () => {
    const greStream = {
      name: "ipv6-gre-outer",
      packet_type: "Ethernet/IPv6/GRE",
      frame_length_type: "Fixed",
      frame_length: 160,
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
      ipv6_hop_limit: 42,
      gre_key_present: true,
      gre_key: 0x10203040,
      gre_key_mode: "Fixed",
      gre_inner_ipv4_src: "10.2.1.10",
      gre_inner_ipv4_dst: "10.2.1.20",
      gre_inner_ipv4_ttl: 64,
      gre_inner_l4_src_port: 30000,
      gre_inner_l4_dst_port: 30001,
      vxlan_enabled: false,
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
      capturePackets: [
        {
          index: 1,
          time: 1,
          port: 1,
          mode: "RX",
          destination: "2001:db8::20",
          source: "2001:db8::10",
          type: "IPv6/GRE",
          length: 160,
          wirelen: 160,
          info: "IPv6 GRE",
          binary_base64: "AAAA",
          hex_preview: "00000000",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "2001:db8::10" },
                { name: "Destination", value: "2001:db8::20" },
                { name: "Next Header", value: "GRE" },
                { name: "Payload Length", value: "102" },
                { name: "Hop Limit", value: "42" }
              ]
            },
            {
              name: "GRE",
              fields: [
                { name: "Flags", value: "0x2000" },
                { name: "Protocol Type", value: "0x0800" },
                { name: "Key", value: "0x10203040" }
              ]
            },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "10.2.1.10" },
                { name: "Destination", value: "10.2.1.20" },
                ...ipv4EnvelopeFields("UDP", "94"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "30000" },
                { name: "Destination Port", value: "30001" },
                { name: "Length", value: "74" },
                { name: "Payload Length", value: "66" }
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
      generatedAt: "2026-06-09T00:11:40.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-gre-outer.yaml",
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
        startedAt: "2026-06-09T00:11:40.000Z",
        endedAt: "2026-06-09T00:11:42.000Z",
        profilePath: "ipv6-gre-outer.yaml",
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
      workbenchStreams: [greStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > GRE > IPv4 > UDP",
          field_expectation_count: 18
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Source",
            expected_values: ["2001:db8::10"],
            observed_values: ["2001:db8::10"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["GRE"],
            observed_values: ["GRE"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["102"],
            observed_values: ["102"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GRE.Key",
            expected_values: ["0x10203040"],
            observed_values: ["0x10203040"],
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
            expected_values: ["94"],
            observed_values: ["94"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["74"],
            observed_values: ["74"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("18/18");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-gre-outer,IPv6.Next Header");
  });

  it("matches GRE inner IPv6 fields against decoded capture fields", () => {
    const greStream = {
      name: "gre-inner-ipv6",
      packet_type: "Ethernet/IPv4/GRE",
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
      gre_key_present: true,
      gre_key: 0x12345678,
      gre_key_mode: "Fixed",
      gre_sequence_present: true,
      gre_sequence: 7,
      gre_sequence_mode: "Fixed",
      gre_inner_ip_version: "IPv6",
      gre_inner_ipv6_src: "2001:db8:40::10",
      gre_inner_ipv6_src_mode: "Increment Host",
      gre_inner_ipv6_src_count: 4,
      gre_inner_ipv6_src_step: 1,
      gre_inner_ipv6_dst: "2001:db8:40::20",
      gre_inner_ipv6_dst_mode: "Increment Host",
      gre_inner_ipv6_dst_count: 4,
      gre_inner_ipv6_dst_step: 1,
      gre_inner_ipv6_hop_limit: 42,
      gre_inner_ipv6_hop_limit_mode: "Increment",
      gre_inner_ipv6_hop_limit_count: 4,
      gre_inner_ipv6_hop_limit_step: 1,
      gre_inner_l4_src_port: 32000,
      gre_inner_l4_src_port_mode: "Increment",
      gre_inner_l4_src_port_count: 4,
      gre_inner_l4_src_port_step: 1,
      gre_inner_l4_dst_port: 32100,
      gre_inner_l4_dst_port_mode: "Increment",
      gre_inner_l4_dst_port_count: 4,
      gre_inner_l4_dst_port_step: 1,
      vxlan_enabled: false,
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
        type: "IPv4/GRE",
        length: 98,
        wirelen: 98,
        info: "GRE inner IPv6",
        binary_base64: "AAAA",
        hex_preview: "00000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("GRE", "80"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "GRE",
            fields: [
              { name: "Flags", value: "0x3000" },
              { name: "Protocol Type", value: "0x86dd" },
              { name: "Key", value: "0x12345678" },
              { name: "Sequence", value: "7" }
            ]
          },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: `2001:db8:40::${(0x10 + offset).toString(16)}` },
              { name: "Destination", value: `2001:db8:40::${(0x20 + offset).toString(16)}` },
              ...ipv6EnvelopeFields("UDP", "8"),
              { name: "Hop Limit", value: String(42 + offset) }
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
      generatedAt: "2026-06-09T00:12:40.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "gre-inner-ipv6.yaml",
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
        startedAt: "2026-06-09T00:12:40.000Z",
        endedAt: "2026-06-09T00:12:42.000Z",
        profilePath: "gre-inner-ipv6.yaml",
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
      workbenchStreams: [greStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > GRE > IPv6 > UDP",
          field_expectation_count: 19
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "GRE.Protocol Type",
            expected_values: ["0x86dd"],
            observed_values: ["0x86dd"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Source",
            expected_values: ["2001:db8:40::10", "2001:db8:40::11", "2001:db8:40::12", "2001:db8:40::13"],
            observed_values: ["2001:db8:40::10", "2001:db8:40::11", "2001:db8:40::12", "2001:db8:40::13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Destination",
            expected_values: ["2001:db8:40::20", "2001:db8:40::21", "2001:db8:40::22", "2001:db8:40::23"],
            observed_values: ["2001:db8:40::20", "2001:db8:40::21", "2001:db8:40::22", "2001:db8:40::23"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Hop Limit",
            expected_values: ["42", "43", "44", "45"],
            observed_values: ["42", "43", "44", "45"],
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
            field: "UDP.Source Port",
            expected_values: ["32000", "32001", "32002", "32003"],
            observed_values: ["32000", "32001", "32002", "32003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Destination Port",
            expected_values: ["32100", "32101", "32102", "32103"],
            observed_values: ["32100", "32101", "32102", "32103"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("19/19");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,gre-inner-ipv6,GRE.Protocol Type");
  });

  it("matches edited UDP header fields against decoded capture fields", () => {
    const udpStream = {
      name: "udp-header-fe",
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
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 127,
      l4_src_port: 12345,
      l4_dst_port: 53,
      udp_length_override: true,
      udp_length: 90,
      udp_length_mode: "Increment",
      udp_length_count: 4,
      udp_length_step: 1,
      udp_checksum_override: true,
      udp_checksum: "BEEF",
      udp_checksum_mode: "Increment",
      udp_checksum_count: 4,
      udp_checksum_step: 1,
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
        type: "IPv4/UDP",
        length: 128,
        wirelen: 128,
        info: `UDP header length=${90 + offset}`,
        binary_base64: "",
        hex_preview: "45000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "110"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "12345" },
              { name: "Destination Port", value: "53" },
              { name: "Length", value: String(90 + offset) },
              { name: "Payload Length", value: String(82 + offset) },
              { name: "Checksum", value: `0x${(0xbeef + offset).toString(16)}` }
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
      profilePath: "udp-header-fe.yaml",
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
        profilePath: "udp-header-fe.yaml",
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
      workbenchStreams: [udpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
          field_expectation_count: 10,
          field_expectations: expect.not.arrayContaining([
            expect.objectContaining({ field: "UDP.Checksum" })
          ])
        })
      ])
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
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["90", "91", "92", "93"],
            observed_values: ["90", "91", "92", "93"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["82", "83", "84", "85"],
            observed_values: ["82", "83", "84", "85"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("10/10");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,udp-header-fe,UDP.Length");
  });

  it("matches edited UDP checksum when no checksum fixup field can rewrite it", () => {
    const udpStream = {
      name: "udp-checksum-fe",
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
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 127,
      l4_src_port: 1025,
      l4_dst_port: 12,
      udp_length_override: false,
      udp_length: 90,
      udp_length_mode: "Fixed",
      udp_checksum_override: true,
      udp_checksum: "BEEF",
      udp_checksum_mode: "Increment",
      udp_checksum_count: 4,
      udp_checksum_step: 1,
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
        type: "IPv4/UDP",
        length: 128,
        wirelen: 128,
        info: `UDP checksum=0x${(0xbeef + offset).toString(16)}`,
        binary_base64: "",
        hex_preview: "45000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "110"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "90" },
              { name: "Payload Length", value: "82" },
              { name: "Checksum", value: `0x${(0xbeef + offset).toString(16)}` }
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
      generatedAt: "2026-06-09T00:10:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "udp-checksum-fe.yaml",
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
        startedAt: "2026-06-09T00:10:30.000Z",
        endedAt: "2026-06-09T00:10:32.000Z",
        profilePath: "udp-checksum-fe.yaml",
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
      workbenchStreams: [udpStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
          field_expectation_count: 11
        })
      ])
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
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Checksum",
            expected_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            observed_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["82"],
            observed_values: ["82"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("11/11");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,udp-checksum-fe,UDP.Checksum");
  });

  it("matches SCTP DATA chunk fields", () => {
    const sctpStream = {
      name: "sctp-data-fe",
      packet_type: "Ethernet/IPv4/SCTP",
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
      l4_src_port: 5000,
      l4_src_port_mode: "Increment",
      l4_src_port_count: 4,
      l4_src_port_step: 1,
      l4_dst_port_override: true,
      l4_dst_port: 6000,
      sctp_verification_tag: 0x10203040,
      sctp_verification_tag_mode: "Increment",
      sctp_verification_tag_count: 4,
      sctp_verification_tag_step: 1,
      sctp_data_flags: 3,
      sctp_data_flags_mode: "Increment",
      sctp_data_flags_count: 4,
      sctp_data_flags_step: 1,
      sctp_tsn: 100,
      sctp_tsn_mode: "Increment",
      sctp_tsn_count: 4,
      sctp_tsn_step: 1,
      sctp_stream_id: 7,
      sctp_stream_sequence: 9,
      sctp_payload_protocol_id: 0x11223344,
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
        type: "IPv4/SCTP",
        length: 66,
        wirelen: 66,
        info: `16.0.0.1:${5000 + offset} -> 48.0.0.1:6000 SCTP DATA`,
        binary_base64: "",
        hex_preview: "45000030108440004084",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("SCTP", "48"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "SCTP",
            fields: [
              { name: "Source Port", value: String(5000 + offset) },
              { name: "Destination Port", value: "6000" },
              { name: "Verification Tag", value: `0x${(0x10203040 + offset).toString(16)}` },
              { name: "Checksum", value: "0x00000000" },
              { name: "Chunk Type", value: "DATA" },
              { name: "Chunk Flags", value: `0x${(3 + offset).toString(16).padStart(2, "0")}` },
              { name: "Chunk Length", value: "16" },
              { name: "TSN", value: String(100 + offset) },
              { name: "Stream ID", value: "7" },
              { name: "Stream Sequence", value: "9" },
              { name: "Payload Protocol ID", value: String(0x11223344) },
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
      generatedAt: "2026-06-09T00:06:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "sctp-data-fe.yaml",
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
        startedAt: "2026-06-09T00:06:00.000Z",
        endedAt: "2026-06-09T00:06:02.000Z",
        profilePath: "sctp-data-fe.yaml",
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
      workbenchStreams: [sctpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > SCTP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["SCTP"],
            observed_values: ["SCTP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["48"],
            observed_values: ["48"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Verification Tag",
            expected_values: ["0x10203040", "0x10203041", "0x10203042", "0x10203043"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Chunk Type",
            expected_values: ["DATA"],
            observed_values: ["DATA"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Chunk Flags",
            expected_values: ["0x03", "0x04", "0x05", "0x06"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Chunk Length",
            expected_values: ["16"],
            observed_values: ["16"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.TSN",
            expected_values: ["100", "101", "102", "103"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Payload Length",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("17/17");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,sctp-data-fe,SCTP.Verification Tag");
  });

  it("matches IPv6 SCTP DATA chunk fields", () => {
    const sctpStream = {
      name: "ipv6-sctp-data-fe",
      packet_type: "Ethernet/IPv6/SCTP",
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
      ipv6_src: "2001:db8::10",
      ipv6_dst: "2001:db8::20",
      ipv6_traffic_class: 171,
      ipv6_flow_label: 9029,
      ipv6_hop_limit: 42,
      l4_src_port_override: true,
      l4_src_port: 2905,
      l4_dst_port_override: true,
      l4_dst_port: 2906,
      sctp_verification_tag: 0x10203040,
      sctp_verification_tag_mode: "Increment",
      sctp_verification_tag_count: 4,
      sctp_verification_tag_step: 1,
      sctp_data_flags: 3,
      sctp_data_flags_mode: "Increment",
      sctp_data_flags_count: 4,
      sctp_data_flags_step: 1,
      sctp_tsn: 100,
      sctp_tsn_mode: "Increment",
      sctp_tsn_count: 4,
      sctp_tsn_step: 1,
      sctp_stream_id: 7,
      sctp_stream_id_mode: "Increment",
      sctp_stream_id_count: 4,
      sctp_stream_id_step: 1,
      sctp_stream_sequence: 9,
      sctp_stream_sequence_mode: "Increment",
      sctp_stream_sequence_count: 4,
      sctp_stream_sequence_step: 1,
      sctp_payload_protocol_id: 0x11223344,
      sctp_payload_protocol_id_mode: "Increment",
      sctp_payload_protocol_id_count: 4,
      sctp_payload_protocol_id_step: 1,
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
        type: "IPv6/SCTP",
        length: 86,
        wirelen: 86,
        info: `2001:db8::10:${2905} -> 2001:db8::20:2906 SCTP DATA ${100 + offset}`,
        binary_base64: "",
        hex_preview: "60000000001c842a",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::10" },
              { name: "Destination", value: "2001:db8::20" },
              ...ipv6EnvelopeFields("SCTP", "28"),
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" },
              { name: "Hop Limit", value: "42" }
            ]
          },
          {
            name: "SCTP",
            fields: [
              { name: "Source Port", value: "2905" },
              { name: "Destination Port", value: "2906" },
              { name: "Verification Tag", value: `0x${(0x10203040 + offset).toString(16)}` },
              { name: "Checksum", value: "0x00000000" },
              { name: "Chunk Type", value: "DATA" },
              { name: "Chunk Flags", value: `0x${(3 + offset).toString(16).padStart(2, "0")}` },
              { name: "Chunk Length", value: "16" },
              { name: "TSN", value: String(100 + offset) },
              { name: "Stream ID", value: String(7 + offset) },
              { name: "Stream Sequence", value: String(9 + offset) },
              { name: "Payload Protocol ID", value: String(0x11223344 + offset) },
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
      generatedAt: "2026-06-10T00:06:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-sctp-data-fe.yaml",
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
        startedAt: "2026-06-10T00:06:00.000Z",
        endedAt: "2026-06-10T00:06:02.000Z",
        profilePath: "ipv6-sctp-data-fe.yaml",
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
      workbenchStreams: [sctpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6 > SCTP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["SCTP"],
            observed_values: ["SCTP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["28"],
            observed_values: ["28"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Traffic Class",
            expected_values: ["171"],
            observed_values: ["171"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Flow Label",
            expected_values: ["9029"],
            observed_values: ["9029"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Verification Tag",
            expected_values: ["0x10203040", "0x10203041", "0x10203042", "0x10203043"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Chunk Flags",
            expected_values: ["0x03", "0x04", "0x05", "0x06"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Chunk Length",
            expected_values: ["16"],
            observed_values: ["16"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.TSN",
            expected_values: ["100", "101", "102", "103"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Stream ID",
            expected_values: ["7", "8", "9", "10"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Stream Sequence",
            expected_values: ["9", "10", "11", "12"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Payload Protocol ID",
            expected_values: ["287454020", "287454021", "287454022", "287454023"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Payload Length",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("18/18");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-sctp-data-fe,IPv6.Next Header");
  });

  it("matches fixed SCTP checksum override fields", () => {
    const sctpStream = {
      name: "sctp-checksum",
      packet_type: "Ethernet/IPv4/SCTP",
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
      l4_src_port_override: true,
      l4_src_port: 5000,
      l4_dst_port_override: true,
      l4_dst_port: 6000,
      sctp_verification_tag: 0x10203040,
      sctp_checksum_override: true,
      sctp_checksum: "AABBCCDD",
      sctp_data_flags: 3,
      sctp_tsn: 100,
      sctp_stream_id: 7,
      sctp_stream_sequence: 9,
      sctp_payload_protocol_id: 0x11223344,
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
          type: "IPv4/SCTP",
          length: 128,
          wirelen: 128,
          info: "16.0.0.1:5000 -> 48.0.0.1:6000 SCTP DATA",
          binary_base64: "",
          hex_preview: "45000080108440004084",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("SCTP", "110"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "SCTP",
              fields: [
                { name: "Source Port", value: "5000" },
                { name: "Destination Port", value: "6000" },
                { name: "Verification Tag", value: "0x10203040" },
                { name: "Checksum", value: "0xaabbccdd" },
                { name: "Chunk Type", value: "DATA" },
                { name: "Chunk Flags", value: "0x03" },
                { name: "Chunk Length", value: "78" },
                { name: "TSN", value: "100" },
                { name: "Stream ID", value: "7" },
                { name: "Stream Sequence", value: "9" },
                { name: "Payload Protocol ID", value: String(0x11223344) },
                { name: "Payload Length", value: "62" }
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
      generatedAt: "2026-06-09T00:07:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "sctp-checksum.yaml",
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
        profilePath: "sctp-checksum.yaml",
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
      workbenchStreams: [sctpStream]
    });

    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["SCTP"],
            observed_values: ["SCTP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Checksum",
            expected_values: ["0xaabbccdd"],
            observed_values: ["0xaabbccdd"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("18/18");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,sctp-checksum,SCTP.Checksum");

    const ipv6SctpStream = {
      ...sctpStream,
      name: "ipv6-sctp-checksum",
      packet_type: "Ethernet/IPv6/SCTP",
      ipv6_src: "2001:db8::10",
      ipv6_dst: "2001:db8::20",
      ipv6_traffic_class: 171,
      ipv6_flow_label: 9029,
      ipv6_hop_limit: 42
    } as unknown as ProfileWorkbenchStream;
    const ipv6Snapshot = buildRunReportSnapshot({
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
          destination: "2001:db8::20",
          source: "2001:db8::10",
          type: "IPv6/SCTP",
          length: 128,
          wirelen: 128,
          info: "2001:db8::10:5000 -> 2001:db8::20:6000 SCTP DATA",
          binary_base64: "",
          hex_preview: "600000000046842a",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "2001:db8::10" },
                { name: "Destination", value: "2001:db8::20" },
                ...ipv6EnvelopeFields("SCTP", "70"),
                { name: "Traffic Class", value: "171" },
                { name: "Flow Label", value: "9029" },
                { name: "Hop Limit", value: "42" }
              ]
            },
            {
              name: "SCTP",
              fields: [
                { name: "Source Port", value: "5000" },
                { name: "Destination Port", value: "6000" },
                { name: "Verification Tag", value: "0x10203040" },
                { name: "Checksum", value: "0xaabbccdd" },
                { name: "Chunk Type", value: "DATA" },
                { name: "Chunk Flags", value: "0x03" },
                { name: "Chunk Length", value: "58" },
                { name: "TSN", value: "100" },
                { name: "Stream ID", value: "7" },
                { name: "Stream Sequence", value: "9" },
                { name: "Payload Protocol ID", value: String(0x11223344) },
                { name: "Payload Length", value: "42" }
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
      generatedAt: "2026-06-10T00:07:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-sctp-checksum.yaml",
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
        startedAt: "2026-06-10T00:07:00.000Z",
        endedAt: "2026-06-10T00:07:02.000Z",
        profilePath: "ipv6-sctp-checksum.yaml",
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
      workbenchStreams: [ipv6SctpStream]
    });

    expect(ipv6Snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["SCTP"],
            observed_values: ["SCTP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "SCTP.Checksum",
            expected_values: ["0xaabbccdd"],
            observed_values: ["0xaabbccdd"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(ipv6Snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("19/19");
    expect(buildRunReportCsv(ipv6Snapshot)).toContain("capture_field_match,matched,ipv6-sctp-checksum,SCTP.Checksum");
  });
});
