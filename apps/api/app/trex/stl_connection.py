from __future__ import annotations

import sys
from typing import Any, Callable

from app.core.settings import TrexEnvironment
from app.trex.result import TrexCallResult
from app.trex.stl_endpoint import stl_endpoint_error, trex_interactive_path


ClientClassProvider = Callable[[], TrexCallResult]
ClientOperation = Callable[[Any], Any]
ClientConnector = Callable[[], TrexCallResult]


def add_trex_paths(env: TrexEnvironment) -> None:
    interactive = trex_interactive_path(env.scripts_dir)
    if str(interactive) not in sys.path:
        sys.path.insert(0, str(interactive))


def default_client_class(env: TrexEnvironment) -> TrexCallResult:
    add_trex_paths(env)
    try:
        from trex.stl.api import STLClient  # type: ignore
    except Exception as exc:
        return TrexCallResult(False, blocker="stl_client_import_failed", error=str(exc))
    return TrexCallResult(True, data=STLClient)


def connect_client(
    env: TrexEnvironment,
    cached_client: Any | None,
    client_class_provider: ClientClassProvider,
) -> TrexCallResult:
    endpoint_error = stl_endpoint_error(env)
    if endpoint_error is not None:
        return TrexCallResult(False, blocker="trex_environment_invalid", error=endpoint_error)

    if cached_client is not None:
        return TrexCallResult(True, data=cached_client)

    client_class_result = client_class_provider()
    if not client_class_result.ok:
        return client_class_result

    STLClient = client_class_result.data
    try:
        client = STLClient(
            username=env.client_name,
            server=env.host,
            sync_port=env.sync_port,
            async_port=env.async_port,
            sync_timeout=env.connect_timeout_seconds,
            async_timeout=env.connect_timeout_seconds,
            verbose_level="error",
        )
    except Exception as exc:
        return TrexCallResult(False, blocker="trex_connect_failed", error=str(exc))

    try:
        client.connect()
    except Exception as exc:
        cleanup_error = _disconnect_error(client)
        error = str(exc)
        if cleanup_error is not None:
            error = f"{error}; failed to dispose partially connected client: {cleanup_error}"
        return TrexCallResult(
            False,
            data={
                "connected": False,
                "partial_client_disposed": cleanup_error is None,
            },
            blocker="trex_connect_failed",
            error=error,
        )
    return TrexCallResult(True, data=client)


def disconnect_client(client: Any) -> TrexCallResult:
    error = _disconnect_error(client)
    if error is not None:
        return TrexCallResult(
            False,
            data={
                "disconnected": False,
                "client_cached": True,
                "phase": "sdk_disconnect",
            },
            blocker="trex_disconnect_failed",
            error=error,
        )
    return TrexCallResult(
        True,
        data={
            "disconnected": True,
            "client_cached": False,
        },
    )


def _disconnect_error(client: Any) -> str | None:
    try:
        client.disconnect(stop_traffic=False, release_ports=False)
    except Exception as exc:
        return str(exc)
    return None


def run_with_client(connect_client_locked: ClientConnector, operation: ClientOperation) -> TrexCallResult:
    client_result = connect_client_locked()
    if not client_result.ok:
        return client_result
    try:
        return TrexCallResult(True, data=operation(client_result.data))
    except Exception as exc:
        return TrexCallResult(False, blocker="trex_command_failed", error=str(exc))
