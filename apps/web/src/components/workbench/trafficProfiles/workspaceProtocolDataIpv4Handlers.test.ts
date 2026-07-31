import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataIpv4Handlers } from "./workspaceProtocolDataIpv4Handlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataIpv4Handlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataIpv4Handlers", () => {
  it("binds IPv4 source and destination address field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIpv4Destination("198.51.100.10")).toBe(true);
    expect(handlers.changeIpv4DestinationMode("Increment Host")).toBe(true);
    expect(handlers.changeIpv4DestinationCount("10000000000000")).toBe(true);
    expect(handlers.changeIpv4DestinationStep(2)).toBe(true);
    expect(handlers.changeIpv4Source("192.0.2.20")).toBe(true);
    expect(handlers.changeIpv4SourceMode("Decrement Host")).toBe(true);
    expect(handlers.changeIpv4SourceCount("42")).toBe(true);
    expect(handlers.changeIpv4SourceStep(3)).toBe(true);

    expect(patches).toEqual([
      { ipv4_dst: "198.51.100.10" },
      { ipv4_dst_mode: "Increment Host" },
      { ipv4_dst_count: "10000000000000" },
      { ipv4_dst_step: 2 },
      { ipv4_src: "192.0.2.20" },
      { ipv4_src_mode: "Decrement Host" },
      { ipv4_src_count: "42" },
      { ipv4_src_step: 3 }
    ]);
  });

  it("binds IPv4 DSCP, ECN, identification, and TTL field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIpv4Dscp(12)).toBe(true);
    expect(handlers.changeIpv4DscpMode("Increment")).toBe(true);
    expect(handlers.changeIpv4DscpCount(8)).toBe(true);
    expect(handlers.changeIpv4DscpStep(2)).toBe(true);
    expect(handlers.changeIpv4Ecn(3)).toBe(true);
    expect(handlers.changeIpv4EcnMode("Decrement")).toBe(true);
    expect(handlers.changeIpv4EcnCount(4)).toBe(true);
    expect(handlers.changeIpv4EcnStep(1)).toBe(true);
    expect(handlers.changeIpv4Identification(4660)).toBe(true);
    expect(handlers.changeIpv4IdentificationMode("Random")).toBe(true);
    expect(handlers.changeIpv4IdentificationCount(16)).toBe(true);
    expect(handlers.changeIpv4IdentificationStep(4)).toBe(true);
    expect(handlers.changeIpv4Ttl(64)).toBe(true);
    expect(handlers.changeIpv4TtlMode("Increment")).toBe(true);
    expect(handlers.changeIpv4TtlCount(32)).toBe(true);
    expect(handlers.changeIpv4TtlStep(5)).toBe(true);

    expect(patches).toEqual([
      { ipv4_dscp: 12 },
      { ipv4_dscp_mode: "Increment" },
      { ipv4_dscp_count: 8 },
      { ipv4_dscp_step: 2 },
      { ipv4_ecn: 3 },
      { ipv4_ecn_mode: "Decrement" },
      { ipv4_ecn_count: 4 },
      { ipv4_ecn_step: 1 },
      { ipv4_id: 4660 },
      { ipv4_id_mode: "Random" },
      { ipv4_id_count: 16 },
      { ipv4_id_step: 4 },
      { ipv4_ttl: 64 },
      { ipv4_ttl_mode: "Increment" },
      { ipv4_ttl_count: 32 },
      { ipv4_ttl_step: 5 }
    ]);
  });

  it("binds IPv4 flags, fragment offset, and checksum edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIpv4DfFlag(true)).toBe(true);
    expect(handlers.changeIpv4MfFlag(true)).toBe(true);
    expect(handlers.changeIpv4FragmentOffset(128)).toBe(true);
    expect(handlers.changeIpv4FragmentOffsetMode("Increment")).toBe(true);
    expect(handlers.changeIpv4FragmentOffsetCount(12)).toBe(true);
    expect(handlers.changeIpv4FragmentOffsetStep(8)).toBe(true);
    expect(handlers.changeIpv4ChecksumOverride(true)).toBe(true);
    expect(handlers.changeIpv4Checksum("B3E3")).toBe(true);

    expect(patches).toEqual([
      { ipv4_flag_df: true },
      { ipv4_flag_mf: true },
      { ipv4_fragment_offset: 128 },
      { ipv4_fragment_offset_mode: "Increment" },
      { ipv4_fragment_offset_count: 12 },
      { ipv4_fragment_offset_step: 8 },
      { ipv4_checksum_override: true },
      { ipv4_checksum: "B3E3" }
    ]);
  });

  it("binds standalone IPv4 patches without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeIpv4Destination("198.51.100.10")).toBe(true);
    expect(handlers.changeIpv4Dscp(12)).toBe(true);
    expect(handlers.changeIpv4Checksum("B3E3")).toBe(true);

    expect(patches).toEqual([
      { ipv4_dst: "198.51.100.10" },
      { ipv4_dscp: 12 },
      { ipv4_checksum: "B3E3" }
    ]);
  });
});
