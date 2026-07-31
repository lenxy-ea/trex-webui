import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataIcmpHandlers } from "./workspaceProtocolDataIcmpHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataIcmpHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataIcmpHandlers", () => {
  it("binds ICMP type and code edits", () => {
    const { handlers, patches } = collectHandlers({
      icmp_checksum_override: true,
      icmp_code_mode: "Fixed",
      icmp_type_mode: "Fixed",
      packet_type: "Ethernet/IPv4/ICMP"
    } as ProfileWorkbenchStream);

    expect(handlers.changeIcmpType(8)).toBe(true);
    expect(handlers.changeIcmpTypeMode("Increment")).toBe(true);
    expect(handlers.changeIcmpTypeCount(4)).toBe(true);
    expect(handlers.changeIcmpTypeStep(1)).toBe(true);
    expect(handlers.changeIcmpCode(0)).toBe(true);
    expect(handlers.changeIcmpCodeMode("Decrement")).toBe(true);
    expect(handlers.changeIcmpCodeCount(3)).toBe(true);
    expect(handlers.changeIcmpCodeStep(2)).toBe(true);

    expect(patches).toEqual([
      {
        icmp_code_mode: "Fixed",
        icmp_identifier_mode: "Fixed",
        icmp_sequence_mode: "Fixed",
        icmp_type: 8,
        icmp_type_mode: "Fixed"
      },
      {
        icmp_checksum_override: false,
        icmp_type_mode: "Increment"
      },
      { icmp_type_count: 4 },
      { icmp_type_step: 1 },
      { icmp_code: 0 },
      {
        icmp_checksum_override: false,
        icmp_code_mode: "Decrement"
      },
      { icmp_code_count: 3 },
      { icmp_code_step: 2 }
    ]);
  });

  it("binds ICMP identifier, sequence, and checksum edits", () => {
    const { handlers, patches } = collectHandlers({
      icmp_checksum_override: true,
      icmp_identifier_mode: "Fixed",
      icmp_sequence_mode: "Fixed"
    } as ProfileWorkbenchStream);

    expect(handlers.changeIcmpIdentifier(100)).toBe(true);
    expect(handlers.changeIcmpIdentifierMode("Increment")).toBe(true);
    expect(handlers.changeIcmpIdentifierCount(5)).toBe(true);
    expect(handlers.changeIcmpIdentifierStep(1)).toBe(true);
    expect(handlers.changeIcmpSequence(200)).toBe(true);
    expect(handlers.changeIcmpSequenceMode("Random")).toBe(true);
    expect(handlers.changeIcmpSequenceCount(6)).toBe(true);
    expect(handlers.changeIcmpSequenceStep(2)).toBe(true);
    expect(handlers.changeIcmpChecksumOverride(true)).toBe(true);
    expect(handlers.changeIcmpChecksum("B3E3")).toBe(true);

    expect(patches).toEqual([
      { icmp_identifier: 100 },
      {
        icmp_checksum_override: false,
        icmp_identifier_mode: "Increment"
      },
      { icmp_identifier_count: 5 },
      { icmp_identifier_step: 1 },
      { icmp_sequence: 200 },
      {
        icmp_checksum_override: false,
        icmp_sequence_mode: "Random"
      },
      { icmp_sequence_count: 6 },
      { icmp_sequence_step: 2 },
      { icmp_checksum_override: true },
      { icmp_checksum: "B3E3" }
    ]);
  });

  it("preserves ICMPv6 control type semantics that depend on the selected stream", () => {
    const { handlers, patches } = collectHandlers({
      ether_src: "00:11:22:33:44:55",
      frame_length: 64,
      icmpv6_nd_include_option: false,
      ipv6_dst: "2001:db8::2",
      packet_type: "Ethernet/IPv6/ICMPv6"
    } as ProfileWorkbenchStream);

    expect(handlers.changeIcmpType(135)).toBe(true);

    expect(patches).toEqual([
      {
        frame_length: 82,
        frame_length_type: "Fixed",
        icmp_checksum_override: false,
        icmp_code: 0,
        icmp_code_mode: "Fixed",
        icmp_identifier_mode: "Fixed",
        icmp_sequence_mode: "Fixed",
        icmp_type: 135,
        icmp_type_mode: "Fixed",
        icmpv6_nd_include_option: false,
        icmpv6_nd_option_mac: "00:11:22:33:44:55",
        icmpv6_nd_target: "2001:db8::2",
        ipv6_hop_limit: 255,
        ipv6_hop_limit_mode: "Fixed"
      }
    ]);
  });

  it("requires a selected stream only for checksum-coupled ICMP mode edits", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeIcmpType(8)).toBe(true);
    expect(handlers.changeIcmpTypeMode("Increment")).toBe(false);
    expect(handlers.changeIcmpTypeCount(4)).toBe(true);
    expect(handlers.changeIcmpTypeStep(1)).toBe(true);
    expect(handlers.changeIcmpCode(0)).toBe(true);
    expect(handlers.changeIcmpCodeMode("Decrement")).toBe(false);
    expect(handlers.changeIcmpIdentifier(100)).toBe(true);
    expect(handlers.changeIcmpIdentifierMode("Random")).toBe(false);
    expect(handlers.changeIcmpSequence(200)).toBe(true);
    expect(handlers.changeIcmpSequenceMode("Increment")).toBe(false);
    expect(handlers.changeIcmpChecksum("B3E3")).toBe(true);

    expect(patches).toEqual([
      {
        icmp_code_mode: "Fixed",
        icmp_identifier_mode: "Fixed",
        icmp_sequence_mode: "Fixed",
        icmp_type: 8,
        icmp_type_mode: "Fixed"
      },
      { icmp_type_count: 4 },
      { icmp_type_step: 1 },
      { icmp_code: 0 },
      { icmp_identifier: 100 },
      { icmp_sequence: 200 },
      { icmp_checksum: "B3E3" }
    ]);
  });
});
