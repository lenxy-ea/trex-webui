import { describe, expect, it } from "vitest";

import {
  inputNumberValue,
  parseNumber
} from "./scalarValueModel";

describe("scalarValueModel", () => {
  it("parses finite numeric text and rejects blank or invalid text", () => {
    expect(parseNumber(" 42.5 ")).toBe(42.5);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("  ")).toBeNaN();
    expect(parseNumber("abc")).toBeNaN();
  });

  it("derives numeric values from input change events", () => {
    expect(inputNumberValue({ currentTarget: { value: " 1024 " } })).toBe(1024);
    expect(inputNumberValue({ currentTarget: { value: "not-a-number" } })).toBeNaN();
  });
});
