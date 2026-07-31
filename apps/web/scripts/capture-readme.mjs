/**
 * Generate stable README screenshots from the real React application surface.
 *
 * Every /api request is fulfilled inside Playwright with sanitized,
 * documentation-only illustrative data. The script never reads lab API state,
 * and its output is not hardware acceptance evidence.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const requiredNodeMajor = 24;
const viewport = { width: 1600, height: 900 };
const defaultUrls = [
  "http://127.0.0.1:5176",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1"
];
const outputNames = Object.freeze({
  dashboard: "hero-dashboard.png",
  profile: "profile-builder.png",
  capture: "packet-capture.png",
  reports: "run-reports.png"
});
const documentationMarker = "ILLUSTRATIVE · SANITIZED DOCUMENTATION DATA";
const fixedGeneratedAt = "2026-07-22T12:00:00Z";
const documentationProfileRoot = "/docs/fixtures/profiles";

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function assertProjectNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (major !== requiredNodeMajor) {
    throw new Error(
      `README screenshots require Node.js ${requiredNodeMajor}.x; current runtime is ${process.version}.`
    );
  }
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const body = await response.text();
    return response.ok && body.includes('id="root"');
  } catch {
    return false;
  }
}

async function resolveTargetUrl() {
  const explicitUrl = readOption("--url") ?? process.env.WEBUI_URL ?? null;
  if (explicitUrl) {
    if (!(await isReachable(explicitUrl))) {
      throw new Error(`The React WebUI is not reachable at ${explicitUrl}.`);
    }
    return explicitUrl;
  }
  for (const url of defaultUrls) {
    if (await isReachable(url)) {
      return url;
    }
  }
  throw new Error(
    "No React WebUI is reachable. Start it with npm run dev:web -- --host 127.0.0.1 --port 5176, " +
      "or pass --url."
  );
}

function portRecord(id) {
  return {
    id,
    acquired: true,
    info: {
      link: "UP",
      driver: "net_i350",
      owner: "docs-operator",
      speed: "1 Gb/s",
      status: "TRANSMITTING",
      pci_address: "-"
    }
  };
}

const ports = Array.from({ length: 6 }, (_, id) => portRecord(id));
const profileRecords = [
  {
    name: "docs_udp_baseline.py",
    path: `${documentationProfileRoot}/docs_udp_baseline.py`,
    relative_path: "docs_udp_baseline.py",
    root: documentationProfileRoot,
    suffix: ".py",
    kind: "python",
    size_bytes: 1840,
    modified_time: fixedGeneratedAt,
    previewable: true,
    tunables: [
      { name: "packet_size", required: false, default: 128, type: "int" },
      { name: "flow_count", required: false, default: 1024, type: "int" }
    ]
  },
  {
    name: "docs_vlan_sweep.yaml",
    path: `${documentationProfileRoot}/docs_vlan_sweep.yaml`,
    relative_path: "docs_vlan_sweep.yaml",
    root: documentationProfileRoot,
    suffix: ".yaml",
    kind: "yaml",
    size_bytes: 2460,
    modified_time: fixedGeneratedAt,
    previewable: true
  },
  {
    name: "docs_ipv6_latency.py",
    path: `${documentationProfileRoot}/docs_ipv6_latency.py`,
    relative_path: "docs_ipv6_latency.py",
    root: documentationProfileRoot,
    suffix: ".py",
    kind: "python",
    size_bytes: 3110,
    modified_time: fixedGeneratedAt,
    previewable: true,
    tunables: []
  }
];

const environment = {
  host: "192.0.2.10",
  sync_port: 4501,
  async_port: 4500,
  scapy_port: 4507,
  client_name: "docs-console",
  connect_timeout_seconds: 3,
  daemon_port: 8090,
  scripts_dir: "/docs/fixtures/trex/scripts",
  daemon_bin: "/docs/fixtures/trex/trex_daemon_server",
  config_path: "/docs/fixtures/trex_cfg.yaml",
  daemon_log: "/docs/fixtures/logs/trex-daemon.log",
  profile_roots: [documentationProfileRoot],
  host_valid: true,
  scripts_dir_path_valid: true,
  daemon_bin_path_valid: true,
  config_path_valid: true,
  daemon_log_path_valid: true,
  scripts_dir_exists: true,
  daemon_bin_exists: true,
  config_parent_exists: true,
  daemon_log_parent_exists: true,
  profile_roots_existing: [documentationProfileRoot],
  command_timeout_seconds: 20,
  require_confirmation: true,
  daemon_supervisor: "external",
  capture_open_command: [],
  configuration_errors: {}
};

const systemOverview = {
  environment,
  daemon_preview: {
    action: "show",
    command: [environment.daemon_bin, "--daemon-port", "8090", "show"],
    requires_confirmation: false,
    daemon_bin_exists: true,
    working_directory: environment.scripts_dir,
    available: true,
    blocker: null
  },
  daemon_status: {
    ok: true,
    running: true,
    source: "documentation-fixture",
    command_executed: false,
    command: [],
    returncode: null,
    stdout: "",
    stderr: "",
    blocker: null,
    error: null
  },
  trex_probe: {
    ok: true,
    blocker: null,
    error: null,
    server_version: { version: "documentation-preview" },
    system_info: { dp_core_count: 4, port_count: 6 }
  },
  trex_ports: {
    ok: true,
    data: {
      server_version: { version: "documentation-preview" },
      system_info: { dp_core_count: 4, port_count: 6 },
      port_ids: ports.map((port) => port.id),
      acquired_ports: ports.map((port) => port.id),
      ports,
      warnings: []
    },
    blocker: null,
    error: null
  }
};

const trafficGroups = [
  [0, 1],
  [2, 3],
  [4, 5]
].map(([left, right], index) => ({
  id: `pair-${index}`,
  name: `P${left} ↔ P${right}`,
  ports: [left, right],
  profile_path: profileRecords[index].path,
  multiplier: index === 2 ? "40%" : "55%",
  duration: 60,
  force: false,
  total: false,
  synchronized: true,
  clear_existing: true,
  tunables: {}
}));

const trafficRuntime = {
  ok: true,
  data: {
    plan_revision: 7,
    groups: trafficGroups,
    session: {
      id: "docs-session-01",
      authority: {
        host: environment.host,
        sync_port: environment.sync_port,
        async_port: environment.async_port,
        scapy_port: environment.scapy_port,
        daemon_supervisor: "external",
        generation: "documentation-preview"
      },
      state: "running",
      started_at: "2026-07-22T11:59:00Z",
      updated_at: fixedGeneratedAt,
      ended_at: null,
      groups: trafficGroups.map((group) => ({
        group_id: group.id,
        ports: group.ports,
        profile_path: group.profile_path,
        multiplier: group.multiplier,
        duration: group.duration,
        tunables: {},
        state: "running",
        port_states: Object.fromEntries(
          group.ports.map((port) => [port, "running"])
        ),
        updated_at: fixedGeneratedAt
      })),
      reconciliation: "documentation fixture reconciled"
    },
    config: {
      path: environment.config_path,
      port_limit: 6,
      interfaces: ports.map((port) => `docs-port-${port.id}`)
    },
    available_ports: ports.map((port) => port.id),
    live_state_sampled: true,
    port_states: ports.map((port) => ({
      port: port.id,
      state: "running",
      ownership: "managed"
    })),
    reconciliation: "documentation fixture reconciled"
  },
  blocker: null,
  error: null
};

function statsResponse() {
  const pulse = 13_000_000;
  const pair0Bps = 456_000_000 + pulse;
  const pair1Bps = 372_000_000 + Math.round(pulse * 0.7);
  const pair2Bps = 338_000_000 + Math.round(pulse * 0.45);
  const txBps = pair0Bps + pair1Bps + pair2Bps;
  const txPps = Math.round(txBps / 8 / 256);
  const packetTotal = 20_136_352;
  const perPort = {
    "0": { tx_pps: Math.round(pair0Bps / 8 / 256), rx_pps: 0, tx_bps: pair0Bps, rx_bps: 0, tx_util: 46.2, rx_util: 0 },
    "1": { tx_pps: 0, rx_pps: Math.round(pair0Bps / 8 / 256), tx_bps: 0, rx_bps: pair0Bps, tx_util: 0, rx_util: 46.2 },
    "2": { tx_pps: Math.round(pair1Bps / 8 / 256), rx_pps: 0, tx_bps: pair1Bps, rx_bps: 0, tx_util: 37.8, rx_util: 0 },
    "3": { tx_pps: 0, rx_pps: Math.round(pair1Bps / 8 / 256), tx_bps: 0, rx_bps: pair1Bps, tx_util: 0, rx_util: 37.8 },
    "4": { tx_pps: Math.round(pair2Bps / 8 / 256), rx_pps: 0, tx_bps: pair2Bps, rx_bps: 0, tx_util: 34.1, rx_util: 0 },
    "5": { tx_pps: 0, rx_pps: Math.round(pair2Bps / 8 / 256), tx_bps: 0, rx_bps: pair2Bps, tx_util: 0, rx_util: 34.1 }
  };
  for (const [id, port] of Object.entries(perPort)) {
    Object.assign(port, {
      opackets: Number(id) % 2 === 0 ? Math.round(packetTotal / 3) : 0,
      ipackets: Number(id) % 2 === 1 ? Math.round(packetTotal / 3) : 0,
      obytes: Number(id) % 2 === 0 ? Math.round((packetTotal * 256) / 3) : 0,
      ibytes: Number(id) % 2 === 1 ? Math.round((packetTotal * 256) / 3) : 0,
      oerrors: 0,
      ierrors: 0
    });
  }
  return {
    ok: true,
    data: {
      global: {
        tx_bps: txBps,
        rx_bps: txBps,
        tx_bps_L1: Math.round(txBps * 1.08),
        rx_bps_L1: Math.round(txBps * 1.08),
        tx_pps: txPps,
        rx_pps: txPps,
        cpu_util: 30.4,
        rx_cpu_util: 7.2,
        rx_drop_bps: 0,
        queue_full: 0
      },
      total: {
        opackets: packetTotal,
        ipackets: packetTotal,
        obytes: packetTotal * 256,
        ibytes: packetTotal * 256,
        oerrors: 0,
        ierrors: 0
      },
      ...perPort,
      flow_stats: {
        "101": {
          tx_pps: Math.round(pair0Bps / 8 / 256),
          rx_pps: Math.round(pair0Bps / 8 / 256),
          tx_bps: pair0Bps,
          rx_bps: pair0Bps,
          tx_pkts: { total: packetTotal },
          rx_pkts: { total: packetTotal }
        },
        "202": {
          tx_pps: Math.round(pair1Bps / 8 / 256),
          rx_pps: Math.round(pair1Bps / 8 / 256),
          tx_bps: pair1Bps,
          rx_bps: pair1Bps,
          tx_pkts: { total: packetTotal },
          rx_pkts: { total: packetTotal }
        }
      },
      latency: {
        global: { old_flow: 0, bad_hdr: 0 },
        "101": {
          latency: {
            average: 9,
            jitter: 1,
            last_max: 12,
            total_max: 18,
            histogram: { "5": 230, "10": 740, "20": 30 }
          },
          err_cntrs: { dropped: 0, dup: 0, ooo: 0, sth: 0, stl: 0 }
        },
        "202": {
          latency: {
            average: 11,
            jitter: 2,
            last_max: 17,
            total_max: 24,
            histogram: { "5": 90, "10": 620, "20": 280, "30": 10 }
          },
          err_cntrs: { dropped: 0, dup: 0, ooo: 0, sth: 0, stl: 0 }
        }
      }
    },
    blocker: null,
    error: null
  };
}

function captureStatusResponse(scenario) {
  const captures = scenario === "capture"
    ? [
        {
          id: 41,
          state: "ACTIVE",
          count: 640,
          bytes: 163_840,
          limit: 2000,
          mode: "fixed",
          filter: { rx: [1], tx: [0], bpf: "udp" }
        },
        {
          id: 42,
          state: "ACTIVE",
          count: 9800,
          bytes: 1_254_400,
          limit: 10_000,
          mode: "cyclic",
          filter: { rx: [3], tx: [2], bpf: "vlan" }
        }
      ]
    : [];
  return {
    ok: true,
    data: {
      captures,
      port_usage: scenario === "capture"
        ? [
            { port: 0, rx_recorder_ids: [], tx_recorder_ids: [41] },
            { port: 1, rx_recorder_ids: [41], tx_recorder_ids: [] },
            { port: 2, rx_recorder_ids: [], tx_recorder_ids: [42] },
            { port: 3, rx_recorder_ids: [42], tx_recorder_ids: [] }
          ]
        : [],
      service_mode: {
        enabled_ports: scenario === "capture" ? [0, 1, 2, 3] : [],
        already_enabled_ports: [],
        restored_ports: [],
        managed_capture_ids: captures.map((capture) => capture.id)
      }
    },
    blocker: null,
    error: null
  };
}

const captureFilesResponse = {
  ok: true,
  data: {
    root: "/docs/fixtures/captures",
    files: [
      ["docs-udp-baseline.pcap", 428_320, "2026-07-22T11:58:40Z"],
      ["docs-vlan-ring.pcap", 1_284_096, "2026-07-22T11:56:15Z"],
      ["docs-ipv6-latency.pcap", 362_752, "2026-07-22T11:51:02Z"]
    ].map(([name, sizeBytes, modifiedTime]) => ({
      path: `/docs/fixtures/captures/${name}`,
      name,
      size_bytes: sizeBytes,
      modified_time: modifiedTime,
      download_available: true,
      content_base64: null,
      download_error: null
    }))
  },
  blocker: null,
  error: null
};

function decodedPacket({
  destinationIp,
  destinationPort,
  index,
  info,
  postLayers = [],
  preLayers = [],
  protocol,
  sourceIp,
  sourcePort
}) {
  const transportFields = sourcePort === null || destinationPort === null
    ? []
    : [
        { name: "Source Port", value: String(sourcePort) },
        { name: "Destination Port", value: String(destinationPort) }
      ];
  return {
    index,
    time: 0.000125 * index,
    port: index % 2 === 1 ? 0 : 1,
    mode: index % 2 === 0 ? "RX" : "TX",
    destination: "ff:ff:ff:ff:ff:ff",
    source: "00:00:00:00:00:00",
    type: "IPv4",
    length: 96 + index * 4,
    wirelen: 96 + index * 4,
    info,
    binary_base64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    hex_preview: "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00",
    decoded_layers: [
      {
        name: "Ethernet",
        fields: [
          { name: "Destination", value: "ff:ff:ff:ff:ff:ff" },
          { name: "Source", value: "00:00:00:00:00:00" },
          { name: "Type", value: "0x0800" }
        ]
      },
      ...preLayers,
      {
        name: "IPv4",
        fields: [
          { name: "Source", value: sourceIp },
          { name: "Destination", value: destinationIp },
          { name: "TTL", value: "64" }
        ]
      },
      {
        name: protocol,
        fields: transportFields
      },
      ...postLayers
    ]
  };
}

const documentationPackets = [
  decodedPacket({
    index: 1,
    sourceIp: "192.0.2.20",
    destinationIp: "198.51.100.53",
    sourcePort: 40001,
    destinationPort: 53,
    protocol: "UDP",
    info: "UDP 40001 → 53 · documentation query"
  }),
  decodedPacket({
    index: 2,
    sourceIp: "192.0.2.21",
    destinationIp: "198.51.100.80",
    sourcePort: 41002,
    destinationPort: 443,
    protocol: "TCP",
    info: "TCP 41002 → 443 · SYN"
  }),
  decodedPacket({
    index: 3,
    sourceIp: "192.0.2.22",
    destinationIp: "198.51.100.22",
    sourcePort: null,
    destinationPort: null,
    protocol: "ICMP",
    info: "ICMP echo request · documentation sample"
  }),
  decodedPacket({
    index: 4,
    sourceIp: "192.0.2.23",
    destinationIp: "203.0.113.23",
    sourcePort: 42004,
    destinationPort: 4789,
    protocol: "UDP",
    preLayers: [
      {
        name: "802.1Q VLAN",
        fields: [
          { name: "VLAN ID", value: "200" },
          { name: "Priority", value: "0" }
        ]
      }
    ],
    info: "VLAN 200 · UDP 42004 → 4789"
  }),
  decodedPacket({
    index: 5,
    sourceIp: "192.0.2.20",
    destinationIp: "198.51.100.53",
    sourcePort: 40005,
    destinationPort: 53,
    protocol: "UDP",
    postLayers: [{ name: "DNS", fields: [{ name: "Query", value: "example.invalid" }] }],
    info: "DNS query · example.invalid"
  }),
  decodedPacket({
    index: 6,
    sourceIp: "198.51.100.80",
    destinationIp: "192.0.2.21",
    sourcePort: 443,
    destinationPort: 41002,
    protocol: "TCP",
    info: "TCP 443 → 41002 · SYN, ACK"
  })
];
documentationPackets[1].decoded_layers.at(-1).fields.push({ name: "Flags", value: "SYN" });
documentationPackets[5].decoded_layers.at(-1).fields.push({ name: "Flags", value: "SYN, ACK" });

const captureFetchResponse = {
  ok: true,
  data: {
    accepted: true,
    id: 41,
    packets: documentationPackets,
    packet_count: documentationPackets.length,
    fetch_budget: {
      requested_packet_count: 1000,
      target_packet_count: documentationPackets.length,
      max_packet_count: 10_000,
      max_bytes: 1_048_576,
      fetched_bytes: documentationPackets.reduce((total, packet) => total + packet.length, 0),
      effective_snaplen: 0,
      truncated_by_byte_budget: false,
      available_packet_count: 640,
      omitted_packet_count: 634
    },
    ...captureStatusResponse("capture").data,
    capture_stopped: false,
    capture_removed: false,
    available_packet_count: 640,
    primary_error: null,
    cleanup_errors: []
  },
  blocker: null,
  error: null
};

const runReportsResponse = {
  ok: true,
  data: {
    root: "/docs/fixtures/reports",
    files: Array.from({ length: 5 }, (_, index) => {
      const sequence = 5 - index;
      return {
        path: `/docs/fixtures/reports/docs-sample-${sequence}.json`,
        name: `docs-sample-${sequence}.json`,
        size_bytes: 398_000 + index * 7200,
        modified_time: `2026-07-22T11:${String(48 - index * 7).padStart(2, "0")}:00Z`,
        title: `Documentation Sample ${sequence} · Six-port baseline`,
        generated_at: `2026-07-22T11:${String(48 - index * 7).padStart(2, "0")}:00Z`,
        download_available: true,
        content: null,
        download_error: null
      };
    })
  },
  blocker: null,
  error: null
};

const runReportTrendsResponse = {
  ok: true,
  data: {
    root: "/docs/fixtures/reports",
    total: 5,
    skipped: 0,
    verdict_counts: { pass: 5, warn: 0, fail: 0, unknown: 0 },
    conclusion: {
      verdict: "pass",
      title: "History Healthy",
      summary: "All documentation samples completed without packet loss",
      reasons: ["5 passing documentation samples"]
    },
    metric_trends: [
      { label: "Tx PPS", latest: "569 Kpps", previous: "561 Kpps", delta: 8, unit: "Kpps", direction: "up", samples: 5 },
      { label: "Rx PPS", latest: "569 Kpps", previous: "561 Kpps", delta: 8, unit: "Kpps", direction: "up", samples: 5 },
      { label: "Latency avg", latest: "9 us", previous: "10 us", delta: -1, unit: "us", direction: "down", samples: 5 }
    ],
    records: Array.from({ length: 5 }, (_, index) => ({
      name: `docs-sample-${5 - index}.json`,
      title: `Documentation Sample ${5 - index} · Six-port baseline`,
      generated_at: `2026-07-22T11:${String(48 - index * 7).padStart(2, "0")}:00Z`,
      modified_time: `2026-07-22T11:${String(48 - index * 7).padStart(2, "0")}:00Z`,
      verdict: "pass",
      summary: "Clean illustrative run window",
      profile: "docs_udp_baseline.py",
      run_duration: "60 s",
      metrics: {
        "Tx PPS": { value: `${569 - index * 8} Kpps`, number: 569 - index * 8, unit: "Kpps" },
        "Latency avg": { value: `${9 + (index % 2)} us`, number: 9 + (index % 2), unit: "us" }
      }
    }))
  },
  blocker: null,
  error: null
};

const profileCatalogResponse = {
  ok: true,
  data: {
    roots: [
      {
        path: documentationProfileRoot,
        exists: true,
        readable: true,
        profile_count: profileRecords.length,
        blocker: null,
        error: null
      }
    ],
    profiles: profileRecords,
    supported_suffixes: [".cap", ".json", ".pcap", ".py", ".yaml", ".yml"]
  },
  blocker: null,
  error: null
};

function assertSanitizedFixtures() {
  const serialized = JSON.stringify({
    systemOverview,
    trafficRuntime,
    stats: statsResponse(),
    capture: captureStatusResponse("capture"),
    captureFetchResponse,
    captureFilesResponse,
    runReportsResponse,
    runReportTrendsResponse,
    profileCatalogResponse
  });
  const forbiddenPatterns = [
    { label: "private 10/8 address", pattern: /(?:^|[^0-9])10\.\d+\.\d+\.\d+/ },
    { label: "private 172.16/12 address", pattern: /(?:^|[^0-9])172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+/ },
    { label: "private 192.168/16 address", pattern: /(?:^|[^0-9])192\.168\.\d+\.\d+/ },
    { label: "root home path", pattern: /\/root\// },
    { label: "workspace path", pattern: /\/opt\/trex-webui/ },
    { label: "PCI BDF", pattern: /\b[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-7]\b/i },
    { label: "non-placeholder MAC", pattern: /\b(?!00:00:00:00:00:00\b)(?!ff:ff:ff:ff:ff:ff\b)[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i }
  ];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`Documentation fixture contains forbidden ${label}.`);
    }
  }
  if (!serialized.includes("192.0.2.10") || !serialized.includes("/docs/fixtures/")) {
    throw new Error("Documentation fixture must retain its RFC 5737 address and explicit fixture paths.");
  }
}

function fixtureFor(method, pathname, scenario) {
  if (method === "POST" && pathname === "/api/trex/capture/fetch" && scenario === "capture") {
    return captureFetchResponse;
  }
  if (method !== "GET") {
    return null;
  }
  if (pathname === "/api/system/overview") {
    return systemOverview;
  }
  if (pathname === "/api/trex/profiles") {
    return profileCatalogResponse;
  }
  if (pathname === "/api/trex/traffic/runtime") {
    return trafficRuntime;
  }
  if (pathname === "/api/trex/stats") {
    return statsResponse();
  }
  if (pathname === "/api/trex/capture/status") {
    return captureStatusResponse(scenario);
  }
  if (pathname === "/api/trex/capture/files") {
    return captureFilesResponse;
  }
  if (pathname === "/api/trex/reports") {
    return runReportsResponse;
  }
  if (pathname === "/api/trex/reports/trends") {
    return runReportTrendsResponse;
  }
  return null;
}

async function installDocumentationApi(page, scenario, unknownRequests) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const fixture = fixtureFor(method, url.pathname, scenario);
    if (fixture === null) {
      unknownRequests.push(`${method} ${url.pathname}`);
      await route.fulfill({
        status: 501,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "README capture blocks API calls outside its documentation fixture contract"
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "no-store",
        "x-trex-webui-data-source": "sanitized-documentation-fixture"
      },
      body: JSON.stringify(fixture)
    });
  });
}

async function preparePage(browser, url, scenario) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const unknownRequests = [];
  await page.addInitScript(({ fixedNow }) => {
    const NativeDate = Date;
    class DocumentationDate extends NativeDate {
      constructor(...arguments_) {
        if (arguments_.length === 0) {
          super(fixedNow);
        } else {
          super(...arguments_);
        }
      }

      static now() {
        return fixedNow;
      }
    }
    Object.defineProperty(globalThis, "Date", {
      configurable: true,
      value: DocumentationDate
    });
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: undefined
    });
  }, { fixedNow: Date.parse(fixedGeneratedAt) });
  await installDocumentationApi(page, scenario, unknownRequests);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator(".workbench-shell").waitFor({ state: "visible", timeout: 15_000 });
  await page.evaluate(async (marker) => {
    await document.fonts.ready;
    const style = document.createElement("style");
    style.dataset.readmeCapture = "true";
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
      [data-readme-watermark] {
        align-items: center;
        background: rgba(235, 248, 252, 0.96);
        border: 1px solid #78b9c9;
        border-radius: 3px;
        box-shadow: 0 2px 8px rgba(16, 45, 54, 0.12);
        color: #275563;
        display: flex;
        font: 600 11px/1.2 "IBM Plex Sans", sans-serif;
        gap: 6px;
        letter-spacing: 0.055em;
        padding: 6px 9px;
        pointer-events: none;
        position: fixed;
        right: 48px;
        text-transform: uppercase;
        top: 7px;
        z-index: 2147483647;
      }
      [data-readme-watermark]::before {
        background: #1b8aa5;
        border-radius: 50%;
        content: "";
        height: 7px;
        width: 7px;
      }
    `;
    document.head.append(style);
    const watermark = document.createElement("div");
    watermark.dataset.readmeWatermark = "true";
    watermark.textContent = marker;
    document.body.append(watermark);
  }, documentationMarker);
  await page.waitForTimeout(350);
  return { context, page, unknownRequests };
}

async function promoteWatermarkInto(dialog) {
  await dialog.evaluate((element, marker) => {
    let watermark = document.querySelector("[data-readme-watermark]");
    if (!watermark) {
      watermark = document.createElement("div");
      watermark.dataset.readmeWatermark = "true";
      watermark.textContent = marker;
    }
    const title = element.querySelector(".floating-window-title");
    const closeButton = title?.querySelector("button");
    if (watermark && title && closeButton) {
      Object.assign(watermark.style, {
        flex: "0 0 auto",
        marginLeft: "auto",
        position: "static"
      });
      closeButton.style.marginLeft = "0";
      title.insertBefore(watermark, closeButton);
    }
  }, documentationMarker);
  await dialog.locator("[data-readme-watermark]", {
    hasText: documentationMarker
  }).waitFor({ state: "visible" });
}

async function captureScenario(browser, url, outputDir, scenario) {
  const { context, page, unknownRequests } = await preparePage(browser, url, scenario);
  try {
    if (scenario === "dashboard") {
      await page.getByRole("button", { name: "Stats", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Dashboard", exact: true });
      await dialog.waitFor({ state: "visible" });
      await promoteWatermarkInto(dialog);
      await dialog.getByRole("tab", { name: "Charts", exact: true }).click();
      await dialog.getByRole("tabpanel").waitFor({ state: "visible" });
      await dialog.getByText("5 samples", { exact: true }).waitFor({
        state: "visible",
        timeout: 10_000
      });
      await promoteWatermarkInto(dialog);
    } else if (scenario === "profile") {
      await page.getByRole("button", { name: "Traffic Profiles", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Traffic Profiles", exact: true });
      await dialog.waitFor({ state: "visible" });
      await promoteWatermarkInto(dialog);
      await dialog.getByRole("option", { name: "docs_vlan_sweep.yaml", exact: true }).click();
      const protocolTab = dialog.getByRole("tab", { name: "Protocol Selection", exact: true });
      await protocolTab.waitFor({ state: "visible" });
      await protocolTab.click();
      await dialog.locator(".stream-builder-pane").scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await promoteWatermarkInto(dialog);
    } else if (scenario === "capture") {
      await page.getByRole("button", { name: "Capture", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Packet Capture", exact: true });
      await dialog.waitFor({ state: "visible" });
      await promoteWatermarkInto(dialog);
      const recordersTab = dialog.getByRole("tab", { name: "Recorders", exact: true });
      await recordersTab.click();
      await dialog.getByRole("button", { name: "Fetch packets for capture 41", exact: true }).click();
      await dialog.getByRole("tab", { name: "Monitor", exact: true }).waitFor({ state: "visible" });
      await dialog.getByRole("table", { name: "Capture protocol mix", exact: true }).waitFor({ state: "visible" });
      await dialog.locator(".capture-packet-row").first().click();
      await dialog.getByLabel("Packet viewer").getByText("UDP 40001 → 53 · documentation query", {
        exact: false
      }).waitFor({ state: "visible" });
      await promoteWatermarkInto(dialog);
    } else if (scenario === "reports") {
      await page.getByRole("button", { name: "Traffic Profiles", exact: true }).click();
      const profilesDialog = page.getByRole("dialog", { name: "Traffic Profiles", exact: true });
      await profilesDialog.waitFor({ state: "visible" });
      await profilesDialog.getByRole("option", { name: "docs_udp_baseline.py", exact: true }).click();
      await profilesDialog.getByTitle("Close Traffic Profiles", { exact: true }).click();
      await profilesDialog.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Run Reports", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Run Reports", exact: true });
      await dialog.waitFor({ state: "visible" });
      await promoteWatermarkInto(dialog);
      await dialog.getByRole("tab", { name: "Overview", exact: true }).waitFor({ state: "visible" });
      await dialog.getByText("Current Snapshot", { exact: true }).waitFor({ state: "visible" });
      await page.waitForTimeout(900);
      await promoteWatermarkInto(dialog);
    } else {
      throw new Error(`Unknown README screenshot scenario: ${scenario}`);
    }

    if (unknownRequests.length > 0) {
      throw new Error(
        `README capture attempted API calls outside the sanitized contract: ${[...new Set(unknownRequests)].join(", ")}`
      );
    }
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const outputPath = path.join(outputDir, outputNames[scenario]);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: outputPath
    });
    return outputPath;
  } finally {
    await context.close();
  }
}

function usage() {
  return `Usage: npm run screenshot:readme -- [options]

Generate four 1600x900 README images from the current React UI. All API data is
sanitized illustrative documentation data and never reaches the lab backend.

Options:
  --url URL       React WebUI URL; auto-detects local Vite/Nginx when omitted
  --out-dir PATH  Output directory; default: docs/images
  -h, --help      Show this help`;
}

async function main() {
  if (hasFlag("-h") || hasFlag("--help")) {
    console.log(usage());
    return;
  }
  assertProjectNodeVersion();
  assertSanitizedFixtures();
  const url = await resolveTargetUrl();
  const outputDir = path.resolve(
    readOption("--out-dir") ??
      process.env.README_SCREENSHOT_OUTPUT_DIR ??
      path.join(rootDir, "docs", "images")
  );
  await mkdir(outputDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    console.warn(
      `Generating README images from ${url} with ${documentationMarker}. ` +
        "These images are not real-hardware acceptance evidence."
    );
    const outputs = [];
    for (const scenario of Object.keys(outputNames)) {
      outputs.push(await captureScenario(browser, url, outputDir, scenario));
    }
    console.log(`Captured ${outputs.length} sanitized README screenshots at ${viewport.width}x${viewport.height}:`);
    for (const output of outputs) {
      console.log(output);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
