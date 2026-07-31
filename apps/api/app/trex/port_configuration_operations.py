from __future__ import annotations

from typing import Any, Callable

from app.trex.port_operations import (
    _acquire_ports_for_operation,
    _apply_local_ipv4_arp_fallback,
    _clean_optional_text,
    _enable_service_mode,
    _ensure_port_exists,
    _find_ipv6_host,
    _find_local_ipv4_destination_mac,
    _flatten_ipv6_hosts,
    _multicast_state,
    _normalize_ping_records,
    _normalize_port_id,
    _normalize_port_list,
    _normalize_vlan,
    _parse_ip,
    _port_object,
    _release_ports_for_operation,
    _restore_service_mode,
    _service_state,
    _single_port_info,
)
from app.trex.result import TrexCallResult

PORT_CONFIGURATION_ERROR = "port configuration request is invalid"

WithClient = Callable[[Callable[[Any], dict[str, Any]]], TrexCallResult]


def configure_port_layer(
    with_client: WithClient,
    port: int,
    mode: str,
    l2_destination: str | None,
    l3_source: str | None,
    l3_destination: str | None,
    vlan: list[int] | None,
) -> TrexCallResult:
    normalized_port = _normalize_port_id(port)
    if isinstance(normalized_port, TrexCallResult):
        return normalized_port
    normalized_vlan = _normalize_vlan(vlan)
    if isinstance(normalized_vlan, TrexCallResult):
        return normalized_vlan
    if mode not in {"L2", "L3"}:
        return TrexCallResult(False, blocker="port_configuration_invalid", error=PORT_CONFIGURATION_ERROR)

    l2_dst = _clean_optional_text(l2_destination)
    l3_src = _clean_optional_text(l3_source)
    l3_dst = _clean_optional_text(l3_destination)

    if mode == "L2" and not l2_dst:
        return TrexCallResult(False, blocker="port_configuration_invalid", error="destination MAC is required")
    if mode == "L3":
        source_ip = _parse_ip(l3_src)
        destination_ip = _parse_ip(l3_dst)
        if source_ip is None or destination_ip is None:
            return TrexCallResult(False, blocker="port_configuration_invalid", error="source and destination IP are required")
        if source_ip.version != destination_ip.version:
            return TrexCallResult(
                False,
                blocker="port_configuration_invalid",
                error="source and destination IP versions must match",
            )

    def configure(client: Any) -> dict[str, Any]:
        _ensure_port_exists(client, normalized_port)
        acquired_ports = _acquire_ports_for_operation(client, [normalized_port])
        try:
            service_state = _service_state(client, normalized_port)
            _enable_service_mode(client, normalized_port, service_state)
            try:
                if normalized_vlan is not None:
                    client.set_vlan(ports=[normalized_port], vlan=normalized_vlan)

                if mode == "L2":
                    client.set_l2_mode(port=normalized_port, dst_mac=l2_dst)
                    return {
                        "accepted": True,
                        "port": normalized_port,
                        "mode": "L2",
                        "l2_destination": l2_dst,
                        "vlan": normalized_vlan,
                        "port_info": _single_port_info(client, normalized_port),
                    }

                source_ip = _parse_ip(l3_src)
                destination_ip = _parse_ip(l3_dst)
                if source_ip is None or destination_ip is None:
                    raise ValueError("source and destination IP are required")

                if source_ip.version == 4:
                    arp_resolution = "arp"
                    try:
                        client.set_l3_mode(port=normalized_port, src_ipv4=l3_src, dst_ipv4=l3_dst)
                    except Exception:
                        fallback_mac = _find_local_ipv4_destination_mac(client, l3_dst)
                        port_object = _port_object(client, normalized_port)
                        if not fallback_mac or port_object is None:
                            raise
                        rc = port_object.set_l3_mode(l3_src, l3_dst, fallback_mac)
                        if not rc:
                            raise ValueError(str(rc))
                        arp_resolution = "local_port"
                    return {
                        "accepted": True,
                        "port": normalized_port,
                        "mode": "L3",
                        "l3_source": l3_src,
                        "l3_destination": l3_dst,
                        "ip_version": 4,
                        "arp_resolution": arp_resolution,
                        "vlan": normalized_vlan,
                        "port_info": _single_port_info(client, normalized_port),
                    }

                client.conf_ipv6(port=normalized_port, enabled=True, src_ipv6=l3_src)
                replies = client.scan6(ports=[normalized_port], timeout=3, verbose=False)
                hosts = _flatten_ipv6_hosts(replies)
                resolved = _find_ipv6_host(hosts, l3_dst)
                if resolved and resolved.get("mac"):
                    client.set_l2_mode(port=normalized_port, dst_mac=resolved["mac"])
                return {
                    "accepted": True,
                    "port": normalized_port,
                    "mode": "L3",
                    "l3_source": l3_src,
                    "l3_destination": l3_dst,
                    "ip_version": 6,
                    "ipv6_status": "resolved" if resolved else "unresolved",
                    "resolved_host": resolved,
                    "vlan": normalized_vlan,
                    "port_info": _single_port_info(client, normalized_port),
                }
            finally:
                _restore_service_mode(client, normalized_port, service_state)
        finally:
            _release_ports_for_operation(client, acquired_ports)

    return with_client(configure)


def resolve_arp(
    with_client: WithClient,
    ports: list[int] | None,
    retries: int,
    vlan: list[int] | None,
) -> TrexCallResult:
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports
    normalized_vlan = _normalize_vlan(vlan)
    if isinstance(normalized_vlan, TrexCallResult):
        return normalized_vlan
    if retries < 0 or retries > 10:
        return TrexCallResult(False, blocker="arp_resolve_invalid", error="retries must be between 0 and 10")

    def resolve(client: Any) -> dict[str, Any]:
        target_ports = normalized_ports if normalized_ports is not None else client.get_all_ports()
        acquired_ports = _acquire_ports_for_operation(client, target_ports)
        try:
            service_states = {port: _service_state(client, port) for port in target_ports}
            for port, state in service_states.items():
                _enable_service_mode(client, port, state)
            try:
                arp_resolution = "arp"
                try:
                    client.resolve(ports=target_ports, retries=retries, verbose=False, vlan=normalized_vlan)
                except Exception:
                    if not _apply_local_ipv4_arp_fallback(client, target_ports):
                        raise
                    arp_resolution = "local_port"
                return {
                    "accepted": True,
                    "ports": target_ports,
                    "retries": retries,
                    "arp_resolution": arp_resolution,
                    "vlan": normalized_vlan,
                    "port_info": client.get_port_info(target_ports),
                }
            finally:
                for port, state in service_states.items():
                    _restore_service_mode(client, port, state)
        finally:
            _release_ports_for_operation(client, acquired_ports)

    return with_client(resolve)


def scan_ipv6_neighbors(
    with_client: WithClient,
    ports: list[int] | None,
    timeout_seconds: float,
) -> TrexCallResult:
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports
    if timeout_seconds < 0.1 or timeout_seconds > 30:
        return TrexCallResult(False, blocker="ipv6_scan_invalid", error="timeout must be between 0.1 and 30 seconds")

    def scan(client: Any) -> dict[str, Any]:
        target_ports = normalized_ports if normalized_ports is not None else client.get_all_ports()
        acquired_ports = _acquire_ports_for_operation(client, target_ports)
        try:
            service_states = {port: _service_state(client, port) for port in target_ports}
            multicast_states = {port: _multicast_state(client, port) for port in target_ports}
            for port, state in service_states.items():
                _enable_service_mode(client, port, state)
            for port, was_enabled in multicast_states.items():
                if was_enabled is False:
                    client.set_port_attr(ports=[port], multicast=True)
            try:
                replies = client.scan6(ports=target_ports, timeout=timeout_seconds, verbose=False)
                return {
                    "accepted": True,
                    "ports": target_ports,
                    "timeout_seconds": timeout_seconds,
                    "neighbors": replies,
                    "hosts": _flatten_ipv6_hosts(replies),
                }
            finally:
                for port, was_enabled in multicast_states.items():
                    if was_enabled is False:
                        client.set_port_attr(ports=[port], multicast=False)
                for port, state in service_states.items():
                    _restore_service_mode(client, port, state)
        finally:
            _release_ports_for_operation(client, acquired_ports)

    return with_client(scan)


def ping(
    with_client: WithClient,
    port: int,
    destination: str,
    pkt_size: int,
    count: int,
    interval_sec: float,
    vlan: list[int] | None,
) -> TrexCallResult:
    normalized_port = _normalize_port_id(port)
    if isinstance(normalized_port, TrexCallResult):
        return normalized_port
    normalized_vlan = _normalize_vlan(vlan)
    if isinstance(normalized_vlan, TrexCallResult):
        return normalized_vlan
    destination_ip = _parse_ip(_clean_optional_text(destination))
    if destination_ip is None:
        return TrexCallResult(False, blocker="ping_invalid", error="destination must be a valid IPv4 or IPv6 address")
    if pkt_size < 64 or pkt_size > 9216:
        return TrexCallResult(False, blocker="ping_invalid", error="packet size must be between 64 and 9216")
    if count < 1 or count > 10:
        return TrexCallResult(False, blocker="ping_invalid", error="count must be between 1 and 10")
    if interval_sec < 0 or interval_sec > 10:
        return TrexCallResult(False, blocker="ping_invalid", error="interval must be between 0 and 10 seconds")

    def run_ping(client: Any) -> dict[str, Any]:
        _ensure_port_exists(client, normalized_port)
        acquired_ports = _acquire_ports_for_operation(client, [normalized_port])
        try:
            service_state = _service_state(client, normalized_port)
            _enable_service_mode(client, normalized_port, service_state)
            try:
                raw_records = client.ping_ip(
                    src_port=normalized_port,
                    dst_ip=str(destination_ip),
                    pkt_size=pkt_size,
                    count=count,
                    interval_sec=interval_sec,
                    vlan=normalized_vlan,
                )
                ping_result = _normalize_ping_records(raw_records)
                return {
                    "accepted": True,
                    "port": normalized_port,
                    "destination": str(destination_ip),
                    "packet_size": pkt_size,
                    "count": count,
                    "interval_sec": interval_sec,
                    "vlan": normalized_vlan,
                    **ping_result,
                }
            finally:
                _restore_service_mode(client, normalized_port, service_state)
        finally:
            _release_ports_for_operation(client, acquired_ports)

    return with_client(run_ping)
