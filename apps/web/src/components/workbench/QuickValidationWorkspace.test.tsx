import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  QuickValidationPhase,
  QuickValidationRun,
  QuickValidationStatus,
  TrafficRuntimeSnapshot,
  TrexResult
} from "../../api";
import { QuickValidationWorkspace } from "./QuickValidationWorkspace";

const trafficRuntime: TrafficRuntimeSnapshot = {
  plan_revision: 7,
  groups: [
    {
      id: "pair-0",
      name: "P0 ↔ P1",
      ports: [0, 1],
      profile_path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
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
      profile_path: "/opt/trex-core/scripts/stl/http_simple.py",
      multiplier: "2",
      duration: -1,
      force: false,
      total: false,
      synchronized: false,
      clear_existing: true,
      tunables: {}
    }
  ],
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
    port_limit: 4,
    interfaces: ["0000:02:00.0", "0000:02:00.1", "0000:03:00.0", "0000:03:00.1"]
  },
  available_ports: [0, 1, 2, 3],
  live_state_sampled: true,
  port_states: [
    { port: 0, state: "stopped", ownership: "none" },
    { port: 1, state: "stopped", ownership: "none" },
    { port: 2, state: "stopped", ownership: "none" },
    { port: 3, state: "stopped", ownership: "none" }
  ],
  reconciliation: "live TRex port state reconciled"
};

function quickRun(phase: QuickValidationPhase): QuickValidationRun {
  const terminal = phase === "pass" || phase === "fail" || phase === "cancelled";
  return {
    id: "11111111-1111-4111-8111-111111111111",
    revision: terminal ? 6 : 3,
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
      port_limit: 4,
      interfaces: ["0000:02:00.0", "0000:02:00.1", "0000:03:00.0", "0000:03:00.1"]
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
        0: { tx_packets: 10, rx_packets: 9 },
        1: { tx_packets: 20, rx_packets: 19 }
      }
    },
    samples: [
      {
        sampled_at: "2026-07-31T10:00:05Z",
        ports: [
          {
            port: 0,
            absolute_tx_packets: 110,
            absolute_rx_packets: 108,
            tx_packets: 100,
            rx_packets: 99,
            loss_packets: 1,
            loss_ratio: 0.01
          },
          {
            port: 1,
            absolute_tx_packets: 140,
            absolute_rx_packets: 137,
            tx_packets: 120,
            rx_packets: 118,
            loss_packets: 2,
            loss_ratio: 2 / 120
          }
        ],
        total_tx_packets: 220,
        total_rx_packets: 217,
        total_loss_packets: 3,
        total_loss_ratio: 3 / 220
      }
    ],
    pending_terminal: phase === "stopping" ? "pass" : null,
    recovery_required: false,
    failure_code: phase === "fail" ? "quick_validation_packet_loss" : null,
    failure_detail: phase === "fail" ? "3 packet(s) were not received" : null,
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

function resultFor(
  phase: QuickValidationPhase,
  ok = true
): TrexResult<QuickValidationStatus> {
  const run = quickRun(phase);
  return {
    ok,
    data: {
      state_version: 1,
      state_revision: run.revision,
      active: phase === "preflight" || phase === "running" || phase === "stopping",
      recovery_required: run.recovery_required,
      run,
      reconciliation: "quick-validation state reconciled"
    },
    blocker: ok ? null : "quick_validation_packet_loss",
    error: ok ? null : "packet evidence rejected the pass verdict"
  };
}

function renderWorkspace(
  overrides: Partial<ComponentProps<typeof QuickValidationWorkspace>> = {}
) {
  const props: ComponentProps<typeof QuickValidationWorkspace> = {
    isBusy: false,
    isLoading: false,
    onCancel: vi.fn(),
    onRefresh: vi.fn(),
    onStart: vi.fn(),
    result: null,
    trafficRuntime,
    ...overrides
  };
  return { ...render(<QuickValidationWorkspace {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QuickValidationWorkspace", () => {
  it("requires explicit hardware authorization and starts a saved group with a bounded duration", async () => {
    const onStart = vi.fn();
    renderWorkspace({ onStart });

    expect(screen.getByText("rev 7")).toBeInTheDocument();
    expect(screen.getByText("P0 ↔ P1")).toBeInTheDocument();
    const startButton = screen.getByRole("button", { name: "Start validation" });
    expect(startButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Confirm Quick Validation real hardware traffic"));
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    await waitFor(() => expect(onStart).toHaveBeenCalledWith({
      groupId: "pair-0",
      durationSeconds: 10,
      planRevision: 7,
      expectedRunId: null,
      expectedRunRevision: null
    }));
    expect(screen.getByLabelText("Confirm Quick Validation real hardware traffic")).not.toBeChecked();
  });

  it("renders active canonical session and per-port packet evidence, then cancels by exact CAS", async () => {
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWorkspace({ onCancel, result: resultFor("running") });

    expect(screen.getByText("Traffic running")).toBeInTheDocument();
    expect(screen.getByTitle("22222222-2222-4222-8222-222222222222")).toHaveTextContent(
      "22222222…22222222 · rev 1"
    );
    const evidenceTable = screen.getByRole("table");
    expect(within(evidenceTable).getByText("120")).toBeInTheDocument();
    expect(within(evidenceTable).getByText("118")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: ".quick-validation-sample-summary strong" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }));

    await waitFor(() => expect(onCancel).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3
    ));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("keeps typed terminal evidence visible when the command envelope is a failure", () => {
    renderWorkspace({ result: resultFor("fail", false) });

    expect(screen.getByRole("alert")).toHaveTextContent("packet evidence rejected the pass verdict");
    expect(screen.getAllByText("quick_validation_packet_loss").length).toBeGreaterThan(0);
    expect(screen.getByText("3 packet(s) were not received")).toBeInTheDocument();
    expect(screen.getByText("Links UP at preflight").closest("span")).toHaveClass("is-proven");
    expect(screen.getByText("Ports IDLE at preflight").closest("span")).toHaveClass("is-proven");
    expect(screen.getByText("WAL cleared").closest("span")).toHaveClass("is-proven");
    expect(screen.getByText("Acquisition restored").closest("span")).toHaveClass("is-proven");
    expect(screen.getByText("Ports idle").closest("span")).toHaveClass("is-proven");
  });
});
