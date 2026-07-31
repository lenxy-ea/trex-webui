from __future__ import annotations

import json
import os
import stat
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.trex.traffic_hard_stop import (
    canonical_utc_timestamp,
    parse_utc_timestamp,
)


RUNTIME_STATE_VERSION = 2
RUNTIME_STATE_MAX_BYTES = 1024 * 1024
_STORE_LOCKS_GUARD = threading.Lock()
_STORE_LOCKS: dict[Path, threading.RLock] = {}


class RuntimeStateError(RuntimeError):
    pass


class StrictRuntimeStateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class RuntimeConnectionState(StrictRuntimeStateModel):
    host: str = Field(min_length=1, max_length=253)
    sync_port: int = Field(ge=1, le=65535)
    async_port: int = Field(ge=1, le=65535)
    scapy_port: int = Field(ge=1, le=65535)
    client_name: str = Field(min_length=1, max_length=64)
    connect_timeout_seconds: int = Field(ge=1, le=300)
    updated_at: str


class RuntimeAuthorityIdentity(StrictRuntimeStateModel):
    host: str = Field(min_length=1, max_length=253)
    sync_port: int = Field(ge=1, le=65535)
    async_port: int = Field(ge=1, le=65535)
    scapy_port: int = Field(ge=1, le=65535)
    daemon_supervisor: Literal["external", "systemd"]
    generation: str = Field(min_length=1, max_length=64)

    @field_validator("host")
    @classmethod
    def host_must_be_clean(cls, value: str) -> str:
        if value != value.strip() or "\x00" in value:
            raise ValueError("runtime authority host must be clean")
        return value

    @model_validator(mode="after")
    def generation_must_match_supervisor_authority(self) -> "RuntimeAuthorityIdentity":
        candidate = (
            self.generation.removeprefix("process:")
            if self.daemon_supervisor == "external"
            else self.generation
        )
        if self.daemon_supervisor == "external" and not self.generation.startswith(
            "process:"
        ):
            raise ValueError("external runtime authority must use a process generation")
        try:
            parsed = uuid.UUID(candidate)
        except (AttributeError, ValueError) as exc:
            raise ValueError("runtime authority generation must be a canonical UUID") from exc
        if str(parsed) != candidate:
            raise ValueError("runtime authority generation must be a canonical UUID")
        return self


class CaptureRecorderIdentityState(StrictRuntimeStateModel):
    capture_id: int = Field(ge=0)
    tx_ports: list[int] = Field(default_factory=list)
    rx_ports: list[int] = Field(default_factory=list)
    bpf_filter: str = Field(max_length=1024)

    @field_validator("tx_ports", "rx_ports")
    @classmethod
    def ports_must_be_unique_and_non_negative(cls, value: list[int]) -> list[int]:
        if any(port < 0 for port in value):
            raise ValueError("capture recorder identity ports must be non-negative")
        if len(value) != len(set(value)):
            raise ValueError("capture recorder identity ports must be unique")
        return value


class CaptureLeaseState(StrictRuntimeStateModel):
    capture_id: int | str
    recovery_phase: Literal[
        "active",
        "preparing",
        "pending_start",
        "cleanup_required",
    ] = "active"
    preparation_stage: Literal[
        "wal",
        "acquire_intent",
        "acquired",
        "service_intent",
        "service_enabled",
        "restore_intent",
        "service_restored",
        "release_intent",
        "ports_released",
    ] | None = None
    baseline_capture_ids: list[int] = Field(default_factory=list)
    baseline_recorders: list[CaptureRecorderIdentityState] = Field(
        default_factory=list
    )
    pre_acquired_ports: list[int] = Field(default_factory=list)
    acquire_planned_ports: list[int] = Field(default_factory=list)
    service_enable_planned_ports: list[int] = Field(default_factory=list)
    authority: RuntimeAuthorityIdentity
    preparation_service_states: dict[int, dict[str, Any]] = Field(
        default_factory=dict
    )
    service_states: dict[int, dict[str, Any]] = Field(default_factory=dict)
    tx_ports: list[int]
    rx_ports: list[int]
    bpf_filter: str = Field(max_length=1024)
    ports: list[int]
    acquired_ports: list[int] = Field(default_factory=list)

    @field_validator(
        "baseline_capture_ids",
        "pre_acquired_ports",
        "acquire_planned_ports",
        "service_enable_planned_ports",
        "tx_ports",
        "rx_ports",
        "ports",
        "acquired_ports",
    )
    @classmethod
    def ports_must_be_unique_and_non_negative(cls, value: list[int]) -> list[int]:
        if any(port < 0 for port in value):
            raise ValueError("capture lease integer lists must be non-negative")
        if len(value) != len(set(value)):
            raise ValueError("capture lease integer lists must be unique")
        return value

    @model_validator(mode="after")
    def acquired_ports_must_belong_to_capture(self) -> "CaptureLeaseState":
        if self.recovery_phase in {"active", "cleanup_required"}:
            if (
                isinstance(self.capture_id, bool)
                or not isinstance(self.capture_id, int)
                or self.capture_id < 0
            ):
                raise ValueError(
                    "active or cleanup-required capture lease id must be a "
                    "non-negative integer"
                )
            if self.baseline_capture_ids:
                raise ValueError(
                    "active or cleanup-required capture lease cannot include "
                    "pending-start baseline ids"
                )
            if self.baseline_recorders:
                raise ValueError(
                    "active or cleanup-required capture lease cannot include "
                    "pending-start baseline recorders"
                )
        else:
            if not isinstance(self.capture_id, str) or not self.capture_id.startswith(
                "pending-start:"
            ):
                raise ValueError(
                    "unresolved capture lease id must use the pending-start namespace"
                )
            try:
                pending_id = uuid.UUID(self.capture_id.removeprefix("pending-start:"))
            except ValueError as exc:
                raise ValueError(
                    "pending capture lease id must contain a canonical UUID"
                ) from exc
            if str(pending_id) != self.capture_id.removeprefix("pending-start:"):
                raise ValueError(
                    "pending capture lease id must contain a canonical UUID"
                )
        directional_ports = set(self.tx_ports).union(self.rx_ports)
        if not directional_ports:
            raise ValueError("capture lease must include at least one TX or RX port")
        if directional_ports != set(self.ports):
            raise ValueError("capture lease ports must equal the union of TX and RX ports")
        if not set(self.acquired_ports).issubset(self.ports):
            raise ValueError("capture lease acquired_ports must be a subset of ports")
        if any(port < 0 for port in self.service_states):
            raise ValueError("capture lease service state ports must be non-negative")
        if any(port < 0 for port in self.preparation_service_states):
            raise ValueError(
                "capture preparation service state ports must be non-negative"
            )
        preparation_lists = (
            self.pre_acquired_ports,
            self.acquire_planned_ports,
            self.service_enable_planned_ports,
        )
        if any(not set(values).issubset(self.ports) for values in preparation_lists):
            raise ValueError("capture preparation ports must be a subset of ports")
        baseline_recorder_ids = [
            recorder.capture_id
            for recorder in self.baseline_recorders
        ]
        if len(baseline_recorder_ids) != len(set(baseline_recorder_ids)):
            raise ValueError("capture baseline recorder ids must be unique")
        if set(baseline_recorder_ids) != set(self.baseline_capture_ids):
            raise ValueError(
                "capture baseline recorder identities must exactly match baseline ids"
            )

        if self.recovery_phase == "preparing":
            if self.preparation_stage is None:
                raise ValueError("preparing capture lease must include its durable stage")
            if set(self.preparation_service_states) != set(self.ports):
                raise ValueError(
                    "preparing capture lease must include an exact service-mode snapshot"
                )
            if set(self.pre_acquired_ports).intersection(self.acquire_planned_ports):
                raise ValueError(
                    "preparing capture pre-acquired and planned ports must not overlap"
                )
            if set(self.pre_acquired_ports).union(self.acquire_planned_ports) != set(
                self.ports
            ):
                raise ValueError(
                    "preparing capture acquisition snapshot must partition its ports"
                )
            expected_service_plan = {
                port
                for port, state in self.preparation_service_states.items()
                if state.get("enabled") is False
            }
            if set(self.service_enable_planned_ports) != expected_service_plan:
                raise ValueError(
                    "preparing capture service plan must match its exact pre-state"
                )
            expected_acquired_ports = (
                set()
                if self.preparation_stage in {"wal", "acquire_intent"}
                else set(self.acquire_planned_ports)
            )
            if set(self.acquired_ports) != expected_acquired_ports:
                raise ValueError(
                    "preparing capture confirmed acquisitions do not match its stage"
                )
        else:
            if (
                self.preparation_stage is not None
                or any(preparation_lists)
                or self.preparation_service_states
            ):
                raise ValueError(
                    "only a preparing capture lease may include preparation state"
                )
        return self


class TrafficGroupState(StrictRuntimeStateModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    name: str = Field(min_length=1, max_length=128)
    ports: list[int] = Field(min_length=1)
    profile_path: str = Field(min_length=1, max_length=1024)
    multiplier: str = Field(default="1", min_length=1, max_length=64)
    duration: float = Field(default=-1, ge=-1)
    force: bool = False
    total: bool = False
    synchronized: bool = False
    clear_existing: bool = True
    tunables: dict[str, Any] = Field(default_factory=dict)

    @field_validator("ports")
    @classmethod
    def group_ports_must_be_unique_and_non_negative(cls, value: list[int]) -> list[int]:
        if any(port < 0 for port in value):
            raise ValueError("traffic group ports must be non-negative")
        if len(value) != len(set(value)):
            raise ValueError("traffic group ports must be unique")
        return value


class TrafficSessionGroupState(StrictRuntimeStateModel):
    group_id: str | None = None
    ports: list[int] = Field(min_length=1)
    profile_path: str
    multiplier: str
    duration: float
    hard_stop_at: str | None = None
    tunables: dict[str, Any] = Field(default_factory=dict)
    state: Literal["running", "paused", "stopped", "mixed", "unknown"]
    port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    updated_at: str

    @field_validator("ports")
    @classmethod
    def session_ports_must_be_unique_and_non_negative(cls, value: list[int]) -> list[int]:
        if any(port < 0 for port in value):
            raise ValueError("traffic session ports must be non-negative")
        if len(value) != len(set(value)):
            raise ValueError("traffic session ports must be unique")
        return value

    @field_validator("hard_stop_at")
    @classmethod
    def hard_stop_must_be_canonical_utc(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None
        if canonical_utc_timestamp(parse_utc_timestamp(value)) != value:
            raise ValueError("traffic hard_stop_at must use canonical UTC form")
        return value

    @model_validator(mode="after")
    def port_states_must_exactly_describe_group(self) -> "TrafficSessionGroupState":
        expected_ports = set(self.ports)
        observed_ports = set(self.port_states)
        if observed_ports != expected_ports:
            raise ValueError(
                "traffic session group port_states keys must equal ports"
            )
        states = set(self.port_states.values())
        if not states:
            aggregate = "stopped"
        elif "unknown" in states:
            aggregate = "unknown"
        elif len(states) == 1:
            aggregate = next(iter(states))
        else:
            aggregate = "mixed"
        if self.state != aggregate:
            raise ValueError(
                f"traffic session group state must aggregate port_states as {aggregate}"
            )
        return self


class TrafficSessionState(StrictRuntimeStateModel):
    id: str
    authority: RuntimeAuthorityIdentity
    state: Literal["running", "paused", "stopped", "mixed", "unknown"]
    started_at: str
    updated_at: str
    ended_at: str | None = None
    groups: list[TrafficSessionGroupState] = Field(default_factory=list)
    reconciliation: str | None = None

    @model_validator(mode="after")
    def session_group_ports_must_not_overlap(self) -> "TrafficSessionState":
        assigned_ports: set[int] = set()
        for group in self.groups:
            overlap = assigned_ports.intersection(group.ports)
            if overlap:
                raise ValueError(f"traffic session group ports must not overlap: {sorted(overlap)}")
            assigned_ports.update(group.ports)
        states = {group.state for group in self.groups}
        if not states:
            aggregate = "stopped"
        elif "unknown" in states:
            aggregate = "unknown"
        elif len(states) == 1:
            aggregate = next(iter(states))
        else:
            aggregate = "mixed"
        if self.state != aggregate:
            raise ValueError(
                f"traffic session state must aggregate group states as {aggregate}"
            )
        return self


class TrafficMutationIntentState(StrictRuntimeStateModel):
    nonce: str = Field(min_length=36, max_length=36)
    phase: Literal["prepared", "cleanup_required"] = "prepared"
    operation: Literal["start", "stop", "pause", "resume", "update"]
    hardware_stage: Literal[
        "prepared",
        "acquire_intent",
        "acquired",
        "streams_remove_intent",
        "streams_removed",
        "profile_add_intent",
        "profile_added",
        "start_intent",
        "start_returned",
    ] = "prepared"
    authority: RuntimeAuthorityIdentity
    expected_session_id: str | None = Field(default=None, min_length=1, max_length=64)
    ports: list[int] = Field(min_length=1)
    baseline_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    desired_port_states: dict[
        int,
        Literal["running", "paused", "stopped", "unknown"],
    ]
    session_before: TrafficSessionState | None = None
    start_group: TrafficSessionGroupState | None = None
    start_profile_sha256: str | None = Field(
        default=None,
        min_length=64,
        max_length=64,
        pattern=r"^[0-9a-f]{64}$",
    )
    start_clear_existing: bool | None = None
    start_force: bool | None = None
    start_total: bool | None = None
    start_synchronized: bool | None = None
    baseline_stream_ids: dict[int, list[int]] | None = None
    baseline_acquired_ports: list[int] = Field(default_factory=list)
    update_multiplier: str | None = Field(default=None, min_length=1, max_length=64)
    update_force: bool | None = None
    update_total: bool | None = None
    superseded_intent_nonce: str | None = Field(
        default=None,
        min_length=36,
        max_length=36,
    )
    superseded_intent_operation: Literal[
        "start",
        "stop",
        "pause",
        "resume",
        "update",
    ] | None = None
    superseded_intent_ports: list[int] | None = None
    superseded_reason: str | None = Field(
        default=None,
        min_length=1,
        max_length=512,
    )
    prepared_at: str
    reconciliation: str | None = None

    @field_validator("nonce")
    @classmethod
    def nonce_must_be_a_canonical_uuid(cls, value: str) -> str:
        try:
            parsed = uuid.UUID(value)
        except ValueError as exc:
            raise ValueError("traffic mutation nonce must be a canonical UUID") from exc
        if str(parsed) != value:
            raise ValueError("traffic mutation nonce must be a canonical UUID")
        return value

    @field_validator("superseded_intent_nonce")
    @classmethod
    def superseded_nonce_must_be_a_canonical_uuid(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None
        try:
            parsed = uuid.UUID(value)
        except ValueError as exc:
            raise ValueError(
                "superseded traffic mutation nonce must be a canonical UUID"
            ) from exc
        if str(parsed) != value:
            raise ValueError(
                "superseded traffic mutation nonce must be a canonical UUID"
            )
        return value

    @field_validator("ports", "baseline_acquired_ports")
    @classmethod
    def mutation_ports_must_be_unique_and_non_negative(
        cls,
        value: list[int],
    ) -> list[int]:
        if any(port < 0 for port in value):
            raise ValueError("traffic mutation ports must be non-negative")
        if len(value) != len(set(value)):
            raise ValueError("traffic mutation ports must be unique")
        return value

    @field_validator("superseded_intent_ports")
    @classmethod
    def superseded_ports_must_be_unique_and_non_negative(
        cls,
        value: list[int] | None,
    ) -> list[int] | None:
        if value is None:
            return None
        if any(port < 0 for port in value):
            raise ValueError(
                "superseded traffic mutation ports must be non-negative"
            )
        if len(value) != len(set(value)):
            raise ValueError(
                "superseded traffic mutation ports must be unique"
            )
        return value

    @model_validator(mode="after")
    def mutation_evidence_must_be_exact(self) -> "TrafficMutationIntentState":
        target_ports = set(self.ports)
        if not target_ports.issubset(self.baseline_port_states):
            raise ValueError(
                "traffic mutation baseline must include every target port"
            )
        if set(self.desired_port_states) != target_ports:
            raise ValueError(
                "traffic mutation desired states must exactly match target ports"
            )
        if "unknown" in self.baseline_port_states.values():
            raise ValueError(
                "traffic mutation baseline cannot contain unknown port states"
            )
        if "unknown" in self.desired_port_states.values():
            raise ValueError(
                "traffic mutation desired states cannot contain unknown port states"
            )
        if not set(self.baseline_acquired_ports).issubset(target_ports):
            raise ValueError(
                "traffic mutation acquired-port baseline must be within target ports"
            )
        superseded_fields = (
            self.superseded_intent_nonce,
            self.superseded_intent_operation,
            self.superseded_intent_ports,
            self.superseded_reason,
        )
        if any(value is not None for value in superseded_fields):
            if any(value is None for value in superseded_fields):
                raise ValueError(
                    "superseded traffic mutation evidence must be complete"
                )
            if (
                self.operation != "stop"
                or self.superseded_intent_operation == "start"
            ):
                raise ValueError(
                    "only a hard stop may supersede a non-start traffic mutation"
                )
            if not set(self.superseded_intent_ports or []).issubset(
                target_ports
            ):
                raise ValueError(
                    "superseded traffic mutation ports must be within the "
                    "exact hard-stop target"
                )

        if self.expected_session_id is None:
            if self.operation != "start":
                raise ValueError(
                    "only a new traffic start may omit the expected session id"
                )
        elif (
            self.session_before is None
            or self.session_before.id != self.expected_session_id
        ):
            raise ValueError(
                "traffic mutation session snapshot must match its expected id"
            )

        if self.operation == "start":
            if self.start_group is None:
                raise ValueError("traffic start intent must include its exact group")
            if self.start_profile_sha256 is None:
                raise ValueError(
                    "traffic start intent must include its profile content identity"
                )
            if set(self.start_group.ports) != target_ports:
                raise ValueError(
                    "traffic start intent group ports must match target ports"
                )
            if set(self.start_group.port_states.values()) != {"running"}:
                raise ValueError(
                    "traffic start intent group must target running ports"
                )
            if set(self.desired_port_states.values()) != {"running"}:
                raise ValueError(
                    "traffic start intent desired state must be running"
                )
            if self.start_clear_existing is None:
                raise ValueError(
                    "traffic start intent must include clear_existing"
                )
            if (
                self.start_force is None
                or self.start_total is None
                or self.start_synchronized is None
            ):
                raise ValueError(
                    "traffic start intent must include its exact start flags"
                )
            if self.baseline_stream_ids is None:
                if self.hardware_stage not in {"prepared", "acquire_intent"}:
                    raise ValueError(
                        "traffic start must persist exact stream evidence "
                        "immediately after acquisition"
                    )
            elif set(self.baseline_stream_ids) != target_ports:
                raise ValueError(
                    "traffic start stream evidence must exactly cover target ports"
                )
            if any(
                isinstance(stream_id, bool)
                or not isinstance(stream_id, int)
                or stream_id < 0
                for stream_ids in (self.baseline_stream_ids or {}).values()
                for stream_id in stream_ids
            ):
                raise ValueError(
                    "traffic start stream ids must be non-negative integers"
                )
            if any(
                len(stream_ids) != len(set(stream_ids))
                for stream_ids in (self.baseline_stream_ids or {}).values()
            ):
                raise ValueError(
                    "traffic start stream ids must be unique per port"
                )
            if any(
                value is not None
                for value in (
                    self.update_multiplier,
                    self.update_force,
                    self.update_total,
                )
            ):
                raise ValueError(
                    "traffic start intent cannot include update parameters"
                )
        elif self.operation == "update":
            if (
                self.start_group is not None
                or self.start_profile_sha256 is not None
                or self.start_clear_existing is not None
                or self.start_force is not None
                or self.start_total is not None
                or self.start_synchronized is not None
                or self.baseline_stream_ids is not None
                or self.hardware_stage != "prepared"
                or self.update_multiplier is None
            ):
                raise ValueError(
                    "traffic update intent must include only update parameters"
                )
            if self.update_force is None or self.update_total is None:
                raise ValueError(
                    "traffic update intent must include force and total flags"
                )
            if any(
                self.desired_port_states[port]
                != self.baseline_port_states[port]
                for port in self.ports
            ):
                raise ValueError(
                    "traffic update intent cannot change port run state"
                )
        else:
            if (
                self.start_group is not None
                or self.start_profile_sha256 is not None
                or self.start_clear_existing is not None
                or self.start_force is not None
                or self.start_total is not None
                or self.start_synchronized is not None
                or self.baseline_stream_ids is not None
                or self.hardware_stage != "prepared"
                or any(
                value is not None
                for value in (
                    self.update_multiplier,
                    self.update_force,
                    self.update_total,
                )
                )
            ):
                raise ValueError(
                    "traffic action intent cannot include start or update data"
                )
            desired_state = {
                "stop": "stopped",
                "pause": "paused",
                "resume": "running",
            }[self.operation]
            if set(self.desired_port_states.values()) != {desired_state}:
                raise ValueError(
                    f"traffic {self.operation} intent has an invalid desired state"
                )
        return self


class RuntimeStateDocument(StrictRuntimeStateModel):
    version: Literal[RUNTIME_STATE_VERSION] = RUNTIME_STATE_VERSION
    revision: int = Field(default=0, ge=0)
    connection: RuntimeConnectionState | None = None
    capture_leases: list[CaptureLeaseState] = Field(default_factory=list)
    traffic_plan_revision: int = Field(default=0, ge=0)
    traffic_groups: list[TrafficGroupState] = Field(default_factory=list)
    traffic_session: TrafficSessionState | None = None
    traffic_mutation_intent: TrafficMutationIntentState | None = None
    updated_at: str | None = None

    @model_validator(mode="after")
    def runtime_authorities_must_be_unambiguous(self) -> "RuntimeStateDocument":
        capture_ids = [str(lease.capture_id) for lease in self.capture_leases]
        if len(capture_ids) != len(set(capture_ids)):
            raise ValueError("capture lease ids must be unique")
        pending_starts = [
            lease
            for lease in self.capture_leases
            if lease.recovery_phase in {"preparing", "pending_start"}
        ]
        if len(pending_starts) > 1:
            raise ValueError("only one pending capture start may exist")

        group_ids = [group.id for group in self.traffic_groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("traffic group ids must be unique")
        assigned_ports: set[int] = set()
        for group in self.traffic_groups:
            overlap = assigned_ports.intersection(group.ports)
            if overlap:
                raise ValueError(f"traffic group ports must not overlap: {sorted(overlap)}")
            assigned_ports.update(group.ports)
        if (
            self.traffic_mutation_intent is not None
            and self.traffic_mutation_intent.session_before
            != self.traffic_session
        ):
            raise ValueError(
                "traffic mutation intent must preserve the exact pre-mutation session"
            )
        return self


RuntimeStateMutation = Callable[[RuntimeStateDocument], RuntimeStateDocument | None]


class RuntimeStateStore:
    """Crash-safe, single-authority runtime state for the managed API process."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._validate_path()
        normalized_path = Path(os.path.normpath(str(path)))
        with _STORE_LOCKS_GUARD:
            self._lock = _STORE_LOCKS.setdefault(normalized_path, threading.RLock())

    def load(self) -> RuntimeStateDocument:
        with self._lock:
            return self._load_unlocked()

    def update(self, mutation: RuntimeStateMutation) -> RuntimeStateDocument:
        with self._lock:
            current = self._load_unlocked()
            candidate = mutation(current.model_copy(deep=True))
            if candidate is None:
                return current
            updated = candidate
            updated.revision = current.revision + 1
            updated.updated_at = utc_now_iso()
            validated = RuntimeStateDocument.model_validate(updated.model_dump(mode="python"))
            self._write_unlocked(validated)
            return validated

    def _validate_path(self) -> None:
        raw = str(self.path)
        if not raw or raw != raw.strip() or "\x00" in raw or not self.path.is_absolute():
            raise RuntimeStateError("runtime state path must be a clean absolute path")

    def _load_unlocked(self) -> RuntimeStateDocument:
        try:
            file_stat = self.path.lstat()
        except FileNotFoundError:
            return RuntimeStateDocument()
        except OSError as exc:
            raise RuntimeStateError(f"cannot inspect runtime state: {exc}") from exc

        if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
            raise RuntimeStateError("runtime state must be a non-symlink regular file")
        if file_stat.st_size > RUNTIME_STATE_MAX_BYTES:
            raise RuntimeStateError("runtime state exceeds the maximum supported size")

        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return RuntimeStateDocument.model_validate(payload)
        except (OSError, UnicodeError, json.JSONDecodeError, ValidationError) as exc:
            raise RuntimeStateError(f"runtime state is invalid: {exc}") from exc

    def _write_unlocked(self, state: RuntimeStateDocument) -> None:
        parent = self.path.parent
        try:
            parent_stat = parent.lstat()
        except OSError as exc:
            raise RuntimeStateError(f"runtime state directory is unavailable: {exc}") from exc
        if stat.S_ISLNK(parent_stat.st_mode) or not stat.S_ISDIR(parent_stat.st_mode):
            raise RuntimeStateError("runtime state directory must be a non-symlink directory")

        encoded = (
            json.dumps(
                state.model_dump(mode="json"),
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
        if len(encoded) > RUNTIME_STATE_MAX_BYTES:
            raise RuntimeStateError("runtime state exceeds the maximum supported size")

        descriptor = -1
        temporary_path: str | None = None
        try:
            descriptor, temporary_path = tempfile.mkstemp(
                prefix=f".{self.path.name}.",
                dir=parent,
            )
            os.fchmod(descriptor, 0o640)
            with os.fdopen(descriptor, "wb", closefd=True) as handle:
                descriptor = -1
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_path, self.path)
            temporary_path = None
            directory_descriptor = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError as exc:
            raise RuntimeStateError(f"cannot persist runtime state: {exc}") from exc
        finally:
            if descriptor >= 0:
                os.close(descriptor)
            if temporary_path is not None:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass
