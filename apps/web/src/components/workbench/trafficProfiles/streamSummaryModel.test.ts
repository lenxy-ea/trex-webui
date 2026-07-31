import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import {
  advancedStreamReadOnlyFacts,
  advancedStreamReadOnlyPanelViewModel,
  streamTableRows,
  streamTableViewModel
} from "./streamSummaryModel";

function stream(overrides: Partial<ProfileWorkbenchStream>): ProfileWorkbenchStream {
  return {
    advanced_mode: false,
    frame_length: 64,
    gtpu_enabled: false,
    mode: "continuous",
    name: "stream-1",
    next_stream_id: null,
    packet_type: "Ethernet/IPv4/UDP",
    rate_type: "pps",
    rate_value: 1000,
    vxlan_enabled: false,
    ...overrides
  } as ProfileWorkbenchStream;
}

describe("streamSummaryModel", () => {
  it("builds read-only facts for advanced streams", () => {
    const advancedStream = {
      advanced_vm: {
        cache_size: 64,
        instructions: [{ type: "flow_var" }, { type: "write_flow_var" }]
      },
      mode: "continuous",
      name: "advanced-stream",
      packet_binary_base64: "AQID",
      packet_meta_base64: "meta",
      packet_model: { layers: [] },
      packet_type: "Ethernet",
      pg_id: 7,
      rate_type: "pps",
      rate_value: 1000
    } as unknown as ProfileWorkbenchStream;
    const facts = advancedStreamReadOnlyFacts(advancedStream);

    expect(facts).toEqual([
      { label: "Name", value: "advanced-stream" },
      { label: "Packet type", value: "Ethernet" },
      { label: "Packet bytes", value: "3 bytes" },
      { label: "Mode", value: "continuous" },
      { label: "Rate", value: "1000 pps" },
      { label: "PG ID", value: "7" },
      { label: "Packet model", value: "present" },
      { label: "Packet meta", value: "present" },
      { label: "Field Engine", value: "2 instructions" },
      { label: "VM cache", value: "64" }
    ]);

    const panel = advancedStreamReadOnlyPanelViewModel(advancedStream);
    expect(panel).toMatchObject({
      ariaLabel: "Advanced stream",
      banner: {
        className: "advanced-stream-banner",
        description: "Packet Editor / Field Engine editable",
        role: "status",
        title: "Advanced/Scapy stream"
      },
      className: "advanced-stream-pane",
      gridClassName: "advanced-stream-grid",
      role: "region"
    });
    expect(panel.facts.map((fact) => fact.key)).toEqual([
      "Name",
      "Packet type",
      "Packet bytes",
      "Mode",
      "Rate",
      "PG ID",
      "Packet model",
      "Packet meta",
      "Field Engine",
      "VM cache"
    ]);
  });

  it("builds stream table rows from profile streams", () => {
    const rows = streamTableRows([
      stream({
        advanced_mode: true,
        name: "first",
        next_stream_id: 2,
        vxlan_enabled: true
      }),
      stream({
        frame_length: Number.NaN,
        gtpu_enabled: true,
        mode: "burst",
        name: "second",
        rate_type: "percentage",
        rate_value: 50
      })
    ]);

    expect(rows).toEqual([
      {
        advanced: true,
        index: 0,
        key: "first:0",
        length: "64",
        mode: "continuous",
        name: "first",
        nextStream: "second",
        packetType: "Ethernet/IPv4/UDP/VXLAN",
        rate: "1000 pps"
      },
      {
        advanced: false,
        index: 1,
        key: "second:1",
        length: "-",
        mode: "burst",
        name: "second",
        nextStream: "-",
        packetType: "Ethernet/IPv4/UDP/GTP-U",
        rate: "50 percentage"
      }
    ]);
  });

  it("owns stream table presentation metadata", () => {
    const view = streamTableViewModel({
      selectedStreamIndex: 1,
      streams: [
        stream({ advanced_mode: true, name: "first" }),
        stream({ name: "second" })
      ]
    });

    expect(view.wrapperClassName).toBe("stream-table-wrap");
    expect(view.tableClassName).toBe("stream-table");
    expect(view.columns.map((column) => [column.key, column.label, column.ariaLabel])).toEqual([
      ["selected", "", "Selected"],
      ["index", "Index", undefined],
      ["name", "Name", undefined],
      ["packetType", "Packet Type", undefined],
      ["length", "Length", undefined],
      ["mode", "Mode", undefined],
      ["rate", "Rate", undefined],
      ["nextStream", "Next Stream", undefined]
    ]);
    expect(view.emptyRow).toEqual({
      colSpan: 8,
      label: "Select a profile"
    });
    expect(view.rows.map((row) => ({
      advancedBadge: row.advancedBadge,
      className: row.className,
      displayIndex: row.displayIndex,
      name: row.name,
      selected: row.selected
    }))).toEqual([
      {
        advancedBadge: {
          className: "stream-mode-badge",
          label: "advanced"
        },
        className: "",
        displayIndex: 1,
        name: "first",
        selected: false
      },
      {
        advancedBadge: null,
        className: "stream-row--selected",
        displayIndex: 2,
        name: "second",
        selected: true
      }
    ]);
  });
});
