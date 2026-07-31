from __future__ import annotations

import hashlib
import stat
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Literal

import yaml
from pydantic import ValidationError

from app.core.settings import TrexEnvironment
from app.trex.config_model import TrexConfig
from app.trex.port_operations import _normalize_port_list
from app.trex.result import TrexCallResult
from app.trex.runtime_authority import RuntimeAuthorityProvider
from app.trex.runtime_mutation import (
    RuntimeConnectionTargetMismatch,
    assert_persisted_connection_target,
    runtime_hard_stop_priority_active,
    runtime_mutation_fence,
)
from app.trex.runtime_state import (
    RuntimeAuthorityIdentity,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
    TrafficGroupState,
    TrafficMutationIntentState,
    TrafficSessionGroupState,
    TrafficSessionState,
    utc_now_iso,
)
from app.trex.traffic_operations import (
    start_profile as execute_start_profile,
    traffic_action as execute_traffic_action,
    update_traffic as execute_update_traffic,
)
from app.trex.traffic_hard_stop import (
    TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS,
    canonical_utc_timestamp,
    hard_stop_is_expired,
    normalize_hard_stop_at,
    parse_utc_timestamp,
    utc_now,
)


WithClient = Callable[[Callable[[Any], Any]], TrexCallResult]
ProfileResolver = Callable[[str], TrexCallResult]
PortState = Literal["running", "paused", "stopped", "unknown"]
GroupState = Literal["running", "paused", "stopped", "mixed", "unknown"]
PortLinkState = Literal["up", "down", "unknown"]

DEFAULT_TRAFFIC_PROFILE = "udp_1pkt_simple.py"
TREX_CONFIG_MAX_BYTES = 1024 * 1024
_LINK_UP_VALUES = {"1", "ACTIVE", "ON", "TRUE", "UP", "YES"}
_LINK_DOWN_VALUES = {"0", "DOWN", "FALSE", "INACTIVE", "NO", "OFF"}
_START_STAGE_ORDER = {
    "prepared": 0,
    "acquire_intent": 1,
    "acquired": 2,
    "streams_remove_intent": 3,
    "streams_removed": 4,
    "profile_add_intent": 5,
    "profile_added": 6,
    "start_intent": 7,
    "start_returned": 8,
}


class TrafficPlanRevisionConflict(RuntimeError):
    pass


class TrafficPlanRuntimeBusy(RuntimeError):
    pass


class TrafficRuntimeAuthorityMismatch(RuntimeStateError):
    pass


class TrafficSessionIdConflict(TrafficRuntimeAuthorityMismatch):
    pass


class TrafficPartialGroupUpdate(TrafficRuntimeAuthorityMismatch):
    pass


class TrafficMutationRecoveryRequired(RuntimeStateError):
    pass


def _failure(blocker: str, error: str, data: Any = None) -> TrexCallResult:
    return TrexCallResult(False, data=data, blocker=blocker, error=error)


def _load_config(env: TrexEnvironment) -> TrexConfig:
    path = env.config_path
    try:
        file_stat = path.lstat()
    except OSError as exc:
        raise RuntimeStateError(f"cannot inspect TRex config '{path}': {exc}") from exc
    if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
        raise RuntimeStateError("TRex config must be a non-symlink regular file")
    if file_stat.st_size > TREX_CONFIG_MAX_BYTES:
        raise RuntimeStateError("TRex config exceeds the maximum supported size")
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise RuntimeStateError(f"cannot read TRex config '{path}': {exc}") from exc
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
        raise RuntimeStateError("TRex config must contain exactly one top-level mapping")
    try:
        return TrexConfig.model_validate(payload[0])
    except ValidationError as exc:
        raise RuntimeStateError(f"TRex config is invalid: {exc}") from exc


def _profile_sha256(path: str) -> str:
    profile_path = Path(path)
    try:
        file_stat = profile_path.lstat()
        if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
            raise RuntimeStateError(
                "traffic profile must be a non-symlink regular file"
            )
        return hashlib.sha256(profile_path.read_bytes()).hexdigest()
    except OSError as exc:
        raise RuntimeStateError(
            f"cannot read traffic profile identity '{profile_path}': {exc}"
        ) from exc


def _port_object(client: Any, port: int) -> Any | None:
    ports = getattr(client, "ports", None)
    if isinstance(ports, dict):
        return ports.get(port)
    try:
        return ports[port]
    except (KeyError, IndexError, TypeError):
        return None


def _real_port_state(client: Any, port: int) -> PortState:
    port_object = _port_object(client, port)
    if port_object is None:
        return "unknown"
    try:
        if callable(getattr(port_object, "is_paused", None)) and port_object.is_paused():
            return "paused"
        if callable(getattr(port_object, "is_transmitting", None)) and port_object.is_transmitting():
            return "running"
        if callable(getattr(port_object, "is_active", None)) and port_object.is_active():
            return "unknown"
        state_name = (
            port_object.get_port_state_name()
            if callable(getattr(port_object, "get_port_state_name", None))
            else None
        )
    except Exception:
        return "unknown"
    if isinstance(state_name, str) and state_name.upper() in {"IDLE", "LOADED"}:
        return "stopped"
    return "unknown"


def _require_sdk_result(result: Any, operation: str) -> None:
    if result is None:
        raise RuntimeError(f"{operation} returned no success evidence")
    bad = getattr(result, "bad", None)
    if callable(bad) and bad():
        detail = getattr(result, "err", None)
        rendered = detail() if callable(detail) else result
        raise RuntimeError(f"{operation} failed: {rendered}")
    if not result:
        raise RuntimeError(f"{operation} failed")


def _sync_port_state(client: Any, port: int) -> None:
    port_object = _port_object(client, port)
    sync = getattr(port_object, "sync", None)
    if not callable(sync):
        raise RuntimeError(f"TRex port {port} does not support an explicit state sync")
    _require_sdk_result(sync(), f"TRex port {port} state sync")


def _real_port_links(client: Any, ports: list[int]) -> dict[int, PortLinkState]:
    try:
        records = client.get_port_info(ports)
    except Exception:
        return {port: "unknown" for port in ports}
    if not isinstance(records, list):
        return {port: "unknown" for port in ports}

    links: dict[int, PortLinkState] = {}
    for index, port in enumerate(ports):
        record = records[index] if index < len(records) and isinstance(records[index], dict) else {}
        value = record.get("link", record.get("link_status"))
        if isinstance(value, bool):
            links[port] = "up" if value else "down"
        elif isinstance(value, int) and not isinstance(value, bool):
            links[port] = "up" if value == 1 else "down" if value == 0 else "unknown"
        elif isinstance(value, str):
            normalized = value.strip().upper()
            links[port] = (
                "up"
                if normalized in _LINK_UP_VALUES
                else "down"
                if normalized in _LINK_DOWN_VALUES
                else "unknown"
            )
        else:
            links[port] = "unknown"
    return links


def traffic_start_preflight(client: Any, ports: list[int]) -> None:
    try:
        available_ports = list(client.get_all_ports())
    except Exception as exc:
        raise RuntimeError(f"cannot determine TRex port inventory before traffic start: {exc}") from exc
    missing_ports = sorted(set(ports).difference(available_ports))
    if missing_ports:
        raise ValueError(f"traffic ports do not exist: {missing_ports}")
    for port in ports:
        _sync_port_state(client, port)
    states = {port: _real_port_state(client, port) for port in ports}
    blocked = {port: state for port, state in states.items() if state != "stopped"}
    if blocked:
        rendered = ", ".join(f"P{port}={state}" for port, state in sorted(blocked.items()))
        raise RuntimeError(f"traffic start requires known idle ports; {rendered}")
    blocked_links = {
        port: link_state
        for port, link_state in _real_port_links(client, ports).items()
        if link_state != "up"
    }
    if blocked_links:
        rendered = ", ".join(
            f"P{port}={link_state}"
            for port, link_state in sorted(blocked_links.items())
        )
        raise RuntimeError(f"traffic start requires link-up ports; {rendered}")


class TrafficRuntimeAuthority:
    """Owns the persisted traffic plan and reconciles it with the live STL server."""

    def __init__(
        self,
        env: TrexEnvironment,
        resolve_profile_path: ProfileResolver,
        with_client: WithClient,
        *,
        store: RuntimeStateStore | None = None,
        runtime_authority: RuntimeAuthorityProvider | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.env = env
        self.resolve_profile_path = resolve_profile_path
        self.with_client = with_client
        self.store = store or RuntimeStateStore(env.runtime_state_path)
        self._runtime_authority = runtime_authority or RuntimeAuthorityProvider(env)
        self._clock = clock
        self._lock = threading.RLock()
        self._owned_session_id: str | None = None

    def snapshot(self) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            try:
                current_authority = self._runtime_authority.current()
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_authority_invalid", str(exc))
            try:
                config = _load_config(self.env)
                document = self._initialize_default_plan(config)
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))

            if not runtime_hard_stop_priority_active():
                deadlines = [
                    group.hard_stop_at
                    for group in (
                        document.traffic_session.groups
                        if document.traffic_session is not None
                        else []
                    )
                    if group.hard_stop_at is not None
                    and group.state != "stopped"
                ]
                intent = document.traffic_mutation_intent
                if (
                    intent is not None
                    and intent.operation == "start"
                    and intent.start_group is not None
                    and intent.start_group.hard_stop_at is not None
                ):
                    deadlines.append(intent.start_group.hard_stop_at)
                budget_failure = self._hard_stop_rpc_budget_failure(
                    deadlines,
                    "snapshot",
                    rpc_count=config.port_limit + 1,
                )
                if budget_failure is not None:
                    return TrexCallResult(
                        True,
                        data=self._snapshot_payload(
                            document,
                            config,
                            {
                                port: "unknown"
                                for port in range(config.port_limit)
                            },
                            "durable-only snapshot; live TRex sampling is "
                            "deferred to preserve the hard-stop supervisor "
                            "window",
                            current_authority,
                            live_state_sampled=False,
                        ),
                    )

            configured_ports = list(range(config.port_limit))
            live_result = self.with_client(lambda client: self._live_port_states(client, configured_ports))
            sampled_states = (
                live_result.data
                if live_result.ok and isinstance(live_result.data, dict)
                else {}
            )
            live_state_sampled = all(
                sampled_states.get(port, "unknown") != "unknown"
                for port in configured_ports
            )
            if live_state_sampled:
                live_states = sampled_states
                reconciliation = "live TRex port state reconciled"
            else:
                live_states = {port: "unknown" for port in configured_ports}
                detail = live_result.error or live_result.blocker or "TRex state unavailable"
                reconciliation = f"live TRex port state unavailable: {detail}"
                # A failed or partial sample is not evidence that the exact
                # durable managed state changed. In particular, never
                # overwrite a running/paused hard-stop lease with "unknown":
                # a fresh process must retain that baseline so the expiry
                # supervisor can adopt and stop the exact ports.
                return TrexCallResult(
                    True,
                    data=self._snapshot_payload(
                        document,
                        config,
                        live_states,
                        reconciliation,
                        current_authority,
                        live_state_sampled=False,
                    ),
                )

            if document.traffic_mutation_intent is not None:
                try:
                    document, live_states, recovery = (
                        self._recover_traffic_mutation_intent(
                            document,
                            live_states,
                            configured_ports,
                            current_authority,
                        )
                    )
                except RuntimeStateError as exc:
                    return _failure("traffic_runtime_state_invalid", str(exc))
                reconciliation += f"; {recovery}"
                if document.traffic_mutation_intent is not None:
                    return TrexCallResult(
                        True,
                        data=self._snapshot_payload(
                            document,
                            config,
                            live_states,
                            reconciliation,
                            current_authority,
                            live_state_sampled=live_state_sampled,
                        ),
                    )

            if self._adopt_managed_session(
                document,
                live_states,
                current_authority,
            ):
                reconciliation += "; managed session authority recovered after API restart"
            try:
                document = self._reconcile_session(
                    document,
                    live_states,
                    reconciliation,
                    current_authority,
                )
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            return TrexCallResult(
                True,
                data=self._snapshot_payload(
                    document,
                    config,
                    live_states,
                    reconciliation,
                    current_authority,
                    live_state_sampled=live_state_sampled,
                ),
            )

    def reap_expired_hard_stops(
        self,
        now: datetime | None = None,
    ) -> TrexCallResult:
        """Stop only expired, exactly owned session-group leases."""

        with runtime_mutation_fence(hard_stop=True), self._lock:
            observed_at = self._clock() if now is None else now
            try:
                checked_at = canonical_utc_timestamp(observed_at)
            except ValueError as exc:
                return _failure("traffic_hard_stop_clock_invalid", str(exc))
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            try:
                document = self.store.load()
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))

            if document.traffic_mutation_intent is None:
                stopped_with_lease = [
                    group
                    for group in (
                        document.traffic_session.groups
                        if document.traffic_session is not None
                        else []
                    )
                    if group.state == "stopped"
                    and group.hard_stop_at is not None
                ]
                if stopped_with_lease:
                    expected_session_id = document.traffic_session.id

                    def clear_stopped(
                        current: RuntimeStateDocument,
                    ) -> RuntimeStateDocument | None:
                        session = current.traffic_session
                        if (
                            session is None
                            or session.id != expected_session_id
                            or current.traffic_mutation_intent is not None
                        ):
                            return None
                        changed = False
                        for group in session.groups:
                            if (
                                group.state == "stopped"
                                and group.hard_stop_at is not None
                            ):
                                group.hard_stop_at = None
                                changed = True
                        return current if changed else None

                    document = self.store.update(clear_stopped)

            intent = document.traffic_mutation_intent
            expired_start_intent = (
                intent is not None
                and intent.operation == "start"
                and intent.start_group is not None
                and intent.start_group.hard_stop_at is not None
                and hard_stop_is_expired(
                    intent.start_group.hard_stop_at,
                    observed_at,
                )
            )
            expired_session_groups = [
                group
                for group in (
                    document.traffic_session.groups
                    if document.traffic_session is not None
                    else []
                )
                if group.hard_stop_at is not None
                and hard_stop_is_expired(group.hard_stop_at, observed_at)
                and group.state != "stopped"
            ]
            if not expired_start_intent and not expired_session_groups:
                return TrexCallResult(
                    True,
                    data={
                        "checked_at": checked_at,
                        "attempted": False,
                        "session_id": None,
                        "ports": [],
                        "stopped": False,
                    },
                )

            # An expired, already-promoted session lease outranks every pending
            # mutation. Ordinary snapshot recovery can replay update/start WAL,
            # so it must not run before the supervisor has stopped the leased
            # ports.
            if expired_session_groups and intent is not None:
                session = document.traffic_session
                if session is None:
                    return _failure(
                        "traffic_hard_stop_recovery_required",
                        "expired traffic lease has no persisted session",
                        {
                            "checked_at": checked_at,
                            "session_id": None,
                            "ports": [],
                        },
                    )
                try:
                    current_authority = self._runtime_authority.current()
                except RuntimeStateError as exc:
                    return _failure(
                        "traffic_runtime_authority_invalid",
                        str(exc),
                    )
                if session.authority != current_authority:
                    return _failure(
                        "traffic_hard_stop_authority_mismatch",
                        "expired traffic lease belongs to a different TRex "
                        "target or daemon generation; no stop was issued",
                        {
                            "checked_at": checked_at,
                            "session_id": session.id,
                            "ports": [],
                        },
                    )
                return self._stop_expired_leases_over_pending_mutation(
                    document=document,
                    session=session,
                    intent=intent,
                    leased_groups=expired_session_groups,
                    current_authority=current_authority,
                    observed_at=observed_at,
                    checked_at=checked_at,
                )

            reconciled = self.snapshot()
            if not reconciled.ok:
                return _failure(
                    reconciled.blocker or "traffic_hard_stop_reconciliation_failed",
                    reconciled.error
                    or "cannot reconcile an expired traffic hard-stop lease",
                    reconciled.data,
                )
            try:
                document = self.store.load()
                current_authority = self._runtime_authority.current()
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))

            remaining_intent = document.traffic_mutation_intent
            if (
                remaining_intent is not None
                and remaining_intent.operation == "start"
                and remaining_intent.start_group is not None
                and remaining_intent.start_group.hard_stop_at is not None
                and hard_stop_is_expired(
                    remaining_intent.start_group.hard_stop_at,
                    observed_at,
                )
            ):
                return _failure(
                    "traffic_hard_stop_recovery_required",
                    "expired traffic start intent could not be exactly rolled "
                    "back; it remains authoritative and was not replayed",
                    {
                        "checked_at": checked_at,
                        "intent_nonce": remaining_intent.nonce,
                        "ports": remaining_intent.ports,
                    },
                )

            session = document.traffic_session
            if session is None:
                return TrexCallResult(
                    True,
                    data={
                        "checked_at": checked_at,
                        "attempted": expired_start_intent,
                        "session_id": None,
                        "ports": [],
                        "stopped": expired_start_intent,
                    },
                )
            if session.authority != current_authority:
                return _failure(
                    "traffic_hard_stop_authority_mismatch",
                    "expired traffic lease belongs to a different TRex target "
                    "or daemon generation; no stop was issued",
                    {
                        "checked_at": checked_at,
                        "session_id": session.id,
                        "ports": [],
                    },
                )

            leased_groups = [
                group
                for group in session.groups
                if group.hard_stop_at is not None
                and hard_stop_is_expired(group.hard_stop_at, observed_at)
                and group.state != "stopped"
            ]
            if not leased_groups:
                return TrexCallResult(
                    True,
                    data={
                        "checked_at": checked_at,
                        "attempted": expired_start_intent,
                        "session_id": session.id,
                        "ports": [],
                        "stopped": expired_start_intent,
                    },
                )
            if remaining_intent is not None:
                return self._stop_expired_leases_over_pending_mutation(
                    document=document,
                    session=session,
                    intent=remaining_intent,
                    leased_groups=leased_groups,
                    current_authority=current_authority,
                    observed_at=observed_at,
                    checked_at=checked_at,
                )
            unknown_ports = sorted(
                port
                for group in leased_groups
                for port, state in group.port_states.items()
                if state == "unknown"
            )
            if unknown_ports:
                return _failure(
                    "traffic_hard_stop_state_unverifiable",
                    "expired traffic lease contains unknown live state; no "
                    "stop was issued",
                    {
                        "checked_at": checked_at,
                        "session_id": session.id,
                        "ports": unknown_ports,
                    },
                )
            target_ports = sorted(
                {
                    port
                    for group in leased_groups
                    for port, state in group.port_states.items()
                    if state in {"running", "paused"}
                }
            )
            if not target_ports:
                return _failure(
                    "traffic_hard_stop_state_unverifiable",
                    "expired traffic lease has no exactly active managed ports",
                    {
                        "checked_at": checked_at,
                        "session_id": session.id,
                        "ports": [],
                    },
                )

            expected_session_id = session.id
            stop_result = self.action(
                "stop",
                target_ports,
                expected_session_id=expected_session_id,
            )
            if not stop_result.ok:
                return _failure(
                    stop_result.blocker or "traffic_hard_stop_failed",
                    stop_result.error or "expired traffic hard stop failed",
                    {
                        "checked_at": checked_at,
                        "session_id": expected_session_id,
                        "ports": target_ports,
                        "result": stop_result.data,
                    },
                )
            return TrexCallResult(
                True,
                data={
                    "checked_at": checked_at,
                    "attempted": True,
                    "session_id": expected_session_id,
                    "ports": target_ports,
                    "stopped": True,
                    "result": stop_result.data,
                },
            )

    def _stop_expired_leases_over_pending_mutation(
        self,
        *,
        document: RuntimeStateDocument,
        session: TrafficSessionState,
        intent: TrafficMutationIntentState,
        leased_groups: list[TrafficSessionGroupState],
        current_authority: RuntimeAuthorityIdentity,
        observed_at: datetime,
        checked_at: str,
    ) -> TrexCallResult:
        """Give an expired durable lease priority over every pending mutation."""

        if (
            document.traffic_session != session
            or document.traffic_mutation_intent != intent
            or intent.session_before != session
            or intent.expected_session_id != session.id
            or intent.authority != current_authority
            or session.authority != current_authority
        ):
            return _failure(
                "traffic_hard_stop_authority_mismatch",
                "pending traffic mutation does not share the exact expired "
                "lease session and authority; no stop was issued",
                {
                    "checked_at": checked_at,
                    "session_id": session.id,
                    "ports": [],
                },
            )
        expired_start_intent = (
            intent.operation == "start"
            and intent.start_group is not None
            and intent.start_group.hard_stop_at is not None
            and hard_stop_is_expired(
                intent.start_group.hard_stop_at,
                observed_at,
            )
        )
        all_expired_ports = sorted(
            {
                *(
                    port
                    for group in leased_groups
                    for port in group.ports
                ),
                *(
                    intent.ports
                    if expired_start_intent
                    else []
                ),
            }
        )
        is_superseding_stop = self._is_hard_stop_superseding_intent(intent)
        target_ports = (
            list(intent.ports)
            if is_superseding_stop
            else all_expired_ports
        )
        lease_identity = {
            (tuple(group.ports), group.hard_stop_at)
            for group in leased_groups
        }
        if (
            not target_ports
            or not set(target_ports).issubset(all_expired_ports)
        ):
            return _failure(
                "traffic_hard_stop_session_conflict",
                "persisted hard-stop WAL no longer exactly matches an "
                "expired session lease; no stop was issued",
                {
                    "checked_at": checked_at,
                    "session_id": session.id,
                    "ports": target_ports,
                },
            )
        try:
            configured_ports = list(range(_load_config(self.env).port_limit))
        except RuntimeStateError as exc:
            return _failure("traffic_runtime_state_invalid", str(exc))

        try:
            latest = self.store.load()
        except RuntimeStateError as exc:
            return _failure("traffic_runtime_state_invalid", str(exc))
        if (
            latest.traffic_session != session
            or latest.traffic_mutation_intent != intent
        ):
            return _failure(
                "traffic_hard_stop_session_conflict",
                "traffic session or mutation changed before the exact "
                "hard-stop RPC; no stop was issued",
                {
                    "checked_at": checked_at,
                    "session_id": session.id,
                    "ports": target_ports,
                },
            )

        if is_superseding_stop:
            hard_stop_intent = intent
        else:
            baseline_result = self._sample_session_mutation_baseline(
                configured_ports,
                target_ports,
            )
            if not baseline_result.ok or not isinstance(
                baseline_result.data,
                dict,
            ):
                return baseline_result
            baseline_states = baseline_result.data["port_states"]
            current_acquired = set(
                baseline_result.data["acquired_ports"]
            )
            original_targets = set(intent.ports)
            restore_acquired = sorted(
                current_acquired.difference(original_targets).union(
                    set(intent.baseline_acquired_ports).intersection(
                        target_ports
                    )
                )
            )
            can_supersede_intent = (
                intent.operation != "start"
                and original_targets.issubset(target_ports)
            )
            if not can_supersede_intent:
                direct_intent = TrafficMutationIntentState(
                    nonce=str(uuid.uuid4()),
                    phase="prepared",
                    operation="stop",
                    authority=current_authority,
                    expected_session_id=session.id,
                    ports=target_ports,
                    baseline_port_states=baseline_states,
                    desired_port_states={
                        port: "stopped"
                        for port in target_ports
                    },
                    session_before=session.model_copy(deep=True),
                    baseline_acquired_ports=restore_acquired,
                    prepared_at=utc_now_iso(),
                    reconciliation=(
                        "ephemeral exact stop authorized by an already-fsynced "
                        "expired lease while an unrelated WAL is retained"
                    ),
                )
                stopped = self._execute_exact_hard_stop_intent(
                    direct_intent,
                    configured_ports,
                )
                stopped_data = (
                    stopped.data if isinstance(stopped.data, dict) else {}
                )
                if not stopped.ok:
                    return _failure(
                        stopped.blocker or "traffic_hard_stop_failed",
                        stopped.error
                        or "expired traffic hard-stop RPC failed",
                        {
                            "checked_at": checked_at,
                            "session_id": session.id,
                            "ports": target_ports,
                            "rpc_ports": stopped_data.get("rpc_ports", []),
                            "stopped": False,
                            "intent_nonce": intent.nonce,
                        },
                    )
                if expired_start_intent:
                    rollback = self._rollback_failed_start(intent)
                    if not rollback.ok:
                        return _failure(
                            "traffic_hard_stop_recovery_required",
                            "all expired traffic was stopped, but the expired "
                            "start WAL could not restore its exact stream and "
                            "acquisition baseline",
                            {
                                "checked_at": checked_at,
                                "session_id": session.id,
                                "ports": target_ports,
                                "rpc_ports": stopped_data.get(
                                    "rpc_ports",
                                    [],
                                ),
                                "stopped": True,
                                "state_persisted": False,
                                "intent_nonce": intent.nonce,
                                "recovery_error": (
                                    rollback.error or rollback.blocker
                                ),
                            },
                        )
                    sampled = self._sample_mutation_baseline(
                        configured_ports
                    )
                    if not sampled.ok or not isinstance(
                        sampled.data,
                        dict,
                    ):
                        return _failure(
                            "traffic_hard_stop_recovery_required",
                            "expired start rollback could not be verified after "
                            "the exact hard stop",
                            {
                                "checked_at": checked_at,
                                "session_id": session.id,
                                "ports": target_ports,
                                "stopped": True,
                                "state_persisted": False,
                                "intent_nonce": intent.nonce,
                            },
                        )
                    try:
                        cleared = self._clear_traffic_mutation_intent(
                            intent.nonce,
                            intent.session_before,
                        )
                        self._owned_session_id = session.id
                        reconciled = self._reconcile_session(
                            cleared,
                            sampled.data,
                            (
                                "expired promoted lease stopped before exact "
                                f"rollback of expired start intent {intent.nonce}"
                            ),
                            current_authority,
                        )
                    except RuntimeStateError as exc:
                        return _failure(
                            "traffic_hard_stop_persist_failed",
                            "expired traffic was stopped but start-WAL "
                            f"retirement could not be persisted: {exc}",
                            {
                                "checked_at": checked_at,
                                "session_id": session.id,
                                "ports": target_ports,
                                "stopped": True,
                                "state_persisted": False,
                                "intent_nonce": intent.nonce,
                            },
                        )
                    return TrexCallResult(
                        True,
                        data={
                            "checked_at": checked_at,
                            "attempted": True,
                            "session_id": session.id,
                            "ports": target_ports,
                            "rpc_ports": stopped_data.get("rpc_ports", []),
                            "stopped": True,
                            "state_persisted": True,
                            "superseded_intent": intent.nonce,
                            "session": (
                                reconciled.traffic_session.model_dump(
                                    mode="json"
                                )
                                if reconciled.traffic_session is not None
                                else None
                            ),
                        },
                    )

                now_text = utc_now_iso()
                expired_group_ports = {
                    port
                    for group in leased_groups
                    for port in group.ports
                }

                def retain_after_stop(
                    current: RuntimeStateDocument,
                ) -> RuntimeStateDocument:
                    current_session = current.traffic_session
                    current_intent = current.traffic_mutation_intent
                    if (
                        current_session != session
                        or current_intent != intent
                        or current_intent.session_before != current_session
                    ):
                        raise TrafficSessionIdConflict(
                            "traffic session or pending mutation changed "
                            "before hard-stop persistence"
                        )
                    matched = False
                    for group in current_session.groups:
                        identity = (tuple(group.ports), group.hard_stop_at)
                        if identity not in lease_identity:
                            continue
                        group.port_states = {
                            port: "stopped"
                            for port in group.ports
                        }
                        group.state = "stopped"
                        group.hard_stop_at = None
                        group.updated_at = now_text
                        matched = True
                    if not matched:
                        raise TrafficSessionIdConflict(
                            "expired lease disappeared before hard-stop "
                            "persistence"
                        )
                    current_session.state = self._aggregate_state(
                        current_session.groups
                    )
                    current_session.updated_at = now_text
                    current_session.ended_at = (
                        now_text
                        if current_session.state == "stopped"
                        else None
                    )
                    current_session.reconciliation = (
                        "expired lease stopped before retaining disjoint "
                        f"traffic {current_intent.operation} intent "
                        f"{current_intent.nonce}"
                    )
                    for port in expired_group_ports:
                        current_intent.baseline_port_states[port] = "stopped"
                        if (
                            current_intent.operation == "update"
                            and port in current_intent.desired_port_states
                        ):
                            current_intent.desired_port_states[port] = (
                                "stopped"
                            )
                    overlaps = bool(
                        set(current_intent.ports).intersection(
                            expired_group_ports
                        )
                    )
                    if overlaps:
                        current_intent.phase = "cleanup_required"
                        current_intent.reconciliation = (
                            "expired lease stopped ports inside this mutation; "
                            "the WAL is retained fail-closed and will not replay"
                        )
                    if (
                        current_intent.operation == "start"
                        and not overlaps
                        and current_session.state == "stopped"
                    ):
                        current_intent.expected_session_id = None
                    current_intent.session_before = (
                        current_session.model_copy(deep=True)
                    )
                    return current

                try:
                    retained = self.store.update(retain_after_stop)
                except RuntimeStateError as exc:
                    return _failure(
                        "traffic_hard_stop_persist_failed",
                        "expired lease traffic was stopped but the disjoint "
                        f"pending WAL could not be retained consistently: {exc}",
                        {
                            "checked_at": checked_at,
                            "session_id": session.id,
                            "ports": target_ports,
                            "rpc_ports": stopped_data.get("rpc_ports", []),
                            "stopped": True,
                            "state_persisted": False,
                            "intent_nonce": intent.nonce,
                        },
                    )
                retained_session = retained.traffic_session
                if (
                    retained_session is not None
                    and retained_session.state != "stopped"
                ):
                    self._owned_session_id = retained_session.id
                else:
                    self._owned_session_id = None
                return TrexCallResult(
                    True,
                    data={
                        "checked_at": checked_at,
                        "attempted": True,
                        "session_id": session.id,
                        "ports": target_ports,
                        "rpc_ports": stopped_data.get("rpc_ports", []),
                        "stopped": True,
                        "state_persisted": True,
                        "pending_intent_retained": intent.nonce,
                    },
                )

            hard_stop_intent = TrafficMutationIntentState(
                nonce=str(uuid.uuid4()),
                phase="prepared",
                operation="stop",
                authority=current_authority,
                expected_session_id=session.id,
                ports=target_ports,
                baseline_port_states=baseline_states,
                desired_port_states={
                    port: "stopped"
                    for port in target_ports
                },
                session_before=session.model_copy(deep=True),
                baseline_acquired_ports=restore_acquired,
                superseded_intent_nonce=intent.nonce,
                superseded_intent_operation=intent.operation,
                superseded_intent_ports=list(intent.ports),
                superseded_reason=(
                    "expired durable traffic hard-stop lease superseded the "
                    "same-session mutation before any stop RPC"
                ),
                prepared_at=utc_now_iso(),
                reconciliation=(
                    "prepared exact expired-lease stop before live TRex mutation"
                ),
            )

            def supersede(
                current: RuntimeStateDocument,
            ) -> RuntimeStateDocument:
                current_session = current.traffic_session
                current_intent = current.traffic_mutation_intent
                if (
                    current_session != session
                    or current_intent != intent
                    or current_intent.session_before != current_session
                    or current_session.authority != current_authority
                ):
                    raise TrafficSessionIdConflict(
                        "traffic session or mutation changed before durable "
                        "hard-stop supersession"
                    )
                current_leases = {
                    (tuple(group.ports), group.hard_stop_at)
                    for group in current_session.groups
                    if group.hard_stop_at is not None
                    and hard_stop_is_expired(
                        group.hard_stop_at,
                        observed_at,
                    )
                    and group.state != "stopped"
                }
                if not lease_identity.issubset(current_leases):
                    raise TrafficSessionIdConflict(
                        "traffic hard-stop lease changed before durable "
                        "supersession"
                    )
                current.traffic_mutation_intent = hard_stop_intent
                return current

            try:
                updated = self.store.update(supersede)
            except RuntimeStateError as exc:
                return _failure(
                    "traffic_hard_stop_persist_failed",
                    "cannot fsync the exact expired-lease stop intent before "
                    f"hardware mutation: {exc}",
                    {
                        "checked_at": checked_at,
                        "session_id": session.id,
                        "ports": target_ports,
                        "stopped": False,
                    },
                )
            persisted_intent = updated.traffic_mutation_intent
            if (
                persisted_intent is None
                or persisted_intent != hard_stop_intent
            ):
                return _failure(
                    "traffic_hard_stop_persist_failed",
                    "the exact expired-lease stop intent is missing after fsync",
                    {
                        "checked_at": checked_at,
                        "session_id": session.id,
                        "ports": target_ports,
                        "stopped": False,
                    },
                )
            hard_stop_intent = persisted_intent

        stopped = self._execute_exact_hard_stop_intent(
            hard_stop_intent,
            configured_ports,
        )
        stopped_data = stopped.data if isinstance(stopped.data, dict) else {}
        if not stopped.ok:
            self._retain_failed_mutation_intent(
                hard_stop_intent.nonce,
                stopped.error
                or stopped.blocker
                or "expired traffic hard stop did not complete",
            )
            return _failure(
                stopped.blocker or "traffic_hard_stop_failed",
                stopped.error or "expired traffic hard-stop RPC failed",
                {
                    "checked_at": checked_at,
                    "session_id": session.id,
                    "ports": target_ports,
                    "rpc_ports": stopped_data.get("rpc_ports", []),
                    "stopped": False,
                    "state_persisted": False,
                    "intent_nonce": hard_stop_intent.nonce,
                },
            )
        try:
            self._assert_authority_unchanged(current_authority)
            self._owned_session_id = session.id
            updated_session = self._persist_action(
                "stop",
                target_ports,
                current_authority,
                hard_stop_intent.nonce,
            )
        except RuntimeStateError as exc:
            self._retain_failed_mutation_intent(
                hard_stop_intent.nonce,
                str(exc),
            )
            return _failure(
                "traffic_hard_stop_persist_failed",
                "expired lease traffic was stopped but its exact durable "
                f"promotion failed: {exc}",
                {
                    "checked_at": checked_at,
                    "session_id": session.id,
                    "ports": target_ports,
                    "rpc_ports": stopped_data.get("rpc_ports", []),
                    "stopped": True,
                    "state_persisted": False,
                    "intent_nonce": hard_stop_intent.nonce,
                },
            )
        if updated_session is not None and updated_session.state != "stopped":
            self._owned_session_id = updated_session.id
        return TrexCallResult(
            True,
            data={
                "checked_at": checked_at,
                "attempted": True,
                "session_id": session.id,
                "ports": target_ports,
                "rpc_ports": stopped_data.get("rpc_ports", []),
                "stopped": True,
                "state_persisted": True,
                "superseded_intent": (
                    hard_stop_intent.superseded_intent_nonce
                ),
            },
        )

    @staticmethod
    def _is_hard_stop_superseding_intent(
        intent: TrafficMutationIntentState,
    ) -> bool:
        return (
            intent.operation == "stop"
            and intent.superseded_intent_nonce is not None
            and intent.superseded_intent_operation is not None
            and intent.superseded_intent_ports is not None
            and intent.superseded_reason is not None
        )

    def _execute_exact_hard_stop_intent(
        self,
        intent: TrafficMutationIntentState,
        configured_ports: list[int],
    ) -> TrexCallResult:
        """Stop remaining exact ports and restore the intent acquisition baseline."""

        target_ports = list(intent.ports)
        target = set(target_ports)

        def stop_remaining(client: Any) -> dict[str, Any]:
            before = self._live_port_states(client, configured_ports)
            outside_changed_before = [
                port
                for port in configured_ports
                if port not in target
                and before[port] != intent.baseline_port_states[port]
            ]
            unknown_targets = [
                port
                for port in target_ports
                if before[port] == "unknown"
            ]
            if outside_changed_before or unknown_targets:
                raise RuntimeError(
                    "cannot prove the exact hard-stop boundary before RPC: "
                    f"outside_changed={outside_changed_before}, "
                    f"unknown_targets={unknown_targets}"
                )
            active_ports = [
                port
                for port in target_ports
                if before[port] in {"running", "paused"}
            ]
            if active_ports:
                _require_sdk_result(
                    client.stop(ports=active_ports),
                    "expired traffic hard stop",
                )
            after = self._live_port_states(client, configured_ports)
            outside_changed_after = [
                port
                for port in configured_ports
                if port not in target
                and after[port] != intent.baseline_port_states[port]
            ]
            not_stopped = [
                port
                for port in target_ports
                if after[port] != "stopped"
            ]
            if outside_changed_after or not_stopped:
                raise RuntimeError(
                    "exact hard-stop verification failed: "
                    f"outside_changed={outside_changed_after}, "
                    f"not_stopped={not_stopped}"
                )
            return {
                "rpc_ports": active_ports,
                "ports": target_ports,
                "stopped": True,
            }

        return self._with_mutation_ports_controlled(intent, stop_remaining)

    def replace_plan(self, expected_revision: int, groups: list[dict[str, Any]]) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            try:
                current_authority = self._runtime_authority.current()
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_authority_invalid", str(exc))
            try:
                config = _load_config(self.env)
                normalized_groups = self._validated_groups(groups, config)

                def replace(document: RuntimeStateDocument) -> RuntimeStateDocument:
                    if document.traffic_plan_revision != expected_revision:
                        raise TrafficPlanRevisionConflict(
                            f"traffic plan revision is {document.traffic_plan_revision}, "
                            f"not {expected_revision}"
                        )
                    intent = document.traffic_mutation_intent
                    if intent is not None:
                        raise TrafficPlanRuntimeBusy(
                            "traffic plan cannot change while durable mutation "
                            f"intent {intent.nonce} ({intent.operation}) is pending"
                        )
                    session = document.traffic_session
                    if session is not None:
                        fully_stopped = (
                            session.state == "stopped"
                            and all(
                                group.state == "stopped"
                                and group.hard_stop_at is None
                                and all(
                                    state == "stopped"
                                    for state in group.port_states.values()
                                )
                                for group in session.groups
                            )
                        )
                        if not fully_stopped:
                            raise TrafficPlanRuntimeBusy(
                                "traffic plan cannot change until every managed "
                                "session group and port is durably stopped and "
                                "all hard-stop leases are cleared"
                            )
                    document.traffic_groups = normalized_groups
                    document.traffic_plan_revision += 1
                    return document

                document = self.store.update(replace)
            except TrafficPlanRevisionConflict as exc:
                return _failure("traffic_plan_revision_conflict", str(exc))
            except TrafficPlanRuntimeBusy as exc:
                return _failure("traffic_plan_runtime_busy", str(exc))
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            except ValueError as exc:
                return _failure("traffic_plan_invalid", str(exc))

            configured_ports = list(range(config.port_limit))
            return TrexCallResult(
                True,
                data=self._snapshot_payload(
                    document,
                    config,
                    {port: "unknown" for port in configured_ports},
                    "plan updated; live state not sampled",
                    current_authority,
                    live_state_sampled=False,
                ),
            )

    def start_group(
        self,
        group_id: str,
        expected_revision: int,
        expected_session_id: str | None,
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            try:
                document = self.store.load()
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            if document.traffic_plan_revision != expected_revision:
                return _failure(
                    "traffic_plan_revision_conflict",
                    f"traffic plan revision is {document.traffic_plan_revision}, not {expected_revision}",
                )
            group = next((candidate for candidate in document.traffic_groups if candidate.id == group_id), None)
            if group is None:
                return _failure("traffic_group_not_found", f"traffic group '{group_id}' does not exist")
            return self._start(
                group=group,
                expected_session_id=expected_session_id,
                hard_stop_at=hard_stop_at,
            )

    def start(
        self,
        *,
        expected_session_id: str | None,
        profile_path: str,
        ports: list[int] | None,
        multiplier: str,
        duration: float,
        force: bool,
        total: bool,
        synchronized: bool,
        clear_existing: bool,
        tunables: dict[str, Any],
        hard_stop_at: str | None = None,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            normalized_ports = _normalize_port_list(ports)
            if isinstance(normalized_ports, TrexCallResult):
                return normalized_ports
            try:
                document = self.store.load()
                fallback_ports = (
                    list(range(_load_config(self.env).port_limit))
                    if normalized_ports is None
                    else normalized_ports
                )
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            group = self._matching_plan_group(document, normalized_ports)
            if group is not None and group.profile_path == profile_path:
                group_id = group.id
            else:
                group_id = None
            try:
                transient_group = TrafficGroupState(
                    id=group_id or "ad-hoc",
                    name=group.name if group is not None else "Ad hoc traffic",
                    ports=fallback_ports,
                    profile_path=profile_path,
                    multiplier=multiplier,
                    duration=duration,
                    force=force,
                    total=total,
                    synchronized=synchronized,
                    clear_existing=clear_existing,
                    tunables=tunables,
                )
            except ValidationError as exc:
                return _failure("traffic_start_invalid", str(exc))
            return self._start(
                group=transient_group,
                expected_session_id=expected_session_id,
                hard_stop_at=hard_stop_at,
                persisted_group_id=group_id,
                ports_override=normalized_ports,
            )

    def _hard_stop_rpc_budget_failure(
        self,
        deadlines: list[str],
        operation: str,
        *,
        rpc_count: int = 1,
    ) -> TrexCallResult | None:
        if not deadlines:
            return None
        if rpc_count < 1:
            raise ValueError("traffic RPC budget count must be positive")
        now = self._clock()
        required_seconds = (
            self.env.connect_timeout_seconds * rpc_count
            + TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS
        )
        remaining_seconds = min(
            (parse_utc_timestamp(deadline) - now).total_seconds()
            for deadline in deadlines
        )
        if remaining_seconds > required_seconds:
            return None
        return _failure(
            "traffic_hard_stop_window_insufficient",
            f"traffic {operation} is blocked because the hard-stop lease has "
            f"only {max(0.0, remaining_seconds):.3f}s remaining; more than "
            f"{required_seconds:.3f}s is required to cover the configured "
            "TRex RPC timeout and supervisor polling margin",
            {
                "operation": operation,
                "rpc_count": rpc_count,
                "remaining_seconds": max(0.0, remaining_seconds),
                "required_seconds": required_seconds,
            },
        )

    def update(
        self,
        ports: list[int] | None,
        multiplier: str,
        force: bool,
        total: bool,
        *,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            normalized_ports = _normalize_port_list(ports)
            if isinstance(normalized_ports, TrexCallResult):
                return normalized_ports
            try:
                current_authority, target_ports, session_before = (
                    self._assert_session_mutation_authority(
                        normalized_ports,
                        expected_session_id=expected_session_id,
                        require_complete_groups=True,
                    )
                )
            except TrafficSessionIdConflict as exc:
                return _failure("traffic_session_id_conflict", str(exc))
            except TrafficPartialGroupUpdate as exc:
                return _failure("traffic_group_partial_update", str(exc))
            except TrafficMutationRecoveryRequired as exc:
                return _failure("traffic_mutation_recovery_required", str(exc))
            except RuntimeStateError as exc:
                return _failure("traffic_session_unowned", str(exc))
            budget_failure = self._hard_stop_rpc_budget_failure(
                [
                    group.hard_stop_at
                    for group in session_before.groups
                    if group.hard_stop_at is not None
                    and group.state != "stopped"
                ],
                "update",
            )
            if budget_failure is not None:
                return budget_failure
            try:
                configured_ports = list(range(_load_config(self.env).port_limit))
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            budget_failure = self._hard_stop_rpc_budget_failure(
                [
                    group.hard_stop_at
                    for group in session_before.groups
                    if group.hard_stop_at is not None
                    and group.state != "stopped"
                ],
                "update baseline",
                rpc_count=len(configured_ports) + 2,
            )
            if budget_failure is not None:
                return budget_failure
            baseline_result = self._sample_session_mutation_baseline(
                configured_ports,
                target_ports,
            )
            if not baseline_result.ok or not isinstance(baseline_result.data, dict):
                return baseline_result
            baseline = baseline_result.data["port_states"]
            baseline_failure = self._session_baseline_failure(
                session_before,
                baseline,
            )
            if baseline_failure is not None:
                return baseline_failure
            budget_failure = self._hard_stop_rpc_budget_failure(
                [
                    group.hard_stop_at
                    for group in session_before.groups
                    if group.hard_stop_at is not None
                    and group.state != "stopped"
                ],
                "update",
                rpc_count=4,
            )
            if budget_failure is not None:
                return budget_failure
            try:
                intent = self._prepare_traffic_mutation_intent(
                    operation="update",
                    authority=current_authority,
                    expected_session_id=expected_session_id,
                    ports=target_ports,
                    baseline_port_states=baseline,
                    desired_port_states={
                        port: baseline[port]
                        for port in target_ports
                    },
                    session_before=session_before,
                    baseline_acquired_ports=baseline_result.data[
                        "acquired_ports"
                    ],
                    update_multiplier=multiplier,
                    update_force=force,
                    update_total=total,
                )
            except TrafficSessionIdConflict as exc:
                return _failure("traffic_session_id_conflict", str(exc))
            except TrafficMutationRecoveryRequired as exc:
                return _failure("traffic_mutation_recovery_required", str(exc))
            except RuntimeStateError as exc:
                return _failure(
                    "traffic_state_persist_failed",
                    f"cannot persist traffic update intent: {exc}",
                )
            budget_failure = self._hard_stop_rpc_budget_failure(
                [
                    group.hard_stop_at
                    for group in session_before.groups
                    if group.hard_stop_at is not None
                    and group.state != "stopped"
                ],
                "update",
                rpc_count=4,
            )
            if budget_failure is not None:
                self._retain_failed_mutation_intent(
                    intent.nonce,
                    "hard-stop lease budget expired before update RPC",
                )
                try:
                    self._clear_traffic_mutation_intent(
                        intent.nonce,
                        session_before,
                    )
                except RuntimeStateError as exc:
                    return _failure(
                        "traffic_mutation_recovery_required",
                        "traffic update was not sent; its fail-closed WAL "
                        "could not be cleared after lease-budget expiry and "
                        f"must remain for the supervisor: {exc}",
                    )
                return budget_failure
            result = execute_update_traffic(
                self.with_client,
                target_ports,
                multiplier,
                force,
                total,
            )
            if not result.ok:
                self._retain_failed_mutation_intent(
                    intent.nonce,
                    result.error or result.blocker or "traffic update failed",
                )
                return _failure(
                    "traffic_mutation_recovery_required",
                    "traffic update returned an indeterminate live result; "
                    f"durable intent {intent.nonce} was retained fail-closed. "
                    "A later read will not retry an RPC that returned failure.",
                )
            result_data = dict(result.data) if isinstance(result.data, dict) else {}
            try:
                self._assert_authority_unchanged(current_authority)
                session = self._persist_update(
                    result_data["ports"],
                    multiplier,
                    current_authority,
                    intent.nonce,
                )
            except RuntimeStateError as exc:
                self._retain_failed_mutation_intent(intent.nonce, str(exc))
                return _failure(
                    "traffic_mutation_recovery_required",
                    "traffic update reached TRex but durable promotion failed; "
                    f"intent {intent.nonce} remains authoritative: {exc}",
                )
            result_data["state_persisted"] = True
            result_data["session"] = session.model_dump(mode="json") if session is not None else None
            return TrexCallResult(True, data=result_data)

    def action(
        self,
        action: str,
        ports: list[int] | None,
        *,
        expected_session_id: str | None = None,
    ) -> TrexCallResult:
        with runtime_mutation_fence(), self._lock:
            if action not in {"stop", "pause", "resume"}:
                return _failure(
                    "unsupported_traffic_action",
                    f"unsupported action: {action}",
                )
            target_failure = self._connection_target_failure()
            if target_failure is not None:
                return target_failure
            normalized_ports = _normalize_port_list(ports)
            if isinstance(normalized_ports, TrexCallResult):
                return normalized_ports
            try:
                current_authority, target_ports, session_before = (
                    self._assert_session_mutation_authority(
                        normalized_ports,
                        expected_session_id=expected_session_id,
                    )
                )
            except TrafficSessionIdConflict as exc:
                return _failure("traffic_session_id_conflict", str(exc))
            except TrafficMutationRecoveryRequired as exc:
                return _failure("traffic_mutation_recovery_required", str(exc))
            except RuntimeStateError as exc:
                return _failure("traffic_session_unowned", str(exc))
            leased_groups = [
                group
                for group in session_before.groups
                if group.hard_stop_at is not None
                and group.state != "stopped"
            ]
            guarded_deadlines = [
                group.hard_stop_at
                for group in leased_groups
                if (
                    action != "stop"
                    or not {
                        port
                        for port, state in group.port_states.items()
                        if state in {"running", "paused"}
                    }.issubset(target_ports)
                )
            ]
            budget_failure = self._hard_stop_rpc_budget_failure(
                guarded_deadlines,
                action,
            )
            if budget_failure is not None:
                return budget_failure
            if action == "pause":
                finite_groups = [
                    group
                    for group in session_before.groups
                    if group.duration > 0
                    and set(group.ports).intersection(target_ports)
                ]
                if finite_groups:
                    rendered = ", ".join(
                        group.group_id
                        or "/".join(f"P{port}" for port in group.ports)
                        for group in finite_groups
                    )
                    return _failure(
                        "traffic_pause_unsupported_finite_duration",
                        "TRex pause requires a duration-disabled start; "
                        f"finite-duration groups: {rendered}",
                    )
            try:
                configured_ports = list(range(_load_config(self.env).port_limit))
            except RuntimeStateError as exc:
                return _failure("traffic_runtime_state_invalid", str(exc))
            budget_failure = self._hard_stop_rpc_budget_failure(
                guarded_deadlines,
                f"{action} baseline",
                rpc_count=len(configured_ports) + 2,
            )
            if budget_failure is not None:
                return budget_failure
            baseline_result = self._sample_session_mutation_baseline(
                configured_ports,
                target_ports,
            )
            if not baseline_result.ok or not isinstance(baseline_result.data, dict):
                return baseline_result
            baseline = baseline_result.data["port_states"]
            baseline_failure = self._session_baseline_failure(
                session_before,
                baseline,
            )
            if baseline_failure is not None:
                return baseline_failure
            budget_failure = self._hard_stop_rpc_budget_failure(
                guarded_deadlines,
                action,
                rpc_count=4,
            )
            if budget_failure is not None:
                return budget_failure
            next_state: PortState = {
                "stop": "stopped",
                "pause": "paused",
                "resume": "running",
            }[action]
            try:
                intent = self._prepare_traffic_mutation_intent(
                    operation=action,
                    authority=current_authority,
                    expected_session_id=expected_session_id,
                    ports=target_ports,
                    baseline_port_states=baseline,
                    desired_port_states={
                        port: next_state
                        for port in target_ports
                    },
                    session_before=session_before,
                    baseline_acquired_ports=baseline_result.data[
                        "acquired_ports"
                    ],
                )
            except TrafficSessionIdConflict as exc:
                return _failure("traffic_session_id_conflict", str(exc))
            except TrafficMutationRecoveryRequired as exc:
                return _failure("traffic_mutation_recovery_required", str(exc))
            except RuntimeStateError as exc:
                return _failure(
                    "traffic_state_persist_failed",
                    f"cannot persist traffic {action} intent: {exc}",
                )
            budget_failure = self._hard_stop_rpc_budget_failure(
                guarded_deadlines,
                action,
                rpc_count=4,
            )
            if budget_failure is not None:
                self._retain_failed_mutation_intent(
                    intent.nonce,
                    f"hard-stop lease budget expired before {action} RPC",
                )
                try:
                    self._clear_traffic_mutation_intent(
                        intent.nonce,
                        session_before,
                    )
                except RuntimeStateError as exc:
                    return _failure(
                        "traffic_mutation_recovery_required",
                        f"traffic {action} was not sent; its fail-closed WAL "
                        "could not be cleared after lease-budget expiry and "
                        f"must remain for the supervisor: {exc}",
                    )
                return budget_failure
            result = execute_traffic_action(self.with_client, action, target_ports)
            if not result.ok:
                self._retain_failed_mutation_intent(
                    intent.nonce,
                    result.error or result.blocker or f"traffic {action} failed",
                )
                return _failure(
                    "traffic_mutation_recovery_required",
                    f"traffic {action} returned an indeterminate live result; "
                    f"durable intent {intent.nonce} was retained fail-closed. "
                    "A later read will not apply the action to additional ports.",
                )
            result_data = dict(result.data) if isinstance(result.data, dict) else {}
            try:
                self._assert_authority_unchanged(current_authority)
                session = self._persist_action(
                    action,
                    result_data["ports"],
                    current_authority,
                    intent.nonce,
                )
            except RuntimeStateError as exc:
                self._retain_failed_mutation_intent(intent.nonce, str(exc))
                return _failure(
                    "traffic_mutation_recovery_required",
                    f"traffic {action} reached TRex but durable promotion failed; "
                    f"intent {intent.nonce} remains authoritative: {exc}",
                )
            result_data["state_persisted"] = True
            result_data["session"] = session.model_dump(mode="json") if session is not None else None
            return TrexCallResult(True, data=result_data)

    def _start(
        self,
        *,
        group: TrafficGroupState,
        expected_session_id: str | None,
        hard_stop_at: str | None,
        persisted_group_id: str | None = None,
        ports_override: list[int] | None = None,
    ) -> TrexCallResult:
        try:
            normalized_hard_stop_at = (
                None
                if hard_stop_at is None
                else normalize_hard_stop_at(
                    hard_stop_at,
                    now=self._clock(),
                )
            )
        except ValueError as exc:
            return _failure("traffic_hard_stop_invalid", str(exc))
        if normalized_hard_stop_at is not None:
            budget_failure = self._hard_stop_rpc_budget_failure(
                [normalized_hard_stop_at],
                "start",
            )
            if budget_failure is not None:
                return budget_failure
        try:
            current_authority = self._runtime_authority.current()
        except RuntimeStateError as exc:
            return _failure("traffic_runtime_authority_invalid", str(exc))
        try:
            current = self.store.load()
        except RuntimeStateError as exc:
            return _failure("traffic_runtime_state_invalid", str(exc))
        try:
            self._assert_start_session_authority(
                current,
                current_authority,
                expected_session_id,
            )
        except TrafficSessionIdConflict as exc:
            return _failure("traffic_session_id_conflict", str(exc))
        except TrafficMutationRecoveryRequired as exc:
            return _failure("traffic_mutation_recovery_required", str(exc))
        session_deadlines = [
            candidate.hard_stop_at
            for candidate in (
                current.traffic_session.groups
                if current.traffic_session is not None
                else []
            )
            if candidate.hard_stop_at is not None
            and candidate.state != "stopped"
        ]
        if normalized_hard_stop_at is not None:
            session_deadlines.append(normalized_hard_stop_at)
        budget_failure = self._hard_stop_rpc_budget_failure(
            session_deadlines,
            "start",
        )
        if budget_failure is not None:
            return budget_failure
        stale_capture_ids = [
            lease.capture_id
            for lease in current.capture_leases
            if lease.authority != current_authority
        ]
        if stale_capture_ids:
            return _failure(
                "traffic_runtime_authority_invalid",
                "capture leases belong to a different TRex target or daemon "
                f"generation: {stale_capture_ids}",
            )
        target_ports = (
            list(group.ports)
            if ports_override is None
            else list(ports_override)
        )
        resolved_profile = self.resolve_profile_path(group.profile_path)
        if not resolved_profile.ok:
            return resolved_profile
        try:
            profile_sha256 = _profile_sha256(str(resolved_profile.data))
        except RuntimeStateError as exc:
            return _failure("traffic_profile_identity_invalid", str(exc))
        try:
            configured_ports = list(range(_load_config(self.env).port_limit))
        except RuntimeStateError as exc:
            return _failure("traffic_runtime_state_invalid", str(exc))
        budget_failure = self._hard_stop_rpc_budget_failure(
            session_deadlines,
            "start baseline",
            rpc_count=(
                len(configured_ports)
                + len(target_ports)
                + 4
            ),
        )
        if budget_failure is not None:
            return budget_failure
        baseline_result = self._sample_start_mutation_baseline(
            configured_ports,
            target_ports,
        )
        if not baseline_result.ok or not isinstance(baseline_result.data, dict):
            return baseline_result
        baseline = baseline_result.data["port_states"]
        if current.traffic_session is not None:
            baseline_failure = self._session_baseline_failure(
                current.traffic_session,
                baseline,
            )
            if (
                expected_session_id is not None
                and baseline_failure is not None
            ):
                return baseline_failure
        budget_failure = self._hard_stop_rpc_budget_failure(
            session_deadlines,
            "start",
            rpc_count=3,
        )
        if budget_failure is not None:
            return budget_failure
        now = utc_now_iso()
        start_group = TrafficSessionGroupState(
            group_id=(
                persisted_group_id
                if persisted_group_id is not None
                else group.id
            ),
            ports=target_ports,
            profile_path=str(resolved_profile.data),
            multiplier=group.multiplier,
            duration=group.duration,
            hard_stop_at=normalized_hard_stop_at,
            tunables=group.tunables,
            state="running",
            port_states={port: "running" for port in target_ports},
            updated_at=now,
        )
        try:
            intent = self._prepare_traffic_mutation_intent(
                operation="start",
                authority=current_authority,
                expected_session_id=expected_session_id,
                ports=target_ports,
                baseline_port_states=baseline,
                desired_port_states={
                    port: "running"
                    for port in target_ports
                },
                session_before=current.traffic_session,
                start_group=start_group,
                start_profile_sha256=profile_sha256,
                start_clear_existing=group.clear_existing,
                start_force=group.force,
                start_total=group.total,
                start_synchronized=group.synchronized,
                baseline_stream_ids=None,
                baseline_acquired_ports=baseline_result.data["acquired_ports"],
            )
        except TrafficSessionIdConflict as exc:
            return _failure("traffic_session_id_conflict", str(exc))
        except TrafficMutationRecoveryRequired as exc:
            return _failure("traffic_mutation_recovery_required", str(exc))
        except RuntimeStateError as exc:
            return _failure(
                "traffic_state_persist_failed",
                f"cannot persist traffic start intent: {exc}",
            )
        result = execute_start_profile(
            self.resolve_profile_path,
            self.with_client,
            str(resolved_profile.data),
            target_ports,
            group.multiplier,
            group.duration,
            group.force,
            group.total,
            group.synchronized,
            group.clear_existing,
            group.tunables,
            preflight=traffic_start_preflight,
            stage_hook=lambda stage, client: self._advance_start_intent_stage(
                intent.nonce,
                stage,
                client,
            ),
        )
        if not result.ok:
            failure_detail = result.error or result.blocker or "traffic start failed"
            self._retain_failed_mutation_intent(
                intent.nonce,
                failure_detail,
            )
            return _failure(
                "traffic_mutation_recovery_required",
                "traffic start did not complete cleanly; durable intent "
                f"{intent.nonce} was retained for exact rollback or "
                f"fail-closed recovery. TRex reported: {failure_detail}",
            )
        result_data = dict(result.data) if isinstance(result.data, dict) else {}
        try:
            self._assert_authority_unchanged(current_authority)
            session = self._persist_start(
                authority=current_authority,
                intent_nonce=intent.nonce,
            )
        except RuntimeStateError as exc:
            self._retain_failed_mutation_intent(intent.nonce, str(exc))
            return _failure(
                "traffic_mutation_recovery_required",
                "traffic start reached TRex but durable promotion failed; "
                f"intent {intent.nonce} remains authoritative: {exc}",
            )
        self._owned_session_id = session.id
        result_data["state_persisted"] = True
        result_data["session"] = session.model_dump(mode="json")
        return TrexCallResult(True, data=result_data)

    def _initialize_default_plan(self, config: TrexConfig) -> RuntimeStateDocument:
        current = self.store.load()
        if current.traffic_plan_revision != 0 or current.traffic_groups:
            return current
        resolved = self.resolve_profile_path(DEFAULT_TRAFFIC_PROFILE)
        if not resolved.ok:
            detail = resolved.error or resolved.blocker or "profile resolution failed"
            raise RuntimeStateError(f"default traffic profile cannot be resolved: {detail}")
        groups = [
            TrafficGroupState(
                id=f"pair-{port // 2}",
                name=f"P{port} ↔ P{port + 1}",
                ports=[port, port + 1],
                profile_path=str(resolved.data),
            )
            for port in range(0, config.port_limit - 1, 2)
        ]

        def initialize(document: RuntimeStateDocument) -> RuntimeStateDocument | None:
            if document.traffic_plan_revision != 0 or document.traffic_groups:
                return None
            document.traffic_groups = groups
            document.traffic_plan_revision = 1
            return document

        return self.store.update(initialize)

    def _validated_groups(self, groups: list[dict[str, Any]], config: TrexConfig) -> list[TrafficGroupState]:
        known_ports = set(range(config.port_limit))
        normalized: list[TrafficGroupState] = []
        group_ids: set[str] = set()
        assigned_ports: set[int] = set()
        for payload in groups:
            group = TrafficGroupState.model_validate(payload)
            if group.id in group_ids:
                raise ValueError(f"traffic group id must be unique: {group.id}")
            unknown_ports = sorted(set(group.ports).difference(known_ports))
            if unknown_ports:
                raise ValueError(f"traffic group '{group.id}' contains unknown ports: {unknown_ports}")
            overlap = sorted(assigned_ports.intersection(group.ports))
            if overlap:
                raise ValueError(f"traffic group ports must not overlap: {overlap}")
            resolved = self.resolve_profile_path(group.profile_path)
            if not resolved.ok:
                detail = resolved.error or resolved.blocker or "profile resolution failed"
                raise ValueError(f"traffic group '{group.id}' profile is invalid: {detail}")
            group.profile_path = str(resolved.data)
            normalized.append(group)
            group_ids.add(group.id)
            assigned_ports.update(group.ports)
        return normalized

    def _matching_plan_group(
        self,
        document: RuntimeStateDocument,
        ports: list[int] | None,
    ) -> TrafficGroupState | None:
        if ports is None:
            return None
        target = set(ports)
        return next((group for group in document.traffic_groups if set(group.ports) == target), None)

    def _sample_mutation_baseline(
        self,
        configured_ports: list[int],
    ) -> TrexCallResult:
        def sample(client: Any) -> dict[int, PortState]:
            return self._live_port_states(client, configured_ports)

        result = self.with_client(sample)
        if not result.ok:
            return result
        if not isinstance(result.data, dict):
            return _failure(
                "traffic_runtime_state_unverifiable",
                "TRex did not return an exact traffic mutation baseline",
            )
        baseline = {
            port: result.data.get(port, "unknown")
            for port in configured_ports
        }
        unknown_ports = [
            port
            for port, state in baseline.items()
            if state == "unknown"
        ]
        if unknown_ports:
            return _failure(
                "traffic_runtime_state_unverifiable",
                "traffic mutation requires known state for every configured "
                f"port; unknown ports: {unknown_ports}",
            )
        return TrexCallResult(True, data=baseline)

    def _sample_session_mutation_baseline(
        self,
        configured_ports: list[int],
        target_ports: list[int],
    ) -> TrexCallResult:
        def sample(client: Any) -> dict[str, Any]:
            port_states = self._live_port_states(client, configured_ports)
            try:
                acquired_ports = sorted(
                    set(client.get_acquired_ports()).intersection(target_ports)
                )
            except Exception as exc:
                raise RuntimeError(
                    f"cannot sample the mutation acquisition baseline: {exc}"
                ) from exc
            return {
                "port_states": port_states,
                "acquired_ports": acquired_ports,
            }

        result = self.with_client(sample)
        if not result.ok or not isinstance(result.data, dict):
            return result
        port_states = result.data.get("port_states")
        acquired_ports = result.data.get("acquired_ports")
        if not isinstance(port_states, dict) or not isinstance(
            acquired_ports,
            list,
        ):
            return _failure(
                "traffic_runtime_state_unverifiable",
                "TRex did not return exact traffic mutation evidence",
            )
        baseline = {
            port: port_states.get(port, "unknown")
            for port in configured_ports
        }
        unknown_ports = [
            port
            for port, state in baseline.items()
            if state == "unknown"
        ]
        if unknown_ports:
            return _failure(
                "traffic_runtime_state_unverifiable",
                "traffic mutation requires freshly synchronized state for "
                f"every configured port; unknown ports: {unknown_ports}",
            )
        return TrexCallResult(
            True,
            data={
                "port_states": baseline,
                "acquired_ports": acquired_ports,
            },
        )

    def _sample_start_mutation_baseline(
        self,
        configured_ports: list[int],
        start_ports: list[int],
    ) -> TrexCallResult:
        def sample(client: Any) -> dict[str, Any]:
            traffic_start_preflight(client, start_ports)
            port_states = self._live_port_states(client, configured_ports)
            try:
                acquired_ports = sorted(
                    set(client.get_acquired_ports()).intersection(start_ports)
                )
            except Exception as exc:
                raise RuntimeError(
                    f"cannot sample the start acquisition baseline: {exc}"
                ) from exc
            return {
                "port_states": port_states,
                "acquired_ports": acquired_ports,
            }

        result = self.with_client(sample)
        if not result.ok or not isinstance(result.data, dict):
            return result
        port_states = result.data.get("port_states")
        acquired_ports = result.data.get("acquired_ports")
        if (
            not isinstance(port_states, dict)
            or not isinstance(acquired_ports, list)
        ):
            return _failure(
                "traffic_runtime_state_unverifiable",
                "TRex did not return exact start mutation evidence",
            )
        baseline = {
            port: port_states.get(port, "unknown")
            for port in configured_ports
        }
        unknown_ports = [
            port
            for port, state in baseline.items()
            if state == "unknown"
        ]
        if unknown_ports:
            return _failure(
                "traffic_runtime_state_unverifiable",
                "traffic start requires freshly synchronized state for every "
                f"configured port; unknown ports: {unknown_ports}",
            )
        return TrexCallResult(
            True,
            data={
                "port_states": baseline,
                "acquired_ports": list(acquired_ports),
            },
        )

    @staticmethod
    def _live_stream_ids(
        client: Any,
        ports: list[int],
    ) -> dict[int, list[int]]:
        result: dict[int, list[int]] = {}
        for port in ports:
            port_object = _port_object(client, port)
            sync_streams = getattr(port_object, "sync_streams", None)
            get_all_streams = getattr(port_object, "get_all_streams", None)
            if not callable(sync_streams) or not callable(get_all_streams):
                raise RuntimeError(
                    f"TRex port {port} cannot provide exact stream evidence"
                )
            _require_sdk_result(
                sync_streams(),
                f"TRex port {port} stream sync",
            )
            streams = get_all_streams()
            if not isinstance(streams, dict):
                raise RuntimeError(
                    f"TRex port {port} returned invalid stream evidence"
                )
            stream_ids: list[int] = []
            for value in streams:
                if (
                    isinstance(value, bool)
                    or not isinstance(value, int)
                    or value < 0
                ):
                    raise RuntimeError(
                        f"TRex port {port} returned an invalid stream id"
                    )
                stream_ids.append(value)
            result[port] = sorted(stream_ids)
        return result

    def _session_baseline_failure(
        self,
        session: TrafficSessionState,
        baseline: dict[int, PortState],
    ) -> TrexCallResult | None:
        mismatches = {
            port: {
                "persisted": expected,
                "live": baseline.get(port, "unknown"),
            }
            for group in session.groups
            for port, expected in group.port_states.items()
            if baseline.get(port, "unknown") != expected
        }
        if not mismatches:
            return None
        return _failure(
            "traffic_session_state_conflict",
            "live traffic state no longer matches the managed session; "
            "refresh runtime state before mutating",
        )

    def _prepare_traffic_mutation_intent(
        self,
        *,
        operation: str,
        authority: RuntimeAuthorityIdentity,
        expected_session_id: str | None,
        ports: list[int],
        baseline_port_states: dict[int, PortState],
        desired_port_states: dict[int, PortState],
        session_before: TrafficSessionState | None,
        start_group: TrafficSessionGroupState | None = None,
        start_profile_sha256: str | None = None,
        start_clear_existing: bool | None = None,
        start_force: bool | None = None,
        start_total: bool | None = None,
        start_synchronized: bool | None = None,
        baseline_stream_ids: dict[int, list[int]] | None = None,
        baseline_acquired_ports: list[int] | None = None,
        update_multiplier: str | None = None,
        update_force: bool | None = None,
        update_total: bool | None = None,
    ) -> TrafficMutationIntentState:
        intent = TrafficMutationIntentState(
            nonce=str(uuid.uuid4()),
            phase="prepared",
            operation=operation,  # type: ignore[arg-type]
            authority=authority,
            expected_session_id=expected_session_id,
            ports=list(ports),
            baseline_port_states=dict(baseline_port_states),
            desired_port_states=dict(desired_port_states),
            session_before=(
                session_before.model_copy(deep=True)
                if session_before is not None
                else None
            ),
            start_group=(
                start_group.model_copy(deep=True)
                if start_group is not None
                else None
            ),
            start_profile_sha256=start_profile_sha256,
            start_clear_existing=start_clear_existing,
            start_force=start_force,
            start_total=start_total,
            start_synchronized=start_synchronized,
            baseline_stream_ids=(
                {
                    port: list(stream_ids)
                    for port, stream_ids in baseline_stream_ids.items()
                }
                if baseline_stream_ids is not None
                else None
            ),
            baseline_acquired_ports=list(baseline_acquired_ports or []),
            update_multiplier=update_multiplier,
            update_force=update_force,
            update_total=update_total,
            prepared_at=utc_now_iso(),
            reconciliation="prepared before live TRex mutation",
        )

        def prepare(document: RuntimeStateDocument) -> RuntimeStateDocument:
            if document.traffic_mutation_intent is not None:
                raise TrafficMutationRecoveryRequired(
                    "a durable traffic mutation intent already requires recovery"
                )
            if document.traffic_session != intent.session_before:
                raise TrafficSessionIdConflict(
                    "the managed traffic session changed before intent persistence"
                )
            if operation == "start":
                self._assert_start_session_authority(
                    document,
                    authority,
                    expected_session_id,
                )
            else:
                session = document.traffic_session
                if (
                    session is None
                    or session.id != expected_session_id
                    or session.id != self._owned_session_id
                    or session.authority != authority
                    or session.state not in {"running", "paused", "mixed"}
                ):
                    raise TrafficSessionIdConflict(
                        "the managed traffic session changed before intent persistence"
                    )
            document.traffic_mutation_intent = intent
            return document

        updated = self.store.update(prepare)
        if (
            updated.traffic_mutation_intent is None
            or updated.traffic_mutation_intent.nonce != intent.nonce
        ):
            raise RuntimeStateError(
                "persisted traffic mutation intent is missing"
            )
        return updated.traffic_mutation_intent

    def _advance_start_intent_stage(
        self,
        intent_nonce: str,
        stage: str,
        client: Any,
    ) -> None:
        if stage not in _START_STAGE_ORDER:
            raise RuntimeStateError(f"unsupported traffic start WAL stage: {stage}")

        def start_deadlines(
            intent: TrafficMutationIntentState,
        ) -> list[str]:
            deadlines = [
                candidate.hard_stop_at
                for candidate in (
                    intent.session_before.groups
                    if intent.session_before is not None
                    else []
                )
                if candidate.hard_stop_at is not None
                and candidate.state != "stopped"
            ]
            if (
                intent.start_group is not None
                and intent.start_group.hard_stop_at is not None
            ):
                deadlines.append(intent.start_group.hard_stop_at)
            return deadlines

        stream_ids: dict[int, list[int]] | None = None
        if stage == "acquired":
            current = self.store.load().traffic_mutation_intent
            if (
                current is None
                or current.nonce != intent_nonce
                or current.operation != "start"
            ):
                raise TrafficMutationRecoveryRequired(
                    "traffic start intent changed before stream sampling"
                )
            budget_failure = self._hard_stop_rpc_budget_failure(
                start_deadlines(current),
                "start stream baseline",
                rpc_count=len(current.ports) * 2 + 1,
            )
            if budget_failure is not None:
                raise TrafficMutationRecoveryRequired(
                    budget_failure.error
                    or "traffic hard-stop RPC window is insufficient"
                )
            stream_ids = self._live_stream_ids(client, current.ports)

        def advance(document: RuntimeStateDocument) -> RuntimeStateDocument:
            intent = document.traffic_mutation_intent
            if (
                intent is None
                or intent.nonce != intent_nonce
                or intent.operation != "start"
            ):
                raise TrafficMutationRecoveryRequired(
                    "traffic start intent changed during live execution"
                )
            current_order = _START_STAGE_ORDER.get(intent.hardware_stage)
            if current_order is None:
                raise RuntimeStateError(
                    "traffic start intent has an invalid hardware stage"
                )
            if _START_STAGE_ORDER[stage] < current_order:
                return document
            if (
                stage
                in {
                    "acquire_intent",
                    "streams_remove_intent",
                    "profile_add_intent",
                    "start_intent",
                }
                and intent.start_group is not None
            ):
                budget_failure = self._hard_stop_rpc_budget_failure(
                    start_deadlines(intent),
                    "start",
                    rpc_count={
                        "acquire_intent": 3,
                        "streams_remove_intent": 2,
                        "profile_add_intent": 2,
                        "start_intent": 2,
                    }[stage],
                )
                if budget_failure is not None:
                    raise TrafficMutationRecoveryRequired(
                        budget_failure.error
                        or "traffic hard-stop RPC window is insufficient"
                    )
            if stage == "acquired":
                if stream_ids is None or set(stream_ids) != set(intent.ports):
                    raise RuntimeStateError(
                        "cannot persist exact stream evidence after acquisition"
                    )
                intent.baseline_stream_ids = stream_ids
            elif (
                _START_STAGE_ORDER[stage]
                >= _START_STAGE_ORDER["streams_remove_intent"]
                and intent.baseline_stream_ids is None
            ):
                raise RuntimeStateError(
                    "cannot mutate streams before exact baseline evidence is durable"
                )
            intent.hardware_stage = stage  # type: ignore[assignment]
            intent.reconciliation = (
                f"live TRex start reached durable stage {stage}"
            )
            return document

        self.store.update(advance)

    def _retain_failed_mutation_intent(
        self,
        intent_nonce: str,
        reason: str,
    ) -> None:
        def retain(document: RuntimeStateDocument) -> RuntimeStateDocument | None:
            intent = document.traffic_mutation_intent
            if intent is None or intent.nonce != intent_nonce:
                return None
            intent.phase = "cleanup_required"
            intent.reconciliation = (
                f"live mutation did not complete cleanly: {reason}"
            )
            return document

        try:
            self.store.update(retain)
        except RuntimeStateError:
            # The already-fsynced prepared intent remains the fail-closed
            # authority if annotating the failure itself cannot be persisted.
            return

    def _clear_traffic_mutation_intent(
        self,
        intent_nonce: str,
        session_before: TrafficSessionState | None,
    ) -> RuntimeStateDocument:
        def clear(document: RuntimeStateDocument) -> RuntimeStateDocument:
            intent = document.traffic_mutation_intent
            if intent is None or intent.nonce != intent_nonce:
                raise TrafficMutationRecoveryRequired(
                    "the durable traffic mutation intent changed during recovery"
                )
            if document.traffic_session != session_before:
                raise TrafficSessionIdConflict(
                    "the managed traffic session changed during recovery"
                )
            document.traffic_mutation_intent = None
            return document

        return self.store.update(clear)

    def _with_mutation_ports_controlled(
        self,
        intent: TrafficMutationIntentState,
        operation: Callable[[Any], Any],
    ) -> TrexCallResult:
        target = set(intent.ports)
        baseline_acquired = set(intent.baseline_acquired_ports)

        def controlled(client: Any) -> Any:
            try:
                acquired_before = set(client.get_acquired_ports())
            except Exception as exc:
                raise RuntimeError(
                    f"cannot inspect local TRex acquisition ownership: {exc}"
                ) from exc
            missing = sorted(target.difference(acquired_before))
            if missing:
                # This is deliberately non-forcing. A fresh client must prove
                # the old handler no longer owns the ports before recovery may
                # touch live state.
                client.acquire(
                    ports=missing,
                    force=False,
                    sync_streams=True,
                )
            try:
                acquired_now = set(client.get_acquired_ports())
                if not target.issubset(acquired_now):
                    raise RuntimeError(
                        "TRex did not confirm ownership of every recovery port"
                    )
                return operation(client)
            finally:
                try:
                    acquired_after = set(client.get_acquired_ports())
                    release_ports = sorted(
                        target.intersection(acquired_after).difference(
                            baseline_acquired
                        )
                    )
                    if release_ports:
                        client.release(ports=release_ports)
                    remaining = set(client.get_acquired_ports()).intersection(
                        target
                    )
                    if remaining != baseline_acquired:
                        raise RuntimeError(
                            "traffic recovery could not restore the exact "
                            "acquisition baseline"
                        )
                except Exception as exc:
                    raise RuntimeError(
                        f"cannot restore traffic acquisition baseline: {exc}"
                    ) from exc

        return self.with_client(controlled)

    @staticmethod
    def _start_stage_at_least(
        intent: TrafficMutationIntentState,
        stage: str,
    ) -> bool:
        return (
            _START_STAGE_ORDER.get(intent.hardware_stage, -1)
            >= _START_STAGE_ORDER[stage]
        )

    def _restore_start_stream_baseline(
        self,
        client: Any,
        intent: TrafficMutationIntentState,
    ) -> None:
        baseline = intent.baseline_stream_ids
        if baseline is None:
            raise RuntimeError(
                "traffic start has no exact pre-mutation stream evidence"
            )
        current = self._live_stream_ids(client, intent.ports)
        for port in intent.ports:
            missing = sorted(set(baseline[port]).difference(current[port]))
            if missing:
                raise RuntimeError(
                    "traffic start removed baseline stream definitions that "
                    f"cannot be reconstructed on port {port}: {missing}"
                )
        for port in intent.ports:
            extras = sorted(set(current[port]).difference(baseline[port]))
            if extras:
                client.remove_streams(extras, ports=[port])
        restored = self._live_stream_ids(client, intent.ports)
        if restored != baseline:
            raise RuntimeError(
                "traffic start stream cleanup did not restore the exact baseline"
            )

    def _rollback_failed_start(
        self,
        intent: TrafficMutationIntentState,
    ) -> TrexCallResult:
        def rollback(client: Any) -> dict[str, Any]:
            live = self._live_port_states(client, intent.ports)
            active_ports = [
                port
                for port, state in live.items()
                if state in {"running", "paused"}
            ]
            if any(state == "unknown" for state in live.values()):
                raise RuntimeError(
                    "cannot prove live state before traffic start rollback"
                )
            if active_ports:
                client.stop(ports=active_ports)
            stopped = self._live_port_states(client, intent.ports)
            if any(
                stopped[port] != intent.baseline_port_states[port]
                for port in intent.ports
            ):
                raise RuntimeError(
                    "traffic start rollback did not restore the port-state baseline"
                )

            if not self._start_stage_at_least(
                intent,
                "streams_remove_intent",
            ):
                if intent.baseline_stream_ids is not None:
                    observed = self._live_stream_ids(client, intent.ports)
                    if observed != intent.baseline_stream_ids:
                        raise RuntimeError(
                            "stream state changed before the durable remove boundary"
                        )
                return {"rolled_back": True}

            if intent.start_clear_existing:
                baseline = intent.baseline_stream_ids
                if baseline is None:
                    raise RuntimeError(
                        "traffic start has no stream baseline after acquisition"
                    )
                if any(baseline.values()):
                    raise RuntimeError(
                        "clear_existing may have removed baseline stream "
                        "definitions; exact rollback is impossible"
                    )
                client.remove_all_streams(ports=intent.ports)
                if any(self._live_stream_ids(client, intent.ports).values()):
                    raise RuntimeError(
                        "traffic start rollback could not restore empty streams"
                    )
            else:
                self._restore_start_stream_baseline(client, intent)
            return {"rolled_back": True}

        return self._with_mutation_ports_controlled(intent, rollback)

    def _normalize_start_replay(
        self,
        intent: TrafficMutationIntentState,
    ) -> TrexCallResult:
        if intent.start_clear_existing:
            return TrexCallResult(True, data={"normalized": True})
        if not self._start_stage_at_least(intent, "profile_add_intent"):
            return TrexCallResult(True, data={"normalized": True})
        return self._with_mutation_ports_controlled(
            intent,
            lambda client: (
                self._restore_start_stream_baseline(client, intent)
                or {"normalized": True}
            ),
        )

    def _replay_start_intent(
        self,
        intent: TrafficMutationIntentState,
    ) -> TrexCallResult:
        group = intent.start_group
        if (
            group is None
            or intent.start_profile_sha256 is None
            or intent.start_force is None
            or intent.start_total is None
            or intent.start_synchronized is None
            or intent.start_clear_existing is None
        ):
            return _failure(
                "traffic_mutation_recovery_required",
                "traffic start intent does not contain an exact replay command",
            )
        try:
            observed_sha256 = _profile_sha256(group.profile_path)
        except RuntimeStateError as exc:
            return _failure(
                "traffic_mutation_recovery_required",
                str(exc),
            )
        if observed_sha256 != intent.start_profile_sha256:
            return _failure(
                "traffic_mutation_recovery_required",
                "traffic profile bytes changed after the durable start intent",
            )
        normalized = self._normalize_start_replay(intent)
        if not normalized.ok:
            return normalized
        return execute_start_profile(
            self.resolve_profile_path,
            self.with_client,
            group.profile_path,
            intent.ports,
            group.multiplier,
            group.duration,
            intent.start_force,
            intent.start_total,
            intent.start_synchronized,
            intent.start_clear_existing,
            group.tunables,
            preflight=traffic_start_preflight,
            stage_hook=lambda stage, client: self._advance_start_intent_stage(
                intent.nonce,
                stage,
                client,
            ),
        )

    @staticmethod
    def _is_relative_update_multiplier(multiplier: str) -> bool:
        return multiplier.strip().endswith(("+", "-"))

    def _recover_traffic_mutation_intent(
        self,
        document: RuntimeStateDocument,
        live_states: dict[int, PortState],
        configured_ports: list[int],
        current_authority: RuntimeAuthorityIdentity,
    ) -> tuple[RuntimeStateDocument, dict[int, PortState], str]:
        intent = document.traffic_mutation_intent
        if intent is None:
            return document, live_states, "no traffic mutation recovery required"

        def unresolved(reason: str) -> tuple[
            RuntimeStateDocument,
            dict[int, PortState],
            str,
        ]:
            self._owned_session_id = None
            self._retain_failed_mutation_intent(intent.nonce, reason)
            return (
                self.store.load(),
                live_states,
                f"traffic mutation {intent.nonce} retained fail-closed: {reason}",
            )

        if intent.authority != current_authority:
            if self._is_safe_daemon_generation_rollover(
                intent.authority,
                current_authority,
            ):
                retired = self._retire_mutation_intent_after_generation_rollover(
                    intent.nonce,
                    intent.authority,
                )
                self._owned_session_id = None
                return (
                    retired,
                    live_states,
                    "traffic mutation from the previous managed daemon "
                    "generation was retired without touching current hardware",
                )
            return unresolved(
                "runtime target or daemon generation changed"
            )
        if document.traffic_session != intent.session_before:
            return unresolved("managed session no longer matches the WAL baseline")
        session_before = intent.session_before
        expired_session_lease = (
            session_before is not None
            and any(
                group.hard_stop_at is not None
                and group.state != "stopped"
                and hard_stop_is_expired(
                    group.hard_stop_at,
                    self._clock(),
                )
                for group in session_before.groups
            )
        )
        if (
            expired_session_lease
            or self._is_hard_stop_superseding_intent(intent)
        ):
            # GET/snapshot recovery must never replay a mutation after a
            # session lease expires. Only the independent supervisor may
            # execute or finish the exact stop.
            return (
                document,
                live_states,
                "expired traffic hard-stop lease has priority; pending WAL "
                "awaits the runtime supervisor without read-side replay",
            )
        if set(intent.baseline_port_states) != set(configured_ports):
            return unresolved(
                "WAL baseline does not exactly cover configured ports"
            )
        if any(
            live_states.get(port, "unknown")
            != intent.baseline_port_states[port]
            for port in configured_ports
            if port not in intent.ports
        ):
            return unresolved(
                "non-target port state changed outside the exact mutation intent"
            )
        if intent.expected_session_id is not None:
            session = intent.session_before
            if (
                session is None
                or session.id != intent.expected_session_id
                or session.authority != current_authority
                or session.state not in {"running", "paused", "mixed"}
            ):
                return unresolved(
                    "expected managed session is not safely recoverable"
                )
            self._owned_session_id = session.id

        baseline_match = all(
            live_states.get(port, "unknown")
            == intent.baseline_port_states[port]
            for port in intent.ports
        )
        desired_match = all(
            live_states.get(port, "unknown")
            == intent.desired_port_states[port]
            for port in intent.ports
        )
        attributable_states = all(
            live_states.get(port, "unknown")
            in {
                intent.baseline_port_states[port],
                intent.desired_port_states[port],
            }
            for port in intent.ports
        )

        if intent.operation == "start":
            hard_stop_expired = (
                intent.start_group is not None
                and intent.start_group.hard_stop_at is not None
                and hard_stop_is_expired(
                    intent.start_group.hard_stop_at,
                    self._clock(),
                )
            )
            if intent.phase == "cleanup_required" or hard_stop_expired:
                rollback = self._rollback_failed_start(intent)
                if not rollback.ok:
                    return unresolved(
                        rollback.error
                        or rollback.blocker
                        or "traffic start rollback could not be proven"
                    )
                sampled = self._sample_mutation_baseline(configured_ports)
                if not sampled.ok or not isinstance(sampled.data, dict):
                    return unresolved(
                        sampled.error
                        or sampled.blocker
                        or "cannot verify traffic start rollback"
                    )
                live_states = sampled.data
                if any(
                    live_states[port] != intent.baseline_port_states[port]
                    for port in configured_ports
                ):
                    return unresolved(
                        "traffic start rollback did not restore its exact "
                        "port-state baseline"
                    )
                updated = self._clear_traffic_mutation_intent(
                    intent.nonce,
                    intent.session_before,
                )
                return (
                    updated,
                    live_states,
                    (
                        f"expired traffic start {intent.nonce} was exactly "
                        "rolled back without replay"
                        if hard_stop_expired
                        else
                        f"failed traffic start {intent.nonce} was exactly rolled back"
                    ),
                )

            if desired_match:
                if not self._start_stage_at_least(intent, "start_intent"):
                    return unresolved(
                        "traffic is running before the durable start RPC boundary"
                    )
                control = self._with_mutation_ports_controlled(
                    intent,
                    lambda _client: {"control_proved": True},
                )
                if not control.ok:
                    return unresolved(
                        control.error
                        or control.blocker
                        or "cannot prove control of recovered running traffic"
                    )
                session = self._persist_start(
                    authority=current_authority,
                    intent_nonce=intent.nonce,
                )
                self._owned_session_id = session.id
                return (
                    self.store.load(),
                    live_states,
                    f"traffic start {intent.nonce} recovered and promoted",
                )
            if baseline_match:
                if self._start_stage_at_least(intent, "start_intent"):
                    return unresolved(
                        "the start RPC may have completed a finite run while "
                        "the API was unavailable; replay would duplicate traffic"
                    )
                replay = self._replay_start_intent(intent)
                if not replay.ok:
                    return unresolved(
                        replay.error
                        or replay.blocker
                        or "traffic start replay failed"
                    )
                control = self._with_mutation_ports_controlled(
                    intent,
                    lambda _client: {"control_proved": True},
                )
                if not control.ok:
                    return unresolved(
                        control.error
                        or control.blocker
                        or "cannot restore the start acquisition baseline"
                    )
                sampled = self._sample_mutation_baseline(configured_ports)
                if not sampled.ok or not isinstance(sampled.data, dict):
                    return unresolved(
                        sampled.error
                        or sampled.blocker
                        or "cannot verify replayed traffic start"
                    )
                live_states = sampled.data
                if any(
                    live_states[port] != intent.desired_port_states[port]
                    for port in intent.ports
                ) or any(
                    live_states[port] != intent.baseline_port_states[port]
                    for port in configured_ports
                    if port not in intent.ports
                ):
                    return unresolved(
                        "replayed traffic start did not reach its exact desired state"
                    )
                session = self._persist_start(
                    authority=current_authority,
                    intent_nonce=intent.nonce,
                )
                self._owned_session_id = session.id
                return (
                    self.store.load(),
                    live_states,
                    f"traffic start {intent.nonce} replayed and promoted",
                )
            return unresolved(
                "start target state is neither its exact baseline nor desired "
                "state; partial replay is unsafe"
            )

        if intent.operation == "update":
            if not baseline_match:
                return unresolved(
                    "traffic state changed while an update intent was pending"
                )
            if (
                intent.update_multiplier is None
                or intent.update_force is None
                or intent.update_total is None
            ):
                return unresolved("traffic update intent is incomplete")
            if intent.phase == "cleanup_required":
                control = self._with_mutation_ports_controlled(
                    intent,
                    lambda _client: {"control_proved": True},
                )
                if not control.ok:
                    return unresolved(
                        control.error
                        or control.blocker
                        or "cannot restore the update acquisition baseline"
                    )
                return unresolved(
                    "the update RPC returned failure and its live rate outcome "
                    "cannot be proven; read-side recovery will not replay it"
                )
            if self._is_relative_update_multiplier(intent.update_multiplier):
                control = self._with_mutation_ports_controlled(
                    intent,
                    lambda _client: {"control_proved": True},
                )
                if not control.ok:
                    return unresolved(
                        control.error
                        or control.blocker
                        or "cannot restore the update acquisition baseline"
                    )
                return unresolved(
                    "relative traffic update outcome is ambiguous and cannot "
                    "be replayed without double-applying the delta"
                )
            replay = execute_update_traffic(
                self.with_client,
                intent.ports,
                intent.update_multiplier,
                intent.update_force,
                intent.update_total,
            )
            if not replay.ok:
                return unresolved(
                    replay.error
                    or replay.blocker
                    or "traffic update replay failed"
                )
            control = self._with_mutation_ports_controlled(
                intent,
                lambda _client: {"control_proved": True},
            )
            if not control.ok:
                return unresolved(
                    control.error
                    or control.blocker
                    or "cannot restore the update acquisition baseline"
                )
            session = self._persist_update(
                intent.ports,
                intent.update_multiplier,
                current_authority,
                intent.nonce,
            )
            if session is not None:
                self._owned_session_id = session.id
            return (
                self.store.load(),
                live_states,
                f"traffic update {intent.nonce} replayed and promoted",
            )

        if desired_match:
            control = self._with_mutation_ports_controlled(
                intent,
                lambda _client: {"control_proved": True},
            )
            if not control.ok:
                return unresolved(
                    control.error
                    or control.blocker
                    or "cannot restore the action acquisition baseline"
                )
            session = self._persist_action(
                intent.operation,
                intent.ports,
                current_authority,
                intent.nonce,
            )
            if session is not None and session.state != "stopped":
                self._owned_session_id = session.id
            return (
                self.store.load(),
                live_states,
                f"traffic {intent.operation} {intent.nonce} recovered and promoted",
            )
        if baseline_match:
            control = self._with_mutation_ports_controlled(
                intent,
                lambda _client: {"control_proved": True},
            )
            if not control.ok:
                return unresolved(
                    control.error
                    or control.blocker
                    or "cannot restore the action acquisition baseline"
                )
            updated = self._clear_traffic_mutation_intent(
                intent.nonce,
                intent.session_before,
            )
            return (
                updated,
                live_states,
                f"traffic {intent.operation} {intent.nonce} proved unapplied and was cleared",
            )
        if not attributable_states:
            return unresolved(
                "traffic action target state is outside its exact WAL evidence"
            )
        if intent.phase == "cleanup_required":
            control = self._with_mutation_ports_controlled(
                intent,
                lambda _client: {"control_proved": True},
            )
            if not control.ok:
                return unresolved(
                    control.error
                    or control.blocker
                    or "cannot restore the action acquisition baseline"
                )
            return unresolved(
                f"traffic {intent.operation} RPC returned failure after a "
                "partial state change; read-side recovery will not mutate "
                "remaining ports"
            )

        retry_ports = [
            port
            for port in intent.ports
            if live_states.get(port) != intent.desired_port_states[port]
        ]
        replay = execute_traffic_action(
            self.with_client,
            intent.operation,
            retry_ports,
        )
        if not replay.ok:
            return unresolved(
                replay.error
                or replay.blocker
                or f"traffic {intent.operation} recovery replay failed"
            )
        sampled = self._sample_mutation_baseline(configured_ports)
        if not sampled.ok or not isinstance(sampled.data, dict):
            return unresolved(
                sampled.error
                or sampled.blocker
                or "cannot verify traffic action recovery"
            )
        live_states = sampled.data
        if any(
            live_states[port] != intent.desired_port_states[port]
            for port in intent.ports
        ) or any(
            live_states[port] != intent.baseline_port_states[port]
            for port in configured_ports
            if port not in intent.ports
        ):
            return unresolved(
                f"traffic {intent.operation} replay did not reach exact desired state"
            )
        control = self._with_mutation_ports_controlled(
            intent,
            lambda _client: {"control_proved": True},
        )
        if not control.ok:
            return unresolved(
                control.error
                or control.blocker
                or "cannot restore the action acquisition baseline"
            )
        session = self._persist_action(
            intent.operation,
            intent.ports,
            current_authority,
            intent.nonce,
        )
        if session is not None and session.state != "stopped":
            self._owned_session_id = session.id
        return (
            self.store.load(),
            live_states,
            f"traffic {intent.operation} {intent.nonce} replayed and promoted",
        )

    @staticmethod
    def _is_safe_daemon_generation_rollover(
        previous: RuntimeAuthorityIdentity,
        current: RuntimeAuthorityIdentity,
    ) -> bool:
        return (
            previous.daemon_supervisor == "systemd"
            and current.daemon_supervisor == "systemd"
            and previous.generation != current.generation
            and (
                previous.host,
                previous.sync_port,
                previous.async_port,
                previous.scapy_port,
            )
            == (
                current.host,
                current.sync_port,
                current.async_port,
                current.scapy_port,
            )
        )

    def _retire_mutation_intent_after_generation_rollover(
        self,
        intent_nonce: str,
        previous_authority: RuntimeAuthorityIdentity,
    ) -> RuntimeStateDocument:
        now = utc_now_iso()

        def retire(document: RuntimeStateDocument) -> RuntimeStateDocument:
            intent = document.traffic_mutation_intent
            if (
                intent is None
                or intent.nonce != intent_nonce
                or intent.authority != previous_authority
            ):
                raise TrafficMutationRecoveryRequired(
                    "traffic mutation intent changed during generation rollover"
                )
            if document.traffic_session != intent.session_before:
                raise TrafficSessionIdConflict(
                    "managed traffic session changed during generation rollover"
                )
            session = document.traffic_session
            if session is not None and session.authority == previous_authority:
                session = session.model_copy(deep=True)
                for group in session.groups:
                    group.port_states = {
                        port: "stopped"
                        for port in group.ports
                    }
                    group.state = "stopped"
                    group.hard_stop_at = None
                    group.updated_at = now
                session.state = "stopped"
                session.updated_at = now
                session.ended_at = now
                session.reconciliation = (
                    "retired after managed TRex daemon generation rollover"
                )
                document.traffic_session = session
            document.traffic_mutation_intent = None
            return document

        return self.store.update(retire)

    def _persist_start(
        self,
        *,
        authority: RuntimeAuthorityIdentity,
        intent_nonce: str,
    ) -> TrafficSessionState:
        session = self._promote_traffic_mutation_intent(
            intent_nonce,
            "start",
            authority,
        )
        if session is None:
            raise RuntimeStateError("persisted traffic session is missing after start")
        return session

    def _assert_start_session_authority(
        self,
        document: RuntimeStateDocument,
        current_authority: RuntimeAuthorityIdentity,
        expected_session_id: str | None,
    ) -> None:
        if document.traffic_mutation_intent is not None:
            raise TrafficMutationRecoveryRequired(
                "a durable traffic mutation intent must be recovered before starting"
            )
        session = document.traffic_session
        if expected_session_id is None:
            if (
                session is not None
                and session.state in {"running", "paused", "mixed", "unknown"}
            ):
                raise TrafficSessionIdConflict(
                    "expected no active managed traffic session, but "
                    f"session {session.id} is {session.state}"
                )
            return
        if session is None:
            raise TrafficSessionIdConflict(
                f"traffic session {expected_session_id} does not exist"
            )
        if session.id != expected_session_id:
            raise TrafficSessionIdConflict(
                f"traffic session id is {session.id}, not {expected_session_id}"
            )
        if session.state not in {"running", "paused", "mixed"}:
            raise TrafficSessionIdConflict(
                f"traffic session {session.id} is not safely active: {session.state}"
            )
        if session.authority != current_authority:
            raise TrafficSessionIdConflict(
                "traffic session belongs to a different TRex target or daemon generation"
            )
        if session.id != self._owned_session_id:
            raise TrafficSessionIdConflict(
                "traffic session has not been safely adopted by this API process"
            )

    def _persist_update(
        self,
        ports: list[int],
        multiplier: str,
        authority: RuntimeAuthorityIdentity,
        intent_nonce: str,
    ) -> TrafficSessionState | None:
        del ports, multiplier
        return self._promote_traffic_mutation_intent(
            intent_nonce,
            "update",
            authority,
        )

    def _persist_action(
        self,
        action: str,
        ports: list[int],
        authority: RuntimeAuthorityIdentity,
        intent_nonce: str,
    ) -> TrafficSessionState | None:
        del ports
        session = self._promote_traffic_mutation_intent(
            intent_nonce,
            action,
            authority,
        )
        if session is not None and session.state == "stopped":
            self._owned_session_id = None
        return session

    def _promote_traffic_mutation_intent(
        self,
        intent_nonce: str,
        expected_operation: str,
        authority: RuntimeAuthorityIdentity,
    ) -> TrafficSessionState | None:
        now = utc_now_iso()

        def promote(document: RuntimeStateDocument) -> RuntimeStateDocument:
            intent = document.traffic_mutation_intent
            if (
                intent is None
                or intent.nonce != intent_nonce
                or intent.operation != expected_operation
            ):
                raise TrafficSessionIdConflict(
                    "the durable traffic mutation intent changed before promotion"
                )
            if intent.authority != authority:
                raise TrafficRuntimeAuthorityMismatch(
                    "traffic mutation crossed a daemon generation boundary"
                )
            if document.traffic_session != intent.session_before:
                raise TrafficSessionIdConflict(
                    "the managed traffic session changed before mutation promotion"
                )

            if intent.operation == "start":
                started_group = intent.start_group
                if started_group is None:
                    raise RuntimeStateError(
                        "traffic start intent is missing its exact group"
                    )
                if intent.expected_session_id is not None:
                    existing = document.traffic_session
                    if (
                        existing is None
                        or existing.id != intent.expected_session_id
                        or existing.id != self._owned_session_id
                        or existing.state not in {"running", "paused", "mixed"}
                        or existing.authority != authority
                    ):
                        raise TrafficSessionIdConflict(
                            "the managed traffic session changed before start promotion"
                        )
                    session = existing.model_copy(deep=True)
                    session.groups = [
                        candidate
                        for candidate in session.groups
                        if not set(candidate.ports).intersection(intent.ports)
                    ]
                    session.groups.append(
                        started_group.model_copy(
                            update={"updated_at": now},
                            deep=True,
                        )
                    )
                else:
                    existing = document.traffic_session
                    if (
                        existing is not None
                        and existing.state
                        in {"running", "paused", "mixed", "unknown"}
                    ):
                        raise TrafficSessionIdConflict(
                            "a managed traffic session appeared before start promotion"
                        )
                    session = TrafficSessionState(
                        id=intent.nonce,
                        authority=authority,
                        state="running",
                        started_at=now,
                        updated_at=now,
                        groups=[
                            started_group.model_copy(
                                update={"updated_at": now},
                                deep=True,
                            )
                        ],
                    )
                session.state = self._aggregate_state(session.groups)
                session.updated_at = now
                session.ended_at = None
                session.reconciliation = (
                    "promoted from durable traffic start intent"
                )
            else:
                session = document.traffic_session
                if (
                    session is None
                    or session.id != intent.expected_session_id
                    or session.id != self._owned_session_id
                    or session.authority != authority
                ):
                    raise TrafficSessionIdConflict(
                        "the managed traffic session changed before mutation promotion"
                    )
                session = session.model_copy(deep=True)
                target = set(intent.ports)
                if intent.operation == "update":
                    if intent.update_multiplier is None:
                        raise RuntimeStateError(
                            "traffic update intent is missing its multiplier"
                        )
                    changed = False
                    for group in session.groups:
                        if set(group.ports).issubset(target):
                            group.multiplier = intent.update_multiplier
                            group.updated_at = now
                            changed = True
                    if not changed:
                        raise RuntimeStateError(
                            "traffic update intent does not cover a managed group"
                        )
                else:
                    changed = False
                    for group in session.groups:
                        selected_ports = set(group.ports).intersection(target)
                        if selected_ports:
                            for port in selected_ports:
                                group.port_states[port] = (
                                    intent.desired_port_states[port]
                                )
                            group.state = self._aggregate_port_states(
                                group.port_states
                            )
                            if group.state == "stopped":
                                group.hard_stop_at = None
                            group.updated_at = now
                            changed = True
                    if not changed:
                        raise RuntimeStateError(
                            "traffic action intent does not cover a managed port"
                        )
                    session.state = self._aggregate_state(session.groups)
                    session.ended_at = (
                        now if session.state == "stopped" else None
                    )
                session.updated_at = now
                session.reconciliation = (
                    f"promoted from durable traffic {intent.operation} intent"
                )

            document.traffic_session = session
            document.traffic_mutation_intent = None
            return document

        return self.store.update(promote).traffic_session

    def _connection_target_failure(self) -> TrexCallResult | None:
        try:
            assert_persisted_connection_target(self.env, self.store)
        except RuntimeConnectionTargetMismatch as exc:
            return _failure("trex_runtime_connection_changed", str(exc))
        except (OSError, RuntimeError) as exc:
            return _failure(
                "traffic_runtime_state_invalid",
                f"cannot validate the persisted TRex connection target: {exc}",
            )
        return None

    def _assert_session_mutation_authority(
        self,
        requested_ports: list[int] | None,
        *,
        expected_session_id: str | None,
        require_complete_groups: bool = False,
    ) -> tuple[
        RuntimeAuthorityIdentity,
        list[int],
        TrafficSessionState,
    ]:
        current_authority = self._runtime_authority.current()
        document = self.store.load()
        if document.traffic_mutation_intent is not None:
            raise TrafficMutationRecoveryRequired(
                "a durable traffic mutation intent must be recovered first"
            )
        session = document.traffic_session
        if session is None:
            raise TrafficRuntimeAuthorityMismatch(
                "no managed traffic session exists"
            )
        if expected_session_id is None:
            raise TrafficSessionIdConflict(
                "expected_session_id is required for traffic mutations"
            )
        if session.id != expected_session_id:
            raise TrafficSessionIdConflict(
                f"traffic session id is {session.id}, not {expected_session_id}"
            )
        if session.authority != current_authority:
            raise TrafficRuntimeAuthorityMismatch(
                "persisted traffic belongs to a different TRex target or daemon generation"
            )
        if session.state not in {"running", "paused", "mixed"}:
            raise TrafficRuntimeAuthorityMismatch(
                f"managed traffic session is not safely active: {session.state}"
            )
        if session.id != self._owned_session_id:
            raise TrafficRuntimeAuthorityMismatch(
                "active traffic has not been safely re-adopted by this API process"
            )
        owned_ports = sorted(
            {
                port
                for group in session.groups
                for port in group.ports
            }
        )
        if not owned_ports:
            raise TrafficRuntimeAuthorityMismatch(
                "managed traffic session has no owned ports"
            )
        if requested_ports is None:
            return current_authority, owned_ports, session.model_copy(deep=True)
        if not requested_ports:
            raise TrafficRuntimeAuthorityMismatch(
                "traffic mutation requires at least one owned port"
            )
        outside = sorted(set(requested_ports).difference(owned_ports))
        if outside:
            raise TrafficRuntimeAuthorityMismatch(
                f"traffic mutation ports are not owned by this session: {outside}"
            )
        if require_complete_groups:
            target = set(requested_ports)
            partial_groups = [
                group.group_id or ",".join(f"P{port}" for port in group.ports)
                for group in session.groups
                if set(group.ports).intersection(target)
                and not set(group.ports).issubset(target)
            ]
            if partial_groups:
                raise TrafficPartialGroupUpdate(
                    "traffic update must target complete managed groups; "
                    f"partial groups: {partial_groups}"
                )
        return (
            current_authority,
            requested_ports,
            session.model_copy(deep=True),
        )

    def _assert_authority_unchanged(
        self,
        expected: RuntimeAuthorityIdentity,
    ) -> None:
        observed = self._runtime_authority.current()
        if observed != expected:
            raise TrafficRuntimeAuthorityMismatch(
                "TRex target or daemon generation changed during the operation"
            )

    def _live_port_states(self, client: Any, configured_ports: list[int]) -> dict[int, PortState]:
        try:
            actual_ports = set(client.get_all_ports())
        except Exception:
            return {port: "unknown" for port in configured_ports}
        missing_ports = set(configured_ports).difference(actual_ports)
        if missing_ports:
            return {port: "unknown" for port in configured_ports}
        for port in configured_ports:
            _sync_port_state(client, port)
        return {
            port: _real_port_state(client, port)
            for port in configured_ports
        }

    def _adopt_managed_session(
        self,
        document: RuntimeStateDocument,
        live_states: dict[int, PortState],
        current_authority: RuntimeAuthorityIdentity,
    ) -> bool:
        session = document.traffic_session
        if (
            self._owned_session_id is not None
            or self.env.daemon_supervisor != "systemd"
            or session is None
            or not session.groups
            or session.authority != current_authority
        ):
            return False
        active_group_seen = False
        for group in session.groups:
            if "unknown" in group.port_states.values():
                return False
            if any(
                live_states.get(port, "unknown") != group.port_states[port]
                for port in group.ports
            ):
                return False
            if any(
                state in {"running", "paused"}
                for state in group.port_states.values()
            ):
                active_group_seen = True
        if not active_group_seen:
            return False
        self._owned_session_id = session.id
        return True

    def _reconcile_session(
        self,
        document: RuntimeStateDocument,
        live_states: dict[int, PortState],
        reconciliation: str,
        current_authority: RuntimeAuthorityIdentity,
    ) -> RuntimeStateDocument:
        if document.traffic_session is None:
            return document
        session = document.traffic_session
        authority_matches = session.authority == current_authority
        if not authority_matches:
            self._owned_session_id = None
        owned = authority_matches and session.id == self._owned_session_id
        now = utc_now_iso()
        reconciled_groups: list[TrafficSessionGroupState] = []
        for group in session.groups:
            if owned:
                port_states = {
                    port: live_states.get(port, "unknown")
                    for port in group.ports
                }
            else:
                port_states = {
                    port: (
                        "stopped"
                        if live_states.get(port, "unknown") == "stopped"
                        else "unknown"
                    )
                    for port in group.ports
                }
            state = self._aggregate_port_states(port_states)
            hard_stop_at = (
                None if state == "stopped" else group.hard_stop_at
            )
            reconciled_groups.append(
                group.model_copy(
                    update={
                        "state": state,
                        "port_states": port_states,
                        "hard_stop_at": hard_stop_at,
                        "updated_at": now,
                    }
                )
                if (
                    group.state != state
                    or group.port_states != port_states
                    or group.hard_stop_at != hard_stop_at
                )
                else group
            )
        aggregate = self._aggregate_state(reconciled_groups)
        full_reconciliation = reconciliation
        if not authority_matches:
            full_reconciliation += (
                "; persisted session belongs to a different TRex target or "
                "daemon generation"
            )
        if not owned and any(group.state == "unknown" for group in reconciled_groups):
            full_reconciliation += "; active traffic cannot be attributed to this API process"
        changed = (
            reconciled_groups != session.groups
            or aggregate != session.state
            or session.reconciliation != full_reconciliation
        )
        if not changed:
            return document

        def persist(current: RuntimeStateDocument) -> RuntimeStateDocument | None:
            if current.traffic_session is None or current.traffic_session.id != session.id:
                return None
            current.traffic_session.groups = reconciled_groups
            current.traffic_session.state = aggregate
            current.traffic_session.updated_at = now
            current.traffic_session.ended_at = now if aggregate == "stopped" else None
            current.traffic_session.reconciliation = full_reconciliation
            return current

        updated = self.store.update(persist)
        if aggregate == "stopped":
            self._owned_session_id = None
        return updated

    def _snapshot_payload(
        self,
        document: RuntimeStateDocument,
        config: TrexConfig,
        live_states: dict[int, PortState],
        reconciliation: str,
        current_authority: RuntimeAuthorityIdentity,
        *,
        live_state_sampled: bool = True,
    ) -> dict[str, Any]:
        session = document.traffic_session
        session_ports = {
            port
            for group in (session.groups if session is not None else [])
            for port in group.ports
        }
        owned = (
            session is not None
            and session.authority == current_authority
            and session.id == self._owned_session_id
        )
        port_states = []
        for port in range(config.port_limit):
            real_state = live_states.get(port, "unknown")
            port_owned = owned and port in session_ports
            if real_state in {"running", "paused"} and not port_owned:
                visible_state: PortState = "unknown"
                ownership = "external"
            else:
                visible_state = real_state
                ownership = "managed" if port_owned else "none"
            port_states.append(
                {
                    "port": port,
                    "state": visible_state,
                    "ownership": ownership,
                }
            )
        return {
            "plan_revision": document.traffic_plan_revision,
            "groups": [group.model_dump(mode="json") for group in document.traffic_groups],
            "session": session.model_dump(mode="json") if session is not None else None,
            "mutation_intent": (
                document.traffic_mutation_intent.model_dump(mode="json")
                if document.traffic_mutation_intent is not None
                else None
            ),
            "config": {
                "path": str(self.env.config_path),
                "port_limit": config.port_limit,
                "interfaces": config.interfaces[: config.port_limit],
            },
            "available_ports": list(range(config.port_limit)),
            "port_states": port_states,
            "live_state_sampled": live_state_sampled,
            "reconciliation": reconciliation,
        }

    @staticmethod
    def _aggregate_state(groups: list[TrafficSessionGroupState]) -> Literal[
        "running", "paused", "stopped", "mixed", "unknown"
    ]:
        states = {group.state for group in groups}
        if not states:
            return "stopped"
        if "unknown" in states:
            return "unknown"
        if len(states) == 1:
            return next(iter(states))  # type: ignore[return-value]
        return "mixed"

    @staticmethod
    def _aggregate_port_states(port_states: dict[int, PortState]) -> GroupState:
        states = set(port_states.values())
        if not states:
            return "stopped"
        if "unknown" in states:
            return "unknown"
        if len(states) == 1:
            return next(iter(states))  # type: ignore[return-value]
        return "mixed"
