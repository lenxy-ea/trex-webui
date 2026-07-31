import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ProfileRecord,
  TrafficPlanGroup,
  TrafficRuntimeSnapshot,
  TrexPortRecord
} from "../../../api";
import { PortPairPlan } from "./PortPairPlan";

const udpProfile: ProfileRecord = {
  name: "udp_1pkt_simple.py",
  path: "/opt/trex-core/scripts/stl/udp_1pkt_simple.py",
  relative_path: "udp_1pkt_simple.py",
  root: "/opt/trex-core/scripts/stl",
  suffix: ".py",
  kind: "python",
  size_bytes: 1000,
  modified_time: "2026-07-30T00:00:00Z",
  previewable: true
};

const httpProfile: ProfileRecord = {
  ...udpProfile,
  name: "http_simple.yaml",
  path: "/opt/trex-core/scripts/stl/http_simple.yaml",
  relative_path: "http_simple.yaml",
  suffix: ".yaml",
  kind: "yaml"
};

const groups: TrafficPlanGroup[] = [
  {
    id: "pair-0",
    name: "P0 ↔ P1",
    ports: [0, 1],
    profile_path: udpProfile.path,
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
    profile_path: udpProfile.path,
    multiplier: "1",
    duration: -1,
    force: false,
    total: false,
    synchronized: false,
    clear_existing: true,
    tunables: {}
  },
  {
    id: "pair-2",
    name: "P4 ↔ P5",
    ports: [4, 5],
    profile_path: udpProfile.path,
    multiplier: "1",
    duration: -1,
    force: false,
    total: false,
    synchronized: false,
    clear_existing: true,
    tunables: {}
  }
];

const portRecords: TrexPortRecord[] = Array.from({ length: 6 }, (_, id) => ({
  id,
  acquired: false,
  info: {
    link: id < 2 ? "UP" : "DOWN",
    status: "IDLE"
  }
}));

function runtimeSnapshot(
  overrides: Partial<TrafficRuntimeSnapshot> = {}
): TrafficRuntimeSnapshot {
  return {
    plan_revision: 1,
    groups,
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
      port_limit: 6,
      interfaces: Array.from({ length: 6 }, (_, id) => `0000:0${id + 1}:00.0`)
    },
    available_ports: [0, 1, 2, 3, 4, 5],
    port_states: Array.from({ length: 6 }, (_, port) => ({
      port,
      state: "stopped" as const,
      ownership: "none" as const
    })),
    reconciliation: "live TRex port state reconciled",
    ...overrides,
    live_state_sampled: overrides.live_state_sampled ?? true
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  };
}

function pathFromRequest(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function renderPlan(
  overrides: Partial<React.ComponentProps<typeof PortPairPlan>> = {}
) {
  return render(
    <PortPairPlan
      activeCommand={null}
      isStarting={false}
      portRecords={portRecords}
      profileOptions={[udpProfile, httpProfile]}
      requireConfirmation
      runtimeControlDisabledReason={null}
      {...overrides}
    />
  );
}

describe("PortPairPlan", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders backend-defined port pairs with honest live link blockers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ ok: true, data: runtimeSnapshot(), blocker: null, error: null })
    ));

    renderPlan();

    const plan = screen.getByRole("region", { name: "Port pair traffic plan" });
    const pair0 = await within(plan).findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    const pair1 = within(plan).getByRole("row", { name: "P2 ↔ P3 ports P2 and P3" });
    const pair2 = within(plan).getByRole("row", { name: "P4 ↔ P5 ports P4 and P5" });

    expect(within(pair0).getByLabelText("Live links for P0 ↔ P1")).toHaveTextContent("P0UP↔P1UP");
    expect(within(pair1).getByLabelText("Live links for P2 ↔ P3")).toHaveTextContent("P2DOWN↔P3DOWN");
    expect(within(pair0).getByRole("button", { name: "Start P0 ↔ P1" })).toBeEnabled();
    expect(within(pair1).getByRole("button", { name: "Start P2 ↔ P3" })).toBeDisabled();
    expect(within(pair1).getByRole("button", { name: "Start P2 ↔ P3" })).toHaveAttribute(
      "title",
      "Traffic start requires every group link UP; P2 DOWN, P3 DOWN."
    );
    expect(within(pair2).getByRole("button", { name: "Start P4 ↔ P5" })).toBeDisabled();
    expect(within(pair0).getByText("STOPPED")).toBeInTheDocument();
    expect(within(pair0).getByText("UNOWNED")).toBeInTheDocument();
  });

  it("saves edited assignments with their baseline revision before enabling Start", async () => {
    let savedSnapshot = runtimeSnapshot();
    const onDirtyChange = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromRequest(input);
      if (path === "/api/trex/traffic/plan") {
        const body = JSON.parse(String(init?.body)) as {
          plan_revision: number;
          groups: TrafficPlanGroup[];
        };
        savedSnapshot = runtimeSnapshot({
          plan_revision: 2,
          groups: body.groups,
          reconciliation: "plan updated"
        });
        return jsonResponse({ ok: true, data: savedSnapshot, blocker: null, error: null });
      }
      return jsonResponse({ ok: true, data: savedSnapshot, blocker: null, error: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPlan({ onDirtyChange });
    const pair0 = await screen.findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    const startButton = within(pair0).getByRole("button", { name: "Start P0 ↔ P1" });
    const saveButton = screen.getByRole("button", { name: "Save traffic plan" });

    fireEvent.change(within(pair0).getByLabelText("Profile for P0 ↔ P1"), {
      target: { value: httpProfile.path }
    });
    fireEvent.change(within(pair0).getByLabelText("Multiplier or rate for P0 ↔ P1"), {
      target: { value: "10Kpps" }
    });
    fireEvent.change(within(pair0).getByLabelText("Duration for P0 ↔ P1"), {
      target: { value: "12.5" }
    });

    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAttribute("title", "Save traffic plan assignments before starting a group.");
    expect(saveButton).toBeEnabled();
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(saveButton);

    expect(await screen.findByRole("status")).toHaveTextContent("Traffic plan saved at revision 2.");
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    const putCall = fetchMock.mock.calls.find(([input]) => pathFromRequest(input) === "/api/trex/traffic/plan");
    expect(putCall).toBeDefined();
    expect(putCall?.[1]).toMatchObject({ method: "PUT" });
    const putBody = JSON.parse(String(putCall?.[1]?.body)) as {
      plan_revision: number;
      groups: TrafficPlanGroup[];
    };
    expect(putBody.plan_revision).toBe(1);
    expect(putBody.groups[0]).toMatchObject({
      id: "pair-0",
      profile_path: httpProfile.path,
      multiplier: "10kpps",
      duration: 12.5
    });
    await waitFor(() => expect(startButton).toBeEnabled());
  });

  it("confirms a saved group start, posts the group revision, and refreshes managed runtime", async () => {
    let started = false;
    const managedRuntime = runtimeSnapshot({
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
        reconciliation: "managed",
        completed_groups: [],
        mutation_evidence: [],
        groups: [
          {
            group_id: "pair-0",
            run_id: null,
            source: null,
            plan_revision: null,
            ports: [0, 1],
            profile_path: udpProfile.path,
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
        { port: 1, state: "running", ownership: "managed" },
        ...Array.from({ length: 4 }, (_, index) => ({
          port: index + 2,
          state: "stopped" as const,
          ownership: "none" as const
        }))
      ]
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathFromRequest(input);
      if (path === "/api/trex/traffic/group/pair-0/start") {
        started = true;
        return jsonResponse({
          ok: true,
          data: {
            accepted: true,
            profile_path: udpProfile.path,
            ports: [0, 1],
            multiplier: "1",
            duration: -1,
            force: false,
            total: false,
            synchronized: false,
            clear_existing: true,
            tunables: {},
            stream_ids: [1],
            start_result: null,
            state_persisted: true,
            session: managedRuntime.session
          },
          blocker: null,
          error: null
        });
      }
      return jsonResponse({
        ok: true,
        data: started ? managedRuntime : runtimeSnapshot(),
        blocker: null,
        error: null
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPlan();
    const pair0 = await screen.findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    fireEvent.click(within(pair0).getByRole("button", { name: "Start P0 ↔ P1" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Current links: P0 UP, P1 UP."));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "P0 ↔ P1 start accepted; authoritative runtime refreshed."
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/group/pair-0/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          plan_revision: 1,
          confirmation: "start-traffic",
          expected_session_id: null
        })
      })
    );
    await waitFor(() => {
      expect(within(pair0).getByText("RUNNING")).toBeInTheDocument();
      expect(within(pair0).getByText("MANAGED")).toBeInTheDocument();
    });
    expect(within(pair0).getByRole("button", { name: "Start P0 ↔ P1" })).toBeDisabled();
  });

  it("preserves dirty edits when optimistic revision control reports a conflict", async () => {
    let conflictSeen = false;
    const serverRevision = runtimeSnapshot({
      plan_revision: 2,
      groups: groups.map((group) =>
        group.id === "pair-0" ? { ...group, multiplier: "2" } : group
      )
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathFromRequest(input);
      if (path === "/api/trex/traffic/plan") {
        conflictSeen = true;
        return jsonResponse({
          ok: false,
          data: null,
          blocker: "traffic_plan_revision_conflict",
          error: "traffic plan revision is 2, not 1"
        });
      }
      return jsonResponse({
        ok: true,
        data: conflictSeen ? serverRevision : runtimeSnapshot(),
        blocker: null,
        error: null
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPlan();
    const pair0 = await screen.findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    const rateInput = within(pair0).getByLabelText("Multiplier or rate for P0 ↔ P1");
    fireEvent.change(rateInput, { target: { value: "40%" } });
    fireEvent.click(screen.getByRole("button", { name: "Save traffic plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "traffic_plan_revision_conflict: traffic plan revision is 2, not 1"
    );
    expect(rateInput).toHaveValue("40%");
    expect(screen.getByText("server revision changed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save traffic plan" })).toBeDisabled();
  });

  it("fail-closes Start when the authoritative runtime refresh is unavailable", async () => {
    let refreshCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      refreshCount += 1;
      if (refreshCount === 1) {
        return jsonResponse({
          ok: true,
          data: runtimeSnapshot(),
          blocker: null,
          error: null
        });
      }
      return jsonResponse({
        ok: false,
        data: null,
        blocker: "traffic_runtime_state_invalid",
        error: "runtime state cannot be read"
      });
    }));

    renderPlan();
    const pair0 = await screen.findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    const startButton = within(pair0).getByRole("button", { name: "Start P0 ↔ P1" });
    expect(startButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh traffic runtime" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "traffic_runtime_state_invalid: runtime state cannot be read"
    );
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAttribute(
      "title",
      "Traffic runtime refresh is blocked: traffic_runtime_state_invalid: runtime state cannot be read"
    );
  });

  it("omits the confirmation token when the environment disables confirmation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathFromRequest(input);
      if (path === "/api/trex/traffic/group/pair-0/start") {
        return jsonResponse({
          ok: true,
          data: { accepted: true },
          blocker: null,
          error: null
        });
      }
      return jsonResponse({
        ok: true,
        data: runtimeSnapshot(),
        blocker: null,
        error: null
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPlan({ requireConfirmation: false });
    const pair0 = await screen.findByRole("row", { name: "P0 ↔ P1 ports P0 and P1" });
    fireEvent.click(within(pair0).getByRole("button", { name: "Start P0 ↔ P1" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/trex/traffic/group/pair-0/start",
      expect.objectContaining({
        body: JSON.stringify({
          plan_revision: 1,
          confirmation: null,
          expected_session_id: null
        })
      })
    ));
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
