import {
  buildRunReportCsv,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  it,
  type ProfileWorkbenchStream
} from "./runReportTestHarness";

describe("run report builder / ICMP", () => {
  it("matches IPv4 ICMP echo identifier and sequence field engines", () => {
    const icmpStream = {
      name: "icmp-echo-fe",
      packet_type: "Ethernet/IPv4/ICMP",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      icmp_type: 8,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_identifier_mode: "Increment",
      icmp_identifier_count: 4,
      icmp_identifier_step: 1,
      icmp_sequence: 7,
      icmp_sequence_mode: "Increment",
      icmp_sequence_count: 4,
      icmp_sequence_step: 1,
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
        type: "IPv4/ICMP",
        length: 96,
        wirelen: 96,
        info: `16.0.0.1 -> 48.0.0.1 ICMP Echo Request id=${4660 + offset} seq=${7 + offset}`,
        binary_base64: "",
        hex_preview: "4500004e000040004001",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("ICMP", "78"),
              { name: "TTL", value: "64" }
            ]
          },
          {
            name: "ICMP",
            fields: [
              { name: "Type", value: "8" },
              { name: "Type Name", value: "Echo Request" },
              { name: "Code", value: "0" },
              { name: "Identifier", value: String(4660 + offset) },
              { name: "Sequence", value: String(7 + offset) }
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
      generatedAt: "2026-06-10T00:10:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmp-echo-fe.yaml",
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
        startedAt: "2026-06-10T00:10:00.000Z",
        endedAt: "2026-06-10T00:10:02.000Z",
        profilePath: "icmp-echo-fe.yaml",
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
      workbenchStreams: [icmpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > ICMP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["ICMP"],
            observed_values: ["ICMP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["78"],
            observed_values: ["78"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Type",
            expected_values: ["8"],
            observed_values: ["8"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Type Name",
            expected_values: ["Echo Request"],
            observed_values: ["Echo Request"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Identifier",
            expected_values: ["4660", "4661", "4662", "4663"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Sequence",
            expected_values: ["7", "8", "9", "10"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("11/11");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmp-echo-fe,ICMP.Identifier");
  });

  it("matches ICMP echo reply identifier and sequence field engines", () => {
    const ipv4Stream = {
      name: "icmp-reply-fe",
      packet_type: "Ethernet/IPv4/ICMP",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      ipv4_src: "48.0.0.1",
      ipv4_dst: "16.0.0.1",
      ipv4_ttl: 64,
      icmp_type: 0,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_identifier_mode: "Increment",
      icmp_identifier_count: 4,
      icmp_identifier_step: 1,
      icmp_sequence: 7,
      icmp_sequence_mode: "Increment",
      icmp_sequence_count: 4,
      icmp_sequence_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const ipv6Stream = {
      name: "icmpv6-reply-fe",
      packet_type: "Ethernet/IPv6/ICMPv6",
      frame_length_type: "Fixed",
      frame_length: 96,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 2,
      flow_stats_enabled: false,
      latency_enabled: false,
      ipv6_src: "2001:db8::2",
      ipv6_dst: "2001:db8::1",
      ipv6_hop_limit: 64,
      icmp_type: 129,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_identifier_mode: "Increment",
      icmp_identifier_count: 4,
      icmp_identifier_step: 1,
      icmp_sequence: 7,
      icmp_sequence_mode: "Increment",
      icmp_sequence_count: 4,
      icmp_sequence_step: 1,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const ipv4Packets = [0, 1, 2, 3].map((offset) => ({
      index: offset + 1,
      time: 1 + offset / 1000,
      port: 1,
      mode: "RX",
      destination: "16.0.0.1",
      source: "48.0.0.1",
      type: "IPv4/ICMP",
      length: 96,
      wirelen: 96,
      info: `48.0.0.1 -> 16.0.0.1 ICMP Echo Reply id=${4660 + offset} seq=${7 + offset}`,
      binary_base64: "",
      hex_preview: "4500004e000040004001",
      decoded_layers: [
        { name: "Ethernet", fields: [] },
        {
          name: "IPv4",
          fields: [
            { name: "Source", value: "48.0.0.1" },
            { name: "Destination", value: "16.0.0.1" },
            ...ipv4EnvelopeFields("ICMP", "78"),
            { name: "TTL", value: "64" }
          ]
        },
        {
          name: "ICMP",
          fields: [
            { name: "Type", value: "0" },
            { name: "Type Name", value: "Echo Reply" },
            { name: "Code", value: "0" },
            { name: "Identifier", value: String(4660 + offset) },
            { name: "Sequence", value: String(7 + offset) }
          ]
        }
      ]
    }));
    const ipv6Packets = [0, 1, 2, 3].map((offset) => ({
      index: offset + 5,
      time: 2 + offset / 1000,
      port: 1,
      mode: "RX",
      destination: "2001:db8::1",
      source: "2001:db8::2",
      type: "IPv6/ICMPv6",
      length: 96,
      wirelen: 96,
      info: `2001:db8::2 -> 2001:db8::1 ICMPv6 echo reply id=${4660 + offset} seq=${7 + offset}`,
      binary_base64: "",
      hex_preview: "6000000000383a40",
      decoded_layers: [
        { name: "Ethernet", fields: [] },
        {
          name: "IPv6",
          fields: [
            { name: "Source", value: "2001:db8::2" },
            { name: "Destination", value: "2001:db8::1" },
            { name: "Next Header", value: "ICMPv6" },
            { name: "Payload Length", value: "38" },
            { name: "Hop Limit", value: "64" }
          ]
        },
        {
          name: "ICMPv6",
          fields: [
            { name: "Type", value: "129" },
            { name: "Type Name", value: "Echo Reply" },
            { name: "Code", value: "0" },
            { name: "Identifier", value: String(4660 + offset) },
            { name: "Sequence", value: String(7 + offset) }
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
      capturePackets: [...ipv4Packets, ...ipv6Packets],
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
      profilePath: "icmp-reply-fe.yaml",
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
        profilePath: "icmp-reply-fe.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [ipv4Stream, ipv6Stream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining(["Ethernet > IPv4 > ICMP", "Ethernet > IPv6 > ICMPv6"])
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            stream: "icmp-reply-fe",
            field: "ICMP.Type Name",
            expected_values: ["Echo Reply"],
            observed_values: ["Echo Reply"],
            missing_values: []
          }),
          expect.objectContaining({
            stream: "icmp-reply-fe",
            field: "ICMP.Identifier",
            expected_values: ["4660", "4661", "4662", "4663"],
            missing_values: []
          }),
          expect.objectContaining({
            stream: "icmp-reply-fe",
            field: "ICMP.Sequence",
            expected_values: ["7", "8", "9", "10"],
            missing_values: []
          }),
          expect.objectContaining({
            stream: "icmpv6-reply-fe",
            field: "ICMPv6.Type Name",
            expected_values: ["Echo Reply"],
            observed_values: ["Echo Reply"],
            missing_values: []
          }),
          expect.objectContaining({
            stream: "icmpv6-reply-fe",
            field: "ICMPv6.Identifier",
            expected_values: ["4660", "4661", "4662", "4663"],
            missing_values: []
          }),
          expect.objectContaining({
            stream: "icmpv6-reply-fe",
            field: "ICMPv6.Sequence",
            expected_values: ["7", "8", "9", "10"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("21/21");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmp-reply-fe,ICMP.Identifier");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-reply-fe,ICMPv6.Identifier");
  });

  it("matches ICMPv6 echo identifier and sequence fields", () => {
    const icmpStream = {
      name: "icmpv6-echo-fe",
      packet_type: "Ethernet/IPv6/ICMPv6",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      ipv6_hop_limit: 64,
      icmp_type: 128,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_identifier_mode: "Increment",
      icmp_identifier_count: 4,
      icmp_identifier_step: 1,
      icmp_sequence: 7,
      icmp_sequence_mode: "Increment",
      icmp_sequence_count: 4,
      icmp_sequence_step: 1,
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
        type: "IPv6/ICMPv6",
        length: 96,
        wirelen: 96,
        info: `2001:db8::1 -> 2001:db8::2 ICMPv6 echo id=${4660 + offset} seq=${7 + offset}`,
        binary_base64: "",
        hex_preview: "6000000000383a40",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv6",
            fields: [
              { name: "Source", value: "2001:db8::1" },
              { name: "Destination", value: "2001:db8::2" },
              { name: "Next Header", value: "ICMPv6" },
              { name: "Payload Length", value: "38" },
              { name: "Hop Limit", value: "64" }
            ]
          },
          {
            name: "ICMPv6",
            fields: [
              { name: "Type", value: "128" },
              { name: "Type Name", value: "Echo Request" },
              { name: "Code", value: "0" },
              { name: "Identifier", value: String(4660 + offset) },
              { name: "Sequence", value: String(7 + offset) }
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
      generatedAt: "2026-06-09T00:05:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-echo-fe.yaml",
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
        startedAt: "2026-06-09T00:05:00.000Z",
        endedAt: "2026-06-09T00:05:02.000Z",
        profilePath: "icmpv6-echo-fe.yaml",
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
      workbenchStreams: [icmpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv6 > ICMPv6"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["ICMPv6"],
            observed_values: ["ICMPv6"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["38"],
            observed_values: ["38"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type",
            expected_values: ["128"],
            observed_values: ["128"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Echo Request"],
            observed_values: ["Echo Request"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Code",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Identifier",
            expected_values: ["4660", "4661", "4662", "4663"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Sequence",
            expected_values: ["7", "8", "9", "10"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("10/10");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-echo-fe,ICMPv6.Identifier");
  });

  it("matches ICMPv6 echo type and code field engines", () => {
    const icmpStream = {
      name: "icmpv6-type-code-fe",
      packet_type: "Ethernet/IPv6/ICMPv6",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      ipv6_hop_limit: 64,
      icmp_type: 128,
      icmp_type_mode: "Increment",
      icmp_type_count: 2,
      icmp_type_step: 1,
      icmp_code: 0,
      icmp_code_mode: "Increment",
      icmp_code_count: 4,
      icmp_code_step: 1,
      icmp_identifier: 4660,
      icmp_sequence: 7,
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
        const type = 128 + (offset % 2);
        return {
          index: offset + 1,
          time: 1 + offset / 1000,
          port: 1,
          mode: "RX",
          destination: "2001:db8::2",
          source: "2001:db8::1",
          type: "IPv6/ICMPv6",
          length: 96,
          wirelen: 96,
          info: `2001:db8::1 -> 2001:db8::2 ICMPv6 type=${type} code=${offset}`,
          binary_base64: "",
          hex_preview: "6000000000383a40",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "2001:db8::1" },
                { name: "Destination", value: "2001:db8::2" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "38" },
                { name: "Hop Limit", value: "64" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: String(type) },
                { name: "Type Name", value: type === 128 ? "Echo Request" : "Echo Reply" },
                { name: "Code", value: String(offset) },
                { name: "Identifier", value: "4660" },
                { name: "Sequence", value: "7" }
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
      generatedAt: "2026-06-09T00:05:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-type-code-fe.yaml",
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
        startedAt: "2026-06-09T00:05:00.000Z",
        endedAt: "2026-06-09T00:05:02.000Z",
        profilePath: "icmpv6-type-code-fe.yaml",
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
      workbenchStreams: [icmpStream]
    });

    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "ICMPv6.Type",
            expected_values: ["128", "129"],
            observed_values: ["128", "129"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Echo Request", "Echo Reply"],
            observed_values: ["Echo Request", "Echo Reply"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Code",
            expected_values: ["0", "1", "2", "3"],
            observed_values: ["0", "1", "2", "3"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-type-code-fe,ICMPv6.Type");
  });

  it("matches fixed ICMP checksum override fields", () => {
    const icmpStream = {
      name: "icmp-checksum",
      packet_type: "Ethernet/IPv4/ICMP",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      icmp_type: 8,
      icmp_code: 0,
      icmp_checksum_override: true,
      icmp_checksum: "BEEF",
      icmp_identifier: 4660,
      icmp_sequence: 7,
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
          type: "IPv4/ICMP",
          length: 96,
          wirelen: 96,
          info: "16.0.0.1 -> 48.0.0.1 ICMP Echo Request id=4660 seq=7",
          binary_base64: "",
          hex_preview: "45000060108440004001",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("ICMP", "78"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "ICMP",
              fields: [
                { name: "Type", value: "8" },
                { name: "Type Name", value: "Echo Request" },
                { name: "Code", value: "0" },
                { name: "Checksum", value: "0xbeef" },
                { name: "Identifier", value: "4660" },
                { name: "Sequence", value: "7" }
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
      generatedAt: "2026-06-09T00:08:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmp-checksum.yaml",
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
        startedAt: "2026-06-09T00:08:00.000Z",
        endedAt: "2026-06-09T00:08:02.000Z",
        profilePath: "icmp-checksum.yaml",
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
      workbenchStreams: [icmpStream]
    });

    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.Protocol",
            expected_values: ["ICMP"],
            observed_values: ["ICMP"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv4.Total Length",
            expected_values: ["78"],
            observed_values: ["78"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Checksum",
            expected_values: ["0xbeef"],
            observed_values: ["0xbeef"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("12/12");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmp-checksum,ICMP.Checksum");
  });

  it("matches fixed ICMPv6 checksum override fields", () => {
    const icmpv6Stream = {
      name: "icmpv6-checksum",
      packet_type: "Ethernet/IPv6/ICMPv6",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      ipv6_hop_limit: 64,
      icmp_type: 128,
      icmp_code: 0,
      icmp_checksum_override: true,
      icmp_checksum: "BEEF",
      icmp_identifier: 4660,
      icmp_sequence: 7,
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
          destination: "2001:db8::2",
          source: "2001:db8::1",
          type: "IPv6/ICMPv6",
          length: 96,
          wirelen: 96,
          info: "2001:db8::1 -> 2001:db8::2 ICMPv6 Echo Request id=4660 seq=7",
          binary_base64: "",
          hex_preview: "6000000000263a40",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "2001:db8::1" },
                { name: "Destination", value: "2001:db8::2" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "38" },
                { name: "Hop Limit", value: "64" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "128" },
                { name: "Type Name", value: "Echo Request" },
                { name: "Code", value: "0" },
                { name: "Checksum", value: "0xbeef" },
                { name: "Identifier", value: "4660" },
                { name: "Sequence", value: "7" }
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
      generatedAt: "2026-06-10T00:10:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-checksum.yaml",
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
        startedAt: "2026-06-10T00:10:00.000Z",
        endedAt: "2026-06-10T00:10:02.000Z",
        profilePath: "icmpv6-checksum.yaml",
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
      workbenchStreams: [icmpv6Stream]
    });

    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["ICMPv6"],
            observed_values: ["ICMPv6"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["38"],
            observed_values: ["38"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Checksum",
            expected_values: ["0xbeef"],
            observed_values: ["0xbeef"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("11/11");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-checksum,ICMPv6.Checksum");
  });

  it("matches IPv4 and IPv6 ICMP echo reply fields", () => {
    const icmpReplyStream = {
      name: "icmp-reply",
      packet_type: "Ethernet/IPv4/ICMP",
      frame_length_type: "Fixed",
      frame_length: 96,
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
      icmp_type: 0,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_sequence: 7,
      gtpu_enabled: false,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const icmpv6ReplyStream = {
      name: "icmpv6-reply",
      packet_type: "Ethernet/IPv6/ICMPv6",
      frame_length_type: "Fixed",
      frame_length: 96,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous",
      rate_type: "pps",
      rate_value: 1000,
      enabled: true,
      self_start: true,
      next_stream_id: null,
      pg_id: 2,
      flow_stats_enabled: false,
      latency_enabled: false,
      ipv6_src: "2001:db8::2",
      ipv6_dst: "2001:db8::1",
      ipv6_hop_limit: 64,
      icmp_type: 129,
      icmp_code: 0,
      icmp_identifier: 4660,
      icmp_sequence: 7,
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
          type: "IPv4/ICMP",
          length: 96,
          wirelen: 96,
          info: "16.0.0.1 -> 48.0.0.1 ICMP Echo Reply id=4660 seq=7",
          binary_base64: "",
          hex_preview: "45000060108440004001",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("ICMP", "78"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "ICMP",
              fields: [
                { name: "Type", value: "0" },
                { name: "Type Name", value: "Echo Reply" },
                { name: "Code", value: "0" },
                { name: "Identifier", value: "4660" },
                { name: "Sequence", value: "7" }
              ]
            }
          ]
        },
        {
          index: 2,
          time: 1.001,
          port: 1,
          mode: "RX",
          destination: "2001:db8::1",
          source: "2001:db8::2",
          type: "IPv6/ICMPv6",
          length: 96,
          wirelen: 96,
          info: "2001:db8::2 -> 2001:db8::1 ICMPv6 Echo Reply id=4660 seq=7",
          binary_base64: "",
          hex_preview: "6000000000263a40",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "2001:db8::2" },
                { name: "Destination", value: "2001:db8::1" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "38" },
                { name: "Hop Limit", value: "64" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "129" },
                { name: "Type Name", value: "Echo Reply" },
                { name: "Code", value: "0" },
                { name: "Identifier", value: "4660" },
                { name: "Sequence", value: "7" }
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
      generatedAt: "2026-06-09T00:08:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmp-echo-reply.yaml",
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
        startedAt: "2026-06-09T00:08:30.000Z",
        endedAt: "2026-06-09T00:08:32.000Z",
        profilePath: "icmp-echo-reply.yaml",
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
      },
      trafficMultiplier: "1kpps",
      workbenchStreams: [icmpReplyStream, icmpv6ReplyStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > ICMP", "Ethernet > IPv6 > ICMPv6"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "ICMP.Type",
            expected_values: ["0"],
            observed_values: ["0"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMP.Type Name",
            expected_values: ["Echo Reply"],
            observed_values: ["Echo Reply"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["38"],
            observed_values: ["38"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type",
            expected_values: ["129"],
            observed_values: ["129"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Echo Reply"],
            observed_values: ["Echo Reply"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("21/21");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmp-reply,ICMP.Type Name");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-reply,ICMPv6.Type Name");
  });

  it("matches ICMPv6 router advertisement options and prefix fields", () => {
    const raStream = {
      name: "icmpv6-ra-fields",
      packet_type: "Ethernet/IPv6/ICMPv6",
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
      ipv6_src: "fe80::1",
      ipv6_dst: "ff02::1",
      ipv6_hop_limit: 255,
      icmp_type: 134,
      icmp_code: 0,
      icmpv6_ra_cur_hop_limit: 42,
      icmpv6_ra_managed: true,
      icmpv6_ra_other: true,
      icmpv6_ra_router_lifetime: 900,
      icmpv6_ra_reachable_time: 1234,
      icmpv6_ra_retrans_timer: 5678,
      icmpv6_ra_include_slla: true,
      icmpv6_ra_slla_mac: "66:55:44:33:22:11",
      icmpv6_ra_include_prefix: true,
      icmpv6_ra_prefix: "2001:db8:100::",
      icmpv6_ra_prefix_length: 64,
      icmpv6_ra_prefix_on_link: true,
      icmpv6_ra_prefix_autonomous: false,
      icmpv6_ra_prefix_valid_lifetime: 3600,
      icmpv6_ra_prefix_preferred_lifetime: 1800,
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
          destination: "ff02::1",
          source: "fe80::1",
          type: "IPv6/ICMPv6",
          length: 114,
          wirelen: 114,
          info: "fe80::1 -> ff02::1 ICMPv6 Router Advertisement",
          binary_base64: "",
          hex_preview: "6000000000383aff",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "fe80::1" },
                { name: "Destination", value: "ff02::1" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "56" },
                { name: "Hop Limit", value: "255" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "134" },
                { name: "Type Name", value: "Router Advertisement" },
                { name: "Code", value: "0" },
                { name: "Current Hop Limit", value: "42" },
                { name: "Flags", value: "0xc0" },
                { name: "Router Lifetime", value: "900" },
                { name: "Reachable Time", value: "1234" },
                { name: "Retrans Timer", value: "5678" },
                { name: "Option Type", value: "Source Link-Layer Address" },
                { name: "Option Length", value: "8" },
                { name: "Option MAC", value: "66:55:44:33:22:11" },
                { name: "Option Type", value: "Prefix Information" },
                { name: "Option Length", value: "32" },
                { name: "Prefix Length", value: "64" },
                { name: "Prefix Flags", value: "0x80" },
                { name: "Prefix Valid Lifetime", value: "3600" },
                { name: "Prefix Preferred Lifetime", value: "1800" },
                { name: "Prefix", value: "2001:db8:100::" }
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
      generatedAt: "2026-06-09T00:06:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-ra-fields.yaml",
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
        startedAt: "2026-06-09T00:06:00.000Z",
        endedAt: "2026-06-09T00:06:02.000Z",
        profilePath: "icmpv6-ra-fields.yaml",
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
      workbenchStreams: [raStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > ICMPv6",
          field_expectation_count: 21
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Next Header",
            expected_values: ["ICMPv6"],
            observed_values: ["ICMPv6"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["56"],
            observed_values: ["56"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Router Advertisement"],
            observed_values: ["Router Advertisement"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option Type",
            expected_values: ["Source Link-Layer Address", "Prefix Information"],
            observed_values: ["Source Link-Layer Address", "Prefix Information"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Prefix",
            expected_values: ["2001:db8:100::"],
            observed_values: ["2001:db8:100::"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("21/21");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-ra-fields,ICMPv6.Prefix");
  });

  it("matches ICMPv6 router solicitation source link-layer option fields", () => {
    const rsStream = {
      name: "icmpv6-rs-fields",
      packet_type: "Ethernet/IPv6/ICMPv6",
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
      ipv6_src: "fe80::1",
      ipv6_dst: "ff02::2",
      ipv6_hop_limit: 255,
      icmp_type: 133,
      icmp_code: 0,
      icmpv6_rs_include_slla: true,
      icmpv6_rs_slla_mac: "66:55:44:33:22:11",
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
          destination: "ff02::2",
          source: "fe80::1",
          type: "IPv6/ICMPv6",
          length: 74,
          wirelen: 74,
          info: "fe80::1 -> ff02::2 ICMPv6 Router Solicitation",
          binary_base64: "",
          hex_preview: "6000000000103aff",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "fe80::1" },
                { name: "Destination", value: "ff02::2" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "16" },
                { name: "Hop Limit", value: "255" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "133" },
                { name: "Type Name", value: "Router Solicitation" },
                { name: "Code", value: "0" },
                { name: "Reserved", value: "0x00000000" },
                { name: "Option Type", value: "Source Link-Layer Address" },
                { name: "Option Length", value: "8" },
                { name: "Option MAC", value: "66:55:44:33:22:11" }
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
      generatedAt: "2026-06-09T00:07:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-rs-fields.yaml",
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
        startedAt: "2026-06-09T00:07:30.000Z",
        endedAt: "2026-06-09T00:07:32.000Z",
        profilePath: "icmpv6-rs-fields.yaml",
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
      workbenchStreams: [rsStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > ICMPv6",
          field_expectation_count: 12
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["16"],
            observed_values: ["16"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Router Solicitation"],
            observed_values: ["Router Solicitation"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Reserved",
            expected_values: ["0x00000000"],
            observed_values: ["0x00000000"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option Type",
            expected_values: ["Source Link-Layer Address"],
            observed_values: ["Source Link-Layer Address"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option MAC",
            expected_values: ["66:55:44:33:22:11"],
            observed_values: ["66:55:44:33:22:11"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("12/12");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-rs-fields,ICMPv6.Reserved");
  });

  it("matches ICMPv6 neighbor solicitation target and source link-layer option fields", () => {
    const nsStream = {
      name: "icmpv6-ns-fields",
      packet_type: "Ethernet/IPv6/ICMPv6",
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
      ipv6_src: "fe80::1",
      ipv6_dst: "ff02::1:ff00:2",
      ipv6_hop_limit: 255,
      icmp_type: 135,
      icmp_code: 0,
      icmpv6_nd_target: "2001:db8::2",
      icmpv6_nd_include_option: true,
      icmpv6_nd_option_mac: "66:55:44:33:22:11",
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
          destination: "ff02::1:ff00:2",
          source: "fe80::1",
          type: "IPv6/ICMPv6",
          length: 90,
          wirelen: 90,
          info: "fe80::1 -> ff02::1:ff00:2 ICMPv6 Neighbor Solicitation",
          binary_base64: "",
          hex_preview: "6000000000203aff",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "fe80::1" },
                { name: "Destination", value: "ff02::1:ff00:2" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "32" },
                { name: "Hop Limit", value: "255" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "135" },
                { name: "Type Name", value: "Neighbor Solicitation" },
                { name: "Code", value: "0" },
                { name: "Flags", value: "0x00000000" },
                { name: "Target", value: "2001:db8::2" },
                { name: "Option Type", value: "Source Link-Layer Address" },
                { name: "Option Length", value: "8" },
                { name: "Option MAC", value: "66:55:44:33:22:11" }
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
      generatedAt: "2026-06-09T00:07:45.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "icmpv6-ns-fields.yaml",
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
        startedAt: "2026-06-09T00:07:45.000Z",
        endedAt: "2026-06-09T00:07:47.000Z",
        profilePath: "icmpv6-ns-fields.yaml",
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
      workbenchStreams: [nsStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > ICMPv6",
          field_expectation_count: 13
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["32"],
            observed_values: ["32"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Neighbor Solicitation"],
            observed_values: ["Neighbor Solicitation"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Target",
            expected_values: ["2001:db8::2"],
            observed_values: ["2001:db8::2"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option Type",
            expected_values: ["Source Link-Layer Address"],
            observed_values: ["Source Link-Layer Address"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option MAC",
            expected_values: ["66:55:44:33:22:11"],
            observed_values: ["66:55:44:33:22:11"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("13/13");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-ns-fields,ICMPv6.Target");
  });

  it("matches ICMPv6 neighbor advertisement target and option fields", () => {
    const naStream = {
      name: "icmpv6-na-fields",
      packet_type: "Ethernet/IPv6/ICMPv6",
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
      ipv6_src: "fe80::2",
      ipv6_dst: "ff02::1",
      ipv6_hop_limit: 255,
      icmp_type: 136,
      icmp_code: 0,
      icmpv6_nd_target: "2001:db8::2",
      icmpv6_nd_include_option: true,
      icmpv6_nd_option_mac: "66:55:44:33:22:11",
      icmpv6_nd_na_router: true,
      icmpv6_nd_na_solicited: true,
      icmpv6_nd_na_override: true,
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
          destination: "ff02::1",
          source: "fe80::2",
          type: "IPv6/ICMPv6",
          length: 90,
          wirelen: 90,
          info: "fe80::2 -> ff02::1 ICMPv6 Neighbor Advertisement",
          binary_base64: "",
          hex_preview: "6000000000203aff",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv6",
              fields: [
                { name: "Source", value: "fe80::2" },
                { name: "Destination", value: "ff02::1" },
                { name: "Next Header", value: "ICMPv6" },
                { name: "Payload Length", value: "32" },
                { name: "Hop Limit", value: "255" }
              ]
            },
            {
              name: "ICMPv6",
              fields: [
                { name: "Type", value: "136" },
                { name: "Type Name", value: "Neighbor Advertisement" },
                { name: "Code", value: "0" },
                { name: "Flags", value: "0xe0000000" },
                { name: "Target", value: "2001:db8::2" },
                { name: "Option Type", value: "Target Link-Layer Address" },
                { name: "Option Length", value: "8" },
                { name: "Option MAC", value: "66:55:44:33:22:11" }
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
      profilePath: "icmpv6-na-fields.yaml",
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
        startedAt: "2026-06-09T00:07:00.000Z",
        endedAt: "2026-06-09T00:07:02.000Z",
        profilePath: "icmpv6-na-fields.yaml",
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
      workbenchStreams: [naStream]
    });

    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected_layer_chain: "Ethernet > IPv6 > ICMPv6",
          field_expectation_count: 13
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv6.Payload Length",
            expected_values: ["32"],
            observed_values: ["32"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Type Name",
            expected_values: ["Neighbor Advertisement"],
            observed_values: ["Neighbor Advertisement"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Flags",
            expected_values: ["0xe0000000"],
            observed_values: ["0xe0000000"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Target",
            expected_values: ["2001:db8::2"],
            observed_values: ["2001:db8::2"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option Type",
            expected_values: ["Target Link-Layer Address"],
            observed_values: ["Target Link-Layer Address"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ICMPv6.Option MAC",
            expected_values: ["66:55:44:33:22:11"],
            observed_values: ["66:55:44:33:22:11"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("13/13");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,icmpv6-na-fields,ICMPv6.Target");
  });
});
