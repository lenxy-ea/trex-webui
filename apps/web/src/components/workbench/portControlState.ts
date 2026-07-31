import type { SystemOverview, TrexPortRecord } from "../../api";

export function portIsLocallyAcquired(port: TrexPortRecord | null, overview: SystemOverview | null) {
  if (!port) {
    return false;
  }
  const snapshotAcquired = overview?.trex_ports?.data?.acquired_ports.includes(port.id) ?? false;
  return port.acquired || snapshotAcquired;
}

export function portHasSnapshot(port: TrexPortRecord | null, overview: SystemOverview | null) {
  if (!port || !overview?.trex_ports?.ok) {
    return false;
  }
  return overview.trex_ports?.data?.ports.some((record) => record.id === port.id) ?? false;
}

export function portControlDisabledReason({
  activeCommand,
  hasPortSnapshot,
  portAcquired
}: {
  activeCommand: string | null;
  hasPortSnapshot: boolean;
  portAcquired: boolean;
}) {
  if (!hasPortSnapshot) {
    return "Waiting for a real TRex port response";
  }
  if (!portAcquired) {
    return "Port attributes require an acquired port";
  }
  if (activeCommand !== null) {
    return "Waiting for the current port command to finish";
  }
  return null;
}

export function portControlState(
  port: TrexPortRecord | null,
  overview: SystemOverview | null,
  activeCommand: string | null
) {
  const acquired = portIsLocallyAcquired(port, overview);
  const hasSnapshot = portHasSnapshot(port, overview);
  const disabledReason = portControlDisabledReason({
    activeCommand,
    hasPortSnapshot: hasSnapshot,
    portAcquired: acquired
  });

  return {
    acquired,
    disabledReason,
    editable: disabledReason === null,
    hasSnapshot
  };
}
