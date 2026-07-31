import { describe, expect, it } from "vitest";

import { displayCount } from "./format";

describe("workbench format helpers", () => {
  it("groups large packet and error counters for operational tables", () => {
    expect(displayCount(124960248)).toBe("124,960,248");
    expect(displayCount(0)).toBe("0");
    expect(displayCount(null)).toBe("-");
  });
});
