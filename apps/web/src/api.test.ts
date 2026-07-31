import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquirePorts,
  applyPortConfiguration,
  cancelQuickValidation,
  clearApiLogEntries,
  clearTrexStats,
  connectTrex,
  deleteProfile,
  duplicateProfile,
  downloadCaptureFile,
  downloadRunReport,
  exportProfileJson,
  exportProfileWorkbenchYaml,
  exportProfileWorkbenchPcap,
  fetchDaemonConfigAudit,
  fetchDaemonDevicesInfo,
  fetchDaemonFileContent,
  fetchDaemonFiles,
  fetchDaemonTrexLatestDump,
  fetchDaemonTrexLog,
  fetchDaemonTrexReservation,
  fetchDaemonTrexRunningInfo,
  fetchDaemonTrexStatus,
  fetchDaemonTrexVersion,
  fetchCapture,
  fetchCaptureFiles,
  fetchCaptureStatus,
  fetchPortXstats,
  fetchProfiles,
  fetchQuickValidation,
  fetchRunReportTrends,
  fetchRunReports,
  fetchSystemOverview,
  fetchTrafficRuntime,
  getApiLogEntries,
  importProfileWorkbenchPcap,
  openCaptureFile,
  pingFromPort,
  removeCapture,
  removeAllCaptures,
  renderProfileWorkbench,
  resolvePortsArp,
  restoreDaemonConfigVersion,
  saveRunReport,
  scanPortsIpv6,
  startCapture,
  startDaemonTrex,
  startQuickValidation,
  stopCapture,
  stopDaemonTrex,
  subscribeApiLogEntries,
  updateTraffic
} from "./api";

function stubJsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload
  };
}

function stubRealJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("TRex connection API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a connection switch when backend disconnect cleanup fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse({
      ok: false,
      data: {
        disconnected: false,
        client_cached: true,
        phase: "capture_remove",
        remaining_capture_ids: [7]
      },
      blocker: "trex_disconnect_cleanup_failed",
      error: "remove failed"
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(connectTrex({
      host: "trex.lab",
      sync_port: 4501,
      async_port: 4500,
      scapy_port: 4507,
      client_name: "Client1",
      timeout_seconds: 3
    })).rejects.toThrow("trex_disconnect_cleanup_failed: remove failed");
  });
});

describe("daemon API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches daemon devices info from the real daemon endpoint", async () => {
    const payload = {
      ok: true,
      source: "daemon:get_devices_info",
      host: "10.0.0.10",
      port: 8090,
      devices_info: {
        "0000:02:00.0": {
          Slot_str: "0000:02:00.0"
        }
      }
    };
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDaemonDevicesInfo()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/system/daemon/devices");
  });

  it("fetches daemon file browser roots and explicit paths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_files_list",
          host: "10.0.0.10",
          port: 8090,
          path: "/tmp/trex-files",
          directories: ["configs"],
          files: ["trex_cfg.yaml"]
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_files_list",
          host: "10.0.0.10",
          port: 8090,
          path: "/tmp/trex-files/configs",
          directories: [],
          files: ["lab.yaml"]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchDaemonFiles();
    await fetchDaemonFiles("/tmp/trex-files/configs");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/system/daemon/files");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/system/daemon/files?path=%2Ftmp%2Ftrex-files%2Fconfigs");
  });

  it("fetches daemon file content with bounded preview size", async () => {
    const payload = {
      ok: true,
      source: "daemon:get_file",
      host: "10.0.0.10",
      port: 8090,
      path: "/tmp/trex-files/trex_cfg.yaml",
      max_bytes: 4096,
      size_bytes: 18,
      truncated: false,
      content: "port_limit: 2\n",
      content_base64: "cG9ydF9saW1pdDogMgo="
    };
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDaemonFileContent("/tmp/trex-files/trex_cfg.yaml", 4096)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/system/daemon/files/content?path=%2Ftmp%2Ftrex-files%2Ftrex_cfg.yaml&max_bytes=4096"
    );
  });

  it("restores daemon config versions through the project-owned API route", async () => {
    const payload = {
      ok: true,
      source: "local:daemon_config_version_restore",
      root_path: "/var/log/trex/config-versions",
      name: "20260607T120000000000Z-manual-8d1a6db7c5b1.yaml",
      restored: true,
      config_path: "/etc/trex_cfg.yaml",
      before_version: null,
      restored_version: null,
      audit_record: { action: "restore" },
      audit_written: true
    };
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreDaemonConfigVersion(payload.name, "restore-config")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/system/daemon/config/versions/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ name: payload.name, confirmation: "restore-config" })
    });
  });

  it("fetches daemon config audit records through the project-owned API route", async () => {
    const payload = {
      ok: true,
      source: "local:daemon_config_audit",
      root_path: "/var/log/trex/config-versions",
      audit_path: "/var/log/trex/config-versions/audit.jsonl",
      limit: 25,
      records: [
        {
          action: "restore",
          created_at: "2026-06-08T00:00:00+00:00",
          config_path: "/etc/trex_cfg.yaml",
          restored_name: "20260607T120000000000Z-manual-8d1a6db7c5b1.yaml",
          restored_sha256: "8d1a6db7c5b174f9687a131ce254f2b9ad36a1b6af2adfa91edc46111e2ce540",
          before_name: "20260607T121000000000Z-restore_before-111111111111.yaml",
          host: "127.0.0.1",
          daemon_port: 8090
        },
        {
          action: "start",
          created_at: "2026-06-08T00:01:00+00:00",
          config_path: "/tmp/trex-files/unit",
          version_name: "20260608T000100000000Z-start-aaaaaaaaaaaa.yaml",
          version_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          sequence: 17,
          config_filename: "unit",
          files_path: "/tmp/trex-files",
          user: "unit",
          host: "127.0.0.1",
          daemon_port: 8090
        }
      ],
      truncated: false,
      skipped_lines: 0
    };
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDaemonConfigAudit(25)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/system/daemon/config/audit?limit=25");
  });

  it("fetches daemon TRex runtime endpoints through project-owned routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:trex_runtime_status",
          host: "10.0.0.10",
          port: 8090,
          running: true,
          status: { state: 2, verbose: "Running" },
          commands: [["1234", "./t-rex-64 --stl"]]
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_trex_version",
          host: "10.0.0.10",
          port: 8090,
          version: "v3.06"
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_trex_log",
          host: "10.0.0.10",
          port: 8090,
          max_bytes: 65536,
          size_bytes: 12,
          truncated: false,
          content: "TRex ready\n"
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_running_info",
          host: "10.0.0.10",
          port: 8090,
          data: { global: { cpu_util: 1.2 } }
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:get_latest_dump",
          host: "10.0.0.10",
          port: 8090,
          data: { ports: {} }
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:is_reserved",
          host: "10.0.0.10",
          port: 8090,
          reserved: false
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchDaemonTrexStatus();
    await fetchDaemonTrexVersion();
    await fetchDaemonTrexLog();
    await fetchDaemonTrexRunningInfo();
    await fetchDaemonTrexLatestDump();
    await fetchDaemonTrexReservation();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/system/daemon/trex/status",
      "/api/system/daemon/trex/version",
      "/api/system/daemon/trex/log",
      "/api/system/daemon/trex/running-info",
      "/api/system/daemon/trex/latest-dump",
      "/api/system/daemon/trex/reservation"
    ]);
  });

  it("posts daemon TRex start and stop confirmations through project-owned routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:start_trex",
          host: "10.0.0.10",
          port: 8090,
          action: "start",
          sequence: 7
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          source: "daemon:force_trex_kill",
          host: "10.0.0.10",
          port: 8090,
          action: "stop",
          stopped: true
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await startDaemonTrex("port_limit: 2\n", 40, "start-trex");
    await stopDaemonTrex("stop-trex");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/system/daemon/trex/start",
      expect.objectContaining({
        body: JSON.stringify({
          config_content: "port_limit: 2\n",
          timeout_seconds: 40,
          confirmation: "start-trex"
        }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/system/daemon/trex/stop",
      expect.objectContaining({
        body: JSON.stringify({ confirmation: "stop-trex" }),
        method: "POST"
      })
    );
  });

  it("posts original port configuration workflows through project-owned routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { hosts: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { records: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await applyPortConfiguration({
      port: 0,
      mode: "L3",
      l2_destination: null,
      l3_source: "1.1.1.1",
      l3_destination: "2.2.2.2",
      vlan: [100]
    });
    await resolvePortsArp({ ports: [0], confirmation: null, retries: 1, vlan: [100] });
    await scanPortsIpv6({ ports: [0], confirmation: null, timeout_seconds: 10 });
    await pingFromPort({ port: 0, destination: "2.2.2.2", pkt_size: 64, count: 5, interval_sec: 1, vlan: null });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/trex/ports/configuration/apply",
      expect.objectContaining({
        body: JSON.stringify({
          port: 0,
          mode: "L3",
          l2_destination: null,
          l3_source: "1.1.1.1",
          l3_destination: "2.2.2.2",
          vlan: [100]
        }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/ports/arp/resolve",
      expect.objectContaining({
        body: JSON.stringify({ ports: [0], confirmation: null, retries: 1, vlan: [100] }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/ports/ipv6/scan",
      expect.objectContaining({
        body: JSON.stringify({ ports: [0], confirmation: null, timeout_seconds: 10 }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/trex/ports/ping",
      expect.objectContaining({
        body: JSON.stringify({ port: 0, destination: "2.2.2.2", pkt_size: 64, count: 5, interval_sec: 1, vlan: null }),
        method: "POST"
      })
    );
  });

  it("uses project-owned stats clear and hardware counters routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { port: 1, xstats: { tx_good_packets: 42 } } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPortXstats(1);
    await clearTrexStats({
      ports: [1],
      confirmation: null,
      clear_global: false,
      clear_flow_stats: true,
      clear_latency_stats: true,
      clear_xstats: true
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/trex/ports/xstats?port=1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/stats/clear",
      expect.objectContaining({
        body: JSON.stringify({
          ports: [1],
          confirmation: null,
          clear_global: false,
          clear_flow_stats: true,
          clear_latency_stats: true,
          clear_xstats: true
        }),
        method: "POST"
      })
    );
  });

  it("posts traffic rate updates through the project-owned route", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTraffic({
      ports: [0],
      multiplier: "100%",
      force: false,
      total: false,
      expected_session_id: "session-123"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/update",
      expect.objectContaining({
        body: JSON.stringify({
          ports: [0],
          multiplier: "100%",
          force: false,
          total: false,
          expected_session_id: "session-123"
        }),
        method: "POST"
      })
    );
  });

  it("uses project-owned profile file operation routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, profile: { relative_path: "copy.yaml" } } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, profile: { relative_path: "copy.yaml" } } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, file_name: "profile.json", content: "{}" } }));
    vi.stubGlobal("fetch", fetchMock);

    await duplicateProfile("profile.yaml", "copy.yaml");
    await deleteProfile("copy.yaml", "delete-profile");
    await exportProfileJson("profile.yaml");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/trex/profiles/duplicate",
      expect.objectContaining({
        body: JSON.stringify({ profile_path: "profile.yaml", target_name: "copy.yaml" }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/profiles/delete",
      expect.objectContaining({
        body: JSON.stringify({ profile_path: "copy.yaml", confirmation: "delete-profile" }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/profiles/export-json",
      expect.objectContaining({
        body: JSON.stringify({ profile_path: "profile.yaml" }),
        method: "POST"
      })
    );
  });

  it("renders workbench packet previews through the project-owned route", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      stubJsonResponse({
        ok: true,
        data: {
          content: "---\n[]\n",
          streams: [],
          packet_previews: [
            {
              index: 1,
              name: "stream",
              packet_type: "Ethernet/IPv4/TCP",
              frame_length: 96,
              wire_length: 96,
              binary_base64: "",
              hex: "",
              hex_lines: [],
              layers: []
            }
          ]
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderProfileWorkbench([
      {
        name: "stream",
        packet_type: "Ethernet/IPv4/TCP",
        frame_length_type: "Fixed",
        frame_length: 96,
        frame_length_min: 64,
        frame_length_max: 1518,
        mode: "continuous",
        rate_type: "pps",
        rate_value: 1000,
        enabled: true,
        self_start: true,
        total_pkts: 1,
        pkts_per_burst: 1,
        count: 1,
        next_stream_id: null,
        action_count: 0,
        isg: 0,
        ibg: 0,
        pg_id: 1,
        flow_stats_enabled: true,
        latency_enabled: false,
        ether_dst: "66:55:44:33:22:11",
        ether_src: "10:20:30:40:50:60",
        ether_type_override: false,
        ether_type: "0800",
        ether_dst_mode: "Fixed",
        ether_dst_count: 16,
        ether_dst_step: 1,
        ether_src_mode: "Fixed",
        ether_src_count: 16,
        ether_src_step: 1,
        arp_hardware_type: 1,
        arp_protocol_type: "0800",
        arp_hardware_size: 6,
        arp_protocol_size: 4,
        arp_operation: 1,
        arp_operation_mode: "Fixed",
        arp_operation_count: 4,
        arp_operation_step: 1,
        arp_sender_mac: "00:00:00:00:00:00",
        arp_sender_mac_mode: "Fixed",
        arp_sender_mac_count: 16,
        arp_sender_mac_step: 1,
        arp_sender_ip: "16.0.0.1",
        arp_sender_ip_mode: "Fixed",
        arp_sender_ip_count: 16,
        arp_sender_ip_step: 1,
        arp_target_mac: "00:00:00:00:00:00",
        arp_target_mac_mode: "Fixed",
        arp_target_mac_count: 16,
        arp_target_mac_step: 1,
        arp_target_ip: "48.0.0.1",
        arp_target_ip_mode: "Fixed",
        arp_target_ip_count: 16,
        arp_target_ip_step: 1,
        vlan_enabled: false,
        vlan_tpid_override: false,
        vlan_tpid: "8100",
        vlan_priority: 0,
        vlan_priority_mode: "Fixed",
        vlan_priority_count: 4,
        vlan_priority_step: 1,
        vlan_cfi: 0,
        vlan_id: 0,
        vlan_id_mode: "Fixed",
        vlan_id_count: 16,
        vlan_id_step: 1,
        vlan2_enabled: false,
        vlan2_tpid_override: false,
        vlan2_tpid: "8100",
        vlan2_priority: 0,
        vlan2_priority_mode: "Fixed",
        vlan2_priority_count: 4,
        vlan2_priority_step: 1,
        vlan2_cfi: 0,
        vlan2_id: 1,
        vlan2_id_mode: "Fixed",
        vlan2_id_count: 16,
        vlan2_id_step: 1,
        mpls_enabled: false,
        mpls_label: 17,
        mpls_label_mode: "Fixed",
        mpls_label_count: 16,
        mpls_label_step: 1,
        mpls_tc: 0,
        mpls_tc_mode: "Fixed",
        mpls_tc_count: 4,
        mpls_tc_step: 1,
        mpls_ttl: 255,
        mpls_ttl_mode: "Fixed",
        mpls_ttl_count: 16,
        mpls_ttl_step: 1,
        mpls_label2_enabled: false,
        mpls_label2: 18,
        mpls_label2_mode: "Fixed",
        mpls_label2_count: 16,
        mpls_label2_step: 1,
        mpls_label2_tc: 0,
        mpls_label2_tc_mode: "Fixed",
        mpls_label2_tc_count: 4,
        mpls_label2_tc_step: 1,
        mpls_label2_ttl: 255,
        mpls_label2_ttl_mode: "Fixed",
        mpls_label2_ttl_count: 16,
        mpls_label2_ttl_step: 1,
        mpls_label3_enabled: false,
        mpls_label3: 19,
        mpls_label3_mode: "Fixed",
        mpls_label3_count: 16,
        mpls_label3_step: 1,
        mpls_label3_tc: 0,
        mpls_label3_tc_mode: "Fixed",
        mpls_label3_tc_count: 4,
        mpls_label3_tc_step: 1,
        mpls_label3_ttl: 255,
        mpls_label3_ttl_mode: "Fixed",
        mpls_label3_ttl_count: 16,
        mpls_label3_ttl_step: 1,
        vxlan_enabled: false,
        vxlan_vni: 42,
        vxlan_vni_mode: "Fixed",
        vxlan_vni_count: 16,
        vxlan_vni_step: 1,
        vxlan_inner_ether_dst: "00:00:00:00:00:00",
        vxlan_inner_ether_src: "00:00:00:00:00:00",
        vxlan_inner_ip_version: "IPv4",
        vxlan_inner_ipv4_src: "10.0.0.1",
        vxlan_inner_ipv4_src_mode: "Fixed",
        vxlan_inner_ipv4_src_count: 16,
        vxlan_inner_ipv4_src_step: 1,
        vxlan_inner_ipv4_dst: "10.0.0.2",
        vxlan_inner_ipv4_dst_mode: "Fixed",
        vxlan_inner_ipv4_dst_count: 16,
        vxlan_inner_ipv4_dst_step: 1,
        vxlan_inner_ipv4_ttl: 127,
        vxlan_inner_ipv4_ttl_mode: "Fixed",
        vxlan_inner_ipv4_ttl_count: 16,
        vxlan_inner_ipv4_ttl_step: 1,
        vxlan_inner_ipv6_src: "2001:db8:50::1",
        vxlan_inner_ipv6_src_mode: "Fixed",
        vxlan_inner_ipv6_src_count: 16,
        vxlan_inner_ipv6_src_step: 1,
        vxlan_inner_ipv6_dst: "2001:db8:50::2",
        vxlan_inner_ipv6_dst_mode: "Fixed",
        vxlan_inner_ipv6_dst_count: 16,
        vxlan_inner_ipv6_dst_step: 1,
        vxlan_inner_ipv6_hop_limit: 64,
        vxlan_inner_ipv6_hop_limit_mode: "Fixed",
        vxlan_inner_ipv6_hop_limit_count: 16,
        vxlan_inner_ipv6_hop_limit_step: 1,
        vxlan_inner_l4_src_port: 1025,
        vxlan_inner_l4_src_port_mode: "Fixed",
        vxlan_inner_l4_src_port_count: 16,
        vxlan_inner_l4_src_port_step: 1,
        vxlan_inner_l4_dst_port: 12,
        vxlan_inner_l4_dst_port_mode: "Fixed",
        vxlan_inner_l4_dst_port_count: 16,
        vxlan_inner_l4_dst_port_step: 1,
        gtpu_enabled: false,
        gtpu_message_type: 255,
        gtpu_teid: 0x12345678,
        gtpu_teid_mode: "Fixed",
        gtpu_teid_count: 16,
        gtpu_teid_step: 1,
        gtpu_sequence_enabled: false,
        gtpu_sequence: 0,
        gtpu_sequence_mode: "Fixed",
        gtpu_sequence_count: 16,
        gtpu_sequence_step: 1,
        gtpu_npdu_enabled: false,
        gtpu_npdu: 0,
        gtpu_npdu_mode: "Fixed",
        gtpu_npdu_count: 16,
        gtpu_npdu_step: 1,
        gtpu_extension_enabled: false,
        gtpu_extension_udp_port: 2152,
        gtpu_extension_udp_port_mode: "Fixed",
        gtpu_extension_udp_port_count: 16,
        gtpu_extension_udp_port_step: 1,
        gtpu_inner_ip_version: "IPv4",
        gtpu_inner_ipv4_src: "10.3.0.1",
        gtpu_inner_ipv4_src_mode: "Fixed",
        gtpu_inner_ipv4_src_count: 16,
        gtpu_inner_ipv4_src_step: 1,
        gtpu_inner_ipv4_dst: "10.3.0.2",
        gtpu_inner_ipv4_dst_mode: "Fixed",
        gtpu_inner_ipv4_dst_count: 16,
        gtpu_inner_ipv4_dst_step: 1,
        gtpu_inner_ipv4_ttl: 64,
        gtpu_inner_ipv4_ttl_mode: "Fixed",
        gtpu_inner_ipv4_ttl_count: 16,
        gtpu_inner_ipv4_ttl_step: 1,
        gtpu_inner_ipv6_src: "2001:db8:30::1",
        gtpu_inner_ipv6_src_mode: "Fixed",
        gtpu_inner_ipv6_src_count: 16,
        gtpu_inner_ipv6_src_step: 1,
        gtpu_inner_ipv6_dst: "2001:db8:30::2",
        gtpu_inner_ipv6_dst_mode: "Fixed",
        gtpu_inner_ipv6_dst_count: 16,
        gtpu_inner_ipv6_dst_step: 1,
        gtpu_inner_ipv6_hop_limit: 64,
        gtpu_inner_ipv6_hop_limit_mode: "Fixed",
        gtpu_inner_ipv6_hop_limit_count: 16,
        gtpu_inner_ipv6_hop_limit_step: 1,
        gtpu_inner_l4_src_port: 1025,
        gtpu_inner_l4_src_port_mode: "Fixed",
        gtpu_inner_l4_src_port_count: 16,
        gtpu_inner_l4_src_port_step: 1,
        gtpu_inner_l4_dst_port: 12,
        gtpu_inner_l4_dst_port_mode: "Fixed",
        gtpu_inner_l4_dst_port_count: 16,
        gtpu_inner_l4_dst_port_step: 1,
        gre_checksum_present: false,
        gre_checksum_override: false,
        gre_checksum: "0000",
        gre_key_present: false,
        gre_key: 0,
        gre_key_mode: "Fixed",
        gre_key_count: 16,
        gre_key_step: 1,
        gre_sequence_present: false,
        gre_sequence: 0,
        gre_sequence_mode: "Fixed",
        gre_sequence_count: 16,
        gre_sequence_step: 1,
        gre_protocol_type: "0800",
        gre_inner_ip_version: "IPv4",
        gre_inner_ipv4_src: "10.2.0.1",
        gre_inner_ipv4_src_mode: "Fixed",
        gre_inner_ipv4_src_count: 16,
        gre_inner_ipv4_src_step: 1,
        gre_inner_ipv4_dst: "10.2.0.2",
        gre_inner_ipv4_dst_mode: "Fixed",
        gre_inner_ipv4_dst_count: 16,
        gre_inner_ipv4_dst_step: 1,
        gre_inner_ipv4_ttl: 64,
        gre_inner_ipv4_ttl_mode: "Fixed",
        gre_inner_ipv4_ttl_count: 16,
        gre_inner_ipv4_ttl_step: 1,
        gre_inner_ipv6_src: "2001:db8:40::1",
        gre_inner_ipv6_src_mode: "Fixed",
        gre_inner_ipv6_src_count: 16,
        gre_inner_ipv6_src_step: 1,
        gre_inner_ipv6_dst: "2001:db8:40::2",
        gre_inner_ipv6_dst_mode: "Fixed",
        gre_inner_ipv6_dst_count: 16,
        gre_inner_ipv6_dst_step: 1,
        gre_inner_ipv6_hop_limit: 64,
        gre_inner_ipv6_hop_limit_mode: "Fixed",
        gre_inner_ipv6_hop_limit_count: 16,
        gre_inner_ipv6_hop_limit_step: 1,
        gre_inner_l4_src_port: 1025,
        gre_inner_l4_src_port_mode: "Fixed",
        gre_inner_l4_src_port_count: 16,
        gre_inner_l4_src_port_step: 1,
        gre_inner_l4_dst_port: 12,
        gre_inner_l4_dst_port_mode: "Fixed",
        gre_inner_l4_dst_port_count: 16,
        gre_inner_l4_dst_port_step: 1,
        ipv4_src: "10.10.10.1",
        ipv4_dst: "10.10.10.2",
        ipv4_src_mode: "Fixed",
        ipv4_src_count: 16,
        ipv4_src_step: 1,
        ipv4_dst_mode: "Fixed",
        ipv4_dst_count: 16,
        ipv4_dst_step: 1,
        ipv4_dscp: 0,
        ipv4_dscp_mode: "Fixed",
        ipv4_dscp_count: 16,
        ipv4_dscp_step: 1,
        ipv4_ecn: 0,
        ipv4_ecn_mode: "Fixed",
        ipv4_ecn_count: 4,
        ipv4_ecn_step: 1,
        ipv4_id: 1234,
        ipv4_id_mode: "Fixed",
        ipv4_id_count: 16,
        ipv4_id_step: 1,
        ipv4_flag_df: false,
        ipv4_flag_mf: false,
        ipv4_fragment_offset: 0,
        ipv4_fragment_offset_mode: "Fixed",
        ipv4_fragment_offset_count: 16,
        ipv4_fragment_offset_step: 1,
        ipv4_ttl: 127,
        ipv4_ttl_mode: "Fixed",
        ipv4_ttl_count: 16,
        ipv4_ttl_step: 1,
        ipv4_checksum_override: false,
        ipv4_checksum: "0000",
        ipv6_src: "2001:db8::1",
        ipv6_dst: "2001:db8::2",
        ipv6_src_mode: "Fixed",
        ipv6_src_count: 16,
        ipv6_src_step: 1,
        ipv6_dst_mode: "Fixed",
        ipv6_dst_count: 16,
        ipv6_dst_step: 1,
        ipv6_traffic_class: 0,
        ipv6_traffic_class_mode: "Fixed",
        ipv6_traffic_class_count: 16,
        ipv6_traffic_class_step: 1,
        ipv6_flow_label: 0,
        ipv6_flow_label_mode: "Fixed",
        ipv6_flow_label_count: 16,
        ipv6_flow_label_step: 1,
        ipv6_hop_limit: 127,
        ipv6_hop_limit_mode: "Fixed",
        ipv6_hop_limit_count: 16,
        ipv6_hop_limit_step: 1,
        l4_src_port_override: true,
        l4_src_port: 12345,
        l4_src_port_mode: "Fixed",
        l4_src_port_count: 16,
        l4_src_port_step: 1,
        l4_dst_port_override: true,
        l4_dst_port: 443,
        l4_dst_port_mode: "Fixed",
        l4_dst_port_count: 16,
        l4_dst_port_step: 1,
        udp_length_override: false,
        udp_length: 26,
        udp_length_mode: "Fixed",
        udp_length_count: 16,
        udp_length_step: 1,
        udp_checksum_override: false,
        udp_checksum: "0000",
        udp_checksum_mode: "Fixed",
        udp_checksum_count: 16,
        udp_checksum_step: 1,
        dns_enabled: false,
        dns_transaction_id: 0x1234,
        dns_transaction_id_mode: "Fixed",
        dns_transaction_id_count: 16,
        dns_transaction_id_step: 1,
        dns_flags: "0100",
        dns_flags_mode: "Fixed" as const,
        dns_flags_count: 16,
        dns_flags_step: 1,
        dns_query_name: "example.com",
        dns_query_type: 1,
        dns_query_type_mode: "Fixed" as const,
        dns_query_type_count: 16,
        dns_query_type_step: 1,
        dns_query_class: 1,
        dns_query_class_mode: "Fixed" as const,
        dns_query_class_count: 16,
        dns_query_class_step: 1,
        dns_answer_enabled: false,
        dns_answer_ttl: 60,
        dns_answer_ttl_mode: "Fixed" as const,
        dns_answer_ttl_count: 16,
        dns_answer_ttl_step: 1,
        dns_answer_ipv4: "192.0.2.1",
        dns_answer_ipv4_mode: "Fixed" as const,
        dns_answer_ipv4_count: 16,
        dns_answer_ipv4_step: 1,
        dhcp_enabled: false,
        dhcp_operation: 1,
        dhcp_operation_mode: "Fixed" as const,
        dhcp_operation_count: 2,
        dhcp_operation_step: 1,
        dhcp_hops: 0,
        dhcp_hops_mode: "Fixed" as const,
        dhcp_hops_count: 16,
        dhcp_hops_step: 1,
        dhcp_seconds: 0,
        dhcp_seconds_mode: "Fixed" as const,
        dhcp_seconds_count: 16,
        dhcp_seconds_step: 1,
        dhcp_message_type: 1,
        dhcp_message_type_mode: "Fixed" as const,
        dhcp_message_type_count: 16,
        dhcp_message_type_step: 1,
        dhcp_xid: 0x3903f326,
        dhcp_xid_mode: "Fixed",
        dhcp_xid_count: 16,
        dhcp_xid_step: 1,
        dhcp_flags: "8000",
        dhcp_flags_mode: "Fixed" as const,
        dhcp_flags_count: 16,
        dhcp_flags_step: 1,
        dhcp_client_ip: "0.0.0.0",
        dhcp_client_ip_mode: "Fixed" as const,
        dhcp_client_ip_count: 16,
        dhcp_client_ip_step: 1,
        dhcp_your_ip: "0.0.0.0",
        dhcp_your_ip_mode: "Fixed" as const,
        dhcp_your_ip_count: 16,
        dhcp_your_ip_step: 1,
        dhcp_server_ip: "0.0.0.0",
        dhcp_server_ip_mode: "Fixed" as const,
        dhcp_server_ip_count: 16,
        dhcp_server_ip_step: 1,
        dhcp_relay_ip: "0.0.0.0",
        dhcp_relay_ip_mode: "Fixed" as const,
        dhcp_relay_ip_count: 16,
        dhcp_relay_ip_step: 1,
        dhcp_client_mac: "00:11:22:33:44:55",
        dhcp_client_mac_mode: "Fixed" as const,
        dhcp_client_mac_count: 16,
        dhcp_client_mac_step: 1,
        dhcp_hostname: "trex-webui",
        dhcp_requested_ip: "0.0.0.0",
        dhcp_requested_ip_mode: "Fixed" as const,
        dhcp_requested_ip_count: 16,
        dhcp_requested_ip_step: 1,
        dhcp_server_id: "0.0.0.0",
        dhcp_server_id_mode: "Fixed" as const,
        dhcp_server_id_count: 16,
        dhcp_server_id_step: 1,
        dhcp_parameter_request_list: "1,3,6,15,28,51,58,59",
        dhcp_lease_time: 0,
        dhcp_lease_time_mode: "Fixed" as const,
        dhcp_lease_time_count: 16,
        dhcp_lease_time_step: 1,
        dhcp_renewal_time: 0,
        dhcp_renewal_time_mode: "Fixed" as const,
        dhcp_renewal_time_count: 16,
        dhcp_renewal_time_step: 1,
        dhcp_rebinding_time: 0,
        dhcp_rebinding_time_mode: "Fixed" as const,
        dhcp_rebinding_time_count: 16,
        dhcp_rebinding_time_step: 1,
        icmp_type: 8,
        icmp_type_mode: "Fixed",
        icmp_type_count: 16,
        icmp_type_step: 1,
        icmp_code: 0,
        icmp_code_mode: "Fixed",
        icmp_code_count: 16,
        icmp_code_step: 1,
        icmp_checksum_override: false,
        icmp_checksum: "0000",
        icmp_identifier: 1,
        icmp_identifier_mode: "Fixed",
        icmp_identifier_count: 16,
        icmp_identifier_step: 1,
        icmp_sequence: 1,
        icmp_sequence_mode: "Fixed",
        icmp_sequence_count: 16,
        icmp_sequence_step: 1,
        icmpv6_nd_target: "2001:db8::2",
        icmpv6_nd_include_option: true,
        icmpv6_nd_option_mac: "00:00:00:00:00:00",
        icmpv6_nd_na_router: false,
        icmpv6_nd_na_solicited: true,
        icmpv6_nd_na_override: true,
        icmpv6_rs_include_slla: true,
        icmpv6_rs_slla_mac: "00:00:00:00:00:00",
        icmpv6_ra_cur_hop_limit: 64,
        icmpv6_ra_managed: false,
        icmpv6_ra_other: false,
        icmpv6_ra_router_lifetime: 1800,
        icmpv6_ra_reachable_time: 0,
        icmpv6_ra_retrans_timer: 0,
        icmpv6_ra_include_slla: true,
        icmpv6_ra_slla_mac: "00:00:00:00:00:00",
        icmpv6_ra_include_prefix: true,
        icmpv6_ra_prefix: "2001:db8:1::",
        icmpv6_ra_prefix_length: 64,
        icmpv6_ra_prefix_on_link: true,
        icmpv6_ra_prefix_autonomous: true,
        icmpv6_ra_prefix_valid_lifetime: 2592000,
        icmpv6_ra_prefix_preferred_lifetime: 604800,
        tcp_sequence_number: 1234567,
        tcp_sequence_mode: "Fixed",
        tcp_sequence_count: 16,
        tcp_sequence_step: 1,
        tcp_ack_number: 7654321,
        tcp_ack_mode: "Fixed",
        tcp_ack_count: 16,
        tcp_ack_step: 1,
        tcp_window: 9999,
        tcp_window_mode: "Fixed",
        tcp_window_count: 16,
        tcp_window_step: 1,
        tcp_checksum_override: false,
        tcp_checksum: "ABCD",
        tcp_checksum_mode: "Fixed",
        tcp_checksum_count: 16,
        tcp_checksum_step: 1,
        tcp_option_mss_enabled: false,
        tcp_option_mss: 1460,
        tcp_option_mss_mode: "Fixed",
        tcp_option_mss_count: 16,
        tcp_option_mss_step: 1,
        tcp_option_window_scale_enabled: false,
        tcp_option_window_scale: 7,
        tcp_option_window_scale_mode: "Fixed",
        tcp_option_window_scale_count: 16,
        tcp_option_window_scale_step: 1,
        tcp_option_sack_permitted_enabled: false,
        tcp_option_sack_blocks_enabled: false,
        tcp_option_sack_left_edge: 1000,
        tcp_option_sack_left_edge_mode: "Fixed",
        tcp_option_sack_left_edge_count: 16,
        tcp_option_sack_left_edge_step: 1,
        tcp_option_sack_right_edge: 2000,
        tcp_option_sack_right_edge_mode: "Fixed",
        tcp_option_sack_right_edge_count: 16,
        tcp_option_sack_right_edge_step: 1,
        tcp_option_timestamp_enabled: false,
        tcp_option_timestamp_value: 1,
        tcp_option_timestamp_value_mode: "Fixed",
        tcp_option_timestamp_value_count: 16,
        tcp_option_timestamp_value_step: 1,
        tcp_option_timestamp_echo: 0,
        tcp_option_timestamp_echo_mode: "Fixed",
        tcp_option_timestamp_echo_count: 16,
        tcp_option_timestamp_echo_step: 1,
        tcp_urgent_pointer: 1111,
        tcp_urgent_pointer_mode: "Fixed",
        tcp_urgent_pointer_count: 16,
        tcp_urgent_pointer_step: 1,
        tcp_flags_mode: "Fixed",
        tcp_flags_count: 16,
        tcp_flags_step: 1,
        tcp_flag_urg: false,
        tcp_flag_ack: false,
        tcp_flag_psh: false,
        tcp_flag_rst: false,
        tcp_flag_syn: false,
        tcp_flag_fin: false,
        sctp_verification_tag: 0x12345678,
        sctp_verification_tag_mode: "Fixed",
        sctp_verification_tag_count: 16,
        sctp_verification_tag_step: 1,
        sctp_checksum_override: false,
        sctp_checksum: "00000000",
        sctp_data_flags: 3,
        sctp_data_flags_mode: "Fixed",
        sctp_data_flags_count: 16,
        sctp_data_flags_step: 1,
        sctp_tsn: 1,
        sctp_tsn_mode: "Fixed",
        sctp_tsn_count: 16,
        sctp_tsn_step: 1,
        sctp_stream_id: 0,
        sctp_stream_id_mode: "Fixed",
        sctp_stream_id_count: 16,
        sctp_stream_id_step: 1,
        sctp_stream_sequence: 0,
        sctp_stream_sequence_mode: "Fixed",
        sctp_stream_sequence_count: 16,
        sctp_stream_sequence_step: 1,
        sctp_payload_protocol_id: 0,
        sctp_payload_protocol_id_mode: "Fixed",
        sctp_payload_protocol_id_count: 16,
        sctp_payload_protocol_id_step: 1,
        payload_enabled: true,
        payload_type: "Fixed Word",
        payload_pattern: "00",
        advanced_cache_size_type: "Auto",
        advanced_cache_value: 5000,
        packet_binary_base64: null,
        advanced_mode: false,
        packet_model: null,
        packet_meta_base64: null,
        advanced_vm: null
      }
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/profiles/workbench/render",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"l4_dst_port":443')
      })
    );
  });

  it("uses project-owned workbench yaml, pcap import, and pcap export routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, file_name: "profile.yaml", content: "---\n[]\n" } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, file_name: "stream.pcap" } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, streams: [{ name: "packet_1" }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const stream = {
      name: "stream",
      packet_type: "Ethernet/IPv4/UDP" as const,
      frame_length_type: "Fixed" as const,
      frame_length: 64,
      frame_length_min: 64,
      frame_length_max: 1518,
      mode: "continuous" as const,
      rate_type: "pps" as const,
      rate_value: 1000,
      enabled: true,
      self_start: true,
      total_pkts: 1,
      pkts_per_burst: 1,
      count: 1,
      next_stream_id: null,
      action_count: 0,
      isg: 0,
      ibg: 0,
      pg_id: 1,
      flow_stats_enabled: true,
      latency_enabled: false,
      ether_dst: "00:00:00:00:00:00",
      ether_src: "00:00:00:00:00:00",
      ether_type_override: false,
      ether_type: "0800",
      ether_dst_mode: "TRex Config" as const,
      ether_dst_count: 16,
      ether_dst_step: 1,
      ether_src_mode: "TRex Config" as const,
      ether_src_count: 16,
      ether_src_step: 1,
      arp_hardware_type: 1,
      arp_protocol_type: "0800",
      arp_hardware_size: 6,
      arp_protocol_size: 4,
      arp_operation: 1,
      arp_operation_mode: "Fixed" as const,
      arp_operation_count: 4,
      arp_operation_step: 1,
      arp_sender_mac: "00:00:00:00:00:00",
      arp_sender_mac_mode: "Fixed" as const,
      arp_sender_mac_count: 16,
      arp_sender_mac_step: 1,
      arp_sender_ip: "16.0.0.1",
      arp_sender_ip_mode: "Fixed" as const,
      arp_sender_ip_count: 16,
      arp_sender_ip_step: 1,
      arp_target_mac: "00:00:00:00:00:00",
      arp_target_mac_mode: "Fixed" as const,
      arp_target_mac_count: 16,
      arp_target_mac_step: 1,
      arp_target_ip: "48.0.0.1",
      arp_target_ip_mode: "Fixed" as const,
      arp_target_ip_count: 16,
      arp_target_ip_step: 1,
      vlan_enabled: false,
      vlan_tpid_override: false,
      vlan_tpid: "8100",
      vlan_priority: 0,
      vlan_priority_mode: "Fixed" as const,
      vlan_priority_count: 4,
      vlan_priority_step: 1,
      vlan_cfi: 0,
      vlan_id: 0,
      vlan_id_mode: "Fixed" as const,
      vlan_id_count: 16,
      vlan_id_step: 1,
      vlan2_enabled: false,
      vlan2_tpid_override: false,
      vlan2_tpid: "8100",
      vlan2_priority: 0,
      vlan2_priority_mode: "Fixed" as const,
      vlan2_priority_count: 4,
      vlan2_priority_step: 1,
      vlan2_cfi: 0,
      vlan2_id: 1,
      vlan2_id_mode: "Fixed" as const,
      vlan2_id_count: 16,
      vlan2_id_step: 1,
      mpls_enabled: false,
      mpls_label: 17,
      mpls_label_mode: "Fixed" as const,
      mpls_label_count: 16,
      mpls_label_step: 1,
      mpls_tc: 0,
      mpls_tc_mode: "Fixed" as const,
      mpls_tc_count: 4,
      mpls_tc_step: 1,
      mpls_ttl: 255,
      mpls_ttl_mode: "Fixed" as const,
      mpls_ttl_count: 16,
      mpls_ttl_step: 1,
      mpls_label2_enabled: false,
      mpls_label2: 18,
      mpls_label2_mode: "Fixed" as const,
      mpls_label2_count: 16,
      mpls_label2_step: 1,
      mpls_label2_tc: 0,
      mpls_label2_tc_mode: "Fixed" as const,
      mpls_label2_tc_count: 4,
      mpls_label2_tc_step: 1,
      mpls_label2_ttl: 255,
      mpls_label2_ttl_mode: "Fixed" as const,
      mpls_label2_ttl_count: 16,
      mpls_label2_ttl_step: 1,
      mpls_label3_enabled: false,
      mpls_label3: 19,
      mpls_label3_mode: "Fixed" as const,
      mpls_label3_count: 16,
      mpls_label3_step: 1,
      mpls_label3_tc: 0,
      mpls_label3_tc_mode: "Fixed" as const,
      mpls_label3_tc_count: 4,
      mpls_label3_tc_step: 1,
      mpls_label3_ttl: 255,
      mpls_label3_ttl_mode: "Fixed" as const,
      mpls_label3_ttl_count: 16,
      mpls_label3_ttl_step: 1,
      vxlan_enabled: false,
      vxlan_vni: 42,
      vxlan_vni_mode: "Fixed" as const,
      vxlan_vni_count: 16,
      vxlan_vni_step: 1,
      vxlan_inner_ether_dst: "00:00:00:00:00:00",
      vxlan_inner_ether_src: "00:00:00:00:00:00",
      vxlan_inner_ip_version: "IPv4" as const,
      vxlan_inner_ipv4_src: "10.0.0.1",
      vxlan_inner_ipv4_src_mode: "Fixed" as const,
      vxlan_inner_ipv4_src_count: 16,
      vxlan_inner_ipv4_src_step: 1,
      vxlan_inner_ipv4_dst: "10.0.0.2",
      vxlan_inner_ipv4_dst_mode: "Fixed" as const,
      vxlan_inner_ipv4_dst_count: 16,
      vxlan_inner_ipv4_dst_step: 1,
      vxlan_inner_ipv4_ttl: 127,
      vxlan_inner_ipv4_ttl_mode: "Fixed" as const,
      vxlan_inner_ipv4_ttl_count: 16,
      vxlan_inner_ipv4_ttl_step: 1,
      vxlan_inner_ipv6_src: "2001:db8:50::1",
      vxlan_inner_ipv6_src_mode: "Fixed" as const,
      vxlan_inner_ipv6_src_count: 16,
      vxlan_inner_ipv6_src_step: 1,
      vxlan_inner_ipv6_dst: "2001:db8:50::2",
      vxlan_inner_ipv6_dst_mode: "Fixed" as const,
      vxlan_inner_ipv6_dst_count: 16,
      vxlan_inner_ipv6_dst_step: 1,
      vxlan_inner_ipv6_hop_limit: 64,
      vxlan_inner_ipv6_hop_limit_mode: "Fixed" as const,
      vxlan_inner_ipv6_hop_limit_count: 16,
      vxlan_inner_ipv6_hop_limit_step: 1,
      vxlan_inner_l4_src_port: 1025,
      vxlan_inner_l4_src_port_mode: "Fixed" as const,
      vxlan_inner_l4_src_port_count: 16,
      vxlan_inner_l4_src_port_step: 1,
      vxlan_inner_l4_dst_port: 12,
      vxlan_inner_l4_dst_port_mode: "Fixed" as const,
      vxlan_inner_l4_dst_port_count: 16,
      vxlan_inner_l4_dst_port_step: 1,
      gtpu_enabled: false,
      gtpu_message_type: 255,
      gtpu_teid: 0x12345678,
      gtpu_teid_mode: "Fixed" as const,
      gtpu_teid_count: 16,
      gtpu_teid_step: 1,
      gtpu_sequence_enabled: false,
      gtpu_sequence: 0,
      gtpu_sequence_mode: "Fixed" as const,
      gtpu_sequence_count: 16,
      gtpu_sequence_step: 1,
      gtpu_npdu_enabled: false,
      gtpu_npdu: 0,
      gtpu_npdu_mode: "Fixed" as const,
      gtpu_npdu_count: 16,
      gtpu_npdu_step: 1,
      gtpu_extension_enabled: false,
      gtpu_extension_udp_port: 2152,
      gtpu_extension_udp_port_mode: "Fixed" as const,
      gtpu_extension_udp_port_count: 16,
      gtpu_extension_udp_port_step: 1,
      gtpu_inner_ip_version: "IPv4" as const,
      gtpu_inner_ipv4_src: "10.3.0.1",
      gtpu_inner_ipv4_src_mode: "Fixed" as const,
      gtpu_inner_ipv4_src_count: 16,
      gtpu_inner_ipv4_src_step: 1,
      gtpu_inner_ipv4_dst: "10.3.0.2",
      gtpu_inner_ipv4_dst_mode: "Fixed" as const,
      gtpu_inner_ipv4_dst_count: 16,
      gtpu_inner_ipv4_dst_step: 1,
      gtpu_inner_ipv4_ttl: 64,
      gtpu_inner_ipv4_ttl_mode: "Fixed" as const,
      gtpu_inner_ipv4_ttl_count: 16,
      gtpu_inner_ipv4_ttl_step: 1,
      gtpu_inner_ipv6_src: "2001:db8:30::1",
      gtpu_inner_ipv6_src_mode: "Fixed" as const,
      gtpu_inner_ipv6_src_count: 16,
      gtpu_inner_ipv6_src_step: 1,
      gtpu_inner_ipv6_dst: "2001:db8:30::2",
      gtpu_inner_ipv6_dst_mode: "Fixed" as const,
      gtpu_inner_ipv6_dst_count: 16,
      gtpu_inner_ipv6_dst_step: 1,
      gtpu_inner_ipv6_hop_limit: 64,
      gtpu_inner_ipv6_hop_limit_mode: "Fixed" as const,
      gtpu_inner_ipv6_hop_limit_count: 16,
      gtpu_inner_ipv6_hop_limit_step: 1,
      gtpu_inner_l4_src_port: 1025,
      gtpu_inner_l4_src_port_mode: "Fixed" as const,
      gtpu_inner_l4_src_port_count: 16,
      gtpu_inner_l4_src_port_step: 1,
      gtpu_inner_l4_dst_port: 12,
      gtpu_inner_l4_dst_port_mode: "Fixed" as const,
      gtpu_inner_l4_dst_port_count: 16,
      gtpu_inner_l4_dst_port_step: 1,
      gre_checksum_present: false,
      gre_checksum_override: false,
      gre_checksum: "0000",
      gre_key_present: false,
      gre_key: 0,
      gre_key_mode: "Fixed" as const,
      gre_key_count: 16,
      gre_key_step: 1,
      gre_sequence_present: false,
      gre_sequence: 0,
      gre_sequence_mode: "Fixed" as const,
      gre_sequence_count: 16,
      gre_sequence_step: 1,
      gre_protocol_type: "0800",
      gre_inner_ip_version: "IPv4" as const,
      gre_inner_ipv4_src: "10.2.0.1",
      gre_inner_ipv4_src_mode: "Fixed" as const,
      gre_inner_ipv4_src_count: 16,
      gre_inner_ipv4_src_step: 1,
      gre_inner_ipv4_dst: "10.2.0.2",
      gre_inner_ipv4_dst_mode: "Fixed" as const,
      gre_inner_ipv4_dst_count: 16,
      gre_inner_ipv4_dst_step: 1,
      gre_inner_ipv4_ttl: 64,
      gre_inner_ipv4_ttl_mode: "Fixed" as const,
      gre_inner_ipv4_ttl_count: 16,
      gre_inner_ipv4_ttl_step: 1,
      gre_inner_ipv6_src: "2001:db8:40::1",
      gre_inner_ipv6_src_mode: "Fixed" as const,
      gre_inner_ipv6_src_count: 16,
      gre_inner_ipv6_src_step: 1,
      gre_inner_ipv6_dst: "2001:db8:40::2",
      gre_inner_ipv6_dst_mode: "Fixed" as const,
      gre_inner_ipv6_dst_count: 16,
      gre_inner_ipv6_dst_step: 1,
      gre_inner_ipv6_hop_limit: 64,
      gre_inner_ipv6_hop_limit_mode: "Fixed" as const,
      gre_inner_ipv6_hop_limit_count: 16,
      gre_inner_ipv6_hop_limit_step: 1,
      gre_inner_l4_src_port: 1025,
      gre_inner_l4_src_port_mode: "Fixed" as const,
      gre_inner_l4_src_port_count: 16,
      gre_inner_l4_src_port_step: 1,
      gre_inner_l4_dst_port: 12,
      gre_inner_l4_dst_port_mode: "Fixed" as const,
      gre_inner_l4_dst_port_count: 16,
      gre_inner_l4_dst_port_step: 1,
      ipv4_src: "16.0.0.1",
      ipv4_dst: "48.0.0.1",
      ipv4_src_mode: "Fixed" as const,
      ipv4_src_count: 16,
      ipv4_src_step: 1,
      ipv4_dst_mode: "Fixed" as const,
      ipv4_dst_count: 16,
      ipv4_dst_step: 1,
      ipv4_dscp: 0,
      ipv4_dscp_mode: "Fixed" as const,
      ipv4_dscp_count: 16,
      ipv4_dscp_step: 1,
      ipv4_ecn: 0,
      ipv4_ecn_mode: "Fixed" as const,
      ipv4_ecn_count: 4,
      ipv4_ecn_step: 1,
      ipv4_id: 1234,
      ipv4_id_mode: "Fixed" as const,
      ipv4_id_count: 16,
      ipv4_id_step: 1,
      ipv4_flag_df: false,
      ipv4_flag_mf: false,
      ipv4_fragment_offset: 0,
      ipv4_fragment_offset_mode: "Fixed" as const,
      ipv4_fragment_offset_count: 16,
      ipv4_fragment_offset_step: 1,
      ipv4_ttl: 127,
      ipv4_ttl_mode: "Fixed" as const,
      ipv4_ttl_count: 16,
      ipv4_ttl_step: 1,
      ipv4_checksum_override: false,
      ipv4_checksum: "0000",
      ipv6_src: "2001:db8::1",
      ipv6_dst: "2001:db8::2",
      ipv6_src_mode: "Fixed" as const,
      ipv6_src_count: 16,
      ipv6_src_step: 1,
      ipv6_dst_mode: "Fixed" as const,
      ipv6_dst_count: 16,
      ipv6_dst_step: 1,
      ipv6_traffic_class: 0,
      ipv6_traffic_class_mode: "Fixed" as const,
      ipv6_traffic_class_count: 16,
      ipv6_traffic_class_step: 1,
      ipv6_flow_label: 0,
      ipv6_flow_label_mode: "Fixed" as const,
      ipv6_flow_label_count: 16,
      ipv6_flow_label_step: 1,
      ipv6_hop_limit: 127,
      ipv6_hop_limit_mode: "Fixed" as const,
      ipv6_hop_limit_count: 16,
      ipv6_hop_limit_step: 1,
      l4_src_port_override: false,
      l4_src_port: 1025,
      l4_src_port_mode: "Fixed" as const,
      l4_src_port_count: 16,
      l4_src_port_step: 1,
      l4_dst_port_override: false,
      l4_dst_port: 12,
      l4_dst_port_mode: "Fixed" as const,
      l4_dst_port_count: 16,
      l4_dst_port_step: 1,
      udp_length_override: false,
      udp_length: 26,
      udp_length_mode: "Fixed" as const,
      udp_length_count: 16,
      udp_length_step: 1,
      udp_checksum_override: false,
      udp_checksum: "0000",
      udp_checksum_mode: "Fixed" as const,
      udp_checksum_count: 16,
      udp_checksum_step: 1,
      dns_enabled: false,
      dns_transaction_id: 0x1234,
      dns_transaction_id_mode: "Fixed" as const,
      dns_transaction_id_count: 16,
      dns_transaction_id_step: 1,
      dns_flags: "0100",
      dns_flags_mode: "Fixed" as const,
      dns_flags_count: 16,
      dns_flags_step: 1,
      dns_query_name: "example.com",
      dns_query_type: 1,
      dns_query_type_mode: "Fixed" as const,
      dns_query_type_count: 16,
      dns_query_type_step: 1,
      dns_query_class: 1,
      dns_query_class_mode: "Fixed" as const,
      dns_query_class_count: 16,
      dns_query_class_step: 1,
      dns_answer_enabled: false,
      dns_answer_ttl: 60,
      dns_answer_ttl_mode: "Fixed" as const,
      dns_answer_ttl_count: 16,
      dns_answer_ttl_step: 1,
      dns_answer_ipv4: "192.0.2.1",
      dns_answer_ipv4_mode: "Fixed" as const,
      dns_answer_ipv4_count: 16,
      dns_answer_ipv4_step: 1,
      dhcp_enabled: false,
      dhcp_operation: 1,
      dhcp_operation_mode: "Fixed" as const,
      dhcp_operation_count: 2,
      dhcp_operation_step: 1,
      dhcp_hops: 0,
      dhcp_hops_mode: "Fixed" as const,
      dhcp_hops_count: 16,
      dhcp_hops_step: 1,
      dhcp_seconds: 0,
      dhcp_seconds_mode: "Fixed" as const,
      dhcp_seconds_count: 16,
      dhcp_seconds_step: 1,
      dhcp_message_type: 1,
      dhcp_message_type_mode: "Fixed" as const,
      dhcp_message_type_count: 16,
      dhcp_message_type_step: 1,
      dhcp_xid: 0x3903f326,
      dhcp_xid_mode: "Fixed" as const,
      dhcp_xid_count: 16,
      dhcp_xid_step: 1,
      dhcp_flags: "8000",
      dhcp_flags_mode: "Fixed" as const,
      dhcp_flags_count: 16,
      dhcp_flags_step: 1,
      dhcp_client_ip: "0.0.0.0",
      dhcp_client_ip_mode: "Fixed" as const,
      dhcp_client_ip_count: 16,
      dhcp_client_ip_step: 1,
      dhcp_your_ip: "0.0.0.0",
      dhcp_your_ip_mode: "Fixed" as const,
      dhcp_your_ip_count: 16,
      dhcp_your_ip_step: 1,
      dhcp_server_ip: "0.0.0.0",
      dhcp_server_ip_mode: "Fixed" as const,
      dhcp_server_ip_count: 16,
      dhcp_server_ip_step: 1,
      dhcp_relay_ip: "0.0.0.0",
      dhcp_relay_ip_mode: "Fixed" as const,
      dhcp_relay_ip_count: 16,
      dhcp_relay_ip_step: 1,
      dhcp_client_mac: "00:11:22:33:44:55",
      dhcp_client_mac_mode: "Fixed" as const,
      dhcp_client_mac_count: 16,
      dhcp_client_mac_step: 1,
      dhcp_hostname: "trex-webui",
      dhcp_requested_ip: "0.0.0.0",
      dhcp_requested_ip_mode: "Fixed" as const,
      dhcp_requested_ip_count: 16,
      dhcp_requested_ip_step: 1,
      dhcp_server_id: "0.0.0.0",
      dhcp_server_id_mode: "Fixed" as const,
      dhcp_server_id_count: 16,
      dhcp_server_id_step: 1,
      dhcp_parameter_request_list: "1,3,6,15,28,51,58,59",
      dhcp_lease_time: 0,
      dhcp_lease_time_mode: "Fixed" as const,
      dhcp_lease_time_count: 16,
      dhcp_lease_time_step: 1,
      dhcp_renewal_time: 0,
      dhcp_renewal_time_mode: "Fixed" as const,
      dhcp_renewal_time_count: 16,
      dhcp_renewal_time_step: 1,
      dhcp_rebinding_time: 0,
      dhcp_rebinding_time_mode: "Fixed" as const,
      dhcp_rebinding_time_count: 16,
      dhcp_rebinding_time_step: 1,
      icmp_type: 8,
      icmp_type_mode: "Fixed" as const,
      icmp_type_count: 16,
      icmp_type_step: 1,
      icmp_code: 0,
      icmp_code_mode: "Fixed" as const,
      icmp_code_count: 16,
      icmp_code_step: 1,
      icmp_checksum_override: false,
      icmp_checksum: "0000",
      icmp_identifier: 1,
      icmp_identifier_mode: "Fixed" as const,
      icmp_identifier_count: 16,
      icmp_identifier_step: 1,
      icmp_sequence: 1,
      icmp_sequence_mode: "Fixed" as const,
      icmp_sequence_count: 16,
      icmp_sequence_step: 1,
      icmpv6_nd_target: "2001:db8::2",
      icmpv6_nd_include_option: true,
      icmpv6_nd_option_mac: "00:00:00:00:00:00",
      icmpv6_nd_na_router: false,
      icmpv6_nd_na_solicited: true,
      icmpv6_nd_na_override: true,
      icmpv6_rs_include_slla: true,
      icmpv6_rs_slla_mac: "00:00:00:00:00:00",
      icmpv6_ra_cur_hop_limit: 64,
      icmpv6_ra_managed: false,
      icmpv6_ra_other: false,
      icmpv6_ra_router_lifetime: 1800,
      icmpv6_ra_reachable_time: 0,
      icmpv6_ra_retrans_timer: 0,
      icmpv6_ra_include_slla: true,
      icmpv6_ra_slla_mac: "00:00:00:00:00:00",
      icmpv6_ra_include_prefix: true,
      icmpv6_ra_prefix: "2001:db8:1::",
      icmpv6_ra_prefix_length: 64,
      icmpv6_ra_prefix_on_link: true,
      icmpv6_ra_prefix_autonomous: true,
      icmpv6_ra_prefix_valid_lifetime: 2592000,
      icmpv6_ra_prefix_preferred_lifetime: 604800,
      tcp_sequence_number: 1234567,
      tcp_sequence_mode: "Fixed" as const,
      tcp_sequence_count: 16,
      tcp_sequence_step: 1,
      tcp_ack_number: 7654321,
      tcp_ack_mode: "Fixed" as const,
      tcp_ack_count: 16,
      tcp_ack_step: 1,
      tcp_window: 9999,
      tcp_window_mode: "Fixed" as const,
      tcp_window_count: 16,
      tcp_window_step: 1,
      tcp_checksum_override: false,
      tcp_checksum: "ABCD",
      tcp_checksum_mode: "Fixed" as const,
      tcp_checksum_count: 16,
      tcp_checksum_step: 1,
      tcp_option_mss_enabled: false,
      tcp_option_mss: 1460,
      tcp_option_mss_mode: "Fixed" as const,
      tcp_option_mss_count: 16,
      tcp_option_mss_step: 1,
      tcp_option_window_scale_enabled: false,
      tcp_option_window_scale: 7,
      tcp_option_window_scale_mode: "Fixed" as const,
      tcp_option_window_scale_count: 16,
      tcp_option_window_scale_step: 1,
      tcp_option_sack_permitted_enabled: false,
      tcp_option_sack_blocks_enabled: false,
      tcp_option_sack_left_edge: 1000,
      tcp_option_sack_left_edge_mode: "Fixed" as const,
      tcp_option_sack_left_edge_count: 16,
      tcp_option_sack_left_edge_step: 1,
      tcp_option_sack_right_edge: 2000,
      tcp_option_sack_right_edge_mode: "Fixed" as const,
      tcp_option_sack_right_edge_count: 16,
      tcp_option_sack_right_edge_step: 1,
      tcp_option_timestamp_enabled: false,
      tcp_option_timestamp_value: 1,
      tcp_option_timestamp_value_mode: "Fixed" as const,
      tcp_option_timestamp_value_count: 16,
      tcp_option_timestamp_value_step: 1,
      tcp_option_timestamp_echo: 0,
      tcp_option_timestamp_echo_mode: "Fixed" as const,
      tcp_option_timestamp_echo_count: 16,
      tcp_option_timestamp_echo_step: 1,
      tcp_urgent_pointer: 1111,
      tcp_urgent_pointer_mode: "Fixed" as const,
      tcp_urgent_pointer_count: 16,
      tcp_urgent_pointer_step: 1,
      tcp_flags_mode: "Fixed" as const,
      tcp_flags_count: 16,
      tcp_flags_step: 1,
      tcp_flag_urg: false,
      tcp_flag_ack: false,
      tcp_flag_psh: false,
      tcp_flag_rst: false,
      tcp_flag_syn: false,
      tcp_flag_fin: false,
      sctp_verification_tag: 0x12345678,
      sctp_verification_tag_mode: "Fixed" as const,
      sctp_verification_tag_count: 16,
      sctp_verification_tag_step: 1,
      sctp_checksum_override: false,
      sctp_checksum: "00000000",
      sctp_data_flags: 3,
      sctp_data_flags_mode: "Fixed" as const,
      sctp_data_flags_count: 16,
      sctp_data_flags_step: 1,
      sctp_tsn: 1,
      sctp_tsn_mode: "Fixed" as const,
      sctp_tsn_count: 16,
      sctp_tsn_step: 1,
      sctp_stream_id: 0,
      sctp_stream_id_mode: "Fixed" as const,
      sctp_stream_id_count: 16,
      sctp_stream_id_step: 1,
      sctp_stream_sequence: 0,
      sctp_stream_sequence_mode: "Fixed" as const,
      sctp_stream_sequence_count: 16,
      sctp_stream_sequence_step: 1,
      sctp_payload_protocol_id: 0,
      sctp_payload_protocol_id_mode: "Fixed" as const,
      sctp_payload_protocol_id_count: 16,
      sctp_payload_protocol_id_step: 1,
      payload_enabled: true,
      payload_type: "Fixed Word" as const,
      payload_pattern: "00",
      advanced_cache_size_type: "Auto" as const,
      advanced_cache_value: 5000,
      packet_binary_base64: "AAAA",
      advanced_mode: false,
      packet_model: null,
      packet_meta_base64: null,
      advanced_vm: null
    };

    await exportProfileWorkbenchYaml("profile.yaml", [stream]);
    await exportProfileWorkbenchPcap(stream, "stream.pcap");
    await importProfileWorkbenchPcap("stream.pcap", "1MOyoQ==", 8, {
      name_prefix: "trace",
      rewrite_src_enabled: true,
      src_address: "20.0.0.1",
      src_mode: "Increment Host",
      src_count: 32,
      rewrite_dst_enabled: true,
      dst_address: "30.0.0.1",
      dst_mode: "Random Host",
      dst_count: 64,
      rate_mode: "speedup",
      speedup: 2,
      ipg: 1,
      loop_count: 3
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/trex/profiles/workbench/export-yaml",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"profile_name":"profile.yaml"')
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/profiles/workbench/export-pcap",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"packet_binary_base64":"AAAA"')
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/profiles/workbench/import-pcap",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          file_name: "stream.pcap",
          content_base64: "1MOyoQ==",
          max_packets: 8,
          options: {
            name_prefix: "trace",
            rewrite_src_enabled: true,
            src_address: "20.0.0.1",
            src_mode: "Increment Host",
            src_count: 32,
            rewrite_dst_enabled: true,
            dst_address: "30.0.0.1",
            dst_mode: "Random Host",
            dst_count: 64,
            rate_mode: "speedup",
            speedup: 2,
            ipg: 1,
            loop_count: 3
          }
        })
      })
    );
  });

  it("uses project-owned packet capture routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { captures: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, id: 3, captures: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, packets: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, packets: [], saved_file: null } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, removed_ids: [3], captures: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, removed_ids: [3], captures: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { root: "/tmp/captures", files: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, file: { name: "unit.pcap" } } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { accepted: true, file: { name: "unit.pcap" }, command: ["wireshark", "-r", "unit.pcap"], pid: 1234 } }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCaptureStatus();
    await startCapture({ tx_ports: [0], rx_ports: [1], limit: 64, mode: "fixed", bpf_filter: "icmp", snaplen: 0 });
    await fetchCapture({ capture_id: 3, pkt_count: 32, fetch_limit: 16, snaplen: 0 });
    await stopCapture({ capture_id: 3, pkt_count: 32, save_pcap: true, file_name: "unit.pcap", snaplen: 0 });
    await removeCapture({ capture_id: 3 });
    await removeAllCaptures();
    await fetchCaptureFiles();
    await downloadCaptureFile({ file_name: "unit.pcap" });
    await openCaptureFile({ file_name: "unit.pcap" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/trex/capture/status");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/capture/start",
      expect.objectContaining({
        body: JSON.stringify({ tx_ports: [0], rx_ports: [1], limit: 64, mode: "fixed", bpf_filter: "icmp", snaplen: 0 }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/capture/fetch",
      expect.objectContaining({
        body: JSON.stringify({ capture_id: 3, pkt_count: 32, fetch_limit: 16, snaplen: 0 }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/trex/capture/stop",
      expect.objectContaining({
        body: JSON.stringify({ capture_id: 3, pkt_count: 32, save_pcap: true, file_name: "unit.pcap", snaplen: 0 }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/trex/capture/remove",
      expect.objectContaining({
        body: JSON.stringify({ capture_id: 3 }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/trex/capture/remove-all",
      expect.objectContaining({
        body: JSON.stringify({}),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/trex/capture/files");
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/trex/capture/files/download",
      expect.objectContaining({
        body: JSON.stringify({ file_name: "unit.pcap" }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/trex/capture/files/open",
      expect.objectContaining({
        body: JSON.stringify({ file_name: "unit.pcap" }),
        method: "POST"
      })
    );
  });

  it("uses project-owned run report archive routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { root: "/tmp/reports", files: [] } }))
      .mockResolvedValueOnce(stubJsonResponse({ ok: true, data: { root: "/tmp/reports", total: 0, skipped: 0, records: [] } }))
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          data: { accepted: true, file: { name: "run.json", content: "{\"title\":\"Run\"}" } }
        })
      )
      .mockResolvedValueOnce(
        stubJsonResponse({
          ok: true,
          data: { accepted: true, file: { name: "run.json", content: "{\"title\":\"Run\"}" } }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRunReports();
    await fetchRunReportTrends(12);
    await saveRunReport({
      title: "Run",
      markdown: "# Run",
      payload: { ports: [0, 1] },
      file_name: "run.json",
      traffic_session_id: null,
      traffic_session_revision: null
    });
    await downloadRunReport({ file_name: "run.json" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/trex/reports");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/trex/reports/trends?limit=12");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/reports/save",
      expect.objectContaining({
        body: JSON.stringify({
          title: "Run",
          markdown: "# Run",
          payload: { ports: [0, 1] },
          file_name: "run.json",
          traffic_session_id: null,
          traffic_session_revision: null
        }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/trex/reports/download",
      expect.objectContaining({
        body: JSON.stringify({ file_name: "run.json" }),
        method: "POST"
      })
    );
  });

  it("uses the typed Quick Validation status and exact CAS command routes", async () => {
    const status = {
      ok: true,
      data: {
        state_version: 1,
        state_revision: 0,
        active: false,
        recovery_required: false,
        run: null,
        reconciliation: "no quick-validation run has been created"
      },
      blocker: null,
      error: null
    };
    const fetchMock = vi.fn().mockResolvedValue(stubJsonResponse(status));
    vi.stubGlobal("fetch", fetchMock);

    await fetchQuickValidation();
    await startQuickValidation({
      expected_run_id: null,
      expected_run_revision: null,
      group_id: "pair-0",
      plan_revision: 7,
      duration_seconds: 10,
      confirmation: "start-quick-validation"
    });
    await cancelQuickValidation({
      run_id: "11111111-1111-4111-8111-111111111111",
      run_revision: 4,
      confirmation: "cancel-quick-validation"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/trex/quick-validation");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/trex/quick-validation/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expected_run_id: null,
          expected_run_revision: null,
          group_id: "pair-0",
          plan_revision: 7,
          duration_seconds: 10,
          confirmation: "start-quick-validation"
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/trex/quick-validation/cancel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          run_id: "11111111-1111-4111-8111-111111111111",
          run_revision: 4,
          confirmation: "cancel-quick-validation"
        })
      })
    );
  });

  it("throws readable errors for backend HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stubJsonResponse({ detail: "bad gateway" }, false, 502)));

    await expect(fetchDaemonTrexLatestDump()).rejects.toThrow("Backend returned HTTP 502");
  });
});

describe("api request log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiLogEntries();
  });

  it("records command request and response payloads for Console Log View", async () => {
    clearApiLogEntries();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(stubRealJsonResponse({
      ok: true,
      data: { ports: [0] },
      blocker: null,
      error: null
    }));

    await acquirePorts({
      ports: [0],
      confirmation: null,
      force: false,
      sync_streams: true
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/trex/ports/acquire", expect.objectContaining({
      method: "POST"
    }));
    expect(getApiLogEntries()).toHaveLength(1);
    expect(getApiLogEntries()[0]).toMatchObject({
      method: "POST",
      path: "/api/trex/ports/acquire",
      status: 200,
      ok: true,
      request_body: {
        ports: [0],
        confirmation: null,
        force: false,
        sync_streams: true
      },
      response_body: {
        ok: true,
        data: { ports: [0] },
        blocker: null,
        error: null
      }
    });
  });

  it("does not record high-frequency overview polling", async () => {
    clearApiLogEntries();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stubRealJsonResponse({
      environment: { host: "127.0.0.1" },
      trex_probe: { ok: true }
    }));

    await fetchSystemOverview();

    expect(getApiLogEntries()).toEqual([]);
  });

  it("does not clone or record high-frequency read-model GET responses", async () => {
    clearApiLogEntries();
    const responses = Array.from({ length: 7 }, () =>
      stubRealJsonResponse({
        ok: true,
        data: {},
        blocker: null,
        error: null
      })
    );
    const cloneSpies = responses.map((response) => vi.spyOn(response, "clone"));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1])
      .mockResolvedValueOnce(responses[2])
      .mockResolvedValueOnce(responses[3])
      .mockResolvedValueOnce(responses[4])
      .mockResolvedValueOnce(responses[5])
      .mockResolvedValueOnce(responses[6]);

    await fetchCaptureStatus();
    await fetchCaptureFiles();
    await fetchRunReports();
    await fetchRunReportTrends(12);
    await fetchProfiles();
    await fetchQuickValidation();
    await fetchTrafficRuntime();

    expect(fetchSpy.mock.calls.map(([path]) => path)).toEqual([
      "/api/trex/capture/status",
      "/api/trex/capture/files",
      "/api/trex/reports",
      "/api/trex/reports/trends?limit=12",
      "/api/trex/profiles",
      "/api/trex/quick-validation",
      "/api/trex/traffic/runtime"
    ]);
    for (const cloneSpy of cloneSpies) {
      expect(cloneSpy).not.toHaveBeenCalled();
    }
    expect(getApiLogEntries()).toEqual([]);
  });

  it("redacts base64 request bodies before storing console log entries", async () => {
    clearApiLogEntries();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stubRealJsonResponse({
      ok: true,
      data: {
        streams: [],
        stream_summaries: [],
        packet_previews: []
      },
      blocker: null,
      error: null
    }));

    await importProfileWorkbenchPcap("sample.pcap", "QUFBQUFBQUFB", 32, null);

    const requestBody = getApiLogEntries()[0]?.request_body as Record<string, unknown>;
    expect(requestBody.content_base64).toBe("<content_base64: 12 chars>");
  });

  it("notifies Console Log subscribers when entries change", async () => {
    clearApiLogEntries();
    const listener = vi.fn();
    const unsubscribe = subscribeApiLogEntries(listener);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stubRealJsonResponse({
      ok: true,
      data: {},
      blocker: null,
      error: null
    }));

    await acquirePorts({
      ports: [1],
      confirmation: null,
      force: true,
      sync_streams: false
    });
    unsubscribe();

    expect(listener).toHaveBeenCalledWith([]);
    expect(listener).toHaveBeenLastCalledWith([
      expect.objectContaining({
        path: "/api/trex/ports/acquire",
        request_body: expect.objectContaining({ ports: [1] })
      })
    ]);
  });
});
