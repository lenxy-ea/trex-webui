#!/usr/bin/env python3
"""Bind a publishable release archive to exact real-hardware evidence."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import stat
import sys
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RELEASE_EVIDENCE_SCHEMA = "trex-webui-release-evidence/v1"
RELEASE_MANIFEST_NAME = "RELEASE_MANIFEST.json"
MAX_EVIDENCE_REPORT_BYTES = 64 * 1024 * 1024
TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS = 300.0
SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
SESSION_KEYS = {
    "id",
    "revision",
    "evidence_version",
    "authority",
    "state",
    "started_at",
    "updated_at",
    "ended_at",
    "groups",
    "completed_groups",
    "mutation_evidence",
    "reconciliation",
}
AUTHORITY_KEYS = {
    "host",
    "sync_port",
    "async_port",
    "scapy_port",
    "daemon_supervisor",
    "generation",
}
MUTATION_KEYS = {
    "intent_nonce",
    "operation",
    "completion_mode",
    "ports",
    "baseline_port_states",
    "desired_port_states",
    "baseline_acquired_ports",
    "prepared_at",
    "completed_at",
    "acquisition_restored",
    "wal_cleared",
}
CLEANUP_KEYS = {
    "completion",
    "completed_at",
    "final_port_states",
    "intent_nonce",
    "acquisition_restored",
    "wal_cleared",
}
GROUP_KEYS = {
    "group_id",
    "run_id",
    "source",
    "plan_revision",
    "ports",
    "profile_path",
    "profile_sha256",
    "start_multiplier",
    "multiplier",
    "duration",
    "start_force",
    "start_total",
    "start_synchronized",
    "start_clear_existing",
    "started_at",
    "ended_at",
    "hard_stop_at",
    "tunables",
    "start_evidence",
    "cleanup_evidence",
    "state",
    "port_states",
    "updated_at",
}
PORT_STATES = {"running", "paused", "stopped", "unknown"}
SIX_PLAN_GROUP_KEYS = {
    "ports",
    "profile_path",
    "multiplier",
    "duration",
    "force",
    "total",
    "synchronized",
    "clear_existing",
}


class CanonicalSessionEvidence:
    __slots__ = ("descriptor", "session", "groups", "mutations", "mutation_by_nonce")

    def __init__(
        self,
        *,
        descriptor: dict[str, object],
        session: dict[str, object],
        groups: tuple[dict[str, object], ...],
        mutations: tuple[dict[str, object], ...],
        mutation_by_nonce: dict[str, dict[str, object]],
    ) -> None:
        self.descriptor = descriptor
        self.session = session
        self.groups = groups
        self.mutations = mutations
        self.mutation_by_nonce = mutation_by_nonce


class ReleaseEvidenceError(ValueError):
    """Raised when a release artifact and its evidence do not form one chain."""


def load_project_module(module_name: str, path: Path) -> Any:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseEvidenceError(f"required release validator is missing: {path}: {exc}") from exc
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ReleaseEvidenceError(f"required release validator is unsafe: {path}")
    try:
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            raise ReleaseEvidenceError(f"cannot load release validator: {path}")
        module = importlib.util.module_from_spec(spec)
        previous_dont_write_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            spec.loader.exec_module(module)
        finally:
            sys.dont_write_bytecode = previous_dont_write_bytecode
        return module
    except ReleaseEvidenceError:
        raise
    except Exception as exc:
        raise ReleaseEvidenceError(f"cannot load release validator {path}: {exc}") from exc


def release_modules(project_root: Path = PROJECT_ROOT) -> tuple[Any, Any]:
    archive_safety = load_project_module(
        "trex_webui_release_evidence_archive_safety",
        project_root / "deploy" / "archive_safety.py",
    )
    release_contract = load_project_module(
        "trex_webui_release_evidence_contract",
        project_root / "scripts" / "release_contract.py",
    )
    if archive_safety.RELEASE_MANIFEST_SCHEMA != release_contract.RELEASE_MANIFEST_SCHEMA:
        raise ReleaseEvidenceError("release validators disagree about the manifest schema")
    return archive_safety, release_contract


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256_stream(source: BinaryIO) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    while chunk := source.read(1024 * 1024):
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


def regular_file(path: Path, label: str, *, maximum_size: int | None = None) -> os.stat_result:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseEvidenceError(f"cannot inspect {label} {path}: {exc}") from exc
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        raise ReleaseEvidenceError(f"{label} must be a regular non-symlink file: {path}")
    if maximum_size is not None and (metadata.st_size < 1 or metadata.st_size > maximum_size):
        raise ReleaseEvidenceError(f"{label} is empty or too large: {path}")
    return metadata


def sha256_file(path: Path, label: str) -> tuple[str, int]:
    metadata = regular_file(path, label)
    try:
        with path.open("rb") as source:
            digest, size = sha256_stream(source)
    except OSError as exc:
        raise ReleaseEvidenceError(f"cannot hash {label} {path}: {exc}") from exc
    if size != metadata.st_size:
        raise ReleaseEvidenceError(f"{label} changed while it was being hashed: {path}")
    return digest, size


def read_strict_json(path: Path, label: str, release_contract: Any) -> object:
    regular_file(path, label, maximum_size=MAX_EVIDENCE_REPORT_BYTES)
    try:
        return release_contract.strict_json_loads(path.read_bytes())
    except OSError as exc:
        raise ReleaseEvidenceError(f"cannot read {label} {path}: {exc}") from exc
    except release_contract.ReleaseContractError as exc:
        raise ReleaseEvidenceError(f"invalid {label}: {exc}") from exc


def read_archive_manifest(
    archive_path: Path,
    archive_safety: Any,
    release_contract: Any,
) -> tuple[str, dict[str, object]]:
    regular_file(archive_path, "release archive")
    try:
        top_level = archive_safety.validate_archive(str(archive_path))
    except archive_safety.ArchiveSafetyError as exc:
        raise ReleaseEvidenceError(f"release archive failed payload validation: {exc}") from exc
    try:
        with tarfile.open(archive_path, mode="r:gz") as archive:
            member = archive.getmember(f"{top_level}/{RELEASE_MANIFEST_NAME}")
            source = archive.extractfile(member)
            if source is None:
                raise ReleaseEvidenceError("release archive manifest cannot be read")
            with source:
                content = source.read(archive_safety.MAX_RELEASE_MANIFEST_BYTES + 1)
    except (OSError, KeyError, tarfile.TarError) as exc:
        raise ReleaseEvidenceError(f"cannot read validated release archive manifest: {exc}") from exc
    try:
        manifest = release_contract.strict_json_loads(content)
    except release_contract.ReleaseContractError as exc:
        raise ReleaseEvidenceError(f"release archive manifest is invalid: {exc}") from exc
    if not isinstance(manifest, dict):
        raise ReleaseEvidenceError("release archive manifest root is not an object")
    return top_level, manifest


def verify_checksum_sidecar(archive_path: Path, checksum_path: Path) -> tuple[str, int, str, int]:
    archive_digest, archive_size = sha256_file(archive_path, "release archive")
    checksum_digest, checksum_size = sha256_file(checksum_path, "checksum sidecar")
    try:
        content = checksum_path.read_text(encoding="ascii")
    except (OSError, UnicodeDecodeError) as exc:
        raise ReleaseEvidenceError(f"cannot read checksum sidecar {checksum_path}: {exc}") from exc
    expected = f"{archive_digest}  {archive_path.name}\n"
    if content != expected:
        raise ReleaseEvidenceError(
            "checksum sidecar must contain exactly the archive SHA-256 and basename"
        )
    return archive_digest, archive_size, checksum_digest, checksum_size


def nested(value: object, *keys: str) -> object:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def report_payload(document: object, label: str) -> dict[str, object]:
    if not isinstance(document, dict):
        raise ReleaseEvidenceError(f"{label} root must be an object")
    payload = document.get("payload")
    if payload is None:
        payload = document
    if not isinstance(payload, dict):
        raise ReleaseEvidenceError(f"{label} payload must be an object")
    return payload


def frontend_asset_hash(files: list[dict[str, object]]) -> str:
    prefix = "apps/web/dist/"
    assets = [
        {
            "path": str(item["path"])[len(prefix) :],
            "size": item["size"],
            "sha256": item["sha256"],
        }
        for item in files
        if isinstance(item.get("path"), str) and str(item["path"]).startswith(prefix)
    ]
    assets.sort(key=lambda item: str(item["path"]))
    if not assets or not any(item["path"] == "index.html" for item in assets):
        raise ReleaseEvidenceError("release payload has no complete frontend asset manifest")
    return hashlib.sha256(canonical_json_bytes(assets)).hexdigest()


def payload_file(files: list[dict[str, object]], path: str) -> dict[str, object]:
    entry = next((item for item in files if item.get("path") == path), None)
    if not isinstance(entry, dict):
        raise ReleaseEvidenceError(f"release payload is missing required evidence input: {path}")
    return entry


def positive_integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ReleaseEvidenceError(f"{label} must be a positive integer")
    return value


def exact_object_shape(value: dict[str, object], expected: set[str], label: str) -> None:
    observed = set(value)
    if observed != expected:
        missing = sorted(expected.difference(observed))
        extra = sorted(observed.difference(expected))
        raise ReleaseEvidenceError(
            f"{label} shape is not canonical (missing={missing}, extra={extra})"
        )


def canonical_uuid(value: object, label: str) -> str:
    if not isinstance(value, str):
        raise ReleaseEvidenceError(f"{label} must be a canonical UUID")
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise ReleaseEvidenceError(f"{label} must be a canonical UUID") from exc
    if str(parsed) != value:
        raise ReleaseEvidenceError(f"{label} must be a canonical UUID")
    return value


def canonical_utc_timestamp(value: object, label: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ReleaseEvidenceError(f"{label} must use canonical UTC form")
    try:
        parsed = datetime.fromisoformat(f"{value[:-1]}+00:00")
    except ValueError as exc:
        raise ReleaseEvidenceError(f"{label} must use canonical UTC form") from exc
    if parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise ReleaseEvidenceError(f"{label} must use canonical UTC form")
    canonical = parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if canonical != value:
        raise ReleaseEvidenceError(f"{label} must use canonical UTC form")
    return parsed


def validate_hard_stop_window(
    value: object,
    *,
    prepared_at: object,
    label: str,
) -> str:
    deadline = canonical_utc_timestamp(value, f"{label} hard_stop_at")
    prepared = canonical_utc_timestamp(prepared_at, f"{label} start prepared_at")
    window = (deadline - prepared).total_seconds()
    if not 0 < window <= TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS:
        raise ReleaseEvidenceError(
            f"{label} hard-stop deadline must be after its start preparation and "
            f"within {TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS:g} seconds"
        )
    assert isinstance(value, str)
    return value


def finite_number(
    value: object,
    label: str,
    *,
    minimum: float | None = None,
    strict_minimum: bool = False,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ReleaseEvidenceError(f"{label} must be a finite number")
    number = float(value)
    if not math.isfinite(number):
        raise ReleaseEvidenceError(f"{label} must be a finite number")
    if minimum is not None and (
        number < minimum or (strict_minimum and number == minimum)
    ):
        comparator = "greater than" if strict_minimum else "at least"
        raise ReleaseEvidenceError(f"{label} must be {comparator} {minimum:g}")
    return number


def canonical_ports(value: object, label: str) -> list[int]:
    if not isinstance(value, list) or not value:
        raise ReleaseEvidenceError(f"{label} must be a non-empty port list")
    if any(
        isinstance(port, bool) or not isinstance(port, int) or port < 0
        for port in value
    ) or len(value) != len(set(value)):
        raise ReleaseEvidenceError(f"{label} must contain unique non-negative integers")
    return value


def canonical_state_map(value: object, label: str) -> dict[int, str]:
    if not isinstance(value, dict):
        raise ReleaseEvidenceError(f"{label} must be a port-state object")
    states: dict[int, str] = {}
    for raw_port, raw_state in value.items():
        if isinstance(raw_port, bool):
            raise ReleaseEvidenceError(f"{label} has a non-canonical port key")
        if isinstance(raw_port, int):
            port = raw_port
        elif (
            isinstance(raw_port, str)
            and raw_port.isdigit()
            and (raw_port == "0" or not raw_port.startswith("0"))
        ):
            port = int(raw_port)
        else:
            raise ReleaseEvidenceError(f"{label} has a non-canonical port key")
        if (
            port < 0
            or port in states
            or not isinstance(raw_state, str)
            or raw_state not in PORT_STATES
        ):
            raise ReleaseEvidenceError(f"{label} has an invalid port state")
        states[port] = str(raw_state)
    return states


def profile_path_matches(expected: object, observed: object) -> bool:
    if (
        not isinstance(expected, str)
        or not expected
        or expected != expected.strip()
        or "\x00" in expected
        or not isinstance(observed, str)
        or not observed
        or observed != observed.strip()
        or "\x00" in observed
    ):
        return False
    expected_path = expected.rstrip("/")
    observed_path = observed.rstrip("/")
    return (
        expected_path == observed_path
        or expected_path.endswith(f"/{observed_path.lstrip('/')}")
        or observed_path.endswith(f"/{expected_path.lstrip('/')}")
    )


def validate_runtime_authority(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ReleaseEvidenceError(f"{label} has no runtime authority")
    exact_object_shape(value, AUTHORITY_KEYS, f"{label} runtime authority")
    host = value.get("host")
    if (
        not isinstance(host, str)
        or not host
        or len(host) > 253
        or host != host.strip()
        or "\x00" in host
    ):
        raise ReleaseEvidenceError(f"{label} runtime authority host is invalid")
    for field in ("sync_port", "async_port", "scapy_port"):
        port = value.get(field)
        if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
            raise ReleaseEvidenceError(f"{label} runtime authority {field} is invalid")
    supervisor = value.get("daemon_supervisor")
    generation = value.get("generation")
    if supervisor not in {"external", "systemd"} or not isinstance(generation, str):
        raise ReleaseEvidenceError(f"{label} runtime authority supervisor is invalid")
    candidate = generation.removeprefix("process:") if supervisor == "external" else generation
    if supervisor == "external" and not generation.startswith("process:"):
        raise ReleaseEvidenceError(
            f"{label} external runtime authority has no process generation"
        )
    canonical_uuid(candidate, f"{label} runtime authority generation")
    return value


def validate_mutation_evidence(
    value: object,
    label: str,
) -> tuple[dict[str, object], datetime, datetime]:
    if not isinstance(value, dict):
        raise ReleaseEvidenceError(f"{label} mutation evidence is missing")
    exact_object_shape(value, MUTATION_KEYS, f"{label} mutation evidence")
    canonical_uuid(value.get("intent_nonce"), f"{label} mutation nonce")
    operation = value.get("operation")
    if operation not in {"start", "stop", "pause", "resume", "update"}:
        raise ReleaseEvidenceError(f"{label} mutation operation is invalid")
    completion_mode = value.get("completion_mode")
    if completion_mode not in {"direct", "recovered", "replayed"}:
        raise ReleaseEvidenceError(
            f"{label} mutation must be completed without hard-stop evidence"
        )
    ports = canonical_ports(value.get("ports"), f"{label} mutation ports")
    target_ports = set(ports)
    baseline = canonical_state_map(
        value.get("baseline_port_states"),
        f"{label} mutation baseline",
    )
    desired = canonical_state_map(
        value.get("desired_port_states"),
        f"{label} mutation desired states",
    )
    if not target_ports.issubset(baseline) or "unknown" in baseline.values():
        raise ReleaseEvidenceError(
            f"{label} mutation baseline does not cover every target port"
        )
    expected_state = {
        "start": "running",
        "stop": "stopped",
        "pause": "paused",
        "resume": "running",
    }.get(str(operation))
    if set(desired) != target_ports or (
        expected_state is not None and set(desired.values()) != {expected_state}
    ):
        raise ReleaseEvidenceError(
            f"{label} mutation desired states do not exactly match its operation"
        )
    if operation == "update" and any(
        desired[port] != baseline[port] for port in ports
    ):
        raise ReleaseEvidenceError(f"{label} update mutation changes port state")
    acquired = value.get("baseline_acquired_ports")
    if not isinstance(acquired, list) or any(
        isinstance(port, bool) or not isinstance(port, int) or port < 0
        for port in acquired
    ) or len(acquired) != len(set(acquired)) or not set(acquired).issubset(target_ports):
        raise ReleaseEvidenceError(f"{label} mutation acquisition baseline is invalid")
    prepared = canonical_utc_timestamp(
        value.get("prepared_at"), f"{label} mutation prepared_at"
    )
    completed = canonical_utc_timestamp(
        value.get("completed_at"), f"{label} mutation completed_at"
    )
    if prepared > completed:
        raise ReleaseEvidenceError(f"{label} mutation completes before it was prepared")
    if value.get("acquisition_restored") is not True or value.get("wal_cleared") is not True:
        raise ReleaseEvidenceError(
            f"{label} mutation did not restore acquisition and clear its WAL"
        )
    return value, prepared, completed


def validate_cleanup_evidence(
    value: object,
    *,
    ports: list[int],
    label: str,
) -> tuple[dict[str, object], datetime]:
    if not isinstance(value, dict):
        raise ReleaseEvidenceError(f"{label} operator cleanup evidence is missing")
    exact_object_shape(value, CLEANUP_KEYS, f"{label} cleanup evidence")
    if value.get("completion") != "operator_stop":
        raise ReleaseEvidenceError(f"{label} cleanup was not an operator stop")
    canonical_uuid(value.get("intent_nonce"), f"{label} cleanup nonce")
    completed = canonical_utc_timestamp(
        value.get("completed_at"), f"{label} cleanup completed_at"
    )
    final_states = canonical_state_map(
        value.get("final_port_states"), f"{label} cleanup final states"
    )
    if final_states != {port: "stopped" for port in ports}:
        raise ReleaseEvidenceError(f"{label} cleanup did not stop exactly its ports")
    if value.get("acquisition_restored") is not True or value.get("wal_cleared") is not True:
        raise ReleaseEvidenceError(
            f"{label} cleanup did not restore acquisition and clear its WAL"
        )
    return value, completed


def reject_pending_mutation_intent(value: object, label: str, path: str = "payload") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = f"{path}.{key}"
            if key in {"mutation_intent", "traffic_mutation_intent"} and item is not None:
                raise ReleaseEvidenceError(
                    f"{label} contains a pending mutation intent at {item_path}"
                )
            reject_pending_mutation_intent(item, label, item_path)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            reject_pending_mutation_intent(item, label, f"{path}[{index}]")


def validate_canonical_session(
    payload: dict[str, object], label: str
) -> CanonicalSessionEvidence:
    reject_pending_mutation_intent(payload, label)
    binding = payload.get("traffic_session_binding")
    session = payload.get("traffic_session")
    if not isinstance(binding, dict) or not isinstance(session, dict):
        raise ReleaseEvidenceError(f"{label} has no canonical traffic session binding")
    exact_object_shape(
        binding,
        {"id", "revision", "evidence_version"},
        f"{label} traffic session binding",
    )
    exact_object_shape(session, SESSION_KEYS, f"{label} canonical traffic session")
    session_id = canonical_uuid(binding.get("id"), f"{label} traffic session id")
    revision = positive_integer(binding.get("revision"), f"{label} session revision")
    if binding.get("evidence_version") != 1:
        raise ReleaseEvidenceError(f"{label} traffic session evidence version is not 1")
    if (
        session.get("id") != session_id
        or session.get("revision") != revision
        or session.get("evidence_version") != 1
        or session.get("state") != "stopped"
    ):
        raise ReleaseEvidenceError(
            f"{label} canonical traffic session does not match its binding"
        )
    validate_runtime_authority(session.get("authority"), label)
    started_at = canonical_utc_timestamp(
        session.get("started_at"), f"{label} session started_at"
    )
    ended_at = canonical_utc_timestamp(
        session.get("ended_at"), f"{label} session ended_at"
    )
    updated_at = canonical_utc_timestamp(
        session.get("updated_at"), f"{label} session updated_at"
    )
    if started_at > ended_at or ended_at > updated_at:
        raise ReleaseEvidenceError(f"{label} session timestamps are out of order")
    reconciliation = session.get("reconciliation")
    if reconciliation is not None and (
        not isinstance(reconciliation, str) or not reconciliation.strip()
    ):
        raise ReleaseEvidenceError(f"{label} session reconciliation is invalid")

    raw_mutations = session.get("mutation_evidence")
    if not isinstance(raw_mutations, list) or not raw_mutations:
        raise ReleaseEvidenceError(f"{label} session mutation evidence is missing")
    mutations: list[dict[str, object]] = []
    mutation_times: dict[str, tuple[datetime, datetime]] = {}
    mutation_by_nonce: dict[str, dict[str, object]] = {}
    for index, item in enumerate(raw_mutations):
        mutation, prepared, completed = validate_mutation_evidence(
            item, f"{label} session mutation {index}"
        )
        nonce = str(mutation["intent_nonce"])
        if nonce in mutation_by_nonce:
            raise ReleaseEvidenceError(f"{label} session mutation nonces are not unique")
        mutation_by_nonce[nonce] = mutation
        mutation_times[nonce] = (prepared, completed)
        mutations.append(mutation)
    if mutations[0].get("operation") != "start" or mutations[0].get("intent_nonce") != session_id:
        raise ReleaseEvidenceError(
            f"{label} session does not begin with start evidence matching its id"
        )
    if mutation_times[session_id][1] != started_at:
        raise ReleaseEvidenceError(
            f"{label} session started_at does not match its first start mutation"
        )
    if any(mutation.get("operation") not in {"start", "stop"} for mutation in mutations):
        raise ReleaseEvidenceError(
            f"{label} release session contains an unsupported extra mutation"
        )

    collections: list[list[object]] = []
    for field in ("groups", "completed_groups"):
        collection = session.get(field)
        if not isinstance(collection, list):
            raise ReleaseEvidenceError(f"{label} session {field} must be a list")
        collections.append(collection)
    raw_groups = [item for collection in collections for item in collection]
    if not raw_groups or any(not isinstance(item, dict) for item in raw_groups):
        raise ReleaseEvidenceError(f"{label} session groups are incomplete")

    groups: list[dict[str, object]] = []
    group_run_ids: set[str] = set()
    group_ids: set[str] = set()
    cleanup_nonces: set[str] = set()
    assigned_ports: set[int] = set()
    for index, raw_group in enumerate(raw_groups):
        assert isinstance(raw_group, dict)
        group_label = f"{label} session group {index}"
        exact_object_shape(raw_group, GROUP_KEYS, group_label)
        run_id = canonical_uuid(raw_group.get("run_id"), f"{group_label} run id")
        if run_id in group_run_ids:
            raise ReleaseEvidenceError(f"{label} session groups contain duplicate run ids")
        group_run_ids.add(run_id)
        source = raw_group.get("source")
        group_id = raw_group.get("group_id")
        plan_revision = raw_group.get("plan_revision")
        if source == "plan":
            if not isinstance(group_id, str) or not group_id or (
                isinstance(plan_revision, bool)
                or not isinstance(plan_revision, int)
                or plan_revision < 0
            ):
                raise ReleaseEvidenceError(f"{group_label} plan identity is incomplete")
            if group_id in group_ids:
                raise ReleaseEvidenceError(f"{label} session groups contain duplicate group ids")
            group_ids.add(group_id)
        elif source == "ad_hoc":
            if group_id is not None or plan_revision is not None:
                raise ReleaseEvidenceError(f"{group_label} ad-hoc identity is invalid")
        else:
            raise ReleaseEvidenceError(f"{group_label} source is invalid")
        ports = canonical_ports(raw_group.get("ports"), f"{group_label} ports")
        overlap = assigned_ports.intersection(ports)
        if overlap:
            raise ReleaseEvidenceError(
                f"{label} session groups overlap or are duplicated on ports {sorted(overlap)}"
            )
        assigned_ports.update(ports)
        profile_path = raw_group.get("profile_path")
        if not isinstance(profile_path, str) or not profile_path.strip() or "\x00" in profile_path:
            raise ReleaseEvidenceError(f"{group_label} profile path is invalid")
        profile_sha = raw_group.get("profile_sha256")
        if not isinstance(profile_sha, str) or not SHA256_RE.fullmatch(profile_sha):
            raise ReleaseEvidenceError(f"{group_label} profile digest is invalid")
        multiplier = raw_group.get("multiplier")
        if (
            not isinstance(multiplier, str)
            or not multiplier
            or raw_group.get("start_multiplier") != multiplier
        ):
            raise ReleaseEvidenceError(f"{group_label} multiplier identity changed")
        finite_number(raw_group.get("duration"), f"{group_label} duration", minimum=-1)
        for field in (
            "start_force",
            "start_total",
            "start_synchronized",
            "start_clear_existing",
        ):
            if not isinstance(raw_group.get(field), bool):
                raise ReleaseEvidenceError(f"{group_label} {field} is incomplete")
        if not isinstance(raw_group.get("tunables"), dict):
            raise ReleaseEvidenceError(f"{group_label} tunables are invalid")
        if raw_group.get("hard_stop_at") is not None:
            raise ReleaseEvidenceError(f"{group_label} hard-stop lease was not cleared")
        if raw_group.get("state") != "stopped":
            raise ReleaseEvidenceError(f"{group_label} is not stopped")
        states = canonical_state_map(raw_group.get("port_states"), f"{group_label} states")
        if states != {port: "stopped" for port in ports}:
            raise ReleaseEvidenceError(f"{group_label} final states are not exactly stopped")
        group_started = canonical_utc_timestamp(
            raw_group.get("started_at"), f"{group_label} started_at"
        )
        group_ended = canonical_utc_timestamp(
            raw_group.get("ended_at"), f"{group_label} ended_at"
        )
        group_updated = canonical_utc_timestamp(
            raw_group.get("updated_at"), f"{group_label} updated_at"
        )
        if not (started_at <= group_started <= group_ended <= group_updated <= updated_at):
            raise ReleaseEvidenceError(f"{group_label} timestamps are out of order")
        start_evidence = raw_group.get("start_evidence")
        canonical_start = mutation_by_nonce.get(run_id)
        if (
            not isinstance(start_evidence, dict)
            or canonical_start != start_evidence
            or canonical_start.get("operation") != "start"
            or canonical_start.get("ports") != ports
            or mutation_times[run_id][1] != group_started
        ):
            raise ReleaseEvidenceError(
                f"{group_label} start evidence does not match its canonical mutation"
            )
        cleanup, cleanup_completed = validate_cleanup_evidence(
            raw_group.get("cleanup_evidence"), ports=ports, label=group_label
        )
        cleanup_nonce = str(cleanup["intent_nonce"])
        canonical_stop = mutation_by_nonce.get(cleanup_nonce)
        if (
            canonical_stop is None
            or canonical_stop.get("operation") != "stop"
            or not set(ports).issubset(set(canonical_stop.get("ports") or []))
            or canonical_stop.get("completed_at") != cleanup.get("completed_at")
            or cleanup_completed != group_ended
        ):
            raise ReleaseEvidenceError(
                f"{group_label} operator cleanup does not match its canonical stop mutation"
            )
        cleanup_nonces.add(cleanup_nonce)
        groups.append(raw_group)

    start_nonces = {
        str(mutation["intent_nonce"])
        for mutation in mutations
        if mutation.get("operation") == "start"
    }
    stop_nonces = {
        str(mutation["intent_nonce"])
        for mutation in mutations
        if mutation.get("operation") == "stop"
    }
    if start_nonces != group_run_ids:
        raise ReleaseEvidenceError(
            f"{label} session start mutations do not exactly match its groups"
        )
    if stop_nonces != cleanup_nonces:
        raise ReleaseEvidenceError(
            f"{label} session stop mutations do not exactly match its cleanup evidence"
        )
    if max(mutation_times[nonce][1] for nonce in cleanup_nonces) != ended_at:
        raise ReleaseEvidenceError(
            f"{label} session ended_at does not match its final operator cleanup"
        )

    descriptor = {
        "id": session_id,
        "revision": revision,
        "evidence_version": 1,
        "state": "stopped",
    }
    return CanonicalSessionEvidence(
        descriptor=descriptor,
        session=session,
        groups=tuple(groups),
        mutations=tuple(mutations),
        mutation_by_nonce=mutation_by_nonce,
    )


def validate_session_binding(payload: dict[str, object], label: str) -> dict[str, object]:
    return validate_canonical_session(payload, label).descriptor


def validate_report_identity(
    payload: dict[str, object],
    *,
    label: str,
    manifest: dict[str, object],
    payload_digest: str,
    expected_frontend_hash: str,
    expected_api_sha: str,
) -> dict[str, object]:
    identity = payload.get("evidence_identity")
    if not isinstance(identity, dict) or identity.get("schema") != "trex-webui-evidence/v1":
        raise ReleaseEvidenceError(f"{label} has no supported evidence identity")
    source = identity.get("source")
    build = identity.get("build")
    api = identity.get("api")
    if not isinstance(source, dict) or not isinstance(build, dict) or not isinstance(api, dict):
        raise ReleaseEvidenceError(f"{label} evidence identity is incomplete")
    git = source.get("git")
    if not isinstance(git, dict):
        raise ReleaseEvidenceError(f"{label} source identity has no Git metadata")
    if source.get("digest") != manifest.get("source_digest"):
        raise ReleaseEvidenceError(f"{label} source identity does not match the release manifest")
    if git.get("sha") != manifest.get("git_commit") or git.get("dirty") is not False:
        raise ReleaseEvidenceError(f"{label} Git identity is not the clean release commit")
    if nested(build, "frontend", "asset_manifest_hash") != expected_frontend_hash:
        raise ReleaseEvidenceError(f"{label} frontend assets do not match the release payload")
    if api.get("source_sha256") != expected_api_sha:
        raise ReleaseEvidenceError(f"{label} API source does not match the release payload")
    source_provenance = source.get("provenance")
    if isinstance(source_provenance, dict) and source_provenance.get("kind") == "verified-release-payload":
        if source_provenance.get("payload_digest") != payload_digest:
            raise ReleaseEvidenceError(
                f"{label} installed payload identity does not match the release archive"
            )
    gate_id = identity.get("gate_id")
    if not isinstance(gate_id, str) or not gate_id:
        raise ReleaseEvidenceError(f"{label} has no gate id")
    build_digest = build.get("digest")
    if not isinstance(build_digest, str) or not SHA256_RE.fullmatch(build_digest):
        raise ReleaseEvidenceError(f"{label} build identity digest is invalid")
    return {
        "gate_id": gate_id,
        "source_identity": source["digest"],
        "build_identity": build_digest,
        "frontend_asset_manifest_hash": expected_frontend_hash,
        "api_source_sha256": expected_api_sha,
    }


def validate_runtime_snapshot(
    value: object,
    *,
    session: dict[str, object],
    label: str,
) -> None:
    if not isinstance(value, dict) or value.get("ok") is not True:
        raise ReleaseEvidenceError(f"{label} has no successful final runtime snapshot")
    data = value.get("data")
    if not isinstance(data, dict):
        raise ReleaseEvidenceError(f"{label} final runtime snapshot has no data")
    if data.get("mutation_intent") is not None:
        raise ReleaseEvidenceError(f"{label} final runtime snapshot has a pending mutation intent")
    if data.get("authority") != session.get("authority"):
        raise ReleaseEvidenceError(
            f"{label} final runtime authority does not match the canonical traffic session"
        )
    if data.get("session") != session:
        raise ReleaseEvidenceError(
            f"{label} final runtime snapshot does not match the canonical traffic session"
        )


def validate_returned_start_prefix(
    value: object,
    *,
    evidence: CanonicalSessionEvidence,
    expected_groups: list[tuple[dict[str, object], str]],
    label: str,
) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("ok") is not True:
        raise ReleaseEvidenceError(f"{label} has no successful start result")
    data = value.get("data")
    returned = data.get("session") if isinstance(data, dict) else None
    if not isinstance(returned, dict):
        raise ReleaseEvidenceError(f"{label} start result has no returned canonical session")
    exact_object_shape(returned, SESSION_KEYS, f"{label} returned session")
    if (
        returned.get("id") != evidence.descriptor["id"]
        or returned.get("evidence_version") != 1
        or returned.get("authority") != evidence.session.get("authority")
        or returned.get("state") != "running"
        or returned.get("ended_at") is not None
    ):
        raise ReleaseEvidenceError(
            f"{label} returned session does not match the canonical runtime authority/session"
        )
    positive_integer(
        returned.get("revision"), f"{label} returned session revision"
    )
    if returned.get("started_at") != evidence.session.get("started_at"):
        raise ReleaseEvidenceError(
            f"{label} returned session started_at changed from the canonical session"
        )
    canonical_utc_timestamp(returned.get("started_at"), f"{label} returned started_at")
    returned_updated = canonical_utc_timestamp(
        returned.get("updated_at"), f"{label} returned updated_at"
    )
    if returned.get("completed_groups") != []:
        raise ReleaseEvidenceError(
            f"{label} returned session contains groups outside its active start prefix"
        )
    reconciliation = returned.get("reconciliation")
    if not isinstance(reconciliation, str) or not reconciliation.strip():
        raise ReleaseEvidenceError(f"{label} returned session reconciliation is incomplete")

    returned_groups = returned.get("groups")
    if not isinstance(returned_groups, list) or len(returned_groups) != len(expected_groups):
        raise ReleaseEvidenceError(
            f"{label} returned session does not contain its exact group prefix"
        )
    expected_mutations: list[dict[str, object]] = []
    immutable_fields = (
        "group_id",
        "run_id",
        "source",
        "plan_revision",
        "ports",
        "profile_path",
        "profile_sha256",
        "start_multiplier",
        "multiplier",
        "duration",
        "start_force",
        "start_total",
        "start_synchronized",
        "start_clear_existing",
        "started_at",
        "tunables",
        "start_evidence",
    )
    for index, ((canonical_group, hard_stop_at), raw_group) in enumerate(
        zip(expected_groups, returned_groups, strict=True)
    ):
        group_label = f"{label} returned group {index}"
        if not isinstance(raw_group, dict):
            raise ReleaseEvidenceError(f"{group_label} is not canonical")
        exact_object_shape(raw_group, GROUP_KEYS, group_label)
        if any(
            raw_group.get(field) != canonical_group.get(field)
            for field in immutable_fields
        ):
            raise ReleaseEvidenceError(
                f"{group_label} changed from its final canonical start evidence"
            )
        ports = canonical_ports(raw_group.get("ports"), f"{group_label} ports")
        if (
            raw_group.get("hard_stop_at") != hard_stop_at
            or raw_group.get("ended_at") is not None
            or raw_group.get("cleanup_evidence") is not None
            or raw_group.get("state") != "running"
            or canonical_state_map(raw_group.get("port_states"), f"{group_label} states")
            != {port: "running" for port in ports}
            or raw_group.get("updated_at") != raw_group.get("started_at")
        ):
            raise ReleaseEvidenceError(
                f"{group_label} is not the exact leased running projection"
            )
        canonical_utc_timestamp(
            raw_group.get("updated_at"), f"{group_label} updated_at"
        )
        run_id = str(canonical_group["run_id"])
        mutation = evidence.mutation_by_nonce.get(run_id)
        if mutation is None or raw_group.get("start_evidence") != mutation:
            raise ReleaseEvidenceError(
                f"{group_label} does not match its canonical start mutation"
            )
        expected_mutations.append(mutation)

    if returned.get("mutation_evidence") != expected_mutations:
        raise ReleaseEvidenceError(
            f"{label} returned session mutations do not exactly match its start prefix"
        )
    expected_updated_at = expected_groups[-1][0].get("started_at")
    if returned.get("updated_at") != expected_updated_at:
        raise ReleaseEvidenceError(
            f"{label} returned session updated_at does not match its latest start"
        )
    if returned_updated < canonical_utc_timestamp(
        returned.get("started_at"), f"{label} returned started_at"
    ):
        raise ReleaseEvidenceError(f"{label} returned session timestamps are out of order")
    return returned


def validate_standard_session_evidence(
    payload: dict[str, object], evidence: CanonicalSessionEvidence
) -> None:
    label = "Standard E2E report"
    tx_port = int(payload["tx_port"])
    rx_port = int(payload["rx_port"])
    capture = payload["capture_phase"]
    assert isinstance(capture, dict)

    attempts = payload.get("traffic_start_attempts")
    if not isinstance(attempts, list) or not attempts:
        raise ReleaseEvidenceError(
            "Standard E2E report has no final capture start descriptor"
        )
    capture_attempts = [
        item
        for item in attempts
        if isinstance(item, dict) and item.get("phase") == "capture"
    ]
    if (
        len(capture_attempts) != 1
        or attempts[-1] is not capture_attempts[0]
    ):
        raise ReleaseEvidenceError(
            "Standard E2E report does not have exactly one final capture start descriptor"
        )
    descriptor = capture_attempts[0]
    descriptor_ports = canonical_ports(
        descriptor.get("ports"), "Standard capture descriptor ports"
    )
    if descriptor_ports != [tx_port] or descriptor.get("boundary_ports") != sorted(
        [tx_port, rx_port]
    ):
        raise ReleaseEvidenceError(
            "Standard capture descriptor does not match the report ports"
        )
    if descriptor.get("status") != "stopped":
        raise ReleaseEvidenceError("Standard capture descriptor is not stopped")
    duration = finite_number(
        descriptor.get("duration"), "Standard capture descriptor duration", minimum=-1
    )
    if duration != -1:
        raise ReleaseEvidenceError("Standard capture descriptor duration is not -1")
    descriptor_session_id = canonical_uuid(
        descriptor.get("session_id"), "Standard capture descriptor session id"
    )
    descriptor_run_id = canonical_uuid(
        descriptor.get("run_id"), "Standard capture descriptor run id"
    )
    hard_stop_at = descriptor.get("hard_stop_at")
    canonical_utc_timestamp(hard_stop_at, "Standard capture descriptor hard_stop_at")
    if "pre_session_id" not in descriptor:
        raise ReleaseEvidenceError(
            "Standard capture descriptor has no pre-start session authority"
        )
    pre_session_id = descriptor.get("pre_session_id")
    if pre_session_id is not None:
        canonical_uuid(pre_session_id, "Standard capture descriptor pre-session id")
    if (
        pre_session_id == descriptor_session_id
        or descriptor.get("expected_session_id") is not None
    ):
        raise ReleaseEvidenceError(
            "Standard capture descriptor did not request a new exact session"
        )
    if (
        descriptor_session_id != evidence.descriptor["id"]
        or descriptor_run_id != descriptor_session_id
        or capture.get("session_id") != descriptor_session_id
        or capture.get("traffic_run_id") != descriptor_run_id
        or capture.get("hard_stop_at") != hard_stop_at
    ):
        raise ReleaseEvidenceError(
            "Standard capture phase does not match its exact session and run id"
        )
    if descriptor.get("pre_authority") != evidence.session.get("authority"):
        raise ReleaseEvidenceError(
            "Standard capture descriptor belongs to a different runtime authority"
        )
    if (
        capture.get("tx_port") != tx_port
        or capture.get("rx_port") != rx_port
        or not profile_path_matches(descriptor.get("profile_path"), capture.get("profile"))
        or descriptor.get("multiplier") != capture.get("multiplier")
    ):
        raise ReleaseEvidenceError(
            "Standard capture phase does not match its exact start descriptor"
        )

    if len(evidence.groups) != 1:
        raise ReleaseEvidenceError(
            "Standard E2E session must contain exactly one ad-hoc group"
        )
    group = evidence.groups[0]
    if (
        group.get("source") != "ad_hoc"
        or group.get("group_id") is not None
        or group.get("plan_revision") is not None
        or group.get("ports") != descriptor_ports
        or group.get("run_id") != descriptor_run_id
        or not profile_path_matches(descriptor.get("profile_path"), group.get("profile_path"))
        or group.get("start_multiplier") != descriptor.get("multiplier")
        or float(group.get("duration", 0)) != duration
    ):
        raise ReleaseEvidenceError(
            "Standard E2E session group does not match the final capture phase"
        )
    if (
        group.get("start_force") is not True
        or group.get("start_total") is not False
        or group.get("start_synchronized") is not False
        or group.get("start_clear_existing") is not True
    ):
        raise ReleaseEvidenceError(
            "Standard E2E session group has unexpected start flags"
        )
    cleanup = group.get("cleanup_evidence")
    assert isinstance(cleanup, dict)
    canonical_start = evidence.mutations[0]
    if (
        len(evidence.mutations) != 2
        or [item.get("operation") for item in evidence.mutations] != ["start", "stop"]
        or canonical_start.get("intent_nonce") != descriptor_run_id
        or canonical_start.get("ports") != descriptor_ports
        or evidence.mutations[1].get("intent_nonce") != cleanup.get("intent_nonce")
        or [item.get("ports") for item in evidence.mutations]
        != [descriptor_ports, descriptor_ports]
    ):
        raise ReleaseEvidenceError(
            "Standard E2E session must contain exact start and operator stop mutations"
        )
    validated_deadline = validate_hard_stop_window(
        hard_stop_at,
        prepared_at=canonical_start.get("prepared_at"),
        label="Standard capture descriptor",
    )
    returned_start = validate_returned_start_prefix(
        capture.get("start_result"),
        evidence=evidence,
        expected_groups=[(group, validated_deadline)],
        label="Standard capture phase",
    )
    if int(evidence.descriptor["revision"]) <= int(returned_start["revision"]):
        raise ReleaseEvidenceError(
            "Standard stopped session revision did not advance after its returned start"
        )
    validate_runtime_snapshot(
        nested(payload, "post_conditions", "traffic_runtime_after_stop"),
        session=evidence.session,
        label=label,
    )


def validate_standard_report(payload: dict[str, object]) -> None:
    if payload.get("workflow") != "standard-e2e" or payload.get("standard_e2e") is not True:
        raise ReleaseEvidenceError("Standard E2E report has the wrong workflow identity")
    if payload.get("verdict") != "pass":
        raise ReleaseEvidenceError("Standard E2E report verdict is not pass")
    postconditions = payload.get("post_conditions")
    if not isinstance(postconditions, dict):
        raise ReleaseEvidenceError("Standard E2E report has no postconditions")
    tx_port = payload.get("tx_port")
    rx_port = payload.get("rx_port")
    if (
        isinstance(tx_port, bool)
        or not isinstance(tx_port, int)
        or isinstance(rx_port, bool)
        or not isinstance(rx_port, int)
        or tx_port < 0
        or rx_port < 0
        or tx_port == rx_port
    ):
        raise ReleaseEvidenceError("Standard E2E report has invalid target ports")
    target_ports = sorted([tx_port, rx_port])
    if (
        postconditions.get("target_ports") != target_ports
        or postconditions.get("traffic_ports_idle") is not True
        or postconditions.get("active_ports_after_stop") != []
        or postconditions.get("ports_unowned") is not True
        or postconditions.get("acquired_ports_after_stop") != []
        or postconditions.get("owned_ports_after_stop") != {}
        or postconditions.get("runtime_ports_stopped") is not True
        or postconditions.get("runtime_ports_unowned") is not True
        or postconditions.get("capture_recorders_after_stop") != 0
    ):
        raise ReleaseEvidenceError("Standard E2E report cleanup postconditions did not pass")
    trex_config = nested(payload, "evidence_identity", "trex_config")
    config_digest = nested(trex_config, "content_sha256")
    config_summary = nested(trex_config, "summary")
    if not isinstance(config_digest, str) or not SHA256_RE.fullmatch(config_digest):
        raise ReleaseEvidenceError("Standard E2E report has no exact TRex config digest")
    if not isinstance(config_summary, dict):
        raise ReleaseEvidenceError("Standard E2E report has no TRex config summary")
    port_limit = config_summary.get("port_limit")
    interfaces = config_summary.get("interfaces")
    if (
        isinstance(port_limit, bool)
        or not isinstance(port_limit, int)
        or port_limit < 2
        or not isinstance(interfaces, list)
        or len(interfaces) != port_limit
        or any(not isinstance(item, str) or not item for item in interfaces)
    ):
        raise ReleaseEvidenceError("Standard E2E report TRex config inventory is invalid")

    latency = payload.get("latency_phase")
    capture = payload.get("capture_phase")
    if not isinstance(latency, dict) or not isinstance(capture, dict):
        raise ReleaseEvidenceError("Standard E2E report has no complete latency/capture phases")
    for phase_name, phase in (("latency", latency), ("capture", capture)):
        for counter in ("tx_packets", "rx_packets"):
            finite_number(
                phase.get(counter),
                f"Standard {phase_name} phase {counter}",
                minimum=0,
                strict_minimum=True,
            )
    latency_pg_ids = latency.get("latency_pg_ids")
    if (
        not isinstance(latency_pg_ids, list)
        or not latency_pg_ids
        or any(not isinstance(pg_id, str) or not pg_id.strip() for pg_id in latency_pg_ids)
        or len(latency_pg_ids) != len(set(latency_pg_ids))
    ):
        raise ReleaseEvidenceError("Standard E2E report has no non-empty latency PG evidence")
    finite_number(
        latency.get("latency_avg_us"),
        "Standard E2E finite latency average",
        minimum=0,
    )
    packet_count = positive_integer(
        capture.get("packet_count"), "Standard capture packet_count"
    )
    decoded_packets = positive_integer(
        capture.get("decoded_packets"), "Standard capture decoded_packets"
    )
    if decoded_packets > packet_count:
        raise ReleaseEvidenceError(
            "Standard capture decoded packet count exceeds its captured packet count"
        )
    expected_chain = capture.get("expected_layer_chain")
    observed_chain = capture.get("layer_chain")
    layer_chains = capture.get("layer_chains")
    if (
        not isinstance(expected_chain, str)
        or not expected_chain.strip()
        or not isinstance(observed_chain, str)
        or not observed_chain.strip()
        or not isinstance(layer_chains, list)
        or not layer_chains
        or any(not isinstance(chain, str) or not chain.strip() for chain in layer_chains)
        or len(layer_chains) != len(set(layer_chains))
        or expected_chain not in layer_chains
        or observed_chain not in layer_chains
    ):
        raise ReleaseEvidenceError(
            "Standard capture does not contain its expected decoded layer chain"
        )


def validate_six_port_report(payload: dict[str, object]) -> None:
    if payload.get("workflow") != "six-port-e2e":
        raise ReleaseEvidenceError("six-port report has the wrong workflow identity")
    if payload.get("verdict") != "pass":
        raise ReleaseEvidenceError("six-port report verdict is not pass")
    if payload.get("target_ports") != [0, 1, 2, 3, 4, 5]:
        raise ReleaseEvidenceError("six-port report does not cover exactly ports 0 through 5")
    group_ids = payload.get("group_ids")
    if (
        not isinstance(group_ids, list)
        or len(group_ids) != 3
        or any(not isinstance(item, str) or not item for item in group_ids)
        or len(set(group_ids)) != 3
    ):
        raise ReleaseEvidenceError("six-port report does not cover exactly three unique groups")
    positive_integer(payload.get("plan_revision"), "six-port plan revision")
    plan_groups = payload.get("plan_groups")
    if not isinstance(plan_groups, dict) or set(plan_groups) != set(group_ids):
        raise ReleaseEvidenceError("six-port report plan groups do not match its group ids")
    expected_pairs = ([0, 1], [2, 3], [4, 5])
    for group_id, expected_ports in zip(group_ids, expected_pairs, strict=True):
        group = plan_groups.get(group_id)
        if not isinstance(group, dict):
            raise ReleaseEvidenceError(
                f"six-port report plan group {group_id!r} does not match its physical pair"
            )
        exact_object_shape(
            group,
            SIX_PLAN_GROUP_KEYS,
            f"six-port report plan group {group_id!r}",
        )
        if (
            group.get("ports") != expected_ports
            or not isinstance(group.get("profile_path"), str)
            or not group.get("profile_path")
            or not isinstance(group.get("multiplier"), str)
            or not group.get("multiplier")
        ):
            raise ReleaseEvidenceError(
                f"six-port report plan group {group_id!r} does not match its physical pair"
            )
        finite_number(
            group.get("duration"),
            f"six-port report plan group {group_id!r} duration",
            minimum=-1,
        )
        for field in ("force", "total", "synchronized", "clear_existing"):
            if not isinstance(group.get(field), bool):
                raise ReleaseEvidenceError(
                    f"six-port report plan group {group_id!r} {field} is incomplete"
                )
    postconditions = payload.get("postconditions")
    if not isinstance(postconditions, dict):
        raise ReleaseEvidenceError("six-port report has no postconditions")
    if (
        postconditions.get("exact_inventory") is not True
        or postconditions.get("port_ids") != [0, 1, 2, 3, 4, 5]
        or postconditions.get("ports_idle") is not True
        or postconditions.get("links_up") is not True
        or postconditions.get("ports_unowned") is not True
        or postconditions.get("acquired_ports_after_stop") != []
        or postconditions.get("runtime_exact_inventory") is not True
        or postconditions.get("runtime_port_ids") != [0, 1, 2, 3, 4, 5]
        or postconditions.get("runtime_ports_stopped") is not True
        or postconditions.get("runtime_ports_unowned") is not True
        or postconditions.get("capture_recorders") != 0
    ):
        raise ReleaseEvidenceError("six-port report cleanup/link postconditions did not pass")
    growth = payload.get("packet_growth")
    if not isinstance(growth, dict):
        raise ReleaseEvidenceError("six-port report has no per-port packet evidence")
    for port in range(6):
        counters = growth.get(str(port), growth.get(port))
        if not isinstance(counters, dict):
            raise ReleaseEvidenceError(f"six-port report has no packet evidence for P{port}")
        for counter in ("opackets", "ipackets"):
            value = counters.get(counter)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
                raise ReleaseEvidenceError(
                    f"six-port report has no positive {counter} evidence for P{port}"
                )


def validate_six_port_session_evidence(
    payload: dict[str, object], evidence: CanonicalSessionEvidence
) -> None:
    group_ids = payload["group_ids"]
    plan_groups = payload["plan_groups"]
    plan_revision = int(payload["plan_revision"])
    assert isinstance(group_ids, list)
    assert isinstance(plan_groups, dict)
    attempts = payload.get("group_start_attempts")
    hard_stops = payload.get("group_hard_stop_at")
    if (
        not isinstance(attempts, list)
        or len(attempts) != 3
        or any(not isinstance(attempt, dict) for attempt in attempts)
    ):
        raise ReleaseEvidenceError(
            "six-port report must contain exactly three group start attempts"
        )
    if not isinstance(hard_stops, dict) or set(hard_stops) != set(group_ids):
        raise ReleaseEvidenceError(
            "six-port report must contain exactly three group hard-stop deadlines"
        )
    if len(evidence.groups) != 3:
        raise ReleaseEvidenceError(
            "six-port session must contain exactly three plan groups"
        )
    by_id: dict[str, dict[str, object]] = {}
    for group in evidence.groups:
        group_id = group.get("group_id")
        if not isinstance(group_id, str) or group_id in by_id:
            raise ReleaseEvidenceError(
                "six-port session groups do not have three unique plan identities"
            )
        by_id[group_id] = group
    if set(by_id) != set(group_ids):
        raise ReleaseEvidenceError(
            "six-port session groups do not exactly match the selected plan"
        )

    expected_start_nonces: list[str] = []
    cleanup_nonces: set[str] = set()
    expected_prefix: list[tuple[dict[str, object], str]] = []
    previous_start_revision: int | None = None
    first_pre_config: object = None
    expected_pairs = ([0, 1], [2, 3], [4, 5])
    for index, (group_id, expected_ports) in enumerate(
        zip(group_ids, expected_pairs, strict=True)
    ):
        group = by_id[str(group_id)]
        plan_group = plan_groups[str(group_id)]
        attempt = attempts[index]
        assert isinstance(plan_group, dict)
        assert isinstance(attempt, dict)
        required_attempt_fields = {
            "group_id",
            "plan_revision",
            "ports",
            "profile_path",
            "multiplier",
            "duration",
            "force",
            "total",
            "synchronized",
            "clear_existing",
            "hard_stop_at",
            "expected_session_id",
            "pre_plan_revision",
            "pre_config",
            "pre_session_id",
            "pre_authority",
            "status",
            "start_result",
            "session_id",
            "run_id",
        }
        if not required_attempt_fields.issubset(attempt):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {index} is incomplete"
            )
        expected_plan_values = {
            "ports": expected_ports,
            "profile_path": plan_group.get("profile_path"),
            "multiplier": plan_group.get("multiplier"),
            "duration": plan_group.get("duration"),
            "force": plan_group.get("force"),
            "total": plan_group.get("total"),
            "synchronized": plan_group.get("synchronized"),
            "clear_existing": plan_group.get("clear_existing"),
        }
        if (
            attempt.get("group_id") != group_id
            or attempt.get("plan_revision") != plan_revision
            or attempt.get("pre_plan_revision") != plan_revision
            or attempt.get("status") != "started"
            or any(
                attempt.get(field) != expected
                for field, expected in expected_plan_values.items()
            )
        ):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed from its exact plan"
            )
        if index == 0:
            first_pre_config = attempt.get("pre_config")
        elif attempt.get("pre_config") != first_pre_config:
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed runtime config"
            )
        if attempt.get("pre_authority") != evidence.session.get("authority"):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed runtime authority"
            )
        expected_session_id = None if index == 0 else evidence.descriptor["id"]
        pre_session_id = attempt.get("pre_session_id")
        if pre_session_id is not None:
            canonical_uuid(
                pre_session_id,
                f"six-port group start attempt {group_id!r} pre-session id",
            )
        if (
            attempt.get("expected_session_id") != expected_session_id
            or (index == 0 and pre_session_id == evidence.descriptor["id"])
            or (index > 0 and pre_session_id != evidence.descriptor["id"])
            or attempt.get("session_id") != evidence.descriptor["id"]
        ):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed session authority"
            )
        if (
            group.get("source") != "plan"
            or group.get("plan_revision") != plan_revision
            or group.get("ports") != expected_ports
            or not profile_path_matches(
                plan_group.get("profile_path"), group.get("profile_path")
            )
            or group.get("start_multiplier") != plan_group.get("multiplier")
            or group.get("multiplier") != plan_group.get("multiplier")
            or group.get("duration") != plan_group.get("duration")
            or group.get("start_force") != plan_group.get("force")
            or group.get("start_total") != plan_group.get("total")
            or group.get("start_synchronized") != plan_group.get("synchronized")
            or group.get("start_clear_existing") != plan_group.get("clear_existing")
        ):
            raise ReleaseEvidenceError(
                f"six-port session group {group_id!r} changed from its exact plan"
            )
        run_id = canonical_uuid(
            group.get("run_id"), f"six-port session group {group_id!r} run id"
        )
        if attempt.get("run_id") != run_id:
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed its exact run id"
            )
        start_mutation = evidence.mutation_by_nonce.get(run_id)
        if (
            start_mutation is None
            or start_mutation.get("operation") != "start"
            or start_mutation.get("ports") != expected_ports
        ):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} has no exact start mutation"
            )
        deadline = validate_hard_stop_window(
            attempt.get("hard_stop_at"),
            prepared_at=start_mutation.get("prepared_at"),
            label=f"six-port group start attempt {group_id!r}",
        )
        if hard_stops.get(group_id) != deadline:
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} changed its hard-stop deadline"
            )
        expected_prefix.append((group, deadline))
        returned = validate_returned_start_prefix(
            attempt.get("start_result"),
            evidence=evidence,
            expected_groups=list(expected_prefix),
            label=f"six-port group start attempt {group_id!r}",
        )
        if returned.get("id") != attempt.get("session_id"):
            raise ReleaseEvidenceError(
                f"six-port group start attempt {group_id!r} returned a different session"
            )
        returned_revision = int(returned["revision"])
        if (
            previous_start_revision is not None
            and returned_revision <= previous_start_revision
        ):
            raise ReleaseEvidenceError(
                "six-port returned start session revisions are not strictly increasing"
            )
        previous_start_revision = returned_revision
        expected_start_nonces.append(run_id)
        cleanup = group.get("cleanup_evidence")
        assert isinstance(cleanup, dict)
        cleanup_nonce = cleanup.get("intent_nonce")
        assert isinstance(cleanup_nonce, str)
        cleanup_nonces.add(cleanup_nonce)

    if len(cleanup_nonces) != 1:
        raise ReleaseEvidenceError(
            "six-port session groups do not share one exact operator stop nonce"
        )
    assert previous_start_revision is not None
    if int(evidence.descriptor["revision"]) <= previous_start_revision:
        raise ReleaseEvidenceError(
            "six-port stopped session revision did not advance after its final returned start"
        )
    stop_nonce = next(iter(cleanup_nonces))
    operations = [mutation.get("operation") for mutation in evidence.mutations]
    if (
        len(evidence.mutations) != 4
        or operations != ["start", "start", "start", "stop"]
        or [mutation.get("intent_nonce") for mutation in evidence.mutations[:3]]
        != expected_start_nonces
        or evidence.mutations[0].get("intent_nonce") != evidence.descriptor["id"]
        or [mutation.get("ports") for mutation in evidence.mutations[:3]]
        != list(expected_pairs)
        or evidence.mutations[3].get("intent_nonce") != stop_nonce
        or evidence.mutations[3].get("ports") != [0, 1, 2, 3, 4, 5]
    ):
        raise ReleaseEvidenceError(
            "six-port session must contain exactly three pair starts and one full operator stop"
        )
    validate_runtime_snapshot(
        payload.get("final_runtime"),
        session=evidence.session,
        label="six-port report",
    )


def report_descriptor(
    path: Path,
    *,
    expected_workflow: str,
    manifest: dict[str, object],
    payload_digest: str,
    expected_frontend_hash: str,
    expected_api_sha: str,
    release_contract: Any,
) -> dict[str, object]:
    document = read_strict_json(path, f"{expected_workflow} report", release_contract)
    payload = report_payload(document, f"{expected_workflow} report")
    if expected_workflow == "standard-e2e":
        validate_standard_report(payload)
    else:
        validate_six_port_report(payload)
    session_evidence = validate_canonical_session(
        payload, f"{expected_workflow} report"
    )
    if expected_workflow == "standard-e2e":
        validate_standard_session_evidence(payload, session_evidence)
    else:
        validate_six_port_session_evidence(payload, session_evidence)
    identity = validate_report_identity(
        payload,
        label=f"{expected_workflow} report",
        manifest=manifest,
        payload_digest=payload_digest,
        expected_frontend_hash=expected_frontend_hash,
        expected_api_sha=expected_api_sha,
    )
    session = session_evidence.descriptor
    digest, size = sha256_file(path, f"{expected_workflow} report")
    run_id = payload.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise ReleaseEvidenceError(f"{expected_workflow} report has no run id")
    descriptor = {
        "workflow": expected_workflow,
        "verdict": "pass",
        "file": path.name,
        "sha256": digest,
        "size": size,
        "run_id": run_id,
        "identity": identity,
        "traffic_session_binding": session,
    }
    if expected_workflow == "standard-e2e":
        trex_config = nested(payload, "evidence_identity", "trex_config")
        descriptor["qualification"] = {
            "trex_config_sha256": nested(trex_config, "content_sha256"),
            "trex_config": nested(trex_config, "summary"),
            "postconditions": payload["post_conditions"],
        }
    else:
        descriptor["qualification"] = {
            "plan_revision": payload["plan_revision"],
            "group_ids": payload["group_ids"],
            "plan_groups": payload["plan_groups"],
            "target_ports": payload["target_ports"],
            "packet_growth": payload["packet_growth"],
            "postconditions": payload["postconditions"],
        }
    return descriptor


def build_evidence_index(
    *,
    archive_path: Path,
    checksum_path: Path,
    standard_report_path: Path,
    six_port_report_path: Path,
    expected_repository: str,
    expected_release_ref: str,
    expected_signer_workflow: str,
    project_root: Path = PROJECT_ROOT,
) -> dict[str, object]:
    archive_safety, release_contract = release_modules(project_root)
    top_level, manifest = read_archive_manifest(
        archive_path,
        archive_safety,
        release_contract,
    )
    try:
        provenance = release_contract.validate_manifest_release_contract(
            manifest,
            publishable=True,
            expected_repository=expected_repository,
            expected_release_ref=expected_release_ref,
            expected_signer_workflow=expected_signer_workflow,
        )
        policy = release_contract.attestation_policy(provenance)
    except release_contract.ReleaseContractError as exc:
        raise ReleaseEvidenceError(f"release provenance contract failed: {exc}") from exc
    if manifest.get("name") != top_level or archive_path.name != f"{top_level}.tar.gz":
        raise ReleaseEvidenceError(
            "release archive basename, top-level directory, and manifest name must match"
        )
    archive_digest, archive_size, checksum_digest, checksum_size = verify_checksum_sidecar(
        archive_path,
        checksum_path,
    )
    payload_identity = manifest.get("payload_identity")
    if not isinstance(payload_identity, dict):
        raise ReleaseEvidenceError("release manifest has no payload identity")
    payload_digest = payload_identity.get("digest")
    files = payload_identity.get("files")
    if not isinstance(payload_digest, str) or not SHA256_RE.fullmatch(payload_digest):
        raise ReleaseEvidenceError("release payload digest is invalid")
    if not isinstance(files, list) or any(not isinstance(item, dict) for item in files):
        raise ReleaseEvidenceError("release payload file manifest is invalid")
    expected_frontend_hash = frontend_asset_hash(files)
    expected_api_sha = str(payload_file(files, "apps/api/app/main.py")["sha256"])
    sboms = [
        {
            "file": path,
            "sha256": payload_file(files, path)["sha256"],
            "size": payload_file(files, path)["size"],
        }
        for path in ("SBOM.web.cdx.json", "SBOM.python.cdx.json")
    ]
    reports = [
        report_descriptor(
            standard_report_path,
            expected_workflow="standard-e2e",
            manifest=manifest,
            payload_digest=payload_digest,
            expected_frontend_hash=expected_frontend_hash,
            expected_api_sha=expected_api_sha,
            release_contract=release_contract,
        ),
        report_descriptor(
            six_port_report_path,
            expected_workflow="six-port-e2e",
            manifest=manifest,
            payload_digest=payload_digest,
            expected_frontend_hash=expected_frontend_hash,
            expected_api_sha=expected_api_sha,
            release_contract=release_contract,
        ),
    ]
    return {
        "schema": RELEASE_EVIDENCE_SCHEMA,
        "release": {
            "name": manifest.get("name"),
            "version": manifest.get("version"),
            "created_at": manifest.get("created_at"),
            "repository": provenance["repository"],
            "release_ref": provenance["release_ref"],
            "release_tag": provenance["release_tag"],
            "source_sha": provenance["source_sha"],
            "source_digest": manifest.get("source_digest"),
            "payload_digest": payload_digest,
            "signer_workflow": provenance["signer_workflow"],
            "signer_workflow_ref": provenance["signer_workflow_ref"],
            "signer_workflow_sha": provenance["signer_workflow_sha"],
        },
        "attestation_policy": policy,
        "artifacts": {
            "release_archive": {
                "file": archive_path.name,
                "sha256": archive_digest,
                "size": archive_size,
            },
            "checksum_sidecar": {
                "file": checksum_path.name,
                "sha256": checksum_digest,
                "size": checksum_size,
            },
            "sboms": sboms,
        },
        "acceptance": reports,
    }


def publish_json(path: Path, payload: object) -> None:
    if path.exists() or path.is_symlink():
        raise ReleaseEvidenceError(f"refusing to replace existing evidence index: {path}")
    parent = path.parent
    try:
        metadata = parent.lstat()
    except OSError as exc:
        raise ReleaseEvidenceError(f"cannot inspect evidence output directory {parent}: {exc}") from exc
    if not stat.S_ISDIR(metadata.st_mode) or parent.is_symlink():
        raise ReleaseEvidenceError(f"evidence output directory is unsafe: {parent}")
    content = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            dir=parent,
            delete=False,
        ) as target:
            temporary_path = Path(target.name)
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(temporary_path, 0o644)
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise ReleaseEvidenceError(f"cannot publish evidence index {path}: {exc}") from exc


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--archive", required=True)
    parser.add_argument("--checksum")
    parser.add_argument("--standard-report", required=True)
    parser.add_argument("--six-port-report", required=True)
    parser.add_argument("--expected-repository", required=True)
    parser.add_argument("--expected-release-ref", required=True)
    parser.add_argument("--expected-signer-workflow", required=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create or verify a deterministic TRex WebUI release evidence index"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create")
    add_common_arguments(create)
    create.add_argument("--output", required=True)
    verify = subparsers.add_parser("verify")
    add_common_arguments(verify)
    verify.add_argument("--evidence", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    archive_path = Path(args.archive)
    checksum_path = Path(args.checksum) if args.checksum else Path(f"{archive_path}.sha256")
    try:
        index = build_evidence_index(
            archive_path=archive_path,
            checksum_path=checksum_path,
            standard_report_path=Path(args.standard_report),
            six_port_report_path=Path(args.six_port_report),
            expected_repository=args.expected_repository,
            expected_release_ref=args.expected_release_ref,
            expected_signer_workflow=args.expected_signer_workflow,
        )
        if args.command == "create":
            publish_json(Path(args.output), index)
        else:
            _archive_safety, release_contract = release_modules()
            observed = read_strict_json(
                Path(args.evidence),
                "release evidence index",
                release_contract,
            )
            if observed != index:
                raise ReleaseEvidenceError(
                    "release evidence index does not exactly match the supplied artifacts"
                )
        print(json.dumps(index, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (OSError, ReleaseEvidenceError) as exc:
        print(f"release evidence error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
