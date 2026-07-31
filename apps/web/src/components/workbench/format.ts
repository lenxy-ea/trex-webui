const unitScale = 1000;
const bitRateUnits = ["b/s", "Kb/s", "Mb/s", "Gb/s", "Tb/s"];
const packetRateUnits = ["pps", "Kpps", "Mpps", "Gpps", "Tpps"];

function trimFixed(value: number, digits: number) {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function decimalPlaces(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude >= 100) {
    return 0;
  }
  if (magnitude >= 10) {
    return 1;
  }
  if (magnitude >= 1) {
    return 2;
  }
  return 3;
}

export function displayNumber(value: number, maxDecimals = decimalPlaces(value)) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  return trimFixed(value, maxDecimals);
}

function displayScaledRate(value: number, units: string[]) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const sign = value < 0 ? -1 : 1;
  let scaled = Math.abs(value);
  let unitIndex = 0;
  while (scaled >= unitScale && unitIndex < units.length - 1) {
    scaled /= unitScale;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? decimalPlaces(scaled) : scaled < 100 ? 2 : scaled < 1000 ? 1 : 0;
  return `${displayNumber(sign * scaled, decimals)} ${units[unitIndex]}`;
}

export function displayBitRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : displayScaledRate(value, bitRateUnits);
}

export function displayPacketRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : displayScaledRate(value, packetRateUnits);
}

export function displayPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  if (Math.abs(value) < 1e-9) {
    return "0%";
  }
  const magnitude = Math.abs(value);
  const decimals = magnitude < 1 ? 3 : magnitude < 10 ? 2 : 1;
  return `${displayNumber(value, decimals)}%`;
}

export function displayCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toLocaleString("en-US");
}

export function displayLatencyUs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${displayNumber(value)} us`;
}

export function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "number") {
    return displayNumber(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function displayBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
