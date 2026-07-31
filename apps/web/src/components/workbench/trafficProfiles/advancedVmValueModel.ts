export function parseHexWord(value: string) {
  const parsed = Number.parseInt(value.replace(/^0x/i, ""), 16);
  return Number.isFinite(parsed) ? parsed & 0xFFFF : 0;
}

export function ipv4Parts(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : [0, 0, 0, 0];
}

export function ipv4FieldEngineSuffix(address: string, count: number) {
  const parts = ipv4Parts(address);
  const low8 = parts[3];
  const low16 = (parts[2] << 8) | parts[3];
  const low32 = (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  if (low8 + count < 256) {
    return { initValue: low8, size: 1 as const };
  }
  if (low16 + count < 65_536) {
    return { initValue: low16, size: 2 as const };
  }
  return { initValue: low32, size: 4 as const };
}

export function macParts(address: string) {
  const parts = address.split(":").map((part) => Number.parseInt(part, 16));
  return parts.length === 6 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : [0, 0, 0, 0, 0, 0];
}

export function macFieldEngineSuffix(address: string, count: number) {
  const parts = macParts(address);
  const low8 = parts[5];
  const low16 = (parts[4] << 8) | parts[5];
  const low32 = (((parts[2] << 24) >>> 0) | (parts[3] << 16) | (parts[4] << 8) | parts[5]) >>> 0;
  if (low8 + count < 256) {
    return { initValue: low8, size: 1 as const };
  }
  if (low16 + count < 65_536) {
    return { initValue: low16, size: 2 as const };
  }
  return { initValue: low32, size: 4 as const };
}

export function fieldEngineMaxForSize(size: 1 | 2 | 4) {
  return size === 1 ? 255 : size === 2 ? 65_535 : 4_294_967_295;
}

export function dnsNameWireLength(name: string) {
  const labels = name.replace(/\.$/, "").split(".");
  return labels.reduce((total, label) => total + 1 + label.length, 1);
}

export function dnsQueryNameFirstLabelByte(name: string) {
  const firstLabel = name
    .replace(/\.$/, "")
    .split(".")
    .find((label) => label.length > 0);
  return firstLabel ? firstLabel.charCodeAt(0) & 0xff : null;
}

export function dhcpParameterRequestListLength(value: string) {
  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    .length;
}

export function dhcpParameterRequestFirstValue(value: string) {
  const parsed = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .find((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  return parsed ?? 0;
}
