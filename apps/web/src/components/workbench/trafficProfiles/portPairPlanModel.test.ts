import { describe, expect, it } from "vitest";

import type {
  TrafficPlanGroup,
  TrafficRuntimeSnapshot,
  TrexPortRecord
} from "../../../api";
import {
  normalizeTrafficPlanMultiplier,
  portLinkState,
  trafficGroupLinkBlocker,
  trafficGroupRuntimeView,
  trafficPlanGroupError
} from "./portPairPlanModel";

const group: TrafficPlanGroup = {
  id: "pair-0",
  name: "P0 ↔ P1",
  ports: [0, 1],
  profile_path: "/profiles/udp.py",
  multiplier: "1",
  duration: -1,
  force: false,
  total: false,
  synchronized: false,
  clear_existing: true,
  tunables: {}
};

function runtime(
  overrides: Partial<TrafficRuntimeSnapshot> = {}
): TrafficRuntimeSnapshot {
  return {
    plan_revision: 4,
    groups: [group],
    authority: {
      host: "127.0.0.1",
      sync_port: 4501,
      async_port: 4500,
      scapy_port: 4507,
      daemon_supervisor: "systemd",
      generation: "11111111-1111-4111-8111-111111111111"
    },
    session: null,
    mutation_intent: null,
    config: {
      path: "/var/lib/trex-webui/trex_cfg.yaml",
      port_limit: 2,
      interfaces: ["0000:01:00.0", "0000:01:00.1"]
    },
    available_ports: [0, 1],
    port_states: [
      { port: 0, state: "stopped", ownership: "none" },
      { port: 1, state: "stopped", ownership: "none" }
    ],
    reconciliation: "live TRex port state reconciled",
    ...overrides,
    live_state_sampled: overrides.live_state_sampled ?? true
  };
}

describe("portPairPlanModel", () => {
  it("reports only explicit live link evidence as UP", () => {
    const ports: TrexPortRecord[] = [
      { id: 0, acquired: false, info: { link: "UP" } },
      { id: 1, acquired: false, info: { link_status: false } },
      { id: 2, acquired: false, info: { link: "-" } },
      { id: 3, acquired: false, info: { link: 1 } }
    ];

    expect(portLinkState(ports, 0)).toBe("up");
    expect(portLinkState(ports, 1)).toBe("down");
    expect(portLinkState(ports, 2)).toBe("unknown");
    expect(portLinkState(ports, 3)).toBe("up");
    expect(portLinkState(ports, 4)).toBe("unknown");
    expect(trafficGroupLinkBlocker(ports, [0, 1, 4])).toBe(
      "Traffic start requires every group link UP; P1 DOWN, P4 UNKNOWN."
    );
  });

  it("uses the persisted session and live ownership as runtime authority", () => {
    const snapshot = runtime({
      session: {
        id: "session-123456789",
        revision: 1,
        evidence_version: null,
        authority: {
          host: "127.0.0.1",
          sync_port: 4501,
          async_port: 4500,
          scapy_port: 4507,
          daemon_supervisor: "systemd",
          generation: "11111111-1111-4111-8111-111111111111"
        },
        state: "running",
        started_at: "2026-07-30T00:00:00Z",
        updated_at: "2026-07-30T00:00:01Z",
        ended_at: null,
        reconciliation: "owned",
        completed_groups: [],
        mutation_evidence: [],
        groups: [
          {
            group_id: "pair-0",
            run_id: null,
            source: null,
            plan_revision: null,
            ports: [0, 1],
            profile_path: group.profile_path,
            profile_sha256: null,
            start_multiplier: null,
            multiplier: "1",
            duration: -1,
            start_force: null,
            start_total: null,
            start_synchronized: null,
            start_clear_existing: null,
            started_at: null,
            ended_at: null,
            hard_stop_at: null,
            tunables: {},
            start_evidence: null,
            cleanup_evidence: null,
            state: "running",
            port_states: { 0: "running", 1: "running" },
            updated_at: "2026-07-30T00:00:01Z"
          }
        ]
      },
      port_states: [
        { port: 0, state: "running", ownership: "managed" },
        { port: 1, state: "running", ownership: "managed" }
      ]
    });

    expect(trafficGroupRuntimeView(snapshot, group)).toEqual({
      ownership: "managed",
      sessionId: "session-123456789",
      state: "running"
    });
  });

  it("keeps external and mixed live states visible when no managed session matches", () => {
    const snapshot = runtime({
      port_states: [
        { port: 0, state: "unknown", ownership: "external" },
        { port: 1, state: "stopped", ownership: "none" }
      ]
    });

    expect(trafficGroupRuntimeView(snapshot, group)).toEqual({
      ownership: "external",
      sessionId: null,
      state: "unknown"
    });
  });

  it("validates the editable assignment fields before persistence", () => {
    expect(trafficPlanGroupError(group)).toBeNull();
    expect(normalizeTrafficPlanMultiplier(" 10Kpps ")).toEqual({
      error: null,
      value: "10kpps"
    });
    expect(normalizeTrafficPlanMultiplier("25%")).toEqual({
      error: null,
      value: "25%"
    });
    expect(trafficPlanGroupError({ ...group, profile_path: " " })).toContain("select a traffic profile");
    expect(trafficPlanGroupError({ ...group, multiplier: "" })).toContain("multiplier / rate is required");
    expect(trafficPlanGroupError({ ...group, multiplier: "101%" })).toContain("between 0 and 100");
    expect(trafficPlanGroupError({ ...group, duration: 0 })).toContain("duration must be -1");
    expect(trafficPlanGroupError({ ...group, duration: -2 })).toContain("duration must be -1");
  });
});
