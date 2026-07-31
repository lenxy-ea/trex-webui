from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from app.trex.port_operations import (
    _ensure_port_exists,
    _normalize_port_id,
    _normalize_port_list,
    _port_info_with_runtime_state,
)
from app.trex.result import TrexCallResult


WithClient = Callable[[Callable[[Any], Any]], TrexCallResult]


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    server_version: Any = None
    system_info: Any = None
    blocker: str | None = None
    error: str | None = None


def probe(with_client: WithClient) -> ProbeResult:
    result = with_client(
        lambda client: {
            "server_version": client.get_server_version(),
            "system_info": client.get_server_system_info(),
        }
    )
    if not result.ok:
        return ProbeResult(False, blocker=result.blocker, error=result.error)
    return ProbeResult(
        True,
        server_version=result.data["server_version"],
        system_info=result.data["system_info"],
    )


def snapshot(
    with_client: WithClient,
    port_attribute_overrides: dict[int, dict[str, Any]],
) -> TrexCallResult:
    def collect(client: Any) -> dict[str, Any]:
        port_ids = client.get_all_ports()
        acquired = set(client.get_acquired_ports())
        port_info = client.get_port_info(port_ids)
        port_records = []
        for index, port_id in enumerate(port_ids):
            info = port_info[index] if index < len(port_info) else {}
            runtime_info = _port_info_with_runtime_state(client, port_id, info)
            runtime_info.update(port_attribute_overrides.get(port_id, {}))
            port_acquired = port_id in acquired
            port_records.append(
                {
                    "id": port_id,
                    "acquired": port_acquired,
                    "info": runtime_info,
                }
            )
        return {
            "server_version": client.get_server_version(),
            "system_info": client.get_server_system_info(),
            "port_ids": port_ids,
            "acquired_ports": sorted(acquired),
            "ports": port_records,
            "warnings": client.get_warnings(),
        }

    return with_client(collect)


def stats(with_client: WithClient, ports: Optional[list[int]] = None) -> TrexCallResult:
    def collect(client: Any) -> Any:
        requested_ports = ports if ports is not None else client.get_all_ports()
        return client.get_stats(ports=requested_ports, sync_now=True)

    return with_client(collect)


def clear_stats(
    with_client: WithClient,
    ports: Optional[list[int]],
    clear_global: bool,
    clear_flow_stats: bool,
    clear_latency_stats: bool,
    clear_xstats: bool,
) -> TrexCallResult:
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports

    def clear(client: Any) -> dict[str, Any]:
        result = client.clear_stats(
            ports=normalized_ports,
            clear_global=clear_global,
            clear_flow_stats=clear_flow_stats,
            clear_latency_stats=clear_latency_stats,
            clear_xstats=clear_xstats,
        )
        return {
            "accepted": True,
            "ports": normalized_ports,
            "clear_global": clear_global,
            "clear_flow_stats": clear_flow_stats,
            "clear_latency_stats": clear_latency_stats,
            "clear_xstats": clear_xstats,
            "result": str(result) if result is not None else None,
        }

    return with_client(clear)


def port_xstats(with_client: WithClient, port: int) -> TrexCallResult:
    normalized_port = _normalize_port_id(port)
    if isinstance(normalized_port, TrexCallResult):
        return normalized_port

    def collect(client: Any) -> dict[str, Any]:
        _ensure_port_exists(client, normalized_port)
        return {
            "port": normalized_port,
            "xstats": client.get_xstats(normalized_port),
        }

    return with_client(collect)
