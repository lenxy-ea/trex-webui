import { describe, expect, it } from "vitest";

import type { TrexCapturePacket } from "../../api";
import {
  appendCapturePackets,
  CAPTURE_PACKET_RETENTION_MAX_BYTES,
  CAPTURE_PACKET_RETENTION_MAX_COUNT
} from "./capturePacketBuffer";

function packet(index: number, payload = "AA=="): TrexCapturePacket {
  return {
    binary_base64: payload,
    decoded_layers: [],
    destination: "00:00:00:00:00:02",
    hex_preview: "aa",
    index,
    info: "packet",
    length: 1,
    mode: "rx",
    port: 0,
    source: "00:00:00:00:00:01",
    time: index,
    type: "Ethernet",
    wirelen: 1
  };
}

describe("appendCapturePackets", () => {
  it("retains only the newest packets within the count budget", () => {
    const incoming = Array.from(
      { length: CAPTURE_PACKET_RETENTION_MAX_COUNT + 5 },
      (_, index) => packet(index)
    );

    const result = appendCapturePackets({ dropped: 0, packets: [] }, incoming);

    expect(result.packets).toHaveLength(CAPTURE_PACKET_RETENTION_MAX_COUNT);
    expect(result.packets[0].index).toBe(5);
    expect(result.packets[result.packets.length - 1]?.index).toBe(CAPTURE_PACKET_RETENTION_MAX_COUNT + 4);
    expect(result.dropped).toBe(5);
  });

  it("applies the byte budget and carries the cumulative discarded count", () => {
    const largePayload = "a".repeat(Math.floor(CAPTURE_PACKET_RETENTION_MAX_BYTES / 3));
    const first = appendCapturePackets({ dropped: 2, packets: [] }, [packet(1, largePayload), packet(2, largePayload)]);
    const second = appendCapturePackets(first, [packet(3, largePayload)]);

    expect(first.packets.map((entry) => entry.index)).toEqual([2]);
    expect(first.dropped).toBe(3);
    expect(second.packets.map((entry) => entry.index)).toEqual([3]);
    expect(second.dropped).toBe(4);
  });

  it("returns the existing buffer when no packets arrive", () => {
    const current = { dropped: 1, packets: [packet(4)] };
    expect(appendCapturePackets(current, [])).toBe(current);
  });
});
