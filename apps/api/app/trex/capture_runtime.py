from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Iterable

from app.trex.capture_state import capture_record_ports, dedupe_ports
from app.trex.runtime_state import (
    CaptureLeaseState,
    CaptureRecorderIdentityState,
    RuntimeAuthorityIdentity,
    RuntimeStateDocument,
    RuntimeStateError,
    RuntimeStateStore,
)

ServiceStateFn = Callable[[Any, int], dict[str, Any]]
ServiceModeFn = Callable[[Any, int, dict[str, Any]], None]
ReleasePortsFn = Callable[[Any, list[int]], None]
RuntimeAuthorityFn = Callable[[], RuntimeAuthorityIdentity]


def _capture_id_key(capture_id: Any) -> str:
    return str(capture_id)


@dataclass(frozen=True)
class CaptureIdentity:
    tx_ports: tuple[int, ...]
    rx_ports: tuple[int, ...]
    bpf_filter: str

    @classmethod
    def create(
        cls,
        tx_ports: Iterable[int],
        rx_ports: Iterable[int],
        bpf_filter: str,
    ) -> "CaptureIdentity":
        return cls(
            tx_ports=tuple(sorted(set(tx_ports))),
            rx_ports=tuple(sorted(set(rx_ports))),
            bpf_filter=bpf_filter,
        )


class CaptureIdentityError(RuntimeStateError):
    pass


@dataclass(frozen=True)
class PendingCaptureStartResolution:
    capture_id: int | None
    new_capture_ids: tuple[int, ...]


@dataclass(frozen=True)
class CapturePreparation:
    stage: str
    pre_acquired_ports: tuple[int, ...]
    acquire_planned_ports: tuple[int, ...]
    service_enable_planned_ports: tuple[int, ...]
    pre_service_states: dict[int, dict[str, Any]]


class CaptureRuntime:
    def __init__(
        self,
        service_state: ServiceStateFn,
        enable_service_mode: ServiceModeFn,
        restore_service_mode: ServiceModeFn,
        release_ports_for_operation: ReleasePortsFn,
        state_store: RuntimeStateStore | None = None,
        runtime_authority: RuntimeAuthorityFn | None = None,
    ) -> None:
        self.service_states: dict[Any, dict[int, dict[str, Any]]] = {}
        self.ports: dict[Any, list[int]] = {}
        self.acquired_ports: dict[Any, list[int]] = {}
        self.identities: dict[Any, CaptureIdentity] = {}
        self.authorities: dict[Any, RuntimeAuthorityIdentity] = {}
        self.pending_baselines: dict[Any, tuple[int, ...]] = {}
        self.baseline_recorders: dict[
            Any,
            tuple[CaptureRecorderIdentityState, ...],
        ] = {}
        self.preparations: dict[Any, CapturePreparation] = {}
        self.cleanup_required_ids: set[Any] = set()
        self.stale_generation_capture_ids: set[str] = set()
        self._service_state = service_state
        self._enable_service_mode = enable_service_mode
        self._restore_service_mode = restore_service_mode
        self._release_ports_for_operation = release_ports_for_operation
        self._state_store = state_store
        if runtime_authority is None:
            raise RuntimeStateError("capture runtime authority provider is required")
        self._runtime_authority = runtime_authority
        self._restore_persisted_leases()

    def clear(self) -> None:
        self._replace_runtime_state({}, {}, {}, {}, {}, {}, {}, {}, set())
        self.stale_generation_capture_ids.clear()

    def prepare_service_mode(self, client: Any, ports: list[int]) -> dict[str, Any]:
        for capture_id in self.managed_capture_ids():
            self.assert_runtime_authority(capture_id)
        states: dict[int, dict[str, Any]] = {}
        enabled_ports: list[int] = []
        already_enabled_ports: list[int] = []
        try:
            for port in ports:
                current_state = self._service_state(client, port)
                original_state = self._original_service_state(port, current_state)
                states[port] = dict(original_state)
                if current_state["enabled"]:
                    already_enabled_ports.append(port)
                    continue
                enabled_ports.append(port)
                self._enable_service_mode(client, port, current_state)
        except Exception:
            self.restore_prepared_service_mode(
                client,
                {
                    "states": states,
                    "enabled_ports": enabled_ports,
                },
            )
            raise
        return {
            "states": states,
            "enabled_ports": enabled_ports,
            "already_enabled_ports": already_enabled_ports,
            "restored_ports": [],
            "managed_capture_ids": [],
        }

    def begin_capture_start(
        self,
        client: Any,
        ports: list[int],
        tx_ports: list[int],
        rx_ports: list[int],
        bpf_filter: str,
        baseline_captures: Any,
        authority: RuntimeAuthorityIdentity | None = None,
    ) -> str:
        if self.pending_baselines or self.preparations:
            raise RuntimeStateError(
                "an unresolved capture start must be reconciled before starting another"
            )
        observed_authority = self._validated_current_authority(authority)
        normalized_ports = dedupe_ports(ports)
        if set(normalized_ports) != set(ports):
            raise CaptureIdentityError(
                "capture start ports must be unique non-negative integers"
            )
        acquired_snapshot = self._strict_acquired_ports(client)
        pre_acquired_ports = [
            port
            for port in normalized_ports
            if port in acquired_snapshot
        ]
        acquire_planned_ports = [
            port
            for port in normalized_ports
            if port not in acquired_snapshot
        ]
        pre_service_states = {
            port: self._strict_synchronized_service_state(
                client,
                port,
            )
            for port in normalized_ports
        }
        service_enable_planned_ports = [
            port
            for port in normalized_ports
            if pre_service_states[port]["enabled"] is False
        ]
        restore_states = {
            port: dict(
                self._original_service_state(
                    port,
                    pre_service_states[port],
                )
            )
            for port in normalized_ports
        }
        baseline_records = self.validated_capture_status_records(
            baseline_captures
        )
        baseline_recorders = tuple(
            self._baseline_recorder(record)
            for record in baseline_records
        )
        self._validated_current_authority(observed_authority)

        pending_id = f"pending-start:{uuid.uuid4()}"
        candidate_states = self._copy_service_states()
        candidate_ports = self._copy_ports(self.ports)
        candidate_acquired_ports = self._copy_ports(self.acquired_ports)
        candidate_identities = self._copy_identities()
        candidate_authorities = self._copy_authorities()
        candidate_pending_baselines = self._copy_pending_baselines()
        candidate_baseline_recorders = self._copy_baseline_recorders()
        candidate_preparations = self._copy_preparations()
        candidate_cleanup_required_ids = set(self.cleanup_required_ids)
        candidate_states[pending_id] = self._validated_service_states(
            pending_id,
            restore_states,
            normalized_ports,
        )
        candidate_ports[pending_id] = list(normalized_ports)
        candidate_acquired_ports[pending_id] = []
        candidate_identities[pending_id] = CaptureIdentity.create(
            tx_ports,
            rx_ports,
            bpf_filter,
        )
        candidate_authorities[pending_id] = observed_authority
        normalized_baseline_ids = tuple(
            recorder.capture_id
            for recorder in baseline_recorders
        )
        candidate_pending_baselines[pending_id] = normalized_baseline_ids
        candidate_baseline_recorders[pending_id] = baseline_recorders
        candidate_preparations[pending_id] = CapturePreparation(
            stage="wal",
            pre_acquired_ports=tuple(pre_acquired_ports),
            acquire_planned_ports=tuple(acquire_planned_ports),
            service_enable_planned_ports=tuple(
                service_enable_planned_ports
            ),
            pre_service_states={
                port: dict(state)
                for port, state in pre_service_states.items()
            },
        )
        self._replace_runtime_state(
            candidate_states,
            candidate_ports,
            candidate_acquired_ports,
            candidate_identities,
            candidate_authorities,
            candidate_pending_baselines,
            candidate_baseline_recorders,
            candidate_preparations,
            candidate_cleanup_required_ids,
        )
        return pending_id

    def prepare_capture_hardware(
        self,
        client: Any,
        pending_id: str,
    ) -> dict[str, Any]:
        preparation = self._required_preparation(pending_id, "wal")
        self.assert_runtime_authority(pending_id)
        if self._target_acquired_ports(client, pending_id) != set(
            preparation.pre_acquired_ports
        ):
            raise CaptureIdentityError(
                "capture port ownership changed after the durable preparation "
                f"snapshot; ledger {pending_id!r} retained"
            )

        acquire = getattr(client, "acquire", None)
        if preparation.acquire_planned_ports and not callable(acquire):
            raise RuntimeStateError("TRex client does not expose port acquisition")
        self._set_preparation_stage(pending_id, "acquire_intent")
        if preparation.acquire_planned_ports:
            self.assert_runtime_authority(pending_id)
            acquire(
                ports=list(preparation.acquire_planned_ports),
                force=False,
                sync_streams=True,
            )
        self._confirm_capture_acquired(client, pending_id)

        preparation = self._required_preparation(pending_id, "acquired")
        self.assert_runtime_authority(pending_id)
        current_states = self._snapshot_recovery_service_states(
            client,
            self.ports[pending_id],
        )
        if current_states != preparation.pre_service_states:
            raise CaptureIdentityError(
                "capture service-mode state changed after the durable preparation "
                f"snapshot; ledger {pending_id!r} retained"
            )
        self._set_preparation_stage(pending_id, "service_intent")
        for port in preparation.service_enable_planned_ports:
            self.assert_runtime_authority(pending_id)
            self._enable_service_mode(
                client,
                port,
                preparation.pre_service_states[port],
            )
        self.assert_runtime_authority(pending_id)
        if self._snapshot_recovery_service_states(
            client,
            self.ports[pending_id],
        ) != self._expected_enabled_service_states(pending_id):
            raise CaptureIdentityError(
                "capture service-mode enable could not be confirmed exactly; "
                f"ledger {pending_id!r} retained"
            )
        self._set_preparation_stage(pending_id, "service_enabled")
        return self.prepared_service_mode_payload(pending_id)

    def mark_capture_rpc_attempted(self, pending_id: str) -> None:
        self._required_preparation(pending_id, "service_enabled")
        self.assert_runtime_authority(pending_id)
        candidate_preparations = self._copy_preparations()
        candidate_preparations.pop(pending_id, None)
        self._replace_runtime_state(
            self._copy_service_states(),
            self._copy_ports(self.ports),
            self._copy_ports(self.acquired_ports),
            self._copy_identities(),
            self._copy_authorities(),
            self._copy_pending_baselines(),
            self._copy_baseline_recorders(),
            candidate_preparations,
            set(self.cleanup_required_ids),
        )

    def prepared_service_mode_payload(self, pending_id: str) -> dict[str, Any]:
        preparation = self.preparations.get(pending_id)
        if preparation is None:
            raise RuntimeStateError(
                f"capture preparation {pending_id!r} does not exist"
            )
        return {
            "states": {
                port: dict(state)
                for port, state in self.service_states[pending_id].items()
            },
            "enabled_ports": list(preparation.service_enable_planned_ports),
            "already_enabled_ports": sorted(
                set(self.ports[pending_id]).difference(
                    preparation.service_enable_planned_ports
                )
            ),
            "restored_ports": [],
            "managed_capture_ids": [],
        }

    def promote_pending_start(self, pending_id: str, capture_id: int) -> None:
        self._transition_pending_start(
            pending_id,
            capture_id,
            cleanup_required=False,
        )

    def require_pending_start_cleanup(
        self,
        pending_id: str,
        capture_id: int,
    ) -> None:
        self._transition_pending_start(
            pending_id,
            capture_id,
            cleanup_required=True,
        )

    def _transition_pending_start(
        self,
        pending_id: str,
        capture_id: int,
        *,
        cleanup_required: bool,
    ) -> None:
        if pending_id not in self.pending_baselines:
            raise RuntimeStateError(
                f"capture pending-start authority {pending_id!r} does not exist"
            )
        if (
            isinstance(capture_id, bool)
            or not isinstance(capture_id, int)
            or capture_id < 0
        ):
            raise CaptureIdentityError(
                "TRex capture start response has an invalid recorder id"
            )
        self.assert_runtime_authority(pending_id)
        if self.is_managed_capture_id(capture_id):
            raise CaptureIdentityError(
                f"TRex capture id {capture_id!r} is already managed"
            )

        candidate_states = self._move_capture_key(
            self._copy_service_states(),
            pending_id,
            capture_id,
        )
        candidate_ports = self._move_capture_key(
            self._copy_ports(self.ports),
            pending_id,
            capture_id,
        )
        candidate_acquired_ports = self._move_capture_key(
            self._copy_ports(self.acquired_ports),
            pending_id,
            capture_id,
        )
        candidate_identities = self._move_capture_key(
            self._copy_identities(),
            pending_id,
            capture_id,
        )
        candidate_authorities = self._move_capture_key(
            self._copy_authorities(),
            pending_id,
            capture_id,
        )
        candidate_pending_baselines = self._copy_pending_baselines()
        candidate_pending_baselines.pop(pending_id, None)
        candidate_baseline_recorders = self._copy_baseline_recorders()
        candidate_baseline_recorders.pop(pending_id, None)
        candidate_preparations = self._copy_preparations()
        candidate_preparations.pop(pending_id, None)
        candidate_cleanup_required_ids = set(self.cleanup_required_ids)
        if cleanup_required:
            candidate_cleanup_required_ids.add(capture_id)
        self._replace_runtime_state(
            candidate_states,
            candidate_ports,
            candidate_acquired_ports,
            candidate_identities,
            candidate_authorities,
            candidate_pending_baselines,
            candidate_baseline_recorders,
            candidate_preparations,
            candidate_cleanup_required_ids,
        )

    def managed_capture_ids(self) -> list[Any]:
        return list(
            dict.fromkeys(
                [
                    *self.service_states,
                    *self.ports,
                    *self.acquired_ports,
                    *self.identities,
                    *self.authorities,
                    *self.pending_baselines,
                    *self.baseline_recorders,
                    *self.preparations,
                    *self.cleanup_required_ids,
                ]
            )
        )

    def is_managed_capture_id(self, capture_id: Any) -> bool:
        capture_id_key = _capture_id_key(capture_id)
        return any(
            _capture_id_key(candidate) == capture_id_key
            for candidate in self.managed_capture_ids()
        )

    def is_pending_capture_id(self, capture_id: Any) -> bool:
        capture_id_key = _capture_id_key(capture_id)
        return any(
            _capture_id_key(candidate) == capture_id_key
            for candidate in self.pending_baselines
            if candidate not in self.preparations
        )

    def is_preparing_capture_id(self, capture_id: Any) -> bool:
        capture_id_key = _capture_id_key(capture_id)
        return any(
            _capture_id_key(candidate) == capture_id_key
            for candidate in self.preparations
        )

    def is_cleanup_required_capture_id(self, capture_id: Any) -> bool:
        capture_id_key = _capture_id_key(capture_id)
        return any(
            _capture_id_key(candidate) == capture_id_key
            for candidate in self.cleanup_required_ids
        )

    def was_stale_generation_capture_id(self, capture_id: Any) -> bool:
        return _capture_id_key(capture_id) in self.stale_generation_capture_ids

    def reconcile(self, client: Any, captures: Any | None = None) -> dict[str, Any]:
        records = self.validated_capture_status_records(
            client.get_capture_status() if captures is None else captures
        )
        records_by_id = self._records_by_id(records)
        current_authority = self._runtime_authority()
        matching_active_ids: list[Any] = []
        missing_active_ids: list[Any] = []
        stale_generation_ids: list[Any] = []
        preparing_ids: list[Any] = []
        pending_resolutions: dict[Any, PendingCaptureStartResolution] = {}
        cleanup_records: dict[Any, int | None] = {}

        # Prove every ledger entry before mutating either the new daemon or the
        # local state. In particular, a reused numeric id in a new generation
        # must never be mistaken for the recorder owned by the old generation.
        for capture_id in self.managed_capture_ids():
            record = records_by_id.get(_capture_id_key(capture_id))
            expected_authority = self.authorities.get(capture_id)
            if expected_authority is None:
                raise CaptureIdentityError(
                    f"capture lease {capture_id!r} has no persisted runtime authority"
                )
            if expected_authority != current_authority:
                if not self._is_systemd_generation_rollover(
                    expected_authority,
                    current_authority,
                ):
                    raise CaptureIdentityError(
                        f"capture lease {capture_id!r} belongs to a different TRex "
                        "target or daemon generation"
                    )
                if (
                    self.is_pending_capture_id(capture_id)
                    or self.is_preparing_capture_id(capture_id)
                ):
                    stale_generation_ids.append(capture_id)
                    continue
                if record is not None:
                    raise CaptureIdentityError(
                        f"capture lease {capture_id!r} belongs to an earlier daemon "
                        "generation and its id is in use by the current daemon; "
                        "the lease belongs to a different TRex target or daemon "
                        "generation"
                    )
                stale_generation_ids.append(capture_id)
                continue

            if self.is_preparing_capture_id(capture_id):
                self._assert_baseline_recorders(capture_id, records)
                preparing_ids.append(capture_id)
                continue
            if self.is_pending_capture_id(capture_id):
                resolution = self.pending_start_resolution(
                    capture_id,
                    records,
                )
                if resolution.capture_id is None:
                    raise CaptureIdentityError(
                        "capture start recovery is still waiting for a uniquely "
                        f"attributable live recorder; ledger {capture_id!r} retained"
                    )
                pending_resolutions[capture_id] = resolution
                continue
            if self.is_cleanup_required_capture_id(capture_id):
                if record is not None:
                    self.assert_capture_identity(capture_id, record)
                    cleanup_records[capture_id] = int(record["id"])
                else:
                    cleanup_records[capture_id] = None
                continue
            if record is None:
                missing_active_ids.append(capture_id)
                continue
            self.assert_capture_identity(capture_id, record)
            matching_active_ids.append(capture_id)

        if stale_generation_ids:
            self._forget_capture_ids_without_hardware(stale_generation_ids)

        for pending_id in preparing_ids:
            self._recover_capture_preparation(client, pending_id, records)

        for pending_id, resolution in pending_resolutions.items():
            if resolution.capture_id is None:
                raise RuntimeStateError(
                    "pending capture start resolution lost its recorder identity"
                )
            self.require_pending_start_cleanup(
                pending_id,
                resolution.capture_id,
            )
            cleanup_records[resolution.capture_id] = resolution.capture_id

        for capture_id, live_capture_id in cleanup_records.items():
            self.assert_runtime_authority(capture_id)
            if live_capture_id is not None:
                self._remove_live_capture(client, live_capture_id)
            self.restore_service_mode(client, [capture_id])
            self.release_ports(client, [capture_id])

        self._recover_acquired_ports(client, matching_active_ids)
        if not missing_active_ids:
            return self.service_mode_payload()

        service_mode = self.restore_service_mode(client, missing_active_ids)
        self.release_ports(client, missing_active_ids)
        return service_mode

    def pending_start_resolution(
        self,
        pending_id: Any,
        captures: Any,
    ) -> PendingCaptureStartResolution:
        managed_id = next(
            (
                candidate
                for candidate in self.pending_baselines
                if _capture_id_key(candidate) == _capture_id_key(pending_id)
            ),
            None,
        )
        if managed_id is None:
            raise RuntimeStateError(
                f"capture pending-start authority {pending_id!r} does not exist"
            )
        self.assert_runtime_authority(managed_id)
        records = self.validated_capture_status_records(captures)
        self._assert_baseline_recorders(managed_id, records)
        records_by_id = self._records_by_id(records)
        baseline_ids = set(self.pending_baselines[managed_id])
        new_records = [
            record
            for capture_id, record in records_by_id.items()
            if int(capture_id) not in baseline_ids
        ]
        expected = self.identities.get(managed_id)
        if expected is None:
            raise CaptureIdentityError(
                f"capture lease {pending_id!r} has no persisted recorder identity"
            )
        matching_records = [
            record
            for record in new_records
            if self._record_identity(record) == expected
        ]
        new_capture_ids = tuple(
            sorted(int(record["id"]) for record in new_records)
        )
        if not new_records:
            return PendingCaptureStartResolution(
                capture_id=None,
                new_capture_ids=(),
            )
        if len(new_records) != 1 or len(matching_records) != 1:
            raise CaptureIdentityError(
                "capture start recovery cannot safely attribute a unique live "
                f"recorder; new ids are {list(new_capture_ids)}"
            )
        return PendingCaptureStartResolution(
            capture_id=int(matching_records[0]["id"]),
            new_capture_ids=new_capture_ids,
        )

    def restore_service_mode(self, client: Any, capture_ids: Iterable[Any]) -> dict[str, Any]:
        selected_ids = self._matching_capture_ids(capture_ids)
        for capture_id in selected_ids:
            self.assert_runtime_authority(capture_id)
        selected_id_keys = {_capture_id_key(capture_id) for capture_id in selected_ids}
        removed_states: dict[int, dict[str, Any]] = {}
        removed_ids: list[Any] = []
        for capture_id in selected_ids:
            states = self.service_states.get(capture_id)
            if states is None:
                continue
            removed_ids.append(capture_id)
            for port, state in states.items():
                removed_states.setdefault(port, state)

        remaining_auto_ports = {
            port
            for capture_id, states in self.service_states.items()
            if _capture_id_key(capture_id) not in selected_id_keys
            for port, state in states.items()
            if state.get("enabled") is False
        }
        restored_ports: list[int] = []
        for port, state in sorted(removed_states.items()):
            if state.get("enabled") is False and port not in remaining_auto_ports:
                self._restore_service_mode(client, port, state)
                restored_ports.append(port)

        candidate_states = self._copy_service_states()
        for capture_id in selected_ids:
            candidate_states.pop(capture_id, None)
        self._replace_runtime_state(
            candidate_states,
            self._copy_ports(self.ports),
            self._copy_ports(self.acquired_ports),
            self._copy_identities(),
            self._copy_authorities(),
            self._copy_pending_baselines(),
            self._copy_baseline_recorders(),
            self._copy_preparations(),
            set(self.cleanup_required_ids),
        )

        payload = self.service_mode_payload()
        payload["restored_ports"] = restored_ports
        payload["released_capture_ids"] = removed_ids
        return payload

    def release_ports(self, client: Any, capture_ids: Iterable[Any]) -> None:
        selected_ids = self._matching_capture_ids(capture_ids)
        for capture_id in selected_ids:
            self.assert_runtime_authority(capture_id)
        selected_id_keys = {_capture_id_key(capture_id) for capture_id in selected_ids}
        release_ports: list[int] = []
        transferred_ports: dict[Any, list[int]] = {}
        for capture_id in selected_ids:
            acquired_ports = self.acquired_ports.get(capture_id, [])
            for port in acquired_ports:
                owner = next(
                    (
                        remaining_id
                        for remaining_id, ports in self.ports.items()
                        if _capture_id_key(remaining_id) not in selected_id_keys and port in ports
                    ),
                    None,
                )
                if owner is None:
                    release_ports.append(port)
                    continue
                owner_ports = transferred_ports.setdefault(owner, [])
                if port not in owner_ports:
                    owner_ports.append(port)

        self._release_ports_for_operation(
            client,
            self._currently_acquired_ports(client, dedupe_ports(release_ports)),
        )

        candidate_ports = self._copy_ports(self.ports)
        candidate_acquired_ports = self._copy_ports(self.acquired_ports)
        candidate_identities = self._copy_identities()
        candidate_authorities = self._copy_authorities()
        candidate_pending_baselines = self._copy_pending_baselines()
        candidate_baseline_recorders = self._copy_baseline_recorders()
        candidate_preparations = self._copy_preparations()
        candidate_cleanup_required_ids = set(self.cleanup_required_ids)
        for capture_id in selected_ids:
            candidate_ports.pop(capture_id, None)
            candidate_acquired_ports.pop(capture_id, None)
        for owner, ports in transferred_ports.items():
            owner_ports = candidate_acquired_ports.setdefault(owner, [])
            for port in ports:
                if port not in owner_ports:
                    owner_ports.append(port)
        for capture_id in selected_ids:
            if (
                capture_id not in self.service_states
                and capture_id not in candidate_ports
                and capture_id not in candidate_acquired_ports
            ):
                candidate_identities.pop(capture_id, None)
                candidate_authorities.pop(capture_id, None)
                candidate_pending_baselines.pop(capture_id, None)
                candidate_baseline_recorders.pop(capture_id, None)
                candidate_preparations.pop(capture_id, None)
                candidate_cleanup_required_ids.discard(capture_id)
        self._replace_runtime_state(
            self._copy_service_states(),
            candidate_ports,
            candidate_acquired_ports,
            candidate_identities,
            candidate_authorities,
            candidate_pending_baselines,
            candidate_baseline_recorders,
            candidate_preparations,
            candidate_cleanup_required_ids,
        )

    def restore_prepared_service_mode(self, client: Any, service_mode: dict[str, Any]) -> None:
        states = service_mode.get("states")
        if not isinstance(states, dict):
            return
        enabled_ports = service_mode.get("enabled_ports")
        if not isinstance(enabled_ports, list):
            return
        for port in reversed(enabled_ports):
            state = states.get(port)
            if isinstance(port, int) and isinstance(state, dict):
                try:
                    self._restore_service_mode(client, port, state)
                except Exception:
                    pass

    def restore_prepared_service_mode_strict(self, client: Any, service_mode: dict[str, Any]) -> None:
        states = service_mode.get("states")
        enabled_ports = service_mode.get("enabled_ports")
        if not isinstance(states, dict) or not isinstance(enabled_ports, list):
            raise RuntimeError("prepared capture service-mode state is invalid")
        for port in reversed(enabled_ports):
            state = states.get(port)
            if not isinstance(port, int) or not isinstance(state, dict):
                raise RuntimeError("prepared capture service-mode state is invalid")
            self._restore_service_mode(client, port, state)

    def release_prepared_ports(self, client: Any, ports: list[int]) -> None:
        self._release_ports_for_operation(
            client,
            self._currently_acquired_ports(client, dedupe_ports(ports)),
        )

    def public_service_mode(self, service_mode: dict[str, Any] | None) -> dict[str, Any]:
        if service_mode is None:
            return self.service_mode_payload()
        payload: dict[str, Any] = {}
        for key in (
            "enabled_ports",
            "already_enabled_ports",
            "restored_ports",
            "managed_capture_ids",
            "released_capture_ids",
        ):
            value = service_mode.get(key)
            if value is not None:
                payload[key] = value
        payload.setdefault("enabled_ports", [])
        payload.setdefault("already_enabled_ports", [])
        payload.setdefault("restored_ports", [])
        payload.setdefault("managed_capture_ids", [])
        return payload

    def service_mode_payload(self) -> dict[str, Any]:
        auto_enabled_ports = sorted(
            {
                port
                for states in self.service_states.values()
                for port, state in states.items()
                if state.get("enabled") is False
            }
        )
        already_enabled_ports = sorted(
            {
                port
                for states in self.service_states.values()
                for port, state in states.items()
                if state.get("enabled") is True
            }
        )
        return {
            "enabled_ports": auto_enabled_ports,
            "already_enabled_ports": already_enabled_ports,
            "restored_ports": [],
            "managed_capture_ids": self.managed_capture_ids(),
        }

    def assert_capture_identity(self, capture_id: Any, record: dict[str, Any]) -> None:
        managed_id = next(
            (
                candidate
                for candidate in self.managed_capture_ids()
                if _capture_id_key(candidate) == _capture_id_key(capture_id)
            ),
            None,
        )
        if managed_id is None:
            return
        self.assert_runtime_authority(managed_id)
        expected = self.identities.get(managed_id)
        if expected is None:
            raise CaptureIdentityError(
                f"capture lease {capture_id!r} has no persisted recorder identity"
            )
        observed = self._record_identity(record)
        if observed != expected:
            raise CaptureIdentityError(
                f"capture lease {capture_id!r} does not match the live recorder identity"
            )

    def current_authority(self) -> RuntimeAuthorityIdentity:
        return self._runtime_authority()

    def assert_all_runtime_authorities(self) -> None:
        for capture_id in self.managed_capture_ids():
            self.assert_runtime_authority(capture_id)

    def assert_runtime_authority(self, capture_id: Any) -> None:
        managed_id = next(
            (
                candidate
                for candidate in self.managed_capture_ids()
                if _capture_id_key(candidate) == _capture_id_key(capture_id)
            ),
            None,
        )
        if managed_id is None:
            return
        expected = self.authorities.get(managed_id)
        if expected is None:
            raise CaptureIdentityError(
                f"capture lease {capture_id!r} has no persisted runtime authority"
            )
        observed = self._runtime_authority()
        if observed != expected:
            raise CaptureIdentityError(
                f"capture lease {capture_id!r} belongs to a different TRex target "
                "or daemon generation"
            )

    def _original_service_state(self, port: int, fallback: dict[str, Any]) -> dict[str, Any]:
        for states in self.service_states.values():
            state = states.get(port)
            if state is not None and state.get("enabled") is False:
                return state
        return fallback

    def _required_preparation(
        self,
        pending_id: Any,
        expected_stage: str | None = None,
    ) -> CapturePreparation:
        preparation = self.preparations.get(pending_id)
        if preparation is None:
            raise RuntimeStateError(
                f"capture preparation {pending_id!r} does not exist"
            )
        if expected_stage is not None and preparation.stage != expected_stage:
            raise RuntimeStateError(
                f"capture preparation {pending_id!r} is at "
                f"{preparation.stage!r}, expected {expected_stage!r}"
            )
        return preparation

    def _set_preparation_stage(
        self,
        pending_id: Any,
        stage: str,
    ) -> None:
        self.assert_runtime_authority(pending_id)
        preparation = self._required_preparation(pending_id)
        allowed_transitions = {
            "wal": {"acquire_intent"},
            "acquire_intent": {"acquired"},
            "acquired": {"service_intent", "service_restored"},
            "service_intent": {"service_enabled", "restore_intent"},
            "service_enabled": {"restore_intent"},
            "restore_intent": {"service_restored"},
            "service_restored": {"release_intent"},
            "release_intent": {"ports_released"},
        }
        if stage not in allowed_transitions.get(preparation.stage, set()):
            raise RuntimeStateError(
                f"capture preparation {pending_id!r} cannot transition from "
                f"{preparation.stage!r} to {stage!r}"
            )
        candidate_preparations = self._copy_preparations()
        candidate_preparations[pending_id] = CapturePreparation(
            stage=stage,
            pre_acquired_ports=preparation.pre_acquired_ports,
            acquire_planned_ports=preparation.acquire_planned_ports,
            service_enable_planned_ports=preparation.service_enable_planned_ports,
            pre_service_states={
                port: dict(state)
                for port, state in preparation.pre_service_states.items()
            },
        )
        candidate_acquired_ports = self._copy_ports(self.acquired_ports)
        if stage == "acquired":
            candidate_acquired_ports[pending_id] = list(
                preparation.acquire_planned_ports
            )
        self._replace_runtime_state(
            self._copy_service_states(),
            self._copy_ports(self.ports),
            candidate_acquired_ports,
            self._copy_identities(),
            self._copy_authorities(),
            self._copy_pending_baselines(),
            self._copy_baseline_recorders(),
            candidate_preparations,
            set(self.cleanup_required_ids),
        )

    def _confirm_capture_acquired(
        self,
        client: Any,
        pending_id: Any,
    ) -> None:
        preparation = self._required_preparation(
            pending_id,
            "acquire_intent",
        )
        self.assert_runtime_authority(pending_id)
        expected_ports = set(preparation.pre_acquired_ports).union(
            preparation.acquire_planned_ports
        )
        if self._target_acquired_ports(client, pending_id) != expected_ports:
            raise CaptureIdentityError(
                "capture acquisition could not be confirmed exactly; "
                f"ledger {pending_id!r} retained"
            )
        self._set_preparation_stage(pending_id, "acquired")

    def _target_acquired_ports(
        self,
        client: Any,
        pending_id: Any,
    ) -> set[int]:
        return set(self.ports.get(pending_id, [])).intersection(
            self._strict_acquired_ports(client)
        )

    def _claim_planned_ports_for_recovery(
        self,
        client: Any,
        pending_id: Any,
    ) -> set[int]:
        """Acquire the operation-owned plan in the current STL session.

        STLClient.get_acquired_ports() is only the current client's local
        handler, not a server ownership query.  Therefore an empty snapshot
        after process restart cannot prove that the previous acquire RPC did
        not take effect.  A non-force acquire is the safe server-side probe:
        it either gives this recovery session ownership, or fails closed while
        the previous/another session still owns a target port.
        """

        preparation = self._required_preparation(pending_id)
        planned_ports = set(preparation.acquire_planned_ports)
        if not planned_ports:
            return self._strict_acquired_ports(client)

        locally_acquired = self._strict_acquired_ports(client)
        missing_ports = sorted(planned_ports.difference(locally_acquired))
        if missing_ports:
            acquire = getattr(client, "acquire", None)
            if not callable(acquire):
                raise CaptureIdentityError(
                    "TRex client cannot probe server ownership for capture "
                    f"recovery; ledger {pending_id!r} retained"
                )
            self.assert_runtime_authority(pending_id)
            try:
                acquire(
                    ports=missing_ports,
                    force=False,
                    sync_streams=True,
                )
            except Exception as exc:
                raise CaptureIdentityError(
                    "capture recovery could not acquire its planned ports "
                    "without force; a previous or concurrent STL session may "
                    f"still own them and ledger {pending_id!r} was retained"
                ) from exc
            locally_acquired = self._strict_acquired_ports(client)

        if not planned_ports.issubset(locally_acquired):
            raise CaptureIdentityError(
                "capture recovery could not confirm current-session ownership "
                f"of its planned ports; ledger {pending_id!r} retained"
            )
        return locally_acquired

    @staticmethod
    def _validated_service_state(
        port: int,
        state: Any,
    ) -> dict[str, Any]:
        if not isinstance(state, dict) or not isinstance(
            state.get("enabled"),
            bool,
        ):
            raise RuntimeStateError(
                f"capture port {port} has an invalid service-mode state"
            )
        filtered = state.get("filtered", False)
        mask = state.get("mask")
        if not isinstance(filtered, bool):
            raise RuntimeStateError(
                f"capture port {port} has an invalid filtered service-mode state"
            )
        if isinstance(mask, bool) or (
            mask is not None
            and not isinstance(mask, int)
        ):
            raise RuntimeStateError(
                f"capture port {port} has an invalid service-mode mask"
            )
        return {
            "enabled": state["enabled"],
            "filtered": filtered,
            "mask": mask,
        }

    def _snapshot_service_states(
        self,
        client: Any,
        ports: Iterable[int],
    ) -> dict[int, dict[str, Any]]:
        return {
            port: self._validated_service_state(
                port,
                self._service_state(client, port),
            )
            for port in ports
        }

    def _snapshot_recovery_service_states(
        self,
        client: Any,
        ports: Iterable[int],
    ) -> dict[int, dict[str, Any]]:
        return {
            port: self._strict_synchronized_service_state(client, port)
            for port in ports
        }

    def _strict_synchronized_service_state(
        self,
        client: Any,
        port: int,
    ) -> dict[str, Any]:
        ports = getattr(client, "ports", None)
        try:
            port_object = (
                ports.get(port)
                if isinstance(ports, dict)
                else ports[port]
            )
        except Exception as exc:
            raise RuntimeStateError(
                f"capture recovery cannot resolve TRex port {port}"
            ) from exc
        if port_object is None:
            raise RuntimeStateError(
                f"capture recovery cannot resolve TRex port {port}"
            )

        sync = getattr(port_object, "sync", None)
        if not callable(sync):
            raise RuntimeStateError(
                f"capture recovery cannot synchronize TRex port {port}"
            )
        sync_result = sync()
        bad = getattr(sync_result, "bad", None)
        sync_failed = (
            sync_result is None
            or (
                bool(bad())
                if callable(bad)
                else not bool(sync_result)
            )
        )
        if sync_failed:
            error = ""
            err = getattr(sync_result, "err", None)
            if callable(err):
                try:
                    error = str(err()).strip()
                except Exception:
                    error = ""
            suffix = f": {error}" if error else ""
            raise RuntimeStateError(
                f"capture recovery failed to synchronize TRex port {port}{suffix}"
            )

        # Read the fields populated by Port.sync_shared directly.  Calling
        # is_service_mode_on() here would perform another lazy sync for an
        # unowned port and the SDK getter deliberately ignores that RC.
        enabled = getattr(port_object, "service_mode", None)
        filtered = getattr(port_object, "service_mode_filtered", None)
        mask = getattr(port_object, "service_mask", None)
        return self._validated_service_state(
            port,
            {
                "enabled": enabled,
                "filtered": filtered,
                "mask": mask,
            },
        )

    @staticmethod
    def _strict_acquired_ports(client: Any) -> set[int]:
        get_acquired_ports = getattr(client, "get_acquired_ports", None)
        if not callable(get_acquired_ports):
            raise RuntimeStateError(
                "TRex client cannot prove its exact acquired-port snapshot"
            )
        acquired = get_acquired_ports()
        if not isinstance(acquired, (list, tuple, set)):
            raise RuntimeStateError(
                "TRex client returned an invalid acquired-port snapshot"
            )
        normalized: set[int] = set()
        for port in acquired:
            if isinstance(port, bool) or not isinstance(port, int) or port < 0:
                raise RuntimeStateError(
                    "TRex client returned an invalid acquired-port snapshot"
                )
            normalized.add(port)
        if len(normalized) != len(acquired):
            raise RuntimeStateError(
                "TRex client returned duplicate acquired ports"
            )
        return normalized

    @classmethod
    def _baseline_recorder(
        cls,
        record: dict[str, Any],
    ) -> CaptureRecorderIdentityState:
        capture_id = cls._validated_live_capture_id(record.get("id"))
        identity = cls._record_identity(record)
        if identity is None:
            raise CaptureIdentityError(
                f"baseline capture {capture_id!r} has no exact recorder identity"
            )
        return CaptureRecorderIdentityState(
            capture_id=capture_id,
            tx_ports=list(identity.tx_ports),
            rx_ports=list(identity.rx_ports),
            bpf_filter=identity.bpf_filter,
        )

    def _assert_baseline_recorders(
        self,
        pending_id: Any,
        records: list[dict[str, Any]],
        *,
        allow_new_recorders: bool = True,
    ) -> None:
        expected_recorders = self.baseline_recorders.get(pending_id)
        if expected_recorders is None:
            raise CaptureIdentityError(
                f"capture start ledger {pending_id!r} has no baseline identities"
            )
        records_by_id = self._records_by_id(records)
        expected_ids = {
            str(recorder.capture_id)
            for recorder in expected_recorders
        }
        if (
            not allow_new_recorders
            and set(records_by_id) != expected_ids
        ):
            raise CaptureIdentityError(
                "capture preparation recorder baseline changed concurrently; "
                f"ledger {pending_id!r} retained"
            )
        for expected in expected_recorders:
            record = records_by_id.get(str(expected.capture_id))
            if record is None:
                raise CaptureIdentityError(
                    "capture start baseline changed concurrently; "
                    f"recorder {expected.capture_id!r} disappeared and ledger "
                    f"{pending_id!r} was retained"
                )
            observed = self._record_identity(record)
            expected_identity = CaptureIdentity.create(
                expected.tx_ports,
                expected.rx_ports,
                expected.bpf_filter,
            )
            if observed != expected_identity:
                raise CaptureIdentityError(
                    "capture start baseline recorder identity changed concurrently; "
                    f"ledger {pending_id!r} retained"
                )

    def _expected_enabled_service_states(
        self,
        pending_id: Any,
    ) -> dict[int, dict[str, Any]]:
        preparation = self._required_preparation(pending_id)
        planned = set(preparation.service_enable_planned_ports)
        return {
            port: (
                {
                    "enabled": True,
                    "filtered": False,
                    "mask": None,
                }
                if port in planned
                else dict(state)
            )
            for port, state in preparation.pre_service_states.items()
        }

    def _service_intent_states_are_attributable(
        self,
        pending_id: Any,
        current_states: dict[int, dict[str, Any]],
    ) -> bool:
        preparation = self._required_preparation(
            pending_id,
            "service_intent",
        )
        pre_states = preparation.pre_service_states
        expected_enabled = self._expected_enabled_service_states(
            pending_id
        )
        planned_ports = list(preparation.service_enable_planned_ports)
        planned_set = set(planned_ports)
        if any(
            current_states.get(port) != pre_state
            for port, pre_state in pre_states.items()
            if port not in planned_set
        ):
            return False

        enabled_prefix_ended = False
        observed_enabled = False
        for port in planned_ports:
            observed = current_states.get(port)
            if observed == expected_enabled[port]:
                if enabled_prefix_ended:
                    return False
                observed_enabled = True
                continue
            if observed == pre_states[port]:
                enabled_prefix_ended = True
                continue
            return False
        return observed_enabled

    def _recover_capture_preparation(
        self,
        client: Any,
        pending_id: Any,
        records: list[dict[str, Any]],
    ) -> None:
        self.assert_runtime_authority(pending_id)
        self._assert_baseline_recorders(
            pending_id,
            records,
            allow_new_recorders=False,
        )
        preparation = self._required_preparation(pending_id)

        if preparation.stage == "wal":
            # WAL is durable before any hardware call.  A restarted STLClient
            # has a fresh local acquisition handler, so its empty snapshot
            # cannot be compared with the previous session's pre-state.
            self._forget_capture_ids_without_hardware([pending_id])
            return

        if preparation.stage == "acquire_intent":
            if not preparation.acquire_planned_ports:
                self._forget_capture_ids_without_hardware([pending_id])
                return
            self._claim_planned_ports_for_recovery(client, pending_id)
            self._set_preparation_stage(pending_id, "acquired")
            preparation = self._required_preparation(
                pending_id,
                "acquired",
            )

        if preparation.stage == "ports_released":
            # This stage is persisted only after release was confirmed by the
            # session that performed it.  Do not interpret a new client's
            # empty local handler as additional server evidence.
            self._forget_capture_ids_without_hardware([pending_id])
            return

        if preparation.stage == "release_intent":
            locally_acquired = self._claim_planned_ports_for_recovery(
                client,
                pending_id,
            )
            remaining_planned = set(
                preparation.acquire_planned_ports
            ).intersection(locally_acquired)
            self.assert_runtime_authority(pending_id)
            self._release_ports_for_operation(
                client,
                sorted(remaining_planned),
            )
            if set(preparation.acquire_planned_ports).intersection(
                self._strict_acquired_ports(client)
            ):
                raise CaptureIdentityError(
                    "capture recovery could not confirm its port release; "
                    f"ledger {pending_id!r} retained"
                )
            self._set_preparation_stage(pending_id, "ports_released")
            self._forget_capture_ids_without_hardware([pending_id])
            return

        locally_acquired = self._claim_planned_ports_for_recovery(
            client,
            pending_id,
        )

        current_states = self._snapshot_recovery_service_states(
            client,
            self.ports[pending_id],
        )
        pre_service_states = preparation.pre_service_states
        if preparation.stage == "acquired":
            if current_states != pre_service_states:
                raise CaptureIdentityError(
                    "capture service-mode outcome is ambiguous after restart; "
                    f"ledger {pending_id!r} retained without restoring or releasing"
                )
            self._set_preparation_stage(pending_id, "service_restored")
            preparation = self._required_preparation(
                pending_id,
                "service_restored",
            )

        if preparation.stage == "service_intent":
            if current_states == pre_service_states:
                self._set_preparation_stage(pending_id, "service_restored")
                preparation = self._required_preparation(
                    pending_id,
                    "service_restored",
                )
            elif self._service_intent_states_are_attributable(
                pending_id,
                current_states,
            ):
                self._set_preparation_stage(pending_id, "restore_intent")
                preparation = self._required_preparation(
                    pending_id,
                    "restore_intent",
                )
            else:
                raise CaptureIdentityError(
                    "capture service-mode outcome is ambiguous after restart; "
                    f"ledger {pending_id!r} retained without restoring or releasing"
                )

        if preparation.stage == "service_enabled":
            if current_states != self._expected_enabled_service_states(
                pending_id
            ):
                raise CaptureIdentityError(
                    "confirmed capture service-mode state changed concurrently; "
                    f"ledger {pending_id!r} retained without restoring or releasing"
                )
            self._set_preparation_stage(pending_id, "restore_intent")
            preparation = self._required_preparation(
                pending_id,
                "restore_intent",
            )

        if preparation.stage == "restore_intent":
            expected_enabled = self._expected_enabled_service_states(
                pending_id
            )
            current_states = self._snapshot_recovery_service_states(
                client,
                self.ports[pending_id],
            )
            planned_ports = set(
                preparation.service_enable_planned_ports
            )
            for port, current_state in current_states.items():
                allowed_states = [pre_service_states[port]]
                if port in planned_ports:
                    allowed_states.append(expected_enabled[port])
                if current_state not in allowed_states:
                    raise CaptureIdentityError(
                        "capture recovery observed an ambiguous service-mode "
                        f"state on port {port}; ledger {pending_id!r} retained"
                    )
            for port in reversed(preparation.service_enable_planned_ports):
                if current_states[port] == pre_service_states[port]:
                    continue
                if port not in locally_acquired:
                    raise CaptureIdentityError(
                        "capture recovery cannot prove current-session ownership "
                        f"of service-mode port {port}; ledger {pending_id!r} "
                        "retained without restoring or releasing"
                    )
                self.assert_runtime_authority(pending_id)
                self._restore_service_mode(
                    client,
                    port,
                    self.service_states[pending_id][port],
                )
            if self._snapshot_recovery_service_states(
                client,
                self.ports[pending_id],
            ) != pre_service_states:
                raise CaptureIdentityError(
                    "capture recovery could not confirm service-mode restoration; "
                    f"ledger {pending_id!r} retained"
                )
            self._set_preparation_stage(pending_id, "service_restored")
            preparation = self._required_preparation(
                pending_id,
                "service_restored",
            )

        if preparation.stage == "service_restored":
            if self._snapshot_recovery_service_states(
                client,
                self.ports[pending_id],
            ) != pre_service_states:
                raise CaptureIdentityError(
                    "restored capture service-mode state changed concurrently; "
                    f"ledger {pending_id!r} retained"
                )
            self._set_preparation_stage(pending_id, "release_intent")
            preparation = self._required_preparation(
                pending_id,
                "release_intent",
            )

        if preparation.stage != "release_intent":
            raise RuntimeStateError(
                f"capture preparation {pending_id!r} has an unknown durable stage"
            )
        self.assert_runtime_authority(pending_id)
        self._release_ports_for_operation(
            client,
            list(preparation.acquire_planned_ports),
        )
        if set(preparation.acquire_planned_ports).intersection(
            self._strict_acquired_ports(client)
        ):
            raise CaptureIdentityError(
                "capture recovery could not confirm its port release; "
                f"ledger {pending_id!r} retained"
            )
        self._set_preparation_stage(pending_id, "ports_released")
        self._forget_capture_ids_without_hardware([pending_id])

    def _restore_persisted_leases(self) -> None:
        if self._state_store is None:
            return
        document = self._state_store.load()
        for lease in document.capture_leases:
            capture_id = lease.capture_id
            states = self._validated_service_states(capture_id, lease.service_states, lease.ports)
            self.service_states[capture_id] = states
            self.ports[capture_id] = list(lease.ports)
            self.acquired_ports[capture_id] = list(lease.acquired_ports)
            self.identities[capture_id] = CaptureIdentity.create(
                lease.tx_ports,
                lease.rx_ports,
                lease.bpf_filter,
            )
            self.authorities[capture_id] = lease.authority
            if lease.recovery_phase in {"preparing", "pending_start"}:
                self.pending_baselines[capture_id] = tuple(
                    lease.baseline_capture_ids
                )
                self.baseline_recorders[capture_id] = tuple(
                    recorder.model_copy(deep=True)
                    for recorder in lease.baseline_recorders
                )
            if lease.recovery_phase == "preparing":
                if lease.preparation_stage is None:
                    raise RuntimeStateError(
                        f"capture preparation {capture_id!r} has no durable stage"
                    )
                self.preparations[capture_id] = CapturePreparation(
                    stage=lease.preparation_stage,
                    pre_acquired_ports=tuple(lease.pre_acquired_ports),
                    acquire_planned_ports=tuple(lease.acquire_planned_ports),
                    service_enable_planned_ports=tuple(
                        lease.service_enable_planned_ports
                    ),
                    pre_service_states={
                        port: dict(state)
                        for port, state in lease.preparation_service_states.items()
                    },
                )
            elif lease.recovery_phase == "cleanup_required":
                self.cleanup_required_ids.add(capture_id)

    def _validated_service_states(
        self,
        capture_id: Any,
        states: dict[Any, Any],
        ports: list[int],
    ) -> dict[int, dict[str, Any]]:
        normalized: dict[int, dict[str, Any]] = {}
        for port, state in states.items():
            if not isinstance(port, int) or port < 0 or port not in ports:
                raise RuntimeStateError(
                    f"capture lease {capture_id!r} has service state outside its ports"
                )
            if not isinstance(state, dict) or not isinstance(state.get("enabled"), bool):
                raise RuntimeStateError(
                    f"capture lease {capture_id!r} has an invalid service-mode state"
                )
            normalized[port] = dict(state)
        return normalized

    def _replace_runtime_state(
        self,
        service_states: dict[Any, dict[int, dict[str, Any]]],
        ports: dict[Any, list[int]],
        acquired_ports: dict[Any, list[int]],
        identities: dict[Any, CaptureIdentity],
        authorities: dict[Any, RuntimeAuthorityIdentity],
        pending_baselines: dict[Any, tuple[int, ...]],
        baseline_recorders: dict[
            Any,
            tuple[CaptureRecorderIdentityState, ...],
        ],
        preparations: dict[Any, CapturePreparation],
        cleanup_required_ids: set[Any],
    ) -> None:
        leases = self._capture_leases(
            service_states,
            ports,
            acquired_ports,
            identities,
            authorities,
            pending_baselines,
            baseline_recorders,
            preparations,
            cleanup_required_ids,
        )
        if self._state_store is not None:
            def replace_capture_leases(state: RuntimeStateDocument) -> RuntimeStateDocument:
                state.capture_leases = leases
                return state

            self._state_store.update(replace_capture_leases)
        self.service_states.clear()
        self.service_states.update(service_states)
        self.ports.clear()
        self.ports.update(ports)
        self.acquired_ports.clear()
        self.acquired_ports.update(acquired_ports)
        self.identities.clear()
        self.identities.update(identities)
        self.authorities.clear()
        self.authorities.update(authorities)
        self.pending_baselines.clear()
        self.pending_baselines.update(pending_baselines)
        self.baseline_recorders.clear()
        self.baseline_recorders.update(baseline_recorders)
        self.preparations.clear()
        self.preparations.update(preparations)
        self.cleanup_required_ids.clear()
        self.cleanup_required_ids.update(cleanup_required_ids)

    def _capture_leases(
        self,
        service_states: dict[Any, dict[int, dict[str, Any]]],
        ports: dict[Any, list[int]],
        acquired_ports: dict[Any, list[int]],
        identities: dict[Any, CaptureIdentity],
        authorities: dict[Any, RuntimeAuthorityIdentity],
        pending_baselines: dict[Any, tuple[int, ...]],
        baseline_recorders: dict[
            Any,
            tuple[CaptureRecorderIdentityState, ...],
        ],
        preparations: dict[Any, CapturePreparation],
        cleanup_required_ids: set[Any],
    ) -> list[CaptureLeaseState]:
        capture_ids = list(
            dict.fromkeys(
                [
                    *service_states,
                    *ports,
                    *acquired_ports,
                    *identities,
                    *authorities,
                    *pending_baselines,
                    *baseline_recorders,
                    *preparations,
                    *cleanup_required_ids,
                ]
            )
        )
        leases: list[CaptureLeaseState] = []
        for capture_id in capture_ids:
            identity = identities.get(capture_id)
            if identity is None:
                raise RuntimeStateError(
                    f"capture lease {capture_id!r} has no recorder identity"
                )
            authority = authorities.get(capture_id)
            if authority is None:
                raise RuntimeStateError(
                    f"capture lease {capture_id!r} has no runtime authority"
                )
            leases.append(
                CaptureLeaseState(
                    capture_id=capture_id,
                    recovery_phase=(
                        "preparing"
                        if capture_id in preparations
                        else (
                            "pending_start"
                            if capture_id in pending_baselines
                            else (
                                "cleanup_required"
                                if capture_id in cleanup_required_ids
                                else "active"
                            )
                        )
                    ),
                    preparation_stage=(
                        preparations[capture_id].stage
                        if capture_id in preparations
                        else None
                    ),
                    baseline_capture_ids=list(
                        pending_baselines.get(capture_id, ())
                    ),
                    baseline_recorders=[
                        recorder.model_copy(deep=True)
                        for recorder in baseline_recorders.get(capture_id, ())
                    ],
                    pre_acquired_ports=list(
                        preparations[capture_id].pre_acquired_ports
                        if capture_id in preparations
                        else ()
                    ),
                    acquire_planned_ports=list(
                        preparations[capture_id].acquire_planned_ports
                        if capture_id in preparations
                        else ()
                    ),
                    service_enable_planned_ports=list(
                        preparations[capture_id].service_enable_planned_ports
                        if capture_id in preparations
                        else ()
                    ),
                    preparation_service_states=(
                        {
                            port: dict(state)
                            for port, state in preparations[
                                capture_id
                            ].pre_service_states.items()
                        }
                        if capture_id in preparations
                        else {}
                    ),
                    authority=authority,
                    service_states=service_states.get(capture_id, {}),
                    tx_ports=list(identity.tx_ports),
                    rx_ports=list(identity.rx_ports),
                    bpf_filter=identity.bpf_filter,
                    ports=ports.get(capture_id, []),
                    acquired_ports=acquired_ports.get(capture_id, []),
                )
            )
        return leases

    def _matching_capture_ids(self, capture_ids: Iterable[Any]) -> list[Any]:
        requested = {_capture_id_key(capture_id) for capture_id in capture_ids}
        return [
            capture_id
            for capture_id in self.managed_capture_ids()
            if _capture_id_key(capture_id) in requested
        ]

    def _currently_acquired_ports(self, client: Any, ports: list[int]) -> list[int]:
        get_acquired_ports = getattr(client, "get_acquired_ports", None)
        if not callable(get_acquired_ports):
            return ports
        try:
            acquired = set(get_acquired_ports())
        except Exception:
            return ports
        return [port for port in ports if port in acquired]

    def _recover_acquired_ports(
        self,
        client: Any,
        capture_ids: Iterable[Any],
    ) -> None:
        capture_ids = list(capture_ids)
        for capture_id in capture_ids:
            self.assert_runtime_authority(capture_id)
        selected_id_keys = {
            _capture_id_key(capture_id)
            for capture_id in capture_ids
        }
        managed_acquired_ports = dedupe_ports(
            port
            for capture_id, ports in self.acquired_ports.items()
            if _capture_id_key(capture_id) in selected_id_keys
            for port in ports
        )
        if not managed_acquired_ports:
            return
        get_acquired_ports = getattr(client, "get_acquired_ports", None)
        acquire = getattr(client, "acquire", None)
        if not callable(get_acquired_ports) or not callable(acquire):
            return
        acquired = set(get_acquired_ports())
        missing_ports = [
            port
            for port in managed_acquired_ports
            if port not in acquired
        ]
        if missing_ports:
            acquire(ports=missing_ports, force=False, sync_streams=True)

    def _copy_service_states(self) -> dict[Any, dict[int, dict[str, Any]]]:
        return {
            capture_id: {
                port: dict(state)
                for port, state in states.items()
            }
            for capture_id, states in self.service_states.items()
        }

    @staticmethod
    def _copy_ports(source: dict[Any, list[int]]) -> dict[Any, list[int]]:
        return {
            capture_id: list(ports)
            for capture_id, ports in source.items()
        }

    def _copy_identities(self) -> dict[Any, CaptureIdentity]:
        return dict(self.identities)

    def _copy_authorities(self) -> dict[Any, RuntimeAuthorityIdentity]:
        return {
            capture_id: authority.model_copy(deep=True)
            for capture_id, authority in self.authorities.items()
        }

    def _copy_pending_baselines(self) -> dict[Any, tuple[int, ...]]:
        return {
            capture_id: tuple(baseline)
            for capture_id, baseline in self.pending_baselines.items()
        }

    def _copy_baseline_recorders(
        self,
    ) -> dict[Any, tuple[CaptureRecorderIdentityState, ...]]:
        return {
            capture_id: tuple(
                recorder.model_copy(deep=True)
                for recorder in recorders
            )
            for capture_id, recorders in self.baseline_recorders.items()
        }

    def _copy_preparations(self) -> dict[Any, CapturePreparation]:
        return {
            capture_id: CapturePreparation(
                stage=preparation.stage,
                pre_acquired_ports=preparation.pre_acquired_ports,
                acquire_planned_ports=preparation.acquire_planned_ports,
                service_enable_planned_ports=preparation.service_enable_planned_ports,
                pre_service_states={
                    port: dict(state)
                    for port, state in preparation.pre_service_states.items()
                },
            )
            for capture_id, preparation in self.preparations.items()
        }

    @staticmethod
    def _move_capture_key(
        source: dict[Any, Any],
        previous_id: Any,
        capture_id: Any,
    ) -> dict[Any, Any]:
        if previous_id not in source:
            raise RuntimeStateError(
                f"capture lease {previous_id!r} is incomplete"
            )
        value = source.pop(previous_id)
        source[capture_id] = value
        return source

    def _validated_current_authority(
        self,
        authority: RuntimeAuthorityIdentity | None,
    ) -> RuntimeAuthorityIdentity:
        observed = self._runtime_authority()
        if authority is not None and authority != observed:
            raise CaptureIdentityError(
                "TRex target or daemon generation changed during capture start"
            )
        return observed

    @staticmethod
    def validated_capture_status_records(captures: Any) -> list[dict[str, Any]]:
        if isinstance(captures, dict):
            entries: Iterable[tuple[Any, Any]] = captures.items()
            records: list[dict[str, Any]] = []
            for keyed_id, capture in entries:
                if not isinstance(capture, dict):
                    raise CaptureIdentityError(
                        "TRex capture status contains a non-object recorder"
                    )
                record = dict(capture)
                raw_id = record.get("id", keyed_id)
                capture_id = CaptureRuntime._validated_live_capture_id(raw_id)
                keyed_capture_id = CaptureRuntime._validated_live_capture_id(
                    keyed_id
                )
                if capture_id != keyed_capture_id:
                    raise CaptureIdentityError(
                        "TRex capture status key does not match its recorder id"
                    )
                record["id"] = capture_id
                records.append(record)
        elif isinstance(captures, list):
            records = []
            for capture in captures:
                if not isinstance(capture, dict) or "id" not in capture:
                    raise CaptureIdentityError(
                        "TRex capture status list contains a recorder without an id"
                    )
                record = dict(capture)
                record["id"] = CaptureRuntime._validated_live_capture_id(
                    record["id"]
                )
                records.append(record)
        else:
            raise CaptureIdentityError(
                "TRex capture status response must be an object or list"
            )
        CaptureRuntime._records_by_id(records)
        return sorted(records, key=lambda record: int(record["id"]))

    @staticmethod
    def _validated_live_capture_id(capture_id: Any) -> int:
        if isinstance(capture_id, bool):
            raise CaptureIdentityError(
                "TRex capture status contains an invalid recorder id"
            )
        if isinstance(capture_id, int) and capture_id >= 0:
            return capture_id
        if (
            isinstance(capture_id, str)
            and capture_id.isdigit()
            and str(int(capture_id)) == capture_id
        ):
            return int(capture_id)
        raise CaptureIdentityError(
            "TRex capture status contains an invalid recorder id"
        )

    @staticmethod
    def _records_by_id(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        indexed: dict[str, dict[str, Any]] = {}
        for record in records:
            capture_id = CaptureRuntime._validated_live_capture_id(
                record.get("id")
            )
            capture_id_key = _capture_id_key(capture_id)
            if capture_id_key in indexed:
                raise CaptureIdentityError(
                    f"TRex returned duplicate capture id {capture_id_key!r}"
                )
            indexed[capture_id_key] = record
        return indexed

    @staticmethod
    def _is_systemd_generation_rollover(
        expected: RuntimeAuthorityIdentity,
        observed: RuntimeAuthorityIdentity,
    ) -> bool:
        return (
            expected.daemon_supervisor == "systemd"
            and observed.daemon_supervisor == "systemd"
            and expected.host == observed.host
            and expected.sync_port == observed.sync_port
            and expected.async_port == observed.async_port
            and expected.scapy_port == observed.scapy_port
            and expected.generation != observed.generation
        )

    def _forget_capture_ids_without_hardware(
        self,
        capture_ids: Iterable[Any],
    ) -> None:
        capture_id_keys = {
            _capture_id_key(capture_id)
            for capture_id in capture_ids
        }
        self._replace_runtime_state(
            {
                capture_id: states
                for capture_id, states in self._copy_service_states().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: ports
                for capture_id, ports in self._copy_ports(self.ports).items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: ports
                for capture_id, ports in self._copy_ports(
                    self.acquired_ports
                ).items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: identity
                for capture_id, identity in self._copy_identities().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: authority
                for capture_id, authority in self._copy_authorities().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: baseline
                for capture_id, baseline in self._copy_pending_baselines().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: recorders
                for capture_id, recorders in self._copy_baseline_recorders().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id: preparation
                for capture_id, preparation in self._copy_preparations().items()
                if _capture_id_key(capture_id) not in capture_id_keys
            },
            {
                capture_id
                for capture_id in self.cleanup_required_ids
                if _capture_id_key(capture_id) not in capture_id_keys
            },
        )
        self.stale_generation_capture_ids.update(capture_id_keys)

    @staticmethod
    def _remove_live_capture(client: Any, capture_id: int) -> None:
        remove_capture = getattr(client, "remove_capture", None)
        if callable(remove_capture):
            remove_capture(capture_id)
            return
        transmit = getattr(client, "_transmit", None)
        if not callable(transmit):
            raise RuntimeError("TRex client does not expose capture removal")
        response = transmit(
            "capture",
            params={"command": "remove", "capture_id": capture_id},
        )
        if not response:
            raise RuntimeError(str(response))

    @staticmethod
    def _record_identity(record: dict[str, Any]) -> CaptureIdentity | None:
        capture_filter = record.get("filter")
        if (
            not isinstance(capture_filter, dict)
            or "tx" not in capture_filter
            or "rx" not in capture_filter
        ):
            return None
        bpf_filter = capture_filter.get("bpf", "")
        if bpf_filter is None:
            bpf_filter = ""
        if not isinstance(bpf_filter, str):
            return None
        return CaptureIdentity.create(
            capture_record_ports(record, "tx"),
            capture_record_ports(record, "rx"),
            bpf_filter.strip(),
        )
