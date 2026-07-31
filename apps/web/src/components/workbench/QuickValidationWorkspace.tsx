import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock3,
  Network,
  Play,
  RefreshCw,
  ShieldCheck,
  Square
} from "lucide-react";
import { useState } from "react";

import type {
  QuickValidationPhase,
  QuickValidationRun,
  QuickValidationStatus,
  TrafficPlanGroup,
  TrafficRuntimeSnapshot,
  TrexResult
} from "../../api";

type QuickValidationWorkspaceProps = {
  isBusy: boolean;
  isLoading: boolean;
  onCancel: (runId: string, runRevision: number) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  onStart: (confirmation: QuickValidationStartConfirmation) => Promise<void> | void;
  result: TrexResult<QuickValidationStatus> | null;
  trafficRuntime: TrafficRuntimeSnapshot | null;
};

export type QuickValidationStartConfirmation = {
  groupId: string;
  durationSeconds: number;
  planRevision: number;
  expectedRunId: string | null;
  expectedRunRevision: number | null;
};

type TimelineState = "complete" | "current" | "pending" | "failed" | "cancelled";

const TERMINAL_PHASES = new Set<QuickValidationPhase>(["pass", "fail", "cancelled"]);
const EMPTY_TRAFFIC_GROUPS: TrafficPlanGroup[] = [];

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

function formatPackets(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? integerFormatter.format(value)
    : "–";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(value === 0 ? 2 : 4)}%`
    : "–";
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "–";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function shortIdentity(value: string | null | undefined) {
  if (!value) {
    return "–";
  }
  return value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

function profileName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function portsLabel(ports: number[]) {
  return ports.length > 0 ? ports.map((port) => `P${port}`).join(" · ") : "No ports";
}

function phaseLabel(phase: QuickValidationPhase | null) {
  switch (phase) {
    case "preflight":
      return "Preflight";
    case "running":
      return "Traffic running";
    case "stopping":
      return "Cleanup";
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "cancelled":
      return "Cancelled";
    default:
      return "Ready";
  }
}

function phaseTone(phase: QuickValidationPhase | null) {
  if (phase === "pass") {
    return "pass";
  }
  if (phase === "fail") {
    return "fail";
  }
  if (phase === "cancelled") {
    return "cancelled";
  }
  if (phase === "running" || phase === "preflight" || phase === "stopping") {
    return "active";
  }
  return "ready";
}

function timelineState(
  run: QuickValidationRun | null,
  step: "preflight" | "traffic" | "cleanup" | "result"
): TimelineState {
  if (!run) {
    return step === "preflight" ? "current" : "pending";
  }
  if (step === "preflight") {
    return run.phase === "preflight" ? "current" : "complete";
  }
  if (step === "traffic") {
    if (run.phase === "preflight") {
      return "pending";
    }
    if (run.phase === "running") {
      return "current";
    }
    if (run.traffic_session_id === null && run.phase === "fail") {
      return "failed";
    }
    return "complete";
  }
  if (step === "cleanup") {
    if (run.phase === "stopping") {
      return "current";
    }
    if (TERMINAL_PHASES.has(run.phase)) {
      return run.cleanup && run.idle_verified ? "complete" : "failed";
    }
    return "pending";
  }
  if (!TERMINAL_PHASES.has(run.phase)) {
    return "pending";
  }
  if (run.phase === "pass") {
    return "complete";
  }
  return run.phase === "cancelled" ? "cancelled" : "failed";
}

function TimelineIcon({ state }: { state: TimelineState }) {
  if (state === "complete") {
    return <CheckCircle2 aria-hidden="true" size={17} />;
  }
  if (state === "failed") {
    return <AlertTriangle aria-hidden="true" size={17} />;
  }
  if (state === "cancelled") {
    return <Ban aria-hidden="true" size={17} />;
  }
  if (state === "current") {
    return <Activity aria-hidden="true" size={17} />;
  }
  return <Circle aria-hidden="true" size={15} />;
}

function selectedGroupFor(
  groups: TrafficPlanGroup[],
  selectedGroupId: string,
  run: QuickValidationRun | null
) {
  return groups.find((group) => group.id === selectedGroupId)
    ?? groups.find((group) => group.id === run?.group.group_id)
    ?? groups[0]
    ?? null;
}

export function QuickValidationWorkspace({
  isBusy,
  isLoading,
  onCancel,
  onRefresh,
  onStart,
  result,
  trafficRuntime
}: QuickValidationWorkspaceProps) {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [durationText, setDurationText] = useState("10");
  const [hardwareConfirmationKey, setHardwareConfirmationKey] = useState<string | null>(null);
  const status = result?.data ?? null;
  const run = status?.run ?? null;
  const phase = run?.phase ?? null;
  const active = Boolean(
    status?.active
    || status?.recovery_required
    || phase === "preflight"
    || phase === "running"
    || phase === "stopping"
  );
  const groups = trafficRuntime?.groups ?? EMPTY_TRAFFIC_GROUPS;
  const selectedGroup = selectedGroupFor(groups, selectedGroupId, run);
  const durationSeconds = Number(durationText);
  const durationValid = Number.isInteger(durationSeconds)
    && durationSeconds >= 1
    && durationSeconds <= 60;
  const latestSample = run && run.samples.length > 0
    ? run.samples[run.samples.length - 1]
    : null;
  const linksVerified = Boolean(
    run && run.group.ports.every((port) => run.preflight.link_states[port] === "up")
  );
  const preflightIdleVerified = Boolean(
    run && run.group.ports.every((port) => run.preflight.port_statuses[port] === "idle")
  );
  const currentRunCas = run ? `${run.id}:${run.revision}` : "no-run";
  const confirmationKey = selectedGroup && trafficRuntime
    ? `${selectedGroup.id}:${durationText}:${trafficRuntime.plan_revision}:${currentRunCas}`
    : null;
  const hardwareConfirmed = !active
    && confirmationKey !== null
    && hardwareConfirmationKey === confirmationKey;
  const canStart = !active
    && !isBusy
    && !isLoading
    && selectedGroup !== null
    && trafficRuntime !== null
    && durationValid
    && hardwareConfirmed;

  const handleStart = async () => {
    if (!canStart || selectedGroup === null || trafficRuntime === null) {
      return;
    }
    setHardwareConfirmationKey(null);
    await onStart({
      groupId: selectedGroup.id,
      durationSeconds,
      planRevision: trafficRuntime.plan_revision,
      expectedRunId: run?.id ?? null,
      expectedRunRevision: run?.revision ?? null
    });
  };

  const handleCancel = async () => {
    if (!run || !active || isBusy) {
      return;
    }
    const confirmed = window.confirm(
      `Cancel Quick Validation ${shortIdentity(run.id)} on ${portsLabel(run.group.ports)}? `
      + "The backend will stop the exact managed traffic session and verify cleanup."
    );
    if (!confirmed) {
      return;
    }
    await onCancel(run.id, run.revision);
  };

  const timeline = [
    {
      key: "preflight" as const,
      eyebrow: "01",
      label: "Preflight",
      detail: run
        ? `${portsLabel(run.group.ports)} links UP · status IDLE · ownership clear`
        : "Verify saved plan, links UP, IDLE status, ownership and counters"
    },
    {
      key: "traffic" as const,
      eyebrow: "02",
      label: "Traffic window",
      detail: run
        ? `${run.duration_seconds}s · ${run.group.multiplier} · ${profileName(run.group.profile_path)}`
        : "Run the selected profile for 1–60 seconds"
    },
    {
      key: "cleanup" as const,
      eyebrow: "03",
      label: "Exact cleanup",
      detail: run?.cleanup
        ? `${run.cleanup.mode.replace(/_/g, " ")} · idle ${run.idle_verified ? "verified" : "pending"}`
        : "Stop the canonical session and restore acquisition"
    },
    {
      key: "result" as const,
      eyebrow: "04",
      label: "Evidence verdict",
      detail: run && TERMINAL_PHASES.has(run.phase)
        ? phaseLabel(run.phase)
        : "Require packet growth, zero loss and verified idle"
    }
  ];

  return (
    <section className="quick-validation-workspace" aria-label="Quick Validation workspace">
      <header className="quick-validation-command-bar">
        <div className="quick-validation-kicker">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>
            <strong>Guided hardware check</strong>
            <small>Saved plan authority · real ports · bounded traffic</small>
          </span>
        </div>

        <label className="quick-validation-field quick-validation-field--group">
          <span>Saved port group</span>
          <select
            aria-label="Quick Validation saved port group"
            disabled={active || isBusy || groups.length === 0}
            onChange={(event) => {
              setSelectedGroupId(event.target.value);
              setHardwareConfirmationKey(null);
            }}
            value={selectedGroup?.id ?? ""}
          >
            {groups.length === 0 ? <option value="">No saved groups</option> : null}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {portsLabel(group.ports)}
              </option>
            ))}
          </select>
        </label>

        <label className="quick-validation-field quick-validation-field--duration">
          <span>Duration</span>
          <span className="quick-validation-duration-input">
            <input
              aria-invalid={!durationValid}
              aria-label="Quick Validation duration seconds"
              disabled={active || isBusy}
              inputMode="numeric"
              max={60}
              min={1}
              onChange={(event) => {
                setDurationText(event.target.value);
                setHardwareConfirmationKey(null);
              }}
              step={1}
              type="number"
              value={durationText}
            />
            <span>s</span>
          </span>
        </label>

        <div className="quick-validation-command-actions">
          <button
            className="normal-button"
            disabled={isBusy || isLoading}
            onClick={() => void onRefresh()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={isLoading ? "is-spinning" : ""} size={15} />
            Refresh
          </button>
          {active ? (
            <button
              className="normal-button danger-command"
              disabled={isBusy || !run}
              onClick={() => void handleCancel()}
              type="button"
            >
              <Square aria-hidden="true" size={14} />
              Cancel run
            </button>
          ) : (
            <button
              className="normal-button quick-validation-start-button"
              disabled={!canStart}
              onClick={() => void handleStart()}
              type="button"
            >
              <Play aria-hidden="true" size={15} />
              Start validation
            </button>
          )}
        </div>
      </header>

      <div className={["quick-validation-safety", active ? "quick-validation-safety--active" : ""].filter(Boolean).join(" ")}>
        <AlertTriangle aria-hidden="true" size={18} />
        {active ? (
          <div>
            <strong>Real traffic is under backend supervision</strong>
            <span>Closing this window will not cancel the run. Use Cancel run to request exact-session cleanup.</span>
          </div>
        ) : (
          <label>
            <input
              aria-label="Confirm Quick Validation real hardware traffic"
              checked={hardwareConfirmed}
              disabled={isBusy || isLoading || selectedGroup === null}
              onChange={(event) => setHardwareConfirmationKey(
                event.target.checked ? confirmationKey : null
              )}
              type="checkbox"
            />
            <span>
              <strong>Authorize real hardware traffic</strong>
              <small>
                I understand this will acquire {portsLabel(selectedGroup?.ports ?? [])}, load the saved profile,
                transmit packets, then stop and verify cleanup.
              </small>
            </span>
          </label>
        )}
      </div>

      {result && !result.ok ? (
        <div className="quick-validation-alert" role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>{result.blocker ?? "Quick Validation request failed"}</strong>
            <span>{result.error ?? "The backend did not accept the requested operation."}</span>
            {result.data ? <small>The backend returned authoritative run evidence below.</small> : null}
          </div>
        </div>
      ) : null}

      {run?.recovery_required ? (
        <div className="quick-validation-alert quick-validation-alert--recovery" role="alert">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>Recovery required — pass is blocked</strong>
            <span>{run.failure_detail ?? status?.reconciliation ?? "Waiting for exact-session cleanup evidence."}</span>
          </div>
        </div>
      ) : null}

      <div className="quick-validation-status-strip">
        <div className={`quick-validation-status-cell quick-validation-status-cell--${phaseTone(phase)}`}>
          <span>State</span>
          <strong><i aria-hidden="true" />{phaseLabel(phase)}</strong>
        </div>
        <div>
          <span>Plan authority</span>
          <strong>rev {run?.group.plan_revision ?? trafficRuntime?.plan_revision ?? "–"}</strong>
        </div>
        <div>
          <span>Port group</span>
          <strong>{run?.group.name ?? selectedGroup?.name ?? "–"}</strong>
        </div>
        <div>
          <span>Ports</span>
          <strong>{portsLabel(run?.group.ports ?? selectedGroup?.ports ?? [])}</strong>
        </div>
        <div>
          <span>Window</span>
          <strong>{run ? `${run.duration_seconds}s` : durationValid ? `${durationSeconds}s` : "Invalid"}</strong>
        </div>
        <div>
          <span>Evidence</span>
          <strong>{run ? `${run.samples.length} sample${run.samples.length === 1 ? "" : "s"}` : "Not started"}</strong>
        </div>
      </div>

      <ol className="quick-validation-timeline" aria-label="Quick Validation lifecycle">
        {timeline.map((item) => {
          const state = timelineState(run, item.key);
          return (
            <li className={`quick-validation-timeline-step quick-validation-timeline-step--${state}`} key={item.key}>
              <span className="quick-validation-timeline-index">{item.eyebrow}</span>
              <span className="quick-validation-timeline-icon"><TimelineIcon state={state} /></span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="quick-validation-evidence-grid">
        <section className="quick-validation-panel quick-validation-packet-panel">
          <header className="quick-validation-panel-heading">
            <span>
              <Activity aria-hidden="true" size={16} />
              <strong>Per-port packet evidence</strong>
            </span>
            <small>{latestSample ? `Sampled ${formatTimestamp(latestSample.sampled_at)}` : "Awaiting a backend sample"}</small>
          </header>
          <div className="quick-validation-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Baseline TX</th>
                  <th>Baseline RX</th>
                  <th>Run TX</th>
                  <th>Run RX</th>
                  <th>Loss</th>
                  <th>Loss rate</th>
                </tr>
              </thead>
              <tbody>
                {(run?.group.ports ?? selectedGroup?.ports ?? []).map((port) => {
                  const baseline = run?.preflight.baseline_counters[port];
                  const sample = latestSample?.ports.find((candidate) => candidate.port === port);
                  return (
                    <tr key={port}>
                      <th scope="row"><span className="quick-validation-port-chip">P{port}</span></th>
                      <td>{formatPackets(baseline?.tx_packets)}</td>
                      <td>{formatPackets(baseline?.rx_packets)}</td>
                      <td>{formatPackets(sample?.tx_packets)}</td>
                      <td>{formatPackets(sample?.rx_packets)}</td>
                      <td className={sample && sample.loss_packets > 0 ? "quick-validation-loss" : ""}>
                        {formatPackets(sample?.loss_packets)}
                      </td>
                      <td className={sample && sample.loss_ratio > 0 ? "quick-validation-loss" : ""}>
                        {formatPercent(sample?.loss_ratio)}
                      </td>
                    </tr>
                  );
                })}
                {(run?.group.ports ?? selectedGroup?.ports ?? []).length === 0 ? (
                  <tr>
                    <td className="quick-validation-empty-cell" colSpan={7}>
                      Save a port-pair group in Traffic Profiles before running validation.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {latestSample ? (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td colSpan={2}>Latest run delta</td>
                    <td>{formatPackets(latestSample.total_tx_packets)}</td>
                    <td>{formatPackets(latestSample.total_rx_packets)}</td>
                    <td className={latestSample.total_loss_packets > 0 ? "quick-validation-loss" : ""}>
                      {formatPackets(latestSample.total_loss_packets)}
                    </td>
                    <td className={latestSample.total_loss_ratio > 0 ? "quick-validation-loss" : ""}>
                      {formatPercent(latestSample.total_loss_ratio)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="quick-validation-sample-summary">
            <div>
              <span>TX total</span>
              <strong>{formatPackets(latestSample?.total_tx_packets)}</strong>
              <small>packets in validation window</small>
            </div>
            <div>
              <span>RX total</span>
              <strong>{formatPackets(latestSample?.total_rx_packets)}</strong>
              <small>packets in validation window</small>
            </div>
            <div className={latestSample && latestSample.total_loss_packets > 0 ? "quick-validation-metric--loss" : ""}>
              <span>Packet delta</span>
              <strong>{formatPackets(latestSample?.total_loss_packets)}</strong>
              <small>{formatPercent(latestSample?.total_loss_ratio)} loss</small>
            </div>
          </div>

          {run?.failure_code ? (
            <div className="quick-validation-failure-detail">
              <strong>{run.failure_code}</strong>
              <span>{run.failure_detail ?? "The validation authority rejected the pass outcome."}</span>
            </div>
          ) : null}
        </section>

        <aside className="quick-validation-proof-column">
          <section className="quick-validation-panel">
            <header className="quick-validation-panel-heading">
              <span><Network aria-hidden="true" size={16} /><strong>Canonical run authority</strong></span>
              <small>{run ? `run rev ${run.revision}` : "No current run"}</small>
            </header>
            <dl className="quick-validation-proof-list">
              <div><dt>Quick run</dt><dd title={run?.id ?? undefined}>{shortIdentity(run?.id)}</dd></div>
              <div><dt>Traffic session</dt><dd title={run?.traffic_session_id ?? undefined}>{shortIdentity(run?.traffic_session_id)}{run?.traffic_session_revision ? ` · rev ${run.traffic_session_revision}` : ""}</dd></div>
              <div><dt>Traffic run</dt><dd title={run?.traffic_run_id ?? undefined}>{shortIdentity(run?.traffic_run_id)}</dd></div>
              <div><dt>Profile</dt><dd title={run?.group.profile_path ?? selectedGroup?.profile_path}>{profileName(run?.group.profile_path ?? selectedGroup?.profile_path ?? "–")}</dd></div>
              <div><dt>Profile SHA-256</dt><dd title={run?.group.profile_sha256 ?? undefined}>{shortIdentity(run?.group.profile_sha256)}</dd></div>
              <div><dt>Config</dt><dd title={run?.config.path ?? trafficRuntime?.config.path}>{run?.config.path ?? trafficRuntime?.config.path ?? "–"}</dd></div>
              <div><dt>Reconciliation</dt><dd>{status?.reconciliation ?? trafficRuntime?.reconciliation ?? "Not sampled"}</dd></div>
            </dl>
          </section>

          <section className="quick-validation-panel">
            <header className="quick-validation-panel-heading">
              <span><Clock3 aria-hidden="true" size={16} /><strong>Safety envelope</strong></span>
              <small>{run?.idle_verified ? "Idle verified" : active ? "Supervisor active" : "Ready"}</small>
            </header>
            <dl className="quick-validation-proof-list">
              <div><dt>Created</dt><dd>{formatTimestamp(run?.created_at)}</dd></div>
              <div><dt>Started</dt><dd>{formatTimestamp(run?.started_at)}</dd></div>
              <div><dt>Normal deadline</dt><dd>{formatTimestamp(run?.deadline_at)}</dd></div>
              <div><dt>Hard-stop lease</dt><dd>{formatTimestamp(run?.watchdog_at)}</dd></div>
              <div><dt>Ended</dt><dd>{formatTimestamp(run?.ended_at)}</dd></div>
            </dl>
          </section>

          <section className="quick-validation-panel">
            <header className="quick-validation-panel-heading">
              <span><ShieldCheck aria-hidden="true" size={16} /><strong>Cleanup proof</strong></span>
              <small>{run?.cleanup ? run.cleanup.mode.replace(/_/g, " ") : "Pending"}</small>
            </header>
            <div className="quick-validation-cleanup-grid">
              <span className={linksVerified ? "is-proven" : ""}>
                {linksVerified ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={14} />}
                Links UP at preflight
              </span>
              <span className={preflightIdleVerified ? "is-proven" : ""}>
                {preflightIdleVerified ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={14} />}
                Ports IDLE at preflight
              </span>
              <span className={run?.cleanup?.wal_cleared ? "is-proven" : ""}>
                {run?.cleanup?.wal_cleared ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={14} />}
                WAL cleared
              </span>
              <span className={run?.cleanup?.acquisition_restored ? "is-proven" : ""}>
                {run?.cleanup?.acquisition_restored ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={14} />}
                Acquisition restored
              </span>
              <span className={run?.idle_verified ? "is-proven" : ""}>
                {run?.idle_verified ? <CheckCircle2 aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={14} />}
                Ports idle
              </span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
