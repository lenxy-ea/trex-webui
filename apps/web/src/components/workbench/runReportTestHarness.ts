import { describe, expect, it } from "vitest";

import type {
  ProfileWorkbenchStream,
  TrafficMutationEvidence,
  TrafficSessionGroup,
  TrexResult
} from "../../api";
import type {
  BuildRunReportInput,
  RunReportCaptureFile,
  RunReportTrafficSession
} from "./runReport";
import {
  buildRunReportCsv,
  buildRunReportCsvFromArchiveContent,
  buildRunReportPdf,
  buildRunReportPdfFromArchiveContent,
  buildRunReportSnapshot,
  runReportCsvFileName,
  runReportPdfFileName
} from "./runReport";

export { describe, expect, it };
export type {
  BuildRunReportInput,
  ProfileWorkbenchStream,
  RunReportCaptureFile,
  RunReportTrafficSession
};
export {
  buildRunReportCsv,
  buildRunReportCsvFromArchiveContent,
  buildRunReportPdf,
  buildRunReportPdfFromArchiveContent,
  buildRunReportSnapshot,
  runReportCsvFileName,
  runReportPdfFileName
};

type RunReportTrafficSessionSeed = {
  startedAt: string;
  endedAt: string | null;
  captureCompletedAt?: string | null;
  profilePath: string;
  ports: number[];
  multiplier: string;
  duration: number;
  tunables: Record<string, string | number | boolean>;
  startResult: TrexResult<unknown> | null;
  stopResult: TrexResult<unknown> | null;
};

export function runReportTrafficSession(
  seed: RunReportTrafficSessionSeed
): RunReportTrafficSession {
  const state = seed.endedAt === null ? "running" : "stopped";
  const updatedAt = seed.endedAt ?? seed.startedAt;
  const startIntentNonce = "11111111-1111-4111-8111-111111111111";
  const stopIntentNonce = "22222222-2222-4222-8222-222222222222";
  const baselinePortStates = Object.fromEntries(
    seed.ports.map((port) => [port, "stopped" as const])
  );
  const runningPortStates = Object.fromEntries(
    seed.ports.map((port) => [port, "running" as const])
  );
  const stoppedPortStates = Object.fromEntries(
    seed.ports.map((port) => [port, "stopped" as const])
  );
  const startEvidence: TrafficMutationEvidence | null = seed.startResult?.ok
    ? {
        intent_nonce: startIntentNonce,
        operation: "start",
        completion_mode: "direct",
        ports: seed.ports,
        baseline_port_states: baselinePortStates,
        desired_port_states: runningPortStates,
        baseline_acquired_ports: [],
        prepared_at: seed.startedAt,
        completed_at: seed.startedAt,
        acquisition_restored: true,
        wal_cleared: true
      }
    : null;
  const stopEvidence: TrafficMutationEvidence | null = seed.endedAt !== null && seed.stopResult?.ok
    ? {
        intent_nonce: stopIntentNonce,
        operation: "stop",
        completion_mode: "direct",
        ports: seed.ports,
        baseline_port_states: runningPortStates,
        desired_port_states: stoppedPortStates,
        baseline_acquired_ports: [],
        prepared_at: seed.endedAt,
        completed_at: seed.endedAt,
        acquisition_restored: true,
        wal_cleared: true
      }
    : null;
  const group: TrafficSessionGroup = {
    group_id: "pair-0",
    run_id: startIntentNonce,
    source: "plan" as const,
    plan_revision: 1,
    ports: seed.ports,
    profile_path: seed.profilePath,
    profile_sha256: "a".repeat(64),
    start_multiplier: seed.multiplier,
    multiplier: seed.multiplier,
    duration: seed.duration,
    start_force: false,
    start_total: false,
    start_synchronized: false,
    start_clear_existing: true,
    started_at: seed.startedAt,
    ended_at: seed.endedAt,
    hard_stop_at: null,
    tunables: seed.tunables,
    start_evidence: startEvidence,
    cleanup_evidence: seed.endedAt === null
      ? null
      : {
          completion: stopEvidence === null ? "observed" as const : "operator_stop" as const,
          completed_at: seed.endedAt,
          final_port_states: stoppedPortStates,
          intent_nonce: stopEvidence?.intent_nonce ?? null,
          acquisition_restored: stopEvidence?.acquisition_restored ?? null,
          wal_cleared: true as const
        },
    state,
    port_states: state === "running" ? runningPortStates : stoppedPortStates,
    updated_at: updatedAt
  };
  return {
    session: {
      id: startIntentNonce,
      revision: 1,
      evidence_version: 1,
      authority: {
        host: "127.0.0.1",
        sync_port: 4501,
        async_port: 4500,
        scapy_port: 4507,
        daemon_supervisor: "systemd",
        generation: "test-generation"
      },
      state,
      started_at: seed.startedAt,
      updated_at: updatedAt,
      ended_at: seed.endedAt,
      groups: seed.endedAt === null ? [group] : [],
      completed_groups: seed.endedAt === null ? [] : [group],
      mutation_evidence: [startEvidence, stopEvidence].filter(
        (entry): entry is TrafficMutationEvidence => entry !== null
      ),
      reconciliation: "test authoritative session"
    },
    captureCompletedAt: seed.captureCompletedAt ?? null
  };
}

export function ipv4EnvelopeFields(protocol: string, totalLength: string) {
  return [
    { name: "Protocol", value: protocol },
    { name: "Header Length", value: "20" },
    { name: "Total Length", value: totalLength }
  ];
}

export function ipv6EnvelopeFields(nextHeader: string, payloadLength: string) {
  return [
    { name: "Next Header", value: nextHeader },
    { name: "Payload Length", value: payloadLength }
  ];
}
