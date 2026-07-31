import type {
  TrafficRuntimeSnapshot,
  TrafficSession
} from "../../api";

export type RunReportTrafficSession = {
  session: TrafficSession;
  captureCompletedAt: string | null;
};

export function synchronizeRunReportTrafficSession(
  current: RunReportTrafficSession | null,
  snapshot: TrafficRuntimeSnapshot
): RunReportTrafficSession | null {
  const session = snapshot.session;
  if (
    session === null
    || session.evidence_version !== 1
    || session.revision < 1
  ) {
    return null;
  }

  const sameSession = current?.session.id === session.id;
  return {
    session,
    captureCompletedAt: sameSession ? current.captureCompletedAt : null
  };
}

export function trafficSessionRunGroups(session: TrafficSession) {
  return [...session.completed_groups, ...session.groups];
}

export function trafficSessionPorts(session: TrafficSession) {
  return [...new Set(trafficSessionRunGroups(session).flatMap((group) => group.ports))]
    .sort((left, right) => left - right);
}

export function trafficSessionProfiles(session: TrafficSession) {
  return [...new Set(trafficSessionRunGroups(session).map((group) => group.profile_path))];
}

export function trafficSessionRateLabel(session: TrafficSession) {
  const rates = [
    ...new Set(
      trafficSessionRunGroups(session).map((group) =>
        group.start_multiplier ?? group.multiplier)
    )
  ];
  if (rates.length === 0) {
    return "-";
  }
  return rates.length === 1 ? rates[0] : "Mixed";
}

export function trafficSessionDurationLabel(session: TrafficSession) {
  const durations = [
    ...new Set(trafficSessionRunGroups(session).map((group) => group.duration))
  ];
  if (durations.length === 0) {
    return "-";
  }
  if (durations.length > 1) {
    return "Mixed";
  }
  return durations[0] > 0 ? `${durations[0]} s` : "continuous";
}

export function trafficProfileByPort(snapshot: TrafficRuntimeSnapshot | null) {
  if (snapshot === null) {
    return {};
  }

  const assignments = new Map<number, string>();
  for (const group of snapshot.groups) {
    for (const port of group.ports) {
      assignments.set(port, group.profile_path);
    }
  }
  if (snapshot.session !== null) {
    for (const group of snapshot.session.groups) {
      if (group.state === "stopped") {
        continue;
      }
      for (const port of group.ports) {
        assignments.set(port, group.profile_path);
      }
    }
  }
  return Object.fromEntries(assignments) as Record<number, string>;
}
