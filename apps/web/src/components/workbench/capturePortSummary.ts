import type { TrexCaptureRecord, TrexCaptureStatus } from "../../api";

export type CapturePortSummary = {
  port: number;
  rxRecorderIds: Array<number | string>;
  txRecorderIds: Array<number | string>;
};

function recordId(record: TrexCaptureRecord) {
  return record.id;
}

function normalizePortList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    const ports: number[] = [];
    for (let index = 0; index < 64; index += 1) {
      if (Math.floor(value / 2 ** index) % 2 === 1) {
        ports.push(index);
      }
    }
    return ports;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0) {
      return normalizePortList(numeric);
    }
    return value
      .split(/[,\s]+/)
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0);
  }
  return [];
}

export function captureRecordPorts(record: TrexCaptureRecord, direction: "rx" | "tx") {
  const filter = record.filter;
  if (!filter || typeof filter !== "object") {
    return [];
  }
  return normalizePortList(filter[direction]);
}

export function capturePortSummaryLabel(summary: CapturePortSummary | null | undefined) {
  if (!summary || (summary.rxRecorderIds.length === 0 && summary.txRecorderIds.length === 0)) {
    return "None";
  }
  const parts: string[] = [];
  if (summary.rxRecorderIds.length > 0) {
    parts.push(`Rx #${summary.rxRecorderIds.join(", #")}`);
  }
  if (summary.txRecorderIds.length > 0) {
    parts.push(`Tx #${summary.txRecorderIds.join(", #")}`);
  }
  return parts.join(" / ");
}

export function capturePortSummary(records: TrexCaptureRecord[], port: number | null | undefined): CapturePortSummary | null {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0) {
    return null;
  }
  const summary: CapturePortSummary = {
    port,
    rxRecorderIds: [],
    txRecorderIds: []
  };
  for (const record of records) {
    const id = recordId(record);
    if (captureRecordPorts(record, "rx").includes(port) && !summary.rxRecorderIds.includes(id)) {
      summary.rxRecorderIds.push(id);
    }
    if (captureRecordPorts(record, "tx").includes(port) && !summary.txRecorderIds.includes(id)) {
      summary.txRecorderIds.push(id);
    }
  }
  return summary.rxRecorderIds.length > 0 || summary.txRecorderIds.length > 0 ? summary : null;
}

export function capturePortSummaryFromStatus(
  status: TrexCaptureStatus | null | undefined,
  port: number | null | undefined
): CapturePortSummary | null {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0) {
    return null;
  }
  const usage = status?.port_usage?.find((entry) => entry.port === port);
  if (usage) {
    const summary = {
      port,
      rxRecorderIds: usage.rx_recorder_ids,
      txRecorderIds: usage.tx_recorder_ids
    };
    return summary.rxRecorderIds.length > 0 || summary.txRecorderIds.length > 0 ? summary : null;
  }
  return capturePortSummary(status?.captures ?? [], port);
}
