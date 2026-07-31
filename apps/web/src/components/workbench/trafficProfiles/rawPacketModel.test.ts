import { describe, expect, it } from "vitest";

import {
  applyRawPacketFieldEdit,
  type RawPacketFieldRow
} from "./rawPacketModel";

const byteField = {
  field: "Destination",
  format: "hex",
  id: "Ethernet:Destination:1:1",
  layer: "Ethernet",
  length: 1,
  offset: 1,
  value: "11"
} satisfies RawPacketFieldRow;

describe("rawPacketModel field editing", () => {
  it("applies a raw packet field edit and formats the repaired draft", () => {
    expect(applyRawPacketFieldEdit("00 11 22 33", byteField, "ff")).toEqual({
      nextHex: "00 ff 22 33",
      ok: true,
      statusText: "Ethernet Destination updated at byte 1. Apply raw to save this packet."
    });
  });

  it("rejects field edits outside the raw draft bytes", () => {
    expect(applyRawPacketFieldEdit("00 11", { ...byteField, offset: 4 }, "ff")).toEqual({
      errorText: "Raw packet bytes are not valid for this field.",
      ok: false
    });
  });

  it("returns field-specific validation errors", () => {
    expect(applyRawPacketFieldEdit("00 11 22 33", byteField, "f")).toEqual({
      errorText: "Expected 2 hex characters.",
      ok: false
    });
  });
});
