export type TrafficMultiplierUnit =
  | "raw"
  | "percentage"
  | "bps_L1"
  | "bps_L2"
  | "pps";

export const trafficMultiplierUnitOptions: Array<{ value: TrafficMultiplierUnit; label: string }> = [
  { value: "raw", label: "x" },
  { value: "percentage", label: "% L1" },
  { value: "bps_L1", label: "L1 bps" },
  { value: "bps_L2", label: "L2 bps" },
  { value: "pps", label: "pps" }
];

const trafficMultiplierSuffix: Record<TrafficMultiplierUnit, string> = {
  raw: "",
  percentage: "%",
  bps_L1: "bpsl1",
  bps_L2: "bps",
  pps: "pps"
};

const multiplierUnitFactor: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  g: 1_000_000_000,
  t: 1_000_000_000_000,
  p: 1_000_000_000_000_000,
  e: 1_000_000_000_000_000_000
};

const multiplierPattern = /^((?:\d+(?:\.\d*)?)|(?:\.\d+))([kKmMgGtTpPeE])?$/;

function multiplierNumberText(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(value).replace(/\.?0+$/, "");
}

function parseMultiplierText(value: string, allowUnitSuffix: boolean, unitSuffixError: string) {
  const trimmedValue = value.trim();
  const match = multiplierPattern.exec(trimmedValue);
  if (!match) {
    return {
      ok: false,
      error: "Traffic multiplier must be a positive number with optional K/M/G/T/P/E suffix",
      value: null,
      text: null
    } as const;
  }

  const parsed = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "";
  if (unit && !allowUnitSuffix) {
    return {
      ok: false,
      error: unitSuffixError,
      value: null,
      text: null
    } as const;
  }

  const multiplier = unit ? multiplierUnitFactor[unit] : 1;
  const numericValue = parsed * multiplier;
  return {
    ok: true,
    error: null,
    value: numericValue,
    text: `${multiplierNumberText(parsed)}${unit}`
  } as const;
}

export function buildTrafficMultiplier(unit: TrafficMultiplierUnit, value: string) {
  const parsed = parseMultiplierText(
    value,
    unit !== "percentage" && unit !== "raw",
    unit === "percentage"
      ? "Traffic percentage must not use K/M/G/T/P/E suffix"
      : "Raw traffic multiplier must not use K/M/G/T/P/E suffix"
  );
  if (!parsed.ok) {
    return parsed;
  }
  if (!Number.isFinite(parsed.value) || parsed.value <= 0) {
    return {
      ok: false,
      error: "Traffic multiplier must be greater than 0",
      value: null
    } as const;
  }
  if (unit === "percentage" && parsed.value > 100) {
    return {
      ok: false,
      error: "Traffic percentage must be between 0 and 100",
      value: null
    } as const;
  }
  if (parsed.value > 1_000_000_000_000) {
    return {
      ok: false,
      error: "Traffic multiplier is too large",
      value: null
    } as const;
  }
  return {
    ok: true,
    error: null,
    value: `${parsed.text}${trafficMultiplierSuffix[unit]}`
  } as const;
}

export function buildTrafficDuration(enabled: boolean, value: string) {
  if (!enabled) {
    return {
      ok: true,
      error: null,
      value: -1
    } as const;
  }
  const trimmedValue = value.trim();
  const parsed = Number(trimmedValue);
  if (!trimmedValue || !Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: "Traffic duration must be greater than 0 seconds",
      value: null
    } as const;
  }
  if (parsed > 1_000_000) {
    return {
      ok: false,
      error: "Traffic duration is too large",
      value: null
    } as const;
  }
  return {
    ok: true,
    error: null,
    value: parsed
  } as const;
}
