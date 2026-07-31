import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Download, ExternalLink, Plus, RefreshCw, Square, Trash2, Wifi, X } from "lucide-react";

import type {
  CaptureFileRequest,
  CaptureFetchRequest,
  CaptureRemoveRequest,
  CaptureStartRequest,
  CaptureStopRequest,
  TrexCaptureFileDownloadResult,
  TrexCaptureFileOpenResult,
  TrexCaptureFiles,
  TrexCapturePacket,
  TrexCapturePacketResult,
  TrexCaptureRecord,
  TrexCaptureRemoveResult,
  TrexCaptureStartResult,
  TrexCaptureStatus,
  TrexPortRecord,
  TrexResult
} from "../../api";
import { displayCount, displayValue } from "./format";

type PacketCaptureWorkspaceProps = {
  isCaptureBusy: boolean;
  isCaptureFilesLoading: boolean;
  isCaptureStatusLoading: boolean;
  runtimeControlDisabledReason: string | null;
  portRecords: TrexPortRecord[];
  captureDroppedPacketCount: number;
  captureFilesResult: TrexResult<TrexCaptureFiles> | null;
  capturePackets: TrexCapturePacket[];
  captureResult: TrexResult<
    TrexCaptureStartResult | TrexCapturePacketResult | TrexCaptureRemoveResult | TrexCaptureFileDownloadResult | TrexCaptureFileOpenResult
  > | null;
  captureStatusResult: TrexResult<TrexCaptureStatus> | null;
  onClearPackets: () => void;
  onDownloadCaptureFile: (request: CaptureFileRequest) => Promise<TrexResult<TrexCaptureFileDownloadResult>>;
  onFetchCapture: (request: CaptureFetchRequest) => Promise<TrexResult<TrexCapturePacketResult>>;
  onOpenCaptureFile: (request: CaptureFileRequest) => Promise<TrexResult<TrexCaptureFileOpenResult>>;
  onRefreshFiles: () => Promise<TrexResult<TrexCaptureFiles>>;
  onRefreshStatus: () => Promise<void>;
  onRemoveCapture: (request: CaptureRemoveRequest) => Promise<TrexResult<TrexCaptureRemoveResult>>;
  onRemoveAllCaptures: () => Promise<TrexResult<TrexCaptureRemoveResult>>;
  onStartCapture: (request: CaptureStartRequest) => Promise<TrexResult<TrexCaptureStartResult>>;
  onStopCapture: (request: CaptureStopRequest) => Promise<TrexResult<TrexCapturePacketResult>>;
};

type CaptureTab = "Monitor" | "Recorders" | "Files";
type CaptureStrategyPresetKey = "monitor" | "ring" | "headers" | "save";
type CaptureStrategyKey = CaptureStrategyPresetKey | "custom";
type CaptureTriggerPresetKey =
  | "any"
  | "arp"
  | "icmp"
  | "tcp-syn"
  | "tcp-rst"
  | "udp"
  | "dns"
  | "dhcp"
  | "gtpu"
  | "vlan"
  | "mpls"
  | "vxlan"
  | "gre";
type CaptureTriggerKey = CaptureTriggerPresetKey | "custom";

const tabs: CaptureTab[] = ["Monitor", "Recorders", "Files"];
const MONITOR_FETCH_INTERVAL_MS = 1000;
const CAPTURE_PACKET_LIMIT_MAX = 10_000;
const CAPTURE_PACKET_TABLE_PAGE_SIZE = 250;
const CAPTURE_FILE_TABLE_PAGE_SIZE = 50;
const captureStrategyOrder: CaptureStrategyPresetKey[] = ["monitor", "ring", "headers", "save"];
const captureTriggerOrder: CaptureTriggerPresetKey[] = [
  "any",
  "arp",
  "icmp",
  "tcp-syn",
  "tcp-rst",
  "udp",
  "dns",
  "dhcp",
  "gtpu",
  "vlan",
  "mpls",
  "vxlan",
  "gre"
];
const captureStrategyPresets: Record<
  CaptureStrategyPresetKey,
  {
    label: string;
    fetchCount: string;
    fileName: string;
    limit: string;
    mode: "fixed" | "cyclic";
    savePcap: boolean;
    snaplen: string;
    summary: string;
  }
> = {
  monitor: {
    label: "Monitor",
    fetchCount: "1000",
    fileName: "capture.pcap",
    limit: "1000",
    mode: "fixed",
    savePcap: true,
    snaplen: "0",
    summary: "live monitor / fixed window"
  },
  ring: {
    label: "Ring Buffer",
    fetchCount: "1000",
    fileName: "ring-capture.pcap",
    limit: "10000",
    mode: "cyclic",
    savePcap: true,
    snaplen: "0",
    summary: "cyclic recorder / overwrite oldest"
  },
  headers: {
    label: "Header Sample",
    fetchCount: "500",
    fileName: "header-sample.pcap",
    limit: "5000",
    mode: "fixed",
    savePcap: false,
    snaplen: "128",
    summary: "bounded headers / 128B snaplen"
  },
  save: {
    label: "Full PCAP",
    fetchCount: "10000",
    fileName: "capture.pcap",
    limit: "50000",
    mode: "fixed",
    savePcap: true,
    snaplen: "0",
    summary: "larger fixed recorder / save on stop"
  }
};
const captureTriggerPresets: Record<
  CaptureTriggerPresetKey,
  {
    bpf: string;
    label: string;
    summary: string;
  }
> = {
  any: { bpf: "", label: "Any", summary: "no BPF trigger" },
  arp: { bpf: "arp", label: "ARP", summary: "ARP requests/replies" },
  icmp: { bpf: "icmp or icmp6", label: "ICMP", summary: "ICMP and ICMPv6" },
  "tcp-syn": { bpf: "tcp[tcpflags] & tcp-syn != 0", label: "TCP SYN", summary: "TCP SYN flag set" },
  "tcp-rst": { bpf: "tcp[tcpflags] & tcp-rst != 0", label: "TCP RST", summary: "TCP reset packets" },
  udp: { bpf: "udp", label: "UDP", summary: "all UDP packets" },
  dns: { bpf: "udp port 53", label: "DNS", summary: "DNS over UDP/53" },
  dhcp: { bpf: "udp port 67 or udp port 68", label: "DHCP", summary: "DHCP client/server ports" },
  gtpu: { bpf: "udp port 2152", label: "GTP-U", summary: "GTP-U UDP/2152" },
  vlan: { bpf: "vlan", label: "VLAN", summary: "802.1Q tagged frames" },
  mpls: { bpf: "mpls", label: "MPLS", summary: "MPLS-labeled frames" },
  vxlan: { bpf: "udp port 4789", label: "VXLAN", summary: "VXLAN UDP/4789" },
  gre: { bpf: "ip proto 47 or ip6 proto 47", label: "GRE", summary: "IPv4/IPv6 GRE" }
};

function captureTriggerForBpf(value: string): CaptureTriggerKey {
  const normalized = value.trim();
  const preset = captureTriggerOrder.find((trigger) => captureTriggerPresets[trigger].bpf === normalized);
  return preset ?? "custom";
}

function parsePortList(value: string): { ports: number[]; error: string | null } {
  if (value.trim() === "") {
    return { ports: [], error: null };
  }

  const ports: number[] = [];
  for (const token of value.split(",")) {
    const candidate = token.trim();
    if (!/^\d+$/.test(candidate)) {
      return { ports: [], error: `invalid port value: ${candidate || "<empty>"}` };
    }
    const parsed = Number(candidate);
    if (!Number.isSafeInteger(parsed)) {
      return { ports: [], error: "port IDs must be safe non-negative integers" };
    }
    if (!ports.includes(parsed)) {
      ports.push(parsed);
    }
  }
  return { ports, error: null };
}

function availableCapturePortIds(portRecords: TrexPortRecord[]) {
  return [...new Set(
    portRecords
      .map((port) => port.id)
      .filter((port) => Number.isSafeInteger(port) && port >= 0)
  )].sort((left, right) => left - right);
}

function serializePortList(ports: Iterable<number>) {
  return [...new Set(ports)].sort((left, right) => left - right).join(",");
}

function capturePortSelectionLabel(direction: "Rx" | "Tx", parsed: ReturnType<typeof parsePortList>) {
  if (parsed.error) {
    return `${direction} invalid IDs`;
  }
  if (parsed.ports.length === 0) {
    return `${direction} none`;
  }
  return `${direction} ${parsed.ports.map((port) => `P${port}`).join(", ")}`;
}

function parseBoundedInteger(value: string, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return {
      error: `${label} must be an integer between ${minimum} and ${maximum}`,
      value: null
    };
  }
  return { error: null, value: parsed };
}

function captureId(record: TrexCaptureRecord) {
  return String(record.id);
}

function captureState(record: TrexCaptureRecord) {
  return String(record.state ?? record.status ?? "-");
}

function captureCount(record: TrexCaptureRecord) {
  return displayCount(capturePacketCountValue(record));
}

function captureNumericValue(
  record: TrexCaptureRecord,
  keys: Array<"count" | "pkt_count" | "matched" | "fetched" | "limit">
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return null;
}

function capturePacketCountValue(record: TrexCaptureRecord) {
  return captureNumericValue(record, ["count", "pkt_count", "matched", "fetched"]) ?? 0;
}

function captureLimitValue(record: TrexCaptureRecord) {
  return captureNumericValue(record, ["limit"]);
}

function captureCapacity(record: TrexCaptureRecord) {
  const count = capturePacketCountValue(record);
  const limit = captureLimitValue(record);
  const mode = String(record.mode ?? "fixed").toLowerCase();
  const isCyclic = mode === "cyclic";
  if (limit === null || limit <= 0) {
    return {
      className: "capture-capacity-pill--unknown",
      diagnostic: isCyclic ? "Ring buffer, limit unknown" : "Limit unknown",
      state: "unknown",
      text: `${displayCount(count)} / -`
    };
  }

  const ratio = count / limit;
  const percent = `${Math.min(100, Math.round(ratio * 100))}%`;
  if (isCyclic && count >= limit) {
    return {
      className: "capture-capacity-pill--ring-full",
      diagnostic: "Ring full; newest packets overwrite oldest",
      state: "ring-full",
      text: `${displayCount(count)} / ${displayCount(limit)} (${percent})`
    };
  }
  if (isCyclic) {
    return {
      className: "capture-capacity-pill--ring",
      diagnostic: "Ring buffer active",
      state: "ring",
      text: `${displayCount(count)} / ${displayCount(limit)} (${percent})`
    };
  }
  if (count >= limit) {
    return {
      className: "capture-capacity-pill--full",
      diagnostic: "Full; stop or fetch before later packets are missed",
      state: "full",
      text: `${displayCount(count)} / ${displayCount(limit)} (${percent})`
    };
  }
  if (ratio >= 0.8) {
    return {
      className: "capture-capacity-pill--near",
      diagnostic: "Near limit",
      state: "near",
      text: `${displayCount(count)} / ${displayCount(limit)} (${percent})`
    };
  }
  return {
    className: "capture-capacity-pill--ok",
    diagnostic: "Recording",
    state: "ok",
    text: `${displayCount(count)} / ${displayCount(limit)} (${percent})`
  };
}

function captureFilter(record: TrexCaptureRecord) {
  const filter = record.filter;
  if (filter && typeof filter === "object") {
    const bpf = filter.bpf;
    return typeof bpf === "string" && bpf ? bpf : "-";
  }
  return "-";
}

function captureFileTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function capturePortUsageLabel(usage: TrexCaptureStatus["port_usage"] | undefined) {
  if (!usage || usage.length === 0) {
    return "No active capture ports";
  }
  return usage.map((entry) => {
    const parts: string[] = [];
    if (entry.rx_recorder_ids.length > 0) {
      parts.push(`Rx #${entry.rx_recorder_ids.join(", #")}`);
    }
    if (entry.tx_recorder_ids.length > 0) {
      parts.push(`Tx #${entry.tx_recorder_ids.join(", #")}`);
    }
    return `Port ${entry.port} ${parts.join(" / ")}`;
  }).join("; ");
}

function portsLabel(ports: number[]) {
  if (ports.length === 1) {
    return `port ${ports[0]}`;
  }
  return `ports ${ports.join(", ")}`;
}

function captureServiceModeLabel(serviceMode: TrexCaptureStatus["service_mode"] | undefined) {
  if (!serviceMode) {
    return null;
  }
  const restoredPorts = serviceMode.restored_ports ?? [];
  if (restoredPorts.length > 0) {
    return `Service mode restored on ${portsLabel(restoredPorts)}`;
  }
  const enabledPorts = serviceMode.enabled_ports ?? [];
  if (enabledPorts.length > 0) {
    return `Service mode enabled on ${portsLabel(enabledPorts)}`;
  }
  const managedCaptureIds = serviceMode.managed_capture_ids ?? [];
  if (managedCaptureIds.length > 0) {
    return `Service mode managed for recorder #${managedCaptureIds.join(", #")}`;
  }
  return null;
}

function withServiceModeLabel(message: string, serviceMode: TrexCaptureStatus["service_mode"] | undefined) {
  const serviceModeLabel = captureServiceModeLabel(serviceMode);
  return serviceModeLabel ? `${message}; ${serviceModeLabel}` : message;
}

function capturePorts(record: TrexCaptureRecord, direction: "rx" | "tx") {
  const filter = record.filter;
  if (filter && typeof filter === "object") {
    return displayValue(filter[direction]);
  }
  return "-";
}

function numericCaptureId(record: TrexCaptureRecord) {
  const id = Number(record.id);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

function packetKey(packet: TrexCapturePacket) {
  return `${packet.index}:${packet.time}:${packet.port}:${packet.mode}`;
}

function captureFileNameForRecorder(fileName: string, captureIdValue: number) {
  const trimmed = fileName.trim() || "capture.pcap";
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex > 0) {
    return `${trimmed.slice(0, dotIndex)}-${captureIdValue}${trimmed.slice(dotIndex)}`;
  }
  return `${trimmed}-${captureIdValue}.pcap`;
}

function hexPreviewRows(hexPreview: string) {
  const cleanHex = hexPreview.replace(/[^0-9a-f]/gi, "");
  const rows: Array<{ offset: string; hex: string; ascii: string }> = [];
  for (let offset = 0; offset < cleanHex.length; offset += 32) {
    const chunk = cleanHex.slice(offset, offset + 32);
    const bytes = chunk.match(/.{1,2}/g) ?? [];
    rows.push({
      offset: offset.toString(16).padStart(4, "0"),
      hex: bytes.join(" "),
      ascii: bytes.map((byte) => {
        const value = Number.parseInt(byte, 16);
        return value >= 32 && value <= 126 ? String.fromCharCode(value) : ".";
      }).join("")
    });
  }
  return rows;
}

type CaptureDecodedLayer = NonNullable<TrexCapturePacket["decoded_layers"]>[number];

function captureLayerField(layer: CaptureDecodedLayer | undefined, fieldNames: string[]) {
  if (!layer) {
    return null;
  }
  const normalizedFieldNames = new Set(fieldNames.map((name) => name.toLowerCase()));
  const field = layer.fields.find((entry) => normalizedFieldNames.has(entry.name.toLowerCase()));
  return field?.value ?? null;
}

function captureLayer(packet: TrexCapturePacket, layerNames: string[]) {
  const normalizedLayerNames = new Set(layerNames.map((name) => name.toLowerCase()));
  return packet.decoded_layers?.find((layer) => normalizedLayerNames.has(layer.name.toLowerCase()));
}

function incrementCaptureCount(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function captureProtocolLabel(packet: TrexCapturePacket) {
  const layers = packet.decoded_layers ?? [];
  const names = layers.map((layer) => layer.name);
  const priority = [
    "DHCP",
    "DNS",
    "GTP-U",
    "VXLAN",
    "GRE",
    "TCP",
    "UDP",
    "ICMPv6",
    "ICMP",
    "ARP",
    "MPLS",
    "802.1Q VLAN",
    "IPv6",
    "IPv4"
  ];
  return priority.find((name) => names.includes(name)) ?? packet.type ?? "-";
}

function captureProtocolPath(packet: TrexCapturePacket) {
  const layers = packet.decoded_layers?.map((layer) => layer.name).filter(Boolean) ?? [];
  return layers.length > 0 ? layers.join(" / ") : packet.type || "-";
}

function captureEndpointLabel(packet: TrexCapturePacket) {
  const ipv4 = captureLayer(packet, ["IPv4"]);
  const ipv6 = captureLayer(packet, ["IPv6"]);
  const arp = captureLayer(packet, ["ARP"]);
  const l4 = captureLayer(packet, ["TCP", "UDP"]);
  const source =
    captureLayerField(ipv4, ["Source"]) ??
    captureLayerField(ipv6, ["Source"]) ??
    captureLayerField(arp, ["Sender IP"]) ??
    packet.source ??
    "-";
  const destination =
    captureLayerField(ipv4, ["Destination"]) ??
    captureLayerField(ipv6, ["Destination"]) ??
    captureLayerField(arp, ["Target IP"]) ??
    packet.destination ??
    "-";
  const sourcePort = captureLayerField(l4, ["Source Port"]);
  const destinationPort = captureLayerField(l4, ["Destination Port"]);
  const sourceLabel = sourcePort ? `${source}:${sourcePort}` : source;
  const destinationLabel = destinationPort ? `${destination}:${destinationPort}` : destination;
  const protocol = captureProtocolLabel(packet);
  return `${sourceLabel} -> ${destinationLabel} (${protocol})`;
}

function captureSignals(packet: TrexCapturePacket) {
  const layers = packet.decoded_layers ?? [];
  const layerNames = new Set(layers.map((layer) => layer.name));
  const signals: string[] = [];
  const tcp = captureLayer(packet, ["TCP"]);
  const tcpFlags = captureLayerField(tcp, ["Flags"]);

  if (packet.wirelen > packet.length) {
    signals.push("Snaplen truncation");
  }
  if (layerNames.has("802.1Q VLAN")) {
    signals.push("VLAN tagged");
  }
  if (layerNames.has("MPLS")) {
    signals.push("MPLS stack");
  }
  if (layerNames.has("VXLAN") || layerNames.has("GTP-U") || layerNames.has("GRE") || layerNames.has("IP Tunnel") || layerNames.has("UDP Tunnel")) {
    signals.push("Tunnel encapsulation");
  }
  if (layerNames.has("ARP") || layerNames.has("ICMP") || layerNames.has("ICMPv6")) {
    signals.push("Control-plane traffic");
  }
  if (layerNames.has("DNS") || layerNames.has("DHCP")) {
    signals.push("Service discovery");
  }
  if (tcpFlags?.includes("RST")) {
    signals.push("TCP reset");
  }
  if (tcpFlags?.includes("SYN") && !tcpFlags.includes("ACK")) {
    signals.push("TCP SYN without ACK");
  }

  return signals;
}

function topCaptureEntries(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ count, label }));
}

function captureDecodeAnalysis(packets: TrexCapturePacket[]) {
  const protocolCounts = new Map<string, number>();
  const endpointCounts = new Map<string, number>();
  const signalCounts = new Map<string, number>();
  let decodedCount = 0;

  for (const packet of packets) {
    if ((packet.decoded_layers?.length ?? 0) > 0) {
      decodedCount += 1;
    }
    incrementCaptureCount(protocolCounts, captureProtocolPath(packet));
    incrementCaptureCount(endpointCounts, captureEndpointLabel(packet));
    for (const signal of captureSignals(packet)) {
      incrementCaptureCount(signalCounts, signal);
    }
  }

  return {
    decodedCount,
    endpoints: topCaptureEntries(endpointCounts, 4),
    protocols: topCaptureEntries(protocolCounts, 4),
    signals: topCaptureEntries(signalCounts, 4),
    total: packets.length
  };
}

function capturePercent(count: number, total: number) {
  if (total <= 0) {
    return "-";
  }
  return `${Math.round((count / total) * 100)}%`;
}

function captureResultMessage(
  result: TrexResult<
    TrexCaptureStartResult | TrexCapturePacketResult | TrexCaptureRemoveResult | TrexCaptureFileDownloadResult | TrexCaptureFileOpenResult
  > | null,
  formError: string | null
) {
  if (!result) {
    return formError;
  }
  if (!result.ok) {
    return result.error ?? result.blocker ?? formError;
  }
  const data = result.data;
  if (!data) {
    return "Capture command accepted";
  }
  const serviceMode = "captures" in data ? data.service_mode : undefined;
  if ("saved_file" in data && data.saved_file) {
    const savedFile = data.saved_file;
    if (savedFile.download_error) {
      return withServiceModeLabel(`Capture saved ${savedFile.name}: ${savedFile.download_error}`, serviceMode);
    }
    return withServiceModeLabel(`Capture saved ${savedFile.name}`, serviceMode);
  }
  if ("packet_count" in data) {
    return withServiceModeLabel(`Capture command accepted ${data.packet_count} packets`, serviceMode);
  }
  if ("removed_ids" in data) {
    return withServiceModeLabel(`Capture remove accepted ${data.removed_ids.length} recorders`, serviceMode);
  }
  if ("file" in data) {
    if ("pid" in data) {
      return `Capture file opened ${data.file.name}`;
    }
    if (data.file.download_error) {
      return `Capture file ${data.file.name}: ${data.file.download_error}`;
    }
    return `Capture file downloaded ${data.file.name}`;
  }
  if ("id" in data && data.id !== null && data.id !== undefined) {
    return withServiceModeLabel(`Capture recorder ${data.id} started`, serviceMode);
  }
  return withServiceModeLabel("Capture command accepted", serviceMode);
}

export function PacketCaptureWorkspace({
  captureDroppedPacketCount,
  captureFilesResult,
  isCaptureBusy,
  isCaptureFilesLoading,
  isCaptureStatusLoading,
  runtimeControlDisabledReason,
  portRecords,
  capturePackets,
  captureResult,
  captureStatusResult,
  onClearPackets,
  onDownloadCaptureFile,
  onFetchCapture,
  onOpenCaptureFile,
  onRefreshFiles,
  onRefreshStatus,
  onRemoveCapture,
  onRemoveAllCaptures,
  onStartCapture,
  onStopCapture
}: PacketCaptureWorkspaceProps) {
  const availablePortIds = useMemo(() => availableCapturePortIds(portRecords), [portRecords]);
  const initialPortValue = String(availablePortIds[0] ?? "");
  const [activeTab, setActiveTab] = useState<CaptureTab>("Monitor");
  const [selectedCaptureId, setSelectedCaptureId] = useState("");
  const [rxPorts, setRxPorts] = useState(initialPortValue);
  const [txPorts, setTxPorts] = useState(initialPortValue);
  const [showAdvancedPorts, setShowAdvancedPorts] = useState(false);
  const [bpfFilter, setBpfFilter] = useState("");
  const [captureTrigger, setCaptureTrigger] = useState<CaptureTriggerKey>("any");
  const [captureStrategy, setCaptureStrategy] = useState<CaptureStrategyKey>("monitor");
  const [limit, setLimit] = useState("1000");
  const [mode, setMode] = useState<"fixed" | "cyclic">("fixed");
  const [snaplen, setSnaplen] = useState("0");
  const [fetchCount, setFetchCount] = useState("1000");
  const [savePcap, setSavePcap] = useState(true);
  const [fileName, setFileName] = useState("capture.pcap");
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedPacketKey, setSelectedPacketKey] = useState<string | null>(null);
  const [monitorCaptureId, setMonitorCaptureId] = useState<number | null>(null);
  const [packetPageFromLatest, setPacketPageFromLatest] = useState(0);
  const [captureFilePage, setCaptureFilePage] = useState(0);
  const [captureFileQuery, setCaptureFileQuery] = useState("");
  const fetchCaptureRef = useRef(onFetchCapture);
  const portDefaultsInitializedRef = useRef(availablePortIds.length > 0);
  const tabRefs = useRef<Partial<Record<CaptureTab, HTMLButtonElement | null>>>({});
  const packetRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    fetchCaptureRef.current = onFetchCapture;
  }, [onFetchCapture]);

  useEffect(() => {
    const firstPort = availablePortIds[0];
    if (portDefaultsInitializedRef.current || firstPort === undefined) {
      return;
    }
    const defaultPort = String(firstPort);
    setRxPorts(defaultPort);
    setTxPorts(defaultPort);
    portDefaultsInitializedRef.current = true;
  }, [availablePortIds]);

  const captures = useMemo(() => captureStatusResult?.data?.captures ?? [], [captureStatusResult]);
  const captureFiles = useMemo(() => captureFilesResult?.data?.files ?? [], [captureFilesResult]);
  const normalizedCaptureFileQuery = captureFileQuery.trim().toLowerCase();
  const filteredCaptureFiles = useMemo(() => {
    if (!normalizedCaptureFileQuery) {
      return captureFiles;
    }
    return captureFiles.filter((file) =>
      file.name.toLowerCase().includes(normalizedCaptureFileQuery)
      || file.path.toLowerCase().includes(normalizedCaptureFileQuery)
    );
  }, [captureFiles, normalizedCaptureFileQuery]);
  const captureFilePageCount = Math.max(1, Math.ceil(filteredCaptureFiles.length / CAPTURE_FILE_TABLE_PAGE_SIZE));
  const effectiveCaptureFilePage = Math.min(captureFilePage, captureFilePageCount - 1);
  const captureFilePageStart = effectiveCaptureFilePage * CAPTURE_FILE_TABLE_PAGE_SIZE;
  const visibleCaptureFiles = useMemo(
    () => filteredCaptureFiles.slice(captureFilePageStart, captureFilePageStart + CAPTURE_FILE_TABLE_PAGE_SIZE),
    [captureFilePageStart, filteredCaptureFiles]
  );
  const captureFileRangeStart = filteredCaptureFiles.length === 0 ? 0 : captureFilePageStart + 1;
  const captureFileRangeEnd = Math.min(
    filteredCaptureFiles.length,
    captureFilePageStart + visibleCaptureFiles.length
  );
  const portUsageLabel = isCaptureStatusLoading && captureStatusResult === null
    ? "Loading capture ports…"
    : capturePortUsageLabel(captureStatusResult?.data?.port_usage);
  const serviceModeLabel = captureServiceModeLabel(captureStatusResult?.data?.service_mode);
  const activeCaptureIds = useMemo(() => captures.map(numericCaptureId).filter((id): id is number => id !== null), [captures]);
  const effectiveSelectedCaptureId = selectedCaptureId || (captures[0] ? captureId(captures[0]) : "");
  const selectedRecord = captures.find((record) => captureId(record) === effectiveSelectedCaptureId) ?? captures[0] ?? null;
  const effectiveCaptureId = selectedRecord ? Number(selectedRecord.id) : Number(selectedCaptureId);
  const selectedPacket =
    capturePackets.find((packet) => packetKey(packet) === selectedPacketKey)
    ?? capturePackets[capturePackets.length - 1]
    ?? null;
  const packetPageCount = Math.max(1, Math.ceil(capturePackets.length / CAPTURE_PACKET_TABLE_PAGE_SIZE));
  const effectivePacketPage = Math.min(packetPageFromLatest, packetPageCount - 1);
  const visibleCapturePackets = useMemo(() => {
    const end = capturePackets.length - effectivePacketPage * CAPTURE_PACKET_TABLE_PAGE_SIZE;
    const start = Math.max(0, end - CAPTURE_PACKET_TABLE_PAGE_SIZE);
    return capturePackets.slice(start, end);
  }, [capturePackets, effectivePacketPage]);
  const visiblePacketStart = capturePackets.length === 0
    ? 0
    : capturePackets.length - effectivePacketPage * CAPTURE_PACKET_TABLE_PAGE_SIZE - visibleCapturePackets.length + 1;
  const visiblePacketEnd = capturePackets.length - effectivePacketPage * CAPTURE_PACKET_TABLE_PAGE_SIZE;
  const selectedPacketKeyValue = selectedPacket ? packetKey(selectedPacket) : null;
  const focusablePacketKey = selectedPacketKeyValue
    && visibleCapturePackets.some((packet) => packetKey(packet) === selectedPacketKeyValue)
    ? selectedPacketKeyValue
    : visibleCapturePackets.length > 0
      ? packetKey(visibleCapturePackets[visibleCapturePackets.length - 1])
      : null;
  const selectedPacketRows = selectedPacket ? hexPreviewRows(selectedPacket.hex_preview) : [];
  const selectedDecodedLayers = selectedPacket?.decoded_layers ?? [];
  const decodeAnalysis = useMemo(() => captureDecodeAnalysis(capturePackets), [capturePackets]);
  const resultMessage = captureResultMessage(captureResult, formError);
  const parsedRxPorts = useMemo(() => parsePortList(rxPorts), [rxPorts]);
  const parsedTxPorts = useMemo(() => parsePortList(txPorts), [txPorts]);
  const selectedRxPorts = useMemo(
    () => new Set(parsedRxPorts.error ? [] : parsedRxPorts.ports),
    [parsedRxPorts]
  );
  const selectedTxPorts = useMemo(
    () => new Set(parsedTxPorts.error ? [] : parsedTxPorts.ports),
    [parsedTxPorts]
  );
  const selectedAvailableRxCount = availablePortIds.filter((port) => selectedRxPorts.has(port)).length;
  const selectedAvailableTxCount = availablePortIds.filter((port) => selectedTxPorts.has(port)).length;
  const captureTargetSummary = `${capturePortSelectionLabel("Rx", parsedRxPorts)} · ${capturePortSelectionLabel("Tx", parsedTxPorts)}`;
  const strategyLabel =
    captureStrategy === "custom" ? "Custom" : captureStrategyPresets[captureStrategy].label;
  const strategySummary =
    captureStrategy === "custom" ? "manual capture parameters" : captureStrategyPresets[captureStrategy].summary;
  const triggerLabel =
    captureTrigger === "custom" ? "Custom" : captureTriggerPresets[captureTrigger].label;
  const triggerSummary =
    captureTrigger === "custom" ? "manual BPF filter" : captureTriggerPresets[captureTrigger].summary;
  const recorderCapacity = useMemo(() => captures.map(captureCapacity), [captures]);
  const recorderSummary = useMemo(() => {
    if (isCaptureStatusLoading && captureStatusResult === null) {
      return "Loading capture recorders…";
    }
    if (captures.length === 0) {
      return "No active recorders";
    }
    const cyclicCount = recorderCapacity.filter((entry) => entry.state === "ring" || entry.state === "ring-full").length;
    const fullCount = recorderCapacity.filter((entry) => entry.state === "full" || entry.state === "ring-full").length;
    const nearCount = recorderCapacity.filter((entry) => entry.state === "near").length;
    return `${captures.length} active recorder${captures.length === 1 ? "" : "s"} / ${cyclicCount} cyclic / ${fullCount} full / ${nearCount} near limit`;
  }, [captureStatusResult, captures.length, isCaptureStatusLoading, recorderCapacity]);
  const loadingStatusText = activeTab === "Files" && isCaptureFilesLoading
    ? captureFilesResult === null ? "Loading capture files…" : "Refreshing capture files…"
    : activeTab !== "Files" && isCaptureStatusLoading
      ? captureStatusResult === null ? "Loading capture recorders…" : "Refreshing capture recorders…"
      : "";

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: CaptureTab) => {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handlePacketRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    packetIndex: number
  ) => {
    const currentPacket = visibleCapturePackets[packetIndex];
    if (!currentPacket) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedPacketKey(packetKey(currentPacket));
      return;
    }

    let nextIndex: number;
    if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, packetIndex - 1);
    } else if (event.key === "ArrowDown") {
      nextIndex = Math.min(visibleCapturePackets.length - 1, packetIndex + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = visibleCapturePackets.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextPacketKey = packetKey(visibleCapturePackets[nextIndex]);
    setSelectedPacketKey(nextPacketKey);
    packetRowRefs.current[nextPacketKey]?.focus();
  };

  const markCaptureStrategyCustom = () => {
    setCaptureStrategy("custom");
  };

  const applyCaptureTrigger = (trigger: CaptureTriggerPresetKey) => {
    const preset = captureTriggerPresets[trigger];
    setCaptureTrigger(trigger);
    setBpfFilter(preset.bpf);
    setFormError(null);
  };

  const handleBpfFilterChange = (value: string) => {
    setBpfFilter(value);
    setCaptureTrigger(captureTriggerForBpf(value));
  };

  const applyCaptureStrategy = (strategy: CaptureStrategyPresetKey) => {
    const preset = captureStrategyPresets[strategy];
    setCaptureStrategy(strategy);
    setLimit(preset.limit);
    setMode(preset.mode);
    setSnaplen(preset.snaplen);
    setFetchCount(preset.fetchCount);
    setSavePcap(preset.savePcap);
    setFileName(preset.fileName);
    setFormError(null);
  };

  const setPortSelection = (direction: "rx" | "tx", ports: Iterable<number>) => {
    portDefaultsInitializedRef.current = true;
    const value = serializePortList(ports);
    if (direction === "rx") {
      setRxPorts(value);
    } else {
      setTxPorts(value);
    }
    setFormError(null);
  };

  const togglePortSelection = (direction: "rx" | "tx", port: number) => {
    const parsed = direction === "rx" ? parsedRxPorts : parsedTxPorts;
    const nextPorts = new Set(parsed.error ? [] : parsed.ports);
    if (nextPorts.has(port)) {
      nextPorts.delete(port);
    } else {
      nextPorts.add(port);
    }
    setPortSelection(direction, nextPorts);
  };

  const updatePortDraft = (direction: "rx" | "tx", value: string) => {
    portDefaultsInitializedRef.current = true;
    if (direction === "rx") {
      setRxPorts(value);
    } else {
      setTxPorts(value);
    }
    setFormError(null);
  };

  const requireCaptureRuntime = () => {
    if (runtimeControlDisabledReason === null) {
      return true;
    }
    setFormError(runtimeControlDisabledReason);
    return false;
  };

  const buildStartRequest = (): CaptureStartRequest | null => {
    const tx = parsedTxPorts;
    const rx = parsedRxPorts;
    const parsedLimit = parseBoundedInteger(limit, "Limit", 1, CAPTURE_PACKET_LIMIT_MAX);
    const parsedSnaplen = parseBoundedInteger(snaplen, "Snaplen", 0, 65_535);
    if (tx.error || rx.error) {
      setFormError(tx.error ?? rx.error);
      return null;
    }
    if (tx.ports.length === 0 && rx.ports.length === 0) {
      setFormError("at least one TX or RX port is required");
      return null;
    }
    if (parsedLimit.error || parsedSnaplen.error || parsedLimit.value === null || parsedSnaplen.value === null) {
      setFormError(parsedLimit.error ?? parsedSnaplen.error);
      return null;
    }
    setFormError(null);
    return {
      tx_ports: tx.ports,
      rx_ports: rx.ports,
      limit: parsedLimit.value,
      mode,
      bpf_filter: bpfFilter,
      snaplen: parsedSnaplen.value
    };
  };

  const buildFetchSettings = useCallback(() => {
    const parsedFetchCount = parseBoundedInteger(fetchCount, "Packets", 1, 10_000);
    const parsedSnaplen = parseBoundedInteger(snaplen, "Snaplen", 0, 65_535);
    if (parsedFetchCount.error || parsedSnaplen.error || parsedFetchCount.value === null || parsedSnaplen.value === null) {
      setFormError(parsedFetchCount.error ?? parsedSnaplen.error);
      return null;
    }
    setFormError(null);
    return {
      pktCount: parsedFetchCount.value,
      snaplen: parsedSnaplen.value
    };
  }, [fetchCount, snaplen]);

  useEffect(() => {
    if (monitorCaptureId === null || runtimeControlDisabledReason !== null) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled || isCaptureBusy) {
        return;
      }
      const fetchSettings = buildFetchSettings();
      if (!fetchSettings) {
        return;
      }
      void fetchCaptureRef.current({
        capture_id: monitorCaptureId,
        pkt_count: fetchSettings.pktCount,
        fetch_limit: 50,
        snaplen: fetchSettings.snaplen
      });
    }, MONITOR_FETCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [buildFetchSettings, isCaptureBusy, monitorCaptureId, runtimeControlDisabledReason]);

  const handleStartMonitor = async () => {
    if (!requireCaptureRuntime()) {
      return;
    }
    const request = buildStartRequest();
    if (!request) {
      return;
    }
    const result = await onStartCapture(request);
    if (result.ok && result.data?.id !== null && result.data?.id !== undefined) {
      const id = Number(result.data.id);
      setMonitorCaptureId(id);
      setSelectedCaptureId(String(id));
      setActiveTab("Monitor");
    }
  };

  const handleAddRecorder = async () => {
    if (!requireCaptureRuntime()) {
      return;
    }
    const request = buildStartRequest();
    if (!request) {
      return;
    }
    const result = await onStartCapture(request);
    if (result.ok && result.data?.id !== null && result.data?.id !== undefined) {
      setSelectedCaptureId(String(result.data.id));
      setActiveTab("Recorders");
    }
  };

  const handleFetch = async (captureIdValue = effectiveCaptureId) => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (!Number.isInteger(captureIdValue)) {
      setFormError("select an active capture");
      return;
    }
    const fetchSettings = buildFetchSettings();
    if (!fetchSettings) {
      return;
    }
    await onFetchCapture({
      capture_id: captureIdValue,
      pkt_count: fetchSettings.pktCount,
      fetch_limit: 50,
      snaplen: fetchSettings.snaplen
    });
    setActiveTab("Monitor");
  };

  const handleFetchAll = async () => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (activeCaptureIds.length === 0) {
      setFormError("no active captures to fetch");
      return;
    }
    const fetchSettings = buildFetchSettings();
    if (!fetchSettings) {
      return;
    }
    for (const captureIdValue of activeCaptureIds) {
      await onFetchCapture({
        capture_id: captureIdValue,
        pkt_count: fetchSettings.pktCount,
        fetch_limit: 50,
        snaplen: fetchSettings.snaplen
      });
    }
    setActiveTab("Monitor");
  };

  const handleStop = async (captureIdValue = effectiveCaptureId) => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (!Number.isInteger(captureIdValue)) {
      setFormError("select an active capture");
      return;
    }
    const fetchSettings = buildFetchSettings();
    if (!fetchSettings) {
      return;
    }
    await onStopCapture({
      capture_id: captureIdValue,
      pkt_count: fetchSettings.pktCount,
      save_pcap: savePcap,
      file_name: savePcap ? fileName : null,
      snaplen: fetchSettings.snaplen
    });
    if (monitorCaptureId === captureIdValue) {
      setMonitorCaptureId(null);
    }
    setActiveTab("Monitor");
  };

  const handleStopAll = async () => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (activeCaptureIds.length === 0) {
      setFormError("no active captures to stop");
      return;
    }
    const fetchSettings = buildFetchSettings();
    if (!fetchSettings) {
      return;
    }
    const action = savePcap ? "Stop all capture recorders and save PCAP files?" : "Stop all capture recorders?";
    if (!window.confirm(action)) {
      return;
    }
    for (const captureIdValue of activeCaptureIds) {
      await onStopCapture({
        capture_id: captureIdValue,
        pkt_count: fetchSettings.pktCount,
        save_pcap: savePcap,
        file_name: savePcap ? captureFileNameForRecorder(fileName, captureIdValue) : null,
        snaplen: fetchSettings.snaplen
      });
    }
    if (monitorCaptureId !== null && activeCaptureIds.includes(monitorCaptureId)) {
      setMonitorCaptureId(null);
    }
    setActiveTab("Monitor");
  };

  const handleRemoveCapture = async (captureIdValue = effectiveCaptureId) => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (!Number.isInteger(captureIdValue)) {
      setFormError("select an active capture");
      return;
    }
    if (!window.confirm(`Remove packet capture recorder ${captureIdValue}?`)) {
      return;
    }
    setFormError(null);
    const result = await onRemoveCapture({ capture_id: captureIdValue });
    if (result.ok) {
      setSelectedCaptureId("");
      if (monitorCaptureId === captureIdValue) {
        setMonitorCaptureId(null);
      }
    }
  };

  const handleRemoveAll = async () => {
    if (!requireCaptureRuntime()) {
      return;
    }
    if (!window.confirm(`Remove all ${captures.length} packet capture recorders?`)) {
      return;
    }
    await onRemoveAllCaptures();
    setSelectedCaptureId("");
    setMonitorCaptureId(null);
  };

  const handleClearPackets = () => {
    setSelectedPacketKey(null);
    setPacketPageFromLatest(0);
    onClearPackets();
  };

  const handleRefreshAll = async () => {
    await Promise.all([onRefreshStatus(), onRefreshFiles()]);
  };

  const handleDownloadFile = async (fileNameValue: string) => {
    setFormError(null);
    await onDownloadCaptureFile({ file_name: fileNameValue });
  };

  const handleOpenFile = async (fileNameValue: string) => {
    setFormError(null);
    await onOpenCaptureFile({ file_name: fileNameValue });
  };

  const handleCaptureFileQueryChange = (value: string) => {
    setCaptureFileQuery(value);
    setCaptureFilePage(0);
  };

  return (
    <section className={`packet-capture-dialog packet-capture-dialog--${activeTab.toLowerCase()}`} aria-label="Packet Capture workspace">
      <div
        className={`capture-command-bar ${activeTab === "Files" ? "capture-command-bar--files" : ""}`}
        aria-label="Capture command bar"
      >
        {activeTab === "Files" ? (
          <button
            aria-label="Refresh Files"
            className="stream-command-button"
            disabled={isCaptureBusy || isCaptureFilesLoading}
            onClick={() => void onRefreshFiles()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
            <span className="capture-command-label capture-command-label--full">Refresh Files</span>
            <span className="capture-command-label capture-command-label--compact">Refresh</span>
          </button>
        ) : (
          <>
            <button aria-label="Start Monitor" className="stream-command-button" disabled={isCaptureBusy || isCaptureStatusLoading || runtimeControlDisabledReason !== null} onClick={handleStartMonitor} title={runtimeControlDisabledReason ?? "Start Monitor"} type="button">
              <Wifi aria-hidden="true" size={15} />
              <span className="capture-command-label capture-command-label--full">Start Monitor</span>
              <span className="capture-command-label capture-command-label--compact">Start</span>
            </button>
            <button
              aria-label="Stop Monitor"
              className="stream-command-button"
              disabled={isCaptureBusy || !selectedRecord || runtimeControlDisabledReason !== null}
              onClick={() => void handleStop(monitorCaptureId ?? effectiveCaptureId)}
              title={runtimeControlDisabledReason ?? "Stop Monitor"}
              type="button"
            >
              <Square aria-hidden="true" size={15} />
              <span className="capture-command-label capture-command-label--full">Stop Monitor</span>
              <span className="capture-command-label capture-command-label--compact">Stop</span>
            </button>
            <button aria-label="Clear Monitor Table" className="stream-command-button" disabled={capturePackets.length === 0} onClick={handleClearPackets} type="button">
              <Trash2 aria-hidden="true" size={15} />
              <span className="capture-command-label capture-command-label--full">Clear Monitor Table</span>
              <span className="capture-command-label capture-command-label--compact">Clear</span>
            </button>
            <button aria-label="Add Recorder" className="stream-command-button" disabled={isCaptureBusy || isCaptureStatusLoading || runtimeControlDisabledReason !== null} onClick={handleAddRecorder} title={runtimeControlDisabledReason ?? "Add Recorder"} type="button">
              <Plus aria-hidden="true" size={15} />
              <span className="capture-command-label capture-command-label--full">Add Recorder</span>
              <span className="capture-command-label capture-command-label--compact">Add</span>
            </button>
            <button aria-label="Refresh" className="stream-command-button" disabled={isCaptureBusy || isCaptureFilesLoading || isCaptureStatusLoading} onClick={() => void handleRefreshAll()} type="button">
              <RefreshCw aria-hidden="true" size={15} />
              <span className="capture-command-label capture-command-label--full">Refresh</span>
              <span className="capture-command-label capture-command-label--compact">Refresh</span>
            </button>
          </>
        )}
      </div>

      <div className="capture-tabs" role="tablist" aria-label="Packet capture tabs">
        {tabs.map((tab) => (
          <button
            aria-controls={`capture-panel-${tab.toLowerCase()}`}
            aria-selected={tab === activeTab}
            className={`capture-tab ${tab === activeTab ? "capture-tab--active" : ""}`}
            id={`capture-tab-${tab.toLowerCase()}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
            ref={(element) => {
              tabRefs.current[tab] = element;
            }}
            role="tab"
            tabIndex={tab === activeTab ? 0 : -1}
            type="button"
          >
            {tab}
          </button>
        ))}
        <span className="capture-usage-text">{portUsageLabel}</span>
        {serviceModeLabel ? <span className="capture-service-text">{serviceModeLabel}</span> : null}
        {captureDroppedPacketCount > 0 ? (
          <span className="capture-retention-text">
            {displayCount(captureDroppedPacketCount)} older packets discarded from the monitor
          </span>
        ) : null}
        <span aria-live="polite" className="capture-status-text">
          {isCaptureBusy ? "Running…" : loadingStatusText || resultMessage || ""}
        </span>
      </div>

      {activeTab !== "Files" ? (
        <div className="capture-strategy-panel" aria-label="Capture strategy">
          <strong>Capture Strategy</strong>
          <div className="capture-strategy-options" role="group" aria-label="Capture strategy presets">
            {captureStrategyOrder.map((strategy) => (
              <button
                aria-pressed={captureStrategy === strategy}
                className={`capture-strategy-button ${captureStrategy === strategy ? "capture-strategy-button--active" : ""}`}
                disabled={isCaptureBusy}
                key={strategy}
                onClick={() => applyCaptureStrategy(strategy)}
                type="button"
              >
                {captureStrategyPresets[strategy].label}
              </button>
            ))}
          </div>
          <span className="capture-strategy-summary">{strategyLabel}: {strategySummary}</span>
          <span className="capture-strategy-settings">
            trigger <b>{triggerLabel}</b>
            mode <b>{mode}</b>
            <span>limit <b>{limit}</b></span>
            <span>snaplen <b>{snaplen === "0" ? "full" : snaplen}</b></span>
            <span>fetch <b>{fetchCount}</b></span>
          </span>
        </div>
      ) : null}

      {activeTab !== "Files" ? (
        <section className="capture-target-panel" aria-label="Capture port targets">
          <div className="capture-target-heading">
            <strong>Port Targets</strong>
            <span aria-live="polite" className="capture-target-summary">{captureTargetSummary}</span>
            <button
              aria-controls="capture-advanced-port-inputs"
              aria-expanded={showAdvancedPorts}
              className="capture-target-advanced-toggle"
              onClick={() => setShowAdvancedPorts((visible) => !visible)}
              type="button"
            >
              Advanced IDs
            </button>
          </div>
          <div className="capture-port-groups">
            {([
              {
                direction: "rx" as const,
                label: "Rx",
                selected: selectedRxPorts,
                selectedAvailableCount: selectedAvailableRxCount
              },
              {
                direction: "tx" as const,
                label: "Tx",
                selected: selectedTxPorts,
                selectedAvailableCount: selectedAvailableTxCount
              }
            ]).map((group) => (
              <fieldset className="capture-port-group" key={group.direction}>
                <legend className="visually-hidden">{group.label} capture ports</legend>
                <span aria-hidden="true" className="capture-port-direction">{group.label}</span>
                <span className="capture-port-count">
                  {group.selectedAvailableCount}/{availablePortIds.length}
                </span>
                <div className="capture-port-chip-list">
                  {availablePortIds.length > 0 ? availablePortIds.map((port) => (
                    <label
                      className={`capture-port-chip ${group.selected.has(port) ? "capture-port-chip--selected" : ""}`}
                      key={port}
                    >
                      <input
                        aria-label={`${group.label} port ${port}`}
                        checked={group.selected.has(port)}
                        disabled={isCaptureBusy}
                        onChange={() => togglePortSelection(group.direction, port)}
                        type="checkbox"
                      />
                      <span>P{port}</span>
                    </label>
                  )) : (
                    <span className="capture-port-empty">No TRex ports reported</span>
                  )}
                </div>
                <div className="capture-port-group-actions">
                  <button
                    aria-label={`Select all ${group.label} ports`}
                    disabled={isCaptureBusy || availablePortIds.length === 0}
                    onClick={() => setPortSelection(group.direction, availablePortIds)}
                    type="button"
                  >
                    All
                  </button>
                  <button
                    aria-label={`Select no ${group.label} ports`}
                    disabled={isCaptureBusy}
                    onClick={() => setPortSelection(group.direction, [])}
                    type="button"
                  >
                    None
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
          {showAdvancedPorts ? (
            <div className="capture-port-advanced" id="capture-advanced-port-inputs">
              <label htmlFor="capture-rx-port-ids">Rx IDs</label>
              <input
                aria-describedby="capture-port-id-hint"
                autoComplete="off"
                disabled={isCaptureBusy}
                id="capture-rx-port-ids"
                name="capture_rx_port_ids"
                onChange={(event) => updatePortDraft("rx", event.target.value)}
                spellCheck={false}
                value={rxPorts}
              />
              <label htmlFor="capture-tx-port-ids">Tx IDs</label>
              <input
                aria-describedby="capture-port-id-hint"
                autoComplete="off"
                disabled={isCaptureBusy}
                id="capture-tx-port-ids"
                name="capture_tx_port_ids"
                onChange={(event) => updatePortDraft("tx", event.target.value)}
                spellCheck={false}
                value={txPorts}
              />
              <span id="capture-port-id-hint">Comma-separated adapter port IDs; use for IDs absent from the current overview.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {tabs.filter((tab) => tab !== activeTab).map((tab) => (
        <div
          aria-labelledby={`capture-tab-${tab.toLowerCase()}`}
          hidden
          id={`capture-panel-${tab.toLowerCase()}`}
          key={tab}
          role="tabpanel"
        />
      ))}

      {activeTab === "Monitor" ? (
        <div
          aria-labelledby="capture-tab-monitor"
          className="capture-monitor-pane"
          id="capture-panel-monitor"
          role="tabpanel"
          tabIndex={0}
        >
          <div className="capture-filter-row">
            <label>
              Trigger
              <select
                aria-label="Trigger preset"
                disabled={isCaptureBusy}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== "custom") {
                    applyCaptureTrigger(value as CaptureTriggerPresetKey);
                  }
                }}
                value={captureTrigger}
              >
                {captureTrigger === "custom" ? <option value="custom">Custom</option> : null}
                {captureTriggerOrder.map((trigger) => (
                  <option key={trigger} value={trigger}>{captureTriggerPresets[trigger].label}</option>
                ))}
              </select>
            </label>
            <label>
              Filter (BPF)
              <input aria-label="Filter BPF" onChange={(event) => handleBpfFilterChange(event.target.value)} value={bpfFilter} />
            </label>
            <span className="capture-trigger-summary">{triggerLabel}: {triggerSummary}</span>
            <button className="clear-button" disabled={isCaptureBusy || runtimeControlDisabledReason !== null} onClick={handleStartMonitor} title={runtimeControlDisabledReason ?? "Apply capture filter"} type="button">Apply</button>
          </div>

          <section className="capture-analysis-strip" aria-label="Capture decode summary">
            <div className="capture-analysis-kpis" aria-label="Capture decode KPIs">
              <span><b>{displayCount(decodeAnalysis.total)}</b><small>Packets</small></span>
              <span><b>{displayCount(decodeAnalysis.decodedCount)}</b><small>Decoded</small></span>
              <span><b>{displayCount(decodeAnalysis.endpoints.length)}</b><small>Top flows</small></span>
            </div>
            {decodeAnalysis.total === 0 ? (
              <div className="capture-analysis-empty">
                <strong>Awaiting packet data</strong>
                <span>Start a monitor or fetch a recorder to populate protocols, conversations, and signals.</span>
              </div>
            ) : (
              <>
                <div className="capture-analysis-panel">
                  <strong>Protocol Mix</strong>
                  <table className="capture-analysis-table" aria-label="Capture protocol mix">
                    <tbody>
                      {decodeAnalysis.protocols.map((entry) => (
                        <tr key={entry.label}>
                          <td>{entry.label}</td>
                          <td>{displayCount(entry.count)}</td>
                          <td>{capturePercent(entry.count, decodeAnalysis.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="capture-analysis-panel">
                  <strong>Conversations</strong>
                  <table className="capture-analysis-table" aria-label="Capture conversations">
                    <tbody>
                      {decodeAnalysis.endpoints.length > 0 ? decodeAnalysis.endpoints.map((entry) => (
                        <tr key={entry.label}>
                          <td>{entry.label}</td>
                          <td>{displayCount(entry.count)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={2}>No decoded endpoints</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="capture-analysis-panel">
                  <strong>Signals</strong>
                  <table className="capture-analysis-table" aria-label="Capture decode signals">
                    <tbody>
                      {decodeAnalysis.signals.length > 0 ? decodeAnalysis.signals.map((entry) => (
                        <tr key={entry.label}>
                          <td>{entry.label}</td>
                          <td>{displayCount(entry.count)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={2}>No decoded signals</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div className="capture-table-wrap capture-table-wrap--monitor">
            {capturePackets.length > CAPTURE_PACKET_TABLE_PAGE_SIZE ? (
              <div className="capture-packet-pagination" aria-label="Monitor packet pages">
                <span>
                  Showing {displayCount(visiblePacketStart)}–{displayCount(visiblePacketEnd)} of {displayCount(capturePackets.length)} retained
                </span>
                <button
                  className="normal-button"
                  disabled={effectivePacketPage >= packetPageCount - 1}
                  onClick={() => setPacketPageFromLatest((page) => Math.min(packetPageCount - 1, page + 1))}
                  type="button"
                >
                  Older
                </button>
                <button
                  className="normal-button"
                  disabled={effectivePacketPage === 0}
                  onClick={() => setPacketPageFromLatest((page) => Math.max(0, page - 1))}
                  type="button"
                >
                  Newer
                </button>
              </div>
            ) : null}
            <table className="capture-table capture-packet-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Time</th>
                  <th>Port</th>
                  <th>Mode</th>
                  <th>Destination</th>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Length</th>
                  <th>Info</th>
                </tr>
              </thead>
              <tbody>
                {visibleCapturePackets.length > 0 ? visibleCapturePackets.map((packet, packetIndex) => {
                  const currentPacketKey = packetKey(packet);
                  const selected = selectedPacketKeyValue === currentPacketKey;
                  return (
                  <tr
                    aria-selected={selected}
                    className={selected ? "capture-packet-row capture-row--selected" : "capture-packet-row"}
                    key={currentPacketKey}
                    onClick={() => setSelectedPacketKey(currentPacketKey)}
                    onKeyDown={(event) => handlePacketRowKeyDown(event, packetIndex)}
                    ref={(element) => {
                      packetRowRefs.current[currentPacketKey] = element;
                    }}
                    tabIndex={focusablePacketKey === currentPacketKey ? 0 : -1}
                  >
                    <td>{packet.index}</td>
                    <td>{packet.time.toFixed(6)}</td>
                    <td>{displayValue(packet.port)}</td>
                    <td>{packet.mode}</td>
                    <td>{packet.destination}</td>
                    <td>{packet.source}</td>
                    <td>{packet.type}</td>
                    <td>{packet.length}</td>
                    <td>{packet.info}</td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9}>No packets</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <section className="capture-packet-viewer" aria-label="Packet viewer">
            <div className="capture-packet-summary">
              <strong>Packet viewer</strong>
              <span>{selectedPacket ? `${selectedPacket.type} ${selectedPacket.length} bytes ${selectedPacket.info}` : "Select a captured packet to inspect it"}</span>
            </div>
            {selectedPacket ? (
              <div className="capture-packet-body">
              <div className="capture-packet-decode-wrap">
                <table className="capture-packet-decode">
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDecodedLayers.length > 0 ? selectedDecodedLayers.flatMap((layer, layerIndex) =>
                      layer.fields.length > 0 ? layer.fields.map((field, fieldIndex) => (
                        <tr key={`${layerIndex}:${fieldIndex}:${layer.name}:${field.name}`}>
                          <td>{layer.name}</td>
                          <td>{field.name}</td>
                          <td>{field.value}</td>
                        </tr>
                      )) : (
                        <tr key={`${layerIndex}:${layer.name}`}>
                          <td>{layer.name}</td>
                          <td>-</td>
                          <td>-</td>
                        </tr>
                      )
                    ) : (
                      <tr>
                        <td colSpan={3}>No decoded layers</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="capture-packet-hex-wrap">
                <table className="capture-packet-hex">
                  <thead>
                    <tr>
                      <th>Offset</th>
                      <th>Payload</th>
                      <th>ASCII</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPacketRows.length > 0 ? selectedPacketRows.map((line) => (
                      <tr key={line.offset}>
                        <td>{line.offset}</td>
                        <td>{line.hex}</td>
                        <td>{line.ascii}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3}>No packet preview</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </div>
            ) : (
              <div className="capture-packet-empty">
                <strong>No packet selected</strong>
                <span>Captured packet fields and byte preview will appear here.</span>
              </div>
            )}
          </section>
        </div>
      ) : activeTab === "Recorders" ? (
        <div
          aria-labelledby="capture-tab-recorders"
          className="capture-recorders-pane"
          id="capture-panel-recorders"
          role="tabpanel"
          tabIndex={0}
        >
          <div className="capture-recorder-settings">
            <label>
              Limit
              <input onChange={(event) => {
                markCaptureStrategyCustom();
                setLimit(event.target.value);
              }} value={limit} />
            </label>
            <label>
              Mode
              <select onChange={(event) => {
                markCaptureStrategyCustom();
                setMode(event.target.value as "fixed" | "cyclic");
              }} value={mode}>
                <option value="fixed">fixed</option>
                <option value="cyclic">cyclic</option>
              </select>
            </label>
            <label>
              Snaplen
              <input onChange={(event) => {
                markCaptureStrategyCustom();
                setSnaplen(event.target.value);
              }} value={snaplen} />
            </label>
            <label>
              Packets
              <input onChange={(event) => {
                markCaptureStrategyCustom();
                setFetchCount(event.target.value);
              }} value={fetchCount} />
            </label>
            <div className="capture-save-pcap-field">
              <label>
                <input checked={savePcap} onChange={(event) => {
                  markCaptureStrategyCustom();
                  setSavePcap(event.target.checked);
                }} type="checkbox" />
                Save PCAP
              </label>
              <input aria-label="PCAP file name" disabled={!savePcap} onChange={(event) => {
                markCaptureStrategyCustom();
                setFileName(event.target.value);
              }} value={fileName} />
            </div>
          </div>

          <div className="capture-table-wrap capture-table-wrap--recorders">
            <table aria-label="Capture recorders" className="capture-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Packets</th>
                  <th>Bytes</th>
                  <th>RX Ports</th>
                  <th>TX Ports</th>
                  <th>Filter (BPF)</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Diagnosis</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {captures.length > 0 ? captures.map((record) => {
                  const capacity = captureCapacity(record);
                  return (
                    <tr
                      className={captureId(record) === effectiveSelectedCaptureId ? "capture-row--selected" : ""}
                      key={captureId(record)}
                      onClick={() => setSelectedCaptureId(captureId(record))}
                    >
                      <td>
                        <label className="capture-recorder-selector">
                          <input
                            aria-label={`Select recorder ${captureId(record)}`}
                            checked={captureId(record) === effectiveSelectedCaptureId}
                            name="capture-recorder-selection"
                            onChange={() => setSelectedCaptureId(captureId(record))}
                            type="radio"
                          />
                          <span>{captureId(record)}</span>
                        </label>
                      </td>
                      <td>{captureState(record)}</td>
                      <td>{captureCount(record)}</td>
                      <td>{displayValue(record.bytes ?? 0)}</td>
                      <td>{capturePorts(record, "rx")}</td>
                      <td>{capturePorts(record, "tx")}</td>
                      <td>{captureFilter(record)}</td>
                      <td>{displayValue(record.mode ?? "fixed")}</td>
                      <td><span className={`capture-capacity-pill ${capacity.className}`}>{capacity.text}</span></td>
                      <td>{capacity.diagnostic}</td>
                      <td>
                        <div className="capture-row-actions">
                          <button
                            aria-label={`Fetch packets for capture ${captureId(record)}`}
                            disabled={isCaptureBusy || runtimeControlDisabledReason !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCaptureId(captureId(record));
                              void handleFetch(Number(record.id));
                            }}
                            title={runtimeControlDisabledReason ?? "Fetch packets"}
                            type="button"
                          >
                            <Download aria-hidden="true" size={14} />
                          </button>
                          <button
                            aria-label={`Stop capture ${captureId(record)}`}
                            disabled={isCaptureBusy || runtimeControlDisabledReason !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCaptureId(captureId(record));
                              void handleStop(Number(record.id));
                            }}
                            title={runtimeControlDisabledReason ?? "Stop capture"}
                            type="button"
                          >
                            <Square aria-hidden="true" size={14} />
                          </button>
                          <button
                            aria-label={`Remove capture ${captureId(record)}`}
                            disabled={isCaptureBusy || runtimeControlDisabledReason !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCaptureId(captureId(record));
                              void handleRemoveCapture(Number(record.id));
                            }}
                            title={runtimeControlDisabledReason ?? "Remove capture"}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={11}>
                      {isCaptureStatusLoading && captureStatusResult === null
                        ? "Loading capture recorders…"
                        : "No active recorders"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="capture-recorder-actions">
            <span className="capture-recorder-summary">{recorderSummary}</span>
            <div className="capture-recorder-button-group">
              <button className="normal-button" disabled={isCaptureBusy || activeCaptureIds.length === 0 || runtimeControlDisabledReason !== null} onClick={() => void handleFetchAll()} title={runtimeControlDisabledReason ?? "Fetch packets from all recorders"} type="button">
                <Download aria-hidden="true" size={15} />
                Fetch All
              </button>
              <button className="normal-button" disabled={isCaptureBusy || activeCaptureIds.length === 0 || runtimeControlDisabledReason !== null} onClick={() => void handleStopAll()} title={runtimeControlDisabledReason ?? "Stop all recorders"} type="button">
                <Square aria-hidden="true" size={15} />
                Stop All
              </button>
              <button className="normal-button" disabled={isCaptureBusy || captures.length === 0 || runtimeControlDisabledReason !== null} onClick={handleRemoveAll} title={runtimeControlDisabledReason ?? "Remove all recorders"} type="button">
                <X aria-hidden="true" size={15} />
                Remove All
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          aria-labelledby="capture-tab-files"
          className="capture-recorders-pane"
          id="capture-panel-files"
          role="tabpanel"
          tabIndex={0}
        >
          <div className="capture-recorder-actions capture-file-actions">
            <span className="capture-file-root">
              {isCaptureFilesLoading && captureFilesResult === null
                ? "Loading capture files…"
                : [
                  captureFilesResult?.data?.root ?? captureFilesResult?.error ?? captureFilesResult?.blocker ?? "",
                  isCaptureFilesLoading ? "Refreshing…" : ""
                ].filter(Boolean).join(" · ")}
            </span>
            <label className="capture-file-search">
              <span>Search</span>
              <input
                aria-label="Search Capture Files"
                autoComplete="off"
                disabled={isCaptureFilesLoading && captureFilesResult === null}
                name="capture_file_search"
                onChange={(event) => handleCaptureFileQueryChange(event.target.value)}
                placeholder="Name or path…"
                spellCheck={false}
                type="search"
                value={captureFileQuery}
              />
            </label>
            <span aria-live="polite" className="capture-file-count">
              {isCaptureFilesLoading && captureFilesResult === null
                ? "Loading…"
                : captureFilesResult?.ok === false
                  ? "Unavailable"
                  : `${filteredCaptureFiles.length} visible of ${captureFiles.length}`}
            </span>
          </div>
          <div className="capture-table-wrap capture-table-wrap--files">
            <table className="capture-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Actions</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {visibleCaptureFiles.length > 0 ? visibleCaptureFiles.map((file) => (
                  <tr key={file.name}>
                    <td>{file.name}</td>
                    <td>
                      <div className="capture-row-actions">
                        <button
                          aria-label={`Download capture file ${file.name}`}
                          disabled={isCaptureBusy || !file.download_available}
                          onClick={() => void handleDownloadFile(file.name)}
                          title={file.download_error ?? "Download capture file"}
                          type="button"
                        >
                          <Download aria-hidden="true" size={14} />
                        </button>
                        <button
                          aria-label={`Open capture file ${file.name}`}
                          disabled={isCaptureBusy}
                          onClick={() => void handleOpenFile(file.name)}
                          title="Open capture file"
                          type="button"
                        >
                          <ExternalLink aria-hidden="true" size={14} />
                        </button>
                      </div>
                    </td>
                    <td>{displayValue(file.size_bytes)}</td>
                    <td>{captureFileTime(file.modified_time)}</td>
                    <td>{file.path}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>
                      {isCaptureFilesLoading && captureFilesResult === null
                        ? "Loading capture files…"
                        : captureFilesResult?.ok === false
                          ? "Capture files unavailable"
                          : captureFiles.length === 0
                            ? "No saved capture files"
                            : "No capture files match the current search"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredCaptureFiles.length > CAPTURE_FILE_TABLE_PAGE_SIZE ? (
            <div className="workbench-pagination" aria-label="Capture file pages">
              <span>
                Showing {captureFileRangeStart}–{captureFileRangeEnd} of {filteredCaptureFiles.length}
                {normalizedCaptureFileQuery ? " matches" : ""}
              </span>
              <button
                className="normal-button"
                disabled={effectiveCaptureFilePage === 0}
                onClick={() => setCaptureFilePage((page) => Math.max(0, page - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="normal-button"
                disabled={effectiveCaptureFilePage >= captureFilePageCount - 1}
                onClick={() => setCaptureFilePage((page) => Math.min(captureFilePageCount - 1, page + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
