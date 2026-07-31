#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from trex_real_acceptance import (
    AcceptanceError,
    clean_file_timestamp,
    ensure_report_archive_has_no_binary_payloads,
    report_archive_payload,
    request_json,
    require_ok,
    sanitize_report_payload,
    utc_now,
    write_local_report,
)


DEFAULT_BASE_URL = "http://127.0.0.1"
DEFAULT_GROUP_ID = "pair-0"
DEFAULT_SERVICE = "trex-webui-api.service"
DEFAULT_OUTPUT_DIR = ".logs"
DEFAULT_REPORT_PREFIX = "api-restart-e2e"
DEFAULT_HTTP_TIMEOUT_SECONDS = 15.0
DEFAULT_RESTART_TIMEOUT_SECONDS = 45.0
DEFAULT_POLL_INTERVAL_SECONDS = 0.25
DEFAULT_HARD_STOP_WINDOW_SECONDS = 120.0
WORKFLOW = "api-restart-e2e"
SERVICE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.@:-]+$")
RESTART_POLICIES = frozenset(
    {"always", "on-abnormal", "on-abort", "on-failure", "on-watchdog"}
)
SYSTEMD_PROPERTIES = (
    "ActiveState",
    "SubState",
    "MainPID",
    "InvocationID",
    "ExecMainStartTimestampMonotonic",
    "NRestarts",
    "Restart",
)


@dataclass(frozen=True)
class ServiceProcessIdentity:
    service: str
    boot_id: str
    main_pid: int
    invocation_id: str
    start_monotonic_us: int
    restart_count: int
    restart_policy: str
    active_state: str
    sub_state: str

    def to_record(self) -> dict[str, Any]:
        return asdict(self)

    @property
    def process_identity(self) -> str:
        return ":".join(
            [
                self.boot_id,
                self.invocation_id,
                str(self.start_monotonic_us),
                str(self.main_pid),
            ]
        )


ApiRequest = Callable[[str, str, str, dict[str, Any] | None, float], dict[str, Any]]
IdentityReader = Callable[[str], ServiceProcessIdentity]
ProcessKiller = Callable[[int], None]


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def hard_stop_timestamp(window_seconds: float) -> str:
    if window_seconds <= 0 or window_seconds > 300:
        raise AcceptanceError(
            "arguments",
            "hard-stop window must be greater than 0 and no more than 300 seconds",
            window_seconds,
        )
    deadline = datetime.now(timezone.utc) + timedelta(seconds=window_seconds)
    return deadline.isoformat().replace("+00:00", "Z")


def require_object(value: Any, stage: str, message: str) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    raise AcceptanceError(stage, message, value)


def require_text(value: Any, stage: str, label: str) -> str:
    if isinstance(value, str) and value.strip():
        return value
    raise AcceptanceError(stage, f"{label} was missing", value)


def require_positive_revision(value: Any, stage: str) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    raise AcceptanceError(stage, "session revision was not a positive integer", value)


def require_plan_revision(value: Any, stage: str) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    raise AcceptanceError(stage, "plan revision was not a non-negative integer", value)


def parse_nonnegative_integer(value: str | None, *, stage: str, label: str) -> int:
    if not isinstance(value, str) or not value.isascii() or not value.isdigit():
        raise AcceptanceError(stage, f"systemd {label} was invalid", value)
    parsed = int(value)
    if parsed < 0:
        raise AcceptanceError(stage, f"systemd {label} was negative", value)
    return parsed


def normalize_service_name(value: str) -> str:
    service = value.strip()
    if not service or not SERVICE_NAME_PATTERN.fullmatch(service):
        raise AcceptanceError(
            "systemd preflight",
            "service name contains unsupported characters",
            value,
        )
    return service if service.endswith(".service") else f"{service}.service"


def read_service_identity(
    service: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] | None = None,
    boot_id_path: Path = Path("/proc/sys/kernel/random/boot_id"),
) -> ServiceProcessIdentity:
    service = normalize_service_name(service)
    execute = runner or subprocess.run
    command = [
        "systemctl",
        "show",
        "--no-pager",
        *[f"--property={name}" for name in SYSTEMD_PROPERTIES],
        "--",
        service,
    ]
    try:
        result = execute(
            command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as exc:
        raise AcceptanceError("systemd identity", str(exc)) from exc
    if result.returncode != 0:
        raise AcceptanceError(
            "systemd identity",
            f"systemctl show failed for {service}",
            result.stderr.strip(),
        )
    properties: dict[str, str] = {}
    for line in result.stdout.splitlines():
        name, separator, value = line.partition("=")
        if separator:
            properties[name] = value
    missing = sorted(name for name in SYSTEMD_PROPERTIES if name not in properties)
    if missing:
        raise AcceptanceError(
            "systemd identity",
            "systemctl show omitted required properties",
            missing,
        )
    try:
        boot_id = boot_id_path.read_text(encoding="ascii").strip()
    except OSError as exc:
        raise AcceptanceError("systemd identity", f"cannot read boot id: {exc}") from exc
    if not boot_id:
        raise AcceptanceError("systemd identity", "kernel boot id was empty")
    main_pid = parse_nonnegative_integer(
        properties.get("MainPID"), stage="systemd identity", label="MainPID"
    )
    start_monotonic_us = parse_nonnegative_integer(
        properties.get("ExecMainStartTimestampMonotonic"),
        stage="systemd identity",
        label="ExecMainStartTimestampMonotonic",
    )
    restart_count = parse_nonnegative_integer(
        properties.get("NRestarts"), stage="systemd identity", label="NRestarts"
    )
    return ServiceProcessIdentity(
        service=service,
        boot_id=boot_id,
        main_pid=main_pid,
        invocation_id=properties["InvocationID"].strip(),
        start_monotonic_us=start_monotonic_us,
        restart_count=restart_count,
        restart_policy=properties["Restart"].strip(),
        active_state=properties["ActiveState"].strip(),
        sub_state=properties["SubState"].strip(),
    )


def validate_service_preflight(identity: ServiceProcessIdentity) -> None:
    failures: dict[str, Any] = {}
    if identity.active_state != "active" or identity.sub_state != "running":
        failures["state"] = {
            "active": identity.active_state,
            "sub": identity.sub_state,
        }
    if identity.main_pid <= 1:
        failures["main_pid"] = identity.main_pid
    if not identity.invocation_id:
        failures["invocation_id"] = identity.invocation_id
    if identity.start_monotonic_us <= 0:
        failures["start_monotonic_us"] = identity.start_monotonic_us
    if identity.restart_policy not in RESTART_POLICIES:
        failures["restart_policy"] = identity.restart_policy
    if failures:
        raise AcceptanceError(
            "systemd preflight",
            "API service is not an active auto-restarting systemd process",
            failures,
        )


def service_restart_mismatches(
    before: ServiceProcessIdentity,
    after: ServiceProcessIdentity,
) -> dict[str, Any]:
    mismatches: dict[str, Any] = {}
    if after.service != before.service:
        mismatches["service"] = {"before": before.service, "after": after.service}
    if after.boot_id != before.boot_id:
        mismatches["boot_id"] = {"before": before.boot_id, "after": after.boot_id}
    if after.active_state != "active" or after.sub_state != "running":
        mismatches["state"] = {
            "active": after.active_state,
            "sub": after.sub_state,
        }
    if after.main_pid <= 1 or after.main_pid == before.main_pid:
        mismatches["main_pid"] = {"before": before.main_pid, "after": after.main_pid}
    if not after.invocation_id or after.invocation_id == before.invocation_id:
        mismatches["invocation_id"] = {
            "before": before.invocation_id,
            "after": after.invocation_id,
        }
    if (
        after.start_monotonic_us <= before.start_monotonic_us
        or after.process_identity == before.process_identity
    ):
        mismatches["process_identity"] = {
            "before": before.process_identity,
            "after": after.process_identity,
        }
    if after.restart_count <= before.restart_count:
        mismatches["restart_count"] = {
            "before": before.restart_count,
            "after": after.restart_count,
        }
    if after.restart_policy not in RESTART_POLICIES:
        mismatches["restart_policy"] = after.restart_policy
    return mismatches


def kill_main_process(main_pid: int) -> None:
    if main_pid <= 1 or main_pid == os.getpid():
        raise AcceptanceError(
            "API SIGKILL",
            "refusing to signal an unsafe MainPID",
            main_pid,
        )
    try:
        os.kill(main_pid, signal.SIGKILL)
    except OSError as exc:
        raise AcceptanceError(
            "API SIGKILL",
            f"failed to SIGKILL MainPID {main_pid}: {exc}",
        ) from exc


def wait_for_service_restart(
    *,
    base_url: str,
    service: str,
    before: ServiceProcessIdentity,
    timeout: float,
    poll_interval: float,
    http_timeout: float,
    api_request: ApiRequest | None = None,
    identity_reader: IdentityReader | None = None,
    monotonic: Callable[[], float] | None = None,
    sleeper: Callable[[float], None] | None = None,
) -> tuple[ServiceProcessIdentity, dict[str, Any]]:
    request = api_request or request_json
    read_identity = identity_reader or read_service_identity
    clock = monotonic or time.monotonic
    sleep = sleeper or time.sleep
    deadline = clock() + max(0.0, timeout)
    last_identity: ServiceProcessIdentity | None = None
    last_error: dict[str, Any] | str | None = None
    while True:
        try:
            candidate = read_identity(service)
            last_identity = candidate
            mismatches = service_restart_mismatches(before, candidate)
            if not mismatches:
                try:
                    health = request(base_url, "GET", "/api/health", None, http_timeout)
                    if health.get("status") == "ok":
                        return candidate, health
                    last_error = {"health": health}
                except AcceptanceError as exc:
                    last_error = exc.to_record()
            else:
                last_error = {"identity_mismatches": mismatches}
        except AcceptanceError as exc:
            last_error = exc.to_record()
        if clock() >= deadline:
            raise AcceptanceError(
                "systemd restart",
                "API service did not return with a distinct healthy process identity",
                {
                    "before": before.to_record(),
                    "last_identity": (
                        last_identity.to_record() if last_identity is not None else None
                    ),
                    "last_error": last_error,
                },
            )
        sleep(max(0.0, poll_interval))


def runtime_snapshot(payload: dict[str, Any], stage: str) -> dict[str, Any]:
    result = require_ok(stage, payload)
    return require_object(
        result.get("data"), stage, "traffic runtime did not include a snapshot"
    )


def selected_plan_group(runtime: dict[str, Any], group_id: str) -> dict[str, Any]:
    groups = runtime.get("groups")
    if not isinstance(groups, list):
        raise AcceptanceError("runtime preflight", "traffic plan groups were missing", runtime)
    matches = [group for group in groups if isinstance(group, dict) and group.get("id") == group_id]
    if len(matches) != 1:
        raise AcceptanceError(
            "runtime preflight",
            "selected plan group was not present exactly once",
            {"group_id": group_id, "matches": matches},
        )
    group = matches[0]
    ports = group.get("ports")
    if (
        not isinstance(ports, list)
        or not ports
        or any(not isinstance(port, int) or isinstance(port, bool) or port < 0 for port in ports)
        or len(set(ports)) != len(ports)
    ):
        raise AcceptanceError(
            "runtime preflight", "selected plan group had invalid ports", group
        )
    require_text(group.get("profile_path"), "runtime preflight", "profile path")
    require_text(group.get("multiplier"), "runtime preflight", "multiplier")
    return group


def validate_runtime_idle(
    runtime: dict[str, Any],
    *,
    target_ports: list[int],
) -> None:
    if runtime.get("mutation_intent") is not None:
        raise AcceptanceError(
            "runtime preflight", "traffic mutation intent was pending", runtime
        )
    if runtime.get("live_state_sampled") is not True:
        raise AcceptanceError(
            "runtime preflight", "traffic runtime did not sample live port state", runtime
        )
    available = runtime.get("available_ports")
    if not isinstance(available, list) or not set(target_ports).issubset(set(available)):
        raise AcceptanceError(
            "runtime preflight",
            "selected plan ports were not available",
            {"target_ports": target_ports, "available_ports": available},
        )
    records = runtime.get("port_states")
    by_port = {
        record.get("port"): record
        for record in records
        if isinstance(record, dict) and isinstance(record.get("port"), int)
    } if isinstance(records, list) else {}
    invalid = {
        port: by_port.get(port)
        for port in target_ports
        if not isinstance(by_port.get(port), dict)
        or by_port[port].get("state") != "stopped"
        or by_port[port].get("ownership") != "none"
    }
    if invalid:
        raise AcceptanceError(
            "runtime preflight", "selected plan ports were not idle and unowned", invalid
        )


def live_port_records(payload: dict[str, Any], stage: str) -> dict[int, dict[str, Any]]:
    result = require_ok(stage, payload)
    data = require_object(result.get("data"), stage, "ports response had no data")
    records = data.get("ports")
    if not isinstance(records, list):
        raise AcceptanceError(stage, "ports response had no port records", data)
    return {
        record["id"]: record
        for record in records
        if isinstance(record, dict)
        and isinstance(record.get("id"), int)
        and not isinstance(record.get("id"), bool)
    }


def validate_live_ports(
    payload: dict[str, Any],
    *,
    target_ports: list[int],
    expected_active: bool,
    stage: str,
) -> dict[str, Any]:
    records = live_port_records(payload, stage)
    failures: dict[int, Any] = {}
    acquired_ports: list[int] = []
    owned_ports: dict[int, Any] = {}
    for port in target_ports:
        record = records.get(port)
        info = record.get("info") if isinstance(record, dict) else None
        status = info.get("status") if isinstance(info, dict) else None
        link = info.get("link") if isinstance(info, dict) else None
        normalized_status = status.strip().upper() if isinstance(status, str) else ""
        normalized_link = link.strip().upper() if isinstance(link, str) else ""
        valid_status = (
            normalized_status not in {"", "IDLE", "DOWN"}
            if expected_active
            else normalized_status == "IDLE"
        )
        ownership_valid = True
        if not expected_active:
            if not isinstance(record, dict) or record.get("acquired") is not False:
                acquired_ports.append(port)
                ownership_valid = False
            if not isinstance(info, dict) or "owner" not in info:
                owned_ports[port] = "missing"
                ownership_valid = False
            else:
                owner = info["owner"]
                if owner is not None and (
                    not isinstance(owner, str) or bool(owner.strip())
                ):
                    owned_ports[port] = owner
                    ownership_valid = False
        if normalized_link != "UP" or not valid_status or not ownership_valid:
            failures[port] = record
    if failures:
        state = (
            "active with link up"
            if expected_active
            else "idle with link up, explicitly unacquired, and unowned"
        )
        raise AcceptanceError(stage, f"selected ports were not {state}", failures)
    return {
        "target_ports": list(target_ports),
        "ports_idle": not expected_active,
        "links_up": True,
        "ports_unowned": True if not expected_active else None,
        "acquired_ports": acquired_ports,
        "owned_ports": owned_ports,
    }


def all_session_groups(session: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        group
        for key in ("groups", "completed_groups")
        for group in (
            session.get(key) if isinstance(session.get(key), list) else []
        )
        if isinstance(group, dict)
    ]


def exact_session_group(
    session: dict[str, Any],
    *,
    group_id: str,
    run_id: str | None = None,
    stage: str = "traffic evidence",
) -> dict[str, Any]:
    matches = [
        group
        for group in all_session_groups(session)
        if group.get("group_id") == group_id
        and (run_id is None or group.get("run_id") == run_id)
    ]
    if len(matches) != 1:
        raise AcceptanceError(
            stage,
            "canonical session did not contain the exact plan run once",
            {"group_id": group_id, "run_id": run_id, "matches": matches},
        )
    return matches[0]


def validate_mutation_evidence(
    evidence: Any,
    *,
    operation: str,
    ports: list[int],
    nonce: str | None = None,
    completion_mode: str | None = None,
    stage: str,
) -> dict[str, Any]:
    record = require_object(evidence, stage, "mutation evidence was missing")
    failures: dict[str, Any] = {}
    if record.get("operation") != operation:
        failures["operation"] = record.get("operation")
    if nonce is not None and record.get("intent_nonce") != nonce:
        failures["intent_nonce"] = record.get("intent_nonce")
    if sorted(record.get("ports") or []) != sorted(ports):
        failures["ports"] = record.get("ports")
    if completion_mode is not None and record.get("completion_mode") != completion_mode:
        failures["completion_mode"] = record.get("completion_mode")
    desired_states = record.get("desired_port_states")
    expected_state = "running" if operation in {"start", "resume"} else "stopped"
    if not isinstance(desired_states, dict) or {
        str(port): desired_states.get(str(port), desired_states.get(port))
        for port in ports
    } != {str(port): expected_state for port in ports}:
        failures["desired_port_states"] = desired_states
    for name in ("prepared_at", "completed_at"):
        if not isinstance(record.get(name), str) or not record[name]:
            failures[name] = record.get(name)
    if record.get("acquisition_restored") is not True:
        failures["acquisition_restored"] = record.get("acquisition_restored")
    if record.get("wal_cleared") is not True:
        failures["wal_cleared"] = record.get("wal_cleared")
    if not isinstance(record.get("intent_nonce"), str) or not record["intent_nonce"]:
        failures["intent_nonce"] = record.get("intent_nonce")
    if failures:
        raise AcceptanceError(stage, "mutation evidence was incomplete", failures)
    return record


def response_session(payload: dict[str, Any], stage: str) -> dict[str, Any]:
    result = require_ok(stage, payload)
    data = require_object(result.get("data"), stage, "traffic response had no data")
    return require_object(
        data.get("session"), stage, "traffic response had no canonical session"
    )


def validate_started_session(
    session: dict[str, Any],
    *,
    plan_group: dict[str, Any],
    plan_revision: int,
    hard_stop_at: str,
) -> tuple[int, str, dict[str, Any]]:
    stage = "traffic start evidence"
    session_id = require_text(session.get("id"), stage, "session id")
    revision = require_positive_revision(session.get("revision"), stage)
    if session.get("evidence_version") != 1 or session.get("state") != "running":
        raise AcceptanceError(
            stage,
            "started traffic session was not a running v1 evidence session",
            session,
        )
    group = exact_session_group(
        session, group_id=str(plan_group["id"]), stage=stage
    )
    ports = list(plan_group["ports"])
    run_id = require_text(group.get("run_id"), stage, "run id")
    expected_fields = {
        "source": "plan",
        "plan_revision": plan_revision,
        "ports": ports,
        "profile_path": plan_group.get("profile_path"),
        "start_multiplier": plan_group.get("multiplier"),
        "duration": plan_group.get("duration"),
        "hard_stop_at": hard_stop_at,
        "state": "running",
    }
    mismatches = {
        name: {"expected": expected, "observed": group.get(name)}
        for name, expected in expected_fields.items()
        if group.get(name) != expected
    }
    if mismatches:
        raise AcceptanceError(stage, "started plan run did not match the saved plan", mismatches)
    if session_id != run_id:
        raise AcceptanceError(
            stage,
            "first plan run id did not match its new session id",
            {"session_id": session_id, "run_id": run_id},
        )
    start_evidence = validate_mutation_evidence(
        group.get("start_evidence"),
        operation="start",
        ports=ports,
        nonce=run_id,
        completion_mode="direct",
        stage=stage,
    )
    mutations = session.get("mutation_evidence")
    if not isinstance(mutations, list) or mutations != [start_evidence]:
        raise AcceptanceError(
            stage,
            "new session did not contain exactly its canonical start mutation",
            mutations,
        )
    return revision, run_id, group


def require_utc_datetime(value: Any, *, stage: str, label: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise AcceptanceError(stage, f"session {label} was not a UTC timestamp", value)
    normalized = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise AcceptanceError(
            stage, f"session {label} was not a UTC timestamp", value
        ) from exc
    if parsed.utcoffset() is None or parsed.utcoffset() != timedelta(0):
        raise AcceptanceError(stage, f"session {label} was not a UTC timestamp", value)
    return parsed


def read_side_session_mismatches(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    stage: str,
) -> dict[str, Any]:
    before_revision = require_positive_revision(before.get("revision"), stage)
    after_revision = require_positive_revision(after.get("revision"), stage)
    mismatches: dict[str, Any] = {}
    for name in (
        "id",
        "evidence_version",
        "authority",
        "state",
        "started_at",
        "ended_at",
    ):
        if after.get(name) != before.get(name):
            mismatches[name] = {
                "before": before.get(name),
                "after": after.get(name),
            }
    for name in ("groups", "completed_groups", "mutation_evidence"):
        if after.get(name) != before.get(name):
            mismatches[name] = {
                "before_sha256": canonical_digest(before.get(name)),
                "after_sha256": canonical_digest(after.get(name)),
            }
    if after_revision < before_revision:
        mismatches["revision"] = {
            "before": before_revision,
            "after": after_revision,
            "minimum": before_revision,
        }

    before_updated = require_utc_datetime(
        before.get("updated_at"), stage=stage, label="updated_at before read"
    )
    after_updated = require_utc_datetime(
        after.get("updated_at"), stage=stage, label="updated_at after read"
    )
    before_reconciliation = before.get("reconciliation")
    after_reconciliation = after.get("reconciliation")
    if after_revision == before_revision:
        if after.get("updated_at") != before.get("updated_at"):
            mismatches["updated_at"] = {
                "before": before.get("updated_at"),
                "after": after.get("updated_at"),
                "revision": after_revision,
            }
        if after_reconciliation != before_reconciliation:
            mismatches["reconciliation"] = {
                "before": before_reconciliation,
                "after": after_reconciliation,
                "revision": after_revision,
            }
    elif after_revision > before_revision:
        if after_updated < before_updated:
            mismatches["updated_at"] = {
                "before": before.get("updated_at"),
                "after": after.get("updated_at"),
            }
        if (
            not isinstance(after_reconciliation, str)
            or not after_reconciliation.strip()
            or after_reconciliation == before_reconciliation
        ):
            mismatches["reconciliation"] = {
                "before": before_reconciliation,
                "after": after_reconciliation,
                "revision": {
                    "before": before_revision,
                    "after": after_revision,
                },
            }
    return mismatches


def validate_adopted_session(
    runtime: dict[str, Any],
    *,
    before_session: dict[str, Any],
    group_id: str,
    run_id: str,
    target_ports: list[int],
) -> dict[str, Any]:
    stage = "runtime adoption"
    if runtime.get("mutation_intent") is not None:
        raise AcceptanceError(stage, "runtime had a pending mutation after restart", runtime)
    session = require_object(
        runtime.get("session"), stage, "runtime did not restore the traffic session"
    )
    mismatches = read_side_session_mismatches(
        before_session, session, stage=stage
    )
    if session.get("state") != "running":
        mismatches["state"] = {"before": "running", "after": session.get("state")}
    before_group = exact_session_group(
        before_session, group_id=group_id, run_id=run_id, stage=stage
    )
    after_group = exact_session_group(
        session, group_id=group_id, run_id=run_id, stage=stage
    )
    immutable_fields = sorted(set(before_group).union(after_group))
    group_mismatches = {
        name: {"before": before_group.get(name), "after": after_group.get(name)}
        for name in immutable_fields
        if after_group.get(name) != before_group.get(name)
    }
    if after_group.get("state") != "running":
        group_mismatches["state"] = after_group.get("state")
    if mismatches or group_mismatches:
        raise AcceptanceError(
            stage,
            "API restart did not adopt the exact persisted running session",
            {"session": mismatches, "group": group_mismatches},
        )
    records = runtime.get("port_states")
    by_port = {
        item.get("port"): item
        for item in records
        if isinstance(item, dict) and isinstance(item.get("port"), int)
    } if isinstance(records, list) else {}
    invalid_ports = {
        port: by_port.get(port)
        for port in target_ports
        if not isinstance(by_port.get(port), dict)
        or by_port[port].get("state") != "running"
        or by_port[port].get("ownership") != "managed"
    }
    if invalid_ports:
        raise AcceptanceError(
            stage,
            "restored runtime did not own the still-running plan ports",
            invalid_ports,
        )
    return session


def validate_stopped_session(
    session: dict[str, Any],
    *,
    expected_session_id: str,
    expected_previous_revision: int,
    group_id: str,
    run_id: str,
    target_ports: list[int],
) -> int:
    stage = "traffic stop evidence"
    revision = require_positive_revision(session.get("revision"), stage)
    if session.get("id") != expected_session_id:
        raise AcceptanceError(
            stage,
            "stop response belonged to a different session",
            {"expected": expected_session_id, "observed": session.get("id")},
        )
    if revision != expected_previous_revision + 1:
        raise AcceptanceError(
            stage,
            "stop did not advance the exact adopted session revision once",
            {"before": expected_previous_revision, "after": revision},
        )
    if session.get("evidence_version") != 1 or session.get("state") != "stopped":
        raise AcceptanceError(stage, "stop did not persist a stopped v1 session", session)
    group = exact_session_group(
        session, group_id=group_id, run_id=run_id, stage=stage
    )
    cleanup = require_object(
        group.get("cleanup_evidence"), stage, "group cleanup evidence was missing"
    )
    stop_nonce = require_text(cleanup.get("intent_nonce"), stage, "cleanup intent nonce")
    expected_cleanup = {
        "completion": "operator_stop",
        "final_port_states": {str(port): "stopped" for port in target_ports},
        "acquisition_restored": True,
        "wal_cleared": True,
    }
    cleanup_failures: dict[str, Any] = {}
    for name, expected in expected_cleanup.items():
        observed = cleanup.get(name)
        if name == "final_port_states" and isinstance(observed, dict):
            observed = {str(key): value for key, value in observed.items()}
        if observed != expected:
            cleanup_failures[name] = {"expected": expected, "observed": observed}
    if group.get("state") != "stopped" or group.get("ended_at") != cleanup.get("completed_at"):
        cleanup_failures["group"] = {
            "state": group.get("state"),
            "ended_at": group.get("ended_at"),
            "completed_at": cleanup.get("completed_at"),
        }
    if cleanup_failures:
        raise AcceptanceError(stage, "commanded cleanup evidence was incomplete", cleanup_failures)
    mutations = session.get("mutation_evidence")
    matching = [
        item
        for item in mutations
        if isinstance(item, dict) and item.get("intent_nonce") == stop_nonce
    ] if isinstance(mutations, list) else []
    if len(matching) != 1:
        raise AcceptanceError(
            stage,
            "cleanup nonce did not identify exactly one stop mutation",
            {"nonce": stop_nonce, "matches": matching},
        )
    stop_evidence = validate_mutation_evidence(
        matching[0],
        operation="stop",
        ports=target_ports,
        nonce=stop_nonce,
        completion_mode="direct",
        stage=stage,
    )
    if stop_evidence.get("completed_at") != cleanup.get("completed_at"):
        raise AcceptanceError(
            stage,
            "cleanup and stop evidence completion timestamps differed",
            {"cleanup": cleanup, "stop": stop_evidence},
        )
    return revision


def validate_final_runtime(
    runtime: dict[str, Any],
    *,
    stopped_session: dict[str, Any],
    target_ports: list[int],
) -> dict[str, Any]:
    stage = "final runtime refresh"
    if runtime.get("mutation_intent") is not None:
        raise AcceptanceError(stage, "runtime still had a mutation intent", runtime)
    session = require_object(runtime.get("session"), stage, "runtime session was missing")
    mismatches = read_side_session_mismatches(
        stopped_session, session, stage=stage
    )
    if mismatches:
        raise AcceptanceError(
            stage,
            "final runtime changed before report binding",
            mismatches,
        )
    records = runtime.get("port_states")
    by_port = {
        item.get("port"): item
        for item in records
        if isinstance(item, dict) and isinstance(item.get("port"), int)
    } if isinstance(records, list) else {}
    invalid = {
        port: by_port.get(port)
        for port in target_ports
        if not isinstance(by_port.get(port), dict)
        or by_port[port].get("state") != "stopped"
        or by_port[port].get("ownership") != "none"
    }
    if invalid:
        raise AcceptanceError(stage, "final runtime ports were not idle", invalid)
    return session


def report_markdown(run: dict[str, Any]) -> str:
    continuity = run.get("session_continuity")
    before = run.get("service_before")
    after = run.get("service_after")
    failure = run.get("failure")
    return "\n".join(
        [
            f"# TRex API Restart E2E {run['run_id']}",
            "",
            f"- Verdict: **{str(run.get('verdict', 'unknown')).upper()}**",
            f"- Service: `{run.get('service', '-')}`",
            f"- Plan group: `{run.get('group_id', '-')}`",
            f"- MainPID: `{before.get('main_pid') if isinstance(before, dict) else '-'}` -> "
            f"`{after.get('main_pid') if isinstance(after, dict) else '-'}`",
            "",
            "## Session continuity",
            "",
            json.dumps(continuity, indent=2, sort_keys=True) if continuity else "-",
            "",
            "## Failure",
            "",
            json.dumps(failure, indent=2, sort_keys=True) if failure else "-",
        ]
    )


def report_save_request(
    run: dict[str, Any],
    *,
    report_name: str,
    session: dict[str, Any] | None,
) -> dict[str, Any]:
    payload = sanitize_report_payload(run)
    if not isinstance(payload, dict):
        raise AcceptanceError("report save", "sanitized run payload was not an object")
    payload.pop("traffic_session", None)
    payload.pop("traffic_session_binding", None)
    body: dict[str, Any] = {
        "title": f"TRex API Restart E2E {run['run_id']}",
        "markdown": report_markdown(run),
        "payload": payload,
        "file_name": report_name,
    }
    if run.get("verdict") == "pass" and session is not None:
        body["traffic_session_id"] = session["id"]
        body["traffic_session_revision"] = session["revision"]
    return body


def local_unbound_report_content(
    run: dict[str, Any],
    *,
    report_name: str,
) -> str:
    body = report_save_request(run, report_name=report_name, session=None)
    payload = body["payload"]
    if not isinstance(payload, dict):
        raise AcceptanceError("local report", "fallback report payload was not an object")
    reserved = {"traffic_session", "traffic_session_binding"}.intersection(payload)
    if reserved:
        raise AcceptanceError(
            "local report",
            "fallback failure report contained reserved session fields",
            sorted(reserved),
        )
    return json.dumps(
        {
            "version": 2,
            "title": body["title"],
            "generated_at": utc_now(),
            "markdown": body["markdown"],
            "payload": payload,
        },
        indent=2,
        sort_keys=True,
    ) + "\n"


def validate_downloaded_report(
    content: str,
    *,
    run: dict[str, Any],
    session: dict[str, Any] | None,
) -> dict[str, Any]:
    ensure_report_archive_has_no_binary_payloads(content)
    payload = report_archive_payload(content)
    if payload.get("workflow") != WORKFLOW or payload.get("verdict") != run.get("verdict"):
        raise AcceptanceError(
            "report download",
            "downloaded archive did not identify this restart gate verdict",
            payload,
        )
    if run.get("verdict") != "pass":
        reserved = sorted(
            name
            for name in ("traffic_session", "traffic_session_binding")
            if name in payload
        )
        if reserved:
            raise AcceptanceError(
                "report download",
                "failure report was not unbound",
                reserved,
            )
        return payload
    expected_session = require_object(
        session, "report download", "passing report had no expected session"
    )
    archived_session = require_object(
        payload.get("traffic_session"),
        "report download",
        "passing archive had no canonical traffic session",
    )
    binding = payload.get("traffic_session_binding")
    expected_binding = {
        "id": expected_session["id"],
        "revision": expected_session["revision"],
        "evidence_version": 1,
    }
    if binding != expected_binding:
        raise AcceptanceError(
            "report download",
            "archive session binding did not match the final CAS",
            {"expected": expected_binding, "observed": binding},
        )
    for name in ("id", "revision", "evidence_version", "state", "mutation_evidence"):
        if archived_session.get(name) != expected_session.get(name):
            raise AcceptanceError(
                "report download",
                "archive canonical session did not match the final runtime",
                {"field": name},
            )
    return payload


def best_effort_cleanup(
    run: dict[str, Any],
    *,
    args: argparse.Namespace,
    target_ports: list[int],
    session_id: str,
    api_request: ApiRequest,
) -> bool:
    try:
        response = api_request(
            args.base_url,
            "POST",
            "/api/trex/traffic/stop",
            {
                "ports": target_ports,
                "confirmation": "stop",
                "expected_session_id": session_id,
            },
            args.timeout,
        )
        result = require_ok("cleanup traffic stop", response)
        session = response_session(result, "cleanup traffic stop")
        if session.get("id") != session_id:
            raise AcceptanceError(
                "cleanup traffic stop",
                "cleanup response belonged to a different session",
                session,
            )
        run.setdefault("cleanup", []).append(
            {"endpoint": "/api/trex/traffic/stop", "ok": True}
        )
        return session.get("state") == "stopped"
    except AcceptanceError as exc:
        run.setdefault("cleanup", []).append(
            {"endpoint": "/api/trex/traffic/stop", "error": exc.to_record()}
        )
        return False


def save_and_download_report(
    run: dict[str, Any],
    *,
    args: argparse.Namespace,
    report_name: str,
    session: dict[str, Any] | None,
    api_request: ApiRequest,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    body = report_save_request(run, report_name=report_name, session=session)
    try:
        save = require_ok(
            "report save",
            api_request(
                args.base_url,
                "POST",
                "/api/trex/reports/save",
                body,
                args.timeout,
            ),
        )
    except AcceptanceError as exc:
        if run.get("verdict") != "pass" or session is None:
            raise
        run["verdict"] = "fail"
        run["failure"] = {
            "stage": "bound report CAS",
            "message": "passing report binding was rejected",
            "payload": exc.to_record(),
        }
        run["bound_report_conflict"] = exc.to_record()
        body = report_save_request(run, report_name=report_name, session=None)
        save = require_ok(
            "unbound failure report save",
            api_request(
                args.base_url,
                "POST",
                "/api/trex/reports/save",
                body,
                args.timeout,
            ),
        )
        session = None
    data = save.get("data")
    file_record = data.get("file") if isinstance(data, dict) else None
    saved_name = (
        file_record.get("name")
        if isinstance(file_record, dict) and isinstance(file_record.get("name"), str)
        else report_name
    )
    download = require_ok(
        "report download",
        api_request(
            args.base_url,
            "POST",
            "/api/trex/reports/download",
            {"file_name": saved_name},
            args.timeout,
        ),
    )
    download_data = download.get("data")
    downloaded_file = download_data.get("file") if isinstance(download_data, dict) else None
    content = downloaded_file.get("content") if isinstance(downloaded_file, dict) else None
    if not isinstance(content, str):
        raise AcceptanceError(
            "report download", "downloaded report did not include text content", download
        )
    validate_downloaded_report(content, run=run, session=session)
    return save, download, content


def run_api_restart_e2e(
    args: argparse.Namespace,
    *,
    api_request: ApiRequest | None = None,
    identity_reader: IdentityReader | None = None,
    process_killer: ProcessKiller | None = None,
    monotonic: Callable[[], float] | None = None,
    sleeper: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    request = api_request or request_json
    read_identity = identity_reader or read_service_identity
    kill_process = process_killer or kill_main_process
    service = normalize_service_name(args.service)
    generated_at = utc_now()
    run_id = clean_file_timestamp(generated_at)
    report_name = f"{args.report_prefix}-{run_id}.json"
    run: dict[str, Any] = {
        "workflow": WORKFLOW,
        "run_id": run_id,
        "generated_at": generated_at,
        "base_url": args.base_url,
        "service": service,
        "group_id": args.group_id,
        "verdict": "unknown",
        "cleanup": [],
    }
    target_ports: list[int] = []
    traffic_session_id: str | None = None
    traffic_active = False
    report_session: dict[str, Any] | None = None
    try:
        health_before = request(
            args.base_url, "GET", "/api/health", None, args.timeout
        )
        if health_before.get("status") != "ok":
            raise AcceptanceError(
                "health preflight", "health endpoint did not return ok", health_before
            )
        run["health_before"] = health_before

        before_identity = read_identity(service)
        validate_service_preflight(before_identity)
        run["service_before"] = before_identity.to_record()

        before_runtime = runtime_snapshot(
            request(
                args.base_url,
                "GET",
                "/api/trex/traffic/runtime",
                None,
                args.timeout,
            ),
            "runtime preflight",
        )
        plan_group = selected_plan_group(before_runtime, args.group_id)
        target_ports = list(plan_group["ports"])
        validate_runtime_idle(before_runtime, target_ports=target_ports)
        run["port_preflight"] = validate_live_ports(
            request(args.base_url, "GET", "/api/trex/ports", None, args.timeout),
            target_ports=target_ports,
            expected_active=False,
            stage="port preflight",
        )
        plan_revision = require_plan_revision(
            before_runtime.get("plan_revision"), "runtime preflight"
        )
        run["plan"] = {
            "revision": plan_revision,
            "group_id": args.group_id,
            "ports": target_ports,
            "profile_path": plan_group.get("profile_path"),
            "multiplier": plan_group.get("multiplier"),
            "duration": plan_group.get("duration"),
        }

        hard_stop_at = hard_stop_timestamp(args.hard_stop_window)
        run["hard_stop_at"] = hard_stop_at
        start_response = request(
            args.base_url,
            "POST",
            f"/api/trex/traffic/group/{args.group_id}/start",
            {
                "plan_revision": plan_revision,
                "expected_session_id": None,
                "confirmation": "start-traffic",
                "hard_stop_at": hard_stop_at,
            },
            args.timeout,
        )
        started_session = response_session(start_response, "traffic group start")
        candidate_session_id = started_session.get("id")
        if isinstance(candidate_session_id, str) and candidate_session_id:
            traffic_session_id = candidate_session_id
            traffic_active = True
        started_revision, run_id_value, started_group = validate_started_session(
            started_session,
            plan_group=plan_group,
            plan_revision=plan_revision,
            hard_stop_at=hard_stop_at,
        )
        run["session_continuity"] = {
            "id": traffic_session_id,
            "run_id": run_id_value,
            "started_revision": started_revision,
            "start_evidence_sha256": canonical_digest(
                started_group.get("start_evidence")
            ),
            "mutation_evidence_before_sha256": canonical_digest(
                started_session.get("mutation_evidence")
            ),
        }

        try:
            kill_process(before_identity.main_pid)
        except AcceptanceError:
            raise
        except OSError as exc:
            raise AcceptanceError(
                "API SIGKILL",
                f"failed to SIGKILL MainPID {before_identity.main_pid}: {exc}",
            ) from exc
        run["sigkill"] = {
            "signal": "SIGKILL",
            "main_pid": before_identity.main_pid,
            "sent": True,
        }

        after_identity, health_after = wait_for_service_restart(
            base_url=args.base_url,
            service=service,
            before=before_identity,
            timeout=args.restart_timeout,
            poll_interval=args.poll_interval,
            http_timeout=args.timeout,
            api_request=request,
            identity_reader=read_identity,
            monotonic=monotonic,
            sleeper=sleeper,
        )
        run["service_after"] = after_identity.to_record()
        run["health_after"] = health_after

        adopted_runtime = runtime_snapshot(
            request(
                args.base_url,
                "GET",
                "/api/trex/traffic/runtime",
                None,
                args.timeout,
            ),
            "runtime adoption",
        )
        adopted_session = validate_adopted_session(
            adopted_runtime,
            before_session=started_session,
            group_id=args.group_id,
            run_id=run_id_value,
            target_ports=target_ports,
        )
        adopted_revision = require_positive_revision(
            adopted_session.get("revision"), "runtime adoption"
        )
        run["session_continuity"]["adopted_revision"] = adopted_revision
        run["session_continuity"]["mutation_evidence_after_sha256"] = canonical_digest(
            adopted_session.get("mutation_evidence")
        )
        validate_live_ports(
            request(args.base_url, "GET", "/api/trex/ports", None, args.timeout),
            target_ports=target_ports,
            expected_active=True,
            stage="ports after restart",
        )

        stop_response = request(
            args.base_url,
            "POST",
            "/api/trex/traffic/stop",
            {
                "ports": target_ports,
                "confirmation": "stop",
                "expected_session_id": traffic_session_id,
            },
            args.timeout,
        )
        stopped_session = response_session(stop_response, "exact traffic stop")
        if stopped_session.get("id") == traffic_session_id and stopped_session.get("state") == "stopped":
            traffic_active = False
        stopped_revision = validate_stopped_session(
            stopped_session,
            expected_session_id=str(traffic_session_id),
            expected_previous_revision=adopted_revision,
            group_id=args.group_id,
            run_id=run_id_value,
            target_ports=target_ports,
        )
        run["session_continuity"]["stopped_revision"] = stopped_revision
        run["session_continuity"]["final_mutation_evidence_sha256"] = canonical_digest(
            stopped_session.get("mutation_evidence")
        )

        final_runtime = runtime_snapshot(
            request(
                args.base_url,
                "GET",
                "/api/trex/traffic/runtime",
                None,
                args.timeout,
            ),
            "final runtime refresh",
        )
        report_session = validate_final_runtime(
            final_runtime,
            stopped_session=stopped_session,
            target_ports=target_ports,
        )
        final_port_boundary = validate_live_ports(
            request(args.base_url, "GET", "/api/trex/ports", None, args.timeout),
            target_ports=target_ports,
            expected_active=False,
            stage="final port cleanup",
        )
        run["postconditions"] = {
            "target_ports": list(target_ports),
            "runtime_ports_stopped": True,
            "runtime_ports_unowned": True,
            "ports_idle": final_port_boundary["ports_idle"],
            "links_up": final_port_boundary["links_up"],
            "ports_unowned": final_port_boundary["ports_unowned"],
            "acquired_ports_after_stop": final_port_boundary["acquired_ports"],
        }
        run["verdict"] = "pass"
    except AcceptanceError as exc:
        run["verdict"] = "fail"
        run["failure"] = exc.to_record()
        report_session = None
    finally:
        if traffic_active and traffic_session_id is not None and target_ports:
            traffic_active = not best_effort_cleanup(
                run,
                args=args,
                target_ports=target_ports,
                session_id=traffic_session_id,
                api_request=request,
            )
        else:
            run.setdefault("cleanup", []).append(
                {
                    "endpoint": "/api/trex/traffic/stop",
                    "ok": True,
                    "action": "not-required",
                }
            )
        run["traffic_cleanup_complete"] = not traffic_active
        if target_ports:
            try:
                final_ports = request(
                    args.base_url, "GET", "/api/trex/ports", None, args.timeout
                )
                cleanup_boundary = validate_live_ports(
                    final_ports,
                    target_ports=target_ports,
                    expected_active=False,
                    stage="cleanup port refresh",
                )
                run["ports_after_cleanup"] = {
                    "target_ports": target_ports,
                    "ports_unowned": cleanup_boundary["ports_unowned"],
                    "acquired_ports_after_stop": cleanup_boundary["acquired_ports"],
                    "records_sha256": canonical_digest(
                        live_port_records(final_ports, "cleanup port refresh")
                    ),
                }
            except AcceptanceError as exc:
                run["ports_after_cleanup_error"] = exc.to_record()
                if run.get("verdict") == "pass":
                    run["verdict"] = "fail"
                    run["failure"] = exc.to_record()
                    report_session = None

    try:
        save, download, content = save_and_download_report(
            run,
            args=args,
            report_name=report_name,
            session=report_session if run.get("verdict") == "pass" else None,
            api_request=request,
        )
        run["report_save"] = save
        run["report_download"] = download
        run["local_report"] = str(
            write_local_report(Path(args.output_dir), report_name, content)
        )
    except AcceptanceError as exc:
        if run.get("verdict") == "pass":
            run["verdict"] = "fail"
            run["failure"] = {
                "stage": "report persistence",
                "message": "passing restart evidence could not be saved and downloaded",
                "payload": exc.to_record(),
            }
        run["report_failure"] = exc.to_record()
        fallback_name = report_name.removesuffix(".json") + "-unbound-failure.json"
        run["local_report"] = str(
            write_local_report(
                Path(args.output_dir),
                fallback_name,
                local_unbound_report_content(run, report_name=fallback_name),
            )
        )
    if run.get("verdict") != "pass":
        raise AcceptanceError(
            "api restart e2e",
            "API restart persistence workflow failed",
            sanitize_report_payload(run),
        )
    return run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "SIGKILL the systemd-managed TRex WebUI API during a real plan run, "
            "then verify durable runtime adoption, exact cleanup, and report CAS."
        )
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="WebUI base URL, with or without /api",
    )
    parser.add_argument(
        "--group-id", default=DEFAULT_GROUP_ID, help="Saved traffic plan group to run"
    )
    parser.add_argument(
        "--service",
        default=DEFAULT_SERVICE,
        help="systemd API service name",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Local directory for downloaded report evidence",
    )
    parser.add_argument(
        "--report-prefix",
        default=DEFAULT_REPORT_PREFIX,
        help="Report archive file prefix",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_HTTP_TIMEOUT_SECONDS,
        help="HTTP request timeout in seconds",
    )
    parser.add_argument(
        "--restart-timeout",
        type=float,
        default=DEFAULT_RESTART_TIMEOUT_SECONDS,
        help="Maximum systemd/API recovery wait in seconds",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL_SECONDS,
        help="Systemd/API recovery poll interval in seconds",
    )
    parser.add_argument(
        "--hard-stop-window",
        type=float,
        default=DEFAULT_HARD_STOP_WINDOW_SECONDS,
        help=(
            "Backend-enforced traffic safety lease in seconds (0 < value <= 300); "
            "must exceed --restart-timeout"
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if (
        args.timeout <= 0
        or args.restart_timeout <= 0
        or args.poll_interval < 0
        or args.hard_stop_window <= args.restart_timeout
        or args.hard_stop_window > 300
    ):
        print(
            "timeouts must be positive, poll interval may be zero, and "
            "hard-stop window must exceed restart timeout without exceeding 300 seconds",
            file=sys.stderr,
        )
        return 2
    try:
        run = run_api_restart_e2e(args)
    except AcceptanceError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        if exc.payload is not None:
            print(json.dumps(exc.payload, indent=2, sort_keys=True), file=sys.stderr)
        return 1
    report_data = run.get("report_save", {}).get("data", {})
    report_file = report_data.get("file", {}) if isinstance(report_data, dict) else {}
    print(
        "PASS "
        f"service={run['service']} group={run['group_id']} "
        f"report={report_file.get('name', '-')} local={run['local_report']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
