import { describe, expect, it } from "vitest";

import { buildTrafficMultiplier, trafficMultiplierUnitOptions } from "./trafficMultiplier";

describe("traffic multiplier", () => {
  it("keeps raw profile multiplier and the original GUI multiplier types", () => {
    expect(trafficMultiplierUnitOptions).toEqual([
      { value: "raw", label: "x" },
      { value: "percentage", label: "% L1" },
      { value: "bps_L1", label: "L1 bps" },
      { value: "bps_L2", label: "L2 bps" },
      { value: "pps", label: "pps" }
    ]);
  });

  it("builds TRex multiplier strings from original GUI units", () => {
    expect(buildTrafficMultiplier("raw", "1")).toMatchObject({ ok: true, value: "1" });
    expect(buildTrafficMultiplier("percentage", "100")).toMatchObject({ ok: true, value: "100%" });
    expect(buildTrafficMultiplier("bps_L1", "100G")).toMatchObject({ ok: true, value: "100gbpsl1" });
    expect(buildTrafficMultiplier("bps_L2", "10M")).toMatchObject({ ok: true, value: "10mbps" });
    expect(buildTrafficMultiplier("pps", "1.5M")).toMatchObject({ ok: true, value: "1.5mpps" });
  });

  it("rejects invalid percentage and empty multiplier values", () => {
    expect(buildTrafficMultiplier("percentage", "101")).toMatchObject({
      ok: false,
      error: "Traffic percentage must be between 0 and 100"
    });
    expect(buildTrafficMultiplier("percentage", "1K")).toMatchObject({
      ok: false,
      error: "Traffic percentage must not use K/M/G/T/P/E suffix"
    });
    expect(buildTrafficMultiplier("raw", "1K")).toMatchObject({
      ok: false,
      error: "Raw traffic multiplier must not use K/M/G/T/P/E suffix"
    });
    expect(buildTrafficMultiplier("pps", "")).toMatchObject({
      ok: false,
      error: "Traffic multiplier must be a positive number with optional K/M/G/T/P/E suffix"
    });
  });
});
