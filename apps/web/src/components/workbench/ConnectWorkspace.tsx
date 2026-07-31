import { useRef, useState } from "react";

import type { ConnectTrexRequest, SystemOverview } from "../../api";

type ConnectWorkspaceProps = {
  error: string | null;
  isConnecting: boolean;
  overview: SystemOverview | null;
  onClose: () => void;
  onConnect: (request: ConnectTrexRequest) => Promise<SystemOverview | null>;
};

function connectionStatus(overview: SystemOverview | null, error: string | null) {
  const probe = overview?.trex_probe;
  const environment = overview?.environment;
  if (probe?.ok) {
    return `Connected to tcp://${environment?.host ?? "unconfigured"}:${environment?.sync_port ?? 4501}`;
  }
  if (probe?.error) {
    return probe.error;
  }
  if (probe?.blocker) {
    return probe.blocker;
  }
  if (error) {
    return error;
  }
  return "Disconnected";
}

function draftFromOverview(overview: SystemOverview | null) {
  const environment = overview?.environment;
  return {
    host: environment?.host ?? "",
    syncPort: String(environment?.sync_port ?? 4501),
    asyncPort: String(environment?.async_port ?? 4500),
    scapyPort: String(environment?.scapy_port ?? 4507),
    timeoutSeconds: String(environment?.connect_timeout_seconds ?? 3),
    clientName: environment?.client_name ?? "Client1"
  };
}

type ParsedPort =
  | { error: null; value: number }
  | { error: string; value: null };

function parsePort(label: string, value: string): ParsedPort {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: `${label} must be an integer port.`, value: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return { error: `${label} must be between 1 and 65535.`, value: null };
  }
  return { error: null, value: parsed };
}

function parseTimeoutSeconds(value: string): ParsedPort {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: "Timeout must be an integer.", value: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 300) {
    return { error: "Timeout must be between 1 and 300 seconds.", value: null };
  }
  return { error: null, value: parsed };
}

function hasControlCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) {
      return true;
    }
  }
  return false;
}

function validateDraft(draft: ReturnType<typeof draftFromOverview>) {
  const host = draft.host.trim();
  if (!host || host !== draft.host || host.includes("://") || host.includes("/") || host.includes("@")) {
    return { error: "Host must be a clean hostname or IP address.", request: null };
  }
  if (
    draft.clientName.trim() === ""
    || draft.clientName !== draft.clientName.trim()
    || draft.clientName.length > 64
    || hasControlCharacters(draft.clientName)
  ) {
    return { error: "Name must be clean non-empty text up to 64 characters.", request: null };
  }
  const syncPort = parsePort("Sync Port", draft.syncPort);
  if (syncPort.error !== null) {
    return { error: syncPort.error, request: null };
  }
  const asyncPort = parsePort("Async Port", draft.asyncPort);
  if (asyncPort.error !== null) {
    return { error: asyncPort.error, request: null };
  }
  const scapyPort = parsePort("Scapy Port", draft.scapyPort);
  if (scapyPort.error !== null) {
    return { error: scapyPort.error, request: null };
  }
  const timeoutSeconds = parseTimeoutSeconds(draft.timeoutSeconds);
  if (timeoutSeconds.error !== null) {
    return { error: timeoutSeconds.error, request: null };
  }
  return {
    error: null,
    request: {
      host,
      sync_port: syncPort.value,
      async_port: asyncPort.value,
      scapy_port: scapyPort.value,
      client_name: draft.clientName,
      timeout_seconds: timeoutSeconds.value
    }
  };
}

export function ConnectWorkspace({
  error,
  isConnecting,
  overview,
  onClose,
  onConnect
}: ConnectWorkspaceProps) {
  const [draft, setDraft] = useState(() => draftFromOverview(overview));
  const [localError, setLocalError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const statusText = connectionStatus(overview, error);
  const statusOk = Boolean(overview?.trex_probe?.ok);
  const validation = validateDraft(draft);
  const shownStatus = localError ?? validation.error ?? statusText;
  const statusClass = statusOk && !localError && !validation.error ? "connect-status connect-status--ok" : "connect-status";

  const handleConnect = async () => {
    if (isConnecting || submitInFlightRef.current) {
      return;
    }
    if (!validation.request) {
      setLocalError(validation.error);
      return;
    }
    setLocalError(null);
    submitInFlightRef.current = true;
    try {
      const result = await onConnect(validation.request);
      if (result?.trex_probe.ok) {
        onClose();
      }
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return (
    <form
      aria-label="Connect"
      className="connect-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        void handleConnect();
      }}
    >
      <div className="connect-content">
        <label className="connect-field connect-field--host">
          <span>TRex host</span>
          <input
            aria-label="TRex host"
            autoComplete="off"
            disabled={isConnecting}
            name="host"
            onChange={(event) => setDraft((current) => ({ ...current, host: event.target.value }))}
            value={draft.host}
          />
        </label>
        <details className="connect-advanced">
          <summary>Show advanced options...</summary>
          <div className="connect-advanced-grid">
            <label>
              <span>Sync Port</span>
              <input
                aria-label="Sync Port"
                autoComplete="off"
                disabled={isConnecting}
                inputMode="numeric"
                name="sync_port"
                onChange={(event) => setDraft((current) => ({ ...current, syncPort: event.target.value }))}
                value={draft.syncPort}
              />
            </label>
            <label>
              <span>Async Port</span>
              <input
                aria-label="Async Port"
                autoComplete="off"
                disabled={isConnecting}
                inputMode="numeric"
                name="async_port"
                onChange={(event) => setDraft((current) => ({ ...current, asyncPort: event.target.value }))}
                value={draft.asyncPort}
              />
            </label>
            <label>
              <span>Scapy Port</span>
              <input
                aria-label="Scapy Port"
                autoComplete="off"
                disabled={isConnecting}
                inputMode="numeric"
                name="scapy_port"
                onChange={(event) => setDraft((current) => ({ ...current, scapyPort: event.target.value }))}
                value={draft.scapyPort}
              />
            </label>
            <label>
              <span>Timeout (seconds)</span>
              <input
                aria-label="Timeout (seconds)"
                autoComplete="off"
                disabled={isConnecting}
                inputMode="numeric"
                name="timeout_seconds"
                onChange={(event) => setDraft((current) => ({ ...current, timeoutSeconds: event.target.value }))}
                value={draft.timeoutSeconds}
              />
            </label>
            <label>
              <span>Name</span>
              <input
                aria-label="Name"
                autoComplete="off"
                disabled={isConnecting}
                name="client_name"
                onChange={(event) => setDraft((current) => ({ ...current, clientName: event.target.value }))}
                value={draft.clientName}
              />
            </label>
            <div className="connect-mode" role="group" aria-label="Mode">
              <span>Mode</span>
              <label>
                <input disabled name="connect-mode" type="radio" />
                <span>Read Only</span>
              </label>
              <label>
                <input checked name="connect-mode" readOnly type="radio" />
                <span>Full Control</span>
              </label>
            </div>
          </div>
        </details>
        <div className={statusClass} role="status">
          {shownStatus}
        </div>
      </div>
      <div className="connect-actions">
        <button
          className="normal-button"
          disabled={isConnecting || Boolean(validation.error)}
          type="submit"
        >
          {isConnecting ? "Connecting" : "Connect"}
        </button>
        <button className="normal-button cancel-button" disabled={isConnecting} onClick={onClose} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
