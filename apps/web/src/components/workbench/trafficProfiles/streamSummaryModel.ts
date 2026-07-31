import type { ProfileWorkbenchStream } from "../../../api";
import { numberValue } from "./scalarValueModel";

export function presentLabel(value: string | Record<string, unknown> | null | undefined) {
  if (value === null || value === undefined) {
    return "missing";
  }
  if (typeof value === "string") {
    return value.length > 0 ? "present" : "missing";
  }
  return Object.keys(value).length > 0 ? "present" : "missing";
}

export function streamRate(stream: ProfileWorkbenchStream) {
  return `${numberValue(stream.rate_value) || "-"} ${stream.rate_type}`;
}

export function streamIpgDisplay(stream: ProfileWorkbenchStream) {
  if (stream.rate_type !== "pps" || !Number.isFinite(stream.rate_value) || stream.rate_value <= 0) {
    return "";
  }
  const value = 1 / stream.rate_value;
  if (value === 0) {
    return "0";
  }
  if (value >= 0.001) {
    return String(Number(value.toFixed(9)));
  }
  return value.toExponential(3).replace(/\.?0+e/, "e");
}

export function streamNextLabel(stream: ProfileWorkbenchStream, streams: ProfileWorkbenchStream[]) {
  if (stream.next_stream_id === null) {
    return "-";
  }
  return streams[stream.next_stream_id - 1]?.name ?? "-";
}

export function streamPacketTypeLabel(stream: ProfileWorkbenchStream) {
  if (stream.gtpu_enabled) {
    return "Ethernet/IPv4/UDP/GTP-U";
  }
  if (stream.vxlan_enabled) {
    return "Ethernet/IPv4/UDP/VXLAN";
  }
  return stream.packet_type;
}

export type ProfileStreamTableRow = {
  advanced: boolean;
  index: number;
  key: string;
  length: string;
  mode: ProfileWorkbenchStream["mode"];
  name: string;
  nextStream: string;
  packetType: string;
  rate: string;
};

export type ProfileStreamTableColumn = {
  ariaLabel?: string;
  key: string;
  label: string;
};

export type ProfileStreamTableBadge = {
  className: string;
  label: string;
};

export type ProfileStreamTableViewRow = ProfileStreamTableRow & {
  advancedBadge: ProfileStreamTableBadge | null;
  className: string;
  displayIndex: number;
  selected: boolean;
};

export type ProfileStreamTableViewModel = {
  columns: ProfileStreamTableColumn[];
  emptyRow: {
    colSpan: number;
    label: string;
  };
  rows: ProfileStreamTableViewRow[];
  tableClassName: string;
  wrapperClassName: string;
};

export const profileStreamTableColumns: ProfileStreamTableColumn[] = [
  { ariaLabel: "Selected", key: "selected", label: "" },
  { key: "index", label: "Index" },
  { key: "name", label: "Name" },
  { key: "packetType", label: "Packet Type" },
  { key: "length", label: "Length" },
  { key: "mode", label: "Mode" },
  { key: "rate", label: "Rate" },
  { key: "nextStream", label: "Next Stream" }
];

export function streamTableRows(streams: ProfileWorkbenchStream[]): ProfileStreamTableRow[] {
  return streams.map((stream, index) => ({
    advanced: stream.advanced_mode,
    index,
    key: `${stream.name}:${index}`,
    length: numberValue(stream.frame_length) || "-",
    mode: stream.mode,
    name: stream.name,
    nextStream: streamNextLabel(stream, streams),
    packetType: streamPacketTypeLabel(stream),
    rate: streamRate(stream)
  }));
}

export function streamTableViewModel({
  selectedStreamIndex,
  streams
}: {
  selectedStreamIndex: number;
  streams: ProfileWorkbenchStream[];
}): ProfileStreamTableViewModel {
  return {
    columns: profileStreamTableColumns,
    emptyRow: {
      colSpan: profileStreamTableColumns.length,
      label: "Select a profile"
    },
    rows: streamTableRows(streams).map<ProfileStreamTableViewRow>((row) => ({
      ...row,
      advancedBadge: row.advanced
        ? {
            className: "stream-mode-badge",
            label: "advanced"
          }
        : null,
      className: row.index === selectedStreamIndex ? "stream-row--selected" : "",
      displayIndex: row.index + 1,
      selected: row.index === selectedStreamIndex
    })),
    tableClassName: "stream-table",
    wrapperClassName: "stream-table-wrap"
  };
}

export type AdvancedStreamReadOnlyFact = {
  label: string;
  value: string;
};

export type AdvancedStreamReadOnlyFactView = AdvancedStreamReadOnlyFact & {
  key: string;
};

export type AdvancedStreamReadOnlyPanelViewModel = {
  ariaLabel: string;
  banner: {
    className: string;
    description: string;
    role: "status";
    title: string;
  };
  className: string;
  facts: AdvancedStreamReadOnlyFactView[];
  gridClassName: string;
  role: "region";
};

export function advancedStreamReadOnlyFacts(stream: ProfileWorkbenchStream): AdvancedStreamReadOnlyFact[] {
  return [
    { label: "Name", value: stream.name },
    { label: "Packet type", value: stream.packet_type },
    { label: "Packet bytes", value: `${base64ByteCount(stream.packet_binary_base64)} bytes` },
    { label: "Mode", value: stream.mode },
    { label: "Rate", value: streamRate(stream) },
    { label: "PG ID", value: numberValue(stream.pg_id) || "-" },
    { label: "Packet model", value: presentLabel(stream.packet_model) },
    { label: "Packet meta", value: presentLabel(stream.packet_meta_base64) },
    { label: "Field Engine", value: `${advancedVmInstructionCount(stream.advanced_vm)} instructions` },
    { label: "VM cache", value: advancedVmCacheLabel(stream.advanced_vm) }
  ];
}

export function advancedStreamReadOnlyPanelViewModel(stream: ProfileWorkbenchStream): AdvancedStreamReadOnlyPanelViewModel {
  return {
    ariaLabel: "Advanced stream",
    banner: {
      className: "advanced-stream-banner",
      description: "Packet Editor / Field Engine editable",
      role: "status",
      title: "Advanced/Scapy stream"
    },
    className: "advanced-stream-pane",
    facts: advancedStreamReadOnlyFacts(stream).map((fact) => ({
      ...fact,
      key: fact.label
    })),
    gridClassName: "advanced-stream-grid",
    role: "region"
  };
}

export function base64ByteCount(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const trimmed = value.trim().replace(/=+$/, "");
  return Math.floor((trimmed.length * 3) / 4);
}

export function advancedVmInstructionCount(value: Record<string, unknown> | null | undefined) {
  const instructions = value?.instructions;
  return Array.isArray(instructions) ? instructions.length : 0;
}

export function advancedVmCacheLabel(value: Record<string, unknown> | null | undefined) {
  const cacheSize = value?.cache_size;
  return typeof cacheSize === "number" && Number.isFinite(cacheSize) ? String(cacheSize) : "-";
}
