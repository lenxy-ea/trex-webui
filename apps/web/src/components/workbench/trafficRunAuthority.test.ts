import { describe, expect, it } from "vitest";

import type {
  TrafficMutationEvidence,
  TrafficPlanGroup,
  TrafficPortState,
  TrafficRuntimeSnapshot,
  TrafficSession,
  TrafficSessionGroup
} from "../../api";
import { buildRunReportSnapshot } from "./runReport";
import {
  synchronizeRunReportTrafficSession,
  trafficProfileByPort,
  trafficSessionDurationLabel,
  trafficSessionPorts,
  trafficSessionProfiles,
  trafficSessionRateLabel,
  type RunReportTrafficSession
} from "./trafficRunAuthority";

const authority = {
  host: "127.0.0.1",
  sync_port: 4501,
  async_port: 4500,
  scapy_port: 4507,
  daemon_supervisor: "systemd" as const,
  generation: "11111111-1111-4111-8111-111111111111"
};

const planGroups: TrafficPlanGroup[] = [
  {
    id: "pair-0",
    name: "P0 ↔ P1",
    ports: [0, 1],
    profile_path: "plans/pair-0.py",
    multiplier: "1",
    duration: -1,
    force: false,
    total: false,
    synchronized: false,
    clear_existing: true,
    tunables: {}
  },
  {
    id: "pair-1",
    name: "P2 ↔ P3",
    ports: [2, 3],
    profile_path: "plans/pair-1.py",
    multiplier: "1",
    duration: -1,
    force: false,
    total: false,
    synchronized: false,
    clear_existing: true,
    tunables: {}
  }
];

function portStates(ports: number[], state: TrafficPortState) {
  return Object.fromEntries(ports.map((port) => [port, state])) as Record<number, TrafficPortState>;
}

function mutationEvidence(
  operation: "start" | "stop",
  ports: number[],
  completedAt: string,
  intentNonce: string
): TrafficMutationEvidence {
  const isStart = operation === "start";
  return {
    intent_nonce: intentNonce,
    operation,
    completion_mode: "direct",
    ports,
    baseline_port_states: portStates(ports, isStart ? "stopped" : "running"),
    desired_port_states: portStates(ports, isStart ? "running" : "stopped"),
    baseline_acquired_ports: [],
    prepared_at: completedAt,
    completed_at: completedAt,
    acquisition_restored: true,
    wal_cleared: true
  };
}

function sessionGroup(
  overrides: Partial<TrafficSessionGroup> = {}
): TrafficSessionGroup {
  const ports = overrides.ports ?? [2, 3];
  const startedAt = overrides.started_at ?? "2026-07-31T00:00:00Z";
  const runId = overrides.run_id ?? "11111111-1111-4111-8111-111111111111";
  return {
    group_id: "pair-0",
    run_id: runId,
    source: "plan",
    plan_revision: 7,
    ports,
    profile_path: "sessions/latency.yaml",
    profile_sha256: "a".repeat(64),
    start_multiplier: "25%",
    multiplier: "25%",
    duration: 30,
    start_force: false,
    start_total: false,
    start_synchronized: false,
    start_clear_existing: true,
    started_at: startedAt,
    ended_at: null,
    hard_stop_at: "2026-07-31T00:00:30Z",
    tunables: {},
    start_evidence: mutationEvidence("start", ports, startedAt, runId),
    cleanup_evidence: null,
    state: "running",
    port_states: portStates(ports, "running"),
    updated_at: "2026-07-31T00:00:01Z",
    ...overrides
  };
}

function session(
  id: string,
  overrides: Partial<TrafficSession> = {}
): TrafficSession {
  const defaultGroups = [
    sessionGroup(),
    sessionGroup({
      group_id: "pair-1",
      run_id: "22222222-2222-4222-8222-222222222222",
      ports: [0, 1],
      profile_path: "sessions/throughput.py",
      profile_sha256: "b".repeat(64),
      start_multiplier: "10kpps",
      multiplier: "10kpps",
      duration: -1,
      hard_stop_at: null,
      tunables: { packet_size: 128 },
      port_states: portStates([0, 1], "running"),
      updated_at: "2026-07-31T00:00:02Z"
    })
  ];
  const groups = overrides.groups ?? defaultGroups;
  const completedGroups = overrides.completed_groups ?? [];
  const mutationEvidence = overrides.mutation_evidence
    ?? [...groups, ...completedGroups].flatMap((group) =>
      group.start_evidence ? [group.start_evidence] : []);
  return {
    id,
    revision: 1,
    evidence_version: 1,
    authority,
    state: "running",
    started_at: "2026-07-31T00:00:00Z",
    updated_at: "2026-07-31T00:00:02Z",
    ended_at: null,
    reconciliation: "owned",
    ...overrides,
    groups,
    completed_groups: completedGroups,
    mutation_evidence: mutationEvidence
  };
}

function snapshot(
  activeSession: TrafficSession | null,
  overrides: Partial<TrafficRuntimeSnapshot> = {}
): TrafficRuntimeSnapshot {
  return {
    plan_revision: 7,
    groups: planGroups,
    authority,
    session: activeSession,
    mutation_intent: null,
    config: {
      path: "/var/lib/trex-webui/trex_cfg.yaml",
      port_limit: 4,
      interfaces: [
        "0000:01:00.0",
        "0000:01:00.1",
        "0000:02:00.0",
        "0000:02:00.1"
      ]
    },
    available_ports: [0, 1, 2, 3],
    live_state_sampled: true,
    port_states: [0, 1, 2, 3].map((port) => ({
      port,
      state: activeSession === null ? "stopped" as const : "running" as const,
      ownership: activeSession === null ? "none" as const : "managed" as const
    })),
    reconciliation: "live TRex port state reconciled",
    ...overrides
  };
}

function reportForSession(trafficSession: RunReportTrafficSession) {
  return buildRunReportSnapshot({
    captureFilesResult: null,
    capturePackets: [],
    captureStatusResult: null,
    generatedAt: "2026-07-31T00:00:40Z",
    logRows: [],
    overview: null,
    portRecords: [],
    profilePath: "fallback.py",
    selectedProfile: null,
    startResult: null,
    statsHistory: [],
    statsResult: null,
    trafficSession,
    trafficMultiplier: null,
    workbenchStreams: null
  });
}

describe("trafficRunAuthority", () => {
  it("derives ports, profiles, rate, and duration from every active session group", () => {
    const activeSession = session("session-a");

    expect(trafficSessionPorts(activeSession)).toEqual([0, 1, 2, 3]);
    expect(trafficSessionProfiles(activeSession)).toEqual([
      "sessions/latency.yaml",
      "sessions/throughput.py"
    ]);
    expect(trafficSessionRateLabel(activeSession)).toBe("Mixed");
    expect(trafficSessionDurationLabel(activeSession)).toBe("Mixed");
  });

  it("includes completed groups in report authority derivation", () => {
    const hardStopIntentNonce = "44444444-4444-4444-8444-444444444444";
    const completedGroup = sessionGroup({
      group_id: "pair-2",
      run_id: "33333333-3333-4333-8333-333333333333",
      ports: [4, 5],
      profile_path: "sessions/completed.py",
      profile_sha256: "c".repeat(64),
      start_multiplier: "2mpps",
      multiplier: "2mpps",
      duration: 60,
      ended_at: "2026-07-31T00:01:00Z",
      hard_stop_at: null,
      cleanup_evidence: {
        completion: "hard_stop",
        completed_at: "2026-07-31T00:01:00Z",
        final_port_states: { 4: "stopped", 5: "stopped" },
        intent_nonce: hardStopIntentNonce,
        acquisition_restored: true,
        wal_cleared: true
      },
      state: "stopped",
      port_states: portStates([4, 5], "stopped"),
      updated_at: "2026-07-31T00:01:00Z"
    });
    const completedSession = session("session-a", {
      groups: [],
      completed_groups: [completedGroup],
      mutation_evidence: [
        completedGroup.start_evidence!,
        mutationEvidence(
          "stop",
          [4, 5],
          "2026-07-31T00:01:00Z",
          hardStopIntentNonce
        )
      ],
      state: "stopped",
      updated_at: "2026-07-31T00:01:00Z",
      ended_at: "2026-07-31T00:01:00Z"
    });

    expect(trafficSessionPorts(completedSession)).toEqual([4, 5]);
    expect(trafficSessionProfiles(completedSession)).toEqual(["sessions/completed.py"]);
    expect(trafficSessionRateLabel(completedSession)).toBe("2mpps");
    expect(trafficSessionDurationLabel(completedSession)).toBe("60 s");
    expect(reportForSession({ session: completedSession, captureCompletedAt: null }).metrics)
      .toEqual(expect.arrayContaining([
        { label: "Profile", value: "completed.py" },
        { label: "Run ports", value: "4, 5" },
        { label: "Runtime rate", value: "2mpps" }
      ]));
  });

  it("overlays active session assignments on exactly their ports", () => {
    const activeSession = session("session-a", {
      groups: [sessionGroup({
        group_id: "pair-1",
        run_id: "55555555-5555-4555-8555-555555555555",
        ports: [2, 3],
        profile_path: "sessions/running-pair-1.py",
        profile_sha256: "d".repeat(64),
        start_multiplier: "5kpps",
        multiplier: "5kpps",
        duration: 10,
        hard_stop_at: "2026-07-31T00:00:10Z",
        port_states: portStates([2, 3], "running"),
        updated_at: "2026-07-31T00:00:02Z"
      })]
    });

    expect(trafficProfileByPort(snapshot(activeSession))).toEqual({
      0: "plans/pair-0.py",
      1: "plans/pair-0.py",
      2: "sessions/running-pair-1.py",
      3: "sessions/running-pair-1.py"
    });
  });

  it("keeps capture evidence when the same session advances revision", () => {
    const currentSession = session("session-a", { revision: 1 });
    const nextSession = session("session-a", {
      revision: 2,
      updated_at: "2026-07-31T00:00:03Z"
    });
    const current: RunReportTrafficSession = {
      session: currentSession,
      captureCompletedAt: "2026-07-31T00:00:20Z"
    };

    expect(synchronizeRunReportTrafficSession(current, snapshot(nextSession))).toEqual({
      session: nextSession,
      captureCompletedAt: "2026-07-31T00:00:20Z"
    });
  });

  it("clears capture evidence when the persisted session id changes", () => {
    const current: RunReportTrafficSession = {
      session: session("session-a"),
      captureCompletedAt: "2026-07-31T00:00:20Z"
    };
    const nextSession = session("session-b", {
      started_at: "2026-07-31T01:00:00Z",
      updated_at: "2026-07-31T01:00:01Z"
    });

    expect(synchronizeRunReportTrafficSession(current, snapshot(nextSession))).toEqual({
      session: nextSession,
      captureCompletedAt: null
    });
  });

  it("does not present observed cleanup as persisted stop-command evidence", () => {
    const ports = [0, 1];
    const observedGroup = sessionGroup({
      ports,
      ended_at: "2026-07-31T00:00:30Z",
      hard_stop_at: null,
      cleanup_evidence: {
        completion: "observed",
        completed_at: "2026-07-31T00:00:30Z",
        final_port_states: { 0: "stopped", 1: "stopped" },
        intent_nonce: null,
        acquisition_restored: null,
        wal_cleared: true
      },
      state: "stopped",
      port_states: portStates(ports, "stopped"),
      updated_at: "2026-07-31T00:00:30Z"
    });
    const observedSession = session("session-a", {
      state: "stopped",
      updated_at: "2026-07-31T00:00:30Z",
      ended_at: "2026-07-31T00:00:30Z",
      groups: [],
      completed_groups: [observedGroup]
    });
    const report = reportForSession({
      session: observedSession,
      captureCompletedAt: null
    });

    expect(report.markdown).toContain("| Start result | persisted |");
    expect(report.markdown).toContain(
      "| Stop result | Group pair-0 cleanup evidence is observed, not operator_stop |"
    );
    expect(report.conclusion.verdict).toBe("warn");
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Run control",
        status: "warn",
        evidence: [
          { label: "Start", value: "accepted" },
          { label: "Stop", value: "warn" }
        ]
      })
    ]));
  });

  it("clears report authority when the runtime snapshot has no session", () => {
    const current: RunReportTrafficSession = {
      session: session("session-a"),
      captureCompletedAt: "2026-07-31T00:00:20Z"
    };

    expect(synchronizeRunReportTrafficSession(current, snapshot(null))).toBeNull();
  });

  it("keeps readable legacy sessions out of certifiable report authority", () => {
    const legacy = session("session-legacy", {
      revision: 0,
      evidence_version: null,
      mutation_evidence: [],
      groups: [sessionGroup({
        run_id: null,
        source: null,
        plan_revision: null,
        profile_sha256: null,
        start_multiplier: null,
        start_force: null,
        start_total: null,
        start_synchronized: null,
        start_clear_existing: null,
        started_at: null,
        start_evidence: null
      })]
    });

    expect(synchronizeRunReportTrafficSession(null, snapshot(legacy))).toBeNull();
  });
});
