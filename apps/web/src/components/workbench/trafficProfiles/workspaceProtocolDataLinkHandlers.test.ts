import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataLinkHandlers } from "./workspaceProtocolDataLinkHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataLinkHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataLinkHandlers", () => {
  it("binds media access and outer VLAN field edits", () => {
    const { handlers, patches } = collectHandlers({ vlan2_enabled: false } as ProfileWorkbenchStream);

    expect(handlers.changeEtherDestination("00:11:22:33:44:55")).toBe(true);
    expect(handlers.changeEtherDestinationMode("Increment")).toBe(true);
    expect(handlers.changeEtherDestinationCount(16)).toBe(true);
    expect(handlers.changeEtherDestinationStep(2)).toBe(true);
    expect(handlers.changeEtherSource("66:77:88:99:aa:bb")).toBe(true);
    expect(handlers.changeEtherSourceMode("Decrement")).toBe(true);
    expect(handlers.changeEtherSourceCount(32)).toBe(true);
    expect(handlers.changeEtherSourceStep(3)).toBe(true);
    expect(handlers.changeEtherTypeOverride(true)).toBe(true);
    expect(handlers.changeEtherType("88cc")).toBe(true);
    expect(handlers.changeVlanTpidOverride(true)).toBe(true);
    expect(handlers.changeVlanTpid("8100")).toBe(true);
    expect(handlers.changeVlanPriority(3)).toBe(true);
    expect(handlers.changeVlanPriorityMode("Increment")).toBe(true);
    expect(handlers.changeVlanPriorityCount(4)).toBe(true);
    expect(handlers.changeVlanPriorityStep(2)).toBe(true);
    expect(handlers.changeVlanCfi(1)).toBe(true);
    expect(handlers.changeVlanId(100)).toBe(true);
    expect(handlers.changeVlanIdMode("Decrement")).toBe(true);
    expect(handlers.changeVlanIdCount(5)).toBe(true);
    expect(handlers.changeVlanIdStep(10)).toBe(true);

    expect(patches).toEqual([
      { ether_dst: "00:11:22:33:44:55" },
      { ether_dst_mode: "Increment" },
      { ether_dst_count: 16 },
      { ether_dst_step: 2 },
      { ether_src: "66:77:88:99:aa:bb" },
      { ether_src_mode: "Decrement" },
      { ether_src_count: 32 },
      { ether_src_step: 3 },
      { ether_type_override: true },
      { ether_type: "88cc" },
      { vlan_tpid_override: true },
      { vlan_tpid: "8100" },
      { vlan_priority: 3 },
      { vlan_priority_mode: "Increment" },
      { vlan_priority_count: 4 },
      { vlan_priority_step: 2 },
      { vlan_cfi: 1 },
      { vlan_id: 100 },
      { vlan_id_mode: "Decrement" },
      { vlan_id_count: 5 },
      { vlan_id_step: 10 }
    ]);
  });

  it("binds inner VLAN field edits and preserves selection semantics", () => {
    const { handlers, patches } = collectHandlers({
      vlan2_id_mode: "Random",
      vlan2_priority_mode: "Increment"
    } as ProfileWorkbenchStream);

    expect(handlers.changeVlanInnerSelection(true)).toBe(true);
    expect(handlers.changeVlanInnerTpidOverride(true)).toBe(true);
    expect(handlers.changeVlanInnerTpid("88a8")).toBe(true);
    expect(handlers.changeVlanInnerPriority(5)).toBe(true);
    expect(handlers.changeVlanInnerPriorityMode("Decrement")).toBe(true);
    expect(handlers.changeVlanInnerPriorityCount(6)).toBe(true);
    expect(handlers.changeVlanInnerPriorityStep(1)).toBe(true);
    expect(handlers.changeVlanInnerCfi(1)).toBe(true);
    expect(handlers.changeVlanInnerId(200)).toBe(true);
    expect(handlers.changeVlanInnerIdMode("Increment")).toBe(true);
    expect(handlers.changeVlanInnerIdCount(7)).toBe(true);
    expect(handlers.changeVlanInnerIdStep(8)).toBe(true);

    expect(patches).toEqual([
      {
        vlan2_enabled: true,
        vlan2_id_mode: "Random",
        vlan2_priority_mode: "Increment"
      },
      { vlan2_tpid_override: true },
      { vlan2_tpid: "88a8" },
      { vlan2_priority: 5 },
      { vlan2_priority_mode: "Decrement" },
      { vlan2_priority_count: 6 },
      { vlan2_priority_step: 1 },
      { vlan2_cfi: 1 },
      { vlan2_id: 200 },
      { vlan2_id_mode: "Increment" },
      { vlan2_id_count: 7 },
      { vlan2_id_step: 8 }
    ]);
  });

  it("does not synthesize inner VLAN selection without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeVlanInnerSelection(true)).toBe(false);

    expect(patches).toEqual([]);
  });
});
