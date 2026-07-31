import { describe, expect, it } from "vitest";

import type { ProfileWorkbenchStream } from "../../../api";
import type { StreamPatch } from "./streamPatchModel";
import { workspaceProtocolDataIcmpv6Handlers } from "./workspaceProtocolDataIcmpv6Handlers";

function collectHandlers(selectedStream: ProfileWorkbenchStream | null) {
  const patches: StreamPatch[] = [];
  const handlers = workspaceProtocolDataIcmpv6Handlers({
    selectedStream,
    streamPatchHandlers: {
      applyPatch: (patch) => {
        patches.push(patch);
      }
    }
  });

  return { handlers, patches };
}

describe("workspaceProtocolDataIcmpv6Handlers", () => {
  it("binds ICMPv6 router solicitation source link-layer option edits", () => {
    const { handlers, patches } = collectHandlers({
      frame_length: 64,
      icmp_type: 133,
      icmpv6_rs_include_slla: false,
      packet_type: "Ethernet/IPv6/ICMPv6"
    } as ProfileWorkbenchStream);

    expect(handlers.changeIcmpv6RsSllaSelection(true)).toBe(true);
    expect(handlers.changeIcmpv6RsSllaMac("00:11:22:33:44:55")).toBe(true);

    expect(patches).toEqual([
      {
        frame_length: 74,
        icmpv6_rs_include_slla: true
      },
      { icmpv6_rs_slla_mac: "00:11:22:33:44:55" }
    ]);
  });

  it("binds ICMPv6 router advertisement core and option edits", () => {
    const { handlers, patches } = collectHandlers({
      frame_length: 64,
      icmp_type: 134,
      icmpv6_ra_include_prefix: false,
      icmpv6_ra_include_slla: false,
      packet_type: "Ethernet/IPv6/ICMPv6"
    } as ProfileWorkbenchStream);

    expect(handlers.changeIcmpv6RaCurrentHopLimit(64)).toBe(true);
    expect(handlers.changeIcmpv6RaRouterLifetime(1800)).toBe(true);
    expect(handlers.changeIcmpv6RaReachableTime(1000)).toBe(true);
    expect(handlers.changeIcmpv6RaRetransTimer(2000)).toBe(true);
    expect(handlers.changeIcmpv6RaManagedFlag(true)).toBe(true);
    expect(handlers.changeIcmpv6RaOtherFlag(true)).toBe(true);
    expect(handlers.changeIcmpv6RaSllaSelection(true)).toBe(true);
    expect(handlers.changeIcmpv6RaSllaMac("00:aa:bb:cc:dd:ee")).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixSelection(true)).toBe(true);
    expect(handlers.changeIcmpv6RaPrefix("2001:db8::")).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixLength(64)).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixOnLinkFlag(true)).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixAutonomousFlag(false)).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixValidLifetime(3600)).toBe(true);
    expect(handlers.changeIcmpv6RaPrefixPreferredLifetime(1800)).toBe(true);

    expect(patches).toEqual([
      { icmpv6_ra_cur_hop_limit: 64 },
      { icmpv6_ra_router_lifetime: 1800 },
      { icmpv6_ra_reachable_time: 1000 },
      { icmpv6_ra_retrans_timer: 2000 },
      { icmpv6_ra_managed: true },
      { icmpv6_ra_other: true },
      {
        frame_length: 82,
        icmpv6_ra_include_slla: true
      },
      { icmpv6_ra_slla_mac: "00:aa:bb:cc:dd:ee" },
      {
        frame_length: 106,
        icmpv6_ra_include_prefix: true
      },
      { icmpv6_ra_prefix: "2001:db8::" },
      { icmpv6_ra_prefix_length: 64 },
      { icmpv6_ra_prefix_on_link: true },
      { icmpv6_ra_prefix_autonomous: false },
      { icmpv6_ra_prefix_valid_lifetime: 3600 },
      { icmpv6_ra_prefix_preferred_lifetime: 1800 }
    ]);
  });

  it("binds ICMPv6 neighbor discovery target, option, and advertisement flag edits", () => {
    const { handlers, patches } = collectHandlers({} as ProfileWorkbenchStream);

    expect(handlers.changeIcmpv6NdTarget("2001:db8::1")).toBe(true);
    expect(handlers.changeIcmpv6NdOptionSelection(true)).toBe(true);
    expect(handlers.changeIcmpv6NdOptionMac("00:22:33:44:55:66")).toBe(true);
    expect(handlers.changeIcmpv6NdNaRouterFlag(true)).toBe(true);
    expect(handlers.changeIcmpv6NdNaSolicitedFlag(false)).toBe(true);
    expect(handlers.changeIcmpv6NdNaOverrideFlag(true)).toBe(true);

    expect(patches).toEqual([
      { icmpv6_nd_target: "2001:db8::1" },
      { icmpv6_nd_include_option: true },
      { icmpv6_nd_option_mac: "00:22:33:44:55:66" },
      { icmpv6_nd_na_router: true },
      { icmpv6_nd_na_solicited: false },
      { icmpv6_nd_na_override: true }
    ]);
  });

  it("requires a selected stream only for ICMPv6 RS/RA frame-length-coupled selections", () => {
    const { handlers, patches } = collectHandlers(null);

    expect(handlers.changeIcmpv6RsSllaSelection(true)).toBe(false);
    expect(handlers.changeIcmpv6RaSllaSelection(true)).toBe(false);
    expect(handlers.changeIcmpv6RaPrefixSelection(true)).toBe(false);
    expect(handlers.changeIcmpv6RsSllaMac("00:11:22:33:44:55")).toBe(true);
    expect(handlers.changeIcmpv6RaCurrentHopLimit(64)).toBe(true);
    expect(handlers.changeIcmpv6NdOptionSelection(true)).toBe(true);

    expect(patches).toEqual([
      { icmpv6_rs_slla_mac: "00:11:22:33:44:55" },
      { icmpv6_ra_cur_hop_limit: 64 },
      { icmpv6_nd_include_option: true }
    ]);
  });
});
