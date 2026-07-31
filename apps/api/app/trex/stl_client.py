from __future__ import annotations

import threading
from typing import Any, Callable, Optional

from app.core.settings import TrexEnvironment
from app.trex.capture_files import (
    CaptureFileOpener,
    open_capture_file_with_command as _open_capture_file_with_command,
)
from app.trex.capture_runtime import CaptureIdentityError, CaptureRuntime
from app.trex.port_operations import (
    _enable_service_mode,
    _release_ports_for_operation_strict,
    _restore_service_mode_strict,
    _service_state,
)
from app.trex.port_configuration_operations import (
    configure_port_layer as _configure_port_layer,
    ping as _ping,
    resolve_arp as _resolve_arp,
    scan_ipv6_neighbors as _scan_ipv6_neighbors,
)
from app.trex.port_control_operations import (
    acquire as _acquire,
    release as _release,
    reset as _reset,
    set_port_attribute as _set_port_attribute,
    set_service_mode as _set_service_mode,
)
from app.trex.result import TrexCallResult
from app.trex.runtime_authority import RuntimeAuthorityProvider
from app.trex.runtime_mutation import (
    RuntimeConnectionTargetMismatch,
    assert_persisted_connection_target,
    runtime_hard_stop_priority_active,
    runtime_mutation_fence_active,
    runtime_mutation_fence,
)
from app.trex.runtime_state import RuntimeStateError, RuntimeStateStore
from app.trex.stl_connection import (
    add_trex_paths as _add_trex_paths,
    connect_client as _connect_client,
    default_client_class as _default_client_class,
    disconnect_client as _disconnect_client,
    run_with_client as _run_with_client,
)
from app.trex.stl_capture_facade import StlCaptureFacadeMixin
from app.trex.stl_profile_facade import StlProfileFacadeMixin
from app.trex.stl_run_report_facade import StlRunReportFacadeMixin
from app.trex.stl_stats_facade import StlStatsFacadeMixin
from app.trex.stl_traffic_facade import StlTrafficFacadeMixin
from app.trex.stl_workbench_facade import StlWorkbenchFacadeMixin
from app.trex.traffic_hard_stop import (
    TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS,
    parse_utc_timestamp,
    utc_now,
)


class RealStlClientService(
    StlProfileFacadeMixin,
    StlCaptureFacadeMixin,
    StlWorkbenchFacadeMixin,
    StlRunReportFacadeMixin,
    StlTrafficFacadeMixin,
    StlStatsFacadeMixin,
):
    def __init__(
        self,
        env: TrexEnvironment,
        capture_file_opener: Optional[CaptureFileOpener] = None,
        runtime_state_store: RuntimeStateStore | None = None,
        runtime_authority: RuntimeAuthorityProvider | None = None,
    ) -> None:
        self.env = env
        self.capture_file_opener = capture_file_opener or _open_capture_file_with_command
        self._client: Any | None = None
        self._client_lock = threading.RLock()
        state_store = (
            runtime_state_store
            if runtime_state_store is not None
            else RuntimeStateStore(env.runtime_state_path)
        )
        self._runtime_state_store = state_store
        self._runtime_authority = runtime_authority or RuntimeAuthorityProvider(env)
        self._capture_runtime = CaptureRuntime(
            _service_state,
            _enable_service_mode,
            _restore_service_mode_strict,
            _release_ports_for_operation_strict,
            state_store,
            self._runtime_authority.current,
        )
        self._capture_reconciled = not self._capture_runtime.managed_capture_ids()
        self._capture_service_states = self._capture_runtime.service_states
        self._capture_ports = self._capture_runtime.ports
        self._capture_acquired_ports = self._capture_runtime.acquired_ports
        self._capture_identities = self._capture_runtime.identities
        self._capture_authorities = self._capture_runtime.authorities
        self._port_attribute_overrides: dict[int, dict[str, Any]] = {}

    def _add_trex_paths(self) -> None:
        _add_trex_paths(self.env)

    def _client_class(self) -> TrexCallResult:
        return _default_client_class(self.env)

    def _connect_client_locked(self) -> TrexCallResult:
        result = _connect_client(self.env, self._client, self._client_class)
        if result.ok and self._client is None:
            self._client = result.data
        if result.ok and not self._capture_reconciled:
            try:
                self._capture_runtime.reconcile(result.data)
            except Exception as exc:
                return TrexCallResult(
                    False,
                    data={
                        "connected": True,
                        "client_cached": True,
                        "phase": (
                            "capture_identity"
                            if isinstance(exc, CaptureIdentityError)
                            else "capture_reconciliation"
                        ),
                        "remaining_capture_ids": self._capture_runtime.managed_capture_ids(),
                    },
                    blocker="trex_runtime_reconciliation_failed",
                    error=f"capture runtime reconciliation failed: {str(exc) or exc.__class__.__name__}",
                )
            self._capture_reconciled = True
        return result

    def close(self) -> TrexCallResult:
        return self.disconnect()

    def disconnect(self) -> TrexCallResult:
        if not runtime_hard_stop_priority_active():
            priority_failure = self._hard_stop_rpc_priority_failure()
            if priority_failure is not None:
                return priority_failure
        with runtime_mutation_fence():
            if not runtime_hard_stop_priority_active():
                priority_failure = self._hard_stop_rpc_priority_failure()
                if priority_failure is not None:
                    return priority_failure
            target_failure = self._runtime_connection_target_failure()
            if target_failure is not None:
                return target_failure
            return self._disconnect_current_target()

    def _disconnect_current_target(self) -> TrexCallResult:
        with self._client_lock:
            client = self._client
            if client is None:
                pending_capture_ids = self._capture_runtime.managed_capture_ids()
                if pending_capture_ids:
                    connect_result = self._connect_client_locked()
                    if not connect_result.ok:
                        phase = "client_connect"
                        if isinstance(connect_result.data, dict):
                            candidate_phase = connect_result.data.get("phase")
                            if isinstance(candidate_phase, str):
                                phase = candidate_phase
                        return self._disconnect_cleanup_failure(
                            phase,
                            RuntimeError(connect_result.error or connect_result.blocker or "TRex connect failed"),
                        )
                    client = self._client
                if client is None:
                    self._capture_reconciled = True
                    self._port_attribute_overrides.clear()
                    return TrexCallResult(
                        True,
                        data={
                            "disconnected": False,
                            "client_cached": False,
                        },
                    )

            if client is None:
                self._port_attribute_overrides.clear()
                return TrexCallResult(
                    True,
                    data={
                        "disconnected": False,
                        "client_cached": False,
                    },
                )

            cleanup_failure = self._cleanup_managed_captures(client)
            if cleanup_failure is not None:
                return cleanup_failure

            result = _disconnect_client(client)
            if not result.ok:
                return result

            self._client = None
            self._capture_reconciled = True
            self._port_attribute_overrides.clear()
            return result

    def _cleanup_managed_captures(self, client: Any) -> TrexCallResult | None:
        capture_ids = self._capture_runtime.managed_capture_ids()
        if not capture_ids:
            return None

        try:
            self._capture_runtime.reconcile(
                client,
                client.get_capture_status(),
            )
        except Exception as exc:
            return self._disconnect_cleanup_failure(
                (
                    "capture_identity"
                    if isinstance(exc, CaptureIdentityError)
                    else "capture_reconciliation"
                ),
                exc,
            )

        capture_ids = self._capture_runtime.managed_capture_ids()
        if not capture_ids:
            return None

        try:
            records = self._capture_runtime.validated_capture_status_records(
                client.get_capture_status()
            )
            records_by_id = self._capture_runtime._records_by_id(records)
        except Exception as exc:
            return self._disconnect_cleanup_failure("capture_status", exc)
        active_capture_ids: dict[str, Any] = {}
        for capture_id in capture_ids:
            capture_id_key = str(capture_id)
            record = records_by_id.get(capture_id_key)
            if record is None:
                continue
            try:
                self._capture_runtime.assert_capture_identity(capture_id, record)
            except Exception as exc:
                return self._disconnect_cleanup_failure(
                    "capture_identity",
                    exc,
                    capture_id,
                )
            active_capture_ids[capture_id_key] = record.get("id")

        for capture_id in capture_ids:
            capture_id_key = str(capture_id)
            if capture_id_key in active_capture_ids:
                try:
                    self._capture_runtime.assert_runtime_authority(capture_id)
                    self._remove_server_capture(client, active_capture_ids[capture_id_key])
                except Exception as exc:
                    return self._disconnect_cleanup_failure("capture_remove", exc, capture_id)
                active_capture_ids.pop(capture_id_key, None)

            try:
                self._capture_runtime.restore_service_mode(client, [capture_id])
            except Exception as exc:
                return self._disconnect_cleanup_failure("service_mode_restore", exc, capture_id)

            try:
                self._capture_runtime.release_ports(client, [capture_id])
            except Exception as exc:
                return self._disconnect_cleanup_failure("capture_port_release", exc, capture_id)

        return None

    def _remove_server_capture(self, client: Any, capture_id: Any) -> None:
        remove_capture = getattr(client, "remove_capture", None)
        if callable(remove_capture):
            remove_capture(capture_id)
            return

        transmit = getattr(client, "_transmit", None)
        if not callable(transmit):
            raise RuntimeError("TRex client does not expose capture removal")
        result = transmit("capture", params={"command": "remove", "capture_id": capture_id})
        if not result:
            raise RuntimeError(str(result))

    def _disconnect_cleanup_failure(
        self,
        phase: str,
        exc: Exception,
        capture_id: Any | None = None,
    ) -> TrexCallResult:
        data: dict[str, Any] = {
            "disconnected": False,
            "client_cached": self._client is not None,
            "phase": phase,
            "remaining_capture_ids": self._capture_runtime.managed_capture_ids(),
        }
        if capture_id is not None:
            data["capture_id"] = capture_id
        detail = str(exc) or exc.__class__.__name__
        return TrexCallResult(
            False,
            data=data,
            blocker="trex_disconnect_cleanup_failed",
            error=f"disconnect cleanup failed during {phase}: {detail}",
        )

    def _with_client(self, operation: Callable[[Any], Any]) -> TrexCallResult:
        nested_fence = runtime_mutation_fence_active()
        if not nested_fence:
            priority_failure = self._hard_stop_rpc_priority_failure()
            if priority_failure is not None:
                return priority_failure
        with runtime_mutation_fence():
            if not nested_fence:
                priority_failure = self._hard_stop_rpc_priority_failure()
                if priority_failure is not None:
                    return priority_failure
            target_failure = self._runtime_connection_target_failure()
            if target_failure is not None:
                return target_failure
            with self._client_lock:
                return _run_with_client(self._connect_client_locked, operation)

    def _hard_stop_rpc_priority_failure(self) -> TrexCallResult | None:
        try:
            document = self._runtime_state_store.load()
        except RuntimeStateError as exc:
            return TrexCallResult(
                False,
                blocker="trex_runtime_state_invalid",
                error=f"cannot enforce traffic hard-stop priority: {exc}",
            )
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
        if not deadlines:
            return None
        known_ports = {
            port
            for group in document.traffic_groups
            for port in group.ports
        }
        if document.traffic_session is not None:
            known_ports.update(
                port
                for group in document.traffic_session.groups
                for port in group.ports
            )
        if intent is not None:
            known_ports.update(intent.ports)
        # A generic service operation can synchronize each known port plus
        # inventory/acquisition state before returning. Reserve the sum of
        # those configured RPC timeouts so the hard-stop supervisor is never
        # admitted behind a live request whose worst case crosses the lease.
        rpc_count = max(1, len(known_ports)) + 2
        remaining_seconds = min(
            (parse_utc_timestamp(deadline) - utc_now()).total_seconds()
            for deadline in deadlines
        )
        required_seconds = (
            self.env.connect_timeout_seconds * rpc_count
            + TRAFFIC_HARD_STOP_RPC_MARGIN_SECONDS
        )
        if remaining_seconds > required_seconds:
            return None
        return TrexCallResult(
            False,
            blocker="traffic_hard_stop_priority",
            error=(
                "TRex read/control RPC is deferred because an active traffic "
                "hard-stop lease is within its reserved supervisor window"
            ),
            data={
                "rpc_count": rpc_count,
                "remaining_seconds": max(0.0, remaining_seconds),
                "required_seconds": required_seconds,
            },
        )

    def _runtime_connection_target_failure(self) -> TrexCallResult | None:
        try:
            assert_persisted_connection_target(self.env, self._runtime_state_store)
        except RuntimeConnectionTargetMismatch as exc:
            return TrexCallResult(
                False,
                blocker="trex_runtime_connection_changed",
                error=str(exc),
            )
        except (OSError, RuntimeError) as exc:
            return TrexCallResult(
                False,
                blocker="trex_runtime_state_invalid",
                error=f"cannot validate the persisted TRex connection target: {exc}",
            )
        return None

    def acquire(self, ports: Optional[list[int]], force: bool, sync_streams: bool) -> TrexCallResult:
        return _acquire(self._with_client, ports, force, sync_streams)

    def release(self, ports: Optional[list[int]]) -> TrexCallResult:
        return _release(self._with_client, self._port_attribute_overrides, ports)

    def reset(self, ports: Optional[list[int]], restart: bool) -> TrexCallResult:
        return _reset(self._with_client, self._port_attribute_overrides, ports, restart)

    def set_service_mode(
        self,
        ports: Optional[list[int]],
        enabled: bool,
        filtered: bool,
        mask: Optional[int],
    ) -> TrexCallResult:
        return _set_service_mode(self._with_client, ports, enabled, filtered, mask)

    def set_port_attribute(self, ports: Optional[list[int]], attribute: str, value: Any) -> TrexCallResult:
        return _set_port_attribute(self._with_client, self._port_attribute_overrides, ports, attribute, value)

    def configure_port_layer(
        self,
        port: int,
        mode: str,
        l2_destination: Optional[str],
        l3_source: Optional[str],
        l3_destination: Optional[str],
        vlan: Optional[list[int]],
    ) -> TrexCallResult:
        return _configure_port_layer(
            self._with_client,
            port,
            mode,
            l2_destination,
            l3_source,
            l3_destination,
            vlan,
        )

    def resolve_arp(
        self,
        ports: Optional[list[int]],
        retries: int,
        vlan: Optional[list[int]],
    ) -> TrexCallResult:
        return _resolve_arp(self._with_client, ports, retries, vlan)

    def scan_ipv6_neighbors(self, ports: Optional[list[int]], timeout_seconds: float) -> TrexCallResult:
        return _scan_ipv6_neighbors(self._with_client, ports, timeout_seconds)

    def ping(
        self,
        port: int,
        destination: str,
        pkt_size: int,
        count: int,
        interval_sec: float,
        vlan: Optional[list[int]],
    ) -> TrexCallResult:
        return _ping(self._with_client, port, destination, pkt_size, count, interval_sec, vlan)

RealStlClientProbe = RealStlClientService
