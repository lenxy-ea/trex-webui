export function numberValue(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

export function largeUnitCountValue(value: number | string) {
  return typeof value === "number" ? numberValue(value) : value;
}

export function largeUnitCountNumber(value: number | string, fallback = 16) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.min(100_000_000, Math.max(2, Math.trunc(value))) : fallback;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kmg])?$/i);
  if (!match) {
    return fallback;
  }
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "g" ? 1_000_000_000 : unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  const parsed = Number.parseFloat(match[1]) * multiplier;
  return Number.isFinite(parsed) ? Math.min(100_000_000, Math.max(2, Math.trunc(parsed))) : fallback;
}

export function parseNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return Number.NaN;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export type InputNumberEvent = {
  currentTarget: {
    value: string;
  };
};

export function inputNumberValue(event: InputNumberEvent) {
  return parseNumber(event.currentTarget.value);
}
