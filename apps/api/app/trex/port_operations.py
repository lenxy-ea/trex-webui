from __future__ import annotations

import ipaddress
from typing import Any, Optional

from app.trex.result import TrexCallResult
from app.trex.workbench_values import looks_like_mac as _looks_like_mac


def _command_result(value: Any) -> dict[str, Any]:
    return {"accepted": True, "result": str(value) if value is not None else None}


def _normalize_port_id(value: object) -> int | TrexCallResult:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 255:
        return TrexCallResult(False, blocker="port_invalid", error="port must be an integer between 0 and 255")
    return value


def _normalize_port_list(values: Optional[list[int]]) -> list[int] | None | TrexCallResult:
    if values is None:
        return None
    if not isinstance(values, list) or len(values) > 256:
        return TrexCallResult(False, blocker="ports_invalid", error="ports must be a list of up to 256 port IDs")
    normalized: list[int] = []
    for value in values:
        normalized_port = _normalize_port_id(value)
        if isinstance(normalized_port, TrexCallResult):
            return normalized_port
        if normalized_port not in normalized:
            normalized.append(normalized_port)
    return normalized


def _normalize_vlan(values: Optional[list[int]]) -> list[int] | None | TrexCallResult:
    if values is None:
        return None
    if not isinstance(values, list) or len(values) > 2:
        return TrexCallResult(False, blocker="vlan_invalid", error="maximum two nested VLAN tags are allowed")
    normalized: list[int] = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 4095:
            return TrexCallResult(False, blocker="vlan_invalid", error="VLAN IDs must be integers between 0 and 4095")
        normalized.append(value)
    return normalized


def _clean_optional_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if candidate == "" or "\x00" in candidate:
        return None
    return candidate


def _parse_ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    if value is None:
        return None
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def _ensure_port_exists(client: Any, port: int) -> None:
    if port not in client.get_all_ports():
        raise ValueError(f"port {port} does not exist")


def _operation_ports(client: Any, ports: list[int] | None) -> list[int]:
    if ports is None:
        return list(client.get_all_ports())
    return ports


def _acquire_ports_for_operation(client: Any, ports: list[int]) -> list[int]:
    if not ports:
        return []
    ports_to_acquire = ports
    if hasattr(client, "get_acquired_ports"):
        try:
            acquired = set(client.get_acquired_ports())
            ports_to_acquire = [port for port in ports if port not in acquired]
        except Exception:
            ports_to_acquire = ports
    if not ports_to_acquire:
        return []
    client.acquire(ports=ports_to_acquire, force=False, sync_streams=True)
    return ports_to_acquire


def _release_ports_for_operation(client: Any, ports: list[int]) -> None:
    if not ports:
        return
    try:
        _release_ports_for_operation_strict(client, ports)
    except Exception:
        pass


def _release_ports_for_operation_strict(client: Any, ports: list[int]) -> None:
    if ports:
        client.release(ports=ports)


def _single_port_info(client: Any, port: int) -> dict[str, Any]:
    info = client.get_port_info([port])
    if isinstance(info, list) and info:
        return info[0]
    if isinstance(info, dict):
        return info
    return {}


def _port_info_with_runtime_state(client: Any, port: int, info: Any) -> dict[str, Any]:
    normalized = _optional_formatted_port_info(client, port)
    if isinstance(info, dict):
        normalized.update(info)
    service_state = _optional_service_state(client, port)
    if service_state is not None:
        normalized["service_mode"] = service_state["enabled"]
        normalized["service_filtered"] = service_state["filtered"]
        if service_state["mask"] is not None:
            normalized["service_mask"] = service_state["mask"]
    return normalized


def _optional_formatted_port_info(client: Any, port: int) -> dict[str, Any]:
    port_object = _port_object(client, port)
    if port_object is None:
        return {}
    get_formatted_info = getattr(port_object, "get_formatted_info", None)
    if not callable(get_formatted_info):
        return {}
    for kwargs in ({"sync": False}, {}):
        try:
            info = get_formatted_info(**kwargs)
        except TypeError:
            continue
        except Exception:
            return {}
        return dict(info) if isinstance(info, dict) else {}
    return {}


def _optional_service_state(client: Any, port: int) -> dict[str, Any] | None:
    port_object = _port_object(client, port)
    if port_object is None:
        return None
    return {
        "enabled": bool(_call_or_attr(port_object, "is_service_mode_on", False)),
        "filtered": bool(_call_or_attr(port_object, "is_service_filtered_mode_on", False)),
        "mask": getattr(port_object, "service_mask", None),
    }


def _service_state(client: Any, port: int) -> dict[str, Any]:
    return _optional_service_state(client, port) or {"enabled": False, "filtered": False, "mask": None}


def _enable_service_mode(client: Any, port: int, state: dict[str, Any]) -> None:
    if not state["enabled"]:
        client.set_service_mode(ports=[port], enabled=True, filtered=False, mask=None)


def _restore_service_mode(client: Any, port: int, state: dict[str, Any]) -> None:
    if not state["enabled"]:
        try:
            _restore_service_mode_strict(client, port, state)
        except Exception:
            pass


def _restore_service_mode_strict(client: Any, port: int, state: dict[str, Any]) -> None:
    if not state["enabled"]:
        client.set_service_mode(ports=[port], enabled=False, filtered=False, mask=None)


def _multicast_state(client: Any, port: int) -> bool | None:
    try:
        info = _single_port_info(client, port)
    except Exception:
        return None
    value = info.get("mult") if isinstance(info, dict) else None
    if isinstance(value, str):
        return value.lower() in {"on", "true", "yes"}
    if isinstance(value, bool):
        return value
    return None


def _port_object(client: Any, port: int) -> Any:
    ports = getattr(client, "ports", None)
    if isinstance(ports, dict):
        return ports.get(port)
    try:
        return ports[port]
    except Exception:
        return None


def _call_or_attr(source: Any, name: str, fallback: Any) -> Any:
    value = getattr(source, name, fallback)
    if callable(value):
        try:
            return value()
        except Exception:
            return fallback
    return value


def _flatten_ipv6_hosts(replies: Any) -> list[dict[str, Any]]:
    hosts: list[dict[str, Any]] = []
    if isinstance(replies, dict):
        iterator = replies.items()
    else:
        iterator = enumerate(replies if isinstance(replies, list) else [])
    for port, values in iterator:
        if not isinstance(values, list):
            continue
        for value in values:
            if not isinstance(value, dict):
                continue
            host = dict(value)
            host["port"] = int(port) if isinstance(port, int) or str(port).isdigit() else port
            hosts.append(host)
    return hosts


def _find_ipv6_host(hosts: list[dict[str, Any]], destination: str | None) -> dict[str, Any] | None:
    if destination is None:
        return None
    try:
        target = ipaddress.ip_address(destination)
    except ValueError:
        return None
    for host in hosts:
        value = host.get("ipv6") or host.get("ip") or host.get("ip_address")
        if not isinstance(value, str):
            continue
        try:
            if ipaddress.ip_address(value) == target:
                return host
        except ValueError:
            continue
    return None


def _find_local_ipv4_destination_mac(client: Any, destination: str | None) -> str | None:
    if destination is None:
        return None
    try:
        target = ipaddress.ip_address(destination)
    except ValueError:
        return None
    if target.version != 4:
        return None
    try:
        port_info = client.get_port_info(client.get_all_ports())
    except Exception:
        return None
    if not isinstance(port_info, list):
        return None
    for info in port_info:
        if not isinstance(info, dict):
            continue
        source_ip = info.get("src_ipv4") or read_nested_dict(info, ["layer_cfg", "ipv4", "src"])
        source_mac = info.get("src_mac") or info.get("hw_mac") or read_nested_dict(info, ["layer_cfg", "ether", "src"])
        if not isinstance(source_ip, str) or not isinstance(source_mac, str):
            continue
        try:
            if ipaddress.ip_address(source_ip) == target and _looks_like_mac(source_mac):
                return source_mac
        except ValueError:
            continue
    return None


def _normalize_ping_records(records: Any) -> dict[str, Any]:
    normalized: list[dict[str, Any]] = []
    for index, record in enumerate(records if isinstance(records, list) else []):
        normalized.append(_normalize_ping_record(record, index + 1))

    reply_count = sum(1 for record in normalized if record["status"] == "success")
    timeout_count = sum(1 for record in normalized if record["status"] == "timeout")
    unreachable_count = sum(1 for record in normalized if record["status"] == "unreachable")
    unknown_count = max(0, len(normalized) - reply_count - timeout_count - unreachable_count)
    details: list[str] = [f"{reply_count}/{len(normalized)} replies"]
    if timeout_count:
        details.append(f"{timeout_count} timed out")
    if unreachable_count:
        details.append(f"{unreachable_count} unreachable")
    if unknown_count:
        details.append(f"{unknown_count} unknown")
    return {
        "records": normalized,
        "record_count": len(normalized),
        "reply_count": reply_count,
        "timeout_count": timeout_count,
        "unreachable_count": unreachable_count,
        "unknown_count": unknown_count,
        "summary": f"Ping complete: {', '.join(details)}.",
    }


def _normalize_ping_record(record: Any, sequence: int) -> dict[str, Any]:
    source = dict(record) if isinstance(record, dict) else dict(vars(record)) if hasattr(record, "__dict__") else {}
    formatted = _ping_text(source.get("formatted_string"))
    if formatted is None and not isinstance(record, dict):
        formatted = _ping_text(str(record))
    status = _ping_status(source, formatted)
    responder_ip = _ping_text(source.get("responder_ip") or source.get("src_ip"))
    ttl = _ping_value(source.get("ttl") or source.get("hlim"))
    rtt_ms = _ping_float(source.get("rtt"))
    packet_size = _ping_int(source.get("pkt_size") or source.get("packet_size") or source.get("bytes"))
    return {
        "sequence": sequence,
        "status": status,
        "responder_ip": responder_ip,
        "ttl": ttl,
        "rtt_ms": rtt_ms,
        "packet_size": packet_size,
        "formatted_string": formatted or _ping_fallback_text(status, responder_ip, packet_size, rtt_ms, ttl),
    }


def _ping_status(source: dict[str, Any], formatted: str | None) -> str:
    status = source.get("status")
    if isinstance(status, str) and status.lower() in {"success", "timeout", "unreachable"}:
        return status.lower()
    state = _ping_int(source.get("state"))
    if state == 2:
        return "success"
    if state == 0:
        return "timeout"
    if state in {1, 3}:
        return "unreachable"
    text = (formatted or "").lower()
    if "timed out" in text:
        return "timeout"
    if "unreachable" in text:
        return "unreachable"
    if "reply from" in text:
        return "success"
    return "unknown"


def _ping_fallback_text(status: str, responder_ip: str | None, packet_size: int | None, rtt_ms: float | None, ttl: str | None) -> str:
    if status == "success":
        responder = responder_ip or "-"
        size = packet_size if packet_size is not None else "-"
        rtt = f"{rtt_ms:.2f}" if rtt_ms is not None else "-"
        return f"Reply from {responder}: bytes={size}, time={rtt}ms, TTL={ttl or '-'}"
    if status == "timeout":
        return "Request timed out."
    if status == "unreachable":
        return f"Reply from {responder_ip or '-'}: Destination host unreachable"
    return "Ping result unavailable."


def _ping_text(value: object) -> str | None:
    text = _clean_optional_text(value)
    if text is None or text.upper() == "N/A":
        return None
    return text[:240]


def _ping_value(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.upper() == "N/A":
        return None
    return text[:64]


def _ping_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _ping_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _apply_local_ipv4_arp_fallback(client: Any, ports: list[int]) -> list[int]:
    resolved_ports: list[int] = []
    for port in ports:
        info = _single_port_info(client, port)
        source_ip = info.get("src_ipv4") or read_nested_dict(info, ["layer_cfg", "ipv4", "src"])
        destination_ip = info.get("dest") or read_nested_dict(info, ["layer_cfg", "ipv4", "dst"])
        if not isinstance(source_ip, str) or not isinstance(destination_ip, str):
            return []
        fallback_mac = _find_local_ipv4_destination_mac(client, destination_ip)
        port_object = _port_object(client, port)
        if fallback_mac is None or port_object is None:
            return []
        rc = port_object.set_l3_mode(source_ip, destination_ip, fallback_mac)
        if not rc:
            return []
        resolved_ports.append(port)
    return resolved_ports


def read_nested_dict(source: dict[str, Any], path: list[str]) -> Any:
    cursor: Any = source
    for key in path:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
    return cursor
