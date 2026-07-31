from __future__ import annotations

from typing import Any, Callable

from app.trex.port_operations import (
    _acquire_ports_for_operation,
    _command_result,
    _normalize_port_list,
    _operation_ports,
    _release_ports_for_operation_strict,
)
from app.trex.profile_runtime import (
    is_profile_no_streams_exception,
    is_profile_not_runnable_exception,
    profile_no_streams_error,
)
from app.trex.result import TrexCallResult
from app.trex.workbench_values import PROFILE_NOT_TRAFFIC_PROFILE_ERROR

WithClient = Callable[[Callable[[Any], dict[str, Any]]], TrexCallResult]
ProfileResolver = Callable[[str], TrexCallResult]
TrafficStartPreflight = Callable[[Any, list[int]], None]
TrafficStartStageHook = Callable[[str, Any], None]


def traffic_action(with_client: WithClient, action: str, ports: list[int] | None) -> TrexCallResult:
    if action not in {"stop", "pause", "resume"}:
        return TrexCallResult(False, blocker="unsupported_traffic_action", error=f"unsupported action: {action}")
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports

    def run_action(client: Any) -> dict[str, Any]:
        operation_ports = _operation_ports(client, normalized_ports)
        acquired_ports = _acquire_ports_for_operation(client, operation_ports)
        try:
            if action == "stop":
                command = client.stop(ports=normalized_ports)
            elif action == "pause":
                command = client.pause(ports=normalized_ports)
            else:
                command = client.resume(ports=normalized_ports)
            return {
                **_command_result(command),
                "action": action,
                "ports": operation_ports,
            }
        finally:
            _release_ports_for_operation_strict(client, acquired_ports)

    return with_client(run_action)


def update_traffic(
    with_client: WithClient,
    ports: list[int] | None,
    multiplier: str,
    force: bool,
    total: bool,
) -> TrexCallResult:
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports

    def run_update(client: Any) -> dict[str, Any]:
        operation_ports = _operation_ports(client, normalized_ports)
        acquired_ports = _acquire_ports_for_operation(client, operation_ports)
        try:
            update_result = client.update(
                ports=normalized_ports,
                mult=multiplier,
                force=force,
                total=total,
            )
        finally:
            _release_ports_for_operation_strict(client, acquired_ports)
        return {
            "accepted": True,
            "ports": operation_ports,
            "multiplier": multiplier,
            "force": force,
            "total": total,
            "update_result": str(update_result) if update_result is not None else None,
        }

    return with_client(run_update)


def start_profile(
    resolve_profile_path: ProfileResolver,
    with_client: WithClient,
    profile_path: str,
    ports: list[int] | None,
    multiplier: str,
    duration: float,
    force: bool,
    total: bool,
    synchronized: bool,
    clear_existing: bool,
    tunables: dict[str, Any],
    preflight: TrafficStartPreflight | None = None,
    stage_hook: TrafficStartStageHook | None = None,
) -> TrexCallResult:
    resolved = resolve_profile_path(profile_path)
    if not resolved.ok:
        return resolved
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports

    def start(client: Any) -> dict[str, Any]:
        operation_ports = _operation_ports(client, normalized_ports)
        if stage_hook is not None:
            stage_hook("acquire_intent", client)
        acquired_ports = _acquire_ports_for_operation(client, operation_ports)
        try:
            if stage_hook is not None:
                stage_hook("acquired", client)
            if preflight is not None:
                preflight(client, operation_ports)
            if clear_existing:
                if stage_hook is not None:
                    stage_hook("streams_remove_intent", client)
                client.remove_all_streams(ports=normalized_ports)
                if stage_hook is not None:
                    stage_hook("streams_removed", client)
            try:
                if stage_hook is not None:
                    stage_hook("profile_add_intent", client)
                stream_ids = client.add_profile(str(resolved.data), ports=normalized_ports, **tunables)
                if stage_hook is not None:
                    stage_hook("profile_added", client)
            except Exception as exc:
                if is_profile_no_streams_exception(exc):
                    raise ValueError(profile_no_streams_error(tunables)) from exc
                if is_profile_not_runnable_exception(exc):
                    raise ValueError(PROFILE_NOT_TRAFFIC_PROFILE_ERROR) from exc
                raise
            if stream_ids is None:
                raise ValueError(profile_no_streams_error(tunables))
            if stage_hook is not None:
                stage_hook("start_intent", client)
            start_result = client.start(
                ports=normalized_ports,
                mult=multiplier,
                duration=duration,
                force=force,
                total=total,
                synchronized=synchronized,
            )
            if stage_hook is not None:
                stage_hook("start_returned", client)
        finally:
            _release_ports_for_operation_strict(client, acquired_ports)
        return {
            "accepted": True,
            "profile_path": str(resolved.data),
            "ports": operation_ports,
            "multiplier": multiplier,
            "duration": duration,
            "force": force,
            "total": total,
            "synchronized": synchronized,
            "clear_existing": clear_existing,
            "tunables": tunables,
            "stream_ids": stream_ids,
            "start_result": str(start_result) if start_result is not None else None,
        }

    return with_client(start)
