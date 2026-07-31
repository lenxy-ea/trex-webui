import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  buildArpOperationIncVmBody,
  buildArpSenderIpIncVmBody,
  buildArpSenderMacIncVmBody,
  buildArpTargetIpIncVmBody,
  buildArpTargetMacIncVmBody,
  isArpStream
} from "./advancedVmArpModel";

function stream(fields: Partial<ProfileWorkbenchStream>) {
  return fields as ProfileWorkbenchStream;
}

function rawArpPacketBase64() {
  const rawPacket = [
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
    0x81, 0x00,
    0x00, 0x64,
    0x08, 0x06,
    0x00, 0x01,
    0x08, 0x00,
    0x06,
    0x04,
    0x00, 0x02,
    0x00, 0x11, 0x22, 0x33, 0x44, 0x50,
    0x0a, 0x00, 0x00, 0x0a,
    0x66, 0x55, 0x44, 0x33, 0x22, 0x10,
    0x0a, 0x00, 0x00, 0x14
  ];
  return btoa(String.fromCharCode(...rawPacket));
}

describe("advancedVmArpModel", () => {
  const structuredArpStream = stream({
    arp_operation: 1,
    arp_operation_count: 2,
    arp_operation_step: 1,
    arp_sender_ip: "16.0.0.1",
    arp_sender_ip_count: 4,
    arp_sender_ip_step: 1,
    arp_sender_mac: "00:11:22:33:44:55",
    arp_sender_mac_count: 4,
    arp_sender_mac_step: 1,
    arp_target_ip: "48.0.0.2",
    arp_target_ip_count: 8,
    arp_target_ip_step: 1,
    arp_target_mac: "66:55:44:33:22:10",
    arp_target_mac_count: 8,
    arp_target_mac_step: 1,
    packet_type: "Ethernet/ARP"
  });

  const rawArpStream = stream({
    ...structuredArpStream,
    packet_binary_base64: rawArpPacketBase64(),
    packet_type: "Ethernet"
  });

  it("recognizes structured and raw ARP streams", () => {
    expect(isArpStream(structuredArpStream)).toBe(true);
    expect(isArpStream(rawArpStream)).toBe(true);
    expect(isArpStream(stream({ packet_type: "Ethernet/IPv4/UDP" }))).toBe(false);
  });

  it("builds structured ARP Field Engine writes", () => {
    expect(buildArpOperationIncVmBody(structuredArpStream)).toEqual({
      instructions: [
        { init_value: 1, max_value: 2, min_value: 1, name: "arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_operation", pkt_offset: 20, type: "write_flow_var" }
      ],
      split_by_var: "arp_operation"
    });
    expect(buildArpSenderIpIncVmBody(structuredArpStream)).toMatchObject({
      instructions: [
        { init_value: 1, name: "arp_sender_ip", size: 1, step: 1 },
        { name: "arp_sender_ip", pkt_offset: 31 }
      ],
      split_by_var: "arp_sender_ip"
    });
    expect(buildArpTargetIpIncVmBody(structuredArpStream)).toMatchObject({
      instructions: [
        { init_value: 2, name: "arp_target_ip", size: 1, step: 1 },
        { name: "arp_target_ip", pkt_offset: 41 }
      ],
      split_by_var: "arp_target_ip"
    });
    expect(buildArpSenderMacIncVmBody(structuredArpStream)).toMatchObject({
      instructions: [
        { init_value: 85, name: "arp_sender_mac", size: 1, step: 1 },
        { name: "arp_sender_mac", pkt_offset: 27 }
      ],
      split_by_var: "arp_sender_mac"
    });
    expect(buildArpTargetMacIncVmBody(structuredArpStream)).toMatchObject({
      instructions: [
        { init_value: 16, name: "arp_target_mac", size: 1, step: 1 },
        { name: "arp_target_mac", pkt_offset: 37 }
      ],
      split_by_var: "arp_target_mac"
    });
  });

  it("builds raw VLAN ARP Field Engine writes from packet bytes", () => {
    expect(buildArpOperationIncVmBody(rawArpStream)).toEqual({
      instructions: [
        { init_value: 2, max_value: 3, min_value: 2, name: "arp_operation", op: "inc", size: 2, step: 1, type: "flow_var" },
        { add_value: 0, is_big_endian: true, name: "arp_operation", pkt_offset: 24, type: "write_flow_var" }
      ],
      split_by_var: "arp_operation"
    });
    expect(buildArpSenderIpIncVmBody(rawArpStream)).toMatchObject({
      instructions: [
        { init_value: 10, name: "arp_sender_ip", size: 1 },
        { name: "arp_sender_ip", pkt_offset: 35 }
      ]
    });
    expect(buildArpTargetIpIncVmBody(rawArpStream)).toMatchObject({
      instructions: [
        { init_value: 20, name: "arp_target_ip", size: 1 },
        { name: "arp_target_ip", pkt_offset: 45 }
      ]
    });
    expect(buildArpSenderMacIncVmBody(rawArpStream)).toMatchObject({
      instructions: [
        { init_value: 80, name: "arp_sender_mac", size: 1 },
        { name: "arp_sender_mac", pkt_offset: 31 }
      ]
    });
    expect(buildArpTargetMacIncVmBody(rawArpStream)).toMatchObject({
      instructions: [
        { init_value: 16, name: "arp_target_mac", size: 1 },
        { name: "arp_target_mac", pkt_offset: 41 }
      ]
    });
  });
});
