import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolSelectionHandlers } from "./workspaceProtocolSelectionHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolSelectionHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolSelectionHandlers", () => {
  it("binds simple protocol selection patches", () => {
    const { handlers, patches } = collectHandlers({ packet_type: "Ethernet/IPv4/UDP" } as ProfileWorkbenchStream);

    expect(handlers.changeVlanSelection(true)).toBe(true);
    expect(handlers.changeMplsSelection(true)).toBe(true);
    expect(handlers.changePayloadSelection(false)).toBe(true);

    expect(patches).toEqual([
      { vlan_enabled: true },
      { mpls_enabled: true },
      { payload_enabled: false }
    ]);
  });

  it("binds stream-dependent L3, L4, and tunnel selection patches", () => {
    const { handlers, patches } = collectHandlers({
      frame_length: 64,
      frame_length_max: 64,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_inner_ip_version: "IPv4"
    } as ProfileWorkbenchStream);

    expect(handlers.changeL3Selection("IPv6")).toBe(true);
    expect(handlers.changeL4Selection("TCP")).toBe(true);
    expect(handlers.changeTunnelSelection("vxlan")).toBe(true);

    expect(patches[0]).toMatchObject({ packet_type: "Ethernet/IPv6/UDP" });
    expect(patches[1]).toMatchObject({ packet_type: "Ethernet/IPv4/TCP" });
    expect(patches[2]).toMatchObject({
      frame_length_type: "Fixed",
      gtpu_enabled: false,
      l4_dst_port: 4789,
      l4_dst_port_override: true,
      l4_src_port: 1337,
      l4_src_port_override: true,
      packet_type: "Ethernet/IPv4/UDP",
      vxlan_enabled: true
    });
  });

  it("does not synthesize stream-dependent packet selection without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeL3Selection("IPv6")).toBe(false);
    expect(handlers.changeL4Selection("TCP")).toBe(false);

    expect(patches).toEqual([]);
  });
});
