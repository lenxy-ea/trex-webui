import { describe, expect, it } from "vitest";

import {
  acceptanceFailureMessages,
  assertPersistedAction,
  assertPersistedStartResponse,
  browserWriteTimingGuarantee,
  classifyBrowserRequest,
  clickForResponse,
  cleanupOwnershipDecision,
  cleanupProductionBrowserWriteAcceptance,
  consumeExpectedBrowserWrite,
  createEmergencyCleanupCoordinator,
  evaluatePreflight,
  evaluateRuntimeAuthority,
  evaluateRuntimeStage,
  expectedBrowserWriteSequence,
  hardStopLeaseGraceMs,
  hardStopLeaseSeconds,
  hardenBrowserActionRequest,
  jsonValuesEqual,
  lostStartResponseLeaseDecision,
  lostResponseRuntimeRetryDecision,
  normalizeBaseUrl,
  parseOptions,
  planRestorationDecision,
  runtimeMatchesStage
} from "./production-browser-write-acceptance.mjs";

const originalGroups = [
  {
    id: "pair-0",
    name: "P0 ↔ P1",
    ports: [0, 1],
    profile_path: "/opt/trex/profiles/stl/udp_1pkt_simple.py",
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
    profile_path: "/opt/trex/profiles/stl/udp_1pkt_simple.py",
    multiplier: "1",
    duration: -1,
    force: false,
    total: false,
    synchronized: false,
    clear_existing: true,
    tunables: {}
  }
];
const savedGroups = originalGroups.map((group) =>
  group.id === "pair-0"
    ? {
        ...group,
        multiplier: "1kpps",
        duration: -1
      }
    : group
);
const leaseIssuedAt = "2026-07-31T00:00:00.000Z";
const leaseHardStopAt = "2026-07-31T00:01:00.000Z";

function writePolicy(overrides = {}) {
  return {
    baseOrigin: "http://trex.lab",
    groupId: "pair-0",
    initialRevision: 7,
    savedRevision: 8,
    sessionId: "gate-session",
    hardStopIssuedAt: leaseIssuedAt,
    hardStopAt: leaseHardStopAt,
    savedGroups,
    ...overrides
  };
}

function classify(method, pathname, body, overrides = {}) {
  return classifyBrowserRequest(
    {
      method,
      url: `http://trex.lab${pathname}`,
      postData: body === undefined ? undefined : JSON.stringify(body)
    },
    writePolicy(overrides)
  );
}

function idleRuntime(state = "stopped") {
  return {
    plan_revision: 7,
    groups: structuredClone(originalGroups),
    mutation_intent: null,
    live_state_sampled: true,
    available_ports: [0, 1, 2, 3, 4, 5],
    session: state === "stopped"
      ? {
          id: "old-session",
          state: "stopped",
          started_at: "2026-07-30T00:00:00Z",
          groups: [
            {
              group_id: "pair-0",
              ports: [0, 1],
              state: "stopped",
              hard_stop_at: null
            }
          ]
        }
      : null,
    port_states: [0, 1, 2, 3, 4, 5].map((port) => ({
      port,
      state: "stopped",
      ownership: "none"
    }))
  };
}

function portsSnapshot() {
  return {
    ports: [0, 1, 2, 3, 4, 5].map((id) => ({
      id,
      acquired: false,
      info: { link: id < 2 ? "UP" : "DOWN" }
    }))
  };
}

function rcEnvironment(connectTimeoutSeconds = 3) {
  return { connect_timeout_seconds: connectTimeoutSeconds };
}

function cleanupTestResult() {
  return {
    direct_requests: [],
    http_failures: [],
    timing_contract: {
      connect_timeout_seconds: 3,
      maximum_connect_timeout_seconds: 3,
      lost_response_grace_seconds: 5
    },
    cleanup: {
      attempted: false,
      ownership_decision: null,
      stop_request: null,
      stop_verification: null,
      lease_expiry_recovery: null,
      lease_expiry_retries: [],
      plan_restoration: null,
      final: null,
      errors: []
    }
  };
}

function activeGateRuntime() {
  const runtime = idleRuntime();
  runtime.plan_revision = 8;
  runtime.groups = structuredClone(savedGroups);
  runtime.session = {
    id: "gate-session",
    state: "running",
    started_at: leaseIssuedAt,
    groups: [{
      group_id: "pair-0",
      ports: [0, 1],
      state: "running",
      hard_stop_at: leaseHardStopAt
    }]
  };
  runtime.port_states[0] = {
    port: 0,
    state: "running",
    ownership: "managed"
  };
  runtime.port_states[1] = {
    port: 1,
    state: "running",
    ownership: "managed"
  };
  return runtime;
}

describe("production browser write acceptance options", () => {
  it("uses unbounded TRex duration with a separate 60-second persisted lease", () => {
    expect(hardStopLeaseSeconds).toBe(60);
    expect(savedGroups[0].duration).toBe(-1);
    expect(browserWriteTimingGuarantee).toBe(
      "observed RC acceptance threshold; not a theoretical worst-case or hard-real-time guarantee"
    );
  });

  it("normalizes an API URL and parses explicit evidence options", () => {
    expect(normalizeBaseUrl("http://127.0.0.1/api")).toBe("http://127.0.0.1/");
    expect(() => normalizeBaseUrl("file:///tmp/index.html")).toThrow(/http/);

    const options = parseOptions([
      "--base-url",
      "https://trex.lab/api",
      "--gate-id",
      "gate-123",
      "--identity-file",
      "/tmp/gate-identity.json",
      "--output",
      "/tmp/write.json",
      "--timeout-ms",
      "5000"
    ]);
    expect(options.baseUrl).toBe("https://trex.lab/");
    expect(options.gateId).toBe("gate-123");
    expect(options.identityFile).toBe("/tmp/gate-identity.json");
    expect(options.output).toBe("/tmp/write.json");
    expect(options.timeoutMs).toBe(5000);
  });

  it("rejects invalid timeouts and unknown options", () => {
    expect(() => parseOptions(["--timeout-ms", "0"])).toThrow(/positive integer/);
    expect(() => parseOptions(["--surprise"])).toThrow(/unknown option/);
  });
});

describe("emergency signal cleanup", () => {
  it("closes the browser and runs exact cleanup once across repeated signals", async () => {
    const calls = [];
    const coordinator = createEmergencyCleanupCoordinator({
      recordSignal(signal) {
        calls.push(`signal:${signal}`);
      },
      async closeBrowser() {
        calls.push("close-browser");
      },
      async cleanup() {
        calls.push("cleanup-session-cas");
      }
    });

    const first = coordinator.request("SIGTERM");
    const repeated = coordinator.request("SIGINT");
    expect(first).toBe(repeated);
    await Promise.all([first, repeated]);

    expect(coordinator.signal).toBe("SIGTERM");
    expect(calls).toEqual([
      "signal:SIGTERM",
      "close-browser",
      "cleanup-session-cas"
    ]);
  });

  it("still attempts cleanup if browser shutdown fails", async () => {
    const calls = [];
    const coordinator = createEmergencyCleanupCoordinator({
      recordSignal() {},
      async closeBrowser() {
        calls.push("close-browser");
        throw new Error("close failed");
      },
      async cleanup() {
        calls.push("cleanup-session-cas");
      }
    });

    await expect(coordinator.request("SIGTERM")).rejects.toThrow(/emergency cleanup/);
    expect(calls).toEqual(["close-browser", "cleanup-session-cas"]);
  });
});

describe("browser action response ownership", () => {
  it("accepts Start only when the response binds the exact route-issued lease", () => {
    const payload = {
      ok: true,
      data: {
        accepted: true,
        state_persisted: true,
        ports: [0, 1],
        session: {
          id: "gate-session",
          state: "running",
          groups: [{
            group_id: "pair-0",
            ports: [0, 1],
            state: "running",
            hard_stop_at: leaseHardStopAt
          }]
        }
      }
    };

    expect(
      assertPersistedStartResponse(
        payload,
        leaseIssuedAt,
        leaseHardStopAt,
        "Start pair-0"
      )
    ).toBe("gate-session");

    const wrongLease = structuredClone(payload);
    wrongLease.data.session.groups[0].hard_stop_at = "2026-07-31T00:01:01.000Z";
    expect(() =>
      assertPersistedStartResponse(
        wrongLease,
        leaseIssuedAt,
        leaseHardStopAt,
        "Start pair-0"
      )
    ).toThrow(/lease changed/);
    expect(() =>
      assertPersistedStartResponse(
        payload,
        "2026-07-31T00:00:00.0000Z",
        leaseHardStopAt,
        "Start pair-0"
      )
    ).toThrow(/route-issued canonical UTC lease/);
  });

  it("treats clean JS and backend UTC forms as the same exact lease instant", () => {
    const issuedAt = "2026-07-31T00:00:00.511Z";
    const hardStopAt = "2026-07-31T00:01:00.511Z";
    const payload = {
      ok: true,
      data: {
        accepted: true,
        state_persisted: true,
        ports: [0, 1],
        session: {
          id: "gate-session",
          state: "running",
          groups: [{
            group_id: "pair-0",
            ports: [0, 1],
            state: "running",
            hard_stop_at: "2026-07-31T00:01:00.511000Z"
          }]
        }
      }
    };

    expect(
      assertPersistedStartResponse(
        payload,
        issuedAt,
        hardStopAt,
        "Start pair-0"
      )
    ).toBe("gate-session");

    payload.data.session.groups[0].hard_stop_at =
      "2026-07-31T00:01:00.511001Z";
    expect(() =>
      assertPersistedStartResponse(
        payload,
        issuedAt,
        hardStopAt,
        "Start pair-0"
      )
    ).toThrow(/lease changed/);

    payload.data.session.groups[0].hard_stop_at =
      "2026-07-31T00:01:00.511001Z";
    expect(() =>
      assertPersistedStartResponse(
        payload,
        "2026-07-31T00:00:00.511001Z",
        "2026-07-31T00:01:00.511001Z",
        "Start pair-0"
      )
    ).toThrow(/route-issued canonical UTC lease/);

    payload.data.session.groups[0].hard_stop_at =
      "2026-07-31T00:01:00.511+00:00";
    expect(() =>
      assertPersistedStartResponse(
        payload,
        issuedAt,
        hardStopAt,
        "Start pair-0"
      )
    ).toThrow(/lease changed/);
  });

  it("accepts the backend whole-second canonical form for a zero-millisecond lease", () => {
    const payload = {
      ok: true,
      data: {
        accepted: true,
        state_persisted: true,
        ports: [0, 1],
        session: {
          id: "gate-session",
          state: "running",
          groups: [{
            group_id: "pair-0",
            ports: [0, 1],
            state: "running",
            hard_stop_at: "2026-07-31T00:01:00Z"
          }]
        }
      }
    };

    expect(
      assertPersistedStartResponse(
        payload,
        leaseIssuedAt,
        leaseHardStopAt
      )
    ).toBe("gate-session");
  });

  it("observes the response waiter even when the click fails", async () => {
    let responseWaiterSettled = false;
    const page = {
      waitForResponse() {
        return new Promise((_, reject) => {
          setTimeout(() => {
            responseWaiterSettled = true;
            reject(new Error("response timeout"));
          }, 0);
        });
      }
    };
    const locator = {
      async click() {
        throw new Error("click failed");
      }
    };

    await expect(
      clickForResponse(page, locator, "POST", "/api/trex/traffic/stop", 10)
    ).rejects.toThrow("click failed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(responseWaiterSettled).toBe(true);
  });
});

describe("browser write allowlist", () => {
  it("allows reads and only the exact bounded plan replacement", () => {
    expect(classify("GET", "/api/trex/traffic/runtime").action).toBe("read");
    expect(
      classify("PUT", "/api/trex/traffic/plan", {
        plan_revision: 7,
        groups: structuredClone(savedGroups)
      })
    ).toMatchObject({ allowed: true, action: "save-plan" });
    expect(
      classify("PUT", "/api/trex/traffic/plan", {
        plan_revision: 7,
        groups: originalGroups
      })
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/bounded/) });
    expect(
      classify("PUT", "/api/trex/traffic/plan", {
        plan_revision: 6,
        groups: savedGroups
      })
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/revision/) });
  });

  it("allows only pair-0 start and single-port P0/P1 pause/resume", () => {
    expect(
      classify("POST", "/api/trex/traffic/group/pair-0/start", {
        plan_revision: 8,
        confirmation: "start-traffic",
        expected_session_id: null,
        hard_stop_at: leaseHardStopAt
      })
    ).toMatchObject({ allowed: true, action: "start-group" });
    expect(
      classify("POST", "/api/trex/traffic/group/pair-1/start", {
        plan_revision: 8,
        confirmation: "start-traffic",
        expected_session_id: null,
        hard_stop_at: leaseHardStopAt
      })
    ).toMatchObject({ allowed: false });
    expect(
      classify("POST", "/api/trex/traffic/group/pair-0/start", {
        plan_revision: 8,
        confirmation: "start-traffic",
        expected_session_id: "stale-session",
        hard_stop_at: leaseHardStopAt
      })
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/no traffic session/) });
    expect(
      classify("POST", "/api/trex/traffic/pause", {
        ports: [0],
        confirmation: null,
        expected_session_id: "gate-session"
      })
    ).toMatchObject({ allowed: true, action: "pause:0" });
    expect(
      classify("POST", "/api/trex/traffic/resume", {
        ports: [1],
        confirmation: null,
        expected_session_id: "gate-session"
      })
    ).toMatchObject({ allowed: true, action: "resume:1" });
    expect(
      classify("POST", "/api/trex/traffic/pause", {
        ports: [0, 1],
        confirmation: null,
        expected_session_id: "gate-session"
      })
    ).toMatchObject({ allowed: false });
  });

  it("injects one exact UTC hard-stop lease and rejects UI-supplied lease fields", () => {
    const nowMs = Date.parse(leaseIssuedAt);
    const rawStart = {
      method: "POST",
      url: "http://trex.lab/api/trex/traffic/group/pair-0/start",
      postData: JSON.stringify({
        plan_revision: 8,
        confirmation: "start-traffic",
        expected_session_id: null
      })
    };
    const hardened = hardenBrowserActionRequest(rawStart, writePolicy(), nowMs);

    expect(hardened).toMatchObject({
      allowed: true,
      rewritten: true,
      body: {
        plan_revision: 8,
        confirmation: "start-traffic",
        expected_session_id: null,
        hard_stop_at: leaseHardStopAt
      },
      hardStopLease: {
        issued_at: leaseIssuedAt,
        hard_stop_at: leaseHardStopAt,
        lease_seconds: 60
      }
    });
    expect(
      classifyBrowserRequest(hardened.request, writePolicy())
    ).toMatchObject({
      allowed: true,
      action: "start-group",
      hardStopLease: {
        issued_at: leaseIssuedAt,
        hard_stop_at: leaseHardStopAt
      }
    });

    expect(
      hardenBrowserActionRequest(
        {
          ...rawStart,
          postData: JSON.stringify({
            plan_revision: 8,
            confirmation: "start-traffic",
            expected_session_id: null,
            hard_stop_at: leaseHardStopAt
          })
        },
        writePolicy(),
        nowMs
      )
    ).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/must not pre-supply/)
    });
  });

  it("accepts equivalent canonical forms but rejects dirty, altered, or wrong-window leases", () => {
    const body = {
      plan_revision: 8,
      confirmation: "start-traffic",
      expected_session_id: null,
      hard_stop_at: leaseHardStopAt
    };
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        { ...body, hard_stop_at: "2026-07-31T00:01:00Z" }
      )
    ).toMatchObject({ allowed: true, action: "start-group" });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        { ...body, hard_stop_at: "2026-07-31T00:01:00.0000Z" }
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/UTC lease/) });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        { ...body, hard_stop_at: "2026-07-31T00:01:00.000000Z" }
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/UTC lease/) });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        { ...body, hard_stop_at: "2026-07-31T00:01:00.000+00:00" }
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/UTC lease/) });
    const millisecondPolicy = {
      hardStopIssuedAt: "2026-07-31T00:00:00.511Z",
      hardStopAt: "2026-07-31T00:01:00.511Z"
    };
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        {
          ...body,
          hard_stop_at: "2026-07-31T00:01:00.511000Z"
        },
        millisecondPolicy
      )
    ).toMatchObject({ allowed: true, action: "start-group" });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        {
          ...body,
          hard_stop_at: "2026-07-31T00:01:00.511001Z"
        },
        millisecondPolicy
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/UTC lease/) });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        body,
        { hardStopAt: "2026-07-31T00:01:01.000Z" }
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/UTC lease/) });
    expect(
      classify(
        "POST",
        "/api/trex/traffic/group/pair-0/start",
        body,
        { hardStopIssuedAt: "2026-07-31T00:00:01.000Z" }
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/exactly bounded/) });
  });

  it("allows only confirmed, session-fenced P0/P1 stop and rejects every other write", () => {
    expect(
      classify("POST", "/api/trex/traffic/stop", {
        ports: [0, 1],
        confirmation: "stop",
        expected_session_id: "gate-session"
      })
    ).toMatchObject({ allowed: true, action: "stop-pair" });
    expect(
      classify("POST", "/api/trex/traffic/stop", {
        ports: null,
        confirmation: "stop",
        expected_session_id: "gate-session"
      })
    ).toMatchObject({ allowed: false });
    expect(
      classify("POST", "/api/trex/traffic/pause", {
        ports: [0],
        confirmation: null
      })
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/session fence/) });
    expect(
      classify("POST", "/api/trex/traffic/resume", {
        ports: [0],
        confirmation: null,
        expected_session_id: "other-session"
      })
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/session fence/) });
    expect(classify("DELETE", "/api/trex/profiles/a.py", {})).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/allowlist/)
    });
    expect(
      classifyBrowserRequest(
        {
          method: "POST",
          url: "https://other.example/api/trex/traffic/stop",
          postData: JSON.stringify({
            ports: [0, 1],
            confirmation: "stop",
            expected_session_id: "gate-session"
          })
        },
        writePolicy()
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/same-origin/) });
  });

  it("enforces the complete write sequence without accepting duplicates", () => {
    let index = 0;
    for (const action of expectedBrowserWriteSequence) {
      const consumed = consumeExpectedBrowserWrite(index, action);
      expect(consumed.allowed).toBe(true);
      index = consumed.nextIndex;
    }
    expect(index).toBe(expectedBrowserWriteSequence.length);
    expect(consumeExpectedBrowserWrite(index, "stop-pair")).toMatchObject({
      allowed: false,
      nextIndex: index
    });
    expect(consumeExpectedBrowserWrite(2, "pause:1")).toMatchObject({
      allowed: false,
      nextIndex: 2
    });
  });

  it("hardens UI actions with the verified session fence and explicit P0/P1 stop", () => {
    const pause = hardenBrowserActionRequest(
      {
        method: "POST",
        url: "http://trex.lab/api/trex/traffic/pause",
        postData: JSON.stringify({ ports: [0], confirmation: null })
      },
      writePolicy()
    );
    expect(pause).toMatchObject({
      allowed: true,
      rewritten: true,
      body: {
        ports: [0],
        confirmation: null,
        expected_session_id: "gate-session"
      }
    });
    expect(classifyBrowserRequest(pause.request, writePolicy())).toMatchObject({
      allowed: true,
      action: "pause:0"
    });

    const stop = hardenBrowserActionRequest(
      {
        method: "POST",
        url: "http://trex.lab/api/trex/traffic/stop",
        postData: JSON.stringify({ ports: null, confirmation: "stop" })
      },
      writePolicy()
    );
    expect(stop).toMatchObject({
      allowed: true,
      rewritten: true,
      body: {
        ports: [0, 1],
        confirmation: "stop",
        expected_session_id: "gate-session"
      }
    });
    expect(classifyBrowserRequest(stop.request, writePolicy())).toMatchObject({
      allowed: true,
      action: "stop-pair"
    });
  });

  it("refuses to harden an action before start authority or across a CAS mismatch", () => {
    const action = {
      method: "POST",
      url: "http://trex.lab/api/trex/traffic/pause",
      postData: JSON.stringify({ ports: [0], confirmation: null })
    };
    expect(
      hardenBrowserActionRequest(action, writePolicy({ sessionId: null }))
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/start/) });
    expect(
      hardenBrowserActionRequest(
        {
          ...action,
          postData: JSON.stringify({
            ports: [0],
            confirmation: null,
            expected_session_id: "competing-session"
          })
        },
        writePolicy()
      )
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/differs/) });
  });

  it("compares JSON objects independent of object key order but preserves arrays", () => {
    expect(jsonValuesEqual({ b: 2, a: { y: 1, x: 0 } }, { a: { x: 0, y: 1 }, b: 2 })).toBe(true);
    expect(jsonValuesEqual({ ports: [0, 1] }, { ports: [1, 0] })).toBe(false);
  });
});

describe("hardware preflight and runtime authority", () => {
  it("accepts exact released P0/P1 with up links, idle traffic, and zero captures", () => {
    const result = evaluatePreflight({
      ports: portsSnapshot(),
      runtime: idleRuntime(),
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } },
      environment: rcEnvironment()
    });
    expect(result).toMatchObject({
      ok: true,
      blockers: [],
      connect_timeout_seconds: 3,
      group: { id: "pair-0", ports: [0, 1] }
    });
  });

  it("rejects preflight runtime state that was not freshly sampled from TRex", () => {
    const runtime = idleRuntime();
    runtime.live_state_sampled = false;
    runtime.port_states = runtime.port_states.map((row) => ({
      ...row,
      state: "unknown"
    }));

    expect(evaluatePreflight({
      ports: portsSnapshot(),
      runtime,
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } },
      environment: rcEnvironment()
    })).toMatchObject({
      ok: false,
      blockers: expect.arrayContaining([
        expect.stringMatching(/freshly sampled live TRex/)
      ])
    });
  });

  it("requires a 1..3 second sync timeout before any browser write", () => {
    const input = {
      ports: portsSnapshot(),
      runtime: idleRuntime(),
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } }
    };
    for (const connectTimeoutSeconds of [1, 2, 3]) {
      expect(evaluatePreflight({
        ...input,
        environment: rcEnvironment(connectTimeoutSeconds)
      })).toMatchObject({
        ok: true,
        connect_timeout_seconds: connectTimeoutSeconds
      });
    }
    for (const environment of [
      {},
      rcEnvironment(0),
      rcEnvironment(4),
      rcEnvironment(1.5),
      rcEnvironment(true)
    ]) {
      expect(evaluatePreflight({
        ...input,
        environment
      })).toMatchObject({
        ok: false,
        blockers: expect.arrayContaining([
          expect.stringMatching(/connect_timeout_seconds in 1\.\.3/)
        ])
      });
    }
  });

  it("blocks before the first write unless live and runtime inventories are exact P0-P5", () => {
    const missingRuntime = idleRuntime();
    missingRuntime.port_states.pop();
    expect(evaluatePreflight({
      ports: portsSnapshot(),
      runtime: missingRuntime,
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } },
      environment: rcEnvironment()
    })).toMatchObject({
      ok: false,
      blockers: expect.arrayContaining([expect.stringMatching(/exactly one state row/)])
    });

    const duplicateRuntime = idleRuntime();
    duplicateRuntime.port_states.push({
      port: 4,
      state: "stopped",
      ownership: "none"
    });
    expect(evaluatePreflight({
      ports: portsSnapshot(),
      runtime: duplicateRuntime,
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } },
      environment: rcEnvironment()
    }).blockers.join("\n")).toMatch(/exactly one state row/);

    const extraLive = portsSnapshot();
    extraLive.ports.push({ id: 6, acquired: false, info: { link: "DOWN" } });
    expect(evaluatePreflight({
      ports: extraLive,
      runtime: idleRuntime(),
      capture: { captures: [], port_usage: [], service_mode: { managed_capture_ids: [] } },
      environment: rcEnvironment()
    }).blockers.join("\n")).toMatch(/exactly one row.*P0-P5/);
  });

  it("reports link, mapping, external traffic, acquisition, and capture blockers", () => {
    const ports = portsSnapshot();
    ports.ports[0].info.link = "DOWN";
    ports.ports[4].acquired = true;
    const runtime = idleRuntime();
    runtime.groups[0].ports = [0, 2];
    runtime.port_states[1] = { port: 1, state: "unknown", ownership: "external" };
    const result = evaluatePreflight({
      ports,
      runtime,
      capture: { captures: [{ id: 9 }], service_mode: { managed_capture_ids: [9] } },
      environment: rcEnvironment()
    });
    expect(result.ok).toBe(false);
    expect(result.blockers.join("\n")).toContain("pair-0 must map exactly");
    expect(result.blockers.join("\n")).toContain("P0 link is not UP");
    expect(result.blockers.join("\n")).toContain("external or uncertain traffic");
    expect(result.blockers.join("\n")).toContain("P4");
    expect(result.blockers.join("\n")).toContain("capture");
  });

  it("requires the persisted session and managed port states for every phase", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "gate-session",
      state: "running",
      started_at: "2026-07-31T00:00:00Z",
      groups: [{ group_id: "pair-0", ports: [0, 1], state: "running" }]
    };
    runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };
    expect(runtimeMatchesStage(runtime, "running", "gate-session")).toBe(true);
    runtime.port_states[1].ownership = "external";
    expect(runtimeMatchesStage(runtime, "running", "gate-session")).toBe(false);
  });

  it("rejects an extra session group or concurrent traffic outside P0/P1 immediately", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "gate-session",
      state: "running",
      started_at: "2026-07-31T00:00:00Z",
      groups: [{ group_id: "pair-0", ports: [0, 1], state: "running" }]
    };
    runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };

    expect(evaluateRuntimeAuthority(runtime, "gate-session")).toMatchObject({ ok: true });
    runtime.session.groups.push({ group_id: "pair-1", ports: [2, 3], state: "running" });
    expect(evaluateRuntimeAuthority(runtime, "gate-session")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/extra/)
    });

    runtime.session.groups.pop();
    runtime.port_states[2] = { port: 2, state: "running", ownership: "managed" };
    expect(evaluateRuntimeStage(runtime, "running", "gate-session")).toMatchObject({
      ready: false,
      authority_changed: true,
      reason: expect.stringMatching(/outside P0\/P1/)
    });
  });

  it("revalidates exact P0-P5 inventory during normal running and action stages", () => {
    const runningRuntime = () => {
      const runtime = idleRuntime();
      runtime.session = {
        id: "gate-session",
        state: "running",
        started_at: "2026-07-31T00:00:00Z",
        groups: [{ group_id: "pair-0", ports: [0, 1], state: "running" }]
      };
      runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
      runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };
      return runtime;
    };
    const expectedPorts = [0, 1, 2, 3, 4, 5];
    expect(
      evaluateRuntimeStage(
        runningRuntime(),
        "running",
        "gate-session",
        undefined,
        expectedPorts
      )
    ).toMatchObject({ ready: true, authority_changed: false });

    const incomplete = runningRuntime();
    incomplete.port_states = incomplete.port_states.filter((row) => row.port !== 5);
    expect(
      evaluateRuntimeStage(
        incomplete,
        "running",
        "gate-session",
        undefined,
        expectedPorts
      )
    ).toMatchObject({
      ready: false,
      authority_changed: true,
      reason: expect.stringMatching(/exactly one state row/)
    });

    const duplicate = runningRuntime();
    duplicate.port_states.push({ port: 3, state: "stopped", ownership: "none" });
    expect(
      evaluateRuntimeAuthority(
        duplicate,
        "gate-session",
        "pair-0",
        undefined,
        "running",
        expectedPorts
      )
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/exactly one state row/) });

    const changedAvailable = runningRuntime();
    changedAvailable.available_ports = [0, 1, 2, 3, 4];
    expect(
      evaluateRuntimeAuthority(
        changedAvailable,
        "gate-session",
        "pair-0",
        undefined,
        "running",
        expectedPorts
      )
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/changed after preflight/) });

    const outsideActive = runningRuntime();
    outsideActive.port_states[4] = { port: 4, state: "running", ownership: "managed" };
    expect(
      evaluateRuntimeStage(
        outsideActive,
        "running",
        "gate-session",
        undefined,
        expectedPorts
      )
    ).toMatchObject({
      ready: false,
      authority_changed: true,
      reason: expect.stringMatching(/outside P0\/P1/)
    });
  });

  it("cleans up only a managed pair-0 session attributable to this gate", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "gate-session",
      state: "running",
      started_at: "2026-07-31T00:01:00Z",
      groups: [{ group_id: "pair-0", ports: [0, 1], state: "running" }]
    };
    runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };
    expect(
      cleanupOwnershipDecision(runtime, {
        groupId: "pair-0",
        sessionId: "gate-session",
        startAttempted: true
      })
    ).toMatchObject({ safe: true, stop: true });

    runtime.port_states[1].ownership = "external";
    expect(
      cleanupOwnershipDecision(runtime, {
        groupId: "pair-0",
        sessionId: "gate-session",
        startAttempted: true
      })
    ).toMatchObject({ safe: false, stop: false });
  });

  it("never stops an active session without the exact verified start response ID", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "unknown-session",
      state: "running",
      started_at: "2026-07-31T00:01:01Z",
      groups: [{ group_id: "pair-0", ports: [0, 1], state: "running" }]
    };
    runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };

    expect(
      cleanupOwnershipDecision(runtime, {
        groupId: "pair-0",
        sessionId: null,
        startAttempted: true
      })
    ).toMatchObject({
      safe: false,
      stop: false,
      reason: expect.stringMatching(/lost Start response/)
    });
    expect(
      cleanupOwnershipDecision(runtime, {
        groupId: "pair-0",
        sessionId: "gate-session",
        startAttempted: true
      })
    ).toMatchObject({
      safe: false,
      stop: false,
      reason: expect.stringMatching(/session ID changed/)
    });
  });

  it("never adopts a runtime session after a lost response and waits through lease grace", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "response-lost-session",
      state: "running",
      groups: [{
        group_id: "pair-0",
        ports: [0, 1],
        state: "running",
        hard_stop_at: leaseHardStopAt
      }]
    };
    runtime.port_states[0] = { port: 0, state: "running", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };
    const hardStopAtMs = Date.parse(leaseHardStopAt);

    expect(cleanupOwnershipDecision(runtime, context)).toMatchObject({
      safe: false,
      stop: false,
      reason: expect.stringMatching(/lease recovery/)
    });
    expect(
      lostStartResponseLeaseDecision(runtime, context, hardStopAtMs - 1)
    ).toMatchObject({
      applicable: true,
      wait: true,
      safe: false,
      reason: expect.stringMatching(/persisted hard-stop lease/)
    });
    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        hardStopAtMs + hardStopLeaseGraceMs - 1
      )
    ).toMatchObject({ applicable: true, wait: true, safe: false });
    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        hardStopAtMs + hardStopLeaseGraceMs
      )
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: false,
      reason: expect.stringMatching(/did not become stopped/)
    });

    runtime.session.state = "stopped";
    runtime.session.groups[0].state = "stopped";
    runtime.session.groups[0].hard_stop_at = null;
    runtime.port_states[0] = { port: 0, state: "stopped", ownership: "none" };
    runtime.port_states[1] = { port: 1, state: "stopped", ownership: "none" };
    expect(cleanupOwnershipDecision(runtime, context)).toMatchObject({
      safe: false,
      reason: expect.stringMatching(/lease recovery/)
    });
    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        hardStopAtMs + hardStopLeaseGraceMs
      )
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: true,
      reason: expect.stringMatching(/lease expired/)
    });

    runtime.session.id = "some-other-session";
    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        hardStopAtMs + hardStopLeaseGraceMs
      )
    ).toMatchObject({ safe: true, wait: false });
    expect(context.sessionId).toBeNull();
  });

  it("retries only reaper-priority runtime blockers inside the exact lost-response lease window", () => {
    const context = Object.freeze({
      startAttempted: true,
      sessionId: null,
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt
    });
    const beforeDeadline =
      Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs - 1;

    for (const blocker of [
      "traffic_hard_stop_window_insufficient",
      "traffic_hard_stop_priority"
    ]) {
      expect(
        lostResponseRuntimeRetryDecision(
          { blocker },
          context,
          beforeDeadline
        )
      ).toMatchObject({
        retry: true,
        blocker,
        deadline: Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs,
        backoff_ms: 1
      });
    }
    expect(context.sessionId).toBeNull();

    expect(
      lostResponseRuntimeRetryDecision(
        { blocker: "traffic_hard_stop_window_insufficient" },
        context,
        Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs
      )
    ).toMatchObject({ retry: false, backoff_ms: 0 });
    expect(
      lostResponseRuntimeRetryDecision(
        { blocker: "traffic_mutation_recovery_required" },
        context,
        beforeDeadline
      )
    ).toMatchObject({
      retry: false,
      blocker: "traffic_mutation_recovery_required"
    });
  });

  it("waits on typed durable-only snapshots only inside the exact lost-response lease window", () => {
    const runtime = idleRuntime();
    runtime.live_state_sampled = false;
    runtime.session.groups[0].hard_stop_at = leaseHardStopAt;
    runtime.port_states = runtime.port_states.map((row) => ({
      ...row,
      state: "unknown"
    }));
    const context = Object.freeze({
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    });
    const deadline = Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs;

    expect(
      lostStartResponseLeaseDecision(runtime, context, deadline - 1)
    ).toMatchObject({
      applicable: true,
      wait: true,
      safe: false,
      deadline,
      reason: expect.stringMatching(/fresh live TRex sample/)
    });
    expect(
      lostStartResponseLeaseDecision(runtime, context, deadline)
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: false,
      deadline,
      reason: expect.stringMatching(/requires a fresh live TRex sample/)
    });
    expect(context.sessionId).toBeNull();

    runtime.live_state_sampled = true;
    runtime.session.groups[0].hard_stop_at = null;
    runtime.port_states = runtime.port_states.map((row) => ({
      ...row,
      state: "stopped",
      ownership: "none"
    }));
    expect(
      lostStartResponseLeaseDecision(runtime, context, deadline)
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: true,
      reason: expect.stringMatching(/lease expired/)
    });
  });

  it("never waits on a non-live snapshot without the exact route-issued lease", () => {
    const runtime = idleRuntime();
    runtime.live_state_sampled = false;
    runtime.port_states = runtime.port_states.map((row) => ({
      ...row,
      state: "unknown"
    }));
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };

    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        Date.parse(leaseHardStopAt) - 1
      )
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: false,
      reason: expect.stringMatching(/exact route-issued 60-second/)
    });

    delete runtime.live_state_sampled;
    expect(
      lostStartResponseLeaseDecision(
        runtime,
        { ...context, hardStopIssuedAt: leaseIssuedAt },
        Date.parse(leaseHardStopAt) - 1
      )
    ).toMatchObject({
      applicable: true,
      wait: false,
      safe: false,
      reason: expect.stringMatching(/omitted/)
    });
  });

  it("never declares fresh idle cleanup safe with an inexact route lease", () => {
    const runtime = idleRuntime();
    runtime.session.groups[0].hard_stop_at = null;
    const base = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };
    for (const context of [
      {
        ...base,
        hardStopIssuedAt: leaseIssuedAt
      },
      {
        ...base,
        hardStopIssuedAt: leaseIssuedAt,
        hardStopAt: "not-a-timestamp"
      },
      {
        ...base,
        hardStopAt: leaseHardStopAt
      },
      {
        ...base,
        hardStopIssuedAt: "2026-07-31T00:00:00.511001Z",
        hardStopAt: "2026-07-31T00:01:00.511001Z"
      },
      {
        ...base,
        hardStopIssuedAt: leaseIssuedAt,
        hardStopAt: "2026-07-31T00:00:59.000Z"
      }
    ]) {
      expect(cleanupOwnershipDecision(runtime, context)).toMatchObject({
        stop: false,
        safe: false,
        reason: expect.stringMatching(/lost Start response/)
      });
      const hardStopAtMs = Date.parse(context.hardStopAt);
      expect(
        lostStartResponseLeaseDecision(
          runtime,
          context,
          Number.isFinite(hardStopAtMs)
            ? hardStopAtMs + hardStopLeaseGraceMs
            : Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs
        )
      ).toMatchObject({
        applicable: true,
        wait: false,
        safe: false,
        reason: expect.stringMatching(/exact route-issued 60-second/)
      });
    }
  });

  it("does not retry without the exact route-issued lease or after adopting a session", () => {
    const beforeDeadline =
      Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs - 1;
    const blocker = { blocker: "traffic_hard_stop_priority" };
    const base = {
      startAttempted: true,
      sessionId: null,
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt
    };
    for (const context of [
      { ...base, startAttempted: false },
      { ...base, sessionId: "runtime-session-must-not-be-adopted" },
      { ...base, hardStopAt: null },
      { ...base, hardStopAt: "not-a-timestamp" },
      { ...base, hardStopIssuedAt: null },
      {
        ...base,
        hardStopIssuedAt: "2026-07-31T00:00:01.000Z"
      }
    ]) {
      expect(
        lostResponseRuntimeRetryDecision(blocker, context, beforeDeadline)
      ).toMatchObject({ retry: false, backoff_ms: 0 });
    }
  });

  it("does not declare lost-response cleanup safe before deadline even if P0/P1 look idle", () => {
    const runtime = idleRuntime();
    runtime.session.groups[0].hard_stop_at = null;
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };

    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        Date.parse(leaseHardStopAt) - 1
      )
    ).toMatchObject({ applicable: true, wait: true, safe: false });
  });

  it("requires lease clearance and outside-port idleness after the lost-response deadline", () => {
    const runtime = idleRuntime();
    runtime.session.groups[0].hard_stop_at = leaseHardStopAt;
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };
    const afterDeadline = Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs;

    expect(
      lostStartResponseLeaseDecision(runtime, context, afterDeadline)
    ).toMatchObject({
      safe: false,
      reason: expect.stringMatching(/remained bound/)
    });

    runtime.session.groups[0].hard_stop_at = null;
    runtime.port_states[4] = { port: 4, state: "running", ownership: "managed" };
    expect(
      lostStartResponseLeaseDecision(runtime, context, afterDeadline)
    ).toMatchObject({
      safe: false,
      reason: expect.stringMatching(/outside P0\/P1/)
    });
  });

  it("requires exactly one runtime row for every preflight-configured port", () => {
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };
    const afterDeadline = Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs;
    const missingOutside = idleRuntime();
    missingOutside.port_states = missingOutside.port_states.slice(0, 2);

    expect(
      lostStartResponseLeaseDecision(
        missingOutside,
        context,
        afterDeadline
      )
    ).toMatchObject({
      safe: false,
      wait: false,
      reason: expect.stringMatching(/exactly one state row/)
    });

    const duplicateOutside = idleRuntime();
    duplicateOutside.port_states.push({
      port: 2,
      state: "stopped",
      ownership: "none"
    });
    expect(
      lostStartResponseLeaseDecision(
        duplicateOutside,
        context,
        afterDeadline
      )
    ).toMatchObject({
      safe: false,
      wait: false,
      reason: expect.stringMatching(/exactly one state row/)
    });
  });

  it("keeps plan restoration unsafe while the exact expired Start WAL retains the lease", () => {
    const runtime = idleRuntime();
    runtime.session.groups[0].hard_stop_at = null;
    runtime.mutation_intent = {
      operation: "start",
      start_group: {
        group_id: "pair-0",
        ports: [0, 1],
        hard_stop_at: "2026-07-31T00:01:00Z"
      }
    };
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };

    expect(
      lostStartResponseLeaseDecision(
        runtime,
        context,
        Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs
      )
    ).toMatchObject({
      applicable: true,
      safe: false,
      wait: false,
      reason: expect.stringMatching(/Start WAL/)
    });
    expect(context.sessionId).toBeNull();
  });

  it("keeps plan restoration unsafe for every non-exact pending mutation", () => {
    const context = {
      startAttempted: true,
      sessionId: null,
      groupId: "pair-0",
      hardStopIssuedAt: leaseIssuedAt,
      hardStopAt: leaseHardStopAt,
      expectedPortIds: [0, 1, 2, 3, 4, 5]
    };
    const deadline = Date.parse(leaseHardStopAt) + hardStopLeaseGraceMs;
    for (const mutationIntent of [
      {
        operation: "start",
        start_group: {
          group_id: "pair-1",
          ports: [2, 3],
          hard_stop_at: "2026-07-31T00:02:00.000Z"
        }
      },
      {
        operation: "update",
        ports: [2, 3],
        cleanup_required: true
      }
    ]) {
      const runtime = idleRuntime();
      runtime.session.groups[0].hard_stop_at = null;
      runtime.mutation_intent = mutationIntent;

      expect(
        lostStartResponseLeaseDecision(runtime, context, deadline)
      ).toMatchObject({
        applicable: true,
        safe: false,
        wait: false,
        reason: expect.stringMatching(/concurrent pending traffic mutation/)
      });
      expect(planRestorationDecision(runtime, {
        ...context,
        originalGroups,
        savedGroups,
        savedRevision: 8
      })).toMatchObject({
        safe: false,
        restore: false,
        reason: expect.stringMatching(/pending traffic mutation/)
      });
    }
  });

  it("restores a plan only while the exact gate-owned revision is current", () => {
    const runtime = idleRuntime();
    runtime.groups = structuredClone(savedGroups);
    runtime.plan_revision = 8;
    const context = {
      originalGroups,
      savedGroups,
      savedRevision: 8
    };

    expect(planRestorationDecision(runtime, context)).toMatchObject({
      safe: true,
      restore: true,
      planRevision: 8
    });

    runtime.plan_revision = 9;
    expect(planRestorationDecision(runtime, context)).toMatchObject({
      safe: false,
      restore: false,
      reason: expect.stringMatching(/exact gate write/)
    });

    runtime.groups = structuredClone(originalGroups);
    expect(planRestorationDecision(runtime, context)).toMatchObject({
      safe: true,
      restore: false
    });
  });

  it.each([
    ["HTTP failure", "http"],
    ["invalid persisted response", "assertion"]
  ])("never restores the traffic plan after cleanup Stop %s", async (_label, failureMode) => {
    const calls = [];
    let runtimeReads = 0;
    const originalFetch = globalThis.fetch;
    const response = (payload, status = 200) => new Response(
      JSON.stringify(payload),
      {
        status,
        headers: { "content-type": "application/json" }
      }
    );
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = String(init.method ?? "GET").toUpperCase();
      calls.push({ method, pathname: url.pathname });
      if (method === "GET" && url.pathname === "/api/trex/traffic/runtime") {
        runtimeReads += 1;
        if (runtimeReads === 1) {
          return response({ ok: true, data: activeGateRuntime() });
        }
        const idle = idleRuntime();
        idle.plan_revision = runtimeReads === 2 ? 8 : 9;
        idle.groups = structuredClone(
          runtimeReads === 2 ? savedGroups : originalGroups
        );
        return response({ ok: true, data: idle });
      }
      if (method === "POST" && url.pathname === "/api/trex/traffic/stop") {
        if (failureMode === "http") {
          return response({
            ok: false,
            blocker: "traffic_stop_failed",
            error: "injected cleanup Stop failure"
          }, 500);
        }
        const runtime = activeGateRuntime();
        return response({
          ok: true,
          data: {
            accepted: true,
            action: "stop",
            ports: [0, 1],
            state_persisted: false,
            session: runtime.session
          }
        });
      }
      if (method === "PUT" && url.pathname === "/api/trex/traffic/plan") {
        const restored = idleRuntime();
        restored.groups = structuredClone(originalGroups);
        restored.plan_revision = 9;
        return response({ ok: true, data: restored });
      }
      if (method === "GET" && url.pathname === "/api/trex/ports") {
        return response({ ok: true, data: portsSnapshot() });
      }
      if (method === "GET" && url.pathname === "/api/trex/capture/status") {
        return response({
          ok: true,
          data: {
            captures: [],
            port_usage: [],
            service_mode: { managed_capture_ids: [] }
          }
        });
      }
      throw new Error(`unexpected test request ${method} ${url.pathname}`);
    };

    try {
      const result = cleanupTestResult();
      await cleanupProductionBrowserWriteAcceptance(
        result,
        {
          baseUrl: "http://trex.lab/",
          timeoutMs: 1_000
        },
        {
          originalGroups: structuredClone(originalGroups),
          savedGroups: structuredClone(savedGroups),
          savedRevision: 8,
          planWriteAttempted: true,
          startAttempted: true,
          sessionId: "gate-session",
          hardStopIssuedAt: leaseIssuedAt,
          hardStopAt: leaseHardStopAt,
          expectedPortIds: [0, 1, 2, 3, 4, 5]
        }
      );

      expect(
        calls.filter(
          (call) => call.method === "PUT"
            && call.pathname === "/api/trex/traffic/plan"
        )
      ).toEqual([]);
      expect(result.cleanup.plan_restoration).toMatchObject({
        attempted: false,
        restored: false,
        reason: expect.stringMatching(/unsafe/)
      });
      expect(result.cleanup.stop_verification).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([
    ["missing", undefined],
    ["invalid", "not-a-timestamp"]
  ])("fails cleanup closed after a lost Start with %s hard_stop_at", async (_label, hardStopAt) => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    const response = (payload) => new Response(
      JSON.stringify(payload),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = String(init.method ?? "GET").toUpperCase();
      calls.push({ method, pathname: url.pathname });
      if (method === "GET" && url.pathname === "/api/trex/traffic/runtime") {
        const runtime = idleRuntime();
        runtime.plan_revision = 8;
        runtime.groups = structuredClone(savedGroups);
        return response({ ok: true, data: runtime });
      }
      if (method === "GET" && url.pathname === "/api/trex/ports") {
        return response({ ok: true, data: portsSnapshot() });
      }
      if (method === "GET" && url.pathname === "/api/trex/capture/status") {
        return response({
          ok: true,
          data: {
            captures: [],
            port_usage: [],
            service_mode: { managed_capture_ids: [] }
          }
        });
      }
      if (method === "PUT" && url.pathname === "/api/trex/traffic/plan") {
        const restored = idleRuntime();
        restored.groups = structuredClone(originalGroups);
        restored.plan_revision = 9;
        return response({ ok: true, data: restored });
      }
      throw new Error(`unexpected test request ${method} ${url.pathname}`);
    };

    try {
      const result = cleanupTestResult();
      await cleanupProductionBrowserWriteAcceptance(
        result,
        {
          baseUrl: "http://trex.lab/",
          timeoutMs: 1_000
        },
        {
          originalGroups: structuredClone(originalGroups),
          savedGroups: structuredClone(savedGroups),
          savedRevision: 8,
          planWriteAttempted: true,
          startAttempted: true,
          sessionId: null,
          hardStopIssuedAt: leaseIssuedAt,
          hardStopAt,
          expectedPortIds: [0, 1, 2, 3, 4, 5]
        }
      );

      expect(result.cleanup.ownership_decision).toMatchObject({
        stop: false,
        safe: false,
        reason: expect.stringMatching(/exact route-issued 60-second/)
      });
      expect(result.cleanup.lease_expiry_recovery).toMatchObject({
        attempted: true,
        safe: false,
        deadline: null
      });
      expect(
        calls.filter(
          (call) => call.method === "PUT"
            && call.pathname === "/api/trex/traffic/plan"
        )
      ).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts the real cleanup stop response action while keeping the cleanup label diagnostic", () => {
    const payload = {
      ok: true,
      data: {
        accepted: true,
        action: "stop",
        ports: [0, 1],
        state_persisted: true,
        session: {
          id: "gate-session",
          state: "stopped",
          started_at: "2026-07-31T00:01:00Z",
          groups: [
            {
              group_id: "pair-0",
              ports: [0, 1],
              state: "stopped",
              port_states: { 0: "stopped", 1: "stopped" },
              hard_stop_at: null
            }
          ]
        }
      }
    };

    expect(() =>
      assertPersistedAction(
        payload,
        "stop",
        "gate-session",
        [0, 1],
        leaseHardStopAt,
        "cleanup stop"
      )
    ).not.toThrow();
    expect(() =>
      assertPersistedAction(
        { ...payload, data: { ...payload.data, action: "pause" } },
        "stop",
        "gate-session",
        [0, 1],
        leaseHardStopAt,
        "cleanup stop"
      )
    ).toThrow(/cleanup stop response/);

    const uncleared = structuredClone(payload);
    uncleared.data.session.groups[0].hard_stop_at = leaseHardStopAt;
    expect(() =>
      assertPersistedAction(
        uncleared,
        "stop",
        "gate-session",
        [0, 1],
        leaseHardStopAt
      )
    ).toThrow(/did not clear/);
  });

  it("keeps exact authority while a per-port session group is mixed", () => {
    const runtime = idleRuntime();
    runtime.session = {
      id: "gate-session",
      state: "mixed",
      started_at: "2026-07-31T00:00:00Z",
      groups: [
        {
          group_id: "pair-0",
          ports: [0, 1],
          state: "mixed",
          port_states: { 0: "paused", 1: "running" }
        }
      ]
    };
    runtime.port_states[0] = { port: 0, state: "paused", ownership: "managed" };
    runtime.port_states[1] = { port: 1, state: "running", ownership: "managed" };

    expect(evaluateRuntimeAuthority(runtime, "gate-session")).toMatchObject({ ok: true });
    expect(evaluateRuntimeStage(runtime, "paused", "gate-session")).toMatchObject({
      ready: false,
      authority_changed: false
    });
  });
});

describe("failure aggregation", () => {
  it("turns every browser, HTTP, blocker, dialog, and cleanup channel into a failure", () => {
    const messages = acceptanceFailureMessages({
      acceptance_errors: ["stage failed"],
      page_errors: ["render failed"],
      console_errors: ["console failed"],
      request_failures: [{ method: "GET", url: "http://trex/app.js", error: "reset" }],
      http_failures: [{ method: "GET", url: "http://trex/api/health", status: 502 }],
      blocked_requests: [{ method: "POST", url: "http://trex/api/other", reason: "not allowed" }],
      unexpected_dialogs: ["alert: surprise"],
      cleanup: { errors: ["traffic remains"] }
    });
    expect(messages).toHaveLength(8);
    expect(messages.join("\n")).toContain("blocked write: POST");
    expect(messages.join("\n")).toContain("cleanup: traffic remains");
  });
});
