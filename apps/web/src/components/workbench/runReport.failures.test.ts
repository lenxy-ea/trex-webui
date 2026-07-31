import {
  buildRunReportCsv,
  buildRunReportPdf,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  it,
  type ProfileWorkbenchStream
} from "./runReportTestHarness";

describe("run report builder / failures", () => {
  it("fails reports when capture decode does not match editable stream intent", () => {
    const stream = {
      name: "udp-intent",
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
      flow_stats_enabled: true,
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
      capturePackets: [
        {
          index: 5,
          time: 1,
          port: 1,
          mode: "RX",
          destination: "48.0.0.1",
          source: "16.0.0.1",
          type: "IPv4/TCP",
          length: 64,
          wirelen: 64,
          info: "unexpected TCP",
          binary_base64: "BBBB",
          hex_preview: "00000000",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            { name: "IPv4", fields: [] },
            { name: "TCP", fields: [] }
          ]
        }
      ],
      captureStatusResult: {
        ok: true,
        data: { captures: [] },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-05T00:00:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "profile.yaml",
      selectedProfile: null,
      startResult: {
        ok: true,
        data: { accepted: true },
        blocker: null,
        error: null
      },
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: {
            rx_bps: 1_000_000,
            rx_pps: 1000,
            tx_bps: 1_000_000,
            tx_pps: 1000
          },
          total: {
            opackets: 1000,
            ipackets: 1000
          }
        },
        blocker: null,
        error: null
      },
      trafficSession: {
        startedAt: "2026-06-05T00:00:20.000Z",
        endedAt: "2026-06-05T00:00:23.000Z",
        profilePath: "profile.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 3,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true },
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
      workbenchStreams: [stream]
    });

    expect(snapshot.conclusion.verdict).toBe("fail");
    expect(snapshot.conclusion.summary).toBe("Profile/capture mismatch: Captured layer chains did not match the loaded stream intent");
    expect(snapshot.conclusion.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Profile/capture match", status: "fail" })
      ])
    );
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Profile/capture match", status: "fail" })
      ])
    );
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "fail",
        expected: ["Ethernet > IPv4 > UDP"],
        observed: ["Ethernet > IPv4 > TCP"],
        matched: [],
        missing: ["Ethernet > IPv4 > UDP"],
        unexpected: ["Ethernet > IPv4 > TCP"]
      })
    );
    expect(buildRunReportCsv(snapshot)).toContain("capture_layer_match,missing,value,Ethernet > IPv4 > UDP");
  });

  it("fails reports when capture fields do not match editable stream intent", () => {
    const stream = {
      name: "udp-fields",
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
      gtpu_enabled: false,
      vxlan_enabled: false,
      ipv4_ttl: 127,
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
          index: 7,
          time: 1,
          port: 1,
          mode: "RX",
          destination: "48.0.0.1",
          source: "16.0.0.1",
          type: "IPv4/UDP",
          length: 64,
          wirelen: 64,
          info: "udp ttl mismatch",
          binary_base64: "CCCC",
          hex_preview: "00000000",
          decoded_layers: [
            { name: "Ethernet", fields: [] },
            {
              name: "IPv4",
              fields: [
                { name: "Source", value: "16.0.0.1" },
                { name: "Destination", value: "48.0.0.1" },
                ...ipv4EnvelopeFields("UDP", "46"),
                { name: "TTL", value: "64" }
              ]
            },
            {
              name: "UDP",
              fields: [
                { name: "Source Port", value: "1025" },
                { name: "Destination Port", value: "12" },
                { name: "Length", value: "26" },
                { name: "Payload Length", value: "18" }
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
      generatedAt: "2026-06-05T00:00:45.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "profile.yaml",
      selectedProfile: null,
      startResult: {
        ok: true,
        data: { accepted: true },
        blocker: null,
        error: null
      },
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: {
            rx_bps: 1_000_000,
            rx_pps: 1000,
            tx_bps: 1_000_000,
            tx_pps: 1000
          },
          total: {
            opackets: 1000,
            ipackets: 1000
          }
        },
        blocker: null,
        error: null
      },
      trafficSession: {
        startedAt: "2026-06-05T00:00:40.000Z",
        endedAt: "2026-06-05T00:00:43.000Z",
        profilePath: "profile.yaml",
        ports: [0],
        multiplier: "1kpps",
        duration: 3,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true },
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
      workbenchStreams: [stream]
    });

    expect(snapshot.conclusion.verdict).toBe("fail");
    expect(snapshot.conclusion.summary).toBe("Profile/capture field mismatch: Capture decode missed 1 expected profile field(s)");
    expect(snapshot.conclusion.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Profile/capture match", status: "pass" }),
        expect.objectContaining({ label: "Profile/capture fields", status: "fail" })
      ])
    );
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Profile/capture fields", status: "fail" })
      ])
    );
    expect(snapshot.payload.capture_field_match).toEqual(
      expect.objectContaining({
        status: "fail",
        missing: expect.arrayContaining([
          expect.objectContaining({
            field: "IPv4.TTL",
            expected_values: ["127"],
            observed_values: ["64"],
            missing_values: ["127"]
          })
        ])
      })
    );
    expect(buildRunReportCsv(snapshot)).toContain("capture_field_match,missing,udp-fields,IPv4.TTL,127,64,127");
  });

  it("flags failed runs when stats show drops queue pressure or errors", () => {
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: null,
      capturePackets: [],
      captureStatusResult: null,
      generatedAt: "2026-06-05T00:01:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [{
        id: 0,
        acquired: true,
        info: { status: "IDLE", link: "UP" }
      }],
      profilePath: "loss.py",
      selectedProfile: null,
      startResult: {
        ok: true,
        data: { accepted: true },
        blocker: null,
        error: null
      },
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          "0": {
            ierrors: 1
          },
          global: {
            rx_drop_bps: 1_000,
            queue_full: 2,
            tx_pps: 100,
            rx_pps: 90
          },
          latency: {
            "1": {
              err: {
                dropped: 3
              }
            }
          },
          total: {
            opackets: 1000,
            ipackets: 900
          }
        },
        blocker: null,
        error: null
      },
      trafficMultiplier: "100%"
    });

    expect(snapshot.conclusion.verdict).toBe("fail");
    expect(snapshot.conclusion.reasons).toContain("Drop rate 1 Kb/s");
    expect(snapshot.conclusion.reasons).toContain("Queue full 2");
    expect(snapshot.conclusion.reasons).toContain("Port errors 1");
    expect(snapshot.conclusion.reasons).toContain("Latency errors 3");
    expect(snapshot.conclusion.reasons).toContain("Total packet delta 100");
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Loss and errors", status: "fail" }),
        expect.objectContaining({ label: "Latency", status: "fail" })
      ])
    );
    expect(snapshot.conclusion.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Loss and errors", status: "fail" }),
        expect.objectContaining({ label: "Capture evidence", status: "unknown" })
      ])
    );
    expect(snapshot.markdown).toContain("| Verdict | Fail |");
    expect(snapshot.markdown).toContain("| Loss and errors | fail | drop 1 Kb/s; queue full 2; port errors 1; latency errors 3 |");

    const csv = buildRunReportCsv(snapshot);
    expect(csv).toContain("conclusion,verdict,value,fail");
    expect(csv).toContain("conclusion,reason,1,Drop rate 1 Kb/s");
    expect(csv).toContain("conclusion,check,Loss and errors,fail");
    expect(csv).toContain("diagnostics,Loss and errors,status,fail");
  });

  it("applies latency validation template gates to the conclusion and exports", () => {
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: null,
      capturePackets: [],
      captureStatusResult: null,
      generatedAt: "2026-06-05T00:01:15.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "latency.py",
      selectedProfile: null,
      startResult: {
        ok: true,
        data: { accepted: true },
        blocker: null,
        error: null
      },
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: {
            tx_bps: 1_000_000,
            rx_bps: 1_000_000,
            tx_pps: 100,
            rx_pps: 100
          },
          total: {
            opackets: 1000,
            ipackets: 1000
          }
        },
        blocker: null,
        error: null
      },
      templateId: "latency",
      trafficSession: {
        startedAt: "2026-06-05T00:01:10.000Z",
        endedAt: "2026-06-05T00:01:12.000Z",
        profilePath: "latency.py",
        ports: [0],
        multiplier: "100pps",
        duration: 2,
        tunables: {},
        startResult: {
          ok: true,
          data: { accepted: true },
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
      trafficMultiplier: "100pps"
    });

    expect(snapshot.template.label).toBe("Latency Validation");
    expect(snapshot.template.verdict).toBe("unknown");
    expect(snapshot.conclusion.verdict).toBe("unknown");
    expect(snapshot.conclusion.title).toBe("Latency Validation Missing Evidence");
    expect(snapshot.conclusion.reasons).toContain("Latency sample: No latency average was attached");
    expect(snapshot.markdown).toContain("| Template | Latency Validation |");
    expect(snapshot.markdown).toContain("### Template Criteria");
    expect(snapshot.markdown).toContain("| Latency sample | unknown | No latency average was attached |");
    expect(snapshot.payload.report_template).toEqual(
      expect.objectContaining({
        id: "latency",
        label: "Latency Validation",
        verdict: "unknown"
      })
    );

    const csv = buildRunReportCsv(snapshot);
    expect(csv).toContain("metadata,report,template,Latency Validation");
    expect(csv).toContain("template,criterion,Latency sample,unknown,No latency average was attached");

    const pdfText = new TextDecoder().decode(buildRunReportPdf(snapshot));
    expect(pdfText).toContain("Template: Latency Validation");
    expect(pdfText).toContain("Template Criteria");
    expect(pdfText).toContain("Latency sample: unknown - No latency average was attached");
  });

  it("does not count tiny post-stop stat residue as active ports", () => {
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: null,
      capturePackets: [],
      captureStatusResult: null,
      generatedAt: "2026-06-05T00:01:30.000Z",
      logRows: [],
      overview: null,
      portRecords: [
        { id: 0, acquired: false, info: { status: "IDLE", link: "UP" } },
        { id: 1, acquired: false, info: { status: "IDLE", link: "UP" } }
      ],
      profilePath: "udp_1pkt_simple.py",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          "0": { tx_pps: 2e-14, rx_pps: 0, tx_bps: 1e-11, rx_bps: 0 },
          "1": { tx_pps: 0, rx_pps: 2e-14, tx_bps: 0, rx_bps: 1e-11 },
          total: { opackets: 2006, ipackets: 2006 }
        },
        blocker: null,
        error: null
      },
      trafficMultiplier: "1"
    });

    expect(snapshot.metrics.find((metric) => metric.label === "Active ports")?.value).toBe("0");
  });

  it("marks active ports as zero after a successful stop even while rate counters decay", () => {
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: null,
      capturePackets: [],
      captureStatusResult: null,
      generatedAt: "2026-06-05T00:01:45.000Z",
      logRows: [],
      overview: null,
      portRecords: [
        { id: 0, acquired: false, info: { status: "STREAMS", link: "UP" } },
        { id: 1, acquired: false, info: { status: "STREAMS", link: "UP" } }
      ],
      profilePath: "udp_1pkt_simple.py",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          "0": { tx_pps: 1, rx_pps: 0, tx_bps: 512, rx_bps: 0 },
          "1": { tx_pps: 0, rx_pps: 1, tx_bps: 0, rx_bps: 512 },
          global: { tx_pps: 1, rx_pps: 1, tx_bps: 512, rx_bps: 512 },
          total: { opackets: 4, ipackets: 4 }
        },
        blocker: null,
        error: null
      },
      trafficSession: {
        startedAt: "2026-06-05T00:01:40.000Z",
        endedAt: "2026-06-05T00:01:42.000Z",
        profilePath: "udp_1pkt_simple.py",
        ports: [0],
        multiplier: "1",
        duration: -1,
        tunables: {},
        startResult: null,
        stopResult: {
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        }
      },
      trafficMultiplier: "1"
    });

    expect(snapshot.metrics.find((metric) => metric.label === "Active ports")?.value).toBe("0");
    expect(snapshot.metrics.find((metric) => metric.label === "Tx PPS")?.value).toBe("1 pps");
  });

  it("explains capture service-mode flow-stats start failures", () => {
    const snapshot = buildRunReportSnapshot({
      captureFilesResult: null,
      capturePackets: [],
      captureStatusResult: {
        ok: true,
        data: {
          captures: [{ id: 22, state: "ACTIVE", count: 0, bytes: 0, mode: "fixed", filter: { rx: 2, tx: 0, bpf: "udp" } }]
        },
        blocker: null,
        error: null
      },
      generatedAt: "2026-06-05T00:02:00.000Z",
      logRows: [],
      overview: null,
      portRecords: [],
      profilePath: "flow_stats.yaml",
      selectedProfile: null,
      startResult: {
        ok: false,
        data: null,
        blocker: "trex_command_failed",
        error: "\u001b[1mPort 0 : *** Port 1 is under service mode, can't use flow_stats.\u001b[22m"
      },
      statsHistory: [],
      statsResult: null,
      trafficMultiplier: "1kpps"
    });

    expect(snapshot.conclusion.verdict).toBe("fail");
    expect(snapshot.conclusion.summary).toBe(
      "Start blocked: TRex cannot start a flow-stats stream while a capture has the peer port in service mode"
    );
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Run control", status: "fail" }),
        expect.objectContaining({ label: "Capture coverage", status: "warn" })
      ])
    );
    expect(snapshot.conclusion.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Traffic start", status: "fail" }),
        expect.objectContaining({ label: "Stats snapshot", status: "unknown" }),
        expect.objectContaining({ label: "Capture evidence", status: "unknown" })
      ])
    );
    expect(snapshot.conclusion.reasons).toContain(
      "Stop the active capture recorder or disable RX Stats/Latency on the stream before starting traffic"
    );
    expect(snapshot.markdown).toContain("TRex cannot start a flow-stats stream");
    expect(buildRunReportCsv(snapshot)).toContain("conclusion,reason,2,Stop the active capture recorder");
  });
});
