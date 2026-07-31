import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataArpHandlers } from "./workspaceProtocolDataArpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataArpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataArpHandlers", () => {
  it("binds ARP header and operation field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeArpHardwareType(1)).toBe(true);
    expect(handlers.changeArpProtocolType("0800")).toBe(true);
    expect(handlers.changeArpHardwareSize(6)).toBe(true);
    expect(handlers.changeArpProtocolSize(4)).toBe(true);
    expect(handlers.changeArpOperation(2)).toBe(true);
    expect(handlers.changeArpOperationMode("Increment")).toBe(true);
    expect(handlers.changeArpOperationCount(8)).toBe(true);
    expect(handlers.changeArpOperationStep(1)).toBe(true);

    expect(patches).toEqual([
      { arp_hardware_type: 1 },
      { arp_protocol_type: "0800" },
      { arp_hardware_size: 6 },
      { arp_protocol_size: 4 },
      { arp_operation: 2 },
      { arp_operation_mode: "Increment" },
      { arp_operation_count: 8 },
      { arp_operation_step: 1 }
    ]);
  });

  it("binds ARP sender and target address field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeArpSenderMac("00:11:22:33:44:55")).toBe(true);
    expect(handlers.changeArpSenderMacMode("Increment")).toBe(true);
    expect(handlers.changeArpSenderMacCount(2)).toBe(true);
    expect(handlers.changeArpSenderMacStep(1)).toBe(true);
    expect(handlers.changeArpSenderIp("192.0.2.10")).toBe(true);
    expect(handlers.changeArpSenderIpMode("Decrement Host")).toBe(true);
    expect(handlers.changeArpSenderIpCount(3)).toBe(true);
    expect(handlers.changeArpSenderIpStep(2)).toBe(true);
    expect(handlers.changeArpTargetMac("66:77:88:99:aa:bb")).toBe(true);
    expect(handlers.changeArpTargetMacMode("Random")).toBe(true);
    expect(handlers.changeArpTargetMacCount(4)).toBe(true);
    expect(handlers.changeArpTargetMacStep(3)).toBe(true);
    expect(handlers.changeArpTargetIp("198.51.100.20")).toBe(true);
    expect(handlers.changeArpTargetIpMode("Increment Host")).toBe(true);
    expect(handlers.changeArpTargetIpCount(5)).toBe(true);
    expect(handlers.changeArpTargetIpStep(4)).toBe(true);

    expect(patches).toEqual([
      { arp_sender_mac: "00:11:22:33:44:55" },
      { arp_sender_mac_mode: "Increment" },
      { arp_sender_mac_count: 2 },
      { arp_sender_mac_step: 1 },
      { arp_sender_ip: "192.0.2.10" },
      { arp_sender_ip_mode: "Decrement Host" },
      { arp_sender_ip_count: 3 },
      { arp_sender_ip_step: 2 },
      { arp_target_mac: "66:77:88:99:aa:bb" },
      { arp_target_mac_mode: "Random" },
      { arp_target_mac_count: 4 },
      { arp_target_mac_step: 3 },
      { arp_target_ip: "198.51.100.20" },
      { arp_target_ip_mode: "Increment Host" },
      { arp_target_ip_count: 5 },
      { arp_target_ip_step: 4 }
    ]);
  });

  it("binds ARP standalone patches without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeArpHardwareType(1)).toBe(true);
    expect(handlers.changeArpSenderMac("00:11:22:33:44:55")).toBe(true);
    expect(handlers.changeArpTargetIp("198.51.100.20")).toBe(true);

    expect(patches).toEqual([
      { arp_hardware_type: 1 },
      { arp_sender_mac: "00:11:22:33:44:55" },
      { arp_target_ip: "198.51.100.20" }
    ]);
  });
});
