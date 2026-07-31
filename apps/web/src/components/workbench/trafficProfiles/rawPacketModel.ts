import type { ProfilePacketPreview, ProfileWorkbenchStream } from "../../../api";
import type { AdvancedVmTargetRow } from "./model";

const RAW_PACKET_MAX_BYTES = 9212;
const RAW_PACKET_BYTES_PER_LINE = 16;

export type RawPacketFieldFormat = "hex" | "ipv4" | "ipv6" | "mac" | "number";

export type RawPacketFieldRow = {
  id: string;
  layer: string;
  field: string;
  offset: number;
  length: number;
  format: RawPacketFieldFormat;
  value: string;
  mask?: number;
  shift?: number;
};

export type RawPacketFieldApplyResult =
  | {
      ok: true;
      nextHex: string;
      statusText: string;
    }
  | {
      ok: false;
      errorText: string;
    };

export function rawPacketFieldAdvancedVmTarget(row: RawPacketFieldRow, targetRows: AdvancedVmTargetRow[]) {
  const fieldEnd = row.offset + row.length;
  const fieldTokens = rawPacketFieldTargetTokens(row.field);
  const rowTokens = rawPacketFieldTargetTokens(`${row.layer} ${row.field}`);
  const candidates = targetRows
    .filter((targetRow) =>
      targetRow.ready
      && targetRow.writeOffsetValues.some((offset) => offset >= row.offset && offset < fieldEnd)
    )
    .map((targetRow, index) => ({
      fieldScore: rawPacketFieldTargetScore(fieldTokens, targetRow),
      index,
      score: rawPacketFieldTargetScore(rowTokens, targetRow),
      targetRow
    }))
    .filter((candidate) =>
      candidate.fieldScore > 0
      && rawPacketFieldTargetSpecificTokensMatch(fieldTokens, candidate.targetRow)
    );
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((left, right) =>
    right.score - left.score
    || left.targetRow.writeOffsetValues.length - right.targetRow.writeOffsetValues.length
    || left.index - right.index
  );
  const bestCandidate = candidates[0];
  return bestCandidate ? bestCandidate.targetRow : null;
}

const specificFlagRawPacketTargetTokens = new Set([
  "ack",
  "autonomous",
  "authoritative",
  "available",
  "beginning",
  "broadcast",
  "change",
  "copied",
  "df",
  "desired",
  "ending",
  "fin",
  "i",
  "immediate",
  "managed",
  "mf",
  "on",
  "other",
  "override",
  "psh",
  "reserved",
  "response",
  "router",
  "rst",
  "solicited",
  "syn",
  "truncated",
  "unordered",
  "urg"
]);

function rawPacketFieldTargetSpecificTokensMatch(fieldTokens: Set<string>, targetRow: AdvancedVmTargetRow) {
  const targetTokens = rawPacketFieldTargetTokens([
    targetRow.template.name,
    targetRow.template.label,
    targetRow.variables
  ].join(" "));
  if (fieldTokens.size === 1 && fieldTokens.has("option") && targetTokens.has("option")) {
    return false;
  }
  const isFragmentFlagField = fieldTokens.has("df") || fieldTokens.has("mf") || fieldTokens.has("reserved");
  if (isFragmentFlagField && targetTokens.has("fragment") && targetTokens.has("offset")) {
    return false;
  }
  if (!targetTokens.has("flag")) {
    return true;
  }
  const specificTokens = Array.from(specificFlagRawPacketTargetTokens)
    .filter((token) => targetTokens.has(token));
  if (specificTokens.length === 0) {
    return true;
  }
  return specificTokens.some((token) => fieldTokens.has(token));
}

function rawPacketFieldTargetTokens(value: string) {
  const baseTokens = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/don't/g, "dont")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens = new Set<string>();
  for (const token of baseTokens) {
    const normalizedToken = token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
    tokens.add(normalizedToken);
    if (normalizedToken === "source") {
      tokens.add("src");
    }
    if (normalizedToken === "destination") {
      tokens.add("dst");
    }
    if (normalizedToken === "acknowledge") {
      tokens.add("ack");
    }
    if (normalizedToken === "identification") {
      tokens.add("id");
    }
    if (normalizedToken === "tc") {
      tokens.add("traffic");
      tokens.add("class");
    }
  }
  if (tokens.has("traffic") && tokens.has("class")) {
    tokens.add("tc");
  }
  if (tokens.has("dont") && tokens.has("fragment")) {
    tokens.add("df");
  }
  if (tokens.has("more") && tokens.has("fragment")) {
    tokens.add("mf");
  }
  return tokens;
}

const strongRawPacketTargetTokens = new Set([
  "ack",
  "autonomous",
  "authoritative",
  "available",
  "beginning",
  "broadcast",
  "cfi",
  "class",
  "code",
  "copied",
  "dei",
  "desired",
  "df",
  "dscp",
  "dst",
  "ecn",
  "ending",
  "fin",
  "fragment",
  "id",
  "identifier",
  "immediate",
  "label",
  "link",
  "mac",
  "managed",
  "mf",
  "number",
  "offset",
  "on",
  "opcode",
  "override",
  "other",
  "prefix",
  "priority",
  "psh",
  "recursion",
  "reserved",
  "response",
  "rst",
  "router",
  "sack",
  "solicited",
  "src",
  "syn",
  "tc",
  "teid",
  "traffic",
  "truncated",
  "ttl",
  "unordered",
  "urg",
  "vlan",
  "vni"
]);

function rawPacketFieldTargetScore(rowTokens: Set<string>, targetRow: AdvancedVmTargetRow) {
  const targetTokens = rawPacketFieldTargetTokens([
    targetRow.template.name,
    targetRow.template.label,
    targetRow.variables
  ].join(" "));
  let score = 0;
  for (const token of rowTokens) {
    if (targetTokens.has(token)) {
      score += strongRawPacketTargetTokens.has(token) ? 4 : 1;
    }
  }
  return score;
}

export function rawPacketBytesFromBase64(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  try {
    return Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return [];
  }
}

export function formatRawPacketHex(bytes: number[]) {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += RAW_PACKET_BYTES_PER_LINE) {
    lines.push(
      bytes
        .slice(offset, offset + RAW_PACKET_BYTES_PER_LINE)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ")
    );
  }
  return lines.join("\n");
}

export function previewRawPacketHex(preview: ProfilePacketPreview | null) {
  if (!preview) {
    return "";
  }
  if (preview.hex_lines.length > 0) {
    return preview.hex_lines.map((line) => line.hex).join("\n");
  }
  if (preview.binary_base64) {
    return formatRawPacketHex(rawPacketBytesFromBase64(preview.binary_base64));
  }
  if (preview.hex) {
    return preview.hex.match(/.{1,2}/g)?.join(" ") ?? "";
  }
  return "";
}

export function streamRawPacketHex(stream: ProfileWorkbenchStream | null, preview: ProfilePacketPreview | null) {
  if (stream?.packet_binary_base64) {
    return formatRawPacketHex(rawPacketBytesFromBase64(stream.packet_binary_base64));
  }
  return previewRawPacketHex(preview);
}

export function rawOuterMacAddressTarget(stream: ProfileWorkbenchStream | null | undefined, field: "dst" | "src") {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const offset = field === "dst" ? 0 : 6;
  if (!rawPacketHasBytes(bytes, offset, 6)) {
    return null;
  }
  return {
    address: formatPacketMac(bytes, offset),
    offset
  };
}

export function rawOuterEtherTypeTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (!rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  const etherType = rawPacketWord(bytes, 12);
  if (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200) {
    return null;
  }
  return { bytes, etherType, offset: 12 };
}

export function rawOuterIpv4Target(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (bytes.length < 34 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let l3Offset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, l3Offset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, l3Offset + 2);
    l3Offset += 4;
    vlanIndex += 1;
  }
  if ((etherType === 0x8847 || etherType === 0x8848) && rawPacketHasBytes(bytes, l3Offset, 4)) {
    let mplsIndex = 0;
    while (rawPacketHasBytes(bytes, l3Offset, 4) && mplsIndex < 8) {
      const bottomOfStack = (bytes[l3Offset + 2] & 0x01) === 1;
      l3Offset += 4;
      mplsIndex += 1;
      if (bottomOfStack) {
        break;
      }
    }
    const version = (bytes[l3Offset] ?? 0) >> 4;
    etherType = version === 4 ? 0x0800 : etherType;
  }
  if (etherType !== 0x0800 || !rawPacketHasBytes(bytes, l3Offset, 20) || ((bytes[l3Offset] ?? 0) >> 4) !== 4) {
    return null;
  }
  const headerLength = (bytes[l3Offset] & 0x0f) * 4;
  if (headerLength < 20 || headerLength > 60 || !rawPacketHasBytes(bytes, l3Offset, headerLength)) {
    return null;
  }
  return {
    bytes,
    l3Length: headerLength,
    l3Offset,
    protocol: bytes[l3Offset + 9] ?? 0
  };
}

export function ipv4RouterAlertTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (bytes.length < 34 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let l3Offset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, l3Offset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, l3Offset + 2);
    l3Offset += 4;
    vlanIndex += 1;
  }
  if ((etherType === 0x8847 || etherType === 0x8848) && rawPacketHasBytes(bytes, l3Offset, 4)) {
    let mplsIndex = 0;
    while (rawPacketHasBytes(bytes, l3Offset, 4) && mplsIndex < 8) {
      const bottomOfStack = (bytes[l3Offset + 2] & 0x01) === 1;
      l3Offset += 4;
      mplsIndex += 1;
      if (bottomOfStack) {
        break;
      }
    }
    const version = (bytes[l3Offset] ?? 0) >> 4;
    etherType = version === 4 ? 0x0800 : etherType;
  }
  if (etherType !== 0x0800 || !rawPacketHasBytes(bytes, l3Offset, 20) || ((bytes[l3Offset] ?? 0) >> 4) !== 4) {
    return null;
  }
  const headerLength = (bytes[l3Offset] & 0x0f) * 4;
  if (headerLength <= 20 || headerLength > 60 || !rawPacketHasBytes(bytes, l3Offset, headerLength)) {
    return null;
  }
  const optionsEnd = l3Offset + headerLength;
  let optionOffset = l3Offset + 20;
  for (let optionIndex = 0; optionIndex < 16 && optionOffset < optionsEnd; optionIndex += 1) {
    const optionType = bytes[optionOffset] ?? 0;
    if (optionType === 0) {
      return null;
    }
    if (optionType === 1) {
      optionOffset += 1;
      continue;
    }
    if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
      return null;
    }
    const optionLength = bytes[optionOffset + 1] ?? 0;
    if (optionLength < 2 || optionOffset + optionLength > optionsEnd || !rawPacketHasBytes(bytes, optionOffset, optionLength)) {
      return null;
    }
    if (optionType === 0x94 && optionLength === 4) {
      return {
        ipv4Offset: l3Offset,
        value: rawPacketWord(bytes, optionOffset + 2),
        valueOffset: optionOffset + 2
      };
    }
    optionOffset += optionLength;
  }
  return null;
}

export function ipv4OptionTypeTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterIpv4Target(stream);
  if (!target || target.l3Length <= 20) {
    return null;
  }
  const optionsEnd = target.l3Offset + target.l3Length;
  let optionOffset = target.l3Offset + 20;
  for (let optionIndex = 0; optionIndex < 16 && optionOffset < optionsEnd; optionIndex += 1) {
    const optionType = target.bytes[optionOffset] ?? 0;
    if (optionType === 0) {
      return null;
    }
    if (optionType === 1) {
      optionOffset += 1;
      continue;
    }
    if (!rawPacketHasBytes(target.bytes, optionOffset, 2)) {
      return null;
    }
    const optionLength = target.bytes[optionOffset + 1] ?? 0;
    if (
      optionLength < 2
      || optionOffset + optionLength > optionsEnd
      || !rawPacketHasBytes(target.bytes, optionOffset, optionLength)
    ) {
      return null;
    }
    return {
      ipv4Offset: target.l3Offset,
      optionType,
      typeOffset: optionOffset
    };
  }
  return null;
}

export function rawMplsLabelTarget(stream: ProfileWorkbenchStream | null | undefined, index: 1 | 2 | 3) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (bytes.length < 18 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let offset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, offset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, offset + 2);
    offset += 4;
    vlanIndex += 1;
  }
  if (etherType !== 0x8847 && etherType !== 0x8848) {
    return null;
  }
  for (let labelIndex = 1; labelIndex <= 8 && rawPacketHasBytes(bytes, offset, 4); labelIndex += 1) {
    const word = rawPacketNumberValue(bytes, offset, 4);
    const target = {
      bytes,
      bottomOfStack: ((word >>> 8) & 0x01) === 1,
      label: (word >>> 12) & 0xfffff,
      offset,
      trafficClass: (word >>> 9) & 0x07,
      ttl: word & 0xff
    };
    if (labelIndex === index) {
      return target;
    }
    if (target.bottomOfStack) {
      return null;
    }
    offset += 4;
  }
  return null;
}

export function rawVlanTagTarget(stream: ProfileWorkbenchStream | null | undefined, index: 1 | 2) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (bytes.length < 18 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let tciOffset = 14;
  for (let vlanIndex = 1; vlanIndex <= 4 && rawPacketHasBytes(bytes, tciOffset, 4); vlanIndex += 1) {
    if (etherType !== 0x8100 && etherType !== 0x88a8 && etherType !== 0x9100 && etherType !== 0x9200) {
      return null;
    }
    const tci = rawPacketWord(bytes, tciOffset);
    const target = {
      cfi: (tci >>> 12) & 0x01,
      etherType,
      nextEtherType: rawPacketWord(bytes, tciOffset + 2),
      priority: (tci >>> 13) & 0x07,
      tci,
      tciOffset,
      vlanId: tci & 0x0fff
    };
    if (vlanIndex === index) {
      return target;
    }
    etherType = target.nextEtherType;
    tciOffset += 4;
  }
  return null;
}

export function rawArpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  if (bytes.length < 42 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let arpOffset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, arpOffset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, arpOffset + 2);
    arpOffset += 4;
    vlanIndex += 1;
  }
  if (etherType !== 0x0806 || !rawPacketHasBytes(bytes, arpOffset, 28)) {
    return null;
  }
  const hardwareType = rawPacketWord(bytes, arpOffset);
  const protocolType = rawPacketWord(bytes, arpOffset + 2);
  const hardwareSize = bytes[arpOffset + 4] ?? 0;
  const protocolSize = bytes[arpOffset + 5] ?? 0;
  if (hardwareType !== 1 || protocolType !== 0x0800 || hardwareSize !== 6 || protocolSize !== 4) {
    return null;
  }
  return {
    arpOffset,
    bytes,
    operation: rawPacketWord(bytes, arpOffset + 6),
    operationOffset: arpOffset + 6,
    senderIp: formatPacketIpv4(bytes, arpOffset + 14),
    senderIpOffset: arpOffset + 14,
    senderMac: formatPacketMac(bytes, arpOffset + 8),
    senderMacOffset: arpOffset + 8,
    targetIp: formatPacketIpv4(bytes, arpOffset + 24),
    targetIpOffset: arpOffset + 24,
    targetMac: formatPacketMac(bytes, arpOffset + 18),
    targetMacOffset: arpOffset + 18
  };
}

export function rawOuterIpv6Target(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const l3Offset = rawOuterIpv6Offset(bytes);
  if (l3Offset === null) {
    return null;
  }
  return {
    bytes,
    l3Offset,
    nextHeader: bytes[l3Offset + 6] ?? 59
  };
}

export function rawIpv6ExtensionHeaderTarget(stream: ProfileWorkbenchStream | null | undefined, targetHeader: number) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const l3Offset = rawOuterIpv6Offset(bytes);
  if (l3Offset === null) {
    return null;
  }
  let nextHeader = bytes[l3Offset + 6] ?? 59;
  let extensionOffset = l3Offset + 40;
  for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
    const extensionLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, extensionOffset);
    if (extensionLength === null) {
      return null;
    }
    if (nextHeader === targetHeader) {
      return {
        bytes,
        length: extensionLength,
        offset: extensionOffset
      };
    }
    nextHeader = bytes[extensionOffset] ?? 59;
    extensionOffset += extensionLength;
  }
  return null;
}

export function ipv6ExtensionOptionTarget(
  stream: ProfileWorkbenchStream | null | undefined,
  targetType: number,
  targetLength: 2 | 4
) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const l3Offset = rawOuterIpv6Offset(bytes);
  if (l3Offset === null) {
    return null;
  }
  let nextHeader = bytes[l3Offset + 6] ?? 59;
  let extensionOffset = l3Offset + 40;
  for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
    if (nextHeader === 44) {
      if (!rawPacketHasBytes(bytes, extensionOffset, 8)) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += 8;
      continue;
    }
    if (nextHeader === 51) {
      if (!rawPacketHasBytes(bytes, extensionOffset, 12)) {
        return null;
      }
      const ahLength = ((bytes[extensionOffset + 1] ?? 0) + 2) * 4;
      if (ahLength < 12 || !rawPacketHasBytes(bytes, extensionOffset, ahLength)) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += ahLength;
      continue;
    }
    if (nextHeader === 43) {
      const routingLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, extensionOffset);
      if (routingLength === null) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += routingLength;
      continue;
    }
    if (nextHeader !== 0 && nextHeader !== 60 && nextHeader !== 135) {
      return null;
    }
    if (!rawPacketHasBytes(bytes, extensionOffset, 8)) {
      return null;
    }
    const extensionLength = ((bytes[extensionOffset + 1] ?? 0) + 1) * 8;
    if (extensionLength < 8 || !rawPacketHasBytes(bytes, extensionOffset, extensionLength)) {
      return null;
    }
    const optionsEnd = extensionOffset + extensionLength;
    let optionOffset = extensionOffset + 2;
    for (let optionIndex = 0; optionIndex < 16 && optionOffset < optionsEnd; optionIndex += 1) {
      const optionType = bytes[optionOffset] ?? 0;
      if (optionType === 0) {
        optionOffset += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return null;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      const optionTotalLength = optionLength + 2;
      if (
        optionTotalLength < 2
        || optionOffset + optionTotalLength > optionsEnd
        || !rawPacketHasBytes(bytes, optionOffset, optionTotalLength)
      ) {
        return null;
      }
      if (optionType === targetType && optionLength === targetLength) {
        return {
          value: rawPacketNumberValue(bytes, optionOffset + 2, optionLength),
          valueOffset: optionOffset + 2
        };
      }
      optionOffset += optionTotalLength;
    }
    nextHeader = bytes[extensionOffset] ?? 59;
    extensionOffset += extensionLength;
  }
  return null;
}

export function ipv6ExtensionOptionTypeTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const l3Offset = rawOuterIpv6Offset(bytes);
  if (l3Offset === null) {
    return null;
  }
  let nextHeader = bytes[l3Offset + 6] ?? 59;
  let extensionOffset = l3Offset + 40;
  for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
    if (nextHeader === 44) {
      if (!rawPacketHasBytes(bytes, extensionOffset, 8)) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += 8;
      continue;
    }
    if (nextHeader === 51) {
      if (!rawPacketHasBytes(bytes, extensionOffset, 12)) {
        return null;
      }
      const ahLength = ((bytes[extensionOffset + 1] ?? 0) + 2) * 4;
      if (ahLength < 12 || !rawPacketHasBytes(bytes, extensionOffset, ahLength)) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += ahLength;
      continue;
    }
    if (nextHeader === 43) {
      const routingLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, extensionOffset);
      if (routingLength === null) {
        return null;
      }
      nextHeader = bytes[extensionOffset] ?? 59;
      extensionOffset += routingLength;
      continue;
    }
    if (nextHeader !== 0 && nextHeader !== 60 && nextHeader !== 135) {
      return null;
    }
    if (!rawPacketHasBytes(bytes, extensionOffset, 8)) {
      return null;
    }
    const extensionLength = ((bytes[extensionOffset + 1] ?? 0) + 1) * 8;
    if (extensionLength < 8 || !rawPacketHasBytes(bytes, extensionOffset, extensionLength)) {
      return null;
    }
    const optionsEnd = extensionOffset + extensionLength;
    let optionOffset = extensionOffset + 2;
    for (let optionIndex = 0; optionIndex < 16 && optionOffset < optionsEnd; optionIndex += 1) {
      const optionType = bytes[optionOffset] ?? 0;
      if (optionType === 0) {
        optionOffset += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return null;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      const optionTotalLength = optionLength + 2;
      if (
        optionTotalLength < 2
        || optionOffset + optionTotalLength > optionsEnd
        || !rawPacketHasBytes(bytes, optionOffset, optionTotalLength)
      ) {
        return null;
      }
      return {
        optionType,
        typeOffset: optionOffset
      };
    }
    nextHeader = bytes[extensionOffset] ?? 59;
    extensionOffset += extensionLength;
  }
  return null;
}

export function ipv6FragmentHeaderTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawIpv6ExtensionHeaderTarget(stream, 44);
  if (!target) {
    return null;
  }
  const fragmentWordOffset = target.offset + 2;
  const fragmentWord = rawPacketWord(target.bytes, fragmentWordOffset);
  return {
    fragmentOffset: (fragmentWord & 0xfff8) >>> 3,
    fragmentWordOffset,
    identification: rawPacketNumberValue(target.bytes, target.offset + 4, 4),
    identificationOffset: target.offset + 4,
    moreFragments: fragmentWord & 0x0001,
    reservedBits: (fragmentWord & 0x0006) >>> 1
  };
}

export function ipv6AhHeaderTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawIpv6ExtensionHeaderTarget(stream, 51);
  if (!target) {
    return null;
  }
  return {
    sequence: rawPacketNumberValue(target.bytes, target.offset + 8, 4),
    sequenceOffset: target.offset + 8,
    spi: rawPacketNumberValue(target.bytes, target.offset + 4, 4),
    spiOffset: target.offset + 4
  };
}

export function ipv6RoutingHeaderTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawIpv6ExtensionHeaderTarget(stream, 43);
  if (!target || target.length < 8) {
    return null;
  }
  return {
    routingType: rawPacketNumberValue(target.bytes, target.offset + 2, 1),
    routingTypeOffset: target.offset + 2,
    segmentsLeft: rawPacketNumberValue(target.bytes, target.offset + 3, 1),
    segmentsLeftOffset: target.offset + 3
  };
}

export function ipv6RouterAlertTarget(stream: ProfileWorkbenchStream | null | undefined) {
  return ipv6ExtensionOptionTarget(stream, 5, 2);
}

export function ipv6JumboPayloadTarget(stream: ProfileWorkbenchStream | null | undefined) {
  return ipv6ExtensionOptionTarget(stream, 0xc2, 4);
}

export function isAdvancedIpv4RouterAlertStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv4RouterAlertTarget(stream));
}

export function isAdvancedIpv4OptionTypeStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv4OptionTypeTarget(stream));
}

export function isAdvancedIpv6RouterAlertStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6RouterAlertTarget(stream));
}

export function isAdvancedIpv6ExtensionOptionTypeStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6ExtensionOptionTypeTarget(stream));
}

export function isAdvancedIpv6JumboPayloadStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6JumboPayloadTarget(stream));
}

export function isAdvancedIpv6FragmentStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6FragmentHeaderTarget(stream));
}

export function isAdvancedIpv6AhStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6AhHeaderTarget(stream));
}

export function isAdvancedIpv6RoutingStream(stream: ProfileWorkbenchStream | null | undefined) {
  return Boolean(ipv6RoutingHeaderTarget(stream));
}

export function rawOuterIpv6L4Target(stream: ProfileWorkbenchStream | null | undefined, targetHeader: number) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  const l3Offset = rawOuterIpv6Offset(bytes);
  if (l3Offset === null) {
    return null;
  }
  let nextHeader = bytes[l3Offset + 6] ?? 59;
  let l4Offset = l3Offset + 40;
  for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
    if (nextHeader === targetHeader) {
      return {
        bytes,
        l3Offset,
        offset: l4Offset
      };
    }
    const extensionLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, l4Offset);
    if (extensionLength === null) {
      return null;
    }
    nextHeader = bytes[l4Offset] ?? 59;
    l4Offset += extensionLength;
  }
  return null;
}

export function rawOuterIpv4L4Target(stream: ProfileWorkbenchStream | null | undefined, protocol: number) {
  const target = rawOuterIpv4Target(stream);
  if (!target || target.protocol !== protocol) {
    return null;
  }
  return {
    bytes: target.bytes,
    l3Length: target.l3Length,
    l3Offset: target.l3Offset,
    offset: target.l3Offset + target.l3Length
  };
}

export function rawOuterTransportTarget(
  stream: ProfileWorkbenchStream | null | undefined,
  protocol: 6 | 17,
  l4Type: 11 | 13,
  minHeaderLength: number
) {
  const ipv4Target = rawOuterIpv4L4Target(stream, protocol);
  if (ipv4Target && rawPacketHasBytes(ipv4Target.bytes, ipv4Target.offset, minHeaderLength)) {
    return {
      bytes: ipv4Target.bytes,
      checksumInstruction: {
        l2_len: ipv4Target.l3Offset,
        l3_len: ipv4Target.l3Length,
        l4_type: l4Type,
        type: "fix_checksum_hw"
      },
      l3Offset: ipv4Target.l3Offset,
      offset: ipv4Target.offset
    };
  }
  const ipv6Target = rawOuterIpv6L4Target(stream, protocol);
  if (ipv6Target && rawPacketHasBytes(ipv6Target.bytes, ipv6Target.offset, minHeaderLength)) {
    return {
      bytes: ipv6Target.bytes,
      checksumInstruction: {
        l2_len: ipv6Target.l3Offset,
        l3_len: 40,
        l4_type: l4Type,
        type: "fix_checksum_hw"
      },
      l3Offset: ipv6Target.l3Offset,
      offset: ipv6Target.offset
    };
  }
  return null;
}

export function rawOuterSctpTarget(stream: ProfileWorkbenchStream | null | undefined, minHeaderLength = 12) {
  const ipv4Target = rawOuterIpv4L4Target(stream, 132);
  if (ipv4Target && rawPacketHasBytes(ipv4Target.bytes, ipv4Target.offset, minHeaderLength)) {
    return {
      bytes: ipv4Target.bytes,
      l3Offset: ipv4Target.l3Offset,
      offset: ipv4Target.offset
    };
  }
  const ipv6Target = rawOuterIpv6L4Target(stream, 132);
  if (ipv6Target && rawPacketHasBytes(ipv6Target.bytes, ipv6Target.offset, minHeaderLength)) {
    return {
      bytes: ipv6Target.bytes,
      l3Offset: ipv6Target.l3Offset,
      offset: ipv6Target.offset
    };
  }
  return null;
}

function rawOuterTcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const ipv4Target = rawOuterIpv4L4Target(stream, 6);
  if (ipv4Target) {
    return ipv4Target;
  }
  const ipv6Target = rawOuterIpv6L4Target(stream, 6);
  return ipv6Target ? { ...ipv6Target, l3Length: 40 } : null;
}

export function rawOuterTcpFixedHeaderTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterTcpTarget(stream);
  if (!target) {
    return null;
  }
  const tcpOffset = rawPacketTcpHeaderOffset(target.bytes, target.offset);
  return tcpOffset === null ? null : { ...target, offset: tcpOffset };
}

export function rawOuterIpv6TransportTarget(stream: ProfileWorkbenchStream | null | undefined, l4Type: 11 | 13) {
  const targetHeader = l4Type === 11 ? 17 : 6;
  const minHeaderLength = l4Type === 11 ? 8 : 20;
  const target = rawOuterIpv6L4Target(stream, targetHeader);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, minHeaderLength)) {
    return null;
  }
  if (l4Type === 13 && rawPacketTcpHeaderOffset(target.bytes, target.offset) === null) {
    return null;
  }
  return {
    ...target,
    checksumInstruction: {
      l2_len: target.l3Offset,
      l3_len: 40,
      l4_type: l4Type,
      type: "fix_checksum_hw"
    }
  };
}

export type RawTcpOptionTargetName =
  | "mss"
  | "sack-left-edge"
  | "sack-right-edge"
  | "sack2-left-edge"
  | "sack2-right-edge"
  | "sack3-left-edge"
  | "sack3-right-edge"
  | "sack4-left-edge"
  | "sack4-right-edge"
  | "timestamp-value"
  | "timestamp-echo"
  | "window-scale";

export function rawTcpOptionValueTarget(stream: ProfileWorkbenchStream | null | undefined, targetName: RawTcpOptionTargetName) {
  const target = rawOuterTcpTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 20)) {
    return null;
  }
  const headerLength = ((target.bytes[target.offset + 12] ?? 0) >>> 4) * 4;
  if (headerLength < 20 || headerLength > 60 || !rawPacketHasBytes(target.bytes, target.offset, headerLength)) {
    return null;
  }
  const optionsEnd = target.offset + headerLength;
  let optionOffset = target.offset + 20;
  for (let optionIndex = 0; optionIndex < 40 && optionOffset < optionsEnd; optionIndex += 1) {
    const kind = target.bytes[optionOffset] ?? 0;
    if (kind === 0) {
      return null;
    }
    if (kind === 1) {
      optionOffset += 1;
      continue;
    }
    if (!rawPacketHasBytes(target.bytes, optionOffset, 2)) {
      return null;
    }
    const optionLength = target.bytes[optionOffset + 1] ?? 0;
    if (optionLength < 2 || optionOffset + optionLength > optionsEnd || !rawPacketHasBytes(target.bytes, optionOffset, optionLength)) {
      return null;
    }
    if (kind === 2 && optionLength === 4 && targetName === "mss") {
      return {
        ...target,
        maxLimit: 65_535,
        size: 2 as const,
        value: rawPacketNumberValue(target.bytes, optionOffset + 2, 2),
        valueOffset: optionOffset + 2
      };
    }
    if (kind === 3 && optionLength === 3 && targetName === "window-scale") {
      return {
        ...target,
        maxLimit: 255,
        size: 1 as const,
        value: rawPacketNumberValue(target.bytes, optionOffset + 2, 1),
        valueOffset: optionOffset + 2
      };
    }
    if (
      kind === 5
      && optionLength >= 10
      && (
        targetName === "sack-left-edge"
        || targetName === "sack-right-edge"
        || targetName === "sack2-left-edge"
        || targetName === "sack2-right-edge"
        || targetName === "sack3-left-edge"
        || targetName === "sack3-right-edge"
        || targetName === "sack4-left-edge"
        || targetName === "sack4-right-edge"
      )
    ) {
      let blockIndex = 0;
      if (targetName === "sack2-left-edge" || targetName === "sack2-right-edge") {
        blockIndex = 1;
      } else if (targetName === "sack3-left-edge" || targetName === "sack3-right-edge") {
        blockIndex = 2;
      } else if (targetName === "sack4-left-edge" || targetName === "sack4-right-edge") {
        blockIndex = 3;
      }
      if (optionLength < 2 + ((blockIndex + 1) * 8)) {
        optionOffset += optionLength;
        continue;
      }
      const valueOffset = optionOffset + 2 + (blockIndex * 8) + (targetName.endsWith("left-edge") ? 0 : 4);
      return {
        ...target,
        maxLimit: 4_294_967_295,
        size: 4 as const,
        value: rawPacketNumberValue(target.bytes, valueOffset, 4),
        valueOffset
      };
    }
    if (kind === 8 && optionLength === 10 && (targetName === "timestamp-value" || targetName === "timestamp-echo")) {
      const valueOffset = optionOffset + (targetName === "timestamp-value" ? 2 : 6);
      return {
        ...target,
        maxLimit: 4_294_967_295,
        size: 4 as const,
        value: rawPacketNumberValue(target.bytes, valueOffset, 4),
        valueOffset
      };
    }
    optionOffset += optionLength;
  }
  return null;
}

function compactRawPacketHex(value: string) {
  const withoutOffsets = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[0-9a-fA-F]{4,8}\s*[:|]\s*/, ""))
    .join(" ");
  return withoutOffsets.replace(/0x/gi, "").replace(/[\s,:;|_-]/g, "");
}

export function rawPacketHexError(value: string) {
  const compact = compactRawPacketHex(value);
  if (compact.length === 0) {
    return "Raw packet hex is empty.";
  }
  if (/[^0-9a-fA-F]/.test(compact)) {
    return "Raw packet hex must contain only hex bytes.";
  }
  if (compact.length % 2 !== 0) {
    return "Raw packet hex must contain whole bytes.";
  }
  if (compact.length / 2 > RAW_PACKET_MAX_BYTES) {
    return `Raw packet exceeds ${RAW_PACKET_MAX_BYTES} bytes.`;
  }
  return null;
}

export function rawPacketHexByteCount(value: string) {
  const compact = compactRawPacketHex(value);
  if (compact.length === 0 || /[^0-9a-fA-F]/.test(compact)) {
    return 0;
  }
  return Math.floor(compact.length / 2);
}

export function rawPacketHexToBase64(value: string) {
  const compact = compactRawPacketHex(value);
  let binary = "";
  for (let index = 0; index < compact.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(compact.slice(index, index + 2), 16));
  }
  return btoa(binary);
}

export function rawPacketBytesFromHex(value: string) {
  if (rawPacketHexError(value)) {
    return null;
  }
  const compact = compactRawPacketHex(value);
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 2) {
    bytes.push(Number.parseInt(compact.slice(index, index + 2), 16));
  }
  return bytes;
}

function rawPacketHexCharacter(value: string) {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

export function rawPacketHexSelectionRange(value: string, byteOffset: number, byteLength: number) {
  if (byteOffset < 0 || byteLength <= 0) {
    return null;
  }
  const targetStartNibble = byteOffset * 2;
  const targetEndNibble = (byteOffset + byteLength) * 2;
  let hexNibbleIndex = 0;
  let start: number | null = null;

  for (let characterIndex = 0; characterIndex < value.length; characterIndex += 1) {
    if (!rawPacketHexCharacter(value[characterIndex] ?? "")) {
      continue;
    }
    if (hexNibbleIndex === targetStartNibble) {
      start = characterIndex;
    }
    hexNibbleIndex += 1;
    if (hexNibbleIndex === targetEndNibble) {
      return start === null ? null : { end: characterIndex + 1, start };
    }
  }
  return null;
}

export function rawPacketWord(bytes: number[], offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

export function rawPacketHasBytes(bytes: number[], offset: number, length: number) {
  return offset >= 0 && length > 0 && offset + length <= bytes.length;
}

export function rawDnsNameEnd(bytes: number[], offset: number, allowCompressionPointer = false) {
  let cursor = offset;
  for (let labelIndex = 0; labelIndex < 64; labelIndex += 1) {
    if (!rawPacketHasBytes(bytes, cursor, 1)) {
      return null;
    }
    const labelLength = bytes[cursor] ?? 0;
    if ((labelLength & 0xc0) === 0xc0) {
      return allowCompressionPointer && rawPacketHasBytes(bytes, cursor, 2) ? cursor + 2 : null;
    }
    if (labelLength === 0) {
      return cursor + 1;
    }
    if ((labelLength & 0xc0) !== 0 || labelLength > 63) {
      return null;
    }
    cursor += 1;
    if (!rawPacketHasBytes(bytes, cursor, labelLength)) {
      return null;
    }
    cursor += labelLength;
    if (cursor - offset > 255) {
      return null;
    }
  }
  return null;
}

export function rawOuterIpv6Offset(bytes: number[]) {
  if (bytes.length < 54 || !rawPacketHasBytes(bytes, 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, 12);
  let l3Offset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, l3Offset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, l3Offset + 2);
    l3Offset += 4;
    vlanIndex += 1;
  }
  if ((etherType === 0x8847 || etherType === 0x8848) && rawPacketHasBytes(bytes, l3Offset, 4)) {
    let mplsIndex = 0;
    while (rawPacketHasBytes(bytes, l3Offset, 4) && mplsIndex < 8) {
      const bottomOfStack = (bytes[l3Offset + 2] & 0x01) === 1;
      l3Offset += 4;
      mplsIndex += 1;
      if (bottomOfStack) {
        break;
      }
    }
    if (!rawPacketHasBytes(bytes, l3Offset, 1)) {
      return null;
    }
    const version = (bytes[l3Offset] ?? 0) >> 4;
    etherType = version === 6 ? 0x86dd : etherType;
  }
  if (etherType !== 0x86dd || !rawPacketHasBytes(bytes, l3Offset, 40) || ((bytes[l3Offset] ?? 0) >> 4) !== 6) {
    return null;
  }
  return l3Offset;
}

export function rawInnerEthernetPayloadOffset(bytes: number[], ethernetOffset: number) {
  if (!rawPacketHasBytes(bytes, ethernetOffset, 14)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, ethernetOffset + 12);
  let payloadOffset = ethernetOffset + 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, payloadOffset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, payloadOffset + 2);
    payloadOffset += 4;
    vlanIndex += 1;
  }
  return { etherType, payloadOffset };
}

export function rawVxlanTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterTransportTarget(stream, 17, 11, 16);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 16)) {
    return null;
  }
  const sourcePort = rawPacketWord(target.bytes, target.offset);
  const destinationPort = rawPacketWord(target.bytes, target.offset + 2);
  if (sourcePort !== 4789 && destinationPort !== 4789 && sourcePort !== 8472 && destinationPort !== 8472) {
    return null;
  }
  const udpLength = rawPacketWord(target.bytes, target.offset + 4);
  const udpEnd = udpLength === 0 ? target.bytes.length : target.offset + udpLength;
  const vxlanOffset = target.offset + 8;
  if (vxlanOffset + 8 > udpEnd || !rawPacketHasBytes(target.bytes, vxlanOffset, 8)) {
    return null;
  }
  const innerEthernetOffset = vxlanOffset + 8;
  const innerPayload = rawInnerEthernetPayloadOffset(target.bytes, innerEthernetOffset);
  const baseTarget = {
    bytes: target.bytes,
    innerEthernetOffset,
    vni: rawPacketNumberValue(target.bytes, vxlanOffset + 4, 3),
    vniOffset: vxlanOffset + 4,
    vxlanOffset
  };
  if (!innerPayload || innerPayload.payloadOffset >= udpEnd) {
    return baseTarget;
  }
  if (
    innerPayload.etherType === 0x0800
    && rawPacketHasBytes(target.bytes, innerPayload.payloadOffset, 20)
    && ((target.bytes[innerPayload.payloadOffset] ?? 0) >> 4) === 4
  ) {
    const innerIpv4HeaderLength = (target.bytes[innerPayload.payloadOffset] & 0x0f) * 4;
    if (
      innerIpv4HeaderLength >= 20
      && innerIpv4HeaderLength <= 60
      && rawPacketHasBytes(target.bytes, innerPayload.payloadOffset, innerIpv4HeaderLength)
      && innerPayload.payloadOffset + innerIpv4HeaderLength <= udpEnd
    ) {
      const innerUdpOffset = target.bytes[innerPayload.payloadOffset + 9] === 17
        && rawPacketHasBytes(target.bytes, innerPayload.payloadOffset + innerIpv4HeaderLength, 8)
        && innerPayload.payloadOffset + innerIpv4HeaderLength + 8 <= udpEnd
        ? innerPayload.payloadOffset + innerIpv4HeaderLength
        : null;
      const innerTcpOffset = target.bytes[innerPayload.payloadOffset + 9] === 6
        ? rawPacketTcpHeaderOffset(target.bytes, innerPayload.payloadOffset + innerIpv4HeaderLength, udpEnd)
        : null;
      return {
        ...baseTarget,
        innerIpHeaderLength: innerIpv4HeaderLength,
        innerIpOffset: innerPayload.payloadOffset,
        innerIpVersion: "IPv4" as const,
        innerIpv4Dst: formatPacketIpv4(target.bytes, innerPayload.payloadOffset + 16),
        innerIpv4DstOffset: innerPayload.payloadOffset + 16,
        innerIpv4Protocol: target.bytes[innerPayload.payloadOffset + 9] ?? 0,
        innerIpv4Src: formatPacketIpv4(target.bytes, innerPayload.payloadOffset + 12),
        innerIpv4SrcOffset: innerPayload.payloadOffset + 12,
        innerIpv4Ttl: target.bytes[innerPayload.payloadOffset + 8] ?? 0,
        innerIpv4TtlOffset: innerPayload.payloadOffset + 8,
        innerTcpOffset,
        innerUdpDstPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset + 2),
        innerUdpOffset,
        innerUdpSrcPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset)
      };
    }
  }
  if (
    innerPayload.etherType === 0x86dd
    && rawPacketHasBytes(target.bytes, innerPayload.payloadOffset, 40)
    && ((target.bytes[innerPayload.payloadOffset] ?? 0) >> 4) === 6
    && innerPayload.payloadOffset + 40 <= udpEnd
  ) {
    const innerUdpOffset = target.bytes[innerPayload.payloadOffset + 6] === 17
      && rawPacketHasBytes(target.bytes, innerPayload.payloadOffset + 40, 8)
      && innerPayload.payloadOffset + 48 <= udpEnd
      ? innerPayload.payloadOffset + 40
      : null;
    const innerTcpOffset = target.bytes[innerPayload.payloadOffset + 6] === 6
      ? rawPacketTcpHeaderOffset(target.bytes, innerPayload.payloadOffset + 40, udpEnd)
      : null;
    return {
      ...baseTarget,
      innerIpHeaderLength: 40,
      innerIpOffset: innerPayload.payloadOffset,
      innerIpVersion: "IPv6" as const,
      innerIpv6Dst: formatPacketIpv6(target.bytes, innerPayload.payloadOffset + 24),
      innerIpv6DstOffset: innerPayload.payloadOffset + 24,
      innerIpv6HopLimit: target.bytes[innerPayload.payloadOffset + 7] ?? 0,
      innerIpv6HopLimitOffset: innerPayload.payloadOffset + 7,
      innerIpv6Src: formatPacketIpv6(target.bytes, innerPayload.payloadOffset + 8),
      innerIpv6SrcOffset: innerPayload.payloadOffset + 8,
      innerTcpOffset,
      innerUdpDstPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset + 2),
      innerUdpOffset,
      innerUdpSrcPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset)
    };
  }
  return baseTarget;
}

export function rawVxlanInnerIpv4UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4" && rawTarget.innerUdpOffset !== null
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv4TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4" && rawTarget.innerTcpOffset !== null
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv4Target(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4"
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv4AddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanInnerIpv4Target(stream);
  if (!rawTarget) {
    return null;
  }
  if (
    rawTarget.innerUdpOffset !== null
    || rawTarget.innerTcpOffset !== null
    || (rawTarget.innerIpv4Protocol !== 6 && rawTarget.innerIpv4Protocol !== 17)
  ) {
    return rawTarget;
  }
  return null;
}

export function rawVxlanInnerIpv6UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6" && rawTarget.innerUdpOffset !== null
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv6TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6" && rawTarget.innerTcpOffset !== null
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv6Target(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6"
    ? rawTarget
    : null;
}

export function rawVxlanInnerIpv6AddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  return rawVxlanInnerIpv6UdpTarget(stream) ?? rawVxlanInnerIpv6TcpTarget(stream);
}

export function rawVxlanInnerEthernetTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanTarget(stream);
  if (!rawTarget || !rawPacketHasBytes(rawTarget.bytes, rawTarget.innerEthernetOffset, 14)) {
    return null;
  }
  return rawTarget;
}

export function rawVxlanInnerVlanTagTarget(stream: ProfileWorkbenchStream | null | undefined, index: 1 | 2 = 1) {
  const rawTarget = rawVxlanInnerEthernetTarget(stream);
  if (!rawTarget || !rawPacketHasBytes(rawTarget.bytes, rawTarget.innerEthernetOffset + 12, 2)) {
    return null;
  }
  let etherType = rawPacketWord(rawTarget.bytes, rawTarget.innerEthernetOffset + 12);
  let tciOffset = rawTarget.innerEthernetOffset + 14;
  for (let vlanIndex = 1; vlanIndex <= 4 && rawPacketHasBytes(rawTarget.bytes, tciOffset, 4); vlanIndex += 1) {
    if (etherType !== 0x8100 && etherType !== 0x88a8 && etherType !== 0x9100 && etherType !== 0x9200) {
      return null;
    }
    const tci = rawPacketWord(rawTarget.bytes, tciOffset);
    const target = {
      ...rawTarget,
      cfi: (tci >>> 12) & 0x01,
      etherType,
      nextEtherType: rawPacketWord(rawTarget.bytes, tciOffset + 2),
      priority: (tci >>> 13) & 0x07,
      tci,
      tciOffset,
      vlanId: tci & 0x0fff
    };
    if (vlanIndex === index) {
      return target;
    }
    etherType = target.nextEtherType;
    tciOffset += 4;
  }
  return null;
}

export function rawVxlanInnerArpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawVxlanInnerEthernetTarget(stream);
  if (!rawTarget) {
    return null;
  }
  const innerPayload = rawInnerEthernetPayloadOffset(rawTarget.bytes, rawTarget.innerEthernetOffset);
  if (!innerPayload || innerPayload.etherType !== 0x0806 || !rawPacketHasBytes(rawTarget.bytes, innerPayload.payloadOffset, 28)) {
    return null;
  }
  const arpOffset = innerPayload.payloadOffset;
  const hardwareType = rawPacketWord(rawTarget.bytes, arpOffset);
  const protocolType = rawPacketWord(rawTarget.bytes, arpOffset + 2);
  const hardwareSize = rawTarget.bytes[arpOffset + 4] ?? 0;
  const protocolSize = rawTarget.bytes[arpOffset + 5] ?? 0;
  if (hardwareType !== 1 || protocolType !== 0x0800 || hardwareSize !== 6 || protocolSize !== 4) {
    return null;
  }
  return {
    ...rawTarget,
    arpOffset,
    operation: rawPacketWord(rawTarget.bytes, arpOffset + 6),
    operationOffset: arpOffset + 6,
    senderIp: formatPacketIpv4(rawTarget.bytes, arpOffset + 14),
    senderIpOffset: arpOffset + 14,
    senderMac: formatPacketMac(rawTarget.bytes, arpOffset + 8),
    senderMacOffset: arpOffset + 8,
    targetIp: formatPacketIpv4(rawTarget.bytes, arpOffset + 24),
    targetIpOffset: arpOffset + 24,
    targetMac: formatPacketMac(rawTarget.bytes, arpOffset + 18),
    targetMacOffset: arpOffset + 18
  };
}

export function rawGtpuTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterTransportTarget(stream, 17, 11, 16);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 16)) {
    return null;
  }
  const sourcePort = rawPacketWord(target.bytes, target.offset);
  const destinationPort = rawPacketWord(target.bytes, target.offset + 2);
  if (sourcePort !== 2152 && destinationPort !== 2152) {
    return null;
  }
  const udpLength = rawPacketWord(target.bytes, target.offset + 4);
  const udpEnd = udpLength === 0 ? target.bytes.length : target.offset + udpLength;
  const gtpuOffset = target.offset + 8;
  if (udpEnd > target.bytes.length || gtpuOffset + 8 > udpEnd || !rawPacketHasBytes(target.bytes, gtpuOffset, 8)) {
    return null;
  }
  const flags = target.bytes[gtpuOffset] ?? 0;
  if ((flags >>> 5) !== 1 || (flags & 0x10) === 0) {
    return null;
  }

  const messageLength = rawPacketWord(target.bytes, gtpuOffset + 2);
  const messageEnd = messageLength === 0 ? udpEnd : gtpuOffset + 8 + messageLength;
  if (messageEnd > udpEnd || messageEnd > target.bytes.length) {
    return null;
  }

  let payloadOffset = gtpuOffset + 8;
  let nextExtensionHeader = 0;
  let nextExtensionHeaderOffset: number | null = null;
  let npdu: number | null = null;
  let npduOffset: number | null = null;
  let sequence: number | null = null;
  let sequenceOffset: number | null = null;
  let extensionUdpPort: number | null = null;
  let extensionUdpPortOffset: number | null = null;

  if ((flags & 0x07) !== 0) {
    if (payloadOffset + 4 > messageEnd || !rawPacketHasBytes(target.bytes, payloadOffset, 4)) {
      return {
        bytes: target.bytes,
        checksumInstruction: target.checksumInstruction,
        extensionUdpPort,
        extensionUdpPortOffset,
        flags,
        gtpuOffset,
        messageEnd,
        messageLength,
        messageType: target.bytes[gtpuOffset + 1] ?? 0,
        nextExtensionHeaderOffset,
        npdu,
        npduOffset,
        payloadOffset,
        sequence,
        sequenceOffset,
        teid: rawPacketNumberValue(target.bytes, gtpuOffset + 4, 4),
        teidOffset: gtpuOffset + 4
      };
    }
    sequenceOffset = payloadOffset;
    sequence = rawPacketWord(target.bytes, sequenceOffset);
    npduOffset = payloadOffset + 2;
    npdu = target.bytes[npduOffset] ?? 0;
    nextExtensionHeaderOffset = payloadOffset + 3;
    nextExtensionHeader = target.bytes[nextExtensionHeaderOffset] ?? 0;
    payloadOffset += 4;
  }

  for (let extensionIndex = 0; nextExtensionHeader !== 0 && extensionIndex < 8; extensionIndex += 1) {
    if (payloadOffset + 1 > messageEnd || !rawPacketHasBytes(target.bytes, payloadOffset, 1)) {
      break;
    }
    const extensionLength = target.bytes[payloadOffset] ?? 0;
    const extensionByteLength = extensionLength * 4;
    if (
      extensionByteLength < 4
      || payloadOffset + extensionByteLength > messageEnd
      || !rawPacketHasBytes(target.bytes, payloadOffset, extensionByteLength)
    ) {
      break;
    }
    if (nextExtensionHeader === 0x40 && extensionByteLength >= 4) {
      extensionUdpPortOffset = payloadOffset + 1;
      extensionUdpPort = rawPacketWord(target.bytes, extensionUdpPortOffset);
    }
    nextExtensionHeader = target.bytes[payloadOffset + extensionByteLength - 1] ?? 0;
    payloadOffset += extensionByteLength;
  }

  const baseTarget = {
    bytes: target.bytes,
    checksumInstruction: target.checksumInstruction,
    extensionUdpPort,
    extensionUdpPortOffset,
    flags,
    gtpuOffset,
    messageEnd,
    messageLength,
    messageType: target.bytes[gtpuOffset + 1] ?? 0,
    nextExtensionHeaderOffset,
    npdu,
    npduOffset,
    payloadOffset,
    sequence,
    sequenceOffset,
    teid: rawPacketNumberValue(target.bytes, gtpuOffset + 4, 4),
    teidOffset: gtpuOffset + 4
  };

  if (payloadOffset >= messageEnd || !rawPacketHasBytes(target.bytes, payloadOffset, 1)) {
    return baseTarget;
  }
  const innerVersion = (target.bytes[payloadOffset] ?? 0) >> 4;
  if (innerVersion === 4 && rawPacketHasBytes(target.bytes, payloadOffset, 20)) {
    const innerIpv4HeaderLength = (target.bytes[payloadOffset] & 0x0f) * 4;
    if (
      innerIpv4HeaderLength >= 20
      && innerIpv4HeaderLength <= 60
      && rawPacketHasBytes(target.bytes, payloadOffset, innerIpv4HeaderLength)
      && payloadOffset + innerIpv4HeaderLength <= messageEnd
    ) {
      const innerUdpOffset = target.bytes[payloadOffset + 9] === 17
        && rawPacketHasBytes(target.bytes, payloadOffset + innerIpv4HeaderLength, 8)
        && payloadOffset + innerIpv4HeaderLength + 8 <= messageEnd
        ? payloadOffset + innerIpv4HeaderLength
        : null;
      const innerTcpOffset = target.bytes[payloadOffset + 9] === 6
        ? rawPacketTcpHeaderOffset(target.bytes, payloadOffset + innerIpv4HeaderLength, messageEnd)
        : null;
      return {
        ...baseTarget,
        innerIpHeaderLength: innerIpv4HeaderLength,
        innerIpOffset: payloadOffset,
        innerIpVersion: "IPv4" as const,
        innerIpv4Dst: formatPacketIpv4(target.bytes, payloadOffset + 16),
        innerIpv4DstOffset: payloadOffset + 16,
        innerIpv4Protocol: target.bytes[payloadOffset + 9] ?? 0,
        innerIpv4Src: formatPacketIpv4(target.bytes, payloadOffset + 12),
        innerIpv4SrcOffset: payloadOffset + 12,
        innerIpv4Ttl: target.bytes[payloadOffset + 8] ?? 0,
        innerIpv4TtlOffset: payloadOffset + 8,
        innerTcpOffset,
        innerUdpDstPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset + 2),
        innerUdpOffset,
        innerUdpSrcPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset)
      };
    }
  }
  if (
    innerVersion === 6
    && rawPacketHasBytes(target.bytes, payloadOffset, 40)
    && payloadOffset + 40 <= messageEnd
  ) {
    const innerUdpOffset = target.bytes[payloadOffset + 6] === 17
      && rawPacketHasBytes(target.bytes, payloadOffset + 40, 8)
      && payloadOffset + 48 <= messageEnd
      ? payloadOffset + 40
      : null;
    const innerTcpOffset = target.bytes[payloadOffset + 6] === 6
      ? rawPacketTcpHeaderOffset(target.bytes, payloadOffset + 40, messageEnd)
      : null;
    return {
      ...baseTarget,
      innerIpHeaderLength: 40,
      innerIpOffset: payloadOffset,
      innerIpVersion: "IPv6" as const,
      innerIpv6Dst: formatPacketIpv6(target.bytes, payloadOffset + 24),
      innerIpv6DstOffset: payloadOffset + 24,
      innerIpv6HopLimit: target.bytes[payloadOffset + 7] ?? 0,
      innerIpv6HopLimitOffset: payloadOffset + 7,
      innerIpv6Src: formatPacketIpv6(target.bytes, payloadOffset + 8),
      innerIpv6SrcOffset: payloadOffset + 8,
      innerTcpOffset,
      innerUdpDstPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset + 2),
      innerUdpOffset,
      innerUdpSrcPort: innerUdpOffset === null ? null : rawPacketWord(target.bytes, innerUdpOffset)
    };
  }
  return baseTarget;
}

export function rawGtpuInnerIpv4UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4" && rawTarget.innerUdpOffset !== null
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv4TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4" && rawTarget.innerTcpOffset !== null
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv4Target(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv4"
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv4AddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuInnerIpv4Target(stream);
  if (!rawTarget) {
    return null;
  }
  if (
    rawTarget.innerUdpOffset !== null
    || rawTarget.innerTcpOffset !== null
    || (rawTarget.innerIpv4Protocol !== 6 && rawTarget.innerIpv4Protocol !== 17)
  ) {
    return rawTarget;
  }
  return null;
}

export function rawGtpuInnerIpv6UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6" && rawTarget.innerUdpOffset !== null
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv6TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6" && rawTarget.innerTcpOffset !== null
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv6Target(stream: ProfileWorkbenchStream | null | undefined) {
  const rawTarget = rawGtpuTarget(stream);
  return rawTarget && "innerIpVersion" in rawTarget && rawTarget.innerIpVersion === "IPv6"
    ? rawTarget
    : null;
}

export function rawGtpuInnerIpv6AddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  return rawGtpuInnerIpv6UdpTarget(stream) ?? rawGtpuInnerIpv6TcpTarget(stream);
}

type RawGreTarget = {
  bytes: number[];
  checksumPresent: boolean;
  flags: number;
  greOffset: number;
  keyOffset: number | null;
  keyPresent: boolean;
  l3Offset: number;
  payloadOffset: number;
  protocolType: number;
  sequenceOffset: number | null;
  sequencePresent: boolean;
};

function rawGreTargetFromOffset(bytes: number[], l3Offset: number, greOffset: number): RawGreTarget | null {
  if (!rawPacketHasBytes(bytes, greOffset, 4)) {
    return null;
  }
  const flags = rawPacketWord(bytes, greOffset);
  const protocolType = rawPacketWord(bytes, greOffset + 2);
  const checksumPresent = (flags & 0x8000) !== 0;
  const routingPresent = (flags & 0x4000) !== 0;
  const keyPresent = (flags & 0x2000) !== 0;
  const sequencePresent = (flags & 0x1000) !== 0;
  const version = flags & 0x0007;
  if (routingPresent || version !== 0) {
    return null;
  }

  let payloadOffset = greOffset + 4;
  if (checksumPresent) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }
  const keyOffset = keyPresent ? payloadOffset : null;
  if (keyPresent) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }
  const sequenceOffset = sequencePresent ? payloadOffset : null;
  if (sequencePresent) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }

  return {
    bytes,
    checksumPresent,
    flags,
    greOffset,
    keyOffset,
    keyPresent,
    l3Offset,
    payloadOffset,
    protocolType,
    sequenceOffset,
    sequencePresent
  };
}

export function rawOuterGreTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const ipv4Target = rawOuterIpv4L4Target(stream, 47);
  if (ipv4Target) {
    return rawGreTargetFromOffset(ipv4Target.bytes, ipv4Target.l3Offset, ipv4Target.offset);
  }
  const ipv6Target = rawOuterIpv6L4Target(stream, 47);
  if (ipv6Target) {
    return rawGreTargetFromOffset(ipv6Target.bytes, ipv6Target.l3Offset, ipv6Target.offset);
  }
  return null;
}

export function rawGreOptionTarget(stream: ProfileWorkbenchStream | null | undefined, field: "key" | "sequence") {
  const target = rawOuterGreTarget(stream);
  if (!target || target.checksumPresent) {
    return null;
  }
  const offset = field === "key" ? target.keyOffset : target.sequenceOffset;
  if (offset === null || !rawPacketHasBytes(target.bytes, offset, 4)) {
    return null;
  }
  return {
    ...target,
    offset,
    value: rawPacketNumberValue(target.bytes, offset, 4)
  };
}

export function rawGreInnerIpv4Target(stream: ProfileWorkbenchStream | null | undefined, requireUdp = false) {
  const target = rawOuterGreTarget(stream);
  if (!target || target.checksumPresent || target.protocolType !== 0x0800 || !rawPacketHasBytes(target.bytes, target.payloadOffset, 20)) {
    return null;
  }
  const version = (target.bytes[target.payloadOffset] ?? 0) >>> 4;
  const l3Length = (target.bytes[target.payloadOffset] & 0x0f) * 4;
  if (version !== 4 || l3Length < 20 || l3Length > 60 || !rawPacketHasBytes(target.bytes, target.payloadOffset, l3Length)) {
    return null;
  }
  const protocol = target.bytes[target.payloadOffset + 9] ?? 0;
  if (requireUdp && protocol !== 17) {
    return null;
  }
  return {
    ...target,
    innerL3Length: l3Length,
    innerL3Offset: target.payloadOffset,
    innerProtocol: protocol
  };
}

export function rawGreInnerIpv4UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawGreInnerIpv4Target(stream, true);
  if (!target) {
    return null;
  }
  const udpOffset = target.innerL3Offset + target.innerL3Length;
  if (!rawPacketHasBytes(target.bytes, udpOffset, 8)) {
    return null;
  }
  return {
    ...target,
    udpOffset
  };
}

export function rawGreInnerIpv4TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawGreInnerIpv4Target(stream);
  if (!target || target.innerProtocol !== 6) {
    return null;
  }
  const tcpOffset = rawPacketTcpHeaderOffset(target.bytes, target.innerL3Offset + target.innerL3Length);
  if (tcpOffset === null) {
    return null;
  }
  return {
    ...target,
    tcpOffset
  };
}

export function rawGreInnerIpv4AddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawGreInnerIpv4Target(stream);
  if (!target) {
    return null;
  }
  if (target.innerProtocol === 17) {
    return rawGreInnerIpv4UdpTarget(stream);
  }
  if (target.innerProtocol === 6) {
    return rawGreInnerIpv4TcpTarget(stream);
  }
  return target;
}

export function rawGreInnerIpv6Target(stream: ProfileWorkbenchStream | null | undefined, requireUdp = false) {
  const target = rawOuterGreTarget(stream);
  if (!target || target.checksumPresent || target.protocolType !== 0x86dd || !rawPacketHasBytes(target.bytes, target.payloadOffset, 40)) {
    return null;
  }
  const version = (target.bytes[target.payloadOffset] ?? 0) >>> 4;
  if (version !== 6) {
    return null;
  }
  const protocol = target.bytes[target.payloadOffset + 6] ?? 0;
  if (requireUdp && protocol !== 17) {
    return null;
  }
  return {
    ...target,
    innerIpv6Dst: formatPacketIpv6(target.bytes, target.payloadOffset + 24),
    innerIpv6DstOffset: target.payloadOffset + 24,
    innerIpv6HopLimit: target.bytes[target.payloadOffset + 7] ?? 0,
    innerIpv6HopLimitOffset: target.payloadOffset + 7,
    innerIpv6Src: formatPacketIpv6(target.bytes, target.payloadOffset + 8),
    innerIpv6SrcOffset: target.payloadOffset + 8,
    innerL3Length: 40,
    innerL3Offset: target.payloadOffset,
    innerProtocol: protocol
  };
}

export function rawGreInnerIpv6UdpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawGreInnerIpv6Target(stream, true);
  if (!target) {
    return null;
  }
  const udpOffset = target.innerL3Offset + target.innerL3Length;
  if (!rawPacketHasBytes(target.bytes, udpOffset, 8)) {
    return null;
  }
  return {
    ...target,
    innerUdpDstPort: rawPacketWord(target.bytes, udpOffset + 2),
    innerUdpSrcPort: rawPacketWord(target.bytes, udpOffset),
    udpOffset
  };
}

export function rawGreInnerIpv6TcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawGreInnerIpv6Target(stream);
  if (!target || target.innerProtocol !== 6) {
    return null;
  }
  const tcpOffset = rawPacketTcpHeaderOffset(target.bytes, target.innerL3Offset + target.innerL3Length);
  if (tcpOffset === null) {
    return null;
  }
  return {
    ...target,
    tcpOffset
  };
}

export function rawGreInnerChecksumInstruction(target: { innerL3Length: number; innerL3Offset: number }, l4Type: 11 | 13 = 11) {
  return {
    l2_len: target.innerL3Offset,
    l3_len: target.innerL3Length,
    l4_type: l4Type,
    type: "fix_checksum_hw"
  };
}

export function rawGreInnerIpv4ChecksumInstruction(
  target: NonNullable<ReturnType<typeof rawGreInnerIpv4Target>> & { tcpOffset?: number }
) {
  if (target.innerProtocol === 17) {
    return rawGreInnerChecksumInstruction(target);
  }
  if (target.innerProtocol === 6 && target.tcpOffset !== undefined) {
    return {
      l2_len: target.innerL3Offset,
      l3_len: target.innerL3Length,
      l4_type: 13,
      type: "fix_checksum_hw"
    };
  }
  return {
    pkt_offset: target.innerL3Offset,
    type: "fix_checksum_ipv4"
  };
}

export function rawIpv6ExtensionHeaderLength(bytes: number[], header: number, offset: number) {
  if (header === 44) {
    return rawPacketHasBytes(bytes, offset, 8) ? 8 : null;
  }
  if (header === 51) {
    if (!rawPacketHasBytes(bytes, offset, 12)) {
      return null;
    }
    const ahLength = ((bytes[offset + 1] ?? 0) + 2) * 4;
    return ahLength >= 12 && rawPacketHasBytes(bytes, offset, ahLength) ? ahLength : null;
  }
  if (header === 0 || header === 43 || header === 60 || header === 135) {
    if (!rawPacketHasBytes(bytes, offset, 8)) {
      return null;
    }
    const extensionLength = ((bytes[offset + 1] ?? 0) + 1) * 8;
    return extensionLength >= 8 && rawPacketHasBytes(bytes, offset, extensionLength) ? extensionLength : null;
  }
  return null;
}

export function formatPacketMac(bytes: number[], offset: number) {
  return bytes
    .slice(offset, offset + 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(":");
}

function parsePacketMac(value: string) {
  const compact = value.trim().replace(/[-.]/g, ":");
  const parts = compact.includes(":") ? compact.split(":") : compact.match(/.{1,2}/g) ?? [];
  if (parts.length !== 6 || parts.some((part) => !/^[0-9a-fA-F]{2}$/.test(part))) {
    return null;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

export function formatPacketIpv4(bytes: number[], offset: number) {
  return bytes.slice(offset, offset + 4).join(".");
}

function parsePacketIpv4(value: string) {
  const parts = value.trim().split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return Number.NaN;
    }
    return Number(part);
  });
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }
  return bytes;
}

export function formatPacketIpv6(bytes: number[], offset: number) {
  const groups: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(rawPacketWord(bytes, offset + index).toString(16).padStart(4, "0"));
  }
  return groups.join(":");
}

function parsePacketIpv6(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes(":")) {
    return null;
  }
  let groups: string[];
  if (trimmed.includes("::")) {
    const parts = trimmed.split("::");
    if (parts.length !== 2) {
      return null;
    }
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    if ([...left, ...right].some((group) => group.length === 0)) {
      return null;
    }
    const missing = 8 - left.length - right.length;
    if (missing < 1) {
      return null;
    }
    groups = [...left, ...new Array<string>(missing).fill("0"), ...right];
  } else {
    groups = trimmed.split(":");
  }
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return null;
  }
  return groups.flatMap((group) => {
    const word = Number.parseInt(group, 16);
    return [(word >> 8) & 0xff, word & 0xff];
  });
}

export function formatPacketHexField(bytes: number[], offset: number, length: number) {
  return bytes
    .slice(offset, offset + length)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parsePacketHexField(value: string, length: number) {
  const compact = value.trim().replace(/0x/gi, "").replace(/[\s,:;|_-]/g, "");
  if (compact.length !== length * 2 || /[^0-9a-fA-F]/.test(compact)) {
    return null;
  }
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 2) {
    bytes.push(Number.parseInt(compact.slice(index, index + 2), 16));
  }
  return bytes;
}

export function rawPacketNumberValue(bytes: number[], offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value * 256) + (bytes[offset + index] ?? 0);
  }
  return value;
}

export function formatPacketNumberField(bytes: number[], offset: number, length: number) {
  const value = rawPacketNumberValue(bytes, offset, length);
  return String(value);
}

function packetNumberToBytes(value: number, length: number) {
  const bytes = new Array<number>(length).fill(0);
  let remaining = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  return bytes;
}

function parsePacketNumberField(value: string, length: number) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  const max = (256 ** length) - 1;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return packetNumberToBytes(parsed, length);
}

function rawPacketMaskedMax(row: RawPacketFieldRow) {
  if (row.mask === undefined) {
    return null;
  }
  return (row.mask >>> (row.shift ?? 0)) >>> 0;
}

export function formatPacketMaskedNumberField(bytes: number[], offset: number, length: number, mask: number, shift: number) {
  const rawValue = rawPacketNumberValue(bytes, offset, length) >>> 0;
  return String(((rawValue & mask) >>> shift) >>> 0);
}

function parsePacketMaskedNumberField(row: RawPacketFieldRow, value: string, currentBytes: number[]) {
  if (row.mask === undefined || row.format !== "number" || !rawPacketHasBytes(currentBytes, row.offset, row.length)) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  const shift = row.shift ?? 0;
  const mask = row.mask >>> 0;
  const max = rawPacketMaskedMax(row);
  if (max === null || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  const current = rawPacketNumberValue(currentBytes, row.offset, row.length) >>> 0;
  const next = ((current & (~mask >>> 0)) | ((parsed << shift) & mask)) >>> 0;
  return packetNumberToBytes(next, row.length);
}

export function parseRawPacketFieldValue(row: RawPacketFieldRow, value: string, currentBytes: number[] = []) {
  if (row.mask !== undefined) {
    return parsePacketMaskedNumberField(row, value, currentBytes);
  }
  switch (row.format) {
    case "mac":
      return parsePacketMac(value);
    case "ipv4":
      return parsePacketIpv4(value);
    case "ipv6":
      return parsePacketIpv6(value);
    case "number":
      return parsePacketNumberField(value, row.length);
    case "hex":
      return parsePacketHexField(value, row.length);
  }
}

export function rawPacketFieldError(row: RawPacketFieldRow, value: string, currentBytes: number[] = []) {
  if (parseRawPacketFieldValue(row, value, currentBytes)) {
    return null;
  }
  if (row.format === "mac") {
    return "Expected MAC address, for example aa:bb:cc:dd:ee:ff.";
  }
  if (row.format === "ipv4") {
    return "Expected IPv4 address, for example 16.0.0.1.";
  }
  if (row.format === "ipv6") {
    return "Expected IPv6 address, for example 2001:db8::1.";
  }
  if (row.format === "number") {
    return `Expected decimal 0-${rawPacketMaskedMax(row) ?? (256 ** row.length) - 1}.`;
  }
  return `Expected ${row.length * 2} hex characters.`;
}

export function applyRawPacketFieldEdit(
  rawPacketDraft: string,
  row: RawPacketFieldRow,
  value: string
): RawPacketFieldApplyResult {
  const bytes = rawPacketBytesFromHex(rawPacketDraft);
  if (!bytes || !rawPacketHasBytes(bytes, row.offset, row.length)) {
    return {
      errorText: "Raw packet bytes are not valid for this field.",
      ok: false
    };
  }
  const fieldBytes = parseRawPacketFieldValue(row, value, bytes);
  if (!fieldBytes) {
    return {
      errorText: rawPacketFieldError(row, value, bytes) ?? "Invalid field value.",
      ok: false
    };
  }
  const patchedBytes = [...bytes];
  for (let index = 0; index < fieldBytes.length; index += 1) {
    patchedBytes[row.offset + index] = fieldBytes[index];
  }
  return {
    nextHex: formatRawPacketHex(repairRawPacketChecksums(patchedBytes)),
    ok: true,
    statusText: `${row.layer} ${row.field} updated at byte ${row.offset}. Apply raw to save this packet.`
  };
}

export function rawPacketTcpHeaderOffset(bytes: number[], tcpOffset: number, limit?: number) {
  if (!rawPacketHasBytes(bytes, tcpOffset, 20)) {
    return null;
  }
  const headerLength = ((bytes[tcpOffset + 12] ?? 0) >>> 4) * 4;
  if (headerLength < 20 || headerLength > 60 || !rawPacketHasBytes(bytes, tcpOffset, headerLength)) {
    return null;
  }
  if (limit !== undefined && tcpOffset + headerLength > limit) {
    return null;
  }
  return tcpOffset;
}

export function rawPacketOnesComplementClosure(bytes: number[], offset: number, length: number) {
  let sum = 0;
  for (let cursor = offset; cursor < offset + length; cursor += 2) {
    const high = bytes[cursor] ?? 0;
    const low = cursor + 1 < offset + length ? bytes[cursor + 1] ?? 0 : 0;
    sum += (high << 8) + low;
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = (sum & 0xffff) + (sum >>> 16);
  return sum & 0xffff;
}

function rawIpv4HeaderLengthAt(bytes: number[], offset: number) {
  if (!rawPacketHasBytes(bytes, offset, 20) || ((bytes[offset] ?? 0) >>> 4) !== 4) {
    return null;
  }
  const headerLength = ((bytes[offset] ?? 0) & 0x0f) * 4;
  if (headerLength < 20 || headerLength > 60 || !rawPacketHasBytes(bytes, offset, headerLength)) {
    return null;
  }
  return headerLength;
}

function rawPacketEthernetL3Target(bytes: number[], ethernetOffset: number) {
  if (!rawPacketHasBytes(bytes, ethernetOffset, 14)) {
    return null;
  }
  let etherType = rawPacketWord(bytes, ethernetOffset + 12);
  let l3Offset = ethernetOffset + 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, l3Offset, 4)
    && vlanIndex < 4
  ) {
    etherType = rawPacketWord(bytes, l3Offset + 2);
    l3Offset += 4;
    vlanIndex += 1;
  }
  if ((etherType === 0x8847 || etherType === 0x8848) && rawPacketHasBytes(bytes, l3Offset, 4)) {
    let mplsIndex = 0;
    while (rawPacketHasBytes(bytes, l3Offset, 4) && mplsIndex < 8) {
      const bottomOfStack = (bytes[l3Offset + 2] & 0x01) === 1;
      l3Offset += 4;
      mplsIndex += 1;
      if (bottomOfStack) {
        break;
      }
    }
    const version = (bytes[l3Offset] ?? 0) >>> 4;
    if (version === 4) {
      etherType = 0x0800;
    } else if (version === 6) {
      etherType = 0x86dd;
    }
  }
  return { etherType, l3Offset };
}

function rawIpv4PacketEnd(bytes: number[], ipv4Offset: number, headerLength: number) {
  const totalLength = rawPacketWord(bytes, ipv4Offset + 2);
  if (totalLength >= headerLength && rawPacketHasBytes(bytes, ipv4Offset, totalLength)) {
    return ipv4Offset + totalLength;
  }
  return bytes.length;
}

function rawIpv6PacketEnd(bytes: number[], ipv6Offset: number) {
  if (!rawPacketHasBytes(bytes, ipv6Offset, 40)) {
    return bytes.length;
  }
  const payloadLength = rawPacketWord(bytes, ipv6Offset + 4);
  if (payloadLength > 0 && rawPacketHasBytes(bytes, ipv6Offset, 40 + payloadLength)) {
    return ipv6Offset + 40 + payloadLength;
  }
  return bytes.length;
}

function rawPacketUdpTarget(bytes: number[], udpOffset: number, limit = bytes.length) {
  if (!rawPacketHasBytes(bytes, udpOffset, 8) || udpOffset + 8 > limit) {
    return null;
  }
  const length = rawPacketWord(bytes, udpOffset + 4);
  const end = length === 0 ? limit : udpOffset + length;
  if (end > limit || end > bytes.length || end < udpOffset + 8) {
    return null;
  }
  return {
    destinationPort: rawPacketWord(bytes, udpOffset + 2),
    end,
    payloadOffset: udpOffset + 8,
    sourcePort: rawPacketWord(bytes, udpOffset)
  };
}

function rawPacketIpv6L4Offset(bytes: number[], ipv6Offset: number, protocol: number) {
  if (!rawPacketHasBytes(bytes, ipv6Offset, 40) || ((bytes[ipv6Offset] ?? 0) >>> 4) !== 6) {
    return null;
  }
  let nextHeader = bytes[ipv6Offset + 6] ?? 59;
  let offset = ipv6Offset + 40;
  const limit = rawIpv6PacketEnd(bytes, ipv6Offset);
  for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
    if (nextHeader === protocol) {
      return rawPacketHasBytes(bytes, offset, 1) && offset < limit ? { limit, offset } : null;
    }
    const extensionLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, offset);
    if (extensionLength === null || offset + extensionLength > limit) {
      return null;
    }
    nextHeader = bytes[offset] ?? 59;
    offset += extensionLength;
  }
  return null;
}

function rawPacketGrePayloadTarget(bytes: number[], greOffset: number) {
  if (!rawPacketHasBytes(bytes, greOffset, 4)) {
    return null;
  }
  const flags = rawPacketWord(bytes, greOffset);
  const routingPresent = (flags & 0x4000) !== 0;
  const version = flags & 0x0007;
  if (routingPresent || version !== 0) {
    return null;
  }
  let payloadOffset = greOffset + 4;
  if ((flags & 0x8000) !== 0) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }
  if ((flags & 0x2000) !== 0) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }
  if ((flags & 0x1000) !== 0) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4)) {
      return null;
    }
    payloadOffset += 4;
  }
  return {
    payloadOffset,
    protocolType: rawPacketWord(bytes, greOffset + 2)
  };
}

function rawPacketGtpuPayloadOffset(bytes: number[], gtpuOffset: number, limit: number) {
  if (!rawPacketHasBytes(bytes, gtpuOffset, 8) || gtpuOffset + 8 > limit) {
    return null;
  }
  const flags = bytes[gtpuOffset] ?? 0;
  if ((flags >>> 5) !== 1 || (flags & 0x10) === 0) {
    return null;
  }
  const messageLength = rawPacketWord(bytes, gtpuOffset + 2);
  const messageEnd = messageLength === 0 ? limit : gtpuOffset + 8 + messageLength;
  if (messageEnd > limit || messageEnd > bytes.length) {
    return null;
  }
  let payloadOffset = gtpuOffset + 8;
  let nextExtensionHeader = 0;
  if ((flags & 0x07) !== 0) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 4) || payloadOffset + 4 > messageEnd) {
      return null;
    }
    nextExtensionHeader = bytes[payloadOffset + 3] ?? 0;
    payloadOffset += 4;
  }
  for (let extensionIndex = 0; nextExtensionHeader !== 0 && extensionIndex < 8; extensionIndex += 1) {
    if (!rawPacketHasBytes(bytes, payloadOffset, 1) || payloadOffset + 1 > messageEnd) {
      return null;
    }
    const extensionByteLength = (bytes[payloadOffset] ?? 0) * 4;
    if (
      extensionByteLength < 4
      || !rawPacketHasBytes(bytes, payloadOffset, extensionByteLength)
      || payloadOffset + extensionByteLength > messageEnd
    ) {
      return null;
    }
    nextExtensionHeader = bytes[payloadOffset + extensionByteLength - 1] ?? 0;
    payloadOffset += extensionByteLength;
  }
  return payloadOffset < messageEnd ? payloadOffset : null;
}

function collectRawPacketIpv4HeaderOffsets(bytes: number[]) {
  const offsets = new Set<number>();
  const addIpv4Offset = (offset: number) => {
    const headerLength = rawIpv4HeaderLengthAt(bytes, offset);
    if (headerLength === null) {
      return null;
    }
    offsets.add(offset);
    return {
      headerLength,
      offset,
      protocol: bytes[offset + 9] ?? 0
    };
  };
  const processGre = (greOffset: number) => {
    const gre = rawPacketGrePayloadTarget(bytes, greOffset);
    if (gre?.protocolType === 0x0800) {
      addIpv4Offset(gre.payloadOffset);
    }
  };
  const processUdpTunnels = (udpOffset: number, limit: number) => {
    const udp = rawPacketUdpTarget(bytes, udpOffset, limit);
    if (!udp) {
      return;
    }
    if (udp.sourcePort === 4789 || udp.destinationPort === 4789 || udp.sourcePort === 8472 || udp.destinationPort === 8472) {
      const innerL3 = rawPacketEthernetL3Target(bytes, udp.payloadOffset + 8);
      if (innerL3?.etherType === 0x0800) {
        addIpv4Offset(innerL3.l3Offset);
      }
    }
    if (udp.sourcePort === 2152 || udp.destinationPort === 2152) {
      const gtpuPayloadOffset = rawPacketGtpuPayloadOffset(bytes, udp.payloadOffset, udp.end);
      if (gtpuPayloadOffset !== null) {
        addIpv4Offset(gtpuPayloadOffset);
      }
    }
  };

  const outer = rawPacketEthernetL3Target(bytes, 0);
  if (!outer) {
    return [...offsets];
  }
  if (outer.etherType === 0x0800) {
    const ipv4 = addIpv4Offset(outer.l3Offset);
    if (!ipv4) {
      return [...offsets];
    }
    const packetEnd = rawIpv4PacketEnd(bytes, ipv4.offset, ipv4.headerLength);
    if (ipv4.protocol === 47) {
      processGre(ipv4.offset + ipv4.headerLength);
    } else if (ipv4.protocol === 17) {
      processUdpTunnels(ipv4.offset + ipv4.headerLength, packetEnd);
    }
  }
  if (outer.etherType === 0x86dd && rawPacketHasBytes(bytes, outer.l3Offset, 40)) {
    const greTarget = rawPacketIpv6L4Offset(bytes, outer.l3Offset, 47);
    if (greTarget) {
      processGre(greTarget.offset);
    }
    const udpTarget = rawPacketIpv6L4Offset(bytes, outer.l3Offset, 17);
    if (udpTarget) {
      processUdpTunnels(udpTarget.offset, udpTarget.limit);
    }
  }
  return [...offsets];
}

type RawPacketTransportChecksumTarget = {
  checksumOffset: number;
  ipOffset: number;
  ipVersion: 4 | 6;
  l4Offset: number;
  length: number;
  protocol: 6 | 17;
};

type RawPacketIcmpChecksumTarget = {
  checksumOffset: number;
  icmpOffset: number;
  ipOffset: number;
  ipVersion: 4 | 6;
  length: number;
};

type RawPacketSctpChecksumTarget = {
  checksumOffset: number;
  length: number;
  sctpOffset: number;
};

type RawPacketGreChecksumTarget = {
  checksumOffset: number;
  greOffset: number;
  length: number;
};

function rawPacketIpv4IsFragmented(bytes: number[], ipv4Offset: number) {
  return (rawPacketWord(bytes, ipv4Offset + 6) & 0x3fff) !== 0;
}

export function collectRawPacketIcmpChecksumTargets(bytes: number[]) {
  const targets = new Map<string, RawPacketIcmpChecksumTarget>();
  const addIcmpTarget = (ipVersion: 4 | 6, ipOffset: number, icmpOffset: number, limit: number) => {
    if (limit > bytes.length || icmpOffset + 4 > limit || !rawPacketHasBytes(bytes, icmpOffset, 4)) {
      return;
    }
    targets.set(`${ipVersion}:${icmpOffset}`, {
      checksumOffset: icmpOffset + 2,
      icmpOffset,
      ipOffset,
      ipVersion,
      length: limit - icmpOffset
    });
  };
  const processGre = (greOffset: number) => {
    const gre = rawPacketGrePayloadTarget(bytes, greOffset);
    if (!gre) {
      return;
    }
    if (gre.protocolType === 0x0800) {
      processIpv4(gre.payloadOffset);
    } else if (gre.protocolType === 0x86dd) {
      processIpv6(gre.payloadOffset);
    }
  };
  const processUdpTunnels = (udpOffset: number, limit: number) => {
    const udp = rawPacketUdpTarget(bytes, udpOffset, limit);
    if (!udp) {
      return;
    }
    if (udp.sourcePort === 4789 || udp.destinationPort === 4789 || udp.sourcePort === 8472 || udp.destinationPort === 8472) {
      const innerL3 = rawPacketEthernetL3Target(bytes, udp.payloadOffset + 8);
      if (innerL3?.etherType === 0x0800) {
        processIpv4(innerL3.l3Offset);
      } else if (innerL3?.etherType === 0x86dd) {
        processIpv6(innerL3.l3Offset);
      }
    }
    if (udp.sourcePort === 2152 || udp.destinationPort === 2152) {
      const gtpuPayloadOffset = rawPacketGtpuPayloadOffset(bytes, udp.payloadOffset, udp.end);
      if (gtpuPayloadOffset !== null) {
        const version = (bytes[gtpuPayloadOffset] ?? 0) >>> 4;
        if (version === 4) {
          processIpv4(gtpuPayloadOffset);
        } else if (version === 6) {
          processIpv6(gtpuPayloadOffset);
        }
      }
    }
  };
  const processIpv4 = (ipv4Offset: number) => {
    const headerLength = rawIpv4HeaderLengthAt(bytes, ipv4Offset);
    if (headerLength === null || rawPacketIpv4IsFragmented(bytes, ipv4Offset)) {
      return;
    }
    const totalLength = rawPacketWord(bytes, ipv4Offset + 2);
    if (totalLength < headerLength || !rawPacketHasBytes(bytes, ipv4Offset, totalLength)) {
      return;
    }
    const protocol = bytes[ipv4Offset + 9] ?? 0;
    const limit = ipv4Offset + totalLength;
    const l4Offset = ipv4Offset + headerLength;
    if (protocol === 1) {
      addIcmpTarget(4, ipv4Offset, l4Offset, limit);
    }
    if (protocol === 47) {
      processGre(l4Offset);
    } else if (protocol === 17) {
      processUdpTunnels(l4Offset, limit);
    }
  };
  const processIpv6 = (ipv6Offset: number) => {
    if (!rawPacketHasBytes(bytes, ipv6Offset, 40) || ((bytes[ipv6Offset] ?? 0) >>> 4) !== 6) {
      return;
    }
    const icmpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 58);
    if (icmpTarget) {
      addIcmpTarget(6, ipv6Offset, icmpTarget.offset, icmpTarget.limit);
    }
    const udpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 17);
    if (udpTarget) {
      processUdpTunnels(udpTarget.offset, udpTarget.limit);
    }
    const greTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 47);
    if (greTarget) {
      processGre(greTarget.offset);
    }
  };

  const outer = rawPacketEthernetL3Target(bytes, 0);
  if (outer?.etherType === 0x0800) {
    processIpv4(outer.l3Offset);
  } else if (outer?.etherType === 0x86dd) {
    processIpv6(outer.l3Offset);
  }
  return [...targets.values()];
}

export function icmpv6RawTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterIpv6L4Target(stream, 58);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 4)) {
    return null;
  }
  return target;
}

export function icmpv6EchoRawTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 8)) {
    return null;
  }
  const type = target.bytes[target.offset] ?? 0;
  if (type !== 128 && type !== 129) {
    return null;
  }
  return {
    ...target,
    code: target.bytes[target.offset + 1] ?? 0,
    codeOffset: target.offset + 1,
    identifier: rawPacketWord(target.bytes, target.offset + 4),
    identifierOffset: target.offset + 4,
    sequence: rawPacketWord(target.bytes, target.offset + 6),
    sequenceOffset: target.offset + 6,
    type,
    typeOffset: target.offset
  };
}

export function icmpv4EchoRawTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const bytes = rawPacketBytesFromBase64(stream?.packet_binary_base64);
  for (const target of collectRawPacketIcmpChecksumTargets(bytes)) {
    if (target.ipVersion !== 4 || target.length < 8 || !rawPacketHasBytes(bytes, target.icmpOffset, 8)) {
      continue;
    }
    const type = bytes[target.icmpOffset] ?? 0;
    if (type !== 0 && type !== 8) {
      continue;
    }
    if (rawPacketOnesComplementClosure(bytes, target.icmpOffset, target.length) !== 0xffff) {
      continue;
    }
    return {
      checksum: rawPacketWord(bytes, target.checksumOffset),
      checksumOffset: target.checksumOffset,
      code: bytes[target.icmpOffset + 1] ?? 0,
      codeOffset: target.icmpOffset + 1,
      identifier: rawPacketWord(bytes, target.icmpOffset + 4),
      identifierOffset: target.icmpOffset + 4,
      offset: target.icmpOffset,
      sequence: rawPacketWord(bytes, target.icmpOffset + 6),
      sequenceOffset: target.icmpOffset + 6,
      type,
      typeOffset: target.icmpOffset
    };
  }
  return null;
}

export function icmpv6NdTargetAddressTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 24)) {
    return null;
  }
  const type = target.bytes[target.offset] ?? 0;
  if (type !== 135 && type !== 136) {
    return null;
  }
  return {
    address: formatPacketIpv6(target.bytes, target.offset + 8),
    l3Offset: target.l3Offset,
    valueOffset: target.offset + 8
  };
}

export function icmpv6RaFixedTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 16)) {
    return null;
  }
  const type = target.bytes[target.offset] ?? 0;
  if (type !== 134) {
    return null;
  }
  const flags = target.bytes[target.offset + 5] ?? 0;
  return {
    currentHopLimit: rawPacketNumberValue(target.bytes, target.offset + 4, 1),
    currentHopLimitOffset: target.offset + 4,
    flagsOffset: target.offset + 5,
    l3Offset: target.l3Offset,
    managedFlag: (flags & 0x80) >>> 7,
    otherFlag: (flags & 0x40) >>> 6,
    reachableTime: rawPacketNumberValue(target.bytes, target.offset + 8, 4),
    reachableTimeOffset: target.offset + 8,
    retransTimer: rawPacketNumberValue(target.bytes, target.offset + 12, 4),
    retransTimerOffset: target.offset + 12,
    routerLifetime: rawPacketNumberValue(target.bytes, target.offset + 6, 2),
    routerLifetimeOffset: target.offset + 6
  };
}

export function icmpv6RaPrefixInfoTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 16) || (target.bytes[target.offset] ?? 0) !== 134) {
    return null;
  }
  let optionOffset = target.offset + 16;
  for (let optionIndex = 0; optionIndex < 8 && rawPacketHasBytes(target.bytes, optionOffset, 2); optionIndex += 1) {
    const optionType = target.bytes[optionOffset] ?? 0;
    const optionLength = (target.bytes[optionOffset + 1] ?? 0) * 8;
    if (optionLength < 2 || !rawPacketHasBytes(target.bytes, optionOffset, optionLength)) {
      return null;
    }
    if (optionType === 3 && optionLength >= 32) {
      const flags = target.bytes[optionOffset + 3] ?? 0;
      return {
        autonomousFlag: (flags & 0x40) >>> 6,
        flagsOffset: optionOffset + 3,
        l3Offset: target.l3Offset,
        onLinkFlag: (flags & 0x80) >>> 7,
        prefix: formatPacketIpv6(target.bytes, optionOffset + 16),
        prefixLength: target.bytes[optionOffset + 2] ?? 0,
        prefixLengthOffset: optionOffset + 2,
        prefixOffset: optionOffset + 16,
        preferredLifetime: rawPacketNumberValue(target.bytes, optionOffset + 8, 4),
        preferredLifetimeOffset: optionOffset + 8,
        validLifetime: rawPacketNumberValue(target.bytes, optionOffset + 4, 4),
        validLifetimeOffset: optionOffset + 4
      };
    }
    optionOffset += optionLength;
  }
  return null;
}

export function icmpv6NaFlagsTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 24) || (target.bytes[target.offset] ?? 0) !== 136) {
    return null;
  }
  const flags = rawPacketNumberValue(target.bytes, target.offset + 4, 4);
  return {
    flagsOffset: target.offset + 4,
    l3Offset: target.l3Offset,
    overrideFlag: (flags & 0x20000000) >>> 29,
    routerFlag: (flags & 0x80000000) >>> 31,
    solicitedFlag: (flags & 0x40000000) >>> 30
  };
}

function icmpv6OptionOffset(type: number, icmpv6Offset: number) {
  if (type === 135 || type === 136) {
    return icmpv6Offset + 24;
  }
  if (type === 133) {
    return icmpv6Offset + 8;
  }
  if (type === 134) {
    return icmpv6Offset + 16;
  }
  return null;
}

export function icmpv6LinkLayerOptionMacTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = icmpv6RawTarget(stream);
  if (!target) {
    return null;
  }
  const type = target.bytes[target.offset] ?? 0;
  const optionStartOffset = icmpv6OptionOffset(type, target.offset);
  if (optionStartOffset === null) {
    return null;
  }
  let optionOffset = optionStartOffset;
  for (let optionIndex = 0; optionIndex < 8 && rawPacketHasBytes(target.bytes, optionOffset, 2); optionIndex += 1) {
    const optionType = target.bytes[optionOffset] ?? 0;
    const optionLength = (target.bytes[optionOffset + 1] ?? 0) * 8;
    if (optionLength < 2 || !rawPacketHasBytes(target.bytes, optionOffset, optionLength)) {
      return null;
    }
    if ((optionType === 1 || optionType === 2) && optionLength >= 8) {
      return {
        l3Offset: target.l3Offset,
        mac: formatPacketMac(target.bytes, optionOffset + 2),
        optionType,
        valueOffset: optionOffset + 2
      };
    }
    optionOffset += optionLength;
  }
  return null;
}

export function rawDnsQueryTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterTransportTarget(stream, 17, 11, 8);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 20)) {
    return null;
  }
  const sourcePort = rawPacketWord(target.bytes, target.offset);
  const destinationPort = rawPacketWord(target.bytes, target.offset + 2);
  if (sourcePort !== 53 && destinationPort !== 53) {
    return null;
  }
  const udpLength = rawPacketWord(target.bytes, target.offset + 4);
  if (udpLength !== 0 && udpLength < 20) {
    return null;
  }
  const payloadOffset = target.offset + 8;
  if (!rawPacketHasBytes(target.bytes, payloadOffset, 12)) {
    return null;
  }
  const questionCount = rawPacketWord(target.bytes, payloadOffset + 4);
  if (questionCount < 1) {
    return null;
  }
  const queryNameOffset = payloadOffset + 12;
  const queryNameEnd = rawDnsNameEnd(target.bytes, queryNameOffset);
  if (queryNameEnd === null || !rawPacketHasBytes(target.bytes, queryNameEnd, 4)) {
    return null;
  }
  if (udpLength !== 0 && queryNameEnd + 4 > target.offset + udpLength) {
    return null;
  }
  return {
    additionalCount: rawPacketWord(target.bytes, payloadOffset + 10),
    additionalCountOffset: payloadOffset + 10,
    answerCount: rawPacketWord(target.bytes, payloadOffset + 6),
    answerCountOffset: payloadOffset + 6,
    authorityCount: rawPacketWord(target.bytes, payloadOffset + 8),
    authorityCountOffset: payloadOffset + 8,
    bytes: target.bytes,
    checksumInstruction: target.checksumInstruction,
    flags: rawPacketWord(target.bytes, payloadOffset + 2),
    flagsOffset: payloadOffset + 2,
    payloadOffset,
    questionCount,
    questionCountOffset: payloadOffset + 4,
    queryClass: rawPacketWord(target.bytes, queryNameEnd + 2),
    queryClassOffset: queryNameEnd + 2,
    queryNameFirstByte: target.bytes[queryNameOffset + 1] ?? 0,
    queryNameFirstByteOffset: (target.bytes[queryNameOffset] ?? 0) > 0 && rawPacketHasBytes(target.bytes, queryNameOffset + 1, 1)
      ? queryNameOffset + 1
      : null,
    queryNameLength: queryNameEnd - queryNameOffset,
    queryType: rawPacketWord(target.bytes, queryNameEnd),
    queryTypeOffset: queryNameEnd,
    transactionId: rawPacketWord(target.bytes, payloadOffset),
    transactionIdOffset: payloadOffset,
    udpOffset: target.offset
  };
}

export function rawDnsAnswerTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const queryTarget = rawDnsQueryTarget(stream);
  if (!queryTarget) {
    return null;
  }
  const answerCount = rawPacketWord(queryTarget.bytes, queryTarget.payloadOffset + 6);
  if (answerCount < 1) {
    return null;
  }
  const udpLength = rawPacketWord(queryTarget.bytes, queryTarget.udpOffset + 4);
  const udpEnd = udpLength === 0 ? queryTarget.bytes.length : queryTarget.udpOffset + udpLength;
  let cursor = queryTarget.payloadOffset + 12;
  const questionCount = rawPacketWord(queryTarget.bytes, queryTarget.payloadOffset + 4);
  for (let questionIndex = 0; questionIndex < Math.min(questionCount, 8); questionIndex += 1) {
    const nameEnd = rawDnsNameEnd(queryTarget.bytes, cursor);
    if (nameEnd === null || !rawPacketHasBytes(queryTarget.bytes, nameEnd, 4)) {
      return null;
    }
    cursor = nameEnd + 4;
    if (cursor > udpEnd) {
      return null;
    }
  }
  const answerNameEnd = rawDnsNameEnd(queryTarget.bytes, cursor, true);
  if (answerNameEnd === null || !rawPacketHasBytes(queryTarget.bytes, answerNameEnd, 10)) {
    return null;
  }
  const answerLength = rawPacketWord(queryTarget.bytes, answerNameEnd + 8);
  const answerRdataOffset = answerNameEnd + 10;
  if (!rawPacketHasBytes(queryTarget.bytes, answerRdataOffset, answerLength) || answerRdataOffset + answerLength > udpEnd) {
    return null;
  }
  return {
    answerClass: rawPacketWord(queryTarget.bytes, answerNameEnd + 2),
    answerClassOffset: answerNameEnd + 2,
    answerIpv4: rawPacketWord(queryTarget.bytes, answerNameEnd) === 1 && answerLength === 4
      ? formatPacketIpv4(queryTarget.bytes, answerRdataOffset)
      : null,
    answerIpv4Offset: rawPacketWord(queryTarget.bytes, answerNameEnd) === 1 && answerLength === 4 ? answerRdataOffset : null,
    answerLength,
    answerTtl: rawPacketNumberValue(queryTarget.bytes, answerNameEnd + 4, 4),
    answerTtlOffset: answerNameEnd + 4,
    answerType: rawPacketWord(queryTarget.bytes, answerNameEnd),
    answerTypeOffset: answerNameEnd,
    checksumInstruction: queryTarget.checksumInstruction
  };
}

type RawDhcpOptionTarget = {
  length: number;
  offset: number;
};

export function rawDhcpTarget(stream: ProfileWorkbenchStream | null | undefined) {
  const target = rawOuterTransportTarget(stream, 17, 11, 8);
  if (!target || !rawPacketHasBytes(target.bytes, target.offset, 8)) {
    return null;
  }
  const sourcePort = rawPacketWord(target.bytes, target.offset);
  const destinationPort = rawPacketWord(target.bytes, target.offset + 2);
  if (!((sourcePort === 67 && destinationPort === 68) || (sourcePort === 68 && destinationPort === 67))) {
    return null;
  }
  const payloadOffset = target.offset + 8;
  if (!rawPacketHasBytes(target.bytes, payloadOffset, 240)) {
    return null;
  }
  const hardwareLength = target.bytes[payloadOffset + 2] ?? 0;
  if (hardwareLength < 6 || formatPacketHexField(target.bytes, payloadOffset + 236, 4) !== "63825363") {
    return null;
  }
  const udpLength = rawPacketWord(target.bytes, target.offset + 4);
  const udpEnd = udpLength === 0 ? target.bytes.length : target.offset + udpLength;
  if (payloadOffset + 240 > udpEnd) {
    return null;
  }
  const options = new Map<number, RawDhcpOptionTarget>();
  let optionOffset = payloadOffset + 240;
  for (let optionIndex = 0; optionIndex < 64 && rawPacketHasBytes(target.bytes, optionOffset, 1); optionIndex += 1) {
    if (optionOffset >= udpEnd) {
      break;
    }
    const optionCode = target.bytes[optionOffset] ?? 0;
    if (optionCode === 255) {
      break;
    }
    if (optionCode === 0) {
      optionOffset += 1;
      continue;
    }
    if (!rawPacketHasBytes(target.bytes, optionOffset, 2)) {
      break;
    }
    const optionLength = target.bytes[optionOffset + 1] ?? 0;
    const dataOffset = optionOffset + 2;
    if (!rawPacketHasBytes(target.bytes, dataOffset, optionLength) || dataOffset + optionLength > udpEnd) {
      break;
    }
    if (!options.has(optionCode)) {
      options.set(optionCode, { length: optionLength, offset: dataOffset });
    }
    optionOffset = dataOffset + optionLength;
  }
  const optionValue = (code: 50 | 51 | 53 | 54 | 58 | 59, length: number) => {
    const option = options.get(code);
    return option && option.length === length ? option : null;
  };
  const variableOption = (code: 12 | 55 | 61) => {
    const option = options.get(code);
    return option && option.length > 0 ? option : null;
  };
  return {
    bytes: target.bytes,
    checksumInstruction: target.checksumInstruction,
    clientIp: formatPacketIpv4(target.bytes, payloadOffset + 12),
    clientIpOffset: payloadOffset + 12,
    clientMac: formatPacketMac(target.bytes, payloadOffset + 28),
    clientMacOffset: payloadOffset + 28,
    flags: rawPacketWord(target.bytes, payloadOffset + 10),
    flagsOffset: payloadOffset + 10,
    clientIdentifierOption: variableOption(61),
    hostnameOption: variableOption(12),
    hops: target.bytes[payloadOffset + 3] ?? 0,
    hopsOffset: payloadOffset + 3,
    leaseTimeOption: optionValue(51, 4),
    messageTypeOption: optionValue(53, 1),
    operation: target.bytes[payloadOffset] ?? 0,
    operationOffset: payloadOffset,
    payloadOffset,
    parameterRequestOption: variableOption(55),
    rebindingTimeOption: optionValue(59, 4),
    relayIp: formatPacketIpv4(target.bytes, payloadOffset + 24),
    relayIpOffset: payloadOffset + 24,
    renewalTimeOption: optionValue(58, 4),
    requestedIpOption: optionValue(50, 4),
    seconds: rawPacketWord(target.bytes, payloadOffset + 8),
    secondsOffset: payloadOffset + 8,
    serverIdOption: optionValue(54, 4),
    serverIp: formatPacketIpv4(target.bytes, payloadOffset + 20),
    serverIpOffset: payloadOffset + 20,
    xid: rawPacketNumberValue(target.bytes, payloadOffset + 4, 4),
    xidOffset: payloadOffset + 4,
    yourIp: formatPacketIpv4(target.bytes, payloadOffset + 16),
    yourIpOffset: payloadOffset + 16
  };
}

function collectRawPacketSctpChecksumTargets(bytes: number[]) {
  const targets = new Map<number, RawPacketSctpChecksumTarget>();
  const addSctpTarget = (sctpOffset: number, limit: number) => {
    if (limit > bytes.length || sctpOffset + 12 > limit || !rawPacketHasBytes(bytes, sctpOffset, 12)) {
      return;
    }
    targets.set(sctpOffset, {
      checksumOffset: sctpOffset + 8,
      length: limit - sctpOffset,
      sctpOffset
    });
  };
  const processGre = (greOffset: number) => {
    const gre = rawPacketGrePayloadTarget(bytes, greOffset);
    if (!gre) {
      return;
    }
    if (gre.protocolType === 0x0800) {
      processIpv4(gre.payloadOffset);
    } else if (gre.protocolType === 0x86dd) {
      processIpv6(gre.payloadOffset);
    }
  };
  const processUdpTunnels = (udpOffset: number, limit: number) => {
    const udp = rawPacketUdpTarget(bytes, udpOffset, limit);
    if (!udp) {
      return;
    }
    if (udp.sourcePort === 4789 || udp.destinationPort === 4789 || udp.sourcePort === 8472 || udp.destinationPort === 8472) {
      const innerL3 = rawPacketEthernetL3Target(bytes, udp.payloadOffset + 8);
      if (innerL3?.etherType === 0x0800) {
        processIpv4(innerL3.l3Offset);
      } else if (innerL3?.etherType === 0x86dd) {
        processIpv6(innerL3.l3Offset);
      }
    }
    if (udp.sourcePort === 2152 || udp.destinationPort === 2152) {
      const gtpuPayloadOffset = rawPacketGtpuPayloadOffset(bytes, udp.payloadOffset, udp.end);
      if (gtpuPayloadOffset !== null) {
        const version = (bytes[gtpuPayloadOffset] ?? 0) >>> 4;
        if (version === 4) {
          processIpv4(gtpuPayloadOffset);
        } else if (version === 6) {
          processIpv6(gtpuPayloadOffset);
        }
      }
    }
  };
  const processIpv4 = (ipv4Offset: number) => {
    const headerLength = rawIpv4HeaderLengthAt(bytes, ipv4Offset);
    if (headerLength === null || rawPacketIpv4IsFragmented(bytes, ipv4Offset)) {
      return;
    }
    const totalLength = rawPacketWord(bytes, ipv4Offset + 2);
    if (totalLength < headerLength || !rawPacketHasBytes(bytes, ipv4Offset, totalLength)) {
      return;
    }
    const protocol = bytes[ipv4Offset + 9] ?? 0;
    const limit = ipv4Offset + totalLength;
    const l4Offset = ipv4Offset + headerLength;
    if (protocol === 132) {
      addSctpTarget(l4Offset, limit);
    }
    if (protocol === 47) {
      processGre(l4Offset);
    } else if (protocol === 17) {
      processUdpTunnels(l4Offset, limit);
    }
  };
  const processIpv6 = (ipv6Offset: number) => {
    if (!rawPacketHasBytes(bytes, ipv6Offset, 40) || ((bytes[ipv6Offset] ?? 0) >>> 4) !== 6) {
      return;
    }
    const sctpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 132);
    if (sctpTarget) {
      addSctpTarget(sctpTarget.offset, sctpTarget.limit);
    }
    const udpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 17);
    if (udpTarget) {
      processUdpTunnels(udpTarget.offset, udpTarget.limit);
    }
    const greTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 47);
    if (greTarget) {
      processGre(greTarget.offset);
    }
  };

  const outer = rawPacketEthernetL3Target(bytes, 0);
  if (outer?.etherType === 0x0800) {
    processIpv4(outer.l3Offset);
  } else if (outer?.etherType === 0x86dd) {
    processIpv6(outer.l3Offset);
  }
  return [...targets.values()];
}

function collectRawPacketGreChecksumTargets(bytes: number[]) {
  const targets = new Map<number, RawPacketGreChecksumTarget>();
  const addGreTarget = (greOffset: number, limit: number) => {
    if (
      limit > bytes.length
      || greOffset + 8 > limit
      || !rawPacketHasBytes(bytes, greOffset, 8)
      || (rawPacketWord(bytes, greOffset) & 0x8000) === 0
    ) {
      return;
    }
    targets.set(greOffset, {
      checksumOffset: greOffset + 4,
      greOffset,
      length: limit - greOffset
    });
  };
  const processGre = (greOffset: number, limit: number) => {
    const gre = rawPacketGrePayloadTarget(bytes, greOffset);
    if (!gre || gre.payloadOffset >= limit) {
      return;
    }
    addGreTarget(greOffset, limit);
    if (gre.protocolType === 0x0800) {
      processIpv4(gre.payloadOffset);
    } else if (gre.protocolType === 0x86dd) {
      processIpv6(gre.payloadOffset);
    }
  };
  const processUdpTunnels = (udpOffset: number, limit: number) => {
    const udp = rawPacketUdpTarget(bytes, udpOffset, limit);
    if (!udp) {
      return;
    }
    if (udp.sourcePort === 4789 || udp.destinationPort === 4789 || udp.sourcePort === 8472 || udp.destinationPort === 8472) {
      const innerL3 = rawPacketEthernetL3Target(bytes, udp.payloadOffset + 8);
      if (innerL3?.etherType === 0x0800) {
        processIpv4(innerL3.l3Offset);
      } else if (innerL3?.etherType === 0x86dd) {
        processIpv6(innerL3.l3Offset);
      }
    }
    if (udp.sourcePort === 2152 || udp.destinationPort === 2152) {
      const gtpuPayloadOffset = rawPacketGtpuPayloadOffset(bytes, udp.payloadOffset, udp.end);
      if (gtpuPayloadOffset !== null) {
        const version = (bytes[gtpuPayloadOffset] ?? 0) >>> 4;
        if (version === 4) {
          processIpv4(gtpuPayloadOffset);
        } else if (version === 6) {
          processIpv6(gtpuPayloadOffset);
        }
      }
    }
  };
  const processIpv4 = (ipv4Offset: number) => {
    const headerLength = rawIpv4HeaderLengthAt(bytes, ipv4Offset);
    if (headerLength === null || rawPacketIpv4IsFragmented(bytes, ipv4Offset)) {
      return;
    }
    const totalLength = rawPacketWord(bytes, ipv4Offset + 2);
    if (totalLength < headerLength || !rawPacketHasBytes(bytes, ipv4Offset, totalLength)) {
      return;
    }
    const protocol = bytes[ipv4Offset + 9] ?? 0;
    const limit = ipv4Offset + totalLength;
    const l4Offset = ipv4Offset + headerLength;
    if (protocol === 47) {
      processGre(l4Offset, limit);
    } else if (protocol === 17) {
      processUdpTunnels(l4Offset, limit);
    }
  };
  const processIpv6 = (ipv6Offset: number) => {
    if (!rawPacketHasBytes(bytes, ipv6Offset, 40) || ((bytes[ipv6Offset] ?? 0) >>> 4) !== 6) {
      return;
    }
    const greTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 47);
    if (greTarget) {
      processGre(greTarget.offset, greTarget.limit);
    }
    const udpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 17);
    if (udpTarget) {
      processUdpTunnels(udpTarget.offset, udpTarget.limit);
    }
  };

  const outer = rawPacketEthernetL3Target(bytes, 0);
  if (outer?.etherType === 0x0800) {
    processIpv4(outer.l3Offset);
  } else if (outer?.etherType === 0x86dd) {
    processIpv6(outer.l3Offset);
  }
  return [...targets.values()];
}

function collectRawPacketTransportChecksumTargets(bytes: number[]) {
  const targets = new Map<string, RawPacketTransportChecksumTarget>();
  const addTransportTarget = (
    ipVersion: 4 | 6,
    ipOffset: number,
    protocol: 6 | 17,
    l4Offset: number,
    limit: number
  ) => {
    if (limit > bytes.length || l4Offset >= limit) {
      return;
    }
    if (protocol === 17) {
      const udp = rawPacketUdpTarget(bytes, l4Offset, limit);
      if (!udp) {
        return;
      }
      if (ipVersion === 4 && rawPacketWord(bytes, l4Offset + 6) === 0) {
        return;
      }
      targets.set(`${protocol}:${l4Offset}`, {
        checksumOffset: l4Offset + 6,
        ipOffset,
        ipVersion,
        l4Offset,
        length: udp.end - l4Offset,
        protocol
      });
      return;
    }
    const tcpOffset = rawPacketTcpHeaderOffset(bytes, l4Offset, limit);
    if (tcpOffset === null) {
      return;
    }
    targets.set(`${protocol}:${l4Offset}`, {
      checksumOffset: l4Offset + 16,
      ipOffset,
      ipVersion,
      l4Offset,
      length: limit - l4Offset,
      protocol
    });
  };
  const processGre = (greOffset: number) => {
    const gre = rawPacketGrePayloadTarget(bytes, greOffset);
    if (!gre) {
      return;
    }
    if (gre.protocolType === 0x0800) {
      processIpv4(gre.payloadOffset);
    } else if (gre.protocolType === 0x86dd) {
      processIpv6(gre.payloadOffset);
    }
  };
  const processUdpTunnels = (udpOffset: number, limit: number) => {
    const udp = rawPacketUdpTarget(bytes, udpOffset, limit);
    if (!udp) {
      return;
    }
    if (udp.sourcePort === 4789 || udp.destinationPort === 4789 || udp.sourcePort === 8472 || udp.destinationPort === 8472) {
      const innerL3 = rawPacketEthernetL3Target(bytes, udp.payloadOffset + 8);
      if (innerL3?.etherType === 0x0800) {
        processIpv4(innerL3.l3Offset);
      } else if (innerL3?.etherType === 0x86dd) {
        processIpv6(innerL3.l3Offset);
      }
    }
    if (udp.sourcePort === 2152 || udp.destinationPort === 2152) {
      const gtpuPayloadOffset = rawPacketGtpuPayloadOffset(bytes, udp.payloadOffset, udp.end);
      if (gtpuPayloadOffset !== null) {
        const version = (bytes[gtpuPayloadOffset] ?? 0) >>> 4;
        if (version === 4) {
          processIpv4(gtpuPayloadOffset);
        } else if (version === 6) {
          processIpv6(gtpuPayloadOffset);
        }
      }
    }
  };
  const processIpv4 = (ipv4Offset: number) => {
    const headerLength = rawIpv4HeaderLengthAt(bytes, ipv4Offset);
    if (headerLength === null || rawPacketIpv4IsFragmented(bytes, ipv4Offset)) {
      return;
    }
    const totalLength = rawPacketWord(bytes, ipv4Offset + 2);
    if (totalLength < headerLength || !rawPacketHasBytes(bytes, ipv4Offset, totalLength)) {
      return;
    }
    const protocol = bytes[ipv4Offset + 9] ?? 0;
    const limit = ipv4Offset + totalLength;
    const l4Offset = ipv4Offset + headerLength;
    if (protocol === 6 || protocol === 17) {
      addTransportTarget(4, ipv4Offset, protocol, l4Offset, limit);
    }
    if (protocol === 47) {
      processGre(l4Offset);
    } else if (protocol === 17) {
      processUdpTunnels(l4Offset, limit);
    }
  };
  const processIpv6 = (ipv6Offset: number) => {
    if (!rawPacketHasBytes(bytes, ipv6Offset, 40) || ((bytes[ipv6Offset] ?? 0) >>> 4) !== 6) {
      return;
    }
    const tcpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 6);
    if (tcpTarget) {
      addTransportTarget(6, ipv6Offset, 6, tcpTarget.offset, tcpTarget.limit);
    }
    const udpTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 17);
    if (udpTarget) {
      addTransportTarget(6, ipv6Offset, 17, udpTarget.offset, udpTarget.limit);
      processUdpTunnels(udpTarget.offset, udpTarget.limit);
    }
    const greTarget = rawPacketIpv6L4Offset(bytes, ipv6Offset, 47);
    if (greTarget) {
      processGre(greTarget.offset);
    }
  };

  const outer = rawPacketEthernetL3Target(bytes, 0);
  if (outer?.etherType === 0x0800) {
    processIpv4(outer.l3Offset);
  } else if (outer?.etherType === 0x86dd) {
    processIpv6(outer.l3Offset);
  }
  return [...targets.values()];
}

function rawIpv4HeaderChecksum(bytes: number[], offset: number, headerLength: number) {
  let sum = 0;
  for (let cursor = 0; cursor < headerLength; cursor += 2) {
    if (cursor === 10) {
      continue;
    }
    sum += ((bytes[offset + cursor] ?? 0) << 8) | (bytes[offset + cursor + 1] ?? 0);
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  return (~sum) & 0xffff;
}

function rawChecksumAddBytes(bytes: number[], start: number, length: number, initial = 0, skipOffset?: number) {
  let sum = initial;
  for (let cursor = 0; cursor < length; cursor += 2) {
    const absoluteOffset = start + cursor;
    const high = skipOffset !== undefined && absoluteOffset === skipOffset ? 0 : bytes[absoluteOffset] ?? 0;
    const low = skipOffset !== undefined && absoluteOffset + 1 === skipOffset + 1 ? 0 : bytes[absoluteOffset + 1] ?? 0;
    sum += (high << 8) | low;
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  return sum;
}

function rawTransportChecksum(bytes: number[], target: RawPacketTransportChecksumTarget) {
  let sum = 0;
  if (target.ipVersion === 4) {
    sum = rawChecksumAddBytes(bytes, target.ipOffset + 12, 8, sum);
    sum += target.protocol;
    sum += target.length;
  } else {
    sum = rawChecksumAddBytes(bytes, target.ipOffset + 8, 32, sum);
    sum += (target.length >>> 16) & 0xffff;
    sum += target.length & 0xffff;
    sum += target.protocol;
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = rawChecksumAddBytes(bytes, target.l4Offset, target.length, sum, target.checksumOffset);
  const checksum = (~sum) & 0xffff;
  return target.protocol === 17 && checksum === 0 ? 0xffff : checksum;
}

function rawIcmpChecksum(bytes: number[], target: RawPacketIcmpChecksumTarget) {
  let sum = 0;
  if (target.ipVersion === 6) {
    sum = rawChecksumAddBytes(bytes, target.ipOffset + 8, 32, sum);
    sum += (target.length >>> 16) & 0xffff;
    sum += target.length & 0xffff;
    sum += 58;
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  sum = rawChecksumAddBytes(bytes, target.icmpOffset, target.length, sum, target.checksumOffset);
  return (~sum) & 0xffff;
}

function rawSctpCrc32c(bytes: number[], target: RawPacketSctpChecksumTarget) {
  let crc = 0xffffffff;
  for (let cursor = 0; cursor < target.length; cursor += 1) {
    const offset = target.sctpOffset + cursor;
    const octet = offset >= target.checksumOffset && offset < target.checksumOffset + 4 ? 0 : bytes[offset] ?? 0;
    crc = (crc ^ octet) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? ((crc >>> 1) ^ 0x82f63b78) >>> 0 : (crc >>> 1) >>> 0;
    }
  }
  return (~crc) >>> 0;
}

function rawGreChecksum(bytes: number[], target: RawPacketGreChecksumTarget) {
  const sum = rawChecksumAddBytes(bytes, target.greOffset, target.length, 0, target.checksumOffset);
  return (~sum) & 0xffff;
}

function repairRawPacketIpv4Checksums(bytes: number[]) {
  const repaired = [...bytes];
  for (const offset of collectRawPacketIpv4HeaderOffsets(repaired)) {
    const headerLength = rawIpv4HeaderLengthAt(repaired, offset);
    if (headerLength === null || !rawPacketHasBytes(repaired, offset + 10, 2)) {
      continue;
    }
    const checksum = rawIpv4HeaderChecksum(repaired, offset, headerLength);
    repaired[offset + 10] = (checksum >>> 8) & 0xff;
    repaired[offset + 11] = checksum & 0xff;
  }
  return repaired;
}

function repairRawPacketSctpChecksums(bytes: number[]) {
  const repaired = [...bytes];
  for (const target of collectRawPacketSctpChecksumTargets(repaired)) {
    if (!rawPacketHasBytes(repaired, target.checksumOffset, 4)) {
      continue;
    }
    const checksum = rawSctpCrc32c(repaired, target);
    repaired[target.checksumOffset] = checksum & 0xff;
    repaired[target.checksumOffset + 1] = (checksum >>> 8) & 0xff;
    repaired[target.checksumOffset + 2] = (checksum >>> 16) & 0xff;
    repaired[target.checksumOffset + 3] = (checksum >>> 24) & 0xff;
  }
  return repaired;
}

function repairRawPacketIcmpChecksums(bytes: number[]) {
  const repaired = [...bytes];
  for (const target of collectRawPacketIcmpChecksumTargets(repaired)) {
    if (!rawPacketHasBytes(repaired, target.checksumOffset, 2)) {
      continue;
    }
    const checksum = rawIcmpChecksum(repaired, target);
    repaired[target.checksumOffset] = (checksum >>> 8) & 0xff;
    repaired[target.checksumOffset + 1] = checksum & 0xff;
  }
  return repaired;
}

function repairRawPacketGreChecksums(bytes: number[]) {
  const repaired = [...bytes];
  for (const target of collectRawPacketGreChecksumTargets(repaired)) {
    if (!rawPacketHasBytes(repaired, target.checksumOffset, 2)) {
      continue;
    }
    const checksum = rawGreChecksum(repaired, target);
    repaired[target.checksumOffset] = (checksum >>> 8) & 0xff;
    repaired[target.checksumOffset + 1] = checksum & 0xff;
  }
  return repaired;
}

function repairRawPacketTransportChecksums(bytes: number[]) {
  const repaired = [...bytes];
  for (const target of collectRawPacketTransportChecksumTargets(repaired)) {
    if (!rawPacketHasBytes(repaired, target.checksumOffset, 2)) {
      continue;
    }
    const checksum = rawTransportChecksum(repaired, target);
    repaired[target.checksumOffset] = (checksum >>> 8) & 0xff;
    repaired[target.checksumOffset + 1] = checksum & 0xff;
  }
  return repaired;
}

export function repairRawPacketChecksums(bytes: number[]) {
  const withIpv4 = repairRawPacketIpv4Checksums(bytes);
  const withIcmp = repairRawPacketIcmpChecksums(withIpv4);
  const withSctp = repairRawPacketSctpChecksums(withIcmp);
  const withTransport = repairRawPacketTransportChecksums(withSctp);
  const withGre = repairRawPacketGreChecksums(withTransport);
  return repairRawPacketTransportChecksums(withGre);
}

export function buildRawPacketFieldRows(bytes: number[]) {
  const rows: RawPacketFieldRow[] = [];
  const add = (
    layer: string,
    field: string,
    offset: number,
    length: number,
    format: RawPacketFieldFormat,
    value: string,
    options: Pick<RawPacketFieldRow, "mask" | "shift"> = {}
  ) => {
    if (!rawPacketHasBytes(bytes, offset, length)) {
      return;
    }
    rows.push({
      id: `${layer}:${field}:${offset}:${length}`,
      layer,
      field,
      offset,
      length,
      format,
      value,
      ...options
    });
  };
  const addMaskedNumber = (layer: string, field: string, offset: number, length: number, mask: number, shift: number) => {
    add(layer, field, offset, length, "number", formatPacketMaskedNumberField(bytes, offset, length, mask, shift), {
      mask,
      shift
    });
  };
  const skipDnsName = (nameOffset: number) => {
    let cursor = nameOffset;
    for (let labelIndex = 0; labelIndex < 64; labelIndex += 1) {
      if (!rawPacketHasBytes(bytes, cursor, 1)) {
        return null;
      }
      const labelLength = bytes[cursor] ?? 0;
      if ((labelLength & 0xc0) === 0xc0) {
        return rawPacketHasBytes(bytes, cursor, 2) ? cursor + 2 : null;
      }
      if ((labelLength & 0xc0) !== 0 || labelLength > 63) {
        return null;
      }
      cursor += 1;
      if (labelLength === 0) {
        return cursor;
      }
      if (!rawPacketHasBytes(bytes, cursor, labelLength)) {
        return null;
      }
      cursor += labelLength;
    }
    return null;
  };
  const addDnsRows = (dnsOffset: number) => {
    if (!rawPacketHasBytes(bytes, dnsOffset, 12)) {
      return;
    }
    const questionCount = rawPacketWord(bytes, dnsOffset + 4);
    const answerCount = rawPacketWord(bytes, dnsOffset + 6);
    add("DNS", "Transaction ID", dnsOffset, 2, "number", formatPacketNumberField(bytes, dnsOffset, 2));
    add("DNS", "Flags", dnsOffset + 2, 2, "hex", formatPacketHexField(bytes, dnsOffset + 2, 2));
    addMaskedNumber("DNS", "Response", dnsOffset + 2, 2, 0x8000, 15);
    addMaskedNumber("DNS", "Opcode", dnsOffset + 2, 2, 0x7800, 11);
    addMaskedNumber("DNS", "Authoritative answer", dnsOffset + 2, 2, 0x0400, 10);
    addMaskedNumber("DNS", "Truncated", dnsOffset + 2, 2, 0x0200, 9);
    addMaskedNumber("DNS", "Recursion desired", dnsOffset + 2, 2, 0x0100, 8);
    addMaskedNumber("DNS", "Recursion available", dnsOffset + 2, 2, 0x0080, 7);
    addMaskedNumber("DNS", "Reserved flags", dnsOffset + 2, 2, 0x0070, 4);
    addMaskedNumber("DNS", "Response code", dnsOffset + 2, 2, 0x000f, 0);
    add("DNS", "Questions", dnsOffset + 4, 2, "number", formatPacketNumberField(bytes, dnsOffset + 4, 2));
    add("DNS", "Answers", dnsOffset + 6, 2, "number", formatPacketNumberField(bytes, dnsOffset + 6, 2));
    add("DNS", "Authority RRs", dnsOffset + 8, 2, "number", formatPacketNumberField(bytes, dnsOffset + 8, 2));
    add("DNS", "Additional RRs", dnsOffset + 10, 2, "number", formatPacketNumberField(bytes, dnsOffset + 10, 2));

    let cursor = dnsOffset + 12;
    for (let questionIndex = 0; questionIndex < Math.min(questionCount, 8); questionIndex += 1) {
      const questionLayer = questionIndex === 0 ? "DNS Question" : `DNS Question ${questionIndex + 1}`;
      const nameEnd = skipDnsName(cursor);
      if (nameEnd === null) {
        return;
      }
      const nameLength = nameEnd - cursor;
      if (nameLength > 0 && nameLength <= 255) {
        add(questionLayer, "Name", cursor, nameLength, "hex", formatPacketHexField(bytes, cursor, nameLength));
      }
      if (!rawPacketHasBytes(bytes, nameEnd, 4)) {
        return;
      }
      add(questionLayer, "Type", nameEnd, 2, "number", formatPacketNumberField(bytes, nameEnd, 2));
      add(questionLayer, "Class", nameEnd + 2, 2, "number", formatPacketNumberField(bytes, nameEnd + 2, 2));
      cursor = nameEnd + 4;
    }

    for (let answerIndex = 0; answerIndex < Math.min(answerCount, 4); answerIndex += 1) {
      const answerLayer = answerIndex === 0 ? "DNS Answer" : `DNS Answer ${answerIndex + 1}`;
      const nameEnd = skipDnsName(cursor);
      if (nameEnd === null || !rawPacketHasBytes(bytes, nameEnd, 10)) {
        return;
      }
      const nameLength = nameEnd - cursor;
      if (nameLength > 0 && nameLength <= 255) {
        add(answerLayer, "Name", cursor, nameLength, "hex", formatPacketHexField(bytes, cursor, nameLength));
      }
      const answerType = rawPacketWord(bytes, nameEnd);
      const answerLength = rawPacketWord(bytes, nameEnd + 8);
      add(answerLayer, "Type", nameEnd, 2, "number", formatPacketNumberField(bytes, nameEnd, 2));
      add(answerLayer, "Class", nameEnd + 2, 2, "number", formatPacketNumberField(bytes, nameEnd + 2, 2));
      add(answerLayer, "TTL", nameEnd + 4, 4, "number", formatPacketNumberField(bytes, nameEnd + 4, 4));
      add(answerLayer, "RDLENGTH", nameEnd + 8, 2, "number", formatPacketNumberField(bytes, nameEnd + 8, 2));
      const rdataOffset = nameEnd + 10;
      if (!rawPacketHasBytes(bytes, rdataOffset, answerLength)) {
        return;
      }
      if (answerType === 1 && answerLength === 4) {
        add(answerLayer, "IPv4", rdataOffset, 4, "ipv4", formatPacketIpv4(bytes, rdataOffset));
      } else if (answerLength > 0 && answerLength <= 64) {
        add(answerLayer, "RDATA", rdataOffset, answerLength, "hex", formatPacketHexField(bytes, rdataOffset, answerLength));
      }
      cursor = rdataOffset + answerLength;
    }
  };
  const addDhcpRows = (dhcpOffset: number) => {
    if (!rawPacketHasBytes(bytes, dhcpOffset, 44)) {
      return;
    }
    const hardwareLength = bytes[dhcpOffset + 2] ?? 0;
    add("DHCP", "Operation", dhcpOffset, 1, "number", formatPacketNumberField(bytes, dhcpOffset, 1));
    add("DHCP", "Hardware type", dhcpOffset + 1, 1, "number", formatPacketNumberField(bytes, dhcpOffset + 1, 1));
    add("DHCP", "Hardware length", dhcpOffset + 2, 1, "number", formatPacketNumberField(bytes, dhcpOffset + 2, 1));
    add("DHCP", "Hops", dhcpOffset + 3, 1, "number", formatPacketNumberField(bytes, dhcpOffset + 3, 1));
    add("DHCP", "XID", dhcpOffset + 4, 4, "hex", formatPacketHexField(bytes, dhcpOffset + 4, 4));
    add("DHCP", "Seconds", dhcpOffset + 8, 2, "number", formatPacketNumberField(bytes, dhcpOffset + 8, 2));
    add("DHCP", "Flags", dhcpOffset + 10, 2, "hex", formatPacketHexField(bytes, dhcpOffset + 10, 2));
    addMaskedNumber("DHCP", "Broadcast flag", dhcpOffset + 10, 2, 0x8000, 15);
    addMaskedNumber("DHCP", "Reserved flags", dhcpOffset + 10, 2, 0x7fff, 0);
    add("DHCP", "Client IP", dhcpOffset + 12, 4, "ipv4", formatPacketIpv4(bytes, dhcpOffset + 12));
    add("DHCP", "Your IP", dhcpOffset + 16, 4, "ipv4", formatPacketIpv4(bytes, dhcpOffset + 16));
    add("DHCP", "Server IP", dhcpOffset + 20, 4, "ipv4", formatPacketIpv4(bytes, dhcpOffset + 20));
    add("DHCP", "Relay IP", dhcpOffset + 24, 4, "ipv4", formatPacketIpv4(bytes, dhcpOffset + 24));
    if (hardwareLength >= 6) {
      add("DHCP", "Client MAC", dhcpOffset + 28, 6, "mac", formatPacketMac(bytes, dhcpOffset + 28));
    }
    if (!rawPacketHasBytes(bytes, dhcpOffset + 236, 4)) {
      return;
    }
    add("DHCP", "Magic cookie", dhcpOffset + 236, 4, "hex", formatPacketHexField(bytes, dhcpOffset + 236, 4));
    if (formatPacketHexField(bytes, dhcpOffset + 236, 4) !== "63825363") {
      return;
    }

    let optionOffset = dhcpOffset + 240;
    for (let optionIndex = 0; optionIndex < 64 && rawPacketHasBytes(bytes, optionOffset, 1); optionIndex += 1) {
      const optionCode = bytes[optionOffset] ?? 0;
      if (optionCode === 255) {
        add("DHCP Option End", "Code", optionOffset, 1, "number", formatPacketNumberField(bytes, optionOffset, 1));
        return;
      }
      if (optionCode === 0) {
        optionOffset += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      const dataOffset = optionOffset + 2;
      if (!rawPacketHasBytes(bytes, dataOffset, optionLength)) {
        return;
      }
      const optionLayer = `DHCP Option ${optionCode}`;
      add(optionLayer, "Code", optionOffset, 1, "number", formatPacketNumberField(bytes, optionOffset, 1));
      add(optionLayer, "Length", optionOffset + 1, 1, "number", formatPacketNumberField(bytes, optionOffset + 1, 1));
      if (optionCode === 53 && optionLength === 1) {
        add(optionLayer, "Message type", dataOffset, 1, "number", formatPacketNumberField(bytes, dataOffset, 1));
      } else if (optionCode === 50 && optionLength === 4) {
        add(optionLayer, "Requested IP", dataOffset, 4, "ipv4", formatPacketIpv4(bytes, dataOffset));
      } else if (optionCode === 54 && optionLength === 4) {
        add(optionLayer, "Server identifier", dataOffset, 4, "ipv4", formatPacketIpv4(bytes, dataOffset));
      } else if (optionCode === 51 && optionLength === 4) {
        add(optionLayer, "Lease time", dataOffset, 4, "number", formatPacketNumberField(bytes, dataOffset, 4));
      } else if (optionCode === 58 && optionLength === 4) {
        add(optionLayer, "Renewal time", dataOffset, 4, "number", formatPacketNumberField(bytes, dataOffset, 4));
      } else if (optionCode === 59 && optionLength === 4) {
        add(optionLayer, "Rebinding time", dataOffset, 4, "number", formatPacketNumberField(bytes, dataOffset, 4));
      } else if ((optionCode === 12 || optionCode === 55 || optionCode === 61) && optionLength > 0 && optionLength <= 64) {
        const field = optionCode === 12 ? "Hostname" : optionCode === 55 ? "Parameter request list" : "Client identifier";
        add(optionLayer, field, dataOffset, optionLength, "hex", formatPacketHexField(bytes, dataOffset, optionLength));
      } else if (optionLength > 0 && optionLength <= 64) {
        add(optionLayer, "Data", dataOffset, optionLength, "hex", formatPacketHexField(bytes, dataOffset, optionLength));
      }
      optionOffset = dataOffset + optionLength;
    }
  };
  const addUdpRows = (l4Offset: number, layer = "UDP") => {
    if (!rawPacketHasBytes(bytes, l4Offset, 8)) {
      return;
    }
    const sourcePort = rawPacketWord(bytes, l4Offset);
    const destinationPort = rawPacketWord(bytes, l4Offset + 2);
    add(layer, "Source port", l4Offset, 2, "number", formatPacketNumberField(bytes, l4Offset, 2));
    add(layer, "Destination port", l4Offset + 2, 2, "number", formatPacketNumberField(bytes, l4Offset + 2, 2));
    add(layer, "Length", l4Offset + 4, 2, "number", formatPacketNumberField(bytes, l4Offset + 4, 2));
    add(layer, "Checksum", l4Offset + 6, 2, "hex", formatPacketHexField(bytes, l4Offset + 6, 2));
    if (layer === "UDP" && (sourcePort === 4789 || destinationPort === 4789 || sourcePort === 8472 || destinationPort === 8472)) {
      addVxlanRows(l4Offset + 8);
    }
    if (layer === "UDP" && (sourcePort === 2152 || destinationPort === 2152)) {
      addGtpuRows(l4Offset + 8);
    }
    if (layer === "UDP" && (sourcePort === 53 || destinationPort === 53)) {
      addDnsRows(l4Offset + 8);
    }
    if (layer === "UDP" && (sourcePort === 67 || destinationPort === 67 || sourcePort === 68 || destinationPort === 68)) {
      addDhcpRows(l4Offset + 8);
    }
  };
  const addTcpOptionRows = (optionsOffset: number, optionsEnd: number, layer = "TCP Options") => {
    let optionOffset = optionsOffset;
    let optionIndex = 0;
    while (optionOffset < optionsEnd && optionIndex < 32) {
      if (!rawPacketHasBytes(bytes, optionOffset, 1)) {
        return;
      }
      const kind = bytes[optionOffset] ?? 0;
      const optionLayer = optionIndex === 0 ? layer : `${layer} ${optionIndex + 1}`;
      add(optionLayer, "Kind", optionOffset, 1, "number", formatPacketNumberField(bytes, optionOffset, 1));
      if (kind === 0) {
        return;
      }
      if (kind === 1) {
        optionOffset += 1;
        optionIndex += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      if (optionLength < 2 || optionOffset + optionLength > optionsEnd || !rawPacketHasBytes(bytes, optionOffset, optionLength)) {
        return;
      }
      add(optionLayer, "Length", optionOffset + 1, 1, "number", formatPacketNumberField(bytes, optionOffset + 1, 1));
      if (kind === 2 && optionLength === 4) {
        add(optionLayer, "MSS", optionOffset + 2, 2, "number", formatPacketNumberField(bytes, optionOffset + 2, 2));
      } else if (kind === 3 && optionLength === 3) {
        add(optionLayer, "Window Scale", optionOffset + 2, 1, "number", formatPacketNumberField(bytes, optionOffset + 2, 1));
      } else if (kind === 4 && optionLength === 2) {
        add(optionLayer, "SACK Permitted", optionOffset, 2, "hex", formatPacketHexField(bytes, optionOffset, 2));
      } else if (kind === 5 && optionLength >= 10) {
        const blockCount = Math.floor((optionLength - 2) / 8);
        for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
          const blockOffset = optionOffset + 2 + blockIndex * 8;
          add(optionLayer, `SACK ${blockIndex + 1} left edge`, blockOffset, 4, "number", formatPacketNumberField(bytes, blockOffset, 4));
          add(optionLayer, `SACK ${blockIndex + 1} right edge`, blockOffset + 4, 4, "number", formatPacketNumberField(bytes, blockOffset + 4, 4));
        }
      } else if (kind === 8 && optionLength === 10) {
        add(optionLayer, "Timestamp value", optionOffset + 2, 4, "number", formatPacketNumberField(bytes, optionOffset + 2, 4));
        add(optionLayer, "Timestamp echo", optionOffset + 6, 4, "number", formatPacketNumberField(bytes, optionOffset + 6, 4));
      } else if (optionLength > 2 && optionLength <= 32) {
        add(optionLayer, "Data", optionOffset + 2, optionLength - 2, "hex", formatPacketHexField(bytes, optionOffset + 2, optionLength - 2));
      }
      optionOffset += optionLength;
      optionIndex += 1;
    }
  };
  const addTcpRows = (l4Offset: number, layer = "TCP") => {
    if (!rawPacketHasBytes(bytes, l4Offset, 20)) {
      return;
    }
    const headerLength = ((bytes[l4Offset + 12] ?? 0) >> 4) * 4;
    add(layer, "Source port", l4Offset, 2, "number", formatPacketNumberField(bytes, l4Offset, 2));
    add(layer, "Destination port", l4Offset + 2, 2, "number", formatPacketNumberField(bytes, l4Offset + 2, 2));
    add(layer, "Sequence", l4Offset + 4, 4, "number", formatPacketNumberField(bytes, l4Offset + 4, 4));
    add(layer, "Acknowledge", l4Offset + 8, 4, "number", formatPacketNumberField(bytes, l4Offset + 8, 4));
    addMaskedNumber(layer, "Data offset", l4Offset + 12, 1, 0xf0, 4);
    addMaskedNumber(layer, "Reserved", l4Offset + 12, 1, 0x0f, 0);
    add(layer, "Flags", l4Offset + 13, 1, "hex", formatPacketHexField(bytes, l4Offset + 13, 1));
    addMaskedNumber(layer, "URG flag", l4Offset + 13, 1, 0x20, 5);
    addMaskedNumber(layer, "ACK flag", l4Offset + 13, 1, 0x10, 4);
    addMaskedNumber(layer, "PSH flag", l4Offset + 13, 1, 0x08, 3);
    addMaskedNumber(layer, "RST flag", l4Offset + 13, 1, 0x04, 2);
    addMaskedNumber(layer, "SYN flag", l4Offset + 13, 1, 0x02, 1);
    addMaskedNumber(layer, "FIN flag", l4Offset + 13, 1, 0x01, 0);
    add(layer, "Window", l4Offset + 14, 2, "number", formatPacketNumberField(bytes, l4Offset + 14, 2));
    add(layer, "Checksum", l4Offset + 16, 2, "hex", formatPacketHexField(bytes, l4Offset + 16, 2));
    add(layer, "Urgent pointer", l4Offset + 18, 2, "number", formatPacketNumberField(bytes, l4Offset + 18, 2));
    if (headerLength > 20 && rawPacketHasBytes(bytes, l4Offset, headerLength)) {
      addTcpOptionRows(l4Offset + 20, l4Offset + headerLength, layer === "TCP" ? "TCP Options" : `${layer} Options`);
    }
  };
  const addSctpRows = (l4Offset: number, layer = "SCTP", dataLayer = "SCTP DATA", genericChunkLayer = "SCTP Chunk") => {
    if (!rawPacketHasBytes(bytes, l4Offset, 12)) {
      return;
    }
    add(layer, "Source port", l4Offset, 2, "number", formatPacketNumberField(bytes, l4Offset, 2));
    add(layer, "Destination port", l4Offset + 2, 2, "number", formatPacketNumberField(bytes, l4Offset + 2, 2));
    add(layer, "Verification tag", l4Offset + 4, 4, "number", formatPacketNumberField(bytes, l4Offset + 4, 4));
    add(layer, "Checksum", l4Offset + 8, 4, "hex", formatPacketHexField(bytes, l4Offset + 8, 4));
    const chunkOffset = l4Offset + 12;
    if (!rawPacketHasBytes(bytes, chunkOffset, 4)) {
      return;
    }
    const chunkType = bytes[chunkOffset] ?? 0;
    const chunkLayer = chunkType === 0 ? dataLayer : genericChunkLayer;
    add(chunkLayer, "Chunk type", chunkOffset, 1, "number", formatPacketNumberField(bytes, chunkOffset, 1));
    add(chunkLayer, "Flags", chunkOffset + 1, 1, "number", formatPacketNumberField(bytes, chunkOffset + 1, 1));
    add(chunkLayer, "Length", chunkOffset + 2, 2, "number", formatPacketNumberField(bytes, chunkOffset + 2, 2));
    if (chunkType === 0 && rawPacketHasBytes(bytes, chunkOffset, 16)) {
      addMaskedNumber(dataLayer, "Reserved flags", chunkOffset + 1, 1, 0xf0, 4);
      addMaskedNumber(dataLayer, "Immediate SACK", chunkOffset + 1, 1, 0x08, 3);
      addMaskedNumber(dataLayer, "Unordered", chunkOffset + 1, 1, 0x04, 2);
      addMaskedNumber(dataLayer, "Beginning fragment", chunkOffset + 1, 1, 0x02, 1);
      addMaskedNumber(dataLayer, "Ending fragment", chunkOffset + 1, 1, 0x01, 0);
      add(dataLayer, "TSN", chunkOffset + 4, 4, "number", formatPacketNumberField(bytes, chunkOffset + 4, 4));
      add(dataLayer, "Stream ID", chunkOffset + 8, 2, "number", formatPacketNumberField(bytes, chunkOffset + 8, 2));
      add(dataLayer, "Stream sequence", chunkOffset + 10, 2, "number", formatPacketNumberField(bytes, chunkOffset + 10, 2));
      add(dataLayer, "Payload protocol ID", chunkOffset + 12, 4, "number", formatPacketNumberField(bytes, chunkOffset + 12, 4));
    }
  };
  const addIcmpv6OptionRows = (layer: string, optionOffset: number) => {
    let cursor = optionOffset;
    const optionLayerCounts = new Map<string, number>();
    for (let optionIndex = 0; optionIndex < 8 && rawPacketHasBytes(bytes, cursor, 2); optionIndex += 1) {
      const optionType = bytes[cursor] ?? 0;
      const optionLengthUnits = bytes[cursor + 1] ?? 0;
      const optionLength = optionLengthUnits * 8;
      if (optionLengthUnits === 0 || optionLength < 2 || !rawPacketHasBytes(bytes, cursor, optionLength)) {
        return;
      }
      const baseOptionLayer =
        optionType === 1
          ? `${layer} Source Link-Layer Option`
          : optionType === 2
            ? `${layer} Target Link-Layer Option`
            : optionType === 3
              ? `${layer} Prefix Information Option`
              : `${layer} Option ${optionType}`;
      const optionLayerCount = (optionLayerCounts.get(baseOptionLayer) ?? 0) + 1;
      optionLayerCounts.set(baseOptionLayer, optionLayerCount);
      const optionLayer = optionLayerCount > 1 ? `${baseOptionLayer} ${optionLayerCount}` : baseOptionLayer;
      add(optionLayer, "Type", cursor, 1, "number", formatPacketNumberField(bytes, cursor, 1));
      add(optionLayer, "Length", cursor + 1, 1, "number", formatPacketNumberField(bytes, cursor + 1, 1));
      if ((optionType === 1 || optionType === 2) && optionLength >= 8) {
        add(optionLayer, "Link-layer address", cursor + 2, 6, "mac", formatPacketMac(bytes, cursor + 2));
      } else if (optionType === 3 && optionLength >= 32) {
        add(optionLayer, "Prefix length", cursor + 2, 1, "number", formatPacketNumberField(bytes, cursor + 2, 1));
        addMaskedNumber(optionLayer, "On-link flag", cursor + 3, 1, 0x80, 7);
        addMaskedNumber(optionLayer, "Autonomous flag", cursor + 3, 1, 0x40, 6);
        add(optionLayer, "Valid lifetime", cursor + 4, 4, "number", formatPacketNumberField(bytes, cursor + 4, 4));
        add(optionLayer, "Preferred lifetime", cursor + 8, 4, "number", formatPacketNumberField(bytes, cursor + 8, 4));
        add(optionLayer, "Reserved", cursor + 12, 4, "hex", formatPacketHexField(bytes, cursor + 12, 4));
        add(optionLayer, "Prefix", cursor + 16, 16, "ipv6", formatPacketIpv6(bytes, cursor + 16));
      } else if (optionLength > 2 && optionLength <= 64) {
        add(optionLayer, "Data", cursor + 2, optionLength - 2, "hex", formatPacketHexField(bytes, cursor + 2, optionLength - 2));
      }
      cursor += optionLength;
    }
  };
  const addIcmpRows = (layer: string, l4Offset: number) => {
    if (!rawPacketHasBytes(bytes, l4Offset, 4)) {
      return;
    }
    const type = bytes[l4Offset] ?? 0;
    const isIcmpv6 = layer.includes("ICMPv6");
    add(layer, "Type", l4Offset, 1, "number", formatPacketNumberField(bytes, l4Offset, 1));
    add(layer, "Code", l4Offset + 1, 1, "number", formatPacketNumberField(bytes, l4Offset + 1, 1));
    add(layer, "Checksum", l4Offset + 2, 2, "hex", formatPacketHexField(bytes, l4Offset + 2, 2));
    if (rawPacketHasBytes(bytes, l4Offset, 8) && (type === 0 || type === 8 || type === 128 || type === 129)) {
      add(layer, "Identifier", l4Offset + 4, 2, "number", formatPacketNumberField(bytes, l4Offset + 4, 2));
      add(layer, "Sequence", l4Offset + 6, 2, "number", formatPacketNumberField(bytes, l4Offset + 6, 2));
    }
    if (!isIcmpv6) {
      return;
    }
    if ((type === 135 || type === 136) && rawPacketHasBytes(bytes, l4Offset, 24)) {
      if (type === 135) {
        add(layer, "Reserved", l4Offset + 4, 4, "hex", formatPacketHexField(bytes, l4Offset + 4, 4));
      } else {
        addMaskedNumber(layer, "Router flag", l4Offset + 4, 4, 0x80000000, 31);
        addMaskedNumber(layer, "Solicited flag", l4Offset + 4, 4, 0x40000000, 30);
        addMaskedNumber(layer, "Override flag", l4Offset + 4, 4, 0x20000000, 29);
        addMaskedNumber(layer, "Reserved flags", l4Offset + 4, 4, 0x1fffffff, 0);
      }
      add(layer, "Target address", l4Offset + 8, 16, "ipv6", formatPacketIpv6(bytes, l4Offset + 8));
      addIcmpv6OptionRows(layer, l4Offset + 24);
    }
    if (type === 133 && rawPacketHasBytes(bytes, l4Offset, 8)) {
      add(layer, "Reserved", l4Offset + 4, 4, "hex", formatPacketHexField(bytes, l4Offset + 4, 4));
      addIcmpv6OptionRows(layer, l4Offset + 8);
    }
    if (type === 134 && rawPacketHasBytes(bytes, l4Offset, 16)) {
      add(layer, "Current hop limit", l4Offset + 4, 1, "number", formatPacketNumberField(bytes, l4Offset + 4, 1));
      addMaskedNumber(layer, "Managed flag", l4Offset + 5, 1, 0x80, 7);
      addMaskedNumber(layer, "Other flag", l4Offset + 5, 1, 0x40, 6);
      add(layer, "Router lifetime", l4Offset + 6, 2, "number", formatPacketNumberField(bytes, l4Offset + 6, 2));
      add(layer, "Reachable time", l4Offset + 8, 4, "number", formatPacketNumberField(bytes, l4Offset + 8, 4));
      add(layer, "Retrans timer", l4Offset + 12, 4, "number", formatPacketNumberField(bytes, l4Offset + 12, 4));
      addIcmpv6OptionRows(layer, l4Offset + 16);
    }
  };
  const ipv6ExtensionLayerName = (header: number) => {
    switch (header) {
      case 0:
        return "Hop-by-Hop";
      case 43:
        return "Routing";
      case 44:
        return "Fragment";
      case 51:
        return "AH";
      case 60:
        return "Destination Options";
      case 135:
        return "Mobility";
      default:
        return `Extension ${header}`;
    }
  };
  const isIpv6VariableLengthExtension = (header: number) => header === 0 || header === 43 || header === 60 || header === 135;
  const addIpv6ExtensionOptionRows = (layer: string, optionsOffset: number, optionsLength: number) => {
    const optionsEnd = optionsOffset + optionsLength;
    let optionOffset = optionsOffset;
    for (let optionIndex = 1; optionIndex <= 16 && optionOffset < optionsEnd; optionIndex += 1) {
      if (!rawPacketHasBytes(bytes, optionOffset, 1)) {
        return;
      }
      const optionType = bytes[optionOffset] ?? 0;
      const optionLayer = `${layer} Option ${optionIndex}`;
      add(optionLayer, "Type", optionOffset, 1, "number", formatPacketNumberField(bytes, optionOffset, 1));
      addMaskedNumber(optionLayer, "Action", optionOffset, 1, 0xc0, 6);
      addMaskedNumber(optionLayer, "Change en route", optionOffset, 1, 0x20, 5);
      addMaskedNumber(optionLayer, "Option number", optionOffset, 1, 0x1f, 0);
      if (optionType === 0) {
        optionOffset += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      const optionDataOffset = optionOffset + 2;
      const optionTotalLength = optionLength + 2;
      if (optionTotalLength < 2 || optionOffset + optionTotalLength > optionsEnd || !rawPacketHasBytes(bytes, optionOffset, optionTotalLength)) {
        return;
      }
      add(optionLayer, "Length", optionOffset + 1, 1, "number", formatPacketNumberField(bytes, optionOffset + 1, 1));
      if (optionType === 1 && optionLength > 0) {
        add(optionLayer, "Padding", optionDataOffset, optionLength, "hex", formatPacketHexField(bytes, optionDataOffset, optionLength));
      } else if (optionType === 5 && optionLength === 2) {
        add(optionLayer, "Router alert value", optionDataOffset, 2, "number", formatPacketNumberField(bytes, optionDataOffset, 2));
      } else if (optionType === 0xc2 && optionLength === 4) {
        add(optionLayer, "Jumbo payload length", optionDataOffset, 4, "number", formatPacketNumberField(bytes, optionDataOffset, 4));
      } else if (optionLength > 0 && optionLength <= 64) {
        add(optionLayer, "Data", optionDataOffset, optionLength, "hex", formatPacketHexField(bytes, optionDataOffset, optionLength));
      }
      optionOffset += optionTotalLength;
    }
  };
  const addIpv6L4Rows = (nextHeader: number, l4Offset: number, l4Layer: (name: string) => string) => {
    if (nextHeader === 17) {
      addUdpRows(l4Offset, l4Layer("UDP"));
    }
    if (nextHeader === 6) {
      addTcpRows(l4Offset, l4Layer("TCP"));
    }
    if (nextHeader === 58) {
      addIcmpRows(l4Layer("ICMPv6"), l4Offset);
    }
    if (nextHeader === 132) {
      addSctpRows(l4Offset, l4Layer("SCTP"), l4Layer("SCTP DATA"), l4Layer("SCTP Chunk"));
    }
    if (nextHeader === 47) {
      addGreRows(l4Offset);
    }
  };
  const addIpv6Rows = (ipv6Offset: number, layer = "IPv6", l4Prefix = "") => {
    if (!rawPacketHasBytes(bytes, ipv6Offset, 40)) {
      return false;
    }
    let nextHeader = bytes[ipv6Offset + 6] ?? 0;
    let l4Offset = ipv6Offset + 40;
    const l4Layer = (name: string) => (l4Prefix ? `${l4Prefix} ${name}` : name);
    const extensionNameCounts = new Map<string, number>();
    const extensionLayer = (name: string) => {
      const count = (extensionNameCounts.get(name) ?? 0) + 1;
      extensionNameCounts.set(name, count);
      const suffix = count > 1 ? ` ${count}` : "";
      return l4Prefix ? `${l4Prefix} IPv6 ${name}${suffix}` : `IPv6 ${name}${suffix}`;
    };
    addMaskedNumber(layer, "Version", ipv6Offset, 4, 0xf0000000, 28);
    addMaskedNumber(layer, "Traffic class", ipv6Offset, 4, 0x0ff00000, 20);
    addMaskedNumber(layer, "Flow label", ipv6Offset, 4, 0x000fffff, 0);
    add(layer, "Payload length", ipv6Offset + 4, 2, "number", formatPacketNumberField(bytes, ipv6Offset + 4, 2));
    add(layer, "Next header", ipv6Offset + 6, 1, "number", formatPacketNumberField(bytes, ipv6Offset + 6, 1));
    add(layer, "Hop limit", ipv6Offset + 7, 1, "number", formatPacketNumberField(bytes, ipv6Offset + 7, 1));
    add(layer, "Source", ipv6Offset + 8, 16, "ipv6", formatPacketIpv6(bytes, ipv6Offset + 8));
    add(layer, "Destination", ipv6Offset + 24, 16, "ipv6", formatPacketIpv6(bytes, ipv6Offset + 24));

    for (let extensionIndex = 0; extensionIndex < 8; extensionIndex += 1) {
      if (nextHeader === 59 || nextHeader === 50) {
        return true;
      }
      if (nextHeader === 44) {
        if (!rawPacketHasBytes(bytes, l4Offset, 8)) {
          return true;
        }
        const fragmentLayer = extensionLayer(ipv6ExtensionLayerName(nextHeader));
        add(fragmentLayer, "Next header", l4Offset, 1, "number", formatPacketNumberField(bytes, l4Offset, 1));
        add(fragmentLayer, "Reserved", l4Offset + 1, 1, "hex", formatPacketHexField(bytes, l4Offset + 1, 1));
        addMaskedNumber(fragmentLayer, "Fragment offset", l4Offset + 2, 2, 0xfff8, 3);
        addMaskedNumber(fragmentLayer, "Reserved bits", l4Offset + 2, 2, 0x0006, 1);
        addMaskedNumber(fragmentLayer, "More fragments", l4Offset + 2, 2, 0x0001, 0);
        add(fragmentLayer, "Identification", l4Offset + 4, 4, "hex", formatPacketHexField(bytes, l4Offset + 4, 4));
        nextHeader = bytes[l4Offset] ?? 59;
        l4Offset += 8;
        continue;
      }
      if (nextHeader === 51) {
        if (!rawPacketHasBytes(bytes, l4Offset, 12)) {
          return true;
        }
        const ahLayer = extensionLayer(ipv6ExtensionLayerName(nextHeader));
        const ahLength = ((bytes[l4Offset + 1] ?? 0) + 2) * 4;
        if (ahLength < 12 || !rawPacketHasBytes(bytes, l4Offset, ahLength)) {
          return true;
        }
        add(ahLayer, "Next header", l4Offset, 1, "number", formatPacketNumberField(bytes, l4Offset, 1));
        add(ahLayer, "Payload length", l4Offset + 1, 1, "number", formatPacketNumberField(bytes, l4Offset + 1, 1));
        add(ahLayer, "Reserved", l4Offset + 2, 2, "hex", formatPacketHexField(bytes, l4Offset + 2, 2));
        add(ahLayer, "SPI", l4Offset + 4, 4, "hex", formatPacketHexField(bytes, l4Offset + 4, 4));
        add(ahLayer, "Sequence", l4Offset + 8, 4, "number", formatPacketNumberField(bytes, l4Offset + 8, 4));
        nextHeader = bytes[l4Offset] ?? 59;
        l4Offset += ahLength;
        continue;
      }
      if (nextHeader === 43) {
        if (!rawPacketHasBytes(bytes, l4Offset, 8)) {
          return true;
        }
        const routingHeaderLength = rawIpv6ExtensionHeaderLength(bytes, nextHeader, l4Offset);
        if (routingHeaderLength === null) {
          return true;
        }
        const routingLayer = extensionLayer(ipv6ExtensionLayerName(nextHeader));
        add(routingLayer, "Next header", l4Offset, 1, "number", formatPacketNumberField(bytes, l4Offset, 1));
        add(routingLayer, "Header extension length", l4Offset + 1, 1, "number", formatPacketNumberField(bytes, l4Offset + 1, 1));
        add(routingLayer, "Routing type", l4Offset + 2, 1, "number", formatPacketNumberField(bytes, l4Offset + 2, 1));
        add(routingLayer, "Segments left", l4Offset + 3, 1, "number", formatPacketNumberField(bytes, l4Offset + 3, 1));
        if (routingHeaderLength > 4 && routingHeaderLength <= 64) {
          add(routingLayer, "Data", l4Offset + 4, routingHeaderLength - 4, "hex", formatPacketHexField(bytes, l4Offset + 4, routingHeaderLength - 4));
        }
        nextHeader = bytes[l4Offset] ?? 59;
        l4Offset += routingHeaderLength;
        continue;
      }
      if (isIpv6VariableLengthExtension(nextHeader)) {
        if (!rawPacketHasBytes(bytes, l4Offset, 2)) {
          return true;
        }
        const extensionHeaderLength = ((bytes[l4Offset + 1] ?? 0) + 1) * 8;
        if (extensionHeaderLength < 8 || !rawPacketHasBytes(bytes, l4Offset, extensionHeaderLength)) {
          return true;
        }
        const optionLayer = extensionLayer(ipv6ExtensionLayerName(nextHeader));
        add(optionLayer, "Next header", l4Offset, 1, "number", formatPacketNumberField(bytes, l4Offset, 1));
        add(optionLayer, "Header extension length", l4Offset + 1, 1, "number", formatPacketNumberField(bytes, l4Offset + 1, 1));
        if (extensionHeaderLength > 2 && extensionHeaderLength <= 32) {
          add(optionLayer, "Options", l4Offset + 2, extensionHeaderLength - 2, "hex", formatPacketHexField(bytes, l4Offset + 2, extensionHeaderLength - 2));
        }
        addIpv6ExtensionOptionRows(optionLayer, l4Offset + 2, extensionHeaderLength - 2);
        nextHeader = bytes[l4Offset] ?? 59;
        l4Offset += extensionHeaderLength;
        continue;
      }
      break;
    }
    addIpv6L4Rows(nextHeader, l4Offset, l4Layer);
    return true;
  };
  const addIpv4OptionRows = (layer: string, optionsOffset: number, optionsLength: number) => {
    const optionsEnd = optionsOffset + optionsLength;
    let optionOffset = optionsOffset;
    for (let optionIndex = 1; optionIndex <= 16 && optionOffset < optionsEnd; optionIndex += 1) {
      if (!rawPacketHasBytes(bytes, optionOffset, 1)) {
        return;
      }
      const optionType = bytes[optionOffset] ?? 0;
      const optionLayer = `${layer} Option ${optionIndex}`;
      add(optionLayer, "Type", optionOffset, 1, "number", formatPacketNumberField(bytes, optionOffset, 1));
      addMaskedNumber(optionLayer, "Copied flag", optionOffset, 1, 0x80, 7);
      addMaskedNumber(optionLayer, "Class", optionOffset, 1, 0x60, 5);
      addMaskedNumber(optionLayer, "Option number", optionOffset, 1, 0x1f, 0);
      if (optionType === 0) {
        return;
      }
      if (optionType === 1) {
        optionOffset += 1;
        continue;
      }
      if (!rawPacketHasBytes(bytes, optionOffset, 2)) {
        return;
      }
      const optionLength = bytes[optionOffset + 1] ?? 0;
      if (optionLength < 2 || optionOffset + optionLength > optionsEnd || !rawPacketHasBytes(bytes, optionOffset, optionLength)) {
        return;
      }
      const optionDataOffset = optionOffset + 2;
      const optionDataLength = optionLength - 2;
      add(optionLayer, "Length", optionOffset + 1, 1, "number", formatPacketNumberField(bytes, optionOffset + 1, 1));
      if (optionType === 0x94 && optionDataLength === 2) {
        add(optionLayer, "Router alert value", optionDataOffset, 2, "number", formatPacketNumberField(bytes, optionDataOffset, 2));
      } else if (optionDataLength > 0 && optionDataLength <= 64) {
        add(optionLayer, "Data", optionDataOffset, optionDataLength, "hex", formatPacketHexField(bytes, optionDataOffset, optionDataLength));
      }
      optionOffset += optionLength;
    }
  };
  const addIpv4Rows = (ipv4Offset: number, layer = "IPv4", l4Prefix = "") => {
    if (!rawPacketHasBytes(bytes, ipv4Offset, 20)) {
      return false;
    }
    const ipv4HeaderLength = (bytes[ipv4Offset] & 0x0f) * 4;
    if (ipv4HeaderLength < 20 || !rawPacketHasBytes(bytes, ipv4Offset, ipv4HeaderLength)) {
      return false;
    }
    const l4Protocol = bytes[ipv4Offset + 9] ?? 0;
    const l4Offset = ipv4Offset + ipv4HeaderLength;
    const l4Layer = (name: string) => (l4Prefix ? `${l4Prefix} ${name}` : name);
    addMaskedNumber(layer, "Version", ipv4Offset, 1, 0xf0, 4);
    addMaskedNumber(layer, "Header length", ipv4Offset, 1, 0x0f, 0);
    addMaskedNumber(layer, "DSCP", ipv4Offset + 1, 1, 0xfc, 2);
    addMaskedNumber(layer, "ECN", ipv4Offset + 1, 1, 0x03, 0);
    add(layer, "Total length", ipv4Offset + 2, 2, "number", formatPacketNumberField(bytes, ipv4Offset + 2, 2));
    add(layer, "Identification", ipv4Offset + 4, 2, "hex", formatPacketHexField(bytes, ipv4Offset + 4, 2));
    addMaskedNumber(layer, "Reserved flag", ipv4Offset + 6, 2, 0x8000, 15);
    addMaskedNumber(layer, "Don't fragment", ipv4Offset + 6, 2, 0x4000, 14);
    addMaskedNumber(layer, "More fragments", ipv4Offset + 6, 2, 0x2000, 13);
    addMaskedNumber(layer, "Fragment offset", ipv4Offset + 6, 2, 0x1fff, 0);
    add(layer, "TTL", ipv4Offset + 8, 1, "number", formatPacketNumberField(bytes, ipv4Offset + 8, 1));
    add(layer, "Protocol", ipv4Offset + 9, 1, "number", formatPacketNumberField(bytes, ipv4Offset + 9, 1));
    add(layer, "Checksum", ipv4Offset + 10, 2, "hex", formatPacketHexField(bytes, ipv4Offset + 10, 2));
    add(layer, "Source", ipv4Offset + 12, 4, "ipv4", formatPacketIpv4(bytes, ipv4Offset + 12));
    add(layer, "Destination", ipv4Offset + 16, 4, "ipv4", formatPacketIpv4(bytes, ipv4Offset + 16));
    if (ipv4HeaderLength > 20) {
      const optionsOffset = ipv4Offset + 20;
      const optionsLength = ipv4HeaderLength - 20;
      add(`${layer} Options`, "Options", optionsOffset, optionsLength, "hex", formatPacketHexField(bytes, optionsOffset, optionsLength));
      addIpv4OptionRows(layer, optionsOffset, optionsLength);
    }

    if (l4Protocol === 17) {
      addUdpRows(l4Offset, l4Layer("UDP"));
    }
    if (l4Protocol === 6) {
      addTcpRows(l4Offset, l4Layer("TCP"));
    }
    if (l4Protocol === 1) {
      addIcmpRows(l4Layer("ICMP"), l4Offset);
    }
    if (l4Protocol === 132) {
      addSctpRows(l4Offset, l4Layer("SCTP"), l4Layer("SCTP DATA"), l4Layer("SCTP Chunk"));
    }
    if (l4Protocol === 47) {
      addGreRows(l4Offset);
    }
    return true;
  };
  const addGreRows = (greOffset: number) => {
    if (!rawPacketHasBytes(bytes, greOffset, 4)) {
      return;
    }
    const flags = rawPacketWord(bytes, greOffset);
    const protocolType = rawPacketWord(bytes, greOffset + 2);
    let payloadOffset = greOffset + 4;
    add("GRE", "Flags/version", greOffset, 2, "hex", formatPacketHexField(bytes, greOffset, 2));
    addMaskedNumber("GRE", "Checksum present", greOffset, 2, 0x8000, 15);
    addMaskedNumber("GRE", "Routing present", greOffset, 2, 0x4000, 14);
    addMaskedNumber("GRE", "Key present", greOffset, 2, 0x2000, 13);
    addMaskedNumber("GRE", "Sequence present", greOffset, 2, 0x1000, 12);
    addMaskedNumber("GRE", "Strict source route", greOffset, 2, 0x0800, 11);
    addMaskedNumber("GRE", "Recursion control", greOffset, 2, 0x0700, 8);
    addMaskedNumber("GRE", "Reserved flags", greOffset, 2, 0x00f8, 3);
    addMaskedNumber("GRE", "Version", greOffset, 2, 0x0007, 0);
    add("GRE", "Protocol type", greOffset + 2, 2, "hex", formatPacketHexField(bytes, greOffset + 2, 2));
    if ((flags & 0x8000) !== 0 && rawPacketHasBytes(bytes, payloadOffset, 4)) {
      add("GRE", "Checksum", payloadOffset, 2, "hex", formatPacketHexField(bytes, payloadOffset, 2));
      add("GRE", "Reserved", payloadOffset + 2, 2, "hex", formatPacketHexField(bytes, payloadOffset + 2, 2));
      payloadOffset += 4;
    }
    if ((flags & 0x2000) !== 0 && rawPacketHasBytes(bytes, payloadOffset, 4)) {
      add("GRE", "Key", payloadOffset, 4, "number", formatPacketNumberField(bytes, payloadOffset, 4));
      payloadOffset += 4;
    }
    if ((flags & 0x1000) !== 0 && rawPacketHasBytes(bytes, payloadOffset, 4)) {
      add("GRE", "Sequence", payloadOffset, 4, "number", formatPacketNumberField(bytes, payloadOffset, 4));
      payloadOffset += 4;
    }
    if (protocolType === 0x0800) {
      addIpv4Rows(payloadOffset, "Inner IPv4", "Inner");
    }
    if (protocolType === 0x86dd) {
      addIpv6Rows(payloadOffset, "Inner IPv6", "Inner");
    }
  };
  const addArpRows = (arpOffset: number, layer = "ARP") => {
    if (!rawPacketHasBytes(bytes, arpOffset, 28)) {
      return false;
    }
    add(layer, "Hardware type", arpOffset, 2, "number", formatPacketNumberField(bytes, arpOffset, 2));
    add(layer, "Protocol type", arpOffset + 2, 2, "hex", formatPacketHexField(bytes, arpOffset + 2, 2));
    add(layer, "Hardware size", arpOffset + 4, 1, "number", formatPacketNumberField(bytes, arpOffset + 4, 1));
    add(layer, "Protocol size", arpOffset + 5, 1, "number", formatPacketNumberField(bytes, arpOffset + 5, 1));
    add(layer, "Operation", arpOffset + 6, 2, "number", formatPacketNumberField(bytes, arpOffset + 6, 2));
    add(layer, "Sender MAC", arpOffset + 8, 6, "mac", formatPacketMac(bytes, arpOffset + 8));
    add(layer, "Sender IP", arpOffset + 14, 4, "ipv4", formatPacketIpv4(bytes, arpOffset + 14));
    add(layer, "Target MAC", arpOffset + 18, 6, "mac", formatPacketMac(bytes, arpOffset + 18));
    add(layer, "Target IP", arpOffset + 24, 4, "ipv4", formatPacketIpv4(bytes, arpOffset + 24));
    return true;
  };
  const addEthernetFrameRows = (etherOffset: number, prefix: string) => {
    if (!rawPacketHasBytes(bytes, etherOffset, 14)) {
      return false;
    }
    const ethernetLayer = `${prefix} Ethernet`;
    add(ethernetLayer, "Destination", etherOffset, 6, "mac", formatPacketMac(bytes, etherOffset));
    add(ethernetLayer, "Source", etherOffset + 6, 6, "mac", formatPacketMac(bytes, etherOffset + 6));
    add(ethernetLayer, "EtherType", etherOffset + 12, 2, "hex", formatPacketHexField(bytes, etherOffset + 12, 2));

    let nestedEtherType = rawPacketWord(bytes, etherOffset + 12);
    let nestedL3Offset = etherOffset + 14;
    let nestedVlanIndex = 0;
    while (
      (nestedEtherType === 0x8100 || nestedEtherType === 0x88a8 || nestedEtherType === 0x9100 || nestedEtherType === 0x9200)
      && rawPacketHasBytes(bytes, nestedL3Offset, 4)
      && nestedVlanIndex < 4
    ) {
      const vlanLayer = nestedVlanIndex === 0
        ? `${prefix} 802.1Q`
        : nestedVlanIndex === 1
          ? `${prefix} 802.1Q Inner`
          : `${prefix} 802.1Q ${nestedVlanIndex + 1}`;
      add(vlanLayer, "TCI", nestedL3Offset, 2, "hex", formatPacketHexField(bytes, nestedL3Offset, 2));
      addMaskedNumber(vlanLayer, "Priority", nestedL3Offset, 2, 0xe000, 13);
      addMaskedNumber(vlanLayer, "CFI", nestedL3Offset, 2, 0x1000, 12);
      addMaskedNumber(vlanLayer, "VLAN ID", nestedL3Offset, 2, 0x0fff, 0);
      add(vlanLayer, "Inner EtherType", nestedL3Offset + 2, 2, "hex", formatPacketHexField(bytes, nestedL3Offset + 2, 2));
      nestedEtherType = rawPacketWord(bytes, nestedL3Offset + 2);
      nestedL3Offset += 4;
      nestedVlanIndex += 1;
    }

    if (nestedEtherType === 0x0800) {
      addIpv4Rows(nestedL3Offset, `${prefix} IPv4`, prefix);
    }
    if (nestedEtherType === 0x86dd) {
      addIpv6Rows(nestedL3Offset, `${prefix} IPv6`, prefix);
    }
    if (nestedEtherType === 0x0806) {
      addArpRows(nestedL3Offset, `${prefix} ARP`);
    }
    return true;
  };
  const addVxlanRows = (vxlanOffset: number) => {
    if (!rawPacketHasBytes(bytes, vxlanOffset, 8)) {
      return;
    }
    add("VXLAN", "Flags", vxlanOffset, 1, "hex", formatPacketHexField(bytes, vxlanOffset, 1));
    addMaskedNumber("VXLAN", "I flag", vxlanOffset, 1, 0x08, 3);
    add("VXLAN", "Reserved", vxlanOffset + 1, 3, "hex", formatPacketHexField(bytes, vxlanOffset + 1, 3));
    add("VXLAN", "VNI", vxlanOffset + 4, 3, "number", formatPacketNumberField(bytes, vxlanOffset + 4, 3));
    add("VXLAN", "Reserved 2", vxlanOffset + 7, 1, "hex", formatPacketHexField(bytes, vxlanOffset + 7, 1));
    addEthernetFrameRows(vxlanOffset + 8, "VXLAN Inner");
  };
  const addGtpuRows = (gtpuOffset: number) => {
    if (!rawPacketHasBytes(bytes, gtpuOffset, 8)) {
      return;
    }
    const flags = bytes[gtpuOffset] ?? 0;
    let payloadOffset = gtpuOffset + 8;
    add("GTP-U", "Flags", gtpuOffset, 1, "hex", formatPacketHexField(bytes, gtpuOffset, 1));
    addMaskedNumber("GTP-U", "Version", gtpuOffset, 1, 0xe0, 5);
    addMaskedNumber("GTP-U", "Protocol type", gtpuOffset, 1, 0x10, 4);
    addMaskedNumber("GTP-U", "Reserved flag", gtpuOffset, 1, 0x08, 3);
    addMaskedNumber("GTP-U", "Extension header present", gtpuOffset, 1, 0x04, 2);
    addMaskedNumber("GTP-U", "Sequence present", gtpuOffset, 1, 0x02, 1);
    addMaskedNumber("GTP-U", "N-PDU present", gtpuOffset, 1, 0x01, 0);
    add("GTP-U", "Message type", gtpuOffset + 1, 1, "number", formatPacketNumberField(bytes, gtpuOffset + 1, 1));
    add("GTP-U", "Message length", gtpuOffset + 2, 2, "number", formatPacketNumberField(bytes, gtpuOffset + 2, 2));
    add("GTP-U", "TEID", gtpuOffset + 4, 4, "hex", formatPacketHexField(bytes, gtpuOffset + 4, 4));

    let nextExtensionHeader = 0;
    if ((flags & 0x07) !== 0 && rawPacketHasBytes(bytes, payloadOffset, 4)) {
      add("GTP-U", "Sequence", payloadOffset, 2, "number", formatPacketNumberField(bytes, payloadOffset, 2));
      add("GTP-U", "N-PDU", payloadOffset + 2, 1, "number", formatPacketNumberField(bytes, payloadOffset + 2, 1));
      add("GTP-U", "Next extension header", payloadOffset + 3, 1, "hex", formatPacketHexField(bytes, payloadOffset + 3, 1));
      nextExtensionHeader = bytes[payloadOffset + 3] ?? 0;
      payloadOffset += 4;
    }

    for (let extensionIndex = 0; nextExtensionHeader !== 0 && extensionIndex < 8; extensionIndex += 1) {
      if (!rawPacketHasBytes(bytes, payloadOffset, 1)) {
        return;
      }
      const extensionLength = bytes[payloadOffset] ?? 0;
      const extensionByteLength = extensionLength * 4;
      if (extensionByteLength < 4 || !rawPacketHasBytes(bytes, payloadOffset, extensionByteLength)) {
        return;
      }
      const extensionLayer = nextExtensionHeader === 0x40
        ? "GTP-U UDP Port Extension"
        : `GTP-U Extension 0x${nextExtensionHeader.toString(16).padStart(2, "0")}`;
      add(extensionLayer, "Length", payloadOffset, 1, "number", formatPacketNumberField(bytes, payloadOffset, 1));
      if (nextExtensionHeader === 0x40 && extensionByteLength >= 4) {
        add(extensionLayer, "UDP port", payloadOffset + 1, 2, "number", formatPacketNumberField(bytes, payloadOffset + 1, 2));
      } else if (extensionByteLength > 2) {
        add(extensionLayer, "Payload", payloadOffset + 1, extensionByteLength - 2, "hex", formatPacketHexField(bytes, payloadOffset + 1, extensionByteLength - 2));
      }
      add(extensionLayer, "Next extension header", payloadOffset + extensionByteLength - 1, 1, "hex", formatPacketHexField(bytes, payloadOffset + extensionByteLength - 1, 1));
      nextExtensionHeader = bytes[payloadOffset + extensionByteLength - 1] ?? 0;
      payloadOffset += extensionByteLength;
    }

    const innerVersion = (bytes[payloadOffset] ?? 0) >> 4;
    if (innerVersion === 4) {
      addIpv4Rows(payloadOffset, "GTP-U Inner IPv4", "GTP-U Inner");
    }
    if (innerVersion === 6) {
      addIpv6Rows(payloadOffset, "GTP-U Inner IPv6", "GTP-U Inner");
    }
  };

  if (bytes.length < 14) {
    return rows;
  }

  add("Ethernet", "Destination", 0, 6, "mac", formatPacketMac(bytes, 0));
  add("Ethernet", "Source", 6, 6, "mac", formatPacketMac(bytes, 6));
  add("Ethernet", "EtherType", 12, 2, "hex", formatPacketHexField(bytes, 12, 2));

  let etherType = rawPacketWord(bytes, 12);
  let l3Offset = 14;
  let vlanIndex = 0;
  while (
    (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100 || etherType === 0x9200)
    && rawPacketHasBytes(bytes, l3Offset, 4)
    && vlanIndex < 4
  ) {
    const layer = vlanIndex === 0 ? "802.1Q" : vlanIndex === 1 ? "802.1Q Inner" : `802.1Q ${vlanIndex + 1}`;
    add(layer, "TCI", l3Offset, 2, "hex", formatPacketHexField(bytes, l3Offset, 2));
    addMaskedNumber(layer, "Priority", l3Offset, 2, 0xe000, 13);
    addMaskedNumber(layer, "CFI", l3Offset, 2, 0x1000, 12);
    addMaskedNumber(layer, "VLAN ID", l3Offset, 2, 0x0fff, 0);
    add(layer, "Inner EtherType", l3Offset + 2, 2, "hex", formatPacketHexField(bytes, l3Offset + 2, 2));
    etherType = rawPacketWord(bytes, l3Offset + 2);
    l3Offset += 4;
    vlanIndex += 1;
  }

  if ((etherType === 0x8847 || etherType === 0x8848) && rawPacketHasBytes(bytes, l3Offset, 4)) {
    let mplsIndex = 0;
    while (rawPacketHasBytes(bytes, l3Offset, 4) && mplsIndex < 8) {
      const layer = mplsIndex === 0 ? "MPLS" : `MPLS ${mplsIndex + 1}`;
      add(layer, "Header", l3Offset, 4, "hex", formatPacketHexField(bytes, l3Offset, 4));
      addMaskedNumber(layer, "Label", l3Offset, 4, 0xfffff000, 12);
      addMaskedNumber(layer, "Traffic class", l3Offset, 4, 0x00000e00, 9);
      addMaskedNumber(layer, "Bottom of stack", l3Offset, 4, 0x00000100, 8);
      add(layer, "TTL", l3Offset + 3, 1, "number", formatPacketNumberField(bytes, l3Offset + 3, 1));
      const bottomOfStack = (bytes[l3Offset + 2] & 0x01) === 1;
      l3Offset += 4;
      mplsIndex += 1;
      if (bottomOfStack) {
        break;
      }
    }
    const version = (bytes[l3Offset] ?? 0) >> 4;
    if (version === 4) {
      etherType = 0x0800;
    } else if (version === 6) {
      etherType = 0x86dd;
    } else {
      return rows;
    }
  }

  if (etherType === 0x0806 && rawPacketHasBytes(bytes, l3Offset, 28)) {
    addArpRows(l3Offset);
    return rows;
  }

  if (etherType === 0x86dd) {
    addIpv6Rows(l3Offset);
    return rows;
  }

  if (etherType === 0x0800) {
    addIpv4Rows(l3Offset);
  }

  return rows;
}
