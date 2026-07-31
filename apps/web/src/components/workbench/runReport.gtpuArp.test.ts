import {
  buildRunReportCsv,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  it,
  type ProfileWorkbenchStream
} from "./runReportTestHarness";

describe("run report builder / GTP-U and ARP", () => {
  it("matches GTP-U inner IPv4 envelope fields against decoded capture fields", () => {
    const gtpuStream = {
      name: "gtpu-inner-ipv4-envelope",
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
      pg_id: 7,
      flow_stats_enabled: false,
      latency_enabled: false,
      src_ipv4: "16.0.0.1",
      dst_ipv4: "48.0.0.1",
      ipv4_ttl: 64,
      gtpu_enabled: true,
      gtpu_extension_enabled: true,
      gtpu_sequence_enabled: true,
      gtpu_sequence: 7,
      gtpu_sequence_mode: "Increment",
      gtpu_sequence_count: 4,
      gtpu_sequence_step: 1,
      gtpu_npdu_enabled: true,
      gtpu_npdu: 3,
      gtpu_npdu_mode: "Increment",
      gtpu_npdu_count: 4,
      gtpu_npdu_step: 1,
      gtpu_extension_udp_port: 65000,
      gtpu_extension_udp_port_mode: "Increment",
      gtpu_extension_udp_port_count: 4,
      gtpu_extension_udp_port_step: 1,
      gtpu_inner_ip_version: "IPv4",
      gtpu_inner_ipv4_src: "10.3.0.10",
      gtpu_inner_ipv4_src_mode: "Increment Host",
      gtpu_inner_ipv4_src_count: 4,
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_ipv4_dst: "10.3.0.20",
      gtpu_inner_ipv4_ttl: 40,
      gtpu_inner_ipv4_ttl_mode: "Increment",
      gtpu_inner_ipv4_ttl_count: 4,
      gtpu_inner_ipv4_ttl_step: 1,
      gtpu_inner_l4_src_port: 33000,
      gtpu_inner_l4_src_port_mode: "Increment",
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_inner_l4_dst_port: 33100,
      vxlan_enabled: false,
      advanced_mode: false,
      advanced_vm: null
    } as unknown as ProfileWorkbenchStream;
    const capturePackets = [0, 1, 2, 3].map((offset) => ({
      index: offset + 1,
      time: 1 + offset / 1000,
      port: 1,
      mode: "RX",
      destination: "48.0.0.1",
      source: "16.0.0.1",
      type: "IPv4/UDP",
      length: 90,
      wirelen: 90,
      info: `16.0.0.1:2152 -> 48.0.0.1:2152 GTP-U 10.3.0.${10 + offset}:33000`,
      binary_base64: "",
      hex_preview: "4500006e000040004011",
      decoded_layers: [
        { name: "Ethernet", fields: [] },
        {
          name: "IPv4",
          fields: [
            { name: "Source", value: "16.0.0.1" },
            { name: "Destination", value: "48.0.0.1" },
            ...ipv4EnvelopeFields("UDP", "72"),
            { name: "TTL", value: "64" }
          ]
        },
        {
          name: "UDP",
          fields: [
            { name: "Source Port", value: "2152" },
            { name: "Destination Port", value: "2152" },
            { name: "Length", value: "52" },
            { name: "Payload Length", value: "44" }
          ]
        },
        {
          name: "GTP-U",
          fields: [
            { name: "Flags", value: "0x37" },
            { name: "Version", value: "1" },
            { name: "Protocol Type", value: "GTP" },
            { name: "Message Type", value: "G-PDU (255)" },
            { name: "Length", value: "36" },
            { name: "Payload Length", value: "32" },
            { name: "TEID", value: "0x12345678" },
            { name: "Extension Header", value: "yes" },
            { name: "Sequence Number Present", value: "yes" },
            { name: "N-PDU Present", value: "yes" },
            { name: "Sequence", value: String(7 + offset) },
            { name: "N-PDU Number", value: String(3 + offset) },
            { name: "Next Extension Header", value: "0x40" }
          ]
        },
        {
          name: "GTP-U Extension",
          fields: [
            { name: "Type", value: "UDP Port (0x40)" },
            { name: "Length Units", value: "1" },
            { name: "Length", value: "4" },
            { name: "UDP Port", value: String(65000 + offset) },
            { name: "Next Extension Header", value: "0x00" }
          ]
        },
        {
          name: "IPv4",
          fields: [
            { name: "Source", value: `10.3.0.${10 + offset}` },
            { name: "Destination", value: "10.3.0.20" },
            ...ipv4EnvelopeFields("UDP", "28"),
            { name: "TTL", value: String(40 + offset) }
          ]
        },
        {
          name: "UDP",
          fields: [
            { name: "Source Port", value: String(33000 + offset) },
            { name: "Destination Port", value: "33100" },
            { name: "Length", value: "8" },
            { name: "Payload Length", value: "0" }
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
      capturePackets,
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
      profilePath: "gtpu-inner-ipv4-envelope.yaml",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: { global: { rx_bps: 1_000_000, rx_pps: 1000, tx_bps: 1_000_000, tx_pps: 1000 } },
        blocker: null,
        error: null
      },
      trafficSession: null,
      trafficMultiplier: "1kpps",
      workbenchStreams: [gtpuStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv4 > UDP"]
      })
    );
    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packet_type: "Ethernet/IPv4/UDP/GTP-U IPv4",
          field_expectation_count: 38
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4[2].Source",
            expected_values: ["10.3.0.10", "10.3.0.11", "10.3.0.12", "10.3.0.13"],
            observed_values: ["10.3.0.10", "10.3.0.11", "10.3.0.12", "10.3.0.13"],
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
            field: "UDP[2].Source Port",
            expected_values: ["33000", "33001", "33002", "33003"],
            observed_values: ["33000", "33001", "33002", "33003"],
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
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["52"],
            observed_values: ["52"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["44"],
            observed_values: ["44"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Length",
            expected_values: ["36"],
            observed_values: ["36"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Payload Length",
            expected_values: ["32"],
            observed_values: ["32"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("38/38");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,gtpu-inner-ipv4-envelope,IPv4[2].Total Length");
  });

  it("matches ARP stream intent against decoded capture fields", () => {
    const arpStream = {
      name: "arp-fe",
      packet_type: "Ethernet/ARP",
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
      arp_hardware_type: 1,
      arp_protocol_type: "0800",
      arp_hardware_size: 6,
      arp_protocol_size: 4,
      arp_operation: 1,
      arp_operation_mode: "Increment",
      arp_operation_count: 2,
      arp_operation_step: 1,
      arp_sender_mac: "00:11:22:33:44:50",
      arp_sender_mac_mode: "Increment",
      arp_sender_mac_count: 4,
      arp_sender_mac_step: 1,
      arp_sender_ip: "10.0.0.1",
      arp_sender_ip_mode: "Increment Host",
      arp_sender_ip_count: 4,
      arp_sender_ip_step: 1,
      arp_target_mac: "00:00:00:00:00:00",
      arp_target_ip: "10.0.0.2",
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
        destination: "ff:ff:ff:ff:ff:ff",
        source: `00:11:22:33:44:5${offset}`,
        type: "ARP",
        length: 64,
        wirelen: 64,
        info: `Who has 10.0.0.2? Tell 10.0.0.${offset + 1}`,
        binary_base64: "",
        hex_preview: "ffffffffffff0011223344500806",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "ARP",
            fields: [
              { name: "Hardware Type", value: "1" },
              { name: "Protocol Type", value: "0x0800" },
              { name: "Hardware Size", value: "6" },
              { name: "Protocol Size", value: "4" },
              { name: "Operation", value: offset % 2 === 0 ? "request" : "reply" },
              { name: "Sender MAC", value: `00:11:22:33:44:5${offset}` },
              { name: "Sender IP", value: `10.0.0.${offset + 1}` },
              { name: "Target MAC", value: "00:00:00:00:00:00" },
              { name: "Target IP", value: "10.0.0.2" }
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
      generatedAt: "2026-06-09T00:00:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "arp-fe.yaml",
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
        startedAt: "2026-06-09T00:00:00.000Z",
        endedAt: "2026-06-09T00:00:02.000Z",
        profilePath: "arp-fe.yaml",
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
      workbenchStreams: [arpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > ARP"]
      })
    );
    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "arp-fe",
          expected_layer_chain: "Ethernet > ARP",
          field_expectation_count: 9
        })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "ARP.Operation",
            expected_values: ["request", "reply"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Protocol Type",
            expected_values: ["0x0800"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Sender MAC",
            expected_values: [
              "00:11:22:33:44:50",
              "00:11:22:33:44:51",
              "00:11:22:33:44:52",
              "00:11:22:33:44:53"
            ],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Sender IP",
            expected_values: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("9/9");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,arp-fe,ARP.Sender MAC");
  });

  it("matches ARP reply stream intent against decoded capture fields", () => {
    const arpStream = {
      name: "arp-reply",
      packet_type: "Ethernet/ARP",
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
      arp_hardware_type: 1,
      arp_protocol_type: "0800",
      arp_hardware_size: 6,
      arp_protocol_size: 4,
      arp_operation: 2,
      arp_operation_mode: "Fixed",
      arp_operation_count: 4,
      arp_operation_step: 1,
      arp_sender_mac: "66:55:44:33:22:11",
      arp_sender_ip: "10.0.0.2",
      arp_target_mac: "00:11:22:33:44:55",
      arp_target_ip: "10.0.0.1",
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
          destination: "00:11:22:33:44:55",
          source: "66:55:44:33:22:11",
          type: "ARP",
          length: 64,
          wirelen: 64,
          info: "10.0.0.2 is at 66:55:44:33:22:11",
          binary_base64: "",
          hex_preview: "0011223344556655443322110806",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "ARP",
              fields: [
                { name: "Hardware Type", value: "1" },
                { name: "Protocol Type", value: "0x0800" },
                { name: "Hardware Size", value: "6" },
                { name: "Protocol Size", value: "4" },
                { name: "Operation", value: "reply" },
                { name: "Sender MAC", value: "66:55:44:33:22:11" },
                { name: "Sender IP", value: "10.0.0.2" },
                { name: "Target MAC", value: "00:11:22:33:44:55" },
                { name: "Target IP", value: "10.0.0.1" }
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
      generatedAt: "2026-06-10T00:00:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "arp-reply.yaml",
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
        startedAt: "2026-06-10T00:00:00.000Z",
        endedAt: "2026-06-10T00:00:02.000Z",
        profilePath: "arp-reply.yaml",
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
      workbenchStreams: [arpStream]
    });

    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: ["Ethernet > ARP"]
      })
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "pass",
        matched: expect.arrayContaining([
          expect.objectContaining({
            field: "ARP.Operation",
            expected_values: ["reply"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Sender MAC",
            expected_values: ["66:55:44:33:22:11"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Target MAC",
            expected_values: ["00:11:22:33:44:55"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "ARP.Target IP",
            expected_values: ["10.0.0.1"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("9/9");
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,matched,arp-reply,ARP.Operation");
  });
});
