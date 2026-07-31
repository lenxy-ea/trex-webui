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

describe("run report builder / IP and Ethernet", () => {
  it("matches edited IPv4 header fields against decoded capture fields", () => {
    const ipv4Stream = {
      name: "ipv4-header-fe",
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
      ipv4_dscp: 10,
      ipv4_dscp_mode: "Increment",
      ipv4_dscp_count: 4,
      ipv4_dscp_step: 1,
      ipv4_ecn: 3,
      ipv4_id: 100,
      ipv4_id_mode: "Increment",
      ipv4_id_count: 4,
      ipv4_id_step: 1,
      ipv4_flag_df: true,
      ipv4_flag_mf: true,
      ipv4_fragment_offset: 100,
      ipv4_fragment_offset_mode: "Increment",
      ipv4_fragment_offset_count: 4,
      ipv4_fragment_offset_step: 1,
      ipv4_ttl: 40,
      ipv4_ttl_mode: "Increment",
      ipv4_ttl_count: 4,
      ipv4_ttl_step: 1,
      l4_src_port: 1025,
      l4_dst_port: 12,
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
        info: `IPv4 header dscp=${10 + offset} id=${100 + offset}`,
        binary_base64: "",
        hex_preview: "45000080",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("UDP", "110"),
                { name: "TTL", value: String(40 + offset) },
                { name: "DSCP", value: String(10 + offset) },
                { name: "ECN", value: "3" },
              { name: "Identification", value: String(100 + offset) },
              { name: "Flags", value: "DF, MF" },
              { name: "Fragment Offset", value: String(100 + offset) }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "90" },
              { name: "Payload Length", value: "82" }
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
      generatedAt: "2026-06-09T00:07:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv4-header-fe.yaml",
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
        profilePath: "ipv4-header-fe.yaml",
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
      workbenchStreams: [ipv4Stream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
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
            field: "IPv4.DSCP",
            expected_values: ["10", "11", "12", "13"],
            observed_values: ["10", "11", "12", "13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Flags",
            expected_values: ["DF, MF"],
            observed_values: ["DF, MF"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Fragment Offset",
            expected_values: ["100", "101", "102", "103"],
            observed_values: ["100", "101", "102", "103"],
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
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("15/15");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv4-header-fe,IPv4.Fragment Offset");
  });

  it("matches IPv4 L3-only fields against decoded capture fields", () => {
    const ipv4Stream = {
      name: "ipv4-l3-only-fe",
      packet_type: "Ethernet/IPv4",
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
      ipv4_src: "10.10.0.10",
      ipv4_src_mode: "Increment Host",
      ipv4_src_count: 4,
      ipv4_src_step: 1,
      ipv4_dst: "10.20.0.20",
      ipv4_dscp: 10,
      ipv4_dscp_mode: "Increment",
      ipv4_dscp_count: 4,
      ipv4_dscp_step: 1,
      ipv4_ecn: 3,
      ipv4_id: 100,
      ipv4_id_mode: "Increment",
      ipv4_id_count: 4,
      ipv4_id_step: 1,
      ipv4_flag_df: true,
      ipv4_flag_mf: true,
      ipv4_fragment_offset: 100,
      ipv4_fragment_offset_mode: "Increment",
      ipv4_fragment_offset_count: 4,
      ipv4_fragment_offset_step: 1,
      ipv4_ttl: 40,
      ipv4_ttl_mode: "Increment",
      ipv4_ttl_count: 4,
      ipv4_ttl_step: 1,
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
      capturePackets: [0, 1, 2, 3].map((offset) => {
        const source = `10.10.0.${10 + offset}`;
        return {
          index: offset + 1,
          time: 1 + offset / 1000,
          port: 1,
          mode: "RX",
          destination: "10.20.0.20",
          source,
          type: "IPv4",
          length: 128,
          wirelen: 128,
          info: `IPv4 l3-only src=${source}`,
          binary_base64: "",
          hex_preview: "4500006e",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: source },
                { name: "Destination", value: "10.20.0.20" },
                { name: "Header Length", value: "20" },
                { name: "Total Length", value: "110" },
                { name: "TTL", value: String(40 + offset) },
                { name: "DSCP", value: String(10 + offset) },
                { name: "ECN", value: "3" },
                { name: "Identification", value: String(100 + offset) },
                { name: "Flags", value: "DF, MF" },
                { name: "Fragment Offset", value: String(100 + offset) }
              ]
            }
          ]
        };
      }),
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
      profilePath: "ipv4-l3-only-fe.yaml",
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
        startedAt: "2026-06-09T00:09:30.000Z",
        endedAt: "2026-06-09T00:09:32.000Z",
        profilePath: "ipv4-l3-only-fe.yaml",
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
      workbenchStreams: [ipv4Stream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4",
          field_expectation_count: 10
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Source",
            expected_values: ["10.10.0.10", "10.10.0.11", "10.10.0.12", "10.10.0.13"],
            observed_values: ["10.10.0.10", "10.10.0.11", "10.10.0.12", "10.10.0.13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["110"],
            observed_values: ["110"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.TTL",
            expected_values: ["40", "41", "42", "43"],
            observed_values: ["40", "41", "42", "43"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.DSCP",
            expected_values: ["10", "11", "12", "13"],
            observed_values: ["10", "11", "12", "13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Fragment Offset",
            expected_values: ["100", "101", "102", "103"],
            observed_values: ["100", "101", "102", "103"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("10/10");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv4-l3-only-fe,IPv4.Source");
  });

  it("matches explicit Ethernet MAC fields against decoded capture fields", () => {
    const ethernetStream = {
      name: "ethernet-mac-fe",
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
      ether_dst: "02:00:00:00:00:04",
      ether_dst_mode: "Fixed",
      ether_src: "02:00:00:00:00:00",
      ether_src_mode: "Increment",
      ether_src_count: 4,
      ether_src_step: 1,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      l4_src_port: 1025,
      l4_dst_port: 12,
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
        info: `Ethernet source 02:00:00:00:00:0${offset}`,
        binary_base64: "",
        hex_preview: "020000000004",
        decoded_layers: [
          {
            name: "Ethernet",
            fields: [
              { name: "Destination", value: "02:00:00:00:00:04" },
              { name: "Source", value: `02:00:00:00:00:0${offset}` }
            ]
          },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "110"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "90" },
              { name: "Payload Length", value: "82" }
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
      generatedAt: "2026-06-10T00:01:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ethernet-mac-fe.yaml",
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
        startedAt: "2026-06-10T00:01:00.000Z",
        endedAt: "2026-06-10T00:01:02.000Z",
        profilePath: "ethernet-mac-fe.yaml",
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
      workbenchStreams: [ethernetStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv4 > UDP",
          field_expectation_count: 12,
          field_expectations: expect.arrayContaining([
            expect.objectContaining({
              field: "Ethernet.Destination",
              expected_values: ["02:00:00:00:00:04"]
            }),
            expect.objectContaining({
              field: "Ethernet.Source",
              expected_values: [
                "02:00:00:00:00:00",
                "02:00:00:00:00:01",
                "02:00:00:00:00:02",
                "02:00:00:00:00:03"
              ]
            })
          ])
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "Ethernet.Destination",
            expected_values: ["02:00:00:00:00:04"],
            observed_values: ["02:00:00:00:00:04"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "Ethernet.Source",
            expected_values: [
              "02:00:00:00:00:00",
              "02:00:00:00:00:01",
              "02:00:00:00:00:02",
              "02:00:00:00:00:03"
            ],
            observed_values: [
              "02:00:00:00:00:00",
              "02:00:00:00:00:01",
              "02:00:00:00:00:02",
              "02:00:00:00:00:03"
            ],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("12/12");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ethernet-mac-fe,Ethernet.Source");
  });

  it("does not treat default TRex Config Ethernet MAC values as capture field expectations", () => {
    const defaultMacStream = {
      name: "trex-config-mac",
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
      capturePackets: [],
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-10T00:02:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "trex-config-mac.yaml",
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
      trafficSession: null,
      trafficMultiplier: "1kpps",
      workbenchStreams: [defaultMacStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_expectations: expect.not.arrayContaining([
            expect.objectContaining({ field: "Ethernet.Destination" }),
            expect.objectContaining({ field: "Ethernet.Source" })
          ])
        })
      ])
    );
  });

  it("matches fixed IPv4 checksum override fields", () => {
    const ipv4Stream = {
      name: "ipv4-checksum",
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
      ipv4_ttl: 64,
      ipv4_checksum_override: true,
      ipv4_checksum: "BEEF",
      l4_src_port: 1025,
      l4_dst_port: 12,
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
          type: "IPv4/UDP",
          length: 128,
          wirelen: 128,
          info: "IPv4 checksum override",
          binary_base64: "",
          hex_preview: "45000080",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("UDP", "110"),
                { name: "TTL", value: "64" },
                { name: "Checksum", value: "0xbeef" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "1025" },
                { name: "Destination Port", value: "12" },
                { name: "Length", value: "90" },
                { name: "Payload Length", value: "82" }
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
      generatedAt: "2026-06-09T00:09:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv4-checksum.yaml",
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
        profilePath: "ipv4-checksum.yaml",
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
      workbenchStreams: [ipv4Stream]
    });

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
            field: "IPv4.Checksum",
            expected_values: ["0xbeef"],
            observed_values: ["0xbeef"],
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
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv4-checksum,IPv4.Checksum");
  });

  it("matches edited IPv6 header fields against decoded capture fields", () => {
    const ipv6Stream = {
      name: "ipv6-header-fe",
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
      ipv6_src: "2001:db8::1",
      ipv6_dst: "2001:db8::2",
      ipv6_traffic_class: 10,
      ipv6_traffic_class_mode: "Increment",
      ipv6_traffic_class_count: 4,
      ipv6_traffic_class_step: 1,
      ipv6_flow_label: 100,
      ipv6_flow_label_mode: "Increment",
      ipv6_flow_label_count: 4,
      ipv6_flow_label_step: 1,
      ipv6_hop_limit: 40,
      ipv6_hop_limit_mode: "Increment",
      ipv6_hop_limit_count: 4,
      ipv6_hop_limit_step: 1,
      l4_src_port: 1025,
      l4_dst_port: 12,
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
        destination: "2001:db8::2",
        source: "2001:db8::1",
        type: "IPv6/UDP",
        length: 128,
        wirelen: 128,
        info: `IPv6 header tc=${10 + offset} flow=${100 + offset}`,
        binary_base64: "",
        hex_preview: "60000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::1" },
              { name: "Destination", value: "2001:db8::2" },
              { name: "Next Header", value: "UDP" },
              { name: "Payload Length", value: "70" },
              { name: "Hop Limit", value: String(40 + offset) },
              { name: "Traffic Class", value: String(10 + offset) },
              { name: "Flow Label", value: String(100 + offset) }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "1025" },
              { name: "Destination Port", value: "12" },
              { name: "Length", value: "70" },
              { name: "Payload Length", value: "62" }
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
      profilePath: "ipv6-header-fe.yaml",
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
        profilePath: "ipv6-header-fe.yaml",
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
      workbenchStreams: [ipv6Stream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > UDP",
          field_expectation_count: 11
        })
      ])
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
            field: "IPv6.Traffic Class",
            expected_values: ["10", "11", "12", "13"],
            observed_values: ["10", "11", "12", "13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Flow Label",
            expected_values: ["100", "101", "102", "103"],
            observed_values: ["100", "101", "102", "103"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Hop Limit",
            expected_values: ["40", "41", "42", "43"],
            observed_values: ["40", "41", "42", "43"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["62"],
            observed_values: ["62"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("11/11");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-header-fe,IPv6.Flow Label");
  });

  it("matches IPv6 UDP port field engine against decoded capture fields", () => {
    const udpStream = {
      name: "ipv6-udp-port-fe",
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
      l4_src_port: 4000,
      l4_src_port_mode: "Increment",
      l4_src_port_count: 4,
      l4_src_port_step: 1,
      l4_dst_port_override: true,
      l4_dst_port: 5000,
      l4_dst_port_mode: "Increment",
      l4_dst_port_count: 4,
      l4_dst_port_step: 1,
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
        info: `IPv6 UDP ${4000 + offset} -> ${5000 + offset}`,
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
              { name: "Source Port", value: String(4000 + offset) },
              { name: "Destination Port", value: String(5000 + offset) },
              { name: "Length", value: "70" },
              { name: "Payload Length", value: "62" }
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
      generatedAt: "2026-06-10T00:08:20.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-udp-port-fe.yaml",
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
        startedAt: "2026-06-10T00:08:20.000Z",
        endedAt: "2026-06-10T00:08:22.000Z",
        profilePath: "ipv6-udp-port-fe.yaml",
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
          expected_layer_chain: "Ethernet > IPv6 > UDP",
          field_expectation_count: 11
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6 > UDP"]
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
            field: "UDP.Source Port",
            expected_values: ["4000", "4001", "4002", "4003"],
            observed_values: ["4000", "4001", "4002", "4003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Destination Port",
            expected_values: ["5000", "5001", "5002", "5003"],
            observed_values: ["5000", "5001", "5002", "5003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["62"],
            observed_values: ["62"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("11/11");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-udp-port-fe,UDP.Source Port");
  });

  it("matches IPv6 UDP checksum field engine against decoded capture fields", () => {
    const udpStream = {
      name: "ipv6-udp-checksum-fe",
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
      l4_src_port: 4000,
      l4_dst_port_override: true,
      l4_dst_port: 5000,
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
        destination: "2001:db8::20",
        source: "2001:db8::10",
        type: "IPv6/UDP",
        length: 128,
        wirelen: 128,
        info: `IPv6 UDP checksum=0x${(0xbeef + offset).toString(16)}`,
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
              { name: "Source Port", value: "4000" },
              { name: "Destination Port", value: "5000" },
              { name: "Length", value: "70" },
              { name: "Payload Length", value: "62" },
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
      generatedAt: "2026-06-10T00:09:20.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "ipv6-udp-checksum-fe.yaml",
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
        startedAt: "2026-06-10T00:09:20.000Z",
        endedAt: "2026-06-10T00:09:22.000Z",
        profilePath: "ipv6-udp-checksum-fe.yaml",
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
          expected_layer_chain: "Ethernet > IPv6 > UDP",
          field_expectation_count: 12
        })
      ])
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
            field: "UDP.Checksum",
            expected_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            observed_values: ["0xbeef", "0xbef0", "0xbef1", "0xbef2"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["62"],
            observed_values: ["62"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("12/12");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-udp-checksum-fe,UDP.Checksum");
  });

  it("matches IPv6 L3-only fields against decoded capture fields", () => {
    const ipv6Stream = {
      name: "ipv6-l3-only-fe",
      packet_type: "Ethernet/IPv6",
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
      ipv6_src_mode: "Increment Host",
      ipv6_src_count: 4,
      ipv6_src_step: 1,
      ipv6_dst: "2001:db8::20",
      ipv6_traffic_class: 171,
      ipv6_flow_label: 9029,
      ipv6_hop_limit: 40,
      ipv6_hop_limit_mode: "Increment",
      ipv6_hop_limit_count: 4,
      ipv6_hop_limit_step: 1,
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
        source: `2001:db8::1${offset}`,
        type: "IPv6",
        length: 128,
        wirelen: 128,
        info: `IPv6 l3-only src=2001:db8::1${offset}`,
        binary_base64: "",
        hex_preview: "60000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: `2001:db8::1${offset}` },
              { name: "Destination", value: "2001:db8::20" },
              { name: "Payload Length", value: "70" },
              { name: "Hop Limit", value: String(40 + offset) },
              { name: "Traffic Class", value: "171" },
              { name: "Flow Label", value: "9029" }
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
      profilePath: "ipv6-l3-only-fe.yaml",
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
        profilePath: "ipv6-l3-only-fe.yaml",
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
      workbenchStreams: [ipv6Stream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6",
          field_expectation_count: 6
        })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Source",
            expected_values: ["2001:db8::10", "2001:db8::11", "2001:db8::12", "2001:db8::13"],
            observed_values: ["2001:db8::10", "2001:db8::11", "2001:db8::12", "2001:db8::13"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["70"],
            observed_values: ["70"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Hop Limit",
            expected_values: ["40", "41", "42", "43"],
            observed_values: ["40", "41", "42", "43"],
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
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("6/6");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,ipv6-l3-only-fe,IPv6.Source");
  });
});
