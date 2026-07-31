import { act } from "@testing-library/react";

import type { QuickValidationPhase, QuickValidationRun, QuickValidationStatus, TrexResult } from "./api";
import {
  App,
  afterEach,
  describe,
  expect,
  fireEvent,
  installAppTestHooks,
  it,
  overview,
  profileCatalog,
  render,
  screen,
  statsResponse,
  stubFetch,
  trafficRuntimeResult,
  vi,
  waitFor,
  within
} from "./test/appTestHarness";

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => payload
  });
}

function runFor(phase: QuickValidationPhase, revision: number): QuickValidationRun {
  const terminal = phase === "pass" || phase === "fail" || phase === "cancelled";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    revision,
    process_instance_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    phase,
    group: {
      group_id: "pair-0",
      plan_revision: 7,
      name: "P0 ↔ P1",
      ports: [0, 1],
      profile_path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
      profile_sha256: "b".repeat(64),
      multiplier: "1",
      plan_duration: -1,
      force: false,
      total: false,
      synchronized: false,
      clear_existing: true,
      tunables: {}
    },
    config: {
      path: "/var/lib/trex-webui/trex_cfg.yaml",
      port_limit: 2,
      interfaces: ["0000:02:00.0", "0000:02:00.1"]
    },
    duration_seconds: 10,
    created_at: "2026-07-31T10:00:00Z",
    started_at: "2026-07-31T10:00:00Z",
    deadline_at: "2026-07-31T10:00:10Z",
    watchdog_at: "2026-07-31T10:02:00Z",
    ended_at: terminal ? "2026-07-31T10:00:10Z" : null,
    traffic_session_id: "22222222-2222-4222-8222-222222222222",
    traffic_session_revision: terminal ? 4 : 1,
    traffic_run_id: "33333333-3333-4333-8333-333333333333",
    preflight: {
      observed_at: "2026-07-31T10:00:00Z",
      runtime_reconciliation: "live TRex port state reconciled",
      live_state_sampled: true,
      initial_port_states: { 0: "stopped", 1: "stopped" },
      initial_port_ownership: { 0: "none", 1: "none" },
      link_states: { 0: "up", 1: "up" },
      port_statuses: { 0: "idle", 1: "idle" },
      baseline_counters: {
        0: { tx_packets: 0, rx_packets: 0 },
        1: { tx_packets: 0, rx_packets: 0 }
      }
    },
    samples: [],
    pending_terminal: null,
    recovery_required: false,
    failure_code: null,
    failure_detail: null,
    cleanup: terminal
      ? {
          mode: "operator_stop",
          completed_at: "2026-07-31T10:00:10Z",
          traffic_session_revision: 4,
          final_port_states: { 0: "stopped", 1: "stopped" },
          intent_nonce: "44444444-4444-4444-8444-444444444444",
          acquisition_restored: true,
          wal_cleared: true
        }
      : null,
    idle_verified: terminal
  };
}

function statusFor(
  phase: QuickValidationPhase,
  revision: number
): TrexResult<QuickValidationStatus> {
  const run = runFor(phase, revision);
  return {
    ok: true,
    data: {
      state_version: 1,
      state_revision: revision,
      active: phase === "preflight" || phase === "running" || phase === "stopping",
      recovery_required: false,
      run,
      reconciliation: "quick-validation state reconciled"
    },
    blocker: null,
    error: null
  };
}

function runtimeAtRevision(revision: number) {
  return {
    ...trafficRuntimeResult,
    data: {
      ...trafficRuntimeResult.data,
      plan_revision: revision,
      groups: trafficRuntimeResult.data.groups.map((group) => ({ ...group }))
    }
  };
}

function requestPath(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("App / Quick Validation", () => {
  installAppTestHooks();

  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues active polling after a transient GET failure and reaches the later terminal state", async () => {
    let quickStatusReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/quick-validation") {
        quickStatusReads += 1;
        if (quickStatusReads === 1) {
          return jsonResponse(statusFor("running", 2));
        }
        if (quickStatusReads === 2) {
          return Promise.reject(new Error("temporary gateway failure"));
        }
        return jsonResponse(statusFor("pass", 5));
      }
      throw new Error(`Unexpected request ${path}`);
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await import("./components/workbench/QuickValidationWorkspace");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushMicrotasks();
    expect(screen.getByRole("dialog", { name: "Quick Validation" })).toBeInTheDocument();
    expect(screen.getByText("Traffic running")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("temporary gateway failure");
    expect(screen.getByText("Traffic running")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Pass", { selector: ".quick-validation-status-cell strong" })).toBeInTheDocument();
    expect(quickStatusReads).toBeGreaterThanOrEqual(3);
  });

  it("retries cancel once with the newer revision from the same active run", async () => {
    let cancelCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/quick-validation" && init === undefined) {
        return jsonResponse(statusFor("running", 2));
      }
      if (path === "/api/trex/quick-validation/cancel") {
        cancelCalls += 1;
        return jsonResponse(
          cancelCalls === 1
            ? {
                ...statusFor("running", 3),
                ok: false,
                blocker: "quick_validation_run_conflict",
                error: "quick-validation run id or revision changed; refresh status"
              }
            : statusFor("cancelled", 5)
        );
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const installedFetch = stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    const dialog = await screen.findByRole("dialog", { name: "Quick Validation" });
    await waitFor(() => expect(within(dialog).getByText("Traffic running")).toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel run" }));

    await waitFor(() => expect(
      within(dialog).getByText("Cancelled", { selector: ".quick-validation-status-cell strong" })
    ).toBeInTheDocument());
    const cancelRequests = installedFetch.mock.calls.filter(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/cancel"
    );
    expect(cancelRequests).toHaveLength(2);
    expect(cancelRequests.map(([, init]) => JSON.parse(String((init as RequestInit).body)))).toEqual([
      {
        run_id: "11111111-1111-4111-8111-111111111111",
        run_revision: 2,
        confirmation: "cancel-quick-validation"
      },
      {
        run_id: "11111111-1111-4111-8111-111111111111",
        run_revision: 3,
        confirmation: "cancel-quick-validation"
      }
    ]);
  });

  it.each([
    ["a different active run", "different-run"],
    ["a terminal revision", "terminal-run"]
  ])("does not retry cancel from conflict evidence for %s", async (_label, conflictKind) => {
    const foreignRunId = "99999999-9999-4999-8999-999999999999";
    const conflictStatus = conflictKind === "terminal-run"
      ? statusFor("cancelled", 4)
      : statusFor("running", 3);
    if (conflictKind === "different-run" && conflictStatus.data?.run) {
      conflictStatus.data.run = { ...conflictStatus.data.run, id: foreignRunId };
    }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/quick-validation" && init === undefined) {
        return jsonResponse(statusFor("running", 2));
      }
      if (path === "/api/trex/quick-validation/cancel") {
        return jsonResponse({
          ...conflictStatus,
          ok: false,
          blocker: "quick_validation_run_conflict",
          error: "cancel CAS rejected"
        });
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const installedFetch = stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    const dialog = await screen.findByRole("dialog", { name: "Quick Validation" });
    await waitFor(() => expect(within(dialog).getByText("Traffic running")).toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel run" }));

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("cancel CAS rejected"));
    expect(installedFetch.mock.calls.filter(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/cancel"
    )).toHaveLength(1);
  });

  it("keeps a cancel response authoritative over an older in-flight poll", async () => {
    type MockResponse = {
      json: () => Promise<unknown>;
      ok: boolean;
      status: number;
    };
    let quickStatusReads = 0;
    let resolveStalePoll: ((response: MockResponse) => void) | undefined;
    const stalePoll = new Promise<MockResponse>((resolve) => {
      resolveStalePoll = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/quick-validation" && init === undefined) {
        quickStatusReads += 1;
        if (quickStatusReads === 1) {
          return jsonResponse(statusFor("running", 2));
        }
        return stalePoll;
      }
      if (path === "/api/trex/quick-validation/cancel") {
        return jsonResponse(statusFor("cancelled", 4));
      }
      throw new Error(`Unexpected request ${path}`);
    });
    stubFetch(fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await import("./components/workbench/QuickValidationWorkspace");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushMicrotasks();
    const dialog = screen.getByRole("dialog", { name: "Quick Validation" });
    expect(within(dialog).getByText("Traffic running")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(quickStatusReads).toBe(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel run" }));
    await flushMicrotasks();
    expect(
      within(dialog).getByText("Cancelled", { selector: ".quick-validation-status-cell strong" })
    ).toBeInTheDocument();

    await act(async () => {
      resolveStalePoll?.({
        ok: true,
        status: 200,
        json: async () => statusFor("running", 3)
      });
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(
      within(dialog).getByText("Cancelled", { selector: ".quick-validation-status-cell strong" })
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Traffic running")).not.toBeInTheDocument();
  });

  it("keeps a successful start authoritative over an older terminal poll and retains exit guards", async () => {
    type MockResponse = {
      json: () => Promise<unknown>;
      ok: boolean;
      status: number;
    };
    let quickStatusReads = 0;
    let resolveStalePoll: ((response: MockResponse) => void) | undefined;
    const stalePoll = new Promise<MockResponse>((resolve) => {
      resolveStalePoll = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/quick-validation" && init === undefined) {
        quickStatusReads += 1;
        if (quickStatusReads === 1 || quickStatusReads === 3) {
          return jsonResponse(statusFor("pass", 4));
        }
        if (quickStatusReads === 2) {
          return stalePoll;
        }
        return jsonResponse(statusFor("running", 5));
      }
      if (path === "/api/trex/quick-validation/start") {
        return jsonResponse(statusFor("running", 5));
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const installedFetch = stubFetch(fetchMock, runtimeAtRevision(7));

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    await import("./components/workbench/QuickValidationWorkspace");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushMicrotasks();
    const dialog = screen.getByRole("dialog", { name: "Quick Validation" });
    expect(
      within(dialog).getByText("Pass", { selector: ".quick-validation-status-cell strong" })
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(quickStatusReads).toBe(2);

    fireEvent.click(within(dialog).getByLabelText("Confirm Quick Validation real hardware traffic"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start validation" }));
    await flushMicrotasks();
    expect(installedFetch.mock.calls.some(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/start"
    )).toBe(true);
    expect(within(dialog).getByText("Traffic running")).toBeInTheDocument();

    await act(async () => {
      resolveStalePoll?.({
        ok: true,
        status: 200,
        json: async () => statusFor("pass", 4)
      });
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(within(dialog).getByText("Traffic running")).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Pass", { selector: ".quick-validation-status-cell strong" })
    ).not.toBeInTheDocument();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(screen.getByRole("dialog", { name: "Quick Validation" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("rejects a confirmation whose run or plan authority drifted, then starts only after reconfirmation", async () => {
    let quickStatusReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/system/overview") {
        return jsonResponse(overview);
      }
      if (path === "/api/trex/profiles") {
        return jsonResponse(profileCatalog);
      }
      if (path === "/api/trex/stats") {
        return jsonResponse(statsResponse);
      }
      if (path === "/api/trex/quick-validation" && init === undefined) {
        quickStatusReads += 1;
        return jsonResponse(
          quickStatusReads === 1
            ? statusFor("pass", 4)
            : quickStatusReads <= 3
              ? statusFor("pass", 5)
              : statusFor("running", 6)
        );
      }
      if (path === "/api/trex/quick-validation/start") {
        return jsonResponse(statusFor("running", 6));
      }
      throw new Error(`Unexpected request ${path}`);
    });
    const installedFetch = stubFetch(fetchMock, [
      runtimeAtRevision(1),
      runtimeAtRevision(7),
      runtimeAtRevision(8),
      runtimeAtRevision(8),
      runtimeAtRevision(8)
    ]);

    render(<App />);
    await waitFor(() => expect(screen.getByText("Connected to TRex RPC")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Tests" }));
    const dialog = await screen.findByRole("dialog", { name: "Quick Validation" });
    await waitFor(() => expect(within(dialog).getByText("rev 7")).toBeInTheDocument());

    fireEvent.click(within(dialog).getByLabelText("Confirm Quick Validation real hardware traffic"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start validation" }));

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "changed after confirmation"
    ));
    expect(installedFetch.mock.calls.some(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/start"
    )).toBe(false);
    expect(
      within(dialog).getByLabelText("Confirm Quick Validation real hardware traffic")
    ).not.toBeChecked();

    fireEvent.click(within(dialog).getByLabelText("Confirm Quick Validation real hardware traffic"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start validation" }));

    await waitFor(() => expect(installedFetch.mock.calls.some(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/start"
    )).toBe(true));
    const startCall = installedFetch.mock.calls.find(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/start"
    );
    expect(JSON.parse(String((startCall?.[1] as RequestInit).body))).toEqual({
      expected_run_id: "11111111-1111-4111-8111-111111111111",
      expected_run_revision: 5,
      group_id: "pair-0",
      plan_revision: 8,
      duration_seconds: 10,
      confirmation: "start-quick-validation"
    });
    await waitFor(() => expect(within(dialog).getByText("Traffic running")).toBeInTheDocument());

    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "File" })).getByRole("menuitem", { name: "Disconnect" }));
    expect(screen.getByRole("dialog", { name: "Quick Validation" })).toBeInTheDocument();
    expect(installedFetch.mock.calls.some(([input]) =>
      requestPath(input) === "/api/trex/disconnect"
    )).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(screen.getByRole("dialog", { name: "Quick Validation" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(await screen.findByRole("dialog", { name: "Dashboard" })).toBeInTheDocument();
    expect(installedFetch.mock.calls.some(([input]) =>
      requestPath(input) === "/api/trex/quick-validation/cancel"
    )).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("will not cancel traffic"));
  });
});
