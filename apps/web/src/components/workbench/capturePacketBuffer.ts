import type { TrexCapturePacket } from "../../api";

export const CAPTURE_PACKET_RETENTION_MAX_COUNT = 2_000;
export const CAPTURE_PACKET_RETENTION_MAX_BYTES = 8 * 1024 * 1024;

export type CapturePacketBuffer = {
  dropped: number;
  packets: TrexCapturePacket[];
};

function retainedPacketBytes(packet: TrexCapturePacket) {
  let characters =
    packet.binary_base64.length
    + packet.hex_preview.length
    + packet.destination.length
    + packet.source.length
    + packet.type.length
    + packet.mode.length
    + packet.info.length;

  for (const layer of packet.decoded_layers ?? []) {
    characters += layer.name.length;
    for (const field of layer.fields) {
      characters += field.name.length + field.value.length;
    }
  }

  // JavaScript strings commonly occupy two bytes per character. The fixed
  // allowance covers the packet object, numeric fields, array slots, and keys.
  return characters * 2 + 256;
}

export function appendCapturePackets(
  current: CapturePacketBuffer,
  incoming: TrexCapturePacket[]
): CapturePacketBuffer {
  if (incoming.length === 0) {
    return current;
  }

  const candidates = [...current.packets, ...incoming];
  const retained: TrexCapturePacket[] = [];
  let retainedBytes = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (retained.length >= CAPTURE_PACKET_RETENTION_MAX_COUNT) {
      break;
    }
    const packet = candidates[index];
    const packetBytes = retainedPacketBytes(packet);
    if (packetBytes > CAPTURE_PACKET_RETENTION_MAX_BYTES) {
      continue;
    }
    if (retainedBytes + packetBytes > CAPTURE_PACKET_RETENTION_MAX_BYTES) {
      break;
    }
    retained.push(packet);
    retainedBytes += packetBytes;
  }

  retained.reverse();
  return {
    dropped: current.dropped + candidates.length - retained.length,
    packets: retained
  };
}
