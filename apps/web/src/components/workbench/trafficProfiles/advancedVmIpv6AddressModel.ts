import type { ProfileWorkbenchStream } from "../../../api";
import {
  advancedVmDefaultBody,
  type AdvancedVmBody
} from "./model";
import { largeUnitCountNumber } from "./scalarValueModel";
import { ipv4Parts } from "./advancedVmValueModel";

function ipv6AddressToBigInt(value: string | null | undefined): bigint | null {
  const normalized = (value ?? "").trim().split("%", 1)[0];
  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  if (candidate.includes(".")) {
    const parts = candidate.split(":");
    const ipv4Part = parts.pop() ?? "";
    const ipv4Bytes = ipv4Parts(ipv4Part);
    if (ipv4Bytes.every((part) => part === 0) && ipv4Part !== "0.0.0.0") {
      return null;
    }
    const high = ((ipv4Bytes[0] << 8) | ipv4Bytes[1]).toString(16);
    const low = ((ipv4Bytes[2] << 8) | ipv4Bytes[3]).toString(16);
    candidate = `${parts.join(":")}:${high}:${low}`;
  }

  const compressionParts = candidate.split("::");
  if (compressionParts.length > 2) {
    return null;
  }
  const [headText, tailText = ""] = compressionParts;
  const parseHextets = (text: string) => (
    text.length === 0
      ? []
      : text.split(":").map((part) => Number.parseInt(part, 16))
  );
  const head = parseHextets(headText);
  const tail = parseHextets(tailText);
  const parts = [...head, ...tail];
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    return null;
  }
  if (compressionParts.length === 1 && head.length !== 8) {
    return null;
  }
  if (compressionParts.length === 2 && head.length + tail.length > 7) {
    return null;
  }
  const hextets = compressionParts.length === 2
    ? [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail]
    : head;
  if (hextets.length !== 8) {
    return null;
  }
  return hextets.reduce((result, part) => (result << 16n) | BigInt(part), 0n);
}

type Ipv6FieldEngineSuffix = {
  initValue: number;
  maxValue: number;
  size: 1 | 2 | 4 | 8;
};

export function ipv6FieldEngineSuffix(address: string, count: number) {
  const value = ipv6AddressToBigInt(address);
  if (value === null) {
    return null;
  }
  const boundedCount = Math.max(2, Math.min(100_000_000, Math.trunc(count)));
  const countValue = BigInt(Number.isFinite(boundedCount) ? boundedCount : 16);
  const suffixCandidates: Array<{ limit: bigint; mask: bigint; size: Ipv6FieldEngineSuffix["size"] }> = [
    { limit: 256n, mask: 0xffn, size: 1 },
    { limit: 65_536n, mask: 0xffffn, size: 2 },
    { limit: 4_294_967_296n, mask: 0xffffffffn, size: 4 },
    { limit: 18_446_744_073_709_551_616n, mask: 0xffffffffffffffffn, size: 8 }
  ];
  for (const candidate of suffixCandidates) {
    const initValue = value & candidate.mask;
    if (candidate.size !== 8 && initValue + countValue >= candidate.limit) {
      continue;
    }
    const maxValue = initValue + countValue - 1n;
    if (initValue > BigInt(Number.MAX_SAFE_INTEGER) || maxValue > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return { initValue: Number(initValue), maxValue: Number(maxValue), size: candidate.size };
  }
  return null;
}

export function buildIpv6AddressIncVmBody({
  address,
  baseOffset,
  checksumInstruction,
  count,
  name,
  step
}: {
  address: string;
  baseOffset: number;
  checksumInstruction?: Record<string, unknown>;
  count: number;
  name: string;
  step: number;
}): AdvancedVmBody {
  const suffix = ipv6FieldEngineSuffix(address, count);
  if (!suffix) {
    return advancedVmDefaultBody;
  }
  return {
    instructions: [
      {
        init_value: suffix.initValue,
        max_value: suffix.maxValue,
        min_value: suffix.initValue,
        name,
        op: "inc",
        size: suffix.size,
        step,
        type: "flow_var"
      },
      {
        add_value: 0,
        is_big_endian: true,
        name,
        pkt_offset: baseOffset + 16 - suffix.size,
        type: "write_flow_var"
      },
      ...(checksumInstruction ? [checksumInstruction] : [])
    ],
    split_by_var: name
  };
}

export function ipv6AddressFlowVarInstructions({
  address,
  baseOffset,
  count,
  name,
  step
}: {
  address: string;
  baseOffset: number;
  count: number;
  name: string;
  step: number;
}) {
  const suffix = ipv6FieldEngineSuffix(address, count);
  if (!suffix) {
    return null;
  }
  return [
    {
      init_value: suffix.initValue,
      max_value: suffix.maxValue,
      min_value: suffix.initValue,
      name,
      op: "inc",
      size: suffix.size,
      step,
      type: "flow_var"
    },
    {
      add_value: 0,
      is_big_endian: true,
      name,
      pkt_offset: baseOffset + 16 - suffix.size,
      type: "write_flow_var"
    }
  ];
}

export function isSafeIpv6AddressVmTarget(
  stream: ProfileWorkbenchStream | null | undefined,
  address: string | null | undefined,
  count: number | string | null | undefined
) {
  return Boolean(stream && ipv6FieldEngineSuffix(address ?? "", largeUnitCountNumber(count ?? 16)) !== null);
}
