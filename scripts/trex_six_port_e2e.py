#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from trex_real_acceptance import (
    AcceptanceError,
    capture_recorder_count,
    clean_file_timestamp,
    request_json,
    require_ok,
    sanitize_report_payload,
    utc_now,
    write_local_report,
)
from trex_standard_e2e import (
    EVIDENCE_IDENTITY_SCHEMA,
    PROJECT_ROOT,
    TRAFFIC_HARD_STOP_CLEANUP_MARGIN_SECONDS,
    TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS,
    canonical_hard_stop_at,
    compute_build_identity,
    compute_source_identity,
    local_api_source_summary,
    profile_path_matches,
)


DEFAULT_BASE_URL = "http://127.0.0.1"
DEFAULT_OUTPUT_DIR = ".logs/six-port-e2e"
DEFAULT_REPORT_PREFIX = "six-port-e2e"
DEFAULT_HTTP_TIMEOUT_SECONDS = 20.0
DEFAULT_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_STATS_TIMEOUT_SECONDS = 12.0
DEFAULT_GROUP_IDS = ("pair-0", "pair-1", "pair-2")
EXPECTED_PORTS_BY_SLOT = ((0, 1), (2, 3), (4, 5))
RESERVED_REPORT_PAYLOAD_KEYS = frozenset(
    {"traffic_session", "traffic_session_binding"}
)


def six_port_hard_stop_windows(args: argparse.Namespace) -> dict[str, float]:
    numeric = {
        "timeout": getattr(args, "timeout", None),
        "stats_timeout": getattr(args, "stats_timeout", None),
        "poll_interval": getattr(args, "poll_interval", None),
    }
    invalid = {
        name: value
        for name, value in numeric.items()
        if isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or (name == "poll_interval" and value < 0)
        or (name != "poll_interval" and value <= 0)
    }
    if invalid:
        raise AcceptanceError(
            "hard-stop budget",
            "six-port timing values must be finite and positive "
            "(poll interval may be zero)",
            invalid,
        )
    timeout = float(numeric["timeout"])
    stats_timeout = float(numeric["stats_timeout"])
    group_ids = list(getattr(args, "group_ids", []))
    target_ports(group_ids)
    windows = {
        group_id: (
            # Remaining group start responses, the last stats request, normal
            # stop, runtime reconciliation, and one exact stop retry.
            (len(group_ids) - index) * timeout
            + stats_timeout
            + timeout
            + 3 * timeout
            + TRAFFIC_HARD_STOP_CLEANUP_MARGIN_SECONDS
        )
        for index, group_id in enumerate(group_ids)
    }
    invalid_windows = {
        group_id: window
        for group_id, window in windows.items()
        if window <= 0 or window > TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS
    }
    if invalid_windows:
        raise AcceptanceError(
            "hard-stop budget",
            "derived six-port hard-stop window exceeds the backend's "
            f"{TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS:g}-second safety limit",
            {"windows": windows, "invalid": invalid_windows},
        )
    return windows


def read_path(source: Any, path: str) -> Any:
    current = source
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def require_object(value: Any, stage: str, message: str) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    raise AcceptanceError(stage, message, value)


def require_nonempty_text(value: Any, stage: str, label: str) -> str:
    if isinstance(value, str) and value.strip():
        return value
    raise AcceptanceError(stage, f"{label} is missing", value)


def require_positive_revision(value: Any, stage: str) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 1:
        return value
    raise AcceptanceError(stage, "session revision is not a positive integer", value)


def target_ports(group_ids: list[str]) -> list[int]:
    if len(group_ids) != len(EXPECTED_PORTS_BY_SLOT):
        raise AcceptanceError(
            "arguments",
            "exactly three group ids are required for the three physical pairs",
            group_ids,
        )
    if len(set(group_ids)) != len(group_ids):
        raise AcceptanceError("arguments", "group ids must be unique", group_ids)
    return [port for pair in EXPECTED_PORTS_BY_SLOT for port in pair]


def expected_groups(group_ids: list[str]) -> dict[str, list[int]]:
    target_ports(group_ids)
    return {
        group_id: list(EXPECTED_PORTS_BY_SLOT[index])
        for index, group_id in enumerate(group_ids)
    }


def collect_current_identity(gate_id: str) -> dict[str, Any]:
    return {
        "schema": EVIDENCE_IDENTITY_SCHEMA,
        "gate_id": gate_id,
        "source": compute_source_identity(PROJECT_ROOT),
        "build": compute_build_identity(PROJECT_ROOT),
        "api": local_api_source_summary(PROJECT_ROOT),
    }


def runtime_data(payload: dict[str, Any], stage: str) -> dict[str, Any]:
    return require_object(
        require_ok(stage, payload).get("data"),
        stage,
        "traffic runtime response did not include object data",
    )


def validate_plan(
    runtime: dict[str, Any],
    group_ids: list[str],
) -> tuple[int, dict[str, dict[str, Any]]]:
    stage = "six-port plan"
    plan_revision = runtime.get("plan_revision")
    if (
        not isinstance(plan_revision, int)
        or isinstance(plan_revision, bool)
        or plan_revision < 1
    ):
        raise AcceptanceError(stage, "plan revision is not a positive integer", runtime)
    records = runtime.get("groups")
    if not isinstance(records, list):
        raise AcceptanceError(stage, "traffic runtime did not include plan groups", runtime)
    by_id = {
        str(record.get("id")): record
        for record in records
        if isinstance(record, dict) and isinstance(record.get("id"), str)
    }
    expected = expected_groups(group_ids)
    selected: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    for group_id, ports in expected.items():
        record = by_id.get(group_id)
        if record is None:
            problems.append(f"{group_id} is missing")
            continue
        if record.get("ports") != ports:
            problems.append(
                f"{group_id} ports are {record.get('ports')!r}, expected {ports!r}"
            )
        if not isinstance(record.get("profile_path"), str) or not record["profile_path"]:
            problems.append(f"{group_id} has no profile")
        if not isinstance(record.get("multiplier"), str) or not record["multiplier"]:
            problems.append(f"{group_id} has no multiplier")
        selected[group_id] = record
    if problems:
        raise AcceptanceError(stage, "; ".join(problems), runtime)
    return plan_revision, selected


def port_records(payload: dict[str, Any], stage: str) -> dict[int, dict[str, Any]]:
    data = require_object(
        require_ok(stage, payload).get("data"),
        stage,
        "ports response did not include object data",
    )
    records = data.get("ports")
    if not isinstance(records, list):
        raise AcceptanceError(stage, "ports response did not include port records", payload)
    return {
        record["id"]: record
        for record in records
        if isinstance(record, dict)
        and isinstance(record.get("id"), int)
        and not isinstance(record.get("id"), bool)
    }


def inventory_difference(
    observed: list[int], expected: list[int]
) -> tuple[list[int], list[int], list[int]]:
    observed_set = set(observed)
    expected_set = set(expected)
    duplicates = sorted(
        port for port in observed_set if observed.count(port) > 1
    )
    return (
        sorted(expected_set.difference(observed_set)),
        sorted(observed_set.difference(expected_set)),
        duplicates,
    )


def require_exact_inventory(
    observed: list[int], expected: list[int], *, label: str, stage: str, payload: Any
) -> None:
    missing, extra, duplicates = inventory_difference(observed, expected)
    if missing or extra or duplicates:
        raise AcceptanceError(
            stage,
            f"{label} did not match exact P0-P5 inventory "
            f"(missing={missing}, extra={extra}, duplicates={duplicates})",
            payload,
        )


def validate_ports_idle_and_up(
    payload: dict[str, Any], ports: list[int], stage: str
) -> dict[str, Any]:
    data = require_object(
        require_ok(stage, payload).get("data"),
        stage,
        "ports response did not include object data",
    )
    announced_ids = data.get("port_ids")
    if (
        not isinstance(announced_ids, list)
        or any(
            not isinstance(port, int) or isinstance(port, bool)
            for port in announced_ids
        )
    ):
        raise AcceptanceError(stage, "ports response had invalid port_ids", payload)
    require_exact_inventory(
        announced_ids,
        ports,
        label="live port ids",
        stage=stage,
        payload=payload,
    )

    raw_records = data.get("ports")
    if not isinstance(raw_records, list):
        raise AcceptanceError(stage, "ports response did not include port records", payload)
    record_ids = [
        record["id"]
        for record in raw_records
        if isinstance(record, dict)
        and isinstance(record.get("id"), int)
        and not isinstance(record.get("id"), bool)
    ]
    if len(record_ids) != len(raw_records):
        raise AcceptanceError(stage, "ports response had malformed port records", payload)
    require_exact_inventory(
        record_ids,
        ports,
        label="live port records",
        stage=stage,
        payload=payload,
    )
    records = port_records(payload, stage)
    problems: list[str] = []
    acquired_ports: list[int] = []
    owned_ports: dict[int, Any] = {}
    for port in ports:
        record = records.get(port)
        info = record.get("info") if isinstance(record, dict) else None
        status = info.get("status") if isinstance(info, dict) else None
        link = info.get("link") if isinstance(info, dict) else None
        if not isinstance(record, dict):
            problems.append(f"P{port}=missing")
            continue
        if not isinstance(link, str) or link.strip().upper() != "UP":
            problems.append(f"P{port} link={link or 'unknown'}")
        if not isinstance(status, str) or status.strip().upper() != "IDLE":
            problems.append(f"P{port} state={status or 'unknown'}")
        if record.get("acquired") is not False:
            acquired_ports.append(port)
            problems.append(f"P{port} acquired={record.get('acquired')!r}")
        if not isinstance(info, dict) or "owner" not in info:
            owned_ports[port] = "missing"
            problems.append(f"P{port} owner=missing")
        else:
            owner = info["owner"]
            if owner is not None and (
                not isinstance(owner, str) or bool(owner.strip())
            ):
                owned_ports[port] = owner
                problems.append(f"P{port} owner={owner!r}")
    if problems:
        raise AcceptanceError(
            stage,
            "six-port qualification requires exact P0-P5 links UP, ports IDLE, "
            "and no STL acquisition or owner: "
            + ", ".join(problems),
            payload,
        )
    return {
        "exact_inventory": True,
        "port_ids": list(ports),
        "ports_idle": True,
        "links_up": True,
        "ports_unowned": True,
        "acquired_ports": acquired_ports,
        "owned_ports": owned_ports,
    }


def validate_runtime_ports_stopped(
    runtime: dict[str, Any], ports: list[int], stage: str
) -> dict[str, Any]:
    available_ports = runtime.get("available_ports")
    if (
        not isinstance(available_ports, list)
        or any(
            not isinstance(port, int) or isinstance(port, bool)
            for port in available_ports
        )
    ):
        raise AcceptanceError(stage, "traffic runtime had invalid available_ports", runtime)
    require_exact_inventory(
        available_ports,
        ports,
        label="runtime available ports",
        stage=stage,
        payload=runtime,
    )

    config = runtime.get("config")
    interfaces = config.get("interfaces") if isinstance(config, dict) else None
    if (
        not isinstance(config, dict)
        or config.get("port_limit") != len(ports)
        or not isinstance(interfaces, list)
        or len(interfaces) != len(ports)
        or any(not isinstance(interface, str) or not interface for interface in interfaces)
    ):
        raise AcceptanceError(
            stage,
            "traffic runtime config did not describe exactly six interfaces",
            config,
        )

    records = runtime.get("port_states")
    if not isinstance(records, list):
        raise AcceptanceError(stage, "traffic runtime did not include port states", runtime)
    record_ids = [
        record["port"]
        for record in records
        if isinstance(record, dict)
        and isinstance(record.get("port"), int)
        and not isinstance(record.get("port"), bool)
    ]
    if len(record_ids) != len(records):
        raise AcceptanceError(
            stage, "traffic runtime had malformed port state records", runtime
        )
    require_exact_inventory(
        record_ids,
        ports,
        label="runtime port states",
        stage=stage,
        payload=runtime,
    )
    by_port = {
        record.get("port"): record
        for record in records
        if isinstance(record, dict)
    }
    problems = [
        f"P{port} state={by_port[port].get('state') or 'missing'} "
        f"ownership={by_port[port].get('ownership') or 'missing'}"
        for port in ports
        if by_port[port].get("state") != "stopped"
        or by_port[port].get("ownership") != "none"
    ]
    if problems:
        raise AcceptanceError(
            stage,
            "traffic runtime ports are not stopped and unowned: " + ", ".join(problems),
            runtime,
        )
    return {
        "runtime_exact_inventory": True,
        "runtime_port_ids": list(ports),
        "runtime_ports_stopped": True,
        "runtime_ports_unowned": True,
    }


def numeric_counter(value: Any, stage: str, port: int, counter: str) -> float:
    if isinstance(value, bool):
        raise AcceptanceError(stage, f"P{port} {counter} is not numeric", value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            pass
    raise AcceptanceError(stage, f"P{port} {counter} is not numeric", value)


def port_counter_snapshot(payload: dict[str, Any], ports: list[int], stage: str) -> dict[int, dict[str, float]]:
    data = require_object(
        require_ok(stage, payload).get("data"),
        stage,
        "stats response did not include object data",
    )
    snapshot: dict[int, dict[str, float]] = {}
    for port in ports:
        record = data.get(str(port), data.get(port))
        if not isinstance(record, dict):
            raise AcceptanceError(stage, f"stats did not include P{port}", payload)
        snapshot[port] = {
            "opackets": numeric_counter(record.get("opackets"), stage, port, "opackets"),
            "ipackets": numeric_counter(record.get("ipackets"), stage, port, "ipackets"),
        }
    return snapshot


def packet_growth(
    baseline: dict[int, dict[str, float]],
    sample: dict[int, dict[str, float]],
) -> dict[int, dict[str, float]]:
    return {
        port: {
            counter: sample[port][counter] - baseline[port][counter]
            for counter in ("opackets", "ipackets")
        }
        for port in baseline
    }


def every_port_has_bidirectional_growth(growth: dict[int, dict[str, float]]) -> bool:
    return all(
        counters["opackets"] > 0 and counters["ipackets"] > 0
        for counters in growth.values()
    )


def wait_for_six_port_packets(
    args: argparse.Namespace,
    baseline: dict[int, dict[str, float]],
    ports: list[int],
) -> tuple[list[dict[str, Any]], dict[int, dict[str, float]]]:
    deadline = time.monotonic() + args.stats_timeout
    samples: list[dict[str, Any]] = []
    last_growth = {
        port: {"opackets": 0.0, "ipackets": 0.0} for port in ports
    }
    while time.monotonic() <= deadline:
        time.sleep(args.poll_interval)
        payload = request_json(
            args.base_url, "GET", "/api/trex/stats", None, args.timeout
        )
        snapshot = port_counter_snapshot(payload, ports, "six-port stats")
        last_growth = packet_growth(baseline, snapshot)
        samples.append(
            {
                "sample_time": utc_now(),
                "ports": {str(port): counters for port, counters in snapshot.items()},
                "growth": {str(port): counters for port, counters in last_growth.items()},
            }
        )
        if every_port_has_bidirectional_growth(last_growth):
            return samples, last_growth
    missing = {
        f"P{port}": [
            counter for counter, delta in counters.items() if delta <= 0
        ]
        for port, counters in last_growth.items()
        if counters["opackets"] <= 0 or counters["ipackets"] <= 0
    }
    raise AcceptanceError(
        "six-port stats",
        "every port must show independent TX and RX packet growth",
        {"missing_growth": missing, "samples": samples[-5:]},
    )


def response_session(payload: dict[str, Any], stage: str) -> dict[str, Any]:
    session = read_path(require_ok(stage, payload), "data.session")
    return require_object(
        session,
        stage,
        "traffic response did not include a persisted session",
    )


def session_groups(session: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        group
        for collection in ("groups", "completed_groups")
        for group in (
            session.get(collection)
            if isinstance(session.get(collection), list)
            else []
        )
        if isinstance(group, dict)
    ]


def integer_state_map(value: Any) -> dict[int, Any]:
    if not isinstance(value, dict):
        return {}
    try:
        return {int(port): state for port, state in value.items()}
    except (TypeError, ValueError):
        return {}


def start_attempt_descriptor(
    *,
    group_id: str,
    plan_revision: int,
    group: dict[str, Any],
    hard_stop_at: str,
    expected_session_id: str | None,
    pre_runtime: dict[str, Any],
    pre_session: dict[str, Any] | None,
) -> dict[str, Any]:
    pre_authority = pre_runtime.get("authority")
    if not isinstance(pre_authority, dict):
        raise AcceptanceError(
            f"start {group_id}",
            "traffic runtime did not expose its current authority",
            pre_runtime,
        )
    if (
        isinstance(pre_session, dict)
        and pre_session.get("authority") != pre_authority
    ):
        raise AcceptanceError(
            f"start {group_id}",
            "preflight session did not match current runtime authority",
            pre_runtime,
        )
    return {
        "group_id": group_id,
        "plan_revision": plan_revision,
        "ports": list(group["ports"]),
        "profile_path": group.get("profile_path"),
        "multiplier": group.get("multiplier"),
        "duration": group.get("duration"),
        "force": group.get("force"),
        "total": group.get("total"),
        "synchronized": group.get("synchronized"),
        "clear_existing": group.get("clear_existing"),
        "hard_stop_at": hard_stop_at,
        "expected_session_id": expected_session_id,
        "pre_plan_revision": pre_runtime.get("plan_revision"),
        "pre_config": pre_runtime.get("config"),
        "pre_session_id": (
            pre_session.get("id") if isinstance(pre_session, dict) else None
        ),
        "pre_authority": pre_authority,
        "status": "prepared",
    }


def validate_started_plan_session(
    session: dict[str, Any],
    attempts: list[dict[str, Any]],
    *,
    expected_session_id: str | None,
    stage: str,
) -> tuple[str, dict[str, dict[str, Any]]]:
    session_id = require_nonempty_text(session.get("id"), stage, "session id")
    require_positive_revision(session.get("revision"), stage)
    if session.get("evidence_version") != 1 or session.get("state") != "running":
        raise AcceptanceError(
            stage,
            "started six-port session was not a running v1 evidence session",
            session,
        )
    if expected_session_id is None:
        previous_id = attempts[0].get("pre_session_id")
        if isinstance(previous_id, str) and previous_id == session_id:
            raise AcceptanceError(
                stage,
                "first plan group did not create a new managed session",
                session,
            )
    elif session_id != expected_session_id:
        raise AcceptanceError(
            stage,
            "traffic session id drifted while appending a plan group",
            {"expected": expected_session_id, "observed": session_id},
        )
    expected_authority = attempts[-1].get("pre_authority")
    if session.get("authority") != expected_authority:
        raise AcceptanceError(
            stage,
            "started plan session belongs to a different runtime authority",
            {"expected": expected_authority, "observed": session.get("authority")},
        )
    groups = session_groups(session)
    by_id: dict[str, dict[str, Any]] = {}
    duplicates: set[str] = set()
    for group in groups:
        group_id = group.get("group_id")
        if not isinstance(group_id, str):
            continue
        if group_id in by_id:
            duplicates.add(group_id)
        by_id[group_id] = group
    expected_ids = [str(attempt["group_id"]) for attempt in attempts]
    if duplicates or set(by_id) != set(expected_ids) or len(groups) != len(expected_ids):
        raise AcceptanceError(
            stage,
            "started session groups did not exactly match attempted plan groups",
            {
                "expected": expected_ids,
                "observed": sorted(by_id),
                "duplicates": sorted(duplicates),
            },
        )
    mutations = session.get("mutation_evidence")
    if not isinstance(mutations, list):
        raise AcceptanceError(stage, "started session mutation evidence is missing", session)
    mutation_by_nonce = {
        evidence.get("intent_nonce"): evidence
        for evidence in mutations
        if isinstance(evidence, dict)
        and isinstance(evidence.get("intent_nonce"), str)
    }
    problems: list[str] = []
    run_ids: list[str] = []
    for attempt in attempts:
        group_id = str(attempt["group_id"])
        group = by_id[group_id]
        ports = list(attempt["ports"])
        run_id = group.get("run_id")
        expected_fields = {
            "source": "plan",
            "plan_revision": attempt["plan_revision"],
            "ports": ports,
            "start_multiplier": attempt["multiplier"],
            "multiplier": attempt["multiplier"],
            "duration": attempt["duration"],
            "start_force": attempt["force"],
            "start_total": attempt["total"],
            "start_synchronized": attempt["synchronized"],
            "start_clear_existing": attempt["clear_existing"],
            "hard_stop_at": attempt["hard_stop_at"],
            "state": "running",
        }
        if any(group.get(name) != expected for name, expected in expected_fields.items()):
            problems.append(f"{group_id} start fields changed")
        if not profile_path_matches(
            str(attempt["profile_path"]), group.get("profile_path")
        ):
            problems.append(f"{group_id} start fields changed (profile_path)")
        if integer_state_map(group.get("port_states")) != {
            port: "running" for port in ports
        }:
            problems.append(f"{group_id} live states were not exactly running")
        start_evidence = group.get("start_evidence")
        if not isinstance(run_id, str) or not evidence_is_complete(
            start_evidence,
            operation="start",
            ports=ports,
            nonce=run_id,
        ):
            problems.append(f"{group_id} start evidence is incomplete")
        elif mutation_by_nonce.get(run_id) != start_evidence:
            problems.append(f"{group_id} start evidence is not canonical")
        else:
            run_ids.append(run_id)
    if not run_ids or run_ids[0] != session_id:
        problems.append("first plan run id did not match its session id")
    mutation_start_ids = [
        evidence.get("intent_nonce")
        for evidence in mutations
        if isinstance(evidence, dict) and evidence.get("operation") == "start"
    ]
    if mutation_start_ids != run_ids or len(mutations) != len(run_ids):
        problems.append("session did not contain exactly the attempted start mutations")
    if problems:
        raise AcceptanceError(stage, "; ".join(problems), session)
    return session_id, by_id


def runtime_context_matches_attempt(
    runtime: dict[str, Any],
    attempt: dict[str, Any],
) -> bool:
    return (
        runtime.get("plan_revision") == attempt.get("pre_plan_revision")
        and runtime.get("config") == attempt.get("pre_config")
        and runtime.get("authority") == attempt.get("pre_authority")
    )


def recover_six_port_session_for_cleanup(
    args: argparse.Namespace,
    run: dict[str, Any],
) -> bool:
    attempts = run.get("group_start_attempts")
    if not isinstance(attempts, list) or not attempts:
        return False
    try:
        payload = request_json(
            args.base_url,
            "GET",
            "/api/trex/traffic/runtime",
            None,
            args.timeout,
        )
        runtime = runtime_data(payload, "six-port cleanup runtime reconciliation")
    except AcceptanceError as exc:
        run["cleanup_runtime_recovery_error"] = exc.to_record()
        return False
    run["cleanup_runtime_recovery"] = sanitize_report_payload(payload)
    first_attempt = attempts[0]
    if not runtime_context_matches_attempt(runtime, first_attempt):
        run["cleanup_runtime_recovery_rejected"] = {
            "reason": "runtime context changed; refusing to adopt a different authority",
            "expected_authority": first_attempt.get("pre_authority"),
            "observed_authority": runtime.get("authority"),
            "expected_plan_revision": first_attempt.get("pre_plan_revision"),
            "observed_plan_revision": runtime.get("plan_revision"),
            "expected_config": first_attempt.get("pre_config"),
            "observed_config": runtime.get("config"),
        }
        return False
    intent = runtime.get("mutation_intent")
    if intent is not None:
        run["cleanup_runtime_recovery_rejected"] = (
            "exact traffic mutation is still pending; durable lease owns cleanup"
        )
        return False
    session = runtime.get("session")
    if not isinstance(session, dict) or session.get("state") != "running":
        run["cleanup_runtime_recovery_rejected"] = (
            "runtime had no active session eligible for operator cleanup"
        )
        return False
    observed_ids = {
        group.get("group_id")
        for group in session_groups(session)
        if isinstance(group.get("group_id"), str)
    }
    prefix: list[dict[str, Any]] = []
    for attempt in attempts:
        if attempt.get("group_id") not in observed_ids:
            break
        prefix.append(attempt)
    if not prefix or observed_ids != {
        attempt.get("group_id") for attempt in prefix
    }:
        run["cleanup_runtime_recovery_rejected"] = (
            "runtime groups were not an exact attempted prefix"
        )
        return False
    known_session_id = run.get("traffic_session_id")
    try:
        session_id, _groups = validate_started_plan_session(
            session,
            prefix,
            expected_session_id=(
                known_session_id if isinstance(known_session_id, str) else None
            ),
            stage="six-port cleanup runtime reconciliation",
        )
    except AcceptanceError as exc:
        run["cleanup_runtime_recovery_rejected"] = exc.to_record()
        return False
    if runtime.get("live_state_sampled") is not True:
        run["cleanup_runtime_recovery_rejected"] = "live runtime was not sampled"
        return False
    records = runtime.get("port_states")
    by_port = {
        item.get("port"): item
        for item in records
        if isinstance(item, dict)
        and isinstance(item.get("port"), int)
        and not isinstance(item.get("port"), bool)
    } if isinstance(records, list) else {}
    active_ports = sorted(
        port for attempt in prefix for port in attempt["ports"]
    )
    if any(
        by_port.get(port, {}).get("state") != "running"
        or by_port.get(port, {}).get("ownership") != "managed"
        for port in active_ports
    ) or any(
        by_port.get(port, {}).get("state") != "stopped"
        or by_port.get(port, {}).get("ownership") != "none"
        for port in target_ports(args.group_ids)
        if port not in active_ports
    ):
        run["cleanup_runtime_recovery_rejected"] = (
            "live port ownership did not exactly match the attempted prefix"
        )
        return False
    run["traffic_session_id"] = session_id
    run["started_ports"] = active_ports
    for attempt in prefix:
        if attempt.get("status") != "started":
            attempt["status"] = "recovered-active"
    return True


def start_plan_groups(
    args: argparse.Namespace,
    run: dict[str, Any],
    plan_revision: int,
    groups: dict[str, dict[str, Any]],
    initial_runtime: dict[str, Any],
) -> str:
    session_id: str | None = None
    started_ports: set[int] = set()
    current_session = (
        initial_runtime.get("session")
        if isinstance(initial_runtime.get("session"), dict)
        else None
    )
    attempts: list[dict[str, Any]] = run.setdefault("group_start_attempts", [])
    windows = run.get("hard_stop_windows_seconds")
    if not isinstance(windows, dict):
        windows = six_port_hard_stop_windows(args)
        run["hard_stop_windows_seconds"] = windows
    for group_id in args.group_ids:
        expected_session_id = session_id
        window = windows.get(group_id)
        if not isinstance(window, (int, float)) or isinstance(window, bool):
            raise AcceptanceError(
                "hard-stop budget",
                f"no validated hard-stop window is available for {group_id}",
                windows,
            )
        hard_stop_at = canonical_hard_stop_at(float(window))
        attempt = start_attempt_descriptor(
            group_id=group_id,
            plan_revision=plan_revision,
            group=groups[group_id],
            hard_stop_at=hard_stop_at,
            expected_session_id=expected_session_id,
            pre_runtime=initial_runtime,
            pre_session=current_session,
        )
        attempts.append(attempt)
        run.setdefault("group_hard_stop_at", {})[group_id] = hard_stop_at
        try:
            payload = request_json(
                args.base_url,
                "POST",
                f"/api/trex/traffic/group/{group_id}/start",
                {
                    "plan_revision": plan_revision,
                    "expected_session_id": expected_session_id,
                    "confirmation": "start-traffic",
                    "hard_stop_at": hard_stop_at,
                },
                args.timeout,
            )
            result = require_ok(f"start {group_id}", payload)
            session = response_session(result, f"start {group_id}")
            observed_session_id, _by_id = validate_started_plan_session(
                session,
                attempts,
                expected_session_id=expected_session_id,
                stage=f"start {group_id}",
            )
        except AcceptanceError as exc:
            attempt["start_error"] = exc.to_record()
            if recover_six_port_session_for_cleanup(args, run):
                raise AcceptanceError(
                    f"start {group_id}",
                    f"{exc}; the exact leased session was recovered for "
                    "operator cleanup",
                    {
                        "start_error": exc.to_record(),
                        "session_id": run.get("traffic_session_id"),
                    },
                ) from exc
            raise
        if session_id is None:
            session_id = observed_session_id
            run["traffic_session_id"] = session_id
        started_ports.update(groups[group_id]["ports"])
        run["started_ports"] = sorted(started_ports)
        group = next(
            item
            for item in session_groups(session)
            if item.get("group_id") == group_id
        )
        attempt.update(
            {
                "status": "started",
                "start_result": sanitize_report_payload(payload),
                "session_id": observed_session_id,
                "run_id": group.get("run_id"),
            }
        )
        current_session = session
        run.setdefault("group_starts", []).append(
            {
                "group_id": group_id,
                "plan_revision": plan_revision,
                "expected_session_id": expected_session_id,
                "session_id": observed_session_id,
                "session_revision": session.get("revision"),
                "hard_stop_at": hard_stop_at,
            }
        )
    if session_id is None:
        raise AcceptanceError("six-port start", "no traffic session was started")
    return session_id


def evidence_is_complete(
    evidence: Any,
    *,
    operation: str,
    ports: list[int],
    nonce: str | None = None,
) -> bool:
    if not isinstance(evidence, dict):
        return False
    if evidence.get("operation") != operation:
        return False
    if nonce is not None and evidence.get("intent_nonce") != nonce:
        return False
    if sorted(evidence.get("ports") or []) != sorted(ports):
        return False
    if evidence.get("completion_mode") not in {"direct", "recovered", "replayed", "hard_stop"}:
        return False
    if operation != "stop" and evidence.get("completion_mode") == "hard_stop":
        return False
    baseline = evidence.get("baseline_port_states")
    desired = evidence.get("desired_port_states")
    try:
        baseline_ports = {int(port) for port in baseline} if isinstance(baseline, dict) else set()
        desired_states = (
            {int(port): state for port, state in desired.items()}
            if isinstance(desired, dict)
            else {}
        )
    except (TypeError, ValueError):
        return False
    expected_state = "running" if operation == "start" else "stopped"
    return (
        isinstance(evidence.get("intent_nonce"), str)
        and bool(evidence.get("intent_nonce"))
        and set(ports).issubset(baseline_ports)
        and desired_states == {port: expected_state for port in ports}
        and isinstance(evidence.get("baseline_acquired_ports"), list)
        and all(
            isinstance(port, int)
            and not isinstance(port, bool)
            and port in ports
            for port in evidence["baseline_acquired_ports"]
        )
        and isinstance(evidence.get("prepared_at"), str)
        and bool(evidence.get("prepared_at"))
        and isinstance(evidence.get("completed_at"), str)
        and bool(evidence.get("completed_at"))
        and evidence.get("acquisition_restored") is True
        and evidence.get("wal_cleared") is True
    )


def all_session_groups(session: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        group
        for collection_name in ("groups", "completed_groups")
        for group in (
            session.get(collection_name)
            if isinstance(session.get(collection_name), list)
            else []
        )
        if isinstance(group, dict)
    ]


def validate_final_session(
    runtime: dict[str, Any],
    session_id: str,
    plan_revision: int,
    plan_groups: dict[str, dict[str, Any]],
    group_ids: list[str],
) -> tuple[dict[str, Any], int]:
    stage = "final traffic evidence"
    if runtime.get("mutation_intent") is not None:
        raise AcceptanceError(stage, "traffic runtime still has a pending mutation intent", runtime)
    session = require_object(
        runtime.get("session"), stage, "traffic runtime did not include the exact session"
    )
    if session.get("id") != session_id:
        raise AcceptanceError(
            stage,
            "traffic runtime belongs to a different session",
            {"expected": session_id, "observed": session.get("id")},
        )
    revision = require_positive_revision(session.get("revision"), stage)
    if session.get("evidence_version") != 1:
        raise AcceptanceError(stage, "session evidence_version is not 1", session)
    if session.get("state") != "stopped":
        raise AcceptanceError(stage, "session is not stopped", session)
    mutations = session.get("mutation_evidence")
    if not isinstance(mutations, list):
        raise AcceptanceError(stage, "session mutation evidence is missing", session)
    mutation_by_nonce = {
        evidence.get("intent_nonce"): evidence
        for evidence in mutations
        if isinstance(evidence, dict) and isinstance(evidence.get("intent_nonce"), str)
    }
    if not mutations or not isinstance(mutations[0], dict) or not (
        mutations[0].get("operation") == "start"
        and mutations[0].get("intent_nonce") == session_id
    ):
        raise AcceptanceError(
            stage,
            "session does not begin with exact start evidence matching its id",
            session,
        )
    groups = all_session_groups(session)
    by_id: dict[str, dict[str, Any]] = {}
    duplicate_ids: set[str] = set()
    for group in groups:
        group_id = group.get("group_id")
        if not isinstance(group_id, str):
            continue
        if group_id in by_id:
            duplicate_ids.add(group_id)
        by_id[group_id] = group
    if duplicate_ids or set(by_id) != set(group_ids):
        raise AcceptanceError(
            stage,
            "session groups do not exactly match the selected three-pair plan",
            {"expected": group_ids, "observed": sorted(by_id), "duplicates": sorted(duplicate_ids)},
        )
    problems: list[str] = []
    for group_id in group_ids:
        group = by_id[group_id]
        expected_ports = plan_groups[group_id]["ports"]
        run_id = group.get("run_id")
        start_evidence = group.get("start_evidence")
        cleanup = group.get("cleanup_evidence")
        expected_start_fields = {
            "source": "plan",
            "plan_revision": plan_revision,
            "ports": expected_ports,
            "start_multiplier": plan_groups[group_id].get("multiplier"),
            "multiplier": plan_groups[group_id].get("multiplier"),
            "duration": plan_groups[group_id].get("duration"),
            "start_force": plan_groups[group_id].get("force"),
            "start_total": plan_groups[group_id].get("total"),
            "start_synchronized": plan_groups[group_id].get("synchronized"),
            "start_clear_existing": plan_groups[group_id].get("clear_existing"),
        }
        for field, expected in expected_start_fields.items():
            if group.get(field) != expected:
                problems.append(f"{group_id} {field} does not match the plan")
        if not profile_path_matches(
            str(plan_groups[group_id].get("profile_path")),
            group.get("profile_path"),
        ):
            problems.append(f"{group_id} profile_path does not match the plan")
        profile_sha256 = group.get("profile_sha256")
        if not (
            isinstance(profile_sha256, str)
            and len(profile_sha256) == 64
            and all(character in "0123456789abcdef" for character in profile_sha256)
        ):
            problems.append(f"{group_id} profile digest is missing")
        if any(
            group.get(field) is None
            for field in (
                "start_force",
                "start_total",
                "start_synchronized",
                "start_clear_existing",
                "started_at",
                "ended_at",
            )
        ):
            problems.append(f"{group_id} start/stop fields are incomplete")
        if group.get("hard_stop_at") is not None:
            problems.append(f"{group_id} hard-stop lease was not cleared")
        if not isinstance(run_id, str) or not evidence_is_complete(
            start_evidence, operation="start", ports=expected_ports, nonce=run_id
        ):
            problems.append(f"{group_id} start evidence is incomplete")
        elif mutation_by_nonce.get(run_id) != start_evidence:
            problems.append(f"{group_id} start evidence is not canonical")
        if not (
            group.get("state") == "stopped"
            and {
                int(port): state
                for port, state in (group.get("port_states") or {}).items()
            }
            == {port: "stopped" for port in expected_ports}
            and isinstance(cleanup, dict)
            and cleanup.get("completion") == "operator_stop"
            and cleanup.get("completion") != "observed"
            and cleanup.get("completed_at") == group.get("ended_at")
            and isinstance(cleanup.get("intent_nonce"), str)
            and cleanup.get("acquisition_restored") is True
            and cleanup.get("wal_cleared") is True
            and {
                int(port): state
                for port, state in (cleanup.get("final_port_states") or {}).items()
            }
            == {port: "stopped" for port in expected_ports}
        ):
            problems.append(f"{group_id} cleanup evidence is incomplete or observed")
        else:
            stop_evidence = mutation_by_nonce.get(cleanup["intent_nonce"])
            if not evidence_is_complete(
                stop_evidence,
                operation="stop",
                ports=sorted(port for item in plan_groups.values() for port in item["ports"]),
                nonce=cleanup["intent_nonce"],
            ):
                problems.append(f"{group_id} cleanup mutation evidence is incomplete")
            elif stop_evidence.get("completion_mode") == "hard_stop":
                problems.append(f"{group_id} cleanup was completed by hard-stop")
            elif stop_evidence.get("completed_at") != cleanup.get("completed_at"):
                problems.append(f"{group_id} cleanup completion timestamp changed")
    group_start_nonces = {
        group.get("run_id") for group in by_id.values() if isinstance(group.get("run_id"), str)
    }
    mutation_start_nonces = {
        evidence.get("intent_nonce")
        for evidence in mutations
        if isinstance(evidence, dict) and evidence.get("operation") == "start"
    }
    if group_start_nonces != mutation_start_nonces:
        problems.append("session start mutations do not exactly match the three plan groups")
    stop_mutations = [
        evidence
        for evidence in mutations
        if isinstance(evidence, dict) and evidence.get("operation") == "stop"
    ]
    if (
        len(stop_mutations) != 1
        or sorted(stop_mutations[0].get("ports") or [])
        != sorted(port for item in plan_groups.values() for port in item["ports"])
        or len(mutations) != len(group_ids) + 1
    ):
        problems.append(
            "session did not contain exactly three starts and one P0-P5 operator stop"
        )
    if problems:
        raise AcceptanceError(stage, "; ".join(problems), session)
    return session, revision


def cleanup_run(args: argparse.Namespace, run: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    attempts = run.get("group_start_attempts")
    recovery_required = (
        not isinstance(run.get("traffic_session_id"), str)
        or not isinstance(run.get("started_ports"), list)
        or not run.get("started_ports")
        or (
            isinstance(attempts, list)
            and any(
                isinstance(attempt, dict)
                and attempt.get("status") not in {"started", "stopped"}
                for attempt in attempts
            )
        )
    )
    recovery_succeeded = True
    if recovery_required:
        recovery_succeeded = recover_six_port_session_for_cleanup(args, run)
    session_id = run.get("traffic_session_id")
    ports = run.get("started_ports")
    if recovery_required and not recovery_succeeded:
        run["cleanup_operator_stop_withheld"] = {
            "reason": (
                "exact runtime authority/session recovery failed; durable "
                "hard-stop leases retain finite cleanup ownership"
            ),
            "stale_session_id": session_id,
            "stale_ports": ports,
        }
    elif isinstance(session_id, str) and isinstance(ports, list) and ports:
        try:
            result = require_ok(
                "six-port cleanup stop",
                request_json(
                    args.base_url,
                    "POST",
                    "/api/trex/traffic/stop",
                    {
                        "ports": sorted(set(ports)),
                        "confirmation": "stop",
                        "expected_session_id": session_id,
                    },
                    args.timeout,
                ),
            )
            observed = read_path(result, "data.session.id")
            if observed != session_id:
                raise AcceptanceError(
                    "six-port cleanup stop",
                    "cleanup response belongs to a different session",
                    {"expected": session_id, "observed": observed, "response": result},
                )
            run["cleanup_stop"] = {
                "ports": sorted(set(ports)),
                "session_id": observed,
                "session_revision": read_path(result, "data.session.revision"),
            }
        except AcceptanceError as exc:
            errors.append(exc.to_record())
    try:
        run["cleanup_capture"] = require_ok(
            "six-port cleanup capture",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/capture/remove-all",
                {},
                args.timeout,
            ),
        )
    except AcceptanceError as exc:
        errors.append(exc.to_record())
    run["cleanup_errors"] = errors
    return errors


def validate_final_cleanup(
    args: argparse.Namespace, run: dict[str, Any], ports: list[int]
) -> dict[str, Any]:
    port_payload = request_json(
        args.base_url, "GET", "/api/trex/ports", None, args.timeout
    )
    live_boundary = validate_ports_idle_and_up(
        port_payload, ports, "ports after cleanup"
    )
    capture_payload = require_ok(
        "capture status after cleanup",
        request_json(
            args.base_url, "GET", "/api/trex/capture/status", None, args.timeout
        ),
    )
    recorders = capture_recorder_count(capture_payload)
    if recorders != 0:
        raise AcceptanceError(
            "capture status after cleanup",
            "capture recorders are still active",
            capture_payload,
        )
    summary = {
        "exact_inventory": live_boundary["exact_inventory"],
        "port_ids": live_boundary["port_ids"],
        "ports_idle": live_boundary["ports_idle"],
        "links_up": live_boundary["links_up"],
        "ports_unowned": live_boundary["ports_unowned"],
        "acquired_ports_after_stop": live_boundary["acquired_ports"],
        "capture_recorders": recorders,
    }
    run["postconditions"] = summary
    return summary


def report_markdown(run: dict[str, Any]) -> str:
    growth = run.get("packet_growth") if isinstance(run.get("packet_growth"), dict) else {}
    rows = [
        "# TRex Six-Port Qualification",
        "",
        f"- Verdict: **{str(run.get('verdict') or 'fail').upper()}**",
        f"- Run: `{run.get('run_id') or '-'}`",
        f"- Plan revision: `{run.get('plan_revision', '-')}`",
        f"- Session: `{run.get('traffic_session_id') or '-'}`",
        "",
        "## Per-port packet growth",
        "",
        "| Port | TX packets | RX packets |",
        "| ---: | ---: | ---: |",
    ]
    for port in sorted(int(key) for key in growth):
        counters = growth.get(str(port), growth.get(port, {}))
        rows.append(
            f"| P{port} | {counters.get('opackets', 0)} | {counters.get('ipackets', 0)} |"
        )
    if run.get("failure"):
        rows.extend(
            ["", "## Failure", "", "```json", json.dumps(run["failure"], indent=2, sort_keys=True), "```"]
        )
    return "\n".join(rows) + "\n"


def report_payload(run: dict[str, Any]) -> dict[str, Any]:
    payload = sanitize_report_payload(run)
    if not isinstance(payload, dict):
        raise AcceptanceError("report", "sanitized report payload is not an object")
    return {
        key: value
        for key, value in payload.items()
        if key not in RESERVED_REPORT_PAYLOAD_KEYS
        and key not in {"report_save", "report_download", "local_report"}
    }


def build_report_archive(run: dict[str, Any]) -> dict[str, Any]:
    timestamp = clean_file_timestamp(str(run.get("started_at") or utc_now()))
    return {
        "title": f"TRex Six-Port Qualification {run['run_id']}",
        "markdown": report_markdown(run),
        "payload": report_payload(run),
        "file_name": f"{run['report_prefix']}-{timestamp}-{run['run_id']}.json",
    }


def verify_downloaded_report(
    content: str,
    binding: dict[str, Any] | None,
    canonical_session: dict[str, Any] | None,
    plan_revision: int | None,
    plan_groups: dict[str, dict[str, Any]] | None,
    group_ids: list[str],
) -> None:
    try:
        document = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AcceptanceError("report download", "downloaded report is not JSON", str(exc)) from exc
    payload = document.get("payload") if isinstance(document, dict) else None
    if not isinstance(payload, dict):
        raise AcceptanceError("report download", "downloaded report has no object payload", document)
    if binding is None:
        leaked = sorted(RESERVED_REPORT_PAYLOAD_KEYS.intersection(payload))
        if leaked:
            raise AcceptanceError(
                "report download",
                "unbound report contains backend-owned reserved fields",
                leaked,
            )
        return
    persisted_binding = payload.get("traffic_session_binding")
    persisted_session = payload.get("traffic_session")
    if persisted_binding != binding:
        raise AcceptanceError(
            "report download",
            "backend traffic session binding does not match the save CAS",
            {"expected": binding, "observed": persisted_binding},
        )
    if not isinstance(persisted_session, dict) or persisted_session != canonical_session:
        raise AcceptanceError(
            "report download",
            "backend did not inject the canonical traffic session",
            {"expected": canonical_session, "observed": persisted_session},
        )
    if plan_revision is None or plan_groups is None:
        raise AcceptanceError("report download", "canonical session verification context is missing")
    validate_final_session(
        {"session": persisted_session, "mutation_intent": None},
        str(binding["id"]),
        plan_revision,
        plan_groups,
        group_ids,
    )


def save_and_download_report(
    args: argparse.Namespace,
    run: dict[str, Any],
    *,
    binding: dict[str, Any] | None,
    canonical_session: dict[str, Any] | None,
    plan_revision: int | None,
    plan_groups: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    archive = build_report_archive(run)
    request = dict(archive)
    if binding is not None:
        request["traffic_session_id"] = binding["id"]
        request["traffic_session_revision"] = binding["revision"]
    if RESERVED_REPORT_PAYLOAD_KEYS.intersection(request["payload"]):
        raise AcceptanceError("report save", "client payload contains reserved session fields")
    saved = require_ok(
        "report save",
        request_json(
            args.base_url,
            "POST",
            "/api/trex/reports/save",
            request,
            args.timeout,
        ),
    )
    saved_name = read_path(saved, "data.file.name")
    if not isinstance(saved_name, str) or not saved_name:
        saved_name = archive["file_name"]
    downloaded = require_ok(
        "report download",
        request_json(
            args.base_url,
            "POST",
            "/api/trex/reports/download",
            {"file_name": saved_name},
            args.timeout,
        ),
    )
    content = read_path(downloaded, "data.file.content")
    if not isinstance(content, str):
        raise AcceptanceError("report download", "downloaded report has no text content", downloaded)
    verify_downloaded_report(
        content,
        binding,
        canonical_session,
        plan_revision,
        plan_groups,
        args.group_ids,
    )
    local_path = write_local_report(Path(args.output_dir), saved_name, content)
    run["report_save"] = saved
    run["report_download"] = {"file_name": saved_name}
    run["local_report"] = str(local_path)
    return {"saved_name": saved_name, "local_path": str(local_path)}


def run_gate(args: argparse.Namespace) -> dict[str, Any]:
    # Reject an unsafe derived lease before the first API or hardware write.
    hard_stop_windows = six_port_hard_stop_windows(args)
    gate_id = str(uuid.uuid4())
    run: dict[str, Any] = {
        "workflow": "six-port-e2e",
        "run_id": gate_id,
        "report_prefix": args.report_prefix,
        "started_at": utc_now(),
        "ended_at": None,
        "verdict": "fail",
        "group_ids": list(args.group_ids),
        "target_ports": target_ports(args.group_ids),
        "started_ports": [],
        "traffic_session_id": None,
        "group_start_attempts": [],
        "group_hard_stop_at": {},
        "hard_stop_windows_seconds": hard_stop_windows,
    }
    failure: AcceptanceError | None = None
    plan_revision: int | None = None
    plan_groups: dict[str, dict[str, Any]] | None = None
    canonical_session: dict[str, Any] | None = None
    binding: dict[str, Any] | None = None

    try:
        run["evidence_identity"] = collect_current_identity(gate_id)
        initial_runtime_payload = request_json(
            args.base_url, "GET", "/api/trex/traffic/runtime", None, args.timeout
        )
        initial_runtime = runtime_data(initial_runtime_payload, "initial traffic runtime")
        run["initial_runtime"] = sanitize_report_payload(initial_runtime_payload)
        if initial_runtime.get("mutation_intent") is not None:
            raise AcceptanceError(
                "initial traffic runtime", "traffic mutation is already pending", initial_runtime
            )
        run["initial_runtime_boundary"] = validate_runtime_ports_stopped(
            initial_runtime, run["target_ports"], "initial traffic runtime"
        )
        plan_revision, plan_groups = validate_plan(initial_runtime, args.group_ids)
        run["plan_revision"] = plan_revision
        run["plan_groups"] = {
            group_id: {
                "ports": group["ports"],
                "profile_path": group["profile_path"],
                "multiplier": group["multiplier"],
                "duration": group.get("duration"),
                "force": group.get("force"),
                "total": group.get("total"),
                "synchronized": group.get("synchronized"),
                "clear_existing": group.get("clear_existing"),
            }
            for group_id, group in plan_groups.items()
        }
        initial_ports = request_json(
            args.base_url, "GET", "/api/trex/ports", None, args.timeout
        )
        run["initial_port_boundary"] = validate_ports_idle_and_up(
            initial_ports, run["target_ports"], "initial six-port inventory"
        )
        run["initial_ports"] = sanitize_report_payload(initial_ports)
        run["stats_clear"] = require_ok(
            "six-port stats clear",
            request_json(
                args.base_url,
                "POST",
                "/api/trex/stats/clear",
                {"ports": run["target_ports"]},
                args.timeout,
            ),
        )
        baseline_payload = request_json(
            args.base_url, "GET", "/api/trex/stats", None, args.timeout
        )
        baseline = port_counter_snapshot(
            baseline_payload, run["target_ports"], "six-port stats baseline"
        )
        run["stats_baseline"] = {
            str(port): counters for port, counters in baseline.items()
        }
        session_id = start_plan_groups(
            args, run, plan_revision, plan_groups, initial_runtime
        )
        run["traffic_session_id"] = session_id
        samples, growth = wait_for_six_port_packets(
            args, baseline, run["target_ports"]
        )
        run["stats_samples"] = samples
        run["packet_growth"] = {
            str(port): counters for port, counters in growth.items()
        }
    except AcceptanceError as exc:
        failure = exc
    except Exception as exc:  # pragma: no cover - defensive report preservation
        failure = AcceptanceError("six-port gate", str(exc))
    finally:
        cleanup_errors = cleanup_run(args, run)
        if failure is None and cleanup_errors:
            first = cleanup_errors[0]
            failure = AcceptanceError(
                str(first.get("stage") or "six-port cleanup"),
                str(first.get("message") or "cleanup failed"),
                first.get("payload"),
            )

    try:
        validate_final_cleanup(args, run, run["target_ports"])
        final_runtime_payload = request_json(
            args.base_url, "GET", "/api/trex/traffic/runtime", None, args.timeout
        )
        final_runtime = runtime_data(final_runtime_payload, "final traffic runtime")
        run["final_runtime"] = sanitize_report_payload(final_runtime_payload)
        runtime_boundary = validate_runtime_ports_stopped(
            final_runtime, run["target_ports"], "final traffic runtime"
        )
        run["postconditions"].update(runtime_boundary)
        if failure is None:
            if plan_revision is None or plan_groups is None:
                raise AcceptanceError("final traffic evidence", "plan context is missing")
            session_id = require_nonempty_text(
                run.get("traffic_session_id"), "final traffic evidence", "session id"
            )
            canonical_session, revision = validate_final_session(
                final_runtime,
                session_id,
                plan_revision,
                plan_groups,
                args.group_ids,
            )
            binding = {
                "id": session_id,
                "revision": revision,
                "evidence_version": 1,
            }
            run["session_binding"] = binding
    except AcceptanceError as exc:
        if failure is None:
            failure = exc
        else:
            run["postcondition_failure"] = exc.to_record()
    except Exception as exc:  # pragma: no cover - defensive report preservation
        if failure is None:
            failure = AcceptanceError("six-port postconditions", str(exc))
        else:
            run["postcondition_failure"] = AcceptanceError(
                "six-port postconditions", str(exc)
            ).to_record()

    run["ended_at"] = utc_now()
    if failure is None:
        run["verdict"] = "pass"
    else:
        run["failure"] = failure.to_record()
        binding = None
        canonical_session = None

    try:
        save_and_download_report(
            args,
            run,
            binding=binding,
            canonical_session=canonical_session,
            plan_revision=plan_revision,
            plan_groups=plan_groups,
        )
    except AcceptanceError as exc:
        if run["verdict"] == "pass":
            run["verdict"] = "fail"
            run["failure"] = exc.to_record()
            run["ended_at"] = utc_now()
            try:
                save_and_download_report(
                    args,
                    run,
                    binding=None,
                    canonical_session=None,
                    plan_revision=plan_revision,
                    plan_groups=plan_groups,
                )
            except AcceptanceError as retry_exc:
                run["report_failure"] = retry_exc.to_record()
                fallback = build_report_archive(run)
                run["local_report"] = str(
                    write_local_report(
                        Path(args.output_dir),
                        str(fallback["file_name"]),
                        json.dumps(fallback, indent=2, sort_keys=True) + "\n",
                    )
                )
        else:
            run["report_failure"] = exc.to_record()
            fallback = build_report_archive(run)
            run["local_report"] = str(
                write_local_report(
                    Path(args.output_dir),
                    str(fallback["file_name"]),
                    json.dumps(fallback, indent=2, sort_keys=True) + "\n",
                )
            )
    return run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Qualify the configured three-pair, six-port TRex plan with per-port "
            "packet evidence, durable runtime evidence, cleanup, and report CAS."
        )
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--report-prefix", default=DEFAULT_REPORT_PREFIX)
    parser.add_argument("--timeout", type=float, default=DEFAULT_HTTP_TIMEOUT_SECONDS)
    parser.add_argument(
        "--poll-interval",
        "--poll",
        dest="poll_interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL_SECONDS,
    )
    parser.add_argument(
        "--stats-timeout", type=float, default=DEFAULT_STATS_TIMEOUT_SECONDS
    )
    parser.add_argument(
        "--group-ids",
        nargs="+",
        default=list(DEFAULT_GROUP_IDS),
        metavar="GROUP",
        help="Exactly three plan group ids, mapped in order to [0,1], [2,3], [4,5]",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.timeout <= 0 or args.poll_interval < 0 or args.stats_timeout <= 0:
        print("timeout values must be positive (poll interval may be zero)", file=sys.stderr)
        return 2
    try:
        target_ports(args.group_ids)
    except AcceptanceError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    run = run_gate(args)
    print(
        json.dumps(
            {
                "workflow": run.get("workflow"),
                "verdict": run.get("verdict"),
                "run_id": run.get("run_id"),
                "traffic_session_id": run.get("traffic_session_id"),
                "session_revision": read_path(run, "session_binding.revision"),
                "local_report": run.get("local_report"),
                "failure": run.get("failure"),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if run.get("verdict") == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
