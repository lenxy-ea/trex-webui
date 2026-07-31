import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataMplsHandlers } from "./workspaceProtocolDataMplsHandlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataMplsHandlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataMplsHandlers", () => {
  it("binds primary MPLS label field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeMplsLabel(100)).toBe(true);
    expect(handlers.changeMplsLabelMode("Increment")).toBe(true);
    expect(handlers.changeMplsLabelCount(4)).toBe(true);
    expect(handlers.changeMplsLabelStep(2)).toBe(true);
    expect(handlers.changeMplsTrafficClass(3)).toBe(true);
    expect(handlers.changeMplsTrafficClassMode("Decrement")).toBe(true);
    expect(handlers.changeMplsTrafficClassCount(5)).toBe(true);
    expect(handlers.changeMplsTrafficClassStep(1)).toBe(true);
    expect(handlers.changeMplsTtl(64)).toBe(true);
    expect(handlers.changeMplsTtlMode("Random")).toBe(true);
    expect(handlers.changeMplsTtlCount(6)).toBe(true);
    expect(handlers.changeMplsTtlStep(8)).toBe(true);

    expect(patches).toEqual([
      { mpls_label: 100 },
      { mpls_label_mode: "Increment" },
      { mpls_label_count: 4 },
      { mpls_label_step: 2 },
      { mpls_tc: 3 },
      { mpls_tc_mode: "Decrement" },
      { mpls_tc_count: 5 },
      { mpls_tc_step: 1 },
      { mpls_ttl: 64 },
      { mpls_ttl_mode: "Random" },
      { mpls_ttl_count: 6 },
      { mpls_ttl_step: 8 }
    ]);
  });

  it("binds second MPLS label edits and preserves selection semantics", () => {
    const { handlers, patches } = collectHandlers({
      mpls_label2_mode: "Increment",
      mpls_label2_tc_mode: "Random",
      mpls_label2_ttl_mode: "Decrement",
      mpls_label3_enabled: true,
      mpls_label3_mode: "Increment",
      mpls_label3_tc_mode: "Fixed",
      mpls_label3_ttl_mode: "Random"
    } as ProfileWorkbenchStream);

    expect(handlers.changeMplsSecondLabelSelection(true)).toBe(true);
    expect(handlers.changeMplsSecondLabel(200)).toBe(true);
    expect(handlers.changeMplsSecondLabelMode("Decrement")).toBe(true);
    expect(handlers.changeMplsSecondLabelCount(7)).toBe(true);
    expect(handlers.changeMplsSecondLabelStep(3)).toBe(true);
    expect(handlers.changeMplsSecondTrafficClass(4)).toBe(true);
    expect(handlers.changeMplsSecondTrafficClassMode("Increment")).toBe(true);
    expect(handlers.changeMplsSecondTrafficClassCount(8)).toBe(true);
    expect(handlers.changeMplsSecondTrafficClassStep(2)).toBe(true);
    expect(handlers.changeMplsSecondTtl(32)).toBe(true);
    expect(handlers.changeMplsSecondTtlMode("Fixed")).toBe(true);
    expect(handlers.changeMplsSecondTtlCount(9)).toBe(true);
    expect(handlers.changeMplsSecondTtlStep(4)).toBe(true);

    expect(patches).toEqual([
      {
        mpls_label2_enabled: true,
        mpls_label2_mode: "Increment",
        mpls_label2_tc_mode: "Random",
        mpls_label2_ttl_mode: "Decrement",
        mpls_label3_enabled: true,
        mpls_label3_mode: "Increment",
        mpls_label3_tc_mode: "Fixed",
        mpls_label3_ttl_mode: "Random"
      },
      { mpls_label2: 200 },
      { mpls_label2_mode: "Decrement" },
      { mpls_label2_count: 7 },
      { mpls_label2_step: 3 },
      { mpls_label2_tc: 4 },
      { mpls_label2_tc_mode: "Increment" },
      { mpls_label2_tc_count: 8 },
      { mpls_label2_tc_step: 2 },
      { mpls_label2_ttl: 32 },
      { mpls_label2_ttl_mode: "Fixed" },
      { mpls_label2_ttl_count: 9 },
      { mpls_label2_ttl_step: 4 }
    ]);
  });

  it("binds third MPLS label edits and requires a selected stream for selection", () => {
    const { handlers, patches } = collectHandlers({
      mpls_label3_mode: "Random",
      mpls_label3_tc_mode: "Increment",
      mpls_label3_ttl_mode: "Decrement"
    } as ProfileWorkbenchStream);

    expect(handlers.changeMplsThirdLabelSelection(true)).toBe(true);
    expect(handlers.changeMplsThirdLabel(300)).toBe(true);
    expect(handlers.changeMplsThirdLabelMode("Fixed")).toBe(true);
    expect(handlers.changeMplsThirdLabelCount(10)).toBe(true);
    expect(handlers.changeMplsThirdLabelStep(5)).toBe(true);
    expect(handlers.changeMplsThirdTrafficClass(5)).toBe(true);
    expect(handlers.changeMplsThirdTrafficClassMode("Random")).toBe(true);
    expect(handlers.changeMplsThirdTrafficClassCount(11)).toBe(true);
    expect(handlers.changeMplsThirdTrafficClassStep(6)).toBe(true);
    expect(handlers.changeMplsThirdTtl(16)).toBe(true);
    expect(handlers.changeMplsThirdTtlMode("Increment")).toBe(true);
    expect(handlers.changeMplsThirdTtlCount(12)).toBe(true);
    expect(handlers.changeMplsThirdTtlStep(7)).toBe(true);

    expect(patches).toEqual([
      {
        mpls_label2_enabled: true,
        mpls_label3_enabled: true,
        mpls_label3_mode: "Random",
        mpls_label3_tc_mode: "Increment",
        mpls_label3_ttl_mode: "Decrement"
      },
      { mpls_label3: 300 },
      { mpls_label3_mode: "Fixed" },
      { mpls_label3_count: 10 },
      { mpls_label3_step: 5 },
      { mpls_label3_tc: 5 },
      { mpls_label3_tc_mode: "Random" },
      { mpls_label3_tc_count: 11 },
      { mpls_label3_tc_step: 6 },
      { mpls_label3_ttl: 16 },
      { mpls_label3_ttl_mode: "Increment" },
      { mpls_label3_ttl_count: 12 },
      { mpls_label3_ttl_step: 7 }
    ]);
  });

  it("does not synthesize MPLS stacked-label selection without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeMplsSecondLabelSelection(true)).toBe(false);
    expect(handlers.changeMplsThirdLabelSelection(true)).toBe(false);

    expect(patches).toEqual([]);
  });
});
