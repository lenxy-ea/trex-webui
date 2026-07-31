from __future__ import annotations

import json
import math
import os
import stat
import tempfile
import threading
import uuid
import weakref
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.core.settings import TrexEnvironment
from app.trex.result import TrexCallResult
from app.trex.runtime_mutation import runtime_mutation_fence
from app.trex.runtime_state import RuntimeStateError
from app.trex.traffic_hard_stop import (
    TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS,
    TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS,
    canonical_utc_timestamp,
    parse_utc_timestamp,
    utc_now,
)


QUICK_VALIDATION_STATE_VERSION = 1
QUICK_VALIDATION_STATE_MAX_BYTES = 512 * 1024
QUICK_VALIDATION_SAMPLE_LIMIT = 128
QUICK_VALIDATION_CONFIRMATION = "start-quick-validation"
QUICK_VALIDATION_CANCEL_CONFIRMATION = "cancel-quick-validation"

QuickValidationPhase = Literal[
    "preflight",
    "running",
    "stopping",
    "pass",
    "fail",
    "cancelled",
]
QuickValidationTerminalPhase = Literal["pass", "fail", "cancelled"]
QuickValidationPendingTerminal = Literal["pass", "fail", "cancelled"]
_TERMINAL_PHASES = frozenset({"pass", "fail", "cancelled"})

_STORE_LOCKS_GUARD = threading.Lock()
_STORE_LOCKS: dict[Path, threading.RLock] = {}
_AUTHORITIES_LOCK = threading.Lock()
_AUTHORITIES: weakref.WeakKeyDictionary[Any, "QuickValidationAuthority"] = (
    weakref.WeakKeyDictionary()
)


class QuickValidationStateError(RuntimeStateError):
    pass


class QuickValidationService(Protocol):
    env: TrexEnvironment

    def snapshot(self) -> TrexCallResult: ...

    def traffic_runtime_snapshot(self) -> TrexCallResult: ...

    def start_traffic_group(
        self,
        group_id: str,
        expected_revision: int,
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult: ...

    def traffic_action(
        self,
        action: str,
        ports: list[int] | None,
        expected_session_id: str | None = None,
    ) -> TrexCallResult: ...

    def stats(self, ports: list[int] | None = None) -> TrexCallResult: ...


class StrictQuickValidationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _canonical_uuid(value: str, label: str) -> str:
    try:
        parsed = uuid.UUID(value)
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"{label} must be a canonical UUID") from exc
    if str(parsed) != value:
        raise ValueError(f"{label} must be a canonical UUID")
    return value


def _canonical_timestamp(value: str, label: str) -> str:
    try:
        parsed = parse_utc_timestamp(value)
    except ValueError as exc:
        raise ValueError(f"{label} must be an absolute UTC timestamp") from exc
    if canonical_utc_timestamp(parsed) != value:
        raise ValueError(f"{label} must use canonical UTC form")
    return value


def _strict_evidence_ports(value: Any, label: str) -> list[int]:
    if not isinstance(value, list):
        raise QuickValidationStateError(f"{label} must be a port list")
    normalized: list[int] = []
    seen: set[int] = set()
    for raw_port in value:
        if type(raw_port) is not int or raw_port < 0:
            raise QuickValidationStateError(
                f"{label} must contain only non-negative integer ports"
            )
        if raw_port in seen:
            raise QuickValidationStateError(f"{label} must not contain duplicates")
        normalized.append(raw_port)
        seen.add(raw_port)
    return normalized


def _strict_stopped_port_states(value: Any, label: str) -> dict[int, str]:
    if not isinstance(value, dict):
        raise QuickValidationStateError(f"{label} must be a port-state object")
    normalized: dict[int, str] = {}
    for raw_port, state in value.items():
        if type(raw_port) is int:
            port = raw_port
        elif (
            type(raw_port) is str
            and raw_port.isascii()
            and raw_port.isdecimal()
            and raw_port == str(int(raw_port))
        ):
            port = int(raw_port)
        else:
            raise QuickValidationStateError(
                f"{label} contains a non-canonical port key"
            )
        if port < 0:
            raise QuickValidationStateError(
                f"{label} contains a negative port key"
            )
        if port in normalized:
            raise QuickValidationStateError(
                f"{label} contains duplicate normalized port keys"
            )
        if state != "stopped":
            raise QuickValidationStateError(
                f"{label} must report every target port as stopped"
            )
        normalized[port] = state
    return normalized


class QuickValidationStartRequest(StrictQuickValidationModel):
    expected_run_id: str | None
    expected_run_revision: int | None = Field(ge=1)
    group_id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[a-z0-9][a-z0-9._-]*$",
    )
    plan_revision: int = Field(ge=0)
    duration_seconds: int = Field(ge=1, le=60)
    confirmation: str | None = None

    @field_validator("expected_run_id")
    @classmethod
    def expected_id_must_be_canonical(
        cls,
        value: str | None,
    ) -> str | None:
        return (
            None
            if value is None
            else _canonical_uuid(value, "expected quick-validation run id")
        )

    @model_validator(mode="after")
    def expected_run_cas_must_be_complete(self) -> "QuickValidationStartRequest":
        if (self.expected_run_id is None) != (
            self.expected_run_revision is None
        ):
            raise ValueError(
                "expected_run_id and expected_run_revision must be supplied "
                "together, including explicit null/null for the first run"
            )
        return self


class QuickValidationCancelRequest(StrictQuickValidationModel):
    run_id: str
    run_revision: int = Field(ge=1)
    confirmation: str | None = None

    @field_validator("run_id")
    @classmethod
    def run_id_must_be_canonical(cls, value: str) -> str:
        return _canonical_uuid(value, "quick-validation run id")


class QuickValidationPortCounters(StrictQuickValidationModel):
    tx_packets: float = Field(ge=0)
    rx_packets: float = Field(ge=0)


class QuickValidationPortSample(StrictQuickValidationModel):
    port: int = Field(ge=0)
    absolute_tx_packets: float = Field(ge=0)
    absolute_rx_packets: float = Field(ge=0)
    tx_packets: float = Field(ge=0)
    rx_packets: float = Field(ge=0)
    loss_packets: float = Field(ge=0)
    loss_ratio: float = Field(ge=0, le=1)


class QuickValidationSample(StrictQuickValidationModel):
    sampled_at: str
    ports: list[QuickValidationPortSample] = Field(min_length=1)
    total_tx_packets: float = Field(ge=0)
    total_rx_packets: float = Field(ge=0)
    total_loss_packets: float = Field(ge=0)
    total_loss_ratio: float = Field(ge=0, le=1)

    @field_validator("sampled_at")
    @classmethod
    def sampled_at_must_be_canonical(cls, value: str) -> str:
        return _canonical_timestamp(value, "quick-validation sample time")

    @model_validator(mode="after")
    def sample_totals_must_match_ports(self) -> "QuickValidationSample":
        if len({sample.port for sample in self.ports}) != len(self.ports):
            raise ValueError("quick-validation sample ports must be unique")
        tx_total = sum(sample.tx_packets for sample in self.ports)
        rx_total = sum(sample.rx_packets for sample in self.ports)
        loss_total = max(0.0, tx_total - rx_total)
        if not math.isclose(self.total_tx_packets, tx_total):
            raise ValueError("quick-validation sample TX total is inconsistent")
        if not math.isclose(self.total_rx_packets, rx_total):
            raise ValueError("quick-validation sample RX total is inconsistent")
        if not math.isclose(self.total_loss_packets, loss_total):
            raise ValueError("quick-validation sample loss total is inconsistent")
        expected_ratio = loss_total / tx_total if tx_total > 0 else 0.0
        if not math.isclose(self.total_loss_ratio, expected_ratio):
            raise ValueError("quick-validation sample loss ratio is inconsistent")
        return self


class QuickValidationConfigSnapshot(StrictQuickValidationModel):
    path: str = Field(min_length=1, max_length=4096)
    port_limit: int = Field(ge=1, le=256)
    interfaces: list[str] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def interfaces_must_cover_port_limit(self) -> "QuickValidationConfigSnapshot":
        if len(self.interfaces) < self.port_limit:
            raise ValueError(
                "quick-validation config interfaces must cover its port limit"
            )
        return self


class QuickValidationPlanGroupSnapshot(StrictQuickValidationModel):
    group_id: str = Field(min_length=1, max_length=64)
    plan_revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=128)
    ports: list[int] = Field(min_length=1, max_length=256)
    profile_path: str = Field(min_length=1, max_length=4096)
    profile_sha256: str | None = Field(
        default=None,
        min_length=64,
        max_length=64,
        pattern=r"^[0-9a-f]{64}$",
    )
    multiplier: str = Field(min_length=1, max_length=64)
    plan_duration: float
    force: bool
    total: bool
    synchronized: bool
    clear_existing: bool
    tunables: dict[str, Any]

    @field_validator("ports")
    @classmethod
    def ports_must_be_unique(cls, value: list[int]) -> list[int]:
        if any(isinstance(port, bool) or port < 0 for port in value):
            raise ValueError("quick-validation ports must be non-negative integers")
        if len(value) != len(set(value)):
            raise ValueError("quick-validation ports must be unique")
        return value


class QuickValidationPreflightEvidence(StrictQuickValidationModel):
    observed_at: str
    runtime_reconciliation: str
    live_state_sampled: Literal[True]
    link_states: dict[int, Literal["up"]]
    port_statuses: dict[int, Literal["idle"]]
    initial_port_states: dict[int, Literal["stopped"]]
    initial_port_ownership: dict[int, Literal["none"]]
    baseline_counters: dict[int, QuickValidationPortCounters]

    @field_validator("observed_at")
    @classmethod
    def observed_at_must_be_canonical(cls, value: str) -> str:
        return _canonical_timestamp(value, "quick-validation preflight time")


class QuickValidationCleanupEvidence(StrictQuickValidationModel):
    mode: Literal["not_started", "operator_stop", "hard_stop"]
    completed_at: str
    traffic_session_revision: int | None = Field(default=None, ge=1)
    final_port_states: dict[int, Literal["stopped"]]
    intent_nonce: str | None = None
    acquisition_restored: Literal[True] | None = None
    wal_cleared: Literal[True]

    @field_validator("completed_at")
    @classmethod
    def completed_at_must_be_canonical(cls, value: str) -> str:
        return _canonical_timestamp(value, "quick-validation cleanup time")

    @field_validator("intent_nonce")
    @classmethod
    def intent_nonce_must_be_canonical(
        cls,
        value: str | None,
    ) -> str | None:
        return (
            None
            if value is None
            else _canonical_uuid(value, "quick-validation cleanup intent nonce")
        )

    @model_validator(mode="after")
    def command_fields_must_match_mode(self) -> "QuickValidationCleanupEvidence":
        if self.mode == "not_started":
            if (
                self.traffic_session_revision is not None
                or self.intent_nonce is not None
                or self.acquisition_restored is not None
            ):
                raise ValueError("not-started cleanup cannot claim command evidence")
        elif self.acquisition_restored is not True:
            raise ValueError("commanded cleanup must prove acquisition restoration")
        if self.mode in {"operator_stop", "hard_stop"} and self.intent_nonce is None:
            raise ValueError("commanded cleanup must include its exact stop nonce")
        return self


class QuickValidationRunState(StrictQuickValidationModel):
    id: str
    revision: int = Field(ge=1)
    process_instance_id: str
    phase: QuickValidationPhase
    group: QuickValidationPlanGroupSnapshot
    config: QuickValidationConfigSnapshot
    duration_seconds: int = Field(ge=1, le=60)
    created_at: str
    started_at: str | None = None
    deadline_at: str
    watchdog_at: str
    ended_at: str | None = None
    traffic_session_id: str | None = None
    traffic_session_revision: int | None = Field(default=None, ge=1)
    traffic_run_id: str | None = None
    preflight: QuickValidationPreflightEvidence
    samples: list[QuickValidationSample] = Field(
        default_factory=list,
        max_length=QUICK_VALIDATION_SAMPLE_LIMIT,
    )
    pending_terminal: QuickValidationPendingTerminal | None = None
    recovery_required: bool = False
    failure_code: str | None = Field(default=None, max_length=128)
    failure_detail: str | None = Field(default=None, max_length=1024)
    cleanup: QuickValidationCleanupEvidence | None = None
    idle_verified: bool = False

    @field_validator("id", "process_instance_id")
    @classmethod
    def ids_must_be_canonical(cls, value: str) -> str:
        return _canonical_uuid(value, "quick-validation identity")

    @field_validator("traffic_session_id", "traffic_run_id")
    @classmethod
    def traffic_ids_must_be_canonical(
        cls,
        value: str | None,
    ) -> str | None:
        return (
            None
            if value is None
            else _canonical_uuid(value, "quick-validation traffic identity")
        )

    @field_validator(
        "created_at",
        "deadline_at",
        "watchdog_at",
        "started_at",
        "ended_at",
    )
    @classmethod
    def timestamps_must_be_canonical(
        cls,
        value: str | None,
    ) -> str | None:
        return (
            None
            if value is None
            else _canonical_timestamp(value, "quick-validation timestamp")
        )

    @model_validator(mode="after")
    def phase_evidence_must_be_consistent(self) -> "QuickValidationRunState":
        created = parse_utc_timestamp(self.created_at)
        started = (
            parse_utc_timestamp(self.started_at)
            if self.started_at is not None
            else None
        )
        deadline = parse_utc_timestamp(self.deadline_at)
        watchdog = parse_utc_timestamp(self.watchdog_at)
        deadline_origin = started if started is not None else created
        if deadline != deadline_origin + timedelta(seconds=self.duration_seconds):
            raise ValueError(
                "quick-validation deadline must match the canonical traffic window"
            )
        pass_still_possible = self.phase in {"running", "pass"} or (
            self.phase == "stopping" and self.pending_terminal == "pass"
        )
        if pass_still_possible and watchdog <= deadline:
            raise ValueError("quick-validation watchdog must follow its normal deadline")
        if watchdog > created + timedelta(
            seconds=TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS
        ):
            raise ValueError("quick-validation watchdog exceeds the safety window")
        if set(self.preflight.initial_port_states) != set(self.group.ports):
            raise ValueError("quick-validation preflight states must match group ports")
        if set(self.preflight.link_states) != set(self.group.ports):
            raise ValueError("quick-validation preflight links must match group ports")
        if set(self.preflight.port_statuses) != set(self.group.ports):
            raise ValueError("quick-validation preflight statuses must match group ports")
        if set(self.preflight.initial_port_ownership) != set(self.group.ports):
            raise ValueError("quick-validation preflight ownership must match group ports")
        if set(self.preflight.baseline_counters) != set(self.group.ports):
            raise ValueError("quick-validation counter baseline must match group ports")
        if any(
            {sample.port for sample in sample_set.ports} != set(self.group.ports)
            for sample_set in self.samples
        ):
            raise ValueError("quick-validation samples must match group ports")

        has_session = self.traffic_session_id is not None
        if has_session != (self.traffic_session_revision is not None):
            raise ValueError(
                "quick-validation traffic session id and revision must be paired"
            )
        if has_session != (self.traffic_run_id is not None):
            raise ValueError(
                "quick-validation canonical traffic run id must accompany its session"
            )
        if has_session != (self.group.profile_sha256 is not None):
            raise ValueError(
                "quick-validation profile digest must accompany its traffic session"
            )
        if self.phase == "running" and (
            not has_session
            or self.started_at is None
            or self.pending_terminal is not None
            or self.ended_at is not None
            or self.cleanup is not None
            or self.idle_verified
        ):
            raise ValueError("running quick validation requires exact active evidence")
        if self.phase == "preflight" and (
            has_session
            or self.started_at is not None
            or self.pending_terminal is not None
            or self.ended_at is not None
            or self.cleanup is not None
            or self.idle_verified
        ):
            raise ValueError("preflight quick validation cannot claim run evidence")
        if self.phase == "stopping" and (
            self.pending_terminal is None
            or self.ended_at is not None
            or self.cleanup is not None
            or self.idle_verified
        ):
            raise ValueError("stopping quick validation requires a pending outcome")
        if self.phase in _TERMINAL_PHASES:
            if (
                self.pending_terminal is not None
                or self.ended_at is None
                or self.cleanup is None
                or not self.idle_verified
                or self.recovery_required
            ):
                raise ValueError(
                    "terminal quick validation requires verified cleanup and idle state"
                )
            if self.phase == "pass" and (
                not has_session or self.cleanup.mode == "not_started"
            ):
                raise ValueError("passing quick validation requires commanded traffic")
            if set(self.cleanup.final_port_states) != set(self.group.ports):
                raise ValueError(
                    "quick-validation cleanup ports must match the saved group"
                )
        elif self.ended_at is not None or self.cleanup is not None or self.idle_verified:
            raise ValueError("active quick validation cannot claim terminal evidence")
        return self


class QuickValidationStateDocument(StrictQuickValidationModel):
    version: Literal[QUICK_VALIDATION_STATE_VERSION] = (
        QUICK_VALIDATION_STATE_VERSION
    )
    revision: int = Field(default=0, ge=0)
    updated_at: str
    run: QuickValidationRunState | None = None

    @field_validator("updated_at")
    @classmethod
    def updated_at_must_be_canonical(cls, value: str) -> str:
        return _canonical_timestamp(value, "quick-validation state update time")


class QuickValidationStatusResponse(StrictQuickValidationModel):
    state_version: Literal[QUICK_VALIDATION_STATE_VERSION]
    state_revision: int = Field(ge=0)
    active: bool
    recovery_required: bool
    run: QuickValidationRunState | None
    reconciliation: str


QuickValidationMutation = Callable[
    [QuickValidationStateDocument],
    QuickValidationStateDocument | None,
]


class QuickValidationStateStore:
    """Atomic, fail-closed persistence for the single guided run authority."""

    def __init__(
        self,
        path: Path,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.path = path
        self._clock = clock
        self._validate_path()
        normalized_path = Path(os.path.normpath(str(path)))
        with _STORE_LOCKS_GUARD:
            self._lock = _STORE_LOCKS.setdefault(
                normalized_path,
                threading.RLock(),
            )

    def load(self) -> QuickValidationStateDocument:
        with self._lock:
            return self._load_unlocked()

    def update(
        self,
        mutation: QuickValidationMutation,
    ) -> QuickValidationStateDocument:
        with self._lock:
            current = self._load_unlocked()
            candidate = mutation(current.model_copy(deep=True))
            if candidate is None:
                return current
            candidate.revision = current.revision + 1
            candidate.updated_at = canonical_utc_timestamp(self._clock())
            try:
                validated = QuickValidationStateDocument.model_validate(
                    candidate.model_dump(mode="python")
                )
            except ValidationError as exc:
                raise QuickValidationStateError(
                    f"quick-validation state mutation is invalid: {exc}"
                ) from exc
            self._write_unlocked(validated)
            return validated

    def _validate_path(self) -> None:
        raw = str(self.path)
        if (
            not raw
            or raw != raw.strip()
            or "\x00" in raw
            or not self.path.is_absolute()
        ):
            raise QuickValidationStateError(
                "quick-validation state path must be a clean absolute path"
            )

    def _empty_document(self) -> QuickValidationStateDocument:
        return QuickValidationStateDocument(
            updated_at=canonical_utc_timestamp(self._clock())
        )

    def _load_unlocked(self) -> QuickValidationStateDocument:
        try:
            file_stat = self.path.lstat()
        except FileNotFoundError:
            return self._empty_document()
        except OSError as exc:
            raise QuickValidationStateError(
                f"cannot inspect quick-validation state: {exc}"
            ) from exc
        if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(
            file_stat.st_mode
        ):
            raise QuickValidationStateError(
                "quick-validation state must be a non-symlink regular file"
            )
        if file_stat.st_size > QUICK_VALIDATION_STATE_MAX_BYTES:
            raise QuickValidationStateError(
                "quick-validation state exceeds the maximum supported size"
            )
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return QuickValidationStateDocument.model_validate(payload)
        except (OSError, UnicodeError, json.JSONDecodeError, ValidationError) as exc:
            raise QuickValidationStateError(
                f"quick-validation state is invalid: {exc}"
            ) from exc

    def _write_unlocked(self, state: QuickValidationStateDocument) -> None:
        parent = self.path.parent
        try:
            parent_stat = parent.lstat()
        except OSError as exc:
            raise QuickValidationStateError(
                f"quick-validation state directory is unavailable: {exc}"
            ) from exc
        if stat.S_ISLNK(parent_stat.st_mode) or not stat.S_ISDIR(
            parent_stat.st_mode
        ):
            raise QuickValidationStateError(
                "quick-validation state directory must be a non-symlink directory"
            )
        encoded = (
            json.dumps(
                state.model_dump(mode="json"),
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        ).encode("utf-8")
        if len(encoded) > QUICK_VALIDATION_STATE_MAX_BYTES:
            raise QuickValidationStateError(
                "quick-validation state exceeds the maximum supported size"
            )
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
            directory_descriptor = os.open(
                parent,
                os.O_RDONLY | os.O_DIRECTORY,
            )
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError as exc:
            raise QuickValidationStateError(
                f"cannot persist quick-validation state: {exc}"
            ) from exc
        finally:
            if descriptor >= 0:
                os.close(descriptor)
            if temporary_path is not None:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass


def quick_validation_state_path(runtime_state_path: Path) -> Path:
    suffix = runtime_state_path.suffix or ".json"
    stem = runtime_state_path.stem if runtime_state_path.suffix else runtime_state_path.name
    return runtime_state_path.with_name(f"{stem}-quick-validation{suffix}")


def _failure(
    blocker: str,
    error: str,
    data: Any = None,
) -> TrexCallResult:
    return TrexCallResult(False, data=data, blocker=blocker, error=error)


class QuickValidationAuthority:
    """Backend-owned, poll-driven state machine for Guided Quick Validation v1.

    Normal deadline work is advanced by status polling. The canonical traffic
    session always carries a later hard-stop lease, so the existing independent
    traffic supervisor remains the crash/no-browser safety authority.
    """

    def __init__(
        self,
        service: QuickValidationService,
        *,
        store: QuickValidationStateStore | None = None,
        clock: Callable[[], datetime] = utc_now,
        process_instance_id: str | None = None,
    ) -> None:
        self.service = service
        self.env = service.env
        self._clock = clock
        self._process_instance_id = process_instance_id or str(uuid.uuid4())
        _canonical_uuid(
            self._process_instance_id,
            "quick-validation process instance id",
        )
        self.store = store or QuickValidationStateStore(
            quick_validation_state_path(self.env.runtime_state_path),
            clock=clock,
        )
        self._lock = threading.RLock()

    def status(self) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            document = self.store.load()
            document, restart_note = self._mark_restart_recovery(document)
            document, reconciliation = self._advance(document)
            if restart_note:
                reconciliation = f"{restart_note}; {reconciliation}"
            return TrexCallResult(
                True,
                data=self._status_payload(document, reconciliation),
            )

    def start(
        self,
        *,
        expected_run_id: str | None,
        expected_run_revision: int | None,
        group_id: str,
        plan_revision: int,
        duration_seconds: int,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            if duration_seconds < 1 or duration_seconds > 60:
                return _failure(
                    "quick_validation_duration_invalid",
                    "quick validation duration must be between 1 and 60 seconds",
                )
            document = self.store.load()
            document, _ = self._mark_restart_recovery(document)
            try:
                self._assert_start_cas(
                    document,
                    expected_run_id,
                    expected_run_revision,
                )
            except QuickValidationStateError as exc:
                return _failure("quick_validation_run_conflict", str(exc))

            runtime_result = self.service.traffic_runtime_snapshot()
            if not runtime_result.ok or not isinstance(runtime_result.data, dict):
                return _failure(
                    runtime_result.blocker or "quick_validation_preflight_failed",
                    runtime_result.error
                    or "traffic runtime preflight did not return a typed snapshot",
                )
            try:
                port_snapshot_result = self.service.snapshot()
                if (
                    not port_snapshot_result.ok
                    or not isinstance(port_snapshot_result.data, dict)
                ):
                    raise QuickValidationStateError(
                        port_snapshot_result.error
                        or port_snapshot_result.blocker
                        or "TRex port inventory did not return a typed snapshot"
                    )
                group, config, preflight = self._preflight(
                    runtime_result.data,
                    port_snapshot_result.data,
                    group_id,
                    plan_revision,
                )
                now = self._now()
                deadline = now + timedelta(seconds=duration_seconds)
                watchdog = self._watchdog_deadline(
                    now,
                    deadline,
                    config.port_limit,
                    len(group.ports),
                )
                baseline = self._read_counters(group.ports)
                preflight = preflight.model_copy(
                    update={"baseline_counters": baseline},
                    deep=True,
                )
            except QuickValidationStateError as exc:
                return _failure("quick_validation_preflight_failed", str(exc))

            run_id = str(uuid.uuid4())
            run = QuickValidationRunState(
                id=run_id,
                revision=1,
                process_instance_id=self._process_instance_id,
                phase="preflight",
                group=group,
                config=config,
                duration_seconds=duration_seconds,
                created_at=canonical_utc_timestamp(now),
                deadline_at=canonical_utc_timestamp(deadline),
                watchdog_at=canonical_utc_timestamp(watchdog),
                preflight=preflight,
            )

            def persist_preflight(
                current: QuickValidationStateDocument,
            ) -> QuickValidationStateDocument:
                self._assert_start_cas(
                    current,
                    expected_run_id,
                    expected_run_revision,
                )
                current.run = run
                return current

            document = self.store.update(persist_preflight)
            start_result = self.service.start_traffic_group(
                group_id=group_id,
                expected_revision=plan_revision,
                expected_session_id=None,
                hard_stop_at=run.watchdog_at,
            )
            if start_result.ok and isinstance(start_result.data, dict):
                try:
                    session_evidence = self._validated_started_session(
                        start_result.data.get("session"),
                        run,
                    )
                    document = self._promote_running(
                        document,
                        session_evidence,
                    )
                except QuickValidationStateError as exc:
                    document = self._enter_stopping(
                        document,
                        pending_terminal="fail",
                        failure_code="quick_validation_start_evidence_invalid",
                        failure_detail=str(exc),
                        recovery_required=True,
                    )
                    document, reconciliation = self._drive_stopping(document)
                    return _failure(
                        "quick_validation_start_evidence_invalid",
                        str(exc),
                        self._status_payload(document, reconciliation),
                    )
                document, reconciliation = self._advance(document)
                return TrexCallResult(
                    True,
                    data=self._status_payload(document, reconciliation),
                )

            detail = (
                start_result.error
                or start_result.blocker
                or "canonical traffic start returned an indeterminate result"
            )
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code=start_result.blocker
                or "quick_validation_start_failed",
                failure_detail=detail,
                recovery_required=True,
            )
            document, reconciliation = self._drive_stopping(document)
            return _failure(
                start_result.blocker or "quick_validation_start_failed",
                detail,
                self._status_payload(document, reconciliation),
            )

    def cancel(
        self,
        *,
        run_id: str,
        run_revision: int,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            document = self.store.load()
            document, _ = self._mark_restart_recovery(document)
            run = document.run
            if (
                run is None
                or run.id != run_id
                or run.revision != run_revision
            ):
                return _failure(
                    "quick_validation_run_conflict",
                    "quick-validation run id or revision changed; refresh status",
                    self._status_payload(document, "cancel CAS rejected"),
                )
            if run.phase in _TERMINAL_PHASES:
                return _failure(
                    "quick_validation_run_terminal",
                    f"quick-validation run {run.id} is already {run.phase}",
                    self._status_payload(document, "run already terminal"),
                )
            if run.phase == "running":
                try:
                    document = self._append_sample(document)
                except QuickValidationStateError:
                    # Cancellation cleanup outranks optional final sampling.
                    pass
            if document.run is not None and document.run.phase != "stopping":
                document = self._enter_stopping(
                    document,
                    pending_terminal="cancelled",
                    failure_code=None,
                    failure_detail=None,
                    recovery_required=False,
                )
            elif document.run is not None:
                document = self._change_pending_terminal(
                    document,
                    "cancelled",
                )
            document, reconciliation = self._drive_stopping(document)
            return TrexCallResult(
                True,
                data=self._status_payload(document, reconciliation),
            )

    def _advance(
        self,
        document: QuickValidationStateDocument,
    ) -> tuple[QuickValidationStateDocument, str]:
        run = document.run
        if run is None:
            return document, "no quick-validation run has been created"
        if run.phase in _TERMINAL_PHASES:
            return document, f"quick-validation run is {run.phase}"
        if run.phase == "preflight":
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code="quick_validation_preflight_interrupted",
                failure_detail=(
                    "durable preflight exists without canonical start promotion"
                ),
                recovery_required=True,
            )
            return self._drive_stopping(document)
        if run.phase == "stopping":
            return self._drive_stopping(document)

        runtime_result = self.service.traffic_runtime_snapshot()
        if not runtime_result.ok or not isinstance(runtime_result.data, dict):
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code=runtime_result.blocker
                or "quick_validation_runtime_unavailable",
                failure_detail=runtime_result.error
                or "canonical traffic runtime is unavailable",
                recovery_required=True,
            )
            return self._drive_stopping(document)
        current_run = document.run
        if current_run is None:
            raise QuickValidationStateError(
                "quick-validation run disappeared during status refresh"
            )
        try:
            session = self._validated_started_session(
                runtime_result.data.get("session"),
                current_run,
            )
        except QuickValidationStateError as exc:
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code="quick_validation_session_conflict",
                failure_detail=str(exc),
                recovery_required=True,
            )
            return self._drive_stopping(document)

        session_state = session["session_state"]
        if session_state == "stopped":
            ended_at = session["group_ended_at"]
            if not isinstance(ended_at, str):
                document = self._enter_stopping(
                    document,
                    pending_terminal="fail",
                    failure_code="quick_validation_traffic_stop_evidence_invalid",
                    failure_detail=(
                        "canonical stopped traffic has no exact group end time"
                    ),
                    recovery_required=True,
                )
                return self._drive_stopping(document)
            completed_window = parse_utc_timestamp(ended_at) >= parse_utc_timestamp(
                current_run.deadline_at
            )
            pending_terminal: QuickValidationPendingTerminal = (
                "pass" if completed_window else "fail"
            )
            failure_code = (
                None
                if completed_window
                else "quick_validation_traffic_stopped_early"
            )
            failure_detail = (
                None
                if completed_window
                else "canonical traffic stopped before the requested duration"
            )
            document = self._enter_stopping(
                document,
                pending_terminal=pending_terminal,
                failure_code=failure_code,
                failure_detail=failure_detail,
                recovery_required=False,
            )
            return self._drive_stopping(document)
        if session_state not in {"running", "paused", "mixed"}:
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code="quick_validation_session_state_invalid",
                failure_detail=(
                    "canonical traffic session is neither active nor exactly stopped"
                ),
                recovery_required=True,
            )
            return self._drive_stopping(document)

        document = self._refresh_session_revision(document, session)
        try:
            document = self._append_sample(document)
        except QuickValidationStateError as exc:
            document = self._enter_stopping(
                document,
                pending_terminal="fail",
                failure_code="quick_validation_stats_invalid",
                failure_detail=str(exc),
                recovery_required=False,
            )
            return self._drive_stopping(document)
        current_run = document.run
        if current_run is None:
            raise QuickValidationStateError(
                "quick-validation run disappeared after stats sampling"
            )
        if self._now() < parse_utc_timestamp(current_run.deadline_at):
            return document, "running; canonical session and counters refreshed"
        document = self._enter_stopping(
            document,
            pending_terminal="pass",
            failure_code=None,
            failure_detail=None,
            recovery_required=False,
        )
        return self._drive_stopping(document)

    def _drive_stopping(
        self,
        document: QuickValidationStateDocument,
    ) -> tuple[QuickValidationStateDocument, str]:
        run = document.run
        if run is None or run.phase != "stopping":
            return document, "quick-validation cleanup is not pending"
        runtime_result = self.service.traffic_runtime_snapshot()
        if not runtime_result.ok or not isinstance(runtime_result.data, dict):
            document = self._set_recovery_detail(
                document,
                runtime_result.blocker
                or "quick_validation_cleanup_runtime_unavailable",
                runtime_result.error
                or "canonical traffic runtime is unavailable during cleanup",
            )
            return document, "cleanup is waiting for canonical runtime recovery"
        runtime = runtime_result.data
        if runtime.get("mutation_intent") is not None:
            document = self._set_recovery_detail(
                document,
                "quick_validation_traffic_recovery_pending",
                "canonical traffic mutation recovery is still pending",
            )
            return document, "cleanup is waiting for traffic WAL recovery"

        run = document.run
        if run is None:
            raise QuickValidationStateError(
                "quick-validation run disappeared during cleanup"
            )
        session_payload = runtime.get("session")
        if run.traffic_session_id is None:
            try:
                recovered = self._validated_started_session(session_payload, run)
            except QuickValidationStateError:
                recovered = None
            if recovered is not None and recovered["session_state"] in {
                "running",
                "paused",
                "mixed",
                "stopped",
            }:
                document = self._bind_recovered_session(document, recovered)
                run = document.run
                if run is None:
                    raise QuickValidationStateError(
                        "quick-validation run disappeared after recovery binding"
                    )
            elif self._ports_are_idle(runtime, run.group.ports):
                document = self._finish_without_start(document, runtime)
                return document, "preflight failed before canonical traffic start"
            else:
                document = self._set_recovery_detail(
                    document,
                    "quick_validation_start_recovery_required",
                    "traffic start outcome cannot yet be attributed safely",
                )
                return document, "cleanup awaits exact start attribution"

        run = document.run
        if run is None or run.traffic_session_id is None:
            raise QuickValidationStateError(
                "quick-validation cleanup lost its canonical traffic session"
            )
        session = runtime.get("session")
        if not isinstance(session, dict) or session.get("id") != run.traffic_session_id:
            document = self._set_recovery_detail(
                document,
                "quick_validation_session_conflict",
                "canonical traffic session changed before cleanup verification",
            )
            return document, "cleanup blocked by traffic session conflict"

        if session.get("state") in {"running", "paused", "mixed"}:
            stop_result = self.service.traffic_action(
                "stop",
                list(run.group.ports),
                expected_session_id=run.traffic_session_id,
            )
            if not stop_result.ok:
                document = self._set_recovery_detail(
                    document,
                    stop_result.blocker
                    or "quick_validation_stop_recovery_required",
                    stop_result.error
                    or "canonical traffic stop did not complete cleanly",
                )
                return document, "cleanup stop requires traffic supervisor recovery"
            runtime_result = self.service.traffic_runtime_snapshot()
            if not runtime_result.ok or not isinstance(runtime_result.data, dict):
                document = self._set_recovery_detail(
                    document,
                    runtime_result.blocker
                    or "quick_validation_stop_verification_unavailable",
                    runtime_result.error
                    or "cannot refresh canonical traffic after stop",
                )
                return document, "cleanup stop issued; verification is pending"
            runtime = runtime_result.data

        try:
            cleanup = self._validated_cleanup(runtime, run)
        except QuickValidationStateError as exc:
            document = self._set_recovery_detail(
                document,
                "quick_validation_cleanup_evidence_invalid",
                str(exc),
            )
            return document, "cleanup evidence is not yet certifiable"
        if run.pending_terminal == "pass":
            try:
                document = self._append_sample(document, final=True)
            except QuickValidationStateError as exc:
                document = self._fail_pending_terminal(
                    document,
                    "quick_validation_stats_invalid",
                    str(exc),
                )
        document = self._finish(document, cleanup)
        terminal = document.run.phase if document.run is not None else "unknown"
        return document, f"quick-validation cleanup verified; run is {terminal}"

    def _preflight(
        self,
        runtime: dict[str, Any],
        port_snapshot: dict[str, Any],
        group_id: str,
        plan_revision: int,
    ) -> tuple[
        QuickValidationPlanGroupSnapshot,
        QuickValidationConfigSnapshot,
        QuickValidationPreflightEvidence,
    ]:
        if runtime.get("plan_revision") != plan_revision:
            raise QuickValidationStateError(
                f"traffic plan revision is {runtime.get('plan_revision')}, not {plan_revision}"
            )
        if runtime.get("mutation_intent") is not None:
            raise QuickValidationStateError(
                "traffic mutation recovery must finish before quick validation"
            )
        if runtime.get("live_state_sampled") is not True:
            raise QuickValidationStateError(
                "quick validation requires a fresh complete port-state sample"
            )
        session = runtime.get("session")
        if isinstance(session, dict) and session.get("state") in {
            "running",
            "paused",
            "mixed",
            "unknown",
        }:
            raise QuickValidationStateError(
                "quick validation requires no active managed traffic session"
            )
        groups = runtime.get("groups")
        if not isinstance(groups, list):
            raise QuickValidationStateError(
                "traffic runtime did not include the saved plan groups"
            )
        raw_group = next(
            (
                candidate
                for candidate in groups
                if isinstance(candidate, dict) and candidate.get("id") == group_id
            ),
            None,
        )
        if raw_group is None:
            raise QuickValidationStateError(
                f"saved traffic group '{group_id}' does not exist"
            )
        try:
            group = QuickValidationPlanGroupSnapshot(
                group_id=raw_group.get("id"),
                plan_revision=plan_revision,
                name=raw_group.get("name"),
                ports=raw_group.get("ports"),
                profile_path=raw_group.get("profile_path"),
                multiplier=raw_group.get("multiplier"),
                plan_duration=raw_group.get("duration"),
                force=raw_group.get("force"),
                total=raw_group.get("total"),
                synchronized=raw_group.get("synchronized"),
                clear_existing=raw_group.get("clear_existing"),
                tunables=raw_group.get("tunables"),
            )
            config = QuickValidationConfigSnapshot.model_validate(
                runtime.get("config")
            )
        except ValidationError as exc:
            raise QuickValidationStateError(
                f"saved traffic group contract is invalid: {exc}"
            ) from exc
        if group.plan_duration != -1:
            raise QuickValidationStateError(
                "quick validation requires a duration-disabled saved group; "
                "the guided run owns its bounded stop deadline"
            )
        if not set(group.ports).issubset(set(range(config.port_limit))):
            raise QuickValidationStateError(
                "saved traffic group contains ports outside the active config"
            )
        port_records = runtime.get("port_states")
        if not isinstance(port_records, list):
            raise QuickValidationStateError(
                "traffic runtime did not include typed port states"
            )
        records = {
            record.get("port"): record
            for record in port_records
            if isinstance(record, dict)
        }
        states: dict[int, Literal["stopped"]] = {}
        ownership: dict[int, Literal["none"]] = {}
        for port in group.ports:
            record = records.get(port)
            if not isinstance(record, dict):
                raise QuickValidationStateError(
                    f"traffic runtime did not include P{port}"
                )
            if record.get("state") != "stopped" or record.get("ownership") != "none":
                raise QuickValidationStateError(
                    f"quick validation requires P{port} stopped and unowned"
                )
            states[port] = "stopped"
            ownership[port] = "none"

        raw_port_records = port_snapshot.get("ports")
        if not isinstance(raw_port_records, list):
            raise QuickValidationStateError(
                "TRex port inventory did not include typed port records"
            )
        inventory = {
            record.get("id"): record
            for record in raw_port_records
            if isinstance(record, dict)
            and isinstance(record.get("id"), int)
            and not isinstance(record.get("id"), bool)
        }
        links: dict[int, Literal["up"]] = {}
        statuses: dict[int, Literal["idle"]] = {}
        for port in group.ports:
            record = inventory.get(port)
            info = record.get("info") if isinstance(record, dict) else None
            if not isinstance(record, dict) or record.get("acquired") is not False:
                raise QuickValidationStateError(
                    f"quick validation requires P{port} explicitly unacquired"
                )
            if not isinstance(info, dict) or "owner" not in info:
                raise QuickValidationStateError(
                    f"quick validation requires P{port} explicit owner evidence"
                )
            owner = info["owner"]
            if owner is not None and (
                not isinstance(owner, str) or bool(owner.strip())
            ):
                raise QuickValidationStateError(
                    f"quick validation requires P{port} no TRex owner"
                )
            link = info.get("link") if isinstance(info, dict) else None
            status = info.get("status") if isinstance(info, dict) else None
            if not isinstance(link, str) or link.strip().upper() != "UP":
                raise QuickValidationStateError(
                    f"quick validation requires P{port} physical link UP"
                )
            if not isinstance(status, str) or status.strip().upper() != "IDLE":
                raise QuickValidationStateError(
                    f"quick validation requires P{port} live status IDLE"
                )
            links[port] = "up"
            statuses[port] = "idle"
        preflight = QuickValidationPreflightEvidence(
            observed_at=canonical_utc_timestamp(self._now()),
            runtime_reconciliation=str(runtime.get("reconciliation") or ""),
            live_state_sampled=True,
            link_states=links,
            port_statuses=statuses,
            initial_port_states=states,
            initial_port_ownership=ownership,
            baseline_counters={
                port: QuickValidationPortCounters(tx_packets=0, rx_packets=0)
                for port in group.ports
            },
        )
        return group, config, preflight

    def _watchdog_deadline(
        self,
        created_at: datetime,
        deadline_at: datetime,
        port_limit: int,
        target_port_count: int,
    ) -> datetime:
        start_rpc_count = port_limit + target_port_count + 4
        recovery_margin = (
            self.env.connect_timeout_seconds * start_rpc_count
            + TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS
            + 5.0
        )
        watchdog = deadline_at + timedelta(seconds=recovery_margin)
        maximum = created_at + timedelta(
            seconds=TRAFFIC_HARD_STOP_MAX_WINDOW_SECONDS
        )
        if watchdog > maximum:
            raise QuickValidationStateError(
                "the configured TRex RPC timeout cannot fit a quick-validation "
                "watchdog and recovery margin inside the 300-second safety window"
            )
        return watchdog

    def _read_counters(
        self,
        ports: list[int],
    ) -> dict[int, QuickValidationPortCounters]:
        result = self.service.stats(ports=list(ports))
        if not result.ok or not isinstance(result.data, dict):
            raise QuickValidationStateError(
                result.error
                or result.blocker
                or "TRex stats did not return per-port counters"
            )
        counters: dict[int, QuickValidationPortCounters] = {}
        for port in ports:
            raw = result.data.get(str(port), result.data.get(port))
            if not isinstance(raw, dict):
                raise QuickValidationStateError(
                    f"TRex stats did not include P{port} counters"
                )
            counters[port] = QuickValidationPortCounters(
                tx_packets=self._numeric_counter(raw.get("opackets"), port, "opackets"),
                rx_packets=self._numeric_counter(raw.get("ipackets"), port, "ipackets"),
            )
        return counters

    @staticmethod
    def _numeric_counter(value: Any, port: int, label: str) -> float:
        if isinstance(value, bool):
            raise QuickValidationStateError(
                f"P{port} {label} counter is not numeric"
            )
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise QuickValidationStateError(
                f"P{port} {label} counter is not numeric"
            ) from exc
        if not math.isfinite(number) or number < 0:
            raise QuickValidationStateError(
                f"P{port} {label} counter must be finite and non-negative"
            )
        return number

    def _append_sample(
        self,
        document: QuickValidationStateDocument,
        *,
        final: bool = False,
    ) -> QuickValidationStateDocument:
        run = document.run
        phase_is_sampleable = run is not None and (
            run.phase == "running"
            or (
                final
                and run.phase == "stopping"
                and run.pending_terminal == "pass"
            )
        )
        if not phase_is_sampleable or run is None:
            raise QuickValidationStateError(
                "stats can only be sampled for running traffic or a final "
                "pass-candidate cleanup"
            )
        absolute = self._read_counters(run.group.ports)
        port_samples: list[QuickValidationPortSample] = []
        for port in run.group.ports:
            baseline = run.preflight.baseline_counters[port]
            current = absolute[port]
            tx = current.tx_packets - baseline.tx_packets
            rx = current.rx_packets - baseline.rx_packets
            if tx < 0 or rx < 0:
                raise QuickValidationStateError(
                    f"P{port} packet counters reset during quick validation"
                )
            loss = max(0.0, tx - rx)
            port_samples.append(
                QuickValidationPortSample(
                    port=port,
                    absolute_tx_packets=current.tx_packets,
                    absolute_rx_packets=current.rx_packets,
                    tx_packets=tx,
                    rx_packets=rx,
                    loss_packets=loss,
                    loss_ratio=loss / tx if tx > 0 else 0.0,
                )
            )
        total_tx = sum(sample.tx_packets for sample in port_samples)
        total_rx = sum(sample.rx_packets for sample in port_samples)
        total_loss = max(0.0, total_tx - total_rx)
        sample = QuickValidationSample(
            sampled_at=canonical_utc_timestamp(self._now()),
            ports=port_samples,
            total_tx_packets=total_tx,
            total_rx_packets=total_rx,
            total_loss_packets=total_loss,
            total_loss_ratio=total_loss / total_tx if total_tx > 0 else 0.0,
        )
        expected_id = run.id
        expected_revision = run.revision

        def append(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != run.phase
                or (
                    final
                    and (
                        current_run.phase != "stopping"
                        or current_run.pending_terminal != "pass"
                    )
                )
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before stats persistence"
                )
            current_run.samples = [
                *current_run.samples[-(QUICK_VALIDATION_SAMPLE_LIMIT - 1) :],
                sample,
            ]
            current_run.revision += 1
            return current

        return self.store.update(append)

    def _validated_started_session(
        self,
        raw_session: Any,
        run: QuickValidationRunState,
    ) -> dict[str, Any]:
        if not isinstance(raw_session, dict):
            raise QuickValidationStateError(
                "canonical traffic response did not include a session"
            )
        session_id = raw_session.get("id")
        if not isinstance(session_id, str):
            raise QuickValidationStateError(
                "canonical traffic session id is missing"
            )
        _canonical_uuid(session_id, "canonical traffic session id")
        revision = raw_session.get("revision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise QuickValidationStateError(
                "canonical traffic session revision must be positive"
            )
        if (
            run.traffic_session_revision is not None
            and revision < run.traffic_session_revision
        ):
            raise QuickValidationStateError(
                "canonical traffic session revision moved backwards"
            )
        if raw_session.get("evidence_version") != 1:
            raise QuickValidationStateError(
                "quick validation requires traffic evidence version 1"
            )
        if run.traffic_session_id is not None and session_id != run.traffic_session_id:
            raise QuickValidationStateError(
                "canonical traffic session changed during quick validation"
            )
        groups = [
            group
            for key in ("groups", "completed_groups")
            for group in (
                raw_session.get(key)
                if isinstance(raw_session.get(key), list)
                else []
            )
            if isinstance(group, dict)
        ]
        group = next(
            (
                candidate
                for candidate in groups
                if candidate.get("group_id") == run.group.group_id
                and candidate.get("source") == "plan"
                and candidate.get("plan_revision") == run.group.plan_revision
                and candidate.get("hard_stop_at") in {run.watchdog_at, None}
            ),
            None,
        )
        if group is None:
            raise QuickValidationStateError(
                "canonical traffic session does not contain the exact saved-plan run"
            )
        if group.get("ports") != run.group.ports:
            raise QuickValidationStateError(
                "canonical traffic session ports differ from quick-validation preflight"
            )
        if group.get("profile_path") != run.group.profile_path:
            raise QuickValidationStateError(
                "canonical traffic profile differs from quick-validation preflight"
            )
        if group.get("start_multiplier") != run.group.multiplier:
            raise QuickValidationStateError(
                "canonical traffic multiplier differs from quick-validation preflight"
            )
        immutable_start_fields = {
            "duration": run.group.plan_duration,
            "start_force": run.group.force,
            "start_total": run.group.total,
            "start_synchronized": run.group.synchronized,
            "start_clear_existing": run.group.clear_existing,
            "tunables": run.group.tunables,
        }
        mismatched_fields = [
            field
            for field, expected in immutable_start_fields.items()
            if group.get(field) != expected
        ]
        if mismatched_fields:
            raise QuickValidationStateError(
                "canonical traffic start differs from the saved plan fields: "
                + ", ".join(mismatched_fields)
            )
        profile_sha256 = group.get("profile_sha256")
        if (
            not isinstance(profile_sha256, str)
            or len(profile_sha256) != 64
            or any(char not in "0123456789abcdef" for char in profile_sha256)
        ):
            raise QuickValidationStateError(
                "canonical traffic profile digest is invalid"
            )
        if (
            run.group.profile_sha256 is not None
            and profile_sha256 != run.group.profile_sha256
        ):
            raise QuickValidationStateError(
                "canonical traffic profile digest changed during quick validation"
            )
        run_id = group.get("run_id")
        if not isinstance(run_id, str):
            raise QuickValidationStateError(
                "canonical traffic group run id is missing"
            )
        _canonical_uuid(run_id, "canonical traffic group run id")
        if run.traffic_run_id is not None and run_id != run.traffic_run_id:
            raise QuickValidationStateError(
                "canonical traffic group run changed during quick validation"
            )
        start_evidence = group.get("start_evidence")
        if (
            not isinstance(start_evidence, dict)
            or start_evidence.get("operation") != "start"
            or start_evidence.get("intent_nonce") != run_id
            or start_evidence.get("ports") != run.group.ports
            or start_evidence.get("wal_cleared") is not True
            or start_evidence.get("acquisition_restored") is not True
        ):
            raise QuickValidationStateError(
                "canonical traffic group lacks exact start evidence"
            )
        mutations = raw_session.get("mutation_evidence")
        if not isinstance(mutations, list) or not mutations:
            raise QuickValidationStateError(
                "canonical traffic session mutation evidence is missing"
            )
        first_mutation = mutations[0]
        if (
            not isinstance(first_mutation, dict)
            or first_mutation.get("operation") != "start"
            or first_mutation.get("intent_nonce") != session_id
        ):
            raise QuickValidationStateError(
                "canonical traffic session does not begin with exact start evidence"
            )
        if not any(
            isinstance(mutation, dict) and mutation == start_evidence
            for mutation in mutations
        ):
            raise QuickValidationStateError(
                "canonical traffic group start evidence is not in its session"
            )
        started_at = group.get("started_at")
        if not isinstance(started_at, str):
            raise QuickValidationStateError(
                "canonical traffic group start time is missing"
            )
        try:
            started_time = parse_utc_timestamp(started_at)
        except ValueError as exc:
            raise QuickValidationStateError(
                "canonical traffic group start time is invalid"
            ) from exc
        if started_time < parse_utc_timestamp(run.created_at):
            raise QuickValidationStateError(
                "canonical traffic session predates this quick-validation run"
            )
        if started_time > parse_utc_timestamp(run.watchdog_at):
            raise QuickValidationStateError(
                "canonical traffic session starts after this run's watchdog"
            )
        group_state = group.get("state")
        session_state = raw_session.get("state")
        if (session_state == "stopped") != (group_state == "stopped"):
            raise QuickValidationStateError(
                "canonical traffic session and guided group states drifted apart"
            )
        ended_at = group.get("ended_at")
        if group_state == "stopped":
            group_port_states = _strict_stopped_port_states(
                group.get("port_states"),
                "canonical traffic group port states",
            )
            if group_port_states != {
                port: "stopped" for port in run.group.ports
            }:
                raise QuickValidationStateError(
                    "canonical traffic group port states differ from the guided run"
                )
            if group.get("hard_stop_at") is not None:
                raise QuickValidationStateError(
                    "stopped canonical traffic group retained a hard-stop lease"
                )
            if not isinstance(ended_at, str):
                raise QuickValidationStateError(
                    "stopped canonical traffic group has no end time"
                )
            try:
                ended_time = parse_utc_timestamp(ended_at)
            except ValueError as exc:
                raise QuickValidationStateError(
                    "canonical traffic group end time is invalid"
                ) from exc
            if canonical_utc_timestamp(ended_time) != ended_at:
                raise QuickValidationStateError(
                    "canonical traffic group end time is not canonical UTC"
                )
            if ended_time < started_time:
                raise QuickValidationStateError(
                    "canonical traffic group ended before it started"
                )
        elif group.get("hard_stop_at") != run.watchdog_at:
            raise QuickValidationStateError(
                "active canonical traffic group changed its watchdog lease"
            )
        elif ended_at is not None:
            raise QuickValidationStateError(
                "active canonical traffic group already has an end time"
            )
        return {
            "session_id": session_id,
            "session_revision": revision,
            "session_state": session_state,
            "traffic_run_id": run_id,
            "profile_sha256": profile_sha256,
            "started_at": started_at,
            "group_ended_at": ended_at,
            "group": group,
        }

    def _validated_cleanup(
        self,
        runtime: dict[str, Any],
        run: QuickValidationRunState,
    ) -> QuickValidationCleanupEvidence:
        if runtime.get("live_state_sampled") is not True:
            raise QuickValidationStateError(
                "cleanup requires a fresh complete port-state sample"
            )
        if runtime.get("mutation_intent") is not None:
            raise QuickValidationStateError(
                "cleanup cannot complete while traffic WAL is pending"
            )
        if not self._ports_are_idle(runtime, run.group.ports):
            raise QuickValidationStateError(
                "quick-validation ports are not all idle after stop"
            )
        session = runtime.get("session")
        if (
            not isinstance(session, dict)
            or session.get("id") != run.traffic_session_id
            or session.get("evidence_version") != 1
            or session.get("state") != "stopped"
        ):
            raise QuickValidationStateError(
                "cleanup requires the exact stopped evidence-v1 traffic session"
            )
        revision = session.get("revision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise QuickValidationStateError(
                "stopped traffic session revision must be positive"
            )
        if (
            run.traffic_session_revision is not None
            and revision < run.traffic_session_revision
        ):
            raise QuickValidationStateError(
                "stopped traffic session revision moved backwards"
            )
        session_evidence = self._validated_started_session(session, run)
        group = session_evidence["group"]
        if group.get("state") != "stopped":
            raise QuickValidationStateError(
                "quick-validation traffic group is not stopped"
            )
        cleanup = group.get("cleanup_evidence")
        if not isinstance(cleanup, dict):
            raise QuickValidationStateError(
                "stopped traffic group has no cleanup evidence"
            )
        completion = cleanup.get("completion")
        if completion not in {"operator_stop", "hard_stop"}:
            raise QuickValidationStateError(
                "observed traffic idle cannot certify commanded quick-validation cleanup"
            )
        if (
            cleanup.get("wal_cleared") is not True
            or cleanup.get("acquisition_restored") is not True
        ):
            raise QuickValidationStateError(
                "traffic cleanup has not restored acquisition and cleared WAL"
            )
        expected_states = {port: "stopped" for port in run.group.ports}
        final_states = _strict_stopped_port_states(
            cleanup.get("final_port_states"),
            "traffic cleanup final port states",
        )
        if final_states != expected_states:
            raise QuickValidationStateError(
                "traffic cleanup final port states do not match the guided run"
            )
        completed_at = cleanup.get("completed_at")
        if not isinstance(completed_at, str):
            raise QuickValidationStateError(
                "traffic cleanup completion time is missing"
            )
        try:
            _canonical_timestamp(completed_at, "traffic cleanup completion time")
        except ValueError as exc:
            raise QuickValidationStateError(str(exc)) from exc
        if group.get("ended_at") != completed_at:
            raise QuickValidationStateError(
                "traffic cleanup completion time differs from the guided group end time"
            )
        intent_nonce = cleanup.get("intent_nonce")
        if not isinstance(intent_nonce, str):
            raise QuickValidationStateError(
                "commanded cleanup is missing its stop intent nonce"
            )
        try:
            _canonical_uuid(intent_nonce, "traffic cleanup intent nonce")
        except ValueError as exc:
            raise QuickValidationStateError(str(exc)) from exc
        mutations = session.get("mutation_evidence")
        if not isinstance(mutations, list):
            raise QuickValidationStateError(
                "traffic cleanup session mutation evidence is missing"
            )
        matching_stop_evidence = [
            mutation
            for mutation in mutations
            if isinstance(mutation, dict)
            and mutation.get("intent_nonce") == intent_nonce
        ]
        if len(matching_stop_evidence) != 1:
            raise QuickValidationStateError(
                "traffic cleanup must reference exactly one stop mutation nonce"
            )
        stop_evidence = matching_stop_evidence[0]
        if stop_evidence.get("operation") != "stop":
            raise QuickValidationStateError(
                "traffic cleanup nonce does not reference a stop mutation"
            )
        stop_ports = _strict_evidence_ports(
            stop_evidence.get("ports"),
            "traffic cleanup stop mutation ports",
        )
        if stop_ports != run.group.ports:
            raise QuickValidationStateError(
                "traffic cleanup stop mutation ports do not match the guided run"
            )
        desired_states = _strict_stopped_port_states(
            stop_evidence.get("desired_port_states"),
            "traffic cleanup stop mutation desired port states",
        )
        if desired_states != expected_states:
            raise QuickValidationStateError(
                "traffic cleanup stop mutation desired port states do not match the guided run"
            )
        if (
            stop_evidence.get("wal_cleared") is not True
            or stop_evidence.get("acquisition_restored") is not True
        ):
            raise QuickValidationStateError(
                "traffic cleanup stop mutation has not restored acquisition and cleared WAL"
            )
        if stop_evidence.get("completed_at") != completed_at:
            raise QuickValidationStateError(
                "traffic cleanup completion time differs from its stop mutation"
            )
        completion_mode = stop_evidence.get("completion_mode")
        if (
            completion == "operator_stop"
            and completion_mode not in {"direct", "recovered", "replayed"}
        ) or (
            completion == "hard_stop"
            and completion_mode != "hard_stop"
        ):
            raise QuickValidationStateError(
                "traffic cleanup mode disagrees with its stop mutation"
            )
        return QuickValidationCleanupEvidence(
            mode=completion,
            completed_at=completed_at,
            traffic_session_revision=revision,
            final_port_states={port: "stopped" for port in run.group.ports},
            intent_nonce=intent_nonce,
            acquisition_restored=True,
            wal_cleared=True,
        )

    @staticmethod
    def _ports_are_idle(runtime: dict[str, Any], ports: list[int]) -> bool:
        if runtime.get("live_state_sampled") is not True:
            return False
        records = runtime.get("port_states")
        if not isinstance(records, list):
            return False
        states = {
            record.get("port"): (
                record.get("state"),
                record.get("ownership"),
            )
            for record in records
            if isinstance(record, dict)
        }
        return all(states.get(port) == ("stopped", "none") for port in ports)

    def _promote_running(
        self,
        document: QuickValidationStateDocument,
        evidence: dict[str, Any],
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "preflight":
            raise QuickValidationStateError(
                "quick-validation preflight changed before start promotion"
            )
        started_at = evidence.get("started_at")
        if not isinstance(started_at, str):
            raise QuickValidationStateError(
                "canonical traffic start time is missing"
            )
        _canonical_timestamp(started_at, "canonical traffic start time")
        started_deadline = parse_utc_timestamp(started_at) + timedelta(
            seconds=run.duration_seconds
        )
        deadline_fits_watchdog = started_deadline < parse_utc_timestamp(
            run.watchdog_at
        )
        expected_id = run.id
        expected_revision = run.revision

        def promote(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "preflight"
            ):
                raise QuickValidationStateError(
                    "quick-validation preflight changed before start promotion"
                )
            current_run.phase = (
                "running" if deadline_fits_watchdog else "stopping"
            )
            current_run.started_at = started_at
            current_run.deadline_at = canonical_utc_timestamp(started_deadline)
            current_run.traffic_session_id = evidence["session_id"]
            current_run.traffic_session_revision = evidence["session_revision"]
            current_run.traffic_run_id = evidence["traffic_run_id"]
            current_run.group.profile_sha256 = evidence["profile_sha256"]
            current_run.pending_terminal = (
                None if deadline_fits_watchdog else "fail"
            )
            current_run.recovery_required = False
            current_run.failure_code = (
                None
                if deadline_fits_watchdog
                else "quick_validation_duration_window_unavailable"
            )
            current_run.failure_detail = (
                None
                if deadline_fits_watchdog
                else (
                    "canonical traffic start left insufficient time to complete "
                    "the requested duration before the hard-stop watchdog"
                )
            )
            current_run.revision += 1
            return current

        return self.store.update(promote)

    def _bind_recovered_session(
        self,
        document: QuickValidationStateDocument,
        evidence: dict[str, Any],
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping" or run.traffic_session_id is not None:
            raise QuickValidationStateError(
                "quick-validation recovery binding is no longer applicable"
            )
        expected_id = run.id
        expected_revision = run.revision

        def bind(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "stopping"
                or current_run.traffic_session_id is not None
            ):
                raise QuickValidationStateError(
                    "quick-validation recovery binding changed"
                )
            current_run.started_at = evidence.get("started_at")
            current_run.deadline_at = canonical_utc_timestamp(
                parse_utc_timestamp(evidence["started_at"])
                + timedelta(seconds=current_run.duration_seconds)
            )
            current_run.traffic_session_id = evidence["session_id"]
            current_run.traffic_session_revision = evidence["session_revision"]
            current_run.traffic_run_id = evidence["traffic_run_id"]
            current_run.group.profile_sha256 = evidence["profile_sha256"]
            current_run.revision += 1
            return current

        return self.store.update(bind)

    def _refresh_session_revision(
        self,
        document: QuickValidationStateDocument,
        evidence: dict[str, Any],
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None:
            return document
        revision = evidence["session_revision"]
        if run.traffic_session_revision == revision:
            return document
        if (
            run.traffic_session_revision is not None
            and revision < run.traffic_session_revision
        ):
            raise QuickValidationStateError(
                "canonical traffic session revision moved backwards"
            )
        expected_id = run.id
        expected_revision = run.revision

        def refresh(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before session refresh"
                )
            current_run.traffic_session_revision = revision
            current_run.revision += 1
            return current

        return self.store.update(refresh)

    def _enter_stopping(
        self,
        document: QuickValidationStateDocument,
        *,
        pending_terminal: QuickValidationPendingTerminal,
        failure_code: str | None,
        failure_detail: str | None,
        recovery_required: bool,
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None:
            raise QuickValidationStateError(
                "cannot stop a missing quick-validation run"
            )
        if run.phase == "stopping":
            return document
        if run.phase in _TERMINAL_PHASES:
            return document
        expected_id = run.id
        expected_revision = run.revision

        def stop(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase in _TERMINAL_PHASES
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before stopping"
                )
            current_run.phase = "stopping"
            current_run.pending_terminal = pending_terminal
            current_run.failure_code = failure_code
            current_run.failure_detail = failure_detail
            current_run.recovery_required = recovery_required
            current_run.revision += 1
            return current

        return self.store.update(stop)

    def _change_pending_terminal(
        self,
        document: QuickValidationStateDocument,
        pending_terminal: QuickValidationPendingTerminal,
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping":
            return document
        expected_id = run.id
        expected_revision = run.revision

        def change(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "stopping"
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before cancellation"
                )
            current_run.pending_terminal = pending_terminal
            current_run.failure_code = None
            current_run.failure_detail = None
            current_run.revision += 1
            return current

        return self.store.update(change)

    def _fail_pending_terminal(
        self,
        document: QuickValidationStateDocument,
        code: str,
        detail: str,
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping":
            raise QuickValidationStateError(
                "cannot fail a non-stopping quick-validation run"
            )
        expected_id = run.id
        expected_revision = run.revision

        def fail(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "stopping"
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before terminal failure"
                )
            current_run.pending_terminal = "fail"
            current_run.failure_code = code
            current_run.failure_detail = detail
            current_run.recovery_required = False
            current_run.revision += 1
            return current

        return self.store.update(fail)

    def _set_recovery_detail(
        self,
        document: QuickValidationStateDocument,
        code: str,
        detail: str,
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping":
            return document
        if (
            run.recovery_required
            and run.failure_code == code
            and run.failure_detail == detail
        ):
            return document
        expected_id = run.id
        expected_revision = run.revision

        def retain(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "stopping"
            ):
                raise QuickValidationStateError(
                    "quick-validation cleanup state changed"
                )
            current_run.recovery_required = True
            if (
                current_run.pending_terminal != "fail"
                or current_run.failure_code is None
            ):
                current_run.failure_code = code
                current_run.failure_detail = detail
            if current_run.pending_terminal == "pass":
                current_run.pending_terminal = "fail"
            current_run.revision += 1
            return current

        return self.store.update(retain)

    def _finish_without_start(
        self,
        document: QuickValidationStateDocument,
        runtime: dict[str, Any],
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping":
            raise QuickValidationStateError(
                "not-started cleanup requires a stopping run"
            )
        if not self._ports_are_idle(runtime, run.group.ports):
            raise QuickValidationStateError(
                "not-started cleanup requires exact idle ports"
            )
        cleanup = QuickValidationCleanupEvidence(
            mode="not_started",
            completed_at=canonical_utc_timestamp(self._now()),
            final_port_states={port: "stopped" for port in run.group.ports},
            wal_cleared=True,
        )
        return self._finish(document, cleanup, force_terminal="fail")

    def _finish(
        self,
        document: QuickValidationStateDocument,
        cleanup: QuickValidationCleanupEvidence,
        *,
        force_terminal: QuickValidationTerminalPhase | None = None,
    ) -> QuickValidationStateDocument:
        run = document.run
        if run is None or run.phase != "stopping" or run.pending_terminal is None:
            raise QuickValidationStateError(
                "terminal transition requires a stopping quick-validation run"
            )
        terminal: QuickValidationTerminalPhase = (
            force_terminal or run.pending_terminal
        )
        failure_code = run.failure_code
        failure_detail = run.failure_detail
        if terminal == "pass":
            if cleanup.mode == "hard_stop":
                outcome = (
                    "quick_validation_hard_stop_triggered",
                    "the safety watchdog stopped traffic; an unattended hard-stop "
                    "cannot certify a passing guided run",
                )
            elif parse_utc_timestamp(cleanup.completed_at) < parse_utc_timestamp(
                run.deadline_at
            ):
                outcome = (
                    "quick_validation_traffic_stopped_early",
                    "canonical traffic cleanup completed before the requested duration",
                )
            else:
                outcome = self._passing_sample_failure(run)
            if outcome is not None:
                terminal = "fail"
                failure_code, failure_detail = outcome
        expected_id = run.id
        expected_revision = run.revision

        def finish(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase != "stopping"
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed before terminal persistence"
                )
            current_run.phase = terminal
            current_run.pending_terminal = None
            current_run.recovery_required = False
            current_run.failure_code = failure_code
            current_run.failure_detail = failure_detail
            current_run.cleanup = cleanup
            current_run.idle_verified = True
            current_run.ended_at = cleanup.completed_at
            if cleanup.traffic_session_revision is not None:
                current_run.traffic_session_revision = (
                    cleanup.traffic_session_revision
                )
            current_run.revision += 1
            return current

        return self.store.update(finish)

    @staticmethod
    def _passing_sample_failure(
        run: QuickValidationRunState,
    ) -> tuple[str, str] | None:
        if not run.samples:
            return (
                "quick_validation_packets_missing",
                "no per-port packet sample was recorded",
            )
        sample = run.samples[-1]
        if parse_utc_timestamp(sample.sampled_at) < parse_utc_timestamp(
            run.deadline_at
        ):
            return (
                "quick_validation_final_sample_missing",
                "the latest packet sample predates the canonical traffic deadline",
            )
        missing = [
            f"P{port.port}"
            for port in sample.ports
            if port.tx_packets <= 0 or port.rx_packets <= 0
        ]
        if missing:
            return (
                "quick_validation_packets_missing",
                "TX/RX packet growth is missing on " + ", ".join(missing),
            )
        if sample.total_loss_packets > 0:
            return (
                "quick_validation_packet_loss",
                f"aggregate packet deficit is {sample.total_loss_packets:g}",
            )
        lossy_ports = [
            f"P{port.port}"
            for port in sample.ports
            if port.loss_packets > 0
        ]
        if lossy_ports:
            return (
                "quick_validation_packet_loss",
                "per-port packet deficit detected on " + ", ".join(lossy_ports),
            )
        return None

    def _mark_restart_recovery(
        self,
        document: QuickValidationStateDocument,
    ) -> tuple[QuickValidationStateDocument, str | None]:
        run = document.run
        if (
            run is None
            or run.phase in _TERMINAL_PHASES
            or run.process_instance_id == self._process_instance_id
        ):
            return document, None
        if run.phase == "stopping" and run.recovery_required:
            return document, "API restart recovery remains fail-closed"
        expected_id = run.id
        expected_revision = run.revision

        def recover(
            current: QuickValidationStateDocument,
        ) -> QuickValidationStateDocument:
            current_run = current.run
            if (
                current_run is None
                or current_run.id != expected_id
                or current_run.revision != expected_revision
                or current_run.phase in _TERMINAL_PHASES
            ):
                raise QuickValidationStateError(
                    "quick-validation run changed during restart recovery"
                )
            current_run.phase = "stopping"
            current_run.pending_terminal = "fail"
            current_run.recovery_required = True
            current_run.failure_code = "quick_validation_api_restarted"
            current_run.failure_detail = (
                "API process changed while the guided run was non-terminal; "
                "canonical traffic cleanup must be re-verified"
            )
            current_run.revision += 1
            return current

        return self.store.update(recover), "API restart detected"

    @staticmethod
    def _assert_start_cas(
        document: QuickValidationStateDocument,
        expected_run_id: str | None,
        expected_run_revision: int | None,
    ) -> None:
        run = document.run
        if run is None:
            if expected_run_id is not None or expected_run_revision is not None:
                raise QuickValidationStateError(
                    "expected a previous quick-validation run, but none exists"
                )
            return
        if (
            expected_run_id != run.id
            or expected_run_revision != run.revision
        ):
            raise QuickValidationStateError(
                f"quick-validation run is {run.id} revision {run.revision}; "
                "refresh status before starting"
            )
        if run.phase not in _TERMINAL_PHASES:
            raise QuickValidationStateError(
                f"quick-validation run {run.id} is still {run.phase}"
            )

    def _status_payload(
        self,
        document: QuickValidationStateDocument,
        reconciliation: str,
    ) -> dict[str, Any]:
        run = document.run
        return QuickValidationStatusResponse(
            state_version=QUICK_VALIDATION_STATE_VERSION,
            state_revision=document.revision,
            active=run is not None and run.phase not in _TERMINAL_PHASES,
            recovery_required=run.recovery_required if run is not None else False,
            run=run,
            reconciliation=reconciliation,
        ).model_dump(mode="json")

    def _now(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise QuickValidationStateError(
                "quick-validation clock must use absolute UTC"
            )
        return value.astimezone(timezone.utc)


def get_quick_validation_authority(
    service: QuickValidationService,
) -> QuickValidationAuthority:
    with _AUTHORITIES_LOCK:
        authority = _AUTHORITIES.get(service)
        if authority is None:
            authority = QuickValidationAuthority(service)
            _AUTHORITIES[service] = authority
        return authority
