import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataIpv6Handlers } from "./workspaceProtocolDataIpv6Handlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataIpv6Handlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataIpv6Handlers", () => {
  it("binds IPv6 source and destination address field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIpv6Destination("2001:db8::2")).toBe(true);
    expect(handlers.changeIpv6DestinationMode("Increment Host")).toBe(true);
    expect(handlers.changeIpv6DestinationCount(16)).toBe(true);
    expect(handlers.changeIpv6DestinationStep(2)).toBe(true);
    expect(handlers.changeIpv6Source("2001:db8::1")).toBe(true);
    expect(handlers.changeIpv6SourceMode("Decrement Host")).toBe(true);
    expect(handlers.changeIpv6SourceCount(8)).toBe(true);
    expect(handlers.changeIpv6SourceStep(3)).toBe(true);

    expect(patches).toEqual([
      { ipv6_dst: "2001:db8::2" },
      { ipv6_dst_mode: "Increment Host" },
      { ipv6_dst_count: 16 },
      { ipv6_dst_step: 2 },
      { ipv6_src: "2001:db8::1" },
      { ipv6_src_mode: "Decrement Host" },
      { ipv6_src_count: 8 },
      { ipv6_src_step: 3 }
    ]);
  });

  it("binds IPv6 traffic class, flow label, and hop limit field edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIpv6TrafficClass(32)).toBe(true);
    expect(handlers.changeIpv6TrafficClassMode("Increment")).toBe(true);
    expect(handlers.changeIpv6TrafficClassCount(4)).toBe(true);
    expect(handlers.changeIpv6TrafficClassStep(2)).toBe(true);
    expect(handlers.changeIpv6FlowLabel(1024)).toBe(true);
    expect(handlers.changeIpv6FlowLabelMode("Random")).toBe(true);
    expect(handlers.changeIpv6FlowLabelCount(6)).toBe(true);
    expect(handlers.changeIpv6FlowLabelStep(3)).toBe(true);
    expect(handlers.changeIpv6HopLimit(64)).toBe(true);
    expect(handlers.changeIpv6HopLimitMode("Decrement")).toBe(true);
    expect(handlers.changeIpv6HopLimitCount(8)).toBe(true);
    expect(handlers.changeIpv6HopLimitStep(4)).toBe(true);

    expect(patches).toEqual([
      { ipv6_traffic_class: 32 },
      { ipv6_traffic_class_mode: "Increment" },
      { ipv6_traffic_class_count: 4 },
      { ipv6_traffic_class_step: 2 },
      { ipv6_flow_label: 1024 },
      { ipv6_flow_label_mode: "Random" },
      { ipv6_flow_label_count: 6 },
      { ipv6_flow_label_step: 3 },
      { ipv6_hop_limit: 64 },
      { ipv6_hop_limit_mode: "Decrement" },
      { ipv6_hop_limit_count: 8 },
      { ipv6_hop_limit_step: 4 }
    ]);
  });

  it("binds standalone IPv6 patches without a selected stream", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeIpv6Destination("2001:db8::2")).toBe(true);
    expect(handlers.changeIpv6TrafficClass(32)).toBe(true);
    expect(handlers.changeIpv6HopLimit(64)).toBe(true);

    expect(patches).toEqual([
      { ipv6_dst: "2001:db8::2" },
      { ipv6_traffic_class: 32 },
      { ipv6_hop_limit: 64 }
    ]);
  });
});
