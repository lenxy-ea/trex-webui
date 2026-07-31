import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataTunnelHandlers } from "./workspaceProtocolDataTunnelHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataTunnelHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

function stream(values: Partial<ProfileWorkbenchStream> = {}): ProfileWorkbenchStream {
  return values as ProfileWorkbenchStream;
}

describe("workspaceProtocolDataTunnelHandlers", () => {
  it("binds VXLAN header and inner packet edits", () => {
    const { handlers, patches } = collectHandlers(stream({}));

    expect(handlers.changeVxlanVni(4096)).toBe(true);
    expect(handlers.changeVxlanVniMode("Increment")).toBe(true);
    expect(handlers.changeVxlanVniCount(128)).toBe(true);
    expect(handlers.changeVxlanVniStep(16)).toBe(true);
    expect(handlers.changeVxlanInnerEtherSource("00:11:22:33:44:55")).toBe(true);
    expect(handlers.changeVxlanInnerIpv4Source("192.0.2.10")).toBe(true);
    expect(handlers.changeVxlanInnerIpv4TtlMode("Decrement")).toBe(true);
    expect(handlers.changeVxlanInnerIpv6DestinationMode("Random Host")).toBe(true);
    expect(handlers.changeVxlanInnerL4DestinationPortStep(7)).toBe(true);

    expect(patches).toEqual([
      { vxlan_vni: 4096 },
      { vxlan_vni_mode: "Increment" },
      { vxlan_vni_count: 128 },
      { vxlan_vni_step: 16 },
      { vxlan_inner_ether_src: "00:11:22:33:44:55" },
      { vxlan_inner_ipv4_src: "192.0.2.10" },
      { vxlan_inner_ipv4_ttl_mode: "Decrement" },
      { vxlan_inner_ipv6_dst_mode: "Random Host" },
      { vxlan_inner_l4_dst_port_step: 7 }
    ]);
  });

  it("binds GTP-U core, extension, and inner packet edits", () => {
    const { handlers, patches } = collectHandlers(stream({
      gtpu_extension_udp_port_mode: "Increment",
      gtpu_npdu_mode: "Decrement",
      gtpu_sequence_mode: "Increment"
    }));

    expect(handlers.changeGtpuMessageType(255)).toBe(true);
    expect(handlers.changeGtpuTeidMode("Increment")).toBe(true);
    expect(handlers.changeGtpuSequenceSelection(true)).toBe(true);
    expect(handlers.changeGtpuNpduSelection(false)).toBe(true);
    expect(handlers.changeGtpuExtensionSelection(true)).toBe(true);
    expect(handlers.changeGtpuExtensionUdpPortStep(9)).toBe(true);
    expect(handlers.changeGtpuInnerIpv4TtlMode("Increment")).toBe(true);
    expect(handlers.changeGtpuInnerIpv4SourceMode("Random Host")).toBe(true);
    expect(handlers.changeGtpuInnerIpv6DestinationStep(4)).toBe(true);
    expect(handlers.changeGtpuInnerL4DestinationPortStep(11)).toBe(true);

    expect(patches).toEqual([
      { gtpu_message_type: 255 },
      { gtpu_teid_mode: "Increment" },
      {
        gtpu_sequence_enabled: true,
        gtpu_sequence_mode: "Increment"
      },
      {
        gtpu_npdu_enabled: false,
        gtpu_npdu_mode: "Fixed"
      },
      {
        gtpu_extension_enabled: true,
        gtpu_extension_udp_port_mode: "Increment"
      },
      { gtpu_extension_udp_port_step: 9 },
      { gtpu_inner_ipv4_ttl_mode: "Increment" },
      { gtpu_inner_ipv4_src_mode: "Random Host" },
      { gtpu_inner_ipv6_dst_step: 4 },
      { gtpu_inner_l4_dst_port_step: 11 }
    ]);
  });

  it("binds GRE checksum, key, sequence, and inner packet edits", () => {
    const { handlers, patches } = collectHandlers(stream({
      frame_length: 64,
      gre_checksum_override: true,
      gre_key_mode: "Increment",
      gre_sequence_mode: "Random"
    }));

    expect(handlers.changeGreChecksumSelection(true)).toBe(true);
    expect(handlers.changeGreChecksum("BEEF")).toBe(true);
    expect(handlers.changeGreKeyMode("Increment")).toBe(true);
    expect(handlers.changeGreSequenceStep(9)).toBe(true);
    expect(handlers.changeGreInnerIpv4Source("172.18.0.10")).toBe(true);
    expect(handlers.changeGreInnerIpv4TtlMode("Increment")).toBe(true);
    expect(handlers.changeGreInnerIpv6SourceMode("Increment Host")).toBe(true);
    expect(handlers.changeGreInnerL4DestinationPortStep(17)).toBe(true);

    expect(patches).toEqual([
      {
        frame_length: 100,
        gre_checksum_override: true,
        gre_checksum_present: true
      },
      { gre_checksum: "BEEF" },
      {
        gre_checksum_override: false,
        gre_checksum_present: false,
        gre_key_mode: "Increment",
        gre_key_present: true
      },
      { gre_sequence_step: 9 },
      { gre_inner_ipv4_src: "172.18.0.10" },
      {
        gre_checksum_override: false,
        gre_checksum_present: false,
        gre_inner_ipv4_ttl_mode: "Increment"
      },
      {
        gre_checksum_override: false,
        gre_checksum_present: false,
        gre_inner_ipv6_src_mode: "Increment Host"
      },
      { gre_inner_l4_dst_port_step: 17 }
    ]);
  });

  it("does not synthesize selected-stream-dependent tunnel selections without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeGtpuSequenceSelection(true)).toBe(false);
    expect(handlers.changeGreChecksumSelection(true)).toBe(false);
    expect(handlers.changeVxlanVni(4096)).toBe(true);

    expect(patches).toEqual([{ vxlan_vni: 4096 }]);
  });
});
