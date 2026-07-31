import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RefreshCw, RotateCcw, Save } from "lucide-react";

import {
  fetchTrafficRuntime,
  replaceTrafficPlan,
  startTrafficGroup,
  type ProfileRecord,
  type TrafficPlanGroup,
  type TrafficRuntimeSnapshot,
  type TrafficStartResult,
  type TrexPortRecord,
  type TrexResult
} from "../../../api";
import {
  normalizeTrafficPlanMultiplier,
  portLinkState,
  trafficGroupLinkBlocker,
  trafficGroupRuntimeView,
  trafficPlanGroupError,
  type PortLinkState
} from "./portPairPlanModel";

type PortPairPlanProps = {
  activeCommand: string | null;
  isStarting: boolean;
  portRecords: TrexPortRecord[];
  profileOptions: ProfileRecord[];
  requireConfirmation: boolean;
  runtimeControlDisabledReason: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onRuntimeChange?: (snapshot: TrafficRuntimeSnapshot) => void;
  onStartResult?: (result: TrexResult<TrafficStartResult>) => void;
};

type OperationStatus = {
  text: string;
  tone: "error" | "success" | "warning";
};

type RuntimeLoadOptions = {
  resetDraft?: boolean;
};

function errorMessage(blocker: string | null | undefined, error: string | null | undefined) {
  if (blocker && error) {
    return `${blocker}: ${error}`;
  }
  return error ?? blocker ?? "The backend did not return a traffic runtime snapshot.";
}

function configFileName(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function linkLabel(state: PortLinkState) {
  return state.toUpperCase();
}

function durationValue(duration: number) {
  return Number.isFinite(duration) ? String(duration) : "";
}

function profileLabel(profile: ProfileRecord) {
  return profile.relative_path || profile.name;
}

function groupPortsLabel(ports: number[]) {
  return ports.map((port) => `P${port}`).join(" ↔ ");
}

function runtimeStartBlocker(
  runtime: TrafficRuntimeSnapshot,
  group: TrafficPlanGroup
) {
  const runtimeView = trafficGroupRuntimeView(runtime, group);
  if (runtimeView.state !== "stopped") {
    return `Traffic start requires group runtime STOPPED; ${group.name} is ${runtimeView.state.toUpperCase()} with ${runtimeView.ownership.toUpperCase()} ownership.`;
  }
  if (runtimeView.ownership === "external") {
    return `Traffic start is blocked because ${group.name} is controlled by external traffic.`;
  }
  return null;
}

function groupConfirmation(
  group: TrafficPlanGroup,
  portRecords: TrexPortRecord[]
) {
  const links = group.ports
    .map((port) => `P${port} ${linkLabel(portLinkState(portRecords, port))}`)
    .join(", ");
  const duration = group.duration === -1 ? "continuous duration" : `${group.duration}s duration`;
  return `Start ${group.name} on ${groupPortsLabel(group.ports)} with ${group.profile_path} at ${group.multiplier} for ${duration}? Current links: ${links}.`;
}

export function PortPairPlan({
  activeCommand,
  isStarting,
  portRecords,
  profileOptions,
  requireConfirmation,
  runtimeControlDisabledReason,
  onDirtyChange,
  onRuntimeChange,
  onStartResult
}: PortPairPlanProps) {
  const [runtime, setRuntime] = useState<TrafficRuntimeSnapshot | null>(null);
  const [draftGroups, setDraftGroups] = useState<TrafficPlanGroup[]>([]);
  const [draftBaseRevision, setDraftBaseRevision] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<OperationStatus | null>(null);
  const dirtyRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const setDraftDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const adoptSnapshot = useCallback((
    snapshot: TrafficRuntimeSnapshot,
    resetDraft: boolean
  ) => {
    setRuntime(snapshot);
    onRuntimeChange?.(snapshot);
    if (resetDraft || !dirtyRef.current) {
      setDraftGroups(snapshot.groups);
      setDraftBaseRevision(snapshot.plan_revision);
      setDraftDirty(false);
    }
  }, [onRuntimeChange, setDraftDirty]);

  const loadRuntime = useCallback(async ({
    resetDraft = false
  }: RuntimeLoadOptions = {}) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setIsLoading(true);
    try {
      const result = await fetchTrafficRuntime();
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) {
        return null;
      }
      if (!result.ok || !result.data) {
        setLoadError(errorMessage(result.blocker, result.error));
        return null;
      }
      setLoadError(null);
      adoptSnapshot(result.data, resetDraft);
      return result.data;
    } catch (caught) {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setLoadError(caught instanceof Error ? caught.message : "Unable to load traffic runtime");
      }
      return null;
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [adoptSnapshot]);

  const globalRuntimeBusy = activeCommand !== null || isStarting;
  const previousGlobalRuntimeBusyRef = useRef<boolean | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      previousGlobalRuntimeBusyRef.current = null;
    };
  }, []);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const previousBusy = previousGlobalRuntimeBusyRef.current;
    previousGlobalRuntimeBusyRef.current = globalRuntimeBusy;
    if (!globalRuntimeBusy && (previousBusy === null || previousBusy)) {
      void loadRuntime();
    }
  }, [globalRuntimeBusy, loadRuntime]);

  const profileByPath = useMemo(
    () => new Map(profileOptions.map((profile) => [profile.path, profile])),
    [profileOptions]
  );
  const validationError = useMemo(
    () => draftGroups.map(trafficPlanGroupError).find((error) => error !== null) ?? null,
    [draftGroups]
  );
  const revisionIsStale = runtime !== null
    && draftBaseRevision !== null
    && runtime.plan_revision !== draftBaseRevision;
  const controlsBusy = busyAction !== null || globalRuntimeBusy || isLoading;

  const patchGroup = useCallback((
    groupId: string,
    patch: Partial<Pick<TrafficPlanGroup, "duration" | "multiplier" | "profile_path">>
  ) => {
    setDraftGroups((current) =>
      current.map((group) => group.id === groupId ? { ...group, ...patch } : group)
    );
    setDraftDirty(true);
    setOperationStatus(null);
  }, [setDraftDirty]);

  const discardDraft = async () => {
    if (
      isDirty
      && !window.confirm("Discard unsaved traffic plan assignments and reload the backend plan?")
    ) {
      return;
    }
    setBusyAction("reload");
    setOperationStatus(null);
    const snapshot = await loadRuntime({ resetDraft: true });
    if (snapshot) {
      setOperationStatus({
        text: `Traffic plan reloaded at revision ${snapshot.plan_revision}.`,
        tone: "success"
      });
    }
    setBusyAction(null);
  };

  const savePlan = async () => {
    if (
      runtime === null
      || draftBaseRevision === null
      || loadError !== null
      || validationError
      || revisionIsStale
      || !isDirty
    ) {
      return;
    }
    setBusyAction("save");
    setOperationStatus(null);
    try {
      const result = await replaceTrafficPlan({
        plan_revision: draftBaseRevision,
        groups: draftGroups.map((group) => ({
          ...group,
          multiplier: normalizeTrafficPlanMultiplier(group.multiplier).value ?? group.multiplier
        }))
      });
      if (!result.ok || !result.data) {
        setOperationStatus({
          text: errorMessage(result.blocker, result.error),
          tone: "error"
        });
        if (result.blocker === "traffic_plan_revision_conflict") {
          await loadRuntime();
        }
        return;
      }
      adoptSnapshot(result.data, true);
      const refreshed = await loadRuntime({ resetDraft: true });
      setOperationStatus({
        text: refreshed
          ? `Traffic plan saved at revision ${refreshed.plan_revision}.`
          : `Traffic plan saved at revision ${result.data.plan_revision}; live runtime refresh failed.`,
        tone: refreshed ? "success" : "warning"
      });
    } catch (caught) {
      setOperationStatus({
        text: caught instanceof Error ? caught.message : "Unable to save traffic plan",
        tone: "error"
      });
    } finally {
      setBusyAction(null);
    }
  };

  const startGroup = async (group: TrafficPlanGroup) => {
    const linkBlocker = trafficGroupLinkBlocker(portRecords, group.ports);
    const groupRuntimeBlocker = runtime ? runtimeStartBlocker(runtime, group) : null;
    if (
      runtime === null
      || draftBaseRevision === null
      || isDirty
      || revisionIsStale
      || controlsBusy
      || loadError !== null
      || validationError
      || linkBlocker !== null
      || groupRuntimeBlocker !== null
      || runtimeControlDisabledReason !== null
    ) {
      return;
    }
    if (requireConfirmation && !window.confirm(groupConfirmation(group, portRecords))) {
      return;
    }

    setBusyAction(`start:${group.id}`);
    setOperationStatus(null);
    try {
      const result = await startTrafficGroup(group.id, {
        plan_revision: draftBaseRevision,
        confirmation: requireConfirmation ? "start-traffic" : null,
        expected_session_id: runtime.session !== null
          && (
            runtime.session.state === "running"
            || runtime.session.state === "paused"
            || runtime.session.state === "mixed"
            || runtime.session.state === "unknown"
          )
          ? runtime.session.id
          : null
      });
      onStartResult?.(result);
      if (!result.ok) {
        setOperationStatus({
          text: errorMessage(result.blocker, result.error),
          tone: "error"
        });
        if (result.blocker === "traffic_plan_revision_conflict") {
          await loadRuntime();
        }
        return;
      }
      const refreshed = await loadRuntime();
      setOperationStatus({
        text: refreshed
          ? `${group.name} start accepted; authoritative runtime refreshed.`
          : `${group.name} start accepted, but the authoritative runtime refresh failed.`,
        tone: refreshed ? "success" : "warning"
      });
    } catch (caught) {
      setOperationStatus({
        text: caught instanceof Error ? caught.message : `Unable to start ${group.name}`,
        tone: "error"
      });
    } finally {
      setBusyAction(null);
    }
  };

  const saveDisabledReason = loadError
    ? `Traffic runtime refresh is blocked: ${loadError}`
    : validationError
    ?? (revisionIsStale ? "The backend plan revision changed; reload before saving." : null)
    ?? (!isDirty ? "No assignment changes to save." : null)
    ?? (runtime === null ? "Traffic runtime is unavailable." : null);

  return (
    <section
      aria-busy={controlsBusy}
      aria-label="Port pair traffic plan"
      className="port-pair-plan"
    >
      <header className="port-pair-plan__header">
        <div className="port-pair-plan__identity">
          <span className="port-pair-plan__eyebrow">TRAFFIC MAP / BACKEND AUTHORITY</span>
          <h3>Port Pair Plan</h3>
          {runtime ? (
            <span
              className="port-pair-plan__config"
              title={`${runtime.config.path} · ${runtime.reconciliation}`}
            >
              {configFileName(runtime.config.path)}
              {" · "}
              {runtime.config.port_limit} ports
              {" · "}
              revision {runtime.plan_revision}
            </span>
          ) : (
            <span className="port-pair-plan__config">Awaiting runtime inventory</span>
          )}
        </div>
        <div
          aria-label="Traffic plan edit state"
          aria-live="polite"
          className="port-pair-plan__revision"
        >
          <span className={isDirty ? "port-pair-plan__dirty port-pair-plan__dirty--active" : "port-pair-plan__dirty"}>
            {isDirty ? "UNSAVED" : "SYNCED"}
          </span>
          {draftBaseRevision !== null ? <span>based on r{draftBaseRevision}</span> : null}
          {revisionIsStale ? <span className="port-pair-plan__stale">server revision changed</span> : null}
        </div>
        <div className="port-pair-plan__actions">
          <button
            aria-label="Refresh traffic runtime"
            className="port-pair-plan__icon-button"
            disabled={controlsBusy}
            onClick={() => void loadRuntime()}
            title="Refresh traffic runtime without discarding unsaved assignments"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Discard traffic plan edits"
            className="port-pair-plan__icon-button"
            disabled={controlsBusy || (!isDirty && !revisionIsStale)}
            onClick={() => void discardDraft()}
            title="Discard edits and reload the backend plan"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Save traffic plan"
            className="port-pair-plan__save"
            disabled={controlsBusy || saveDisabledReason !== null}
            onClick={() => void savePlan()}
            title={saveDisabledReason ?? "Save assignments using optimistic revision control"}
            type="button"
          >
            <Save aria-hidden="true" size={14} />
            <span>{busyAction === "save" ? "Saving…" : "Save assignments"}</span>
          </button>
        </div>
      </header>

      {operationStatus ? (
        <div
          className={`port-pair-plan__notice port-pair-plan__notice--${operationStatus.tone}`}
          role={operationStatus.tone === "error" ? "alert" : "status"}
        >
          {operationStatus.text}
        </div>
      ) : null}
      {loadError ? (
        <div className="port-pair-plan__notice port-pair-plan__notice--error" role="alert">
          {loadError}
        </div>
      ) : null}
      {validationError ? (
        <div className="port-pair-plan__notice port-pair-plan__notice--error" role="alert">
          {validationError}
        </div>
      ) : null}

      {runtime && draftGroups.length > 0 ? (
        <div
          aria-label="Port pair assignments"
          className="port-pair-plan__table-wrap"
          role="region"
          tabIndex={0}
        >
          <table className="port-pair-plan__table">
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Live links</th>
                <th scope="col">Assigned profile</th>
                <th scope="col">Multiplier / rate</th>
                <th scope="col">Duration (s)</th>
                <th scope="col">Runtime authority</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftGroups.map((group) => {
                const runtimeView = trafficGroupRuntimeView(runtime, group);
                const currentProfile = profileByPath.get(group.profile_path);
                const profileIsOutsideCatalog = !currentProfile;
                const rowBusy = busyAction === `start:${group.id}`;
                const linkBlocker = trafficGroupLinkBlocker(portRecords, group.ports);
                const groupRuntimeBlocker = runtimeStartBlocker(runtime, group);
                const startDisabledReason = runtimeControlDisabledReason
                  ?? (loadError ? `Traffic runtime refresh is blocked: ${loadError}` : null)
                  ?? (isDirty ? "Save traffic plan assignments before starting a group." : null)
                  ?? (revisionIsStale ? "Reload the changed backend plan before starting." : null)
                  ?? validationError
                  ?? linkBlocker
                  ?? groupRuntimeBlocker;
                return (
                  <tr
                    aria-label={`${group.name} ports ${group.ports.map((port) => `P${port}`).join(" and ")}`}
                    key={group.id}
                  >
                    <td className="port-pair-plan__pair">
                      <strong>{group.name}</strong>
                      <span>{group.id}</span>
                    </td>
                    <td>
                      <div className="port-pair-plan__links" aria-label={`Live links for ${group.name}`}>
                        {group.ports.map((port, index) => {
                          const state = portLinkState(portRecords, port);
                          const interfaceName = runtime.config.interfaces[port];
                          return (
                            <span className="port-pair-plan__link-fragment" key={port}>
                              {index > 0 ? <span className="port-pair-plan__link-wire" aria-hidden="true">↔</span> : null}
                              <span
                                className={`port-pair-plan__link port-pair-plan__link--${state}`}
                                title={interfaceName ? `P${port} · ${interfaceName}` : `P${port}`}
                              >
                                <i aria-hidden="true" />
                                <b>P{port}</b>
                                <em>{linkLabel(state)}</em>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Profile for ${group.name}`}
                        autoComplete="off"
                        className="port-pair-plan__profile"
                        disabled={controlsBusy}
                        name={`traffic-plan-${group.id}-profile`}
                        onChange={(event) => patchGroup(group.id, { profile_path: event.target.value })}
                        value={group.profile_path}
                      >
                        {profileIsOutsideCatalog ? (
                          <option aria-label={`Assigned profile ${group.profile_path}`} value={group.profile_path}>
                            {group.profile_path} · outside current catalog
                          </option>
                        ) : null}
                        {profileOptions.map((profile) => (
                          <option
                            aria-label={`Assign ${profileLabel(profile)}`}
                            key={profile.path}
                            value={profile.path}
                          >
                            {profileLabel(profile)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Multiplier or rate for ${group.name}`}
                        className="port-pair-plan__rate"
                        disabled={controlsBusy}
                        maxLength={64}
                        name={`traffic-plan-${group.id}-multiplier`}
                        onChange={(event) => patchGroup(group.id, { multiplier: event.target.value })}
                        placeholder="e.g. 1, 10kpps, 25%…"
                        spellCheck={false}
                        autoComplete="off"
                        value={group.multiplier}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Duration for ${group.name}`}
                        className="port-pair-plan__duration"
                        disabled={controlsBusy}
                        inputMode="decimal"
                        min="-1"
                        name={`traffic-plan-${group.id}-duration`}
                        onChange={(event) =>
                          patchGroup(group.id, {
                            duration: event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value)
                          })}
                        step="0.1"
                        title="-1 runs continuously"
                        type="number"
                        autoComplete="off"
                        value={durationValue(group.duration)}
                      />
                    </td>
                    <td>
                      <div className="port-pair-plan__runtime">
                        <span className={`port-pair-plan__state port-pair-plan__state--${runtimeView.state}`}>
                          {runtimeView.state.toUpperCase()}
                        </span>
                        <span className={`port-pair-plan__owner port-pair-plan__owner--${runtimeView.ownership}`}>
                          {runtimeView.ownership === "none" ? "UNOWNED" : runtimeView.ownership.toUpperCase()}
                        </span>
                        {runtimeView.sessionId ? (
                          <code title={runtimeView.sessionId}>#{runtimeView.sessionId.slice(0, 8)}</code>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <button
                        aria-label={`Start ${group.name}`}
                        className="port-pair-plan__start"
                        disabled={controlsBusy || startDisabledReason !== null}
                        onClick={() => void startGroup(group)}
                        title={startDisabledReason ?? `Start ${group.name} using the saved backend plan`}
                        type="button"
                      >
                        <Play aria-hidden="true" size={13} />
                        <span>{rowBusy ? "Starting…" : "Start"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="port-pair-plan__empty" role="status">
          {isLoading ? "Loading authoritative traffic plan…" : "No traffic groups are configured."}
        </div>
      )}

      <footer className="port-pair-plan__footer">
        <span>
          {isLoading ? "Refreshing live runtime…" : runtime?.reconciliation ?? "Runtime has not been reconciled."}
        </span>
        <span>-1 = continuous</span>
      </footer>
    </section>
  );
}
