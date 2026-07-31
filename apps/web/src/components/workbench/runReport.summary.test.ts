import {
  buildRunReportCsv,
  buildRunReportCsvFromArchiveContent,
  buildRunReportPdf,
  buildRunReportPdfFromArchiveContent,
  buildRunReportSnapshot,
  describe,
  expect,
  ipv4EnvelopeFields,
  it,
  type BuildRunReportInput,
  type ProfileWorkbenchStream,
  type RunReportCaptureFile,
  type RunReportTrafficSession,
  runReportCsvFileName,
  runReportPdfFileName
} from "./runReportTestHarness";

function captureOwnershipInput(
  files: RunReportCaptureFile[],
  trafficSession: RunReportTrafficSession | null,
  generatedAt = "2026-07-30T08:00:30.000Z"
): BuildRunReportInput {
  return {
    captureFilesResult: {
      ok: true,
      data: { root: "/tmp/captures", files },
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
    generatedAt,
    logRows: [],
    overview: null,
    portRecords: [],
    profilePath: "standard-e2e.py",
    selectedProfile: null,
    startResult: trafficSession?.startResult ?? null,
    statsHistory: [],
    statsResult: {
      ok: true,
      data: {
        global: {
          rx_bps: 1_000_000,
          rx_pps: 1000,
          tx_bps: 1_000_000,
          tx_pps: 1000
        }
      },
      blocker: null,
      error: null
    },
    templateId: "capture",
    trafficSession,
    trafficMultiplier: "1kpps",
    workbenchStreams: null
  };
}

function completedCaptureSession(): RunReportTrafficSession {
  return {
    startedAt: "2026-07-30T08:00:10.000Z",
    endedAt: "2026-07-30T08:00:20.000Z",
    profilePath: "standard-e2e.py",
    ports: [0, 1],
    multiplier: "1kpps",
    duration: 10,
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
  };
}

describe("run report builder / summary", () => {
  it("summarizes real state without leaking capture packet binary", () => {
    const gtpuStream = {
      name: "gtpu-inner-ipv6-fe",
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
      flow_stats_enabled: true,
      latency_enabled: true,
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
      gtpu_inner_ip_version: "IPv6",
      gtpu_inner_ipv6_src_mode: "Increment Host",
      gtpu_inner_ipv6_src_count: 4,
      gtpu_inner_ipv6_src_step: 1,
      gtpu_inner_l4_src_port_mode: "Increment",
      gtpu_inner_l4_src_port_count: 4,
      gtpu_inner_l4_src_port_step: 1,
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
        port: 0,
        mode: "RX",
        destination: "48.0.0.1",
        source: "16.0.0.1",
        type: "IPv4/UDP",
        length: 110,
        wirelen: 110,
        info: `16.0.0.1:2152 -> 48.0.0.1:2152 GTP-U 2001:db8:30::${offset + 1}:1025`,
        binary_base64: "AAAA",
        hex_preview: "00000000",
        decoded_layers: [
          { name: "Ethernet", fields: [] },
          {
            name: "IPv4",
            fields: [
              { name: "Source", value: "16.0.0.1" },
              { name: "Destination", value: "48.0.0.1" },
              ...ipv4EnvelopeFields("UDP", "92"),
              { name: "TTL", value: "127" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: "2152" },
              { name: "Destination Port", value: "2152" },
              { name: "Length", value: "72" },
              { name: "Payload Length", value: "64" }
            ]
          },
          {
            name: "GTP-U",
            fields: [
              { name: "Flags", value: "0x37" },
              { name: "Version", value: "1" },
              { name: "Protocol Type", value: "GTP" },
              { name: "Message Type", value: "G-PDU (255)" },
              { name: "Length", value: "56" },
              { name: "Payload Length", value: "52" },
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
            name: "IPv6",
            fields: [
              { name: "Source", value: `2001:db8:30::${offset + 1}` },
              { name: "Destination", value: "2001:db8:30::2" },
              { name: "Next Header", value: "UDP" },
              { name: "Payload Length", value: "8" },
              { name: "Hop Limit", value: "64" }
            ]
          },
          {
            name: "UDP",
            fields: [
              { name: "Source Port", value: String(1025 + offset) },
              { name: "Destination Port", value: "12" },
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
      generatedAt: "2026-06-05T00:00:00.000Z",
      logRows: [{ level: "Info", message: "Connected to TRex RPC" }],
      overview: null,
      portRecords: [],
      profilePath: "bench.py",
      selectedProfile: null,
      startResult: null,
      statsHistory: [],
      statsResult: {
        ok: true,
        data: {
          global: {
            rx_bps: 10_000_000,
            rx_pps: 1000,
            tx_bps: 10_000_000,
            tx_pps: 1000
          }
        },
        blocker: null,
        error: null
      },
      trafficSession: {
        startedAt: "2026-06-05T00:00:00.000Z",
        endedAt: "2026-06-05T00:00:02.500Z",
        profilePath: "bench.py",
        ports: [0, 1],
        multiplier: "100%",
        duration: -1,
        tunables: { size: 64 },
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
      trafficMultiplier: "100%",
      workbenchStreams: [gtpuStream]
    });

    expect(snapshot.fileName).toBe("trex-run-report-20260605T000000Z.json");
    expect(snapshot.conclusion.verdict).toBe("pass");
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Run control", status: "pass" }),
        expect.objectContaining({ label: "Throughput balance", status: "pass" }),
        expect.objectContaining({ label: "Loss and errors", status: "pass" }),
        expect.objectContaining({ label: "Capture coverage", status: "pass" }),
        expect.objectContaining({ label: "Profile/capture match", status: "pass" }),
        expect.objectContaining({ label: "Profile/capture fields", status: "pass" })
      ])
    );
    expect(snapshot.conclusion.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Traffic start", status: "pass", detail: "Start command accepted" }),
        expect.objectContaining({ label: "Traffic stop", status: "pass", detail: "Stop command accepted" }),
        expect.objectContaining({ label: "Stats snapshot", status: "pass" }),
        expect.objectContaining({ label: "Loss and errors", status: "pass" }),
        expect.objectContaining({ label: "Capture evidence", status: "pass" }),
        expect.objectContaining({ label: "Profile/capture match", status: "pass" }),
        expect.objectContaining({ label: "Profile/capture fields", status: "pass" })
      ])
    );
    expect(snapshot.markdown).toContain("bench.py");
    expect(snapshot.markdown).toContain("## Run Window");
    expect(snapshot.markdown).toContain("| Duration | 2.5 s |");
    expect(snapshot.markdown).toContain("| Ports | 0, 1 |");
    expect(snapshot.markdown).toContain("## Profile Streams");
    expect(snapshot.markdown).toContain("GTP-U inner IPv6 src: Increment Host x4 step 1");
    expect(snapshot.markdown).toContain("Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP");
    expect(snapshot.markdown).toContain("## Test Conclusion");
    expect(snapshot.markdown).toContain("| Verdict | Pass |");
    expect(snapshot.markdown).toContain("### Evidence Checklist");
    expect(snapshot.markdown).toContain("| Traffic start | pass | Start command accepted |");
    expect(snapshot.markdown).toContain("| Traffic stop | pass | Stop command accepted |");
    expect(snapshot.markdown).toContain("## Diagnostics");
    expect(snapshot.markdown).toContain("| Throughput balance | pass | TX/RX rate gap is 0% | No operator action required |");
    expect(snapshot.markdown).toContain("### Capture Packet Samples");
    expect(snapshot.markdown).toContain("Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP");
    expect(snapshot.markdown).toContain("| Profile/capture match | pass | Capture decode matched 1 expected stream layer chain(s) |");
    expect(snapshot.markdown).toContain("| Profile/capture fields | pass | Capture decode matched 37 expected profile field(s) |");
    expect(snapshot.markdown).toContain("### Profile/Capture Field Match");
    expect(snapshot.markdown).toContain("| gtpu-inner-ipv6-fe | IPv4.Source | pass | 16.0.0.1 | 16.0.0.1 | - |");
    expect(snapshot.payload.traffic_session).toEqual(
      expect.objectContaining({
        duration: "2.5 s",
        profile: "bench.py",
        ports: [0, 1],
        multiplier: "100%"
      })
    );
    expect(JSON.stringify(snapshot.payload)).not.toContain("binary_base64");
    expect(JSON.stringify(snapshot.payload)).not.toContain("AAAA");
    expect(snapshot.payload.capture_packets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer_chain: "Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP"
        })
      ])
    );
    expect(snapshot.payload.profile_streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "gtpu-inner-ipv6-fe",
          packet_type: "Ethernet/IPv4/UDP/GTP-U IPv6",
          expected_layer_chain: "Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP",
          field_engines: expect.arrayContaining([
            "GTP-U inner IPv6 src: Increment Host x4 step 1",
            "GTP-U Sequence: Increment x4 step 1",
            "GTP-U N-PDU: Increment x4 step 1",
            "GTP-U Extension UDP port: Increment x4 step 1",
            "GTP-U inner L4 src port: Increment x4 step 1"
          ]),
          field_expectation_count: 37
        })
      ])
    );
    expect(snapshot.metrics.find((metric) => metric.label === "Tx L2")?.value).toBe("10 Mb/s");
    expect(snapshot.metrics.find((metric) => metric.label === "Streams")?.value).toBe("1");
    expect(snapshot.metrics.find((metric) => metric.label === "Field engines")?.value).toBe("5");
    expect(snapshot.metrics.find((metric) => metric.label === "Layer matches")?.value).toBe("1/1");
    expect(snapshot.metrics.find((metric) => metric.label === "Field matches")?.value).toBe("37/37");
    expect(snapshot.payload.capture_layer_match).toEqual(
      expect.objectContaining({
        status: "pass",
        expected: ["Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP"],
        observed: ["Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP"],
        matched: ["Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP"],
        missing: []
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
            expected_values: ["92"],
            observed_values: ["92"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "IPv6.Source",
            expected_values: ["2001:db8:30::1", "2001:db8:30::2", "2001:db8:30::3", "2001:db8:30::4"],
            observed_values: ["2001:db8:30::1", "2001:db8:30::2", "2001:db8:30::3", "2001:db8:30::4"],
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
            expected_values: ["2152"],
            observed_values: ["2152"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Destination Port",
            expected_values: ["2152"],
            observed_values: ["2152"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Length",
            expected_values: ["72"],
            observed_values: ["72"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP.Payload Length",
            expected_values: ["64"],
            observed_values: ["64"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "UDP[2].Source Port",
            expected_values: ["1025", "1026", "1027", "1028"],
            observed_values: ["1025", "1026", "1027", "1028"],
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
            field: "GTP-U.Flags",
            expected_values: ["0x37"],
            observed_values: ["0x37"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Message Type",
            expected_values: ["G-PDU (255)"],
            observed_values: ["G-PDU (255)"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Length",
            expected_values: ["56"],
            observed_values: ["56"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Payload Length",
            expected_values: ["52"],
            observed_values: ["52"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.TEID",
            expected_values: ["0x12345678"],
            observed_values: ["0x12345678"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Extension Header",
            expected_values: ["yes"],
            observed_values: ["yes"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Sequence",
            expected_values: ["7", "8", "9", "10"],
            observed_values: ["7", "8", "9", "10"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.N-PDU Number",
            expected_values: ["3", "4", "5", "6"],
            observed_values: ["3", "4", "5", "6"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U.Next Extension Header",
            expected_values: ["0x40"],
            observed_values: ["0x40"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U Extension.Type",
            expected_values: ["UDP Port (0x40)"],
            observed_values: ["UDP Port (0x40)"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U Extension.Length",
            expected_values: ["4"],
            observed_values: ["4"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U Extension.UDP Port",
            expected_values: ["65000", "65001", "65002", "65003"],
            observed_values: ["65000", "65001", "65002", "65003"],
            missing_values: []
          }),
          expect.objectContaining({
            field: "GTP-U Extension.Next Extension Header",
            expected_values: ["0x00"],
            observed_values: ["0x00"],
            missing_values: []
          })
        ]),
        missing: []
      })
    );

    const csv = buildRunReportCsv(snapshot);
    expect(csv).toContain("conclusion,verdict,value,pass");
    expect(csv).toContain("summary,metric,Tx L2,10 Mb/s");
    expect(csv).toContain("conclusion,check,Traffic start,pass,Start command accepted");
    expect(csv).toContain("conclusion,check,Traffic stop,pass,Stop command accepted");
    expect(csv).toContain("diagnostics,Throughput balance,status,pass");
    expect(csv).toContain("diagnostics,Profile/capture match,status,pass");
    expect(csv).toContain("diagnostics,Profile/capture fields,status,pass");
    expect(csv).toContain("capture_layer_match,summary,status,pass,Capture decode matched 1 expected stream layer chain(s)");
    expect(csv).toContain("capture_field_match,summary,status,pass,Capture decode matched 37 expected profile field(s)");
    expect(csv).toContain("capture_field_match,matched,gtpu-inner-ipv6-fe,IPv6.Source");
    expect(csv).toContain("metadata,traffic,profile,bench.py");
    expect(csv).toContain("metadata,run,duration,2.5 s");
    expect(csv).toContain("metadata,run,ports,0 1");
    expect(csv).toContain("profile_streams,1,name,gtpu-inner-ipv6-fe");
    expect(csv).toContain("GTP-U inner IPv6 src: Increment Host x4 step 1");
    expect(csv).toContain("capture_packets,1,port,0,RX");
    expect(csv).toContain("layer_chain,Ethernet > IPv4 > UDP > GTP-U > GTP-U Extension > IPv6 > UDP");
    expect(csv).not.toContain("binary_base64");
    expect(csv).not.toContain("AAAA");

    const archiveCsv = buildRunReportCsvFromArchiveContent(JSON.stringify({
      title: snapshot.title,
      generated_at: snapshot.generatedAt,
      markdown: snapshot.markdown,
      payload: snapshot.payload
    }));
    expect(archiveCsv).toBe(csv);
    expect(runReportCsvFileName(snapshot.fileName)).toBe("trex-run-report-20260605T000000Z.csv");
    expect(runReportPdfFileName(snapshot.fileName)).toBe("trex-run-report-20260605T000000Z.pdf");

    const pdfText = new TextDecoder().decode(buildRunReportPdf(snapshot));
    expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfText).toContain("/Type /Catalog");
    expect(pdfText).toContain("TRex Run Report");
    expect(pdfText).toContain("bench.py");
    expect(pdfText).toContain("Evidence Checklist");
    expect(pdfText).toContain("Diagnostics");
    expect(pdfText).toContain("Capture Layer Match");
    expect(pdfText).toContain("Capture Field Match");
    expect(pdfText).toContain("Profile Streams");
    expect(pdfText).toContain("gtpu-inner-ipv6-fe Ethernet/IPv4/UDP/GTP-U IPv6");
    expect(pdfText).toContain("Throughput balance: pass");
    expect(pdfText).toContain("Profile/capture match: pass");
    expect(pdfText).toContain("Profile/capture fields: pass");
    expect(pdfText).toContain("Traffic start: pass - Start command accepted");
    expect(pdfText).not.toContain("binary_base64");
    expect(pdfText).not.toContain("AAAA");

    const archivePdfText = new TextDecoder().decode(buildRunReportPdfFromArchiveContent(JSON.stringify({
      title: snapshot.title,
      generated_at: snapshot.generatedAt,
      markdown: snapshot.markdown,
      payload: snapshot.payload
    })));
    expect(archivePdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(archivePdfText).toContain("Clean run window");
    expect(archivePdfText).toContain("Loss and errors: pass");
    expect(archivePdfText).toContain("Capture Layer Match");
    expect(archivePdfText).not.toContain("binary_base64");
  });

  it("does not count historical capture files as evidence for the current run", () => {
    const snapshot = buildRunReportSnapshot(captureOwnershipInput([
      {
        path: "/tmp/captures/historical.pcap",
        name: "historical.pcap",
        size_bytes: 4096,
        modified_time: "2026-07-30T07:59:59.000Z",
        download_available: true
      }
    ], completedCaptureSession()));

    expect(snapshot.metrics.find((metric) => metric.label === "Saved captures")?.value).toBe("0");
    expect(snapshot.metrics.find((metric) => metric.label === "Capture inventory")?.value).toBe("1");
    expect(snapshot.payload.capture_files).toEqual([]);
    expect(snapshot.payload.capture_file_inventory).toEqual({
      total: 1,
      linked: 0,
      unlinked: 1,
      scope: "closed_run_window",
      window_start: "2026-07-30T08:00:10.000Z",
      window_end: "2026-07-30T08:00:20.000Z"
    });
    expect(snapshot.diagnostics.find((item) => item.label === "Capture coverage")).toEqual(
      expect.objectContaining({
        status: "unknown",
        summary: expect.stringContaining("global capture file(s) are inventory context only")
      })
    );
    expect(snapshot.conclusion.checks.find((item) => item.label === "Capture evidence")).toEqual(
      expect.objectContaining({
        status: "unknown",
        detail: expect.stringContaining("global capture file(s) are inventory context only")
      })
    );
    expect(snapshot.template.criteria.find((item) => item.label === "Packet evidence")).toEqual(
      expect.objectContaining({
        status: "unknown",
        detail: expect.stringContaining("global capture file(s) are inventory context only")
      })
    );
  });

  it("keeps current-run Standard E2E PCAP files as capture evidence", () => {
    const snapshot = buildRunReportSnapshot(captureOwnershipInput([
      {
        path: "/tmp/captures/standard-e2e-modified.pcap",
        name: "standard-e2e-modified.pcap",
        size_bytes: 8192,
        modified_time: "2026-07-30T08:00:15.000Z",
        download_available: true
      },
      {
        path: "/tmp/captures/standard-e2e-generated.pcap",
        name: "standard-e2e-generated.pcap",
        size_bytes: 16384,
        generated_at: "2026-07-30T08:00:18.000Z",
        modified_time: "2026-07-30T07:00:00.000Z",
        download_available: true
      }
    ], completedCaptureSession()));

    expect(snapshot.metrics.find((metric) => metric.label === "Saved captures")?.value).toBe("2");
    expect(snapshot.metrics.find((metric) => metric.label === "Capture inventory")?.value).toBe("2");
    expect(snapshot.payload.capture_files).toEqual([
      expect.objectContaining({ name: "standard-e2e-modified.pcap" }),
      expect.objectContaining({
        name: "standard-e2e-generated.pcap",
        generated_at: "2026-07-30T08:00:18.000Z"
      })
    ]);
    expect(snapshot.payload.capture_file_inventory).toEqual(
      expect.objectContaining({
        total: 2,
        linked: 2,
        unlinked: 0,
        scope: "closed_run_window"
      })
    );
    expect(snapshot.diagnostics.find((item) => item.label === "Capture coverage")).toEqual(
      expect.objectContaining({ status: "pass" })
    );
    expect(snapshot.conclusion.checks.find((item) => item.label === "Capture evidence")).toEqual(
      expect.objectContaining({ status: "pass" })
    );
    expect(snapshot.template.criteria.find((item) => item.label === "Packet evidence")).toEqual(
      expect.objectContaining({ status: "pass" })
    );
  });

  it("keeps a PCAP saved during post-traffic capture finalization in the run evidence window", () => {
    const snapshot = buildRunReportSnapshot(captureOwnershipInput([
      {
        path: "/tmp/captures/finalized-after-stop.pcap",
        name: "finalized-after-stop.pcap",
        size_bytes: 8192,
        modified_time: "2026-07-30T08:00:24.000Z",
        download_available: true
      },
      {
        path: "/tmp/captures/unrelated-later.pcap",
        name: "unrelated-later.pcap",
        size_bytes: 4096,
        modified_time: "2026-07-30T08:00:26.000Z",
        download_available: true
      }
    ], {
      ...completedCaptureSession(),
      captureCompletedAt: "2026-07-30T08:00:25.000Z"
    }));

    expect(snapshot.payload.capture_files).toEqual([
      expect.objectContaining({ name: "finalized-after-stop.pcap" })
    ]);
    expect(snapshot.payload.capture_file_inventory).toEqual({
      total: 2,
      linked: 1,
      unlinked: 1,
      scope: "closed_run_window",
      window_start: "2026-07-30T08:00:10.000Z",
      window_end: "2026-07-30T08:00:25.000Z"
    });
    expect(snapshot.payload.traffic_session).toEqual(
      expect.objectContaining({
        capture_completed_at: "2026-07-30T08:00:25.000Z"
      })
    );
  });

  it("treats global capture files as neutral inventory when there is no run session", () => {
    const snapshot = buildRunReportSnapshot(captureOwnershipInput([
      {
        path: "/tmp/captures/unscoped.pcap",
        name: "unscoped.pcap",
        size_bytes: 2048,
        modified_time: "2026-07-30T08:00:30.000Z",
        download_available: true
      }
    ], null));

    expect(snapshot.metrics.find((metric) => metric.label === "Saved captures")?.value).toBe("0");
    expect(snapshot.metrics.find((metric) => metric.label === "Capture inventory")?.value).toBe("1");
    expect(snapshot.payload.capture_files).toEqual([]);
    expect(snapshot.payload.capture_file_inventory).toEqual({
      total: 1,
      linked: 0,
      unlinked: 1,
      scope: "no_run_session",
      window_start: null,
      window_end: null
    });
    expect(snapshot.diagnostics.find((item) => item.label === "Capture coverage")).toEqual(
      expect.objectContaining({
        status: "unknown",
        summary: expect.stringContaining("inventory context only")
      })
    );
    expect(snapshot.conclusion.checks.find((item) => item.label === "Capture evidence")).toEqual(
      expect.objectContaining({
        status: "unknown",
        detail: expect.stringContaining("inventory context only")
      })
    );
    expect(snapshot.template.criteria.find((item) => item.label === "Packet evidence")).toEqual(
      expect.objectContaining({
        status: "unknown",
        detail: expect.stringContaining("inventory context only")
      })
    );
  });
});
