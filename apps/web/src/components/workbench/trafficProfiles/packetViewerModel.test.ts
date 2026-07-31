import { describe, expect, it } from "vitest";

import type { ProfilePacketPreview } from "../../../api";
import {
  packetViewerEmptyText,
  packetViewerHexViewModel,
  packetViewerTreeRows,
  packetViewerTreeViewModel
} from "./packetViewerModel";

const preview: ProfilePacketPreview = {
  binary_base64: "",
  frame_length: 64,
  hex: "aa bb cc",
  hex_lines: [
    { ascii: "...", hex: "aa bb cc", offset: "0000" }
  ],
  index: 1,
  layers: [
    {
      fields: {
        dst: "ff:ff:ff:ff:ff:ff",
        tagged: true,
        type: 2048
      },
      name: "Ethernet"
    },
    {
      fields: {
        src: "1.1.1.1"
      },
      name: "IPv4"
    }
  ],
  name: "stream-1",
  packet_type: "Ethernet/IPv4",
  wire_length: 64
};

describe("packet viewer model", () => {
  it("projects decoded packet layers into stable table rows", () => {
    expect(packetViewerTreeRows(preview)).toEqual([
      {
        field: "dst",
        key: "0:Ethernet:dst",
        layer: "Ethernet",
        value: "ff:ff:ff:ff:ff:ff"
      },
      {
        field: "tagged",
        key: "0:Ethernet:tagged",
        layer: "",
        value: "true"
      },
      {
        field: "type",
        key: "0:Ethernet:type",
        layer: "",
        value: "2048"
      },
      {
        field: "src",
        key: "1:IPv4:src",
        layer: "IPv4",
        value: "1.1.1.1"
      }
    ]);
  });

  it("derives empty table state from the busy flag", () => {
    expect(packetViewerEmptyText(true)).toBe("Rendering packet");
    expect(packetViewerEmptyText(false)).toBe("No packet preview");
    expect(packetViewerTreeViewModel(null, true)).toEqual({
      emptyRow: {
        colSpan: 3,
        text: "Rendering packet"
      },
      rows: [],
      showEmptyRow: true
    });
    expect(packetViewerTreeViewModel({ ...preview, layers: [] }, false).showEmptyRow).toBe(false);
  });

  it("projects packet hex rows without leaking preview null checks to the workspace", () => {
    expect(packetViewerHexViewModel(preview, false)).toEqual({
      emptyRow: {
        colSpan: 3,
        text: "No packet preview"
      },
      rows: [
        { ascii: "...", hex: "aa bb cc", offset: "0000" }
      ],
      showEmptyRow: false
    });
    expect(packetViewerHexViewModel(null, false)).toMatchObject({
      rows: [],
      showEmptyRow: true
    });
  });
});
