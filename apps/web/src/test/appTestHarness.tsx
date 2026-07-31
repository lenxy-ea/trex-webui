import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { DaemonOverview } from "../api";
import { daemonMetadataStatusLog, daemonRuntimeStatusLog, formatHostForUrl } from "../components/workbench/TrexDaemonDialog";

export type { DaemonOverview };
export { cleanup, fireEvent, render, screen, waitFor, within };
export { afterEach, beforeEach, describe, expect, it, vi };
export { App };
export { daemonMetadataStatusLog, daemonRuntimeStatusLog, formatHostForUrl };

export function packetBytesFromRawHex(value: string) {
  const compact = value.replace(/0x/gi, "").replace(/[\s,:;|_-]/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 2) {
    bytes.push(Number.parseInt(compact.slice(index, index + 2), 16));
  }
  return bytes;
}

export function formatTestRawHex(bytes: number[]) {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

export function rawTestWord(bytes: number[], offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

export function checksumAddTestBytes(bytes: number[], start: number, length: number, initial = 0) {
  let sum = initial;
  for (let cursor = 0; cursor < length; cursor += 2) {
    sum += ((bytes[start + cursor] ?? 0) << 8) | (bytes[start + cursor + 1] ?? 0);
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  return sum;
}

export function ipv4HeaderChecksumClosure(bytes: number[], offset: number) {
  const headerLength = ((bytes[offset] ?? 0) & 0x0f) * 4;
  let sum = 0;
  for (let cursor = 0; cursor < headerLength; cursor += 2) {
    sum += ((bytes[offset + cursor] ?? 0) << 8) | (bytes[offset + cursor + 1] ?? 0);
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  return sum & 0xffff;
}

export function expectRawIpv4ChecksumValid(rawHex: string, offset: number) {
  const bytes = packetBytesFromRawHex(rawHex);
  expect(bytes[offset] >>> 4).toBe(4);
  expect(ipv4HeaderChecksumClosure(bytes, offset)).toBe(0xffff);
}

export function expectRawTransportChecksumValid(
  rawHex: string,
  target: { ipOffset: number; ipVersion: 4 | 6; l4Offset: number; protocol: 6 | 17 }
) {
  const bytes = packetBytesFromRawHex(rawHex);
  const length = target.ipVersion === 4
    ? rawTestWord(bytes, target.ipOffset + 2) - ((bytes[target.ipOffset] & 0x0f) * 4)
    : rawTestWord(bytes, target.ipOffset + 4) - (target.l4Offset - target.ipOffset - 40);
  let sum = 0;
  if (target.ipVersion === 4) {
    sum = checksumAddTestBytes(bytes, target.ipOffset + 12, 8, sum);
    sum += target.protocol;
    sum += length;
  } else {
    sum = checksumAddTestBytes(bytes, target.ipOffset + 8, 32, sum);
    sum += (length >>> 16) & 0xffff;
    sum += length & 0xffff;
    sum += target.protocol;
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = checksumAddTestBytes(bytes, target.l4Offset, length, sum);
  expect(sum & 0xffff).toBe(0xffff);
}

export function expectRawIcmpChecksumValid(
  rawHex: string,
  target: { icmpOffset: number; ipOffset: number; ipVersion: 4 | 6 }
) {
  const bytes = packetBytesFromRawHex(rawHex);
  const length = target.ipVersion === 4
    ? rawTestWord(bytes, target.ipOffset + 2) - ((bytes[target.ipOffset] & 0x0f) * 4)
    : rawTestWord(bytes, target.ipOffset + 4) - (target.icmpOffset - target.ipOffset - 40);
  let sum = 0;
  if (target.ipVersion === 6) {
    sum = checksumAddTestBytes(bytes, target.ipOffset + 8, 32, sum);
    sum += (length >>> 16) & 0xffff;
    sum += length & 0xffff;
    sum += 58;
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = checksumAddTestBytes(bytes, target.icmpOffset, length, sum);
  expect(sum & 0xffff).toBe(0xffff);
}

export function expectRawGreChecksumValid(rawHex: string, target: { greOffset: number; length: number }) {
  const bytes = packetBytesFromRawHex(rawHex);
  expect(rawTestWord(bytes, target.greOffset) & 0x8000).not.toBe(0);
  expect(checksumAddTestBytes(bytes, target.greOffset, target.length) & 0xffff).toBe(0xffff);
}

export function rawTestSctpCrc32c(bytes: number[], sctpOffset: number, length: number) {
  let crc = 0xffffffff;
  for (let cursor = 0; cursor < length; cursor += 1) {
    const offset = sctpOffset + cursor;
    const octet = offset >= sctpOffset + 8 && offset < sctpOffset + 12 ? 0 : bytes[offset] ?? 0;
    crc = (crc ^ octet) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? ((crc >>> 1) ^ 0x82f63b78) >>> 0 : (crc >>> 1) >>> 0;
    }
  }
  return (~crc) >>> 0;
}

export function expectRawSctpChecksumValid(rawHex: string, target: { length: number; sctpOffset: number }) {
  const bytes = packetBytesFromRawHex(rawHex);
  const checksum =
    ((bytes[target.sctpOffset + 11] ?? 0) << 24)
    | ((bytes[target.sctpOffset + 10] ?? 0) << 16)
    | ((bytes[target.sctpOffset + 9] ?? 0) << 8)
    | (bytes[target.sctpOffset + 8] ?? 0);
  expect(checksum >>> 0).toBe(rawTestSctpCrc32c(bytes, target.sctpOffset, target.length));
}

export const overview = {
  environment: {
    host: "10.0.0.10",
    sync_port: 4501,
    async_port: 4500,
    scapy_port: 4507,
    client_name: "Client1",
    connect_timeout_seconds: 3,
    daemon_port: 8090,
    scripts_dir: "/opt/trex-core/scripts",
    daemon_bin: "/opt/trex-core/scripts/trex_daemon_server",
    config_path: "/etc/trex_cfg.yaml",
    daemon_log: "/var/log/trex/trex_daemon_server.log",
    scripts_dir_exists: true,
    daemon_bin_exists: true,
    config_parent_exists: true,
    daemon_log_parent_exists: true,
    profile_roots: ["/opt/trex-core/scripts/stl", "/opt/trex-webui/profiles"],
    profile_roots_existing: ["/opt/trex-core/scripts/stl"],
    command_timeout_seconds: 20,
    require_confirmation: true
  },
  daemon_preview: {
    action: "show",
    command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "show"],
    requires_confirmation: false,
    daemon_bin_exists: true,
    working_directory: "/opt/trex-core/scripts"
  },
  daemon_status: {
    ok: true,
    running: true,
    source: "daemon:connectivity_check",
    command_executed: false,
    command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "show"],
    returncode: null,
    stdout: "",
    stderr: "",
    blocker: null,
    error: null
  },
  trex_probe: {
    ok: true
  },
  trex_ports: {
    ok: true,
    data: {
      server_version: { version: "unit" },
      system_info: {},
      port_ids: [0, 1],
      acquired_ports: [1],
      ports: [
        {
          id: 0,
          acquired: false,
          info: {
            link: "UP",
            driver: "i40e",
            owner: "-",
            speed: "100 Gb/s",
            status: "IDLE",
            pci_address: "0000:02:00.0"
          }
        },
        {
          id: 1,
          acquired: true,
          info: {
            link: "UP",
            driver: "i40e",
            owner: "unit",
            speed: "100 Gb/s",
            status: "STREAMS",
            pci_address: "0000:02:00.1"
          }
        }
      ],
      warnings: []
    },
    blocker: null,
    error: null
  }
};

export const trafficRuntimeResult = {
  ok: true,
  data: {
    plan_revision: 1,
    groups: [
      {
        id: "pair-0",
        name: "P0 ↔ P1",
        ports: [0, 1],
        profile_path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
        multiplier: "1",
        duration: -1,
        force: false,
        total: false,
        synchronized: false,
        clear_existing: true,
        tunables: {}
      }
    ],
    session: null,
    config: {
      path: "/etc/trex_cfg.yaml",
      port_limit: 2,
      interfaces: ["0000:02:00.0", "0000:02:00.1"]
    },
    available_ports: [0, 1],
    port_states: [
      { port: 0, state: "stopped", ownership: "none" },
      { port: 1, state: "stopped", ownership: "none" }
    ],
    reconciliation: "live TRex port state reconciled"
  },
  blocker: null,
  error: null
};

export const activeTrafficRuntimeResult = {
  ...trafficRuntimeResult,
  data: {
    ...trafficRuntimeResult.data,
    session: {
      id: "session-123",
      authority: {
        host: "10.0.0.10",
        sync_port: 4501,
        async_port: 4500,
        scapy_port: 4507,
        daemon_supervisor: "external",
        generation: "external:10.0.0.10:4501:4500:4507"
      },
      state: "running",
      started_at: "2026-07-30T00:00:00Z",
      updated_at: "2026-07-30T00:00:01Z",
      ended_at: null,
      groups: [
        {
          group_id: "pair-0",
          ports: [0, 1],
          profile_path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
          multiplier: "1",
          duration: -1,
          tunables: {},
          state: "running",
          port_states: {
            0: "running",
            1: "running"
          },
          updated_at: "2026-07-30T00:00:01Z"
        }
      ],
      reconciliation: "live TRex port state reconciled"
    },
    port_states: [
      { port: 0, state: "running", ownership: "managed" },
      { port: 1, state: "running", ownership: "managed" }
    ]
  }
};

export const overviewWithPort0Acquired = {
  ...overview,
  trex_ports: {
    ...overview.trex_ports,
    data: {
      ...overview.trex_ports.data,
      acquired_ports: [0, 1],
      ports: overview.trex_ports.data.ports.map((port) =>
        port.id === 0
          ? {
              ...port,
              acquired: true,
              info: {
                ...port.info,
                owner: "unit"
              }
            }
          : port
      )
    }
  }
};

export const overviewWithPreferences = {
  ...overview,
  environment: {
    ...overview.environment,
    capture_open_command: ["wireshark", "-r"]
  }
};

export const overviewWithTrexDisconnected = {
  ...overview,
  trex_probe: {
    ok: false,
    blocker: "trex_connect_failed",
    error: "rpc down"
  },
  trex_ports: {
    ok: false,
    data: null,
    blocker: "trex_connect_failed",
    error: "rpc down"
  }
};

export const overviewWithWritablePort0Attributes = {
  ...overviewWithPort0Acquired,
  trex_ports: {
    ...overviewWithPort0Acquired.trex_ports,
    data: {
      ...overviewWithPort0Acquired.trex_ports.data,
      ports: overviewWithPort0Acquired.trex_ports.data.ports.map((port) =>
        port.id === 0
          ? {
              ...port,
              info: {
                ...port.info,
                fc: "NONE",
                fc_supported: "yes",
                is_led_supported: true,
                is_link_supported: true,
                link: "UP",
                led: false,
                mult: "off",
                prom: "off"
              }
            }
          : port
      )
    }
  }
};

export const profileCatalog = {
  ok: true,
  data: {
    roots: [
      {
        path: "/opt/trex-core/scripts/stl",
        exists: true,
        readable: true,
        profile_count: 2,
        blocker: null,
        error: null
      }
    ],
    profiles: [
      {
        name: "udp_1pkt_simple.py",
        path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
        relative_path: "udp_1pkt_simple.py",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".py",
        kind: "python",
        size_bytes: 1536,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true,
        tunables: [
          { name: "size", required: false, default: 64, type: "str" },
          { name: "vm", required: false, choices: ["cached", "random", "size"] },
          { name: "flow", required: false, choices: ["no-fs", "fs", "fsl"] },
          { name: "pg_id", required: false, default: 7, type: "int" }
        ]
      },
      {
        name: "http_simple.yaml",
        path: "/opt/trex-core/scripts/stl/http_simple.yaml",
        relative_path: "http_simple.yaml",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".yaml",
        kind: "yaml",
        size_bytes: 1024,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true
      }
    ],
    supported_suffixes: [".cap", ".json", ".pcap", ".py", ".yaml", ".yml"]
  },
  blocker: null,
  error: null
};

export const profileCatalogWithCopy = {
  ...profileCatalog,
  data: {
    ...profileCatalog.data,
    profiles: [
      ...profileCatalog.data.profiles,
      {
        name: "http_simple-copy.yaml",
        path: "/opt/trex-core/scripts/stl/http_simple-copy.yaml",
        relative_path: "http_simple-copy.yaml",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".yaml",
        kind: "yaml",
        size_bytes: 1024,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true
      }
    ]
  }
};

export const profileCatalogWithJson = {
  ...profileCatalog,
  data: {
    ...profileCatalog.data,
    roots: profileCatalog.data.roots.map((root) => ({ ...root, profile_count: 3 })),
    profiles: [
      ...profileCatalog.data.profiles,
      {
        name: "http_simple.json",
        path: "/opt/trex-core/scripts/stl/http_simple.json",
        relative_path: "http_simple.json",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".json",
        kind: "json",
        size_bytes: 2048,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true
      }
    ]
  }
};

export const profileCatalogWithNested = {
  ...profileCatalog,
  data: {
    ...profileCatalog.data,
    roots: [
      {
        ...profileCatalog.data.roots[0],
        profile_count: 3
      }
    ],
    profiles: [
      ...profileCatalog.data.profiles,
      {
        name: "hlt_4vlans.py",
        path: "/opt/trex-core/scripts/stl/hlt/hlt_4vlans.py",
        relative_path: "hlt/hlt_4vlans.py",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".py",
        kind: "python",
        size_bytes: 2048,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true,
        tunables: []
      }
    ]
  }
};

export const profileCatalogWithSynAttack = {
  ...profileCatalog,
  data: {
    ...profileCatalog.data,
    roots: profileCatalog.data.roots.map((root) => ({ ...root, profile_count: 3 })),
    profiles: [
      ...profileCatalog.data.profiles,
      {
        name: "syn_attack.py",
        path: "/opt/trex-core/scripts/stl/syn_attack.py",
        relative_path: "syn_attack.py",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".py",
        kind: "python",
        size_bytes: 1536,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true,
        tunables: []
      }
    ]
  }
};

export const profileCatalogWithImixWlc = {
  ...profileCatalog,
  data: {
    ...profileCatalog.data,
    roots: profileCatalog.data.roots.map((root) => ({ ...root, profile_count: 3 })),
    profiles: [
      ...profileCatalog.data.profiles,
      {
        name: "imix_wlc.py",
        path: "/opt/trex-core/scripts/stl/imix_wlc.py",
        relative_path: "imix_wlc.py",
        root: "/opt/trex-core/scripts/stl",
        suffix: ".py",
        kind: "python",
        size_bytes: 4096,
        modified_time: "2026-06-03T00:00:00+00:00",
        previewable: true,
        tunables: [
          { name: "src", required: true, type: "str" },
          { name: "dst", required: true, type: "str" },
          { name: "src_count", required: false, default: 1, type: "int" },
          { name: "dst_count", required: false, default: 1, type: "int" },
          { name: "port_count", required: false, default: 1, type: "int" }
        ]
      }
    ]
  }
};

export const statsResponse = {
  ok: true,
  data: {
    global: {
      tx_bps: 9990154,
      rx_bps: 9990154,
      tx_bps_L1: 10240154,
      tx_pps: 19512.01953125,
      rx_pps: 19512.01953125,
      cpu_util: 1.5,
      rx_cpu_util: 0.25,
      rx_drop_bps: 0,
      queue_full: 0
    },
    "0": {
      tx_pps: 19512.01953125,
      rx_pps: 0,
      tx_bps: 9990154,
      rx_bps: 0,
      tx_util: 0.0524483085,
      rx_util: 0,
      opackets: 42,
      ipackets: 0,
      oerrors: 0,
      ierrors: 0
    },
    "1": {
      tx_pps: 0,
      rx_pps: 19512.01953125,
      tx_bps: 0,
      rx_bps: 9990154,
      tx_util: 0,
      rx_util: 0.0524483085,
      opackets: 1249606,
      ipackets: 124960248,
      oerrors: 0,
      ierrors: 0
    },
    flow_stats: {
      "7": {
        tx_pps: 11,
        rx_pps: 10,
        tx_bps: 9990154,
        rx_bps: 8880154,
        tx_bytes: 2048,
        rx_bytes: 1024,
        tx_pkts: {
          total: 111
        },
        rx_pkts: {
          total: 109
        }
      },
      "9": {
        tx_pps: {
          total: 21
        },
        rx_pps: {
          total: 20
        },
        tx_bps: 19990154,
        rx_bps: 18880154,
        tx_bytes: 4096,
        rx_bytes: 3072,
        tx_pkts: {
          total: 211
        },
        rx_pkts: {
          total: 209
        }
      }
    },
    latency: {
      global: {
        old_flow: 0,
        bad_hdr: 0
      },
      "7": {
        latency: {
          average: 8,
          jitter: 1,
          last_max: 9,
          total_max: 15,
          histogram: {
            "10": 3,
            "20": 5
          }
        },
        err_cntrs: {
          dropped: 1,
          dup: 2,
          ooo: 3,
          sth: 4,
          stl: 5
        }
      },
      "9": {
        average: 12,
        jitter: 2,
        last_max: 13,
        total_max: 21,
        histogram: {
          "10": 1,
          "30": 7
        }
      }
    }
  },
  blocker: null,
  error: null
};

export const xstatsResponse = {
  ok: true,
  data: {
    port: 0,
    xstats: {
      tx_good_packets: 42,
      rx_good_packets: 41,
      rx_errors: 0
    }
  },
  blocker: null,
  error: null
};

export const captureStatusResponse = {
  ok: true,
  data: {
    captures: [
      {
        id: 3,
        state: "ACTIVE",
        count: 0,
        bytes: 0,
        mode: "fixed",
        filter: { rx: 1, tx: 1, bpf: "" }
      }
    ],
    port_usage: [
      { port: 0, rx_recorder_ids: [3], tx_recorder_ids: [3] }
    ],
    service_mode: {
      enabled_ports: [0],
      already_enabled_ports: [],
      restored_ports: [],
      managed_capture_ids: [3]
    }
  },
  blocker: null,
  error: null
};

export const captureFilesResponse = {
  ok: true,
  data: {
    root: "/var/log/trex/captures",
    files: [
      {
        path: "/var/log/trex/captures/capture.pcap",
        name: "capture.pcap",
        size_bytes: 24,
        modified_time: "2026-06-05T00:00:00+00:00",
        download_available: true,
        content_base64: null,
        download_error: null
      }
    ]
  },
  blocker: null,
  error: null
};

export const runReportsResponse = {
  ok: true,
  data: {
    root: "/var/log/trex/reports",
    files: [
      {
        path: "/var/log/trex/reports/run.json",
        name: "run.json",
        size_bytes: 256,
        modified_time: "2026-06-05T00:00:00+00:00",
        title: "TRex Run Report",
        generated_at: "2026-06-05T00:00:00+00:00",
        download_available: true,
        content: null,
        download_error: null
      }
    ]
  },
  blocker: null,
  error: null
};

export const runReportTrendsResponse = {
  ok: true,
  data: {
    root: "/var/log/trex/reports",
    total: 2,
    skipped: 1,
    verdict_counts: { pass: 1, warn: 0, fail: 1, unknown: 0 },
    conclusion: {
      verdict: "fail",
      title: "History Failing",
      summary: "1 failed report(s) in the selected history window",
      reasons: ["1 failed report(s) in the selected history window"]
    },
    metric_trends: [
      {
        label: "Tx PPS",
        latest: "12 Kpps",
        previous: "10 Kpps",
        delta: 2,
        unit: "Kpps",
        direction: "up",
        samples: 2
      }
    ],
    records: [
      {
        name: "run.json",
        title: "TRex Run Report",
        generated_at: "2026-06-05T00:00:00+00:00",
        modified_time: "2026-06-05T00:00:00+00:00",
        verdict: "fail",
        summary: "Drop rate 1 Mb/s",
        profile: "udp_1pkt_simple.py",
        run_duration: "3.0 s",
        metrics: { "Tx PPS": { value: "12 Kpps", number: 12, unit: "Kpps" } }
      }
    ]
  },
  blocker: null,
  error: null
};

export const captureStartResponse = {
  ok: true,
  data: {
    accepted: true,
    id: 4,
    start_ts: 10,
    tx_ports: [0],
    rx_ports: [0],
    limit: 1000,
    mode: "fixed",
    bpf_filter: "",
    snaplen: 0,
    captures: [
      {
        id: 4,
        state: "ACTIVE",
        count: 0,
        bytes: 0,
        mode: "fixed",
        filter: { rx: 1, tx: 1, bpf: "" }
      }
    ],
    port_usage: [
      { port: 0, rx_recorder_ids: [4], tx_recorder_ids: [4] }
    ],
    service_mode: {
      enabled_ports: [0],
      already_enabled_ports: [],
      restored_ports: [],
      managed_capture_ids: [4]
    }
  },
  blocker: null,
  error: null
};

export const captureFetchResponse = {
  ok: true,
  data: {
    accepted: true,
    id: 3,
    packets: [
      {
        index: 1,
        time: 1.25,
        port: 0,
        mode: "RX",
        destination: "66:55:44:33:22:11",
        source: "10:20:30:40:50:60",
        type: "IPv4/TCP",
        length: 64,
        wirelen: 64,
        info: "10.10.10.1:12345 -> 10.10.10.2:443",
        binary_base64: "ZlVEMyIREA==",
        hex_preview: "66554433221110203040506008004500"
      }
    ],
    packet_count: 1,
    captures: captureStatusResponse.data.captures,
    port_usage: captureStatusResponse.data.port_usage,
    service_mode: captureStatusResponse.data.service_mode
  },
  blocker: null,
  error: null
};

export function workbenchStream(overrides: Record<string, unknown> = {}) {
  return {
    name: "stream-1",
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
    ether_dst_mode: "TRex Config",
    ether_dst_count: 16,
    ether_dst_step: 1,
    ether_src_mode: "TRex Config",
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
    ipv4_src: "16.0.0.1",
    ipv4_dst: "48.0.0.1",
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
    l4_src_port_override: false,
    l4_src_port: 1025,
    l4_src_port_mode: "Fixed",
    l4_src_port_count: 16,
    l4_src_port_step: 1,
    l4_dst_port_override: false,
    l4_dst_port: 12,
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
    dhcp_operation_mode: "Fixed",
    dhcp_operation_count: 2,
    dhcp_operation_step: 1,
    dhcp_hops: 0,
    dhcp_hops_mode: "Fixed",
    dhcp_hops_count: 16,
    dhcp_hops_step: 1,
    dhcp_seconds: 0,
    dhcp_seconds_mode: "Fixed",
    dhcp_seconds_count: 16,
    dhcp_seconds_step: 1,
    dhcp_message_type: 1,
    dhcp_message_type_mode: "Fixed",
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
    dhcp_requested_ip_mode: "Fixed",
    dhcp_requested_ip_count: 16,
    dhcp_requested_ip_step: 1,
    dhcp_server_id: "0.0.0.0",
    dhcp_server_id_mode: "Fixed",
    dhcp_server_id_count: 16,
    dhcp_server_id_step: 1,
    dhcp_parameter_request_list: "1,3,6,15,28,51,58,59",
    dhcp_lease_time: 0,
    dhcp_lease_time_mode: "Fixed",
    dhcp_lease_time_count: 16,
    dhcp_lease_time_step: 1,
    dhcp_renewal_time: 0,
    dhcp_renewal_time_mode: "Fixed",
    dhcp_renewal_time_count: 16,
    dhcp_renewal_time_step: 1,
    dhcp_rebinding_time: 0,
    dhcp_rebinding_time_mode: "Fixed",
    dhcp_rebinding_time_count: 16,
    dhcp_rebinding_time_step: 1,
    icmp_type: 8,
    icmp_code: 0,
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
    advanced_vm: null,
    ...overrides
  };
}

export const daemonOverview = {
  environment: overview.environment,
  status: {
    ok: true,
    running: true,
    source: "daemon:connectivity_check",
    command_executed: false,
    command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "show"],
    returncode: null,
    stdout: "",
    stderr: "",
    blocker: null,
    error: null
  },
  rpc: {
    ok: true,
    source: "daemon:connectivity_check",
    host: "10.0.0.10",
    port: 8090,
    connected: true,
    blocker: null,
    error: null
  },
  trex: {
    ok: true,
    source: "daemon:trex_runtime_status",
    host: "10.0.0.10",
    port: 8090,
    running: false,
    status: { state: 1, verbose: "Idle" },
    commands: [],
    blocker: null,
    error: null
  },
  trex_version: {
    ok: true,
    source: "daemon:get_trex_version",
    host: "10.0.0.10",
    port: 8090,
    version: "Version : unit",
    blocker: null,
    error: null
  },
  trex_reservation: {
    ok: true,
    source: "daemon:is_reserved",
    host: "10.0.0.10",
    port: 8090,
    reserved: false,
    blocker: null,
    error: null
  },
  metadata: {
    ok: true,
    source: "daemon:get_trex_config_metadata",
    host: "10.0.0.10",
    port: 8090,
    metadata: [{ id: "port_limit", name: "Port limit", type: "NUMBER", mandatory: true, default: "2" }],
    devices_info: {},
    blocker: null,
    error: null
  },
  previews: {
    show: {
      action: "show",
      command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "show"],
      requires_confirmation: false,
      daemon_bin_exists: true,
      working_directory: "/opt/trex-core/scripts"
    },
    start: {
      action: "start",
      command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "start"],
      requires_confirmation: false,
      daemon_bin_exists: true,
      working_directory: "/opt/trex-core/scripts"
    },
    stop: {
      action: "stop",
      command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "stop"],
      requires_confirmation: true,
      daemon_bin_exists: true,
      working_directory: "/opt/trex-core/scripts"
    },
    restart: {
      action: "restart",
      command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "restart"],
      requires_confirmation: true,
      daemon_bin_exists: true,
      working_directory: "/opt/trex-core/scripts"
    },
    "start-live": {
      action: "start-live",
      command: ["/opt/trex-core/scripts/trex_daemon_server", "--daemon-port", "8090", "start-live"],
      requires_confirmation: true,
      daemon_bin_exists: true,
      working_directory: "/opt/trex-core/scripts"
    }
  },
  config: {
    path: "/etc/trex_cfg.yaml",
    exists: true,
    readable: true,
    size_bytes: 14,
    modified_time: "2026-06-03T00:00:00+00:00",
    content: "- port_limit: 2\n",
    truncated: false,
    blocker: null,
    error: null
  },
  log: {
    path: "/var/log/trex/trex_daemon_server.log",
    exists: true,
    readable: true,
    size_bytes: 13,
    modified_time: "2026-06-03T00:00:00+00:00",
    content: "daemon ready\n",
    truncated: false,
    blocker: null,
    error: null
  }
};

export const daemonDefaultConfig = {
  ok: true,
  source: "daemon:get_trex_config",
  host: "10.0.0.10",
  port: 8090,
  content: "- port_limit: 4\n",
  blocker: null,
  error: null
};

export const daemonInvalidDefaultConfig = {
  ...daemonDefaultConfig,
  content: "port_limit: [\n"
};

export const daemonOverviewReserved = {
  ...daemonOverview,
  trex_reservation: {
    ...daemonOverview.trex_reservation,
    reserved: true
  }
};

export const daemonOverviewRunning = {
  ...daemonOverview,
  trex: {
    ...daemonOverview.trex,
    running: true,
    status: { state: 3, verbose: "TRex is Running" },
    commands: [["1234", "./t-rex-64 --stl"]]
  }
};

export const daemonOverviewDevicesUnavailable = {
  ...daemonOverview,
  metadata: {
    ...daemonOverview.metadata,
    devices_info: null,
    blocker: "daemon_devices_info_unavailable",
    error: "devices unavailable"
  }
};

export const daemonOverviewMetadataUnavailable = {
  ...daemonOverview,
  metadata: {
    ok: false,
    source: "daemon:get_trex_config_metadata",
    host: "10.0.0.10",
    port: 8090,
    metadata: null,
    devices_info: null,
    blocker: "daemon_metadata_unavailable",
    error: "metadata unavailable"
  }
};

export const daemonOverviewInvalidConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "{}\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "port_limit", name: "Port limit", type: "NUMBER", mandatory: true }]
  }
};

export const daemonOverviewInvalidFloatConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- port_bandwidth_gb: 1abc\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "port_bandwidth_gb", name: "Port bandwidth", type: "FLOAT", mandatory: true }]
  }
};

export const daemonOverviewInvalidNumberRangeConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- port_limit: 2147483648\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "port_limit", name: "Port limit", type: "NUMBER", mandatory: true }]
  }
};

export const daemonOverviewInvalidBooleanConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- enable_zmq_pub: \"false\"\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "enable_zmq_pub", name: "Enable ZMQ publisher", type: "BOOLEAN", mandatory: false }]
  }
};

export const daemonOverviewInvalidIpConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- port_info:\n  - default_gw: 999.0.0.1\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [
      {
        id: "port_info",
        name: "Ports info",
        type: "LIST",
        mandatory: true,
        item: {
          name: "Port parameters",
          type: "OBJECT",
          mandatory: true,
          attributes: [
            {
              id: "default_gw",
              name: "Default gateway",
              type: "IP",
              mandatory_if_not_set: "dest_mac"
            },
            {
              id: "dest_mac",
              name: "Destination MAC",
              type: "MAC",
              mandatory_if_not_set: "default_gw"
            }
          ]
        }
      }
    ]
  }
};

export const daemonOverviewInvalidStringConfig = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- interfaces:\n  - 123\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [
      {
        id: "interfaces",
        name: "Interfaces",
        type: "LIST",
        mandatory: true,
        item: { name: "Interface", type: "STRING", mandatory: true }
      }
    ]
  }
};

export function deferredResponse(payload: unknown) {
  let resolveResponse: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
    resolveResponse = resolve;
  });
  return {
    promise,
    resolve: () => resolveResponse({ ok: true, json: async () => payload })
  };
}

export const daemonOverviewMissingMetadataId = {
  ...daemonOverview,
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ name: "Port limit", type: "NUMBER", mandatory: true }]
  }
};

export const daemonOverviewDirtyMetadataStrings = {
  ...daemonOverview,
  metadata: {
    ...daemonOverview.metadata,
    metadata: [
      { id: " port_limit", name: "Port limit", type: "NUMBER", mandatory: true },
      { id: "enable_zmq_pub", name: "Enable ZMQ publisher ", type: "BOOLEAN", mandatory: false }
    ]
  }
};

export const daemonOverviewInvalidEnumMetadataValues = {
  ...daemonOverview,
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "mode", name: "Mode", type: "ENUM", mandatory: true, values: [{ label: "stateless" }] }]
  }
};

export const daemonOverviewNumericEnum = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- mode: 1\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [{ id: "mode", name: "Mode", type: "ENUM", mandatory: true, values: [1, 2, true] }]
  }
};

export const daemonOverviewListItemWithoutId = {
  ...daemonOverview,
  config: {
    ...daemonOverview.config,
    content: "- interfaces:\n  - 0000:02:00.0\n"
  },
  metadata: {
    ...daemonOverview.metadata,
    metadata: [
      {
        id: "interfaces",
        name: "Interfaces",
        type: "LIST",
        mandatory: true,
        item: { name: "Interface", type: "STRING", mandatory: true }
      }
    ]
  }
};

export const daemonOverviewInterfaceDevices = {
  ...daemonOverviewListItemWithoutId,
  metadata: {
    ...daemonOverviewListItemWithoutId.metadata,
    devices_info: {
      "0000:02:00.0": {
        Slot_str: "0000:02:00.0",
        Driver_str: "i40e",
        Interface: "ens2f0",
        NUMA: 0,
        Active: ""
      },
      "0000:02:00.1": {
        Slot_str: "0000:02:00.1",
        Driver_str: "i40e",
        Interface: "ens2f1",
        NUMA: 0,
        Active: "*Active*"
      }
    }
  }
};

export function installAppTestHooks() {

  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

export const stubFetch = (
  fetchMock: ReturnType<typeof vi.fn>,
  trafficRuntimeResponses: unknown | unknown[] = trafficRuntimeResult
) => {
  const delegatedFetch = fetchMock as unknown as (input: RequestInfo | URL, init?: RequestInit) => unknown;
  let runtimeResponseIndex = 0;
  const installedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (path === "/api/trex/traffic/runtime") {
      const runtimeResponse = Array.isArray(trafficRuntimeResponses)
        ? trafficRuntimeResponses[
            Math.min(runtimeResponseIndex, Math.max(trafficRuntimeResponses.length - 1, 0))
          ]
        : trafficRuntimeResponses;
      runtimeResponseIndex += 1;
      return Promise.resolve({
        ok: true,
        json: async () => runtimeResponse
      });
    }
    return init === undefined ? delegatedFetch(input) : delegatedFetch(input, init);
  });
  vi.stubGlobal("fetch", installedFetch);
  return installedFetch;
};

export const fetchCallCount = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === path).length;

export const openProfiles = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Traffic Profiles" }));
  await screen.findByLabelText("Profile name", undefined, { timeout: 10000 });
};

export const openProfilesForBuilder = async () => {
  await openProfiles();
  fireEvent.click(screen.getByRole("option", { name: "http_simple.yaml" }));
};

export const switchPacketPreviewToFieldEngine = async () => {
  const advancedModeButton = screen.getByRole("button", { name: "Advanced mode" });
  await waitFor(() => expect(advancedModeButton).not.toBeDisabled());
  fireEvent.click(advancedModeButton);
  fireEvent.click(await screen.findByRole("tab", { name: "Field Engine" }));
  await screen.findByLabelText("Advanced VM JSON");
};

export const readAdvancedVmBody = () =>
  JSON.parse((screen.getByLabelText("Advanced VM JSON") as HTMLTextAreaElement).value) as {
    instructions: Array<Record<string, unknown>>;
    split_by_var?: string;
  };

export const useFieldEngineTarget = (label: string) => {
  const targetMap = screen.queryByLabelText("Field Engine target map");
  const button = targetMap
    ? within(targetMap).getByRole("button", { name: `Use ${label} Field Engine target` })
    : screen.getByRole("button", { name: `Use ${label} Field Engine target` });
  fireEvent.click(button);
  return readAdvancedVmBody();
};

export const selectRawPacketFieldEngineTarget = async (fieldLabel: string, targetName: string) => {
  const targetButtonName = `Use Field Engine target for raw field ${fieldLabel}`;
  if (!screen.queryByRole("button", { name: targetButtonName })) {
    fireEvent.click(screen.getByRole("tab", { name: "Packet Editor" }));
  }
  const row = (await screen.findByLabelText(`Raw field ${fieldLabel}`)).closest("tr");
  expect(row).not.toBeNull();
  fireEvent.click(within(row as HTMLElement).getByRole("button", { name: targetButtonName }));
  await screen.findByLabelText("Advanced VM JSON");
  const targetMap = await screen.findByLabelText("Field Engine target map");
  expect(within(targetMap).getByRole("button", { name: `Use ${targetName} Field Engine target` }).closest("tr"))
    .toHaveClass("packet-vm-target-row--selected");
  return readAdvancedVmBody();
};

export const openRawStreamFieldEngine = async (
  rawPacket: number[],
  stream: ReturnType<typeof workbenchStream>,
  packetType: string,
  layers: Array<{ fields: Record<string, unknown>; name: string }>
) => {
  const packetBinary = btoa(String.fromCharCode(...rawPacket));
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => overview })
    .mockResolvedValueOnce({ ok: true, json: async () => profileCatalog })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          profile: profileCatalog.data.profiles[1],
          content: "---\n[]\n",
          streams: [{ ...stream, packet_binary_base64: packetBinary }],
          stream_summaries: [
            {
              index: 1,
              name: "stream-1",
              packet_type: "Ethernet",
              length: rawPacket.length,
              mode: "continuous",
              rate: "1000 pps",
              next_stream: "-"
            }
          ],
          packet_previews: [
            {
              index: 1,
              name: "stream-1",
              packet_type: packetType,
              frame_length: rawPacket.length,
              wire_length: rawPacket.length,
              binary_base64: packetBinary,
              hex: "",
              hex_lines: [{ offset: "0000", hex: "aa bb cc dd ee ff 00 11 22 33 44 55 08 00", ascii: "........3DU..." }],
              layers
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
  fireEvent.click(screen.getByRole("button", { name: "Load Profile" }));
  await screen.findByText("Packet Editor / Field Engine editable");
  fireEvent.click(screen.getByRole("tab", { name: "Field Engine" }));
  await screen.findByLabelText("Advanced VM JSON");
};

export const returnAdvancedStreamToStructured = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Simple mode" }));
  await screen.findByRole("tab", { name: "Protocol Selection" });
};

export const openDashboard = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Stats" }));
  await screen.findByRole("tab", { name: "Ports" });
};

export const openCapture = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Capture" }));
  await screen.findByRole("tab", { name: "Monitor" });
};

export const openReports = async () => {
  fireEvent.click(screen.getAllByRole("button", { name: "Run Reports" })[0]);
  await screen.findByRole("tab", { name: "Overview" }, { timeout: 5000 });
};

export const openDaemon = () => {
  fireEvent.click(screen.getByRole("button", { name: "TRex Daemon" }));
};
