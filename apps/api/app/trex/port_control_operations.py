from __future__ import annotations

from typing import Any, Callable

from app.trex.port_operations import _command_result, _normalize_port_list
from app.trex.result import TrexCallResult

PORT_ATTRIBUTE_FLOW_CONTROL_MODES = {"NONE": 0, "TX": 1, "RX": 2, "FULL": 3}

WithClient = Callable[[Callable[[Any], dict[str, Any]]], TrexCallResult]
PortAttributeOverrides = dict[int, dict[str, Any]]


def acquire(
    with_client: WithClient,
    ports: list[int] | None,
    force: bool,
    sync_streams: bool,
) -> TrexCallResult:
    return with_client(
        lambda client: _command_result(
            client.acquire(ports=ports, force=force, sync_streams=sync_streams)
        )
    )


def release(
    with_client: WithClient,
    port_attribute_overrides: PortAttributeOverrides,
    ports: list[int] | None,
) -> TrexCallResult:
    def release_ports(client: Any) -> dict[str, Any]:
        result = _command_result(client.release(ports=ports))
        clear_port_attribute_overrides(port_attribute_overrides, ports)
        return result

    return with_client(release_ports)


def reset(
    with_client: WithClient,
    port_attribute_overrides: PortAttributeOverrides,
    ports: list[int] | None,
    restart: bool,
) -> TrexCallResult:
    def reset_ports(client: Any) -> dict[str, Any]:
        result = _command_result(client.reset(ports=ports, restart=restart))
        clear_port_attribute_overrides(port_attribute_overrides, ports)
        return result

    return with_client(reset_ports)


def set_service_mode(
    with_client: WithClient,
    ports: list[int] | None,
    enabled: bool,
    filtered: bool,
    mask: int | None,
) -> TrexCallResult:
    return with_client(
        lambda client: _command_result(
            client.set_service_mode(ports=ports, enabled=enabled, filtered=filtered, mask=mask)
        )
    )


def set_port_attribute(
    with_client: WithClient,
    port_attribute_overrides: PortAttributeOverrides,
    ports: list[int] | None,
    attribute: str,
    value: Any,
) -> TrexCallResult:
    normalized_ports = _normalize_port_list(ports)
    if isinstance(normalized_ports, TrexCallResult):
        return normalized_ports

    attr_kwargs: dict[str, Any]
    snapshot_updates: dict[str, Any]
    normalized_value: bool | str
    if attribute in {"promiscuous", "multicast", "link", "led"}:
        if not isinstance(value, bool):
            return TrexCallResult(False, blocker="port_attribute_invalid", error=f"{attribute} value must be boolean")
        normalized_value = value
        attr_kwargs = {
            "promiscuous": {"promiscuous": value},
            "multicast": {"multicast": value},
            "link": {"link_up": value},
            "led": {"led_on": value},
        }[attribute]
        snapshot_updates = {
            "promiscuous": {"promiscuous": value},
            "multicast": {"multicast": value},
            "link": {"link": value},
            "led": {"led": value},
        }[attribute]
    elif attribute == "flow_control":
        if not isinstance(value, str) or value.upper() not in PORT_ATTRIBUTE_FLOW_CONTROL_MODES:
            return TrexCallResult(False, blocker="port_attribute_invalid", error="flow_control value must be NONE, TX, RX, or FULL")
        normalized_value = value.upper()
        attr_kwargs = {"flow_ctrl": PORT_ATTRIBUTE_FLOW_CONTROL_MODES[normalized_value]}
        snapshot_updates = {"flow_control": normalized_value}
    else:
        return TrexCallResult(False, blocker="port_attribute_invalid", error=f"unsupported port attribute: {attribute}")

    def set_attr(client: Any) -> dict[str, Any]:
        result = client.set_port_attr(ports=normalized_ports, **attr_kwargs)
        for port in normalized_ports:
            port_attribute_overrides.setdefault(port, {}).update(snapshot_updates)
        return {
            "accepted": True,
            "ports": normalized_ports,
            "attribute": attribute,
            "value": normalized_value,
            "result": str(result) if result is not None else None,
        }

    return with_client(set_attr)


def clear_port_attribute_overrides(
    port_attribute_overrides: PortAttributeOverrides,
    ports: list[int] | None,
) -> None:
    if ports is None:
        port_attribute_overrides.clear()
        return
    for port in ports:
        port_attribute_overrides.pop(port, None)
